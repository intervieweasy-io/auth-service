import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CommandDedup } from "../models/CommandDedup.js";
import { Job } from "../models/Job.js";
import { JobComment } from "../models/JobComment.js";
import { writeAudit } from "../services/auditHook.js";
import { parseCommand } from "../services/commandParser.js";

const r = Router();

const bodySchema = z.object({
  body: z.object({
    channel: z.enum(["voice", "text"]),
    transcript: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

r.post("/", requireAuth(), validate(bodySchema), async (req, res) => {
  const ar = req as AuthedRequest & {
    data?: {
      body: { channel: "voice" | "text"; transcript: string; requestId: string };
    };
  };
  const { body } = (req as typeof ar).data!;
  const { transcript, requestId } = body;

  try {
    await CommandDedup.create({
      _id: requestId,
      userId: ar.userId!,
      command: body,
      status: "APPLIED",
    });
  } catch {
    return res.json({ status: "IGNORED_DUPLICATE", requestId });
  }

  const parsed = await parseCommand(transcript);
  const intent = parsed?.intent as string | undefined;
  const args = (parsed?.args || {}) as Record<string, unknown>;

  if (!intent) {
    return res.json({
      status: "NEED_CLARIFICATION",
      question: "What do you want to do?",
      options: [],
      requestId,
    });
  }

  if (intent === "MOVE_STAGE") {
    const stage = args.stage as string | undefined;
    const query: Record<string, unknown> = { userId: ar.userId };
    const company = args.company as string | undefined;
    const title = args.title as string | undefined;
    if (company) query.company = new RegExp(`^${company}$`, "i");
    if (title) query.title = new RegExp(`^${title}$`, "i");
    const matches = await Job.find(query).limit(5);

    if (matches.length !== 1 || !stage) {
      const options = matches.map((j) => ({
        jobId: String(j._id),
        company: j.company,
        title: j.title,
      }));
      return res.json({
        status: "NEED_CLARIFICATION",
        question: "Which job?",
        options,
        requestId,
      });
    }

    const job = matches[0];
    const fromStage = job.stage;
    await Job.updateOne({ _id: job._id }, { $set: { stage } });
    await writeAudit({
      jobId: job._id,
      userId: ar.userId!,
      action: "MOVE_STAGE",
      fromStage,
      toStage: stage,
      meta: { requestId, source: body.channel },
    });
    return res.json({
      status: "APPLIED",
      effects: [{ type: "MOVE_STAGE", jobId: String(job._id), to: stage }],
    });
  }

  if (intent === "COMMENT") {
    const query: Record<string, unknown> = { userId: ar.userId };
    const company = args.company as string | undefined;
    const title = args.title as string | undefined;
    if (company) query.company = new RegExp(`^${company}$`, "i");
    if (title) query.title = new RegExp(`^${title}$`, "i");
    const matches = await Job.find(query).limit(5);

    if (matches.length !== 1) {
      const options = matches.map((j) => ({
        jobId: String(j._id),
        company: j.company,
        title: j.title,
      }));
      return res.json({
        status: "NEED_CLARIFICATION",
        question: "Which job?",
        options,
        requestId,
      });
    }

    const job = matches[0];
    const text = (args.text as string | undefined) || transcript;
    const comment = await JobComment.create({
      jobId: job._id,
      userId: ar.userId!,
      text,
    });
    await Job.updateOne({ _id: job._id }, { $inc: { notesCount: 1 } });
    await writeAudit({
      jobId: job._id,
      userId: ar.userId!,
      action: "COMMENT",
      meta: { requestId, source: body.channel },
    });
    return res.json({
      status: "APPLIED",
      effects: [
        { type: "COMMENT", jobId: String(comment.jobId), commentId: String(comment._id) },
      ],
    });
  }

  if (intent === "CREATE") {
    const doc = await Job.create({
      userId: ar.userId!,
      title: (args.title as string | undefined) || "Untitled",
      company: (args.company as string | undefined) || "Unknown",
      location: (args.location as string | undefined) || "",
      stage: (args.stage as string | undefined) || "WISHLIST",
    });
    await writeAudit({
      jobId: doc._id,
      userId: ar.userId!,
      action: "CREATE",
      meta: { requestId, source: body.channel },
    });
    return res.json({
      status: "APPLIED",
      effects: [{ type: "CREATE", jobId: String(doc._id) }],
    });
  }

  return res.json({
    status: "NEED_CLARIFICATION",
    question: "Please specify the action.",
    options: [],
    requestId,
  });
});

export default r;
