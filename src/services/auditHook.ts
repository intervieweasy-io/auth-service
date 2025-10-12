import { Types } from "mongoose";
import { AuditAction, JobAudit } from "../models/JobAudit.js";
import { User } from "../models/User.js";

export const writeAudit = async (params: {
  jobId: Types.ObjectId;
  userId: string;
  action: AuditAction;
  fromStage?: string;
  toStage?: string;
  meta?: Record<string, unknown>;
  message?: string;
}) => {
  const user = await User.findById(params.userId).lean();
  const displayName = user?.name || user?.email || params.userId;

  let message = params.message;
  if (!message) {
    switch (params.action) {
      case "COMMENT":
        message = `${displayName} added a comment.`;
        break;
      case "MOVE_STAGE": {
        const fromLabel = params.fromStage ? params.fromStage : "unknown";
        const toLabel = params.toStage ? params.toStage : "unknown";
        message = `${displayName} moved the stage from ${fromLabel} to ${toLabel}.`;
        break;
      }
      case "ARCHIVE":
        message = `${displayName} archived the job.`;
        break;
      case "RESTORE":
        message = `${displayName} restored the job.`;
        break;
      case "UPDATE":
        message = `${displayName} updated the job.`;
        break;
      case "CREATE":
        message = `${displayName} created the job.`;
        break;
      default:
        message = `${displayName} performed an action.`;
        break;
    }
  }

  await JobAudit.create({
    ...params,
    userEmail: user?.email,
    userName: user?.name,
    message,
  });
};
