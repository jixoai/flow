/**
 * Prompt Loader 测试
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  getBuiltinVars,
  readPrompt,
  readPromptFile,
  renderTemplate,
} from "./prompt-loader.ts";

// =============================================================================
// renderTemplate
// =============================================================================

Deno.test("renderTemplate", async (t) => {
  await t.step("渲染简单变量", () => {
    const template = "Hello, {{NAME}}!";
    const result = renderTemplate(template, { NAME: "World" });
    assertEquals(result, "Hello, World!");
  });

  await t.step("渲染多个变量", () => {
    const template = "{{GREETING}}, {{NAME}}! Welcome to {{PLACE}}.";
    const result = renderTemplate(template, {
      GREETING: "Hello",
      NAME: "User",
      PLACE: "JixoFlow",
    });
    assertEquals(result, "Hello, User! Welcome to JixoFlow.");
  });

  await t.step("未定义变量返回空字符串", () => {
    const template = "Hello, {{NAME}}!";
    const result = renderTemplate(template, {});
    assertEquals(result, "Hello, !");
  });

  await t.step("处理空格", () => {
    const template = "Hello, {{ NAME }}!";
    const result = renderTemplate(template, { NAME: "World" });
    assertEquals(result, "Hello, World!");
  });

  await t.step("使用自定义前后缀", () => {
    const template = "Hello, <%NAME%>!";
    const result = renderTemplate(
      template,
      { NAME: "World" },
      { PREFIX: "<%", SUFFIX: "%>" },
    );
    assertEquals(result, "Hello, World!");
  });

  await t.step("使用别名", () => {
    const template = "{{R}} is great!";
    const result = renderTemplate(
      template,
      { RULES: "TypeScript" },
      { ALIAS: { R: "RULES" } },
    );
    assertEquals(result, "TypeScript is great!");
  });

  await t.step("别名优先于直接变量", () => {
    const template = "{{R}}";
    const result = renderTemplate(
      template,
      { R: "Direct", RULES: "Aliased" },
      { ALIAS: { R: "RULES" } },
    );
    assertEquals(result, "Aliased");
  });

  await t.step("保留无法解析的占位符为空", () => {
    const template = "{{KNOWN}} and {{UNKNOWN}}";
    const result = renderTemplate(template, { KNOWN: "Yes" });
    assertEquals(result, "Yes and ");
  });

  await t.step("处理特殊正则字符", () => {
    const template = "Value: ${VALUE}$";
    const result = renderTemplate(
      template,
      { VALUE: "123" },
      { PREFIX: "${", SUFFIX: "}$" },
    );
    assertEquals(result, "Value: 123");
  });

  await t.step("多行模板", () => {
    const template = `# Title
    
{{CONTENT}}

## Footer

{{SIGNATURE}}`;
    const result = renderTemplate(template, {
      CONTENT: "Main content here",
      SIGNATURE: "-- JixoFlow",
    });
    assertEquals(
      result,
      `# Title
    
Main content here

## Footer

-- JixoFlow`,
    );
  });
});

// =============================================================================
// getBuiltinVars
// =============================================================================

Deno.test("getBuiltinVars", async (t) => {
  await t.step("包含 DATETIME", () => {
    const vars = getBuiltinVars();
    assertExists(vars.DATETIME);
    // 验证是 ISO 格式
    const date = new Date(vars.DATETIME);
    assertEquals(isNaN(date.getTime()), false);
  });

  await t.step("包含 CWD", () => {
    const vars = getBuiltinVars();
    assertExists(vars.CWD);
    assertEquals(vars.CWD, Deno.cwd());
  });
});

// =============================================================================
// readPromptFile
// =============================================================================

Deno.test("readPromptFile", async (t) => {
  await t.step("读取内置 coder prompt", async () => {
    const prompt = await readPromptFile("coder/system.md");
    assertExists(prompt);
    assertEquals(prompt.source, "builtin");
    assertEquals(prompt.raw.includes("Coder"), true);
  });

  await t.step("读取内置 research prompt", async () => {
    const prompt = await readPromptFile("research/system.md");
    assertExists(prompt);
    assertEquals(prompt.source, "builtin");
    assertEquals(prompt.raw.includes("Research"), true);
  });

  await t.step("不存在的 prompt 返回 null", async () => {
    const prompt = await readPromptFile("nonexistent/system.md");
    assertEquals(prompt, null);
  });
});

// =============================================================================
// readPrompt
// =============================================================================

Deno.test("readPrompt", async (t) => {
  await t.step("读取 coder prompt", async () => {
    const prompt = await readPrompt("coder");
    assertExists(prompt);
    assertEquals(prompt.includes("Coder"), true);
  });

  await t.step("读取 research prompt", async () => {
    const prompt = await readPrompt("research");
    assertExists(prompt);
    assertEquals(prompt.includes("Research"), true);
  });

  await t.step("不存在的 workflow 返回 null", async () => {
    const prompt = await readPrompt("nonexistent");
    assertEquals(prompt, null);
  });
});
