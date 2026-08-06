import { readdir } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";

// Detects "you pulled the code but not the schema".
//
// Every failure caused by a missing migration shows up as an unrelated
// symptom at some random button ("function ... does not exist"), which is
// a terrible way to learn you skipped `npm run migrate`. Comparing the
// migration files on disk against schema_migrations turns that into one
// banner that says exactly what to run.
const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

// The shim only exists for local dev; a real Supabase project never runs
// it, so its absence is expected rather than a missing migration.
const OPTIONAL_VERSIONS = new Set(["00000000000000_local_dev_auth_shim"]);

let cache: { at: number; pending: string[] } | null = null;
const CACHE_MS = 10_000;

export async function getPendingMigrations(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.pending;

  let pending: string[] = [];
  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .filter((v) => !OPTIONAL_VERSIONS.has(v))
      .sort();

    const result = await query<{ version: string }>("select version from schema_migrations");
    const applied = new Set(result.rows.map((r) => r.version));
    pending = files.filter((v) => !applied.has(v));
  } catch {
    // No schema_migrations table (or no database at all) means this check
    // can't say anything useful. Staying quiet is right: the real error
    // will surface on the page that actually needs the data.
    pending = [];
  }

  cache = { at: Date.now(), pending };
  return pending;
}
