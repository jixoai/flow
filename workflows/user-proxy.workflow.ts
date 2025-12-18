#!/usr/bin/env -S deno run -A --no-config
/**
 * User Proxy Workflow - User preferences consultation
 *
 * Mode: 多模式 (Multi-mode)
 * - prefs/validate: 编程驱动 (直接查询)
 * - consult/review: AI 驱动 (咨询和审查)
 */

import { defineWorkflow } from "./shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import {
  USER_PREFERENCES,
  USER_PROXY_SYSTEM_PROMPT,
  USER_RULES_MARKDOWN,
  validateCodeStyle,
  validateTechChoice,
} from "../mcps/user-proxy.mcp.ts";
import { getMcpServerConfig } from "../common/paths.ts";

// Re-export for other modules
export {
  USER_PREFERENCES,
  USER_RULES_MARKDOWN,
  validateCodeStyle,
  validateTechChoice,
};

// =============================================================================
// Subflows - 编程驱动
// =============================================================================

const prefsWorkflow = defineWorkflow({
  name: "prefs",
  description: "Show user preferences (programmatic)",
  args: {
    category: {
      type: "string",
      alias: "c",
      description:
        "Category: typescript, testing, frontend, backend, build, validation, formatting",
    },
    json: { type: "boolean", description: "Output as JSON", default: true },
  },
  handler: async (args) => {
    const category = args.category;

    if (category && category !== "all") {
      const prefs = (USER_PREFERENCES as Record<string, unknown>)[category];
      if (prefs) {
        console.log(JSON.stringify(prefs, null, 2));
      } else {
        console.error(`Unknown category: ${category}`);
        console.log(
          "Available: typescript, testing, frontend, backend, build, validation, formatting",
        );
        Deno.exit(1);
      }
    } else {
      console.log(JSON.stringify(USER_PREFERENCES, null, 2));
    }
  },
});

const validateWorkflow = defineWorkflow({
  name: "validate",
  description: "Validate tech choice against user preferences",
  args: {
    tech: {
      type: "string",
      alias: "t",
      description: "Technology name",
      required: true,
    },
    category: {
      type: "string",
      alias: "c",
      description: "Category to validate against",
      required: true,
    },
  },
  handler: async (args) => {
    const result = validateTechChoice(args.tech, args.category);
    console.log(JSON.stringify(result, null, 2));
  },
});

const rulesWorkflow = defineWorkflow({
  name: "rules",
  description: "Show user rules as markdown",
  handler: async () => {
    console.log(USER_RULES_MARKDOWN);
  },
});

// =============================================================================
// Subflows - AI 驱动
// =============================================================================

const consultWorkflow = defineWorkflow({
  name: "consult",
  description: "AI consultation for tech decisions",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Question to consult",
      required: true,
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error("[user-proxy:consult] Starting consultation...");

    const fullPrompt = `CONSULTATION REQUEST:\n\n${args.prompt}`;

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: fullPrompt,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const mcpServers = { "user-proxy": await getMcpServerConfig("user-proxy") };
    const result = await createAiQueryBuilder()
      .prompt(fullPrompt)
      .systemPrompt(USER_PROXY_SYSTEM_PROMPT)
      .mcpServers(mcpServers)
      .allowTools([
        "mcp__user-proxy__user_get_preferences",
        "mcp__user-proxy__user_get_coding_style",
        "mcp__user-proxy__user_validate_tech",
        "mcp__user-proxy__user_validate_style",
        "mcp__user-proxy__user_consult",
        "Read",
        "Glob",
        "Grep",
      ])
      .disallowTools(["Write", "Edit", "Bash", "WebSearch", "WebFetch", "Task"])
      .permissionMode("default")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[user-proxy:consult] Done. Cost: $${
          result.totalCostUsd.toFixed(4)
        }`
        : `\n[user-proxy:consult] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});

const reviewWorkflow = defineWorkflow({
  name: "review",
  description: "AI code/design review based on user preferences",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Content to review",
      required: true,
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error("[user-proxy:review] Starting review...");

    const fullPrompt = `CODE/DESIGN REVIEW REQUEST:\n\n${args.prompt}`;

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: fullPrompt,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const mcpServers = { "user-proxy": await getMcpServerConfig("user-proxy") };
    const result = await createAiQueryBuilder()
      .prompt(fullPrompt)
      .systemPrompt(USER_PROXY_SYSTEM_PROMPT)
      .mcpServers(mcpServers)
      .allowTools([
        "mcp__user-proxy__user_get_preferences",
        "mcp__user-proxy__user_get_coding_style",
        "mcp__user-proxy__user_validate_tech",
        "mcp__user-proxy__user_validate_style",
        "Read",
        "Glob",
        "Grep",
      ])
      .disallowTools(["Write", "Edit", "Bash", "WebSearch", "WebFetch", "Task"])
      .permissionMode("default")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[user-proxy:review] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[user-proxy:review] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});

// =============================================================================
// Main Workflow
// =============================================================================

export const workflow = defineWorkflow({
  name: "user-proxy",
  description: "User preferences - query, validate, consult, or review",
  subflows: [
    prefsWorkflow,
    validateWorkflow,
    rulesWorkflow,
    consultWorkflow,
    reviewWorkflow,
  ],
  examples: [
    ["user-proxy prefs", "Show all preferences"],
    ["user-proxy prefs -c typescript", "Show TypeScript preferences"],
    ["user-proxy validate -t vitest -c testing", "Validate tech choice"],
    ["user-proxy rules", "Show rules as markdown"],
    ["user-proxy consult -p '应该用 Zustand 还是 Jotai?'", "AI consultation"],
    ["user-proxy review -p 'Review this API design...'", "AI code review"],
  ],
  autoStart: import.meta.main,
});
