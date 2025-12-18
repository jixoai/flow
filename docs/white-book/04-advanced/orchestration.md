# Workflow 编排

通过 meta.mcp，一个 Workflow 可以调度其他 Workflow。

## 两种方式

### 方式一：使用默认 meta.mcp（全部 Workflow）

```typescript
const result = await createAiQueryBuilder()
  .prompt(args.task)
  .mcpServers({
    meta: await getMcpServerConfig("meta"), // 包含所有 workflow
  })
  .allowTools(["mcp__meta__workflow"])
  .executeWithSession();
```

### 方式二：使用 createMetaMcp（选择子集）

```typescript
import { createMetaMcp } from "../meta/meta.mcp.ts";

// 只包含需要的 workflow
const metaMcp = createMetaMcp({
  workflows: ["coder", "research"],
});

const result = await createAiQueryBuilder()
  .prompt(args.task)
  .mcpServers({ meta: metaMcp })
  .allowTools(["mcp__meta__workflow"])
  .executeWithSession();
```

## 完整示例

```typescript
// orchestrator.workflow.ts
import { defineWorkflow } from "./shared/base-workflow.ts";
import { createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { createMetaMcp } from "../meta/meta.mcp.ts";

export const workflow = defineWorkflow({
  name: "orchestrator",
  description: "编排多个 Workflow 完成复杂任务",
  args: {
    task: { type: "string", alias: "t", required: true },
  },
  handler: async (args) => {
    // 选择需要的 workflow
    const metaMcp = createMetaMcp({
      workflows: ["coder", "research", "memory"],
    });

    const result = await createAiQueryBuilder()
      .prompt(`完成以下任务：

${args.task}

你可以使用 workflow 工具调用：
- coder: 编程任务
- research: 研究调查
- memory: 记忆管理`)
      .systemPrompt(`你是一个任务编排者。分析任务，调用合适的 workflow 完成。`)
      .mcpServers({ meta: metaMcp })
      .allowTools(["mcp__meta__workflow", "mcp__meta__list_workflows"])
      .executeWithSession();

    console.log(result.output);
  },
  autoStart: import.meta.main,
});
```

## 使用示例

```bash
deno run -A orchestrator.workflow.ts \
  --task "先研究 Rust 错误处理，然后实现一个示例"

# AI 会：
# 1. 调用 workflow({ name: "research", args: { prompt: "Rust 错误处理" } })
# 2. 调用 workflow({ name: "coder", args: { prompt: "实现示例" } })
```

## 何时使用 createMetaMcp

| 场景                          | 推荐方式                  |
| ----------------------------- | ------------------------- |
| 外部 AI 需要访问所有 Workflow | 默认 meta.mcp             |
| 内部编排，需要限制可用范围    | createMetaMcp             |
| 避免循环调用                  | createMetaMcp（排除自己） |
| 最小权限原则                  | createMetaMcp             |

## 与 Subflows 的区别

| 方式         | 组装时机 | 调用方式      | 适用场景         |
| ------------ | -------- | ------------- | ---------------- |
| **Subflows** | 定义时   | 同进程 import | 同一领域的子任务 |
| **meta.mcp** | 运行时   | AI 决策 + MCP | 跨领域动态组合   |

### Subflows（紧耦合）

```typescript
// coder.workflow.ts - 同一领域
subflows: [runWorkflow, proposalWorkflow, applyWorkflow];
```

### meta.mcp（松耦合）

```typescript
// orchestrator.workflow.ts - 跨领域
const metaMcp = createMetaMcp({
  workflows: ["coder", "research", "memory"],
});
```
