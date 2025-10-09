import * as cheerio from "cheerio";
import { cfg } from "../config.js";

type JobParseResult = { title: string; company: string; location: string };
type MoveStageIntent = {
  intent: "MOVE_STAGE";
  args: {
    stage: "WISHLIST";
    previous_stage: string;
    position: string;
    location: string;
  };
};

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const first = (...v: Array<string | null | undefined>) => {
  for (const x of v) {
    const c = clean(x);
    if (c) return c;
  }
  return "";
};
const hostOf = (u: string) => new URL(u).hostname.toLowerCase();
const cmpFromHost = (h: string) => h.replace(/^www\./, "").split(".")[0] ?? "";
const clip = (s: string, n = 16000) => (s.length > n ? s.slice(0, n) : s);

const safeJSON = <T = unknown>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const isJobPosting = (o: unknown): boolean => {
  if (!o || typeof o !== "object") return false;
  const t = (o as Record<string, unknown>)["@type"];
  if (typeof t === "string") return t === "JobPosting";
  return Array.isArray(t) && t.includes("JobPosting");
};

const toResult = (
  o: Partial<JobParseResult> | null | undefined
): JobParseResult => ({
  title: clean(o?.title),
  company: clean(o?.company),
  location: clean(o?.location),
});

const extractJsonLd = ($: cheerio.CheerioAPI): JobParseResult | null => {
  const rawBlocks = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => safeJSON<unknown>($(el).contents().text()))
    .filter(Boolean) as unknown[];

  const flat = rawBlocks.flatMap((b) => {
    if (Array.isArray(b)) return b;
    const g = (b as Record<string, unknown>)?.["@graph"];
    return Array.isArray(g) ? g : [b];
  });

  const job = flat.find(isJobPosting) as Record<string, unknown> | undefined;
  if (!job) return null;

  const org = (job["hiringOrganization"] ?? {}) as
    | Record<string, unknown>
    | string;
  const company =
    typeof org === "string"
      ? clean(org)
      : clean(
          (org?.["name"] as string) || (org?.["legalName"] as string) || ""
        );

  const jl =
    job["jobLocation"] ??
    job["applicantLocationRequirements"] ??
    job["jobLocationType"] ??
    job["applicantLocation"] ??
    "";

  let location = "";
  if (typeof jl === "string") {
    location = clean(jl);
  } else if (Array.isArray(jl)) {
    const x = (jl[0] ?? {}) as Record<string, unknown>;
    const addr = (x["address"] ?? {}) as Record<string, unknown>;
    location =
      clean(
        (addr["addressLocality"] as string) ||
          (addr["addressRegion"] as string) ||
          (addr["addressCountry"] as string) ||
          ""
      ) || clean((x["name"] as string) || "");
  } else if (jl && typeof jl === "object") {
    const x = jl as Record<string, unknown>;
    const addr = (x["address"] ?? {}) as Record<string, unknown>;
    location =
      clean(
        (addr["addressLocality"] as string) ||
          (addr["addressRegion"] as string) ||
          (addr["addressCountry"] as string) ||
          ""
      ) || clean((x["name"] as string) || "");
  }

  if (!location && typeof job["jobLocationType"] === "string")
    location = clean(job["jobLocationType"] as string);

  return toResult({
    title: clean(job["title"] as string),
    company,
    location,
  });
};

const extractMeta = ($: cheerio.CheerioAPI, url: string): JobParseResult => {
  const rawTitle = clean(
    first(
      $('meta[property="og:title"]').attr("content"),
      $('meta[name="twitter:title"]').attr("content"),
      $("title").text()
    )
  );
  const site = clean(
    first(
      $('meta[property="og:site_name"]').attr("content"),
      $('meta[name="application-name"]').attr("content")
    )
  );

  let title = "";
  let company = "";
  let location = "";

  if (/[–|\-]/.test(rawTitle)) {
    const parts = rawTitle.split(/–|\||-/).map(clean);
    if (parts.length >= 3) {
      title = parts[0];
      company = parts[1];
      location = parts.slice(2).join(" ");
    } else if (parts.length === 2) {
      [title, company] = parts;
    } else {
      title = parts[0];
    }
  } else {
    title = rawTitle;
  }

  const host = hostOf(url);
  if (!company) company = site || cmpFromHost(host);

  const ogd = $('meta[property="og:description"]').attr("content") ?? "";
  if (!location && /remote/i.test(ogd)) location = "Remote";

  return toResult({ title, company, location });
};

