import { cfg } from "../config.js";
import { SignJWT, jwtVerify, JWTPayload, JWTVerifyResult } from "jose";

const enc = new TextEncoder();

export type AccessPayload = JWTPayload & { sub: string; roles: string[] };

export const signAccess = (payload: AccessPayload) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(cfg.accessTtl)
    .sign(enc.encode(cfg.accessSecret));

export const signRefresh = (payload: JWTPayload) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(cfg.refreshTtl)
    .sign(enc.encode(cfg.refreshSecret));

export const verifyAccess = (t: string): Promise<JWTVerifyResult<AccessPayload>> =>
  jwtVerify<AccessPayload>(t, enc.encode(cfg.accessSecret));

export const verifyRefresh = (t: string) =>
  jwtVerify(t, enc.encode(cfg.refreshSecret));
