import nodemailer from "nodemailer";
import { normalizeSmtpConfig } from "@/lib/email/smtp-config";

export type AuthEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type AuthSmtpEnv = {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_FROM?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
};

export function getAuthSmtpConfig(env: AuthSmtpEnv = process.env as AuthSmtpEnv) {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) return null;

  const port = Number(env.SMTP_PORT);
  return normalizeSmtpConfig({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE === "true",
    from: env.SMTP_FROM,
    username: env.SMTP_USER || null,
    password: env.SMTP_PASSWORD || null
  });
}

export function hasAuthSmtpConfig(env: AuthSmtpEnv = process.env as AuthSmtpEnv) {
  try {
    return Boolean(getAuthSmtpConfig(env));
  } catch {
    return false;
  }
}

export async function sendAuthEmail(input: AuthEmailInput) {
  const config = getAuthSmtpConfig();
  if (!config) {
    throw new Error("Auth SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username
      ? {
          user: config.username,
          pass: config.password ?? undefined
        }
      : undefined
  });

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}
