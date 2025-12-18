#!/usr/bin/env -S deno run -A
/**
 * JixoFlow CLI
 *
 * Usage:
 *   deno run -A jsr:@jixo/flow install              # Install from default repo
 *   deno run -A jsr:@jixo/flow install --source /path/to/local  # Install from local folder
 *   deno run -A jsr:@jixo/flow install --source https://github.com/user/repo.git  # Install from custom git
 *   deno run -A jsr:@jixo/flow update               # Update from saved source
 *   deno run -A jsr:@jixo/flow --help               # Show help
 */

import { parseArgs } from "jsr:@std/cli@^1.0.0/parse-args";
import { resolve } from "jsr:@std/path@^1.0.0";
import denoConfig from "./deno.json" with { type: "json" };

const JIXOHOME = Deno.env.get("JIXOHOME") ||
  `${Deno.env.get("HOME")}/.jixoflow`;
const DEFAULT_REPO_URL = "https://github.com/jixoai/workflow.git";
const SOURCE_CONFIG_FILE = `${JIXOHOME}/.source.json`;
const VERSION = denoConfig.version;

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CliArgs {
  _: string[];
  help: boolean;
  version: boolean;
  source?: string;
}

function parseCliArgs(): CliArgs {
  return parseArgs(Deno.args, {
    boolean: ["help", "version"],
    string: ["source"],
    alias: {
      h: "help",
      v: "version",
      s: "source",
    },
    default: {
      help: false,
      version: false,
    },
  }) as CliArgs;
}

// =============================================================================
// Source Configuration
// =============================================================================

interface SourceConfig {
  type: "git" | "local";
  url: string;
  installedAt: string;
  updatedAt?: string;
}

