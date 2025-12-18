# 会话管理

支持长任务的中断恢复和历史追溯。

## 核心功能

- **自动保存**：`executeWithSession()` 自动保存
- **恢复执行**：通过 Session ID 恢复
- **历史追溯**：查看执行历史

## 使用方式

### 执行并保存会话

```typescript
const result = await createAiQueryBuilder()
  .prompt("实现功能 X")
  .executeWithSession(); // 自动保存

console.log(`Session: ${result.sessionId}`);
// => Session: claude-abc123
```

### 恢复会话

```typescript
import { aiResume } from "../mcps/ai.mcp.ts";

const result = await aiResume({
  sessionId: "claude-abc123",
  prompt: "继续完成，修复测试",
});
```

### 命令行

```bash
# 首次执行
deno run -A coder.workflow.ts -p "实现功能 X"
# => Session: claude-abc123

# 恢复
deno run -A coder.workflow.ts --resume claude-abc123 -p "修复测试"
```

## 在 Workflow 中实现

```typescript
export const workflow = defineWorkflow({
  name: "my-workflow",
  args: {
    prompt: { type: "string", required: true },
    resume: { type: "string", alias: "r" },
  },
  handler: async (args) => {
    if (args.resume) {
      // 恢复模式
      const result = await aiResume({
        sessionId: args.resume,
        prompt: args.prompt,
      });
      console.log(result.output);
      return;
    }

    // 正常执行
    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .executeWithSession();

    console.log(result.output);
    console.error(`Session: ${result.sessionId}`);
  },
});
```

## 会话结构

```typescript
interface SessionFile {
  metadata: {
    sessionId: string;
    title: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    turnCount: number;
    totalCostUsd: number;
    status: "active" | "completed" | "failed";
  };
  history: Array<{
    timestamp: string;
    prompt: string;
    response: string;
  }>;
}
```

## 存储位置

```
<cwd>/.claude/.sessions/
├── ai-claude/
│   ├── 2024-01-15_implement-feature_abc123.json
│   └── 2024-01-16_fix-bug_def456.json
└── ai-codex/
    └── ...
```
