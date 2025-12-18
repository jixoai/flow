# OpenSpec MCP

结构化的变更规格管理。

## 工具

| 工具              | 说明         |
| ----------------- | ------------ |
| `openspec_create` | 创建变更规格 |
| `openspec_show`   | 查看规格详情 |
| `openspec_list`   | 列出所有规格 |
| `openspec_update` | 更新规格状态 |

## 程序调用

```typescript
import {
  createOpenSpec,
  listOpenSpecs,
  showOpenSpec,
} from "../mcps/openspec.mcp.ts";

// 创建
const spec = await createOpenSpec({
  title: "添加用户认证",
  description: "实现 JWT 认证",
  type: "feature",
});

// 查看
const detail = await showOpenSpec({ id: "CHANGE-001" });

// 列表
const specs = await listOpenSpecs({ status: "in_progress" });
```

## 规格文件格式

```yaml
# .claude/.openspec/CHANGE-001.yaml
id: CHANGE-001
title: 添加用户认证功能
type: feature
status: in_progress

description: |
  实现基于 JWT 的用户认证

tasks:
  - [ ] 创建 User 模型
  - [x] 实现登录 API
```

## 在 Coder Workflow 中使用

```bash
# 创建提案
deno run -A coder.workflow.ts proposal -p "添加缓存层"

# 应用
deno run -A coder.workflow.ts apply CHANGE-001

# 归档
deno run -A coder.workflow.ts archive CHANGE-001
```
