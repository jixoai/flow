#!/usr/bin/env -S deno run -A --no-config
/**
 * Coder Workflow - Professional programmer agent using OpenSpec methodology
 *
 * Mode: 多模式 (Multi-mode)
 * - run: 默认 AI 编程模式
 * - proposal/apply/archive: OpenSpec 工作流
 *
 * 替代原 agents/coder.md
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow, type SubflowDef } from "./shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { USER_RULES_MARKDOWN } from "../mcps/user-proxy.mcp.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "coder/prompts");

// Load system prompt
async function loadSystemPrompt(): Promise<string> {
  const base = await Deno.readTextFile(join(PROMPTS_DIR, "system.md"));
  return base + "\n\n" + USER_RULES_MARKDOWN;
}

// Lazy load subflows
const subflows: SubflowDef[] = [
  () => import("./coder/subflows/run.workflow.ts").then((m) => m.workflow),
  () => import("./coder/subflows/proposal.workflow.ts").then((m) => m.workflow),
  () => import("./coder/subflows/apply.workflow.ts").then((m) => m.workflow),
  () => import("./coder/subflows/archive.workflow.ts").then((m) => m.workflow),
];

export const workflow = defineWorkflow({
  name: "coder",
  description:
    "Professional programmer agent - coding tasks, OpenSpec methodology",
  subflows,
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Task description (shortcut for 'run')",
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  examples: [
    ["coder run -p 'Implement feature X'", "Execute coding task"],
    ["coder -p 'Fix bug in Y'", "Shortcut for 'coder run -p ...'"],
    ["coder proposal -p 'Add new API endpoint'", "Create OpenSpec proposal"],
    ["coder apply -c CHANGE-001", "Apply OpenSpec change"],
    ["coder archive -c CHANGE-001", "Archive completed change"],
  ],
  handler: async (args) => {
    if (args.prompt) {
      console.error("[coder] Starting (default mode)...");
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
          ? `\n[coder] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
          : `\n[coder] Failed: ${result.error}`,
      );
      if (!result.success) Deno.exit(1);
    } else {
      console.error(
        "Error: Specify a subflow or use --prompt for default mode",
      );
      console.error("Use --help for usage information");
      Deno.exit(1);
    }
  },
  autoStart: import.meta.main,
});

export { loadSystemPrompt };
