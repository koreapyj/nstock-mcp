// SPDX-FileCopyrightText: 2026 Yoonji Park <koreapyj@dcmys.kr>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getJson } from "./http.js";

const API = "https://stock.naver.com/api/stockSecurity/researches/v2";
const WEB = "https://stock.naver.com/research";
const AC = "https://ac.stock.naver.com/ac";

/** API research types. */
export const CATEGORIES = ["market", "invest", "company", "industry", "economy", "debenture"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  market: "market commentary",
  invest: "investment strategy",
  company: "company/stock analysis",
  industry: "industry analysis",
  economy: "economic analysis",
  debenture: "bond/fixed income",
};

/** The web UI calls the "market" category "daily". */
const WEB_PATH: Record<Category, string> = {
  market: "daily",
  invest: "invest",
  company: "company",
  industry: "industry",
  economy: "economy",
  debenture: "debenture",
};

/** Industry keys accepted by the API, mapped to the Korean names Naver uses. */
export const INDUSTRIES: Record<string, string> = {
  it: "IT", game: "게임", construction: "건설", constructionMaterials: "건자재", advertising: "광고",
  education: "교육", finance: "금융", machinery: "기계", etc: "기타", tobacco: "담배",
  display: "디스플레이", media: "미디어", bio: "바이오", semiconductor: "반도체", insurance: "보험",
  petrochemical: "석유화학", textileClothing: "섬유의류", software: "소프트웨어", energy: "에너지",
  travel: "여행", logistics: "운수창고", distribution: "유통", utilities: "유틸리티", bank: "은행",
  foodBeverage: "음식료", internetPortal: "인터넷포탈", automobile: "자동차", autoParts: "자동차부품",
  electronics: "전기전자", pharmaceutical: "제약", shipbuilding: "조선", paper: "종이",
  securities: "증권", holdingCompany: "지주회사", steelMetal: "철강금속", tire: "타이어",
  telecommunications: "통신", airTransportation: "항공운송", shipping: "해운", homeShopping: "홈쇼핑",
  cosmetics: "화장품", mobilePhone: "휴대폰",
};

export function detailPageUrl(category: Category, nid: string | number): string {
  return `${WEB}/${WEB_PATH[category]}/${nid}`;
}

interface RawItem {
  nid: string;
  title: string;
  content?: string;
  brokerName: string;
  brokerCode: string;
  writeDate: string;
  readCount?: string;
  itemCode?: string;
  itemName?: string;
  goalPrice?: string | null;
  opinionText?: string;
  opinionType?: string;
  analystName?: string;
  industry?: string;
  industryKoreanName?: string;
}

interface RawDetail extends RawItem {
  attachUrl?: string;
  attachName?: string;
  prevGoalPrice?: string | null;
  priceAtWriteDate?: string | null;
}

interface RawList {
  hasNext: boolean;
  totalCount: string;
  items: RawItem[];
  size: string;
  index: string;
}

export interface Broker {
  brokerCode: string;
  brokerName: string;
}

/** Converts the HTML summary to plain text. */
export function htmlToText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

function shapeItem(category: Category, it: RawItem, summaryChars: number) {
  const summary = htmlToText(it.content);
  return compact({
    nid: it.nid,
    title: it.title,
    broker: it.brokerName,
    brokerCode: it.brokerCode,
    date: it.writeDate,
    stockName: it.itemName,
    stockCode: it.itemCode,
    // "없음" means "none" (no rating given).
    opinion: it.opinionText && it.opinionText !== "없음" ? it.opinionText : undefined,
    goalPrice: it.goalPrice ? Number(it.goalPrice) : undefined,
    industry: it.industryKoreanName,
    analyst: it.analystName,
    readCount: it.readCount ? Number(it.readCount) : undefined,
    summary:
      summaryChars > 0
        ? summary.length > summaryChars
          ? summary.slice(0, summaryChars) + "…"
          : summary
        : undefined,
    detailUrl: detailPageUrl(category, it.nid),
  });
}

export interface ListParams {
  category: Category;
  page?: number; // 1-based
  size?: number;
  query?: string;
  startDate?: string;
  endDate?: string;
  brokerCodes?: string[];
  itemCodes?: string[];
  industryTypes?: string[];
  summaryChars?: number;
}

