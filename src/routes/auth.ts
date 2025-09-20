import { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { User } from "../models/User.js";
import { hashPwd, cmpPwd } from "../utils/password.js";
import { signAccess, signRefresh, verifyRefresh } from "../utils/jwt.js";
import { validate } from "../middleware/validate.js";
import { sendEmail } from "../utils/sendEmail.js";
import { cfg } from "../config.js";

type R = Request & { data?: any; cookies?: Record<string, string> };

const r = Router();
const email = z.string().email();
const pwd = z.string().min(8);

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie("refresh_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    domain: cfg.cookieDomain,
    path: "/api/auth"
  });

r.post(
  "/signup",
  validate(z.object({ body: z.object({ email, name: z.string().min(1), password: pwd }) })),
  async (req: R, res: Response) => {
    const { email, name, password } = req.data.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "email_in_use" });
    const passwordHash = await hashPwd(password);
    const user = await User.create({ email, name, password: passwordHash });
    const roles = Array.isArray(user.roles) ? [...user.roles].map(String) : [];
    const access = await signAccess({ sub: String(user._id), roles });
    const refresh = await signRefresh({ sub: String(user._id), ver: Date.now() });
    user.refreshHash = await hashPwd(refresh);
    await user.save();
    setRefreshCookie(res, refresh);
    res.json({ access });
  }
);

r.post(
  "/login",
  validate(z.object({ body: z.object({ email, password: pwd }) })),
  async (req: R, res: Response) => {
    const { email, password } = req.data.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "invalid_credentials" });
    const ok = await cmpPwd(password, user.password);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    const roles = Array.isArray(user.roles) ? [...user.roles].map(String) : [];
    const access = await signAccess({ sub: String(user._id), roles });
    const refresh = await signRefresh({ sub: String(user._id), ver: Date.now() });
    user.refreshHash = await hashPwd(refresh);
    await user.save();
    setRefreshCookie(res, refresh);
    res.json({ access });
  }
);

r.post("/refresh", async (req: R, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: "missing_refresh" });
  try {
    const { payload } = await verifyRefresh(token);
    const user = await User.findById(payload.sub as string);
    if (!user) return res.status(401).json({ error: "invalid_refresh" });
    const match = await cmpPwd(token, user.refreshHash || "");
    if (!match) return res.status(401).json({ error: "rotated_or_revoked" });
    const roles = Array.isArray(user.roles) ? [...user.roles].map(String) : [];
    const access = await signAccess({ sub: String(user._id), roles });
    const nextRefresh = await signRefresh({ sub: String(user._id), ver: Date.now() });
    user.refreshHash = await hashPwd(nextRefresh);
    await user.save();
    setRefreshCookie(res, nextRefresh);
    res.json({ access });
  } catch {
    res.status(401).json({ error: "invalid_refresh" });
  }
});

r.post("/logout", async (req: R, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    try {
      const { payload } = await verifyRefresh(token);
      const user = await User.findById(payload.sub as string);
      if (user) {
        user.refreshHash = undefined;
        await user.save();
      }
    } catch {}
  }
  res.clearCookie("refresh_token", { domain: cfg.cookieDomain, path: "/api/auth" });
  res.json({ ok: true });
});

r.get("/me", async (_req: Request, res: Response) => res.json({ ok: true }));

r.post(
  "/forgot",
  validate(z.object({ body: z.object({ email }) })),
  async (req: R, res: Response) => {
    const { email } = req.data.body;
    const u = await User.findOne({ email });
    if (!u) return res.json({ ok: true });
    const raw = crypto.randomBytes(32).toString("hex");
    const exp = new Date(Date.now() + 1000 * 60 * 30);
    u.resetTokenHash = await hashPwd(raw);
    u.resetTokenExp = exp;
    await u.save();
    const url = `${cfg.appUrl}/api/auth/reset/${raw}`;
    await sendEmail({ to: email, subject: "Reset Password", text: url });
    res.json({ ok: true });
  }
);

r.post(
  "/reset/:token",
  validate(z.object({ body: z.object({ password: pwd }), params: z.object({ token: z.string().min(10) }) })),
  async (req: R, res: Response) => {
    const { token } = req.data.params;
    const { password } = req.data.body;
    const users = await User.find({ resetTokenExp: { $gt: new Date() } });
    let target: any = null;
    for (const u of users) {
      if (await cmpPwd(token, u.resetTokenHash || "")) {
        target = u;
        break;
      }
    }
    if (!target) return res.status(400).json({ error: "invalid_or_expired" });
    target.password = await hashPwd(password);
    target.resetTokenHash = undefined;
    target.resetTokenExp = undefined;
    await target.save();
    res.json({ ok: true });
  }
);

export default r;
