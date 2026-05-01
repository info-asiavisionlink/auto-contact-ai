/**
 * 日本の住所文字列を正規表現で分解（フォーム入力用）
 *
 * 入力例: 東京都千代田区丸の内2-6-1 Marunouchi BRICK SQUARE 4F
 *
 * 分解できない場合: pref / city は空、addnum に address（郵便番号表記は除去済みの残り）をそのまま使用
 */

export type ParsedOwnAddress = {
  /** 〒123-4567 形式（あれば） */
  postcode: string;
  /** 都道府県 */
  pref: string;
  /** 市区町村（政令市の「市＋区」は可能な限り連結） */
  city: string;
  /** 番地・丁目・建物名・英字表記など（市区町村以降） */
  addnum: string;
};

const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

const PREF_PATTERN = new RegExp(
  `^(${PREFECTURES.slice()
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
);

/** 先頭の市区町村ブロック（非貪欲＋区|市|町|村で終端） */
const CITY_BLOCK = /^(.+?(?:区|市|町|村))/;
/** 政令市のあとに続く「〇〇区」 */
const WARD_AFTER_CITY = /^(.+?区)/;

function stripPostalCode(s: string): { rest: string; postcode: string } {
  const m = s.match(/^\s*〒?\s*(\d{3})-?(\d{4})\s*/);
  if (!m) return { rest: s.trim(), postcode: "" };
  return {
    rest: s.slice(m[0].length).trim(),
    postcode: `${m[1]}-${m[2]}`,
  };
}

/**
 * 住所を pref / city / addnum に分解する。
 * 分解不能時は addnum に残り全文（郵便番号のみ先頭から除去済み）
 */
export function parseJapaneseAddress(raw: string): ParsedOwnAddress {
  const empty: ParsedOwnAddress = {
    postcode: "",
    pref: "",
    city: "",
    addnum: "",
  };

  if (!raw?.trim()) return empty;

  const { rest: withoutPostal, postcode } = stripPostalCode(raw.trim());

  const prefMatch = withoutPostal.match(PREF_PATTERN);
  if (!prefMatch) {
    return {
      postcode,
      pref: "",
      city: "",
      addnum: withoutPostal,
    };
  }

  const pref = prefMatch[1];
  const afterPref = withoutPostal.slice(pref.length).trim();

  const cityMatch = afterPref.match(CITY_BLOCK);
  if (!cityMatch) {
    return {
      postcode,
      pref,
      city: "",
      addnum: afterPref,
    };
  }

  let city = cityMatch[1].trim();
  let rest = afterPref.slice(cityMatch[0].length).trim();

  if (/市$/.test(city) && rest.length > 0 && !/^\d/.test(rest)) {
    const ward = rest.match(WARD_AFTER_CITY);
    if (ward && /区$/.test(ward[1])) {
      city = `${city}${ward[1]}`;
      rest = rest.slice(ward[0].length).trim();
    }
  }

  return {
    postcode,
    pref,
    city,
    addnum: rest,
  };
}
