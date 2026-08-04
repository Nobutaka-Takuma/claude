# Prediction Market DAO — MVP

Polymarket / みらいマーケット的な、労働（広告視聴・アンケート）で貯まるコミュニティ金庫（Treasury）を原資に、サッカーの試合をパリミュチュエル方式で予測するWebアプリのMVP。

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

# 3. 環境変数を用意（DATABASE_URLなどはデフォルトのままでOK）
cp .env.example .env.local

# 4. マイグレーションを適用（0000は本番Supabaseには不要 — 上記の注記を参照）
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
# もしくは:
for f in supabase/migrations/*.sql; do psql "postgresql://postgres:postgres@127.0.0.1:5432/prediction_market" -f "$f"; done

# 5. デモ用データを投入（管理者アカウント・タスク・マーケットのseed）
npm run seed

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

- 認証（サインアップ / ログイン / セッションCookie）
- タスクセンター: 広告視聴（デモ版はシミュレーション再生）・アンケート回答 → `complete_task` RPCで自動ポイント付与＆金庫更新
- マーケット一覧・詳細・パリミュチュエル方式のベット（`place_bet` RPC）。**的中者には賭けた分が必ず全額戻り**、そのうえで反対側のプールから運営手数料(テラ銭)を除いた分を山分けします。反対側に誰もベットしていなければ手数料もかからず、賭けた分がそのまま戻ります（後述）
- お題提案 → 賛成票が閾値（既定3票、`MARKET_APPROVAL_THRESHOLD`で変更可）に達すると自動オープン
- Optimistic Oracle: 管理者（本来はスポーツAPI/AIの一次判定に相当）が一次判定を提出（`submit_provisional_result` RPC）→ 異議申し立て期間（既定24時間、デモ用に2分の短縮オプションあり）→ 異議がなければ自動確定・精算、異議が出ればDAO投票の多数決で最終決定（`finalize_expired_markets` RPCが`sync_market_status`と同様にマーケット閲覧のたびに遅延実行される簡易cron）
- 管理者による緊急オーバーライド（オラクルをスキップした即時確定・全額返金での中止）
- マイページ（ベット履歴・ポイント履歴）
- 金庫（Treasury）ダッシュボード（公開・収益源の内訳）

### パリミュチュエル配当の仕組み（stake-back保証）

反対側に誰も賭けていない場合でも的中者が損をしないよう、テラ銭は「反対側（負けた側）のプール」からのみ徴収します。

- 総プール = 的中側プール + 反対側プール
- テラ銭 = 反対側プール × 手数料率（既定10%）
- 的中者への配当 = 自分の賭け金（全額） + 自分の賭け金 ÷ 的中側プール × (反対側プール − テラ銭)

反対側プールが0（誰も逆張りしていない）なら、テラ銭も0になり、賭けた分がそのまま戻ります。

## 次のステップ（未実装）

- スポーツAPI連携によるマーケット自動生成バッチ
- 本番Supabaseプロジェクトへの接続（Auth・RLSの実運用設定、`finalize_expired_markets`/`sync_market_status`を本物のスケジュールジョブ(pg_cron / Supabase Edge Functions等)に置き換える）
