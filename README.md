# Prediction Market DAO — MVP

Polymarket / みらいマーケット的な、労働（広告視聴・アンケート）で貯まるコミュニティ金庫（Treasury）を原資に、サッカーの試合結果からYes/No質問・複数選択肢の問いまで自由に予測できるパリミュチュエル方式のWebアプリのMVP。

設計ドキュメント一式は [`docs/`](./docs) を参照してください（DBスキーマ解説・バックエンドロジック解説・ワイヤーフレーム）。

## 技術スタック

- Next.js (App Router) / TypeScript / Tailwind CSS
- Postgres（Supabase向けに書かれたスキーマ・RPC関数一式を、ローカルではSupabaseプロジェクトの代わりに素のPostgresへ直接適用して動かしています。本番でSupabaseプロジェクトを使う場合は`supabase/migrations/00000000000000_local_dev_auth_shim.sql`だけは適用しないでください — それ以外はSupabase CLIでそのまま`supabase db push`できます）

## セットアップ（ローカル開発）

前提: Node.js 20+、ローカルにPostgres 16が起動していること。

```bash
# 1. 依存関係のインストール
npm install

# 2. DBを作成
createdb prediction_market

# 3. 環境変数を用意（デフォルトのままでOK。スポーツAPI連携はキーなしのモックプロバイダで動きます）
cp .env.example .env.local

# 4. マイグレーションを適用（0000は本番Supabaseには不要 — 上記の注記を参照）
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
# もしくは:
for f in supabase/migrations/*.sql; do psql "postgresql://postgres:postgres@127.0.0.1:5432/prediction_market" -f "$f"; done

# 5. デモ用データを投入（管理者アカウント・タスク・マーケットのseed）
npm run seed
npm run seed-news   # News-Firstフィード(/news)検証用のデモ記事＋紐付けマーケット（任意）

# 6. 開発サーバーを起動
npm run dev
```

http://localhost:3000 を開くとアプリが動きます。

### デモ用アカウント

`npm run seed` で以下の管理者アカウントが作成されます（マーケットの判定確定・精算に使用）。

- メール: `admin@example.com`
- パスワード: `admin12345`

一般ユーザーは `/signup` から自由に登録できます。

### 動作確認（スモークテスト）

Playwrightでゴールデンパス（新規登録 → タスク完了 → ベット → マイページ確認）を自動実行し、スクリーンショットを`scripts/shots/`に保存します。

```bash
npm run dev -- -p 3100 &
SMOKE_TEST_BASE_URL=http://127.0.0.1:3100 npm run smoke-test
```

## 実装済み機能

- 認証（サインアップ / ログイン / セッションCookie）。新規登録時に金庫から**1000ptのウェルカムボーナス**（`SIGNUP_BONUS_POINTS`）
- **マーケットメイカー経済圏**: ユーザーが100pt（`MARKET_CREATION_COST`）を支払うとマーケットを即公開でき、そのマーケットが精算されるとテラ銭の10%（`MARKET_CREATOR_FEE_BPS`）が作成者の報酬になります。盛り上がるほど作成者の取り分が増えるので、人気の出るお題を作るインセンティブが働きます。無料の「提案＋賛成投票」経路も残していますが、そちらに作成者報酬はありません（後述）
- タスクセンター: 広告視聴（デモ版はシミュレーション再生）・アンケート回答 → `complete_task` RPCで自動ポイント付与＆金庫更新
- マーケット一覧・詳細・パリミュチュエル方式のベット（`place_bet` RPC）。**的中者には賭けた分が必ず全額戻り**、そのうえで他の選択肢のプールから運営手数料(テラ銭)を除いた分を山分けします。他の選択肢に誰もベットしていなければ手数料もかからず、賭けた分がそのまま戻ります（後述）
- **お題の形式は自由**: 試合の勝敗（ホーム/引分/アウェイ）だけでなく、Yes/No質問（例:「開幕戦で〇〇選手はスタメン出場するか？」）や、2〜8個の任意の選択肢を持つマーケットも作成できます（`markets.market_kind` + `outcome_options`）
- お題提案 → 賛成票が閾値（既定3票、`MARKET_APPROVAL_THRESHOLD`で変更可）に達すると自動オープン
- Optimistic Oracle: 管理者（本来はスポーツAPI/AIの一次判定に相当）が一次判定を提出（`submit_provisional_result` RPC）→ 異議申し立て期間（既定24時間、デモ用に2分の短縮オプションあり）→ 異議がなければ自動確定・精算、異議が出ればDAO投票の多数決で最終決定（`finalize_expired_markets` RPCが`sync_market_status`と同様にマーケット閲覧のたびに遅延実行される簡易cron）
- 管理者による緊急オーバーライド（オラクルをスキップした即時確定・全額返金での中止）
- **スポーツAPI連携**（`scripts/sync-fixtures.mjs` / `scripts/sync-results.mjs`）: 試合予定の自動取得・マーケット自動生成と、試合結果の自動取得 → 一次判定の自動提出（後述）
- マイページ（ベット履歴・ポイント履歴）
- 金庫（Treasury）ダッシュボード（公開・収益源の内訳）

