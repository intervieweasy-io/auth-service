import { IPost } from "../models/Post.js";
import { Follow, Block } from "../models/Graph.js";

export const canViewPost = async (
  post: IPost,
  viewerId?: string | null
): Promise<boolean> => {
  if (post.visibility === "public") return true;
  if (!viewerId) return false;
  if (String(post.authorId) === viewerId) return true;
  const blockedByViewer = await Block.findOne({ byUserId: viewerId, toUserId: post.authorId });
  if (blockedByViewer) return false;
  const blockedByAuthor = await Block.findOne({ byUserId: post.authorId, toUserId: viewerId });
  if (blockedByAuthor) return false;
  if (post.visibility === "private") return false;
  const forward = await Follow.findOne({ followerId: viewerId, followeeId: post.authorId });
  const backward = await Follow.findOne({ followerId: post.authorId, followeeId: viewerId });
  return Boolean(forward && backward);
};
