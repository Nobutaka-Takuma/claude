import { getRelatedMarkets, getMarketPools } from "@/lib/data";
import type { Market } from "@/lib/types";
import MarketCard from "@/components/MarketCard";

export default async function RelatedMarkets({ market }: { market: Market }) {
  const related = await getRelatedMarkets(market);
  if (related.length === 0) return null;

  const pools = await Promise.all(related.map((m) => getMarketPools(m.id)));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold">関連するマーケット</h2>
      <ul className="space-y-3">
        {related.map((m, i) => (
          <li key={m.id}>
            <MarketCard market={m} pools={pools[i]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