type Strategy = {
  match: (host: string) => boolean;
  extract: ($: cheerio.CheerioAPI, host: string) => Partial<JobParseResult>;
};

const S = (
  match: Strategy["match"],
  extract: Strategy["extract"]
): Strategy => ({ match, extract });

const ats: Strategy[] = [
  S(
    (h) => h.includes("greenhouse"),
    ($, h) => ({
      title: $("h1.app-title, .app-title, h1").first().text(),
      company:
        $(".company-name, .company-name a").first().text() || cmpFromHost(h),
      location: $(".location, .location span, .location a").first().text(),
    })
  ),
  S(
    (h) => h.includes("lever.co") || h.includes("jobs.lever"),
    ($, h) => ({
      title: $(".posting-headline h2, h2.posting-title, h2").first().text(),
      company: $(".posting-headline .company").first().text() || cmpFromHost(h),
      location: $(".posting-categories .location, .location").first().text(),
    })
  ),
  S(
    (h) => h.includes("ashbyhq"),
    ($, h) => ({
      title: $("h1, .job-posting-title").first().text(),
      company: cmpFromHost(h),
      location: $("[data-testid='location'], .JobPosting-location, .location")
        .first()
        .text(),
    })
  ),
  S(
    (h) => h.includes("workable"),
    ($, h) => ({
      title: $("h1, .job-title").first().text(),
      company:
        $(".company-name, .job-company, [data-ui='company-name']")
          .first()
          .text() || cmpFromHost(h),
      location: $(".job-location, .location, [data-ui='location']")
        .first()
        .text(),
    })
  ),
  S(
    (h) => h.includes("recruitee"),
    ($, h) => ({
      title: $("h1, .posting-title").first().text(),
      company:
        $(".company-title, .company-name").first().text() || cmpFromHost(h),
      location: $(".location, .job-location").first().text(),
    })
  ),
  S(
    (h) => h.includes("smartrecruiters"),
    ($, h) => ({
      title: $("h1, .job-title").first().text(),
      company: $(".company, .company-name").first().text() || cmpFromHost(h),
      location: $(".location, .job-location").first().text(),
    })
  ),
  S(
    (h) => h.includes("myworkdayjobs") || h.includes("workday"),
    ($, h) => ({
      title: $("h1, [data-automation-id='jobPostingHeaderTitle']")
        .first()
        .text(),
      company: cmpFromHost(h),
      location: $(
        "[data-automation-id='locations'], .css-1wa3eu0, .jobLocations"
      )
        .first()
        .text(),
    })
  ),
  S(
    (h) => h.includes("bamboohr"),
    ($, h) => ({
      title: $("h1, .title").first().text(),
      company: $(".company-name, .company").first().text() || cmpFromHost(h),
      location: $(".location, .position-location").first().text(),
    })
  ),
  S(
    (h) => h.includes("naukri.com"),
    ($, h) => ({
      title: $("h1 span.title, h1, .jd-header .title").first().text(),
      company:
        $(".jd-header .jd-company a, .jd-header .jd-company").first().text() ||
        cmpFromHost(h),
      location: $(".jd-header .loc a, .jd-header .loc").first().text(),
    })
  ),
  S(
    (h) => h.includes("shine.com"),
    ($, h) => ({
      title: $(".sr_job_heading, h1, [itemprop='title']").first().text(),
      company:
        $(".companyname, [itemprop='hiringOrganization']").first().text() ||
        cmpFromHost(h),
      location: $(".loc, [itemprop='jobLocation']").first().text(),
    })
  ),
  S(
    (h) => h.includes("monsterindia.com") || h.includes("monster.com"),
    ($, h) => ({
      title: $("h1.job-profile__title, .job-profile__title, h1").first().text(),
      company:
        $(".job-profile__company-name, .company-name, .company-detail .name")
          .first()
          .text() || cmpFromHost(h),
      location: $(
        ".job-profile__location, .job-profile__company .location, .location"
      )
        .first()
        .text(),
    })
  ),
  S(
    (h) => h.includes("timesjobs.com"),
    ($, h) => ({
      title: $("h1, .jd-header h1").first().text(),
      company:
        $(".comp-name, .jd-header .comp-name, .hiring-org").first().text() ||
        cmpFromHost(h),
      location: $(".loc, .location, .jd-header .loc").first().text(),
    })
  ),
  S(
    (h) => h.includes("iimjobs.com"),
    ($, h) => ({
      title: $("h1, .jobhead h1, .jd-job-title").first().text(),
      company:
        $(".comp-name, .company, .jd-comp-name").first().text() ||
        cmpFromHost(h),
      location: $(".loc, .location, .jd-location").first().text(),
    })
  ),
  S(
    (h) => h.includes("hirist.com"),
    ($, h) => ({
      title: $("h1, .job-title").first().text(),
      company: $(".company, .company-name").first().text() || cmpFromHost(h),
      location: $(".location, .job-location").first().text(),
    })
  ),
];

