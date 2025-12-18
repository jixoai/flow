#!/usr/bin/env -S deno run -A --no-config
/**
 * Test AI MCP Workflow - Tests for AI MCP servers and session management
 */

import { defineWorkflow } from "./shared/base-workflow.ts";
import { exists } from "jsr:@std/fs/exists";
import { getMcpPath, SHARED_DIR } from "../common/paths.ts";
import { join } from "jsr:@std/path";

// MCP file paths for testing
const MCP_PATHS = {
  baseMcp: join(SHARED_DIR, "base-mcp.ts"),
  sessionManager: join(SHARED_DIR, "session-manager.ts"),
  ai: getMcpPath("ai"),
};

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

interface TestSuite {
  name: string;
  results: TestResult[];
}

// =============================================================================
// Helpers
// =============================================================================

const c = {
  green: (t: string) => `\x1b[32m${t}\x1b[0m`,
  red: (t: string) => `\x1b[31m${t}\x1b[0m`,
  yellow: (t: string) => `\x1b[33m${t}\x1b[0m`,
  cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
  bold: (t: string) => `\x1b[1m${t}\x1b[0m`,
};

async function runTest(
  name: string,
  fn: () => Promise<{ passed: boolean; message: string }>,
): Promise<TestResult> {
  const start = performance.now();
  try {
    const { passed, message } = await fn();
    return { name, passed, message, duration: performance.now() - start };
  } catch (error) {
    return {
      name,
      passed: false,
      message: `Exception: ${error}`,
      duration: performance.now() - start,
    };
  }
}

async function checkFileExists(
  path: string,
): Promise<{ passed: boolean; message: string }> {
  const fileExists = await exists(path);
  return {
    passed: fileExists,
    message: fileExists ? "Found" : `Missing: ${path}`,
  };
}

async function checkTypescript(
  path: string,
): Promise<{ passed: boolean; message: string }> {
  const cmd = new Deno.Command("deno", {
    args: ["check", "--no-config", path],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await cmd.output();
  return code === 0 ? { passed: true, message: "OK" } : {
    passed: false,
    message: new TextDecoder().decode(stderr).slice(0, 300),
  };
}

async function checkModuleStructure(
  path: string,
  required: string[],
): Promise<{ passed: boolean; message: string }> {
  const content = await Deno.readTextFile(path);
  const missing = required.filter((r) => !content.includes(r));
  return missing.length === 0
    ? { passed: true, message: "OK" }
    : { passed: false, message: `Missing: ${missing.join(", ")}` };
}

// =============================================================================
// Test Suites
// =============================================================================

async function runStartupTests(): Promise<TestSuite> {
  const results: TestResult[] = [];
  results.push(
    await runTest(
      "[base-mcp] exists",
      () => checkFileExists(MCP_PATHS.baseMcp),
    ),
  );
  results.push(
    await runTest(
      "[base-mcp] typecheck",
      () => checkTypescript(MCP_PATHS.baseMcp),
    ),
  );
  results.push(
    await runTest(
      "[base-mcp] structure",
      () =>
        checkModuleStructure(MCP_PATHS.baseMcp, [
          "defineTool",
          "createMcpServer",
        ]),
    ),
  );
  results.push(
    await runTest("[ai] exists", () => checkFileExists(MCP_PATHS.ai)),
  );
  results.push(
    await runTest("[ai] typecheck", () => checkTypescript(MCP_PATHS.ai)),
  );
  results.push(
    await runTest(
      "[session] exists",
      () => checkFileExists(MCP_PATHS.sessionManager),
    ),
  );
  results.push(
    await runTest(
      "[session] typecheck",
      () => checkTypescript(MCP_PATHS.sessionManager),
    ),
  );
  return { name: "Startup Tests", results };
}

async function runSessionTests(): Promise<TestSuite> {
  const results: TestResult[] = [];

  results.push(
    await runTest("[session] import", async () => {
      await import(`file://${MCP_PATHS.sessionManager}`);
      return { passed: true, message: "OK" };
    }),
  );

  results.push(
    await runTest("[session] CRUD", async () => {
      const sm = await import(`file://${MCP_PATHS.sessionManager}`);
      const testPath = sm.generateSessionPath("test-workflow", "CRUD");
      const session = {
        metadata: {
          sessionId: `test-${Date.now()}`,
          title: "CRUD",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workingDirectory: Deno.cwd(),
          turnCount: 1,
          lastPrompt: "Test",
          status: "active" as const,
        },
        history: [{
          timestamp: new Date().toISOString(),
          prompt: "Test",
          response: "Response",
        }],
      };
      await sm.saveSession(testPath, session);
      const loaded = await sm.loadSession(testPath);
      if (!loaded || loaded.metadata.sessionId !== session.metadata.sessionId) {
        return { passed: false, message: "Load failed" };
      }
      await sm.deleteSession(testPath);
      if (await sm.loadSession(testPath) !== null) {
        return { passed: false, message: "Delete failed" };
      }
      return { passed: true, message: "OK" };
    }),
  );

  return { name: "Session Tests", results };
}

function printResults(suites: TestSuite[]): void {
  console.log("\n" + c.bold("=".repeat(50)));
  let passed = 0, failed = 0;
  for (const suite of suites) {
    console.log(c.cyan(`\n${suite.name}`));
    for (const r of suite.results) {
      console.log(
        `  ${r.passed ? c.green("[PASS]") : c.red("[FAIL]")} ${r.name} ${
          c.yellow(`(${r.duration.toFixed(0)}ms)`)
        }`,
      );
      if (!r.passed) console.log(`         ${c.red(r.message)}`);
      r.passed ? passed++ : failed++;
    }
  }
  console.log("\n" + "=".repeat(50));
  console.log(
    `  ${c.green(passed + " passed")}, ${
      failed > 0 ? c.red(failed + " failed") : "0 failed"
    }\n`,
  );
}

// =============================================================================
// Workflow Definition
// =============================================================================

export const workflow = defineWorkflow({
  name: "test-ai-mcp",
  description: "Test suite for AI MCP servers and session management",
  args: {
    test: {
      type: "string",
      alias: "t",
      description: "Test suite: startup, session, or all",
      default: "all",
    },
  },
  handler: async (args) => {
    const suites: TestSuite[] = [];

    if (args.test === "startup" || args.test === "all") {
      suites.push(await runStartupTests());
    }
    if (args.test === "session" || args.test === "all") {
      suites.push(await runSessionTests());
    }

    printResults(suites);

    if (suites.some((s) => s.results.some((r) => !r.passed))) {
      Deno.exit(1);
    }
  },
  autoStart: import.meta.main,
});

export { runSessionTests, runStartupTests };
export type { TestResult, TestSuite };
