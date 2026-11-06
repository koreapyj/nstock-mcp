// SPDX-FileCopyrightText: 2026 Yoonji Park <koreapyj@dcmys.kr>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  INDUSTRIES,
  getResearchDetail,
  listBrokers,
  listResearch,
  resolveBrokers,
  resolveIndustries,
  resolveStocks,
  searchStocks,
  type Category,
} from "./naver.js";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

const categoryDesc = CATEGORIES.map((c) => `${c} = ${CATEGORY_LABELS[c]}`).join("; ");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .optional();

/** Runs `fn` over `items` with at most `limit` calls in flight, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "naver-stock-research", version: "1.0.0" });

  server.registerTool(
    "search_research",
    {
      title: "Search Naver Stock Research",
      description:
        "Search brokerage research reports on Naver Stock (stock.naver.com/research). Reports are mostly in Korean. " +
        "Every result has detailUrl (the Naver detail page); set includePdf=true to also get pdfUrl (the original PDF). " +
        "Results are sorted newest first. " +
        `Categories: ${categoryDesc}. ` +
        "For reports on specific stocks use category=company with stocks; for specific sectors use category=industry with industries. " +
        "query is a keyword search over titles and summaries (Korean keywords work best).",
      inputSchema: {
        category: z.enum(CATEGORIES).describe(categoryDesc),
        query: z.string().optional().describe("Keyword to search in titles and summaries"),
        stocks: z
          .array(z.string())
          .optional()
          .describe("Stock names or 6-character stock codes (only applied when category=company), e.g. ['삼성전자', '000660']"),
        industries: z
          .array(z.string())
          .optional()
          .describe("Industry keys or Korean names (only applied when category=industry), e.g. ['semiconductor', '제약']. See list_industries"),
        brokers: z
          .array(z.string())
          .optional()
          .describe("Broker names or codes, e.g. ['미래에셋', 'KB증권', '57']. See list_brokers"),
        startDate: date.describe("Earliest publication date (YYYY-MM-DD)"),
        endDate: date.describe("Latest publication date (YYYY-MM-DD)"),
        page: z.number().int().min(1).default(1).describe("Page number, starting at 1"),
        size: z.number().int().min(1).max(50).default(10).describe("Results per page (max 50)"),
        includePdf: z
          .boolean()
          .default(false)
          .describe("If true, makes one extra request per result to attach pdfUrl. Slower, so keep size small"),
        summaryChars: z
          .number()
          .int()
          .min(0)
          .max(2000)
          .default(200)
          .describe("Max characters of each report's summary to include (0 omits it)"),
      },
    },
    async (args) => {
      try {
        const warnings: string[] = [];
        let itemCodes: string[] | undefined;
        let industryTypes: string[] | undefined;
        let brokerCodes: string[] | undefined;

        // Resolve human-friendly filter values to API codes. If none of the values
        // for a filter resolve, fail instead of silently returning unfiltered results.
        if (args.stocks?.length) {
          if (args.category !== "company") warnings.push("The stocks filter only applies to category=company and was ignored.");
          else {
            const r = await resolveStocks(args.stocks);
            if (r.unresolved.length) warnings.push(`Stocks not found: ${r.unresolved.join(", ")}`);
            if (!r.codes.length) return fail(`No matching stocks: ${args.stocks.join(", ")}. Use find_stock to look up the code.`);
            itemCodes = r.codes;
          }
        }
        if (args.industries?.length) {
          if (args.category !== "industry") warnings.push("The industries filter only applies to category=industry and was ignored.");
          else {
            const r = resolveIndustries(args.industries);
            if (r.unresolved.length) warnings.push(`Unknown industries: ${r.unresolved.join(", ")}`);
            if (!r.codes.length) return fail(`Unknown industries: ${args.industries.join(", ")}. See list_industries.`);
            industryTypes = r.codes;
          }
        }
        if (args.brokers?.length) {
          const r = await resolveBrokers(args.brokers);
          if (r.unresolved.length) warnings.push(`Brokers not found: ${r.unresolved.join(", ")}`);
          if (!r.codes.length) return fail(`No matching brokers: ${args.brokers.join(", ")}. See list_brokers.`);
          brokerCodes = r.codes;
        }

        const result = await listResearch({
          category: args.category,
          query: args.query,
          startDate: args.startDate,
          endDate: args.endDate,
          page: args.page,
          size: args.size,
          itemCodes,
          industryTypes,
          brokerCodes,
          summaryChars: args.summaryChars,
        });

        // The list API has no attachment URL, so fetch details for pdfUrl.
        let items: Record<string, unknown>[] = result.items;
        if (args.includePdf && items.length) {
          items = await mapLimit(result.items, 5, async (it) => {
            try {
              const d = await getResearchDetail(args.category, it.nid!);
              return { ...it, pdfUrl: d.pdfUrl };
            } catch (e) {
              return { ...it, pdfError: (e as Error).message };
            }
          });
        }

        const { items: _omit, ...meta } = result;
        return json({
          ...meta,
          appliedFilters: { itemCodes, industryTypes, brokerCodes },
          ...(warnings.length ? { warnings } : {}),
          items,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "get_research",
    {
      title: "Get Research Report",
      description:
        "Get one research report: full summary text, original PDF URL (pdfUrl) and Naver detail page (detailUrl). " +
        "Company reports also include the target price, previous target price and the stock price on the publication date. " +
        "Take category and nid from search_research results.",
      inputSchema: {
        category: z.enum(CATEGORIES).describe(categoryDesc),
        nid: z.string().regex(/^\d+$/).describe("Report ID (nid from search_research results)"),
      },
    },
    async ({ category, nid }) => {
      try {
        return json(await getResearchDetail(category as Category, nid));
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "find_stock",
    {
      title: "Find Stock Code",
      description: "Look up stock codes by name using Naver Stock autocomplete. Korean stock names work best.",
      inputSchema: {
        query: z.string().min(1).describe("Full or partial stock name"),
        limit: z.number().int().min(1).max(20).default(10),
      },
    },
    async ({ query, limit }) => {
      try {
        return json(await searchStocks(query, limit));
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "list_brokers",
    {
      title: "List Brokers",
      description: "List the brokerages and institutions that publish research, with their codes.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await listBrokers());
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "list_industries",
    {
      title: "List Industries",
      description: "List the industry keys and Korean names usable as filters for category=industry.",
      inputSchema: {},
    },
    async () => json(Object.entries(INDUSTRIES).map(([key, name]) => ({ key, name }))),
  );

  return server;
}
