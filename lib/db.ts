import { Pool, type QueryResultRow } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

// Next.js dev server hot-reloads this module on every edit; a module-level
// `new Pool()` would leak a connection pool per reload, so it's cached on
// `global` the same way official Next.js + Postgres examples do.
export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Each serverless instance gets its own pool, and a Supabase project
    // has a fixed connection budget shared across all of them. A small
    // per-instance cap plus a short idle timeout keeps a traffic spike
    // from exhausting the database rather than just queueing.
    max: Number(process.env.PGPOOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}
