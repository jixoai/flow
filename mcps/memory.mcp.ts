#!/usr/bin/env -S deno run -A --no-config
/**
 * Memory MCP Server
 *
 * Atomic operations for memory management:
 * - Record memories to project/user directories
 * - Search and retrieve memories
 * - List all memories
 */

import {
  type AnyTypedTool,
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";
import { join } from "jsr:@std/path";
import { exists } from "jsr:@std/fs/exists";
import { expandGlob } from "jsr:@std/fs/expand-glob";

const MCP_NAME = "memory";

// =============================================================================
// Paths
// =============================================================================

const USER_MEMORY_DIR = join(Deno.env.get("HOME") || "~", ".claude", ".memory");
const getProjectMemoryDir = (cwd?: string) =>
  join(cwd || Deno.cwd(), ".claude", ".memory");

function formatTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}

// =============================================================================
// Core Functions (exported for programmatic use)
// =============================================================================

export async function recordMemory(
  content: string,
  options: { tags?: string[]; cwd?: string; userRelated?: boolean } = {},
): Promise<{ projectPath: string; userPath?: string }> {
  const timestamp = formatTimestamp();
  const tagStr = options.tags?.length ? `_${options.tags.join("-")}` : "";
  const filename = `${timestamp}${tagStr}.md`;

  // Save to project memory
  const projectDir = getProjectMemoryDir(options.cwd);
  await ensureDir(projectDir);
  const projectPath = join(projectDir, filename);
  await Deno.writeTextFile(projectPath, content);

  // Check if user-related
  const userRelatedKeywords = [
    "user",
    "preference",
    "habit",
    "personal",
    "style",
    "config",
  ];
  const isUserRelated = options.userRelated ??
    userRelatedKeywords.some((kw) => content.toLowerCase().includes(kw));

  let userPath: string | undefined;
  if (isUserRelated) {
    await ensureDir(USER_MEMORY_DIR);
    userPath = join(USER_MEMORY_DIR, filename);
    await Deno.writeTextFile(userPath, content);
  }

  return { projectPath, userPath };
}

export async function searchMemories(
  query: string,
  options: { cwd?: string; limit?: number } = {},
): Promise<
  Array<
    { path: string; content: string; score: number; source: "project" | "user" }
  >
> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/);
  const results: Array<
    { path: string; content: string; score: number; source: "project" | "user" }
  > = [];

  async function searchDir(dir: string, source: "project" | "user") {
    if (!(await exists(dir))) return;
    for await (const entry of expandGlob("*.md", { root: dir })) {
      if (!entry.isFile) continue;
      const content = await Deno.readTextFile(entry.path);
      const contentLower = content.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (contentLower.includes(term)) score++;
      }
      if (score > 0) {
        results.push({ path: entry.path, content, score, source });
      }
    }
  }

  // Search project first
  await searchDir(getProjectMemoryDir(options.cwd), "project");
  // Then user memories
  await searchDir(USER_MEMORY_DIR, "user");

  // Sort by score descending, deduplicate by content
  results.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const hash = r.content.slice(0, 100);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });

  return deduped.slice(0, options.limit || 20);
}

export async function listMemories(
  options: {
    cwd?: string;
    source?: "project" | "user" | "all";
    limit?: number;
  } = {},
): Promise<
  Array<
    {
      path: string;
      filename: string;
      source: "project" | "user";
      modifiedAt: string;
    }
  >
> {
  const results: Array<
    {
      path: string;
      filename: string;
      source: "project" | "user";
      modifiedAt: string;
    }
  > = [];

  async function listDir(dir: string, source: "project" | "user") {
    if (!(await exists(dir))) return;
    for await (const entry of expandGlob("*.md", { root: dir })) {
      if (!entry.isFile) continue;
      const stat = await Deno.stat(entry.path);
      results.push({
        path: entry.path,
        filename: entry.name,
        source,
        modifiedAt: stat.mtime?.toISOString() || "",
      });
    }
  }

  const src = options.source || "all";
  if (src === "project" || src === "all") {
    await listDir(getProjectMemoryDir(options.cwd), "project");
  }
  if (src === "user" || src === "all") {
    await listDir(USER_MEMORY_DIR, "user");
  }

  results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return results.slice(0, options.limit || 50);
}

