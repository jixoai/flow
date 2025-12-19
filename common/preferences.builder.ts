/**
 * Preferences Builder
 *
 * 类似 vite.config.ts 的配置方式，支持链式调用和强类型推导
 *
 * 内置 Profiles:
 * - "claude-code": Claude Code Agent SDK (默认空配置)
 * - "codex": Codex Agent SDK (默认空配置)
 *
 * 默认 Fallback Chain: 按 profile 定义顺序，内置为 ["claude-code", "codex"]
 *
 * @example 使用默认配置（无需任何设置）
 * ```ts
 * export default definePreferences((ctx, p) => p.build());
 * // 等效于: profiles = { "claude-code": {}, "codex": {} }, default = ["claude-code", "codex"]
 * ```
 *
 * @example 自定义 profile
 * ```ts
 * export default definePreferences((ctx, p) =>
 *   p
 *     .ai((ai) => ai
 *       .profile("claude-code", (p) => p.useClaudeCodeAgentSdk({ tier: "opus" }))
 *       .profile("codex", (p) => p.useCodexAgent({ reasoningEffort: "high" }))
 *       // 无需 .default()，自动按定义顺序: ["claude-code", "codex"]
 *     )
 *     .workflow("git-committer", (w) => w.preferredAgent("codex"))
 *     .build()
 * );
 * ```
 */

import type { Preferences } from "./preferences.schema.ts";
import type {
  Options as ClaudeAgentSdkOptions,
  PermissionMode as ClaudePermissionMode,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  ModelReasoningEffort,
  ThreadOptions as CodexThreadOptions,
} from "@openai/codex-sdk";

// =============================================================================
// Re-export SDK Types
// =============================================================================

export type { ClaudeAgentSdkOptions, ClaudePermissionMode };
export type { CodexThreadOptions, ModelReasoningEffort };

// =============================================================================
// Types
// =============================================================================

/** 重试错误类型 */
type RetryErrorType =
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "network_error";

// =============================================================================
// Claude Code Agent SDK Options (subset for preferences)
// =============================================================================

/**
 * Claude Code Agent SDK 选项
 * 直接使用 SDK 的 Options 类型子集
 */
export type ClaudeCodeAgentSdkOptions = Pick<
  ClaudeAgentSdkOptions,
  "model" | "permissionMode" | "maxThinkingTokens" | "maxTurns" | "maxBudgetUsd"
>;

// =============================================================================
// Codex Agent SDK Options (subset for preferences)
// =============================================================================

/**
 * Codex Agent SDK 选项
 * 直接使用 SDK 的 ThreadOptions 类型子集
 */
export type CodexAgentOptions = Pick<
  CodexThreadOptions,
  | "model"
  | "modelReasoningEffort"
  | "sandboxMode"
  | "networkAccessEnabled"
  | "webSearchEnabled"
>;

// =============================================================================
// Retry Options
// =============================================================================

export interface RetryOptions {
  /** 最大重试次数 */
  maxAttempts?: number;
  /** 初始延迟（毫秒） */
  initialDelayMs?: number;
  /** 最大延迟（毫秒） */
  maxDelayMs?: number;
  /** 退避乘数 */
  backoffMultiplier?: number;
  /** 触发重试的错误类型 */
  retryOn?: RetryErrorType[];
}

// =============================================================================
// Profile Builder
// =============================================================================

/**
 * Profile 构建器
 * 用于配置单个 AI profile
 */
class ProfileBuilder<
  T extends {
    sdk?: string;
    options?: Record<string, unknown>;
    retry?: RetryOptions;
  } = Record<string, never>,
