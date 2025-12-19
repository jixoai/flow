# 路线图

本章记录 JixoFlow 的发展规划和未来特性。

## 当前版本 (v0.1)

### 已实现

- [x] 核心框架
  - [x] defineWorkflow / defineTool API
  - [x] MCP Gateway
  - [x] Session 管理

- [x] 内置 Workflows
  - [x] coder - 编程任务
  - [x] research - 研究调查
  - [x] git-committer - Git 提交
  - [x] memory - 记忆管理
  - [x] user-proxy - 用户偏好

- [x] 配置系统
  - [x] preferences.ts 类型安全配置
  - [x] definePreferences 流式 API
  - [x] AsyncContext 配置传递
  - [x] Agent 权重系统

### 进行中

- [ ] 提示词定制系统
  - [ ] prompt-loader.ts 实现
  - [ ] 模板语法 `{{KEY}}`
  - [ ] frontmatter 配置

- [ ] Workflow 配置 Schema
  - [ ] 通用配置项 (tools, permissionMode)
  - [ ] 各 workflow 特有配置
  - [ ] `!` 前缀工具移除语法

## 近期计划 (v0.2)

### Project Scope

支持项目级配置，与用户级配置平行：

```
~/Github/my-project/
├── .jixoflow/
│   ├── preferences.ts    # 项目级配置
│   ├── prompts/          # 项目级提示词
│   └── workflows/        # 项目级 workflow
├── src/
└── ...
```

**优先级**: `project > user > builtin`

**特性**:

- 项目配置自动发现（基于 cwd）
- 项目配置与用户配置合并
- 支持 `.jixoflow/` 目录

### Roles 系统

支持多配置空间，实现"角色切换"：

```
user/
├── roles/
│   ├── default/          # 默认角色（等同于当前 user/）
│   │   ├── preferences.ts
│   │   ├── prompts/
│   │   ├── workflows/
│   │   └── mcps/
│   ├── senior-dev/       # 高级开发者角色
│   │   ├── preferences.ts
│   │   └── prompts/
│   └── researcher/       # 研究员角色
│       ├── preferences.ts
│       └── prompts/
└── ...
```

**特性**:

- 角色完全隔离配置空间
- 通过命令行或环境变量切换角色
- 角色可继承 default 配置

**使用方式**:

```bash
# 切换角色
jixoflow --role senior-dev run coder -p "..."

# 环境变量
JIXOFLOW_ROLE=researcher jixoflow run research -p "..."
```

## 中期计划 (v0.3)

### 插件系统

支持第三方插件扩展：

```typescript
// plugins/my-plugin/index.ts
export default definePlugin({
  name: "my-plugin",
  workflows: [...],
  mcps: [...],
  hooks: {
    onWorkflowStart: async (ctx) => { ... },
    onWorkflowEnd: async (ctx) => { ... },
  },
});
```

### 远程配置

支持从远程加载配置：

```typescript
// preferences.ts
export default definePreferences(async (ctx, p) => {
  const remoteConfig = await fetch("https://config.example.com/my-team");
  return p
    .merge(remoteConfig)
    .build();
});
```

### 团队协作

支持团队级配置共享：

```
.jixoflow/
├── team.json             # 团队配置引用
└── local.ts              # 本地覆盖
```

## 长期愿景

### 可视化配置界面

提供 Web UI 配置管理：

- 配置编辑器
- Workflow 可视化
- 实时日志查看
- 成本监控面板

### 多运行时支持

- Node.js 运行时支持
- Bun 运行时支持
- 浏览器端 SDK

### Agent 市场

- 共享 Workflow/MCP 市场
- 一键安装第三方扩展
- 评分和评论系统

## 贡献指南

欢迎参与 JixoFlow 开发！详见 [贡献指南](../07-contributing/)。

优先接受以下方向的贡献：

1. 新的内置 Workflow/MCP
2. 文档改进
3. Bug 修复
4. 性能优化
