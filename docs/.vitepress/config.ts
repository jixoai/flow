import { defineConfig } from "vitepress";
import { generateNav, generateSidebar } from "./nav.ts";

// 支持多种部署场景：
// - GitHub Pages: /flow/ 或 /flowfork/
// - 自定义域名: /
// 通过环境变量 BASE_URL 配置，默认为 /flow/
const base = process.env.BASE_URL || "/flow/";

export default defineConfig({
  base,
  title: "Workflow Framework",
  description: "面向 AI Agent 的可组合工作流框架",
  lang: "zh-CN",

  head: [
    ["meta", { name: "theme-color", content: "#5f67ee" }],
    ["meta", { name: "og:type", content: "website" }],
    ["meta", { name: "og:title", content: "Workflow Framework" }],
    [
      "meta",
      { name: "og:description", content: "面向 AI Agent 的可组合工作流框架" },
    ],
  ],

  themeConfig: {
    nav: generateNav(),
    sidebar: generateSidebar(),

    outline: {
      level: [2, 3],
      label: "本页目录",
    },

    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "搜索文档" },
          modal: {
            noResultsText: "无法找到相关结果",
            resetButtonTitle: "清除查询条件",
            footer: { selectText: "选择", navigateText: "切换" },
          },
        },
      },
    },

    lastUpdated: {
      text: "最后更新于",
    },

    docFooter: {
      prev: "上一篇",
      next: "下一篇",
    },

    returnToTopLabel: "返回顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "主题",
  },

  markdown: {
    lineNumbers: true,
    theme: {
      light: "github-light",
      dark: "github-dark",
    },
  },
});
