export const runtime = "nodejs";

export function GET() {
  return Response.json({
    ok: true,
    service: "daily-arxiv",
    status: "alive",
    time: new Date().toISOString()
  });
}
