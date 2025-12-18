# 配置系统

JixoFlow 提供灵活的配置系统，支持全局偏好设置和用户自定义扩展。

## 配置文件

### preferences.json

配置文件位于 `user/preferences.json`，控制 AI Agent、重试机制等核心行为。

> **提示**：首次使用时，复制 `user/preferences.example.json` 到
> `user/preferences.json`

```json
{
  "ai": {
    "defaultAgent": "claude-code",
    "agents": {
      "claude-code": {
        "enabled": true,
        "model": "claude-sonnet-4-20250514",
        "options": {}
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
      "backoffMultiplier": 2
    }
  },
  "workflows": {
    "git-committer": {
      "preferredAgent": "codex"
    }
  }
}
```

### 配置项说明

| 配置路径           | 说明                     |
| ------------------ | ------------------------ |
| `ai.defaultAgent`  | 默认使用的 AI Agent      |
| `ai.agents.<name>` | 各 Agent 的具体配置      |
| `ai.fallbackChain` | Agent 不可用时的降级链   |
| `ai.retry`         | 重试策略配置             |
| `workflows.<name>` | 特定 Workflow 的配置覆盖 |

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
