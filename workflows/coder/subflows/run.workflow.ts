/**
 * Coder Run Subflow - Default AI coding mode
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow } from "../../shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../../../mcps/ai.mcp.ts";
import { USER_RULES_MARKDOWN } from "../../../mcps/user-proxy.mcp.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../prompts");

async function loadSystemPrompt(): Promise<string> {
  const base = await Deno.readTextFile(join(PROMPTS_DIR, "system.md"));
  return base + "\n\n" + USER_RULES_MARKDOWN;
}

export const workflow = defineWorkflow({
  name: "run",
  description: "Execute coding task with AI (default mode)",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Task description",
      required: true,
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error("[coder:run] Starting...");
    const systemPrompt = await loadSystemPrompt();

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: args.prompt,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .systemPrompt(systemPrompt)
      .allowTools([
        "Read",
        "Write",
        "Edit",
        "MultiEdit",
        "Glob",
        "Grep",
        "Bash",
        "Task",
      ])
      .disallowTools(["WebSearch", "WebFetch"])
      .permissionMode("acceptEdits")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[coder:run] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[coder:run] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});
