import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPodMember {
  userId: Types.ObjectId;
  role: "owner" | "member";
}

export interface IPodRitual {
  id: string;
  title: string;
  cadence: "daily" | "weekly" | "monthly";
  nextRunAt?: Date | null;
}

export interface IPodNeed {
  skill: string;
  level?: string;
  must?: boolean;
}

export interface IPodOffer {
  skill: string;
  level?: string;
}

export interface IPod extends Document {
  name: string;
  purpose?: string;
  tags: string[];
  ownerId: Types.ObjectId;
  visibility: "public" | "private";
  members: IPodMember[];
  rituals: IPodRitual[];
  needs: IPodNeed[];
  offers: IPodOffer[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICheckin extends Document {
  podId: Types.ObjectId;
  ritualId?: string;
  userId: Types.ObjectId;
  text: string;
  mood?: string;
  createdAt: Date;
}

const memberSchema = new Schema<IPodMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "member"], default: "member" },
  },
  { _id: false }
);

const ritualSchema = new Schema<IPodRitual>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    cadence: { type: String, enum: ["daily", "weekly", "monthly"], required: true },
    nextRunAt: Date,
  },
  { _id: false }
);

const needSchema = new Schema<IPodNeed>(
  {
    skill: { type: String, required: true },
    level: String,
    must: Boolean,
  },
  { _id: false }
);

const offerSchema = new Schema<IPodOffer>(
  {
    skill: { type: String, required: true },
    level: String,
  },
  { _id: false }
);

const podSchema = new Schema<IPod>(
  {
    name: { type: String, required: true },
    purpose: String,
    tags: { type: [String], default: [] },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    visibility: { type: String, enum: ["public", "private"], default: "public" },
    members: { type: [memberSchema], default: [] },
    rituals: { type: [ritualSchema], default: [] },
    needs: { type: [needSchema], default: [] },
    offers: { type: [offerSchema], default: [] },
  },
  { timestamps: true }
);

podSchema.index({ tags: 1 });
podSchema.index({ visibility: 1 });

export const Pod = mongoose.model<IPod>("Pod", podSchema);

const checkinSchema = new Schema<ICheckin>(
  {
    podId: { type: Schema.Types.ObjectId, ref: "Pod", required: true, index: true },
    ritualId: String,
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true },
    mood: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

checkinSchema.index({ podId: 1, createdAt: -1 });

export const Checkin = mongoose.model<ICheckin>("Checkin", checkinSchema);
