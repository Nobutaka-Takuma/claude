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
  already_bet_other_outcome:
    "このマーケットでは既に別の選択肢にベットしています。同じ選択肢への追加ベットはできますが、別の選択肢に賭けるには先に既存のベットを取り消してください。",
  already_challenged: "このマーケットには既に異議が申し立てられ、DAO投票中です。",
  bet_not_found: "ベットが見つかりません。",
  bet_not_active: "このベットは既に精算済みまたは取消済みです。",
  market_not_disputable: "このマーケットは現在異議を申し立てられる状態ではありません。",
  market_not_awaiting_result: "このマーケットはまだ結果を提案できる状態ではありません。",
  market_not_settleable: "このマーケットは既に確定しています。",
  resolves_at_before_close: "結果判定の予定日時は、ベット締切より後にしてください。",
  invalid_dispute_window: "異議申し立て期間の指定が不正です。",
  article_not_found_create: "元にするニュース記事が見つかりません。",
  market_not_open_for_voting: "このマーケットは賛成投票を受け付けていません。",
  invalid_seed_bps: "初期賞金の割合の設定が不正です。",
  user_not_found: "アカウントが見つかりません。ログインし直してください。",
  task_not_found: "タスクが見つかりません。",
  task_inactive: "このタスクは現在受付を停止しています。",
  task_not_started: "このタスクはまだ開始されていません。",
  task_ended: "このタスクは終了しました。",
  completion_limit_reached: "このタスクの実行回数が上限に達しています。",
  server_error: "サーバー側でエラーが発生しました。",
  // Raised when the running code expects a table, column, or function the
  // database doesn't have — almost always a `git pull` without a
  // `npm run migrate`. Says what to do rather than what broke.
  schema_out_of_date:
    "アプリの更新にデータベースが追いついていません。アプリを止めて `npm run migrate` を実行し、もう一度お試しください。",
};

// Zod rejects the whole body with one code, which tells the user nothing
// about which field is wrong. These map the API's field-level detail to
// something actionable.
export const FIELD_ERROR_MESSAGES: Record<string, string> = {
  title: "質問文は3文字以上120文字以内で入力してください。",
  closesAt: "ベット締切日時を入力してください。",
  kickoffTime: "ベット締切日時を入力してください。",
  resolvesAt: "結果判定の予定日時の形式が不正です。",
  homeTeam: "ホームチーム名を入力してください。",
  awayTeam: "アウェイチーム名を入力してください。",
  outcomeOptions: "選択肢は2〜8個、それぞれ空欄でなく入力してください。",
  matchweek: "第何節は1〜99の数字で入力してください。",
  league: "大会・リーグ名は60文字以内で入力してください。",
  description: "補足説明は2000文字以内で入力してください。",
  category: "カテゴリの指定が不正です。",
  newsArticleId: "紐付けるニュース記事の指定が不正です。",
  marketKind: "お題の種類を選び直してください。",
  outcome: "選択肢が正しく選ばれていません。",
  amount: "金額を正しく入力してください。",
  reason: "理由を入力してください。",
};

// Falls back to naming the offending fields rather than returning null:
// "which field" is useful even when we have no tailored sentence for it,
// and silently dropping it is how a validation failure turned into a
// featureless "failed" message.
export function fieldErrorMessage(fields: string[] | undefined): string | null {
  if (!fields || fields.length === 0) return null;
  const known = fields.map((f) => FIELD_ERROR_MESSAGES[f]).filter(Boolean);
  if (known.length > 0) return known.join(" ");
  const unknown = fields.filter((f) => !FIELD_ERROR_MESSAGES[f]);
  return unknown.length > 0 ? `入力内容を確認してください。（項目: ${unknown.join(", ")}）` : null;
}

// `detail` is the server's raw explanation. It's appended whenever the
// code isn't one we have Japanese copy for, so an unforeseen failure still
// tells the user *something* they can report, instead of a dead end.
export function apiErrorMessage(
  code: string | undefined,
  fallback: string,
  detail?: string | null
): string {
  const mapped = code ? API_ERROR_MESSAGES[code] : undefined;
  if (mapped) return mapped;
  const reason = detail || (code && code !== "unknown" ? code : null);
  return reason ? `${fallback}（理由: ${reason}）` : fallback;
}

// True when the failure means the user's session is gone, so the caller
// can send them to the login page instead of just showing text.
export function isAuthError(code: string | undefined): boolean {
  return code === "unauthorized";
}
