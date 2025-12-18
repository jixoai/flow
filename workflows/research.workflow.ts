#!/usr/bin/env -S deno run -A --no-config
/**
 * Research Workflow - Execute research tasks using AI with search and HTML tools
 *
 * Mode: 多模式 (Multi-mode)
 * - run: 执行研究任务 (AI 驱动)
 * - list: 列出已有报告 (编程驱动)
 * - show: 显示报告内容 (编程驱动)
 * - clean: 清理旧报告 (编程驱动)
 *
 * 替代原 agents/runner.md
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow, type SubflowDef } from "./shared/base-workflow.ts";
import { getMcpServerConfigs, getResearchDir } from "../common/paths.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { ensureReportDir, generateReportId } from "./research/helpers.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "research/prompts");

// Load system prompt
async function loadSystemPrompt(): Promise<string> {
  return await Deno.readTextFile(join(PROMPTS_DIR, "system.md"));
}

// Lazy load subflows
const subflows: SubflowDef[] = [
  () => import("./research/subflows/run.workflow.ts").then((m) => m.workflow),
  () => import("./research/subflows/list.workflow.ts").then((m) => m.workflow),
  () => import("./research/subflows/show.workflow.ts").then((m) => m.workflow),
  () => import("./research/subflows/clean.workflow.ts").then((m) => m.workflow),
];

export const workflow = defineWorkflow({
  name: "research",
  description:
    "Research agent - web search, source collection, report generation",
  subflows,
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Research task (shortcut for 'run')",
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  examples: [
    ["research run -p '调查 AI 发展趋势'", "Execute research task"],
    [
      "research -p 'Compare React vs Vue'",
      "Shortcut for 'research run -p ...'",
    ],
    ["research list", "List all reports"],
    ["research show --id latest", "Show most recent report"],
    ["research clean --keep 5", "Keep only 5 most recent reports"],
  ],
  handler: async (args) => {
    if (args.prompt) {
      const RESEARCH_BASE_DIR = getResearchDir();
      console.error("[research] Starting...");
      console.error(`[research] Output: ${RESEARCH_BASE_DIR}`);

      await Deno.mkdir(RESEARCH_BASE_DIR, { recursive: true });
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

      const reportId = generateReportId(
        args.prompt.split(" ").slice(0, 3).join(" "),
      );
      const reportDir = await ensureReportDir(reportId);

      const mcpServers = await getMcpServerConfigs(
        "search-duckduckgo",
        "html2md",
      );
      const result = await createAiQueryBuilder()
        .prompt(
          `${args.prompt}\n\nCONTEXT:\n- Report directory: ${reportDir}\n- Write final report to: ${reportDir}/MAIN.md`,
        )
        .systemPrompt(systemPrompt)
        .mcpServers(mcpServers)
        .allowTools([
          "Read",
          "Write",
          "Glob",
          "Grep",
          "Bash",
          "mcp__search-duckduckgo__search_duckduckgo",
          "mcp__html2md__html_to_markdown",
        ])
        .disallowTools(["WebSearch", "WebFetch", "Task"])
        .permissionMode("bypassPermissions")
        .cwd(RESEARCH_BASE_DIR)
        .executeWithSession();

      console.log(result.output);
      console.error(
        result.success
          ? `\n[research] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
          : `\n[research] Failed: ${result.error}`,
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

export { ensureReportDir, generateReportId, loadSystemPrompt };
