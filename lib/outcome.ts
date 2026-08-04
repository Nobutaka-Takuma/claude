import type { OutcomeOption } from "./types";

export function outcomeLabel(options: OutcomeOption[], key: string | null): string {
  if (key === null) return "中止・返金";
  return options.find((o) => o.key === key)?.label ?? key;
}

export function marketHeading(market: {
  market_kind: string;
  title: string;
  home_team: string | null;
  away_team: string | null;
}): string {
  if (market.market_kind === "match_winner" && market.home_team && market.away_team) {
    return `${market.home_team} vs ${market.away_team}`;
  }
  return market.title;
}
