import nodemailer from "nodemailer";

export type AuthEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function hasAuthSmtpConfig(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM);
}

export async function sendAuthEmail(input: AuthEmailInput) {
  if (!hasAuthSmtpConfig()) {
    throw new Error("Auth SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      : undefined
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}
