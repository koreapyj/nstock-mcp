#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Yoonji Park <koreapyj@dcmys.kr>
// SPDX-License-Identifier: AGPL-3.0-or-later
import "./env.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { createServer } from "./server.js";
import { describeProxy } from "./http.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

const transport = (arg("transport") ?? process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const log = (...a: unknown[]) => console.error("[naver-stock-mcp]", ...a);

async function runStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  log(`stdio transport ready (${describeProxy()})`);
}

async function runHttp() {
  const host = arg("host") ?? process.env.MCP_HOST ?? "127.0.0.1";
  const port = Number(arg("port") ?? process.env.MCP_PORT ?? process.env.PORT ?? 3000);
  const path = process.env.MCP_PATH ?? "/mcp";
  const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",").map((s) => s.trim()).filter(Boolean);

  const app = createMcpExpressApp({ host, allowedHosts });

  // Stateless mode: a fresh server and transport for every request.
  app.post(path, async (req: Request, res: Response) => {
    const server = createServer();
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void t.close();
      void server.close();
    });
    try {
      await server.connect(t);
      await t.handleRequest(req, res, req.body);
    } catch (e) {
      log("request error", e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });
  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  };
  app.get(path, notAllowed);
  app.delete(path, notAllowed);
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.listen(port, host, () => {
    log(`Streamable HTTP listening on http://${host}:${port}${path} (${describeProxy()})`);
  });
}

if (transport === "http" || transport === "streamable-http") await runHttp();
else if (transport === "stdio") await runStdio();
else {
  log(`Unknown transport "${transport}". Use stdio or http.`);
  process.exit(1);
}
