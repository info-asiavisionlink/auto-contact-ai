import type { FormField } from "./formParser";
import type { OwnCompanyProfile } from "./googleSheets";
import { parseJapaneseAddress } from "./addressParse";

export type GeneratedFormField = {
  fieldName: string;
  value: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** スプレッドシートの値。存在すればそのまま、なければ空文字。 */
function sheet(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  return t;
}

function fieldLabelForDisplay(field: FormField): string {
  const fromLabel = field.label?.trim();
  if (fromLabel) return fromLabel;
  const fromName = field.name?.trim();
  if (fromName) return fromName;
  return field.placeholder?.trim() || "項目";
}

/**
 * フォーム項目の値はすべて「自社（Googleスプレッドシート）」のみ。
 * 相手企業のスクレイピング結果はここでは一切使わない。
 * 営業文テキストは salesMessage のみ（問い合わせ内容系）。
 */
export function buildFormFieldValues(
  formFields: FormField[],
  profile: OwnCompanyProfile,
  salesMessage: string,
): GeneratedFormField[] {
  const addressParts = parseJapaneseAddress(sheet(profile.address));

  const result: GeneratedFormField[] = [];

  for (const field of formFields) {
    const name = norm(field.name);
    const label = field.label ?? "";
    const labelN = norm(label);
    const haystack = `${name} ${labelN} ${norm(field.placeholder)}`;

    let value = "";

    // --- 明示 name マッピング（要件どおり・自社のみ）---
    if (name === "your-name" || name === "your_name") {
      value = sheet(profile.contact_person_name);
    } else if (name === "your-email" || name === "your_email") {
      value = sheet(profile.contact_person_email);
    } else if (name === "tel-number" || name === "tel_number") {
      value = sheet(profile.contact_person_phone);
    } else if (name === "your-pref" || name === "your_pref") {
      value = sheet(addressParts.pref);
    } else if (name === "your-city" || name === "your_city") {
      value = sheet(addressParts.city);
    } else if (name === "your-addnum" || name === "your_addnum") {
      value = sheet(addressParts.addnum);
    } else if (name === "name" || name === "fullname" || name === "yourname") {
      value = sheet(profile.contact_person_name);
    } else if (name === "email" || name === "mail" || name === "e-mail") {
      value = sheet(profile.contact_person_email);
    } else if (name === "tel" || name === "phone" || name === "telephone") {
      value = sheet(profile.contact_person_phone);
    } else if (
      name === "postcode" ||
      name === "zip" ||
      name === "postal"
    ) {
      value = sheet(addressParts.postcode);
    } else if (
      /氏名|お名前|担当者名/.test(label) &&
      !/会社|法人|御社|貴社/.test(label)
    ) {
      value = sheet(profile.contact_person_name);
    } else if (/メール|e-mail|email|mail/.test(labelN) && field.tag !== "textarea") {
      value = sheet(profile.contact_person_email);
    } else if (/電話|携帯|tel|phone/.test(labelN) && field.tag !== "textarea") {
      value = sheet(profile.contact_person_phone);
    } else if (/郵便|〒|postcode|zip|postal/.test(haystack)) {
      value = sheet(addressParts.postcode);
    } else if (/都道府県/.test(label)) {
      value = sheet(addressParts.pref);
    } else if (/市区町村/.test(label)) {
      value = sheet(addressParts.city);
    } else if (/番地|建物|以降の住所|丁目|号室|マンション/.test(label)) {
      value = sheet(addressParts.addnum);
    } else if (
      field.tag !== "textarea" &&
      (/住所|所在地/.test(label) ||
        name.includes("address") ||
        name === "your-address")
    ) {
      value = sheet(profile.address);
    } else if (
      /会社|社名|法人名/.test(label) ||
      name.includes("company")
    ) {
      value = sheet(profile.company_name);
    } else if (isInquiryContentField(field, haystack)) {
      value = sheet(salesMessage);
    } else {
      value = "";
    }

    if (!value) {
      continue;
    }

    result.push({
      fieldName: fieldLabelForDisplay(field),
      value: value,
    });
  }

  return result;
}

function isInquiryContentField(field: FormField, haystack: string): boolean {
  if (
    /住所|所在地|番地|建物|address|郵便|〒|都道府県|市区町村|丁目|号室/.test(
      haystack,
    )
  ) {
    return false;
  }
  if (field.tag === "textarea") {
    return true;
  }
  if (
    /お問い合わせ|問い合わせ内容|内容|メッセージ|詳細|ご相談|inquiry|message|body|content/.test(
      haystack,
    )
  ) {
    return true;
  }
  return false;
}
