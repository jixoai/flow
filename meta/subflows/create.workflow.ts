/**
 * Create Subflow - Create workflows and MCPs using AI
 *
 * Mode: 混合 (编程入口 + AI 执行)
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
import {
  MCPS_DIR,
  ROOT_DIR,
  USER_MCPS_DIR,
  USER_WORKFLOWS_DIR,
  WORKFLOWS_DIR,
} from "../../common/paths.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

export type CreateType = "workflow" | "mcp";
export type WorkflowMode = "ai" | "programmatic" | "multi" | "orchestration";

async function loadPromptTemplate(type: CreateType): Promise<string> {
  const file = type === "workflow" ? "create-workflow.md" : "create-mcp.md";
  const path = join(PROMPTS_DIR, file);
  try {
    return await Deno.readTextFile(path);
  } catch {
    return "";
  }
}

async function checkBuiltinExists(
  name: string,
  type: CreateType,
): Promise<boolean> {
  const builtinDir = type === "workflow" ? WORKFLOWS_DIR : MCPS_DIR;
  const suffix = type === "workflow" ? ".workflow.ts" : ".mcp.ts";
  const filePath = join(builtinDir, `${name}${suffix}`);
  try {
    await Deno.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkUserExists(
  name: string,
  type: CreateType,
): Promise<boolean> {
  const userDir = type === "workflow" ? USER_WORKFLOWS_DIR : USER_MCPS_DIR;
  const suffix = type === "workflow" ? ".workflow.ts" : ".mcp.ts";
  const filePath = join(userDir, `${name}${suffix}`);
  try {
    await Deno.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildSystemPrompt(
  type: CreateType,
  targetDir: string,
  template: string,
  mode?: WorkflowMode,
  overrideTarget?: string,
): string {
  const typeLabel = type === "workflow" ? "workflow" : "MCP server";

  let modeGuidance = "";
  if (type === "workflow" && mode) {
    const modeDescriptions: Record<WorkflowMode, string> = {
      ai: `
## AI 驱动模式
- 使用 createAiQueryBuilder() 构建 AI 查询
- 定义 systemPrompt 指导 AI 行为
- 配置 MCP servers 提供工具
- 支持 --resume 会话恢复`,
      programmatic: `
## 编程驱动模式
- 使用 subflows 组织子流程
- handler 中实现确定性逻辑
- 通过 ctx.getSubflow() 编排执行
- 无需 AI，纯程序控制`,
      multi: `
## 多模式
- 支持直接命令（编程）和 --prompt（AI）两种入口
- 导出编程 API 供其他模块调用
- handler 中根据参数判断使用哪种模式`,
      orchestration: `
## 编排模式
- 使用 subflows 包含多个子流程
- handler 中通过 ctx.getSubflow() 获取并执行
- 可以是顺序、并行或条件执行
- 适合流水线和多步骤任务`,
    };
    modeGuidance = modeDescriptions[mode];
  }

  const overrideNote = overrideTarget
    ? `\n\n## Override Mode\nYou are overriding the builtin "${overrideTarget}" ${typeLabel}. Create a customized version in the user directory.`
    : "";

  return `You are creating a new ${typeLabel} file.

## Context
- Target directory: ${targetDir}
- Base directory: ${ROOT_DIR}
- Type: ${type}
${mode ? `- Mode: ${mode}` : ""}${overrideNote}

${template ? `## Template Reference\n\n${template}` : ""}
${modeGuidance}

## Instructions

1. Create the ${typeLabel} file based on the user's requirements
2. Follow existing patterns in the codebase
3. Use imports from common/paths.ts where appropriate
4. For workflows: use defineWorkflow from workflows/shared/base-workflow.ts
5. For MCPs: use patterns from mcps/shared/base-mcp.ts

## Key Points

- Export \`workflow\` (for workflows) or server setup (for MCPs)
- Add proper JSDoc description at the top
- Include proper error handling
- Write actual code, not placeholders
- Follow the coding conventions in CLAUDE.md

## Output

After creating, provide:
1. File path created
2. Brief description of what was created
3. Usage example`;
}

async function actionCreate(
  prompt: string,
  type: CreateType = "workflow",
  mode?: WorkflowMode,
  override?: string,
): Promise<void> {
  const { createAiQueryBuilder } = await import("../../mcps/ai.mcp.ts");

  const template = await loadPromptTemplate(type);
  const typeLabel = type === "workflow" ? "workflow" : "MCP server";

  // Determine target directory and override behavior
  let targetDir: string;
  let overrideTarget: string | undefined;

  if (override) {
    // --override specified: create in user directory
    targetDir = type === "workflow" ? USER_WORKFLOWS_DIR : USER_MCPS_DIR;

    // Check if target exists in user directory
    if (await checkUserExists(override, type)) {
      overrideTarget = override;
      console.error(`[create] Overriding user ${typeLabel}: ${override}`);
    } else if (await checkBuiltinExists(override, type)) {
      overrideTarget = override;
      console.error(`[create] Overriding builtin ${typeLabel}: ${override}`);
    } else {
      console.error(
        `[create] Warning: "${override}" not found in user or builtin, creating new in user directory`,
      );
    }
  } else {
    // Default: create in user directory
    targetDir = type === "workflow" ? USER_WORKFLOWS_DIR : USER_MCPS_DIR;
  }

  const systemPrompt = buildSystemPrompt(
    type,
    targetDir,
    template,
    mode,
    overrideTarget,
  );

  console.error(
    `[create] Creating ${typeLabel}${
      mode ? ` (${mode} mode)` : ""
    } in ${targetDir}...`,
  );
  console.error(`[create] Prompt: ${prompt}\n`);

  const result = await createAiQueryBuilder()
    .prompt(`Create a ${typeLabel}: ${prompt}`)
    .systemPrompt(systemPrompt)
    .allowTools(["Read", "Write", "Glob", "Grep"])
    .permissionMode("bypassPermissions")
    .cwd(ROOT_DIR)
    .execute();

  console.log(result.output);

  if (!result.success) {
    console.error(`\n[create] Failed: ${result.error}`);
    Deno.exit(1);
  }
}

export const workflow = defineWorkflow({
  name: "create",
  description: "Create new workflow or MCP using AI (default: user directory)",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Creation prompt",
      required: true,
    },
    type: {
      type: "string",
      alias: "t",
      description: "Type: workflow or mcp",
      default: "workflow",
    },
    mode: {
      type: "string",
      alias: "m",
      description: "Workflow mode: ai, programmatic, multi, orchestration",
    },
    override: {
      type: "string",
      alias: "o",
      description:
        "Override existing workflow/mcp by name (creates in user dir)",
    },
  },
  examples: [
    [
      "create -p 'A workflow that cleans up temp files'",
      "Create workflow in user/workflows/",
    ],
    ["create -p 'Research agent' -m ai", "Create AI-driven workflow"],
    [
      "create -p 'Customize coder behavior' --override coder",
      "Override builtin coder workflow",
    ],
    [
      "create -p 'Custom memory storage' -t mcp --override memory",
      "Override builtin memory MCP",
    ],
    ["create -p 'A DuckDuckGo search MCP' -t mcp", "Create MCP in user/mcps/"],
  ],
  handler: async (args) => {
    await actionCreate(
      args.prompt,
      args.type as CreateType,
      args.mode as WorkflowMode | undefined,
      args.override as string | undefined,
    );
  },
});

export { actionCreate };
