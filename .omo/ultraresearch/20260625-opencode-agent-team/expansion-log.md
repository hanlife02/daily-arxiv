# Expansion Log

## Phase 0

Core question: install and configure a well-regarded OpenCode agent team setup for the user.

Axes:
- Official OpenCode OMO Team Mode: source of truth for `team_mode`, team specs, tools, and constraints.
- Public ecosystem alternatives: compare npm packages that advertise OpenCode agent/team orchestration.
- Local installation state: verify whether OpenCode and OMO are already installed and where config lives.
- Practical configuration: choose a low-conflict setup that the user can start from OpenCode immediately.

## Wave 1

Sources checked:
- OMO Team Mode guide from `code-yeongyu/oh-my-openagent`.
- npm package metadata and last-month download counts for OMO and OpenCode team plugins.
- GitHub repository metadata for OMO, Ensemble, team-memory, agent-team, and opencode-crew.
- Local OpenCode config under `/Users/hanlife02/.config/opencode`.

Key leads:
- OMO is already installed in OpenCode config and has far higher public adoption than independent team plugins.
- OMO Team Mode is disabled by default and requires `team_mode.enabled = true`.
- `opencode-team-memory` is an add-on specifically for OpenCode + OMO Team Mode memory.
- `@hueyexe/opencode-ensemble` is a credible independent team plugin with dashboard and worktree flow, but overlaps with OMO's own team tools.

Closed leads:
- `@ogdev/opencode-crew` is a full alternative harness derived from OMO ideas, not a small team-mode add-on; stacking it with OMO is risky.
- `opencode-agent-team` has lower public adoption and a separate Role + Worker model; not the best first default for this user's existing OMO setup.
