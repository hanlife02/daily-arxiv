import { requireApiAdmin } from "@/lib/app/authz";
import { booleanFromForm, numberFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { upsertAdminNotificationSmtp, upsertAdminSettings } from "@/lib/app/settings";

export async function POST(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();
  try {
    await upsertAdminSettings({
      notificationFallbackEnabled: booleanFromForm(form.get("notificationFallbackEnabled")),
      dailyEmailLimit: numberFromForm(form.get("dailyEmailLimit"), 10),
      emailRetryCount: numberFromForm(form.get("emailRetryCount"), 2),
      arxivMaxResultsPerCategory: numberFromForm(form.get("arxivMaxResultsPerCategory"), 100)
    });

    const smtpHost = stringFromForm(form.get("smtpHost"));
    const smtpFrom = stringFromForm(form.get("smtpFrom"));
    if (smtpHost && smtpFrom) {
      await upsertAdminNotificationSmtp({
        enabled: booleanFromForm(form.get("smtpEnabled")),
        host: smtpHost,
        port: numberFromForm(form.get("smtpPort"), 587),
        secure: booleanFromForm(form.get("smtpSecure")),
        from: smtpFrom,
        username: stringFromForm(form.get("smtpUsername")) || null,
        password: stringFromForm(form.get("smtpPassword")) || null
      });
    }

    return redirectToApp("/admin?saved=settings", request);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save admin settings" }, { status: 400 });
  }
}
