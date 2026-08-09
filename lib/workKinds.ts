// マイクロワークの種別ラベル。
//
// tasks.work_kind は enum ではなく自由記述にしてある。仕事の種類は運営が
// 案件を取ってくるたびに増えるもので、そのたびにマイグレーションを書いて
// デプロイするような速度では回らない。ここに無いキーはそのまま表示される
// ので、新しい種別を試すのに変更は要らず、定着したらここに1行足す。

export const WORK_KIND_LABELS: Record<string, string> = {
  ad_view: "広告視聴",
  survey: "アンケート",
  data_labeling: "データ分類・タグ付け",
  transcription: "文字起こし・書き起こし",
  translation: "翻訳・要約",
  photo_report: "写真の撮影・提出",
  field_check: "現地確認・店舗調査",
  content_check: "内容チェック・目視確認",
  ai_feedback: "AI出力の評価",
  app_test: "アプリ・サイトの動作テスト",
  ugc: "レビュー・口コミ投稿",
  other: "その他",
};

export function workKindLabel(kind: string | null | undefined): string {
  if (!kind) return "マイクロワーク";
  return WORK_KIND_LABELS[kind] ?? kind;
}

// 検収方法の説明。管理画面でタスクを作るときにここを読んで選ぶので、
// 「何が起きるか」だけでなく「いつ選ぶべきか」まで書いてある。
export const VERIFICATION_MODE_LABELS: Record<string, string> = {
  auto: "自動承認",
  review: "運営が検収",
  quorum: "ユーザー同士の相互チェック",
  none: "検収なし",
};

export const VERIFICATION_MODE_HELP: Record<string, string> = {
  auto:
    "提出と同時に支払います。広告ネットワークのSSVのように、外部が既に検証済みの成果だけに使ってください。",
  review:
    "提出は保留され、管理画面で1件ずつ承認したときに支払います。単価の高い作業・件数の少ない作業向け。",
  quorum:
    "他のユーザーが規定数だけ「OK」と判定したら支払います。件数の多い作業はこれが基本。チェック側にも報酬を設定してください。",
  none: "検収せず即時に支払います。原資のない社内向け販促タスク以外には使わないでください。",
};

// 提出フォームの雛形。「新しい種類の仕事をどう出すか」が一番わかりにくい
// ところなので、管理画面のタスク作成フォームからそのまま差し込める形で
// 用意しておく。
export const WORK_FORM_TEMPLATES: Record<string, string> = {
  data_labeling: JSON.stringify(
    {
      instructions: "表示された画像がどのカテゴリに当てはまるかを選んでください。",
      reference_url: "https://example.com/items/1",
      fields: [
        { id: "category", label: "カテゴリ", type: "select", options: ["食品", "衣類", "家電", "その他"], required: true },
        { id: "note", label: "判断に迷った点（任意）", type: "textarea" },
      ],
    },
    null,
    2
  ),
  photo_report: JSON.stringify(
    {
      instructions: "対象の店舗の外観を撮影し、アップロード先のURLを貼ってください。",
      fields: [
        { id: "photo_url", label: "写真のURL", type: "url", required: true },
        { id: "shop_name", label: "店舗名", type: "text", required: true },
        { id: "visited_at", label: "訪問日時", type: "text", required: true, placeholder: "2026-08-09 14:30" },
      ],
    },
    null,
    2
  ),
  transcription: JSON.stringify(
    {
      instructions: "音声を聞いて、話されている内容をそのまま書き起こしてください。",
      reference_url: "https://example.com/audio/1.mp3",
      fields: [{ id: "text", label: "書き起こし", type: "textarea", required: true }],
    },
    null,
    2
  ),
};
