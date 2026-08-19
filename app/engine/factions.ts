import type { Faction, FactionStanding } from './types';
import factionsData from '../data/factions/factions.json';

export const FACTIONS = factionsData as Faction[];

// arb119 — reputation is a bounded standing, never an unbounded resource. The join
// threshold is 20; ±100 is "fully allied / sworn enemy". Clamping here stops the
// vendor-purchase (+1) / gift (+5) rep farms from running standing to infinity.
export const REP_MAX = 100;
export const REP_MIN = -100;

// Some faction data entries use suffixed names ("_situational",
// "_partial", "_when_unpaid") or virtual references ("anyone_paying",
// "conspiracy_architects") that aren't real faction IDs. Normalize so
// we can match against the canonical id list.
function normalizeRef(ref: string): string {
  return ref.replace(/_situational$|_partial$|_when_unpaid$/i, '');
}

function isKnownFactionId(id: string): boolean {
  return FACTIONS.some((f) => f.id === id);
}

export function findFaction(id: string): Faction | null {
  return FACTIONS.find((f) => f.id === id) ?? null;
}

/** ⚠ OTA-1178 — RACE IDS SITTING WHERE FACTION IDS BELONG.
 *
 *  OTA-834 found four stall reps carrying RACE ids instead of faction ids and
 *  remapped the ROSTER — but a save that had already met one of those vendors
 *  keeps the bad id forever, because a recorded factionId is sticky. And
 *  `applyRepChange` silently no-ops on an id it does not know, so every rep gain
 *  routed through that NPC went nowhere while the game reported success. Device
 *  log 2026-08-06T20:46:30, the owner's install: a Rare **Core Relic** handed to
 *  Odar Flameforge, then "Standing +2 — architectural sentinels." Nothing moved,
 *  and the gift budget was debited for it.
 *
 *  The mapping is OTA-834's own, quoted from engine/vendors.ts: each race id goes
 *  to the faction that actually owns that theme. */
const LEGACY_FACTION_ALIASES: Readonly<Record<string, string>> = {
  architectural_sentinels: 'stone_builders',   // Sacred Architecture
  unknowing_masses: 'conspiracy_architects',   // they keep the Unknowing Masses ignorant
  aetherborn: 'eternal_dynasty',               // the Aetherborn Cabal
  mud_golems: 'mud_monarchs',                  // mud
};

/** The real faction id behind `id`, healing the four legacy race ids above.
 *  Returns null when nothing in the roster answers to it — which callers must
 *  treat as "no standing changed", never as success. */
export function canonicalFactionId(id: string | null | undefined): string | null {
  const raw = (id ?? '').trim();
  if (!raw) return null;
  if (isKnownFactionId(raw)) return raw;
  const mapped = LEGACY_FACTION_ALIASES[raw];
  return mapped && isKnownFactionId(mapped) ? mapped : null;
}

/**
 * Apply a reputation change with `withFaction`, propagating ±half to
 * allies and the opposite ±half to rivals. Unknown faction refs are
 * ignored. Returns a new factionStanding array.
 */
