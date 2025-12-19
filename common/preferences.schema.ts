/**
 * Preferences Schema Definition
 *
 * 使用 Zod 定义配置 schema，同时导出：
 * - TypeScript 类型
 * - JSON Schema（用于编辑器智能提示）
 */

import { z } from "zod";

// =============================================================================
// Agent Config
// =============================================================================

export const AgentOptionsSchema = z
  .object({
    maxTokens: z.number().optional().describe("最大 token 数"),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe("采样温度"),
    permissionMode: z
      .enum(["default", "acceptEdits", "bypassPermissions"])
      .optional()
      .describe("权限模式"),
    maxTurns: z.number().optional().describe("最大对话轮次"),
  })
  .passthrough()
  .optional()
  .describe("Agent 特定的配置选项");

export const AgentConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(true).describe("是否启用此 Agent"),
    model: z.string().optional().describe("使用的模型名称"),
    options: AgentOptionsSchema,
  })
  .describe("Agent 配置");

// =============================================================================
// Retry Config
// =============================================================================

export const RetryConfigSchema = z
  .object({
    maxAttempts: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(3)
      .describe("最大重试次数"),
    initialDelayMs: z
      .number()
      .min(100)
      .optional()
      .default(1000)
      .describe("首次重试延迟（毫秒）"),
    maxDelayMs: z
      .number()
      .optional()
      .default(30000)
      .describe("最大重试延迟（毫秒）"),
    backoffMultiplier: z
      .number()
      .min(1)
      .optional()
      .default(2)
      .describe("退避乘数（指数退避）"),
    retryOn: z
      .array(
        z.enum(["timeout", "rate_limit", "server_error", "network_error"]),
      )
      .optional()
      .default(["timeout", "rate_limit", "server_error", "network_error"])
      .describe("触发重试的错误类型"),
  })
  .describe("重试机制配置");

// =============================================================================
// Workflow Config
// =============================================================================

export const WorkflowConfigSchema = z
  .object({
    preferredAgent: z
      .string()
      .optional()
      .describe("此 Workflow 优先使用的 Agent"),
    disabled: z
      .boolean()
      .optional()
      .default(false)
      .describe("是否禁用此 Workflow"),
    options: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Workflow 特定的配置选项"),
  })
  .describe("单个 Workflow 的配置");

// =============================================================================
// MCP Config
// =============================================================================

export const McpConfigSchema = z
  .object({
    disabled: z
      .boolean()
      .optional()
      .default(false)
      .describe("是否禁用此 MCP"),
    options: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("MCP 特定的配置选项"),
  })
  .describe("单个 MCP 的配置");

// =============================================================================
// AI Preferences
// =============================================================================

export const AiPreferencesSchema = z
  .object({
    defaultAgent: z
      .string()
      .optional()
      .default("claude-code")
      .describe("默认使用的 AI Agent"),
    agents: z
      .record(z.string(), AgentConfigSchema)
      .optional()
      .describe("各 Agent 的具体配置"),
    fallbackChain: z
      .array(z.string())
      .optional()
      .default(["claude-code", "codex"])
      .describe("Agent 降级链：当首选 Agent 不可用时按顺序尝试"),
    retry: RetryConfigSchema.optional(),
  })
  .describe("AI Agent 配置");

// =============================================================================
// Root Preferences Schema
// =============================================================================

export const PreferencesSchema = z
  .object({
    $schema: z.string().optional().describe("JSON Schema 引用"),
    ai: AiPreferencesSchema.optional(),
    workflows: z
      .record(z.string(), WorkflowConfigSchema)
      .optional()
      .describe("Workflow 级别的配置覆盖"),
    mcps: z
      .record(z.string(), McpConfigSchema)
      .optional()
      .describe("MCP 级别的配置覆盖"),
  })
  .describe("JixoFlow 用户偏好配置");

// =============================================================================
// Type Exports
// =============================================================================

export type AgentOptions = z.infer<typeof AgentOptionsSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type AiPreferences = z.infer<typeof AiPreferencesSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;

// =============================================================================
// JSON Schema Export
// =============================================================================

/**
 * 生成 JSON Schema
 */
export function generateJsonSchema(): object {
  const schema = z.toJSONSchema(PreferencesSchema);
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "JixoFlow Preferences",
    description: "JixoFlow 用户偏好配置",
    ...schema,
  };
}

// =============================================================================
// CLI: Generate JSON Schema
// =============================================================================

if (import.meta.main) {
  const schema = generateJsonSchema();
  console.log(JSON.stringify(schema, null, 2));
}
