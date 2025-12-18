#!/usr/bin/env -S deno run -A --no-config
/**
 * Claude Agent SDK MCP Server
 *
 * Pure SDK wrapper for Claude Agent capabilities.
 */

import {
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";
import { query } from "@anthropic-ai/claude-agent-sdk";
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

export const MCP_NAME = "ai-claude-code";

// =============================================================================
// Types
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

export interface QueryOptions {
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  cwd?: string;
  maxTurns?: number;
  resume?: string;
}

export interface QueryResult {
  success: boolean;
  output: string;
  sessionId: string;
  model: string;
  numTurns: number;
  totalCostUsd: number;
  error?: string;
}

// =============================================================================
// Core Query Function
// =============================================================================

export async function executeQuery(
  prompt: string,
  options: QueryOptions = {},
): Promise<QueryResult> {
  let output = "",
    sessionId = "",
    model = "",
    numTurns = 0,
    totalCostUsd = 0;

  try {
    const queryOptions: Record<string, unknown> = {
      // Load settings from all sources (matches normal Claude CLI behavior)
      // - user: ~/.claude/settings.json (API keys, base URL, etc.)
      // - project: .claude/ in working directory
      // - local: .claude-local/ (gitignored local overrides)
      // Without this, SDK runs in isolated mode and ignores all config
      settingSources: ["user", "project", "local"],
    };
    if (options.model) queryOptions.model = options.model;
    if (options.systemPrompt) queryOptions.systemPrompt = options.systemPrompt;
    if (options.allowedTools) queryOptions.allowedTools = options.allowedTools;
    if (options.disallowedTools) {
      queryOptions.disallowedTools = options.disallowedTools;
    }
    if (options.mcpServers) queryOptions.mcpServers = options.mcpServers;
    if (options.permissionMode) {
      queryOptions.permissionMode = options.permissionMode;
    }
    if (options.cwd) queryOptions.cwd = options.cwd;
    if (options.maxTurns) queryOptions.maxTurns = options.maxTurns;
    if (options.resume) queryOptions.resume = options.resume;

    for await (const message of query({ prompt, options: queryOptions })) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id || "";
        model = message.model || "";
      } else if (message.type === "assistant") {
        for (const block of message.message?.content || []) {
          if (block.type === "text") output += block.text + "\n";
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          numTurns = message.num_turns || 0;
          totalCostUsd = message.total_cost_usd || 0;
        } else {
          return {
            success: false,
            output,
            sessionId,
            model,
            numTurns,
            totalCostUsd,
            error: message.subtype,
          };
        }
      }
    }
    return {
      success: true,
      output: output.trim(),
      sessionId,
      model,
      numTurns,
      totalCostUsd,
    };
  } catch (error) {
    return {
      success: false,
      output,
      sessionId,
      model,
      numTurns,
      totalCostUsd,
      error: String(error),
    };
  }
}

// =============================================================================
// Programmatic API
// =============================================================================

export const claudeQuery = executeQuery;

export async function claudeQueryWithSession(
  options: QueryOptions & { prompt: string },
) {
  const cwd = options.cwd || Deno.cwd();
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
    history: [
      {
        timestamp: new Date().toISOString(),
        prompt: options.prompt,
        response: result.output,
        costUsd: result.totalCostUsd,
      },
    ],
  };
  await saveSession(sessionPath, session);
  return { ...result, sessionPath };
}

export async function claudeResume(options: {
  sessionId: string;
  prompt: string;
  maxTurns?: number;
}) {
  const sessionInfo = await findSessionById(MCP_NAME, options.sessionId);
  const result = await executeQuery(options.prompt, {
    resume: options.sessionId,
    maxTurns: options.maxTurns,
  });

  if (sessionInfo) {
    const { path: sessionPath, session } = sessionInfo;
    session.metadata.updatedAt = new Date().toISOString();
    session.metadata.turnCount += result.numTurns;
    session.metadata.totalCostUsd = (session.metadata.totalCostUsd || 0) +
      result.totalCostUsd;
    session.metadata.lastPrompt = options.prompt;
    session.metadata.status = result.success ? "active" : "error";
    session.history.push({
      timestamp: new Date().toISOString(),
      prompt: options.prompt,
      response: result.output,
      costUsd: result.totalCostUsd,
    });
    await saveSession(sessionPath, session);
  }
  return result;
}

