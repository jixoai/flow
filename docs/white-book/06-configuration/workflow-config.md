# Workflow 配置定制

每个 Workflow 支持通过 `preferences.ts` 进行配置定制，无需完全覆盖内置实现。

## 配置 Schema

每个内置 Workflow 在其目录下定义配置 Schema：

```
workflows/
├── coder/
│   ├── config.schema.ts    # Coder 配置定义
│   └── prompts/
├── research/
│   ├── config.schema.ts    # Research 配置定义
│   └── prompts/
└── git-committer/
    └── config.schema.ts    # Git Committer 配置定义
```

## 配置结构

### 通用配置项

所有 Workflow 共享的配置项：

```typescript
// 基础配置
interface BaseWorkflowConfig {
  // 工具配置
  tools?: {
    allow?: string[]; // 追加允许的工具
    disallow?: string[]; // 追加禁用的工具
  };

  // 权限模式
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";

  // 提示词配置
  prompts?: {
    customInstructions?: string; // 填充 {{CUSTOM_INSTRUCTIONS}}
  };
}
```

### 工具配置语法

工具配置使用**追加模式**，支持 `!` 前缀删除：

```typescript
// 内置配置
const baseAllow = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];
const baseDisallow = ["WebSearch", "WebFetch"];

// 用户配置
tools: {
  allow: ["CustomTool", "!Bash"],    // +CustomTool, -Bash
  disallow: ["!WebSearch", "Task"],  // -WebSearch, +Task
}

// 合并结果
finalAllow = ["Read", "Write", "Edit", "Glob", "Grep", "CustomTool"]
finalDisallow = ["WebFetch", "Task"]
```

### 语法说明

| 语法          | 说明         | 示例           |
| ------------- | ------------ | -------------- |
| `"ToolName"`  | 追加工具     | `"CustomTool"` |
| `"!ToolName"` | 从列表中移除 | `"!WebSearch"` |

## 使用示例

### preferences.ts 配置

```typescript
// user/preferences.ts
import { definePreferences } from "../common/preferences.builder.ts";

export default definePreferences((ctx, p) =>
  p
    .workflow("coder", (w) =>
      w
        .preferredAgent("claude-code")
        .config({
          tools: {
            allow: ["Task"], // 允许 Task 工具
            disallow: ["!Bash"], // 允许 Bash（从禁用列表移除）
          },
          permissionMode: "acceptEdits",
          prompts: {
            customInstructions: "使用 TypeScript strict mode",
          },
        }))
    .workflow("git-committer", (w) =>
      w
        .preferredAgent("codex")
        .config({
          push: {
            autoConfirm: false, // git-committer 特有配置
          },
        }))
    .workflow("research", (w) =>
      w
        .config({
          output: {
            format: "markdown", // research 特有配置
            saveHtml: true,
          },
        }))
    .build()
);
```

## Workflow 特有配置

### coder

```typescript
// workflows/coder/config.schema.ts
export const CoderConfigSchema = z.object({
  // 通用配置
  tools: ToolsConfigSchema.optional(),
  permissionMode: PermissionModeSchema.optional(),
  prompts: PromptsConfigSchema.optional(),

  // Coder 特有
  openspec: z.object({
    enabled: z.boolean().default(true).describe("启用 OpenSpec 工作流"),
    autoArchive: z.boolean().default(false).describe("完成后自动归档"),
  }).optional(),
});
```

### research

```typescript
// workflows/research/config.schema.ts
export const ResearchConfigSchema = z.object({
  // 通用配置
  tools: ToolsConfigSchema.optional(),
  permissionMode: PermissionModeSchema.optional(),
  prompts: PromptsConfigSchema.optional(),

  // Research 特有
  output: z.object({
    format: z.enum(["markdown", "html", "json"]).default("markdown"),
    saveHtml: z.boolean().default(true).describe("保存原始 HTML"),
    maxSources: z.number().default(10).describe("最大来源数"),
  }).optional(),

  search: z.object({
    engine: z.enum(["duckduckgo", "google", "bing"]).default("duckduckgo"),
    maxResults: z.number().default(20),
  }).optional(),
});
```

### git-committer

```typescript
// workflows/git-committer/config.schema.ts
export const GitCommitterConfigSchema = z.object({
  // 通用配置
  tools: ToolsConfigSchema.optional(),
  permissionMode: PermissionModeSchema.optional(),
  prompts: PromptsConfigSchema.optional(),

  // Git Committer 特有
  commit: z.object({
    style: z.enum(["conventional", "semantic", "custom"]).default(
      "conventional",
    ),
    maxTitleLength: z.number().default(50),
    requireBody: z.boolean().default(false),
  }).optional(),

  push: z.object({
    autoConfirm: z.boolean().default(false).describe("自动确认 push"),
    remote: z.string().default("origin"),
  }).optional(),
});
```

## 运行时访问

Workflow 内部访问配置：

```typescript
import { getWorkflowConfig } from "../common/async-context.ts";

export const workflow = defineWorkflow({
  name: "coder",
  handler: async (args, ctx) => {
    // 获取当前 workflow 的配置
    const config = getWorkflowConfig("coder");

    // 使用配置
    if (config?.openspec?.enabled) {
      // OpenSpec 逻辑
    }

    // 合并工具配置
    const finalTools = mergeTools(baseAllow, config?.tools?.allow ?? []);
  },
});
```

## 配置发现

`preferences.workflow` 可以读取 Schema 元数据：

```bash
# 列出所有可配置项
jixoflow meta preferences schema coder

# 交互式配置
jixoflow meta preferences edit -p "为 coder 启用 autoArchive"
```

## 最佳实践

1. **使用追加而非覆盖** - 通过 `!` 语法调整，保留内置工具
2. **查阅 Schema** - 使用 `meta preferences schema` 了解可配置项
3. **类型安全** - 使用 `definePreferences` 获得类型提示
4. **测试配置** - 修改后运行 workflow 验证效果
