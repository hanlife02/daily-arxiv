import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const configPath = join(homedir(), ".config", "opencode", "oh-my-openagent.json");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const config = JSON.parse(readFileSync(configPath, "utf8"));

function rewriteModelMap(record) {
  for (const value of Object.values(record ?? {})) {
    if (!value || typeof value !== "object") continue;
    if (value.model === "openai/gpt-5.3-codex" || value.model === "openai/gpt-5.3") {
      value.model = "lynn/gpt-5.3-codex";
    }
  }
}

rewriteModelMap(config.agents);
rewriteModelMap(config.categories);

copyFileSync(configPath, `${configPath}.bak.${stamp}`);
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log("rewrote OpenAI model overrides to lynn/gpt-5.3-codex");
