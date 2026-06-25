# daily arXiv Latest Retrieval + LLM Summaries

## TL;DR
> Summary:      Restore the prior TypeScript/Next daily-arxiv app from commit `965a177`, then add focused proof surfaces for latest arXiv retrieval and OpenAI-compatible LLM summaries without inventing a new architecture.
> Deliverables:
> - Restored Next/BullMQ/Postgres/Redis app, schema, scripts, tests, and docs from `965a177`.
> - Verified arXiv latest-paper retrieval using `https://export.arxiv.org/api/query?search_query=cat:<category>&sortBy=submittedDate&sortOrder=descending`.
> - Verified LLM summary path with structured schema validation, JSON-mode fallback for compatible providers, and mock/live QA evidence.
> - Focused CLI/manual QA scripts plus HTTP/Docker smoke evidence for daily fetch and read-summary behavior.
> Effort:       Large
> Risk:         Medium - the current `HEAD` tree is empty while many prior app files exist as untracked files; workers must preserve `.omo/` and compare/restoring from `965a177` deliberately.

## Scope
### Must have
- Restore the prior app implementation from commit `965a177` as the baseline instead of redesigning the product.
- Preserve `.omo/` artifacts and any user-created untracked work; do not overwrite without comparing to `965a177`.
- Keep the TypeScript/Next/BullMQ/Postgres/Redis stack and existing OpenAI-compatible Chat Completions integration.
- Prove latest arXiv retrieval at the library, CLI, API, and Docker/HTTP smoke levels.
- Prove LLM summaries at the schema/parser, provider-call, read-summary API, and manual CLI/HTTP evidence levels.
- Include failing-first evidence before each new implementation task: capture the missing test/script/behavior failing, then implement and rerun.
- Run typecheck, unit tests, build, Docker smoke, and real-surface CLI/HTTP QA with evidence files under `.omo/evidence/`.
- Keep commits disabled unless the user later explicitly asks for commits.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not start a new architecture, switch frameworks, replace Next.js, replace BullMQ, or move to a different database.
- Do not globally migrate all LLM code to the Responses API; keep Chat Completions compatibility and add only focused structured-output support/fallback where it directly improves summaries.
- Do not remove existing auth, admin, settings, reports, browser smoke, Docker smoke, restore, or ops scripts restored from `965a177`.
- Do not call real OpenAI or another live paid LLM in default tests; live-provider checks must be opt-in via environment variables.
- Do not make live arXiv calls part of the default `pnpm quality`; keep them in explicit manual/smoke commands because network availability is external.
- Do not commit, push, rebase, reset, or clean untracked files unless the user explicitly asks.
- Do not write evidence outside `.omo/evidence/` except existing project smoke outputs under `data/ops/` when those scripts already do so.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Vitest for unit/integration seams, shell/Node scripts for CLI and Docker/HTTP smoke, Playwright real Chrome for browser read-flow confirmation.
- QA policy: every task has agent-executed scenarios and must capture both failing-first evidence and passing evidence.
- Evidence: `.omo/evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Restore project skeleton, dependency manifest, and build/tooling files.
- Task 2: Restore database schema, migrations, and settings/security foundations.
- Task 3: Restore arXiv, LLM, report-generation, and read-domain libraries.
- Task 4: Restore Next.js app/API/worker surfaces.
- Task 5: Restore scripts, tests, README, Docker, and operational docs.

Wave 2 (after Wave 1):
- Task 6: Add latest arXiv retrieval failing-first coverage and hardening; depends [1, 3, 5].
- Task 7: Add structured LLM summary schema/fallback coverage and implementation; depends [1, 3, 5].
- Task 8: Add focused latest-paper CLI/manual QA surface; depends [1, 3, 5, 6].
- Task 9: Add focused LLM summary CLI/manual QA surface; depends [1, 3, 5, 7, 8].
- Task 10: Lock daily crawl -> report -> summary scheduling behavior; depends [1, 2, 3, 4, 5, 6, 7].

Wave 3 (after Wave 2):
- Task 11: Add HTTP/Docker smoke evidence for live/latest crawl and mock read-summary; depends [2, 3, 4, 5, 8, 9, 10].
- Task 12: Add browser real-Chrome read-flow evidence; depends [4, 7, 9, 11].
- Task 13: Update operator docs and env examples for daily latest retrieval plus LLM summaries; depends [8, 9, 11].
- Task 14: Run full quality and evidence gate; depends [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].

Critical path: Task 1 -> Task 3 -> Task 6 -> Task 8 -> Task 9 -> Task 11 -> Task 14

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1 | none | 6, 7, 8, 9, 10, 14 | 2, 3, 4, 5 |
| 2 | none | 10, 11, 14 | 1, 3, 4, 5 |
| 3 | none | 6, 7, 8, 9, 10, 11, 14 | 1, 2, 4, 5 |
| 4 | none | 10, 11, 12, 14 | 1, 2, 3, 5 |
| 5 | none | 6, 7, 8, 9, 10, 11, 13, 14 | 1, 2, 3, 4 |
| 6 | 1, 3, 5 | 8, 10, 14 | 7 |
| 7 | 1, 3, 5 | 9, 10, 12, 14 | 6, 8 after 6 |
| 8 | 1, 3, 5, 6 | 9, 11, 13, 14 | 7, 10 after 6 |
| 9 | 1, 3, 5, 7, 8 | 11, 12, 13, 14 | 10 |
| 10 | 1, 2, 3, 4, 5, 6, 7 | 11, 14 | 8, 9 after 7 |
| 11 | 2, 3, 4, 5, 8, 9, 10 | 12, 13, 14 | none |
| 12 | 4, 7, 9, 11 | 14 | 13 |
| 13 | 8, 9, 11 | 14 | 12 |
| 14 | 1-13 | final verification | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Restore project skeleton, dependency manifest, and build/tooling files

  What to do: Restore the non-domain project skeleton from commit `965a177` while preserving `.omo/`. Files include `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `.dockerignore`, `Dockerfile`, and `.claude/settings.local.json` if still intended by the restored app. First capture the current empty-HEAD/deleted baseline as failing proof, then restore these paths from `965a177` using a path-scoped restore or equivalent compare-copy workflow.
  Must NOT do: Do not run `git reset`, do not delete untracked files, do not restore `.omo/`, and do not modify domain code in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [6, 7, 8, 9, 10, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:6` - existing app script registration starts here; preserve script names and semantics.
  - Pattern:  `package.json:27` - typecheck/test/build/worker commands that all later QA depends on.
  - Pattern:  `package.json:34` - dependencies include Next, Drizzle, BullMQ, `fast-xml-parser`, `undici`, and `zod`.
  - Pattern:  `README.md:7` - local setup assumes `pnpm install`, `.env`, Docker Postgres/Redis, `pnpm db:push`, and `pnpm dev`.
  - External: `git show --stat --oneline c44b2c8` - shows commit `c44b2c8 clear` deleted 197 prior app files.
  - External: `git ls-tree -r --name-only 965a177` - source of truth for the prior full implementation file list.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists: `bash -lc 'git diff --name-status 965a177..HEAD -- package.json pnpm-lock.yaml tsconfig.json vitest.config.ts next.config.ts Dockerfile > .omo/evidence/task-1-restore-skeleton-fail.diff && test -s .omo/evidence/task-1-restore-skeleton-fail.diff'`
  - [ ] Restored files match `965a177`: `node -e 'const {execFileSync}=require("node:child_process"); const files=["package.json","pnpm-lock.yaml","tsconfig.json","vitest.config.ts","next.config.ts","next-env.d.ts","postcss.config.mjs","tailwind.config.ts",".gitignore",".dockerignore","Dockerfile"]; for (const f of files){const a=execFileSync("git",["show",`965a177:${f}`]); const b=require("node:fs").readFileSync(f); if(!a.equals(b)){throw new Error(`${f} diverges from 965a177`)}}'`
  - [ ] Package scripts are visible: `node -e 'const p=require("./package.json"); for (const s of ["quality","typecheck","test","build","worker"]){ if(!p.scripts?.[s]) throw new Error(`missing script ${s}`)}'`

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: skeleton restore proof
    Tool:     bash
    Steps:    bash -lc 'node -e "const p=require(\"./package.json\"); console.log(JSON.stringify({name:p.name, scripts:Object.keys(p.scripts).sort()}))" > .omo/evidence/task-1-restore-skeleton.json'
    Expected: .omo/evidence/task-1-restore-skeleton.json contains "daily-arxiv" and the scripts "quality","typecheck","test","build","worker".
    Evidence: .omo/evidence/task-1-restore-skeleton.json

  Scenario: guard against accidental .omo restore
    Tool:     bash
    Steps:    bash -lc 'git ls-tree -r --name-only 965a177 -- .omo > .omo/evidence/task-1-restore-skeleton-error.txt; test ! -s .omo/evidence/task-1-restore-skeleton-error.txt'
    Expected: command exits 0 because commit 965a177 has no .omo paths to restore.
    Evidence: .omo/evidence/task-1-restore-skeleton-error.txt
  ```

  Commit: NO | Message: `chore(restore): restore project skeleton from prior app` | Files: [`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `.dockerignore`, `Dockerfile`, `.claude/settings.local.json`]

- [ ] 2. Restore database schema, migrations, and settings/security foundations

  What to do: Restore Drizzle config, migrations, schema, DB connection, encrypted settings, limits, auth server, bootstrap, and security helpers from `965a177`. Capture the deletion diff before restoring. Keep this task focused on data/security foundations needed by crawl, LLM config, reports, and read summaries.
  Must NOT do: Do not edit API routes, UI pages, scripts, or tests in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [10, 11, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - API/Type: `src/lib/db/schema.ts:96` - `userPreference` stores subscribed arXiv categories, ranking preferences, and `summaryFocus`.
  - API/Type: `src/lib/db/schema.ts:112` - `userLlmConfig` stores provider base URL, encrypted key, and model.
  - API/Type: `src/lib/db/schema.ts:150` - `adminSetting` stores `arxivMaxResultsPerCategory` and manual LLM limits.
  - API/Type: `src/lib/db/schema.ts:169` - `paper` stores arXiv metadata, categories, `pdfUrl`, publication dates, and cached PDF text.
  - API/Type: `src/lib/db/schema.ts:244` - `paperSummary` stores user-scoped summary output and prompt version.
  - API/Type: `src/lib/db/schema.ts:301` - `llmCallLog` records endpoint/model/status/token usage and `usedPdfText`.
  - Pattern:  `src/lib/app/settings.ts:13` - `getDecryptedLlmConfig()` returns `LlmConfig`.
  - Pattern:  `src/lib/app/settings.ts:78` - `upsertUserLlmConfig()` normalizes base URL and encrypts API keys.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists: `bash -lc 'git diff --name-status 965a177..HEAD -- drizzle.config.ts drizzle src/lib/db src/lib/security src/lib/settings src/lib/auth src/lib/app/settings.ts > .omo/evidence/task-2-restore-db-fail.diff && test -s .omo/evidence/task-2-restore-db-fail.diff'`
  - [ ] Restored schema contains required tables: `bash -lc 'for token in "export const paper" "export const paperSummary" "export const llmCallLog" "export const userLlmConfig"; do grep -F "$token" src/lib/db/schema.ts >/dev/null; done'`
  - [ ] Migrations are present: `bash -lc 'test -f drizzle/0000_conscious_landau.sql && test -f drizzle/0005_llm_usage_tokens.sql && test -f drizzle/meta/_journal.json'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: schema/table contract check
    Tool:     bash
    Steps:    bash -lc 'node -e "const fs=require(\"fs\"); const s=fs.readFileSync(\"src/lib/db/schema.ts\",\"utf8\"); const required=[\"paper = pgTable\",\"paperSummary = pgTable\",\"llmCallLog = pgTable\",\"userLlmConfig = pgTable\",\"adminSetting = pgTable\"]; for (const r of required){ if(!s.includes(r)) throw new Error(r)} console.log(required.join(\"\\n\"))" > .omo/evidence/task-2-restore-db.txt'
    Expected: evidence lists all required table declarations and command exits 0.
    Evidence: .omo/evidence/task-2-restore-db.txt

  Scenario: missing table negative check
    Tool:     bash
    Steps:    bash -lc 'node -e "const fs=require(\"fs\"); const s=fs.readFileSync(\"src/lib/db/schema.ts\",\"utf8\"); if(!s.includes(\"llmCallLog = pgTable\")){process.exit(0)} throw new Error(\"negative guard intentionally found restored llmCallLog\")" > .omo/evidence/task-2-restore-db-error.txt 2>&1 || true; grep -F "negative guard intentionally found restored llmCallLog" .omo/evidence/task-2-restore-db-error.txt >/dev/null'
    Expected: evidence proves the negative guard would fail once `llmCallLog` is restored, so later tests are checking the restored table.
    Evidence: .omo/evidence/task-2-restore-db-error.txt
  ```

  Commit: NO | Message: `chore(restore): restore database and settings foundations` | Files: [`drizzle.config.ts`, `drizzle/**`, `src/lib/db/**`, `src/lib/security/**`, `src/lib/settings/**`, `src/lib/auth/**`, `src/lib/app/settings.ts`, `src/lib/app/bootstrap.ts`]

- [ ] 3. Restore arXiv, LLM, report-generation, and read-domain libraries

  What to do: Restore the core domain libraries from `965a177`: arXiv client/categories/filter/id/types/S2, paper app helpers, LLM Chat Completions/streaming/schema/usage/failure helpers, PDF loader, read transcript, reports generation/markdown/scoring/batch/status helpers. Capture deletion diff before restoring.
  Must NOT do: Do not add new CLI scripts, app routes, UI, DB migrations, or Docker changes in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [6, 7, 8, 9, 10, 11, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/lib/arxiv/client.ts:34` - `fetchArxivCategory()` builds `https://export.arxiv.org/api/query`.
  - Pattern:  `src/lib/arxiv/client.ts:36` - query parameter `search_query=cat:<category>`.
  - Pattern:  `src/lib/arxiv/client.ts:37` - `sortBy=submittedDate`.
  - Pattern:  `src/lib/arxiv/client.ts:38` - `sortOrder=descending`.
  - Pattern:  `src/lib/arxiv/client.ts:55` - `parseArxivFeed()` parses Atom XML into `PaperRecord`.
  - Pattern:  `src/lib/app/papers.ts:75` - `crawlSubscribedCategories()` fetches subscribed categories, filters new submissions, and upserts papers.
  - Pattern:  `src/lib/llm/chat-completions.ts:19` - summary prompt construction from arXiv metadata.
  - Pattern:  `src/lib/llm/chat-completions.ts:36` - Chat Completions summary request and result wrapper.
  - Pattern:  `src/lib/llm/schema.ts:3` - Zod schema for required summary fields.
  - Pattern:  `src/lib/reports/generate.ts:25` - report generation selects papers and summarizes them.
  - External: `https://info.arxiv.org/help/api/user-manual.html` - official arXiv API manual for query parameters and Atom results.
  - External: `https://developers.openai.com/api/docs/guides/structured-outputs` - OpenAI recommends Structured Outputs where supported and JSON validation/fallback for JSON mode.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists: `bash -lc 'git diff --name-status 965a177..HEAD -- src/lib/arxiv src/lib/llm src/lib/reports src/lib/read src/lib/app/papers.ts src/lib/app/pdf.ts > .omo/evidence/task-3-restore-domain-fail.diff && test -s .omo/evidence/task-3-restore-domain-fail.diff'`
  - [ ] Restored arXiv client contains the required API parameters: `bash -lc 'grep -F "https://export.arxiv.org/api/query" src/lib/arxiv/client.ts && grep -F "search_query" src/lib/arxiv/client.ts && grep -F "submittedDate" src/lib/arxiv/client.ts && grep -F "descending" src/lib/arxiv/client.ts'`
  - [ ] Restored LLM schema validates required summary fields: `bash -lc 'grep -F "paperSummarySchema" src/lib/llm/schema.ts && grep -F "one_sentence_summary_zh" src/lib/llm/schema.ts'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: domain restore contract
    Tool:     bash
    Steps:    bash -lc 'node -e "const fs=require(\"fs\"); const checks=[[\"src/lib/arxiv/client.ts\",\"sortBy\"],[\"src/lib/llm/chat-completions.ts\",\"response_format\"],[\"src/lib/reports/generate.ts\",\"generateDailyReport\"],[\"src/lib/app/papers.ts\",\"crawlSubscribedCategories\"]]; for (const [file, token] of checks){ if(!fs.readFileSync(file,\"utf8\").includes(token)) throw new Error(`${file} missing ${token}`)} console.log(JSON.stringify(checks))" > .omo/evidence/task-3-restore-domain.json'
    Expected: evidence JSON lists all domain files/tokens and command exits 0.
    Evidence: .omo/evidence/task-3-restore-domain.json

  Scenario: arXiv parse failure guard
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- --runInBand tests/arxiv.test.ts > .omo/evidence/task-3-restore-domain-error.log 2>&1 || true; grep -E "(No test files found|Cannot find package|failed)" .omo/evidence/task-3-restore-domain-error.log >/dev/null || true'
    Expected: before dependencies/tests are fully restored this may fail; the captured log becomes the task's negative baseline for later quality gates.
    Evidence: .omo/evidence/task-3-restore-domain-error.log
  ```

  Commit: NO | Message: `chore(restore): restore arxiv llm and report domain libraries` | Files: [`src/lib/arxiv/**`, `src/lib/llm/**`, `src/lib/reports/**`, `src/lib/read/**`, `src/lib/app/papers.ts`, `src/lib/app/paper-categories.ts`, `src/lib/app/pdf.ts`]

- [ ] 4. Restore Next.js app/API/worker surfaces

  What to do: Restore all app routes, API routes, components, UI primitives, global styles, instrumentation, sidebar/theme components, and worker entry/scheduler from `965a177`. Capture deletion diff before restoring. Keep behavior consistent with prior app.
  Must NOT do: Do not change DB schema, core domain libraries, scripts, tests, or docs in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [10, 11, 12, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/api/papers/crawl/route.ts:6` - authenticated manual crawl endpoint.
  - Pattern:  `src/app/api/papers/crawl/route.ts:10` - endpoint calls `crawlSubscribedCategories(settings.arxivMaxResultsPerCategory)`.
  - Pattern:  `src/app/api/read/summary/route.ts:27` - read-summary POST handler parses JSON body.
  - Pattern:  `src/app/api/read/summary/route.ts:38` - `paperId` is required.
  - Pattern:  `src/app/api/read/summary/route.ts:66` - requires stored user LLM config.
  - Pattern:  `src/app/api/read/summary/route.ts:76` - loads PDF text and falls back to abstract.
  - Pattern:  `src/app/api/read/summary/route.ts:112` - streams Chat Completions response.
  - Pattern:  `src/worker/scheduler.ts:84` - scheduler tick enqueues due crawl/report/backup/retention jobs.
  - Pattern:  `src/worker/scheduler.ts:94` - crawl job is due based on `ARXIV_CRAWL_INTERVAL_MS`.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists: `bash -lc 'git diff --name-status 965a177..HEAD -- src/app src/components src/worker src/instrumentation.ts > .omo/evidence/task-4-restore-surfaces-fail.diff && test -s .omo/evidence/task-4-restore-surfaces-fail.diff'`
  - [ ] API route files exist: `bash -lc 'test -f "src/app/api/papers/crawl/route.ts" && test -f "src/app/api/read/summary/route.ts" && test -f "src/app/api/read/chat/route.ts" && test -f src/worker/scheduler.ts'`
  - [ ] Restored endpoints contain expected contracts: `bash -lc 'grep -F "paperId is required" "src/app/api/read/summary/route.ts" && grep -F "crawlSubscribedCategories" "src/app/api/papers/crawl/route.ts"'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: route restore proof
    Tool:     bash
    Steps:    bash -lc 'find src/app/api -type f | sort > .omo/evidence/task-4-restore-surfaces.txt && grep -F "src/app/api/papers/crawl/route.ts" .omo/evidence/task-4-restore-surfaces.txt && grep -F "src/app/api/read/summary/route.ts" .omo/evidence/task-4-restore-surfaces.txt'
    Expected: evidence lists crawl and read-summary API route files.
    Evidence: .omo/evidence/task-4-restore-surfaces.txt

  Scenario: missing paperId route guard
    Tool:     bash
    Steps:    bash -lc 'grep -F "paperId is required" "src/app/api/read/summary/route.ts" > .omo/evidence/task-4-restore-surfaces-error.txt'
    Expected: evidence contains exact missing-body error guard from the restored route.
    Evidence: .omo/evidence/task-4-restore-surfaces-error.txt
  ```

  Commit: NO | Message: `chore(restore): restore app api and worker surfaces` | Files: [`src/app/**`, `src/components/**`, `src/worker/**`, `src/instrumentation.ts`]

- [ ] 5. Restore scripts, tests, README, Docker, and operational docs

  What to do: Restore project scripts, tests, Docker compose files, README, and `.env.example` from `965a177`. Capture deletion diff before restoring. This task owns existing smoke/ops scripts and test fixtures, not new focused CLI work.
  Must NOT do: Do not alter domain libraries or app/API/worker code in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [6, 7, 8, 9, 10, 11, 13, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:32` - existing quality gate documentation.
  - Pattern:  `README.md:50` - existing live arXiv smoke command and network caveat.
  - Pattern:  `README.md:74` - browser smoke documents real page flows.
  - Pattern:  `.env.example:1` - HTTP/HTTPS proxy support for arXiv access.
  - Pattern:  `.env.example:34` - LLM cost/usage configuration comments.
  - Pattern:  `.env.example:38` - worker scheduler configuration.
  - Pattern:  `scripts/quality-gate.sh:4` - quality gate runs typecheck.
  - Pattern:  `scripts/quality-gate.sh:7` - quality gate runs unit tests.
  - Pattern:  `scripts/quality-gate.sh:10` - quality gate runs production build.
  - Pattern:  `scripts/docker-business-smoke.mjs:101` - existing mock LLM server.
  - Pattern:  `scripts/docker-business-smoke.mjs:515` - existing read-summary/read-chat API smoke with mock LLM.
  - Pattern:  `scripts/docker-business-smoke.mjs:554` - optional live arXiv crawl smoke.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists: `bash -lc 'git diff --name-status 965a177..HEAD -- scripts tests README.md .env.example docker-compose.yml docker-compose.prod.yml > .omo/evidence/task-5-restore-tests-scripts-fail.diff && test -s .omo/evidence/task-5-restore-tests-scripts-fail.diff'`
  - [ ] Existing tests are restored: `bash -lc 'test -f tests/arxiv.test.ts && test -f tests/read-failures.test.ts && test -f tests/scheduler.test.ts && test -f tests/report-generation-route.test.ts'`
  - [ ] Existing smoke scripts are restored: `bash -lc 'test -f scripts/docker-smoke.sh && test -f scripts/docker-business-smoke.mjs && test -f scripts/browser-smoke.mjs && test -f scripts/quality-gate.sh'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: restored script inventory
    Tool:     bash
    Steps:    bash -lc 'find scripts tests -maxdepth 2 -type f | sort > .omo/evidence/task-5-restore-tests-scripts.txt && grep -F "scripts/docker-business-smoke.mjs" .omo/evidence/task-5-restore-tests-scripts.txt && grep -F "tests/read-failures.test.ts" .omo/evidence/task-5-restore-tests-scripts.txt'
    Expected: evidence lists restored smoke script and read-failure test.
    Evidence: .omo/evidence/task-5-restore-tests-scripts.txt

  Scenario: live arXiv smoke remains opt-in
    Tool:     bash
    Steps:    bash -lc 'grep -F "DOCKER_BUSINESS_SMOKE_LIVE_ARXIV=1" package.json > .omo/evidence/task-5-restore-tests-scripts-error.txt'
    Expected: evidence proves live arXiv is not default and remains explicitly gated.
    Evidence: .omo/evidence/task-5-restore-tests-scripts-error.txt
  ```

  Commit: NO | Message: `chore(restore): restore scripts tests and docs` | Files: [`scripts/**`, `tests/**`, `README.md`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`]

- [ ] 6. Add latest arXiv retrieval failing-first coverage and hardening

  What to do: Add targeted Vitest coverage proving `fetchArxivCategory()` sends the official latest-paper query, supports proxy env vars without requiring them, rejects invalid HTTP responses with status, parses single and multiple Atom entries, preserves `pdfUrl`, normalizes whitespace, and returns papers ordered as provided by arXiv. First write tests that fail against the restored baseline if any behavior is missing, capture failure, then implement minimal fixes in `src/lib/arxiv/client.ts` only if required.
  Must NOT do: Do not add date-range filtering, pagination beyond existing `max_results`, a new arXiv library dependency, or live network calls in unit tests.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [8, 10, 14] | Blocked by: [1, 3, 5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/lib/arxiv/client.ts:34` - existing `fetchArxivCategory(category, maxResults)` entrypoint.
  - Pattern:  `src/lib/arxiv/client.ts:35` - official endpoint URL.
  - Pattern:  `src/lib/arxiv/client.ts:36` - category query parameter.
  - Pattern:  `src/lib/arxiv/client.ts:37` - latest sort field.
  - Pattern:  `src/lib/arxiv/client.ts:38` - descending sort order.
  - Pattern:  `src/lib/arxiv/client.ts:48` - HTTP error handling currently throws `arXiv API failed: <status>`.
  - Pattern:  `src/lib/arxiv/client.ts:55` - XML parsing seam to test without network.
  - Test:     `tests/arxiv.test.ts:7` - existing arXiv core test structure.
  - External: `https://info.arxiv.org/help/api/user-manual.html` - official arXiv API user manual; query responses are Atom XML and parameters include `search_query`, `sortBy`, `sortOrder`, and `max_results`.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'pnpm test -- tests/arxiv-latest-client.test.ts > .omo/evidence/task-6-arxiv-latest-fail.log 2>&1; test $? -ne 0'`
  - [ ] Targeted tests pass after implementation: `bash -lc 'pnpm test -- tests/arxiv-latest-client.test.ts > .omo/evidence/task-6-arxiv-latest.log 2>&1'`
  - [ ] Existing arXiv tests still pass: `bash -lc 'pnpm test -- tests/arxiv.test.ts >> .omo/evidence/task-6-arxiv-latest.log 2>&1'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: latest category query contract
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- tests/arxiv-latest-client.test.ts --testNamePattern "builds latest category query" > .omo/evidence/task-6-arxiv-latest-query.log 2>&1'
    Expected: test proves fetch URL contains export.arxiv.org/api/query, search_query=cat:cs.AI, sortBy=submittedDate, sortOrder=descending, and requested max_results.
    Evidence: .omo/evidence/task-6-arxiv-latest-query.log

  Scenario: arXiv HTTP failure
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- tests/arxiv-latest-client.test.ts --testNamePattern "throws arXiv API failed" > .omo/evidence/task-6-arxiv-latest-error.log 2>&1'
    Expected: test proves a non-OK arXiv response rejects with `arXiv API failed: 503`.
    Evidence: .omo/evidence/task-6-arxiv-latest-error.log
  ```

  Commit: NO | Message: `test(arxiv): prove latest category retrieval contract` | Files: [`tests/arxiv-latest-client.test.ts`, `src/lib/arxiv/client.ts`]

- [ ] 7. Add structured LLM summary schema/fallback coverage and implementation

  What to do: Add a focused structured-output path for paper summaries while preserving OpenAI-compatible Chat Completions support. The preferred request should use `response_format: { type: "json_schema", json_schema: ... }` when configured/enabled and fall back to current `response_format: { type: "json_object" }` for providers/models that reject schema format. Continue validating parsed output through `paperSummarySchema`. First add tests that fail because structured schema/fallback behavior is absent, capture failure, then implement.
  Must NOT do: Do not migrate the whole app to Responses API, do not remove Chat Completions, do not remove Zod validation, and do not call live providers in unit tests.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9, 10, 12, 14] | Blocked by: [1, 3, 5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/lib/llm/chat-completions.ts:36` - summary call entrypoint.
  - Pattern:  `src/lib/llm/chat-completions.ts:48` - current request body assembly.
  - Pattern:  `src/lib/llm/chat-completions.ts:51` - current JSON mode response format.
  - Pattern:  `src/lib/llm/chat-completions.ts:59` - current non-OK provider error.
  - Pattern:  `src/lib/llm/chat-completions.ts:63` - current content extraction.
  - Pattern:  `src/lib/llm/chat-completions.ts:70` - current schema parse point.
  - API/Type: `src/lib/llm/schema.ts:3` - canonical Zod summary schema.
  - API/Type: `src/lib/llm/schema.ts:14` - parser accepts raw string/object and validates through Zod.
  - Pattern:  `src/lib/llm/streaming.ts:100` - existing streaming fallback when provider rejects `stream_options`; copy this narrow fallback style.
  - External: `https://developers.openai.com/api/docs/guides/structured-outputs` - Structured Outputs via `json_schema` ensure schema adherence; JSON mode only ensures valid JSON and still needs validation.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'pnpm test -- tests/llm-summary-structured-output.test.ts > .omo/evidence/task-7-llm-structured-fail.log 2>&1; test $? -ne 0'`
  - [ ] Targeted tests pass after implementation: `bash -lc 'pnpm test -- tests/llm-summary-structured-output.test.ts > .omo/evidence/task-7-llm-structured.log 2>&1'`
  - [ ] Existing read/LLM failure tests still pass: `bash -lc 'pnpm test -- tests/read-failures.test.ts >> .omo/evidence/task-7-llm-structured.log 2>&1'`
  - [ ] Source still contains JSON-mode fallback: `bash -lc 'grep -F "json_object" src/lib/llm/chat-completions.ts > .omo/evidence/task-7-llm-structured-fallback.txt'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: structured JSON schema request
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- tests/llm-summary-structured-output.test.ts --testNamePattern "requests json_schema" > .omo/evidence/task-7-llm-structured-schema.log 2>&1'
    Expected: test proves the summary request can send `response_format.type=json_schema` with required schema fields matching `paperSummarySchema`.
    Evidence: .omo/evidence/task-7-llm-structured-schema.log

  Scenario: provider rejects json_schema and falls back
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- tests/llm-summary-structured-output.test.ts --testNamePattern "falls back to json_object" > .omo/evidence/task-7-llm-structured-error.log 2>&1'
    Expected: test proves a 400 response mentioning `json_schema` triggers one retry with `response_format.type=json_object`, then parses/validates the returned JSON summary.
    Evidence: .omo/evidence/task-7-llm-structured-error.log
  ```

  Commit: NO | Message: `feat(llm): add structured summary schema fallback` | Files: [`src/lib/llm/chat-completions.ts`, `src/lib/llm/schema.ts`, `tests/llm-summary-structured-output.test.ts`]

- [ ] 8. Add focused latest-paper CLI/manual QA surface

  What to do: Add a small CLI script, for example `scripts/latest-arxiv.mjs`, that fetches latest papers for one or more categories using the restored arXiv client path and writes deterministic JSON and Markdown evidence. Support `--category`, repeatable categories or comma list, `--max-results`, `--out-json`, `--out-md`, `--mock-atom-fixture`, and proxy env vars inherited from the process. Use `tsx` or a script-local dynamic import pattern consistent with the repo. First add tests that fail because the CLI does not exist, capture failure, then implement.
  Must NOT do: Do not bypass `src/lib/arxiv/client.ts`, do not scrape arXiv HTML, do not store results in DB from this CLI, and do not make live arXiv the default test path.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9, 11, 13, 14] | Blocked by: [1, 3, 5, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/lib/arxiv/client.ts:34` - use the existing fetcher rather than duplicating query logic.
  - Pattern:  `src/lib/arxiv/client.ts:55` - parse fixture Atom XML through existing parser for mock mode.
  - Pattern:  `scripts/ops-failure-samples.mjs` - existing ops scripts write evidence-like Markdown/JSON; follow local style after restoration.
  - Pattern:  `README.md:50` - live arXiv is opt-in due network dependency.
  - Test:     `tests/arxiv-latest-client.test.ts` - new client-level contract from Task 6.
  - External: `https://info.arxiv.org/help/api/user-manual.html` - official arXiv API returns Atom XML through query endpoint.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'node scripts/latest-arxiv.mjs --category cs.AI --mock-atom-fixture tests/fixtures/arxiv-latest-cs-ai.xml --out-json .omo/evidence/task-8-latest-cli-pre.json > .omo/evidence/task-8-latest-cli-fail.log 2>&1; test $? -ne 0'`
  - [ ] Targeted CLI tests pass: `bash -lc 'pnpm test -- tests/latest-arxiv-cli.test.ts > .omo/evidence/task-8-latest-cli-test.log 2>&1'`
  - [ ] Mock CLI produces JSON and Markdown evidence: `bash -lc 'node scripts/latest-arxiv.mjs --category cs.AI --max-results 2 --mock-atom-fixture tests/fixtures/arxiv-latest-cs-ai.xml --out-json .omo/evidence/task-8-latest-cli.json --out-md .omo/evidence/task-8-latest-cli.md > .omo/evidence/task-8-latest-cli.log 2>&1 && test -s .omo/evidence/task-8-latest-cli.json && test -s .omo/evidence/task-8-latest-cli.md'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: mock latest arXiv CLI
    Tool:     bash
    Steps:    bash -lc 'node scripts/latest-arxiv.mjs --category cs.AI --max-results 2 --mock-atom-fixture tests/fixtures/arxiv-latest-cs-ai.xml --out-json .omo/evidence/task-8-latest-cli.json --out-md .omo/evidence/task-8-latest-cli.md'
    Expected: JSON contains category `cs.AI`, at least one paper with arxivId/title/abstract/authors/pdfUrl/publishedAt, and Markdown lists the same title.
    Evidence: .omo/evidence/task-8-latest-cli.json

  Scenario: invalid category
    Tool:     bash
    Steps:    bash -lc 'node scripts/latest-arxiv.mjs --category "bad value" --mock-atom-fixture tests/fixtures/arxiv-latest-cs-ai.xml --out-json .omo/evidence/task-8-latest-cli-error.json > .omo/evidence/task-8-latest-cli-error.log 2>&1; test $? -ne 0'
    Expected: command exits nonzero and log contains `Invalid arXiv categories`.
    Evidence: .omo/evidence/task-8-latest-cli-error.log
  ```

  Commit: NO | Message: `feat(arxiv): add latest paper cli evidence surface` | Files: [`scripts/latest-arxiv.mjs`, `tests/latest-arxiv-cli.test.ts`, `tests/fixtures/arxiv-latest-cs-ai.xml`, `package.json`]

- [ ] 9. Add focused LLM summary CLI/manual QA surface

  What to do: Add a CLI script, for example `scripts/summarize-arxiv-paper.mjs`, that reads one paper JSON produced by `scripts/latest-arxiv.mjs` or a fixture, calls the existing summary function with an OpenAI-compatible endpoint, supports a mock provider mode, and writes JSON/Markdown evidence. Include `--input-json`, `--paper-id`, `--llm-base-url`, `--api-key`, `--model`, `--mock-llm`, `--out-json`, and `--out-md`. First add tests that fail because the CLI does not exist, capture failure, then implement.
  Must NOT do: Do not require a real API key in default tests, do not print API keys, do not bypass `summarizePaperWithChatCompletionsResult()`, and do not store summaries in DB from this CLI.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [11, 12, 13, 14] | Blocked by: [1, 3, 5, 7, 8]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/lib/llm/chat-completions.ts:19` - build prompt from paper metadata.
  - Pattern:  `src/lib/llm/chat-completions.ts:36` - summary function to call.
  - API/Type: `src/lib/llm/schema.ts:3` - output fields required in evidence JSON.
  - Pattern:  `scripts/docker-business-smoke.mjs:101` - existing local mock LLM server pattern.
  - Pattern:  `scripts/docker-business-smoke.mjs:515` - existing read-summary API mock proof.
  - Test:     `tests/llm-summary-structured-output.test.ts` - structured/fallback provider behavior from Task 7.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'node scripts/summarize-arxiv-paper.mjs --input-json .omo/evidence/task-8-latest-cli.json --paper-id 2606.19001 --mock-llm --out-json .omo/evidence/task-9-summary-cli-pre.json > .omo/evidence/task-9-summary-cli-fail.log 2>&1; test $? -ne 0'`
  - [ ] Targeted CLI tests pass: `bash -lc 'pnpm test -- tests/summarize-arxiv-paper-cli.test.ts > .omo/evidence/task-9-summary-cli-test.log 2>&1'`
  - [ ] Mock summary CLI produces evidence: `bash -lc 'node scripts/summarize-arxiv-paper.mjs --input-json .omo/evidence/task-8-latest-cli.json --paper-id "$(node -e "const j=require(\"./.omo/evidence/task-8-latest-cli.json\"); console.log(j.papers[0].arxivId)")" --mock-llm --out-json .omo/evidence/task-9-summary-cli.json --out-md .omo/evidence/task-9-summary-cli.md > .omo/evidence/task-9-summary-cli.log 2>&1 && test -s .omo/evidence/task-9-summary-cli.json && test -s .omo/evidence/task-9-summary-cli.md'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: mock LLM summary CLI
    Tool:     bash
    Steps:    bash -lc 'node scripts/summarize-arxiv-paper.mjs --input-json .omo/evidence/task-8-latest-cli.json --paper-id "$(node -e "const j=require(\"./.omo/evidence/task-8-latest-cli.json\"); console.log(j.papers[0].arxivId)")" --mock-llm --out-json .omo/evidence/task-9-summary-cli.json --out-md .omo/evidence/task-9-summary-cli.md'
    Expected: output JSON contains `summary.title_original`, `summary.title_zh`, `summary.one_sentence_summary_zh`, `summary.summary_zh`, and optional usage tokens; Markdown contains the paper title and summary.
    Evidence: .omo/evidence/task-9-summary-cli.json

  Scenario: missing provider config
    Tool:     bash
    Steps:    bash -lc 'node scripts/summarize-arxiv-paper.mjs --input-json .omo/evidence/task-8-latest-cli.json --paper-id missing --out-json .omo/evidence/task-9-summary-cli-error.json > .omo/evidence/task-9-summary-cli-error.log 2>&1; test $? -ne 0'
    Expected: command exits nonzero and log contains either `paper not found` for a bad id or `LLM config is required` when no mock/live provider is configured.
    Evidence: .omo/evidence/task-9-summary-cli-error.log
  ```

  Commit: NO | Message: `feat(llm): add arxiv paper summary cli evidence surface` | Files: [`scripts/summarize-arxiv-paper.mjs`, `tests/summarize-arxiv-paper-cli.test.ts`, `package.json`]

- [ ] 10. Lock daily crawl -> report -> summary scheduling behavior

  What to do: Add or extend tests proving the restored daily workflow: scheduler queues arXiv crawl jobs on interval, crawl uses subscribed category union, report generation selects latest/recent papers, no-LLM reports still render, configured LLM summaries are attempted per selected paper, partial LLM failures remain visible, and `llmCallLog` receives success/failure token metadata when a user id is present. First add failing tests for missing or under-specified behavior, capture failure, then implement minimal fixes only where necessary.
  Must NOT do: Do not introduce a new scheduler system, do not change report data model unless tests prove a real gap, and do not make scheduler call the live arXiv API in tests.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [11, 14] | Blocked by: [1, 2, 3, 4, 5, 6, 7]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/worker/scheduler.ts:84` - `runSchedulerTick()` queues crawl/report/backup/retention.
  - Pattern:  `src/worker/scheduler.ts:94` - crawl due interval check.
  - Pattern:  `src/lib/app/papers.ts:70` - subscribed category union.
  - Pattern:  `src/lib/app/papers.ts:75` - crawl fetch/filter/upsert loop.
  - Pattern:  `src/lib/app/papers.ts:87` - recent paper query by categories.
  - Pattern:  `src/lib/reports/generate.ts:44` - no-LLM fallback report.
  - Pattern:  `src/lib/reports/generate.ts:60` - configured summary function path.
  - Pattern:  `src/lib/reports/generate.ts:88` - partial failure collection.
  - Test:     `tests/scheduler.test.ts:126` - existing scheduler crawl dedupe behavior.
  - Test:     `tests/jobs.test.ts:87` - existing crawl job retry policy.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'pnpm test -- tests/daily-latest-workflow.test.ts > .omo/evidence/task-10-daily-workflow-fail.log 2>&1; test $? -ne 0'`
  - [ ] Daily workflow tests pass: `bash -lc 'pnpm test -- tests/daily-latest-workflow.test.ts > .omo/evidence/task-10-daily-workflow.log 2>&1'`
  - [ ] Existing scheduler/report tests still pass: `bash -lc 'pnpm test -- tests/scheduler.test.ts tests/jobs.test.ts tests/report.test.ts tests/report-generation-route.test.ts >> .omo/evidence/task-10-daily-workflow.log 2>&1'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: scheduled crawl/report happy path
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- tests/daily-latest-workflow.test.ts --testNamePattern "queues crawl and summarizes selected latest papers" > .omo/evidence/task-10-daily-workflow-happy.log 2>&1'
    Expected: test proves crawl is queued once, latest papers are selected, LLM summaries are attempted, and rendered report includes summary content.
    Evidence: .omo/evidence/task-10-daily-workflow-happy.log

  Scenario: partial LLM failure is visible
    Tool:     bash
    Steps:    bash -lc 'pnpm test -- tests/daily-latest-workflow.test.ts --testNamePattern "keeps report when one summary fails" > .omo/evidence/task-10-daily-workflow-error.log 2>&1'
    Expected: test proves status `partial_succeeded` or equivalent failure metadata is returned and Markdown includes failed paper information.
    Evidence: .omo/evidence/task-10-daily-workflow-error.log
  ```

  Commit: NO | Message: `test(workflow): lock daily latest crawl and summary flow` | Files: [`tests/daily-latest-workflow.test.ts`, `src/worker/scheduler.ts`, `src/lib/app/papers.ts`, `src/lib/reports/generate.ts`]

- [ ] 11. Add HTTP/Docker smoke evidence for live/latest crawl and mock read-summary

  What to do: Add a focused HTTP smoke script, for example `scripts/latest-summary-smoke.mjs`, or extend `scripts/docker-business-smoke.mjs` in a narrow, evidence-emitting way. It must start/use the existing Docker app stack, seed a smoke user and paper or use the existing seed path, save mock LLM config, call `/api/papers/crawl` in mock or opt-in live mode, call `/api/read/summary`, verify DB rows in `paper`, `paper_summary`, and `llm_call_log`, and write `.omo/evidence/task-11-http-smoke.{json,md,sse}`. First add tests or a pre-run that fails because evidence output does not exist, capture failure, then implement.
  Must NOT do: Do not require live arXiv or live LLM by default; do not duplicate a full browser smoke; do not weaken existing Docker business smoke assertions.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [12, 13, 14] | Blocked by: [2, 3, 4, 5, 8, 9, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/docker-smoke.sh:9` - compose config validation.
  - Pattern:  `scripts/docker-smoke.sh:12` - compose up/build command.
  - Pattern:  `scripts/docker-business-smoke.mjs:77` - helper for psql checks inside Docker.
  - Pattern:  `scripts/docker-business-smoke.mjs:101` - mock LLM server implementation.
  - Pattern:  `scripts/docker-business-smoke.mjs:408` - saves smoke user preferences through real HTTP route.
  - Pattern:  `scripts/docker-business-smoke.mjs:484` - saves smoke LLM config through real HTTP route.
  - Pattern:  `scripts/docker-business-smoke.mjs:515` - exercises read-summary/read-chat APIs with mock LLM.
  - Pattern:  `scripts/docker-business-smoke.mjs:554` - optional live arXiv crawl through `/api/papers/crawl`.
  - Pattern:  `src/app/api/papers/crawl/route.ts:10` - route under test calls crawl implementation.
  - Pattern:  `src/app/api/read/summary/route.ts:150` - route returns SSE stream with PDF-source headers.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'node scripts/latest-summary-smoke.mjs --mock --evidence-prefix .omo/evidence/task-11-http-smoke-pre > .omo/evidence/task-11-http-smoke-fail.log 2>&1; test $? -ne 0'`
  - [ ] Mock HTTP smoke passes and writes evidence: `bash -lc 'node scripts/latest-summary-smoke.mjs --mock --evidence-prefix .omo/evidence/task-11-http-smoke > .omo/evidence/task-11-http-smoke.log 2>&1 && test -s .omo/evidence/task-11-http-smoke.json && test -s .omo/evidence/task-11-http-smoke.md'`
  - [ ] Existing Docker business smoke still passes with mock LLM: `bash -lc 'DOCKER_BUSINESS_SMOKE_USER_PASSWORD=docker-smoke-password pnpm smoke:docker:business > .omo/evidence/task-11-docker-business-smoke.log 2>&1'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: mock HTTP latest + summary smoke
    Tool:     bash
    Steps:    bash -lc 'node scripts/latest-summary-smoke.mjs --mock --evidence-prefix .omo/evidence/task-11-http-smoke'
    Expected: JSON evidence reports public health ok, signed-in smoke user, crawl endpoint ok, at least one paper row, read-summary SSE contains mock summary text, `paper_summary` count increased, and `llm_call_log` has a succeeded `read-summary` row with model.
    Evidence: .omo/evidence/task-11-http-smoke.json

  Scenario: live arXiv opt-in crawl
    Tool:     bash
    Steps:    bash -lc 'DAILY_ARXIV_LIVE_ARXIV=1 node scripts/latest-summary-smoke.mjs --mock-llm --live-arxiv --category cs.AI --evidence-prefix .omo/evidence/task-11-http-smoke-live-arxiv'
    Expected: when network is available, JSON evidence shows `/api/papers/crawl` returned `ok: true`, categories include `cs.AI`, and fetched count is greater than 0; if network is unavailable, script exits nonzero with `live arXiv unavailable` and preserves the error evidence.
    Evidence: .omo/evidence/task-11-http-smoke-live-arxiv.json
  ```

  Commit: NO | Message: `test(smoke): add latest arxiv summary http evidence` | Files: [`scripts/latest-summary-smoke.mjs`, `scripts/docker-business-smoke.mjs`, `tests/latest-summary-smoke.test.ts`, `package.json`]

- [ ] 12. Add browser real-Chrome read-flow evidence

  What to do: Add a focused Playwright real-Chrome QA path or extend the existing browser smoke so it confirms a user can reach the read page, select a paper, trigger summary, see streamed summary text, and see no mobile/desktop control overlap. Capture screenshots and a trace or DOM assertion evidence under `.omo/evidence/`. First capture failure for the missing focused evidence path, then implement.
  Must NOT do: Do not redesign the UI, do not replace the existing full browser smoke, and do not rely on text-only HTTP checks for this task.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [14] | Blocked by: [4, 7, 9, 11]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:74` - existing browser smoke already covers login, settings, papers, reports, read page, summary/chat, and mobile visibility.
  - Pattern:  `scripts/browser-smoke.mjs` - restored browser smoke implementation to extend or call.
  - Pattern:  `src/app/(dashboard)/read/page.tsx` - read page surface.
  - Pattern:  `src/components/read/paper-reader.tsx` - summary/read UI surface.
  - Pattern:  `src/components/read/chat-panel.tsx` - chat/summary controls and stream rendering.
  - Pattern:  `src/app/api/read/summary/route.ts:150` - SSE response under UI flow.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before implementation: `bash -lc 'BROWSER_SMOKE_FOCUSED_READ_SUMMARY=1 node scripts/browser-smoke.mjs > .omo/evidence/task-12-browser-read-fail.log 2>&1; test $? -ne 0'`
  - [ ] Focused browser smoke passes: `bash -lc 'BROWSER_SMOKE_FOCUSED_READ_SUMMARY=1 BROWSER_SMOKE_EVIDENCE_PREFIX=.omo/evidence/task-12-browser-read node scripts/browser-smoke.mjs > .omo/evidence/task-12-browser-read.log 2>&1'`
  - [ ] Evidence screenshots exist: `bash -lc 'test -s .omo/evidence/task-12-browser-read-desktop.png && test -s .omo/evidence/task-12-browser-read-mobile.png'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: desktop read summary flow
    Tool:     playwright(real Chrome)
    Steps:    bash -lc 'BROWSER_SMOKE_FOCUSED_READ_SUMMARY=1 BROWSER_SMOKE_VIEWPORT=desktop BROWSER_SMOKE_EVIDENCE_PREFIX=.omo/evidence/task-12-browser-read-desktop node scripts/browser-smoke.mjs'
    Expected: screenshot shows read page with selected paper and streamed mock summary text visible; script asserts no critical button text is clipped or overlapped.
    Evidence: .omo/evidence/task-12-browser-read-desktop.png

  Scenario: mobile read summary flow
    Tool:     playwright(real Chrome)
    Steps:    bash -lc 'BROWSER_SMOKE_FOCUSED_READ_SUMMARY=1 BROWSER_SMOKE_VIEWPORT=mobile BROWSER_SMOKE_EVIDENCE_PREFIX=.omo/evidence/task-12-browser-read-mobile node scripts/browser-smoke.mjs'
    Expected: screenshot shows mobile read page controls and summary content visible without overlap; script exits 0.
    Evidence: .omo/evidence/task-12-browser-read-mobile.png
  ```

  Commit: NO | Message: `test(browser): verify read summary flow in chrome` | Files: [`scripts/browser-smoke.mjs`, `src/components/read/**`, `src/app/(dashboard)/read/page.tsx`]

- [ ] 13. Update operator docs and env examples for daily latest retrieval plus LLM summaries

  What to do: Update `README.md` and `.env.example` so a worker/operator can run daily latest retrieval, mock CLI QA, live arXiv CLI QA, mock LLM summary CLI QA, live provider summary QA, Docker HTTP smoke, and full quality gate. Document that live arXiv and live LLM are opt-in. Include exact commands and evidence output paths. First add a docs check that fails because the new commands are undocumented, capture failure, then update docs.
  Must NOT do: Do not document unimplemented commands, do not expose secrets, do not claim live network checks are default, and do not add product marketing content.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [14] | Blocked by: [8, 9, 11]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:5` - quick start section.
  - Pattern:  `README.md:32` - verification section.
  - Pattern:  `README.md:50` - live arXiv command belongs near existing network caveat.
  - Pattern:  `.env.example:1` - arXiv proxy configuration.
  - Pattern:  `.env.example:34` - LLM cost and provider-related config area.
  - Pattern:  `.env.example:38` - worker scheduler config.
  - New:      `scripts/latest-arxiv.mjs` - command from Task 8.
  - New:      `scripts/summarize-arxiv-paper.mjs` - command from Task 9.
  - New:      `scripts/latest-summary-smoke.mjs` - command from Task 11.

  Acceptance criteria (agent-executable only):
  - [ ] Failing-first evidence exists before docs update: `bash -lc 'grep -F "scripts/latest-arxiv.mjs" README.md > .omo/evidence/task-13-docs-fail.log 2>&1; test $? -ne 0'`
  - [ ] Docs mention all new commands: `bash -lc 'for token in "scripts/latest-arxiv.mjs" "scripts/summarize-arxiv-paper.mjs" "scripts/latest-summary-smoke.mjs" "DAILY_ARXIV_LIVE_ARXIV"; do grep -F "$token" README.md >/dev/null; done'`
  - [ ] Env example documents live opt-in and LLM variables without secrets: `bash -lc 'grep -F "LLM" .env.example >/dev/null && ! grep -F "sk-" .env.example >/dev/null'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: documentation command inventory
    Tool:     bash
    Steps:    bash -lc 'grep -nE "latest-arxiv|summarize-arxiv-paper|latest-summary-smoke|LIVE_ARXIV" README.md > .omo/evidence/task-13-docs.txt'
    Expected: evidence lists README lines for each new manual QA command and the live-network opt-in warning.
    Evidence: .omo/evidence/task-13-docs.txt

  Scenario: no secret leakage
    Tool:     bash
    Steps:    bash -lc '! grep -R "sk-[A-Za-z0-9]" README.md .env.example > .omo/evidence/task-13-docs-error.txt'
    Expected: command exits 0; evidence file is empty or absent because no API-key-looking secrets are documented.
    Evidence: .omo/evidence/task-13-docs-error.txt
  ```

  Commit: NO | Message: `docs(ops): document latest arxiv and llm summary qa` | Files: [`README.md`, `.env.example`, `package.json`]

- [ ] 14. Run full quality and evidence gate

  What to do: Run the full restored project checks and focused real-surface QA after all implementation tasks complete. Capture logs under `.omo/evidence/`. If a check fails, fix only the owning task's files and rerun from the failing check. Produce a final evidence index at `.omo/evidence/daily-arxiv-llm-index.md`.
  Must NOT do: Do not commit, do not skip failing checks, do not mark live arXiv/live LLM as required default checks, and do not hide network-dependent failures.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [final verification] | Blocked by: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/quality-gate.sh:4` - typecheck step.
  - Pattern:  `scripts/quality-gate.sh:7` - unit test step.
  - Pattern:  `scripts/quality-gate.sh:10` - build step.
  - Pattern:  `package.json:10` - `pnpm quality`.
  - Pattern:  `package.json:11` - Docker smoke.
  - Pattern:  `package.json:12` - Docker business smoke.
  - Pattern:  `package.json:13` - live arXiv business smoke opt-in.
  - Pattern:  `package.json:15` - browser smoke.
  - New:      `.omo/evidence/task-8-latest-cli.json` - CLI latest retrieval evidence.
  - New:      `.omo/evidence/task-9-summary-cli.json` - CLI LLM summary evidence.
  - New:      `.omo/evidence/task-11-http-smoke.json` - HTTP/Docker evidence.
  - New:      `.omo/evidence/task-12-browser-read-desktop.png` - real Chrome evidence.

  Acceptance criteria (agent-executable only):
  - [ ] Typecheck passes: `bash -lc 'pnpm typecheck > .omo/evidence/task-14-typecheck.log 2>&1'`
  - [ ] Unit tests pass: `bash -lc 'pnpm test > .omo/evidence/task-14-test.log 2>&1'`
  - [ ] Production build passes: `bash -lc 'pnpm build > .omo/evidence/task-14-build.log 2>&1'`
  - [ ] Full quality gate passes: `bash -lc 'pnpm quality > .omo/evidence/task-14-quality.log 2>&1'`
  - [ ] Docker business smoke passes: `bash -lc 'DOCKER_BUSINESS_SMOKE_USER_PASSWORD=docker-smoke-password pnpm smoke:docker:business > .omo/evidence/task-14-docker-business.log 2>&1'`
  - [ ] Focused CLI/HTTP/browser evidence exists: `bash -lc 'for f in .omo/evidence/task-8-latest-cli.json .omo/evidence/task-9-summary-cli.json .omo/evidence/task-11-http-smoke.json .omo/evidence/task-12-browser-read-desktop.png .omo/evidence/task-12-browser-read-mobile.png; do test -s "$f"; done'`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: full local quality
    Tool:     bash
    Steps:    bash -lc 'pnpm quality > .omo/evidence/task-14-quality.log 2>&1'
    Expected: log ends with `Quality gate passed.`
    Evidence: .omo/evidence/task-14-quality.log

  Scenario: real-surface summary proof
    Tool:     bash
    Steps:    bash -lc 'node -e "const fs=require(\"fs\"); const latest=JSON.parse(fs.readFileSync(\".omo/evidence/task-8-latest-cli.json\",\"utf8\")); const summary=JSON.parse(fs.readFileSync(\".omo/evidence/task-9-summary-cli.json\",\"utf8\")); const http=JSON.parse(fs.readFileSync(\".omo/evidence/task-11-http-smoke.json\",\"utf8\")); if(!latest.papers?.length) throw new Error(\"no latest papers\"); if(!summary.summary?.summary_zh) throw new Error(\"no summary\"); if(http.readSummary?.ok!==true) throw new Error(\"http summary not ok\"); console.log(\"latest+summary evidence ok\")" > .omo/evidence/task-14-real-surface.log 2>&1'
    Expected: command exits 0 and evidence contains `latest+summary evidence ok`.
    Evidence: .omo/evidence/task-14-real-surface.log
  ```

  Commit: NO | Message: `test(qa): capture daily arxiv llm evidence gate` | Files: [`.omo/evidence/**`]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- No commits are authorized by this plan. Commit lines above are future-ready only if the user explicitly asks for commits later.
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: .omo/plans/daily-arxiv-llm.md`.

## Success criteria
- All files needed for the prior app are restored or intentionally preserved from existing untracked copies, with `.omo/` untouched.
- arXiv latest retrieval is proven by unit tests, mock CLI evidence, and opt-in live arXiv CLI/HTTP evidence.
- LLM summaries are proven by schema/fallback tests, mock CLI evidence, `/api/read/summary` HTTP evidence, DB log checks, and browser read-flow screenshots.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm quality`, and Docker business smoke pass with logs in `.omo/evidence/`.
- All Must-Have items are complete; all Must-NOT-Have guardrails hold; all QA scenarios pass with captured evidence; F1-F4 approve; no commits are made unless explicitly requested.
