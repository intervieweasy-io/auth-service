import { Schema, model, Types } from "mongoose";

export interface IJobComment {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  userId: string;
  text: string;
  createdAt: Date;
}

const JobCommentSchema = new Schema<IJobComment>(
  {
    jobId: { type: Schema.Types.ObjectId, index: true, required: true },
    userId: { type: String, required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

JobCommentSchema.index({ jobId: 1, createdAt: -1 });

export const JobComment = model<IJobComment>("JobComment", JobCommentSchema);
