/* ⚠⚠⚠ OTA-1845 — THE ENDLESS STAIR, MOVED OUT OF THE STORE.
 *
 * ⚠ THE MOVE IS THE STORE CEILING'S DOING, AND THE CEILING WAS RIGHT AGAIN.
 * `gameStore.ts` sat exactly AT its 36,837-line limit after OTA-1844, and the
 * Ledger's rider needed store lines that did not exist. The gate's own rule
 * answers that: the responsibility belongs in a module outside the file. A
 * self-contained title trial — one DEX check, its own retry policy, its own
 * three-dive counter — is a responsibility, and it was only ever in the store
 * because that is where it happened to be typed.
 *
 * ⚠⚠ THE BODY IS BYTE-IDENTICAL TO WHAT SHIPPED. Nothing about the dive, the
 * DC, the damage, the non-lethal floor or the banking changed in this OTA; the
 * name is re-exported from `gameStore` so no importer had to move either. If
 * this trial behaves differently after 1845, that is a defect and not a design.
 */
import type { GameStore } from './gameStore';
import { effectiveStats } from '../engine/equipment';
import { checkLowHpWarning } from './combatResolution';

type StoreGet = () => GameStore;
type StoreSet = (u: Partial<GameStore> | ((s: GameStore) => Partial<GameStore> | GameStore)) => void;

// arb55 — Trap Dives of the Endless Stair (Shadow Diver). Unlike the one-shot
// title trials this is a RETRYABLE DEX gauntlet: each dive is a single d20 + DEX
// vs DC 13. A CLEAN dive (pass) banks one of the three you need — trapCleanDives
// accumulates persistently on the player, so the three can be earned across
// separate visits. A tripped trap (fail) springs for 1d6 (never lethal — the
// stair lets you try again) and banks nothing. Scouting is free and reports the
// DC + clean dives banked. At three clean dives recordTitleProgress awards
// Shadow Diver. `isDive` = the player committed a dive; otherwise it's a scout.
export function handleTrapDive(getStore: StoreGet, setStore: StoreSet, isDive: boolean): void {
  const player = getStore().player;
  if (!player) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tc = require('../engine/titleChallenges');
  // ⚠ Lazily required for the same reason `titleChallenges` is: the award
  // counter lives on the store's own export surface, and a static import back
  // into `gameStore` would close the cycle this extraction exists to avoid.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recordTitleProgress } = require('./gameStore') as typeof import('./gameStore');
  const dex = effectiveStats(player).dexterity ?? 0;
  const dc = 13;
  const banked = player.titleProgress?.trapCleanDives ?? 0;

  if (banked >= 3) {
    getStore().appendLog('world', 'You have run the stair clean three times over — its traps hold no more names for you. (Shadow Diver is already yours.)');
    return;
  }

  // ── SCOUT (free) ──────────────────────────────────────────────────────────
  if (!isDive) {
    getStore().appendLog(
      'world',
      `The stair drops away into trap-laced dark. Each dive is a single d20 + DEX (yours: ${dex}) against DC ${dc} — read the pressure-plates and time the fall. ` +
      `Clean dives banked: ${banked}/3. (DIVE THE STAIR to attempt one — a miss springs the trap but costs you no run; you can dive again.)`,
    );
    return;
  }

  // ── DIVE (retryable) ──────────────────────────────────────────────────────
  const r = tc.rollCheck(dex, dc);
  const rollLine = `(d20 ${r.roll} + DEX ${dex} = ${r.total} vs DC ${dc})`;
  if (r.success) {
    const nowBanked = banked + 1;
    if (nowBanked >= 3) {
      getStore().appendLog('world', `You read the last plate a heartbeat before it reads you and roll clear onto the landing. Three dives, none sprung — you move through this place like it was built for you. ${rollLine}`);
    } else {
      getStore().appendLog('world', `You thread the dive clean — plates unsprung, rope true. That's ${nowBanked}/3. ${rollLine}`);
    }
    recordTitleProgress(getStore, setStore, { trapCleanDives: 1 });
  } else {
    const dmg = 1 + Math.floor(Math.random() * 6);
    const newHp = Math.max(1, player.hp - dmg); // non-lethal — the stair lets you try again
    setStore((s) => (s.player ? { player: { ...s.player, hp: newHp } } : s));
    getStore().appendLog('world', `A plate gives under your heel — a whir of darts, a dropped step. The trap springs for ${dmg} (${newHp}/${player.hpMax} HP). Still ${banked}/3 clean; steady yourself and dive again. ${rollLine}`);
    checkLowHpWarning(player.hp, newHp, player.hpMax ?? 1, getStore, setStore);
  }
}
