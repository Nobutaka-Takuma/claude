export const CONTACT_CATEGORIES = [
  { key: "account", label: "ログイン・アカウントについて" },
  { key: "points", label: "ポイント・報酬について" },
  { key: "task", label: "タスク・お仕事について" },
  { key: "market", label: "マーケット・判定について" },
  { key: "report", label: "不適切な内容の報告" },
  { key: "privacy", label: "個人情報の開示・訂正・削除" },
  { key: "business", label: "広告掲載・提携のご相談" },
  { key: "other", label: "その他" },
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]["key"];

export const CONTACT_CATEGORY_KEYS = CONTACT_CATEGORIES.map((c) => c.key) as [
  ContactCategory,
  ...ContactCategory[],
];

export function contactCategoryLabel(key: string): string {
  return CONTACT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
