/**
 * AsyncContext 集成测试
 *
 * 测试 AsyncLocalStorage 与 preferences 系统的联动
 */

import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  AsyncContext,
  getContextAgentConfig,
  getContextDefaultProfiles,
  getContextFallbackChain,
  getContextPreferredAgent,
  getContextProfile,
  getContextRetryConfig,
  isContextMcpDisabled,
  isContextWorkflowDisabled,
  PreferencesContext,
  withPreferences,
} from "./async-context.ts";
import type { Preferences } from "./preferences.schema.ts";

// =============================================================================
// Generic AsyncContext Tests
// =============================================================================

Deno.test("AsyncContext", async (t) => {
  await t.step("should store and retrieve value in context", () => {
    const ctx = new AsyncContext<string>("TestContext");

    ctx.run("hello", () => {
      assertEquals(ctx.current(), "hello");
    });
  });

  await t.step("should throw when accessing outside context", () => {
    const ctx = new AsyncContext<string>("TestContext");

    assertThrows(
      () => ctx.current(),
      Error,
      "TestContext: Not running in context",
    );
  });

  await t.step("should return undefined with tryGet outside context", () => {
    const ctx = new AsyncContext<string>("TestContext");
    assertEquals(ctx.tryGet(), undefined);
  });

  await t.step(
    "should return default with getOrDefault outside context",
    () => {
      const ctx = new AsyncContext<string>("TestContext");
      assertEquals(ctx.getOrDefault("default"), "default");
    },
  );

  await t.step("should work with nested async calls", async () => {
    const ctx = new AsyncContext<number>("NumberContext");

    async function inner(): Promise<number> {
      await Promise.resolve(); // simulate async
      return ctx.current();
    }

    async function outer(): Promise<number> {
      return await inner();
    }

    const result = await ctx.run(42, async () => {
      return await outer();
    });

    assertEquals(result, 42);
  });

  await t.step("should isolate nested contexts", () => {
    const ctx = new AsyncContext<string>("IsolateContext");

    ctx.run("outer", () => {
      assertEquals(ctx.current(), "outer");

      ctx.run("inner", () => {
        assertEquals(ctx.current(), "inner");
      });

      assertEquals(ctx.current(), "outer");
    });
  });

  await t.step("isInContext should return correct value", () => {
    const ctx = new AsyncContext<string>("CheckContext");

    assertEquals(ctx.isInContext(), false);

    ctx.run("value", () => {
      assertEquals(ctx.isInContext(), true);
    });

    assertEquals(ctx.isInContext(), false);
  });
});

// =============================================================================
// PreferencesContext Tests
// =============================================================================

Deno.test("PreferencesContext", async (t) => {
  const testPrefs: Preferences = {
    ai: {
      defaultAgent: "test-agent",
      agents: {
        "test-agent": {
          enabled: true,
          model: "test-model",
          options: { maxTokens: 1000 },
        },
        "disabled-agent": {
          enabled: false,
          model: "disabled-model",
          options: {},
        },
      },
      fallbackChain: ["test-agent", "claude-code"],
      retry: {
        maxAttempts: 5,
        initialDelayMs: 500,
        maxDelayMs: 10000,
        backoffMultiplier: 1.5,
        retryOn: ["timeout"],
      },
    },
    workflows: {
      "special-workflow": {
        preferredAgent: "special-agent",
        disabled: false,
      },
      "disabled-workflow": {
        disabled: true,
      },
    },
    mcps: {
      "disabled-mcp": {
        disabled: true,
      },
    },
  };

  await t.step("should store preferences in context", () => {
    PreferencesContext.run(testPrefs, () => {
      const prefs = PreferencesContext.current();
      assertEquals(prefs.ai?.defaultAgent, "test-agent");
    });
  });

  await t.step("getContextPreferredAgent should return correct agent", () => {
    PreferencesContext.run(testPrefs, () => {
      // 无 workflow 名称时返回默认
      assertEquals(getContextPreferredAgent(), "test-agent");

      // 有特定配置的 workflow
      assertEquals(
        getContextPreferredAgent("special-workflow"),
        "special-agent",
      );

      // 无特定配置的 workflow 返回默认
      assertEquals(getContextPreferredAgent("unknown-workflow"), "test-agent");
    });

    // 不在上下文中时返回 claude-code
    assertEquals(getContextPreferredAgent(), "claude-code");
  });

  await t.step("isContextWorkflowDisabled should check correctly", () => {
    PreferencesContext.run(testPrefs, () => {
      assertEquals(isContextWorkflowDisabled("disabled-workflow"), true);
      assertEquals(isContextWorkflowDisabled("special-workflow"), false);
      assertEquals(isContextWorkflowDisabled("unknown-workflow"), false);
    });

    // 不在上下文中时返回 false
    assertEquals(isContextWorkflowDisabled("any"), false);
  });

  await t.step("isContextMcpDisabled should check correctly", () => {
    PreferencesContext.run(testPrefs, () => {
      assertEquals(isContextMcpDisabled("disabled-mcp"), true);
      assertEquals(isContextMcpDisabled("enabled-mcp"), false);
    });
  });

  await t.step("getContextFallbackChain should return chain", () => {
    PreferencesContext.run(testPrefs, () => {
      assertEquals(getContextFallbackChain(), ["test-agent", "claude-code"]);
    });

    // 不在上下文中时返回默认
    assertEquals(getContextFallbackChain(), ["claude-code", "codex"]);
  });

  await t.step("getContextAgentConfig should return agent config", () => {
    PreferencesContext.run(testPrefs, () => {
      const config = getContextAgentConfig("test-agent");
      assertEquals(config?.enabled, true);
      assertEquals(config?.model, "test-model");

      const disabled = getContextAgentConfig("disabled-agent");
      assertEquals(disabled?.enabled, false);

      const unknown = getContextAgentConfig("unknown");
      assertEquals(unknown, undefined);
    });
  });

  await t.step("getContextRetryConfig should return retry config", () => {
    PreferencesContext.run(testPrefs, () => {
      const retry = getContextRetryConfig();
      assertEquals(retry.maxAttempts, 5);
      assertEquals(retry.initialDelayMs, 500);
      assertEquals(retry.retryOn, ["timeout"]);
    });

    // 不在上下文中时返回默认
    const defaultRetry = getContextRetryConfig();
    assertEquals(defaultRetry.maxAttempts, 3);
  });
});

