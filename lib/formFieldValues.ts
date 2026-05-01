import type { FormField } from "./formParser";
import type { OwnCompanyProfile } from "./googleSheets";
import { parseJapaneseAddress } from "./addressParse";

export type GeneratedFormField = {
  fieldName: string;
  value: string;
};

const UNSET = "未設定";

/** label / name / placeholder / type を結合した小文字ベースの意味判定用文字列（順序に依存しない） */
function semanticBlob(field: FormField): string {
  return [field.label, field.name, field.placeholder, field.type ?? ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sheet(raw: string | undefined): string {
  return raw?.trim() ?? "";
}

function fieldLabelForDisplay(field: FormField): string {
  const fromLabel = field.label?.trim();
  if (fromLabel) return fromLabel;
  const fromName = field.name?.trim();
  if (fromName) return fromName;
  return field.placeholder?.trim() || "項目";
}

function isAddressLike(b: string): boolean {
  return (
    b.includes("住所") ||
    b.includes("所在地") ||
    b.includes("〒") ||
    b.includes("郵便") ||
    b.includes("都道府県") ||
    b.includes("市区町村") ||
    b.includes("番地") ||
    b.includes("建物") ||
    b.includes("丁目") ||
    b.includes("号室") ||
    b.includes("address") ||
    b.includes("postcode") ||
    (b.includes("zip") && !b.includes("mail")) ||
    b.includes("postal")
  );
}

function isCompanyNameField(b: string): boolean {
  if (b.includes("お名前") || b.includes("氏名") || b.includes("担当者")) {
    return false;
  }
  return (
    b.includes("会社名") ||
    b.includes("法人名") ||
    b.includes("御社名") ||
    b.includes("貴社名") ||
    b.includes("社名") ||
    b.includes("company name") ||
    b.includes("organization") ||
    b.includes("company-name")
  );
}

function isMessageSemantic(b: string, field: FormField): boolean {
  if (isAddressLike(b) && field.tag !== "textarea") {
    return false;
  }
  if (
    b.includes("お問い合わせ") ||
    b.includes("お問合せ") ||
    b.includes("お問い合せ") ||
    b.includes("問い合わせ") ||
    b.includes("メッセージ") ||
    b.includes("message") ||
    b.includes("inquiry") ||
    b.includes("ご用件") ||
    b.includes("ご相談") ||
    b.includes("comment") ||
    b.includes("body") ||
    b.includes("details") ||
    (b.includes("内容") &&
      (b.includes("問い") ||
        b.includes("相談") ||
        b.includes("お問") ||
        field.tag === "textarea"))
  ) {
    return true;
  }
  if (field.tag === "textarea" && !isAddressLike(b)) {
    return true;
  }
  return false;
}

function isEmailSemantic(b: string, field: FormField): boolean {
  if (field.type === "email") return true;
  return (
    b.includes("メール") ||
    b.includes("e-mail") ||
    b.includes("email") ||
    b.includes("mail")
  );
}

function isPhoneSemantic(b: string, field: FormField): boolean {
  if (field.type === "tel") return true;
  return (
    b.includes("電話") ||
    b.includes("携帯") ||
    b.includes("phone") ||
    b.includes("tel") ||
    b.includes("fax")
  );
}

function isContactPersonNameSemantic(b: string): boolean {
  if (isCompanyNameField(b)) {
    return false;
  }
  if (b.includes("お名前") || b.includes("氏名")) {
    return true;
  }
  if (b.includes("名前")) {
    return true;
  }
  if (b.includes("name")) {
    if (
      b.includes("company") ||
      b.includes("message") ||
      b.includes("username") ||
      b.includes("user name") ||
      b.includes("file") ||
      b.includes("domain")
    ) {
      return false;
    }
    return true;
  }
  if (
    b.includes("担当者") ||
    b.includes("ご担当") ||
    b.includes("fullname") ||
    b.includes("full-name") ||
    b.includes("first name") ||
    b.includes("last name") ||
    b.includes("your-name")
  ) {
    return true;
  }
  return false;
}

function resolveFieldValue(
  field: FormField,
  profile: OwnCompanyProfile,
  addressParts: ReturnType<typeof parseJapaneseAddress>,
  formattedMessage: string,
): string {
  const b = semanticBlob(field);

  // CF7 等で name 属性自体が意味を持つ場合（インデックス field_0 ではない）
  const n = (field.name || "").trim().toLowerCase();
  if (n === "your-name" || n === "your_name") {
    return sheet(profile.contact_person_name);
  }
  if (n === "your-email" || n === "your_email") {
    return sheet(profile.contact_person_email);
  }
  if (n === "tel-number" || n === "tel_number") {
    return sheet(profile.contact_person_phone);
  }
  if (n === "your-pref" || n === "your_pref") {
    return sheet(addressParts.pref);
  }
  if (n === "your-city" || n === "your_city") {
    return sheet(addressParts.city);
  }
  if (n === "your-addnum" || n === "your_addnum") {
    return sheet(addressParts.addnum);
  }

  if (
    b.includes("〒") ||
    b.includes("郵便番号") ||
    b.includes("postcode") ||
    (b.includes("zip") && !b.includes("mail")) ||
    b.includes("postal")
  ) {
    return sheet(addressParts.postcode);
  }
  if (b.includes("都道府県") || b.includes("prefecture")) {
    return sheet(addressParts.pref);
  }
  if (b.includes("市区町村") || b.includes("市区") || b.includes("町村")) {
    return sheet(addressParts.city);
  }
  if (
    b.includes("番地") ||
    b.includes("建物") ||
    b.includes("マンション") ||
    b.includes("以降の住所") ||
    b.includes("丁目") ||
    b.includes("号室")
  ) {
    return sheet(addressParts.addnum);
  }
  if (
    field.tag !== "textarea" &&
    (b.includes("住所") ||
      b.includes("所在地") ||
      b.includes("address") ||
      n === "your-address")
  ) {
    return sheet(profile.address);
  }

  if (isCompanyNameField(b)) {
    return sheet(profile.company_name);
  }

  if (isMessageSemantic(b, field)) {
    return formattedMessage.trim();
  }

  if (isEmailSemantic(b, field)) {
    return sheet(profile.contact_person_email);
  }

  if (isPhoneSemantic(b, field)) {
    return sheet(profile.contact_person_phone);
  }

  if (isContactPersonNameSemantic(b)) {
    return sheet(profile.contact_person_name);
  }

  return "";
}

/**
 * フォーム構造と1対1でカードを生成。空は「未設定」。
 * マッピングは label / name / placeholder の意味のみ（field_0 順序は使わない）。
 */
export function buildFormFieldValues(
  formFields: FormField[],
  profile: OwnCompanyProfile,
  formattedSalesMessage: string,
): GeneratedFormField[] {
  const addressParts = parseJapaneseAddress(sheet(profile.address));

  return formFields.map((field) => {
    const raw = resolveFieldValue(
      field,
      profile,
      addressParts,
      formattedSalesMessage,
    );
    const value = raw.trim() ? raw.trim() : UNSET;

    console.log({
      label: field.label,
      name: field.name,
      placeholder: field.placeholder,
      mappedTo: value,
    });

    return {
      fieldName: fieldLabelForDisplay(field),
      value,
    };
  });
}
