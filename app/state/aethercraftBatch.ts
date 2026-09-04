// ⚠⚠ OTA-1673 — CASTS BY THE HANDFUL, and where that logic lives.
//
// Owner: *"stone manipulation should have a plus and minus button so you can do
// more than one at a time. It should also have the max button there as well."*
//
// This is the batch layer around a single Aethercraft cast. It is its own
// module for the reason the slice program (OTA-1400 onward) exists: gameStore
// has a line-count ratchet, and the first draft of this OTA put the batch loop
// inline there and tripped it by 68 lines. The ratchet is not a formality — it
// is what stops the store growing back into the file the slices were cut out
// of — so the loop moved here and the store calls it with the single-cast body
// injected, the same shape as `CraftingSliceDeps`.
//
// ⚠⚠⚠ THE STOP-TEST IS THE PART THAT NEARLY SHIPPED WRONG. My first draft
// compared a fuel fingerprint before and after each pass and stopped when
// nothing moved. A probe caught it: a shape cast with fuel but NO Small Rock
// still BURNS the fuel ("you shape the Aetherstone but have no Small Rock to
// bind it to"), so the fingerprint moved, the loop ran on, and asking for 5
// casts with 3 rocks rolled FIVE times — spending two Aether Residue on attempts
// that could not produce anything, and reporting nothing wrong. Spending a
// player's materials silently on attempts that cannot succeed is the exact
// class of defect this project keeps closing. The test now asks whether the
// NEXT cast can finish, and names what ran out.

import type { PlayerCharacter, GolemKind } from '../engine/types';

/** The one thing this module reads off a scene. Structural on purpose:
 *  `CurrentScene` is declared inside gameStore, and importing it here would
 *  re-create the store dependency this module exists to avoid. */
type SceneLike = { enemies?: readonly unknown[] | null };

export type AetherDiscipline = 'shape' | 'summon' | 'mend';

/** How many casts one tap may buy. The same shape as MAX_CRAFT_BATCH: a bound
 *  so a stuck + button or a bad MAX read cannot spend a whole pack — not a
 *  balance lever. Shared with the picker so it can never offer a number the
 *  action would silently clamp. */
export const MAX_CAST_BATCH = 99;

/** The single-cast body, injected so this module does not import the store. */
export type CastOnce = (
  discipline: AetherDiscipline,
  player: PlayerCharacter,
  golemKindHint: GolemKind | null | undefined,
) => void;

/** ⚠⚠ WHAT THE NEXT CAST WOULD RUN OUT OF, or null when it can complete.
 *
 *  It names BOTH costs a shape has, because it has two: one unit of aether fuel
 *  AND — out of combat, where the cast pulls a shard out of a rock — one Small
 *  Rock. In combat, shape raises a ward and needs no rock, so the rock is not
 *  required there. Returning the NAME rather than a boolean lets the stop line
 *  tell the player which one ran out. */
export function aethercraftShortfall(
  p: PlayerCharacter,
  discipline: AetherDiscipline,
  scene: SceneLike,
): string | null {
  const have = (n: string) => p.inventory
    .filter((i) => i.name.toLowerCase() === n.toLowerCase())
    .reduce((s, i) => s + (i.quantity ?? 0), 0);
  const fuels = discipline === 'mend'
    ? ['Aether Crystal', 'Aetheric Shard']
    : ['Aether Residue', 'Aether Mud', 'Aether Crystal', 'Aetheric Shard', 'Golem Core'];
  if (!fuels.some((f) => have(f) > 0)) return 'aether fuel';
  if (discipline === 'shape' && (scene.enemies?.length ?? 0) === 0 && have('Small Rock') <= 0) {
    return 'Small Rock to bind the shape to';
  }
  return null;
}

/** Cast `times` times inside ONE action. Each cast is genuinely its own d20 —
 *  that is the discipline, and batching must not turn ten rolls into one — so
 *  the loop is here, around the roll and its outcome, rather than around
 *  submitPlayerAction: one parse, one Arbiter remark, one persist, N honest
 *  rolls. It re-reads the live player each pass (fuel and rocks are being spent
 *  as it goes) and stops the moment the next cast could not be paid for. */
export function runAethercraftBatch(
  discipline: AetherDiscipline,
  livePlayer: () => PlayerCharacter | null | undefined,
  say: (channel: 'arbiter', text: string) => void,
  scene: SceneLike,
  golemKindHint: GolemKind | null | undefined,
  times: number,
  once: CastOnce,
): void {
  // ⚠ A summon can never batch: one golem wears the tether, and the single-cast
  // body refuses the second anyway. Clamped here so the intent is visible.
  const wanted = discipline === 'summon' ? 1 : Math.max(1, Math.min(Math.floor(times), MAX_CAST_BATCH));
  if (wanted <= 1) {
    const p = livePlayer();
    if (p) once(discipline, p, golemKindHint);
    return;
  }
  let done = 0;
  let ranDry = '';
  for (let i = 0; i < wanted; i++) {
    const live = livePlayer();
    if (!live) break;
    const short = aethercraftShortfall(live, discipline, scene);
    if (short) { ranDry = short; break; }
    once(discipline, live, golemKindHint);
    done++;
  }
  if (done < wanted) {
    say('arbiter', `The Arbiter lowers his hands. "That is ${done} of ${wanted}${ranDry ? ` — you're out of ${ranDry}` : ''}."`);
  }
}
