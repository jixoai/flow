/**
 * Workflow 配置 Schema
 *
 * 定义所有 workflow 共享的基础配置和各 workflow 的专属配置
 */

import { z } from "npm:zod@3";

// =============================================================================
// 通用配置 Schema
// =============================================================================

/**
 * 工具配置 Schema
 *
 * 支持追加模式和 ! 前缀删除语法
 */
export const ToolsConfigSchema = z.object({
  /** 追加/移除允许的工具，!前缀表示移除 */
  allow: z.array(z.string()).optional().describe("追加/移除允许的工具"),
  /** 追加/移除禁用的工具，!前缀表示移除 */
  disallow: z.array(z.string()).optional().describe("追加/移除禁用的工具"),
}).describe("工具配置");

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * 权限模式 Schema
 */
export const PermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "bypassPermissions",
]).describe("AI 权限级别");

export type PermissionMode = z.infer<typeof PermissionModeSchema>;

/**
 * 提示词配置 Schema
 */
export const PromptsConfigSchema = z.object({
  /** 自定义指令，填充 {{CUSTOM_INSTRUCTIONS}} */
  customInstructions: z.string().optional().describe("自定义指令"),
}).describe("提示词配置");

export type PromptsConfig = z.infer<typeof PromptsConfigSchema>;

/**
 * 基础 Workflow 配置 Schema
 *
 * 所有 workflow 共享的配置项
 */
export const BaseWorkflowConfigSchema = z.object({
  /** 工具配置 */
  tools: ToolsConfigSchema.optional(),
  /** 权限模式 */
  permissionMode: PermissionModeSchema.optional(),
  /** 提示词配置 */
  prompts: PromptsConfigSchema.optional(),
});

export type BaseWorkflowConfig = z.infer<typeof BaseWorkflowConfigSchema>;

// =============================================================================
// Coder 配置 Schema
// =============================================================================

/**
 * OpenSpec 配置
 */
export const OpenSpecConfigSchema = z.object({
  /** 启用 OpenSpec 工作流 */
  enabled: z.boolean().default(true).describe("启用 OpenSpec 工作流"),
  /** 完成后自动归档 */
  autoArchive: z.boolean().default(false).describe("完成后自动归档"),
}).describe("OpenSpec 配置");

/**
 * Coder Workflow 配置 Schema
 */
export const CoderConfigSchema = BaseWorkflowConfigSchema.extend({
  /** OpenSpec 配置 */
  openspec: OpenSpecConfigSchema.optional(),
}).describe("Coder Workflow 配置");

export type CoderConfig = z.infer<typeof CoderConfigSchema>;

// =============================================================================
// Research 配置 Schema
// =============================================================================

/**
 * Research 输出配置
 */
export const ResearchOutputConfigSchema = z.object({
  /** 输出格式 */
  format: z.enum(["markdown", "html", "json"]).default("markdown")
    .describe("输出格式"),
  /** 保存原始 HTML */
  saveHtml: z.boolean().default(true).describe("保存原始 HTML"),
  /** 最大来源数 */
  maxSources: z.number().default(10).describe("最大来源数"),
}).describe("输出配置");

/**
 * Research 搜索配置
 */
export const ResearchSearchConfigSchema = z.object({
  /** 搜索引擎 */
  engine: z.enum(["duckduckgo", "google", "bing"]).default("duckduckgo")
    .describe("搜索引擎"),
  /** 最大搜索结果数 */
  maxResults: z.number().default(20).describe("最大搜索结果数"),
}).describe("搜索配置");

/**
 * Research Workflow 配置 Schema
 */
export const ResearchConfigSchema = BaseWorkflowConfigSchema.extend({
  /** 输出配置 */
  output: ResearchOutputConfigSchema.optional(),
  /** 搜索配置 */
  search: ResearchSearchConfigSchema.optional(),
}).describe("Research Workflow 配置");

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

// =============================================================================
// Git Committer 配置 Schema
// =============================================================================

/**
 * Git Commit 配置
 */
export const GitCommitConfigSchema = z.object({
  /** 提交信息风格 */
  style: z.enum(["conventional", "semantic", "custom"]).default("conventional")
    .describe("提交信息风格"),
  /** 标题最大长度 */
  maxTitleLength: z.number().default(50).describe("标题最大长度"),
  /** 是否要求正文 */
  requireBody: z.boolean().default(false).describe("是否要求正文"),
}).describe("提交配置");

/**
 * Git Push 配置
 */
export const GitPushConfigSchema = z.object({
  /** 自动确认 push */
  autoConfirm: z.boolean().default(false).describe("自动确认 push"),
  /** 远程仓库名 */
  remote: z.string().default("origin").describe("远程仓库名"),
}).describe("Push 配置");

/**
 * Git Committer Workflow 配置 Schema
 */
export const GitCommitterConfigSchema = BaseWorkflowConfigSchema.extend({
  /** 提交配置 */
  commit: GitCommitConfigSchema.optional(),
  /** Push 配置 */
  push: GitPushConfigSchema.optional(),
}).describe("Git Committer Workflow 配置");

export type GitCommitterConfig = z.infer<typeof GitCommitterConfigSchema>;

// =============================================================================
// Memory 配置 Schema
// =============================================================================

/**
 * Memory Workflow 配置 Schema
 */
export const MemoryConfigSchema = BaseWorkflowConfigSchema.extend({
  /** 默认搜索结果数 */
  defaultLimit: z.number().default(10).describe("默认搜索结果数"),
  /** 是否默认保存到用户记忆 */
  defaultUserRelated: z.boolean().default(false).describe("默认保存到用户记忆"),
}).describe("Memory Workflow 配置");

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

// =============================================================================
// 配置注册表
// =============================================================================

/**
 * 所有 Workflow 配置 Schema 映射
 */
export const WorkflowConfigSchemas = {
  coder: CoderConfigSchema,
  research: ResearchConfigSchema,
  "git-committer": GitCommitterConfigSchema,
  memory: MemoryConfigSchema,
} as const;

export type WorkflowName = keyof typeof WorkflowConfigSchemas;

/**
 * 获取指定 workflow 的配置 schema
 */
export function getWorkflowConfigSchema<T extends WorkflowName>(
  name: T,
): typeof WorkflowConfigSchemas[T] {
  return WorkflowConfigSchemas[name];
}

/**
 * 验证 workflow 配置
 */
export function validateWorkflowConfig<T extends WorkflowName>(
  name: T,
  config: unknown,
): z.infer<typeof WorkflowConfigSchemas[T]> {
  const schema = getWorkflowConfigSchema(name);
  return schema.parse(config);
}
