import type { Pool } from "pg";

export interface SyncNewsResult {
  created: number;
  updated: number;
  skipped: number;
  failedFeeds: { url: string; message: string }[];
  feedCount: number;
}

export function syncNews(
  pool: Pool,
  options?: { log?: (line: string) => void }
): Promise<SyncNewsResult>;
