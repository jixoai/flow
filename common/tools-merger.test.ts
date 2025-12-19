/**
 * Tools Merger 测试
 */

import { assertEquals } from "jsr:@std/assert";
import {
  mergeTools,
  mergeToolsConfig,
  parseToolConfig,
} from "./tools-merger.ts";

// =============================================================================
// mergeTools
// =============================================================================

Deno.test("mergeTools", async (t) => {
  await t.step("追加新工具", () => {
    const base = ["Read", "Write"];
    const overrides = ["CustomTool"];
    const result = mergeTools(base, overrides);
    assertEquals(result, ["Read", "Write", "CustomTool"]);
  });

  await t.step("追加时去重", () => {
    const base = ["Read", "Write"];
    const overrides = ["Read", "CustomTool"];
    const result = mergeTools(base, overrides);
    assertEquals(result, ["Read", "Write", "CustomTool"]);
  });

  await t.step("使用 ! 前缀移除工具", () => {
    const base = ["Read", "Write", "Bash"];
    const overrides = ["!Bash"];
    const result = mergeTools(base, overrides);
    assertEquals(result, ["Read", "Write"]);
  });

  await t.step("移除不存在的工具不报错", () => {
    const base = ["Read", "Write"];
    const overrides = ["!NonExistent"];
    const result = mergeTools(base, overrides);
    assertEquals(result, ["Read", "Write"]);
  });

  await t.step("同时添加和移除", () => {
    const base = ["Read", "Write", "Bash", "Edit"];
    const overrides = ["CustomTool", "!Bash", "AnotherTool", "!Edit"];
    const result = mergeTools(base, overrides);
    assertEquals(result, ["Read", "Write", "CustomTool", "AnotherTool"]);
  });

  await t.step("空 overrides 返回原数组副本", () => {
    const base = ["Read", "Write"];
    const result = mergeTools(base, []);
    assertEquals(result, ["Read", "Write"]);
    // 确保是副本
    result.push("New");
    assertEquals(base, ["Read", "Write"]);
  });

  await t.step("空 base", () => {
    const result = mergeTools([], ["Tool1", "Tool2"]);
    assertEquals(result, ["Tool1", "Tool2"]);
  });

  await t.step("处理顺序正确", () => {
    // 先移除再添加同名工具
    const base = ["Read", "Write"];
    const overrides = ["!Read", "Read"];
    const result = mergeTools(base, overrides);
    // !Read 移除后，Read 再次添加到末尾
    assertEquals(result, ["Write", "Read"]);
  });
});

// =============================================================================
// parseToolConfig
// =============================================================================

Deno.test("parseToolConfig", async (t) => {
  await t.step("解析添加操作", () => {
    const result = parseToolConfig("CustomTool");
    assertEquals(result, { action: "add", name: "CustomTool" });
  });

  await t.step("解析移除操作", () => {
    const result = parseToolConfig("!Bash");
    assertEquals(result, { action: "remove", name: "Bash" });
  });

  await t.step("处理多个 ! 只识别第一个", () => {
    const result = parseToolConfig("!!Tool");
    assertEquals(result, { action: "remove", name: "!Tool" });
  });
});

// =============================================================================
// mergeToolsConfig
// =============================================================================

Deno.test("mergeToolsConfig", async (t) => {
  const baseAllow = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];
  const baseDisallow = ["WebSearch", "WebFetch"];

  await t.step("无配置返回原始值", () => {
    const result = mergeToolsConfig(baseAllow, baseDisallow);
    assertEquals(result.allow, baseAllow);
    assertEquals(result.disallow, baseDisallow);
  });

  await t.step("空配置返回原始值", () => {
    const result = mergeToolsConfig(baseAllow, baseDisallow, {});
    assertEquals(result.allow, baseAllow);
    assertEquals(result.disallow, baseDisallow);
  });

  await t.step("合并 allow 配置", () => {
    const result = mergeToolsConfig(baseAllow, baseDisallow, {
      allow: ["CustomTool", "!Bash"],
    });
    assertEquals(
      result.allow,
      ["Read", "Write", "Edit", "Glob", "Grep", "CustomTool"],
    );
    assertEquals(result.disallow, baseDisallow);
  });

  await t.step("合并 disallow 配置", () => {
    const result = mergeToolsConfig(baseAllow, baseDisallow, {
      disallow: ["!WebSearch", "Task"],
    });
    assertEquals(result.allow, baseAllow);
    assertEquals(result.disallow, ["WebFetch", "Task"]);
  });

  await t.step("同时合并 allow 和 disallow", () => {
    const result = mergeToolsConfig(baseAllow, baseDisallow, {
      allow: ["CustomTool", "!Bash"],
      disallow: ["!WebSearch", "Task"],
    });
    assertEquals(
      result.allow,
      ["Read", "Write", "Edit", "Glob", "Grep", "CustomTool"],
    );
    assertEquals(result.disallow, ["WebFetch", "Task"]);
  });
});

// =============================================================================
// 实际使用场景
// =============================================================================

Deno.test("实际使用场景", async (t) => {
  await t.step("coder workflow 配置", () => {
    // coder 默认配置
    const baseAllow = [
      "Read",
      "Write",
      "Edit",
      "MultiEdit",
      "Glob",
      "Grep",
      "Bash",
      "Task",
    ];
    const baseDisallow = ["WebSearch", "WebFetch"];

    // 用户配置：添加 CustomLint，移除 Task
    const userConfig = {
      allow: ["CustomLint", "!Task"],
      disallow: [],
    };

    const result = mergeToolsConfig(baseAllow, baseDisallow, userConfig);
    assertEquals(
      result.allow,
      [
        "Read",
        "Write",
        "Edit",
        "MultiEdit",
        "Glob",
        "Grep",
        "Bash",
        "CustomLint",
      ],
    );
  });

  await t.step("research workflow 配置", () => {
    // research 默认配置
    const baseAllow = ["Read", "Write", "Glob", "Grep", "Bash"];
    const baseDisallow = ["WebSearch", "WebFetch", "Task"];

    // 用户配置：允许 WebSearch（从 disallow 移除）
    const userConfig = {
      allow: [],
      disallow: ["!WebSearch"],
    };

    const result = mergeToolsConfig(baseAllow, baseDisallow, userConfig);
    assertEquals(result.allow, baseAllow);
    assertEquals(result.disallow, ["WebFetch", "Task"]);
  });

  await t.step("git-committer workflow 配置", () => {
    // git-committer 默认配置
    const baseAllow = ["Bash", "Read"];
    const baseDisallow = ["WebSearch", "WebFetch", "Task", "Write"];

    // 用户配置：允许 Write（从 disallow 移除），禁用 Bash
    const userConfig = {
      allow: ["!Bash"],
      disallow: ["!Write"],
    };

    const result = mergeToolsConfig(baseAllow, baseDisallow, userConfig);
    assertEquals(result.allow, ["Read"]);
    assertEquals(result.disallow, ["WebSearch", "WebFetch", "Task"]);
  });
});
