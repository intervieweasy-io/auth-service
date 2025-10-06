import { Router } from "express";
import { cfg } from "../config.js";

const r = Router();

r.get("/health", async (_req, res) => {
  if (!cfg.openAiApiKey) {
    return res
      .status(500)
      .json({ ok: false, error: "OpenAI API key not configured" });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${cfg.openAiApiKey}` },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      return res
        .status(502)
        .json({ ok: false, error: "OpenAI API non-OK", status: resp.status });
    }
    return res.json({ ok: true, response: resp });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to reach OpenAI" });
  }
});

export default r;
