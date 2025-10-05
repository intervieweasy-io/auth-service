import { Types } from "mongoose";
import { AuditAction, JobAudit } from "../models/JobAudit.js";

export const writeAudit = async (params: {
  jobId: Types.ObjectId;
  userId: string;
  action: AuditAction;
  fromStage?: string;
  toStage?: string;
  meta?: Record<string, unknown>;
}) => {
  await JobAudit.create({ ...params });
};
