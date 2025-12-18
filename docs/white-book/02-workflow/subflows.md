# Subflows

Subflows 将复杂 Workflow 拆分为可复用的子单元。

## 结构示例

```
coder.workflow.ts (主 Workflow)
├── run        (执行编程任务)
├── proposal   (创建变更提案)
├── apply      (应用变更)
└── archive    (归档完成项)
```

## 定义方式

### 内联定义

```typescript
const listSubflow = defineWorkflow({
  name: "list",
  handler: async () => {/* ... */},
});

const addSubflow = defineWorkflow({
  name: "add",
  args: { name: { type: "string", required: true } },
  handler: async (args) => {/* ... */},
});

export const workflow = defineWorkflow({
  name: "task",
  subflows: [listSubflow, addSubflow],
  handler: async () => {
    console.log("Use: task list | task add --name <name>");
  },
});
```

### 懒加载（解决循环依赖）

```typescript
export const workflow = defineWorkflow({
  name: "task",
  subflows: [
    listSubflow, // 直接引用
    () => import("./add.workflow.ts").then((m) => m.workflow), // 懒加载
  ],
});
```

### 分文件组织

```
workflows/
├── coder.workflow.ts          # 主入口
└── coder/
    ├── prompts/
    │   └── system.md
    └── subflows/
        ├── run.workflow.ts
        ├── proposal.workflow.ts
        └── apply.workflow.ts
```

```typescript
// coder.workflow.ts
export const workflow = defineWorkflow({
  name: "coder",
  subflows: [
    () => import("./coder/subflows/run.workflow.ts").then((m) => m.workflow),
    () =>
      import("./coder/subflows/proposal.workflow.ts").then((m) => m.workflow),
    () => import("./coder/subflows/apply.workflow.ts").then((m) => m.workflow),
  ],
});
```

## 调用方式

### 命令行

```bash
# 主 workflow
deno run -A task.workflow.ts

# 子流程
deno run -A task.workflow.ts list
deno run -A task.workflow.ts add --name "New Task"

# 帮助
deno run -A task.workflow.ts --help
```

### 编程调用

```typescript
handler: (async (args, ctx) => {
  // 获取子流程
  const listSubflow = await ctx.getSubflow("list");

  if (listSubflow) {
    await listSubflow.execute({});
  }

  // 获取所有子流程名称
  const names = await ctx.subflowNames();
  console.log("Available:", names.join(", "));
});
```

## WorkflowContext

```typescript
interface WorkflowContext {
  meta: {
    name: string;
    description?: string;
    version: string;
  };
  path: string[]; // 调用路径，如 ["coder", "run"]
  rawArgs: string[];
  getSubflow: (name: string) => Promise<Workflow | undefined>;
  subflowNames: () => Promise<string[]>;
}
```

## 混合驱动模式

不同 Subflow 可以使用不同的驱动模式：

```typescript
// 编程驱动
const listSubflow = defineWorkflow({
  name: "list",
  handler: async () => {
    const items = await listItems(); // 直接调用
    items.forEach((i) => console.log(`- ${i.name}`));
  },
});

// AI 驱动
const analyzeSubflow = defineWorkflow({
  name: "analyze",
  args: { prompt: { type: "string", required: true } },
  handler: async (args) => {
    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .executeWithSession();
    console.log(result.output);
  },
});

export const workflow = defineWorkflow({
  name: "items",
  subflows: [listSubflow, analyzeSubflow],
});
```
