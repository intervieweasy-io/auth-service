import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Job } from "../models/Job.js";
import { JobAudit } from "../models/JobAudit.js";
import { encodeCursor, decodeCursor } from "../utils/cursor.js";

const r = Router();

r.get(
  "/:id/audit",
  requireAuth(),
  validate(
    z.object({
      query: z.object({
        limit: z.coerce.number().min(1).max(100).default(50).optional(),
        cursor: z.string().optional(),
      }),
    })
  ),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { query: { limit?: number; cursor?: string } } };
    const job = await Job.findOne({ _id: req.params.id, userId: ar.userId });
    if (!job) return res.status(404).json({ error: "not_found" });

    const { query } = (req as { data?: { query: { limit?: number; cursor?: string } } }).data ?? { query: {} };
    const { limit = 50, cursor } = query;

    const filter: Record<string, unknown> = { jobId: job._id };
    const cur = decodeCursor(cursor);
    const sort = { createdAt: -1, _id: -1 } as const;
    if (cur?.u && cur?.i) {
      filter.$or = [
        { createdAt: { $lt: new Date(cur.u) } },
        { createdAt: new Date(cur.u), _id: { $lt: cur.i } },
      ];
    }

    const items = await JobAudit.find(filter)
      .sort(sort)
      .limit(Number(limit) + 1);
    const hasMore = items.length > Number(limit);
    const page = hasMore ? items.slice(0, -1) : items;
    const next = hasMore ? encodeCursor(page[page.length - 1]) : null;

    res.json({ items: page, nextCursor: next });
  }
);

export default r;
