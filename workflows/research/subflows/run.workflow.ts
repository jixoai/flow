/**
 * Research Run Subflow - Execute research task with AI
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { defineWorkflow } from "../../shared/base-workflow.ts";
import { getMcpServerConfigs, getResearchDir } from "../../../common/paths.ts";
import { aiResume, createAiQueryBuilder } from "../../../mcps/ai.mcp.ts";
import { ensureReportDir, generateReportId } from "../helpers.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../prompts");

async function loadSystemPrompt(): Promise<string> {
  return await Deno.readTextFile(join(PROMPTS_DIR, "system.md"));
}

export const workflow = defineWorkflow({
  name: "run",
  description: "Execute a research task with AI",
  args: {
    prompt: {
      type: "string",
      alias: "p",
      description: "Research task",
      required: true,
    },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    const RESEARCH_BASE_DIR = getResearchDir();
    console.error("[research:run] Starting...");
    console.error(`[research:run] Output: ${RESEARCH_BASE_DIR}`);

    await Deno.mkdir(RESEARCH_BASE_DIR, { recursive: true });
    const systemPrompt = await loadSystemPrompt();

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: args.prompt,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const reportId = generateReportId(
      args.prompt.split(" ").slice(0, 3).join(" "),
    );
    const reportDir = await ensureReportDir(reportId);

    const mcpServers = await getMcpServerConfigs(
      "search-duckduckgo",
      "html2md",
    );
    const result = await createAiQueryBuilder()
      .prompt(
        `${args.prompt}\n\nCONTEXT:\n- Report directory: ${reportDir}\n- Write final report to: ${reportDir}/MAIN.md`,
      )
      .systemPrompt(systemPrompt)
      .mcpServers(mcpServers)
      .allowTools([
        "Read",
        "Write",
        "Glob",
        "Grep",
        "Bash",
        "mcp__search-duckduckgo__search_duckduckgo",
        "mcp__html2md__html_to_markdown",
      ])
      .disallowTools(["WebSearch", "WebFetch", "Task"])
      .permissionMode("bypassPermissions")
      .cwd(RESEARCH_BASE_DIR)
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[research:run] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[research:run] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
});
