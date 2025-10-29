import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CommandDedup } from "../models/CommandDedup.js";
import { Job } from "../models/Job.js";
import { JobComment } from "../models/JobComment.js";
import { writeAudit } from "../services/auditHook.js";
import { parseCommand } from "../services/commandParser.js";
import mongoose, { Schema } from "mongoose";

const r = Router();

/* =========================
   Request schema (+optional clarification fields)
   ========================= */
const bodySchema = z.object({
  body: z.object({
    channel: z.enum(["voice", "text"]),
    transcript: z.string().min(1),
    requestId: z.string().min(1),
    // Optional clarification helpers (clean stateless continuation)
    clarificationId: z.string().optional(),
    choice: z.string().optional(),
    stage: z.string().optional(),
  }),
});

/* =========================
   Pending Clarification Model
   ========================= */
type PendingOption = {
  jobId: string;
  company: string;
  title?: string;
  stage?: string;
};

type PendingDoc = {
  userId: mongoose.Types.ObjectId;
  intent:
    | "MOVE_STAGE"
    | "COMMENT"
    | "CREATE"
    | "UPDATE"
    | "ARCHIVE"
    | "RESTORE";
  args: Record<string, unknown>;
  options: PendingOption[];
  createdAt: Date;
};

const PendingOptionSchema = new Schema<PendingOption>(
  {
    jobId: { type: String, required: true },
    company: { type: String, required: true },
    title: { type: String },
    stage: { type: String },
  },
  { _id: false } // no subdocument _id
);

const PendingClarificationSchema = new Schema<PendingDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      unique: true,
    },
    intent: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: () => ({}) },
    options: { type: [PendingOptionSchema], default: () => [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "pending_clarifications" }
);

const PendingClarification =
  (mongoose.models?.PendingClarification as mongoose.Model<PendingDoc>) ||
  mongoose.model<PendingDoc>(
    "PendingClarification",
    PendingClarificationSchema
  );

/* =========================
   Helpers (no optional chaining)
   ========================= */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const lc = (s?: string) => (s || "").toLowerCase();
const safeTime = (d?: Date) => (d instanceof Date ? d.getTime() : 0);

const softScore = (hay: string, needle?: string) => {
  if (!needle) return 0;
  const H = hay || "";
  const N = needle || "";
  // exact (ci)
  if (H.localeCompare(N, undefined, { sensitivity: "accent" }) === 0) return 4;
  // word-boundary contains
  const wb = new RegExp("\\b" + esc(N) + "\\b", "i");
  if (wb.test(H)) return 3;
  // substring
  const sub = new RegExp(esc(N), "i");
  if (sub.test(H)) return 2;
  // normalized contains
  const hN = norm(H);
  const nN = norm(N);
  if (hN && nN && (hN.indexOf(nN) >= 0 || nN.indexOf(hN) >= 0)) return 2;
  return 0;
};

type Stage = "WISHLIST" | "APPLIED" | "INTERVIEW" | "OFFER" | "ARCHIVED";
const normalizeStage = (s?: string): Stage | undefined => {
  if (!s) return undefined;
  const t = s.toUpperCase();
  if (/\bWISH(LIST)?\b/.test(t)) return "WISHLIST";
  if (/\bAPPL(ED|Y|IED)?\b/.test(t) || /\bAPPLIED\b/.test(t)) return "APPLIED";
  if (/\bINTERVIEW(S)?\b/.test(t) || /\bINTERVIEW STAGE\b/.test(t))
    return "INTERVIEW";
  if (/\bOFFER(S)?\b/.test(t)) return "OFFER";
  if (
    /\bARCHIVE(D)?\b/.test(t) ||
    /\bCLOSE(D)?\b/.test(t) ||
    /\bREJECT(ED)?\b/.test(t)
  )
    return "ARCHIVED";
  return undefined;
};

