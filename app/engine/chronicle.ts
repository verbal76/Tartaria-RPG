// OTA-843 [Character Chronicle] — the "legends" view. A character already ACCRETES
// a story: worldMemory.memorableEvents logs the dramatic beats (first kill, faction
// oath, Guardians felled, the Choice), milestones count the lifetime deeds, and the
// corruption tier marks how far the Aether has taken them. Nothing pulled it together
// into one readable record, though — so a long-lived character was a pile of numbers,
// not a legend. This builds that record: a headline that sums up who they've become,
// a short deed-list, and the memorable beats as a chronological timeline.
//
// Pure/presentational — it reads existing state, records nothing. The screen renders
// what this returns.

import type { PlayerCharacter, MemorableEvent } from './types';
import { corruptionTierOf, tierLabel } from './corruption';

export interface ChronicleEntry {
  glyph: string;
  text: string;
}
export interface Chronicle {
  /** "The Chronicle of <name>". */
  title: string;
  /** "<race> · <faction> · Nd Mh in Tartaria". */
  headline: string;
  /** Short stat lines — foes bested, kinds catalogued, titles, Cores, corruption. */
  deeds: string[];
  /** The memorable beats, oldest → newest (reads as a story). */
  entries: ChronicleEntry[];
}

// A glyph per event kind so the timeline scans at a glance. Unknown kinds get a dot.
const KIND_GLYPH: Record<string, string> = {
  first_kill: '⚔',
  rare_kill: '★',
  first_travel: '➤',
  first_quest: '✎',
  faction_join: '⚑',
  death_revive: '☠',
  theft_caught: '⚠',
  mq_capital_first_visit: '◆',
  mq_guardian_spawned: '☗',
  mq_guardian_defeated: '✦',
  mq_guardian_fled: '↩',
  mq_core_recovered: '◈',
  mq_descent_unlocked: '⇩',
  mq_nexus_reached: '⌖',
  mq_ending_chosen: '⁂',
  corruption_tier: '☣',
};

export interface ChronicleContext {
  raceName?: string;
  factionName?: string;
  /** Distinct enemy TYPES bested (worldMemory.defeatedEnemies deduped). */
  distinctFoes?: number;
  /** Cores recovered / total, when a main quest is underway. */
  coresRecovered?: number;
  coresTotal?: number;
}

export function buildChronicle(
  player: PlayerCharacter,
  events: readonly MemorableEvent[] | undefined,
  ctx: ChronicleContext = {},
): Chronicle {
  const hours = Math.max(0, Math.floor(player.hoursElapsed ?? 0));
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const timeStr = days > 0 ? `${days}d ${remH}h` : `${remH}h`;

  const raceName = ctx.raceName ?? player.raceId ?? 'wanderer';
  const factionParts = [raceName, ctx.factionName].filter(Boolean);
  const headline = `${factionParts.join(' · ')} · ${timeStr} in Tartaria`;

  const kills = player.milestones?.enemiesDefeated ?? 0;
  const titles = player.earnedTitles ?? [];
  const tier = corruptionTierOf(player.corruption ?? 0);

  const deeds: string[] = [];
  deeds.push(`${kills} ${kills === 1 ? 'foe' : 'foes'} bested`);
  if ((ctx.distinctFoes ?? 0) > 0) deeds.push(`${ctx.distinctFoes} kinds catalogued`);
  if (titles.length > 0) deeds.push(`${titles.length} ${titles.length === 1 ? 'title' : 'titles'} earned: ${titles.join(', ')}`);
  if ((ctx.coresTotal ?? 0) > 0) deeds.push(`${ctx.coresRecovered ?? 0}/${ctx.coresTotal} Cores recovered`);
  deeds.push(`Corruption: ${tierLabel(tier)}`);

  // memorableEvents are appended in order (capped to the last 40), so the array is
  // already oldest → newest — exactly how a chronicle should read.
  const entries: ChronicleEntry[] = (events ?? []).map((e) => ({
    glyph: KIND_GLYPH[e.kind] ?? '·',
    text: e.text,
  }));

  return {
    title: `The Chronicle of ${player.name}`,
    headline,
    deeds,
    entries,
  };
}
