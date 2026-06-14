import { requireApiUser } from "@/lib/app/authz";
import { numberFromForm, splitList, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { upsertUserPreference } from "@/lib/app/settings";

export async function POST(request: Request) {
  const user = await requireApiUser();
  const form = await request.formData();
  try {
    await upsertUserPreference(user.id, {
      categories: splitList(form.get("categories")),
      includeKeywords: splitList(form.get("includeKeywords")),
      excludeKeywords: splitList(form.get("excludeKeywords")),
      topN: numberFromForm(form.get("topN"), 5),
      sendTime: stringFromForm(form.get("sendTime"), "09:00"),
      timezone: stringFromForm(form.get("timezone"), "Asia/Shanghai"),
      summaryFocus: stringFromForm(form.get("summaryFocus"))
    });
    return redirectToApp("/settings?saved=preferences", request);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save preferences" }, { status: 400 });
  }
}
