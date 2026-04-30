import puppeteer from "puppeteer-core";

export type CompanyInfo = {
  companyName: string;
  address: string;
  phone: string;
  rawText: string;
};

const WS_ENDPOINT = `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_API_KEY ?? ""}`;

function pickByRegex(text: string, regexes: RegExp[], fallback = ""): string {
  for (const regex of regexes) {
    const matched = text.match(regex);
    if (matched?.[1]) {
      return matched[1].trim();
    }
  }
  return fallback;
}

export async function scrapeCompanyInfo(url: string): Promise<CompanyInfo> {
  if (!process.env.BROWSERLESS_API_KEY) {
    throw new Error("BROWSERLESS_API_KEY が未設定です。");
  }

  const browser = await puppeteer.connect({ browserWSEndpoint: WS_ENDPOINT });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

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
    await browser.close();
  }
}
