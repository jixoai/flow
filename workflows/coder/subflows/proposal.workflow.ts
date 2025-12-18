/**
 * Coder Proposal Subflow - Create OpenSpec change proposal
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow } from "../../shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../../../mcps/ai.mcp.ts";
import { USER_RULES_MARKDOWN } from "../../../mcps/user-proxy.mcp.ts";
import { OPENSPEC_PROPOSAL_PROMPT } from "../../../mcps/openspec.mcp.ts";
import { getMcpServerConfig } from "../../../common/paths.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../prompts");

async function loadSystemPrompt(): Promise<string> {
  const base = await Deno.readTextFile(join(PROMPTS_DIR, "system.md"));
  return base + "\n\n" + USER_RULES_MARKDOWN;
}

export const workflow = defineWorkflow({
  name: "proposal",
  description: "Create OpenSpec change proposal",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Change description",
      required: true,
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error("[coder:proposal] Starting OpenSpec proposal...");
    const systemPrompt = await loadSystemPrompt();
    const fullPrompt = OPENSPEC_PROPOSAL_PROMPT + "\n\n## REQUEST:\n" +
      args.prompt;

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
        "mcp__openspec__openspec_list_specs",
        "mcp__openspec__openspec_validate",
        "mcp__openspec__openspec_show",
        "mcp__openspec__openspec_show_spec",
        "mcp__openspec__openspec_search_requirements",
        "Read",
        "Write",
        "Edit",
        "MultiEdit",
        "Glob",
        "Grep",
        "Bash",
      ])
      .disallowTools(["WebSearch", "WebFetch", "Task"])
      .permissionMode("acceptEdits")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[coder:proposal] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[coder:proposal] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});
