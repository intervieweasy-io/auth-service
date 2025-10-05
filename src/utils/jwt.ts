import { cfg } from "../config.js";
import { SignJWT, jwtVerify, JWTPayload, JWTVerifyResult } from "jose";

const mustB64 = (s: string) => {
  const inStr = (s || "").trim();
  const buf = Buffer.from(inStr, "base64");
  if (
    buf.length === 0 ||
    buf.toString("base64").replace(/=+$/, "") !== inStr.replace(/=+$/, "")
  ) {
    throw new Error("JWT secret must be base64. Check env.");
  }
  return buf;
};

const accessKey = mustB64(cfg.accessSecret);
const refreshKey = mustB64(cfg.refreshSecret);

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

export const verifyRefresh = (
  t: string
): Promise<JWTVerifyResult<JWTPayload>> =>
  jwtVerify(t, refreshKey, { algorithms: ["HS256"] });
