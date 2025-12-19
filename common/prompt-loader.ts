/**
 * Prompt Loader
 *
 * 提示词加载和渲染系统
 *
 * 支持：
 * - 多来源优先级：user > builtin
 * - 模板语法：默认 {{KEY}}，可通过 frontmatter 配置
 * - 别名映射：ALIAS: { SHORT: LONG_KEY }
 * - 组合模式：prepend + base + append
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { parse as parseYaml } from "jsr:@std/yaml";

// =============================================================================
// Types
// =============================================================================

/** 提示词来源 */
export type PromptSource = "user" | "builtin";

/** 提示词模板配置（从 frontmatter 解析） */
export interface PromptTemplateConfig {
  /** 占位符前缀，默认 {{ */
  PREFIX?: string;
  /** 占位符后缀，默认 }} */
  SUFFIX?: string;
  /** 占位符别名映射 */
  ALIAS?: Record<string, string>;
}

/** 提示词加载结果 */
export interface LoadedPrompt {
  /** 原始内容 */
  raw: string;
  /** 模板配置 */
  config: PromptTemplateConfig;
  /** 来源 */
  source: PromptSource;
  /** 文件路径 */
  path: string;
}

// =============================================================================
// Constants
// =============================================================================

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

/** 默认模板配置 */
const DEFAULT_CONFIG: Required<PromptTemplateConfig> = {
  PREFIX: "{{",
  SUFFIX: "}}",
  ALIAS: {},
};

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * 获取提示词搜索路径
 *
 * @param relativePath - 相对路径，如 "coder/system.md"
 * @returns 按优先级排序的搜索路径
 */
function getSearchPaths(relativePath: string): Array<{
  path: string;
  source: PromptSource;
}> {
  // 解析 workflow 名称和文件名
  const parts = relativePath.split("/");
  const workflow = parts[0];
  const filename = parts.slice(1).join("/") || "system.md";

  return [
    // user 优先
    {
      path: join(PROJECT_ROOT, "user", "prompts", workflow, filename),
      source: "user" as const,
    },
    // builtin
    {
      path: join(PROJECT_ROOT, "workflows", workflow, "prompts", filename),
      source: "builtin" as const,
    },
  ];
}

// =============================================================================
// Frontmatter Parsing
// =============================================================================

/**
 * 解析 Markdown frontmatter
 *
 * @param content - Markdown 内容
 * @returns 解析后的配置和正文
 */
function parseFrontmatter(content: string): {
  config: PromptTemplateConfig;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { config: {}, body: content };
  }

  try {
    const yaml = parseYaml(match[1]) as PromptTemplateConfig;
    const body = content.slice(match[0].length);
    return { config: yaml || {}, body };
  } catch {
    // YAML 解析失败，返回原始内容
    return { config: {}, body: content };
  }
}

// =============================================================================
// Template Rendering
// =============================================================================

/**
 * 渲染模板
 *
 * @param template - 模板字符串
 * @param vars - 变量映射
 * @param config - 模板配置
 * @returns 渲染后的字符串
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
  config?: PromptTemplateConfig,
): string {
  const { PREFIX, SUFFIX, ALIAS } = { ...DEFAULT_CONFIG, ...config };

  // 构建正则表达式
  const escapedPrefix = PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSuffix = SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedPrefix}\\s*(\\w+)\\s*${escapedSuffix}`,
    "g",
  );

  return template.replace(pattern, (_match, key: string) => {
    // 检查别名
    const actualKey = ALIAS[key] ?? key;
    // 返回变量值或保留原占位符
    return vars[actualKey] ?? vars[key] ?? "";
  });
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * 尝试读取文件
 */
async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * 读取提示词文件
 *
 * 按优先级搜索：user > builtin
 *
 * @param relativePath - 相对路径，如 "coder/system.md"
 * @returns 加载的提示词，或 null
 */
export async function readPromptFile(
  relativePath: string,
): Promise<LoadedPrompt | null> {
  const searchPaths = getSearchPaths(relativePath);

  for (const { path, source } of searchPaths) {
    const content = await tryReadFile(path);
    if (content !== null) {
      const { config, body } = parseFrontmatter(content);
      return {
        raw: body,
        config,
        source,
        path,
      };
    }
  }

  return null;
}

/**
 * 读取并组合提示词
 *
 * 组合逻辑：prepend + (override ?? builtin) + append
 *
 * @param workflow - Workflow 名称
 * @returns 组合后的提示词，或 null
 */
export async function readPrompt(workflow: string): Promise<string | null> {
  // 尝试读取各部分
  const [systemPrompt, prependPrompt, appendPrompt] = await Promise.all([
    readPromptFile(`${workflow}/system.md`),
    readPromptFile(`${workflow}/prepend.md`),
    readPromptFile(`${workflow}/append.md`),
  ]);

  if (!systemPrompt) {
    return null;
  }

  const parts: string[] = [];

  // prepend（如果存在）
  if (prependPrompt) {
    parts.push(prependPrompt.raw);
  }

  // system（必需）
  parts.push(systemPrompt.raw);

  // append（如果存在）
  if (appendPrompt) {
    parts.push(appendPrompt.raw);
  }

  return parts.join("\n\n");
}

/**
 * 读取并渲染提示词
 *
 * @param workflow - Workflow 名称
 * @param vars - 变量映射
 * @returns 渲染后的提示词，或 null
 */
export async function readAndRenderPrompt(
  workflow: string,
  vars: Record<string, string>,
): Promise<string | null> {
  const systemPrompt = await readPromptFile(`${workflow}/system.md`);

  if (!systemPrompt) {
    return null;
  }

  // 读取组合内容
  const combinedPrompt = await readPrompt(workflow);
  if (!combinedPrompt) {
    return null;
  }

  // 使用 system.md 的配置渲染
  return renderTemplate(combinedPrompt, vars, systemPrompt.config);
}

/**
 * 获取内置变量
 *
 * @returns 内置变量映射
 */
export function getBuiltinVars(): Record<string, string> {
  return {
    DATETIME: new Date().toISOString(),
    CWD: Deno.cwd(),
  };
}

/**
 * 检查提示词是否存在
 *
 * @param workflow - Workflow 名称
 * @returns 是否存在
 */
export async function hasPrompt(workflow: string): Promise<boolean> {
  const prompt = await readPromptFile(`${workflow}/system.md`);
  return prompt !== null;
}

/**
 * 获取提示词来源
 *
 * @param workflow - Workflow 名称
 * @returns 来源，或 null
 */
export async function getPromptSource(
  workflow: string,
): Promise<PromptSource | null> {
  const prompt = await readPromptFile(`${workflow}/system.md`);
  return prompt?.source ?? null;
}
