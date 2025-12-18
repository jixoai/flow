# createAiQueryBuilder

链式 API 构建 AI 查询。

## 签名

```typescript
function createAiQueryBuilder(): AiQueryBuilder;
```

## AiQueryBuilder 方法

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
| `.maxTurns(t)`          | 最大对话轮数       |
| `.execute()`            | 执行（不保存会话） |
| `.executeWithSession()` | 执行并保存会话     |

## 返回值

```typescript
interface QueryResult {
  success: boolean;
  output: string;
  sessionId: string;
  model: string;
  numTurns: number;
  totalCostUsd: number;
  error?: string;
}
```

## 示例

```typescript
import { createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { getMcpServerConfigs } from "../common/paths.ts";

const mcpServers = await getMcpServerConfigs("memory", "openspec");

const result = await createAiQueryBuilder()
  .prompt("实现快速排序")
  .systemPrompt("You are a coding assistant")
  .model("claude-sonnet")
  .mcpServers(mcpServers)
  .allowTools(["Read", "Write", "mcp__memory__*"])
  .permissionMode("acceptEdits")
  .cwd(Deno.cwd())
  .executeWithSession();

console.log(result.output);
console.log(`Session: ${result.sessionId}`);
```

## aiResume

```typescript
import { aiResume } from "../mcps/ai.mcp.ts";

const result = await aiResume({
  sessionId: "claude-abc123",
  prompt: "继续完成任务",
});
```
