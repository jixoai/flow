#!/usr/bin/env -S deno run -A
/**
 * JixoFlow Publish Script
 *
 * Bumps version in deno.json and package.json, then publishes to JSR and npm.
 *
 * Usage:
 *   deno run -A scripts/pub.ts [patch|minor|major|x.y.z]
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const DENO_JSON = "deno.json";
const PACKAGE_JSON = "package.json";

interface JsonConfig {
  version: string;
  [key: string]: unknown;
}

async function readJson(path: string): Promise<JsonConfig> {
  const content = await Deno.readTextFile(path);
  return JSON.parse(content);
}

async function writeJson(path: string, data: JsonConfig): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2) + "\n");
}

function bumpVersion(
  current: string,
  type: "patch" | "minor" | "major",
): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

async function prompt(message: string): Promise<string> {
  const buf = new Uint8Array(1024);
  await Deno.stdout.write(new TextEncoder().encode(message));
  const n = await Deno.stdin.read(buf);
  return new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
}

async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} (y/N) `);
  return answer.toLowerCase() === "y";
}

async function run(cmd: string[]): Promise<boolean> {
  console.log(`\n$ ${cmd.join(" ")}`);
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await command.output();
  return code === 0;
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "dry-run"],
    alias: { h: "help", n: "dry-run" },
  });

  if (args.help) {
    console.log(`
JixoFlow Publish Script

Usage:
  deno run -A scripts/pub.ts [options] [version]

Arguments:
  version    Version bump type or explicit version
             - current: Keep current version (republish)
             - patch: 0.1.0 -> 0.1.1
             - minor: 0.1.0 -> 0.2.0
             - major: 0.1.0 -> 1.0.0
             - x.y.z: Set explicit version

Options:
  -h, --help     Show this help
  -n, --dry-run  Show what would be done without making changes
`);
    return;
  }

  const dryRun = args["dry-run"];
  const versionArg = args._[0] as string | undefined;

  // Read current versions
  const denoJson = await readJson(DENO_JSON);
  const packageJson = await readJson(PACKAGE_JSON);
  const currentVersion = denoJson.version;

  console.log(`Current version: ${currentVersion}`);

  // Determine new version
  let newVersion: string;
  if (!versionArg) {
    console.log("\nVersion bump options:");
    console.log(`  0. current -> ${currentVersion} (republish)`);
    console.log(`  1. patch -> ${bumpVersion(currentVersion, "patch")}`);
    console.log(`  2. minor -> ${bumpVersion(currentVersion, "minor")}`);
    console.log(`  3. major -> ${bumpVersion(currentVersion, "major")}`);
    console.log("  4. Enter custom version");

    const choice = await prompt("\nSelect option (0-4): ");
    switch (choice) {
      case "0":
        newVersion = currentVersion;
        break;
      case "1":
        newVersion = bumpVersion(currentVersion, "patch");
        break;
      case "2":
        newVersion = bumpVersion(currentVersion, "minor");
        break;
      case "3":
        newVersion = bumpVersion(currentVersion, "major");
        break;
      case "4": {
        const custom = await prompt("Enter version (x.y.z): ");
        if (!isValidVersion(custom)) {
          console.error("Invalid version format. Use x.y.z");
          Deno.exit(1);
        }
        newVersion = custom;
        break;
      }
      default:
        console.error("Invalid choice");
        Deno.exit(1);
    }
  } else if (versionArg === "current") {
    newVersion = currentVersion;
  } else if (["patch", "minor", "major"].includes(versionArg)) {
    newVersion = bumpVersion(
      currentVersion,
      versionArg as "patch" | "minor" | "major",
    );
  } else if (isValidVersion(versionArg)) {
    newVersion = versionArg;
  } else {
    console.error(`Invalid version: ${versionArg}`);
    console.error("Use: current, patch, minor, major, or x.y.z");
    Deno.exit(1);
  }

  const isCurrentVersion = newVersion === currentVersion;
  console.log(
    `\nVersion: ${newVersion}${isCurrentVersion ? " (no change)" : ""}`,
  );

  if (dryRun) {
    console.log("\n[DRY RUN] Would perform the following:");
    if (!isCurrentVersion) {
      console.log(`  - Update ${DENO_JSON} version to ${newVersion}`);
      console.log(`  - Update ${PACKAGE_JSON} version to ${newVersion}`);
    }
    console.log("  - Run: deno publish");
    console.log("  - Run: npm publish --access public");
    return;
  }

  if (!(await confirm("\nProceed with publish?"))) {
    console.log("Cancelled.");
    return;
  }

  // Update versions (skip if current)
  if (!isCurrentVersion) {
    console.log("\nUpdating version files...");
    denoJson.version = newVersion;
    packageJson.version = newVersion;
    await writeJson(DENO_JSON, denoJson);
    await writeJson(PACKAGE_JSON, packageJson);
    console.log(`  Updated ${DENO_JSON}`);
    console.log(`  Updated ${PACKAGE_JSON}`);
  }

  // Run format and publish-level checks
  console.log("\nRunning checks...");
  if (!(await run(["deno", "fmt"]))) {
    console.error("Format failed");
    Deno.exit(1);
  }
  if (!(await run(["deno", "publish", "--dry-run", "--allow-dirty"]))) {
    console.error("Publish check failed");
    Deno.exit(1);
  }

  // Publish to JSR
  console.log("\nPublishing to JSR...");
  if (!(await run(["deno", "publish", "--allow-dirty"]))) {
    console.error("JSR publish failed");
    Deno.exit(1);
  }

  // Publish to npm
  console.log("\nPublishing to npm...");
  if (!(await run(["npm", "publish", "--access", "public"]))) {
    console.error("npm publish failed");
    Deno.exit(1);
  }

  // Git commit and tag
  if (await confirm("\nCreate git commit and tag?")) {
    await run(["git", "add", DENO_JSON, PACKAGE_JSON]);
    await run(["git", "commit", "-m", `chore: release v${newVersion}`]);
    await run(["git", "tag", `v${newVersion}`]);

    if (await confirm("Push to remote?")) {
      await run(["git", "push"]);
      await run(["git", "push", "--tags"]);
    }
  }

  console.log(`\n✅ Successfully published v${newVersion}`);
}

main();
