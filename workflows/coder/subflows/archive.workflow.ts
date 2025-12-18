/**
 * Coder Archive Subflow - Archive completed OpenSpec change
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow } from "../../shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../../../mcps/ai.mcp.ts";
import { USER_RULES_MARKDOWN } from "../../../mcps/user-proxy.mcp.ts";
import { OPENSPEC_ARCHIVE_PROMPT } from "../../../mcps/openspec.mcp.ts";
import { getMcpServerConfig } from "../../../common/paths.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../prompts");

async function loadSystemPrompt(): Promise<string> {
  const base = await Deno.readTextFile(join(PROMPTS_DIR, "system.md"));
  return base + "\n\n" + USER_RULES_MARKDOWN;
}

export const workflow = defineWorkflow({
  name: "archive",
  description: "Archive completed OpenSpec change",
  args: {
    "change-id": {
      type: "string",
      alias: "c",
      description: "OpenSpec change ID",
      required: true,
    },
    prompt: { type: "string", alias: "p", description: "Additional notes" },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error(`[coder:archive] Archiving change ${args["change-id"]}...`);
    const systemPrompt = await loadSystemPrompt();
    const fullPrompt = OPENSPEC_ARCHIVE_PROMPT +
      "\n\n## CHANGE ID: " + args["change-id"] +
      (args.prompt ? "\n\n## NOTES:\n" + args.prompt : "");

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: fullPrompt,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const mcpServers = { openspec: await getMcpServerConfig("openspec") };
    const result = await createAiQueryBuilder()
      .prompt(fullPrompt)
      .systemPrompt(systemPrompt)
      .mcpServers(mcpServers)
      .allowTools([
        "mcp__openspec__openspec_list",
        "mcp__openspec__openspec_archive",
        "mcp__openspec__openspec_show",
        "mcp__openspec__openspec_validate",
        "Read",
        "Glob",
        "Grep",
      ])
      .disallowTools(["WebSearch", "WebFetch", "Task", "Write", "Edit"])
      .permissionMode("acceptEdits")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[coder:archive] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[coder:archive] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});
