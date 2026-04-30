import puppeteer from "puppeteer-core";

export type FormField = {
  tag: "input" | "textarea" | "select";
  type?: string;
  name: string;
  placeholder: string;
  label: string;
};

export async function parseFormFields(url: string): Promise<FormField[]> {
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
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

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
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await browser?.close();
  }
}
