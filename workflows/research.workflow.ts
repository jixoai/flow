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

import { defineWorkflow, type SubflowDef } from "./shared/base-workflow.ts";
import { getMcpServerConfigs, getResearchDir } from "../common/paths.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { ensureReportDir, generateReportId } from "./research/helpers.ts";
import {
  getBuiltinVars,
  readAndRenderPrompt,
  readPrompt,
} from "../common/prompt-loader.ts";
import { mergeToolsConfig } from "../common/tools-merger.ts";
import { getContextWorkflowConfig } from "../common/async-context.ts";
import type { ResearchConfig } from "./shared/workflow-config.schema.ts";

// =============================================================================
// Constants
// =============================================================================

/** 默认允许的工具 */
const DEFAULT_ALLOW_TOOLS = [
  "Read",
  "Write",
  "Glob",
  "Grep",
  "Bash",
  "mcp__search-duckduckgo__search_duckduckgo",
  "mcp__html2md__html_to_markdown",
];

/** 默认禁用的工具 */
const DEFAULT_DISALLOW_TOOLS = ["WebSearch", "WebFetch", "Task"];

// =============================================================================
// Prompt Loading
// =============================================================================

/**
 * 加载 system prompt
 *
 * 优先级: user/prompts/research/ > workflows/research/prompts/
 */
async function loadSystemPrompt(): Promise<string> {
  const vars = getBuiltinVars();
  const rendered = await readAndRenderPrompt("research", vars);
  if (rendered) return rendered;

  // 回退
  const base = await readPrompt("research");
  return base ?? "";
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

      // 获取用户配置
      const config = getContextWorkflowConfig<ResearchConfig>("research");

      // 合并工具配置
      const { allow, disallow } = mergeToolsConfig(
        DEFAULT_ALLOW_TOOLS,
        DEFAULT_DISALLOW_TOOLS,
        config?.tools,
      );

      // 获取权限模式
      const permissionMode = config?.permissionMode ?? "bypassPermissions";

      await Deno.mkdir(RESEARCH_BASE_DIR, { recursive: true });
      const systemPrompt = await loadSystemPrompt();

      // 添加自定义指令
      const finalPrompt = config?.prompts?.customInstructions
        ? systemPrompt + "\n\n## Custom Instructions\n\n" +
          config.prompts.customInstructions
        : systemPrompt;

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
        .systemPrompt(finalPrompt)
        .mcpServers(mcpServers)
        .allowTools(allow)
        .disallowTools(disallow)
        .permissionMode(permissionMode)
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
