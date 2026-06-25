import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getAllowedRegistrationDomains } from "@/lib/app/registration";
import { sendAuthEmail } from "@/lib/email/auth";
import { isEmailAllowed } from "@/lib/users/registration";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  rateLimit: {
    enabled: process.env.BETTER_AUTH_RATE_LIMIT_ENABLED === "false" ? false : undefined
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "验证 daily-arxiv 邮箱",
        text: `请打开以下链接完成邮箱验证：${url}`,
        html: `<p>请打开以下链接完成邮箱验证：</p><p><a href="${url}">${url}</a></p>`
      });
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = typeof user.email === "string" ? user.email : "";
          const allowedDomains = await getAllowedRegistrationDomains();
          if (!isEmailAllowed(email, allowedDomains)) {
            throw new APIError("FORBIDDEN", {
              message: "该邮箱后缀不允许注册"
            });
          }
        }
      }
    }
  },
  plugins: [nextCookies()]
});
