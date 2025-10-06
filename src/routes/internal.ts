import { Router } from "express";
import { z } from "zod";
import { cfg } from "../config.js";
import { validate } from "../middleware/validate.js";
import { parseJobLink } from "../services/parser.js";
import { parseCommand } from "../services/commandParser.js";

const r = Router();

r.get("/openai/health", async (_req, res) => {
  if (!cfg.openAiApiKey) {
    res.status(500).json({ ok: false, error: "OpenAI API key not configured" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${cfg.openAiApiKey}`,
      },
    });

    if (!response.ok) {
      res.status(502).json({
        ok: false,
        error: "OpenAI API returned a non-OK status",
        status: response.status,
      });
      return;
    }

    res.json({ ok: true, beta: true });
  } catch (error) {
    console.error("OpenAI health check failed", error);
    res.status(500).json({ ok: false, error: "Failed to reach OpenAI" });
  }
});

r.post(
  "/parser/link",
  validate(z.object({ body: z.object({ sourceUrl: z.string().url() }) })),
  async (req, res) => {
    const { body } = (req as { data?: { body: { sourceUrl: string } } })
      .data ?? {
      body: { sourceUrl: "" },
    };
    const data = await parseJobLink(body.sourceUrl);
    res.json(data);
  }
);

r.post(
  "/commands/parse",
  validate(z.object({ body: z.object({ transcript: z.string().min(1) }) })),
  async (req, res) => {
    const { body } = (req as { data?: { body: { transcript: string } } })
      .data ?? {
      body: { transcript: "" },
    };
    const data = await parseCommand(body.transcript);
    res.json(data);
  }
);

export default r;
