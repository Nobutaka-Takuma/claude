# 一般公開の手順（Supabase + Vercel）

ローカルで動いているものを、Supabase（データベース）とVercel（アプリ）に載せて公開するまでの手順です。所要 30〜60分。

---

## 事前に知っておくこと

**このアプリはSupabase Authを使いません。** 認証はアプリ自身が`app_users`テーブルで持っています（メール＋bcryptハッシュ＋署名付きCookie）。Supabaseからは**Postgresだけ**を使います。ダッシュボードの Authentication タブは触りません。

**時刻はすべて日本時間で扱われます。** Vercelのサーバーは世界協定時（UTC）で動くため、日時の表示と入力の解釈をアプリ側で`Asia/Tokyo`に固定しています（`lib/format.ts`）。設定は不要です。

**ポイントは換金できません。** 現金・暗号資産との交換手段を持たない設計です。公開時にこの性質が変わらないようご注意ください（`/guidelines`にも明記しています）。

---

## 1. Supabase側の準備

### 1-1. プロジェクトを作る

1. https://supabase.com/dashboard → **New project**
2. Name: 任意（例 `prediction-dao`）
3. **Database Password**: 強いものを生成して控えておく（この後の接続文字列に使います）
4. Region: **Northeast Asia (Tokyo)** を推奨（日本のユーザー向けなら遅延が小さい）
5. 作成完了まで2〜3分待つ

### 1-2. 接続文字列を2種類ひかえる

Dashboard → 上部の **Connect** ボタン → **ORMs / psql** タブ。

用途が違う2つを使い分けます。

| 用途 | どれを使うか | ポート |
|---|---|---|
| **Vercelのアプリから**（サーバーレス） | **Transaction pooler**（Supavisor） | 6543 |
| **手元からマイグレーション適用** | **Direct connection** または Session pooler | 5432 |

- **アプリ用（Vercelに設定するもの）**

  ```
  postgresql://postgres.xxxxxxxx:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
  ```

  サーバーレス関数は起動と終了を繰り返すので、直接接続だとすぐに接続数を使い切ります。必ずポート**6543のTransaction pooler**を使ってください。

- **マイグレーション用（手元で1回だけ使うもの）**

  ```
  postgresql://postgres.xxxxxxxx:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
  ```

  Transaction poolerはトランザクションをまたぐ操作に制約があるため、スキーマ変更には5432側を使います。

`[PASSWORD]` は 1-1 で決めたものに置き換えます。パスワードに記号が含まれる場合はURLエンコードが必要です（`@` → `%40` など）。

### 1-3. マイグレーションを適用する

手元のリポジトリから、5432側の接続文字列に対して実行します。

```bash
# macOS / Linux
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  npm run migrate:prod
```

```powershell
# Windows (PowerShell)
$env:DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
npm run migrate:prod
```

0000から0015までが順に適用されます。**0000（ローカル用のauth shim）はSupabaseを検出して自動的に何もしません**ので、除外する操作は不要です。

> `npm run migrate` （`:prod`なし）は`.env.local`を読むローカル用です。本番には`migrate:prod`を使ってください。

### 1-4. 初期化する（金庫の資本と管理者アカウント）

**この手順は飛ばせません。** 新規登録ボーナスは金庫から支払われるため、金庫が空だと**新規ユーザー全員が0ptで始まってしまい、何もできません**。

```bash
DATABASE_URL="postgresql://...:5432/postgres" \
ADMIN_EMAIL="あなたのメール" \
ADMIN_PASSWORD="12文字以上の強いパスワード" \
ADMIN_USERNAME="admin" \
TREASURY_SEED_POINTS=1000000 \
  npm run bootstrap:prod
```

- 金庫に100万pt（＝1000人分の新規登録ボーナス）を入れます。`TREASURY_SEED_POINTS`で調整できます
- 管理者アカウントを1つ作ります。`npm run seed`のデモ用管理者（`admin@example.com` / `admin12345`）は**絶対に本番で使わないでください**
- 何度実行しても二重に入りません

> `npm run seed` はデモ用のダミー試合を投入するもので、本番では実行しないでください。

---

## 2. Vercel側の準備

