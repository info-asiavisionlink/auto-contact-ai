import OpenAI from "openai";
import type { CompanyInfo } from "./scraper";
import type { FormField } from "./formParser";
import type { OwnCompanyProfile } from "./googleSheets";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type SalesMessageResult = {
  salesMessage: string;
};

/** 空でない lp_url / document_url / line_url は営業文に必ず含める（欠けていれば末尾に自然な形で追記） */
function ensureSalesMessageIncludesUrls(
  salesMessage: string,
  profile: OwnCompanyProfile,
): string {
  let out = salesMessage.trim();
  const lp = profile.lp_url?.trim() ?? "";
  const doc = profile.document_url?.trim() ?? "";
  const line = profile.line_url?.trim() ?? "";

  const appendIfMissing = (url: string, lead: string) => {
    if (!url) return;
    if (out.includes(url)) return;
    const block = `${lead}\n${url}`;
    out = out ? `${out}\n\n${block}` : block;
  };

  appendIfMissing(lp, "サービス詳細はこちら：");
  appendIfMissing(doc, "資料はこちら：");
  appendIfMissing(line, "お問い合わせ：");

  return out;
}

/**
 * 営業文のみ生成する。相手企業のスクレイプ情報は文面の最適化にのみ使用し、
 * フォーム入力値は生成しない（自社スプレッドシートで別途埋める）。
 */
export async function generateSalesMessage(params: {
  ownCompanyInfo: OwnCompanyProfile;
  targetCompany: CompanyInfo;
  formFields: FormField[];
}): Promise<SalesMessageResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY が未設定です。");
  }

  const { ownCompanyInfo, targetCompany, formFields } = params;

  const lp = ownCompanyInfo.lp_url?.trim() ?? "";
  const doc = ownCompanyInfo.document_url?.trim() ?? "";
  const line = ownCompanyInfo.line_url?.trim() ?? "";

  const urlRules =
    [
      lp &&
        `lp_url が空でない（現在: 設定あり）→ 必ずそのURL文字列をそのまま含める。文末のCTA付近に「サービス詳細はこちら：」等で自然に誘導してよい。`,
      doc &&
        `document_url が空でない（現在: 設定あり）→ 必ず含める。「資料はこちら：」等で自然に。`,
      line &&
        `line_url が空でない（現在: 設定あり）→ 必ず含める。「お問い合わせ：」等で自然に。`,
    ]
      .filter(Boolean)
      .join("\n") ||
    "（lp_url / document_url / line_url はすべて空のため、URLの追記は不要）";

  const ctaHint =
    ownCompanyInfo.cta_message?.trim() ||
    "次の一手として、資料確認やお打ち合わせをお願いする";

  const prompt = `
あなたは法人営業のプロです。説得力のある営業メッセージを、1本の自然な文章として書いてください。

## 目的
お問い合わせフォームに貼れる「営業メッセージ」1通分。読み手は相手企業の担当者。

## 文体・トーン
- 営業マンが対面・メールで書くレベルの具体性と説得力。過度な敬語の羅列は避け、簡潔に熱量を出す。
- 相手企業の事業・文脈に触れたうえで、なぜ今話すべきかが伝わること。

## 長さ
- 本文のボリュームは**おおよそ300文字**を目安（漢字・かな混じり。280～340字程度で調整）。
- 空でないURLを本文に埋め込む場合は、全体がやや長くなってもよいが、冗長にしない。

## 必須の論理構成（出力では番号・見出しを付けない。1つの自然な文章に溶け込ませる）
思考の順序として次を**必ず**含める：
① **導入**：相手企業の事業・サイト上の特徴に触れ、関心を引く（相手企業名や補足テキストを参照）。
② **課題仮説**：その企業でありがちな課題・機会を1つに絞った仮説を短く提示。
③ **エルランの説明**：自社サービス**「エルラン」**を明示し、スプレッドシートの service_name / service_description / service_detail / strength / unique_value 等に基づき、何をどう解決するサービスかを具体的に説明する（エルラン＝自社の核サービスとして扱う）。
④ **マッチング理由**：なぜその相手にエルランが合うのかを1～2文で論じる。
⑤ **CTA + URL**：行動喚起を必ず入れる。スプレッドシートの cta_message の意図を汲み、次の一手を明確に。空でない lp_url / document_url / line_url は**必ず**文中に埋め込む（下記ルール）。

## CTAのベース文言（必要に応じて言い換え・短縮してよい）
${ctaHint}

## 厳守
- 相手企業のスクレイプ情報は、パーソナライズと仮説づくりにのみ使う。相手の連絡先・社名を自社と取り違えない。
- 自社の事実・サービス内容はスプレッドシートに基づく。捏造しない。
- フォーム用の個別入力値（氏名・メール等）は生成しない。営業メッセージ本文のみ。

## 自社URL（スプレッドシート）— 空でなければ必ず本文に含める
${urlRules}

## 自社情報（スプレッドシート）
${JSON.stringify(ownCompanyInfo, null, 2)}

## 相手企業（仮説・導入の参考。入力値には使わない）
会社名: ${targetCompany.companyName}
補足テキスト: ${targetCompany.rawText}

## 問い合わせフォームの構造（参考のみ）
${JSON.stringify(formFields, null, 2)}

## 出力形式
次のJSONのみ返す。salesMessage は**読みやすい営業文**とし、段落ごとに改行（\\n）を入れてよい。見出し番号（①②など）は付けない。URLは行末に置くなど自然に配置してよい（後工程でも整形される）。
{ "salesMessage": "営業メッセージ本文" }
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "sales_message_only",
        schema: {
          type: "object",
          properties: {
            salesMessage: { type: "string" },
          },
          required: ["salesMessage"],
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

  const parsed = JSON.parse(text) as SalesMessageResult;
  return {
    salesMessage: ensureSalesMessageIncludesUrls(
      parsed.salesMessage,
      ownCompanyInfo,
    ),
  };
}
