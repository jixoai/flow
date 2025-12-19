/**
 * Preferences Management
 *
 * 读取和管理用户偏好配置
 *
 * 支持两种配置方式（按优先级）：
 * 1. user/preferences.ts - TypeScript 配置（类型安全，支持动态逻辑）
 * 2. user/preferences.json - JSON 配置（兼容模式）
 *
 * 特性：
 * - 热更新：自动轮询更新配置（大循环 10s，小循环 3s 错误重试）
 * - 优雅降级：加载失败时保留上一次成功的配置
 */

import { join } from "jsr:@std/path";
import { USER_DIR } from "./paths.ts";
import type {
  AgentConfig,
  AgentOptions,
  AiPreferences,
  McpConfig,
  Preferences,
  RetryConfig,
  WorkflowConfig,
} from "./preferences.schema.ts";

// =============================================================================
// Types (re-export from schema)
// =============================================================================

export type {
  AgentConfig,
  AgentOptions,
  AiPreferences,
  McpConfig,
  Preferences,
  RetryConfig,
  WorkflowConfig,
};

// =============================================================================
// Constants
// =============================================================================

const PREFERENCES_TS_PATH = join(USER_DIR, "preferences.ts");
const PREFERENCES_JSON_PATH = join(USER_DIR, "preferences.json");

/** 正常轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 10_000;

/** 错误重试间隔（毫秒） */
const RETRY_INTERVAL_MS = 3_000;

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_PREFERENCES: Preferences = {
  ai: {
    defaultAgent: "claude-code",
    agents: {
      "claude-code": {
        enabled: true,
        model: "claude-sonnet-4-20250514",
        options: {},
      },
      "codex": {
        enabled: true,
        model: "codex-mini",
        options: {},
      },
    },
    fallbackChain: ["claude-code", "codex"],
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryOn: ["timeout", "rate_limit", "server_error", "network_error"],
    },
  },
  workflows: {},
  mcps: {},
};

// =============================================================================
// Internal State
// =============================================================================

let cachedPreferences: Preferences | null = null;
let pollingAbortController: AbortController | null = null;
let isPollingActive = false;

/** 配置变更监听器 */
type PreferencesChangeListener = (prefs: Preferences) => void;
const changeListeners: Set<PreferencesChangeListener> = new Set();

// =============================================================================
// Utilities
// =============================================================================

function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  return result;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

// =============================================================================
// Loading Logic
// =============================================================================

/**
 * 尝试加载 TypeScript 配置文件
 */
async function loadFromTs(): Promise<Preferences | null> {
  try {
    await Deno.stat(PREFERENCES_TS_PATH);
  } catch {
    return null;
  }

  // 使用时间戳强制重新加载模块（绕过 Deno 缓存）
  const url = `file://${PREFERENCES_TS_PATH}?t=${Date.now()}`;
  const module = await import(url);
  return module.default ?? module;
}

/**
 * 尝试加载 JSON 配置文件
 */
