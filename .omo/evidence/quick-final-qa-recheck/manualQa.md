# Quick Final QA Recheck

Goal: verify requested `.omo/ulw-loop/evidence/` artifacts only.
Tier: LIGHT, because this is read-only verification of fixed evidence artifacts with no product change.

## Surface Evidence

| Scenario id | Criterion reference | Surface | Exact invocation | Verdict | artifactRefs |
|---|---|---|---|---|---|
| S1 | `daily-summary.md` contains arXiv `2606.12345` and Chinese mock summary | Local artifact text | `rg -n "2606\\.12345\|中文\|摘要\|mock\|模拟\|summary" .omo/ulw-loop/evidence/daily-summary.md` | PASS | A1, A7 |
| S2 | `daily-summary-missing-llm.log` contains missing LLM env guidance and `exit_code=1` | Local artifact text | `rg -n "LLM\|OPENAI\|ANTHROPIC\|GEMINI\|API\|env\|environment\|missing\|未设置\|exit_code=1\|exit code\|Exit" .omo/ulw-loop/evidence/daily-summary-missing-llm.log` | PASS | A2, A7 |
| S3 | `limit-malformed-green.log` contains positive integer guidance and non-zero exit | Local artifact text | `rg -n "positive integer\|正整数\|non-zero\|nonzero\|exit_code\|Exit\|must be\|invalid" .omo/ulw-loop/evidence/limit-malformed-green.log` | PASS | A3, A7 |
| S4 | `batch-date-invalid-green.log` contains valid calendar date guidance and non-zero exit | Local artifact text | `rg -n "valid calendar date\|calendar\|date\|日期\|non-zero\|nonzero\|exit_code\|Exit\|invalid" .omo/ulw-loop/evidence/batch-date-invalid-green.log` | PASS | A4, A7 |
| S5 | `quality.log` contains `Quality gate passed.` | Local artifact text | `rg -n "Quality gate passed\|passed\|failed\|error" .omo/ulw-loop/evidence/quality.log` | PASS | A5, A7 |
| S6 | `cleanup.log` indicates no daily-arxiv compose rows/listeners | Local artifact text | `sed -n '1,80p' .omo/ulw-loop/evidence/cleanup.log` and `rg -n "daily-arxiv\|compose\|row\|rows\|listener\|listeners\|none\|no \|0" .omo/ulw-loop/evidence/cleanup.log` | PASS | A6, A7 |
| S7 | Every PASS artifact is non-empty | Local artifact metadata | `wc -c .omo/ulw-loop/evidence/daily-summary.md .omo/ulw-loop/evidence/daily-summary-missing-llm.log .omo/ulw-loop/evidence/limit-malformed-green.log .omo/ulw-loop/evidence/batch-date-invalid-green.log .omo/ulw-loop/evidence/quality.log .omo/ulw-loop/evidence/cleanup.log` | PASS | A1, A2, A3, A4, A5, A6, A7 |

## Adversarial Cases

| Scenario id | Criterion reference | Adversarial class | Expected behavior | Verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV1 | Summary artifact | False positive from unrelated English-only summary | Artifact must include the target arXiv id and Chinese mock-summary language in the same evidence file | PASS | A1, A7 |
| ADV2 | Missing LLM artifact | Failure without actionable env guidance | Artifact must show missing LLM configuration guidance and `exit_code=1` | PASS | A2, A7 |
| ADV3 | Malformed limit artifact | Zero exit hidden behind validation output | Artifact must show positive-integer guidance and `exit_code=1` | PASS | A3, A7 |
| ADV4 | Invalid batch date artifact | Format-only date validation | Artifact must require a valid calendar date and show `exit_code=1` | PASS | A4, A7 |
| ADV5 | Quality artifact | Partial test success mistaken for full quality gate | Artifact must contain the terminal success marker `Quality gate passed.` | PASS | A5, A7 |
| ADV6 | Cleanup artifact | Unrelated compose/listener rows mistaken for daily-arxiv leftovers | Artifact must show no daily-arxiv compose service rows and no listener output; only unrelated `sub2api-*` docker rows are present | PASS | A6, A7 |

## Artifact Refs

| id | kind | description | path |
|---|---|---|---|
| A1 | source artifact | Daily summary evidence, 668 bytes; matched `状态：已生成摘要。`, `模拟摘要`, `arXiv ID：2606.12345`, and Chinese mock summary body | `/Users/hanlife02/code/daily-arxiv/.omo/ulw-loop/evidence/daily-summary.md` |
| A2 | source artifact | Missing LLM env evidence, 313 bytes; matched `Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL, or pass --mock-llm.` and `exit_code=1` | `/Users/hanlife02/code/daily-arxiv/.omo/ulw-loop/evidence/daily-summary-missing-llm.log` |
| A3 | source artifact | Malformed limit evidence, 296 bytes; matched `--limit must be a positive integer` and `exit_code=1` | `/Users/hanlife02/code/daily-arxiv/.omo/ulw-loop/evidence/limit-malformed-green.log` |
| A4 | source artifact | Invalid batch date evidence, 301 bytes; matched `--batch-date must be a valid calendar date` and `exit_code=1` | `/Users/hanlife02/code/daily-arxiv/.omo/ulw-loop/evidence/batch-date-invalid-green.log` |
| A5 | source artifact | Quality gate evidence, 6919 bytes; matched `Test Files 24 passed`, `Tests 136 passed`, and `Quality gate passed.` | `/Users/hanlife02/code/daily-arxiv/.omo/ulw-loop/evidence/quality.log` |
| A6 | source artifact | Cleanup evidence, 265 bytes; `docker compose ps` has no service rows after its header, `docker ps` contains only unrelated `sub2api-*` rows, and `lsof 3211/6379` has no listener output | `/Users/hanlife02/code/daily-arxiv/.omo/ulw-loop/evidence/cleanup.log` |
| A7 | QA record | This manual QA matrix and recorded exact invocations/verdicts | `/Users/hanlife02/code/daily-arxiv/.omo/evidence/quick-final-qa-recheck/manualQa.md` |

## Self Review

Held at LIGHT: no code or product behavior was changed; every requested claim was verified directly against the named artifact files; each PASS references a non-empty source artifact.
