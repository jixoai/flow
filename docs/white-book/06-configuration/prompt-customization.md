# 提示词定制

JixoFlow 提供灵活的提示词定制系统，支持模板化、占位符替换和多层级覆盖。

## 基础概念

### 提示词来源优先级

```
user/prompts/{workflow}/     →  用户自定义（优先）
workflows/{workflow}/prompts/ →  内置默认
```

### 提示词文件类型

| 文件         | 作用                       |
| ------------ | -------------------------- |
| `system.md`  | 完全覆盖内置 system prompt |
| `prepend.md` | 前置追加到内置 prompt      |
| `append.md`  | 后置追加到内置 prompt      |

**组合逻辑**：

```
最终 prompt = prepend + (override ?? builtin) + append
```

## 模板语法

### 占位符

内置提示词使用占位符标记可替换内容：

```markdown
# Coder - 专业程序员

{​{USER_RULES}}

## WORKFLOW

1. 调查问题...

{​{CUSTOM_INSTRUCTIONS}}
```

### 默认语法

- **PREFIX**: 双左花括号 `{​{`
- **SUFFIX**: 双右花括号 `}}`

### 自定义语法

在 Markdown 文件的 YAML frontmatter 中配置：

```markdown
---
PREFIX: "<%"
SUFFIX: "%>"
ALIAS:
  RULES: USER_RULES
  EXTRA: CUSTOM_INSTRUCTIONS
---

# 我的自定义提示词

<%RULES%>

## 自定义部分

...

<%EXTRA%>
```

### 配置项说明

| 配置     | 说明           | 默认值     |
| -------- | -------------- | ---------- |
| `PREFIX` | 占位符前缀     | 双左花括号 |
| `SUFFIX` | 占位符后缀     | 双右花括号 |
| `ALIAS`  | 占位符别名映射 | 空对象     |

## 内置占位符

### 通用占位符

| 占位符                | 说明                      |
| --------------------- | ------------------------- |
| `USER_RULES`          | 用户规则，来自 user-proxy |
| `CUSTOM_INSTRUCTIONS` | 用户自定义指令            |
| `DATETIME`            | 当前日期时间              |
| `CWD`                 | 当前工作目录              |

> 使用时需加上占位符前后缀，默认为双花括号。

### Workflow 特定占位符

每个 workflow 可定义自己的占位符，详见各 workflow 文档。

## 使用示例

### 追加自定义规则

创建 `user/prompts/coder/append.md`：

```markdown
## 额外规则

- 所有函数必须有 JSDoc 注释
- 使用 TypeScript strict mode
- 优先使用 Deno 标准库
```

### 完全自定义

创建 `user/prompts/coder/system.md`：

```markdown
# 我的 Coder

你是一个专注于 {​{TECH_STACK}} 的程序员。

{​{USER_RULES}}

## 工作流程

1. 理解需求
2. 编写代码
3. 运行测试

{​{CUSTOM_INSTRUCTIONS}}
```

### 使用别名简化

```markdown
---
ALIAS:
  R: USER_RULES
  C: CUSTOM_INSTRUCTIONS
---

# 简化版 Coder

{​{R}}

## 规则

{​{C}}
```

## API 参考

### readPrompt

```typescript
import { readPrompt } from "../common/prompt-loader.ts";

// 读取提示词（自动处理优先级和模板）
const prompt = await readPrompt("coder/system.md");
```

### renderPrompt

```typescript
import { renderPrompt } from "../common/prompt-loader.ts";

// 渲染模板
const rendered = await renderPrompt(template, {
  USER_RULES: userRules,
  CUSTOM_INSTRUCTIONS: customInstructions,
});
```

## 调试

使用 `meta prompt` 命令查看最终渲染的提示词：

```bash
# 查看 coder 的最终 system prompt
jixoflow meta prompt coder

# 查看原始模板（不渲染）
jixoflow meta prompt coder --raw

# 查看占位符定义
jixoflow meta prompt coder --placeholders
```

## 最佳实践

1. **优先使用 append.md** - 追加比覆盖更安全，不会丢失内置功能
2. **保留关键占位符** - 如 `USER_RULES`，确保用户偏好生效
3. **文档化自定义** - 在 `user/prompts/README.md` 记录自定义内容
4. **测试渲染结果** - 使用 `meta prompt` 验证最终效果
