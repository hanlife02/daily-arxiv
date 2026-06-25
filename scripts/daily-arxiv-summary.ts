import { DailySummaryCliError, runDailySummaryCli } from "@/lib/daily/summary";

async function main(): Promise<void> {
  const markdown = await runDailySummaryCli(process.argv.slice(2), process.env);
  process.stdout.write(markdown);
}

main().catch((error: unknown) => {
  // no-excuse-ok: catch
  if (error instanceof DailySummaryCliError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  throw error;
});
