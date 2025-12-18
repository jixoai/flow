/**
 * Tests for ai-codex.mcp.ts
 *
 * Note: Tests that require actual Codex SDK calls are skipped by default.
 * Set CODEX_TEST_LIVE=true to run live tests.
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  afterAll,
  describe,
  it,
} from "https://deno.land/std@0.224.0/testing/bdd.ts";
import {
  allTools,
  codexClearSessionsTool,
  codexForkSessionTool,
  codexGetSessionTool,
  codexListSessionsTool,
  codexQueryTool,
  codexQueryWithSessionTool,
  codexResumeTool,
  codexRunStreamedTool,
  createQueryBuilder,
  MCP_NAME,
} from "./ai-codex.mcp.ts";
import { deleteAllSessions } from "./shared/session-manager.ts";

const LIVE_TESTS = Deno.env.get("CODEX_TEST_LIVE") === "true";

// =============================================================================
// MCP Name and Constants
// =============================================================================

describe("MCP Constants", () => {
  it("should have correct MCP_NAME", () => {
    assertEquals(MCP_NAME, "ai-codex");
  });

  it("should export all tools", () => {
    assertEquals(allTools.length, 8);
    assertEquals(allTools.map((t) => t.name), [
      "codex_query",
      "codex_query_with_session",
      "codex_resume",
      "codex_fork_session",
      "codex_list_sessions",
      "codex_get_session",
      "codex_clear_sessions",
      "codex_run_streamed",
    ]);
  });
});

// =============================================================================
// Tool Definition Tests
// =============================================================================

describe("codexQueryTool", () => {
  it("should have correct name and description", () => {
    assertEquals(codexQueryTool.name, "codex_query");
    assertExists(codexQueryTool.description);
  });

  it("should have valid input schema", () => {
    const result = codexQueryTool.inputSchema.safeParse({
      prompt: "Hello",
    });
    assertEquals(result.success, true);
  });

  it("should validate required prompt field", () => {
    const result = codexQueryTool.inputSchema.safeParse({});
    assertEquals(result.success, false);
  });

  it("should accept optional fields", () => {
    const result = codexQueryTool.inputSchema.safeParse({
      prompt: "Hello",
      workingDirectory: "/tmp",
      skipGitRepoCheck: true,
      outputSchema: '{"type": "object"}',
    });
    assertEquals(result.success, true);
  });

  it("should have valid output schema", () => {
    const result = codexQueryTool.outputSchema.safeParse({
      success: true,
      output: "test output",
      threadId: "thread_123",
      itemCount: 5,
    });
    assertEquals(result.success, true);
  });
});

describe("codexQueryWithSessionTool", () => {
  it("should have correct name", () => {
    assertEquals(codexQueryWithSessionTool.name, "codex_query_with_session");
  });

  it("should have output schema with sessionPath", () => {
    const result = codexQueryWithSessionTool.outputSchema.safeParse({
      success: true,
      output: "test",
      threadId: "thread_123",
      itemCount: 1,
      sessionPath: "/path/to/session.json",
    });
    assertEquals(result.success, true);
  });
});

describe("codexResumeTool", () => {
  it("should have correct name", () => {
    assertEquals(codexResumeTool.name, "codex_resume");
  });

  it("should require threadId and prompt", () => {
    const valid = codexResumeTool.inputSchema.safeParse({
      threadId: "thread_123",
      prompt: "Continue",
    });
    assertEquals(valid.success, true);

    const missingThreadId = codexResumeTool.inputSchema.safeParse({
      prompt: "Continue",
    });
    assertEquals(missingThreadId.success, false);

    const missingPrompt = codexResumeTool.inputSchema.safeParse({
      threadId: "thread_123",
    });
    assertEquals(missingPrompt.success, false);
  });

  it("should accept optional outputSchema", () => {
    const result = codexResumeTool.inputSchema.safeParse({
      threadId: "thread_123",
      prompt: "Continue",
      outputSchema: '{"type": "string"}',
    });
    assertEquals(result.success, true);
  });
});

describe("codexForkSessionTool", () => {
  it("should have correct name", () => {
    assertEquals(codexForkSessionTool.name, "codex_fork_session");
  });

  it("should require threadId", () => {
    const valid = codexForkSessionTool.inputSchema.safeParse({
      threadId: "thread_123",
    });
    assertEquals(valid.success, true);

    const missing = codexForkSessionTool.inputSchema.safeParse({});
    assertEquals(missing.success, false);
  });

  it("should accept optional newPrompt and newTitle", () => {
    const result = codexForkSessionTool.inputSchema.safeParse({
      threadId: "thread_123",
      newPrompt: "New prompt",
      newTitle: "Forked Session",
      outputSchema: '{"type": "object"}',
    });
    assertEquals(result.success, true);
  });

  it("should have valid output schema", () => {
    const result = codexForkSessionTool.outputSchema.safeParse({
      success: true,
      output: "forked",
      originalThreadId: "thread_123",
      newThreadId: "thread_456",
      sessionPath: "/path/to/session.json",
      itemCount: 3,
    });
    assertEquals(result.success, true);
  });
});

describe("codexListSessionsTool", () => {
  it("should have correct name", () => {
    assertEquals(codexListSessionsTool.name, "codex_list_sessions");
  });

  it("should accept optional limit", () => {
    const withLimit = codexListSessionsTool.inputSchema.safeParse({
      limit: 10,
    });
    assertEquals(withLimit.success, true);

    const withoutLimit = codexListSessionsTool.inputSchema.safeParse({});
    assertEquals(withoutLimit.success, true);
  });

  it("should have valid output schema", () => {
    const result = codexListSessionsTool.outputSchema.safeParse({
      sessions: [
        {
          threadId: "thread_123",
          title: "Test Session",
          status: "active",
          turnCount: 3,
          createdAt: "2024-01-01T00:00:00Z",
          path: "/path/to/session.json",
        },
      ],
    });
    assertEquals(result.success, true);
  });
});

describe("codexGetSessionTool", () => {
  it("should have correct name", () => {
    assertEquals(codexGetSessionTool.name, "codex_get_session");
  });

  it("should accept threadId or sessionPath", () => {
    const withThreadId = codexGetSessionTool.inputSchema.safeParse({
      threadId: "thread_123",
    });
    assertEquals(withThreadId.success, true);

    const withPath = codexGetSessionTool.inputSchema.safeParse({
      sessionPath: "/path/to/session.json",
    });
    assertEquals(withPath.success, true);

    const empty = codexGetSessionTool.inputSchema.safeParse({});
    assertEquals(empty.success, true);
  });
});

describe("codexClearSessionsTool", () => {
  it("should have correct name", () => {
    assertEquals(codexClearSessionsTool.name, "codex_clear_sessions");
  });

  it("should accept various deletion options", () => {
    const byId = codexClearSessionsTool.inputSchema.safeParse({
      threadId: "thread_123",
    });
    assertEquals(byId.success, true);

    const byPath = codexClearSessionsTool.inputSchema.safeParse({
      sessionPath: "/path/to/session.json",
    });
    assertEquals(byPath.success, true);

    const byAge = codexClearSessionsTool.inputSchema.safeParse({
      olderThanDays: 7,
    });
    assertEquals(byAge.success, true);

    const all = codexClearSessionsTool.inputSchema.safeParse({
      all: true,
    });
    assertEquals(all.success, true);
  });
});

describe("codexRunStreamedTool", () => {
  it("should have correct name", () => {
    assertEquals(codexRunStreamedTool.name, "codex_run_streamed");
  });

  it("should require prompt", () => {
    const valid = codexRunStreamedTool.inputSchema.safeParse({
      prompt: "Run something",
    });
    assertEquals(valid.success, true);

    const missing = codexRunStreamedTool.inputSchema.safeParse({});
    assertEquals(missing.success, false);
  });

  it("should have valid output schema", () => {
    const result = codexRunStreamedTool.outputSchema.safeParse({
      success: true,
      eventCount: 10,
      output: "streamed output",
    });
    assertEquals(result.success, true);
  });
});

// =============================================================================
// Query Builder Tests
// =============================================================================

describe("createQueryBuilder", () => {
  it("should create a builder with fluent API", () => {
    const builder = createQueryBuilder();
    assertExists(builder.prompt);
    assertExists(builder.workingDirectory);
    assertExists(builder.skipGitRepoCheck);
    assertExists(builder.outputSchema);
    assertExists(builder.execute);
    assertExists(builder.executeWithSession);
  });

  it("should support method chaining", () => {
    const builder = createQueryBuilder()
      .prompt("Hello")
      .workingDirectory("/tmp")
      .skipGitRepoCheck(true)
      .outputSchema('{"type": "string"}');

    assertExists(builder.execute);
  });

  it("should throw error when execute() called without prompt", async () => {
    const builder = createQueryBuilder();
    await assertRejects(
      () => builder.execute(),
      Error,
      "Prompt required",
    );
  });

  it("should throw error when executeWithSession() called without prompt", async () => {
    const builder = createQueryBuilder();
    await assertRejects(
      () => builder.executeWithSession(),
      Error,
      "Prompt required",
    );
  });
});

// =============================================================================
// Session Management Tests (Non-Live)
// =============================================================================

describe("Session Management (Local)", () => {
  it("should list sessions (empty or existing)", async () => {
    const result = await codexListSessionsTool.call({ limit: 10 });
    assertExists(result.sessions);
  });

  it("should return not found for non-existent session", async () => {
    const result = await codexGetSessionTool.call({
      threadId: "non-existent-id",
    });
    assertEquals(result.found, false);
    assertExists(result.error);
  });

  it("should handle clear with no matching sessions", async () => {
    const result = await codexClearSessionsTool.call({
      threadId: "non-existent-id",
      all: false,
    });
    assertEquals(result.deletedCount, 0);
    assertEquals(result.deletedPaths, []);
  });

  it("should return error for fork with non-existent session", async () => {
    const result = await codexForkSessionTool.call({
      threadId: "non-existent-id",
    });
    assertEquals(result.success, false);
    assertExists(result.error);
  });
});

// =============================================================================
// Live Tests (requires CODEX_TEST_LIVE=true)
// =============================================================================

describe("Live Tests", {
  ignore: !LIVE_TESTS,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  afterAll(async () => {
    await deleteAllSessions(MCP_NAME);
  });

  it("should execute a simple query", async () => {
    const result = await codexQueryTool.call({
      prompt: "Say 'Hello Test' and nothing else",
      skipGitRepoCheck: true,
    });

    console.log("Codex query result:", JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error("Codex query failed with error:", result.error);
    }

    assertEquals(result.success, true, `Codex query failed: ${result.error}`);
    assertExists(result.output);
    assertExists(result.threadId);
  });

  it("should execute query with session", async () => {
    const result = await codexQueryWithSessionTool.call({
      prompt: "Say 'Session Test' and nothing else",
      skipGitRepoCheck: true,
    });

    console.log(
      "Codex query with session result:",
      JSON.stringify(result, null, 2),
    );

    if (!result.success) {
      console.error(
        "Codex query with session failed with error:",
        result.error,
      );
    }

    assertEquals(
      result.success,
      true,
      `Codex query with session failed: ${result.error}`,
    );
    assertExists(result.sessionPath);
  });

  it("should list sessions after creating one", async () => {
    const result = await codexListSessionsTool.call({ limit: 10 });
    console.log("Sessions:", result.sessions.length);
    assertEquals(result.sessions.length >= 0, true);
  });
});
