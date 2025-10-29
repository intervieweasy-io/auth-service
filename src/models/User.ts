import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  handle: string;
  password: string;
  roles: string[];
  refreshHash?: string;
  resetTokenHash?: string;
  resetTokenExp?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    handle: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    roles: { type: [String], default: ["user"] },
    refreshHash: String,
    resetTokenHash: String,
    resetTokenExp: Date,
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);
