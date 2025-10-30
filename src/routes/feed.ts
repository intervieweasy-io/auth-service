import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Follow, Block } from "../models/Graph.js";
import { Post, PostLike } from "../models/Post.js";
import { Profile } from "../models/Profile.js";
import { User } from "../models/User.js";
import { computePostScore } from "../services/feedScore.js";
import { encodeCursor, decodeCursor } from "../utils/cursor.js";

const r = Router();

const parseCursor = (cursor?: string | null) => decodeCursor(cursor);

const buildCursorFilter = (cursor?: string | null) => {
  const cur = parseCursor(cursor);
  if (!cur?.u || !cur?.i) return null;
  return {
    $or: [
      { createdAt: { $lt: new Date(cur.u) } },
      {
        createdAt: new Date(cur.u),
        _id: { $lt: new mongoose.Types.ObjectId(cur.i) },
      },
    ],
  };
};

r.get(
  "/home",
  requireAuth(),
  validate(
    z.object({
      query: z.object({
        cursor: z.string().optional(),
        size: z.coerce.number().min(1).max(50).default(20).optional(),
      }),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: { cursor?: string; size?: number } } };
    const { query } = (req as typeof ar).data ?? { query: {} };
    const size = query.size ?? 20;
    const followees = await Follow.find({ followerId: ar.userId });
    const followeeSet = new Set(followees.map((f) => String(f.followeeId)));
    const blockedOut = await Block.find({ byUserId: ar.userId });
    const blockedIn = await Block.find({ toUserId: ar.userId });
    const blockedIds = new Set([
      ...blockedOut.map((b) => String(b.toUserId)),
      ...blockedIn.map((b) => String(b.byUserId)),
    ]);
    const viewerProfile = await Profile.findOne({ userId: ar.userId });
    const skills = viewerProfile?.skills ?? [];
    const filter: Record<string, unknown> = {
      $or: [
        { authorId: new mongoose.Types.ObjectId(ar.userId!) },
        { visibility: "public" },
        { visibility: "connections", authorId: { $in: Array.from(followeeSet).map((id) => new mongoose.Types.ObjectId(id)) } },
      ],
    };
    if (blockedIds.size) {
      filter.authorId = {
        $nin: Array.from(blockedIds).map((id) => new mongoose.Types.ObjectId(id)),
      };
    }
    const cursorFilter = buildCursorFilter(query.cursor);
    if (cursorFilter) {
      filter.$and = [cursorFilter];
    }
    const limit = Math.min(size * 5, 200);
    const docs = await Post.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);
    const ranked = docs
      .map((post) => {
        const authorId = String(post.authorId);
        const proximity = authorId === ar.userId ? 1 : followeeSet.has(authorId) ? 1 : 0;
        const score = computePostScore(post, { viewerSkills: skills, proximity });
        return { post, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const timeDiff = b.post.createdAt.getTime() - a.post.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return String(b.post._id).localeCompare(String(a.post._id));
      });
    const page = ranked.slice(0, size);
    const authorIds = Array.from(new Set(page.map((item) => String(item.post.authorId))));
    const authors = await User.find({ _id: { $in: authorIds } }).lean();
    const authorMap = new Map(authors.map((u) => [String(u._id), u]));
    const postIds = page.map(({ post }) => post._id);
    const likes = await PostLike.find({
      postId: { $in: postIds },
      userId: ar.userId,
    })
      .select({ postId: 1 })
      .lean();
    const likedSet = new Set(likes.map((like) => String(like.postId)));
    const items = page.map(({ post, score }) => ({
      id: String(post._id),
      score,
      author: (() => {
        const u = authorMap.get(String(post.authorId));
        return u ? { id: String(u._id), handle: u.handle, name: u.name } : null;
      })(),
      type: post.type,
      text: post.text,
      tags: post.tags,
      visibility: post.visibility,
      media: post.media,
      counts: post.counts,
      likedByMe: likedSet.has(String(post._id)),
      createdAt: post.createdAt,
    }));
    const last = page[page.length - 1]?.post;
    res.json({
      items,
      nextCursor: last ? encodeCursor(last) : null,
    });
  }
);

r.get(
  "/user/:handle",
  requireAuth(),
  validate(
    z.object({
      query: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).default(20).optional(),
      }),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: { cursor?: string; limit?: number } } };
    const { query } = (req as typeof ar).data ?? { query: {} };
    const handle = String(req.params.handle || "").toLowerCase();
    const user = await User.findOne({ handle });
    if (!user) return res.status(404).json({ error: "not_found" });
    if (String(user._id) !== ar.userId) {
      const viewerBlocked = await Block.findOne({ byUserId: ar.userId, toUserId: user._id });
      if (viewerBlocked) return res.status(404).json({ error: "not_found" });
      const blockedByUser = await Block.findOne({ byUserId: user._id, toUserId: ar.userId });
      if (blockedByUser) return res.status(403).json({ error: "forbidden" });
    }
    const limit = query.limit ?? 20;
    const isSelf = String(user._id) === ar.userId;
    let visibilityFilter: string | Record<string, unknown> | undefined;
    let viewerFollowsDoc: Awaited<ReturnType<typeof Follow.findOne>> | null = null;
    let userFollowsDoc: Awaited<ReturnType<typeof Follow.findOne>> | null = null;
    if (!isSelf) {
      viewerFollowsDoc = await Follow.findOne({ followerId: ar.userId, followeeId: user._id });
      userFollowsDoc = await Follow.findOne({ followerId: user._id, followeeId: ar.userId });
      const isConnection = Boolean(viewerFollowsDoc && userFollowsDoc);
      if (isConnection) {
        visibilityFilter = { $in: ["public", "connections"] };
      } else {
        visibilityFilter = "public";
      }
    }
    const filter: Record<string, unknown> = { authorId: user._id };
    if (visibilityFilter) {
      filter.visibility = visibilityFilter;
    }
    const cursorFilter = buildCursorFilter(query.cursor);
    if (cursorFilter) {
      filter.$and = [cursorFilter];
    }
    const docs = await Post.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, -1) : docs;
    const viewerProfile = await Profile.findOne({ userId: ar.userId });
    const skills = viewerProfile?.skills ?? [];
    const proximityScore = isSelf ? 1 : viewerFollowsDoc ? 1 : 0;
    const authorInfo = { id: String(user._id), handle: user.handle, name: user.name };
    const postIds = page.map((post) => post._id);
    const likes = await PostLike.find({
      postId: { $in: postIds },
      userId: ar.userId,
    })
      .select({ postId: 1 })
      .lean();
    const likedSet = new Set(likes.map((like) => String(like.postId)));
    const items = page.map((post) => {
      const score = computePostScore(post, { viewerSkills: skills, proximity: proximityScore });
      return {
        id: String(post._id),
        score,
        author: authorInfo,
        type: post.type,
        text: post.text,
        tags: post.tags,
        visibility: post.visibility,
        media: post.media,
        counts: post.counts,
        likedByMe: likedSet.has(String(post._id)),
        createdAt: post.createdAt,
      };
    });
    const last = page[page.length - 1];
    res.json({
      items,
      nextCursor: last ? encodeCursor(last) : null,
    });
  }
);

export default r;
