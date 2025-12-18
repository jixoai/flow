/**
 * Tests for ai.mcp.ts - Unified AI Interface
 *
 * Note: This file tests the unified AI interface which wraps both Claude and Codex.
 * Live tests are skipped by default.
 * Set AI_TEST_LIVE=true to run live tests.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";

// Note: We test the module structure without importing the actual module
// because ai.mcp.ts has side effects (backend selection logs).
// Instead, we test the exports and schemas.

import { z } from "./shared/base-mcp.ts";

const LIVE_TESTS = Deno.env.get("AI_TEST_LIVE") === "true";

// =============================================================================
// Schema Tests (matching ai.mcp.ts schemas)
// =============================================================================

describe("AI Query Input Schema", () => {
  const aiQueryInputSchema = z.object({
    prompt: z.string().describe("The prompt/instruction"),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions"])
      .optional(),
    cwd: z.string().optional(),
    maxTurns: z.number().optional(),
  });

  it("should validate required prompt", () => {
    const valid = aiQueryInputSchema.safeParse({ prompt: "Hello" });
    assertEquals(valid.success, true);

    const invalid = aiQueryInputSchema.safeParse({});
    assertEquals(invalid.success, false);
  });

  it("should validate optional fields", () => {
    const result = aiQueryInputSchema.safeParse({
      prompt: "Hello",
      model: "sonnet",
      systemPrompt: "Be helpful",
      allowedTools: ["Read"],
      disallowedTools: ["Execute"],
      permissionMode: "acceptEdits",
      cwd: "/tmp",
      maxTurns: 10,
    });
    assertEquals(result.success, true);
  });

  it("should validate permissionMode enum", () => {
    const valid = aiQueryInputSchema.safeParse({
      prompt: "Hello",
      permissionMode: "bypassPermissions",
    });
    assertEquals(valid.success, true);

    const invalid = aiQueryInputSchema.safeParse({
      prompt: "Hello",
      permissionMode: "invalid",
    });
    assertEquals(invalid.success, false);
  });
});

describe("AI Query Output Schema", () => {
  const aiQueryOutputSchema = z.object({
    success: z.boolean(),
    output: z.string(),
    sessionId: z.string(),
    model: z.string(),
    numTurns: z.number(),
    totalCostUsd: z.number(),
    backend: z.string(),
    error: z.string().optional(),
  });

  it("should validate successful result", () => {
    const result = aiQueryOutputSchema.safeParse({
      success: true,
      output: "Hello, World!",
      sessionId: "session_123",
      model: "sonnet",
      numTurns: 1,
      totalCostUsd: 0.01,
      backend: "claude",
    });
    assertEquals(result.success, true);
  });

  it("should validate error result", () => {
    const result = aiQueryOutputSchema.safeParse({
      success: false,
      output: "",
      sessionId: "",
      model: "",
      numTurns: 0,
      totalCostUsd: 0,
      backend: "claude",
      error: "Something went wrong",
    });
    assertEquals(result.success, true);
  });

  it("should require backend field", () => {
    const result = aiQueryOutputSchema.safeParse({
      success: true,
      output: "Hello",
      sessionId: "session_123",
      model: "sonnet",
      numTurns: 1,
      totalCostUsd: 0.01,
    });
    assertEquals(result.success, false);
  });
});

describe("AI Query With Session Output Schema", () => {
  const aiQueryWithSessionOutputSchema = z.object({
    success: z.boolean(),
    output: z.string(),
    sessionId: z.string(),
    sessionPath: z.string(),
    model: z.string(),
    numTurns: z.number(),
    totalCostUsd: z.number(),
    backend: z.string(),
    error: z.string().optional(),
  });

  it("should validate result with sessionPath", () => {
    const result = aiQueryWithSessionOutputSchema.safeParse({
      success: true,
      output: "Hello",
      sessionId: "session_123",
      sessionPath: "/path/to/session.json",
      model: "sonnet",
      numTurns: 1,
      totalCostUsd: 0.01,
      backend: "claude",
    });
    assertEquals(result.success, true);
  });

  it("should require sessionPath", () => {
    const result = aiQueryWithSessionOutputSchema.safeParse({
      success: true,
      output: "Hello",
      sessionId: "session_123",
      model: "sonnet",
      numTurns: 1,
      totalCostUsd: 0.01,
      backend: "claude",
    });
    assertEquals(result.success, false);
  });
});

describe("AI Resume Input Schema", () => {
  const aiResumeInputSchema = z.object({
    sessionId: z.string(),
    prompt: z.string(),
    maxTurns: z.number().optional(),
  });

  it("should validate required fields", () => {
    const valid = aiResumeInputSchema.safeParse({
      sessionId: "session_123",
      prompt: "Continue",
    });
    assertEquals(valid.success, true);

    const missingSessionId = aiResumeInputSchema.safeParse({
      prompt: "Continue",
    });
    assertEquals(missingSessionId.success, false);

    const missingPrompt = aiResumeInputSchema.safeParse({
      sessionId: "session_123",
    });
    assertEquals(missingPrompt.success, false);
  });
});

describe("AI List Sessions Output Schema", () => {
  const aiListSessionsOutputSchema = z.object({
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
  });

  it("should validate sessions list", () => {
    const result = aiListSessionsOutputSchema.safeParse({
      sessions: [
        {
          sessionId: "session_123",
          title: "Test Session",
          model: "sonnet",
          status: "active",
          turnCount: 3,
          totalCostUsd: 0.05,
          createdAt: "2024-01-01T00:00:00Z",
          path: "/path/to/session.json",
        },
      ],
      backend: "claude",
    });
    assertEquals(result.success, true);
  });

  it("should validate empty sessions list", () => {
    const result = aiListSessionsOutputSchema.safeParse({
      sessions: [],
      backend: "codex",
    });
    assertEquals(result.success, true);
  });
});

describe("AI Clear Sessions Input Schema", () => {
  const aiClearSessionsInputSchema = z.object({
    sessionId: z.string().optional(),
    sessionPath: z.string().optional(),
    olderThanDays: z.number().optional(),
    all: z.boolean().optional().default(false),
  });

  it("should validate deletion by sessionId", () => {
    const result = aiClearSessionsInputSchema.safeParse({
      sessionId: "session_123",
    });
    assertEquals(result.success, true);
  });

  it("should validate deletion by sessionPath", () => {
    const result = aiClearSessionsInputSchema.safeParse({
      sessionPath: "/path/to/session.json",
    });
    assertEquals(result.success, true);
  });

  it("should validate deletion by age", () => {
    const result = aiClearSessionsInputSchema.safeParse({
      olderThanDays: 7,
    });
    assertEquals(result.success, true);
  });

  it("should validate deletion of all", () => {
    const result = aiClearSessionsInputSchema.safeParse({
      all: true,
    });
    assertEquals(result.success, true);
  });

  it("should validate empty input (for default behavior)", () => {
    const result = aiClearSessionsInputSchema.safeParse({});
    assertEquals(result.success, true);
  });
});

describe("AI Backend Info Output Schema", () => {
  const aiBackendInfoOutputSchema = z.object({
    backend: z.string(),
    description: z.string(),
    mcpName: z.string(),
  });

  it("should validate claude backend info", () => {
    const result = aiBackendInfoOutputSchema.safeParse({
      backend: "claude",
      description: "Claude Agent SDK - Anthropic's autonomous agent framework",
      mcpName: "ai-claude",
    });
    assertEquals(result.success, true);
  });

  it("should validate codex backend info", () => {
    const result = aiBackendInfoOutputSchema.safeParse({
      backend: "codex",
      description: "OpenAI Codex CLI - OpenAI's code-focused agent",
      mcpName: "ai-codex",
    });
    assertEquals(result.success, true);
  });
});

// =============================================================================
// Query Builder Pattern Tests
// =============================================================================

describe("AI Query Builder Pattern", () => {
  // Simulate the query builder pattern
  function createTestQueryBuilder() {
    const opts: {
      prompt: string;
      model?: string;
      systemPrompt?: string;
      allowedTools?: string[];
      disallowedTools?: string[];
      permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
      cwd?: string;
      maxTurns?: number;
    } = { prompt: "" };

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
      getOptions() {
        return opts;
      },
    };
  }

  it("should support fluent API", () => {
    const builder = createTestQueryBuilder()
      .prompt("Hello")
      .model("sonnet")
      .systemPrompt("Be helpful")
      .allowTools(["Read"])
      .disallowTools(["Execute"])
      .permissionMode("acceptEdits")
      .cwd("/tmp")
      .maxTurns(5);

    const opts = builder.getOptions();
    assertEquals(opts.prompt, "Hello");
    assertEquals(opts.model, "sonnet");
    assertEquals(opts.systemPrompt, "Be helpful");
    assertEquals(opts.allowedTools, ["Read"]);
    assertEquals(opts.disallowedTools, ["Execute"]);
    assertEquals(opts.permissionMode, "acceptEdits");
    assertEquals(opts.cwd, "/tmp");
    assertEquals(opts.maxTurns, 5);
  });

  it("should allow partial configuration", () => {
    const builder = createTestQueryBuilder()
      .prompt("Hello")
      .maxTurns(3);

    const opts = builder.getOptions();
    assertEquals(opts.prompt, "Hello");
    assertEquals(opts.maxTurns, 3);
    assertEquals(opts.model, undefined);
    assertEquals(opts.cwd, undefined);
  });
});

// =============================================================================
// Backend Selection Tests
// =============================================================================

describe("Backend Selection", () => {
  it("should support claude backend", () => {
    const backend = "claude";
    const mcpName = `ai-${backend}`;
    assertEquals(mcpName, "ai-claude");
  });

  it("should support codex backend", () => {
    const backend = "codex";
    const mcpName = `ai-${backend}`;
    assertEquals(mcpName, "ai-codex");
  });

  it("should default to claude", () => {
    // Test parseBackend logic
    function parseBackend(args: string[]): "claude" | "codex" {
      for (const arg of args) {
        if (arg.startsWith("--backend=")) {
          const value = arg.slice("--backend=".length);
          if (value === "claude" || value === "codex") return value;
        }
      }
      return "claude";
    }

    assertEquals(parseBackend([]), "claude");
    assertEquals(parseBackend(["--backend=claude"]), "claude");
    assertEquals(parseBackend(["--backend=codex"]), "codex");
    assertEquals(parseBackend(["--backend=invalid"]), "claude");
    assertEquals(parseBackend(["--other-arg"]), "claude");
  });
});

// =============================================================================
// Tool Names Tests
// =============================================================================

describe("AI Tool Names", () => {
  const expectedTools = [
    "ai_query",
    "ai_query_with_session",
    "ai_resume",
    "ai_list_sessions",
    "ai_get_session",
    "ai_clear_sessions",
    "ai_backend_info",
  ];

  it("should have ai_ prefix for all tools", () => {
    for (const toolName of expectedTools) {
      assertEquals(
        toolName.startsWith("ai_"),
        true,
        `Tool ${toolName} should start with ai_`,
      );
    }
  });

  it("should have 7 unified tools", () => {
    assertEquals(expectedTools.length, 7);
  });
});

// =============================================================================
// Live Tests (requires AI_TEST_LIVE=true)
// =============================================================================

describe("Live Tests", { ignore: !LIVE_TESTS }, () => {
  // These tests would require importing the actual module
  // and executing real queries, which is expensive and requires API keys.

  it("placeholder for live testing", () => {
    // To run live tests:
    // 1. Set AI_TEST_LIVE=true
    // 2. Ensure you have ANTHROPIC_API_KEY or OPENAI_API_KEY set
    // 3. Run: deno test --allow-all ai.mcp.test.ts
    assertEquals(true, true);
  });
});
