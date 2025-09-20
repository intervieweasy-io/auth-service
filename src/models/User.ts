import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  password: string;
  roles: string[];
  refreshHash?: string;
  resetTokenHash?: string;
  resetTokenExp?: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    roles: { type: [String], default: ["user"] },
    refreshHash: String,
    resetTokenHash: String,
    resetTokenExp: Date,
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);
