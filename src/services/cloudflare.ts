import { cfg } from "../config.js";

interface DirectUploadOptions {
  metadata?: Record<string, string>;
  expirySeconds?: number;
}

interface DirectUploadResult {
  id: string;
  uploadURL: string;
}

const ensureConfig = () => {
  if (!cfg.cloudflareAccountId || !cfg.cloudflareImagesToken) {
    throw new Error("cloudflare_images_not_configured");
  }
};

export const requestDirectUpload = async (
  options: DirectUploadOptions = {}
): Promise<DirectUploadResult> => {
  ensureConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/images/v2/direct_upload`;
  const body: Record<string, unknown> = {};
  if (options.metadata && Object.keys(options.metadata).length > 0) {
    body.metadata = options.metadata;
  }
  if (options.expirySeconds && options.expirySeconds > 0) {
    body.expiry = Math.floor(Date.now() / 1000) + options.expirySeconds;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.cloudflareImagesToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`cloudflare_direct_upload_failed:${response.status}:${text}`);
  }
  const json = (await response.json()) as {
    success: boolean;
    result?: DirectUploadResult;
    errors?: { message?: string }[];
  };
  if (!json.success || !json.result) {
    const message = json.errors?.map((e) => e.message).filter(Boolean).join(", ") || "unknown_error";
    throw new Error(`cloudflare_direct_upload_failed:${message}`);
  }
  return json.result;
};

export const buildDeliveryUrl = (id: string, variant?: string | null): string => {
  if (!cfg.cloudflareImagesBaseUrl) {
    throw new Error("cloudflare_images_not_configured");
  }
  const trimmedBase = cfg.cloudflareImagesBaseUrl.replace(/\/$/, "");
  if (variant) {
    return `${trimmedBase}/${variant}/${id}`;
  }
  return `${trimmedBase}/${id}`;
};
