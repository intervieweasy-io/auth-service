import mongoose, { Document, Schema, Types } from "mongoose";

export type PostVisibility = "public" | "connections" | "private";
export type PostType = "text" | "media" | "poll" | "project" | "share";

export interface IPostMedia {
  kind: "image" | "video" | "audio" | "file";
  url: string;
  thumbUrl?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface IPollOption {
  id: string;
  label: string;
}

export interface IPost extends Document {
  authorId: Types.ObjectId;
  type: PostType;
  text?: string;
  tags: string[];
  visibility: PostVisibility;
  media: IPostMedia[];
  poll?: {
    question: string;
    options: IPollOption[];
    multi: boolean;
    expiresAt?: Date | null;
  } | null;
  shareOf?: Types.ObjectId | null;
  meta?: Record<string, unknown> | null;
  counts: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IPostMedia>(
  {
    kind: {
      type: String,
      enum: ["image", "video", "audio", "file"],
      required: true,
    },
    url: { type: String, required: true },
    thumbUrl: String,
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const pollSchema = new Schema(
  {
    question: { type: String, required: true },
    options: {
      type: [
        new Schema<IPollOption>(
          {
            id: { type: String, required: true },
            label: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      validate: (val: IPollOption[]) => val.length >= 2,
    },
    multi: { type: Boolean, default: false },
    expiresAt: Date,
  },
  { _id: false }
);

const postSchema = new Schema<IPost>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["text", "media", "poll", "project", "share"],
      required: true,
    },
    text: String,
    tags: { type: [String], default: [] },
    visibility: {
      type: String,
      enum: ["public", "connections", "private"],
      default: "public",
      index: true,
    },
    media: { type: [mediaSchema], default: [] },
    poll: { type: pollSchema, default: null },
    shareOf: { type: Schema.Types.ObjectId, ref: "Post" },
    meta: { type: Schema.Types.Mixed },
    counts: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ createdAt: -1 });

export const Post = mongoose.model<IPost>("Post", postSchema);

export interface IPostLike extends Document {
  userId: Types.ObjectId;
  postId: Types.ObjectId;
  createdAt: Date;
}

const postLikeSchema = new Schema<IPostLike>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

postLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const PostLike = mongoose.model<IPostLike>("PostLike", postLikeSchema);

export interface IPostComment extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  parentId?: Types.ObjectId | null;
  text: string;
  createdAt: Date;
  edited?: boolean;
}

const postCommentSchema = new Schema<IPostComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: "PostComment" },
    text: { type: String, required: true },
    edited: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

postCommentSchema.index({ postId: 1, createdAt: -1 });

export const PostComment = mongoose.model<IPostComment>(
  "PostComment",
  postCommentSchema
);

export interface IPostShare extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  text?: string;
  createdAt: Date;
}

const postShareSchema = new Schema<IPostShare>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PostShare = mongoose.model<IPostShare>("PostShare", postShareSchema);

export interface IPollVote extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  optionIds: string[];
  createdAt: Date;
}

const pollVoteSchema = new Schema<IPollVote>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    optionIds: { type: [String], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pollVoteSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const PollVote = mongoose.model<IPollVote>("PollVote", pollVoteSchema);
