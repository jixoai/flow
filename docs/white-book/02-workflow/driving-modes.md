# 驱动模式

Workflow 支持三种驱动模式，本质区别在于**如何调用 MCP 工具**。

## 模式对比

| 模式         | 工具调用方式         | 适用场景             |
| ------------ | -------------------- | -------------------- |
| **AI 驱动**  | AI 通过 MCP 协议调用 | 复杂决策、创造性任务 |
| **编程驱动** | 程序直接 import 调用 | 确定性任务、批处理   |
| **多模式**   | 同时支持两种         | 需要灵活入口         |

```
┌─────────────────────────────────────────────────────────────┐
│                       AI 驱动                                │
│                                                              │
│   handler                                                    │
│      ↓                                                       │
│   createAiQueryBuilder()                                     │
│      ↓                                                       │
│   .mcpServers({ memory: config })                           │
│      ↓                                                       │
│   AI Agent 自主决策                                          │
│      ↓                                                       │
│   MCP 协议调用工具                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      编程驱动                                │
│                                                              │
│   handler                                                    │
│      ↓                                                       │
│   import { searchMemories } from "memory.mcp.ts"            │
│      ↓                                                       │
│   await searchMemories(query)                               │
│      ↓                                                       │
│   直接执行，无协议开销                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## AI 驱动模式

AI 自主决定调用哪些工具、何时调用、如何组合。

```typescript
export const workflow = defineWorkflow({
  name: "research",
  args: {
    prompt: { type: "string", required: true },
  },
  handler: async (args) => {
    const mcpServers = await getMcpServerConfigs(
      "search-duckduckgo",
      "html2md",
    );

    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .systemPrompt(`You are a research assistant.
Search for information and synthesize findings.`)
      .mcpServers(mcpServers)
      .allowTools([
        "Read",
        "Glob",
        "mcp__search-duckduckgo__search",
        "mcp__html2md__convert",
      ])
      .executeWithSession();

    console.log(result.output);
  },
});
```

**特点**：

- ✅ 处理模糊需求
- ✅ 自主决策
- ✅ 创造性解决方案
- ❌ 结果不确定
- ❌ 成本较高

## 编程驱动模式

程序逻辑确定调用顺序，结果可预测。

```typescript
import { listMemories, searchMemories } from "../mcps/memory.mcp.ts";

export const workflow = defineWorkflow({
  name: "memory-list",
  args: {
    query: { type: "string", alias: "q" },
    limit: { type: "number", default: 10 },
  },
  handler: async (args) => {
    let memories;

    if (args.query) {
      // 搜索模式
      memories = await searchMemories(args.query);
      memories = memories.slice(0, args.limit);
    } else {
      // 列表模式
      memories = await listMemories();
    }

    for (const m of memories) {
      console.log(`- ${m.path}`);
    }
  },
});
```

**特点**：

- ✅ 结果确定
- ✅ 零 AI 成本
- ✅ 易于测试
- ❌ 只能处理预定义场景
- ❌ 缺乏灵活性

## 多模式

同一 Workflow 支持两种入口。

```typescript
// 编程驱动的子流程
const listSubflow = defineWorkflow({
  name: "list",
  handler: async () => {
    const memories = await listMemories();
    memories.forEach((m) => console.log(`- ${m.path}`));
  },
});

// AI 驱动的子流程
const aiSubflow = defineWorkflow({
  name: "ai",
  args: { prompt: { type: "string", required: true } },
  handler: async (args) => {
    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .mcpServers({ memory: await getMcpServerConfig("memory") })
      .executeWithSession();
    console.log(result.output);
  },
});

// 主 workflow 组合两种模式
export const workflow = defineWorkflow({
  name: "memory",
  subflows: [listSubflow, aiSubflow],
  handler: async () => {
    console.log("Usage: memory list | memory ai -p <prompt>");
  },
});
```

使用：

```bash
# 编程驱动
deno run -A memory.workflow.ts list

# AI 驱动
deno run -A memory.workflow.ts ai -p "整理我的记忆"
```

## 选择指南

| 任务特征             | 推荐模式 |
| -------------------- | -------- |
| 需要推理判断         | AI 驱动  |
| 结果需确定性         | 编程驱动 |
| 处理模糊需求         | AI 驱动  |
| 批量操作             | 编程驱动 |
| 需要创造性           | AI 驱动  |
| 流程已明确           | 编程驱动 |
| 用户可能两种方式使用 | 多模式   |
