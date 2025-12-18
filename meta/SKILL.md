# Meta - Workflow & MCP Manager

Meta capabilities for managing workflows and MCP scripts.

## Usage

```bash
deno run -A meta/meta.workflow.ts <command> [options]
```

Or via `meta.mcp.ts`:

```
workflow("meta", ["list"])
workflow("meta", ["create", "--prompt", "..."])
```

## Commands

### list

List all active workflows and MCPs with their dependencies.

```bash
meta list          # Human-readable output
meta list --json   # JSON output
```

### analyze

Analyze dependencies between workflows and MCPs. Shows:

- Dependency tree for each workflow
- Missing dependencies (if any)
- Unused MCPs (not referenced by any workflow)

```bash
meta analyze
```

### archive / unarchive

Archive or restore workflows and MCPs.

```bash
meta archive --name <name> [--type workflow|mcp]
meta unarchive --name <name> [--type workflow|mcp]
```

### create

Create new workflows or MCPs using AI.

```bash
meta create --prompt "A workflow that greets users"
meta create --prompt "An MCP that searches files" --type mcp
```

## Structure

```
meta/
├── meta.workflow.ts     # Meta workflow (uses defineWorkflow)
├── meta.mcp.ts          # MCP providing workflow() tool to main agent
├── SKILL.md             # This file
├── commands/
│   ├── list.ts          # List command
│   ├── analyze.ts       # Analyze command
│   ├── archive.ts       # Archive/unarchive commands
│   └── create.ts        # Create command (AI-powered)
├── lib/
│   ├── scanner.ts       # File scanning utilities
│   └── inventory.ts     # Inventory building
└── prompts/
    ├── create-workflow.md   # Workflow creation template
    └── create-mcp.md        # MCP creation template
```

## API

Export functions for programmatic use:

```typescript
import {
  actionAnalyze,
  actionArchive,
  actionCreate,
  actionList,
} from "./meta/meta.workflow.ts";

// List workflows and MCPs
await actionList();

// Get inventory as JSON
const json = await actionListJson();

// Analyze dependencies
await actionAnalyze();

// Archive a workflow
await actionArchive("old-workflow", "workflow");

// Create new workflow using AI
await actionCreate("A workflow that processes images", "workflow");
```
