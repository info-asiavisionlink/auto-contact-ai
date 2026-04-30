import "dotenv/config";
import { google } from "googleapis";

export type OwnCompanyProfile = {
  company_name: string;
  email: string;
  phone: string;
  address: string;
  service_name: string;
  service_description: string;
  service_detail: string;
  price_plan: string;
  strength: string;
  unique_value: string;
  case_study: string;
  sales_style: string;
  contact_person_name: string;
  contact_person_email: string;
  contact_person_phone: string;
  lp_url: string;
  document_url: string;
  line_url: string;
  cta_message: string;
};

const PROFILE_KEYS: Array<keyof OwnCompanyProfile> = [
  "company_name",
  "email",
  "phone",
  "address",
  "service_name",
  "service_description",
  "service_detail",
  "price_plan",
  "strength",
  "unique_value",
  "case_study",
  "sales_style",
  "contact_person_name",
  "contact_person_email",
  "contact_person_phone",
  "lp_url",
  "document_url",
  "line_url",
  "cta_message",
];

export async function getCompanyProfileFromSheet(): Promise<OwnCompanyProfile> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID が未設定です。");
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "credentials.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Lラン会社概要!A2:S2",
    });

    const values = response.data.values?.[0] ?? [];
    if (!values.length) {
      throw new Error("スプレッドシートにデータがありません。");
    }

    const profile = PROFILE_KEYS.reduce((acc, key, index) => {
      acc[key] = values[index]?.toString().trim() ?? "";
      return acc;
    }, {} as OwnCompanyProfile);

    return profile;
  } catch {
    throw new Error("Googleスプレッドシートの取得に失敗しました");
  }
}
