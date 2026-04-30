import "dotenv/config";
import axios from "axios";
import Papa from "papaparse";

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

type ParsedRow = Record<string, string | undefined>;

export async function getCompanyProfileFromSheet(): Promise<OwnCompanyProfile> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID が未設定です。");
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const response = await axios.get<string>(csvUrl);
    const parsed = Papa.parse<ParsedRow>(response.data, {
      header: true,
      skipEmptyLines: true,
    });

    const row = parsed.data[0];
    if (!row) throw new Error("empty");

    const profile = PROFILE_KEYS.reduce((acc, key, index) => {
      const fromHeader = row[key];
      const fromIndex = Object.values(row)[index];
      acc[key] = (fromHeader ?? fromIndex ?? "").toString().trim();
      return acc;
    }, {} as OwnCompanyProfile);

    return profile;
  } catch {
    throw new Error("スプレッドシート取得失敗");
  }
}
