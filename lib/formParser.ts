import puppeteer from "puppeteer-core";
import type { Frame } from "puppeteer-core";

import {
  applyStealthLikePageDefaults,
} from "./puppeteerPage";
import { retry } from "./retry";

const FORM_GOTO_OPTIONS = {
  waitUntil: "networkidle2" as const,
  timeout: 60_000,
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 網羅優先：すべての input / textarea / select を返す（取りこぼし禁止）
 */
export type FormField = {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  rawHTML: string;
  tag: "input" | "textarea" | "select";
};

export type ParseFormOutcome = {
  success: boolean;
  data: FormField[];
  error?: string;
};

/** document 内のフォーム要素を収集（空なら []。ダミーは付与しない） */
function collectFormFieldsInDocumentFn(baseIndex: number) {
  const RAW_HTML_MAX = 8000;
  const CHUNK_MAX = 500;

  function escapeForAttributeSelector(id: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(id);
    }
    return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function trimLabel(s: string): string {
    return s.replace(/\s+/g, " ").trim();
  }

  function labelFromDtDd(el: Element): string {
    const dd = el.closest("dd");
    if (dd) {
      let node: ChildNode | null = dd.previousSibling;
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const e = node as HTMLElement;
          if (e.tagName.toLowerCase() === "dt") {
            const t = trimLabel(e.innerText || e.textContent || "");
            if (t) return t.slice(0, CHUNK_MAX);
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
          const t = trimLabel(dtEl.innerText || dtEl.textContent || "");
          if (t) return t.slice(0, CHUNK_MAX);
        }
      }
    }
    return "";
  }

  function precedingTextNodes(el: Element): string {
    let n: ChildNode | null = el.previousSibling;
    let steps = 0;
    while (n && steps < 30) {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = trimLabel(n.textContent || "");
        if (t) return t.slice(0, CHUNK_MAX);
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
          const t = trimLabel(e.textContent || "");
          if (t && t.length <= CHUNK_MAX) return t;
        }
      }
      n = n.previousSibling;
      steps++;
    }
    return "";
  }

  function nearbyDivPSpanText(el: Element): string {
    let sib: Element | null = el.previousElementSibling;
    let steps = 0;
    while (sib && steps < 8) {
      const tag = sib.tagName.toLowerCase();
      if (tag === "div" || tag === "p" || tag === "span") {
        const t = trimLabel(sib.textContent || "");
        if (t && t.length <= CHUNK_MAX) return t;
      }
      sib = sib.previousElementSibling;
      steps++;
    }

    let parent: Element | null = el.parentElement;
    let pdepth = 0;
    while (parent && pdepth < 4) {
      let psib: Element | null = parent.previousElementSibling;
      let q = 0;
      while (psib && q < 4) {
        const tag = psib.tagName.toLowerCase();
        if (tag === "div" || tag === "p" || tag === "span") {
          const t = trimLabel(psib.textContent || "");
          if (t && t.length <= CHUNK_MAX) return t;
        }
        psib = psib.previousElementSibling;
        q++;
      }
      parent = parent.parentElement;
      pdepth++;
    }
    return "";
  }

  function resolveLabel(el: Element, index: number): string {
    const id = el.getAttribute("id");
    const placeholder = el.getAttribute("placeholder") || "";
    const nameAttr = el.getAttribute("name") || "";
    const aria = el.getAttribute("aria-label") || "";

    const attempts: string[] = [];

    if (id) {
      const sel = `label[for="${escapeForAttributeSelector(id)}"]`;
      const labelEl = document.querySelector(sel);
      if (labelEl?.textContent) {
        attempts.push(trimLabel(labelEl.textContent));
      }
    }

    const parentLabel = el.closest("label");
    if (parentLabel?.textContent) {
      attempts.push(trimLabel(parentLabel.textContent));
    }

    if (placeholder) attempts.push(trimLabel(placeholder));
    if (nameAttr) attempts.push(trimLabel(nameAttr));
    if (aria) attempts.push(trimLabel(aria));

    const prec = precedingTextNodes(el);
    if (prec) attempts.push(prec);

    const dt = labelFromDtDd(el);
    if (dt) attempts.push(dt);

    const dps = nearbyDivPSpanText(el);
    if (dps) attempts.push(dps);

    for (const a of attempts) {
      if (a) return a.slice(0, CHUNK_MAX);
    }

    return `不明フィールド${index}`;
  }

  function elementType(el: Element, tag: string): string {
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    return (el.getAttribute("type") || "text").toLowerCase();
  }

  const elements = Array.from(
    document.querySelectorAll("input, textarea, select"),
  );

  const out: Array<{
    label: string;
    name: string;
    type: string;
    placeholder: string;
    rawHTML: string;
    tag: "input" | "textarea" | "select";
  }> = [];

  elements.forEach((el, localIndex) => {
    const tag = el.tagName.toLowerCase() as "input" | "textarea" | "select";
    const name = el.getAttribute("name") || "";
    const placeholder = el.getAttribute("placeholder") || "";
    const type = elementType(el, tag);
    const label = resolveLabel(el, baseIndex + localIndex);
    let rawHTML = "";
    try {
      rawHTML = el.outerHTML || "";
      if (rawHTML.length > RAW_HTML_MAX) {
        rawHTML = rawHTML.slice(0, RAW_HTML_MAX) + "…";
      }
    } catch {
      rawHTML = "";
    }

    out.push({
      label,
      name,
      type,
      placeholder,
      rawHTML,
      tag,
    });
  });

  return out;
}

async function collectFromFrame(
  frame: Frame,
  baseIndex: number,
): Promise<FormField[]> {
  return frame.evaluate(collectFormFieldsInDocumentFn, baseIndex);
}

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

    await page.goto(url, FORM_GOTO_OPTIONS);
    console.log("ページ読み込み完了");

    try {
      await page.waitForSelector("input, textarea, select", {
        timeout: 15_000,
      });
    } catch {
      console.log("フォーム待機失敗 → 続行");
    }

    await delay(2000);

    const merged: FormField[] = [];
    let indexOffset = 0;
    const frames = page.frames();

    for (const frame of frames) {
      let count = 0;
      try {
        count = await frame.$$eval(
          "input, textarea, select",
          (els) => els.length,
        );
      } catch {
        count = 0;
      }

      if (count > 0 && frame !== page.mainFrame()) {
        console.log("iframe内でフォーム発見", frame.url());
      }

      try {
        const part = await collectFromFrame(frame, indexOffset);
        merged.push(...part);
        indexOffset += part.length;
      } catch (err) {
        console.log("フレーム解析スキップ:", frame.url(), err);
      }
    }

    console.log("フォーム要素数:", merged.length);

    if (merged.length === 0) {
      let bodySnippet = "";
      try {
        bodySnippet = await page.evaluate(() =>
          (document.body?.innerHTML ?? "").slice(0, 8000),
        );
      } catch {
        bodySnippet = "";
      }
      console.log(
        "フォーム0件 — document.body.innerHTML 冒頭:",
        bodySnippet || "(取得不可)",
      );
      merged.push({
        label: "不明フィールド0",
        name: "",
        type: "",
        placeholder: "",
        rawHTML: "",
        tag: "input",
      });
    }

    for (const f of merged) {
      console.log({
        label: f.label,
        name: f.name,
        placeholder: f.placeholder,
        type: f.type,
      });
    }

    return merged;
  } finally {
    await browser?.close();
  }
}

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
      data: [
        {
          label: "不明フィールド0",
          name: "",
          type: "",
          placeholder: "",
          rawHTML: "",
          tag: "input",
        },
      ],
      error: "スクレイピング失敗",
    };
  }
}
