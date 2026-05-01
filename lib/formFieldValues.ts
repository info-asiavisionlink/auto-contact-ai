import type { FormField } from "./formParser";
import type { OwnCompanyProfile } from "./googleSheets";
import { parseJapaneseAddress } from "./addressParse";

export type GeneratedFormField = {
  fieldName: string;
  value: string;
};

const UNSET = "未設定";

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

/** ラベル／プレースホルダ用（name 属性は含めない — 誤マッチ防止） */
function labelText(field: FormField): string {
  return `${field.label ?? ""} ${field.placeholder ?? ""}`.trim();
}

function labelLower(field: FormField): string {
  return labelText(field).toLowerCase();
}

function containsHttp(s: string): boolean {
  return /https?:\/\//i.test(s);
}

function stripUrlsForNonMessage(s: string): string {
  return s.replace(/https?:\/\/\S+/gi, "").replace(/\s{2,}/g, " ").trim();
}

/** メール欄に URL を絶対に入れない */
function emailValue(profile: OwnCompanyProfile): string {
  let v = sheet(profile.contact_person_email);
  if (!v || containsHttp(v)) {
    v = sheet(profile.email);
  }
  if (containsHttp(v)) {
    v = "";
  }
  return v;
}

/** 氏名欄に URL を入れない */
function personNameValue(profile: OwnCompanyProfile): string {
  let v = sheet(profile.contact_person_name);
  if (containsHttp(v)) {
    v = "";
  }
  return v;
}

function phoneValue(profile: OwnCompanyProfile): string {
  let v = sheet(profile.contact_person_phone);
  if (!v || containsHttp(v)) {
    v = sheet(profile.phone);
  }
  if (containsHttp(v)) {
    v = "";
  }
  return v;
}

/** 厳格: ラベル／プレースホルダに「問い合わせ」「内容」「message」のいずれか（textarea だけでは不可） */
function isMessageLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    t.includes("問い合わせ") ||
    t.includes("内容") ||
    t.includes("message")
  );
}

function isEmailLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    t.includes("メール") ||
    t.includes("e-mail") ||
    /\bemail\b/.test(t)
  );
}

function isPhoneLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    t.includes("電話") ||
    t.includes("携帯") ||
    t.includes("fax") ||
    /\bphone\b/.test(t) ||
    /\btel\b/.test(t)
  );
}

function isPersonNameLabel(field: FormField): boolean {
  const t = labelLower(field);
  if (
    t.includes("会社名") ||
    t.includes("法人名") ||
    t.includes("社名") ||
    t.includes("company name") ||
    t.includes("organization")
  ) {
    return false;
  }
  return (
    t.includes("お名前") ||
    t.includes("氏名") ||
    t.includes("名前") ||
    /\bname\b/.test(t)
  );
}

function isCompanyNameLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    t.includes("会社名") ||
    t.includes("法人名") ||
    t.includes("御社名") ||
    t.includes("貴社名") ||
    (t.includes("社名") && !t.includes("氏名") && !t.includes("お名前")) ||
    t.includes("company name") ||
    t.includes("organization")
  );
}

function isPostcodeLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    t.includes("〒") ||
    t.includes("郵便") ||
    t.includes("postcode") ||
    t.includes("zip") ||
    t.includes("postal")
  );
}

function isPrefLabel(field: FormField): boolean {
  return labelLower(field).includes("都道府県");
}

function isCityLabel(field: FormField): boolean {
  const t = labelLower(field);
  return t.includes("市区町村") || t.includes("市区");
}

function isStreetLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    t.includes("番地") ||
    t.includes("建物") ||
    t.includes("丁目") ||
    t.includes("号室") ||
    t.includes("以降の住所")
  );
}

function isFullAddressLabel(field: FormField): boolean {
  const t = labelLower(field);
  return (
    (t.includes("住所") || t.includes("所在地") || t.includes("address")) &&
    field.tag !== "textarea"
  );
}

/**
 * ① name 完全一致 → ② label 意味 → ③ input type → ④ 空（未設定）
 * URLのよそ流し禁止。メール・氏名・電話は http を含んだらシート値に戻すか空。
 */
