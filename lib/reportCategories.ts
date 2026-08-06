// The list of things a market can be reported for.
//
// This doubles as the app's statement of what it won't host: the same
// wording appears in the guidelines, in the creation form, and in the
// report dialog, so a creator can't claim they didn't know and a reporter
// doesn't have to invent a rationale.
export interface ReportCategory {
  key: string;
  label: string;
  description: string;
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    key: "violence",
    label: "危害・暴力",
    description: "特定の人の死傷・事故・事件の発生を予想の対象にしている",
  },
  {
    key: "personal",
    label: "私人のプライバシー",
    description: "公人でない個人の私生活・交際・病気などを対象にしている",
  },
  {
    key: "discrimination",
    label: "差別・ヘイト",
    description: "特定の属性への差別・侮辱を含む",
  },
  { key: "sexual", label: "性的・わいせつ", description: "性的な内容を含む" },
  {
    key: "minor",
    label: "未成年に関するもの",
    description: "未成年者を対象にしている",
  },
  {
    key: "illegal",
    label: "違法行為の助長",
    description: "犯罪・薬物・八百長などを助長する",
  },
  {
    key: "manipulation",
    label: "結果を操作できる",
    description: "当事者や関係者が結果を意図的に動かせてしまう",
  },
  {
    key: "unverifiable",
    label: "判定できない",
    description: "何をもって結果とするか客観的に決められない",
  },
  { key: "spam", label: "スパム・重複", description: "荒らし、または既存マーケットの重複" },
  { key: "other", label: "その他", description: "上記に当てはまらないが不適切" },
];

export const REPORT_CATEGORY_KEYS = REPORT_CATEGORIES.map((c) => c.key);

export function reportCategoryLabel(key: string): string {
  return REPORT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
