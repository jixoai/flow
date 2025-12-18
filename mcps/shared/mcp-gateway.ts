/**
 * MCP HTTP Gateway
 *
 * 提供统一的 HTTP 服务器管理所有 MCP。
 * 通过动态 import 加载 MCP，使用 WebStandardStreamableHTTPServerTransport 处理请求。
 *
 * 路由: /mcp/<name>
 *
 * Usage:
 *   const gateway = await startMcpGateway();
 *   // => http://localhost:PORT/mcp/memory
 */

import type { McpServer } from "npm:@modelcontextprotocol/sdk@1.25.1/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.25.1/server/webStandardStreamableHttp.js";
import { basename, dirname, fromFileUrl, join } from "jsr:@std/path";

// =============================================================================
// Types
// =============================================================================

export interface McpInstance {
  name: string;
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  handleRequest: (req: Request) => Promise<Response>;
}

export interface GatewayConfig {
  port?: number;
  host?: string;
}

export interface GatewayInfo {
  port: number;
  host: string;
  url: string;
  shutdown: () => Promise<void>;
}

// MCP module must export a server wrapper with getServer()
export interface McpModule {
  default?: { getServer(): McpServer };
  server?: { getServer(): McpServer };
}

// =============================================================================
// Paths
// =============================================================================

const __dirname = dirname(fromFileUrl(import.meta.url));
const MCPS_DIR = dirname(__dirname);
const META_DIR = join(dirname(MCPS_DIR), "meta");

function getMcpPath(name: string): string {
  if (name === "meta") {
    return join(META_DIR, "meta.mcp.ts");
  }
  return join(MCPS_DIR, `${name}.mcp.ts`);
}

async function scanAvailableMcps(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(MCPS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".mcp.ts")) {
      names.push(basename(entry.name, ".mcp.ts"));
    }
  }
  names.push("meta");
  return names.sort();
}

// =============================================================================
// Gateway Implementation
// =============================================================================

class McpGateway {
  private instances: Map<string, McpInstance> = new Map();
  private httpServer: Deno.HttpServer | null = null;
  private port: number = 0;
  private host: string = "localhost";

  /** 动态加载并初始化 MCP，返回 handleRequest 函数 */
  async loadMcp(name: string): Promise<McpInstance> {
    const existing = this.instances.get(name);
    if (existing) return existing;

    const mcpPath = getMcpPath(name);
    console.error(`[gateway] Loading MCP: ${name} from ${mcpPath}`);

    // 动态 import
    const module = await import(mcpPath) as McpModule;

    // 获取 McpServer 实例
    let mcpServer: McpServer;
    if (module.default?.getServer) {
      mcpServer = module.default.getServer();
    } else if (module.server?.getServer) {
      mcpServer = module.server.getServer();
    } else {
      throw new Error(
        `MCP ${name} does not export a valid server with getServer()`,
      );
    }

    // 创建 HTTP transport
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    // 连接 server 和 transport
    await mcpServer.connect(transport);

    // 创建 handleRequest 函数
    const handleRequest = (req: Request) => transport.handleRequest(req);

    const instance: McpInstance = {
      name,
      server: mcpServer,
      transport,
      handleRequest,
    };

    this.instances.set(name, instance);
    console.error(`[gateway] MCP loaded: ${name}`);

    return instance;
  }

  /** 启动 HTTP Gateway 服务器 */
  async start(config: GatewayConfig = {}): Promise<GatewayInfo> {
    if (this.httpServer) {
      return this.getInfo();
    }

    this.host = config.host ?? "127.0.0.1";
    const requestedPort = config.port ?? 0;

    // 使用 Promise 来获取实际端口
    const portPromise = new Promise<number>((resolve) => {
      this.httpServer = Deno.serve({
        port: requestedPort,
        hostname: this.host,
        onListen: ({ port }) => {
          this.port = port;
          console.error(
            `[gateway] HTTP server listening on http://${this.host}:${port}`,
          );
          resolve(port);
        },
      }, (req) => this.handleHttpRequest(req));
    });

    await portPromise;
    return this.getInfo();
  }

  /** 处理 HTTP 请求，路由到对应的 MCP */
  private async handleHttpRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // 路由: /mcp/<name>/*
    const match = path.match(/^\/mcp\/([^/]+)(\/.*)?$/);
    if (!match) {
      // 健康检查或列出 MCPs
      if (path === "/" || path === "/health") {
        const available = await scanAvailableMcps();
        return new Response(
          JSON.stringify(
            {
              status: "ok",
              available,
              loaded: Array.from(this.instances.keys()),
            },
            null,
            2,
          ),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response("Not Found. Use /mcp/<name> to access MCPs.", {
        status: 404,
      });
    }

    const mcpName = match[1];

    try {
      // 懒加载 MCP
      const instance = await this.loadMcp(mcpName);
      // 转发请求到 MCP transport
      return await instance.handleRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[gateway] Error handling ${mcpName}:`, message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private getInfo(): GatewayInfo {
    return {
      port: this.port,
      host: this.host,
      url: `http://${this.host}:${this.port}`,
      shutdown: () => this.shutdown(),
    };
  }

  /** 关闭 Gateway */
  async shutdown(): Promise<void> {
    if (this.httpServer) {
      await this.httpServer.shutdown();
      this.httpServer = null;
    }
    for (const instance of this.instances.values()) {
      await instance.transport.close?.();
    }
    this.instances.clear();
    console.error("[gateway] Shutdown complete");
  }
}

// =============================================================================
// Singleton & Exports
// =============================================================================

let gateway: McpGateway | null = null;
let startPromise: Promise<GatewayInfo> | null = null;

/**
 * 启动 MCP Gateway（单例）
 */
export async function startMcpGateway(
  config?: GatewayConfig,
): Promise<GatewayInfo> {
  if (!gateway) {
    gateway = new McpGateway();
  }
  if (!startPromise) {
    startPromise = gateway.start(config);
  }
  return startPromise;
}

/**
 * 获取 Gateway 实例（用于高级用法）
 */
export function getGateway(): McpGateway | null {
  return gateway;
}

/**
 * 关闭 Gateway
 */
export async function shutdownGateway(): Promise<void> {
  if (gateway) {
    await gateway.shutdown();
    gateway = null;
    startPromise = null;
  }
}

/**
 * 获取可用的 MCP 列表
 */
export { scanAvailableMcps as getAvailableMcps };

// =============================================================================
// CLI
// =============================================================================

if (import.meta.main) {
  const port = parseInt(
    Deno.args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? "0",
  );

  console.error("Starting MCP Gateway...");
  const info = await startMcpGateway({ port });

  const available = await scanAvailableMcps();
  console.error(`\nAvailable MCPs: ${available.join(", ")}`);
  console.error("\nEndpoints:");
  for (const name of available) {
    console.error(`  ${info.url}/mcp/${name}`);
  }
  console.error("\nPress Ctrl+C to stop");
}
