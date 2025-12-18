# Workflow 开发指南

## 核心概念

Workflow 是可组合、可嵌套的任务单元，支持三种驱动模式：

| 模式         | 描述                                | 特点                     |
| ------------ | ----------------------------------- | ------------------------ |
| **AI 驱动**  | AI 通过 systemPrompt + MCP 自主执行 | 适合复杂决策、创造性任务 |
| **编程驱动** | 程序逻辑直接执行                    | 适合确定性任务、批处理   |
| **多模式**   | 同时支持 AI 和编程两种入口          | 灵活，可根据场景切换     |

通过 subflows 嵌套，可以实现：

- **混合调度**：AI 驱动 + 编程驱动的组合
- **智能调度**：AI 决策调用哪个 subflow
- **流水线**：编程编排多个 AI workflow

## 文件结构

```
workflows/
├── shared/
│   └── base-workflow.ts      # defineWorkflow API
├── <name>.workflow.ts        # 独立 workflow
└── <group>/                  # 分组 workflow
    ├── <group>.workflow.ts   # 主入口
    └── subflows/
        └── <sub>.workflow.ts
```

## API 参考

### defineWorkflow

```typescript
import { defineWorkflow } from "./shared/base-workflow.ts";

export const workflow = defineWorkflow({
  // 元信息
  name: "my-workflow",
  description: "描述（用于 --help 和 meta list）",
  version: "1.0.0",

  // 参数定义
  args: {
    prompt: { type: "string", alias: "p", description: "输入", required: true },
    verbose: { type: "boolean", alias: "v", default: false },
    count: { type: "number", alias: "c", default: 10 },
  },

  // 子流程（使用 workflow.meta.name 作为标识）
  subflows: [
    subWorkflow1,
    subWorkflow2,
    () => import("./lazy.workflow.ts").then((m) => m.workflow), // 懒加载
  ],

  // 示例
  examples: [
    ["my-workflow --prompt 'hello'", "基本用法"],
  ],

  // 处理函数
  handler: async (args, ctx) => {
    // args: 解析后的参数
    // ctx.meta: workflow 元信息
    // ctx.path: 调用路径 ["parent", "child"]
    // ctx.getSubflow(name): 获取子流程
    // ctx.subflowNames(): 列出子流程名称
  },

  autoStart: import.meta.main,
});
```

### WorkflowContext

```typescript
interface WorkflowContext {
  meta: WorkflowMeta;
  path: string[];
  rawArgs: string[];
  getSubflow: (name: string) => Promise<Workflow | undefined>;
  subflowNames: () => Promise<string[]>;
}
```

## 驱动模式实现

### 1. AI 驱动 Workflow

AI 通过 systemPrompt 和 MCP 工具自主完成任务。

```typescript
import { defineWorkflow } from "./shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { getMcpServerConfig } from "../common/paths.ts";

const SYSTEM_PROMPT = `You are an expert at...

## WORKFLOW
1. First, analyze...
2. Then, execute...

## RULES
- Be concise
- Follow conventions`;

export const workflow = defineWorkflow({
  name: "ai-task",
  description: "AI-driven task execution",
  args: {
    prompt: { type: "string", alias: "p", required: true },
    resume: { type: "string", alias: "r", description: "Resume session" },
  },
  handler: async (args) => {
    // 支持会话恢复
    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: args.prompt,
      });
      console.log(result.output);
      return;
    }

    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .systemPrompt(SYSTEM_PROMPT)
      .mcpServers({
        memory: getMcpServerConfig("memory"),
        // 添加需要的 MCP
      })
      .allowTools(["Read", "Write", "Glob", "Grep", "Bash"])
      .permissionMode("acceptEdits")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    if (!result.success) Deno.exit(1);
  },
  autoStart: import.meta.main,
});
```

### 2. 编程驱动 Workflow

纯程序逻辑，通过 subflows 组织。

```typescript
import { defineWorkflow } from "./shared/base-workflow.ts";

// Subflow: list
const listWorkflow = defineWorkflow({
  name: "list",
  description: "List all items",
  args: {
    json: { type: "boolean", default: false },
  },
  handler: async (args) => {
    const items = await fetchItems();
    if (args.json) {
      console.log(JSON.stringify(items, null, 2));
    } else {
      items.forEach((i) => console.log(`- ${i.name}`));
    }
  },
});

// Subflow: run
const runWorkflow = defineWorkflow({
  name: "run",
  description: "Run a task",
  args: {
    name: { type: "string", alias: "n", required: true },
  },
  handler: async (args) => {
    await executeTask(args.name);
  },
});

// Main workflow - 路由到 subflows
export const workflow = defineWorkflow({
  name: "task-manager",
  description: "Manage tasks programmatically",
  subflows: [listWorkflow, runWorkflow],
  // 无 handler - 自动路由到 subflows
  autoStart: import.meta.main,
});
```

### 3. 多模式 Workflow

同时支持编程调用和 AI 调用。

