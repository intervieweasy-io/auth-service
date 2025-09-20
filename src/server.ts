import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { cfg } from "./config";
import { connectDb } from "./db";
import authRoutes from "./routes/auth";
import { authLimiter } from "./middleware/rateLimit";

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
