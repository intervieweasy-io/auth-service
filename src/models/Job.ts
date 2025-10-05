import { Schema, model, Types } from "mongoose";

export type Stage =
  | "WISHLIST"
  | "APPLIED"
  | "INTERVIEW"
  | "OFFER"
  | "ARCHIVED";

export interface IJob {
  _id: Types.ObjectId;
  userId: string;
  title: string;
  company: string;
  location?: string;
  sourceUrl?: string;
  priority: "starred" | "normal";
  stage: Stage;
  appliedOn?: Date | null;
  notesCount: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    userId: { type: String, index: true, required: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String },
    sourceUrl: { type: String },
    priority: { type: String, enum: ["starred", "normal"], default: "normal" },
    stage: {
      type: String,
      enum: ["WISHLIST", "APPLIED", "INTERVIEW", "OFFER", "ARCHIVED"],
      default: "WISHLIST",
      index: true,
    },
    appliedOn: { type: Date },
    notesCount: { type: Number, default: 0 },
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

JobSchema.index({ userId: 1, archived: 1, stage: 1, updatedAt: -1 });

export const Job = model<IJob>("Job", JobSchema);