// Best-effort stage pickup from transcript when parser missed it.
const inferDesiredStage = (transcript: string): Stage | undefined => {
  const t = lc(transcript);
  // from X to Y → Y
  let m = t.match(/\bfrom\s+([a-z/ ]+?)\s+to\s+([a-z/ ]+)\b/);
  if (m && m[2]) {
    const s = normalizeStage(m[2]);
    if (s) return s;
  }
  // to|into|as Y
  m = t.match(/\b(?:to|into|as)\s+([a-z/ ]+)\b/);
  if (m && m[1]) {
    const s = normalizeStage(m[1]);
    if (s) return s;
  }
  // any stage word present
  return normalizeStage(t);
};

// read unified position from a Job doc (supports legacy `title`)
const readPosition = (j: any) => {
  if (j && typeof j.position === "string" && j.position) return j.position;
  if (j && typeof j.title === "string" && j.title) return j.title; // legacy
  return "";
};

// score a candidate by company + position; prefer non-archived
const scoreCandidate = (
  j: any,
  company?: string,
  position?: string,
  weights?: { company?: number; position?: number }
) => {
  const wC =
    weights && typeof weights.company === "number" ? weights.company : 2;
  const wP =
    weights && typeof weights.position === "number" ? weights.position : 1;
  const cScore = softScore(j.company || "", company);
  const pScore = softScore(readPosition(j), position);
  let score = cScore * wC + pScore * wP;
  if (j.stage !== "ARCHIVED") score += 1;
  return score;
};

const rankJobs = (
  jobs: any[],
  company?: string,
  position?: string,
  wC = 2,
  wP = 2
) => {
  return jobs
    .map(function (j) {
      return {
        j,
        score: scoreCandidate(j, company, position, {
          company: wC,
          position: wP,
        }),
      };
    })
    .sort(function (a, b) {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return safeTime(b.j && b.j.updatedAt) - safeTime(a.j && a.j.updatedAt);
    });
};

const parseOrdinalOrIndex = (t: string) => {
  const s = lc(t).trim();
  const ord: any = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  if (typeof ord[s] === "number") return ord[s] - 1;
  const m = s.match(/\b(?:pick|option|choose|select)?\s*(\d+)\b/);
  if (m) return parseInt(m[1], 10) - 1;
  return null;
};

/* =========================
   Route
   ========================= */