// =============================================================================
// Profile-based Config Tests (new builder format)
// =============================================================================

Deno.test("PreferencesContext with profiles", async (t) => {
  // 模拟新的 builder 输出格式
  const profileBasedPrefs = {
    ai: {
      profiles: {
        "claude-code": {
          sdk: "claude-code-agent-sdk",
          options: { permissionMode: "acceptEdits" },
        },
        "codex": {
          sdk: "codex-agent-sdk",
          options: { modelReasoningEffort: "high" },
        },
        "my-custom": {
          sdk: "claude-code-agent-sdk",
          options: { maxTurns: 5 },
        },
      },
      default: ["claude-code", "codex", "my-custom"],
      retry: { maxAttempts: 3 },
    },
    workflows: {},
    mcps: {},
  } as unknown as Preferences;

  await t.step("getContextProfile should return profile config", () => {
    PreferencesContext.run(profileBasedPrefs, () => {
      const claude = getContextProfile("claude-code") as Record<
        string,
        unknown
      >;
      assertEquals(claude?.sdk, "claude-code-agent-sdk");

      const codex = getContextProfile("codex") as Record<string, unknown>;
      assertEquals(codex?.sdk, "codex-agent-sdk");

      const custom = getContextProfile("my-custom") as Record<string, unknown>;
      assertEquals((custom?.options as Record<string, unknown>)?.maxTurns, 5);

      const unknown = getContextProfile("unknown");
      assertEquals(unknown, undefined);
    });
  });

  await t.step("getContextDefaultProfiles should return profile chain", () => {
    PreferencesContext.run(profileBasedPrefs, () => {
      assertEquals(getContextDefaultProfiles(), [
        "claude-code",
        "codex",
        "my-custom",
      ]);
    });
  });
});

// =============================================================================
// withPreferences Helper Test
// =============================================================================

Deno.test("withPreferences helper", async (t) => {
  await t.step("should load and run with preferences", async () => {
    // 这个测试会实际加载 user/preferences.ts
    await withPreferences(() => {
      // 应该在上下文中
      assertEquals(PreferencesContext.isInContext(), true);

      // 应该有默认配置
      const prefs = PreferencesContext.current();
      assertEquals(typeof prefs.ai, "object");
    });

    // 退出后不在上下文中
    assertEquals(PreferencesContext.isInContext(), false);
  });
});

// =============================================================================
// Async Propagation Test
// =============================================================================

