# HTTP Gateway

Gateway 提供统一的 HTTP 服务管理所有 MCP。

## 设计动机

### 传统方式（每次启动子进程）

```
AI Query 1 → 启动 memory.mcp.ts 子进程 → 执行 → 关闭
AI Query 2 → 启动 memory.mcp.ts 子进程 → 执行 → 关闭
AI Query 3 → 启动 openspec.mcp.ts 子进程 → 执行 → 关闭

问题：启动开销、无法共享状态、资源浪费
```

### Gateway 方式（单进程复用）

```
              ┌─────────────────────────────────┐
              │         HTTP Gateway             │
              │                                  │
AI Query 1 ───│───→ /mcp/memory ───→ memory     │
AI Query 2 ───│───→ /mcp/memory ───→ (复用)     │
AI Query 3 ───│───→ /mcp/openspec → openspec   │
              │                                  │
              └─────────────────────────────────┘

优点：单进程、按需加载、连接复用
```

## 工作原理

```
1. HTTP Server 启动 (Deno.serve)
2. 接收请求: GET/POST http://127.0.0.1:PORT/mcp/<name>
3. 路由解析: /mcp/memory → memory
4. 懒加载 MCP:
   if (!loaded[name]) {
     module = await import(`${name}.mcp.ts`)
     server = module.server.getServer()
     transport = new WebStandardStreamableHTTPServerTransport()
     await server.connect(transport)
     loaded[name] = { server, transport }
   }
5. 转发请求: return transport.handleRequest(req)
```

## 使用方式

### 自动启动

```typescript
import { getMcpServerConfig, getMcpServerConfigs } from "../common/paths.ts";

// 首次调用自动启动 Gateway
const config = await getMcpServerConfig("memory");
// => { type: "http", url: "http://127.0.0.1:PORT/mcp/memory" }

// 批量获取
const configs = await getMcpServerConfigs("memory", "openspec");
```

### 在 Workflow 中使用

```typescript
const mcpServers = await getMcpServerConfigs("memory", "openspec");

const result = await createAiQueryBuilder()
  .mcpServers(mcpServers)
  .allowTools(["mcp__memory__*", "mcp__openspec__*"])
  .executeWithSession();
```

## HTTP 端点

| 端点          | 方法 | 说明                        |
| ------------- | ---- | --------------------------- |
| `/`           | GET  | 健康检查，返回可用 MCP 列表 |
| `/mcp/<name>` | ALL  | 转发到指定 MCP              |

### 健康检查响应

```json
{
  "status": "ok",
  "available": ["memory", "openspec", "html2md", ...],
  "loaded": ["memory"]
}
```

## MCP 自动发现

Gateway 自动扫描 `mcps/` 目录：

```
mcps/
├── memory.mcp.ts      → /mcp/memory
├── openspec.mcp.ts    → /mcp/openspec
├── html2md.mcp.ts     → /mcp/html2md
└── shared/            → (忽略)
```

## 性能对比

| 指标     | 子进程方式 | Gateway 方式 |
| -------- | ---------- | ------------ |
| 首次加载 | ~500ms     | ~100ms       |
| 后续调用 | ~500ms     | ~1ms         |
| 内存占用 | N × 单 MCP | 共享进程     |