### 2-1. リポジトリをインポート

1. https://vercel.com/new → GitHubの `Nobutaka-Takuma/claude` を選択
2. Framework Preset は **Next.js** が自動検出されます。Build/Output の設定は変更不要
3. **Deployを押す前に**、環境変数を入れます（次項）

### 2-2. 環境変数

Vercelのプロジェクト設定 → **Environment Variables**。Production / Preview / Development すべてにチェックを入れておくのが簡単です。

**必須**

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | 1-2の**6543側**（Transaction pooler）の接続文字列 |
| `SESSION_SECRET` | `openssl rand -hex 32` で生成した64桁の文字列 |
| `CRON_SECRET` | 同上（別の値を生成）。定期実行の認証に使います |

`SESSION_SECRET` はセッションCookieの署名鍵です。**後から変更すると全員がログアウトします。** 生成コマンドが手元にない場合はPowerShellで:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

**任意（既定値で動きます）**

`MARKET_CREATION_COST` / `SIGNUP_BONUS_POINTS` / `MARKET_BAN_THRESHOLD` など、`.env.example`にある経済パラメータはすべて環境変数で上書きできます。**最初は何も設定せず既定値のままで問題ありません。**

ニュース取り込みのフィードを変えたい場合のみ `NEWS_FEEDS` を設定します。

**近日中の試合からマーケットを自動生成する場合**は、次の2つを設定します（リーグIDは手元で `npm run sports-leagues -- Japan Soccer` を実行して調べてください）。

| 変数 | 値 |
|---|---|
| `SPORTS_API_PROVIDER` | `thesportsdb` |
| `SPORTSDB_LEAGUES` | `[{"id":"4633","name":"J1リーグ","category":"soccer"},{"id":"5637","name":"天皇杯","category":"soccer"}]` のようなJSON（J1リーグ＋天皇杯の例） |

`SPORTSDB_KEY`の設定は不要です（TheSportsDBが公開している共有の無料キーを自動で使います）。Premiumキーをお持ちの場合のみ設定してください。

### 2-3. デプロイ

**Deploy** を押します。2〜3分でビルドが終わり、`https://＜プロジェクト名＞.vercel.app` が発行されます。

---

## 3. 動作確認

発行されたURLを開いて、次の順に確認してください。

1. **トップページが表示される** — ここで500エラーなら`DATABASE_URL`を疑ってください（6543側になっているか、パスワードのエンコード）
2. **画面上部に赤い警告バーが出ていない** — 出ていればマイグレーション未適用です（1-3をやり直し）
3. **新規登録できて、1000ptが付与される** — 0ptなら金庫が空です（1-4をやり直し）
4. **1-4で作った管理者でログインでき、`/admin` が開ける**
5. **管理者としてマーケットを1つ作り、別アカウントで予想できる**

---

## 4. 定期実行（Cron）

`vercel.json` に2つ設定済みなので、デプロイすると自動で有効になります。

| パス | 間隔 | 役割 |
|---|---|---|
| `/api/cron/tick` | 日次 | 締切のロック、異議申し立て期間が過ぎたマーケットの精算、**近日中の試合からのマーケット自動生成** |
| `/api/news/sync` | 日次 | RSSからのニュース取り込み |

試合の自動生成に別のCron枠は使っていません（無料プランはCron数が限られるため、精算処理と同じ枠に相乗りさせています）。`SPORTS_API_PROVIDER`が`mock`以外に設定されているときだけ動き、取り込みに失敗しても精算処理は成功したまま、理由だけがレスポンスに載ります。

どちらも`CRON_SECRET`で保護されており、Vercelが`Authorization: Bearer`ヘッダを付けて呼びます。

> **Hobbyプランの制約**: Vercelの無料プランではCronは**1日1回まで**です。上記の毎時設定はデプロイ時にエラーになる可能性があるので、その場合は`vercel.json`を日次に変更してください（例 `"schedule": "0 3 * * *"`）。
>
> マーケットの精算自体は、誰かがページを見るたびに遅延実行される仕組み（lazy cron）が入っているので、**Cronが日次でも実用上は動きます**。Cronはあくまで「誰も見ていない時間帯の取りこぼし」を拾う保険です。

