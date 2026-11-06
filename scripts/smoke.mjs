// SPDX-FileCopyrightText: 2026 Yoonji Park <koreapyj@dcmys.kr>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Smoke test: spawns the server over stdio and calls each tool once.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2];
const transport = url
  ? new StreamableHTTPClientTransport(new URL(url))
  : new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env: process.env });

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  console.log(`\n### ${name} ${JSON.stringify(args)}${r.isError ? " [ERROR]" : ""}\n${text.slice(0, 1200)}`);
};

await call("find_stock", { query: "SK하이닉스", limit: 3 });
await call("search_research", { category: "company", stocks: ["삼성전자"], brokers: ["미래에셋"], size: 2, includePdf: true, summaryChars: 80 });
await call("search_research", { category: "industry", industries: ["반도체"], size: 2, summaryChars: 0 });
await call("search_research", { category: "market", query: "마켓", size: 1, includePdf: true, summaryChars: 0 });
await call("get_research", { category: "company", nid: "97826" });
await call("search_research", { category: "company", stocks: ["존재하지않는종목xyz"] });

await client.close();
