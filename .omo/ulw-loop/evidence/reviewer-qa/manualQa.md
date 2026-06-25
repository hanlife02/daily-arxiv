# manualQa

## surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| S1 | Happy path daily arXiv + mock LLM summary | CLI | `pnpm daily:summary -- --fixture tests/fixtures/arxiv-feed.xml --mock-llm --limit 1 --batch-date 2026-06-24 --output .omo/ulw-loop/evidence/reviewer-qa/daily-summary.md` | PASS | A1, A2 |
| S2 | Missing LLM configuration edge path | CLI | `env -u LLM_BASE_URL -u LLM_API_KEY -u LLM_MODEL pnpm daily:summary -- --fixture tests/fixtures/arxiv-feed.xml --limit 1 --batch-date 2026-06-24` | PASS | A3 |
| S3 | Regression quality gate audit | Artifact audit | `sed -n '1,120p' .omo/ulw-loop/evidence/quality.log` and `tail -n 80 .omo/ulw-loop/evidence/quality.log` | PASS | A4 |
| S4 | Cleanup state: no live tmux/server/container/browser left | OS/process/container probes | `tmux ls`; `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'`; `lsof -nP -iTCP -sTCP:LISTEN`; `ps aux` | FAIL | A5, A6, A7, A8 |

## adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| A-S1 | Happy path content integrity | Fixture data must not produce empty or wrong-paper report | Markdown contains `2606.12345` and Chinese summary content after exit `0` | PASS | A1, A2 |
| A-S2 | Missing external dependency configuration | CLI must fail closed without mock LLM or LLM env | Non-zero exit and guidance to set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, or pass `--mock-llm` | PASS | A3 |
| A-S3 | Regression gate did not silently skip core checks | Quality artifact must include typecheck, unit tests, production build, and final pass line | Artifact shows typecheck, 24 test files / 135 tests passed, Next build, and `Quality gate passed.` | PASS | A4 |
| A-S4 | Leftover execution environment | No QA or app server/container/browser state remains after review | `docker ps` must not show active daily-arxiv containers | FAIL | A6, A7 |

## artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| A1 | markdown | Fresh happy-path generated daily summary, non-empty and containing arXiv `2606.12345` plus Chinese summary content | `.omo/ulw-loop/evidence/reviewer-qa/daily-summary.md` |
| A2 | CLI transcript | Fresh happy-path CLI run with exact invocation and `exit_code=0` | `.omo/ulw-loop/evidence/reviewer-qa/daily-summary-cli.log` |
| A3 | CLI transcript | Fresh missing-LLM CLI run with exact invocation, env unset, guidance text, and `exit_code=1` | `.omo/ulw-loop/evidence/reviewer-qa/daily-summary-missing-llm.log` |
| A4 | prior quality transcript | Existing non-empty quality gate artifact showing typecheck, unit tests, production build, and `Quality gate passed.` | `.omo/ulw-loop/evidence/quality.log` |
| A5 | tmux probe | `tmux ls` cleanup probe showing no tmux socket/sessions | `.omo/ulw-loop/evidence/reviewer-qa/tmux-ls.log` |
| A6 | container probe | `docker ps` cleanup probe showing live `daily-arxiv-worker-1`, `daily-arxiv-app-1`, and `daily-arxiv-redis-1` containers | `.omo/ulw-loop/evidence/reviewer-qa/docker-ps.log` |
| A7 | listening ports probe | `lsof` cleanup probe showing bound ports including OrbStack mappings for `3211` and `6379` | `.omo/ulw-loop/evidence/reviewer-qa/listening-ports.log` |
| A8 | process snapshot | Escalated `ps aux` snapshot for process cleanup audit | `.omo/ulw-loop/evidence/reviewer-qa/ps-aux.log` |

## verdict

REJECT. Product CLI scenarios and quality artifact pass, but cleanup fails because live daily-arxiv containers are still running.
