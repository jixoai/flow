#!/usr/bin/env -S deno run -A --no-config
/**
 * OpenAI Codex SDK MCP Server
 *
 * Pure SDK wrapper for OpenAI Codex capabilities.
 */

import {
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";
import { Codex } from "@openai/codex-sdk";
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

export const MCP_NAME = "ai-codex";

// =============================================================================
// Codex Client
// =============================================================================

let codexClient: Codex | null = null;

function getCodexClient(): Codex {
  if (!codexClient) codexClient = new Codex();
  return codexClient;
}

// =============================================================================
// Types
// =============================================================================

export interface QueryOptions {
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  outputSchema?: string;
}

export interface QueryResult {
  success: boolean;
  output: string;
  threadId: string;
  itemCount: number;
  error?: string;
}

// =============================================================================
// Core Query Function
// =============================================================================

export async function executeQuery(
  prompt: string,
  options: QueryOptions = {},
): Promise<QueryResult> {
  try {
    const codex = getCodexClient();
    const cwd = options.workingDirectory || Deno.cwd();

    const thread = codex.startThread({
      workingDirectory: cwd,
      skipGitRepoCheck: options.skipGitRepoCheck,
    });

    const runOptions: { outputSchema?: object } = {};
    if (options.outputSchema) {
      try {
        runOptions.outputSchema = JSON.parse(options.outputSchema);
      } catch {
        console.error(`[${MCP_NAME}] Invalid output schema JSON, ignoring`);
      }
    }

    const turn = await thread.run(prompt, runOptions);
    const threadId = (thread as unknown as { threadId?: string }).threadId ||
      `thread_${Date.now()}`;
    const response = turn.finalResponse || "";
    const items = turn.items || [];

    return {
      success: true,
      output: response,
      threadId,
      itemCount: items.length,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      threadId: "",
      itemCount: 0,
      error: String(error),
    };
  }
}

// =============================================================================
// Programmatic API
// =============================================================================

export const codexQuery = executeQuery;

export async function codexQueryWithSession(
  options: QueryOptions & { prompt: string },
) {
  const cwd = options.workingDirectory || Deno.cwd();
  const result = await executeQuery(options.prompt, {
    ...options,
    workingDirectory: cwd,
  });

  const title = extractTitle(options.prompt);
  const sessionPath = generateSessionPath(MCP_NAME, title);

  const session: SessionFile = {
    metadata: {
      sessionId: result.threadId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workingDirectory: cwd,
      turnCount: 1,
      lastPrompt: options.prompt,
      status: result.success ? "active" : "error",
    },
    history: [{
      timestamp: new Date().toISOString(),
      prompt: options.prompt,
      response: result.output,
    }],
  };

  await saveSession(sessionPath, session);
  return { ...result, sessionPath };
}

export async function codexResume(
  options: { threadId: string; prompt: string; outputSchema?: string },
) {
  try {
    const codex = getCodexClient();
    const thread = codex.resumeThread(options.threadId);

    const runOptions: { outputSchema?: object } = {};
    if (options.outputSchema) {
      try {
        runOptions.outputSchema = JSON.parse(options.outputSchema);
      } catch {
        console.error(`[${MCP_NAME}] Invalid output schema JSON, ignoring`);
      }
    }

    const turn = await thread.run(options.prompt, runOptions);
    const response = turn.finalResponse || "";
    const items = turn.items || [];

    // Update session if exists
    const sessionInfo = await findSessionById(MCP_NAME, options.threadId);
    if (sessionInfo) {
      const { path: sessionPath, session } = sessionInfo;
      session.metadata.updatedAt = new Date().toISOString();
      session.metadata.turnCount += 1;
      session.metadata.lastPrompt = options.prompt;
      session.history.push({
        timestamp: new Date().toISOString(),
        prompt: options.prompt,
        response,
      });
      await saveSession(sessionPath, session);
    }

    return {
      success: true,
      output: response,
      threadId: options.threadId,
      itemCount: items.length,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      threadId: options.threadId,
      itemCount: 0,
      error: String(error),
    };
  }
}

export function createQueryBuilder() {
  const opts: QueryOptions & { prompt: string } = { prompt: "" };
  return {
    prompt(p: string) {
      opts.prompt = p;
      return this;
    },
    workingDirectory(d: string) {
      opts.workingDirectory = d;
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
      return codexQueryWithSession(opts);
    },
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

const queryInputSchema = z.object({
  prompt: z.string().describe("The prompt/instruction"),
  workingDirectory: z.string().optional().describe(
    "Working directory for the thread",
  ),
  skipGitRepoCheck: z.boolean().optional().default(false).describe(
    "Skip Git repository validation",
  ),
  outputSchema: z.string().optional().describe(
    "JSON Schema string for structured output",
  ),
});

const queryOutputSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  threadId: z.string(),
  itemCount: z.number(),
  error: z.string().optional(),
});

export const codexQueryTool = defineTool({
  name: "codex_query",
  description:
    "Execute a Codex task. Creates a new thread and runs the prompt.",
  inputSchema: queryInputSchema,
  outputSchema: queryOutputSchema,
  handler: async (input) => executeQuery(input.prompt, input),
});

export const codexQueryWithSessionTool = defineTool({
  name: "codex_query_with_session",
  description: "Execute a Codex task and save session for resumption.",
  inputSchema: queryInputSchema,
  outputSchema: queryOutputSchema.extend({ sessionPath: z.string() }),
  handler: async (input) =>
    codexQueryWithSession({ ...input, prompt: input.prompt }),
});

export const codexResumeTool = defineTool({
  name: "codex_resume",
  description: "Resume a previous Codex thread",
  inputSchema: z.object({
    threadId: z.string().describe("Thread ID to resume"),
    prompt: z.string().describe("Prompt for resumed thread"),
    outputSchema: z.string().optional(),
  }),
  outputSchema: queryOutputSchema,
  handler: async (input) => codexResume(input),
});

export const codexForkSessionTool = defineTool({
  name: "codex_fork_session",
  description: "Fork an existing session to create a new independent session",
  inputSchema: z.object({
    threadId: z.string().describe("Thread ID to fork from"),
    newPrompt: z.string().optional().describe(
      "Optional prompt for forked session",
    ),
    newTitle: z.string().optional().describe("Optional title for new session"),
    outputSchema: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    originalThreadId: z.string(),
    newThreadId: z.string().optional(),
    sessionPath: z.string().optional(),
    itemCount: z.number().optional(),
    error: z.string().optional(),
  }),
  handler: async ({ threadId, newPrompt, newTitle, outputSchema }) => {
    const sessionInfo = await findSessionById(MCP_NAME, threadId);
    if (!sessionInfo) {
      return {
        success: false,
        output: "",
        originalThreadId: threadId,
        error: "Session not found",
      };
    }

    const { session: originalSession } = sessionInfo;

    if (newPrompt) {
      try {
        const codex = getCodexClient();
        const thread = codex.resumeThread(threadId);

        const runOptions: { outputSchema?: object } = {};
        if (outputSchema) {
          try {
            runOptions.outputSchema = JSON.parse(outputSchema);
          } catch { /* ignore */ }
        }

        const turn = await thread.run(newPrompt, runOptions);
        const newThreadId =
          (thread as unknown as { threadId?: string }).threadId ||
          `thread_${Date.now()}`;
        const response = turn.finalResponse || "";
        const items = turn.items || [];

        const title = newTitle || `Fork of: ${originalSession.metadata.title}`;
        const sessionPath = generateSessionPath(MCP_NAME, title);

        const forkedSession: SessionFile = {
          metadata: {
            sessionId: newThreadId,
            title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            workingDirectory: originalSession.metadata.workingDirectory,
            turnCount: originalSession.metadata.turnCount + 1,
            lastPrompt: newPrompt,
            status: "active",
          },
          history: [...originalSession.history, {
            timestamp: new Date().toISOString(),
            prompt: newPrompt,
            response,
          }],
        };

        await saveSession(sessionPath, forkedSession);
        return {
          success: true,
          output: response,
          originalThreadId: threadId,
          newThreadId,
          sessionPath,
          itemCount: items.length,
        };
      } catch (error) {
        return {
          success: false,
          output: "",
          originalThreadId: threadId,
          error: String(error),
        };
      }
    } else {
      const title = newTitle || `Fork of: ${originalSession.metadata.title}`;
      const sessionPath = generateSessionPath(MCP_NAME, title);

      const forkedSession: SessionFile = {
        metadata: {
          ...originalSession.metadata,
          title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        history: [...originalSession.history],
      };

      await saveSession(sessionPath, forkedSession);
      return {
        success: true,
        output: "Session forked",
        originalThreadId: threadId,
        newThreadId: forkedSession.metadata.sessionId,
        sessionPath,
      };
    }
  },
});

export const codexListSessionsTool = defineTool({
  name: "codex_list_sessions",
  description: "List all saved Codex sessions",
  inputSchema: z.object({ limit: z.number().optional().default(20) }),
  outputSchema: z.object({
    sessions: z.array(z.object({
      threadId: z.string(),
      title: z.string(),
      status: z.string(),
      turnCount: z.number(),
      createdAt: z.string(),
      path: z.string(),
    })),
  }),
  handler: async ({ limit }) => {
    const sessions = await listAllSessions(MCP_NAME);
    return {
      sessions: sessions.slice(0, limit).map((s) => ({
        threadId: s.metadata.sessionId,
        title: s.metadata.title,
        status: s.metadata.status,
        turnCount: s.metadata.turnCount,
        createdAt: s.metadata.createdAt,
        path: s.path,
      })),
    };
  },
});

export const codexGetSessionTool = defineTool({
  name: "codex_get_session",
  description: "Get detailed session information",
  inputSchema: z.object({
    threadId: z.string().optional(),
    sessionPath: z.string().optional(),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    session: z.unknown().optional(),
    error: z.string().optional(),
  }),
  handler: async ({ threadId, sessionPath }) => {
    let session: SessionFile | null = null;
    if (sessionPath) session = await loadSession(sessionPath);
    else if (threadId) {
      const r = await findSessionById(MCP_NAME, threadId);
      if (r) session = r.session;
    }
    if (!session) return { found: false, error: "Session not found" };
    return { found: true, session };
  },
});

export const codexClearSessionsTool = defineTool({
  name: "codex_clear_sessions",
  description: "Delete Codex sessions",
  inputSchema: z.object({
    threadId: z.string().optional(),
    sessionPath: z.string().optional(),
    olderThanDays: z.number().optional(),
    all: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    deletedCount: z.number(),
    deletedPaths: z.array(z.string()),
  }),
  handler: async ({ threadId, sessionPath, olderThanDays, all }) => {
    let paths: string[] = [];
    if (sessionPath && await deleteSession(sessionPath)) paths = [sessionPath];
    else if (threadId) {
      const r = await findSessionById(MCP_NAME, threadId);
      if (r && await deleteSession(r.path)) paths = [r.path];
    } else if (olderThanDays !== undefined) {
      paths = await deleteSessionsOlderThan(MCP_NAME, olderThanDays);
    } else if (all) paths = await deleteAllSessions(MCP_NAME);
    return { deletedCount: paths.length, deletedPaths: paths };
  },
});

export const codexRunStreamedTool = defineTool({
  name: "codex_run_streamed",
  description: "Execute a Codex task with streaming output",
  inputSchema: z.object({
    prompt: z.string().describe("The prompt/instruction"),
    workingDirectory: z.string().optional(),
    skipGitRepoCheck: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    eventCount: z.number(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ prompt, workingDirectory, skipGitRepoCheck }) => {
    try {
      const codex = getCodexClient();
      const cwd = workingDirectory || Deno.cwd();
      const thread = codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck,
      });
      const { events } = await thread.runStreamed(prompt);

      const collectedEvents: Array<{ type: string; data: unknown }> = [];
      let finalResponse = "";

      for await (const event of events) {
        collectedEvents.push({ type: event.type, data: event });
      }

      for (const evt of collectedEvents) {
        if (evt.type === "item.completed" && evt.data) {
          const item = evt.data as { item?: { content?: string } };
          if (item.item?.content) finalResponse += item.item.content + "\n";
        }
      }

      return {
        success: true,
        eventCount: collectedEvents.length,
        output: finalResponse.trim() || "(No response)",
      };
    } catch (error) {
      return {
        success: false,
        eventCount: 0,
        output: "",
        error: String(error),
      };
    }
  },
});

// All tools exported for ai.mcp.ts
export const allTools = [
  codexQueryTool,
  codexQueryWithSessionTool,
  codexResumeTool,
  codexForkSessionTool,
  codexListSessionsTool,
  codexGetSessionTool,
  codexClearSessionsTool,
  codexRunStreamedTool,
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
    printMcpHelp(MCP_NAME, "OpenAI Codex SDK MCP Server");
    Deno.exit(0);
  }
  server.start();
}

export { getCodexClient };
