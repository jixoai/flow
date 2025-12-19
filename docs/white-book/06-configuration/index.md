# 配置系统

JixoFlow 提供灵活的配置系统，支持全局偏好设置和用户自定义扩展。

## 配置文件

JixoFlow 支持两种配置方式，**按优先级排序**：

1. `user/preferences.ts` - TypeScript 配置（推荐，类型安全）
2. `user/preferences.json` - JSON 配置（兼容模式）

### preferences.ts（推荐）

TypeScript 配置提供类型安全和灵活的动态配置能力：

```typescript
// user/preferences.ts
import type { Preferences } from "../common/preferences.ts";

// 可以使用环境变量、条件逻辑等
const isDev = Deno.env.get("ENV") === "development";

export default {
  ai: {
    defaultAgent: isDev ? "codex" : "claude-code",
    agents: {
      "claude-code": {
        enabled: true,
        model: "claude-sonnet-4-20250514",
        options: {
          maxTokens: 8192,
          permissionMode: "acceptEdits",
        },
      },
      codex: {
        enabled: true,
        model: "codex-mini",
        options: {},
      },
    },
    fallbackChain: ["claude-code", "codex"],
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryOn: ["timeout", "rate_limit", "server_error", "network_error"],
    },
  },
  workflows: {
    "git-committer": {
      preferredAgent: "codex",
    },
  },
  mcps: {},
} satisfies Preferences;
```

### preferences.json（兼容模式）

如果不存在 `.ts` 配置，则回退到 JSON 配置：

```json
{
  "$schema": "./preferences.schema.json",
  "ai": {
    "defaultAgent": "claude-code",
    "agents": {
      "claude-code": {
        "enabled": true,
        "model": "claude-sonnet-4-20250514",
        "options": {
          "maxTokens": 8192,
          "permissionMode": "acceptEdits"
        }
      },
      "codex": {
        "enabled": true,
        "model": "codex-mini",
        "options": {}
      }
    },
    "fallbackChain": ["claude-code", "codex"],
    "retry": {
      "maxAttempts": 3,
      "initialDelayMs": 1000,
      "maxDelayMs": 30000,
      "backoffMultiplier": 2,
      "retryOn": ["timeout", "rate_limit", "server_error", "network_error"]
    }
  },
  "workflows": {
    "git-committer": {
      "preferredAgent": "codex"
    }
  },
  "mcps": {
    "memory": {
      "options": {
        "maxResults": 50
      }
    }
  }
}
```

## 热更新机制

JixoFlow 支持配置热更新，无需重启服务：

### 自动轮询

配置加载器会自动轮询更新配置：

- **正常循环**：每 10 秒重新加载配置
- **错误重试**：如果加载失败，每 3 秒重试直到成功
- **优雅降级**：错误时保留上一次成功的配置

```
┌─────────────────────────────────────────────────────┐
│              配置热更新循环                          │
│                                                      │
│   1. 尝试加载 preferences.ts                        │
│   2. 如失败，每 3s 重试直到成功                     │
│   3. 成功后等待 10s                                 │
│   4. 重复步骤 1                                     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### meta.mcp 自动刷新

`meta.mcp` 服务启动后，每 30 秒自动重新扫描 workflows：

- 新增的 workflow 会自动出现在工具列表中
- 删除的 workflow 会自动移除
- AI Agent 可以调用 `reload` 工具主动刷新

```typescript
// AI Agent 主动刷新
const result = await mcp.call("reload", {});
// 返回最新的 workflow 列表描述
```

## meta config 命令

使用 `meta config` 命令管理配置：

```bash
# 显示当前配置
jixoflow meta config

# 初始化 preferences.ts（从示例复制）
jixoflow meta config init

# 强制覆盖已有配置
jixoflow meta config init --force

# 使用 AI 帮助编辑配置
jixoflow meta config edit -p "将默认 Agent 改为 codex"
jixoflow meta config edit -p "禁用 git-committer workflow"
jixoflow meta config edit -p "为 coder workflow 设置首选 Agent 为 claude-code"

# 输出 JSON 格式
jixoflow meta config --json
```

### 配置项说明

| 配置路径           | 说明                     |
| ------------------ | ------------------------ |
| `ai.defaultAgent`  | 默认使用的 AI Agent      |
| `ai.agents.<name>` | 各 Agent 的具体配置      |
| `ai.fallbackChain` | Agent 不可用时的降级链   |
| `ai.retry`         | 重试策略配置             |
| `ai.retry.retryOn` | 触发重试的错误类型       |
| `workflows.<name>` | 特定 Workflow 的配置覆盖 |
| `mcps.<name>`      | 特定 MCP 的配置覆盖      |

## 用户自定义

### user 目录结构

```
user/
├── preferences.example.json   # 配置模板
├── preferences.json           # 用户配置（从 .example 复制）
├── workflows/                 # 自定义 Workflow
├── mcps/                      # 自定义 MCP
└── prompts/
    ├── user-proxy.example.md  # 提示词模板
    └── user-proxy.md          # 用户提示词（从 .example 复制）
```

### 覆盖机制

JixoFlow 在加载 Workflow 和 MCP 时，会优先查找 `user/` 目录：

```
加载顺序：
1. user/workflows/<name>.workflow.ts  ← 优先
2. workflows/<name>.workflow.ts       ← 内置
```

同名文件时，用户自定义版本会**完全覆盖**内置版本。

### 自定义提示词

某些 MCP 支持通过 `user/prompts/` 目录自定义提示词：

| 文件            | 影响的 MCP     |
| --------------- | -------------- |
| `user-proxy.md` | user-proxy.mcp |

当提示词文件存在时，MCP 将读取用户版本而非内置版本。

## 本章内容

- [AI Agent 配置](./ai-agents) - 配置和管理 AI 后端
- [用户自定义](./user-customization) - 扩展和覆盖内置功能
