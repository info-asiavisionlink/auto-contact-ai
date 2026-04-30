import OpenAI from "openai";
import type { CompanyInfo } from "./scraper";
import type { FormField } from "./formParser";
import type { OwnCompanyProfile } from "./googleSheets";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type GeneratedField = {
  fieldName: string;
  value: string;
};

type GenerationResult = {
  salesMessage: string;
  fields: GeneratedField[];
};

function normalizeGeneratedMessage(
  baseMessage: string,
  ownCompanyInfo: OwnCompanyProfile,
): string {
  const trimmed = baseMessage.trim();
  const sections = [trimmed];

  if (ownCompanyInfo.lp_url) {
    sections.push(`サービス詳細：\n${ownCompanyInfo.lp_url}`);
  }
  if (ownCompanyInfo.document_url) {
    sections.push(`資料はこちら：\n${ownCompanyInfo.document_url}`);
  }
  if (ownCompanyInfo.line_url) {
    sections.push(`お問い合わせ：\n${ownCompanyInfo.line_url}`);
  }

  return sections.filter(Boolean).join("\n\n");
}

export async function generateSalesAndFields(params: {
  ownCompanyInfo: OwnCompanyProfile;
  targetCompany: CompanyInfo;
  formFields: FormField[];
}): Promise<GenerationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY が未設定です。");
  }

  const { ownCompanyInfo, targetCompany, formFields } = params;

  const prompt = `
あなたは法人営業のアシスタントです。
以下の情報を使って、自然で丁寧な営業文と、問い合わせフォーム各項目に入れる最適な入力値を作成してください。
出力は必ずJSONのみ。

## 自社情報（スプレッドシート）
${JSON.stringify(ownCompanyInfo, null, 2)}

## 相手企業情報
会社名: ${targetCompany.companyName}
住所: ${targetCompany.address}
電話番号: ${targetCompany.phone}
補足テキスト: ${targetCompany.rawText}

## 問い合わせフォーム項目
${JSON.stringify(formFields, null, 2)}

## 営業文ルール（厳守）
- 約300文字
- 営業マンレベルの説得力
- 相手企業とのマッチング理由を明確化
- 自社サービス（エルラン）の内容を具体的に説明
- CTAを必ず入れる
- 次の構成で作成する：
  1) 相手に合わせた導入
  2) 課題仮説
  3) 自社サービス説明
  4) マッチング理由
  5) CTA
- URLが空でなければ自然に含める：
  - サービス詳細 → lp_url
  - 資料 → document_url
  - お問い合わせ → line_url

## フォーム入力ルール（厳守）
- 「内容」「お問い合わせ内容」「message」「本文」に該当する項目の value は salesMessage と同じ内容にすること
- 氏名、メール、電話は自社情報の担当者情報を優先して埋めること

## 出力フォーマット
{
  "salesMessage": "営業文",
  "fields": [
    { "fieldName": "項目名", "value": "入力値" }
  ]
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "sales_form_output",
        schema: {
          type: "object",
          properties: {
            salesMessage: { type: "string" },
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fieldName: { type: "string" },
                  value: { type: "string" },
                },
                required: ["fieldName", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["salesMessage", "fields"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("OpenAIレスポンスの解析に失敗しました。");
  }

  const parsed = JSON.parse(text) as GenerationResult;
  const salesMessage = normalizeGeneratedMessage(parsed.salesMessage, ownCompanyInfo);
  const fields = parsed.fields.map((field) => {
    const name = field.fieldName.toLowerCase();
    const isMessageField =
      name.includes("内容") ||
      name.includes("お問い合わせ") ||
      name.includes("message") ||
      name.includes("本文");

    if (isMessageField) {
      return { ...field, value: salesMessage };
    }
    return field;
  });

  return { salesMessage, fields };
}
