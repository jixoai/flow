/**
 * AsyncContext 集成测试
 *
 * 测试 AsyncContext 与 workflow/mcp 的联动
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  getContextPreferredAgent,
  getContextRetryConfig,
  isContextWorkflowDisabled,
  PreferencesContext,
} from "./async-context.ts";
import { defineWorkflow } from "../workflows/shared/base-workflow.ts";

// =============================================================================
// Workflow + AsyncContext 联合测试
// =============================================================================

Deno.test("Workflow + AsyncContext Integration", async (t) => {
  await t.step(
    "workflow handler should run within PreferencesContext",
    async () => {
      let contextAvailable = false;
      let preferredAgent = "";

      const testWorkflow = defineWorkflow({
        name: "test-context-workflow",
        description: "Test workflow for AsyncContext",
        args: {},
        handler: async () => {
          // 在 handler 中应该能访问 PreferencesContext
          contextAvailable = PreferencesContext.isInContext();
          preferredAgent = getContextPreferredAgent();
        },
      });

      // 执行 workflow
      await testWorkflow.execute({});

      assertEquals(
        contextAvailable,
        true,
        "PreferencesContext should be available in handler",
      );
      assertExists(preferredAgent, "Should get preferred agent from context");
    },
  );

  await t.step(
    "nested async calls in workflow should preserve context",
    async () => {
      const results: string[] = [];

      async function level2(): Promise<void> {
        await Promise.resolve();
        results.push(`level2: ${PreferencesContext.isInContext()}`);
        results.push(`agent: ${getContextPreferredAgent()}`);
      }

      async function level1(): Promise<void> {
        results.push(`level1: ${PreferencesContext.isInContext()}`);
        await level2();
      }

      const testWorkflow = defineWorkflow({
        name: "test-nested-workflow",
        description: "Test nested async in workflow",
        args: {},
        handler: async () => {
          results.push(`handler: ${PreferencesContext.isInContext()}`);
          await level1();
        },
      });

      await testWorkflow.execute({});

      assertEquals(results[0], "handler: true");
      assertEquals(results[1], "level1: true");
      assertEquals(results[2], "level2: true");
      assertEquals(results[3].startsWith("agent:"), true);
    },
  );

  await t.step(
    "workflow should access correct preferences",
    async () => {
      const results: { maxAttempts: number; workflowDisabled: boolean } = {
        maxAttempts: 0,
        workflowDisabled: true,
      };

      const testWorkflow = defineWorkflow({
        name: "test-prefs-workflow",
        description: "Test preferences access in workflow",
        args: {},
        handler: async () => {
          const retryConfig = getContextRetryConfig();
          results.maxAttempts = retryConfig.maxAttempts;
          results.workflowDisabled = isContextWorkflowDisabled(
            "nonexistent-workflow",
          );
        },
      });

      await testWorkflow.execute({});

      assertEquals(results.maxAttempts >= 1, true);
      assertEquals(results.workflowDisabled, false);
    },
  );

  await t.step(
    "subflow should inherit parent context",
    async () => {
      const contextStates: boolean[] = [];

      const subWorkflow = defineWorkflow({
        name: "sub",
        description: "Subflow",
        args: {},
        handler: async () => {
          contextStates.push(PreferencesContext.isInContext());
        },
      });

      const parentWorkflow = defineWorkflow({
        name: "parent",
        description: "Parent workflow",
        args: {},
        subflows: [subWorkflow],
        handler: async (_args, ctx) => {
          contextStates.push(PreferencesContext.isInContext());
          const sub = await ctx.getSubflow("sub");
          if (sub) {
            await sub.execute({});
          }
        },
      });

      await parentWorkflow.execute({});

      assertEquals(contextStates[0], true, "Parent should have context");
      // 注意：subflow.execute() 会创建新的 context，所以也是 true
      assertEquals(contextStates[1], true, "Subflow should have context");
    },
  );

  await t.step(
    "Promise.all in workflow should preserve context",
    async () => {
      const results: boolean[] = [];

      const testWorkflow = defineWorkflow({
        name: "test-parallel-workflow",
        description: "Test parallel execution in workflow",
        args: {},
        handler: async () => {
          const tasks = await Promise.all([
            Promise.resolve(PreferencesContext.isInContext()),
            Promise.resolve().then(() => PreferencesContext.isInContext()),
            (async () => {
              await Promise.resolve();
              return PreferencesContext.isInContext();
            })(),
          ]);
          results.push(...tasks);
        },
      });

      await testWorkflow.execute({});

      assertEquals(results, [true, true, true]);
    },
  );
});

// =============================================================================
// MCP 调用模拟测试
// =============================================================================

Deno.test("MCP-like calls within workflow context", async (t) => {
  // 模拟 MCP 工具调用
  async function mockMcpTool(name: string): Promise<{
    name: string;
    contextAvailable: boolean;
    agent: string;
  }> {
    await Promise.resolve(); // 模拟异步
    return {
      name,
      contextAvailable: PreferencesContext.isInContext(),
      agent: getContextPreferredAgent(),
    };
  }

  await t.step(
    "MCP tool calls should access PreferencesContext",
    async () => {
      const results: {
        name: string;
        contextAvailable: boolean;
        agent: string;
      } = { name: "", contextAvailable: false, agent: "" };

      const testWorkflow = defineWorkflow({
        name: "test-mcp-workflow",
        description: "Test MCP tool calls",
        args: {},
        handler: async () => {
          const toolResult = await mockMcpTool("test-tool");
          results.name = toolResult.name;
          results.contextAvailable = toolResult.contextAvailable;
          results.agent = toolResult.agent;
        },
      });

      await testWorkflow.execute({});

      assertEquals(results.name, "test-tool");
      assertEquals(results.contextAvailable, true);
      assertExists(results.agent);
    },
  );

  await t.step(
    "multiple MCP tool calls should all access context",
    async () => {
      const toolResults: { contextAvailable: boolean }[] = [];

      const testWorkflow = defineWorkflow({
        name: "test-multi-mcp-workflow",
        description: "Test multiple MCP tool calls",
        args: {},
        handler: async () => {
          // 顺序调用
          toolResults.push(await mockMcpTool("tool1"));
          toolResults.push(await mockMcpTool("tool2"));

          // 并行调用
          const parallelResults = await Promise.all([
            mockMcpTool("tool3"),
            mockMcpTool("tool4"),
          ]);
          toolResults.push(...parallelResults);
        },
      });

      await testWorkflow.execute({});

      assertEquals(toolResults.length, 4);
      for (const result of toolResults) {
        assertEquals(result.contextAvailable, true);
      }
    },
  );
});

// =============================================================================
// AI Query 模拟测试
// =============================================================================

Deno.test("AI Query simulation within workflow", async (t) => {
  // 模拟 AI 查询（类似 createAiQueryBuilder）
  async function mockAiQuery(prompt: string): Promise<{
    prompt: string;
    agent: string;
    contextAvailable: boolean;
  }> {
    await Promise.resolve();
    return {
      prompt,
      agent: getContextPreferredAgent(),
      contextAvailable: PreferencesContext.isInContext(),
    };
  }

  await t.step(
    "AI query should use context for agent selection",
    async () => {
      const results: { contextAvailable: boolean; agent: string } = {
        contextAvailable: false,
        agent: "",
      };

      const testWorkflow = defineWorkflow({
        name: "test-ai-workflow",
        description: "Test AI query context",
        args: {},
        handler: async () => {
          const queryResult = await mockAiQuery("test prompt");
          results.contextAvailable = queryResult.contextAvailable;
          results.agent = queryResult.agent;
        },
      });

      await testWorkflow.execute({});

      assertEquals(results.contextAvailable, true);
      // agent 应该来自 context（默认是 claude-code）
      assertExists(results.agent);
    },
  );
});

// =============================================================================
// 错误恢复测试
// =============================================================================

Deno.test("Context survives errors in workflow", async (t) => {
  await t.step(
    "context should survive caught errors",
    async () => {
      let contextAfterError = false;

      const testWorkflow = defineWorkflow({
        name: "test-error-workflow",
        description: "Test error handling with context",
        args: {},
        handler: async () => {
          try {
            throw new Error("Test error");
          } catch {
            // 错误后 context 应该仍然可用
            contextAfterError = PreferencesContext.isInContext();
          }
        },
      });

      await testWorkflow.execute({});

      assertEquals(contextAfterError, true);
    },
  );

  await t.step(
    "context should survive rejected promises",
    async () => {
      let contextAfterRejection = false;

      const testWorkflow = defineWorkflow({
        name: "test-rejection-workflow",
        description: "Test promise rejection with context",
        args: {},
        handler: async () => {
          try {
            await Promise.reject(new Error("Test rejection"));
          } catch {
            contextAfterRejection = PreferencesContext.isInContext();
          }
        },
      });

      await testWorkflow.execute({});

      assertEquals(contextAfterRejection, true);
    },
  );
});

// =============================================================================
// 实际 workflow 模式测试
// =============================================================================

Deno.test("Real workflow patterns", async (t) => {
  await t.step(
    "AI-driven workflow pattern should work with context",
    async () => {
      // 模拟 AI 驱动的 workflow 模式
      const executionLog: string[] = [];

      async function simulateAiExecution(): Promise<void> {
        executionLog.push(`context: ${PreferencesContext.isInContext()}`);
        executionLog.push(`agent: ${getContextPreferredAgent()}`);

        // 模拟多轮 AI 调用
        for (let i = 0; i < 3; i++) {
          await Promise.resolve();
          executionLog.push(`turn ${i}: ${PreferencesContext.isInContext()}`);
        }
      }

      const aiWorkflow = defineWorkflow({
        name: "ai-driven",
        description: "AI-driven workflow pattern",
        args: {
          prompt: { type: "string", default: "test" },
        },
        handler: async () => {
          await simulateAiExecution();
        },
      });

      await aiWorkflow.execute({ prompt: "test" });

      assertEquals(executionLog[0], "context: true");
      assertEquals(executionLog[1].startsWith("agent:"), true);
      assertEquals(executionLog[2], "turn 0: true");
      assertEquals(executionLog[3], "turn 1: true");
      assertEquals(executionLog[4], "turn 2: true");
    },
  );

  await t.step(
    "programmatic workflow pattern should work with context",
    async () => {
      const operations: { name: string; hasContext: boolean }[] = [];

      async function dbOperation(name: string): Promise<void> {
        await Promise.resolve();
        operations.push({
          name,
          hasContext: PreferencesContext.isInContext(),
        });
      }

      const programmaticWorkflow = defineWorkflow({
        name: "programmatic",
        description: "Programmatic workflow pattern",
        args: {},
        handler: async () => {
          await dbOperation("read");
          await dbOperation("process");
          await dbOperation("write");
        },
      });

      await programmaticWorkflow.execute({});

      assertEquals(operations.length, 3);
      for (const op of operations) {
        assertEquals(op.hasContext, true);
      }
    },
  );
});
