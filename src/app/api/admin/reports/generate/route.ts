import { randomUUID } from "node:crypto";
import { requireApiAdmin } from "@/lib/app/authz";
import { redirectToApp } from "@/lib/app/http";
import { defaultBatchDate, generateAndStoreDailyReport, generateReportsForAllUsers } from "@/lib/app/reports";
import { stringFromForm } from "@/lib/app/forms";
import { db } from "@/lib/db";
import { jobLog } from "@/lib/db/schema";

export async function POST(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();
  const batchDate = stringFromForm(form.get("batchDate"), defaultBatchDate());
  const userId = stringFromForm(form.get("userId"));

  try {
    const result = userId
      ? await generateAndStoreDailyReport(userId, batchDate)
      : await generateReportsForAllUsers(batchDate);
    await db.insert(jobLog).values({
      id: randomUUID(),
      type: "report-generation",
      status: "succeeded",
      message: userId ? `Generated report for ${userId}` : "Generated reports for all users",
      metadata: { batchDate, result }
    });
    return redirectToApp("/admin?job=reports", request);
  } catch (error) {
    await db.insert(jobLog).values({
      id: randomUUID(),
      type: "report-generation",
      status: "failed",
      message: error instanceof Error ? error.message : "Report generation failed",
      metadata: { batchDate, userId }
    });
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Report generation failed" }, { status: 500 });
  }
}
