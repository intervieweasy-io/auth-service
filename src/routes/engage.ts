import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  Post,
  PostComment,
  PostLike,
  PostShare,
} from "../models/Post.js";
import { encodeCursor, decodeCursor } from "../utils/cursor.js";
import { User } from "../models/User.js";
import { canViewPost } from "../services/postAccess.js";

const r = Router();

const isObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

r.post("/posts/:id/like", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const id = req.params.id;
  if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
  const post = await Post.findById(id);
  if (!post) return res.status(404).json({ error: "not_found" });
  const allowed = await canViewPost(post, ar.userId);
  if (!allowed) return res.status(403).json({ error: "forbidden" });
  const result = await PostLike.updateOne(
    { postId: post._id, userId: ar.userId },
    { $setOnInsert: { postId: post._id, userId: ar.userId } },
    { upsert: true }
  );
  if (result.upsertedCount || result.matchedCount === 0) {
    await Post.updateOne({ _id: post._id }, { $inc: { "counts.likes": 1 } });
  }
  res.json({ ok: true });
});

r.delete("/posts/:id/like", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const id = req.params.id;
  if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
  const post = await Post.findById(id);
  if (!post) return res.status(404).json({ error: "not_found" });
  const allowed = await canViewPost(post, ar.userId);
  if (!allowed) return res.status(403).json({ error: "forbidden" });
  const result = await PostLike.deleteOne({ postId: post._id, userId: ar.userId });
  if (result.deletedCount) {
    await Post.updateOne({ _id: post._id }, { $inc: { "counts.likes": -1 } });
  }
  res.json({ ok: true });
});

const commentSchema = z.object({
  text: z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

r.post(
  "/posts/:id/comments",
  requireAuth(),
  validate(z.object({ body: commentSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof commentSchema> } };
    const id = req.params.id;
    if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: "not_found" });
    const allowed = await canViewPost(post, ar.userId);
    if (!allowed) return res.status(403).json({ error: "forbidden" });
    const parentId = (req as typeof ar).data?.body.parentId;
    if (parentId && !isObjectId(parentId)) {
      return res.status(400).json({ error: "invalid_parent" });
    }
    const { text } = (req as typeof ar).data!.body;
    const user = await User.findById(ar.userId);
    const comment = await PostComment.create({
      postId: post._id,
      userId: ar.userId!,
      parentId: parentId ? new mongoose.Types.ObjectId(parentId) : undefined,
      text,
    });
    await Post.updateOne({ _id: post._id }, { $inc: { "counts.comments": 1 } });
    res.status(201).json({
      id: String(comment._id),
      text: comment.text,
      ts: comment.createdAt,
      user: user
        ? { id: String(user._id), handle: user.handle, name: user.name }
        : { id: ar.userId, handle: "", name: "" },
      parentId: comment.parentId ? String(comment.parentId) : null,
    });
  }
);

r.get(
  "/posts/:id/comments",
  requireAuth(),
  validate(
    z.object({
      query: z.object({
        limit: z.coerce.number().min(1).max(100).default(20).optional(),
        cursor: z.string().optional(),
      }),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: { limit?: number; cursor?: string } } };
    const id = req.params.id;
    if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: "not_found" });
    const allowed = await canViewPost(post, ar.userId);
    if (!allowed) return res.status(403).json({ error: "forbidden" });
    const { query } = (req as typeof ar).data ?? { query: {} };
    const { limit = 20, cursor } = query;
    const filter: Record<string, unknown> = { postId: post._id };
    const cur = decodeCursor(cursor);
    if (cur?.u && cur?.i) {
      filter.$or = [
        { createdAt: { $lt: new Date(cur.u) } },
        { createdAt: new Date(cur.u), _id: { $lt: cur.i } },
      ];
    }
    const items = await PostComment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Number(limit) + 1);
    const hasMore = items.length > Number(limit);
    const page = hasMore ? items.slice(0, -1) : items;
    const next = hasMore ? encodeCursor(page[page.length - 1]) : null;
    const userIds = Array.from(new Set(page.map((c) => String(c.userId))));
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    res.json({
      items: page.map((c) => ({
        id: String(c._id),
        text: c.text,
        ts: c.createdAt,
        parentId: c.parentId ? String(c.parentId) : null,
        user: (() => {
          const u = userMap.get(String(c.userId));
          return u
            ? { id: String(u._id), handle: u.handle, name: u.name }
            : { id: String(c.userId), handle: "", name: "" };
        })(),
      })),
      nextCursor: next,
    });
  }
);

const shareSchema = z.object({ text: z.string().max(5000).optional() });

r.post(
  "/posts/:id/share",
  requireAuth(),
  validate(z.object({ body: shareSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof shareSchema> } };
    const id = req.params.id;
    if (!isObjectId(id)) return res.status(400).json({ error: "invalid_id" });
    const original = await Post.findById(id);
    if (!original) return res.status(404).json({ error: "not_found" });
    const allowed = await canViewPost(original, ar.userId);
    if (!allowed) return res.status(403).json({ error: "forbidden" });
    const share = await PostShare.create({
      postId: original._id,
      userId: ar.userId!,
      text: (req as typeof ar).data?.body.text,
    });
    await Post.updateOne({ _id: original._id }, { $inc: { "counts.shares": 1 } });
    const post = await Post.create({
      authorId: ar.userId,
      type: "share",
      text: (req as typeof ar).data?.body.text,
      tags: [],
      visibility: "public",
      media: [],
      poll: null,
      shareOf: original._id,
      meta: { shareId: share._id },
    });
    res.status(201).json({ id: String(post._id) });
  }
);

export default r;
