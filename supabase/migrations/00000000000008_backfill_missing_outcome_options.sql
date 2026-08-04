-- =========================================================================
-- Data repair: markets left with an empty outcome_options array.
--
-- 0005 introduced outcome_options and backfilled the rows that existed at
-- that moment, but scripts/seed.mjs kept inserting markets without it,
-- so any database seeded between 0005 and this migration has J-League
-- markets that render no betting buttons (nothing to bet on). seed.mjs is
-- fixed; this repairs databases that already ran the broken version.
--
-- Only 'match_winner' markets can be repaired automatically, since their
-- options are derivable from home_team/away_team. A binary or
-- multi_outcome market with no options has no recoverable source of
-- truth, so those are left alone (there should be none — both creation
-- paths validate options up front).
-- =========================================================================

update markets
set outcome_options = jsonb_build_array(
      jsonb_build_object('key', 'home', 'label', home_team),
      jsonb_build_object('key', 'draw', 'label', '引き分け'),
      jsonb_build_object('key', 'away', 'label', away_team)
    )
where market_kind = 'match_winner'
  and jsonb_array_length(outcome_options) = 0
  and home_team is not null
  and away_team is not null;
