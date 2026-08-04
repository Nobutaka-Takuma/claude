// Seeds demo data for local development: an admin account, a handful of
// ad-view/survey tasks, and a few soccer markets in different lifecycle
// states so every screen in the wireframes has something to show.
//
// Run with: npm run seed  (loads .env.local via `node --env-file`)
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await seedAdmin();
  await seedTasks();
  await seedMarkets();
  await seedTreasurySeedCapital();
  console.log("Seed complete.");
  await pool.end();
}

async function seedAdmin() {
  const email = "admin@example.com";
  const exists = await pool.query("select id from auth.users where email = $1", [email]);
  if (exists.rowCount > 0) {
    await pool.query("update profiles set role = 'admin' where id = $1", [exists.rows[0].id]);
    console.log(`admin already exists (${email}), role ensured`);
    return;
  }

  const passwordHash = await bcrypt.hash("admin12345", 10);
  const result = await pool.query(
    `with new_user as (
       insert into auth.users (email, encrypted_password) values ($1, $2) returning id
     )
     insert into profiles (id, username, role)
     select id, 'admin', 'admin' from new_user
     returning id`,
    [email, passwordHash]
  );
  console.log(`created admin user: ${email} / admin12345 (id=${result.rows[0].id})`);
}

async function seedTasks() {
  const existing = await pool.query("select count(*) from tasks");
  if (Number(existing.rows[0].count) > 0) {
    console.log("tasks already seeded, skipping");
    return;
  }

  await pool.query(
    `insert into tasks (type, title, description, reward_points, provider, config, max_completions_per_user)
     values
     ('ad_view', '動画広告を見る', 'デモ版では実際の広告の代わりに数秒のシミュレーション再生です。', 10, 'local_demo', '{}'::jsonb, 5),
     ('survey', 'サッカーファンアンケート', '2つの質問に答えてポイントを獲得しましょう。', 50, 'internal_survey',
       $$
       {
         "questions": [
           { "id": "q1", "label": "好きなポジションは？", "options": ["FW", "MF", "DF", "GK"] },
           { "id": "q2", "label": "観戦頻度は？", "options": ["毎週", "月1-2回", "たまに", "はじめて"] }
         ],
         "required_question_ids": ["q1", "q2"]
       }
       $$::jsonb, 1)
    `
  );
  console.log("seeded tasks: ad_view x1, survey x1");
}

async function seedMarkets() {
  const existing = await pool.query("select count(*) from markets");
  if (Number(existing.rows[0].count) > 0) {
    console.log("markets already seeded, skipping");
    return;
  }

  await pool.query(
    `insert into markets (title, description, category, source, home_team, away_team, kickoff_time, status, rake_bps)
     values
     ('浦和レッズ vs 鹿島アントラーズ', 'J1リーグ', 'soccer', 'api_auto', '浦和レッズ', '鹿島アントラーズ', now() + interval '2 days', 'open', 1000),
     ('FC東京 vs 川崎フロンターレ', 'J1リーグ', 'soccer', 'api_auto', 'FC東京', '川崎フロンターレ', now() + interval '5 days', 'open', 1000),
     ('横浜F・マリノス vs ガンバ大阪', 'J1リーグ', 'soccer', 'api_auto', '横浜F・マリノス', 'ガンバ大阪', now() - interval '10 minutes', 'locked', 1000)`
  );

  await pool.query(
    `insert into markets (title, description, category, source, home_team, away_team, kickoff_time, status, rake_bps, outcome, resolved_at)
     values
     ('セレッソ大阪 vs 名古屋グランパス', 'J1リーグ', 'soccer', 'api_auto', 'セレッソ大阪', '名古屋グランパス', now() - interval '3 days', 'resolved', 1000, 'home', now() - interval '2 days')`
  );

  console.log("seeded markets: 2 open, 1 locked, 1 resolved");
}

async function seedTreasurySeedCapital() {
  const logExists = await pool.query(
    "select 1 from treasury_logs where entry_type = 'adjustment' and memo = 'initial ops seed capital'"
  );
  if (logExists.rowCount > 0) {
    console.log("treasury seed capital already applied, skipping");
    return;
  }

  const amount = 50000;
  const result = await pool.query(
    "update treasury set balance = balance + $1, updated_at = now() where id = 1 returning balance",
    [amount]
  );
  await pool.query(
    `insert into treasury_logs (entry_type, points_delta, treasury_delta, treasury_balance_after, memo)
     values ('adjustment', 0, $1, $2, 'initial ops seed capital')`,
    [amount, result.rows[0].balance]
  );
  console.log(`seeded treasury with ${amount}pt of initial ops capital`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