> {
  private _data: T;

  constructor(data: T = {} as T) {
    this._data = data;
  }

  /**
   * 使用 Claude Code Agent SDK
   */
  useClaudeCodeAgentSdk<O extends ClaudeCodeAgentSdkOptions>(
    options?: O,
  ): ProfileBuilder<
    T & {
      sdk: "claude-code-agent-sdk";
      options: O extends undefined ? Record<string, never> : O;
    }
  > {
    return new ProfileBuilder({
      ...this._data,
      sdk: "claude-code-agent-sdk",
      options: options ?? {},
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /**
   * 使用 Codex Agent SDK
   */
  useCodexAgent<O extends CodexAgentOptions>(
    options?: O,
  ): ProfileBuilder<
    T & {
      sdk: "codex-agent-sdk";
      options: O extends undefined ? Record<string, never> : O;
    }
  > {
    return new ProfileBuilder({
      ...this._data,
      sdk: "codex-agent-sdk",
      options: options ?? {},
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /**
   * 配置 profile 级别的重试策略
   */
  retry<R extends RetryOptions>(options: R): ProfileBuilder<T & { retry: R }> {
    return new ProfileBuilder({
      ...this._data,
      retry: options,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /** @internal */
  _build(): T {
    return this._data;
  }
}

// =============================================================================
// AI Builder
// =============================================================================

/** 内置 profile 名称 */
type BuiltinProfileNames = "claude-code" | "codex";

/**
 * AI 配置构建器
 * 管理 AI profiles 和默认 fallback 链
 *
 * 内置两个 profile: "claude-code" 和 "codex"
 * 默认 fallback chain 按 profile 定义顺序生成
 */
class AiBuilder<
  ProfileNames extends string = BuiltinProfileNames,
  T extends {
    profiles?: Record<string, unknown>;
    default?: string[];
    retry?: RetryOptions;
  } = Record<string, never>,
> {
  private _data: T;
  private _profileOrder: string[];

  constructor(data: T = {} as T, profileOrder: string[] = []) {
    this._data = data;
    this._profileOrder = profileOrder;
  }

  /**
   * 定义一个 AI profile
   * 可覆盖内置的 "claude-code" 或 "codex"，也可定义新 profile
   * @param name - profile 名称
   * @param configurator - profile 配置函数
   */
  profile<Name extends string, R extends Record<string, unknown>>(
    name: Name,
    configurator: (builder: ProfileBuilder) => ProfileBuilder<R>,
  ): AiBuilder<
    ProfileNames | Name,
    T & {
      profiles:
        & (T["profiles"] extends object ? T["profiles"]
          : Record<string, never>)
        & {
          [K in Name]: R;
        };
    }
  > {
    const profileBuilder = configurator(new ProfileBuilder());
    const currentProfiles =
      (this._data as { profiles?: Record<string, unknown> }).profiles ?? {};

    // 更新 profile 顺序（如果是新 profile 则追加，否则保持原位置）
    const newOrder = this._profileOrder.includes(name)
      ? this._profileOrder
      : [...this._profileOrder, name];

    return new AiBuilder(
      {
        ...this._data,
        profiles: { ...currentProfiles, [name]: profileBuilder._build() },
        // deno-lint-ignore no-explicit-any
      } as any,
      newOrder,
    );
  }

  /**
   * 设置默认 fallback 链
   * 如果不调用此方法，将按 profile 定义顺序自动生成
   * @param profileNames - profile 名称列表，按优先级排序
   */
  default<V extends ProfileNames[]>(
    ...profileNames: V
  ): AiBuilder<ProfileNames, T & { default: V }> {
    return new AiBuilder(
      {
        ...this._data,
        default: profileNames,
        // deno-lint-ignore no-explicit-any
      } as any,
      this._profileOrder,
    );
  }

  /**
   * 配置全局重试策略
   */
  retry<R extends RetryOptions>(
    options: R,
  ): AiBuilder<ProfileNames, T & { retry: R }> {
    return new AiBuilder(
      {
        ...this._data,
        retry: options,
        // deno-lint-ignore no-explicit-any
      } as any,
      this._profileOrder,
    );
  }

  /** @internal */
  _build(): T & { default?: string[] } {
    const data = this._data as T & { default?: string[] };
    // 如果没有显式设置 default，则按 profile 定义顺序生成
    if (!data.default && this._profileOrder.length > 0) {
      return { ...data, default: this._profileOrder };
    }
    return data;
  }

  /** @internal */
  _getProfileOrder(): string[] {
    return this._profileOrder;
  }
}

// =============================================================================
// Workflow Builder
// =============================================================================

/**
 * Workflow 配置构建器
 */
class WorkflowBuilder<
  ProfileNames extends string = BuiltinProfileNames,
  T extends {
    preferredAgent?: string;
    disabled?: boolean;
    options?: Record<string, unknown>;
  } = Record<string, never>,
> {
  private _data: T;

  constructor(data: T = {} as T) {
    this._data = data;
  }

  /**
   * 指定此 workflow 使用的 AI profile
   */
  preferredAgent<V extends ProfileNames>(
    value: V,
  ): WorkflowBuilder<ProfileNames, T & { preferredAgent: V }> {
    return new WorkflowBuilder({
      ...this._data,
      preferredAgent: value,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /**
   * 禁用此 workflow
   */
  disabled<V extends boolean>(
    value: V,
  ): WorkflowBuilder<ProfileNames, T & { disabled: V }> {
    return new WorkflowBuilder({
      ...this._data,
      disabled: value,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /**
   * 自定义选项
   */
  options<R extends Record<string, unknown>>(
    value: R,
  ): WorkflowBuilder<ProfileNames, T & { options: R }> {
    return new WorkflowBuilder({
      ...this._data,
      options: value,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /** @internal */
  _build(): T {
    return this._data;
  }
}

// =============================================================================
// MCP Builder
// =============================================================================

/**
 * MCP 配置构建器
 */
class McpBuilder<
  ProfileNames extends string = BuiltinProfileNames,
  T extends {
    preferredAgent?: string;
    disabled?: boolean;
    options?: Record<string, unknown>;
  } = Record<string, never>,
> {
  private _data: T;

  constructor(data: T = {} as T) {
    this._data = data;
  }

  /**
   * 指定此 MCP 使用的 AI profile
   */
  preferredAgent<V extends ProfileNames>(
    value: V,
  ): McpBuilder<ProfileNames, T & { preferredAgent: V }> {
    return new McpBuilder({
      ...this._data,
      preferredAgent: value,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /**
   * 禁用此 MCP
   */
  disabled<V extends boolean>(
    value: V,
  ): McpBuilder<ProfileNames, T & { disabled: V }> {
    return new McpBuilder({
      ...this._data,
      disabled: value,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /**
   * 自定义选项
   */
  options<R extends Record<string, unknown>>(
    value: R,
  ): McpBuilder<ProfileNames, T & { options: R }> {
    return new McpBuilder({
      ...this._data,
      options: value,
      // deno-lint-ignore no-explicit-any
    } as any);
  }

  /** @internal */
  _build(): T {
    return this._data;
  }
}

// =============================================================================
// Agent Weight System
// =============================================================================

/** 权重环境变量名 */
const WEIGHT_ENV_KEYS = {
  claudeCode: "JIXOFLOW_CLAUDECODE_WEIGHT",
  codex: "JIXOFLOW_CODEX_WEIGHT",
} as const;

/** 检测环境变量名 */
const DETECT_ENV_KEYS = {
  claudeCode: "CLAUDECODE",
  codex: "CODEX_SANDBOX",
} as const;

/** 是否已初始化权重 */
let _weightsInitialized = false;

/**
 * 获取当前权重
 */
function getAgentWeight(agent: "claude-code" | "codex"): number {
  const key = agent === "claude-code"
    ? WEIGHT_ENV_KEYS.claudeCode
    : WEIGHT_ENV_KEYS.codex;
  const value = Deno.env.get(key);
  return value ? parseInt(value, 10) || 0 : 0;
}

/**
 * 增加权重并写入环境变量
 */
function incrementAgentWeight(agent: "claude-code" | "codex"): void {
  const key = agent === "claude-code"
    ? WEIGHT_ENV_KEYS.claudeCode
    : WEIGHT_ENV_KEYS.codex;
  const current = getAgentWeight(agent);
  Deno.env.set(key, String(current + 1));
}

/**
 * 初始化 Agent 权重
 *
 * 在进程初始化时调用，检测当前运行环境并增加相应权重：
 * - 如果 CLAUDECODE 为 truthy 值，增加 claude-code 权重
 * - 如果存在 CODEX_SANDBOX，增加 codex 权重
 *
 * 权重会写入环境变量，子进程会继承这些权重
 */
export function initAgentWeights(): void {
  if (_weightsInitialized) return;
  _weightsInitialized = true;

  // 检测 Claude Code 环境（任何 truthy 值都算）
  if (Deno.env.get(DETECT_ENV_KEYS.claudeCode)) {
    incrementAgentWeight("claude-code");
  }

  // 检测 Codex 环境（只要存在该变量即可）
  if (Deno.env.get(DETECT_ENV_KEYS.codex) !== undefined) {
    incrementAgentWeight("codex");
  }
}

/**
 * 根据权重获取排序后的内置 profiles 顺序
 */
export function getWeightedDefaultOrder(): [
  "claude-code" | "codex",
  "claude-code" | "codex",
] {
  const claudeWeight = getAgentWeight("claude-code");
  const codexWeight = getAgentWeight("codex");

  // 权重高的排前面，相同时保持 claude-code 在前（历史兼容）
  if (codexWeight > claudeWeight) {
    return ["codex", "claude-code"];
  }
  return ["claude-code", "codex"];
}

/**
 * 获取指定 agent 的当前权重（用于调试）
 */
export { getAgentWeight };

/**
 * 重置权重初始化状态（仅用于测试）
 */
export function _resetWeightsForTesting(): void {
  _weightsInitialized = false;
  Deno.env.delete(WEIGHT_ENV_KEYS.claudeCode);
  Deno.env.delete(WEIGHT_ENV_KEYS.codex);
}

// 模块加载时自动初始化权重
initAgentWeights();

// =============================================================================
// Preferences Builder
// =============================================================================

/**
 * 获取默认 AI 配置（根据权重动态生成）
 */
function getDefaultAiConfig() {
  const order = getWeightedDefaultOrder();
  return {
    profiles: {
      "claude-code": { sdk: "claude-code-agent-sdk", options: {} },
      "codex": { sdk: "codex-agent-sdk", options: {} },
    },
    default: order,
  };
}

/**
 * Preferences 构建器
 */
class PreferencesBuilder<
  ProfileNames extends string = BuiltinProfileNames,
  T extends {
    ai?: Record<string, unknown>;
    workflows?: Record<string, unknown>;
    mcps?: Record<string, unknown>;
  } = Record<string, never>,
> {
  private _data: T;
  private _hasAiConfig: boolean;

  constructor(data: T = {} as T, hasAiConfig = false) {
    this._data = data;
    this._hasAiConfig = hasAiConfig;
  }

  /**
   * 配置 AI profiles 和默认 fallback
   * 如果不调用此方法，将使用内置的 claude-code 和 codex profiles
   */
  ai<Names extends string, R extends Record<string, unknown>>(
    configurator: (builder: AiBuilder) => AiBuilder<Names, R>,
  ): PreferencesBuilder<Names | BuiltinProfileNames, T & { ai: R }> {
    const aiBuilder = configurator(
      new AiBuilder({} as Record<string, never>, ["claude-code", "codex"]),
    );
    return new PreferencesBuilder(
      {
        ...this._data,
        ai: aiBuilder._build(),
        // deno-lint-ignore no-explicit-any
      } as any,
      true,
    );
  }

  /**
   * 配置 workflow
   * workflow 的 preferredAgent 必须引用已定义的 profile（包括内置的 claude-code/codex）
   */
  workflow<Name extends string, R extends Record<string, unknown>>(
    name: Name,
    configurator: (
      builder: WorkflowBuilder<ProfileNames>,
    ) => WorkflowBuilder<ProfileNames, R>,
  ): PreferencesBuilder<
    ProfileNames,
    T & {
      workflows:
        & (T["workflows"] extends object ? T["workflows"]
          : Record<string, never>)
        & {
          [K in Name]: R;
        };
    }
  > {
    const workflowBuilder = configurator(new WorkflowBuilder());
    const currentWorkflows = this._data.workflows ?? {};
    return new PreferencesBuilder(
      {
        ...this._data,
        workflows: {
          ...currentWorkflows,
          [name]: workflowBuilder._build(),
        },
        // deno-lint-ignore no-explicit-any
      } as any,
      this._hasAiConfig,
    );
  }

  /**
   * 配置 MCP
   * MCP 的 preferredAgent 必须引用已定义的 profile（包括内置的 claude-code/codex）
   */
  mcp<Name extends string, R extends Record<string, unknown>>(
    name: Name,
    configurator: (
      builder: McpBuilder<ProfileNames>,
    ) => McpBuilder<ProfileNames, R>,
  ): PreferencesBuilder<
    ProfileNames,
    T & {
      mcps:
        & (T["mcps"] extends object ? T["mcps"] : Record<string, never>)
        & {
          [K in Name]: R;
        };
    }
  > {
    const mcpBuilder = configurator(new McpBuilder());
    const currentMcps = this._data.mcps ?? {};
    return new PreferencesBuilder(
      {
        ...this._data,
        mcps: { ...currentMcps, [name]: mcpBuilder._build() },
        // deno-lint-ignore no-explicit-any
      } as any,
      this._hasAiConfig,
    );
  }

  /**
   * 构建最终配置
   * 如果没有显式配置 AI，将使用内置的 claude-code 和 codex profiles
   * 默认顺序根据环境权重动态决定
   */
  build(): Preferences {
    // 如果没有显式配置 AI，使用默认配置（根据权重排序）
    if (!this._hasAiConfig) {
      return {
        ...this._data,
        ai: getDefaultAiConfig(),
      } as unknown as Preferences;
    }
    return this._data as unknown as Preferences;
  }
}

// =============================================================================
// Context
// =============================================================================

/**
 * 配置上下文，提供环境信息
 */
export interface PreferencesContext {
  /** 当前环境 */
  env: {
    /** 是否为开发环境 */
    isDev: boolean;
    /** 是否为生产环境 */
    isProd: boolean;
    /** 环境名称 */
    name: string;
    /** 获取环境变量 */
    get: (key: string) => string | undefined;
  };
  /** 平台信息 */
  platform: {
    /** 操作系统 */
    os: string;
    /** 是否为 macOS */
    isMac: boolean;
    /** 是否为 Linux */
    isLinux: boolean;
    /** 是否为 Windows */
    isWindows: boolean;
  };
}

function createContext(): PreferencesContext {
  const envName = Deno.env.get("ENV") ?? Deno.env.get("NODE_ENV") ??
    "development";
  const os = Deno.build.os;

  return {
    env: {
      isDev: envName === "development",
      isProd: envName === "production",
      name: envName,
      get: (key: string) => Deno.env.get(key),
    },
    platform: {
      os,
      isMac: os === "darwin",
      isLinux: os === "linux",
      isWindows: os === "windows",
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * 创建 Preferences 配置
 *
 * @example 基础用法
 * ```ts
 * export default definePreferences((ctx, p) =>
 *   p
 *     .ai((ai) => ai
 *       .profile("claude", (p) => p.useClaudeCodeAgentSdk({ tier: "sonnet" }))
 *       .profile("codex", (p) => p.useCodexAgent({ reasoningEffort: "high" }))
 *       .default("claude", "codex")
 *     )
 *     .workflow("git-committer", (w) => w.preferredAgent("codex"))
 *     .build()
 * );
 * ```
 *
 * @example 空配置（使用用户全局设置）
 * ```ts
 * export default definePreferences((ctx, p) => p.build());
 * ```
 *
 * @example 只配置 AI，不指定模型版本
 * ```ts
 * export default definePreferences((ctx, p) =>
 *   p
 *     .ai((ai) => ai
 *       .profile("fast", (p) => p.useClaudeCodeAgentSdk({ tier: "haiku" }))
 *       .profile("smart", (p) => p.useClaudeCodeAgentSdk({ tier: "opus" }))
 *       .default("smart", "fast")
 *     )
 *     .build()
 * );
 * ```
 */
export function definePreferences(
  configurator: (
    ctx: PreferencesContext,
    builder: PreferencesBuilder,
  ) => Preferences,
): Preferences {
  const ctx = createContext();
  const builder = new PreferencesBuilder();
  return configurator(ctx, builder);
}

// Re-export for advanced usage
export {
  AiBuilder,
  McpBuilder,
  PreferencesBuilder,
  ProfileBuilder,
  WorkflowBuilder,
};