### パリミュチュエル配当の仕組み（stake-back保証）

他の選択肢に誰も賭けていない場合でも的中者が損をしないよう、テラ銭は「他の選択肢（外れた側）のプール」からのみ徴収します。

- 総プール = 的中した選択肢のプール + 他の選択肢のプール合計
- テラ銭 = 他の選択肢のプール合計 × 手数料率（既定10%）
- 的中者への配当 = 自分の賭け金（全額） + 自分の賭け金 ÷ 的中した選択肢のプール × (他の選択肢のプール合計 − テラ銭)

他の選択肢のプールが0（誰も逆張りしていない）なら、テラ銭も0になり、賭けた分がそのまま戻ります。

### マーケットの作り方（2つの経路）

| | 有料（推奨） | 無料 |
|---|---|---|
| コスト | 100pt（金庫へ） | 0pt |
| 公開まで | **即時** | 賛成3票が集まるまで |
| 作成者報酬 | テラ銭の**10%** | なし |
| 入口 | `/news` の各記事、または `/markets/propose` | `/markets/propose` |

有料経路では、精算時のテラ銭（外れた側のプールの10%）がさらに分割され、その10%が作成者に、残り90%が金庫に入ります。マーケットが中止（void）になった場合は、作成者に非がないため作成料100ptは返金されます。

### マーケットの形式（お題の種類）

3種類のお題を作成できます。

| market_kind | 内容 | outcome_options の例 |
|---|---|---|
| `match_winner` | 試合の勝敗（3択） | ホーム/引分/アウェイをチーム名から自動生成 |
| `binary` | Yes/No質問 | `[{"key":"yes","label":"はい"},{"key":"no","label":"いいえ"}]` |
| `multi_outcome` | 自由な複数選択肢（2〜8個） | 提案者が入力したラベルから生成（`key`は`opt1, opt2, ...`） |

ベット・配当計算・Optimistic Oracle・DAO投票はすべて`outcome_options`ベースの汎用ロジックで動作するため、選択肢の数や種類に関わらず同じ仕組みで扱えます。

### スポーツAPI連携（マーケット自動生成・結果自動取得）

```bash
npm run sync-fixtures   # 試合予定を取得し、markets を自動生成/更新（external_ref で冪等）
npm run sync-results    # ロック済みの自動生成マーケットの結果を取得し、一次判定を自動提出
```

