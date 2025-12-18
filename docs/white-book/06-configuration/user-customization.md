# 用户自定义

JixoFlow 支持通过 `user/` 目录扩展和覆盖内置功能。

## 目录结构

```
$JIXOHOME/
├── workflows/           # 内置 Workflow
├── mcps/                # 内置 MCP
├── user/                # 用户自定义
│   ├── workflows/       # 自定义 Workflow
│   ├── mcps/            # 自定义 MCP
│   └── prompts/         # 自定义提示词
└── preferences.json     # 全局配置
```

## 使用 meta create 创建

`meta create` 命令默认将新创建的 Workflow/MCP 放在 `user/` 目录：

```bash
# 创建新 workflow（默认在 user/workflows/）
jixoflow meta create -p "A task cleanup workflow"

# 创建新 MCP（默认在 user/mcps/）
jixoflow meta create -p "A custom search MCP" -t mcp

# 覆盖内置 workflow（在 user/workflows/ 创建同名文件）
jixoflow meta create -p "Customize coder behavior" --override coder

# 覆盖内置 MCP
jixoflow meta create -p "Custom memory storage" -t mcp --override memory
```

### --override 行为

| 场景                   | 行为                         |
| ---------------------- | ---------------------------- |
| `user/` 中存在同名文件 | 覆盖 user 版本               |
| 仅 `builtin` 中存在    | 在 user 目录创建同名文件覆盖 |
| 两处都不存在           | 在 user 目录创建新文件       |

## 手动自定义 Workflow

在 `user/workflows/` 中创建同名 Workflow 可覆盖内置版本：

```typescript
// user/workflows/coder.workflow.ts
import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";

export const workflow = defineWorkflow({
  name: "coder",
  description: "我的自定义 coder workflow",
  args: {
    prompt: { type: "string", alias: "p", required: true },
  },
  handler: async (args, ctx) => {
    // 自定义逻辑
    console.log("使用自定义 coder:", args.prompt);
  },
  autoStart: import.meta.main,
});
```

运行 `jixoflow run coder` 时将执行用户版本。

## 手动自定义 MCP

在 `user/mcps/` 中创建同名 MCP 可覆盖内置版本：

```typescript
// user/mcps/memory.mcp.ts
import { createMcpServer, defineTool, z } from "../../mcps/shared/base-mcp.ts";

export const searchTool = defineTool({
  name: "search",
  description: "自定义的记忆搜索",
  inputSchema: z.object({
    query: z.string(),
  }),
  handler: async (input) => {
    // 自定义搜索逻辑
    return { results: [] };
  },
});

export const server = createMcpServer({
  name: "memory",
  tools: [searchTool],
  autoStart: import.meta.main,
});
```

## 自定义提示词

某些 MCP 支持通过 `user/prompts/` 自定义提示词。

### user-proxy.md

`user-proxy.mcp` 会读取此文件作为用户偏好：

```markdown
<!-- user/prompts/user-proxy.md -->

# 用户偏好

## 代码风格

- 使用 TypeScript
- 优先使用函数式编程
- 变量命名使用 camelCase

## 技术栈偏好

- 前端: React + TailwindCSS
- 后端: Deno + Oak
- 数据库: PostgreSQL

## 项目约定

- 所有文件使用 UTF-8 编码
- 使用 2 空格缩进
- 提交信息使用 Conventional Commits
```

## 加载优先级

```
┌─────────────────────────────────────────────────────┐
│                  meta.mcp 发现                       │
│                                                      │
│   1. 扫描 user/workflows/ 和 user/mcps/             │
│   2. 扫描内置 workflows/ 和 mcps/                   │
│   3. 合并结果（用户版本优先）                        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

同名时用户版本**完全覆盖**内置版本，不会合并。

## 最佳实践

1. **保持接口兼容** - 覆盖内置功能时，保持相同的输入输出接口
2. **扩展而非替换** - 考虑在自定义版本中调用内置版本
3. **版本控制** - 将 `user/` 目录加入 `.gitignore` 或单独管理
4. **文档化** - 在 `user/README.md` 中记录自定义内容
