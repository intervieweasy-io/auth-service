import { ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!r.success) return res.status(400).json({ error: "invalid_input", details: r.error.flatten() });
    (req as any).data = r.data;
    next();
  };