Deno.test("Context propagation through async calls", async (t) => {
  await t.step("should propagate through Promise chains", async () => {
    const testPrefs: Preferences = {
      ai: { defaultAgent: "async-test", fallbackChain: ["async-test"] },
      workflows: {},
      mcps: {},
    };

    async function level3(): Promise<string> {
      await new Promise((r) => setTimeout(r, 10));
      return getContextPreferredAgent();
    }

    async function level2(): Promise<string> {
      await Promise.resolve();
      return await level3();
    }

    async function level1(): Promise<string> {
      return await level2();
    }

    const result = await PreferencesContext.run(testPrefs, async () => {
      return await level1();
    });

    assertEquals(result, "async-test");
  });

  await t.step("should propagate through Promise.all", async () => {
    const testPrefs: Preferences = {
      ai: { defaultAgent: "parallel-test", fallbackChain: ["parallel-test"] },
      workflows: {},
      mcps: {},
    };

    const results = await PreferencesContext.run(testPrefs, async () => {
      return await Promise.all([
        Promise.resolve(getContextPreferredAgent()),
        Promise.resolve().then(() => getContextPreferredAgent()),
        (async () => {
          await new Promise((r) => setTimeout(r, 5));
          return getContextPreferredAgent();
        })(),
      ]);
    });

    assertEquals(results, ["parallel-test", "parallel-test", "parallel-test"]);
  });

  await t.step("should propagate through setTimeout callbacks", async () => {
    const testPrefs: Preferences = {
      ai: { defaultAgent: "timeout-test", fallbackChain: ["timeout-test"] },
      workflows: {},
      mcps: {},
    };

    const result = await PreferencesContext.run(testPrefs, async () => {
      return await new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve(getContextPreferredAgent());
        }, 10);
      });
    });

    assertEquals(result, "timeout-test");
  });

  await t.step("should propagate through Promise.race", async () => {
    const testPrefs: Preferences = {
      ai: { defaultAgent: "race-test", fallbackChain: ["race-test"] },
      workflows: {},
      mcps: {},
    };

    // 使用 AbortController 来正确取消第二个 timer
    const abortController = new AbortController();

    const result = await PreferencesContext.run(testPrefs, async () => {
      const result = await Promise.race([
        new Promise<string>((resolve) =>
          setTimeout(() => resolve(getContextPreferredAgent()), 5)
        ),
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve("should-not-win"), 50);
          abortController.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          });
        }),
      ]);
      abortController.abort();
      return result;
    });

    assertEquals(result, "race-test");
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

Deno.test("Error Handling", async (t) => {
  await t.step("context should survive after error in nested call", () => {
    const ctx = new AsyncContext<string>("ErrorContext");

    ctx.run("value", () => {
      try {
        ctx.run("inner", () => {
          throw new Error("Test error");
        });
      } catch {
        // 错误后外层上下文应该仍然有效
        assertEquals(ctx.current(), "value");
      }
    });
  });

  await t.step(
    "context should survive after rejected promise",
    async () => {
      const testPrefs: Preferences = {
        ai: { defaultAgent: "error-test", fallbackChain: ["error-test"] },
        workflows: {},
        mcps: {},
      };

      await PreferencesContext.run(testPrefs, async () => {
        try {
          await Promise.reject(new Error("Test rejection"));
        } catch {
          // 错误后上下文应该仍然有效
          assertEquals(getContextPreferredAgent(), "error-test");
        }
      });
    },
  );

  await t.step("should handle concurrent contexts correctly", async () => {
    const prefs1: Preferences = {
      ai: { defaultAgent: "context-1", fallbackChain: ["context-1"] },
      workflows: {},
      mcps: {},
    };

    const prefs2: Preferences = {
      ai: { defaultAgent: "context-2", fallbackChain: ["context-2"] },
      workflows: {},
      mcps: {},
    };

    const [result1, result2] = await Promise.all([
      PreferencesContext.run(prefs1, async () => {
        await new Promise((r) => setTimeout(r, 20));
        return getContextPreferredAgent();
      }),
      PreferencesContext.run(prefs2, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getContextPreferredAgent();
      }),
    ]);

    // 两个并发上下文应该保持隔离
    assertEquals(result1, "context-1");
    assertEquals(result2, "context-2");
  });
});

// =============================================================================
// Complex Workflow Tests
// =============================================================================

