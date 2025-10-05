import { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { verifyAccess } from "../utils/jwt.js";

export interface AuthedRequest extends Request {
  userId?: string;
  user?: Record<string, unknown>;
}

export const requireAuth =
  (roles?: string[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const hdr = req.headers.authorization || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
      if (!token) throw createError(401, "missing_token");

      const { payload } = await verifyAccess(token);

      const payloadRoles = Array.isArray((payload as { roles?: unknown }).roles)
        ? ((payload as { roles?: unknown }).roles as unknown[]).map((r) =>
            String(r)
          )
        : [];

      if (roles?.length && !payloadRoles.some((r) => roles.includes(r))) {
        throw createError(403, "forbidden");
      }

      const authed = req as AuthedRequest;
      authed.user = payload as Record<string, unknown>;
      authed.userId = String(payload.sub || payload.userId || payload.uid || "");
      if (!authed.userId) throw createError(401, "unauthorized");

      next();
    } catch (e: any) {
      next(createError(e.status || 401, e.message || "unauthorized"));
    }
  };