function resolveFieldValue(
  field: FormField,
  profile: OwnCompanyProfile,
  addressParts: ReturnType<typeof parseJapaneseAddress>,
  formattedMessage: string,
): string {
  const n = (field.name || "").trim().toLowerCase();

  // ① name 属性 完全一致（最優先）
  if (
    n === "your-name" ||
    n === "your_name" ||
    n === "fullname" ||
    n === "first_name" ||
    n === "last_name"
  ) {
    return personNameValue(profile);
  }
  if (n === "name" && field.tag !== "textarea") {
    return personNameValue(profile);
  }
  if (n === "company" || n === "company_name" || n === "organization") {
    return sheet(profile.company_name);
  }
  if (
    n === "your-email" ||
    n === "your_email" ||
    n === "e-mail" ||
    n === "mail"
  ) {
    return emailValue(profile);
  }
  if (n === "email") {
    return emailValue(profile);
  }
  if (n === "tel-number" || n === "tel_number" || n === "your-tel") {
    return phoneValue(profile);
  }
  if (n === "tel" || n === "phone" || n === "telephone") {
    return phoneValue(profile);
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
  if (n === "postcode" || n === "zip" || n === "postal") {
    return sheet(profile.postcode) || sheet(addressParts.postcode);
  }
  if (n === "your-address" || n === "address") {
    return sheet(profile.address);
  }
  if (
    n === "message" ||
    n === "your-message" ||
    n === "your_message" ||
    n === "inquiry" ||
    n === "body" ||
    n === "content" ||
    n === "comment"
  ) {
    return formattedMessage.trim();
  }

  // ② label / placeholder のみで意味一致（順序: 問い合わせ → 会社 → 住所細目 → 氏名・メール・電話）
  if (isMessageLabel(field)) {
    return formattedMessage.trim();
  }
  if (isCompanyNameLabel(field)) {
    return sheet(profile.company_name);
  }
  if (isPostcodeLabel(field)) {
    return sheet(profile.postcode) || sheet(addressParts.postcode);
  }
  if (isPrefLabel(field)) {
    return sheet(addressParts.pref);
  }
  if (isCityLabel(field)) {
    return sheet(addressParts.city);
  }
  if (isStreetLabel(field)) {
    return sheet(addressParts.addnum);
  }
  if (isFullAddressLabel(field)) {
    return sheet(profile.address);
  }
  if (isPersonNameLabel(field)) {
    return personNameValue(profile);
  }
  if (isEmailLabel(field)) {
    return emailValue(profile);
  }
  if (isPhoneLabel(field)) {
    return phoneValue(profile);
  }

  // ③ input type
  if (field.type === "email") {
    return emailValue(profile);
  }
  if (field.type === "tel") {
    return phoneValue(profile);
  }

  return "";
}

/**
 * フォーム1件につき1カード。空は「未設定」。URLの誤混入を各カテゴリで排除。
 */
export function buildFormFieldValues(
  formFields: FormField[],
  profile: OwnCompanyProfile,
  formattedSalesMessage: string,
): GeneratedFormField[] {
  const addressParts = parseJapaneseAddress(sheet(profile.address));
  const pc = sheet(profile.postcode);
  if (pc && !addressParts.postcode) {
    addressParts.postcode = pc;
  }

  return formFields.map((field) => {
    let raw = resolveFieldValue(
      field,
      profile,
      addressParts,
      formattedSalesMessage,
    );

    // メール系: 保険で URL 混入を除去
    if (
      field.type === "email" ||
      isEmailLabel(field) ||
      ["your-email", "your_email", "email", "e-mail", "mail"].includes(
        (field.name || "").trim().toLowerCase(),
      )
    ) {
      if (containsHttp(raw)) {
        raw = emailValue(profile);
      }
    }
    // 氏名系
    if (
      isPersonNameLabel(field) ||
      ["your-name", "your_name", "name", "fullname"].includes(
        (field.name || "").trim().toLowerCase(),
      )
    ) {
      if (containsHttp(raw)) {
        raw = personNameValue(profile);
      }
      raw = stripUrlsForNonMessage(raw);
    }
    // 電話系
    if (
      isPhoneLabel(field) ||
      ["tel", "phone", "tel-number", "tel_number"].includes(
        (field.name || "").trim().toLowerCase(),
      )
    ) {
      if (containsHttp(raw)) {
        raw = phoneValue(profile);
      }
    }

    const value = raw.trim() ? raw.trim() : UNSET;

    console.log({
      label: field.label,
      type: field.type,
      name: field.name,
      assignedValue: value,
    });

    return {
      fieldName: fieldLabelForDisplay(field),
      value,
    };
  });
}
