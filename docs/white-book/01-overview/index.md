# 概述

JixoFlow 是一个面向 AI Agent 的可组合工作流框架。

## 两个核心概念

整个框架围绕两个核心概念构建：

| 概念         | 定位       | 特点                    |
| ------------ | ---------- | ----------------------- |
| **Workflow** | 任务编排层 | CLI 工具 + 可组合模块   |
| **MCP**      | 能力封装层 | MCP Server + 可调用函数 |

```
┌─────────────────────────────────────────────────────────────┐
│                        用户                                  │
│                                                              │
│           CLI 命令                    外部 AI                │
│               ↓                          ↓                   │
│           Workflow ←───── meta.mcp ─────→ MCP               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Workflow 层                             │
│                                                              │
│   定义任务流程，选择驱动模式（AI/编程/混合）                 │
│   可组合：Subflows 嵌套 / meta.mcp 聚合 / createMetaMcp 裁剪│
│                                                              │
│   coder · research · memory · git-committer · user-proxy    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        MCP 层                                │
│                                                              │
│   封装原子能力，提供双重接口（协议 + 函数）                  │
│   统一管理：HTTP Gateway 按需加载                            │
│                                                              │
│   memory · openspec · ai · html2md · search · meta          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 三大架构创新

### 1. MCP 双重身份

每个 MCP 文件**同时**是：

- **MCP Server**：AI 通过协议调用
- **工具函数模块**：程序直接 import 调用

```typescript
// memory.mcp.ts

// 作为 MCP Server
export const server = createMcpServer({ tools: [searchTool] });

// 作为可调用函数
export async function searchMemories(query: string) {
  return searchTool.call({ query });
}
```

### 2. Workflow 双重身份

每个 Workflow **同时**是：

- **CLI 工具**：命令行直接执行
- **可组合模块**：被其他 Workflow 引用

```typescript
// coder.workflow.ts

export const workflow = defineWorkflow({
  name: "coder",
  handler: async (args) => { ... },
  autoStart: import.meta.main,  // CLI 运行时启动
});

// 可被其他 workflow import 使用
```

### 3. meta.mcp 的魔法

`meta.mcp.ts` 将 Workflow 聚合为 MCP 工具，实现 **Workflow ↔ MCP 互相转换**：

```
┌─────────────────────────────────────────────────────────────┐
│                      meta.mcp.ts                             │
│                                                              │
│   默认：聚合所有 workflows/ 下的 Workflow                    │
│                                                              │
│   workflow({ name: "coder", args: {...} })    → 执行 coder  │
│   workflow({ name: "research", args: {...} }) → 执行 research│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**同时提供 `createMetaMcp()` 按需裁剪**：

```typescript
// 只包含需要的 workflow
const metaMcp = createMetaMcp({
  workflows: ["coder", "research"],
});
```

## 阅读指南

| 你想了解               | 阅读章节                            |
| ---------------------- | ----------------------------------- |
| 快速体验               | [快速开始](./quick-start)           |
| Workflow 完整指南      | [第二章：Workflow](../02-workflow/) |
| MCP 完整指南           | [第三章：MCP](../03-mcp/)           |
| 高级用法（编排、会话） | [第四章：高级话题](../04-advanced/) |
| API 详细参考           | [第五章：API](../05-api/)           |
