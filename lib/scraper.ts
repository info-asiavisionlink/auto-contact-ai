import puppeteer from "puppeteer-core";

import {
  applyStealthLikePageDefaults,
  GOTO_OPTIONS,
} from "./puppeteerPage";
import { retry } from "./retry";
import {
  fallbackCompanyNameFromUrl,
  fetchPageTitleFallback,
} from "./scrapeFallback";

export type CompanyInfo = {
  companyName: string;
  address: string;
  phone: string;
  rawText: string;
};

export type ScrapeCompanyOutcome = {
  success: boolean;
  data: CompanyInfo;
  error?: string;
};

function pickByRegex(text: string, regexes: RegExp[], fallback = ""): string {
  for (const regex of regexes) {
    const matched = text.match(regex);
    if (matched?.[1]) {
      return matched[1].trim();
    }
  }
  return fallback;
}

async function scrapeCompanyOnce(url: string): Promise<CompanyInfo> {
  if (!process.env.BROWSERLESS_API_KEY) {
    throw new Error("BROWSERLESS_API_KEYが未設定です");
  }

  console.log("BROWSERLESS:", process.env.BROWSERLESS_API_KEY ? "OK" : "NG");

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_API_KEY}`,
    });

    const page = await browser.newPage();
    await applyStealthLikePageDefaults(page);
    await page.goto(url, GOTO_OPTIONS);

    const pageText = await page.evaluate(() => {
      const text = document.body?.innerText ?? "";
      return text.replace(/\s+/g, " ").trim();
    });

    const title = await page.title();
    const companyName =
      pickByRegex(pageText, [
        /会社名[:：]\s*([^\n。]+)/i,
        /商号[:：]\s*([^\n。]+)/i,
      ]) || title;

    const address = pickByRegex(pageText, [
      /住所[:：]\s*([^\n。]+)/i,
      /(〒\d{3}-\d{4}[^\n。]+)/,
    ]);

    const phone = pickByRegex(pageText, [
      /電話(?:番号)?[:：]?\s*(0\d{1,4}-\d{1,4}-\d{3,4})/i,
      /(0\d{1,4}-\d{1,4}-\d{3,4})/,
    ]);

    return {
      companyName,
      address,
      phone,
      rawText: pageText.slice(0, 5000),
    };
  } finally {
    await browser?.close();
  }
}

/**
 * 企業サイトのスクレイピング。失敗しても例外は投げず、フォールバックで続行可能な形で返す。
 */
export async function scrapeCompanyInfo(url: string): Promise<ScrapeCompanyOutcome> {
  try {
    const data = await retry(() => scrapeCompanyOnce(url), 2);
    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Scraping failed:", message);

    const title = await fetchPageTitleFallback(url);
    const data: CompanyInfo = {
      companyName: fallbackCompanyNameFromUrl(url, title),
      address: "",
      phone: "",
      rawText: "",
    };
    return {
      success: false,
      data,
      error: "スクレイピング失敗",
    };
  }
}
