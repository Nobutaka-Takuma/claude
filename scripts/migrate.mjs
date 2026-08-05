// Applies the SQL files in supabase/migrations/ that this database hasn't
// seen yet, recording each one in a schema_migrations table.
//
// Replaces the "loop over every file with psql" instruction that used to
// be in the README: most migrations contain non-idempotent DDL (`alter
// table ... add column`, `create type`), so re-running the whole folder
// against an existing database produces a wall of errors and leaves you
// unsure which statements actually took effect.
//
// Run with: npm run migrate
//           npm run migrate -- --baseline 00000000000006
//             ^ records everything up to and including that version as
//               already applied, without running it — for a database
//               that was migrated by hand before this script existed.
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function parseArgs(argv) {
  const baselineIndex = argv.indexOf("--baseline");
  if (baselineIndex === -1) return { baseline: null };
  const value = argv[baselineIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--baseline needs a version, e.g. --baseline 00000000000006");
  }
  return { baseline: value };
}

async function main() {
  const { baseline } = parseArgs(process.argv.slice(2));

  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await pool.query("select version from schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  if (baseline) {
    // Compare on the leading version number only, so `--baseline 00000000000006`
    // includes 00000000000006_news_and_comments rather than sorting after it.
    const versionPrefix = (name) => name.replace(/\.sql$/, "").split("_")[0];
    const baselinePrefix = versionPrefix(baseline);
    const upTo = files.filter((f) => versionPrefix(f) <= baselinePrefix);
    if (upTo.length === 0) {
      throw new Error(`No migration matches --baseline ${baseline}. Available: ${files.join(", ")}`);
    }
    for (const file of upTo) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      await pool.query(
        "insert into schema_migrations (version) values ($1) on conflict do nothing",
        [version]
      );
      applied.add(version);
      console.log(`  = ${version} (marked as already applied, not run)`);
    }
  }

  const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/, "")));
  if (pending.length === 0) {
    console.log("Database is up to date — no migrations to apply.");
    await pool.end();
    return;
  }

  console.log(`Applying ${pending.length} migration(s)...`);

  for (const file of pending) {
    const version = file.replace(/\.sql$/, "");
    const sql = await readFile(MIGRATIONS_DIR + file, "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [version]);
      await client.query("commit");
      console.log(`  ✓ ${version}`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`  ✗ ${version}\n`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  console.error(
    "\nIf this database was set up before scripts/migrate.mjs existed, tell it which migrations " +
      "are already in place, e.g.:\n  npm run migrate -- --baseline 00000000000006"
  );
  process.exit(1);
});
