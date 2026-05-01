import type { FormField } from "./formParser";
import type { OwnCompanyProfile } from "./googleSheets";
import { parseJapaneseAddress } from "./addressParse";

export type GeneratedFormField = {
  fieldName: string;
  value: string;
};

const UNSET = "未設定";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** スプレッドシートの値（空は空文字） */
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

function isMessageField(field: FormField, haystack: string): boolean {
  if (
    /住所|所在地|address|郵便|番地|建物|丁目|号室|都道府県|市区町村/.test(
      haystack,
    )
  ) {
    return false;
  }
  if (
    /message|inquiry|body|content|お問い合わせ|問い合わせ|詳細|ご相談|field_3|your-message|contact-message|contact_message|mail-message|your_message|inquiry_message/.test(
      haystack,
    )
  ) {
    return true;
  }
  if (field.tag === "textarea") {
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
  const name = norm(field.name);
  const label = field.label ?? "";
  const labelN = norm(label);
  const haystack = `${name} ${labelN} ${norm(field.placeholder)}`;

  // Contact Form 7 等: field_1 + ラベルで判定
  if (/^field_\d+$/i.test(field.name.trim())) {
    if (/お名前|氏名|ご担当|name/i.test(label)) {
      return sheet(profile.contact_person_name);
    }
    if (/メール|e-mail|email|mail/i.test(label)) {
      return sheet(profile.contact_person_email);
    }
    if (/電話|携帯|tel|phone|TEL/i.test(label)) {
      return sheet(profile.contact_person_phone);
    }
    if (
      field.tag === "textarea" ||
      /お問い合わせ|内容|メッセージ|message|ご用件/.test(label)
    ) {
      return formattedMessage.trim();
    }
  }

  if (name === "your-name" || name === "your_name") {
    return sheet(profile.contact_person_name);
  }
  if (name === "your-email" || name === "your_email") {
    return sheet(profile.contact_person_email);
  }
  if (name === "tel-number" || name === "tel_number") {
    return sheet(profile.contact_person_phone);
  }
  if (name === "your-pref" || name === "your_pref") {
    return sheet(addressParts.pref);
  }
  if (name === "your-city" || name === "your_city") {
    return sheet(addressParts.city);
  }
  if (name === "your-addnum" || name === "your_addnum") {
    return sheet(addressParts.addnum);
  }
  if (name === "name" || name === "fullname" || name === "yourname") {
    return sheet(profile.contact_person_name);
  }
  if (
    name === "email" ||
    name === "mail" ||
    name === "e-mail" ||
    field.type === "email"
  ) {
    return sheet(profile.contact_person_email);
  }
  if (name === "tel" || name === "phone" || name === "telephone") {
    return sheet(profile.contact_person_phone);
  }
  if (name === "postcode" || name === "zip" || name === "postal") {
    return sheet(addressParts.postcode);
  }
  if (/郵便|〒|postcode|zip|postal/.test(haystack)) {
    return sheet(addressParts.postcode);
  }
  if (/都道府県/.test(label)) {
    return sheet(addressParts.pref);
  }
  if (/市区町村/.test(label)) {
    return sheet(addressParts.city);
  }
  if (/番地|建物|以降の住所|丁目|号室|マンション/.test(label)) {
    return sheet(addressParts.addnum);
  }
  if (
    field.tag !== "textarea" &&
    (/住所|所在地/.test(label) ||
      name.includes("address") ||
      name === "your-address")
  ) {
    return sheet(profile.address);
  }
  if (/会社|社名|法人名|御社名|貴社名/.test(label) || name.includes("company")) {
    return sheet(profile.company_name);
  }
  if (/氏名|お名前|担当者名/.test(label) && !/会社|法人|御社|貴社/.test(label)) {
    return sheet(profile.contact_person_name);
  }
  if (/メール|e-mail|email|mail/.test(labelN) && field.tag !== "textarea") {
    return sheet(profile.contact_person_email);
  }
  if (/電話|携帯/.test(labelN) && field.tag !== "textarea") {
    return sheet(profile.contact_person_phone);
  }
  if (isMessageField(field, haystack)) {
    return formattedMessage.trim();
  }

  return "";
}

/**
 * 取得したフォーム構造と1対1でカードを生成。値が空なら「未設定」。
 * 値は自社スプレッドシート＋整形済み営業文のみ。
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
    return {
      fieldName: fieldLabelForDisplay(field),
      value,
    };
  });
}
