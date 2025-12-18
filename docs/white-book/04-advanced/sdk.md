# SDK 集成

与 Claude Agent SDK 的集成方式。

## MCP 配置格式

Claude SDK 支持多种 MCP 配置：

```typescript
type McpServerConfig =
  | { type?: "stdio"; command: string; args?: string[] } // 子进程
  | { type: "http"; url: string } // HTTP ✅
  | { type: "sse"; url: string }; // SSE
```

Framework 默认使用 HTTP 模式（通过 Gateway）：

```typescript
const config = await getMcpServerConfig("memory");
// => { type: "http", url: "http://127.0.0.1:PORT/mcp/memory" }
```

## 配置外部 Claude CLI

让外部 Claude CLI 使用 Framework 的 Workflow：

### 配置 settings.json

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "workflow": {
      "command": "deno",
      "args": ["run", "-A", "~/.workflow/meta/meta.mcp.ts"]
    }
  }
}
```

### 在 Claude CLI 中使用

```
> 帮我实现一个排序算法

Claude: 我来调用 coder workflow 帮你实现。

[调用 workflow 工具]
name: "coder"
args: { prompt: "实现快速排序算法" }

[执行结果]
已创建 quicksort.ts...
```

## 双向集成

### 外部 AI → Workflow（通过 meta.mcp）

```
外部 Claude CLI
    ↓ MCP 协议
meta.mcp.ts
    ↓ workflow() 工具
执行 coder.workflow.ts
    ↓
返回结果
```

### Workflow → AI（通过 createAiQueryBuilder）

```
coder.workflow.ts
    ↓
createAiQueryBuilder()
    ↓
.mcpServers({ memory: config })
    ↓
Claude Agent SDK
    ↓
执行 AI 查询
```

## 工具权限控制

```typescript
const result = await createAiQueryBuilder()
  .prompt(args.prompt)
  // 允许的工具
  .allowTools([
    "Read",
    "Write",
    "Edit", // 内置工具
    "mcp__memory__*", // 通配符
    "mcp__openspec__show", // 特定工具
  ])
  // 禁止的工具
  .disallowTools(["WebSearch", "Bash"])
  // 权限模式
  .permissionMode("acceptEdits")
  .executeWithSession();
```
