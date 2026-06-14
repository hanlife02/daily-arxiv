import { requireApiUser } from "@/lib/app/authz";
import { stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { upsertUserLlmConfig } from "@/lib/app/settings";

export async function POST(request: Request) {
  const user = await requireApiUser();
  const form = await request.formData();
  try {
    await upsertUserLlmConfig(user.id, {
      baseUrl: stringFromForm(form.get("baseUrl")),
      apiKey: stringFromForm(form.get("apiKey")),
      model: stringFromForm(form.get("model"))
    });
    return redirectToApp("/settings?saved=llm", request);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save LLM config" }, { status: 400 });
  }
}