export async function deleteMemory(path: string): Promise<boolean> {
  try {
    await Deno.remove(path);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// System Prompts (exported for workflows)
// =============================================================================

export const MEMORY_SYSTEM_PROMPT =
  `You are Memory - a professional recorder and reporter.

## ROLE
Record and retrieve memories objectively without summarization or modification.

## RECORDING GUIDELINES
- Record factual, objective content
- Include context: date, source, relevance
- Use tags for categorization
- User-related content goes to both project and user directories

## SEARCHING GUIDELINES
- Search project memories first (more specific)
- Fall back to user memories (more general)
- Return results without modification or summarization
- Include source path for reference`;

export const MEMORY_RECORD_PROMPT = `Record the following content to memory.
Determine appropriate tags based on content.
If content relates to user preferences/habits, mark as user-related.`;

export const MEMORY_SEARCH_PROMPT = `Search memories for relevant information.
Return matching results with their source paths.
Do not summarize - return original content.`;

// =============================================================================
// Tool Definitions
// =============================================================================

const recordMemoryTool = defineTool({
  name: "memory_record",
  description:
    "Record content to memory files. Saves to project directory, and optionally to user directory if user-related.",
  inputSchema: z.object({
    content: z.string().describe("Content to record"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    cwd: z.string().optional().describe("Working directory for project memory"),
    userRelated: z.boolean().optional().describe(
      "Force save to user memory directory",
    ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    projectPath: z.string(),
    userPath: z.string().optional(),
  }),
  handler: async (input) => {
    const result = await recordMemory(input.content, input);
    return { success: true, ...result };
  },
});

const searchMemoriesTool = defineTool({
  name: "memory_search",
  description:
    "Search memories by query terms. Returns matching content with scores.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    cwd: z.string().optional().describe("Working directory for project memory"),
    limit: z.number().optional().default(20).describe("Max results to return"),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      path: z.string(),
      content: z.string(),
      score: z.number(),
      source: z.enum(["project", "user"]),
    })),
    totalFound: z.number(),
  }),
  handler: async (input) => {
    const results = await searchMemories(input.query, input);
    return { results, totalFound: results.length };
  },
});

const listMemoriesTool = defineTool({
  name: "memory_list",
  description: "List all memory files.",
  inputSchema: z.object({
    cwd: z.string().optional().describe("Working directory for project memory"),
    source: z.enum(["project", "user", "all"]).optional().default("all"),
    limit: z.number().optional().default(50),
  }),
  outputSchema: z.object({
    memories: z.array(z.object({
      path: z.string(),
      filename: z.string(),
      source: z.enum(["project", "user"]),
      modifiedAt: z.string(),
    })),
    totalCount: z.number(),
  }),
  handler: async (input) => {
    const memories = await listMemories(input);
    return { memories, totalCount: memories.length };
  },
});

const deleteMemoryTool = defineTool({
  name: "memory_delete",
  description: "Delete a memory file by path.",
  inputSchema: z.object({
    path: z.string().describe("Full path to memory file"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedPath: z.string(),
  }),
  handler: async ({ path }) => {
    const success = await deleteMemory(path);
    return { success, deletedPath: path };
  },
});

const getMemoryPathsTool = defineTool({
  name: "memory_get_paths",
  description: "Get memory directory paths for current context.",
  inputSchema: z.object({
    cwd: z.string().optional().describe("Working directory"),
  }),
  outputSchema: z.object({
    projectMemoryDir: z.string(),
    userMemoryDir: z.string(),
  }),
  handler: async ({ cwd }) => ({
    projectMemoryDir: getProjectMemoryDir(cwd),
    userMemoryDir: USER_MEMORY_DIR,
  }),
});

export const allTools: AnyTypedTool[] = [
  recordMemoryTool,
  searchMemoriesTool,
  listMemoriesTool,
  deleteMemoryTool,
  getMemoryPathsTool,
];

// =============================================================================
// Server Setup
// =============================================================================

export const server = createMcpServer({
  name: MCP_NAME,
  version: "1.0.0",
  description: "Memory management MCP - record and retrieve memories",
  tools: allTools,
  autoStart: false,
  debug: true,
});

if (import.meta.main) {
  const args = parseCliArgs();
  if (args.help) {
    printMcpHelp(MCP_NAME, "Memory Management MCP Server");
    Deno.exit(0);
  }
  server.start();
}
