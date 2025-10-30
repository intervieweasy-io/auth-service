import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Post, PollVote, PostLike } from "../models/Post.js";
import { User } from "../models/User.js";
import { Block } from "../models/Graph.js";
import { canViewPost } from "../services/postAccess.js";

const r = Router();

const mediaSchema = z.object({
  kind: z.enum(["image", "video", "audio", "file"]),
  url: z.string().url(),
  thumbUrl: z.string().url().nullable().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

const pollSchema = z.object({
  question: z.string().min(1),
  options: z
    .array(
      z.object({ id: z.string().min(1), label: z.string().min(1) })
    )
    .min(2)
    .max(8),
  multi: z.boolean().optional().default(false),
  expiresAt: z.coerce.date().optional(),
});

const createPostSchema = z.object({
  type: z.enum(["text", "media", "poll", "project", "share"]),
  text: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(30).optional(),
  visibility: z.enum(["public", "connections", "private"]).optional(),
  media: z.array(mediaSchema).max(10).optional(),
  poll: pollSchema.optional(),
  shareOf: z.string().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

const isObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

r.post(
  "/",
  requireAuth(),
  validate(z.object({ body: createPostSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof createPostSchema> } };
    const { body } = (req as typeof ar).data!;
    if (body.type === "share") {
      if (!body.shareOf || !isObjectId(body.shareOf)) {
        return res.status(400).json({ error: "invalid_share_target" });
      }
      const target = await Post.findById(body.shareOf);
      if (!target) return res.status(404).json({ error: "share_target_not_found" });
      const can = await canViewPost(target, ar.userId);
      if (!can) return res.status(403).json({ error: "forbidden" });
    }
    if (body.type === "poll" && !body.poll) {
      return res.status(400).json({ error: "missing_poll" });
    }
    const tags = Array.from(new Set((body.tags ?? []).map((t) => t.toLowerCase())));
    const post = await Post.create({
      authorId: ar.userId,
      type: body.type,
      text: body.text,
      tags,
      visibility: body.visibility ?? "public",
      media: body.media ?? [],
      poll: body.type === "poll" ? body.poll! : null,
      shareOf: body.shareOf ?? null,
      meta: body.meta ?? {},
    });
    if (post.shareOf) {
      await Post.updateOne({ _id: post.shareOf }, { $inc: { "counts.shares": 1 } });
    }
    res.status(201).json({ id: String(post._id), createdAt: post.createdAt.toISOString() });
  }
);

r.get("/:id", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const id = req.params.id;
  if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
  const post = await Post.findById(id);
  if (!post) return res.status(404).json({ error: "not_found" });
  const blocked = await Block.findOne({ byUserId: ar.userId, toUserId: post.authorId });
  if (blocked) return res.status(404).json({ error: "not_found" });
  const allowed = await canViewPost(post, ar.userId);
  if (!allowed) return res.status(403).json({ error: "forbidden" });
  const author = await User.findById(post.authorId);
  const liked = await PostLike.exists({ postId: post._id, userId: ar.userId });
  res.json({
    id: String(post._id),
    author: author
      ? {
          id: String(author._id),
          handle: author.handle,
          name: author.name,
        }
      : null,
    type: post.type,
    text: post.text,
    tags: post.tags,
    visibility: post.visibility,
    media: post.media,
    poll: post.poll,
    shareOf: post.shareOf ? String(post.shareOf) : null,
    meta: post.meta ?? {},
    createdAt: post.createdAt,
    counts: post.counts,
    likedByMe: Boolean(liked),
  });
});

r.delete("/:id", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const id = req.params.id;
  if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
  const post = await Post.findById(id);
  if (!post) return res.status(404).json({ error: "not_found" });
  const isOwner = String(post.authorId) === ar.userId;
  const roles = Array.isArray((ar.user as { roles?: unknown }).roles)
    ? ((ar.user as { roles?: unknown }).roles as unknown[]).map((r) => String(r))
    : [];
  if (!isOwner && !roles.includes("admin")) {
    return res.status(403).json({ error: "forbidden" });
  }
  await Post.deleteOne({ _id: post._id });
  if (post.shareOf) {
    await Post.updateOne({ _id: post.shareOf }, { $inc: { "counts.shares": -1 } });
  }
  res.json({ ok: true });
});

r.post(
  "/:id/poll/vote",
  requireAuth(),
  validate(z.object({ body: z.object({ optionIds: z.array(z.string()).min(1) }) })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: { optionIds: string[] } } };
    const id = req.params.id;
    if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
    const post = await Post.findById(id);
    if (!post || post.type !== "poll" || !post.poll) {
      return res.status(404).json({ error: "not_found" });
    }
    const allowed = await canViewPost(post, ar.userId);
    if (!allowed) return res.status(403).json({ error: "forbidden" });
    if (post.poll.expiresAt && post.poll.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "poll_closed" });
    }
    const { optionIds } = (req as typeof ar).data!.body;
    const optionSet = new Set(post.poll.options.map((opt) => opt.id));
    if (!optionIds.every((id) => optionSet.has(id))) {
      return res.status(400).json({ error: "invalid_option" });
    }
    if (!post.poll.multi && optionIds.length > 1) {
      return res.status(400).json({ error: "single_choice" });
    }
    await PollVote.updateOne(
      { postId: post._id, userId: ar.userId },
      { $set: { optionIds } },
      { upsert: true }
    );
    res.json({ ok: true });
  }
);

r.get("/:id/poll/results", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const id = req.params.id;
  if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
  const post = await Post.findById(id);
  if (!post || post.type !== "poll" || !post.poll) {
    return res.status(404).json({ error: "not_found" });
  }
  const allowed = await canViewPost(post, ar.userId);
  if (!allowed) return res.status(403).json({ error: "forbidden" });
  const votes = await PollVote.find({ postId: post._id });
  const counts = new Map<string, number>();
  for (const opt of post.poll.options) counts.set(opt.id, 0);
  for (const vote of votes) {
    for (const opt of vote.optionIds) {
      counts.set(opt, (counts.get(opt) ?? 0) + 1);
    }
  }
  res.json({
    options: post.poll.options.map((opt) => ({ id: opt.id, label: opt.label, votes: counts.get(opt.id) ?? 0 })),
    expiresAt: post.poll.expiresAt,
  });
});

export default r;
