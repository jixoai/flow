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

import { defineWorkflow, type SubflowDef } from "./shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { USER_RULES_MARKDOWN } from "../mcps/user-proxy.mcp.ts";
import {
  getBuiltinVars,
  readAndRenderPrompt,
  readPrompt,
} from "../common/prompt-loader.ts";
import { mergeToolsConfig } from "../common/tools-merger.ts";
import { getContextWorkflowConfig } from "../common/async-context.ts";
import type { CoderConfig } from "./shared/workflow-config.schema.ts";

// =============================================================================
// Constants
// =============================================================================

/** 默认允许的工具 */
const DEFAULT_ALLOW_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "Bash",
  "Task",
];

/** 默认禁用的工具 */
const DEFAULT_DISALLOW_TOOLS = ["WebSearch", "WebFetch"];

// =============================================================================
// Prompt Loading
// =============================================================================

/**
 * 加载 system prompt
 *
 * 优先级: user/prompts/coder/ > workflows/coder/prompts/
 */
async function loadSystemPrompt(): Promise<string> {
  // 尝试使用 prompt-loader
  const vars = {
    ...getBuiltinVars(),
    USER_RULES: USER_RULES_MARKDOWN,
  };

  const rendered = await readAndRenderPrompt("coder", vars);
  if (rendered) {
    return rendered;
  }

  // 回退到直接读取（兼容旧逻辑）
  const base = await readPrompt("coder");
  return (base ?? "") + "\n\n" + USER_RULES_MARKDOWN;
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

      // 获取用户配置
      const config = getContextWorkflowConfig<CoderConfig>("coder");

      // 合并工具配置
      const { allow, disallow } = mergeToolsConfig(
        DEFAULT_ALLOW_TOOLS,
        DEFAULT_DISALLOW_TOOLS,
        config?.tools,
      );

      // 获取权限模式
      const permissionMode = config?.permissionMode ?? "acceptEdits";

      // 加载提示词
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

      const result = await createAiQueryBuilder()
        .prompt(args.prompt)
        .systemPrompt(finalPrompt)
        .allowTools(allow)
        .disallowTools(disallow)
        .permissionMode(permissionMode)
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
