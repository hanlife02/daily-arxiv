import { eq } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { booleanFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

async function post(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();
  const userId = stringFromForm(form.get("userId"));
  if (!userId) return redirectToApp("/admin?error=userId%20is%20required", request);
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) return redirectToApp("/admin?error=User%20not%20found", request);
  await db
    .update(user)
    .set({
      notificationDisabled: booleanFromForm(form.get("notificationDisabled")),
      updatedAt: new Date()
    })
    .where(eq(user.id, userId));
  return redirectToApp("/admin?saved=user", request);
}

export const POST = withApiErrorHandling(post);
