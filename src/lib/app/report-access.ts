import { and, eq } from "drizzle-orm";
import { report } from "@/lib/db/schema";

export type ReportAccessRow = {
  id: string;
  userId: string;
};

export function canReadReport(currentReport: ReportAccessRow | null | undefined, userId: string) {
  return currentReport?.userId === userId;
}

export function userReportWhere(reportId: string, userId: string) {
  return and(eq(report.id, reportId), eq(report.userId, userId));
}
