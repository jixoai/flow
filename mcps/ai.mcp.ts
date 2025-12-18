#!/usr/bin/env -S deno run -A --no-config
/**
 * Unified AI MCP Server
 *
 * Wraps both Claude (ai-claude-code) and Codex (ai-codex).
 * Backend is selected at startup via --backend flag.
 *
 * Usage:
 *   deno run -A ai.mcp.ts --backend=claude    # Use Claude Agent SDK
 *   deno run -A ai.mcp.ts --backend=codex     # Use OpenAI Codex CLI
 *   deno run -A ai.mcp.ts                     # Default: claude
 */

import {
  type AnyTypedTool,
  createMcpServer,
  defineTool,
  z,
} from "./shared/base-mcp.ts";
import * as claude from "./ai-claude-code.mcp.ts";
import * as codex from "./ai-codex.mcp.ts";
import {
  deleteAllSessions,
  deleteSession,
  deleteSessionsOlderThan,
  extractTitle,
  findSessionById,
  generateSessionPath,
  listAllSessions,
  loadSession,
  saveSession,
  type SessionFile,
} from "./shared/session-manager.ts";

// =============================================================================
// Backend Selection (immutable after startup)
// =============================================================================

export type Backend = "claude" | "codex";

function parseBackend(): Backend {
  for (const arg of Deno.args) {
    if (arg.startsWith("--backend=")) {
      const value = arg.slice("--backend=".length);
      if (value === "claude" || value === "codex") return value;
      console.error(`[ai] Warning: Unknown backend "${value}", using claude`);
    }
  }
  return "claude";
}

export const BACKEND: Backend = parseBackend();
export const MCP_NAME = `ai-${BACKEND}`;

console.error(`[ai] Backend selected: ${BACKEND}`);

// =============================================================================
// Unified Query Interface
// =============================================================================

// MCP Server Config types (matching Claude SDK)
type McpServerConfig =
  | {
    type?: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> };

interface QueryOptions {
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  cwd?: string;
  maxTurns?: number;
  resume?: string;
  // Codex-specific
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  outputSchema?: string;
}

interface QueryResult {
  success: boolean;
  output: string;
  sessionId: string;
  model: string;
  numTurns: number;
  totalCostUsd: number;
  error?: string;
}

async function executeQuery(
  prompt: string,
  options: QueryOptions = {},
): Promise<QueryResult> {
  if (BACKEND === "claude") {
    return claude.executeQuery(prompt, options);
  } else {
    const result = await codex.executeQuery(prompt, {
      workingDirectory: options.cwd || options.workingDirectory,
      skipGitRepoCheck: options.skipGitRepoCheck,
      outputSchema: options.outputSchema,
    });
    return {
      success: result.success,
      output: result.output,
      sessionId: result.threadId,
      model: "codex",
      numTurns: 1,
      totalCostUsd: 0,
      error: result.error,
    };
  }
}

// =============================================================================
// Exported Programmatic API
// =============================================================================

export { executeQuery as aiQuery };

export async function aiQueryWithSession(
  options: QueryOptions & { prompt: string },
) {
  const cwd = options.cwd || options.workingDirectory || Deno.cwd();
  const result = await executeQuery(options.prompt, { ...options, cwd });

  const title = extractTitle(options.prompt);
  const sessionPath = generateSessionPath(MCP_NAME, title);

  const session: SessionFile = {
    metadata: {
      sessionId: result.sessionId,
      title,
      model: result.model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workingDirectory: cwd,
      turnCount: result.numTurns,
      totalCostUsd: result.totalCostUsd,
      lastPrompt: options.prompt,
      status: result.success ? "active" : "error",
    },
    history: [{
      timestamp: new Date().toISOString(),
      prompt: options.prompt,
      response: result.output,
      costUsd: result.totalCostUsd,
    }],
  };

  await saveSession(sessionPath, session);
  return { ...result, sessionPath };
}

