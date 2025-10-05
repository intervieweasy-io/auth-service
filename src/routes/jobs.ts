import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Job } from "../models/Job.js";
import { JobComment } from "../models/JobComment.js";
import { JobAudit } from "../models/JobAudit.js";
import { writeAudit } from "../services/auditHook.js";
import { encodeCursor, decodeCursor } from "../utils/cursor.js";

const r = Router();

r.post(
  "/",
  requireAuth(),
  validate(
    z.object({
      body: z.object({
        title: z.string().min(1),
        company: z.string().min(1),
        location: z.string().optional(),
        sourceUrl: z.string().url().optional(),
        priority: z.enum(["starred", "normal"]).optional(),
        stage: z
          .enum(["WISHLIST", "APPLIED", "INTERVIEW", "OFFER", "ARCHIVED"])
          .optional(),
        appliedOn: z.coerce.date().optional(),
      }),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & {
      data?: {
        body: {
          title: string;
          company: string;
          location?: string;
          sourceUrl?: string;
          priority?: "starred" | "normal";
          stage?: string;
          appliedOn?: Date;
        };
      };
    };
    const { body } = (req as typeof ar).data!;
    const doc = await Job.create({ ...body, userId: ar.userId });
    await writeAudit({ jobId: doc._id, userId: ar.userId!, action: "CREATE" });
    res.status(201).json(doc);
  }
);

r.get(
  "/",
  requireAuth(),
  validate(
    z.object({
      query: z.object({
        stage: z
          .enum(["WISHLIST", "APPLIED", "INTERVIEW", "OFFER", "ARCHIVED"])
          .optional(),
        archived: z.coerce.boolean().optional(),
        limit: z.coerce.number().min(1).max(100).default(50).optional(),
        cursor: z.string().optional(),
      }),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: { [key: string]: unknown } } };
    const { query } = (req as typeof ar).data ?? { query: {} };
    const { stage, archived, limit = 50, cursor } = query as {
      stage?: string;
      archived?: boolean;
      limit?: number;
      cursor?: string;
    };

    const filter: Record<string, unknown> = { userId: ar.userId };
    if (stage !== undefined) filter.stage = stage;
    if (archived !== undefined) filter.archived = archived;

    const sort = { updatedAt: -1, _id: -1 } as const;
    const cur = decodeCursor(cursor);
    if (cur?.u && cur?.i) {
      filter.$or = [
        { updatedAt: { $lt: new Date(cur.u) } },
        { updatedAt: new Date(cur.u), _id: { $lt: cur.i } },
      ];
    }

    const docs = await Job.find(filter)
      .sort(sort)
      .limit(Number(limit) + 1);
    const hasMore = docs.length > Number(limit);
    const page = hasMore ? docs.slice(0, -1) : docs;
    const next = hasMore ? encodeCursor(page[page.length - 1]) : null;
    res.json({ items: page, nextCursor: next });
  }
);

r.get("/:id", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const job = await Job.findOne({ _id: req.params.id, userId: ar.userId });
  if (!job) return res.status(404).json({ error: "not_found" });
  const comments = await JobComment.find({ jobId: job._id })
    .sort({ createdAt: -1 })
    .limit(5);
  const audits = await JobAudit.find({ jobId: job._id })
    .sort({ createdAt: -1 })
    .limit(5);
  res.json({ job, comments, audits });
});

r.patch(
  "/:id",
  requireAuth(),
  validate(
    z.object({
      body: z
        .object({
          title: z.string().optional(),
          company: z.string().optional(),
          location: z.string().optional(),
          sourceUrl: z.string().url().optional(),
          priority: z.enum(["starred", "normal"]).optional(),
          stage: z
            .enum(["WISHLIST", "APPLIED", "INTERVIEW", "OFFER", "ARCHIVED"])
            .optional(),
          appliedOn: z.coerce.date().nullable().optional(),
          archived: z.boolean().optional(),
        })
        .refine((v) => Object.keys(v).length > 0, "no_fields"),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & {
      data?: { body: Record<string, unknown> };
    };
    const before = await Job.findOne({ _id: req.params.id, userId: ar.userId });
    if (!before) return res.status(404).json({ error: "not_found" });

    const { body } = (req as typeof ar).data!;
    const fromStage = before.stage;

    await Job.updateOne({ _id: before._id }, { $set: body });
    const after = await Job.findById(before._id);

    const changedStage = typeof body.stage === "string" && body.stage !== fromStage;
    await writeAudit({
      jobId: before._id,
      userId: ar.userId!,
      action: changedStage ? "MOVE_STAGE" : "UPDATE",
      fromStage: changedStage ? fromStage : undefined,
      toStage: changedStage ? (body.stage as string) : undefined,
    });
    res.json(after);
  }
);

r.post("/:id/archive", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const job = await Job.findOne({ _id: req.params.id, userId: ar.userId });
  if (!job) return res.status(404).json({ error: "not_found" });
  await Job.updateOne(
    { _id: job._id },
    { $set: { archived: true, stage: "ARCHIVED" } }
  );
  await writeAudit({ jobId: job._id, userId: ar.userId!, action: "ARCHIVE" });
  const updated = await Job.findById(job._id);
  res.json(updated);
});

r.post("/:id/restore", requireAuth(), async (req, res) => {
  const ar = req as AuthedRequest;
  const job = await Job.findOne({ _id: req.params.id, userId: ar.userId });
  if (!job) return res.status(404).json({ error: "not_found" });
  await Job.updateOne(
    { _id: job._id },
    { $set: { archived: false, stage: "WISHLIST" } }
  );
  await writeAudit({ jobId: job._id, userId: ar.userId!, action: "RESTORE" });
  const updated = await Job.findById(job._id);
  res.json(updated);
});

export default r;
