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
  /** 画面表示・マッピング用（整形済み） */
  label: string;
  /** 抽出直後（デバッグ用） */
  rawLabel: string;
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
      function escapeForAttributeSelector(id: string): string {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
          return CSS.escape(id);
        }
        return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      }

      function cleanLabelText(s: string): string {
        return s
          .replace(/※\s*必須?/gi, "")
          .replace(/\(\s*必須\s*\)/gi, "")
          .replace(/\[\s*必須\s*\]/gi, "")
          .replace(/\*\s*必須?/gi, "")
          .replace(/【\s*必須\s*】/gi, "")
          .replace(/^\s*[\*＊※]+\s*/g, "")
          .replace(/\s*必須\s*$/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function neighborTextBefore(el: Element): string {
        const MAX = 200;
        let n: ChildNode | null = el.previousSibling;
        while (n) {
          if (n.nodeType === Node.TEXT_NODE) {
            const t = n.textContent?.replace(/\s+/g, " ").trim() ?? "";
            if (t) return t.slice(0, MAX);
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            const e = n as Element;
            const tag = e.tagName.toLowerCase();
            if (
              tag === "label" ||
              tag === "span" ||
              tag === "p" ||
              tag === "div" ||
              tag === "strong" ||
              tag === "b"
            ) {
              const t = e.textContent?.replace(/\s+/g, " ").trim() ?? "";
              if (t && t.length <= MAX) return t;
            }
          }
          n = n.previousSibling;
        }

        const prevEl = el.previousElementSibling;
        if (prevEl) {
          const t = prevEl.textContent?.replace(/\s+/g, " ").trim() ?? "";
          if (t && t.length <= MAX) return t;
        }

        return "";
      }

      function typeFallbackLabel(
        el: Element,
        tag: string,
        typeAttr: string | undefined,
      ): string {
        const t = (typeAttr ?? "").toLowerCase();
        if (tag === "textarea") return "お問い合わせ内容";
        if (t === "email") return "メールアドレス";
        if (t === "tel") return "電話番号";
        if (tag === "select") return "選択項目";
        return "";
      }

      function extractLabel(el: Element): { label: string; rawLabel: string } {
        const tag = el.tagName.toLowerCase();
        const typeAttr = el.getAttribute("type") ?? undefined;
        const nameAttr = el.getAttribute("name") ?? "";
        const placeholder = el.getAttribute("placeholder") ?? "";

        let raw = "";

        const id = el.getAttribute("id");
        const RAW_MAX = 400;

        if (id) {
          const sel = `label[for="${escapeForAttributeSelector(id)}"]`;
          const labelEl = document.querySelector(sel);
          if (labelEl?.textContent?.trim()) {
            raw = labelEl.textContent.trim().slice(0, RAW_MAX);
          }
        }

        if (!raw) {
          const parentLabel = el.closest("label");
          if (parentLabel?.textContent?.trim()) {
            raw = parentLabel.textContent.trim().slice(0, RAW_MAX);
          }
        }

        if (!raw) {
          raw = neighborTextBefore(el);
        }

        if (!raw && placeholder) {
          raw = placeholder;
        }

        const rawLabel = raw || placeholder || nameAttr;
        let cleaned = cleanLabelText(raw);

        if (!cleaned) {
          cleaned = typeFallbackLabel(el, tag, typeAttr);
        }
        if (!cleaned) {
          cleaned = nameAttr.trim() || "未分類";
        }

        return { label: cleaned, rawLabel };
      }

      const elements = Array.from(
        document.querySelectorAll("input, textarea, select"),
      );

      return elements
        .map((el) => {
          const tag = el.tagName.toLowerCase() as "input" | "textarea" | "select";
          const name = el.getAttribute("name") ?? "";
          const placeholder = el.getAttribute("placeholder") ?? "";
          const type = el.getAttribute("type") ?? undefined;
          const { label, rawLabel } = extractLabel(el);
          return { tag, type, name, placeholder, label, rawLabel };
        })
        .filter((field) => {
          const excludedTypes = ["hidden", "submit", "button", "reset", "file"];
          return !field.type || !excludedTypes.includes(field.type);
        });
    });

    for (const f of fields) {
      console.log({
        rawLabel: f.rawLabel,
        cleanedLabel: f.label,
        name: f.name,
      });
    }

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