const extractATS = ($: cheerio.CheerioAPI, url: string): JobParseResult => {
  const h = hostOf(url);
  for (const s of ats) {
    if (s.match(h)) return toResult(s.extract($, h));
  }
  return { title: "", company: "", location: "" };
};

const sanitize = (s?: string) => {
  const x = (s || "").trim();
  if (!x) return "";
  if (/^(please *enter|tbd|n\/?a|none|null|--?)$/i.test(x)) return "";
  if (/^remote(?:-first)?$/i.test(x)) return "Remote";
  return x;
};

const preprocessForAi = (rawHtml: string) => {
  const ldjsonBlocks = Array.from(
    rawHtml.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  )
    .map((m) => m[1])
    .slice(0, 3);

  const h1 = (rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const ogTitle =
    rawHtml.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    )?.[1] || "";
  const twTitle =
    rawHtml.match(
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i
    )?.[1] || "";
  const titleTag = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";

  const ogDesc =
    rawHtml.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    )?.[1] || "";
  const locHints = (
    rawHtml.match(
      />([^<]*(?:Remote|Hybrid|On[- ]site|Bengaluru|Bangalore|San Francisco|NY|New York|London|Berlin|Toronto|Mumbai|Pune|Gurgaon|Gurugram|Hyderabad|Chennai|Delhi)[^<]*)</gi
    ) || []
  )
    .map((s) => s.replace(/[<>]/g, "").trim())
    .slice(0, 8);

  return {
    ldjson: ldjsonBlocks.map((b) => clip(b, 4000)),
    h1: clip(h1, 300),
    titles: [ogTitle, twTitle, titleTag]
      .map((t) => t && t.trim())
      .filter(Boolean)
      .slice(0, 3),
    desc: clip(ogDesc, 500),
    locHints,
  };
};

