# 分散型予測市場（DAO型 Prediction Market）— MVP設計

Polymarket / みらいマーケット的な、労働（広告視聴・アンケート）で貯まるコミュニティ金庫（Treasury）を原資に、サッカーの試合をパリミュチュエル方式で予測するWebアプリのMVP設計一式。

技術スタック: Next.js (App Router) / TypeScript / Tailwind CSS / Supabase

## 目次

1. [データベース設計](./01-database-schema.md) — [`sql/0001_init_schema.sql`](./sql/0001_init_schema.sql)
2. [タスク完了→ポイント付与・金庫更新のバックエンドロジック](./02-backend-logic.md) — [`api/`](./api/)
3. [画面構成（ワイヤーフレーム）](./03-wireframes.md)

## 資金循環の要約

```
労働(広告視聴/アンケート) --[complete_task RPC]--> ユーザー残高 + 金庫残高
ユーザー残高 --[bet]--> マーケットプール(bets)
マーケット確定 --[settle, 次イテレーション]--> テラ銭10%は金庫へ / 残り90%は的中者へ按分
```

`treasury_logs` テーブルがこの全フローの単一台帳になっており、`entry_type` でどの資金移動かを判別する。

## 次のステップ（未着手）
- `create-next-app` でプロジェクトを実際に立ち上げ、`docs/prediction-market-dao/api/` を `app/api/` へ移設
- Supabase CLIで `sql/` 配下をマイグレーションとして適用
- `place_bet` / `settle_market` RPCの実装（`treasury_logs` の同パターンを踏襲）
- スポーツAPI連携によるマーケット自動生成バッチ
- Optimistic Oracle（一次判定→24時間異議申し立て→DAO投票）のジョブ実装
