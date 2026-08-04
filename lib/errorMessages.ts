// Shared client-side error copy. Every message the API can return should
// have an entry here — anything unmapped falls through to a generic
// "failed" string, which is what made a plain session timeout look like a
// mysterious form bug.
export const API_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "ログインの有効期限が切れています。ログインし直してください。",
  forbidden: "この操作を行う権限がありません。",
  invalid_input: "入力内容を確認してください。",
  insufficient_balance: "ポイント残高が不足しています。",
  market_not_open: "このマーケットは受付を終了しています。",
  market_not_found: "マーケットが見つかりません。",
  article_not_found: "ニュース記事が見つかりません。",
  invalid_amount: "金額を正しく入力してください。",
  invalid_outcome: "選択肢が無効です。",
  invalid_outcome_options: "選択肢は2〜8個で入力してください。",
  invalid_outcome_key: "選択肢を空欄にしないでください。",
  duplicate_outcome_keys: "選択肢が重複しています。",
  reserved_outcome_key: "その選択肢名は使用できません。",
  home_away_required: "ホーム・アウェイチームを入力してください。",
  kickoff_must_be_future: "締切日時は未来の日時にしてください。",
  invalid_market_kind: "お題の種類が無効です。",
  already_voted: "既に投票済みです。",
  limit_reached: "上限に達しています。",
  duplicate_completion: "既に完了済みです。",
};

export function apiErrorMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return API_ERROR_MESSAGES[code] ?? fallback;
}

// True when the failure means the user's session is gone, so the caller
// can send them to the login page instead of just showing text.
export function isAuthError(code: string | undefined): boolean {
  return code === "unauthorized";
}
