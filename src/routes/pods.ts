import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Pod, Checkin } from "../models/Pod.js";

const r = Router();

const createPodSchema = z.object({
  name: z.string().min(1).max(120),
  purpose: z.string().max(500).optional(),
  tags: z.array(z.string()).max(20).optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  rituals: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(120),
        cadence: z.enum(["daily", "weekly", "monthly"]),
        nextRunAt: z.coerce.date().optional(),
      })
    )
    .max(10)
    .optional(),
  needs: z
    .array(z.object({ skill: z.string().min(1), level: z.string().optional(), must: z.boolean().optional() }))
    .max(20)
    .optional(),
  offers: z
    .array(z.object({ skill: z.string().min(1), level: z.string().optional() }))
    .max(20)
    .optional(),
});

r.post(
  "/",
  requireAuth(),
  validate(z.object({ body: createPodSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof createPodSchema> } };
    const { body } = (req as typeof ar).data!;
    const pod = await Pod.create({
      name: body.name,
      purpose: body.purpose,
      tags: body.tags ?? [],
      ownerId: ar.userId,
      visibility: body.visibility,
      members: [
        {
          userId: new mongoose.Types.ObjectId(ar.userId!),
          role: "owner",
        },
      ],
      rituals: body.rituals ?? [],
      needs: body.needs ?? [],
      offers: body.offers ?? [],
    });
    res.status(201).json({ id: String(pod._id) });
  }
);

const checkinSchema = z.object({
  ritualId: z.string().optional(),
  text: z.string().min(1).max(2000),
  mood: z.string().max(16).optional(),
});

r.post(
  "/:podId/checkin",
  requireAuth(),
  validate(z.object({ body: checkinSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof checkinSchema> } };
    const podId = req.params.podId;
    if (!mongoose.Types.ObjectId.isValid(podId)) {
      return res.status(400).json({ error: "invalid_pod" });
    }
    const pod = await Pod.findById(podId);
    if (!pod) return res.status(404).json({ error: "not_found" });
    const isMember = pod.members.some((m) => String(m.userId) === ar.userId);
    if (!isMember) return res.status(403).json({ error: "forbidden" });
    const body = (req as typeof ar).data!.body;
    const checkin = await Checkin.create({
      podId: pod._id,
      ritualId: body.ritualId,
      userId: ar.userId!,
      text: body.text,
      mood: body.mood,
    });
    res.status(201).json({ id: String(checkin._id) });
  }
);

export default r;
