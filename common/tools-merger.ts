/**
 * Tools Merger
 *
 * 合并工具配置，支持追加模式和 ! 前缀删除语法
 *
 * @example
 * ```ts
 * const base = ["Read", "Write", "Edit", "Bash"];
 * const overrides = ["CustomTool", "!Bash"];
 * const result = mergeTools(base, overrides);
 * // => ["Read", "Write", "Edit", "CustomTool"]
 * ```
 */

/**
 * 合并工具列表
 *
 * @param base - 基础工具列表
 * @param overrides - 覆盖配置，支持 ! 前缀删除
 * @returns 合并后的工具列表
 */
export function mergeTools(base: string[], overrides: string[]): string[] {
  const result = [...base];

  for (const item of overrides) {
    if (item.startsWith("!")) {
      // 移除工具
      const name = item.slice(1);
      const idx = result.indexOf(name);
      if (idx >= 0) {
        result.splice(idx, 1);
      }
    } else {
      // 追加工具（去重）
      if (!result.includes(item)) {
        result.push(item);
      }
    }
  }

  return result;
}

/**
 * 解析工具配置字符串
 *
 * 支持格式：
 * - "ToolName" - 添加工具
 * - "!ToolName" - 移除工具
 *
 * @param config - 工具配置字符串
 * @returns 解析结果
 */
export function parseToolConfig(config: string): {
  action: "add" | "remove";
  name: string;
} {
  if (config.startsWith("!")) {
    return { action: "remove", name: config.slice(1) };
  }
  return { action: "add", name: config };
}

/**
 * 合并 allow 和 disallow 配置
 *
 * @param baseAllow - 基础允许列表
 * @param baseDisallow - 基础禁用列表
 * @param config - 用户配置
 * @returns 合并后的配置
 */
export function mergeToolsConfig(
  baseAllow: string[],
  baseDisallow: string[],
  config?: {
    allow?: string[];
    disallow?: string[];
  },
): {
  allow: string[];
  disallow: string[];
} {
  if (!config) {
    return { allow: baseAllow, disallow: baseDisallow };
  }

  return {
    allow: mergeTools(baseAllow, config.allow ?? []),
    disallow: mergeTools(baseDisallow, config.disallow ?? []),
  };
}
