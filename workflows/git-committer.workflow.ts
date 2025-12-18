#!/usr/bin/env -S deno run -A --no-config
/**
 * Git Committer Workflow - AI-assisted git commit message generation
 */

import { defineWorkflow } from "./shared/base-workflow.ts";
import { aiResume, createAiQueryBuilder } from "../mcps/ai.mcp.ts";

// =============================================================================
// System Prompt
// =============================================================================

const GIT_COMMITTER_SYSTEM_PROMPT = `You are a Git commit message generator.

## WORKFLOW
1. Analyze changes (git diff)
2. Learn style from history (git log)
3. Generate commit message following project conventions

## COMMIT MESSAGE FORMAT
- Title: 50 chars max, imperative mood
- Body: Detailed explanation of why/what/impact
- Footer: Issue refs, Breaking Changes

## TYPES
feat, fix, refactor, perf, docs, style, test, chore

## RULES
- Never include AI as committer - only humans commit
- Match existing project style
- Be concise but informative
- Ask for confirmation before committing`;

// =============================================================================
// Helper Functions
// =============================================================================

async function runGit(args: string[]): Promise<string> {
  const cmd = new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  return new TextDecoder().decode(output.stdout);
}

// =============================================================================
// Workflow Definition
// =============================================================================

export const workflow = defineWorkflow({
  name: "git-committer",
  description:
    "AI-assisted git commit - analyzes changes and generates commit messages",
  args: {
    files: {
      type: "string",
      alias: "f",
      description: "Comma-separated list of files to commit",
    },
    message: {
      type: "string",
      alias: "m",
      description: "Hint or description for the commit",
    },
    push: {
      type: "boolean",
      description: "Push after committing",
      default: false,
    },
    prompt: { type: "string", alias: "p", description: "Custom AI prompt" },
    resume: { type: "string", alias: "r", description: "Session ID to resume" },
  },
  handler: async (args) => {
    console.error("[git-committer] Analyzing changes...");

    const [status, stagedDiff, unstagedDiff, history, branch] = await Promise
      .all([
        runGit(["status", "--porcelain"]),
        runGit(["diff", "--cached"]),
        runGit(["diff"]),
        runGit(["log", "--oneline", "-10"]),
        runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
      ]);

    if (!status.trim() && !stagedDiff.trim() && !unstagedDiff.trim()) {
      console.log("No changes detected. Working tree clean.");
      return;
    }

    const files = args.files
      ? args.files.split(",").map((f) => f.trim())
      : undefined;

    const context = `
## CURRENT BRANCH
${branch.trim()}

## GIT STATUS
\`\`\`
${status || "(no changes)"}
\`\`\`

## STAGED CHANGES (git diff --cached)
\`\`\`diff
${stagedDiff || "(no staged changes)"}
\`\`\`

## UNSTAGED CHANGES (git diff)
\`\`\`diff
${unstagedDiff || "(no unstaged changes)"}
\`\`\`

## RECENT COMMITS (for style reference)
\`\`\`
${history}
\`\`\`

## USER REQUIREMENTS
${
      files
        ? `- Files to commit: ${files.join(", ")}`
        : "- Files: (user will specify or commit all staged)"
    }
${args.message ? `- User hint: ${args.message}` : ""}
${
      args.push
        ? "- User wants to push after commit"
        : "- Do NOT push unless explicitly asked"
    }
`;

    const prompt = args.prompt ||
      "Analyze the changes and generate an appropriate commit message. Ask for confirmation before committing.";

    if (args.resume) {
      const result = await aiResume({
        sessionId: args.resume,
        prompt: prompt + "\n\n" + context,
      });
      console.log(result.output);
      if (!result.success) Deno.exit(1);
      return;
    }

    const result = await createAiQueryBuilder()
      .prompt(prompt + "\n\n" + context)
      .systemPrompt(GIT_COMMITTER_SYSTEM_PROMPT)
      .allowTools(["Bash", "Read"])
      .disallowTools(["WebSearch", "WebFetch", "Task", "Write"])
      .permissionMode("acceptEdits")
      .cwd(Deno.cwd())
      .executeWithSession();

    console.log(result.output);
    console.error(
      result.success
        ? `\n[git-committer] Done. Cost: $${result.totalCostUsd.toFixed(4)}`
        : `\n[git-committer] Failed: ${result.error}`,
    );
    if (!result.success) Deno.exit(1);
  },
  autoStart: import.meta.main,
});

export { GIT_COMMITTER_SYSTEM_PROMPT };
