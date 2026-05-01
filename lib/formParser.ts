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
  /** ラベル取得元（デバッグ用） */
  labelSource: string;
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
      const RAW_MAX = 400;

      function escapeForAttributeSelector(id: string): string {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
          return CSS.escape(id);
        }
        return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      }

      function cleanLabelText(s: string): string {
        return s
          .replace(/※必須/g, "")
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

      /**
       * <dt>…</dt><dd>…input…</dd> および入れ子の dl に対応
       */
      function labelFromDtDd(el: Element): { raw: string; source: string } | null {
        const dd = el.closest("dd");
        if (dd) {
          let node: ChildNode | null = dd.previousSibling;
          while (node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const e = node as HTMLElement;
              if (e.tagName.toLowerCase() === "dt") {
                const t =
                  e.innerText?.trim() || e.textContent?.trim() || "";
                if (t) {
                  return {
                    raw: t.slice(0, RAW_MAX),
                    source: "dt/dd",
                  };
                }
              }
            }
            node = node.previousSibling;
          }
        }

        const dl = el.closest("dl");
        if (dl) {
          const dds = Array.from(dl.querySelectorAll("dd"));
          const dts = Array.from(dl.querySelectorAll("dt"));
          const containing = dds.find((d) => d.contains(el));
          if (containing && dts.length > 0) {
            const idx = dds.indexOf(containing);
            if (idx >= 0 && idx < dts.length) {
              const dtEl = dts[idx] as HTMLElement;
              const t =
                dtEl.innerText?.trim() ||
                dtEl.textContent?.trim() ||
                "";
              if (t) {
                return {
                  raw: t.slice(0, RAW_MAX),
                  source: "dt/dd-pair",
                };
              }
            }
          }
        }

        return null;
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

      function extractLabel(el: Element): {
        label: string;
        rawLabel: string;
        labelSource: string;
      } {
        const tag = el.tagName.toLowerCase();
        const typeAttr = el.getAttribute("type") ?? undefined;
        const nameAttr = el.getAttribute("name") ?? "";
        const placeholder = el.getAttribute("placeholder") ?? "";

        let raw = "";
        let labelSource = "fallback";

        const id = el.getAttribute("id");

        // 1. label[for]
        if (id) {
          const sel = `label[for="${escapeForAttributeSelector(id)}"]`;
          const labelEl = document.querySelector(sel);
          if (labelEl?.textContent?.trim()) {
            raw = labelEl.textContent.trim().slice(0, RAW_MAX);
            labelSource = "label-for";
          }
        }

        // 2. closest(label)
        if (!raw) {
          const parentLabel = el.closest("label");
          if (parentLabel?.textContent?.trim()) {
            raw = parentLabel.textContent.trim().slice(0, RAW_MAX);
            labelSource = "label-wrap";
          }
        }

        // 3. dt（dl / dt / dd）
        if (!raw) {
          const dtHit = labelFromDtDd(el);
          if (dtHit) {
            raw = dtHit.raw;
            labelSource = dtHit.source;
          }
        }

        // 4. placeholder
        if (!raw && placeholder) {
          raw = placeholder.slice(0, RAW_MAX);
          labelSource = "placeholder";
        }

        // 5. name（raw として使用し、整形は後段）
        if (!raw && nameAttr) {
          raw = nameAttr.slice(0, RAW_MAX);
          labelSource = "name";
        }

        const rawLabel = raw || placeholder || nameAttr;
        let cleaned = cleanLabelText(raw);

        if (!cleaned) {
          cleaned = typeFallbackLabel(el, tag, typeAttr);
          if (cleaned) labelSource = `${labelSource}+type`;
        }
        if (!cleaned) {
          cleaned = nameAttr.trim() || "未分類";
          labelSource = "name-only";
        }

        return { label: cleaned, rawLabel, labelSource };
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
          const { label, rawLabel, labelSource } = extractLabel(el);
          return { tag, type, name, placeholder, label, rawLabel, labelSource };
        })
        .filter((field) => {
          const excludedTypes = ["hidden", "submit", "button", "reset", "file"];
          return !field.type || !excludedTypes.includes(field.type);
        });
    });

    for (const f of fields) {
      console.log({
        label: f.label,
        source: f.labelSource,
        rawLabel: f.rawLabel,
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
