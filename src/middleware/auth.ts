import { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { verifyAccess } from "../utils/jwt";

export const requireAuth =
  (roles?: string[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const hdr = req.headers.authorization || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
      if (!token) throw createError(401, "missing_token");

      const { payload } = await verifyAccess(token);
      if (
        roles &&
        roles.length &&
        !payload.roles?.some((r: string) => roles.includes(r))
      )
        throw createError(403, "forbidden");

      (req as any).user = payload;
      next();
    } catch (e: any) {
      next(createError(e.status || 401, "unauthorized"));
    }
  };
