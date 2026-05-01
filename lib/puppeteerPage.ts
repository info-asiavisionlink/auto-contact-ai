import type { Page } from "puppeteer-core";

/** Browserless / 実サイト向けの一般的な Chrome UA（stealth 的な最低限の擬装） */
export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function applyStealthLikePageDefaults(page: Page): Promise<void> {
  await page.setUserAgent(CHROME_USER_AGENT);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  });
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
}

export const GOTO_OPTIONS = {
  waitUntil: "domcontentloaded" as const,
  timeout: 90_000,
};
