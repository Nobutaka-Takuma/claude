-- =========================================================================
-- News-first prototype (UI validation pass only — no news API wired up
-- yet, see docs discussion). Adds a curated news_articles table, an
-- optional link from a market back to the article it was drawn from, and
-- a flat comments table scoped to the article (the mockup shows
-- discussion attached to the news+market combo, not the market alone).
--
-- 'news_curated' is a new markets.source value for operator-curated
-- markets attached to a news article — distinct from 'api_auto' (sports
-- fixtures) and 'user_proposed' (community proposals), so these can be
-- filtered/labeled separately later.
-- =========================================================================

alter type market_source add value if not exists 'news_curated';

create table news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  source text not null,
  category text not null default 'general',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table markets add column news_article_id uuid references news_articles(id);
create index idx_markets_news_article on markets (news_article_id) where news_article_id is not null;

create table comments (
  id uuid primary key default gen_random_uuid(),
  news_article_id uuid not null references news_articles(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index idx_comments_article on comments (news_article_id, created_at);

alter table news_articles enable row level security;
alter table comments enable row level security;

create policy "news articles are publicly readable" on news_articles for select using (true);
create policy "comments are publicly readable" on comments for select using (true);
create policy "authenticated users post comments" on comments
  for insert with check (auth.uid() = user_id);
