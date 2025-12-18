# MCP Scripts

MCP (Model Context Protocol) 服务脚本。所有 MCP 都基于 `shared/base-mcp.ts`
构建。

## AI Agent MCPs

### ai.mcp.ts (推荐)

**统一 AI 接口**，支持 Claude 和 Codex 后端切换（启动时选择，运行时不可变）。

```bash
deno run -A ai.mcp.ts                    # 默认 Claude
deno run -A ai.mcp.ts --backend=codex    # 使用 Codex
```

| Tool                    | Description    |
| ----------------------- | -------------- |
| `ai_query`              | 执行查询       |
| `ai_query_with_session` | 执行并保存会话 |
| `ai_resume`             | 恢复会话       |
| `ai_list_sessions`      | 列出会话       |
| `ai_get_session`        | 获取会话详情   |
| `ai_clear_sessions`     | 清理会话       |
| `ai_backend_info`       | 获取后端信息   |

**编程 API:**

```typescript
import {
  aiQuery,
  aiQueryWithSession,
  aiResume,
  createAiQueryBuilder,
} from "./ai.mcp.ts";

// 简单查询
const result = await aiQuery("Hello!", { model: "sonnet" });

// 流式构建
const result = await createAiQueryBuilder()
  .prompt("Analyze code")
  .cwd("/my/project")
  .allowTools(["Read", "Grep"])
  .executeWithSession();
```

### ai-claude-code.mcp.ts / ai-codex.mcp.ts

独立的 Claude 和 Codex 封装（保留兼容性）。推荐使用统一的 `ai.mcp.ts`。

## 工具 MCPs

| Name              | File                       | Tools                            | Description |
| ----------------- | -------------------------- | -------------------------------- | ----------- |
| DuckDuckGo Search | `search-duckduckgo.mcp.ts` | `search_duckduckgo`              | 浏览器搜索  |
| HTML to Markdown  | `html2md.mcp.ts`           | `html_to_markdown`, `fetch_html` | HTML 转换   |

**编程调用：**

```typescript
import { searchTool } from "./search-duckduckgo.mcp.ts";
import { fetchHtmlTool, htmlToMarkdownTool } from "./html2md.mcp.ts";

const result = await searchTool.call({ query: "AI trends", maxResults: 5 });
const md = await htmlToMarkdownTool.call({ url: "https://example.com" });
```

## 共享模块 (`shared/`)

| File                 | Description                              |
| -------------------- | ---------------------------------------- |
| `base-mcp.ts`        | MCP 基础框架                             |
| `session-manager.ts` | 会话管理                                 |
| `example.mcp.ts`     | **高级示例** - Tool 扩展、组合、工厂模式 |

### base-mcp.ts 核心功能

```typescript
import { createMcpServer, defineTool, z } from "./shared/base-mcp.ts";

// 1. 类型安全的 Tool 定义 (input + output schema)
export const myTool = defineTool({
  name: "my_tool",
  description: "...",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  handler: async (input) => ({ result: "..." }),
});

// 2. 自动启动 (仅直接运行时)
createMcpServer({
  name: "my-mcp",
  tools: [myTool],
  autoStart: import.meta.main,
});

// 3. 编程调用 (无需启动 MCP 服务)
const result = await myTool.call({ query: "test" });
```

### example.mcp.ts 高级模式

展示以下模式：

1. **Tool 扩展** - 在现有 tool 基础上扩展 input/output schema
2. **Tool 组合** - 将多个 tool 合并为统一接口
3. **Tool 工厂** - 动态创建 tool

```typescript
// 扩展已有 tool
export const extendedGreetTool = defineTool({
  name: "greet_extended",
  inputSchema: greetTool.inputSchema.extend({
    language: z.enum(["en", "zh", "ja"]).optional()
  }),
  outputSchema: greetTool.outputSchema.extend({
    timestamp: z.string()
  }),
  handler: async (input) => { ... }
});

// 组合多个 tool
export const unifiedTool = defineTool({
  name: "unified",
  inputSchema: z.object({
    operation: z.enum(["greet", "calculate", "transform"]),
    // ... operation-specific fields
  }),
  handler: async ({ operation, ...params }) => {
    switch (operation) { ... }
  }
});

// Tool 工厂
export function createLanguageGreetTool(language: string, templates: {...}) {
  return defineTool({ ... });
}
```

## 开发规范

1. **基于 base-mcp.ts** - 所有新 MCP 必须使用 `defineTool` + `createMcpServer`
2. **类型安全** - 必须定义 `inputSchema` 和 `outputSchema`
3. **autoStart** - 使用 `autoStart: import.meta.main` 支持 import
4. **导出 tool** - 所有 tool 必须 export，支持编程调用
5. **命名** - 文件: `<name>.mcp.ts`，tool: `snake_case`

## 运行方式

```bash
# stdio 模式 (默认)
deno run -A --no-config <name>.mcp.ts

# 带参数
deno run -A --no-config ai.mcp.ts --backend=codex
```

## 会话存储

```
.claude/.sessions/
  ai-claude/           # ai.mcp.ts --backend=claude
  ai-codex/            # ai.mcp.ts --backend=codex
  ai-claude-code/      # ai-claude-code.mcp.ts (legacy)
  ai-codex/            # ai-codex.mcp.ts (legacy)
```
