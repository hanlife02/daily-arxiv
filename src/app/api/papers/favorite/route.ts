import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { booleanFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { db } from "@/lib/db";
import { userPaperState } from "@/lib/db/schema";

async function post(request: Request) {
  const user = await requireApiUser();
  const form = await request.formData();
  const paperId = stringFromForm(form.get("paperId"));
  const favorited = booleanFromForm(form.get("favorited"));
  if (!paperId) return Response.json({ ok: false, error: "paperId is required" }, { status: 400 });

  await db
    .insert(userPaperState)
    .values({
      userId: user.id,
      paperId,
      favorited,
      read: false,
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [userPaperState.userId, userPaperState.paperId],
      set: {
        favorited,
        updatedAt: new Date()
      }
    });

  return redirectToApp("/papers", request);
}

export const POST = withApiErrorHandling(post);
