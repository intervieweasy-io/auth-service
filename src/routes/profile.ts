import { Router } from "express";
import { z } from "zod";
import { Profile } from "../models/Profile.js";
import { User } from "../models/User.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const r = Router();

const linkSchema = z.object({ type: z.string().min(1), url: z.string().url() });
const educationSchema = z.object({
  school: z.string().min(1),
  degree: z.string().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().nullable().optional(),
});

const experienceSchema = z.object({
  company: z.string().min(1),
  role: z.string().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().nullable().optional(),
  desc: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const introVideoSchema = z
  .object({ url: z.string().url().nullable().optional(), durationSec: z.number().int().nonnegative().optional() })
  .partial()
  .optional();

const wallMediaSchema = z.object({
  kind: z.enum(["image", "video", "audio", "file"]),
  url: z.string().url(),
  thumbUrl: z.string().url().nullable().optional(),
});

const wallItemSchema = z.object({
  type: z.enum(["project", "article", "demo"]),
  title: z.string().min(1),
  summary: z.string().optional(),
  media: z.array(wallMediaSchema).max(10).optional(),
  tags: z.array(z.string()).max(25).optional(),
  pinned: z.boolean().optional(),
  postId: z.string().optional(),
});

const growthTimelineSchema = z.object({
  ts: z.coerce.date(),
  type: z.string().min(1),
  text: z.string().min(1),
  postId: z.string().optional(),
});

const profilePayload = z.object({
  headline: z.string().max(160).optional(),
  bio: z.string().max(2000).optional(),
  location: z.string().max(120).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  links: z.array(linkSchema).max(10).optional(),
  education: z.array(educationSchema).max(20).optional(),
  experience: z.array(experienceSchema).max(20).optional(),
  skills: z.array(z.string()).max(50).optional(),
  introVideo: introVideoSchema,
  wall: z.array(wallItemSchema).optional(),
  growthTimeline: z.array(growthTimelineSchema).optional(),
});

const buildResponse = async (userId: string) => {
  const user = await User.findById(userId).lean();
  if (!user) return null;
  const profile = await Profile.findOne({ userId }).lean();
  return {
    userId: String(user._id),
    handle: user.handle,
    name: user.name,
    avatarUrl: profile?.avatarUrl ?? null,
    bannerUrl: profile?.bannerUrl ?? null,
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    location: profile?.location ?? "",
    links: profile?.links ?? [],
    skills: profile?.skills ?? [],
    education: profile?.education ?? [],
    experience: profile?.experience ?? [],
    introVideo: profile?.introVideo ?? { url: null, durationSec: 0 },
    wall: profile?.wall ?? [],
    growthTimeline: profile?.growthTimeline ?? [],
    createdAt: profile?.createdAt ?? user.createdAt,
    updatedAt: profile?.updatedAt ?? user.updatedAt,
  };
};

r.get("/:handle", async (req, res) => {
  const handle = String(req.params.handle || "").toLowerCase();
  const user = await User.findOne({ handle });
  if (!user) return res.status(404).json({ error: "not_found" });
  const payload = await buildResponse(String(user._id));
  res.json(payload);
});

r.patch(
  "/me",
  requireAuth(),
  validate(z.object({ body: profilePayload.refine((v) => Object.keys(v).length > 0, "no_fields") })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: Record<string, unknown> } };
    const { body } = (req as typeof ar).data!;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    if (Array.isArray(body.skills)) {
      updates.skills = [...new Set((body.skills as string[]).map((s) => s.trim()))].filter(Boolean);
    }
    await Profile.updateOne(
      { userId: ar.userId },
      { $set: { ...updates, userId: ar.userId } },
      { upsert: true }
    );
    const payload = await buildResponse(ar.userId!);
    res.json(payload);
  }
);

r.post(
  "/me/wall",
  requireAuth(),
  validate(z.object({ body: wallItemSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof wallItemSchema> } };
    const { body } = (req as typeof ar).data!;
    const doc = await Profile.findOneAndUpdate(
      { userId: ar.userId },
      {
        $push: {
          wall: {
            type: body.type,
            title: body.title,
            summary: body.summary,
            media: body.media ?? [],
            tags: body.tags ?? [],
            pinned: body.pinned ?? false,
            postId: body.postId ?? null,
          },
        },
        $setOnInsert: { userId: ar.userId },
      },
      { upsert: true, new: true, projection: { wall: { $slice: -1 } } }
    );
    const last = doc?.wall?.[doc.wall.length - 1];
    res.status(201).json({ id: last?._id ? String(last._id) : undefined });
  }
);

export default r;
