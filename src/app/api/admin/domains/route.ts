import { randomUUID } from "node:crypto";
import { requireApiAdmin } from "@/lib/app/authz";
import { stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { db } from "@/lib/db";
import { allowedEmailDomain } from "@/lib/db/schema";

export async function POST(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();
  const domain = stringFromForm(form.get("domain")).toLowerCase();
  if (!domain || domain.includes("@")) {
    return Response.json({ ok: false, error: "Invalid domain" }, { status: 400 });
  }
  await db
    .insert(allowedEmailDomain)
    .values({
      id: randomUUID(),
      domain,
      enabled: true
    })
    .onConflictDoUpdate({
      target: allowedEmailDomain.domain,
      set: { enabled: true }
    });
  return redirectToApp("/admin?saved=domain", request);
}
