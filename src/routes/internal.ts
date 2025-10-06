import { Router } from "express";
import { z } from "zod";
import { cfg } from "../config.js";
import { validate } from "../middleware/validate.js";
import { parseJobLink } from "../services/parser.js";
import { parseCommand } from "../services/commandParser.js";

const r = Router();

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
