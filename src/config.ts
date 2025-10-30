import dotenv from "dotenv";
dotenv.config();
export const cfg = {
  port: parseInt(process.env.PORT || "4000", 10),
  mongoUri: process.env.MONGO_URI || "",
  mongoDbName: process.env.MONGO_DB_NAME || "karyo",
  accessSecret: process.env.JWT_ACCESS_SECRET || "",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "",
  accessTtl: process.env.ACCESS_TTL || "15m",
  refreshTtl: process.env.REFRESH_TTL || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "",
  cookieDomain: process.env.COOKIE_DOMAIN || "localhost",
  appUrl: process.env.APP_URL || "",
  emailFrom: process.env.EMAIL_FROM || "no-reply@example.com",
  allowedOrigins: process.env.ALLOWED_ORIGINS || "",
  allowedSignupEmails: process.env.ALLOWED_SIGNUP_EMAILS || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  cloudflareImagesToken: process.env.CLOUDFLARE_IMAGES_TOKEN || "",
  cloudflareImagesBaseUrl: process.env.CLOUDFLARE_IMAGES_BASE_URL || "",
};
