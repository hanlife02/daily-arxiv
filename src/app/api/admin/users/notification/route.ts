import { eq } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { booleanFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export async function POST(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();
  const userId = stringFromForm(form.get("userId"));
  if (!userId) return Response.json({ ok: false, error: "userId is required" }, { status: 400 });
  await db
    .update(user)
    .set({
      notificationDisabled: booleanFromForm(form.get("notificationDisabled")),
      updatedAt: new Date()
    })
    .where(eq(user.id, userId));
  return redirectToApp("/admin?saved=user", request);
}
