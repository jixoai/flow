/**
 * Tests for ai-claude-code.mcp.ts
 *
 * Note: Tests that require actual Claude SDK calls are skipped by default.
 * Set CLAUDE_TEST_LIVE=true to run live tests.
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
  claudeClearSessionsTool,
  claudeGetSessionTool,
  claudeListSessionsTool,
  claudeQueryTool,
  claudeQueryWithSessionTool,
  claudeResumeTool,
  createQueryBuilder,
  MCP_NAME,
} from "./ai-claude-code.mcp.ts";
import { deleteAllSessions } from "./shared/session-manager.ts";

const LIVE_TESTS = Deno.env.get("CLAUDE_TEST_LIVE") === "true";

// =============================================================================
// MCP Name and Constants
// =============================================================================

describe("MCP Constants", () => {
  it("should have correct MCP_NAME", () => {
    assertEquals(MCP_NAME, "ai-claude-code");
  });

  it("should export all tools", () => {
    assertEquals(allTools.length, 6);
    assertEquals(allTools.map((t) => t.name), [
      "claude_query",
      "claude_query_with_session",
      "claude_resume",
      "claude_list_sessions",
      "claude_get_session",
      "claude_clear_sessions",
    ]);
  });
});

// =============================================================================
// Tool Definition Tests
// =============================================================================

describe("claudeQueryTool", () => {
  it("should have correct name and description", () => {
    assertEquals(claudeQueryTool.name, "claude_query");
    assertExists(claudeQueryTool.description);
  });

  it("should have valid input schema", () => {
    const result = claudeQueryTool.inputSchema.safeParse({
      prompt: "Hello",
    });
    assertEquals(result.success, true);
  });

  it("should validate required prompt field", () => {
    const result = claudeQueryTool.inputSchema.safeParse({});
    assertEquals(result.success, false);
  });

  it("should accept optional fields", () => {
    const result = claudeQueryTool.inputSchema.safeParse({
      prompt: "Hello",
      model: "sonnet",
      systemPrompt: "You are a helpful assistant",
      allowedTools: ["Read", "Write"],
      disallowedTools: ["Execute"],
      permissionMode: "acceptEdits",
      cwd: "/tmp",
      maxTurns: 10,
    });
    assertEquals(result.success, true);
  });

  it("should validate permissionMode enum", () => {
    const valid = claudeQueryTool.inputSchema.safeParse({
      prompt: "Hello",
      permissionMode: "bypassPermissions",
    });
    assertEquals(valid.success, true);

    const invalid = claudeQueryTool.inputSchema.safeParse({
      prompt: "Hello",
      permissionMode: "invalid",
    });
    assertEquals(invalid.success, false);
  });
});

describe("claudeQueryWithSessionTool", () => {
  it("should have correct name", () => {
    assertEquals(claudeQueryWithSessionTool.name, "claude_query_with_session");
  });

  it("should have output schema with sessionPath", () => {
    const result = claudeQueryWithSessionTool.outputSchema.safeParse({
      success: true,
      output: "test",
      sessionId: "id",
      model: "sonnet",
      numTurns: 1,
      totalCostUsd: 0.01,
      sessionPath: "/path/to/session.json",
    });
    assertEquals(result.success, true);
  });
});

describe("claudeResumeTool", () => {
  it("should have correct name", () => {
    assertEquals(claudeResumeTool.name, "claude_resume");
  });

  it("should require sessionId and prompt", () => {
    const valid = claudeResumeTool.inputSchema.safeParse({
      sessionId: "session-123",
      prompt: "Continue",
    });
    assertEquals(valid.success, true);

    const missingSessionId = claudeResumeTool.inputSchema.safeParse({
      prompt: "Continue",
    });
    assertEquals(missingSessionId.success, false);

    const missingPrompt = claudeResumeTool.inputSchema.safeParse({
      sessionId: "session-123",
    });
    assertEquals(missingPrompt.success, false);
  });
});

describe("claudeListSessionsTool", () => {
  it("should have correct name", () => {
    assertEquals(claudeListSessionsTool.name, "claude_list_sessions");
  });

  it("should accept optional limit", () => {
    const withLimit = claudeListSessionsTool.inputSchema.safeParse({
      limit: 10,
    });
    assertEquals(withLimit.success, true);

    const withoutLimit = claudeListSessionsTool.inputSchema.safeParse({});
    assertEquals(withoutLimit.success, true);
  });
});

describe("claudeGetSessionTool", () => {
  it("should have correct name", () => {
    assertEquals(claudeGetSessionTool.name, "claude_get_session");
  });

  it("should accept sessionId or sessionPath", () => {
    const withSessionId = claudeGetSessionTool.inputSchema.safeParse({
      sessionId: "session-123",
    });
    assertEquals(withSessionId.success, true);

    const withPath = claudeGetSessionTool.inputSchema.safeParse({
      sessionPath: "/path/to/session.json",
    });
    assertEquals(withPath.success, true);

    const empty = claudeGetSessionTool.inputSchema.safeParse({});
    assertEquals(empty.success, true);
  });
});

describe("claudeClearSessionsTool", () => {
  it("should have correct name", () => {
    assertEquals(claudeClearSessionsTool.name, "claude_clear_sessions");
  });

  it("should accept various deletion options", () => {
    const byId = claudeClearSessionsTool.inputSchema.safeParse({
      sessionId: "session-123",
    });
    assertEquals(byId.success, true);

    const byPath = claudeClearSessionsTool.inputSchema.safeParse({
      sessionPath: "/path/to/session.json",
    });
    assertEquals(byPath.success, true);

    const byAge = claudeClearSessionsTool.inputSchema.safeParse({
      olderThanDays: 7,
    });
    assertEquals(byAge.success, true);

    const all = claudeClearSessionsTool.inputSchema.safeParse({
      all: true,
    });
    assertEquals(all.success, true);
  });
});

// =============================================================================
// Query Builder Tests
// =============================================================================

describe("createQueryBuilder", () => {
  it("should create a builder with fluent API", () => {
    const builder = createQueryBuilder();
    assertExists(builder.prompt);
    assertExists(builder.model);
    assertExists(builder.systemPrompt);
    assertExists(builder.allowTools);
    assertExists(builder.disallowTools);
    assertExists(builder.mcpServers);
    assertExists(builder.permissionMode);
    assertExists(builder.cwd);
    assertExists(builder.maxTurns);
    assertExists(builder.resume);
    assertExists(builder.execute);
    assertExists(builder.executeWithSession);
  });

  it("should support method chaining", () => {
    const builder = createQueryBuilder()
      .prompt("Hello")
      .model("sonnet")
      .systemPrompt("Be helpful")
      .allowTools(["Read"])
      .disallowTools(["Execute"])
      .permissionMode("acceptEdits")
      .cwd("/tmp")
      .maxTurns(5);

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
  it("should list sessions (empty)", async () => {
    const result = await claudeListSessionsTool.call({ limit: 10 });
    assertExists(result.sessions);
  });

  it("should return not found for non-existent session", async () => {
    const result = await claudeGetSessionTool.call({
      sessionId: "non-existent-id",
    });
    assertEquals(result.found, false);
    assertExists(result.error);
  });

  it("should handle clear with no matching sessions", async () => {
    const result = await claudeClearSessionsTool.call({
      sessionId: "non-existent-id",
      all: false,
    });
    assertEquals(result.deletedCount, 0);
    assertEquals(result.deletedPaths, []);
  });
});

// =============================================================================
// Live Tests (requires CLAUDE_TEST_LIVE=true)
// =============================================================================

describe("Live Tests", {
  ignore: !LIVE_TESTS,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  afterAll(async () => {
    // Clean up test sessions
    await deleteAllSessions(MCP_NAME);
  });

  it("should execute a simple query", async () => {
    const result = await claudeQueryTool.call({
      prompt: "Say 'Hello Test' and nothing else",
      model: "sonnet",
      maxTurns: 1,
    });

    console.log("Query result:", JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error("Query failed with error:", result.error);
    }

    assertEquals(result.success, true, `Query failed: ${result.error}`);
    assertExists(result.output);
    assertExists(result.sessionId);
    testSessionId = result.sessionId;
  });

  it("should execute query with session", async () => {
    const result = await claudeQueryWithSessionTool.call({
      prompt: "Say 'Session Test' and nothing else",
      model: "sonnet",
      maxTurns: 1,
    });

    console.log("Query with session result:", JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error("Query with session failed with error:", result.error);
    }

    assertEquals(
      result.success,
      true,
      `Query with session failed: ${result.error}`,
    );
    assertExists(result.sessionPath);
  });

  it("should list sessions after creating one", async () => {
    const result = await claudeListSessionsTool.call({ limit: 10 });
    assertEquals(result.sessions.length > 0, true);
  });
});
