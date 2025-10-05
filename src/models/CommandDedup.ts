import { Schema, model } from "mongoose";

export interface ICommandDedup {
  _id: string;
  userId: string;
  command: Record<string, unknown>;
  status: "APPLIED" | "IGNORED";
  createdAt: Date;
}

const CommandDedupSchema = new Schema<ICommandDedup>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    command: { type: Object, required: true },
    status: { type: String, enum: ["APPLIED", "IGNORED"], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CommandDedupSchema.index({ userId: 1, _id: 1 }, { unique: true });

export const CommandDedup = model<ICommandDedup>(
  "CommandDedup",
  CommandDedupSchema
);