async function loadSourceConfig(): Promise<SourceConfig | null> {
  try {
    const content = await Deno.readTextFile(SOURCE_CONFIG_FILE);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveSourceConfig(config: SourceConfig): Promise<void> {
  await Deno.writeTextFile(SOURCE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function isGitUrl(source: string): boolean {
  return source.startsWith("https://") ||
    source.startsWith("git@") ||
    source.startsWith("git://") ||
    source.endsWith(".git");
}

function isLocalPath(source: string): boolean {
  return source.startsWith("/") ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith("~");
}

function expandPath(path: string): string {
  // Expand ~ to home directory
  if (path.startsWith("~")) {
    path = path.replace("~", Deno.env.get("HOME") || "");
  }
  return resolve(Deno.cwd(), path);
}

async function run(
  cmd: string[],
): Promise<{ success: boolean; output: string }> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await command.output();
  const output = new TextDecoder().decode(success ? stdout : stderr);
  return { success, output };
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function prompt(message: string): Promise<boolean> {
  const buf = new Uint8Array(1);
  await Deno.stdout.write(new TextEncoder().encode(`${message} (y/N) `));
  await Deno.stdin.read(buf);
  return String.fromCharCode(buf[0]).toLowerCase() === "y";
}

// =============================================================================
// Install Functions
// =============================================================================

async function copyDirectory(
  src: string,
  dest: string,
  exclude: string[] = [],
): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });

  for await (const entry of Deno.readDir(src)) {
    if (exclude.includes(entry.name)) continue;

    const srcPath = `${src}/${entry.name}`;
    const destPath = `${dest}/${entry.name}`;

    if (entry.isDirectory) {
      await copyDirectory(srcPath, destPath, exclude);
    } else if (entry.isFile) {
      await Deno.copyFile(srcPath, destPath);
    }
  }
}

async function installFromGit(
  gitUrl: string,
  isUpdate = false,
): Promise<boolean> {
  if (isUpdate) {
    console.log("Pulling latest changes...");
    const { success, output } = await run(["git", "-C", JIXOHOME, "pull"]);
    if (!success) {
      console.error("Git pull failed:", output);
      return false;
    }
    console.log("Repository updated.");
  } else {
    console.log(`Cloning from ${gitUrl}...`);
    const { success, output } = await run(["git", "clone", gitUrl, JIXOHOME]);
    if (!success) {
      console.error("Git clone failed:", output);
      return false;
    }
    console.log("Repository cloned.");
  }
  return true;
}

async function installFromLocal(
  localPath: string,
  isUpdate = false,
): Promise<boolean> {
  const sourcePath = expandPath(localPath);

  if (!(await exists(sourcePath))) {
    console.error(`Source path does not exist: ${sourcePath}`);
    return false;
  }

  if (isUpdate) {
    console.log(`Updating from ${sourcePath}...`);
    // Remove everything except user directory
    for await (const entry of Deno.readDir(JIXOHOME)) {
      if (entry.name === "user" || entry.name === ".source.json") continue;
      const path = `${JIXOHOME}/${entry.name}`;
      await Deno.remove(path, { recursive: true });
    }
  } else {
    console.log(`Copying from ${sourcePath}...`);
    await Deno.mkdir(JIXOHOME, { recursive: true });
  }

  // Copy files, excluding user directory if updating
  // Always exclude node_modules and deno.lock - they will be regenerated by deno install
  const exclude = isUpdate
    ? ["user", ".git", ".source.json", "node_modules", "deno.lock"]
    : [".git", "node_modules", "deno.lock"];
  await copyDirectory(sourcePath, JIXOHOME, exclude);

  console.log(isUpdate ? "Files updated." : "Files copied.");
  return true;
}

async function install(args: CliArgs) {
  const rawSource = args.source || DEFAULT_REPO_URL;
  const isGit = isGitUrl(rawSource);
  const isLocal = isLocalPath(rawSource);
  // Expand local paths to absolute
  const source = isLocal ? expandPath(rawSource) : rawSource;

  if (!isGit && !isLocal) {
    // Treat as git URL if contains common git hosting domains
    if (
      rawSource.includes("github") || rawSource.includes("gitlab") ||
      rawSource.includes("bitbucket")
    ) {
      // Assume it's a git URL
    } else {
      console.error(`Invalid source: ${rawSource}`);
      console.error("Source must be a git URL or local path.");
      console.error("  Git URL: https://github.com/user/repo.git");
      console.error("  Local:   /path/to/folder or ~/folder or ./folder");
      Deno.exit(1);
    }
  }

  console.log("Installing JixoFlow...\n");
  console.log(`Source: ${source}`);
  console.log(`Target: ${JIXOHOME}\n`);

  // Check if already installed
  if (await exists(JIXOHOME)) {
    console.log(`JixoFlow is already installed at ${JIXOHOME}`);
    if (
      await prompt(
        "Do you want to reinstall? (user directory will be preserved)",
      )
    ) {
      console.log("");
      // This is effectively an update with new source
      const success = isLocal
        ? await installFromLocal(source, true)
        : await installFromGit(source, false); // For git, we need to re-clone with new URL

      if (!success) Deno.exit(1);
    } else {
      console.log("\nInstallation cancelled.");
      Deno.exit(0);
    }
  } else {
    const success = isLocal
      ? await installFromLocal(source)
      : await installFromGit(source);

    if (!success) Deno.exit(1);
  }

  // Save source configuration
  const config: SourceConfig = {
    type: isLocal ? "local" : "git",
    url: source,
    installedAt: new Date().toISOString(),
  };
  await saveSourceConfig(config);

  // Install dependencies before registering CLI
  await installDependencies();

  // Register global CLI
  await registerGlobalCli();
}

async function update() {
  if (!(await exists(JIXOHOME))) {
    console.error("JixoFlow is not installed. Run: jixoflow install");
    Deno.exit(1);
  }

  const config = await loadSourceConfig();
  if (!config) {
    console.error("No source configuration found.");
    console.error("This installation may have been created manually.");
    console.error(
      "Please reinstall with: jixoflow install --source <path-or-url>",
    );
    Deno.exit(1);
  }

  console.log("Updating JixoFlow...\n");
  console.log(`Source: ${config.url} (${config.type})`);
  console.log(`Target: ${JIXOHOME}\n`);

  let success: boolean;
  if (config.type === "local") {
    success = await installFromLocal(config.url, true);
  } else {
    success = await installFromGit(config.url, true);
  }

  if (!success) Deno.exit(1);

  // Update source configuration
  config.updatedAt = new Date().toISOString();
  await saveSourceConfig(config);

  // Install dependencies before registering CLI
  await installDependencies();

  // Re-register global CLI to update the command
  await registerGlobalCli();

  console.log(`
JixoFlow updated successfully!
`);
}

async function installDependencies(): Promise<void> {
  console.log("\nInstalling dependencies...");

  // Run deno install to set up all dependencies with correct peer dependency links
  const { success, output } = await run([
    "sh",
    "-c",
    `cd "${JIXOHOME}" && deno install`,
  ]);

  if (!success) {
    console.error("Warning: Failed to install dependencies:", output);
    // Don't exit, just warn - the CLI might still work
  }
}

async function registerGlobalCli(): Promise<void> {
  console.log("\nRegistering global CLI...");
  const entrypoint = `${JIXOHOME}/cli.ts`;
  const { success, output } = await run([
    "deno",
    "install",
    "-g",
    "-A",
    "--name",
    "jixoflow",
    "--force",
    entrypoint,
  ]);

  if (success) {
    console.log(`
JixoFlow installed successfully!

You can now use:
  jixoflow --help
`);
  } else {
    console.error("Failed to register global CLI:", output);
    Deno.exit(1);
  }
}

async function showSource() {
  const config = await loadSourceConfig();
  if (config) {
    console.log(`Type: ${config.type}`);
    console.log(`URL: ${config.url}`);
    console.log(`Installed: ${config.installedAt}`);
    if (config.updatedAt) {
      console.log(`Updated: ${config.updatedAt}`);
    }
  } else {
    console.log("No source configuration found.");
  }
}

function showHelp() {
  console.log(`
JixoFlow - Composable workflow framework for AI Agents

Usage:
  jixoflow <command> [options]

Commands:
  install [-s|--source <url|path>]  Install JixoFlow (default: official repo)
  update                            Update from saved source
  run <name> [args...]              Run a workflow by name
  list                              List available workflows
  env                               Show JIXOHOME directory
  source                            Show installation source
  mcp [args...]                     Start meta MCP server
  help                              Show this help message

Options:
  -h, --help                        Show this help message
  -v, --version                     Show version number
  -s, --source <url|path>           Source for install (git URL or local path)

Environment:
  JIXOHOME    Installation directory (default: ~/.jixoflow)

Examples:
  # Install from official repository
  deno run -A jsr:@jixo/flow install

  # Install from custom git repository
  jixoflow install --source https://github.com/myorg/myflow.git

  # Install from local folder (for development)
  jixoflow install --source /path/to/local/jixoflow
  jixoflow install --source ~/Dev/jixoflow

  # Update from saved source
  jixoflow update

  # Run workflows
  jixoflow run coder --prompt "Fix the bug"
  jixoflow list
`);
}

async function listWorkflows() {
  if (!(await exists(JIXOHOME))) {
    console.error(
      "JixoFlow is not installed. Run: deno run -A jsr:@jixo/flow install",
    );
    Deno.exit(1);
  }

  const workflowsDir = `${JIXOHOME}/workflows`;
  console.log("Available workflows:\n");
  for await (const entry of Deno.readDir(workflowsDir)) {
    if (entry.name.endsWith(".workflow.ts")) {
      const name = entry.name.replace(".workflow.ts", "");
      console.log(`  - ${name}`);
    }
  }
}

function showEnv() {
  console.log(`JIXOHOME=${JIXOHOME}`);
}

async function startMcp(args: string[]) {
  if (!(await exists(JIXOHOME))) {
    console.error(
      "JixoFlow is not installed. Run: deno run -A jsr:@jixo/flow install",
    );
    Deno.exit(1);
  }

  const mcpPath = `${JIXOHOME}/meta/meta.mcp.ts`;
  const command = new Deno.Command("deno", {
    args: ["run", "-A", mcpPath, ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await command.output();
  Deno.exit(code);
}

async function runWorkflow(name: string, args: string[]) {
  if (!(await exists(JIXOHOME))) {
    console.error(
      "JixoFlow is not installed. Run: deno run -A jsr:@jixo/flow install",
    );
    Deno.exit(1);
  }

  const workflowPath = `${JIXOHOME}/workflows/${name}.workflow.ts`;
  if (!(await exists(workflowPath))) {
    console.error(`Workflow "${name}" not found.`);
    console.log("Run 'jixoflow list' to see available workflows.");
    Deno.exit(1);
  }

  const command = new Deno.Command("deno", {
    args: ["run", "-A", workflowPath, ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await command.output();
  Deno.exit(code);
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  const args = parseCliArgs();
  const command = args._[0] as string | undefined;

  // Handle global flags
  if (args.version) {
    console.log(`jixoflow ${VERSION}`);
    return;
  }
  if (args.help && !command) {
    showHelp();
    return;
  }

  switch (command) {
    case "install":
      await install(args);
      break;
    case "update":
      await update();
      break;
    case "run": {
      const workflowName = args._[1] as string | undefined;
      if (!workflowName) {
        console.error("Usage: jixoflow run <workflow-name> [options]");
        Deno.exit(1);
      }
      // Pass remaining args to workflow (everything after 'run <name>')
      const workflowArgs = Deno.args.slice(Deno.args.indexOf(workflowName) + 1);
      await runWorkflow(workflowName, workflowArgs);
      break;
    }
    case "list":
      await listWorkflows();
      break;
    case "env":
      showEnv();
      break;
    case "source":
      await showSource();
      break;
    case "mcp": {
      // Pass remaining args to mcp (everything after 'mcp')
      const mcpArgs = Deno.args.slice(Deno.args.indexOf("mcp") + 1);
      await startMcp(mcpArgs);
      break;
    }
    case "help":
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      Deno.exit(1);
  }
}

main();
