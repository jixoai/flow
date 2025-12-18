/**
 * Multi-Source Scanner - Unified directory scanning and merging
 *
 * Supports multiple source directories with priority-based merging.
 * Higher priority sources override lower priority ones when names conflict.
 *
 * Priority order (highest to lowest):
 *   project > user > custom > builtin > archived
 */

import { basename, join } from "jsr:@std/path";

// =============================================================================
// Types
// =============================================================================

/** Source type identifier */
export type SourceType = "project" | "user" | "custom" | "builtin" | "archived";

/** Priority map - higher number = higher priority */
const SOURCE_PRIORITY: Record<SourceType, number> = {
  project: 100,
  user: 80,
  custom: 60,
  builtin: 40,
  archived: 0,
};

/** A directory source to scan */
export interface ScanSource {
  /** Source type identifier */
  type: SourceType;
  /** Directory path to scan */
  directory: string;
  /** Optional custom priority (overrides default) */
  priority?: number;
  /** Whether this source is enabled */
  enabled?: boolean;
}

/** Result of scanning a single file */
export interface ScannedItem {
  /** Item name (without suffix) */
  name: string;
  /** Full file path */
  path: string;
  /** Source type */
  source: SourceType;
  /** Source priority */
  priority: number;
  /** File name with extension */
  filename: string;
}

/** Merged result after deduplication */
export interface MergedItem extends ScannedItem {
  /** Whether this item overrides another source */
  overrides?: SourceType;
}

/** Options for scanning */
export interface ScanOptions {
  /** File suffix to match (e.g., ".workflow.ts") */
  suffix: string;
  /** Sources to scan (in any order, will be sorted by priority) */
  sources: ScanSource[];
}

/** Result of scan and merge operation */
export interface ScanMergeResult<T extends MergedItem = MergedItem> {
  /** All items (deduplicated, highest priority wins) */
  items: T[];
  /** Items grouped by source type */
  bySource: Record<SourceType, T[]>;
  /** Items that were overridden */
  overridden: Array<{ item: ScannedItem; by: T }>;
  /** Statistics */
  stats: {
    total: number;
    bySource: Record<SourceType, number>;
    overriddenCount: number;
  };
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Scan a single directory for files matching the suffix
 */
export async function scanDirectory(
  dir: string,
  suffix: string,
): Promise<string[]> {
  const files: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(suffix)) {
        files.push(join(dir, entry.name));
      }
    }
  } catch {
    // Directory may not exist - return empty
  }
  return files;
}

/**
 * Scan a single source and return ScannedItems
 */
export async function scanSource(
  source: ScanSource,
  suffix: string,
): Promise<ScannedItem[]> {
  if (source.enabled === false) {
    return [];
  }

  const files = await scanDirectory(source.directory, suffix);
  const priority = source.priority ?? SOURCE_PRIORITY[source.type];

  return files.map((path) => {
    const filename = basename(path);
    const name = basename(path, suffix);
    return {
      name,
      path,
      source: source.type,
      priority,
      filename,
    };
  });
}

/**
 * Scan multiple sources and merge results by priority
 * Higher priority sources override lower priority ones
 */
export async function scanAndMerge(
  options: ScanOptions,
): Promise<ScanMergeResult> {
  const { suffix, sources } = options;

  // Scan all sources
  const allItems: ScannedItem[] = [];
  for (const source of sources) {
    const items = await scanSource(source, suffix);
    allItems.push(...items);
  }

  // Sort by priority (descending) then by name
  allItems.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return b.priority - a.priority;
  });

  // Merge: keep highest priority for each name
  const merged = new Map<string, MergedItem>();
  const overridden: Array<{ item: ScannedItem; by: MergedItem }> = [];

  for (const item of allItems) {
    const existing = merged.get(item.name);
    if (!existing) {
      merged.set(item.name, { ...item });
    } else if (item.priority > existing.priority) {
      // New item has higher priority, it overrides existing
      overridden.push({
        item: existing,
        by: { ...item, overrides: existing.source },
      });
      merged.set(item.name, { ...item, overrides: existing.source });
    } else {
      // Existing has higher or equal priority, new item is overridden
      const winner = merged.get(item.name)!;
      // Update winner to mark it overrides this lower priority source
      if (!winner.overrides) {
        winner.overrides = item.source;
        merged.set(item.name, winner);
      }
      overridden.push({ item, by: winner });
    }
  }

  // Build result
  const items = Array.from(merged.values());
  const bySource: Record<SourceType, MergedItem[]> = {
    project: [],
    user: [],
    custom: [],
    builtin: [],
    archived: [],
  };

  for (const item of items) {
    bySource[item.source].push(item);
  }

  const stats = {
    total: items.length,
    bySource: {
      project: bySource.project.length,
      user: bySource.user.length,
      custom: bySource.custom.length,
      builtin: bySource.builtin.length,
      archived: bySource.archived.length,
    },
    overriddenCount: overridden.length,
  };

  return { items, bySource, overridden, stats };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a ScanSource configuration
 */
export function createSource(
  type: SourceType,
  directory: string,
  options?: { priority?: number; enabled?: boolean },
): ScanSource {
  return {
    type,
    directory,
    ...options,
  };
}

/**
 * Create standard sources for workflow/mcp scanning
 */
export function createStandardSources(
  dirs: {
    builtin: string;
    user?: string;
    project?: string;
    archived?: string;
    custom?: Array<{ directory: string; priority?: number }>;
  },
): ScanSource[] {
  const sources: ScanSource[] = [];

  // Add in priority order (will be sorted anyway, but clearer)
  if (dirs.project) {
    sources.push(createSource("project", dirs.project));
  }

  if (dirs.user) {
    sources.push(createSource("user", dirs.user));
  }

  if (dirs.custom) {
    for (const c of dirs.custom) {
      sources.push(
        createSource("custom", c.directory, { priority: c.priority }),
      );
    }
  }

  sources.push(createSource("builtin", dirs.builtin));

  if (dirs.archived) {
    sources.push(createSource("archived", dirs.archived));
  }

  return sources;
}

/**
 * Get only active (non-archived) items from scan result
 */
export function getActiveItems<T extends MergedItem>(
  result: ScanMergeResult<T>,
): T[] {
  return result.items.filter((item) => item.source !== "archived");
}

/**
 * Find an item by name
 */
export function findByName<T extends MergedItem>(
  result: ScanMergeResult<T>,
  name: string,
): T | undefined {
  return result.items.find((item) => item.name === name);
}

/**
 * Check if a name exists in a specific source
 */
export function existsInSource<T extends MergedItem>(
  result: ScanMergeResult<T>,
  name: string,
  source: SourceType,
): boolean {
  return result.overridden.some(
    (o) => o.item.name === name && o.item.source === source,
  ) || result.items.some(
    (i) => i.name === name && i.source === source,
  );
}
