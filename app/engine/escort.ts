// Escort-contract mechanic — ported from engine_Dev's shared-pool model.
//
// An escort faction quest spawns a SHARED-POOL escort party on accept. The party
// lives on the active-quest record (`escort`: { label, hp, hpMax, count }), shows
// as ONE row under the player's vitals in the HUD, and takes COLLATERAL combat
// damage when the player is hit (a fraction of the player's damage — EXTRA, not
// absorbed off the player). When the pool reaches 0 the escort FAILS; delivering
// the party (pool > 0) completes it. All-or-nothing — no per-escortee tracking.

import type { EscortPool } from './types';
import type { FactionQuestDef } from './factionQuests';

const DEFAULT_ESCORT_LABEL = 'Escort party';

/** Fraction of the player's combat damage the escort party takes as collateral each
 *  time the player is hit. EXTRA damage on the party pool — never subtracted from
 *  the player's own hit.
 *  OTA-966 — tuned 0.30 -> 0.20 after running the missions through their paces:
 *  at 0.30 a SOLO party (the stranded travelers, the Envoy, the Confessor —
 *  pool ~42-45 at current player HP) failed inside ~1 hard pack fight
 *  (~15-25 landed hits x 2-3 collateral), which made every solo contract a
 *  coin flip. At 0.20 a solo party holds ~1.5-2 pack fights plus rest heals,
 *  and a 3-member party ~4 — long escorts stay tense without being a lottery. */
export const ESCORT_COLLATERAL_FRACTION = 0.20;

/** Fraction of the party's MAX pool restored per rest (capped at the deficit). Kept
 *  modest so it can't outpace combat bleed — a careless player still loses them. */
export const ESCORT_REST_HEAL_FRACTION = 0.10;

/** Resolve the escort spec for a quest, or null if it isn't an escort contract.
 *  Explicit `escort` field OR an `_escort` id suffix opts in; an authored
 *  `escort.count` (clamped 1-5) sets party size, else a random 2-3; `escort.label`
 *  is the one-word display name ("Surveyors", "Pilgrims", "Envoy"). */
export function escortSpecForQuest(def: FactionQuestDef | null | undefined): { count: number; label: string } | null {
  if (!def) return null;
  const isEscort = !!def.escort || /_escort$/.test(def.id);
  if (!isEscort) return null;
  const c = def.escort?.count;
  const label = (def.escort?.label && def.escort.label.trim()) || DEFAULT_ESCORT_LABEL;
  return { count: clampCount(typeof c === 'number' ? c : randomPartySize()), label };
}

export function isEscortQuest(def: FactionQuestDef | null | undefined): boolean {
  return escortSpecForQuest(def) != null;
}

function randomPartySize(): number {
  // "two or three" when the quest doesn't pin a count.
  return Math.random() < 0.5 ? 2 : 3;
}

