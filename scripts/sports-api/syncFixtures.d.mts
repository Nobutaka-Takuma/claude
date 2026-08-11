import type { Pool } from "pg";

export interface SyncFixturesResult {
  provider: string;
  /** 取得対象にした期間（日数）。SPORTS_API_SYNC_DAYS の値。 */
  daysAhead: number;
  /** 期間内で取得できた試合数。 */
  fetched: number;
  /** そのうち今回処理した数（1回あたりの上限で切られることがある）。 */
  processed: number;
  /** 上限を超えて今回見送った数。次回の同期で取り込まれる。 */
  truncated: number;
  created: number;
  updated: number;
  skipped: number;
}

export function syncFixtures(
  pool: Pool,
  options?: { log?: (line: string) => void; allowMock?: boolean }
): Promise<SyncFixturesResult>;
