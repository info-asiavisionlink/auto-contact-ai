import "dotenv/config";
import axios from "axios";
import Papa from "papaparse";

/**
 * スプレッドシート想定カラム:
 * company_name, name, name_フリガナ, phone, email, postcode, address, service_*, …,
 * lp_url, document_url, line_url, cta_message
 * および従来の contact_person_* ヘッダにも対応
 */
export type OwnCompanyProfile = {
  company_name: string;
  /** シート列 name_フリガナ（ASCIIなら name_furigana） */
  name_furigana: string;
  email: string;
  phone: string;
  postcode: string;
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

type ParsedRow = Record<string, string | undefined>;

function cell(row: ParsedRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

/** ヘッダ名のみでマッピング（列順フォールバックは使わない） */
function normalizeProfileFromRow(row: ParsedRow): OwnCompanyProfile {
  const email = cell(row, ["contact_person_email", "email"]);
  const phone = cell(row, ["contact_person_phone", "phone"]);
  const contactName = cell(row, ["contact_person_name", "name"]);
  const furigana = cell(row, ["name_フリガナ", "name_furigana"]);

  return {
    company_name: cell(row, ["company_name"]),
    name_furigana: furigana,
    email,
    phone,
    postcode: cell(row, ["postcode", "zip", "postal_code", "郵便番号"]),
    address: cell(row, ["address"]),
    service_name: cell(row, ["service_name"]),
    service_description: cell(row, ["service_description"]),
    service_detail: cell(row, ["service_detail"]),
    price_plan: cell(row, ["price_plan"]),
    strength: cell(row, ["strength"]),
    unique_value: cell(row, ["unique_value"]),
    case_study: cell(row, ["case_study"]),
    sales_style: cell(row, ["sales_style"]),
    contact_person_name: contactName,
    contact_person_email: email,
    contact_person_phone: phone,
    lp_url: cell(row, ["lp_url"]),
    document_url: cell(row, ["document_url"]),
    line_url: cell(row, ["line_url"]),
    cta_message: cell(row, ["cta_message"]),
  };
}

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

    return normalizeProfileFromRow(row);
  } catch {
    throw new Error("スプレッドシート取得失敗");
  }
}
