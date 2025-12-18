# Gateway API

MCP HTTP Gateway 相关 API。

## getMcpServerConfig

获取单个 MCP 配置，首次调用自动启动 Gateway。

```typescript
import { getMcpServerConfig } from "../common/paths.ts";

const config = await getMcpServerConfig("memory");
// => { type: "http", url: "http://127.0.0.1:PORT/mcp/memory" }
```

## getMcpServerConfigs

批量获取多个 MCP 配置。

```typescript
import { getMcpServerConfigs } from "../common/paths.ts";

const configs = await getMcpServerConfigs("memory", "openspec", "html2md");
// => {
//      memory: { type: "http", url: "..." },
//      openspec: { type: "http", url: "..." },
//      html2md: { type: "http", url: "..." },
//    }
```

## 在 Workflow 中使用

```typescript
const mcpServers = await getMcpServerConfigs("memory", "openspec");

const result = await createAiQueryBuilder()
  .mcpServers(mcpServers)
  .allowTools(["mcp__memory__*", "mcp__openspec__*"])
  .executeWithSession();
```

## McpServerConfig 类型

```typescript
type McpServerConfig =
  | { type?: "stdio"; command: string; args?: string[] }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> };
```

## getMcpPath

获取 MCP 文件路径。

```typescript
import { getMcpPath } from "../common/paths.ts";

const path = getMcpPath("memory");
// => "/Users/.../workflow/mcps/memory.mcp.ts"
```
