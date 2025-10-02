import rateLimitModule from "express-rate-limit";

type RateLimitModule = typeof import("express-rate-limit");
type RateLimitFactory = RateLimitModule extends { default: infer T }
  ? T
  : RateLimitModule extends (...args: any[]) => any
  ? RateLimitModule
  : never;

const rateLimit =
  typeof rateLimitModule === "function"
    ? (rateLimitModule as RateLimitFactory)
    : (rateLimitModule as { default: RateLimitFactory }).default;

export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