async function loadFromJson(): Promise<Preferences | null> {
  try {
    const content = await Deno.readTextFile(PREFERENCES_JSON_PATH);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 加载配置（优先 .ts，然后 .json）
 */
async function loadConfigOnce(): Promise<Preferences> {
  // 优先尝试 TypeScript 配置
  const tsConfig = await loadFromTs();
  if (tsConfig) {
    return deepMerge(DEFAULT_PREFERENCES, tsConfig);
  }

  // 回退到 JSON 配置
  const jsonConfig = await loadFromJson();
  if (jsonConfig) {
    return deepMerge(DEFAULT_PREFERENCES, jsonConfig);
  }

  // 都不存在，使用默认配置
  return { ...DEFAULT_PREFERENCES };
}

/**
 * 通知所有监听器配置已更新
 */
function notifyListeners(prefs: Preferences): void {
  for (const listener of changeListeners) {
    try {
      listener(prefs);
    } catch (e) {
      console.error("[preferences] Listener error:", e);
    }
  }
}

// =============================================================================
// Polling Logic
// =============================================================================

/**
 * 启动配置轮询
 *
 * 轮询逻辑：
 * 1. 尝试加载配置
 * 2. 如果失败，每 3s 重试直到成功（小循环）
 * 3. 成功后等待 10s（大循环）
 * 4. 重复步骤 1
 */
export function startPolling(): void {
  if (isPollingActive) return;

  isPollingActive = true;
  pollingAbortController = new AbortController();
  const signal = pollingAbortController.signal;

  (async () => {
    while (!signal.aborted) {
      // 小循环：尝试加载，失败则每 3s 重试
      while (!signal.aborted) {
        try {
          const newPrefs = await loadConfigOnce();
          const changed = JSON.stringify(cachedPreferences) !==
            JSON.stringify(newPrefs);
          cachedPreferences = newPrefs;

          if (changed) {
            notifyListeners(newPrefs);
          }
          break; // 成功，跳出小循环
        } catch (e) {
          console.error("[preferences] Load failed, retrying in 3s:", e);
          try {
            await sleep(RETRY_INTERVAL_MS, signal);
          } catch {
            return; // aborted
          }
        }
      }

      // 大循环：等待 10s
      try {
        await sleep(POLL_INTERVAL_MS, signal);
      } catch {
        return; // aborted
      }
    }
  })();
}

/**
 * 停止配置轮询
 */
export function stopPolling(): void {
  if (!isPollingActive) return;

  pollingAbortController?.abort();
  pollingAbortController = null;
  isPollingActive = false;
}

/**
 * 检查轮询是否活跃
 */
export function isPolling(): boolean {
  return isPollingActive;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Load preferences from user/preferences.ts or user/preferences.json
 * Merges with defaults, user config takes priority
 */
export async function loadPreferences(
  forceReload = false,
): Promise<Preferences> {
  if (cachedPreferences && !forceReload) {
    return cachedPreferences;
  }

  cachedPreferences = await loadConfigOnce();
  return cachedPreferences;
}

/**
 * Get preferences synchronously (must call loadPreferences first)
 */
export function getPreferences(): Preferences {
  if (!cachedPreferences) {
    throw new Error("Preferences not loaded. Call loadPreferences() first.");
  }
  return cachedPreferences;
}

/**
 * Clear preferences cache (for testing or hot reload)
 */
export function clearPreferencesCache(): void {
  cachedPreferences = null;
}

/**
 * 添加配置变更监听器
 */
export function onPreferencesChange(listener: PreferencesChangeListener): void {
  changeListeners.add(listener);
}

/**
 * 移除配置变更监听器
 */
export function offPreferencesChange(
  listener: PreferencesChangeListener,
): void {
  changeListeners.delete(listener);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the preferred agent for a workflow
 */
export async function getPreferredAgent(
  workflowName?: string,
): Promise<string> {
  const prefs = await loadPreferences();

  // Check workflow-specific config first
  if (workflowName && prefs.workflows?.[workflowName]?.preferredAgent) {
    return prefs.workflows[workflowName].preferredAgent!;
  }

  // Fall back to default agent
  return prefs.ai?.defaultAgent ?? "claude-code";
}

/**
 * Get agent config by name
 */
export async function getAgentConfig(
  agentName: string,
): Promise<AgentConfig | undefined> {
  const prefs = await loadPreferences();
  return prefs.ai?.agents?.[agentName];
}

/**
 * Get the fallback chain of agents
 */
export async function getFallbackChain(): Promise<string[]> {
  const prefs = await loadPreferences();
  return prefs.ai?.fallbackChain ?? ["claude-code", "codex"];
}

/**
 * Get retry config
 */
export async function getRetryConfig(): Promise<{
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryOn: Array<"timeout" | "rate_limit" | "server_error" | "network_error">;
}> {
  const prefs = await loadPreferences();
  const userRetry = prefs.ai?.retry;
  return {
    maxAttempts: userRetry?.maxAttempts ?? 3,
    initialDelayMs: userRetry?.initialDelayMs ?? 1000,
    maxDelayMs: userRetry?.maxDelayMs ?? 30000,
    backoffMultiplier: userRetry?.backoffMultiplier ?? 2,
    retryOn: userRetry?.retryOn ??
      ["timeout", "rate_limit", "server_error", "network_error"],
  };
}

/**
 * Check if an agent is enabled
 */
export async function isAgentEnabled(agentName: string): Promise<boolean> {
  const config = await getAgentConfig(agentName);
  return config?.enabled !== false;
}

/**
 * Get the first available agent from fallback chain
 */
export async function getFirstAvailableAgent(): Promise<string | null> {
  const chain = await getFallbackChain();
  for (const agent of chain) {
    if (await isAgentEnabled(agent)) {
      return agent;
    }
  }
  return null;
}

/**
 * Check if a workflow is disabled
 */
export async function isWorkflowDisabled(
  workflowName: string,
): Promise<boolean> {
  const prefs = await loadPreferences();
  return prefs.workflows?.[workflowName]?.disabled === true;
}

/**
 * Check if an MCP is disabled
 */
export async function isMcpDisabled(mcpName: string): Promise<boolean> {
  const prefs = await loadPreferences();
  return prefs.mcps?.[mcpName]?.disabled === true;
}

/**
 * Get workflow-specific options
 */
export async function getWorkflowOptions(
  workflowName: string,
): Promise<Record<string, unknown>> {
  const prefs = await loadPreferences();
  return prefs.workflows?.[workflowName]?.options || {};
}

/**
 * Get MCP-specific options
 */
export async function getMcpOptions(
  mcpName: string,
): Promise<Record<string, unknown>> {
  const prefs = await loadPreferences();
  return prefs.mcps?.[mcpName]?.options || {};
}

// =============================================================================
// Retry Helper
// =============================================================================

export type RetryableError =
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "network_error";

/**
 * Execute a function with retry logic based on preferences
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  errorType: RetryableError = "network_error",
): Promise<T> {
  const config = await getRetryConfig();

  if (!config.retryOn?.includes(errorType)) {
    return fn();
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < config.maxAttempts - 1) {
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs,
        );
        console.error(
          `[retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

// =============================================================================
// File Path Helpers
// =============================================================================

export const PREFERENCES_TS_FILE_PATH = PREFERENCES_TS_PATH;
export const PREFERENCES_JSON_FILE_PATH = PREFERENCES_JSON_PATH;
export const PREFERENCES_EXAMPLE_PATH = join(
  USER_DIR,
  "preferences.example.json",
);
export const PREFERENCES_SCHEMA_PATH = join(
  USER_DIR,
  "preferences.schema.json",
);

/** @deprecated 使用 PREFERENCES_JSON_FILE_PATH */
export const PREFERENCES_FILE_PATH = PREFERENCES_JSON_PATH;
