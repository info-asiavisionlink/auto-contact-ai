import puppeteer from "puppeteer-core";

import {
  applyStealthLikePageDefaults,
  GOTO_OPTIONS,
} from "./puppeteerPage";
import { retry } from "./retry";

export type FormField = {
  tag: "input" | "textarea" | "select";
  type?: string;
  name: string;
  placeholder: string;
  label: string;
};

export type ParseFormOutcome = {
  success: boolean;
  data: FormField[];
  error?: string;
};

async function parseFormFieldsOnce(url: string): Promise<FormField[]> {
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

    const fields = await page.evaluate(() => {
      const getLabel = (el: Element): string => {
        const id = el.getAttribute("id");
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label?.textContent) return label.textContent.trim();
        }
        const parentLabel = el.closest("label");
        if (parentLabel?.textContent) return parentLabel.textContent.trim();
        return "";
      };

      const elements = Array.from(
        document.querySelectorAll("input, textarea, select"),
      );

      return elements
        .map((el) => {
          const tag = el.tagName.toLowerCase() as "input" | "textarea" | "select";
          const name = el.getAttribute("name") ?? "";
          const placeholder = el.getAttribute("placeholder") ?? "";
          const label = getLabel(el);
          const type = el.getAttribute("type") ?? undefined;
          return { tag, type, name, placeholder, label };
        })
        .filter((field) => {
          const excludedTypes = ["hidden", "submit", "button", "reset", "file"];
          return !field.type || !excludedTypes.includes(field.type);
        });
    });

    return fields;
  } finally {
    await browser?.close();
  }
}

/**
 * 問い合わせフォーム解析。失敗時は空配列を返し、全体処理は止めない。
 */
export async function parseFormFields(url: string): Promise<ParseFormOutcome> {
  try {
    const data = await retry(() => parseFormFieldsOnce(url), 2);
    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Form parse failed:", message);
    return {
      success: false,
      data: [],
      error: "スクレイピング失敗",
    };
  }
}