- デフォルトは `SPORTS_API_PROVIDER=mock`（`.env.example`参照）で、APIキーなしで動作するダミーのJ1風フィクスチャを生成します。まず動作を確認したい場合はこのままで大丈夫です。
- 本番接続する場合は `SPORTS_API_PROVIDER=api_football` にし、[api-football.com](https://www.api-football.com/) の無料枠キーを `API_FOOTBALL_KEY` に設定してください（J1リーグをカバーする数少ない無料枠API）。`API_FOOTBALL_LEAGUE_ID`（既定98）・`API_FOOTBALL_SEASON`は同社の`/leagues`エンドポイントで実際の値を確認のうえ調整してください。
- `sync-results`は試合終了を検知しても即座には精算せず、`submit_provisional_result`経由でOptimistic Oracleの異議申し立て期間を開始します（管理者が手動確定する場合と同じ経路）。
- 本番運用では両スクリプトを1日1回程度のcron（例: `pg_cron`やGitHub Actionsのscheduled workflow、Supabase Edge Functionsのcronトリガーなど）から実行する想定です。このリポジトリには実際のスケジューラは含まれていません。

#### 試合が更新されないときのチェックリスト

APIキーを設定したのに実際の試合が入ってこない場合、原因はほぼ次の3つです。

1. **`SPORTS_API_PROVIDER=mock` のままになっている** — キーを入れただけでは切り替わりません。`api_football` に変更するか、この行ごとコメントアウトしてください（キーがあれば自動で`api_football`を選びます）。この状態のときスクリプトが警告を出すようにしてあります。
2. **プランが対象外のシーズンを指定している** — API-Footballの無料プランは過去の特定シーズンしか含まれておらず、対象外シーズンはエラーではなく「0件」で返ってきます。`https://v3.football.api-sports.io/leagues?id=98` で自分のプランが使えるシーズンを確認し、`API_FOOTBALL_SEASON`に設定してください。
3. **単に実行していない** — `npm run sync-fixtures` は手動またはcronで動かす必要があります。

スクリプトはリクエストURL・取得件数・残りAPIクォータ・0件時の警告を出力するので、上記のどれに当たっているか判別できます。

### News-Firstフィード（実験機能・`/news`）

Polymarket/ミライマとの差別化として、「ニュース記事＋その場でベットできるコミュニティ予想」を1画面にまとめたフィードのUIプロトタイプです。まだ実際のニュースAPI連携やLLMによる自動お題生成は行っていません — `npm run seed-news`で手動投入した2件のデモ記事（為替ニュース＋既存のスポーツマーケットに紐付けたスポーツニュース）で、UI/UXの検証のみを行っています。

- `news_articles`テーブルと、任意で紐付けられる`markets.news_article_id`、記事単位のフラットな`comments`テーブルを追加（`supabase/migrations/00000000000006_news_and_comments.sql`）
- `app/news/page.tsx`: ニュース本文の下に、そのニュースに紐づくマーケットをワンタップでベットできるコンパクトなウィジェット（`BetForm`の`compact`モード、選択肢ごとにオッズを表示）として表示し、さらにその下にコメント欄を配置
- 既存のホーム画面はそのまま残し、`/news`への導線バナーを追加する形で並行提供（ホーム画面を全面置き換えていません）

次に着手するなら、ニュース取得（RSS/ニュースAPI）→ LLMによる候補質問の草案生成 → 管理者/コミュニティ承認、という半自動パイプラインの構築です（スポーツ同期のバッチ構成は流用できますが、フリーテキストのニュースから賭けられる質問を作る部分はスポーツのフィクスチャ同期とは別物の実装が必要です）。

## 次のステップ（未実装）

- 本番Supabaseプロジェクトへの接続（Auth・RLSの実運用設定、`finalize_expired_markets`/`sync_market_status`/`sync-fixtures`/`sync-results`を実際のスケジュールジョブ(pg_cron / Supabase Edge Functions / GitHub Actions cron等)に置き換える）
- `SPORTS_API_PROVIDER=api_football`での実APIキーによる本番動作確認（このセッションではAPIキーを持っていないため、モックプロバイダでのみ検証済みです）
- News-Firstフィードの本実装: ニュースAPI/RSS連携、LLMによる質問草案の自動生成、承認フロー
