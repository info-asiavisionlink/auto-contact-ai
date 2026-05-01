import axios from "axios";

import { CHROME_USER_AGENT } from "./puppeteerPage";

/** Puppeteer 失敗時: HTML から title を抜き出す（axios） */
export async function fetchPageTitleFallback(url: string): Promise<string> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 20_000,
      maxRedirects: 5,
      responseType: "text",
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        "User-Agent": CHROME_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      },
    });
    const html = res.data ?? "";
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = m?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    return title;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetchPageTitleFallback failed:", msg);
    return "";
  }
}

/** title が取れなければホスト名を返す */
export function fallbackCompanyNameFromUrl(url: string, title: string): string {
  const t = title.trim();
  if (t) return t;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host || url;
  } catch {
    return url;
  }
}
