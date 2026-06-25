import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const home = homedir();
const opencodeConfigPath = join(home, ".config", "opencode", "opencode.jsonc");
const omoConfigPath = join(home, ".config", "opencode", "oh-my-openagent.json");
const teamConfigPath = join(home, ".omo", "teams", "codeteam", "config.json");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak.${stamp}`);
  }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const opencodeConfig = readJson(opencodeConfigPath);
const pluginList = Array.isArray(opencodeConfig.plugin) ? opencodeConfig.plugin : [];
const normalizedPlugins = pluginList.filter((plugin) => {
  return typeof plugin !== "string" || !plugin.startsWith("opencode-team-memory");
});

if (!normalizedPlugins.some((plugin) => plugin === "oh-my-openagent@latest" || plugin.startsWith("oh-my-openagent@"))) {
  normalizedPlugins.unshift("oh-my-openagent@latest");
}

normalizedPlugins.push("opencode-team-memory@1.6.3");
opencodeConfig.plugin = [...new Set(normalizedPlugins)];
writeJson(opencodeConfigPath, opencodeConfig);

const omoConfig = readJson(omoConfigPath);
omoConfig.team_mode = {
  enabled: true,
  tmux_visualization: false,
  max_parallel_members: 4,
  max_members: 8,
  max_messages_per_run: 10000,
  max_wall_clock_minutes: 120,
  max_member_turns: 500,
  message_payload_max_bytes: 32768,
  recipient_unread_max_bytes: 262144,
  mailbox_poll_interval_ms: 3000,
};
writeJson(omoConfigPath, omoConfig);

const memoryProtocol = `Persistent memory protocol: if role_memory_load is available, load your own role before work and role_memory_save before handoff; if the tool is unavailable, continue and report that memory was skipped.`;

const teamConfig = {
  name: "codeteam",
  description:
    "General-purpose OpenCode OMO team for repository work: exploration, implementation, QA, and risk review coordinated through OMO Team Mode.",
  lead: { kind: "subagent_type", subagent_type: "sisyphus" },
  members: [
    {
      kind: "category",
      name: "scout",
      category: "deep",
      prompt:
        `${memoryProtocol}\nRole: codebase scout. Own repository exploration, affected files, existing tests, and implementation risks. Do not edit files. Report concise paths, call chains, and the smallest safe plan to the lead.`,
    },
    {
      kind: "category",
      name: "builder",
      category: "deep",
      prompt:
        `${memoryProtocol}\nRole: implementation owner. Edit only files explicitly assigned by the lead. Keep changes narrow, preserve user edits, run focused automated checks, and send implementation notes plus changed paths back to the lead.`,
    },
    {
      kind: "category",
      name: "qa",
      category: "quick",
      prompt:
        `${memoryProtocol}\nRole: QA executor. Own real-surface verification, smoke commands, fixtures, and regression checks. Default to read-only unless the lead explicitly assigns a QA fix. Report exact commands, pass/fail evidence, and cleanup status.`,
    },
    {
      kind: "category",
      name: "reviewer",
      category: "ultrabrain",
      prompt:
        `${memoryProtocol}\nRole: risk reviewer. Review the final diff, tests, and QA evidence for correctness, security, stale state, missing cases, and accidental scope creep. Do not edit files. Return findings ordered by severity.`,
    },
  ],
};
writeJson(teamConfigPath, teamConfig);

console.log(JSON.stringify({
  updated: [opencodeConfigPath, omoConfigPath, teamConfigPath],
  plugins: opencodeConfig.plugin,
  teamMode: omoConfig.team_mode,
  team: teamConfig.name,
}, null, 2));
