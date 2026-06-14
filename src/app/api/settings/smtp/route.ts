import { requireApiUser } from "@/lib/app/authz";
import { booleanFromForm, numberFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { upsertUserSmtpConfig } from "@/lib/app/settings";

export async function POST(request: Request) {
  const user = await requireApiUser();
  const form = await request.formData();
  try {
    await upsertUserSmtpConfig(user.id, {
      host: stringFromForm(form.get("host")),
      port: numberFromForm(form.get("port"), 587),
      secure: booleanFromForm(form.get("secure")),
      from: stringFromForm(form.get("from")),
      username: stringFromForm(form.get("username")) || null,
      password: stringFromForm(form.get("password")) || null
    });
    return redirectToApp("/settings?saved=smtp", request);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save SMTP config" }, { status: 400 });
  }
}
