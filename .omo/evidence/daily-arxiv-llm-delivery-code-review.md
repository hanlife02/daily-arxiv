# daily-arxiv arXiv+LLM Delivery Code Review

## Verdict

- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- reviewer role: code quality reviewer, read-only
- scope: `/Users/hanlife02/code/daily-arxiv` current worktree
- report date: 2026-06-24

## Skill-Perspective Check

- `remove-ai-slops`: ran by loading `/Users/hanlife02/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`.
- `programming`: ran by loading `/Users/hanlife02/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md` plus TypeScript references for README, strict tsconfig, data modeling, and error handling.
- remove-ai-slops result: no deletion-only tests, no tautological requested-removal tests, and the new CLI happy-path test exercises the actual `pnpm daily:summary` surface with a fixture and output file. The diff does not violate this lens on test shape.
- programming result: violated at the CLI boundary. User input is not parsed strictly into a valid typed option set before internal report generation, producing both silent coercion and an uncaught internal `RangeError`.

## Findings

### CRITICAL

None.

### HIGH

1. Invalid CLI option values are not parsed safely at the command boundary, causing silent coercion and an internal crash.
   - File: `/Users/hanlife02/code/daily-arxiv/src/lib/daily/summary.ts:159`
   - File: `/Users/hanlife02/code/daily-arxiv/src/lib/daily/summary.ts:167`
   - File: `/Users/hanlife02/code/daily-arxiv/src/lib/daily/summary.ts:95`
   - File: `/Users/hanlife02/code/daily-arxiv/src/lib/reports/markdown.ts:39`
   - `parsePositiveInteger()` uses `Number.parseInt`, so `--limit 1abc` is accepted as `1` and the command succeeds. Fresh command: `pnpm daily:summary -- --fixture tests/fixtures/arxiv-feed.xml --mock-llm --limit 1abc --batch-date 2026-06-24` exited `0` and generated a report.
   - `parseBatchDate()` only checks `YYYY-MM-DD` shape. `--batch-date 2026-99-99` reaches `new Date(...)`, then `renderDailyReportMarkdown()` throws `RangeError: Invalid time value` with an internal stack trace. Fresh command: `pnpm daily:summary -- --fixture tests/fixtures/arxiv-feed.xml --mock-llm --limit 1 --batch-date 2026-99-99` exited `1` via uncaught `RangeError`, not `DailySummaryCliError`.
   - This is a blocker because the requested review explicitly called out CLI arg parsing and LLM/fixture proof. The command surface must reject malformed values deterministically with a CLI error, not silently change the user's requested limit or leak an internal stack trace.

### MEDIUM

None.

### LOW

1. The project `tsconfig.json` has `"strict": true`, and `pnpm typecheck` passes, but it does not enable several TypeScript hardening flags from the loaded programming perspective: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`, and `noPropertyAccessFromIndexSignature`.
   - File: `/Users/hanlife02/code/daily-arxiv/tsconfig.json:2`
   - Not a blocker for this focused CLI delivery because the fresh typecheck and LSP diagnostics for the changed TypeScript files were clean, but it weakens the "strictness" claim.

## Evidence Reviewed

- Worktree status: all restored app files are untracked relative to empty `HEAD` `c44b2c8`, consistent with the handoff.
- Restored app comparison: temporary tree diff against `965a177` showed restored files match that commit, with intentional differences limited to `package.json` adding `daily:summary`, new `scripts/daily-arxiv-summary.ts`, new `src/lib/daily/summary.ts`, and new daily-summary test fixture files.
- Existing evidence inspected:
  - `.omo/ulw-loop/evidence/daily-summary.md`
  - `.omo/ulw-loop/evidence/daily-summary-cli.log`
  - `.omo/ulw-loop/evidence/daily-summary-missing-llm.log`
  - `.omo/ulw-loop/evidence/quality.log`
  - `.omo/evidence/daily-summary-cli/test.log`
  - `.omo/evidence/daily-summary-cli/typecheck.log`
  - `.omo/evidence/daily-summary-cli/cli.log`
- Fresh verification run by reviewer:
  - `pnpm exec vitest run tests/daily-summary.test.ts` passed: 1 file, 1 test.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 24 files, 135 tests.
  - `DATABASE_URL=postgresql://daily_arxiv:daily_arxiv@localhost:5432/daily_arxiv REDIS_URL=redis://localhost:6379 BETTER_AUTH_SECRET=review-secret-review-secret-review-secret FIELD_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef pnpm quality` passed typecheck, tests, and production build; Docker smoke was explicitly skipped by the quality script.
  - Fixture + mock LLM happy path passed and wrote `/private/tmp/daily-arxiv-review-summary.md`.
  - Missing LLM config edge path exited `1` with the expected guidance.
  - Live arXiv fetch with mock LLM passed: `pnpm daily:summary -- --category cs.CL --limit 1 --mock-llm --batch-date 2026-06-24 --output /private/tmp/daily-arxiv-review-live.md`.
  - LSP status showed TypeScript LSP missing, but `mcp__lsp.diagnostics` reported no diagnostics for `src/lib/daily/summary.ts`, `scripts/daily-arxiv-summary.ts`, or `tests/daily-summary.test.ts`; `tsc --noEmit` also passed.

## Scope and Maintainability Notes

- The new CLI reuses existing arXiv parsing, scoring, report rendering, and LLM summary generation seams instead of duplicating the worker/web pipeline. Scope is otherwise controlled.
- `tests/daily-summary.test.ts` is valuable because it drives the real CLI through `pnpm daily:summary`, uses an arXiv XML fixture, writes an output file, and asserts user-visible markdown. It is not a tautological mock-only unit test.
- The missing tests are specifically for invalid CLI inputs, which is where the blocker was found.

## Blockers

1. Fix CLI boundary parsing so malformed `--limit` values such as `1abc`/`1.5` are rejected with `DailySummaryCliError` instead of accepted via `parseInt`.
2. Fix `--batch-date` parsing so impossible dates such as `2026-99-99` are rejected with `DailySummaryCliError` before report generation, without leaking a `RangeError` stack trace.
3. Add focused tests or CLI evidence for those invalid-input paths.
