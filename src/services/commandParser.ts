import { cfg } from "../config.js";

const sys =
  'You transform a short command transcript into strict JSON: {"intent":"CREATE|UPDATE|MOVE_STAGE|ARCHIVE|RESTORE|COMMENT","args":{}} Stages: WISHLIST, APPLIED, INTERVIEW, OFFER, ARCHIVED.';

export type ParsedCommand = { intent?: string; args?: Record<string, unknown> };

export const parseCommand = async (
  transcript: string
): Promise<ParsedCommand> => {
  if (!cfg.openAiApiKey) return {};
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.openAiModel,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: transcript },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return {};
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content) as ParsedCommand;
  } catch {
    return {};
  }
};
