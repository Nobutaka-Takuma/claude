// The category taxonomy shared by the create form, the market list
// filters and every card icon. Kept in one place so a new category shows
// up everywhere at once.
export interface CategoryDef {
  key: string;
  label: string;
  icon: string;
  // Sports categories collect a league + matchweek, which is what makes
  // hand-created fixtures findable ("J1リーグ 第21節") now that the
  // fixture API is out of reach.
  isSport?: boolean;
  leagueSuggestions?: string[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: "soccer",
    label: "サッカー",
    icon: "⚽",
    isSport: true,
    leagueSuggestions: ["J1リーグ", "J2リーグ", "J3リーグ", "天皇杯", "ルヴァンカップ", "プレミアリーグ", "ラ・リーガ", "チャンピオンズリーグ"],
  },
  {
    key: "baseball",
    label: "野球",
    icon: "⚾",
    isSport: true,
    leagueSuggestions: ["セ・リーグ", "パ・リーグ", "交流戦", "日本シリーズ", "MLB"],
  },
  { key: "sports_other", label: "その他スポーツ", icon: "🏅", isSport: true },
  { key: "economy", label: "経済", icon: "💹" },
  { key: "finance", label: "金融・為替", icon: "💴" },
  { key: "politics", label: "政治", icon: "🏛" },
  { key: "tech", label: "テック", icon: "💻" },
  { key: "entertainment", label: "エンタメ", icon: "🎬" },
  { key: "general", label: "その他", icon: "❓" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryDef(key: string | null | undefined): CategoryDef {
  return (key && BY_KEY.get(key)) || CATEGORIES[CATEGORIES.length - 1];
}

export function categoryIcon(key: string | null | undefined): string {
  return categoryDef(key).icon;
}

export function categoryLabel(key: string | null | undefined): string {
  const def = key ? BY_KEY.get(key) : undefined;
  // Fall back to the raw value so categories seeded before this list
  // existed still render as something meaningful.
  return def ? def.label : (key ?? "その他");
}
