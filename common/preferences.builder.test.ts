/**
 * Preferences Builder 完整测试
 *
 * 包含类型测试和运行时行为测试
 * 运行: deno test --allow-all common/preferences.builder.test.ts
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import { expectTypeOf } from "expect-type";
import {
  type ClaudeCodeAgentSdkOptions,
  type ClaudePermissionMode,
  type CodexAgentOptions,
  definePreferences,
  type ModelReasoningEffort,
} from "./preferences.builder.ts";
import type { Preferences } from "./preferences.schema.ts";

// =============================================================================
// SDK 类型验证
// =============================================================================

Deno.test("SDK Types", async (t) => {
  await t.step(
    "ClaudeCodeAgentSdkOptions should have correct properties",
    () => {
      expectTypeOf<ClaudeCodeAgentSdkOptions>().toHaveProperty("model");
      expectTypeOf<ClaudeCodeAgentSdkOptions>().toHaveProperty(
        "permissionMode",
      );
      expectTypeOf<ClaudeCodeAgentSdkOptions>().toHaveProperty(
        "maxThinkingTokens",
      );
      expectTypeOf<ClaudeCodeAgentSdkOptions>().toHaveProperty("maxTurns");
      expectTypeOf<ClaudeCodeAgentSdkOptions>().toHaveProperty("maxBudgetUsd");
    },
  );

  await t.step("CodexAgentOptions should have correct properties", () => {
    expectTypeOf<CodexAgentOptions>().toHaveProperty("model");
    expectTypeOf<CodexAgentOptions>().toHaveProperty("modelReasoningEffort");
    expectTypeOf<CodexAgentOptions>().toHaveProperty("sandboxMode");
    expectTypeOf<CodexAgentOptions>().toHaveProperty("networkAccessEnabled");
    expectTypeOf<CodexAgentOptions>().toHaveProperty("webSearchEnabled");
  });

  await t.step("ClaudePermissionMode should be correct union", () => {
    expectTypeOf<ClaudePermissionMode>().toMatchTypeOf<
      "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk"
    >();
  });

  await t.step("ModelReasoningEffort should be correct union", () => {
    expectTypeOf<ModelReasoningEffort>().toMatchTypeOf<
      "minimal" | "low" | "medium" | "high"
    >();
  });
});

// =============================================================================
// definePreferences 类型验证
// =============================================================================

Deno.test("definePreferences Types", async (t) => {
  await t.step("should return Preferences type", () => {
    const config = definePreferences((_ctx, p) => p.build());
    expectTypeOf(config).toMatchTypeOf<Preferences>();
  });

  await t.step("context should have env and platform", () => {
    definePreferences((ctx, p) => {
      expectTypeOf(ctx.env).toHaveProperty("isDev");
      expectTypeOf(ctx.env).toHaveProperty("isProd");
      expectTypeOf(ctx.env).toHaveProperty("name");
      expectTypeOf(ctx.env).toHaveProperty("get");
      expectTypeOf(ctx.platform).toHaveProperty("os");
      expectTypeOf(ctx.platform).toHaveProperty("isMac");
      expectTypeOf(ctx.platform).toHaveProperty("isLinux");
      expectTypeOf(ctx.platform).toHaveProperty("isWindows");
      return p.build();
    });
  });
});

// =============================================================================
// Context 功能测试
// =============================================================================

Deno.test("Context Functionality", async (t) => {
  await t.step("env.get should return environment variable", () => {
    // 设置测试环境变量
    Deno.env.set("TEST_PREF_VAR", "test-value");

    const config = definePreferences((ctx, p) => {
      const value = ctx.env.get("TEST_PREF_VAR");
      assertEquals(value, "test-value");
      return p.build();
    });

    assertExists(config);
    Deno.env.delete("TEST_PREF_VAR");
  });

  await t.step("env.get should return undefined for missing var", () => {
    const config = definePreferences((ctx, p) => {
      const value = ctx.env.get("NONEXISTENT_VAR_12345");
      assertEquals(value, undefined);
      return p.build();
    });

    assertExists(config);
  });

  await t.step("env.isDev should detect development environment", () => {
    const originalEnv = Deno.env.get("ENV");

    Deno.env.set("ENV", "development");
    let config = definePreferences((ctx, p) => {
      assertEquals(ctx.env.isDev, true);
      assertEquals(ctx.env.isProd, false);
      return p.build();
    });
    assertExists(config);

    Deno.env.set("ENV", "production");
    config = definePreferences((ctx, p) => {
      assertEquals(ctx.env.isDev, false);
      assertEquals(ctx.env.isProd, true);
      return p.build();
    });
    assertExists(config);

    if (originalEnv) {
      Deno.env.set("ENV", originalEnv);
    } else {
      Deno.env.delete("ENV");
    }
  });

  await t.step("platform should detect OS correctly", () => {
    const config = definePreferences((ctx, p) => {
      const os = Deno.build.os;
      assertEquals(ctx.platform.os, os);
      assertEquals(ctx.platform.isMac, os === "darwin");
      assertEquals(ctx.platform.isLinux, os === "linux");
      assertEquals(ctx.platform.isWindows, os === "windows");
      return p.build();
    });

    assertExists(config);
  });

  await t.step("should use context for dynamic configuration", () => {
    Deno.env.set("ENV", "development");

    const config = definePreferences((ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("claude-code", (profile) =>
            profile.useClaudeCodeAgentSdk({
              permissionMode: ctx.env.isDev ? "acceptEdits" : "default",
            }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<
        string,
        { options?: { permissionMode?: string } }
      >;
    };
    assertEquals(
      ai.profiles["claude-code"].options?.permissionMode,
      "acceptEdits",
    );

    Deno.env.delete("ENV");
  });
});

// =============================================================================
// Profile 类型约束验证
// =============================================================================

Deno.test("Profile Type Constraints", async (t) => {
  await t.step("builtin profiles should be available by default", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("test", (w) => w.preferredAgent("claude-code"))
        .mcp("test", (m) => m.preferredAgent("codex"))
        .build()
    );
    expectTypeOf(config).toMatchTypeOf<Preferences>();
  });

  await t.step("custom profiles should be type-safe", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile(
              "my-claude",
              (profile) => profile.useClaudeCodeAgentSdk({}),
            )
            .profile("my-codex", (profile) => profile.useCodexAgent({}))
            .default("my-claude", "my-codex")
        )
        .workflow("test", (w) => w.preferredAgent("my-claude"))
        .build()
    );
    expectTypeOf(config).toMatchTypeOf<Preferences>();
  });

  await t.step("profile retry should accept correct options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("with-retry", (profile) =>
            profile
              .useClaudeCodeAgentSdk({})
              .retry({
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
                backoffMultiplier: 2,
                retryOn: ["timeout", "rate_limit"],
              }))
        )
        .build()
    );
    expectTypeOf(config).toMatchTypeOf<Preferences>();
  });
});

// =============================================================================
// Claude SDK Options 测试
// =============================================================================

Deno.test("Claude SDK Options", async (t) => {
  await t.step("should accept all Claude options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("claude-full", (profile) =>
            profile.useClaudeCodeAgentSdk({
              model: "claude-sonnet-4-20250514",
              permissionMode: "acceptEdits",
              maxThinkingTokens: 16384,
              maxTurns: 20,
              maxBudgetUsd: 5.0,
            }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<
        string,
        { sdk: string; options: Record<string, unknown> }
      >;
    };
    const profile = ai.profiles["claude-full"];

    assertEquals(profile.sdk, "claude-code-agent-sdk");
    assertEquals(profile.options.model, "claude-sonnet-4-20250514");
    assertEquals(profile.options.permissionMode, "acceptEdits");
    assertEquals(profile.options.maxThinkingTokens, 16384);
    assertEquals(profile.options.maxTurns, 20);
    assertEquals(profile.options.maxBudgetUsd, 5.0);
  });

  await t.step("should accept partial Claude options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("claude-partial", (profile) =>
            profile.useClaudeCodeAgentSdk({
              maxTurns: 5,
            }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
    };
    assertEquals(ai.profiles["claude-partial"].options.maxTurns, 5);
    assertEquals(ai.profiles["claude-partial"].options.model, undefined);
  });

  await t.step("should accept empty Claude options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("claude-empty", (profile) =>
            profile.useClaudeCodeAgentSdk({}))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { sdk: string }>;
    };
    assertEquals(ai.profiles["claude-empty"].sdk, "claude-code-agent-sdk");
  });

  await t.step("should accept all permission modes", () => {
    const modes: ClaudePermissionMode[] = [
      "default",
      "acceptEdits",
      "bypassPermissions",
      "plan",
      "dontAsk",
    ];

    for (const mode of modes) {
      const config = definePreferences((_ctx, p) =>
        p
          .ai((ai) =>
            ai.profile(`claude-${mode}`, (profile) =>
              profile.useClaudeCodeAgentSdk({ permissionMode: mode }))
          )
          .build()
      );

      const ai = config.ai as unknown as {
        profiles: Record<string, { options: { permissionMode: string } }>;
      };
      assertEquals(ai.profiles[`claude-${mode}`].options.permissionMode, mode);
    }
  });
});

// =============================================================================
// Codex SDK Options 测试
// =============================================================================

Deno.test("Codex SDK Options", async (t) => {
  await t.step("should accept all Codex options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("codex-full", (profile) =>
            profile.useCodexAgent({
              model: "o3-mini",
              modelReasoningEffort: "high",
              networkAccessEnabled: true,
              webSearchEnabled: true,
            }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<
        string,
        { sdk: string; options: Record<string, unknown> }
      >;
    };
    const profile = ai.profiles["codex-full"];

    assertEquals(profile.sdk, "codex-agent-sdk");
    assertEquals(profile.options.model, "o3-mini");
    assertEquals(profile.options.modelReasoningEffort, "high");
    assertEquals(profile.options.networkAccessEnabled, true);
    assertEquals(profile.options.webSearchEnabled, true);
  });

  await t.step("should accept all reasoning effort levels", () => {
    const efforts: ModelReasoningEffort[] = [
      "minimal",
      "low",
      "medium",
      "high",
    ];

    for (const effort of efforts) {
      const config = definePreferences((_ctx, p) =>
        p
          .ai((ai) =>
            ai.profile(`codex-${effort}`, (profile) =>
              profile.useCodexAgent({ modelReasoningEffort: effort }))
          )
          .build()
      );

      const ai = config.ai as unknown as {
        profiles: Record<string, { options: { modelReasoningEffort: string } }>;
      };
      assertEquals(
        ai.profiles[`codex-${effort}`].options.modelReasoningEffort,
        effort,
      );
    }
  });

  await t.step("should accept boolean network options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("codex-network-on", (profile) =>
              profile.useCodexAgent({
                networkAccessEnabled: true,
                webSearchEnabled: true,
              }))
            .profile("codex-network-off", (profile) =>
              profile.useCodexAgent({
                networkAccessEnabled: false,
                webSearchEnabled: false,
              }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
    };

    assertEquals(
      ai.profiles["codex-network-on"].options.networkAccessEnabled,
      true,
    );
    assertEquals(
      ai.profiles["codex-network-off"].options.networkAccessEnabled,
      false,
    );
  });
});

// =============================================================================
// Workflow 和 MCP 配置测试
// =============================================================================

Deno.test("Workflow and MCP Configuration", async (t) => {
  await t.step("workflow should support disabled", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("disabled-wf", (w) => w.disabled(true))
        .workflow("enabled-wf", (w) => w.disabled(false))
        .build()
    );

    assertEquals(config.workflows?.["disabled-wf"]?.disabled, true);
    assertEquals(config.workflows?.["enabled-wf"]?.disabled, false);
  });

  await t.step("workflow should support aiProfile", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("claude-wf", (w) => w.preferredAgent("claude-code"))
        .workflow("codex-wf", (w) => w.preferredAgent("codex"))
        .build()
    );

    // Builder 输出使用 aiProfile 字段
    const workflows = config.workflows as unknown as Record<
      string,
      { preferredAgent?: string }
    >;
    assertEquals(workflows?.["claude-wf"]?.preferredAgent, "claude-code");
    assertEquals(workflows?.["codex-wf"]?.preferredAgent, "codex");
  });

  await t.step("workflow should support custom options", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("with-options", (w) =>
          w.options({
            timeout: 60000,
            retries: 3,
            custom: { nested: "value" },
          }))
        .build()
    );

    const options = config.workflows?.["with-options"]?.options as Record<
      string,
      unknown
    >;
    assertEquals(options?.timeout, 60000);
    assertEquals(options?.retries, 3);
    assertEquals((options?.custom as Record<string, unknown>)?.nested, "value");
  });

  await t.step("workflow should support chained configuration", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("full-wf", (w) =>
          w
            .preferredAgent("claude-code")
            .disabled(false)
            .options({ key: "value" }))
        .build()
    );

    // Builder 输出使用 aiProfile 字段
    const workflows = config.workflows as unknown as Record<
      string,
      {
        preferredAgent?: string;
        disabled?: boolean;
        options?: Record<string, unknown>;
      }
    >;
    assertEquals(workflows?.["full-wf"]?.preferredAgent, "claude-code");
    assertEquals(workflows?.["full-wf"]?.disabled, false);
    assertEquals(workflows?.["full-wf"]?.options?.key, "value");
  });

  await t.step("mcp should support same configuration as workflow", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .mcp("disabled-mcp", (m) => m.disabled(true))
        .mcp("with-profile", (m) => m.preferredAgent("codex"))
        .mcp("with-options", (m) => m.options({ setting: true }))
        .mcp("full-mcp", (m) =>
          m.preferredAgent("claude-code").disabled(false).options({ x: 1 }))
        .build()
    );

    // MCP config 使用 aiProfile 字段（builder 输出格式）
    const mcps = config.mcps as unknown as Record<
      string,
      {
        disabled?: boolean;
        preferredAgent?: string;
        options?: Record<string, unknown>;
      }
    >;

    assertEquals(mcps?.["disabled-mcp"]?.disabled, true);
    assertEquals(mcps?.["with-profile"]?.preferredAgent, "codex");
    assertEquals(mcps?.["with-options"]?.options?.setting, true);
    assertEquals(mcps?.["full-mcp"]?.preferredAgent, "claude-code");
  });

  await t.step("should handle multiple workflows and mcps", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("wf1", (w) => w.preferredAgent("claude-code"))
        .workflow("wf2", (w) => w.preferredAgent("codex"))
        .workflow("wf3", (w) => w.disabled(true))
        .mcp("mcp1", (m) => m.preferredAgent("claude-code"))
        .mcp("mcp2", (m) => m.disabled(true))
        .build()
    );

    assertEquals(Object.keys(config.workflows || {}).length, 3);
    assertEquals(Object.keys(config.mcps || {}).length, 2);
  });
});

// =============================================================================
// Retry 配置测试
// =============================================================================

Deno.test("Retry Configuration", async (t) => {
  await t.step("profile level retry should be stored", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("with-retry", (profile) =>
            profile
              .useClaudeCodeAgentSdk({})
              .retry({
                maxAttempts: 5,
                initialDelayMs: 2000,
                maxDelayMs: 60000,
                backoffMultiplier: 3,
                retryOn: ["timeout", "rate_limit", "server_error"],
              }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { retry: Record<string, unknown> }>;
    };
    const retry = ai.profiles["with-retry"].retry;

    assertEquals(retry.maxAttempts, 5);
    assertEquals(retry.initialDelayMs, 2000);
    assertEquals(retry.maxDelayMs, 60000);
    assertEquals(retry.backoffMultiplier, 3);
    assertEquals(retry.retryOn, ["timeout", "rate_limit", "server_error"]);
  });

  await t.step("global retry should be stored", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("test", (profile) => profile.useClaudeCodeAgentSdk({}))
            .retry({
              maxAttempts: 10,
              retryOn: ["network_error"],
            })
        )
        .build()
    );

    const ai = config.ai as unknown as { retry: Record<string, unknown> };
    assertEquals(ai.retry.maxAttempts, 10);
    assertEquals(ai.retry.retryOn, ["network_error"]);
  });

  await t.step("should accept partial retry config", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("test", (profile) => profile.useClaudeCodeAgentSdk({}))
            .retry({ maxAttempts: 5 })
        )
        .build()
    );

    const ai = config.ai as unknown as { retry: Record<string, unknown> };
    assertEquals(ai.retry.maxAttempts, 5);
    assertEquals(ai.retry.initialDelayMs, undefined);
  });
});

// =============================================================================
// Default Chain 测试
// =============================================================================

Deno.test("Default Chain", async (t) => {
  await t.step("empty config should have builtin defaults", () => {
    const config = definePreferences((_ctx, p) => p.build());

    const ai = config.ai as unknown as { default: string[] };
    assertEquals(ai.default.includes("claude-code"), true);
    assertEquals(ai.default.includes("codex"), true);
  });

  await t.step("custom profiles should be added to default chain", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("custom1", (p) => p.useClaudeCodeAgentSdk({}))
            .profile("custom2", (p) => p.useCodexAgent({}))
        )
        .build()
    );

    const ai = config.ai as unknown as { default: string[] };
    assertEquals(ai.default.includes("claude-code"), true);
    assertEquals(ai.default.includes("codex"), true);
    assertEquals(ai.default.includes("custom1"), true);
    assertEquals(ai.default.includes("custom2"), true);
  });

  await t.step("explicit default should override order", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("first", (p) => p.useClaudeCodeAgentSdk({}))
            .profile("second", (p) => p.useCodexAgent({}))
            .default("second", "first", "claude-code")
        )
        .build()
    );

    const ai = config.ai as unknown as { default: string[] };
    assertEquals(ai.default[0], "second");
    assertEquals(ai.default[1], "first");
    assertEquals(ai.default[2], "claude-code");
  });

  await t.step("default chain should maintain order", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("a", (p) => p.useClaudeCodeAgentSdk({}))
            .profile("b", (p) => p.useCodexAgent({}))
            .profile("c", (p) => p.useClaudeCodeAgentSdk({}))
        )
        .build()
    );

    const ai = config.ai as unknown as { default: string[] };
    // 内置的在前，自定义的按定义顺序
    const aIndex = ai.default.indexOf("a");
    const bIndex = ai.default.indexOf("b");
    const cIndex = ai.default.indexOf("c");

    assertEquals(aIndex < bIndex, true);
    assertEquals(bIndex < cIndex, true);
  });
});

// =============================================================================
// 内置 Profile 覆盖测试
// =============================================================================

Deno.test("Builtin Profile Override", async (t) => {
  await t.step("should be able to override claude-code profile", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("claude-code", (profile) =>
            profile.useClaudeCodeAgentSdk({
              maxTurns: 100,
              permissionMode: "bypassPermissions",
            }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
    };
    assertEquals(ai.profiles["claude-code"].options.maxTurns, 100);
    assertEquals(
      ai.profiles["claude-code"].options.permissionMode,
      "bypassPermissions",
    );
  });

  await t.step("should be able to override codex profile", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile("codex", (profile) =>
            profile.useCodexAgent({
              modelReasoningEffort: "high",
              networkAccessEnabled: false,
            }))
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
    };
    assertEquals(ai.profiles["codex"].options.modelReasoningEffort, "high");
    assertEquals(ai.profiles["codex"].options.networkAccessEnabled, false);
  });

  await t.step("overridden profiles should still be in default chain", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("claude-code", (p) =>
              p.useClaudeCodeAgentSdk({ maxTurns: 5 }))
            .profile("codex", (p) =>
              p.useCodexAgent({ modelReasoningEffort: "low" }))
        )
        .build()
    );

    const ai = config.ai as unknown as { default: string[] };
    assertEquals(ai.default.includes("claude-code"), true);
    assertEquals(ai.default.includes("codex"), true);
  });
});

// =============================================================================
// 边界情况测试
// =============================================================================

Deno.test("Edge Cases", async (t) => {
  await t.step("should handle empty workflow name", () => {
    const config = definePreferences((_ctx, p) =>
      p.workflow("", (w) => w.preferredAgent("claude-code")).build()
    );

    const workflows = config.workflows as unknown as Record<
      string,
      { preferredAgent?: string }
    >;
    assertEquals(workflows?.[""]?.preferredAgent, "claude-code");
  });

  await t.step("should handle special characters in names", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("my-workflow-v2.0", (w) => w.preferredAgent("claude-code"))
        .workflow("workflow_with_underscore", (w) => w.preferredAgent("codex"))
        .mcp("mcp.with.dots", (m) => m.disabled(true))
        .build()
    );

    const workflows = config.workflows as unknown as Record<
      string,
      { preferredAgent?: string }
    >;
    assertEquals(
      workflows?.["my-workflow-v2.0"]?.preferredAgent,
      "claude-code",
    );
    assertEquals(
      workflows?.["workflow_with_underscore"]?.preferredAgent,
      "codex",
    );
    assertEquals(config.mcps?.["mcp.with.dots"]?.disabled, true);
  });

  await t.step("should handle same workflow configured multiple times", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .workflow("dup", (w) => w.preferredAgent("claude-code"))
        .workflow("dup", (w) => w.preferredAgent("codex")) // 后者覆盖前者
        .build()
    );

    const workflows = config.workflows as unknown as Record<
      string,
      { preferredAgent?: string }
    >;
    assertEquals(workflows?.["dup"]?.preferredAgent, "codex");
  });

  await t.step("should handle very long profile names", () => {
    const longName = "a".repeat(100);
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai.profile(longName, (profile) => profile.useClaudeCodeAgentSdk({}))
        )
        .workflow("test", (w) => w.preferredAgent(longName))
        .build()
    );

    const ai = config.ai as unknown as { profiles: Record<string, unknown> };
    assertExists(ai.profiles[longName]);
  });

  await t.step("should handle numeric values at boundaries", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("boundaries", (profile) =>
              profile.useClaudeCodeAgentSdk({
                maxTurns: 0,
                maxThinkingTokens: 0,
                maxBudgetUsd: 0,
              }))
            .retry({
              maxAttempts: 1,
              initialDelayMs: 0,
              maxDelayMs: 0,
              backoffMultiplier: 0,
            })
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
      retry: Record<string, unknown>;
    };
    assertEquals(ai.profiles["boundaries"].options.maxTurns, 0);
    assertEquals(ai.retry.maxAttempts, 1);
  });
});

// =============================================================================
// 完整配置场景测试
// =============================================================================

Deno.test("Complete Configuration Scenarios", async (t) => {
  await t.step("development environment configuration", () => {
    Deno.env.set("ENV", "development");

    const config = definePreferences((ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("claude-code", (profile) =>
              profile.useClaudeCodeAgentSdk({
                permissionMode: ctx.env.isDev ? "acceptEdits" : "default",
                maxTurns: ctx.env.isDev ? 5 : 20,
              }))
            .profile("codex", (profile) =>
              profile.useCodexAgent({
                modelReasoningEffort: ctx.env.isDev ? "low" : "high",
              }))
            .retry({
              maxAttempts: ctx.env.isDev ? 1 : 3,
            })
        )
        .workflow("git-committer", (w) => w.preferredAgent("codex"))
        .workflow("experimental", (w) =>
          w.disabled(!ctx.env.isDev).preferredAgent("claude-code"))
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
      retry: Record<string, unknown>;
    };

    assertEquals(
      ai.profiles["claude-code"].options.permissionMode,
      "acceptEdits",
    );
    assertEquals(ai.profiles["claude-code"].options.maxTurns, 5);
    assertEquals(ai.profiles["codex"].options.modelReasoningEffort, "low");
    assertEquals(ai.retry.maxAttempts, 1);
    assertEquals(config.workflows?.["experimental"]?.disabled, false);

    Deno.env.delete("ENV");
  });

  await t.step("production environment configuration", () => {
    Deno.env.set("ENV", "production");

    const config = definePreferences((ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("claude-code", (profile) =>
              profile.useClaudeCodeAgentSdk({
                permissionMode: ctx.env.isProd ? "default" : "acceptEdits",
                maxBudgetUsd: ctx.env.isProd ? 10.0 : 1.0,
              }))
            .retry({
              maxAttempts: ctx.env.isProd ? 5 : 1,
              retryOn: [
                "timeout",
                "rate_limit",
                "server_error",
                "network_error",
              ],
            })
        )
        .build()
    );

    const ai = config.ai as unknown as {
      profiles: Record<string, { options: Record<string, unknown> }>;
      retry: Record<string, unknown>;
    };

    assertEquals(ai.profiles["claude-code"].options.permissionMode, "default");
    assertEquals(ai.profiles["claude-code"].options.maxBudgetUsd, 10.0);
    assertEquals(ai.retry.maxAttempts, 5);

    Deno.env.delete("ENV");
  });

  await t.step("multi-profile fallback configuration", () => {
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile("claude-fast", (profile) =>
              profile
                .useClaudeCodeAgentSdk({ maxThinkingTokens: 1000 })
                .retry({ maxAttempts: 1 }))
            .profile("claude-deep", (profile) =>
              profile
                .useClaudeCodeAgentSdk({ maxThinkingTokens: 32000 })
                .retry({ maxAttempts: 3 }))
            .profile("codex-fallback", (profile) =>
              profile
                .useCodexAgent({ modelReasoningEffort: "medium" })
                .retry({ maxAttempts: 5 }))
            .default("claude-fast", "claude-deep", "codex-fallback")
        )
        .workflow("quick-task", (w) => w.preferredAgent("claude-fast"))
        .workflow("complex-task", (w) => w.preferredAgent("claude-deep"))
        .build()
    );

    const ai = config.ai as unknown as { default: string[] };
    assertEquals(ai.default[0], "claude-fast");
    assertEquals(ai.default[1], "claude-deep");
    assertEquals(ai.default[2], "codex-fallback");
  });
});

// =============================================================================
// Agent Weight System 测试
// =============================================================================

import {
  _resetWeightsForTesting,
  getAgentWeight,
  getWeightedDefaultOrder,
  initAgentWeights,
} from "./preferences.builder.ts";

Deno.test("Agent Weight System", async (t) => {
  // 每个测试前重置环境
  const originalClaudeCode = Deno.env.get("CLAUDECODE");
  const originalCodexSandbox = Deno.env.get("CODEX_SANDBOX");

  await t.step("初始状态：权重相同时 claude-code 优先", () => {
    _resetWeightsForTesting();
    Deno.env.delete("CLAUDECODE");
    Deno.env.delete("CODEX_SANDBOX");
    initAgentWeights();

    const order = getWeightedDefaultOrder();
    assertEquals(order, ["claude-code", "codex"]);
    assertEquals(getAgentWeight("claude-code"), 0);
    assertEquals(getAgentWeight("codex"), 0);
  });

  await t.step("CLAUDECODE=1 时 claude-code 权重增加", () => {
    _resetWeightsForTesting();
    Deno.env.set("CLAUDECODE", "1");
    Deno.env.delete("CODEX_SANDBOX");
    initAgentWeights();

    assertEquals(getAgentWeight("claude-code"), 1);
    assertEquals(getAgentWeight("codex"), 0);
    assertEquals(getWeightedDefaultOrder(), ["claude-code", "codex"]);
  });

  await t.step("CODEX_SANDBOX 存在时 codex 权重增加", () => {
    _resetWeightsForTesting();
    Deno.env.delete("CLAUDECODE");
    Deno.env.set("CODEX_SANDBOX", "/some/path");
    initAgentWeights();

    assertEquals(getAgentWeight("claude-code"), 0);
    assertEquals(getAgentWeight("codex"), 1);
    assertEquals(getWeightedDefaultOrder(), ["codex", "claude-code"]);
  });

  await t.step("CODEX_SANDBOX 为空字符串也算存在", () => {
    _resetWeightsForTesting();
    Deno.env.delete("CLAUDECODE");
    Deno.env.set("CODEX_SANDBOX", "");
    initAgentWeights();

    assertEquals(getAgentWeight("codex"), 1);
    assertEquals(getWeightedDefaultOrder(), ["codex", "claude-code"]);
  });

  await t.step("两个环境变量同时存在时两个权重都增加", () => {
    _resetWeightsForTesting();
    Deno.env.set("CLAUDECODE", "1");
    Deno.env.set("CODEX_SANDBOX", "/sandbox");
    initAgentWeights();

    assertEquals(getAgentWeight("claude-code"), 1);
    assertEquals(getAgentWeight("codex"), 1);
    // 权重相同时 claude-code 优先（历史兼容）
    assertEquals(getWeightedDefaultOrder(), ["claude-code", "codex"]);
  });

  await t.step("CLAUDECODE 为空字符串时不增加权重", () => {
    _resetWeightsForTesting();
    Deno.env.set("CLAUDECODE", "");
    Deno.env.delete("CODEX_SANDBOX");
    initAgentWeights();

    assertEquals(getAgentWeight("claude-code"), 0);
  });

  await t.step("CLAUDECODE 为任意 truthy 值都增加权重", () => {
    _resetWeightsForTesting();
    Deno.env.set("CLAUDECODE", "true");
    Deno.env.delete("CODEX_SANDBOX");
    initAgentWeights();

    assertEquals(getAgentWeight("claude-code"), 1);
  });

  await t.step("权重可以累积（模拟嵌套 Agent）", () => {
    _resetWeightsForTesting();
    // 第一层 Agent 检测到 CLAUDECODE
    Deno.env.set("CLAUDECODE", "1");
    initAgentWeights();
    assertEquals(getAgentWeight("claude-code"), 1);

    // 重置初始化标志，模拟子 Agent 启动
    // 但保留权重环境变量（子进程继承）
    const currentWeight = Deno.env.get("JIXOFLOW_CLAUDECODE_WEIGHT");
    _resetWeightsForTesting();
    Deno.env.set("JIXOFLOW_CLAUDECODE_WEIGHT", currentWeight!);
    Deno.env.set("CLAUDECODE", "1");
    initAgentWeights();

    // 权重累积
    assertEquals(getAgentWeight("claude-code"), 2);
  });

  await t.step("build() 使用权重排序的默认配置", () => {
    _resetWeightsForTesting();
    Deno.env.delete("CLAUDECODE");
    Deno.env.set("CODEX_SANDBOX", "/sandbox");
    initAgentWeights();

    const config = definePreferences((_ctx, p) => p.build());
    const ai = config.ai as unknown as { default: string[] };

    // codex 权重更高，排在前面
    assertEquals(ai.default[0], "codex");
    assertEquals(ai.default[1], "claude-code");
  });

  await t.step("用户显式配置覆盖权重排序", () => {
    _resetWeightsForTesting();
    Deno.env.delete("CLAUDECODE");
    Deno.env.set("CODEX_SANDBOX", "/sandbox");
    initAgentWeights();

    // 环境权重让 codex 优先，但用户显式配置 claude-code 优先
    const config = definePreferences((_ctx, p) =>
      p
        .ai((ai) =>
          ai
            .profile(
              "claude-code",
              (profile) => profile.useClaudeCodeAgentSdk(),
            )
            .profile("codex", (profile) => profile.useCodexAgent())
            .default("claude-code", "codex")
        )
        .build()
    );

    const ai = config.ai as unknown as { default: string[] };
    // 用户配置优先
    assertEquals(ai.default[0], "claude-code");
    assertEquals(ai.default[1], "codex");
  });

  // 清理：恢复原始环境变量
  _resetWeightsForTesting();
  if (originalClaudeCode !== undefined) {
    Deno.env.set("CLAUDECODE", originalClaudeCode);
  } else {
    Deno.env.delete("CLAUDECODE");
  }
  if (originalCodexSandbox !== undefined) {
    Deno.env.set("CODEX_SANDBOX", originalCodexSandbox);
  } else {
    Deno.env.delete("CODEX_SANDBOX");
  }
  initAgentWeights();
});