export async function listResearch(p: ListParams) {
  const qs = new URLSearchParams();
  qs.set("index", String(Math.max(0, (p.page ?? 1) - 1)));
  qs.set("size", String(p.size ?? 10));
  if (p.startDate) qs.set("startDate", p.startDate);
  if (p.endDate) qs.set("endDate", p.endDate);
  if (p.query) qs.set("query", p.query);
  p.brokerCodes?.forEach((c) => qs.append("brokerCodes", c));
  if (p.category === "company") p.itemCodes?.forEach((c) => qs.append("itemCodes", c));
  if (p.category === "industry") p.industryTypes?.forEach((c) => qs.append("industryTypes", c));
  const raw = await getJson<RawList>(`${API}/${p.category}?${qs}`);
  return {
    category: p.category,
    totalCount: Number(raw.totalCount),
    page: Number(raw.index) + 1,
    size: Number(raw.size),
    hasNext: raw.hasNext,
    items: raw.items.map((it) => shapeItem(p.category, it, p.summaryChars ?? 200)),
  };
}

export async function getResearchDetail(category: Category, nid: string) {
  const d = await getJson<RawDetail>(`${API}/${category}/${encodeURIComponent(nid)}`);
  return compact({
    ...shapeItem(category, d, 0),
    category,
    previousGoalPrice: d.prevGoalPrice ? Number(d.prevGoalPrice) : undefined,
    priceAtWriteDate: d.priceAtWriteDate ? Number(d.priceAtWriteDate) : undefined,
    pdfUrl: d.attachUrl,
    pdfFileName: d.attachName,
    content: htmlToText(d.content),
  });
}

let brokerCache: { at: number; data: Broker[] } | undefined;
export async function listBrokers(): Promise<Broker[]> {
  if (brokerCache && Date.now() - brokerCache.at < 6 * 3600_000) return brokerCache.data;
  const data = await getJson<Broker[]>(`${API}/brokers`);
  brokerCache = { at: Date.now(), data };
  return data;
}

// Normalizes broker names for fuzzy matching by dropping spaces and the
// "(투자)증권" / "금융투자" (securities) suffixes, so "미래에셋" matches "미래에셋증권".
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/(투자)?증권$|금융투자$/, "");

/** Resolves broker names or codes to broker codes. */
export async function resolveBrokers(inputs: string[]): Promise<{ codes: string[]; unresolved: string[] }> {
  const brokers = await listBrokers();
  const codes = new Set<string>();
  const unresolved: string[] = [];
  for (const raw of inputs) {
    const s = raw.trim();
    if (/^\d+$/.test(s) && brokers.some((b) => b.brokerCode === s)) {
      codes.add(s);
      continue;
    }
    const n = norm(s);
    const exact = brokers.filter((b) => b.brokerName === s || norm(b.brokerName) === n);
    const matches = exact.length ? exact : brokers.filter((b) => n && norm(b.brokerName).includes(n));
    if (matches.length) matches.forEach((b) => codes.add(b.brokerCode));
    else unresolved.push(s);
  }
  return { codes: [...codes], unresolved };
}

/** Resolves industry keys or Korean names to industry keys. */
export function resolveIndustries(inputs: string[]): { codes: string[]; unresolved: string[] } {
  const codes = new Set<string>();
  const unresolved: string[] = [];
  for (const raw of inputs) {
    const s = raw.trim();
    const key = Object.keys(INDUSTRIES).find(
      (k) => k.toLowerCase() === s.toLowerCase() || INDUSTRIES[k] === s,
    );
    if (key) codes.add(key);
    else unresolved.push(s);
  }
  return { codes: [...codes], unresolved };
}

interface AcItem {
  code: string;
  name: string;
  typeCode: string;
  typeName: string;
  nationCode: string;
  category: string;
}

export async function searchStocks(q: string, limit = 10) {
  const raw = await getJson<{ items: AcItem[] }>(`${AC}?q=${encodeURIComponent(q)}&target=stock`);
  return (raw.items ?? [])
    .filter((i) => i.category === "stock")
    .slice(0, limit)
    .map((i) => ({ code: i.code, name: i.name, market: i.typeName, nation: i.nationCode }));
}

/** Resolves stock names or 6-char codes to domestic stock codes. */
export async function resolveStocks(inputs: string[]): Promise<{ codes: string[]; unresolved: string[] }> {
  const codes = new Set<string>();
  const unresolved: string[] = [];
  for (const raw of inputs) {
    const s = raw.trim();
    if (/^[0-9A-Z]{6}$/.test(s)) {
      codes.add(s);
      continue;
    }
    const found = (await searchStocks(s, 20)).filter((i) => i.nation === "KOR");
    const hit = found.find((i) => i.name === s) ?? found[0];
    if (hit) codes.add(hit.code);
    else unresolved.push(s);
  }
  return { codes: [...codes], unresolved };
}
