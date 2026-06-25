# Reviewer QA Notepad

Skills: manual QA executor instructions; no product-code skills because this is read-only QA, not implementation.
Tier: HEAVY - user requested final manual QA review across happy, edge, regression, and cleanup evidence.

Success criteria:
- S1 happy CLI exits 0 and output markdown contains arXiv 2606.12345 plus Chinese summary.
- S2 missing LLM configuration exits non-zero and prints LLM env guidance.
- S3 quality regression artifact is non-empty and records passed quality command.
- Cleanup confirms no relevant tmux/server/container/browser leftovers.

Results:
- S1 PASS: fresh CLI log has exit_code=0; Markdown is 668 bytes and contains arXiv ID 2606.12345 with Chinese summary.
- S2 PASS: fresh CLI log has exit_code=1 and LLM env guidance.
- S3 PASS: quality.log is 6919 bytes and shows typecheck, 24 test files / 135 tests passed, production build, and "Quality gate passed."
- S4 FAIL: docker ps shows daily-arxiv-worker-1, daily-arxiv-app-1, and daily-arxiv-redis-1 still running; lsof shows OrbStack listening on daily-arxiv-related ports 3211 and 6379.

Final verdict: REJECT due cleanup blocker.