---

## 5. 公開前のチェックリスト

READMEの「一般公開にあたっての倫理的リスクと対応」も併せてご確認ください。特に未対応の項目です。

- [ ] **多重アカウント対策がありません**。メールアドレスだけで登録でき、確認メールも送っていません。通報3件でのBANも、提案の賛成3票も、多重登録で操作できます。**知人に限定して公開する、招待制にするなど、最初は範囲を絞ることを強くおすすめします**
- [ ] 年齢に関する方針を決める（換金性がないため賭博には当たらない想定ですが、対象年齢は決めておくべきです）
- [ ] 問い合わせ先を`/guidelines`に追記する（現在は「運営に連絡」としか書いていません）
- [ ] デモ用管理者（`admin@example.com`）が本番DBに存在しないことを確認する
- [ ] `SESSION_SECRET`がローカルの`dev-only-secret-change-me`のままになっていないことを確認する

---

## 6. 更新の反映

以降、`main`にpushするとVercelが自動でデプロイします。

**マイグレーションは自動では走りません。** DBスキーマが変わった更新（`supabase/migrations/`にファイルが増えたとき）は、手元から実行してください。

```bash
DATABASE_URL="postgresql://...:5432/postgres" npm run migrate:prod
```

順序は **先にマイグレーション → 次にデプロイ** が安全です。逆にすると、新しいコードが古いスキーマを触って画面上部に警告バーが出ます（機能は失敗しますが、データは壊れません）。

---

## トラブルシューティング

| 症状 | 原因 |
|---|---|
| トップページが500 | `DATABASE_URL`が違う／パスワードの記号が未エンコード／5432側を設定している |
| しばらく使うと接続エラー | 6543のTransaction poolerになっているか確認。それでも出る場合は`PGPOOL_MAX`を3程度に下げる |
| 赤い警告バー「データベースが追いついていません」 | `npm run migrate:prod` の実行漏れ |
| 新規登録しても0pt | 金庫が空。`npm run bootstrap:prod` |
| ログインしてもすぐ切れる | `SESSION_SECRET`がデプロイごとに変わっている（未設定だとビルドが失敗するはずですが、値の再生成にも注意） |
| Cronが動かない | Hobbyプランの1日1回制限。`vercel.json`を日次に |
| 実在しない試合のマーケットができた | `SPORTS_API_PROVIDER`が未設定のため、デモ用のダミー試合が作られています。下記で削除してから、環境変数を設定してください（現在は未設定だと自動生成自体が拒否されます） |
| 日時が9時間ずれる | 2026-08-06以前のデプロイで作られたマーケットのみ該当します。当時はサーバーのUTCで入力を解釈していたため、締切が9時間後ろにずれて保存されています。下記のSQLで確認・修正できます |

### ダミー試合のマーケットを消す（該当する場合のみ）

`SPORTS_API_PROVIDER`を設定する前に自動生成を実行すると、デモ用プロバイダが**実在するクラブ名を使った架空の対戦カード**を作ります。次のコマンドで確認・削除できます（行は消さず、中止扱いにして全ベットを返金します）。

```powershell
# 本番DBに対して実行する場合
$env:DATABASE_URL="postgresql://...:5432/postgres"

node scripts/remove-mock-markets.mjs          # 確認のみ
node scripts/remove-mock-markets.mjs --apply  # 中止＋返金を実行
```

ローカルなら `npm run remove-mock-markets` / `npm run remove-mock-markets -- --apply` です。

### 9時間ずれたマーケットの修正（該当する場合のみ）

タイムゾーン対応より前にVercel上で作成したマーケットは、締切と判定予定が9時間後ろにずれています。まず確認してください。

```sql
select id, title, kickoff_time, resolves_at, created_at
from markets
order by created_at desc;
```

意図した時刻より9時間後ろになっているものがあれば、そのIDを指定して戻します。

```sql
update markets
   set kickoff_time = kickoff_time - interval '9 hours',
       resolves_at  = resolves_at  - interval '9 hours'
 where id in ('ここにID', '...');
```

件数が少なければ、そのマーケットを中止（`/admin`から）して作り直すほうが確実です。
