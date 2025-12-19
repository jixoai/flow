/**
 * AsyncContext - 基于 AsyncLocalStorage 的异步上下文管理
 *
 * 使用 Node.js AsyncLocalStorage 在整个异步调用链中传递上下文，
 * 无需显式参数传递。
 *
 * 用法：
 * ```typescript
 * // 运行带上下文的代码
 * await PreferencesContext.run(preferences, async () => {
 *   // 在任意嵌套的异步调用中获取当前配置
 *   const prefs = PreferencesContext.current();
 * });
 * ```
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Preferences } from "./preferences.schema.ts";

// =============================================================================
// Generic AsyncContext
// =============================================================================

/**
 * 通用异步上下文包装器
 */
export class AsyncContext<T> {
  private storage: AsyncLocalStorage<T>;
  private name: string;

  constructor(name: string) {
    this.storage = new AsyncLocalStorage<T>();
    this.name = name;
  }

  /**
   * 在指定上下文中运行函数
   */
  run<R>(value: T, fn: () => R): R {
    return this.storage.run(value, fn);
  }

  /**
   * 获取当前上下文值
   * @throws 如果不在上下文中运行则抛出错误
   */
  current(): T {
    const value = this.storage.getStore();
    if (value === undefined) {
      throw new Error(
        `${this.name}: Not running in context. Use ${this.name}.run() to establish context.`,
      );
    }
    return value;
  }

  /**
   * 获取当前上下文值，如果不存在则返回 undefined
   */
  tryGet(): T | undefined {
    return this.storage.getStore();
  }

  /**
   * 获取当前上下文值，如果不存在则返回默认值
   */
  getOrDefault(defaultValue: T): T {
    return this.storage.getStore() ?? defaultValue;
  }

  /**
   * 检查是否在上下文中运行
   */
  isInContext(): boolean {
    return this.storage.getStore() !== undefined;
  }
}

// =============================================================================
// Preferences Context
// =============================================================================

/**
 * 偏好配置的异步上下文
 *
 * 用于在整个调用链中共享当前的偏好配置，无需显式传递。
 *
 * 示例：
 * ```typescript
 * import { PreferencesContext, withPreferences } from "./async-context.ts";
 *
 * // 方式 1: 使用 run
 * await PreferencesContext.run(myPrefs, async () => {
 *   await doSomething();
 * });
 *
 * // 方式 2: 使用 withPreferences helper
 * await withPreferences(async () => {
 *   const prefs = PreferencesContext.current();
 * });
 *
 * // 在任意嵌套函数中获取
 * function getDefaultAgent(): string {
 *   const prefs = PreferencesContext.tryGet();
 *   return prefs?.ai?.defaultAgent ?? "claude-code";
 * }
 * ```
 */
export const PreferencesContext = new AsyncContext<Preferences>(
  "PreferencesContext",
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * 在偏好配置上下文中运行函数
 *
 * 自动加载当前配置并建立上下文
 */
export async function withPreferences<R>(fn: () => R | Promise<R>): Promise<R> {
  // 动态导入避免循环依赖
  const { loadPreferences } = await import("./preferences.ts");
  const prefs = await loadPreferences();
  return PreferencesContext.run(prefs, fn);
}

/**
 * 获取当前上下文中的 AI 配置
 */
export function getCurrentAiConfig() {
  const prefs = PreferencesContext.tryGet();
  return prefs?.ai;
}

/**
 * 获取当前上下文中指定 workflow 的首选 agent
 */
export function getContextPreferredAgent(workflowName?: string): string {
  const prefs = PreferencesContext.tryGet();
  if (!prefs) return "claude-code";

  // 检查 workflow 特定配置
  if (workflowName && prefs.workflows?.[workflowName]?.preferredAgent) {
    return prefs.workflows[workflowName].preferredAgent!;
  }

  // 使用默认 agent
  return prefs.ai?.defaultAgent ?? "claude-code";
}

/**
 * 检查当前上下文中 workflow 是否被禁用
 */
export function isContextWorkflowDisabled(workflowName: string): boolean {
  const prefs = PreferencesContext.tryGet();
  return prefs?.workflows?.[workflowName]?.disabled === true;
}

/**
 * 检查当前上下文中 MCP 是否被禁用
 */
export function isContextMcpDisabled(mcpName: string): boolean {
  const prefs = PreferencesContext.tryGet();
  return prefs?.mcps?.[mcpName]?.disabled === true;
}

/**
 * 获取当前上下文中的 fallback chain
 */
export function getContextFallbackChain(): string[] {
  const prefs = PreferencesContext.tryGet();
  return prefs?.ai?.fallbackChain ?? ["claude-code", "codex"];
}

/**
 * 获取当前上下文中指定 agent 的配置
 */
export function getContextAgentConfig(agentName: string) {
  const prefs = PreferencesContext.tryGet();
  return prefs?.ai?.agents?.[agentName];
}

/**
 * 获取当前上下文中的 retry 配置
 */
export function getContextRetryConfig() {
  const prefs = PreferencesContext.tryGet();
  const retry = prefs?.ai?.retry;
  return {
    maxAttempts: retry?.maxAttempts ?? 3,
    initialDelayMs: retry?.initialDelayMs ?? 1000,
    maxDelayMs: retry?.maxDelayMs ?? 30000,
    backoffMultiplier: retry?.backoffMultiplier ?? 2,
    retryOn: retry?.retryOn ??
      ["timeout", "rate_limit", "server_error", "network_error"],
  };
}

// =============================================================================
// Profile Helpers (for new builder-based config)
// =============================================================================

/**
 * 获取当前上下文中指定 profile 的配置
 */
export function getContextProfile(profileName: string) {
  const prefs = PreferencesContext.tryGet();
  // 支持新的 profiles 结构和旧的 agents 结构
  const profiles = (prefs?.ai as Record<string, unknown>)?.profiles as
    | Record<string, unknown>
    | undefined;
  if (profiles?.[profileName]) {
    return profiles[profileName];
  }
  // 回退到旧的 agents 结构
  return prefs?.ai?.agents?.[profileName];
}

/**
 * 获取当前上下文中的默认 profile chain
 */
export function getContextDefaultProfiles(): string[] {
  const prefs = PreferencesContext.tryGet();
  // 支持新的 default 结构和旧的 fallbackChain 结构
  const ai = prefs?.ai as Record<string, unknown> | undefined;
  if (Array.isArray(ai?.default)) {
    return ai.default as string[];
  }
  return prefs?.ai?.fallbackChain ?? ["claude-code", "codex"];
}