export async function aiResume(
  options: { sessionId: string; prompt: string; maxTurns?: number },
) {
  if (BACKEND === "claude") {
    return claude.claudeResume(options);
  } else {
    const result = await codex.codexResume({
      threadId: options.sessionId,
      prompt: options.prompt,
    });
    return {
      success: result.success,
      output: result.output,
      sessionId: result.threadId,
      model: "codex",
      numTurns: 1,
      totalCostUsd: 0,
      error: result.error,
    };
  }
}

export function createAiQueryBuilder() {
  const opts: QueryOptions & { prompt: string } = { prompt: "" };
  return {
    prompt(p: string) {
      opts.prompt = p;
      return this;
    },
    model(m: string) {
      opts.model = m;
      return this;
    },
    systemPrompt(sp: string) {
      opts.systemPrompt = sp;
      return this;
    },
    allowTools(tools: string[]) {
      opts.allowedTools = tools;
      return this;
    },
    disallowTools(tools: string[]) {
      opts.disallowedTools = tools;
      return this;
    },
    mcpServers(s: Record<string, McpServerConfig>) {
      opts.mcpServers = s;
      return this;
    },
    permissionMode(m: "default" | "acceptEdits" | "bypassPermissions") {
      opts.permissionMode = m;
      return this;
    },
    cwd(d: string) {
      opts.cwd = d;
      return this;
    },
    maxTurns(t: number) {
      opts.maxTurns = t;
      return this;
    },
    skipGitRepoCheck(v: boolean) {
      opts.skipGitRepoCheck = v;
      return this;
    },
    outputSchema(s: string) {
      opts.outputSchema = s;
      return this;
    },
    async execute() {
      if (!opts.prompt) throw new Error("Prompt required");
      return executeQuery(opts.prompt, opts);
    },
    async executeWithSession() {
      if (!opts.prompt) throw new Error("Prompt required");
      return aiQueryWithSession(opts);
    },
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

const aiQueryTool = defineTool({
  name: "ai_query",
  description: `Execute an AI agent query using ${BACKEND}.`,
  inputSchema: z.object({
    prompt: z.string().describe("The prompt/instruction"),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions"])
      .optional(),
    cwd: z.string().optional(),
    maxTurns: z.number().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    sessionId: z.string(),
    model: z.string(),
    numTurns: z.number(),
    totalCostUsd: z.number(),
    backend: z.string(),
    error: z.string().optional(),
  }),
  handler: async (input) => {
    const result = await executeQuery(input.prompt, input);
    return { ...result, backend: BACKEND };
  },
});

const aiQueryWithSessionTool = defineTool({
  name: "ai_query_with_session",
  description: `Execute an AI query using ${BACKEND} and save session.`,
  inputSchema: z.object({
    prompt: z.string(),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions"])
      .optional(),
    cwd: z.string().optional(),
    maxTurns: z.number().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    sessionId: z.string(),
    sessionPath: z.string(),
    model: z.string(),
    numTurns: z.number(),
    totalCostUsd: z.number(),
    backend: z.string(),
    error: z.string().optional(),
  }),
  handler: async (input) => {
    const result = await aiQueryWithSession({ ...input, prompt: input.prompt });
    return { ...result, backend: BACKEND };
  },
});

const aiResumeTool = defineTool({
  name: "ai_resume",
  description: `Resume a previous ${BACKEND} session.`,
  inputSchema: z.object({
    sessionId: z.string(),
    prompt: z.string(),
    maxTurns: z.number().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    sessionId: z.string(),
    model: z.string(),
    numTurns: z.number(),
    totalCostUsd: z.number(),
    backend: z.string(),
    error: z.string().optional(),
  }),
  handler: async (input) => {
    const result = await aiResume(input);
    return { ...result, backend: BACKEND };
  },
});

const aiListSessionsTool = defineTool({
  name: "ai_list_sessions",
  description: "List all saved AI sessions.",
  inputSchema: z.object({ limit: z.number().optional().default(20) }),
  outputSchema: z.object({
    sessions: z.array(z.object({
      sessionId: z.string(),
      title: z.string(),
      model: z.string(),
      status: z.string(),
      turnCount: z.number(),
      totalCostUsd: z.number(),
      createdAt: z.string(),
      path: z.string(),
    })),
    backend: z.string(),
  }),
  handler: async ({ limit }) => {
    const sessions = await listAllSessions(MCP_NAME);
    return {
      sessions: sessions.slice(0, limit).map((s) => ({
        sessionId: s.metadata.sessionId,
        title: s.metadata.title,
        model: s.metadata.model || "unknown",
        status: s.metadata.status,
        turnCount: s.metadata.turnCount,
        totalCostUsd: s.metadata.totalCostUsd || 0,
        createdAt: s.metadata.createdAt,
        path: s.path,
      })),
      backend: BACKEND,
    };
  },
});

const aiGetSessionTool = defineTool({
  name: "ai_get_session",
  description: "Get detailed session information.",
  inputSchema: z.object({
    sessionId: z.string().optional(),
    sessionPath: z.string().optional(),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    session: z.unknown().optional(),
    error: z.string().optional(),
  }),
  handler: async ({ sessionId, sessionPath }) => {
    let session: SessionFile | null = null;
    if (sessionPath) session = await loadSession(sessionPath);
    else if (sessionId) {
      const r = await findSessionById(MCP_NAME, sessionId);
      if (r) session = r.session;
    }
    if (!session) return { found: false, error: "Session not found" };
    return { found: true, session };
  },
});

const aiClearSessionsTool = defineTool({
  name: "ai_clear_sessions",
  description: "Delete AI sessions.",
  inputSchema: z.object({
    sessionId: z.string().optional(),
    sessionPath: z.string().optional(),
    olderThanDays: z.number().optional(),
    all: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    deletedCount: z.number(),
    deletedPaths: z.array(z.string()),
    error: z.string().optional(),
  }),
  handler: async ({ sessionId, sessionPath, olderThanDays, all }) => {
    let paths: string[] = [];
    if (sessionPath && await deleteSession(sessionPath)) paths = [sessionPath];
    else if (sessionId) {
      const r = await findSessionById(MCP_NAME, sessionId);
      if (r && await deleteSession(r.path)) paths = [r.path];
    } else if (olderThanDays !== undefined) {
      paths = await deleteSessionsOlderThan(MCP_NAME, olderThanDays);
    } else if (all) paths = await deleteAllSessions(MCP_NAME);
    return { deletedCount: paths.length, deletedPaths: paths };
  },
});

const aiBackendInfoTool = defineTool({
  name: "ai_backend_info",
  description: "Get information about the current AI backend.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    backend: z.string(),
    description: z.string(),
    mcpName: z.string(),
  }),
  handler: async () => ({
    backend: BACKEND,
    description: BACKEND === "claude"
      ? "Claude Agent SDK - Anthropic's autonomous agent framework"
      : "OpenAI Codex CLI - OpenAI's code-focused agent",
    mcpName: MCP_NAME,
  }),
});

const allTools: AnyTypedTool[] = [
  aiQueryTool,
  aiQueryWithSessionTool,
  aiResumeTool,
  aiListSessionsTool,
  aiGetSessionTool,
  aiClearSessionsTool,
  aiBackendInfoTool,
];

// =============================================================================
// Server Setup
// =============================================================================

export const server = createMcpServer({
  name: MCP_NAME,
  version: "2.0.0",
  description: `Unified AI MCP Server (backend: ${BACKEND})`,
  tools: allTools,
  autoStart: false,
  debug: true,
});

if (import.meta.main) {
  for (const arg of Deno.args) {
    if (arg === "--help" || arg === "-h") {
      console.log(`ai.mcp.ts - Unified AI MCP Server

Usage:
  deno run -A ai.mcp.ts [--backend=claude|codex]

Options:
  --backend=<name>   AI backend: claude (default) or codex
  -h, --help         Show this help message
`);
      Deno.exit(0);
    }
  }
  server.start();
}

export type { QueryOptions, QueryResult };
