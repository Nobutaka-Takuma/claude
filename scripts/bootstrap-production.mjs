// Prepares a fresh production database for real users.
//
// `npm run seed` is demo data — fake J-League fixtures, a throwaway admin
// with a published password — which is exactly what you don't want on a
// public site. This does the two things a live deployment actually needs:
//
//   1. Put capital in the treasury. Signup bonuses are paid *from* the
//      treasury (grant_signup_bonus takes least(amount, balance)), so on
//      an empty fund every new user silently receives 0pt and nothing in
//      the app works for them.
//   2. Create one admin account, from credentials you pass in.
//
// Both steps are idempotent, so re-running after a partial failure is safe.
//
// Usage:
//   DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//     node scripts/bootstrap-production.mjs
//
//   TREASURY_SEED_POINTS=500000   (optional, default 1000000)
//   ADMIN_USERNAME=...            (optional, default "admin")
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TREASURY_SEED = Number(process.env.TREASURY_SEED_POINTS ?? 1_000_000);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const SEED_MEMO = "initial ops seed capital";

async function seedTreasury() {
  const existing = await pool.query(
    "select 1 from treasury_logs where entry_type = 'adjustment' and memo = $1",
    [SEED_MEMO]
  );
  if (existing.rowCount > 0) {
    console.log("treasury already seeded, skipping");
    return;
  }
  if (TREASURY_SEED <= 0) {
    console.log("TREASURY_SEED_POINTS is 0, skipping");
    return;
  }

  const result = await pool.query(
    "update treasury set balance = balance + $1, updated_at = now() where id = 1 returning balance",
    [TREASURY_SEED]
  );
  await pool.query(
    `insert into treasury_logs (entry_type, points_delta, treasury_delta, treasury_balance_after, memo)
     values ('adjustment', 0, $1, $2, $3)`,
    [TREASURY_SEED, result.rows[0].balance, SEED_MEMO]
  );
  console.log(`treasury seeded with ${TREASURY_SEED.toLocaleString("en-US")}pt`);
}

async function createAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin creation");
    return;
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters for a public deployment");
  }

  const existing = await pool.query("select id from app_users where email = $1", [ADMIN_EMAIL]);
  if (existing.rowCount > 0) {
    await pool.query("update profiles set role = 'admin' where id = $1", [existing.rows[0].id]);
    console.log(`admin already exists (${ADMIN_EMAIL}), ensured role = admin`);
    return;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const result = await pool.query(
    `with new_user as (
       insert into app_users (email, encrypted_password) values ($1, $2) returning id
     )
     insert into profiles (id, username, role)
     select id, $3, 'admin' from new_user
     returning id`,
    [ADMIN_EMAIL, hash, ADMIN_USERNAME]
  );
  console.log(`admin created: ${ADMIN_EMAIL} (id=${result.rows[0].id})`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  await seedTreasury();
  await createAdmin();
  console.log("Bootstrap complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
