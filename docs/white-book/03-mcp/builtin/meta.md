# Meta MCP

**核心组件**：将 Workflow 聚合为 MCP 工具，实现 Workflow ↔ MCP 转换。

## 默认行为

`meta.mcp.ts` **默认聚合所有** `workflows/` 目录下的 Workflow：

```
meta.mcp.ts
    ↓ 自动扫描
workflows/
├── coder.workflow.ts      ✓ 包含
├── research.workflow.ts   ✓ 包含
├── memory.workflow.ts     ✓ 包含
├── git-committer.workflow.ts  ✓ 包含
└── user-proxy.workflow.ts ✓ 包含
```

## 自定义组装

同时提供 `createMetaMcp()` 函数，让 Workflow 可以**自由选择**要包含的子集：

```typescript
import { createMetaMcp } from "../meta/meta.mcp.ts";

// 只包含需要的 workflow
const metaMcp = createMetaMcp({
  workflows: ["coder", "research"], // 不包含 memory, git-committer 等
});
```

## 两种使用场景

### 场景一：外部 AI 调用（默认全部）

配置 Claude CLI 使用 meta.mcp：

```json
{
  "mcpServers": {
    "workflow": {
      "command": "deno",
      "args": ["run", "-A", "meta/meta.mcp.ts"]
    }
  }
}
```

外部 AI 可以调用任意 Workflow：

```
调用 workflow 工具:
  name: "coder"
  args: { prompt: "实现快速排序" }
```

### 场景二：Workflow 编排（自定义子集）

一个 Workflow 只暴露需要的能力：

```typescript
// orchestrator.workflow.ts
export const workflow = defineWorkflow({
  name: "orchestrator",
  handler: async (args) => {
    // 只聚合需要的 workflow
    const metaMcp = createMetaMcp({
      workflows: ["coder", "research"],
    });

    const result = await createAiQueryBuilder()
      .prompt(args.task)
      .mcpServers({ meta: metaMcp })
      .allowTools(["mcp__meta__workflow"])
      .executeWithSession();
  },
});
```

## 工具

| 工具             | 说明              |
| ---------------- | ----------------- |
| `workflow`       | 执行指定 Workflow |
| `list_workflows` | 列出可用 Workflow |

## API

### createMetaMcp

创建包含指定 Workflow 子集的 MCP 配置：

```typescript
function createMetaMcp(config: {
  workflows: string[]; // 要包含的 workflow 名称
}): McpServerConfig;
```

### listWorkflows

列出所有可用的 Workflow：

```typescript
import { listWorkflows } from "../meta/meta.mcp.ts";

const workflows = await listWorkflows();
// => ["coder", "research", "memory", "git-committer", "user-proxy"]
```

## 架构意义

meta.mcp 实现了：

1. **Workflow → MCP 转换**：任何 Workflow 可被 AI 作为工具调用
2. **默认全量**：外部 AI 可访问所有 Workflow
3. **按需裁剪**：内部编排可选择子集，遵循最小权限原则
4. **闭环架构**：Workflow 使用 MCP，Workflow 也可成为 MCP
