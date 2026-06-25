# Ultraresearch Synthesis: OpenCode Agent Team Setup

## Executive summary

The best default for this machine is to use the official OMO Team Mode already present in the user's OpenCode config, then add `opencode-team-memory` as a focused persistence add-on. OMO has the strongest adoption signal among the checked options: npm reports 258,209 last-month downloads for `oh-my-openagent` plus 250,177 for the legacy `oh-my-opencode` package, and GitHub API reports 63,489 stars and 5,179 forks for `code-yeongyu/oh-my-openagent` as checked on 2026-06-25.

Independent team plugins exist, but they are not the safest default for this installation. `@hueyexe/opencode-ensemble` is credible and active, with 1,030 last-month downloads, 146 GitHub stars, its own dashboard, and explicit peer-to-peer team tools. It is a good second option if the user wants a separate dashboard/worktree workflow. `opencode-team-memory` has 2,917 last-month downloads and is specifically scoped to persistent role memory for OpenCode + OMO Team Mode, so it composes with OMO instead of replacing it.

## Findings by theme

OMO official Team Mode:
- Official docs say Team Mode is off by default and is enabled by adding `team_mode.enabled: true` to `~/.config/opencode/oh-my-openagent.jsonc` or project config, then restarting OpenCode.
- The same docs say enabling exposes 12 `team_*` tools, including `team_create`, `team_send_message`, `team_task_create`, `team_status`, and `team_list`.
- Team specs live under `~/.omo/teams/{name}/config.json` or `<project>/.omo/teams/{name}/config.json`.
- Eligible team agents are `sisyphus`, `atlas`, `sisyphus-junior`, and conditional `hephaestus`; hard-rejected agents include `oracle`, `librarian`, `explore`, `metis`, `momus`, and `prometheus`.

Ensemble:
- README describes “parallel agents with peer-to-peer communication, shared tasks, and coordinated execution.”
- It adds 14 tools and a dashboard at `http://localhost:4747`.
- It requires a pinned plugin entry such as `@hueyexe/opencode-ensemble@0.15.0` and external-directory permissions for worktrees.
- Because it defines its own team lifecycle and tool names, it should not be installed as the default while OMO Team Mode is already present unless the user explicitly wants the Ensemble dashboard.

Team memory:
- README describes three tools: `role_memory_save`, `role_memory_load`, and `role_memory_clear`.
- It stores role context under `<project>/.omo/team-memory/{role}/context.json` by default.
- It is explicitly built for OpenCode + OMO Team Mode.

Local state:
- OpenCode is installed at `/Users/hanlife02/.opencode/bin/opencode`, version `1.15.13`.
- User config already includes `oh-my-openagent@latest`.
- `~/.config/opencode/oh-my-openagent.json` exists but did not contain `team_mode`.
- No existing `codeteam`, `team_mode`, `opencode-team-memory`, or Ensemble config was found before edits.

## Decision

Configure this stack:
- Enable OMO Team Mode globally.
- Add pinned `opencode-team-memory@1.6.3` globally.
- Define a global OMO team named `codeteam`.
- Do not install `@hueyexe/opencode-ensemble` by default, to avoid overlapping team toolchains in the first OpenCode setup.

## Sources

1. OMO Team Mode guide: https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/docs/guide/team-mode.md
2. OMO npm metadata: `oh-my-openagent@4.13.0`, `oh-my-opencode@4.13.0`; npm downloads API checked 2026-06-25.
3. OMO GitHub API: `code-yeongyu/oh-my-openagent`, checked 2026-06-25.
4. Ensemble README: https://raw.githubusercontent.com/hueyexe/opencode-ensemble/main/README.md
5. Ensemble npm/GitHub metadata: `@hueyexe/opencode-ensemble@0.15.1`, checked 2026-06-25.
6. Team Memory README: https://raw.githubusercontent.com/KenKozuma/opencode-team-memory/master/README.md
7. Team Memory npm/GitHub metadata: `opencode-team-memory@1.6.3`, checked 2026-06-25.
