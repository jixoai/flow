# MCP

MCP（Model Context Protocol）是能力封装的基本单元，具有**双重身份**。

## 双重身份

| 身份             | 说明                 | 使用方式                        |
| ---------------- | -------------------- | ------------------------------- |
| **MCP Server**   | AI 通过协议调用      | HTTP Gateway / stdio            |
| **工具函数模块** | 程序直接 import 调用 | `import { fn } from "x.mcp.ts"` |

```
┌─────────────────────────────────────────────────────────────┐
│                         MCP 文件                             │
│                                                              │
│   身份一：MCP Server                                         │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  AI Agent                                            │   │
│   │     ↓                                                │   │
│   │  MCP 协议 (JSON-RPC)                                │   │
│   │     ↓                                                │   │
│   │  HTTP Gateway → memory.mcp.ts → tool.handler()      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   身份二：工具函数模块                                       │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  import { searchMemories } from "memory.mcp.ts"     │   │
│   │     ↓                                                │   │
│   │  await searchMemories(query)                        │   │
│   │     ↓                                                │   │
│   │  tool.call() → tool.handler()                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 为什么双重身份？

### 传统方式

```
AI Agent → MCP 协议 → MCP Server → 执行
程序代码 → MCP 协议 → MCP Server → 执行  ❌ 多余开销
```

### 双重身份

```
AI Agent → MCP 协议 → MCP Server → 执行
程序代码 → 直接 import → 函数调用 → 执行  ✅ 零开销
```

**优势**：

- 消除重复代码
- 保持一致性（同一个 handler）
- 性能优化（编程调用无协议开销）
- 灵活组合

## 定义 MCP

```typescript
// memory.mcp.ts
import { createMcpServer, defineTool, z } from "./shared/base-mcp.ts";

// 1. 定义工具
export const searchTool = defineTool({
  name: "memory_search",
  description: "Search memories",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      path: z.string(),
      content: z.string(),
      score: z.number(),
    })),
  }),
  handler: async (input) => {
    const results = await doSearch(input.query, input.limit);
    return { results };
  },
});

// 2. 导出便捷函数（编程接口）
export async function searchMemories(query: string, limit = 10) {
  const result = await searchTool.call({ query, limit });
  return result.results;
}

// 3. 创建 MCP Server（协议接口）
export const server = createMcpServer({
  name: "memory",
  tools: [searchTool],
  autoStart: import.meta.main,
});
```

## 本章内容

| 章节                   | 内容                          |
| ---------------------- | ----------------------------- |
| [Gateway](./gateway)   | HTTP Gateway 统一管理         |
| [内置 MCP](./builtin/) | memory、openspec、ai、meta 等 |
