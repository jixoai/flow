# Workflow

Workflow 是任务编排的基本单元，具有**双重身份**。

## 双重身份

| 身份           | 说明                 | 使用方式                                     |
| -------------- | -------------------- | -------------------------------------------- |
| **CLI 工具**   | 命令行直接执行       | `deno run -A workflow.ts --args`             |
| **可组合模块** | 被其他 Workflow 引用 | `import { workflow } from "./x.workflow.ts"` |

```
┌─────────────────────────────────────────────────────────────┐
│                      Workflow                                │
│                                                              │
│   身份一：CLI 工具                                           │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  deno run -A coder.workflow.ts --prompt "..."       │   │
│   │  deno run -A coder.workflow.ts run --prompt "..."   │   │
│   │  deno run -A coder.workflow.ts --help               │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   身份二：可组合模块                                         │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  // 被其他 workflow 作为 subflow 引用               │   │
│   │  subflows: [coderWorkflow, researchWorkflow]        │   │
│   │                                                      │   │
│   │  // 被 meta.mcp 聚合，外部 AI 可调用                │   │
│   │  workflow({ name: "coder", args: { prompt: "..." }})│   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 定义 Workflow

```typescript
import { defineWorkflow } from "./shared/base-workflow.ts";

export const workflow = defineWorkflow({
  name: "my-workflow",
  description: "Workflow description",
  version: "1.0.0",

  // 参数定义
  args: {
    prompt: { type: "string", alias: "p", required: true },
    verbose: { type: "boolean", alias: "v", default: false },
    count: { type: "number", alias: "c", default: 10 },
  },

  // 子流程
  subflows: [
    listWorkflow,
    () => import("./add.workflow.ts").then((m) => m.workflow),
  ],

  // 执行逻辑
  handler: async (args, ctx) => {
    console.log(`Running: ${ctx.meta.name}`);
    console.log(`Args: ${JSON.stringify(args)}`);
  },

  // CLI 自动启动
  autoStart: import.meta.main,
});
```

## 本章内容

| 章节                        | 内容                       |
| --------------------------- | -------------------------- |
| [驱动模式](./driving-modes) | AI 驱动、编程驱动、多模式  |
| [Subflows](./subflows)      | 子流程嵌套和组合           |
| [内置 Workflow](./builtin/) | coder、research、memory 等 |
