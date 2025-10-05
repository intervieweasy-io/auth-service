import { cfg } from "../config.js";
import { SignJWT, jwtVerify, JWTPayload, JWTVerifyResult } from "jose";

const enc = new TextEncoder();
const keyFrom = (s: string) => {
  try {
    const b = Buffer.from(s, "base64");
    return b.length ? b : enc.encode(s);
  } catch {
    return enc.encode(s);
  }
};

const accessKey = keyFrom(cfg.accessSecret);
const refreshKey = keyFrom(cfg.refreshSecret);

export type AccessPayload = JWTPayload & { sub: string; roles?: string[] };

export const signAccess = ({ sub, roles = [] }: AccessPayload) =>
  new SignJWT({ roles })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(cfg.accessTtl)
    .sign(accessKey);

export const signRefresh = (payload: JWTPayload & { sub: string }) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(cfg.refreshTtl)
    .sign(refreshKey);

export const verifyAccess = (t: string): Promise<JWTVerifyResult<JWTPayload>> =>
  jwtVerify(t, accessKey, { algorithms: ["HS256"] });

export const verifyRefresh = (t: string): Promise<JWTVerifyResult<JWTPayload>> =>
  jwtVerify(t, refreshKey, { algorithms: ["HS256"] });
