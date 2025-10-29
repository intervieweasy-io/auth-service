import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFollow extends Document {
  followerId: Types.ObjectId;
  followeeId: Types.ObjectId;
  createdAt: Date;
}

const followSchema = new Schema<IFollow>(
  {
    followerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    followeeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });

export const Follow = mongoose.model<IFollow>("Follow", followSchema);

export interface IBlock extends Document {
  byUserId: Types.ObjectId;
  toUserId: Types.ObjectId;
  createdAt: Date;
}

const blockSchema = new Schema<IBlock>(
  {
    byUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

blockSchema.index({ byUserId: 1, toUserId: 1 }, { unique: true });

export const Block = mongoose.model<IBlock>("Block", blockSchema);
