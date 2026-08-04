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
- マーケット一覧・詳細・パリミュチュエル方式のベット（`place_bet` RPC）
- お題提案 → 賛成票が閾値（既定3票、`MARKET_APPROVAL_THRESHOLD`で変更可）に達すると自動オープン
- 管理者による判定確定＆精算（`settle_market` RPC、テラ銭徴収＋的中者への山分け分配）
- 異議申し立て（Optimistic Oracle）＋ DAO投票（多数決の可視化）
- マイページ（ベット履歴・ポイント履歴）
- 金庫（Treasury）ダッシュボード（公開・収益源の内訳）

## 次のステップ（未実装）

- スポーツAPI連携によるマーケット自動生成バッチ
- 24時間の異議申し立て期限が過ぎた際の自動確定ジョブ（現状は管理者が手動で確定）
- 本番Supabaseプロジェクトへの接続（Auth・RLSの実運用設定）
- パリミュチュエル配当計算の端数（整数除算による1〜数pt程度の端数）の扱いの精緻化
