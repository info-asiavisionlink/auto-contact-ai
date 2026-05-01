import type { OwnCompanyProfile } from "./googleSheets";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 営業文を読みやすく整形（段落・URLブロック）
 */
export function formatSalesMessage(
  raw: string,
  profile: OwnCompanyProfile,
): string {
  const lp = profile.lp_url?.trim() ?? "";
  const doc = profile.document_url?.trim() ?? "";
  const line = profile.line_url?.trim() ?? "";

  let main = raw.trim();
  for (const u of [lp, doc, line].filter(Boolean)) {
    main = main.replace(new RegExp(escapeRegExp(u), "g"), " ");
  }
  main = main.replace(/\s{2,}/g, " ").trim();
  main = main.replace(/。(?=\S)/g, "。\n");
  main = main.replace(/([!?？！])\s*/g, "$1\n");
  main = main.replace(/\n{3,}/g, "\n\n").trim();

  const tail: string[] = [];
  if (lp) tail.push(`▼サービス詳細\n${lp}`);
  if (doc) tail.push(`▼資料\n${doc}`);
  if (line) tail.push(`▼お問い合わせ\n${line}`);

  if (tail.length === 0) return main;

  return main ? `${main}\n\n${tail.join("\n\n")}` : tail.join("\n\n");
}