const extractAI = async ({
  html,
  url,
}: {
  html: string;
  url: string;
}): Promise<JobParseResult> => {
  if (!cfg.openAiApiKey) return { title: "", company: "", location: "" };

  const host = hostOf(url);
  const pre = preprocessForAi(html);

  const sys = `
You extract fields for a job post. Output ONLY JSON with keys exactly: "title","company","location".
Rules:
- Prefer JSON-LD JobPosting if available; otherwise infer from provided signals.
- Do not fabricate. If unsure, use "".
- "company": hiringOrganization.name → site name → host fragment, never placeholders like "Careers" or "Current Openings".
- "location": city/region/country; allow "Remote" only if clearly stated. If unclear, use "".
- Never output placeholders like "Please enter", "TBD", "N/A", "-", "null".
`;

  const fewShot1User = `URL: https://example.com/jobs/123
Signals:
- ldjson: [{"@type":"JobPosting","title":"Senior Frontend Engineer","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"London","addressCountry":"UK"}}}]
- h1: ""
- titles: ["Senior Frontend Engineer – Acme"]
- desc: ""
- locHints: []`;
  const fewShot1Asst = `{"title":"Senior Frontend Engineer","company":"Acme","location":"London"}`;

  const fewShot2User = `URL: https://example.com/jobs/remote-foo
Signals:
- ldjson: []
- h1: "Director of Data"
- titles: ["Director of Data | FooBar Inc."]
- desc: "Role can be remote within the US."
- locHints: ["Remote within the US"]`;
  const fewShot2Asst = `{"title":"Director of Data","company":"FooBar Inc.","location":"Remote"}`;

  const body = {
    model: cfg.openAiModel || "gpt-4o-mini",
    temperature: 0,
    top_p: 1,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: fewShot1User },
      { role: "assistant", content: fewShot1Asst },
      { role: "user", content: fewShot2User },
      { role: "assistant", content: fewShot2Asst },
      {
        role: "user",
        content:
          `URL: ${url}\n` +
          `Signals:\n` +
          `- ldjson: ${
            pre.ldjson.length ? pre.ldjson.join("\n---\n") : "[]"
          }\n` +
          `- h1: ${pre.h1 || '""'}\n` +
          `- titles: ${JSON.stringify(pre.titles)}\n` +
          `- desc: ${pre.desc ? JSON.stringify(pre.desc) : '""'}\n` +
          `- locHints: ${JSON.stringify(pre.locHints)}\n`,
      },
    ],
  };

  const attempt = async (tries = 2): Promise<JobParseResult> => {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.openAiApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const isRetryable = resp.status >= 500 || resp.status === 429;
        if (isRetryable && tries > 0) {
          await new Promise((r) => setTimeout(r, 400 * (3 - tries)));
          return attempt(tries - 1);
        }
        try {
          console.error("AI error payload:", await resp.text());
        } catch {}
        return { title: "", company: "", location: "" };
      }

      const data = await resp.json();
      const content =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
        "";

      const parsed = safeJSON<Partial<JobParseResult>>(content) || {};
      const result = toResult({
        title: sanitize(parsed.title),
        company: sanitize(parsed.company),
        location: sanitize(parsed.location),
      });

      if (
        !result.company ||
        /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(result.company)
      ) {
        result.company = sanitize(result.company) || cmpFromHost(host);
      }

      return result;
    } catch (e) {
      console.error("AI fetch failed:", e);
      return { title: "", company: "", location: "" };
    }
  };

  return attempt();
};

const isGood = (r: JobParseResult) => {
  const t = r.title?.trim() ?? "";
  const c = r.company?.trim() ?? "";
  const l = r.location?.trim() ?? "";
  const longTitle = t.length >= 5 && /\w+\s+\w+/.test(t);
  const notJustHost = c && !/^(www\.)?[a-z0-9-]+$/.test(c);
  const hasLoc = !!l;
  let score = 0;
  if (longTitle) score += 2;
  if (notJustHost) score += 1;
  if (hasLoc) score += 1;
  return score;
};

export const parseJobLink = async (
  sourceUrl: string
): Promise<JobParseResult> => {
  try {
    const res = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "InterviewEasyBot/1.0 (+https://intervieweasy.io)",
        Referer: new URL(sourceUrl).origin,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const byLd = extractJsonLd($);
    if (byLd && isGood(byLd) > 2) return byLd;

    const byAts = extractATS($, sourceUrl);
    if (isGood(byAts) > 2) return byAts;

    const byMeta = extractMeta($, sourceUrl);
    if (isGood(byMeta) > 3) return byMeta;

    const byAI = await extractAI({ html, url: sourceUrl });
    const candidates = [
      byLd ?? { title: "", company: "", location: "" },
      byAts,
      byMeta,
      byAI,
    ];
    candidates.sort((a, b) => isGood(b) - isGood(a));
    return candidates[0];
  } catch {
    try {
      const h = hostOf(sourceUrl);
      return { title: "", company: cmpFromHost(h), location: "" };
    } catch {
      return { title: "", company: "", location: "" };
    }
  }
};

export const buildMoveStageIntentFromLink = async (
  sourceUrl: string,
  previousStage = "APPLIED"
): Promise<MoveStageIntent> => {
  const { title, location } = await parseJobLink(sourceUrl);
  return {
    intent: "MOVE_STAGE",
    args: {
      stage: "WISHLIST",
      previous_stage: previousStage,
      position: title || "",
      location: location || "",
    },
  };
};
