# Preferences API

JixoFlow 使用 `definePreferences` API 提供类型安全的配置体验。

## 快速开始

```typescript
// user/preferences.ts
import { definePreferences } from "../common/preferences.builder.ts";

export default definePreferences((ctx, p) => p.build());
```

这是最简配置 - 使用所有默认值。

## 内置 Profiles

系统内置两个 AI profile：

| Profile       | SDK                              | 说明                     |
| ------------- | -------------------------------- | ------------------------ |
| `claude-code` | `@anthropic-ai/claude-agent-sdk` | Claude Code Agent (默认) |
| `codex`       | `@openai/codex-sdk`              | OpenAI Codex Agent       |

默认 fallback chain: `["claude-code", "codex"]`

## API 结构

```typescript
definePreferences((ctx, p) =>
  p
    .ai((ai) => ai
      // 定义或覆盖 profiles
      .profile("claude-code", (p) => p.useClaudeCodeAgentSdk({...}))
      .profile("codex", (p) => p.useCodexAgent({...}))
      // 自定义 profile
      .profile("my-fast", (p) => p.useClaudeCodeAgentSdk({...}))
      // 设置 fallback 顺序
      .default("claude-code", "my-fast", "codex")
      // 全局重试配置
      .retry({...})
    )
    // Workflow 特定配置
    .workflow("git-committer", (w) => w.preferredAgent("codex"))
    // MCP 特定配置
    .mcp("memory", (m) => m.preferredAgent("claude-code"))
    .build()
);
```

## Context 对象

`ctx` 提供环境和平台信息：

```typescript
ctx.env.isDev; // boolean - 是否开发环境
ctx.env.isProd; // boolean - 是否生产环境
ctx.env.name; // string - 环境名称
ctx.env.get(key); // 获取环境变量

ctx.platform.os; // "darwin" | "linux" | "windows"
ctx.platform.isMac; // boolean
ctx.platform.isLinux; // boolean
ctx.platform.isWindows; // boolean
```

## Claude Code Agent SDK 选项

```typescript
.profile("claude-code", (p) => p.useClaudeCodeAgentSdk({
  // 模型名称（可选，使用 SDK 默认）
  model: "claude-sonnet-4-5-20250929",
  // 权限模式
  permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk",
  // 最大思考 tokens
  maxThinkingTokens: 8192,
  // 最大轮次
  maxTurns: 10,
  // 最大预算（美元）
  maxBudgetUsd: 1.0,
}))
```

## Codex Agent SDK 选项

```typescript
.profile("codex", (p) => p.useCodexAgent({
  // 模型名称（可选）
  model: "o3-mini",
  // 推理强度
  modelReasoningEffort: "minimal" | "low" | "medium" | "high",
  // 沙箱模式
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access",
  // 网络访问
  networkAccessEnabled: true,
  // Web 搜索
  webSearchEnabled: true,
}))
```

## Profile 级别重试

```typescript
.profile("claude-with-retry", (p) => 
  p.useClaudeCodeAgentSdk({...})
   .retry({
     maxAttempts: 5,
     initialDelayMs: 1000,
     maxDelayMs: 30000,
     backoffMultiplier: 2,
     retryOn: ["timeout", "rate_limit", "server_error", "network_error"],
   })
)
```

## 完整示例

```typescript
import { definePreferences } from "../common/preferences.builder.ts";

export default definePreferences((ctx, p) =>
  p
    .ai((ai) =>
      ai
        // 开发环境使用快速配置
        .profile("claude-code", (profile) =>
          profile.useClaudeCodeAgentSdk({
            permissionMode: ctx.env.isDev ? "acceptEdits" : "default",
            maxTurns: ctx.env.isDev ? 5 : 20,
          }))
        // 配置 Codex
        .profile("codex", (profile) =>
          profile.useCodexAgent({
            modelReasoningEffort: ctx.platform.isMac ? "high" : "medium",
            networkAccessEnabled: ctx.env.isProd,
          }))
        // 自定义 profile: 高推理模式
        .profile("codex-max", (profile) =>
          profile
            .useCodexAgent({ modelReasoningEffort: "high" })
            .retry({ maxAttempts: 5, retryOn: ["timeout"] }))
        // 设置 fallback 顺序
        .default("claude-code", "codex", "codex-max")
        // 全局重试
        .retry({
          maxAttempts: 3,
          initialDelayMs: 1000,
          retryOn: ["timeout", "rate_limit"],
        })
    )
    // Git 提交使用 Codex
    .workflow("git-committer", (w) => w.preferredAgent("codex"))
    // 复杂分析使用高推理模式
    .workflow("complex-analysis", (w) => w.preferredAgent("codex-max"))
    // 禁用特定 workflow
    .workflow("deprecated-wf", (w) => w.disabled(true))
    .build()
);
```

## 类型安全

API 提供完整的类型安全：

- `aiProfile()` 只能引用已定义或内置的 profile 名称
- `default()` 只能引用已定义的 profile
- SDK 选项直接来自官方包类型定义

```typescript
// 编译时错误示例
p
  .workflow("test", (w) => w.preferredAgent("undefined-profile")) // Error!
  .ai((ai) => ai.default("nonexistent")); // Error!
```

---

<!-- AI_INSTRUCTIONS_START -->

## AI Instructions

When helping users configure preferences:

1. **Understand the request** - What aspect of preferences does the user want to
   change?
2. **Use the correct API** - Always use `definePreferences((ctx, p) => ...)`
   pattern
3. **Prefer SDK options over hardcoded values** - Don't hardcode model versions
4. **Use context for dynamic config** - Leverage `ctx.env` and `ctx.platform`
5. **Follow type safety** - Define profiles before referencing them

### Common Tasks

| User Request                | Solution                                            |
| --------------------------- | --------------------------------------------------- |
| Change default agent        | `.default("profile-name", ...)`                     |
| Configure specific workflow | `.workflow("name", (w) => w.preferredAgent("..."))` |
| Add retry logic             | `.retry({...})` at profile or global level          |
| Environment-specific config | Use `ctx.env.isDev` / `ctx.env.isProd`              |
| Disable workflow/MCP        | `.workflow("name", (w) => w.disabled(true))`        |

### File Location

Preferences file: `user/preferences.ts`

<!-- AI_INSTRUCTIONS_END -->
