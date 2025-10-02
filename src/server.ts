import express from "express";
import helmetModule from "helmet";
type HelmetFactory = typeof import("helmet") extends { default: infer T }
  ? T
  : never;
import cors from "cors";
import cookieParser from "cookie-parser";
import { cfg } from "./config.js";
import { connectDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import { authLimiter } from "./middleware/rateLimit.js";

const helmet =
  typeof helmetModule === "function"
    ? (helmetModule as HelmetFactory)
    : (helmetModule as { default: HelmetFactory }).default;

const app = express();
app.use(helmet());
app.use(cors({ origin: cfg.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authLimiter, authRoutes);
app.get("/api/health", (_, res) => res.json({ ok: true }));

const start = async () => {
  await connectDb();
  app.listen(cfg.port, () => console.log(`Auth service on ${cfg.port}`));
};
start();
