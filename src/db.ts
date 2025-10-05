import mongoose from "mongoose";
import { cfg } from "./config.js";

mongoose.set("strictQuery", true);

export const connectDb = async () =>
  mongoose.connect(cfg.mongoUri, { dbName: cfg.mongoDbName || "karyo" });
