import type { MarketStatus } from "./types";
import type { PoolBreakdown } from "./pool";

// 「暫定の結果」の扱いを1か所にまとめる。
//
// これまでは、結果が報告されても異議申し立て期間が終わるまで、賭けた本人に
// 当たったのか外れたのかが一切見えなかった。予想が当たったかどうかを知る
// のは参加する理由そのものなので、報告された時点で見せる。
//
// ただし確定ではない。異議が出れば覆るし、投票で別の結果になることもある。
// 表示では必ず「暫定」と分かるようにし、確定した的中と同じ見た目にしない。
export type ProvisionalState =
  | "waiting" // まだ結果が報告されていない
  | "hit" // 報告された結果は自分の予想と一致（暫定）
  | "miss" // 一致しない（暫定）
  | null; // 暫定の概念が当てはまらない（確定済み・取消など）

const PROVISIONAL_STATUSES: MarketStatus[] = ["pending_resolution", "disputed"];

export function provisionalState(
  betStatus: string,
  marketStatus: string,
  betOutcome: string,
  marketOutcome: string | null
): ProvisionalState {
  // 精算済みのベットには暫定もなにもない。確定した結果が出ている。
  if (betStatus !== "active") return null;

  if (!PROVISIONAL_STATUSES.includes(marketStatus as MarketStatus)) {
    return marketStatus === "locked" || marketStatus === "open" ? "waiting" : null;
  }
  if (!marketOutcome) return "waiting";

  return betOutcome === marketOutcome ? "hit" : "miss";
}

// この結果のまま確定した場合に受け取る額。settle_market の計算をそのまま
// 写している（賭け金は全額戻り、外れた側のプールから手数料を引いた分と
// 初期賞金を、当たった側で山分け）。
//
// あくまで現時点のプールでの見込みで、締切前ならこの後も動く。
export function estimateSettlementPayout(
  pool: PoolBreakdown,
  winningKey: string,
  stake: number,
  rakeBps: number,
  seedPool = 0
): number | null {
  const winning = pool.options.find((o) => o.key === winningKey)?.amount ?? 0;
  if (winning <= 0) return null;
  const losing = pool.total - winning;
  const distributable = losing * (1 - rakeBps / 10000) + seedPool;
  return Math.floor(stake * (1 + distributable / winning));
}

export const PROVISIONAL_LABEL: Record<Exclude<ProvisionalState, null>, string> = {
  waiting: "結果待ち",
  hit: "暫定 的中",
  miss: "暫定 不的中",
};
