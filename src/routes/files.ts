import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { requestDirectUpload, buildDeliveryUrl } from "../services/cloudflare.js";

const r = Router();

const uploadSchema = z.object({
  metadata: z.record(z.string(), z.string()).optional(),
  expirySeconds: z.number().int().positive().max(7 * 24 * 60 * 60).optional(),
});

r.post(
  "/upload",
  requireAuth(),
  validate(z.object({ body: uploadSchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { body: z.infer<typeof uploadSchema> } };
    try {
      const { metadata, expirySeconds } = (req as typeof ar).data!.body;
      const result = await requestDirectUpload({ metadata, expirySeconds });
      res.json({ id: result.id, uploadUrl: result.uploadURL });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      res.status(500).json({ error: "cloudflare_upload_error", message });
    }
  }
);

const downloadParamsSchema = z.object({ id: z.string().min(1) });
const downloadQuerySchema = z.object({ variant: z.string().min(1).optional() });

r.get(
  "/download/:id",
  requireAuth(),
  validate(z.object({ params: downloadParamsSchema, query: downloadQuerySchema })),
  async (req, res) => {
    const ar = req as AuthedRequest & { data?: { params: z.infer<typeof downloadParamsSchema>; query: z.infer<typeof downloadQuerySchema> } };
    try {
      const { id } = (req as typeof ar).data!.params;
      const { variant } = (req as typeof ar).data!.query;
      const url = buildDeliveryUrl(id, variant ?? null);
      res.json({ id, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      res.status(500).json({ error: "cloudflare_download_error", message });
    }
  }
);

export default r;
