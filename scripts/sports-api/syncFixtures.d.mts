import type { Pool } from "pg";

export interface SyncFixturesResult {
  provider: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

export function syncFixtures(
  pool: Pool,
  options?: { log?: (line: string) => void }
): Promise<SyncFixturesResult>;
