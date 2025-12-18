# JixoFlow

面向 AI Agent 的可组合工作流框架。

## 核心特性

- **双重身份设计**：MCP 文件既是 Server 又是可调用函数；Workflow 既是 CLI
  工具又是可组合模块
- **多种驱动模式**：AI 驱动、编程驱动、多模式混合
- **meta.mcp 聚合**：Workflow ↔ MCP 互相转换
- **HTTP Gateway**：单进程管理所有 MCP，按需加载

## 快速开始

```bash
# 编程任务
deno run -A workflows/coder.workflow.ts --prompt "实现 LRU Cache"

# 研究调查
deno run -A workflows/research.workflow.ts --prompt "Deno vs Node.js"

# 记忆管理
deno run -A workflows/memory.workflow.ts list

# Git 提交
deno run -A workflows/git-committer.workflow.ts
```

## 文档

完整文档请查看 **[White Book](./docs/white-book/)**：

```bash
# 启动文档服务
cd docs && deno task dev
```

文档内容：

- [介绍](./docs/white-book/01-introduction/) - 概述、特性、快速开始
- [核心概念](./docs/white-book/02-concepts/) - Workflow、驱动模式、Subflows、MCP
- [架构设计](./docs/white-book/03-architecture/) - Gateway、会话管理、SDK 集成
- [内置组件](./docs/white-book/04-guide/) - 内置 Workflows 和 MCPs
- [API 参考](./docs/white-book/05-api/) - 核心 API 文档

## 目录结构

```
workflow/
├── workflows/        # Workflow 定义
├── mcps/             # MCP 定义
├── meta/             # Meta 工具（workflow 聚合）
├── common/           # 共享模块
└── docs/             # 文档（VitePress）
```

## 许可证

MIT
