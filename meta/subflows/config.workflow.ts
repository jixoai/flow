/**
 * Config Subflow - Manage preferences configuration
 *
 * Usage:
 *   meta config              Show current preferences
 *   meta config init         Initialize preferences.ts from example
 *   meta config edit -p ...  Edit preferences with AI assistance
 */

import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
import { exists } from "jsr:@std/fs/exists";
import {
  loadPreferences,
  PREFERENCES_JSON_FILE_PATH,
  PREFERENCES_TS_FILE_PATH,
} from "../../common/preferences.ts";
import { USER_DIR } from "../../common/paths.ts";
import { join } from "jsr:@std/path";

const PREFERENCES_TS_EXAMPLE_PATH = join(USER_DIR, "preferences.example.ts");

// =============================================================================
// Actions
// =============================================================================

/**
 * Show current preferences configuration
 */
async function actionShow(): Promise<void> {
  const prefs = await loadPreferences(true);

  // Check which config file is being used
  const hasTsConfig = await exists(PREFERENCES_TS_FILE_PATH);
  const hasJsonConfig = await exists(PREFERENCES_JSON_FILE_PATH);

  console.log("## Preferences Configuration\n");

  if (hasTsConfig) {
    console.log(
      `**Config file**: \`${PREFERENCES_TS_FILE_PATH}\` (TypeScript)`,
    );
  } else if (hasJsonConfig) {
    console.log(
      `**Config file**: \`${PREFERENCES_JSON_FILE_PATH}\` (JSON, legacy)`,
    );
  } else {
    console.log("**Config file**: Using defaults (no user config found)");
  }

  console.log("\n### AI Settings\n");
  console.log(
    `- Default Agent: \`${prefs.ai?.defaultAgent ?? "claude-code"}\``,
  );
  console.log(
    `- Fallback Chain: ${
      prefs.ai?.fallbackChain?.join(" → ") ?? "claude-code → codex"
    }`,
  );

  if (prefs.ai?.agents) {
    console.log("\n### Agent Configurations\n");
    for (const [name, config] of Object.entries(prefs.ai.agents)) {
      const status = config.enabled !== false ? "✓" : "✗";
      console.log(
        `- ${status} **${name}**: model=\`${config.model ?? "default"}\``,
      );
    }
  }

  if (prefs.workflows && Object.keys(prefs.workflows).length > 0) {
    console.log("\n### Workflow Overrides\n");
    for (const [name, config] of Object.entries(prefs.workflows)) {
      const parts: string[] = [];
      if (config.preferredAgent) parts.push(`agent=${config.preferredAgent}`);
      if (config.disabled) parts.push("disabled");
      console.log(`- **${name}**: ${parts.join(", ") || "(no overrides)"}`);
    }
  }

  if (prefs.mcps && Object.keys(prefs.mcps).length > 0) {
    console.log("\n### MCP Overrides\n");
    for (const [name, config] of Object.entries(prefs.mcps)) {
      const parts: string[] = [];
      if (config.disabled) parts.push("disabled");
      console.log(`- **${name}**: ${parts.join(", ") || "(no overrides)"}`);
    }
  }

  console.log("\n---");
  console.log("Run `meta config init` to create preferences.ts from example.");
  console.log(
    "Run `meta config edit -p <prompt>` to modify with AI assistance.",
  );
}

/**
 * Initialize preferences.ts from example
 */
async function actionInit(force = false): Promise<void> {
  const targetPath = PREFERENCES_TS_FILE_PATH;

  // Check if already exists
  if (await exists(targetPath)) {
    if (!force) {
      console.log(`preferences.ts already exists at: ${targetPath}`);
      console.log("Use --force to overwrite.");
      return;
    }
    console.log("Overwriting existing preferences.ts...");
  }

  // Check for example file
  if (!(await exists(PREFERENCES_TS_EXAMPLE_PATH))) {
    console.error(`Example file not found: ${PREFERENCES_TS_EXAMPLE_PATH}`);
    Deno.exit(1);
  }

  // Copy example to target
  const content = await Deno.readTextFile(PREFERENCES_TS_EXAMPLE_PATH);
  await Deno.writeTextFile(targetPath, content);

  console.log(`Created: ${targetPath}`);
  console.log("\nEdit this file to customize your preferences.");
  console.log("Changes will be auto-detected within 10 seconds.");
}

/**
 * Edit preferences with AI assistance
 */
async function actionEdit(prompt: string): Promise<void> {
  // Lazy import to avoid circular dependencies
  const { createAiQueryBuilder } = await import("../../mcps/ai.mcp.ts");
  const { getMcpServerConfigs } = await import("../../common/paths.ts");

  // Ensure preferences.ts exists
  if (!(await exists(PREFERENCES_TS_FILE_PATH))) {
    console.log("No preferences.ts found. Initializing from example...\n");
    await actionInit();
  }

  const currentContent = await Deno.readTextFile(PREFERENCES_TS_FILE_PATH);

  const systemPrompt = `You are helping the user configure JixoFlow preferences.

## Current preferences.ts

\`\`\`typescript
${currentContent}
\`\`\`

## Preferences Schema

The Preferences interface supports:
- \`ai.defaultAgent\`: Default AI agent ("claude-code" | "codex")
- \`ai.agents.<name>\`: Agent config { enabled, model, options }
- \`ai.fallbackChain\`: Array of agent names for fallback
- \`ai.retry\`: Retry config { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, retryOn }
- \`workflows.<name>\`: Workflow config { preferredAgent, disabled, options }
- \`mcps.<name>\`: MCP config { disabled, options }

## Instructions

1. Understand what the user wants to change
2. Modify the preferences.ts file accordingly
3. Use proper TypeScript syntax with \`satisfies Preferences\`
4. Keep the file well-formatted and commented

The file is at: ${PREFERENCES_TS_FILE_PATH}`;

  const mcpServers = await getMcpServerConfigs("user-proxy");

  const result = await createAiQueryBuilder()
    .prompt(prompt)
    .systemPrompt(systemPrompt)
    .mcpServers(mcpServers)
    .allowTools(["Read", "Write", "Edit", "mcp__user-proxy__*"])
    .permissionMode("acceptEdits")
    .executeWithSession();

  console.log("\n" + result.output);
}

/**
 * Get preferences as JSON
 */
async function actionJson(): Promise<string> {
  const prefs = await loadPreferences(true);
  return JSON.stringify(prefs, null, 2);
}

// =============================================================================
// Workflow Definition
// =============================================================================

export const workflow = defineWorkflow({
  name: "config",
  description: "Manage preferences configuration",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Prompt for AI-assisted editing",
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Force overwrite existing config",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  handler: async (args, _ctx) => {
    const command = args._[0] as string | undefined;

    switch (command) {
      case "init":
        await actionInit(args.force);
        break;
      case "edit":
        if (!args.prompt) {
          console.error("Error: --prompt (-p) is required for edit command");
          console.log(
            "Usage: meta config edit -p 'Change default agent to codex'",
          );
          Deno.exit(1);
        }
        await actionEdit(args.prompt);
        break;
      default:
        if (args.json) {
          console.log(await actionJson());
        } else {
          await actionShow();
        }
    }
  },
});

// =============================================================================
// Exports
// =============================================================================

export { actionEdit, actionInit, actionJson, actionShow };
