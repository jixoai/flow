# API 参考

核心 API 详细参考。

## Workflow

| API                                 | 用途          |
| ----------------------------------- | ------------- |
| [defineWorkflow](./define-workflow) | 定义 Workflow |

## MCP

| API                                | 用途          |
| ---------------------------------- | ------------- |
| [defineTool](./define-tool)        | 定义 MCP 工具 |
| [createAiQueryBuilder](./ai-query) | AI 查询构建器 |
| [getMcpServerConfig](./gateway)    | 获取 MCP 配置 |

## 导入路径

```typescript
// Workflow
import { defineWorkflow } from "./workflows/shared/base-workflow.ts";

// MCP
import { createMcpServer, defineTool, z } from "./mcps/shared/base-mcp.ts";

// AI 查询
import { aiResume, createAiQueryBuilder } from "./mcps/ai.mcp.ts";

// Gateway
import { getMcpServerConfig, getMcpServerConfigs } from "./common/paths.ts";
```
