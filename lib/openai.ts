import OpenAI from "openai";
import type { CompanyInfo } from "./scraper";
import type { FormField } from "./formParser";

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

export async function generateSalesAndFields(params: {
  ownCompanyInfo: string;
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

## 自社情報
${ownCompanyInfo}

## 相手企業情報
会社名: ${targetCompany.companyName}
住所: ${targetCompany.address}
電話番号: ${targetCompany.phone}
補足テキスト: ${targetCompany.rawText}

## 問い合わせフォーム項目
${JSON.stringify(formFields, null, 2)}

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

  return JSON.parse(text) as GenerationResult;
}
