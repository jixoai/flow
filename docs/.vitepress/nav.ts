import type { DefaultTheme } from "vitepress";
import fs from "node:fs";
import path from "node:path";

const docsRoot = path.resolve(__dirname, "..");

interface ChapterItem {
  title: string;
  link: string;
}

interface ChapterChild {
  title: string;
  key: string;
  items: ChapterItem[];
}

interface Chapter {
  key: string;
  title: string;
  items: ChapterItem[];
  children?: ChapterChild[];
}

/**
 * 从 markdown 文件提取标题
 */
function extractTitle(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";

  const content = fs.readFileSync(filePath, "utf-8");

  // 尝试从 frontmatter 获取 title
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/^title:\s*(.+)$/m);
    if (titleMatch) return titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  // 从第一个 # 标题获取
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  return "";
}

/**
 * 将文件名转换为标题
 */
function fileNameToTitle(name: string): string {
  return name
    .replace(/^\d+-/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * 扫描目录下的 md 文件
 */
function scanMdFiles(dirPath: string): ChapterItem[] {
  if (!fs.existsSync(dirPath)) return [];

  const items: ChapterItem[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = entry.name.replace(".md", "");
      const filePath = path.join(dirPath, entry.name);
      const title = extractTitle(filePath) || fileNameToTitle(name);

      items.push({ title, link: name });
    }
  }

  return items.sort((a, b) => {
    if (a.link === "index") return -1;
    if (b.link === "index") return 1;
    return a.link.localeCompare(b.link);
  });
}

/**
 * 扫描子目录
 */
function scanSubDirs(dirPath: string): ChapterChild[] {
  if (!fs.existsSync(dirPath)) return [];

  const children: ChapterChild[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const subDirPath = path.join(dirPath, entry.name);
      const items = scanMdFiles(subDirPath);

      if (items.length > 0) {
        children.push({
          title: fileNameToTitle(entry.name),
          key: entry.name,
          items: items.filter((item) => item.link !== "index"),
        });
      }
    }
  }

  return children.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * 扫描 white-book 目录生成章节结构
 */
function scanWhiteBook(): Chapter[] {
  const whiteBookDir = path.join(docsRoot, "white-book");
  if (!fs.existsSync(whiteBookDir)) return [];

  const chapters: Chapter[] = [];
  const entries = fs.readdirSync(whiteBookDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && /^\d{2}-/.test(entry.name)) {
      const chapterDir = path.join(whiteBookDir, entry.name);
      const indexPath = path.join(chapterDir, "index.md");

      const title = extractTitle(indexPath) || fileNameToTitle(entry.name);
      const items = scanMdFiles(chapterDir);
      const children = scanSubDirs(chapterDir);

      chapters.push({
        key: entry.name,
        title,
        items,
        children: children.length > 0 ? children : undefined,
      });
    }
  }

  return chapters.sort((a, b) => a.key.localeCompare(b.key));
}

let cachedChapters: Chapter[] | null = null;

function getWhiteBookChapters(): Chapter[] {
  if (!cachedChapters) {
    cachedChapters = scanWhiteBook();
  }
  return cachedChapters;
}

// 生成导航栏
export function generateNav(): DefaultTheme.NavItem[] {
  const chapters = getWhiteBookChapters();
  const firstChapter = chapters[0];

  return [
    { text: "首页", link: "/" },
    {
      text: "White Book",
      link: firstChapter ? `/white-book/${firstChapter.key}/` : "/white-book/",
      activeMatch: "/white-book/",
    },
  ];
}

/**
 * 生成完整的书籍目录侧边栏
 */
function generateBookSidebar(): DefaultTheme.SidebarItem[] {
  const chapters = getWhiteBookChapters();

  return chapters.map((chapter) => {
    const basePath = `/white-book/${chapter.key}/`;

    // 章节的页面列表
    const chapterItems: DefaultTheme.SidebarItem[] = chapter.items
      .filter((item) => item.link !== "index")
      .map((item) => ({
        text: item.title,
        link: `${basePath}${item.link}`,
      }));

    // 子目录
    if (chapter.children) {
      for (const child of chapter.children) {
        chapterItems.push({
          text: child.title,
          collapsed: true,
          items: child.items.map((item) => ({
            text: item.title,
            link: `${basePath}${child.key}/${item.link}`,
          })),
        });
      }
    }

    return {
      text: chapter.title,
      link: basePath,
      collapsed: false,
      items: chapterItems.length > 0 ? chapterItems : undefined,
    };
  });
}

// 生成侧边栏
export function generateSidebar(): DefaultTheme.Sidebar {
  const bookSidebar = generateBookSidebar();

  return {
    // 所有 white-book 页面使用同一个完整目录
    "/white-book/": bookSidebar,
  };
}