function clampCount(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Per-member HP contribution, summed across the party for the pool max. Derived
 *  from the player's own max HP so the party scales with progression but stays
 *  clearly squishier than the player (~35% each). */
export function escorteeMaxHp(playerHpMax: number): number {
  const base = Math.round((playerHpMax || 20) * 0.35);
  const jitter = Math.floor(Math.random() * 7) - 3;
  return Math.max(8, Math.min(45, base + jitter));
}

/** Build a fresh shared-pool escort party for an accepted quest. The pool max is
 *  the SUM of `count` members' HP, so a 3-person party is ~3x one member. */
/** OTA-1057 — WHO IS WALKING AT THE FRONT.
 *
 *  An escort was a POOL — label, hp, count — with no individuals in it, so when
 *  the ledger came to cover escorts there was literally nobody to remember. You
 *  could walk three people across the flats, lose one, and the survivors had no
 *  more identity than a stack of rations. Naming the leader is the smallest
 *  change that makes an escort a relationship rather than a hit-point bar: they
 *  go on the ledger, they remember whether you got them home, and next time you
 *  meet them they know you.
 *
 *  The name is drawn deterministically from the party's own shape, so the same
 *  contract accepted twice reads as the same person and a save/reload cannot
 *  reshuffle who you are walking with. */
const ESCORT_LEADERS = [
  'Sena', 'Duvo', 'Halda', 'Ovik', 'Riska', 'Bersk', 'Talla', 'Ymer',
  'Nell', 'Pell', 'Vosk', 'Ilva', 'Teska', 'Grum', 'Onda', 'Marlow',
];

export function escortLeaderName(count: number, hpMax: number, label: string): string {
  let h = 0;
  for (const ch of `${label}|${count}|${hpMax}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ESCORT_LEADERS[h % ESCORT_LEADERS.length]!;
}

export function spawnEscortPool(count: number, playerHpMax: number, label: string): EscortPool {
  let hpMax = 0;
  for (let i = 0; i < count; i++) hpMax += escorteeMaxHp(playerHpMax);
  hpMax = Math.max(1, hpMax);
  const finalLabel = (label && label.trim()) || DEFAULT_ESCORT_LABEL;
  return {
    label: finalLabel,
    hp: hpMax,
    hpMax,
    count,
    // OTA-1057 — the person the ledger remembers. Optional on the type so saves
    // written before this OTA load without one and simply have no leader.
    leaderName: escortLeaderName(count, hpMax, finalLabel),
  };
}

/** The live escort pools across every ACTIVE-and-TRACKED escort quest, for the HUD.
 *  A deactivated (tracked === false) escort contract parks its party — hidden, no
 *  combat damage — until re-activated. */
export function livingEscortPools(
  active: readonly { escort?: EscortPool; tracked?: boolean }[] | undefined,
): EscortPool[] {
  if (!active) return [];
  const out: EscortPool[] = [];
  for (const q of active) {
    if (q.tracked === false) continue; // parked while deactivated
    if (q.escort && q.escort.hp > 0) out.push(q.escort);
  }
  return out;
}

/** OTA-963 — Contracts-screen toggle label (engine_Dev's polish, owner-approved):
 *  when the contract carries a LIVING escort party, the ACTIVATE / DEACTIVATE
 *  button names what it does to them — "stand down your Surveyors" / "recall
 *  your Surveyors" — instead of a bare toggle. */
export function escortToggleLabel(tracked: boolean, party: { label: string } | null | undefined): string {
  if (tracked) return party ? `▮▮ DEACTIVATE (stand down your ${party.label})` : '▮▮ DEACTIVATE';
  return party ? `▶ SET ACTIVE (recall your ${party.label})` : '▶ SET ACTIVE — the mission you’re on';
}

/** ⚠⚠⚠ OTA-1711 — AN ESCORT IS A DELIVERY, AND NOTHING WAS CHECKING THAT.
 *
 *  Measured by the step-3d probe, on the plainest path there is: accept an
 *  escort from an agent, hand it straight back to THAT SAME AGENT without
 *  moving, and the contract completes and pays in full — 70 TC and 8 rep on
 *  "The Survey Line", 160 on "The Founder's Bones". The party spawns at full
 *  health, so the scaled-pay multiplier is 1, and turn-in never asked where
 *  anybody had been. 29 of the 65 faction contracts are this shape, which makes
 *  it the largest family in the game and the one whose work is skippable.
 *
 *  ⚠ THE RULE IS THE WEAKEST ONE THAT CLOSES IT, deliberately. Every escort
 *  objective reads *"escort them to a <faction> agent"* — not to a NAMED place;
 *  none of the 29 carries a `targetLocationName` or an `objectiveLocationId`.
 *  So there is no destination to check against, and inventing one would rewrite
 *  29 contracts on my own authority. What CAN be said without inventing
 *  anything is that the party has to have gone somewhere: you may not hand
 *  people back on the spot you collected them from.
 *
 *  ⚠ It reads `acceptedAtCell`, which is already stamped at accept and already
 *  read one line below the turn-in for the long-haul bonus — so this needs no
 *  new state, and it cannot disagree with the bonus that prices the same walk.
 *
 *  ⚠ FAILS OPEN ON MISSING DATA. A contract accepted before this OTA has no
 *  cell stamped, and refusing those would strand a party the player is already
 *  carrying. An un-stamped escort delivers exactly as it does today. */
export function escortWasCarried(
  acceptedAtCell: { x: number; y: number } | null | undefined,
  hereCell: { x: number; y: number },
): boolean {
  if (!acceptedAtCell) return true;
  return Math.abs(hereCell.x - acceptedAtCell.x) + Math.abs(hereCell.y - acceptedAtCell.y) > 0;
}
