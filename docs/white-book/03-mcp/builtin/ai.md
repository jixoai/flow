# AI MCP

统一的 AI 查询接口。

## 主要导出

### createAiQueryBuilder

链式 API 构建 AI 查询。

```typescript
import { createAiQueryBuilder } from "../mcps/ai.mcp.ts";

const result = await createAiQueryBuilder()
  .prompt("实现排序算法")
  .systemPrompt("You are a coding assistant")
  .model("claude-sonnet")
  .mcpServers(await getMcpServerConfigs("memory"))
  .allowTools(["Read", "Write", "mcp__memory__*"])
  .permissionMode("acceptEdits")
  .executeWithSession();
```

### aiResume

恢复已有会话。

```typescript
import { aiResume } from "../mcps/ai.mcp.ts";

const result = await aiResume({
  sessionId: "claude-abc123",
  prompt: "继续完成任务",
});
```

## Builder 方法

| 方法                    | 说明               |
| ----------------------- | ------------------ |
| `.prompt(p)`            | 用户 prompt (必填) |
| `.systemPrompt(sp)`     | System prompt      |
| `.model(m)`             | 模型选择           |
| `.mcpServers(s)`        | MCP 配置           |
| `.allowTools(t)`        | 允许的工具         |
| `.disallowTools(t)`     | 禁止的工具         |
| `.permissionMode(m)`    | 权限模式           |
| `.cwd(d)`               | 工作目录           |
| `.executeWithSession()` | 执行并保存会话     |

## 权限模式

| 模式                | 说明             |
| ------------------- | ---------------- |
| `default`           | 危险操作需确认   |
| `acceptEdits`       | 自动接受文件编辑 |
| `bypassPermissions` | 跳过所有检查     |

## 工具名称格式

```
内置工具: Read, Write, Edit, Glob, Grep, Bash
MCP 工具: mcp__<server>__<tool>
通配符:   mcp__memory__*
```
