import { eq } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

function optionalLimitFromForm(value: FormDataEntryValue | null, label: string) {
  const raw = stringFromForm(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
  return Math.max(0, Math.floor(parsed));
}

async function post(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();
  const userId = stringFromForm(form.get("userId"));
  if (!userId) return redirectToApp("/admin?error=userId%20is%20required", request);

  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) return redirectToApp("/admin?error=User%20not%20found", request);

  try {
    await db
      .update(user)
      .set({
        manualLlmCallsPerUserPerDayOverride: optionalLimitFromForm(form.get("manualLlmCallsPerUserPerDayOverride"), "Daily AI read limit"),
        concurrentManualLlmCallsPerUserOverride: optionalLimitFromForm(form.get("concurrentManualLlmCallsPerUserOverride"), "Concurrent AI read limit"),
        updatedAt: new Date()
      })
      .where(eq(user.id, userId));
    return redirectToApp("/admin?saved=user", request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user limits";
    return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
  }
}

export const POST = withApiErrorHandling(post);
