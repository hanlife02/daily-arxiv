import { and, eq, sql } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { booleanFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

async function activeAdminCount() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.disabled, false)));
  return row?.count ?? 0;
}

async function post(request: Request) {
  const currentUser = await requireApiAdmin();
  const form = await request.formData();
  const userId = stringFromForm(form.get("userId"));
  const disabled = booleanFromForm(form.get("disabled"));
  if (!userId) return redirectToApp("/admin?error=userId%20is%20required", request);

  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) return redirectToApp("/admin?error=User%20not%20found", request);

  if (disabled && target.id === currentUser.id) {
    return redirectToApp("/admin?error=Cannot%20disable%20your%20own%20account", request);
  }

  if (disabled && target.role === "admin" && (await activeAdminCount()) <= 1) {
    return redirectToApp("/admin?error=Cannot%20disable%20the%20last%20active%20admin", request);
  }

  await db
    .update(user)
    .set({
      disabled,
      updatedAt: new Date()
    })
    .where(eq(user.id, userId));

  return redirectToApp("/admin?saved=user", request);
}

export const POST = withApiErrorHandling(post);
