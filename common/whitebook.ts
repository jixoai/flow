/**
 * White Book 辅助模块
 *
 * 从白皮书文档中读取内容，用于 AI 提示词等场景
 * 实现"白皮书作为单一可信来源"的架构
 */

import { join } from "jsr:@std/path";
import { exists } from "jsr:@std/fs/exists";
import { ROOT_DIR } from "./paths.ts";

/** 白皮书根目录 */
export const WHITEBOOK_DIR = join(ROOT_DIR, "docs", "white-book");

/**
 * 读取白皮书文档
 * @param relativePath 相对于 white-book 目录的路径，例如 "06-configuration/preferences-api.md"
 * @returns 文档内容，如果不存在返回 null
 */
export async function readWhitebookDoc(
  relativePath: string,
): Promise<string | null> {
  const fullPath = join(WHITEBOOK_DIR, relativePath);

  if (!(await exists(fullPath))) {
    console.warn(`[whitebook] Document not found: ${fullPath}`);
    return null;
  }

  return await Deno.readTextFile(fullPath);
}

/**
 * 从白皮书文档中提取 AI 指令部分
 *
 * 文档中使用特殊标记包围 AI 指令：
 * ```markdown
 * <!-- AI_INSTRUCTIONS_START -->
 * ## AI Instructions
 * ...
 * <!-- AI_INSTRUCTIONS_END -->
 * ```
 *
 * @param relativePath 文档路径
 * @returns AI 指令内容，如果不存在返回 null
 */
export async function extractAiInstructions(
  relativePath: string,
): Promise<string | null> {
  const content = await readWhitebookDoc(relativePath);
  if (!content) return null;

  const startMarker = "<!-- AI_INSTRUCTIONS_START -->";
  const endMarker = "<!-- AI_INSTRUCTIONS_END -->";

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    // 如果没有 AI 指令标记，返回整个文档
    return content;
  }

  return content
    .substring(startIndex + startMarker.length, endIndex)
    .trim();
}

/**
 * 读取白皮书文档作为 AI 提示词
 *
 * 如果文档包含 AI_INSTRUCTIONS 标记，只返回该部分
 * 否则返回整个文档
 *
 * @param relativePath 文档路径
 * @returns 提示词内容
 */
export async function loadWhitebookAsPrompt(
  relativePath: string,
): Promise<string> {
  const instructions = await extractAiInstructions(relativePath);
  if (instructions) return instructions;

  const content = await readWhitebookDoc(relativePath);
  return content ?? "";
}

/**
 * 组合多个白皮书文档作为提示词
 *
 * @param paths 文档路径数组
 * @returns 组合后的提示词
 */
export async function combineWhitebookPrompts(
  paths: string[],
): Promise<string> {
  const contents = await Promise.all(paths.map(loadWhitebookAsPrompt));
  return contents.filter(Boolean).join("\n\n---\n\n");
}
