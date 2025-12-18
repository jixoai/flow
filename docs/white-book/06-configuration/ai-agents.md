# AI Agent 配置

JixoFlow 底层大量使用 AI 驱动，支持多种 AI Agent 后端。

## 支持的 Agent

| Agent         | 说明                      |
| ------------- | ------------------------- |
| `claude-code` | Anthropic Claude Code CLI |
| `codex`       | OpenAI Codex CLI          |

## 配置 Agent

在 `preferences.json` 中配置各 Agent：

```json
{
  "ai": {
    "defaultAgent": "claude-code",
    "agents": {
      "claude-code": {
        "enabled": true,
        "model": "claude-sonnet-4-20250514",
        "options": {
          "maxTokens": 8192
        }
      },
      "codex": {
        "enabled": true,
        "model": "codex-mini",
        "options": {}
      }
    }
  }
}
```

### Agent 配置项

| 字段      | 类型    | 说明                 |
| --------- | ------- | -------------------- |
| `enabled` | boolean | 是否启用此 Agent     |
| `model`   | string  | 使用的模型名称       |
| `options` | object  | Agent 特定的配置选项 |

## 降级链

当首选 Agent 不可用时，按 `fallbackChain` 顺序尝试备用 Agent：

```json
{
  "ai": {
    "fallbackChain": ["claude-code", "codex"]
  }
}
```

触发降级的情况：

- Agent 未安装或未配置
- API 密钥无效
- 服务暂时不可用
- 达到速率限制

## 重试机制

配置 AI 调用的重试策略：

```json
{
  "ai": {
    "retry": {
      "maxAttempts": 3,
      "initialDelayMs": 1000,
      "maxDelayMs": 30000,
      "backoffMultiplier": 2
    }
  }
}
```

| 字段                | 说明                 |
| ------------------- | -------------------- |
| `maxAttempts`       | 最大重试次数         |
| `initialDelayMs`    | 首次重试延迟（毫秒） |
| `maxDelayMs`        | 最大重试延迟（毫秒） |
| `backoffMultiplier` | 退避乘数（指数退避） |

重试延迟计算：`min(initialDelayMs * (backoffMultiplier ^ attempt), maxDelayMs)`

## Workflow 级别配置

可为特定 Workflow 指定首选 Agent：

```json
{
  "workflows": {
    "git-committer": {
      "preferredAgent": "codex"
    },
    "coder": {
      "preferredAgent": "claude-code"
    }
  }
}
```

优先级：Workflow 配置 > 全局 defaultAgent > fallbackChain
