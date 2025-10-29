import mongoose, { Document, Schema, Types } from "mongoose";

export interface IProfileLink {
  type: string;
  url: string;
}

export interface IProfileEducation {
  school: string;
  degree?: string;
  start?: Date;
  end?: Date | null;
}

export interface IProfileExperience {
  company: string;
  role?: string;
  start?: Date;
  end?: Date | null;
  desc?: string;
  tags?: string[];
}

export interface IWallMedia {
  kind: "image" | "video" | "audio" | "file";
  url: string;
  thumbUrl?: string | null;
}

export interface IWallItem {
  _id: Types.ObjectId;
  type: "project" | "article" | "demo";
  title: string;
  summary?: string;
  media?: IWallMedia[];
  tags?: string[];
  pinned?: boolean;
  postId?: Types.ObjectId | null;
}

export interface IGrowthTimelineItem {
  _id: Types.ObjectId;
  ts: Date;
  type: string;
  text: string;
  postId?: Types.ObjectId | null;
}

export interface IProfile extends Document {
  userId: Types.ObjectId;
  headline?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  links: IProfileLink[];
  education: IProfileEducation[];
  experience: IProfileExperience[];
  skills: string[];
  introVideo?: { url?: string | null; durationSec?: number } | null;
  wall: IWallItem[];
  growthTimeline: IGrowthTimelineItem[];
  createdAt: Date;
  updatedAt: Date;
}

const wallMediaSchema = new Schema<IWallMedia>(
  {
    kind: { type: String, enum: ["image", "video", "audio", "file"], required: true },
    url: { type: String, required: true },
    thumbUrl: { type: String },
  },
  { _id: false }
);

const wallItemSchema = new Schema<IWallItem>(
  {
    type: { type: String, enum: ["project", "article", "demo"], required: true },
    title: { type: String, required: true },
    summary: String,
    media: [wallMediaSchema],
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    postId: { type: Schema.Types.ObjectId, ref: "Post" },
  },
  { timestamps: true }
);

const growthTimelineSchema = new Schema<IGrowthTimelineItem>(
  {
    ts: { type: Date, required: true },
    type: { type: String, required: true },
    text: { type: String, required: true },
    postId: { type: Schema.Types.ObjectId, ref: "Post" },
  },
  { timestamps: true }
);

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    headline: String,
    bio: String,
    location: String,
    avatarUrl: String,
    bannerUrl: String,
    links: {
      type: [
        new Schema<IProfileLink>(
          {
            type: { type: String, required: true },
            url: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    education: {
      type: [
        new Schema<IProfileEducation>(
          {
            school: { type: String, required: true },
            degree: String,
            start: Date,
            end: Date,
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    experience: {
      type: [
        new Schema<IProfileExperience>(
          {
            company: { type: String, required: true },
            role: String,
            start: Date,
            end: Date,
            desc: String,
            tags: { type: [String], default: [] },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    skills: { type: [String], default: [] },
    introVideo: {
      type: new Schema(
        {
          url: String,
          durationSec: Number,
        },
        { _id: false }
      ),
      default: null,
    },
    wall: { type: [wallItemSchema], default: [] },
    growthTimeline: { type: [growthTimelineSchema], default: [] },
  },
  { timestamps: true }
);

profileSchema.index({ userId: 1 });
profileSchema.index({ headline: "text", bio: "text" });

export const Profile = mongoose.model<IProfile>("Profile", profileSchema);
