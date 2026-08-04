import type { MarketStatus } from "@/lib/types";

const LABELS: Record<MarketStatus, { text: string; tone: string }> = {
  proposed: { text: "提案中", tone: "bg-draw-soft text-draw" },
  open: { text: "受付中", tone: "bg-accent-soft text-accent-ink" },
  locked: { text: "受付終了", tone: "bg-gold-soft text-gold" },
  pending_resolution: { text: "判定待ち", tone: "bg-gold-soft text-gold" },
  disputed: { text: "異議あり", tone: "border border-neg text-neg" },
  resolved: { text: "確定済み", tone: "bg-surface-2 text-ink-muted" },
  cancelled: { text: "中止", tone: "bg-surface-2 text-ink-faint" },
};

export default function StatusBadge({ status }: { status: MarketStatus }) {
  const { text, tone } = LABELS[status];
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${tone}`}>
      {text}
    </span>
  );
}