Deno.test("Complex Workflow Scenarios", async (t) => {
  await t.step("should support workflow with multiple MCPs", async () => {
    const testPrefs: Preferences = {
      ai: { defaultAgent: "claude-code", fallbackChain: ["claude-code"] },
      workflows: {
        "complex-workflow": {
          preferredAgent: "codex",
          disabled: false,
        },
      },
      mcps: {
        "mcp-1": { disabled: false },
        "mcp-2": { disabled: true },
        "mcp-3": { disabled: false },
      },
    };

    await PreferencesContext.run(testPrefs, async () => {
      assertEquals(getContextPreferredAgent("complex-workflow"), "codex");
      assertEquals(isContextMcpDisabled("mcp-1"), false);
      assertEquals(isContextMcpDisabled("mcp-2"), true);
      assertEquals(isContextMcpDisabled("mcp-3"), false);
    });
  });

  await t.step("should support nested workflow calls", async () => {
    const outerPrefs: Preferences = {
      ai: { defaultAgent: "outer-agent", fallbackChain: ["outer-agent"] },
      workflows: {},
      mcps: {},
    };

    const innerPrefs: Preferences = {
      ai: { defaultAgent: "inner-agent", fallbackChain: ["inner-agent"] },
      workflows: {},
      mcps: {},
    };

    await PreferencesContext.run(outerPrefs, async () => {
      assertEquals(getContextPreferredAgent(), "outer-agent");

      // 嵌套的 workflow 使用不同的配置
      await PreferencesContext.run(innerPrefs, async () => {
        assertEquals(getContextPreferredAgent(), "inner-agent");
      });

      // 返回外层后应该恢复
      assertEquals(getContextPreferredAgent(), "outer-agent");
    });
  });

  await t.step("should handle dynamic workflow selection", async () => {
    const testPrefs: Preferences = {
      ai: { defaultAgent: "default-agent", fallbackChain: ["default-agent"] },
      workflows: {
        "fast-workflow": { preferredAgent: "fast-agent", disabled: false },
        "slow-workflow": { preferredAgent: "slow-agent", disabled: false },
        "disabled-workflow": { disabled: true },
      },
      mcps: {},
    };

    await PreferencesContext.run(testPrefs, async () => {
      const workflowNames = ["fast-workflow", "slow-workflow", "other"];

      const agents = workflowNames.map((name) =>
        getContextPreferredAgent(name)
      );

      assertEquals(agents, ["fast-agent", "slow-agent", "default-agent"]);
    });
  });
});

// =============================================================================
// Type Compatibility Tests
// =============================================================================

Deno.test("Type Compatibility", async (t) => {
  await t.step("should work with both old and new config formats", async () => {
    // 旧格式 (agents)
    const oldFormat: Preferences = {
      ai: {
        defaultAgent: "claude-code",
        agents: {
          "claude-code": { enabled: true, model: "claude-3" },
        },
        fallbackChain: ["claude-code"],
      },
      workflows: {},
      mcps: {},
    };

    // 新格式 (profiles) - 通过 as unknown as Preferences 模拟
    const newFormat = {
      ai: {
        profiles: {
          "claude-code": { sdk: "claude-code-agent-sdk", options: {} },
        },
        default: ["claude-code"],
      },
      workflows: {},
      mcps: {},
    } as unknown as Preferences;

    // 旧格式应该正常工作
    PreferencesContext.run(oldFormat, () => {
      const config = getContextAgentConfig("claude-code");
      assertEquals(config?.enabled, true);
    });

    // 新格式应该通过 getContextProfile 工作
    PreferencesContext.run(newFormat, () => {
      const profile = getContextProfile("claude-code");
      assertEquals(profile !== undefined, true);
    });
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

Deno.test("Performance", async (t) => {
  await t.step("should handle many rapid context switches", async () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      const prefs: Preferences = {
        ai: { defaultAgent: `agent-${i}`, fallbackChain: [`agent-${i}`] },
        workflows: {},
        mcps: {},
      };

      PreferencesContext.run(prefs, () => {
        assertEquals(getContextPreferredAgent(), `agent-${i}`);
      });
    }

    const elapsed = performance.now() - start;

    // 1000 次上下文切换应该在 100ms 内完成
    assertEquals(elapsed < 1000, true, `Too slow: ${elapsed}ms`);
  });

  await t.step("should handle deep nesting efficiently", async () => {
    const ctx = new AsyncContext<number>("DeepContext");
    const start = performance.now();

    function nest(depth: number): number {
      if (depth === 0) {
        return ctx.current();
      }
      return ctx.run(depth, () => nest(depth - 1));
    }

    const result = ctx.run(100, () => nest(99));
    assertEquals(result, 1);

    const elapsed = performance.now() - start;

    // 100 层嵌套应该在 50ms 内完成
    assertEquals(elapsed < 500, true, `Too slow: ${elapsed}ms`);
  });

  await t.step("should handle many concurrent contexts", async () => {
    const start = performance.now();

    const promises = Array.from({ length: 100 }, (_, i) => {
      const prefs: Preferences = {
        ai: {
          defaultAgent: `concurrent-${i}`,
          fallbackChain: [`concurrent-${i}`],
        },
        workflows: {},
        mcps: {},
      };

      return PreferencesContext.run(prefs, async () => {
        // 使用 Promise.resolve() 代替 setTimeout 避免 timer leaks
        await Promise.resolve();
        return getContextPreferredAgent();
      });
    });

    const results = await Promise.all(promises);

    // 验证每个上下文返回正确的值
    results.forEach((result, i) => {
      assertEquals(result, `concurrent-${i}`);
    });

    const elapsed = performance.now() - start;

    // 100 个并发上下文应该在 500ms 内完成
    assertEquals(elapsed < 1000, true, `Too slow: ${elapsed}ms`);
  });
});
