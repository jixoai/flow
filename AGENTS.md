# JixoFlow - AI Agent 开发指南

> 本文件供 AI Agent 阅读，说明项目架构和开发规范。

## 项目定位

这是一个**面向 AI Agent 的可组合工作流框架**，基于 Deno
运行时，核心围绕两个概念：

| 概念         | 定位       | 文件位置                                                    |
| ------------ | ---------- | ----------------------------------------------------------- |
| **Workflow** | 任务编排层 | `workflows/*.workflow.ts` 或 `user/workflows/*.workflow.ts` |
| **MCP**      | 能力封装层 | `mcps/*.mcp.ts` 或 `user/mcps/*.mcp.ts`                     |

## 三大架构创新

### 1. MCP 双重身份

每个 MCP 文件**同时**是：

- **MCP Server**：AI 通过协议调用
- **工具函数模块**：程序直接 import 调用

```typescript
// mcps/memory.mcp.ts
export const searchTool = defineTool({ ... });
export async function searchMemories(query: string) {  // 程序调用
  return searchTool.call({ query });
}
export const server = createMcpServer({ tools: [searchTool] });  // MCP Server
```

### 2. Workflow 双重身份

每个 Workflow **同时**是：

- **CLI 工具**：`deno run -A workflow.ts --args`
- **可组合模块**：被其他 Workflow import 或通过 meta.mcp 调用

### 3. meta.mcp 聚合

`meta/meta.mcp.ts` 将所有 Workflow 聚合为 MCP 工具：

- **默认**：聚合所有 `workflows/` 下的 Workflow
- **可选**：`createMetaMcp({ workflows: [...] })` 按需选择子集

## 目录结构

```
workflow/
├── workflows/                    # 内置 Workflow 定义
│   ├── shared/
│   │   └── base-workflow.ts      # defineWorkflow 核心
│   ├── coder.workflow.ts         # 编程任务
│   ├── coder/
│   │   ├── prompts/system.md     # System Prompt
│   │   └── subflows/*.workflow.ts
│   ├── research.workflow.ts      # 研究调查
│   ├── memory.workflow.ts        # 记忆管理
│   ├── git-committer.workflow.ts # Git 提交
│   └── user-proxy.workflow.ts    # 用户偏好
│
├── mcps/                         # 内置 MCP 定义
│   ├── shared/
│   │   ├── base-mcp.ts           # defineTool, createMcpServer 核心
│   │   ├── mcp-gateway.ts        # HTTP Gateway
│   │   └── session-manager.ts    # 会话管理
│   ├── ai.mcp.ts                 # AI 查询统一接口
│   ├── ai-claude-code.mcp.ts     # Claude 后端
│   ├── memory.mcp.ts             # 记忆管理
│   ├── openspec.mcp.ts           # 变更规格
│   └── ...
│
├── user/                         # 用户自定义（优先于内置）
│   ├── preferences.json          # 用户配置
│   ├── workflows/                # 自定义 Workflow（同名覆盖内置）
│   ├── mcps/                     # 自定义 MCP（同名覆盖内置）
│   └── prompts/                  # 自定义提示词
│
├── meta/                         # Meta 工具
│   ├── meta.mcp.ts               # Workflow 聚合为 MCP
│   └── prompts/
│       ├── create-workflow.md
│       └── create-mcp.md
│
├── common/
│   └── paths.ts                  # 路径常量、getMcpServerConfig
│
└── docs/                         # VitePress 文档
    └── white-book/               # 产品白皮书
```

## 开发新 Workflow

### 基本模板

```typescript
// workflows/my-task.workflow.ts
import { defineWorkflow } from "./shared/base-workflow.ts";

export const workflow = defineWorkflow({
  name: "my-task",
  description: "任务描述",
  args: {
    prompt: { type: "string", alias: "p", required: true },
    verbose: { type: "boolean", alias: "v", default: false },
  },
  handler: async (args, ctx) => {
    // 业务逻辑
  },
  autoStart: import.meta.main,
});
```

### AI 驱动模式

```typescript
import { createAiQueryBuilder } from "../mcps/ai.mcp.ts";
import { getMcpServerConfigs } from "../common/paths.ts";

handler: (async (args) => {
  const mcpServers = await getMcpServerConfigs("memory", "openspec");

  const result = await createAiQueryBuilder()
    .prompt(args.prompt)
    .systemPrompt("System instructions...")
    .mcpServers(mcpServers)
    .allowTools(["Read", "Write", "mcp__memory__*"])
    .permissionMode("acceptEdits")
    .executeWithSession();

  console.log(result.output);
});
```

