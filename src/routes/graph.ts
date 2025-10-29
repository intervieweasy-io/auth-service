import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Follow, Block } from "../models/Graph.js";
import { User } from "../models/User.js";
import { encodeCursor, decodeCursor } from "../utils/cursor.js";

const r = Router();

const isObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

r.post("/follow/:userId", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const targetId = req.params.userId;
  if (!isObjectId(targetId)) return res.status(400).json({ error: "invalid_user" });
  if (targetId === ar.userId) return res.status(400).json({ error: "cannot_follow_self" });
  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ error: "not_found" });
  const viewerBlocked = await Block.findOne({ byUserId: ar.userId, toUserId: target._id });
  if (viewerBlocked) return res.status(403).json({ error: "blocked" });
  const blockedByTarget = await Block.findOne({ byUserId: target._id, toUserId: ar.userId });
  if (blockedByTarget) return res.status(403).json({ error: "forbidden" });
  const followerObjectId = new mongoose.Types.ObjectId(ar.userId!);
  const followeeObjectId = new mongoose.Types.ObjectId(targetId);
  await Follow.updateOne(
    { followerId: followerObjectId, followeeId: followeeObjectId },
    { $setOnInsert: { followerId: followerObjectId, followeeId: followeeObjectId } },
    { upsert: true }
  );
  res.json({ ok: true });
});

r.delete("/follow/:userId", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const targetId = req.params.userId;
  if (!isObjectId(targetId)) return res.status(400).json({ error: "invalid_user" });
  await Follow.deleteOne({
    followerId: new mongoose.Types.ObjectId(ar.userId!),
    followeeId: new mongoose.Types.ObjectId(targetId),
  });
  res.json({ ok: true });
});

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
  cursor: z.string().optional(),
});

r.get(
  "/:userId/followers",
  requireAuth(),
  validate(z.object({ query: listQuery })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: z.infer<typeof listQuery> } };
    const targetId = req.params.userId;
    if (!isObjectId(targetId)) return res.status(400).json({ error: "invalid_user" });
    const { query } = (req as typeof ar).data ?? { query: {} };
    const { limit = 20, cursor } = query;
    const filter: Record<string, unknown> = { followeeId: targetId };
    const cur = decodeCursor(cursor);
    if (cur?.u && cur?.i) {
      filter.$or = [
        { createdAt: { $lt: new Date(cur.u) } },
        {
          createdAt: new Date(cur.u),
          _id: { $lt: new mongoose.Types.ObjectId(cur.i) },
        },
      ];
    }
    const docs = await Follow.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Number(limit) + 1);
    const hasMore = docs.length > Number(limit);
    const page = hasMore ? docs.slice(0, -1) : docs;
    const next = hasMore ? encodeCursor(page[page.length - 1]) : null;
    const userIds = Array.from(new Set(page.map((f) => String(f.followerId))));
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    res.json({
      items: page.map((f) => {
        const u = userMap.get(String(f.followerId));
        return {
          userId: String(f.followerId),
          handle: u?.handle,
          name: u?.name,
          since: f.createdAt,
        };
      }),
      nextCursor: next,
    });
  }
);

r.get(
  "/:userId/following",
  requireAuth(),
  validate(z.object({ query: listQuery })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: z.infer<typeof listQuery> } };
    const targetId = req.params.userId;
    if (!isObjectId(targetId)) return res.status(400).json({ error: "invalid_user" });
    const { query } = (req as typeof ar).data ?? { query: {} };
    const { limit = 20, cursor } = query;
    const filter: Record<string, unknown> = { followerId: targetId };
    const cur = decodeCursor(cursor);
    if (cur?.u && cur?.i) {
      filter.$or = [
        { createdAt: { $lt: new Date(cur.u) } },
        {
          createdAt: new Date(cur.u),
          _id: { $lt: new mongoose.Types.ObjectId(cur.i) },
        },
      ];
    }
    const docs = await Follow.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Number(limit) + 1);
    const hasMore = docs.length > Number(limit);
    const page = hasMore ? docs.slice(0, -1) : docs;
    const next = hasMore ? encodeCursor(page[page.length - 1]) : null;
    const userIds = Array.from(new Set(page.map((f) => String(f.followeeId))));
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    res.json({
      items: page.map((f) => {
        const u = userMap.get(String(f.followeeId));
        return {
          userId: String(f.followeeId),
          handle: u?.handle,
          name: u?.name,
          since: f.createdAt,
        };
      }),
      nextCursor: next,
    });
  }
);

export default r;