r.post("/", requireAuth(), validate(bodySchema), async (req, res) => {
  const ar = req as AuthedRequest & {
    data?: {
      body: {
        channel: "voice" | "text";
        transcript: string;
        requestId: string;
        clarificationId?: string;
        choice?: string;
        stage?: string;
      };
    };
  };
  const { body } = (req as typeof ar).data!;
  const {
    transcript,
    requestId,
    clarificationId,
    choice,
    stage: stageFromBody,
  } = body;

  /* ---- idempotency guard ---- */
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

  /* ============================================================
     0) Clarification fast-path (explicit via optional fields)
     ============================================================ */
  if (clarificationId) {
    const pending = await PendingClarification.findOne({
      _id: clarificationId,
      userId: ar.userId!,
    });
    if (!pending) {
      return res.json({
        status: "NEED_CLARIFICATION",
        question: "That prompt expired. Try again.",
        options: [],
        requestId,
      });
    }

    // resolve choice to a jobId
    let chosenJobId: string | null = null;

    // A) direct 24-hex jobId
    if (choice && /^[a-f0-9]{24}$/i.test(choice)) chosenJobId = choice;

    // B) index/ordinal like "2" / "second"
    if (!chosenJobId && choice) {
      const idx = parseOrdinalOrIndex(choice);
      if (idx != null && pending.options[idx])
        chosenJobId = pending.options[idx].jobId;
    }

    // C) fuzzy by company/title
    if (!chosenJobId && choice) {
      const L = function (s?: string) {
        return (s || "").toLowerCase();
      };
      let best = null as null | { jobId: string };
      let bestScore = -1;
      for (let i = 0; i < pending.options.length; i++) {
        const o = pending.options[i];
        const s =
          (L(o.company).indexOf(L(choice)) >= 0 ? 2 : 0) +
          (L(o.title).indexOf(L(choice)) >= 0 ? 1 : 0);
        if (s > bestScore) {
          bestScore = s;
          best = o as any;
        }
      }
      if (bestScore > 0 && best) chosenJobId = best.jobId;
    }

    if (!chosenJobId) {
      return res.json({
        status: "NEED_CLARIFICATION",
        clarificationId: String(pending._id),
        question: "Which job?",
        options: pending.options,
        requestId,
      });
    }

    // Execute original pending intent
    if (pending.intent === "MOVE_STAGE") {
      const desiredStage =
        normalizeStage(stageFromBody) ||
        normalizeStage((pending.args as any).stage as string) ||
        inferDesiredStage(transcript);
      if (!desiredStage) {
        return res.json({
          status: "NEED_CLARIFICATION",
          clarificationId: String(pending._id),
          question: "Which stage do you want?",
          options: [],
          requestId,
        });
      }

      const job = await Job.findOne({ _id: chosenJobId, userId: ar.userId! });
      if (!job) {
        return res.json({
          status: "NEED_CLARIFICATION",
          clarificationId: String(pending._id),
          question: "Job not found. Pick again.",
          options: pending.options,
          requestId,
        });
      }

      const fromStage = job.stage;
      await Job.updateOne({ _id: job._id }, { $set: { stage: desiredStage } });
      await writeAudit({
        jobId: job._id,
        userId: ar.userId!,
        action: "MOVE_STAGE",
        fromStage,
        toStage: desiredStage,
        meta: { requestId, source: body.channel },
      });
      await PendingClarification.deleteOne({ _id: clarificationId });

      return res.json({
        status: "APPLIED",
        effects: [
          { type: "MOVE_STAGE", jobId: String(job._id), to: desiredStage },
        ],
      });
    }

    if (pending.intent === "COMMENT") {
      const job = await Job.findOne({ _id: chosenJobId, userId: ar.userId! });
      if (!job) {
        return res.json({
          status: "NEED_CLARIFICATION",
          clarificationId: String(pending._id),
          question: "Job not found. Pick again.",
          options: pending.options,
          requestId,
        });
      }

      const text =
        ((pending.args && (pending.args as any).text) as string) || transcript;

      const user = await User.findById(ar.userId);
      const comment = await JobComment.create({
        jobId: job._id,
        userId: ar.userId!,
        userEmail: user?.email,
        userName: user?.name,
        text,
      });
      await Job.updateOne({ _id: job._id }, { $inc: { notesCount: 1 } });
      await writeAudit({
        jobId: job._id,
        userId: ar.userId!,
        action: "COMMENT",
        meta: { requestId, source: body.channel },
      });
      await PendingClarification.deleteOne({ _id: clarificationId });

      return res.json({
        status: "APPLIED",
        effects: [
          {
            type: "COMMENT",
            jobId: String(comment.jobId),
            commentId: String(comment._id),
          },
        ],
      });
    }

    // Other intents could be added here similarly if you ever clarify them.
  }

  /* ============================================================
     1) Normal flow (no clarificationId): parse, match, maybe ask
     ============================================================ */
  const parsed = await parseCommand(transcript);
  const intent = (parsed && parsed.intent) as string | undefined;
  const args = (parsed && parsed.args ? parsed.args : {}) as Record<
    string,
    unknown
  >;

  if (!intent) {
    return res.json({
      status: "NEED_CLARIFICATION",
      question: "What do you want to do?",
      options: [],
      requestId,
    });
  }

  /* ---------- MOVE_STAGE ---------- */
  if (intent === "MOVE_STAGE") {
    // Synonym-aware extraction
    const company =
      (args.company as string | undefined) ||
      (args.project as string | undefined) ||
      (args.org as string | undefined) ||
      (args.employer as string | undefined) ||
      (args.company_name as string | undefined);

    const position =
      (args.position as string | undefined) ||
      (args.role as string | undefined) ||
      (args.title as string | undefined) ||
      (args.job as string | undefined) ||
      (args.designation as string | undefined);

    const desiredStage =
      normalizeStage(
        (args.stage as string | undefined) ||
          (args.stage_to as string | undefined) ||
          (args.to_stage as string | undefined) ||
          (args.to as string | undefined) ||
          (args.new_stage as string | undefined) ||
          (args.move_to as string | undefined)
      ) || inferDesiredStage(transcript);

    if (!desiredStage) {
      return res.json({
        status: "NEED_CLARIFICATION",
        question: "Which stage do you want?",
        options: [],
        requestId,
      });
    }

    const candidates = await Job.find({ userId: ar.userId }).limit(100);
    const ranked = rankJobs(candidates, company, position, 2, 2);
    const top = ranked[0];
    const second = ranked[1];
    const confident =
      top &&
      top.score >= 4 &&
      (!second || top.score - (second.score || 0) >= 2);

    if (confident) {
      const job = top.j;
      const fromStage = job.stage;
      await Job.updateOne({ _id: job._id }, { $set: { stage: desiredStage } });
      await writeAudit({
        jobId: job._id,
        userId: ar.userId!,
        action: "MOVE_STAGE",
        fromStage,
        toStage: desiredStage,
        meta: { requestId, source: body.channel },
      });
      return res.json({
        status: "APPLIED",
        effects: [
          { type: "MOVE_STAGE", jobId: String(job._id), to: desiredStage },
        ],
      });
    }

    // Save pending and return clarification
    const options = ranked.slice(0, 5).map(function (x) {
      const j = x.j;
      return {
        jobId: String(j._id),
        company: j.company,
        title: readPosition(j),
        stage: j.stage,
      };
    });

    const pending = await PendingClarification.findOneAndUpdate(
      { userId: ar.userId! },
      {
        $set: {
          userId: ar.userId!,
          intent: "MOVE_STAGE",
          args: { stage: desiredStage },
          options,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return res.json({
      status: "NEED_CLARIFICATION",
      clarificationId: String(pending._id),
      question: "Which job?",
      options,
      requestId,
    });
  }

  /* ---------- COMMENT ---------- */
  if (intent === "COMMENT") {
    const company =
      (args.company as string | undefined) || (args.org as string | undefined);
    const position =
      (args.position as string | undefined) ||
      (args.title as string | undefined) ||
      (args.role as string | undefined);
    const text = (args.text as string | undefined) || transcript;

    const candidates = await Job.find({ userId: ar.userId }).limit(100);
    const ranked = rankJobs(candidates, company, position, 2, 1);
    const top = ranked[0];
    const second = ranked[1];
    const confident =
      top &&
      top.score >= 3 &&
      (!second || top.score - (second.score || 0) >= 2);

    if (confident) {
      const job = top.j;
      const user = await User.findById(ar.userId);
      const comment = await JobComment.create({
        jobId: job._id,
        userId: ar.userId!,
        userEmail: user?.email,
        userName: user?.name,
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
          {
            type: "COMMENT",
            jobId: String(comment.jobId),
            commentId: String(comment._id),
          },
        ],
      });
    }

    const options = ranked.slice(0, 5).map(function (x) {
      const j = x.j;
      return {
        jobId: String(j._id),
        company: j.company,
        title: readPosition(j),
        stage: j.stage,
      };
    });

    const pending = await PendingClarification.findOneAndUpdate(
      { userId: ar.userId! },
      {
        $set: {
          userId: ar.userId!,
          intent: "COMMENT",
          args: { text },
          options,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return res.json({
      status: "NEED_CLARIFICATION",
      clarificationId: String(pending._id),
      question: "Which job?",
      options,
      requestId,
    });
  }

  /* ---------- CREATE (write both position & title for backward compat) ---------- */
  if (intent === "CREATE") {
    const pos =
      (args.position as string | undefined) ||
      ((args as any).title as string | undefined) ||
      "Untitled";

    const doc = await Job.create({
      userId: ar.userId!,
      position: pos,
      title: pos, // mirror to satisfy schemas that still require `title`
      company: (args.company as string | undefined) || "Unknown",
      location: (args.location as string | undefined) || "",
      stage: normalizeStage(args.stage as string | undefined) || "WISHLIST",
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

  /* ---------- Fallback ---------- */
  return res.json({
    status: "NEED_CLARIFICATION",
    question: "Please specify the action.",
    options: [],
    requestId,
  });
});

export default r;
