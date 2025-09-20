import dotenv from "dotenv";
dotenv.config();
export const cfg = {
  port: parseInt(process.env.PORT || "4000", 10),
  mongoUri: process.env.MONGO_URI || "",
  accessSecret: process.env.JWT_ACCESS_SECRET || "",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "",
  accessTtl: process.env.ACCESS_TTL || "15m",
  refreshTtl: process.env.REFRESH_TTL || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "",
  cookieDomain: process.env.COOKIE_DOMAIN || "localhost",
  appUrl: process.env.APP_URL || "",
  emailFrom: process.env.EMAIL_FROM || "no-reply@example.com"
};
