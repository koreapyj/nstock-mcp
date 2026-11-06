// SPDX-FileCopyrightText: 2026 Yoonji Park <koreapyj@dcmys.kr>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";

/**
 * HTTP client honoring HTTP_PROXY / HTTPS_PROXY / NO_PROXY (and lowercase variants).
 * EnvHttpProxyAgent picks the proxy per request based on the target URL's scheme
 * and bypasses it for hosts listed in NO_PROXY.
 */
const dispatcher: Dispatcher = new EnvHttpProxyAgent();

const TIMEOUT_MS = Number(process.env.NAVER_TIMEOUT_MS ?? 15000);
const USER_AGENT =
  process.env.NAVER_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export function describeProxy(): string {
  const http = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const https = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (!http && !https) return "proxy: none";
  const mask = (u?: string) => (u ? u.replace(/\/\/[^@/]*@/, "//***@") : "-");
  return `proxy: http=${mask(http)} https=${mask(https)} no_proxy=${noProxy ?? "-"}`;
}

export class NaverApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string): Promise<T> {
  let res;
  try {
    res = await fetch(url, {
      dispatcher,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        Referer: "https://stock.naver.com/research",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause?.message;
    throw new NaverApiError(`Request failed: ${(e as Error).message}${cause ? ` (${cause})` : ""}`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 500);
    try {
      const j = JSON.parse(text);
      if (j?.message) msg = String(j.message);
    } catch {
      /* not json */
    }
    throw new NaverApiError(`Naver API ${res.status}: ${msg}`, res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NaverApiError(`Invalid JSON from ${url}`);
  }
}
