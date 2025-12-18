#!/usr/bin/env -S deno run -A --no-config
/**
 * Memory Workflow - AI-assisted memory management
 *
 * Mode: 多模式 (Multi-mode)
 * - record/remember: 编程驱动 (直接调用)
 * - ai: AI 驱动 (通过 --prompt)
 */

import { defineWorkflow } from "./shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import {
  listMemories,
  MEMORY_SYSTEM_PROMPT,
  recordMemory,
  searchMemories,
} from "../mcps/memory.mcp.ts";
import { getMcpServerConfig } from "../common/paths.ts";

// =============================================================================
// Subflows - 编程驱动
// =============================================================================

const recordWorkflow = defineWorkflow({
  name: "record",
  description: "Record a new memory (programmatic)",
  args: {
    content: {
      type: "string",
      alias: "c",
      description: "Content to record",
      required: true,
    },
    tags: { type: "string", alias: "t", description: "Comma-separated tags" },
    user: {
      type: "boolean",
      alias: "u",
      description: "Also save to user memory",
      default: false,
    },
  },
  handler: async (args) => {
    const tags = args.tags ? args.tags.split(",").map((t) => t.trim()) : [];
    const result = await recordMemory(args.content, {
      tags,
      userRelated: args.user,
    });
    console.log(`Recorded to: ${result.projectPath}`);
    if (result.userPath) {
      console.log(`Also saved to user: ${result.userPath}`);
    }
  },
});

const rememberWorkflow = defineWorkflow({
  name: "remember",
  description: "Search memories by query (programmatic)",
  args: {
    query: {
      type: "string",
      alias: "q",
      description: "Search query",
      required: true,
    },
    limit: {
      type: "number",
      alias: "l",
      description: "Max results",
      default: 10,
    },
  },
  handler: async (args) => {
    const results = await searchMemories(args.query);
    if (results.length === 0) {
      console.log(`No memories found for: "${args.query}"`);
      return;
    }
    console.log(`Found ${results.length} memory file(s):\n`);
    for (const r of results.slice(0, args.limit)) {
      console.log(`## ${r.path} (score: ${r.score}, source: ${r.source})\n`);
      console.log(r.content);
      console.log("\n---\n");
    }
  },
});

const listWorkflow = defineWorkflow({
  name: "list",
  description: "List all memory files",
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  handler: async (args) => {
    const memories = await listMemories();
    if (args.json) {
      console.log(JSON.stringify(memories, null, 2));
    } else {
      console.log(`Found ${memories.length} memory files:\n`);
      for (const m of memories) {
        console.log(`- [${m.source}] ${m.path}`);
      }
    }
  },
});

// =============================================================================
// Subflow - AI 驱动
// =============================================================================

const aiWorkflow = defineWorkflow({
  name: "ai",
  description: "AI-assisted memory operations",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "AI prompt",
      required: true,
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error("[memory:ai] Starting AI-assisted operation...");

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: args.prompt,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const mcpServers = { memory: await getMcpServerConfig("memory") };
    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .systemPrompt(MEMORY_SYSTEM_PROMPT)
      .mcpServers(mcpServers)
      .allowTools([
        "mcp__memory__memory_record",
        "mcp__memory__memory_search",
        "mcp__memory__memory_list",
        "mcp__memory__memory_delete",
        "mcp__memory__memory_get_paths",
        "Read",
        "Glob",
      ])
      .disallowTools(["WebSearch", "WebFetch", "Task", "Bash", "Write"])
      .permissionMode("acceptEdits")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[memory:ai] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[memory:ai] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});

// =============================================================================
// Main Workflow
// =============================================================================

export const workflow = defineWorkflow({
  name: "memory",
  description: "Memory management - record, search, list, or AI-assisted",
  subflows: [
    recordWorkflow,
    rememberWorkflow,
    listWorkflow,
    aiWorkflow,
  ],
  examples: [
    ["memory record -c 'Important insight about X'", "Record a memory"],
    ["memory record -c 'User prefers Y' -u", "Record to user memory too"],
    ["memory remember -q 'database'", "Search memories"],
    ["memory list", "List all memories"],
    ["memory ai -p '整理关于项目架构的记忆'", "AI-assisted operation"],
  ],
  autoStart: import.meta.main,
});

// Re-export for programmatic use
export { listMemories, recordMemory, searchMemories };