### 编程驱动模式

```typescript
import { searchMemories } from "../mcps/memory.mcp.ts";

handler: (async (args) => {
  const results = await searchMemories(args.query); // 直接调用
  results.forEach((r) => console.log(`- ${r.path}`));
});
```

### 添加 Subflows

```typescript
const listSubflow = defineWorkflow({
  name: "list",
  handler: async () => { ... },
});

export const workflow = defineWorkflow({
  name: "my-task",
  subflows: [
    listSubflow,
    () => import("./my-task/subflows/add.workflow.ts").then(m => m.workflow),
  ],
});
```

## 开发新 MCP

### 基本模板

```typescript
// mcps/my-tool.mcp.ts
import { createMcpServer, defineTool, z } from "./shared/base-mcp.ts";

// 1. 定义工具
export const myTool = defineTool({
  name: "my_tool",
  description: "工具描述",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    results: z.array(z.string()),
  }),
  handler: async (input) => {
    // 实际逻辑
    return { results: [] };
  },
});

// 2. 导出便捷函数（编程接口）
export async function myToolFn(query: string, limit = 10) {
  return myTool.call({ query, limit });
}

// 3. 创建 MCP Server（协议接口）
export const server = createMcpServer({
  name: "my-tool",
  tools: [myTool],
  autoStart: import.meta.main,
});
```

## 关键 API

### getMcpServerConfig / getMcpServerConfigs

获取 MCP 配置，自动启动 HTTP Gateway：

```typescript
const config = await getMcpServerConfig("memory");
// => { type: "http", url: "http://127.0.0.1:PORT/mcp/memory" }

const configs = await getMcpServerConfigs("memory", "openspec");
```

### createAiQueryBuilder

链式构建 AI 查询：

```typescript
const result = await createAiQueryBuilder()
  .prompt("...")
  .systemPrompt("...")
  .mcpServers({ memory: config })
  .allowTools(["Read", "mcp__memory__*"])
  .executeWithSession();
```

### createMetaMcp

按需选择 Workflow 子集：

```typescript
const metaMcp = createMetaMcp({
  workflows: ["coder", "research"], // 只包含这些
});
```

## 开发流程（重要）

**每次开发新功能或修改现有功能，必须遵循以下流程：**

1. **先更新白皮书** (`docs/white-book/`)
   - 在开始编码前，先在白皮书中记录设计和 API
   - 白皮书是项目的 Single Source of Truth

2. **基于白皮书开发**
   - 严格按照白皮书中定义的 API 和行为进行实现
   - 如有调整，先更新白皮书再修改代码

3. **代码质量检查**
   - 开发完成后，必须运行以下命令：
   ```bash
   # 格式化代码
   deno fmt

   # 检查并自动修复 lint 问题
   deno lint --fix

   # 类型检查
   deno check <file.ts>

   # 运行相关测试
   deno test --allow-all <test-file.ts>
   ```

4. **提交前确认**
   - 确保 `deno fmt` 和 `deno lint --fix` 无报错
   - 确保相关单元测试通过

## 开发规范

1. **文件命名**
   - Workflow: `<name>.workflow.ts`
   - MCP: `<name>.mcp.ts`
   - 主入口必须在 `workflows/` 或 `mcps/` 根目录

2. **双重接口**
   - MCP 必须同时导出工具函数和 MCP Server
   - Workflow 必须设置 `autoStart: import.meta.main`

3. **System Prompt**
   - 存放在 `<name>/prompts/system.md`
   - 使用 Markdown 格式

4. **Subflows**
   - 存放在 `<name>/subflows/*.workflow.ts`
   - 使用懒加载避免循环依赖

5. **类型安全**
   - 使用 Zod 定义输入输出 Schema
   - 避免使用 `any`

## 运行和测试

```bash
# 运行 Workflow
deno run -A workflows/coder.workflow.ts --prompt "..."

# 运行 MCP Server
deno run -A mcps/memory.mcp.ts

# 启动文档
deno task docs:dev

# 代码质量（开发完成后必须运行）
deno task fmt      # 格式化代码
deno task lint     # 检查并修复 lint 问题

# 类型检查
deno check workflows/*.workflow.ts
deno check mcps/*.mcp.ts

# 运行测试
deno test --allow-all meta/lib/*.test.ts
```

## 文档

完整文档在 `docs/white-book/`，基于 VitePress：

- 导航自动从文件系统生成（`docs/.vitepress/nav.ts`）
- 添加新章节：创建 `XX-name/index.md`
- 添加新页面：在章节目录下创建 `.md` 文件
