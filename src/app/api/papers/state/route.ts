import { eq, and, inArray } from "drizzle-orm";
import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { applyPaperStatePatch, hasPaperStatePatch, normalizePaperIds, normalizePaperStatePatch } from "@/lib/app/paper-state";
import { db } from "@/lib/db";
import { userPaperState } from "@/lib/db/schema";

type PaperStateBody = {
  paperId?: string;
  paperIds?: string[];
  favorited?: boolean;
  read?: boolean;
  ignored?: boolean;
};

async function post(request: Request) {
  const user = await requireApiUser();
  let body: PaperStateBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const paperIds = normalizePaperIds(body.paperIds ?? body.paperId);
  if (paperIds.length === 0) {
    return Response.json({ ok: false, error: "paperId or paperIds is required" }, { status: 400 });
  }

  const patch = normalizePaperStatePatch(body);
  if (!hasPaperStatePatch(patch)) {
    return Response.json({ ok: false, error: "At least one state field is required" }, { status: 400 });
  }

  const existingRows = await db.query.userPaperState.findMany({
    where: and(eq(userPaperState.userId, user.id), inArray(userPaperState.paperId, paperIds))
  });
  const existingByPaperId = new Map(existingRows.map((row) => [row.paperId, row]));
  const updatedAt = new Date();
  const values = paperIds.map((paperId) => ({
    userId: user.id,
    paperId,
    ...applyPaperStatePatch(existingByPaperId.get(paperId), patch),
    updatedAt
  }));

  for (const value of values) {
    await db
      .insert(userPaperState)
      .values(value)
      .onConflictDoUpdate({
        target: [userPaperState.userId, userPaperState.paperId],
        set: {
          favorited: value.favorited,
          read: value.read,
          ignored: value.ignored,
          updatedAt: value.updatedAt
        }
      });
  }

  return Response.json({ ok: true, count: values.length, states: values });
}

export const POST = withApiErrorHandling(post);