export function createQueryBuilder() {
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
    mcpServers(
      s: Record<
        string,
        { command: string; args: string[]; env?: Record<string, string> }
      >,
    ) {
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
    resume(id: string) {
      opts.resume = id;
      return this;
    },
    async execute() {
      if (!opts.prompt) throw new Error("Prompt required");
      return executeQuery(opts.prompt, opts);
    },
    async executeWithSession() {
      if (!opts.prompt) throw new Error("Prompt required");
      return claudeQueryWithSession(opts);
    },
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

const queryInputSchema = z.object({
  prompt: z.string().describe("The prompt/instruction"),
  model: z
    .string()
    .optional()
    .describe("Model (e.g., 'haiku','sonnet', 'opus')"),
  systemPrompt: z.string().optional().describe("Custom system prompt"),
  allowedTools: z.array(z.string()).optional().describe("Whitelist of tools"),
  disallowedTools: z
    .array(z.string())
    .optional()
    .describe("Blacklist of tools"),
  permissionMode: z
    .enum(["default", "acceptEdits", "bypassPermissions"])
    .optional(),
  cwd: z.string().optional().describe("Working directory"),
  maxTurns: z.number().optional().describe("Maximum turns"),
});

const queryOutputSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  sessionId: z.string(),
  model: z.string(),
  numTurns: z.number(),
  totalCostUsd: z.number(),
  error: z.string().optional(),
});

export const claudeQueryTool = defineTool({
  name: "claude_query",
  description: "Execute a Claude agent query",
  inputSchema: queryInputSchema,
  outputSchema: queryOutputSchema,
  handler: async (input) => executeQuery(input.prompt, input),
});

export const claudeQueryWithSessionTool = defineTool({
  name: "claude_query_with_session",
  description: "Execute a Claude query and save session for resumption",
  inputSchema: queryInputSchema,
  outputSchema: queryOutputSchema.extend({ sessionPath: z.string() }),
  handler: async (input) =>
    claudeQueryWithSession({ ...input, prompt: input.prompt }),
});

export const claudeResumeTool = defineTool({
  name: "claude_resume",
  description: "Resume a previous Claude session",
  inputSchema: z.object({
    sessionId: z.string().describe("Session ID to resume"),
    prompt: z.string().describe("Prompt for resumed session"),
    maxTurns: z.number().optional(),
  }),
  outputSchema: queryOutputSchema,
  handler: async (input) => claudeResume(input),
});

export const claudeListSessionsTool = defineTool({
  name: "claude_list_sessions",
  description: "List all saved Claude sessions",
  inputSchema: z.object({ limit: z.number().optional().default(20) }),
  outputSchema: z.object({
    sessions: z.array(
      z.object({
        sessionId: z.string(),
        title: z.string(),
        model: z.string(),
        status: z.string(),
        turnCount: z.number(),
        totalCostUsd: z.number(),
        createdAt: z.string(),
        path: z.string(),
      }),
    ),
  }),
  handler: async ({ limit }) => {
    const sessions = await listAllSessions(MCP_NAME);
    return {
      sessions: sessions.slice(0, limit).map((s) => ({
        sessionId: s.metadata.sessionId,
        title: s.metadata.title,
        model: s.metadata.model || "",
        status: s.metadata.status,
        turnCount: s.metadata.turnCount,
        totalCostUsd: s.metadata.totalCostUsd || 0,
        createdAt: s.metadata.createdAt,
        path: s.path,
      })),
    };
  },
});

export const claudeGetSessionTool = defineTool({
  name: "claude_get_session",
  description: "Get detailed session information",
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

export const claudeClearSessionsTool = defineTool({
  name: "claude_clear_sessions",
  description: "Delete Claude sessions",
  inputSchema: z.object({
    sessionId: z.string().optional(),
    sessionPath: z.string().optional(),
    olderThanDays: z.number().optional(),
    all: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    deletedCount: z.number(),
    deletedPaths: z.array(z.string()),
  }),
  handler: async ({ sessionId, sessionPath, olderThanDays, all }) => {
    let paths: string[] = [];
    if (sessionPath && (await deleteSession(sessionPath))) {
      paths = [sessionPath];
    } else if (sessionId) {
      const r = await findSessionById(MCP_NAME, sessionId);
      if (r && (await deleteSession(r.path))) paths = [r.path];
    } else if (olderThanDays !== undefined) {
      paths = await deleteSessionsOlderThan(MCP_NAME, olderThanDays);
    } else if (all) paths = await deleteAllSessions(MCP_NAME);
    return { deletedCount: paths.length, deletedPaths: paths };
  },
});

// All tools exported for ai.mcp.ts
export const allTools = [
  claudeQueryTool,
  claudeQueryWithSessionTool,
  claudeResumeTool,
  claudeListSessionsTool,
  claudeGetSessionTool,
  claudeClearSessionsTool,
];

// =============================================================================
// Server Setup
// =============================================================================

export const server = createMcpServer({
  name: MCP_NAME,
  version: "4.0.0",
  tools: allTools,
  autoStart: false,
  debug: true,
});

if (import.meta.main) {
  const args = parseCliArgs();
  if (args.help) {
    printMcpHelp(MCP_NAME, "Claude Agent SDK MCP Server");
    Deno.exit(0);
  }
  server.start();
}
