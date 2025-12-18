# 快速开始

5 分钟体验 JixoFlow 的核心能力。

## 运行内置 Workflow

```bash
# 编程任务
deno run -A workflows/coder.workflow.ts --prompt "实现一个 LRU Cache"

# 研究调查
deno run -A workflows/research.workflow.ts --prompt "Deno 2.0 新特性"

# 记忆管理
deno run -A workflows/memory.workflow.ts list
deno run -A workflows/memory.workflow.ts search -q "typescript"

# Git 提交
deno run -A workflows/git-committer.workflow.ts
```

## 创建第一个 Workflow

```typescript
// workflows/hello.workflow.ts
import { defineWorkflow } from "./shared/base-workflow.ts";

export const workflow = defineWorkflow({
  name: "hello",
  description: "Hello World workflow",
  args: {
    name: { type: "string", alias: "n", default: "World" },
  },
  handler: async (args) => {
    console.log(`Hello, ${args.name}!`);
  },
  autoStart: import.meta.main,
});
```

运行：

```bash
deno run -A workflows/hello.workflow.ts
# => Hello, World!

deno run -A workflows/hello.workflow.ts -n "Deno"
# => Hello, Deno!
```

## 创建 AI 驱动的 Workflow

```typescript
// workflows/assistant.workflow.ts
import { defineWorkflow } from "./shared/base-workflow.ts";
import { createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { getMcpServerConfig } from "../common/paths.ts";

export const workflow = defineWorkflow({
  name: "assistant",
  args: {
    prompt: { type: "string", alias: "p", required: true },
  },
  handler: async (args) => {
    const result = await createAiQueryBuilder()
      .prompt(args.prompt)
      .systemPrompt("You are a helpful assistant.")
      .mcpServers({
        memory: await getMcpServerConfig("memory"),
      })
      .allowTools(["Read", "Glob", "mcp__memory__*"])
      .executeWithSession();

    console.log(result.output);
  },
  autoStart: import.meta.main,
});
```

## 创建第一个 MCP

```typescript
// mcps/greet.mcp.ts
import { createMcpServer, defineTool, z } from "./shared/base-mcp.ts";

// 定义工具
export const greetTool = defineTool({
  name: "greet",
  description: "Greet someone",
  inputSchema: z.object({
    name: z.string().describe("Name to greet"),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  handler: async (input) => {
    return { message: `Hello, ${input.name}!` };
  },
});

// 导出便捷函数
export async function greet(name: string) {
  return greetTool.call({ name });
}

// 创建 MCP Server
export const server = createMcpServer({
  name: "greet",
  tools: [greetTool],
  autoStart: import.meta.main,
});
```

使用方式：

```typescript
// 方式一：程序直接调用
import { greet } from "../mcps/greet.mcp.ts";
const result = await greet("World");

// 方式二：AI 通过 MCP 协议调用
const mcpServers = { greet: await getMcpServerConfig("greet") };
await createAiQueryBuilder()
  .mcpServers(mcpServers)
  .allowTools(["mcp__greet__greet"])
  .execute();
```

## 启动文档服务

```bash
deno task docs:dev
```

## 下一步

- [深入了解 Workflow](../02-workflow/) - 驱动模式、Subflows、内置 Workflow
- [深入了解 MCP](../03-mcp/) - 双重接口、Gateway、内置 MCP
