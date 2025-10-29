import ms from "ms";
import { IPost } from "../models/Post.js";

const LAMBDA = 0.05;
const BASE = 2;
const WEIGHTS = { likes: 1, comments: 2, shares: 3 };
const PROXIMITY_WEIGHT = 2;
const AFFINITY_WEIGHT = 1.5;

const HOUR_IN_MS = ms("1h");

export const computeAffinity = (skills: string[], tags: string[]): number => {
  if (!skills.length && !tags.length) return 0;
  const skillSet = new Set(skills.map((s) => s.toLowerCase()));
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  let intersection = 0;
  for (const tag of tagSet) {
    if (skillSet.has(tag)) intersection += 1;
  }
  const union = new Set([...skillSet, ...tagSet]).size;
  return union === 0 ? 0 : intersection / union;
};

export const computePostScore = (
  post: IPost,
  opts: {
    viewerSkills: string[];
    proximity: number;
    now?: Date;
  }
): number => {
  const now = opts.now ?? new Date();
  const ageMs = now.getTime() - post.createdAt.getTime();
  const ageHours = ageMs / HOUR_IN_MS;
  const freshness = Math.exp(-LAMBDA * ageHours);
  const eng =
    WEIGHTS.likes * Math.log1p(post.counts.likes) +
    WEIGHTS.comments * Math.log1p(post.counts.comments) +
    WEIGHTS.shares * post.counts.shares;
  const affinity = computeAffinity(opts.viewerSkills, post.tags);
  const proximityScore = PROXIMITY_WEIGHT * opts.proximity;
  return freshness * (BASE + eng) + proximityScore + AFFINITY_WEIGHT * affinity;
};
