# User Proxy Workflow

用户偏好代理工作流，支持偏好查询和收集。

## 使用方式

```bash
# 咨询偏好
deno run -A user-proxy.workflow.ts consult --prompt "测试框架偏好"

# 收集反馈
deno run -A user-proxy.workflow.ts feedback --prompt "这个方案可以吗？"

# 记录偏好
deno run -A user-proxy.workflow.ts record --key "test-framework" --value "vitest"
```

## Subflows

| 子流程     | 驱动模式 | 说明         |
| ---------- | -------- | ------------ |
| `consult`  | AI       | 咨询用户偏好 |
| `feedback` | AI       | 收集反馈     |
| `record`   | 编程     | 记录偏好     |

## 参数

### consult / feedback

| 参数       | 别名 | 说明            |
| ---------- | ---- | --------------- |
| `--prompt` | `-p` | 问题描述 (必填) |

### record

| 参数      | 别名 | 说明          |
| --------- | ---- | ------------- |
| `--key`   | `-k` | 偏好键 (必填) |
| `--value` | `-v` | 偏好值 (必填) |

## 使用的 MCP

- `user-proxy` - 用户偏好存储
