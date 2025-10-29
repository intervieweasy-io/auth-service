import { Schema, model, Types } from "mongoose";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "MOVE_STAGE"
  | "ARCHIVE"
  | "RESTORE"
  | "COMMENT";

export interface IJobAudit {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: AuditAction;
  fromStage?: string;
  toStage?: string;
  meta?: Record<string, unknown>;
  message?: string;
  createdAt: Date;
  message?: string;
}

const JobAuditSchema = new Schema<IJobAudit>(
  {
    jobId: { type: Schema.Types.ObjectId, index: true, required: true },
    userId: { type: String, required: true },
    userEmail: { type: String },
    userName: { type: String },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "MOVE_STAGE", "ARCHIVE", "RESTORE", "COMMENT"],
      required: true,
    },
    fromStage: { type: String },
    toStage: { type: String },
    message: { type: String },
    meta: { type: Object },
    message: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

JobAuditSchema.index({ jobId: 1, createdAt: -1 });

export const JobAudit = model<IJobAudit>("JobAudit", JobAuditSchema);