```typescript
import { defineWorkflow } from "./shared/base-workflow.ts";
import { createAiQueryBuilder } from "../mcps/ai.mcp.ts";

// 编程 API
export async function recordItem(content: string): Promise<void> {
  // 直接执行逻辑
  await saveToDatabase(content);
}

export async function searchItems(query: string): Promise<Item[]> {
  return await queryDatabase(query);
}

// Workflow 定义
export const workflow = defineWorkflow({
  name: "items",
  description: "Item management - programmatic or AI-assisted",
  args: {
    // 编程模式参数
    content: { type: "string", alias: "c", description: "Content to record" },
    query: { type: "string", alias: "q", description: "Search query" },
    // AI 模式参数
    prompt: { type: "string", alias: "p", description: "AI prompt" },
  },
  handler: async (args) => {
    const command = args._[0];

    // 编程模式：直接命令
    if (command === "record" && args.content) {
      await recordItem(args.content);
      console.log("Recorded.");
      return;
    }

    if (command === "search" && args.query) {
      const results = await searchItems(args.query);
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // AI 模式：通过 prompt
    if (args.prompt) {
      const result = await createAiQueryBuilder()
        .prompt(args.prompt)
        .systemPrompt("You manage items...")
        .execute();
      console.log(result.output);
      return;
    }

    console.error("Use --help for usage");
    Deno.exit(1);
  },
  autoStart: import.meta.main,
});
```

### 4. 编排模式 - Handler 中调用 Subflows

```typescript
export const workflow = defineWorkflow({
  name: "pipeline",
  description: "Orchestrate multiple workflows",
  subflows: [stepA, stepB, stepC],
  handler: async (args, ctx) => {
    // 获取 subflows
    const a = await ctx.getSubflow("step-a");
    const b = await ctx.getSubflow("step-b");
    const c = await ctx.getSubflow("step-c");

    // 顺序执行
    console.log("Step A...");
    await a?.execute({ input: args.data });

    console.log("Step B...");
    await b?.execute({ input: args.data });

    // 条件执行
    if (args.full) {
      console.log("Step C...");
      await c?.execute({});
    }
  },
});
```

### 5. 智能调度 - AI 决策调用 Subflows

```typescript
// 主 workflow 使用 AI 决策
export const workflow = defineWorkflow({
  name: "smart-router",
  description: "AI decides which workflow to run",
  subflows: [analysisWorkflow, reportWorkflow, fixWorkflow],
  handler: async (args, ctx) => {
    // 先用 AI 分析应该做什么
    const decision = await createAiQueryBuilder()
      .prompt(`Analyze this request: ${args.prompt}
      
Available actions:
${(await ctx.subflowNames()).map((n) => `- ${n}`).join("\n")}

Respond with JSON: { "action": "<name>", "reason": "..." }`)
      .execute();

    const { action } = JSON.parse(decision.output);
    const subflow = await ctx.getSubflow(action);

    if (subflow) {
      await subflow.execute({ prompt: args.prompt });
    }
  },
});
```

## MCP 集成

### 可用的 MCP Servers

```typescript
import { getAvailableMcps, getMcpServerConfig } from "../common/paths.ts";

// 内置 MCP (通过 getMcpServerConfig(name) 获取配置):
// - ai: AI 查询
// - memory: 记忆管理
// - user-proxy: 用户偏好
// - openspec: 规格管理
// - search-duckduckgo: 搜索
// - html2md: HTML 转 Markdown
// - meta: workflow 执行

// 获取所有可用 MCP 名称:
console.log(getAvailableMcps());
```

### AI Query Builder

```typescript
// 获取 MCP 配置（会自动启动 HTTP Gateway）
const mcpServers = await getMcpServerConfigs("memory", "openspec");

const result = await createAiQueryBuilder()
  .prompt("Your task")
  .systemPrompt("System instructions")
  .mcpServers(mcpServers)
  .allowTools(["Read", "Write", "mcp__memory__memory_record"])
  .disallowTools(["WebSearch"])
  .permissionMode("acceptEdits") // default | acceptEdits | bypassPermissions
  .cwd(Deno.cwd())
  .executeWithSession(); // 支持 --resume
```

## 最佳实践

### 命名规范

- Workflow 文件：`<name>.workflow.ts`
- Subflow 文件夹：`subflows/`
- 导出名：`export const workflow = ...`

### 模式选择

| 场景                 | 推荐模式                    |
| -------------------- | --------------------------- |
| 复杂决策、创造性任务 | AI 驱动                     |
| 确定性任务、批处理   | 编程驱动                    |
| 需要两种入口         | 多模式                      |
| 多步骤流水线         | 编排（编程驱动 + subflows） |
| 动态决策流程         | 智能调度（AI + subflows）   |

### 错误处理

```typescript
handler: (async (args) => {
  try {
    await doWork();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    Deno.exit(1);
  }
});
```

### 会话恢复

AI 驱动的 workflow 应支持 `--resume`:

```typescript
args: {
  resume: { type: "string", alias: "r", description: "Session ID to resume" },
},
handler: async (args) => {
  if (args.resume) {
    const result = await aiResume({ sessionId: args.resume, prompt: args.prompt });
    // ...
  }
}
```

## 示例 Workflows

### AI 驱动

- `research.workflow.ts` - 研究调查
- `coder.workflow.ts` - 编程任务
- `git-committer.workflow.ts` - Git 提交

### 编程驱动

- `meta/meta.workflow.ts` - Workflow 管理
- `meta/subflows/list.workflow.ts` - 列表
- `meta/subflows/archive.workflow.ts` - 归档

### 多模式

- `memory.workflow.ts` - 记忆管理
- `user-proxy.workflow.ts` - 用户偏好
