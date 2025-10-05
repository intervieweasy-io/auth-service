export type CursorPayload = { u?: string; i?: string };

export const encodeCursor = (doc: {
  updatedAt?: Date;
  createdAt?: Date;
  _id: unknown;
}): string => {
  const u = (doc as { updatedAt?: Date; createdAt?: Date }).updatedAt ||
    (doc as { createdAt?: Date }).createdAt;
  const payload: CursorPayload = {
    u: u ? u.toISOString() : undefined,
    i: String((doc as { _id: unknown })._id),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

export const decodeCursor = (c?: string | null): CursorPayload | null => {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, "base64").toString("utf8"));
  } catch {
    return null;
  }
};
