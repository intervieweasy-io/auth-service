import mongoose from "mongoose";
import { cfg } from "./config.js";
export const connectDb = async () => mongoose.connect(cfg.mongoUri);
