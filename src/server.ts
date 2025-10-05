import express from "express";
import helmetModule from "helmet";
type HelmetFactory = typeof import("helmet") extends { default: infer T }
  ? T
  : never;
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimitModule from "express-rate-limit";
import { cfg } from "./config.js";
import { connectDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import { authLimiter } from "./middleware/rateLimit.js";
import jobs from "./routes/jobs.js";
import comments from "./routes/comments.js";
import audit from "./routes/audit.js";
import commands from "./routes/commands.js";
import internal from "./routes/internal.js";

const helmet =
  typeof helmetModule === "function"
    ? (helmetModule as HelmetFactory)
    : (helmetModule as { default: HelmetFactory }).default;

type RateLimitFactory = typeof rateLimitModule extends {
  default: infer T;
}
  ? T
  : typeof rateLimitModule;

const rateLimit =
  typeof rateLimitModule === "function"
    ? (rateLimitModule as RateLimitFactory)
    : (rateLimitModule as { default: RateLimitFactory }).default;

const app = express();

const origins = (cfg.allowedOrigins || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});
app.use(rateLimit({ windowMs: 60_000, limit: 300 }));

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/core/jobs", jobs);
app.use("/api/core/jobs", comments);
app.use("/api/core/jobs", audit);
app.use("/api/core/commands", commands);
app.use("/api/core/internal", internal);

app.get("/api/core/health", (_, res) => res.json({ ok: true }));
app.get("/api/health", (_, res) => res.json({ ok: true }));

const start = async () => {
  await connectDb();
  app.listen(cfg.port, () => console.log(`Auth service on ${cfg.port}`));
};
start();
