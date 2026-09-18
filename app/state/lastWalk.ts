/* ⚠⚠⚠ OTA-1844 — THE LAST WALK, ORCHESTRATED OUTSIDE THE STORE.
 *
 * `gameStore.ts` is at its ceiling and this is not its job: deciding what an act
 * does, which lines print and when closure is written is the encounter's own
 * business. The store keeps three fields and one call, the same arrangement
 * `combatResolution` already uses — `(get, set)` in, behaviour out.
 *
 * ⚠⚠ NOTHING IN HERE TOUCHES COMBAT. No enemy is built, no HP is rolled, no loot
 * table is consulted, and the hostile path deliberately has nothing to hook
 * into: it is an EXIT, not a fight. That is the owner's ruling expressed as
 * architecture rather than as a guard clause somebody can delete later.
 */
import type { GameStore } from './gameStore';
import type { ForeignDog } from '../engine/fallenLedger';
import {
  buildDogRest,
  lastWalkActLine,
  lastWalkFleeLine,
  lastWalkLeaveLine,
  lastWalkOpeningLog,
  lastWalkSettleLog,
  lastWalkSettles,
  type LastWalkAct,
  type LastWalkChoice,
} from '../engine/fallenDogs';
import { foreignDogPool, cachedHouseName, cachedInstallId, recordRest } from '../engine/fallenLedgerStore';
import { getLocationById } from '../engine/encounter';

type Get = () => GameStore;
type Set = (fn: (s: GameStore) => Partial<GameStore>) => void;

/** The companions this world has not walked with yet. Read straight off the
 *  ledger cache — a dog rested here has already left it. */
export function lastWalkPool(): ForeignDog[] {
  try { return foreignDogPool(); } catch { return []; }
}

/** Open the encounter. Non-hostile by construction: the scene's enemies array is
 *  not read and not written, so nothing about this can become a fight. */
export function openLastWalk(get: Get, set: Set, dog: ForeignDog): void {
  set(() => ({ lastWalkDog: { ...dog }, lastWalkGiven: [] }));
  for (const ln of lastWalkOpeningLog(dog)) get().appendLog(ln.channel, ln.text);
  get().appendLog('debug', `lastwalk: ${dog.name}@${dog.id} pool=${lastWalkPool().length}`);
}

function close(set: Set): void {
  set(() => ({ lastWalkDog: null, lastWalkGiven: [] }));
}

/** ⚠⚠ THE WHOLE RESOLUTION. Three different gentle acts settle the dog — order
 *  free, repeats free and worthless, NO dice anywhere. A dog deciding whether to
 *  trust you on a die roll would make this a slot machine, and the one thing the
 *  moment has to be is something the player chose.
 *
 *  ⚠ LEAVING AND SWINGING BOTH END IT WITH NOTHING WRITTEN. The owner ruled that
 *  walking away must not auto-rest the dog, so it does not: the record stays
 *  open, the companion stays in the pool, and they can be met again. */
export function chooseLastWalk(get: Get, set: Set, choice: LastWalkChoice): void {
  const dog = get().lastWalkDog;
  if (!dog) return;

  if (choice === 'leave') {
    get().appendLog('world', lastWalkLeaveLine(dog));
    close(set);
    void get().persist();
    return;
  }
  if (choice === 'hostile') {
    // No damage, no enemy, no loot, no rest. The dog is simply gone from this
    // ground and still walking somewhere in these wastes.
    get().appendLog('world', lastWalkFleeLine(dog));
    get().appendLog('arbiter', `The Arbiter does not look at you for a while.`);
    close(set);
    void get().persist();
    return;
  }

  const given = get().lastWalkGiven ?? [];
  const already = given.includes(choice);
  get().appendLog('world', lastWalkActLine(dog, choice, already));
  const next: LastWalkAct[] = already ? given : [...given, choice];
  set(() => ({ lastWalkGiven: next }));
  if (!lastWalkSettles(next)) return;

  // ---- settled ------------------------------------------------------------
  const player = get().player;
  const byCharacter = player?.name ?? 'a wanderer';
  let whereRested = 'unmarked ground';
  try { whereRested = getLocationById(player?.currentLocationId ?? '').name ?? whereRested; } catch { /* keep default */ }
  for (const ln of lastWalkSettleLog(dog, byCharacter)) get().appendLog(ln.channel, ln.text);

  // ⚠⚠ ONE CLOSURE, WRITTEN ONCE, AND THE TRUTH IF THE DISK REFUSES. OTA-1838's
  // rule holds here exactly as it does for a corpse: the lines above have
  // already told the player word is going home, so a failed write has to be
  // corrected out loud rather than swallowed. `recordRest` rejects after three
  // attempts and rolls the ledger back, so the companion really is still out
  // there and really can be walked with again.
  void recordRest(buildDogRest({
    dog,
    byPlayer: cachedHouseName() || 'an unnamed house',
    byInstallId: cachedInstallId(),
    byCharacter,
    whereRested,
    ts: Date.now(),
  })).catch(() => {
    get().appendLog(
      'world',
      `But nothing of it could be written down — no word goes to ${dog.handler}'s house, and ${dog.name} may be out there still. Free some space and sit with them again.`,
    );
  });
  close(set);
  void get().persist();
}