export function applyRepChange(
  standing: readonly FactionStanding[],
  withFaction: string,
  delta: number,
  /** ⚠ OTA-1188 — WHO COUNTS AS FRIEND AND FOE, supplied by the caller.
   *
   *  The default (omitting this) reads `factions.json`'s static `allies`/`rivals`, which
   *  are the ORIGINAL TREATIES and never change — while the GRUDGES & ALLIANCES panel
   *  shows a LIVE, symmetric relations matrix that patrols move as they gut each other.
   *  Those two disagreed, and the panel was the honest one. Owner: *"which one is the
   *  truth? do we treat the ever-evolving map as the truth?"* — yes.
   *
   *  A bounty passes the sets FROZEN ONTO IT AT ACCEPT (see engine/bountyPolitics), so the
   *  board you read is the deal you get even if they go to war a second later. The static
   *  fallback stays for every other caller and for legacy contracts carrying no snapshot;
   *  the JSON arrays are still the SEED the matrix is built from and must not be deleted. */
  override?: { allies: readonly string[]; rivals: readonly string[] },
): { standing: FactionStanding[]; changed: { factionId: string; delta: number; newStanding: number }[] } {
  const faction = findFaction(withFaction);
  // ⚠ An override is honoured even for an unknown faction id: the snapshot already
  // resolved the ids, so refusing here would silently drop a payout the player earned.
  if (!faction && !override) return { standing: standing.map((s) => ({ ...s })), changed: [] };

  const allyIds = new Set(
    (override ? override.allies : (faction?.allies ?? []))
      .map(normalizeRef)
      .filter(isKnownFactionId),
  );
  const rivalIds = new Set(
    (override ? override.rivals : (faction?.rivals ?? []))
      .map(normalizeRef)
      .filter(isKnownFactionId),
  );

  const halfDelta = Math.trunc(delta / 2);
  const changed: { factionId: string; delta: number; newStanding: number }[] = [];
  // arb119 — clamp to [REP_MIN, REP_MAX]; report the REAL delta after clamping so a
  // log never claims a bump that the cap swallowed.
  const apply = (row: FactionStanding, raw: number): FactionStanding => {
    const newStanding = Math.max(REP_MIN, Math.min(REP_MAX, row.standing + raw));
    const realDelta = newStanding - row.standing;
    if (realDelta !== 0) changed.push({ factionId: row.factionId, delta: realDelta, newStanding });
    return { ...row, standing: newStanding };
  };

  const next: FactionStanding[] = standing.map((row) => {
    if (row.factionId === withFaction) return apply(row, delta);
    if (allyIds.has(row.factionId) && halfDelta !== 0) return apply(row, halfDelta);
    if (rivalIds.has(row.factionId) && halfDelta !== 0) return apply(row, -halfDelta);
    return row;
  });

  return { standing: next, changed };
}

/** ⚠ OTA-1179 — READS HEAL THE ID TOO, not just writes.
 *
 *  OTA-1178 taught `applyRepChange`'s callers to canonicalise, because a legacy
 *  race id on an old save made a gift grant nothing while claiming success. The
 *  READ side was left as it was, and it has the same hole with a quieter failure:
 *  this returns **0 — indistinguishable from genuinely neutral** — so a player who
 *  had ground a faction to +30 through a vendor recorded under a bad id reads as a
 *  stranger to every consumer at once. Roughly fifteen call sites inherit it:
 *  pricing, contract availability, hostility, brokering, titles, the character
 *  sheet.
 *
 *  ⚠ The fallback is `factionId`, not null: an id this build's roster does not know
 *  might be NEWER than the roster rather than older, and silently rewriting it to
 *  nothing would be the same class of mistake in the other direction. */
export function getStanding(standing: readonly FactionStanding[], factionId: string): number {
  const id = canonicalFactionId(factionId) ?? factionId;
  return standing.find((s) => s.factionId === id)?.standing ?? 0;
}

// Minimum standing to be admitted into a faction. Most factions in the
// rulebook have softer "demonstrate loyalty" criteria; for the gameplay
// loop we use a flat reputation threshold and let narrative quests
// supplement later.
export const JOIN_THRESHOLD = 20;

export function meetsJoinThreshold(standing: readonly FactionStanding[], factionId: string): boolean {
  return getStanding(standing, factionId) >= JOIN_THRESHOLD;
}

/** ⚠ OTA-1181 — TC of honest custom that banks 1 standing with a faction's traders.
 *  Lifted out of `gameStore.buyFromVendor`, where it was a function-local const, so
 *  the character sheet can STATE the rule instead of printing a second copy of the
 *  number. The in-game glossary said purchases were worth "+1" with no denominator
 *  at all — off by this entire constant, and exactly the drift OTA-1179 #8 cleaned
 *  up for JOIN_THRESHOLD. One definition, two readers. */
export const BUY_REP_TC_PER_STANDING = 500;
