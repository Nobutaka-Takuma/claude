import type { Pool } from "pg";

export interface SyncResultsResult {
  provider: string;
  /** 結果待ち（locked）だったマーケットの数。 */
  checked: number;
  /** 結果を報告したマーケットの数。異議申し立て期間を経て精算される。 */
  submitted: number;
  /** まだ試合が終わっていない（または結果が出ていない）数。 */
  stillPending: number;
  /** 取得に失敗した数。1件の失敗で全体は止めない。 */
  failed: number;
  disputeWindowMinutes: number;
}

export function syncResults(
  pool: Pool,
  options?: { log?: (line: string) => void; allowMock?: boolean }
): Promise<SyncResultsResult>;
