/* ⚠⚠⚠ OTA-1850 — A RESURRECTION GEM BELONGS TO THE TARTARIAN WHO EARNED IT.
 *
 * TWO THINGS HAPPEN HERE AT ONCE, and they are the same change.
 *
 * ── THE PRODUCT RULING ────────────────────────────────────────────────────
 * Gems were install-wide. That let a player farm them on characters they did
 * not care about and spend them on the one they did — bank three gems on three
 * throwaway runs, then make a favourite effectively unkillable. The owner ruled
 * the currency character-bound: a gem is earned BY someone and spendable only
 * BY them. Deleting a character does not release their gems; switching
 * characters switches the balance; there is no pool and no transfer.
 *
 * ── THE DURABILITY REPAIR ─────────────────────────────────────────────────
 * The same change closes three reproduced crash bugs, and it is worth being
 * precise about WHY, because the repair is a deletion rather than a mechanism.
 *
 * All three hazards had one shape: TWO DURABLE STORES, ONE COMMIT ORDERING,
 * NO IDEMPOTENCY MARKER. The gem balance lived in `tartaria.global.v2`; the
 * thing it paid for (the revival, the "already paid" keepsake mark) lived in
 * the character's own slot key. AsyncStorage has no cross-key transaction, so
 * one of them landed first and a crash in between left a state the game could
 * not reason about — charged-and-still-dead, or paid-and-never-marked.
 *
 * Moving the balance INTO the character record removes the second store. The
 * spend and the revival are now one field-assignment pair on one object,
 * written once. The gem and the keepsake mark likewise. There is no ordering
 * left to choose and therefore none to get wrong — which is why this OTA ships
 * NO boot reconciliation machinery. There is nothing to reconcile.
 *
 * What still needs a mechanism is CONCURRENCY — two callers racing on the SAME
 * record — and that is `mutateSlot`, deliberately built to the same shape as
 * OTA-1835's `mutateGlobalStash`: one serialized queue, load → mutate → save.
 *
 * ── WHAT THIS SUITE REFUSES TO PRETEND ────────────────────────────────────
 * The legacy handover (§F) divides the old shared pool by DURABLE IN-WORLD
 * GAME HOURS. That is a heuristic and the tests say so in their names. It is
 * not provenance: nothing in the old data records who earned a gem. Two better
 * -sounding rules were tried and rejected on evidence — death counts are
 * unattributable (`FallenHero` carries no character identity and the list is
 * capped), and `savedAt - createdAt` measures wall-clock elapsed, not play.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { placedAt } from '../test-utils/placePlayer';
import {
  SLOT_UNCHANGED,
  claimLegacyGems,
  ensureLegacyGemPlan,
  gemsAfterGrant,
  loadGlobalStash,
  loadSlot,
  mutateSlot,
  newDeathId,
  planLegacyGemAllocation,
  runLegacyGemHandover,
  sanitizeGameHours,
  saveGlobalStash,
  saveSlot,
  spendGemAndRevive,
} from '../app/engine/saveSystem';
import type { PlayerCharacter, SaveState } from '../app/engine/types';

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** ⚠ TOTAL BY DESIGN: strips block + line comments before any absence claim is
 *  graded, so a rule written only in prose can never pass for a rule in code
 *  (the OTA-1847 lesson). */
function codeOnly(parts: string[]): string {
  return readFileSync(join(__dirname, '..', ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function player(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Nadia', raceId: 'human', factionId: 'reclaimers',
    hp: 10, hpMax: 10, stamina: 5, staminaMax: 5,
    // ⚠ OTA-1484's rule — a live player fixture gets coordinate-consistent
    // placement rather than a bare location id. Nothing here reads position;
    // the point is that a save written by this suite is a save the loader
    // would accept, so the gem behaviour is measured on a realistic record.
    ...placedAt('voronov'),
    hoursElapsed: 0,
    ...over,
  } as unknown as PlayerCharacter;
}

function save(p: PlayerCharacter | null): SaveState {
  return {
    version: 1, savedAt: Date.now(), player: p,
    worldMemory: {} as SaveState['worldMemory'], gameLog: [],
    currentScreen: 'exploration',
  } as SaveState;
}

const put = (slotId: string, p: PlayerCharacter) => saveSlot(slotId, save(p));
const gemsOf = async (slotId: string) => (await loadSlot(slotId))?.player?.resurrectionGems ?? 0;

/** The revival the production caller supplies: alive, topped up. */
const revive = (dead: PlayerCharacter): PlayerCharacter =>
  ({ ...dead, dead: false, hp: dead.hpMax, stamina: dead.staminaMax ?? dead.stamina });

const EMPTY_STASH = () => ({
  resurrectionGems: 0, endingBadges: [], installSeeded: true,
  devGemGrantedSlots: [], testGiftGrantedSlots: [], fallen: [], fallenSeeds: [],
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await saveGlobalStash(EMPTY_STASH());
});

/* ═══ §A — THE BALANCE IS ON THE CHARACTER ══════════════════════════════════ */

describe('OTA-1850 §A — the gem lives on the character, not the install', () => {
  test('A1 ⚠⚠⚠ two characters hold their own gems and neither can see the other', async () => {
    await put('a', player({ name: 'A', resurrectionGems: 3 }));
    await put('b', player({ name: 'B', resurrectionGems: 0 }));
    expect(await gemsOf('a')).toBe(3);
    expect(await gemsOf('b')).toBe(0);
  });

  test('A2 ⚠⚠⚠ THE FARMING CASE — a hoard on a throwaway cannot raise a favourite', async () => {
    // The disposable farm: nine gems banked on a character nobody plays.
    await put('farm', player({ name: 'Mule', resurrectionGems: 9 }));
    // The favourite, dead and broke.
    await put('fav', player({ name: 'Favourite', resurrectionGems: 0, dead: true, deathId: 'd1' }));

    const out = await spendGemAndRevive('fav', revive);

    expect(out.ok).toBe(false);                      // refused
    expect((await loadSlot('fav'))?.player?.dead).toBe(true);
    expect(await gemsOf('farm')).toBe(9);            // and the hoard is untouched
  });

  test('A3 ⚠ deleting a character does not release their gems to anyone', async () => {
    await put('doomed', player({ name: 'Doomed', resurrectionGems: 4 }));
    await put('heir', player({ name: 'Heir', resurrectionGems: 1 }));
    await AsyncStorage.removeItem('tartaria.save.doomed');
    await AsyncStorage.removeItem('tartaria.save.doomed.bak');
    expect(await gemsOf('heir')).toBe(1);            // no inheritance, no pooling
    expect((await loadGlobalStash()).resurrectionGems).toBe(0);
  });

  test('A4 ⚠ the arithmetic authority floors, defaults and never goes negative', () => {
    expect(gemsAfterGrant(null, 1)).toBe(1);
    expect(gemsAfterGrant(undefined, 2)).toBe(2);
    expect(gemsAfterGrant({}, 1)).toBe(1);           // absent on every pre-OTA save
    expect(gemsAfterGrant({ resurrectionGems: 2 }, 1)).toBe(3);
    expect(gemsAfterGrant({ resurrectionGems: 2 }, -5)).toBe(0);
    expect(gemsAfterGrant({ resurrectionGems: 1.9 }, 0)).toBe(1);
  });
});

/* ═══ §B — SPEND AND REVIVE ARE ONE WRITE ═══════════════════════════════════ */

describe('OTA-1850 §B — the spend and the revival cannot come apart', () => {
  test('B1 a funded death is revived and charged exactly one', async () => {
    await put('s', player({ resurrectionGems: 2, dead: true, deathId: 'd1' }));
    const out = await spendGemAndRevive('s', revive);
    expect(out.ok).toBe(true);
    expect(out.gems).toBe(1);
    const p = (await loadSlot('s'))?.player;
    expect(p?.dead).toBe(false);
    expect(p?.resurrectionGems).toBe(1);
    expect(p?.hp).toBe(p?.hpMax);
  });

  test('B2 ⚠⚠ an unfunded death is refused WITHOUT a write — still dead, still 0', async () => {
    await put('s', player({ resurrectionGems: 0, dead: true, deathId: 'd1' }));
    const out = await spendGemAndRevive('s', revive);
    expect(out.ok).toBe(false);
    const p = (await loadSlot('s'))?.player;
    expect(p?.dead).toBe(true);
    expect(p?.resurrectionGems ?? 0).toBe(0);
  });

  test('B3 ⚠⚠⚠ RETRYING THE SAME DEATH IS FREE — the crash-resume case', async () => {
    await put('s', player({ resurrectionGems: 2, dead: true, deathId: 'd1' }));
    const first = await spendGemAndRevive('s', revive);
    const second = await spendGemAndRevive('s', revive);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.alreadySpent).toBe(true);          // answered, not charged
    expect(await gemsOf('s')).toBe(1);               // ONE gem for ONE death
  });

  test('B4 ⚠⚠⚠ A LATER DEATH IS A NEW OPERATION — it costs again', async () => {
    await put('s', player({ resurrectionGems: 2, dead: true, deathId: 'd1' }));
    await spendGemAndRevive('s', revive);
    // …they die again. The death site mints a FRESH id.
    const live = (await loadSlot('s'))!;
    await saveSlot('s', { ...live, player: { ...live.player!, dead: true, deathId: 'd2' } });
    const out = await spendGemAndRevive('s', revive);
    expect(out.ok).toBe(true);
    expect(out.alreadySpent).toBe(false);
    expect(await gemsOf('s')).toBe(0);               // both deaths paid for
  });

  test('B5 ⚠⚠ the caller is handed the record AS WRITTEN, so screen and disk agree', async () => {
    await put('s', player({ resurrectionGems: 1, dead: true, deathId: 'd1' }));
    const out = await spendGemAndRevive('s', revive);
    const onDisk = (await loadSlot('s'))?.player;
    expect(out.player?.resurrectionGems).toBe(onDisk?.resurrectionGems);
    expect(out.player?.dead).toBe(onDisk?.dead);
    expect(out.player?.resurrectedFromDeathId).toBe('d1');
  });

  test('B6 ⚠ a living character is not chargeable', async () => {
    await put('s', player({ resurrectionGems: 3, dead: false }));
    const out = await spendGemAndRevive('s', revive);
    expect(out.ok).toBe(false);
    expect(await gemsOf('s')).toBe(3);
  });

  test('B7 ⚠ a missing slot answers falsely rather than throwing', async () => {
    const out = await spendGemAndRevive('nope', revive);
    expect(out.ok).toBe(false);
    expect(out.gems).toBe(0);
  });
});

/* ═══ §C — THE DEATH'S OWN IDENTITY ═════════════════════════════════════════ */

describe('OTA-1850 §C — a death is identified by a minted nonce, not a clock', () => {
  test('C1 ⚠⚠⚠ THE DISPROVEN IDENTITY: two deaths in one game hour are DIFFERENT', () => {
    /* The earlier proposal was `slotId | characterSeed | floor(hoursElapsed)`.
     * Two genuine deaths inside the same floored game hour produce the SAME
     * string, so the second resurrection would have been read as a retry of
     * the first — and handed out free. A minted nonce cannot collide that way,
     * which is the entire reason it exists. */
    const a = newDeathId();
    const b = newDeathId();
    expect(a).not.toBe(b);
  });

  test('C2 ⚠⚠ a thousand deaths in the same millisecond are still a thousand ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newDeathId()));
    expect(ids.size).toBe(1000);
  });

  test('C3 ⚠⚠⚠ the death site mints one, and does NOT derive it from the clock', () => {
    const src = codeOnly(['app', 'state', 'combatResolution.ts']);
    expect(src).toContain('deathId: newDeathId()');
    /* ⚠ SCOPED TO THE ASSIGNMENT ITSELF, deliberately. A file-wide search for
     * `floor(hoursElapsed)` matches the Fallen memorial's own `hours` field,
     * which is a different, older and perfectly correct use of the clock. The
     * claim here is narrower and the real one: EVERY place that sets `deathId`
     * sets it from the minted nonce, and none of them reads the clock. */
    const assignments = [...src.matchAll(/deathId\s*[:=][^,;\n]*/g)].map((m) => m[0]);
    expect(assignments.length).toBeGreaterThan(0);
    for (const a of assignments) {
      expect(a).not.toContain('hoursElapsed');
      expect(a).not.toContain('Date.now');
      expect(a).not.toContain('characterSeed');
    }
  });

  test('C4 ⚠⚠ the dev-name gem rides INSIDE the death write, not beside it', () => {
    /* It used to be `void addResurrectionGems(1).then(...)` — an async write to
     * a second key, racing the `persist()` of the very record it was meant to
     * credit. Whichever landed second erased the other. */
    const src = codeOnly(['app', 'state', 'combatResolution.ts']);
    expect(src).toContain('resurrectionGems: devGemHeld');
    expect(src).not.toContain('addResurrectionGems');
  });
});

/* ═══ §D — CONCURRENCY ON ONE RECORD ════════════════════════════════════════ */

describe('OTA-1850 §D — two writers on one character do not erase each other', () => {
  test('D1 ⚠⚠⚠ concurrent spends charge ONCE, not twice (double-tap RESURRECT)', async () => {
    await put('s', player({ resurrectionGems: 1, dead: true, deathId: 'd1' }));
    const [x, y] = await Promise.all([
      spendGemAndRevive('s', revive),
      spendGemAndRevive('s', revive),
    ]);
    expect([x.ok, y.ok]).toEqual([true, true]);      // both answered
    expect(x.alreadySpent !== y.alreadySpent).toBe(true); // exactly one paid
    expect(await gemsOf('s')).toBe(0);               // never -1, never 1
  });

  test('D2 ⚠⚠ concurrent unrelated mutations both survive (the OTA-1835 shape)', async () => {
    await put('s', player({ resurrectionGems: 0, name: 'Start' }));
    await Promise.all([
      mutateSlot('s', (st) => { st.player!.resurrectionGems = 5; return 1; }),
      mutateSlot('s', (st) => { st.player!.name = 'Renamed'; return 1; }),
    ]);
    const p = (await loadSlot('s'))?.player;
    expect(p?.resurrectionGems).toBe(5);             // neither write erased
    expect(p?.name).toBe('Renamed');
  });

  test('D3 ⚠⚠ a rejected mutation does not strand the ones queued behind it', async () => {
    await put('s', player({ resurrectionGems: 0 }));
    const boom = mutateSlot('s', () => { throw new Error('fault'); });
    await expect(boom).rejects.toThrow('fault');     // rejects to ITS caller …
    const after = await mutateSlot('s', (st) => { st.player!.resurrectionGems = 7; return 7; });
    expect(after).toBe(7);                           // … and the queue moves on
    expect(await gemsOf('s')).toBe(7);
  });

  test('D4 ⚠ SLOT_UNCHANGED writes nothing at all', async () => {
    await put('s', player({ resurrectionGems: 2 }));
    const before = (await loadSlot('s'))!.savedAt;
    const out = await mutateSlot('s', () => SLOT_UNCHANGED);
    expect(out).toBe(SLOT_UNCHANGED);
    expect((await loadSlot('s'))!.savedAt).toBe(before);
  });

  test('D5 ⚠ different characters are not queued behind each other', async () => {
    await put('a', player({ resurrectionGems: 0 }));
    await put('b', player({ resurrectionGems: 0 }));
    await Promise.all([
      mutateSlot('a', (st) => { st.player!.resurrectionGems = 1; return 1; }),
      mutateSlot('b', (st) => { st.player!.resurrectionGems = 2; return 2; }),
    ]);
    expect(await gemsOf('a')).toBe(1);
    expect(await gemsOf('b')).toBe(2);
  });
});

/* ═══ §E — THE ALLOCATION ARITHMETIC (pure) ═════════════════════════════════ */

describe('OTA-1850 §E — largest-remainder allocation, by durable in-world game hours', () => {
  const rows = (p: ReturnType<typeof planLegacyGemAllocation>) =>
    Object.fromEntries(p.rows.map((r) => [r.slotId, r.gems]));

  test('E1 ⚠⚠⚠ EXACT CONSERVATION — the total is never created or destroyed', () => {
    for (const total of [1, 2, 3, 7, 10, 13, 100]) {
      const p = planLegacyGemAllocation(total, [
        { slotId: 'a', gameHours: 1 }, { slotId: 'b', gameHours: 2 },
        { slotId: 'c', gameHours: 7 },
      ], 'a');
      expect(p.rows.reduce((n, r) => n + r.gems, 0)).toBe(total);
    }
  });

  test('E2 ⚠⚠ the split is proportional where it divides evenly', () => {
    const p = planLegacyGemAllocation(10, [
      { slotId: 'a', gameHours: 20 }, { slotId: 'b', gameHours: 30 },
    ], 'a');
    expect(rows(p)).toEqual({ a: 4, b: 6 });
    expect(p.fallback).toBe(false);
  });

  test('E3 ⚠⚠⚠ the remainder goes to the largest fraction, tie-broken on slotId', () => {
    // 1 gem, two identical claims: deterministic, and 'a' < 'b'.
    const p = planLegacyGemAllocation(1, [
      { slotId: 'b', gameHours: 5 }, { slotId: 'a', gameHours: 5 },
    ], 'b');
    expect(rows(p)).toEqual({ a: 1, b: 0 });
  });

  test('E4 ⚠⚠ THE SAME INPUTS ALWAYS GIVE THE SAME ANSWER, in any listed order', () => {
    const input = [
      { slotId: 'c', gameHours: 3.5 }, { slotId: 'a', gameHours: 1.25 },
      { slotId: 'b', gameHours: 9 }, { slotId: 'd', gameHours: 0.75 },
    ];
    const first = rows(planLegacyGemAllocation(7, input, 'a'));
    const shuffled = rows(planLegacyGemAllocation(7, [...input].reverse(), 'd'));
    expect(shuffled).toEqual(first);
  });

  test('E5 ⚠⚠ a zero-hour character gets NOTHING while anyone has hours', () => {
    const p = planLegacyGemAllocation(5, [
      { slotId: 'idle', gameHours: 0 }, { slotId: 'played', gameHours: 12 },
    ], 'idle');
    expect(rows(p)).toEqual({ idle: 0, played: 5 });
  });

  test('E6 ⚠⚠⚠ NO USABLE HOURS → the active character takes it, and it is RECORDED', () => {
    const p = planLegacyGemAllocation(4, [
      { slotId: 'x', gameHours: 0 }, { slotId: 'y', gameHours: 0 },
    ], 'y');
    expect(rows(p)).toEqual({ x: 0, y: 4 });
    expect(p.fallback).toBe(true);                   // the record does not pretend
    expect(p.totalHours).toBe(0);
  });

  test('E7 ⚠ with no active character the fallback still lands somewhere stable', () => {
    const p = planLegacyGemAllocation(3, [
      { slotId: 'z', gameHours: 0 }, { slotId: 'a', gameHours: 0 },
    ], null);
    expect(rows(p)).toEqual({ a: 3, z: 0 });         // lexically first, not random
  });

  test('E8 ⚠⚠ SANITIZATION — missing, NaN, Infinity and negative all mean zero', () => {
    expect(sanitizeGameHours(undefined)).toBe(0);
    expect(sanitizeGameHours(null)).toBe(0);
    expect(sanitizeGameHours(Number.NaN)).toBe(0);
    expect(sanitizeGameHours(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeGameHours(-4)).toBe(0);
    expect(sanitizeGameHours('12' as unknown)).toBe(0);
    expect(sanitizeGameHours(12.5)).toBe(12.5);      // finite positive survives
  });

  test('E9 ⚠ a poisoned weight cannot swallow the pool', () => {
    const p = planLegacyGemAllocation(6, [
      { slotId: 'bad', gameHours: Number.POSITIVE_INFINITY },
      { slotId: 'good', gameHours: 3 },
    ], 'bad');
    expect(rows(p)).toEqual({ bad: 0, good: 6 });
  });
});

/* ═══ §F — THE ONE-TIME HANDOVER ════════════════════════════════════════════ */

describe('OTA-1850 §F — the legacy pool is handed over once and then obeyed', () => {
  test('F1 ⚠⚠⚠ the pool is split by hours, banked on each character, and zeroed', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 10 });
    await put('a', player({ name: 'A', hoursElapsed: 20 }));
    await put('b', player({ name: 'B', hoursElapsed: 30 }));

    await runLegacyGemHandover('a');

    expect(await gemsOf('a')).toBe(4);
    expect(await gemsOf('b')).toBe(6);
    const stash = await loadGlobalStash();
    expect(stash.resurrectionGems).toBe(0);          // no spendable pool remains
  });

  test('F2 ⚠⚠⚠ IT RUNS EXACTLY ONCE — repeated boots never credit twice', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 6 });
    await put('a', player({ hoursElapsed: 10 }));
    await runLegacyGemHandover('a');
    await runLegacyGemHandover('a');
    await runLegacyGemHandover('a');
    expect(await gemsOf('a')).toBe(6);
  });

  test('F3 ⚠⚠⚠ THE INPUT SNAPSHOT IS PERSISTED, not just the answer', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 10 });
    await put('a', player({ hoursElapsed: 20 }));
    await put('b', player({ hoursElapsed: 30 }));
    await runLegacyGemHandover('a');

    const plan = (await loadGlobalStash()).legacyGemMigration!;
    expect(plan.total).toBe(10);                      // the original pool
    expect(plan.totalHours).toBe(50);                 // the weights it used
    expect(plan.fallback).toBe(false);                // which rule applied
    expect(plan.rows).toEqual([
      { slotId: 'a', gameHours: 20, gems: 4 },
      { slotId: 'b', gameHours: 30, gems: 6 },
    ]);
    // …so the arithmetic can be audited later instead of taken on trust.
  });

  test('F4 ⚠⚠⚠ MORE PLAY AFTERWARDS DOES NOT RE-CUT THE PIE', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 10 });
    await put('a', player({ hoursElapsed: 20 }));
    await put('b', player({ hoursElapsed: 30 }));
    await runLegacyGemHandover('a');

    // 'a' plays for a hundred more in-world hours and the game reboots.
    const liveA = (await loadSlot('a'))!;
    await saveSlot('a', { ...liveA, player: { ...liveA.player!, hoursElapsed: 500 } });
    await runLegacyGemHandover('a');

    expect(await gemsOf('a')).toBe(4);                // replayed, not recomputed
    expect(await gemsOf('b')).toBe(6);
  });

  test('F5 ⚠⚠⚠ SWITCHING THE ACTIVE CHARACTER AFTERWARDS CHANGES NOTHING', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 5 });
    await put('a', player({ hoursElapsed: 1 }));
    await put('b', player({ hoursElapsed: 4 }));
    await runLegacyGemHandover('a');
    await runLegacyGemHandover('b');                  // a later boot, other slot
    expect(await gemsOf('a')).toBe(1);
    expect(await gemsOf('b')).toBe(4);
  });

  test('F6 ⚠⚠ A CRASH AFTER THE PLAN IS WRITTEN RESUMES THE SAME ALLOCATION', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 7 });
    await put('a', player({ hoursElapsed: 3 }));
    await put('b', player({ hoursElapsed: 4 }));

    // The plan is computed and the pool zeroed — then the process dies before
    // a single character record is credited.
    const plan = await ensureLegacyGemPlan('a');
    expect(plan!.rows.reduce((n, r) => n + r.gems, 0)).toBe(7);
    expect((await loadGlobalStash()).resurrectionGems).toBe(0);
    expect(await gemsOf('a')).toBe(0);

    // Next boot finishes the job, from the persisted rows.
    await runLegacyGemHandover('a');
    expect(await gemsOf('a')).toBe(3);
    expect(await gemsOf('b')).toBe(4);
  });

  test('F7 ⚠⚠ a half-finished handover credits the rest and no one twice', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 7 });
    await put('a', player({ hoursElapsed: 3 }));
    await put('b', player({ hoursElapsed: 4 }));
    await ensureLegacyGemPlan('a');
    await claimLegacyGems('a');                       // only 'a' got paid …
    expect(await gemsOf('a')).toBe(3);
    expect(await gemsOf('b')).toBe(0);
    await runLegacyGemHandover('a');                  // … crash, reboot
    expect(await gemsOf('a')).toBe(3);                // not 6
    expect(await gemsOf('b')).toBe(4);
  });

  test('F8 ⚠⚠ a character claiming concurrently is credited once', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 4 });
    await put('a', player({ hoursElapsed: 1 }));
    await ensureLegacyGemPlan('a');
    await Promise.all([claimLegacyGems('a'), claimLegacyGems('a'), claimLegacyGems('a')]);
    expect(await gemsOf('a')).toBe(4);
  });

  test('F9 ⚠⚠ existing character-bound gems are ADDED TO, never overwritten', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 2 });
    await put('a', player({ hoursElapsed: 5, resurrectionGems: 3 }));
    await runLegacyGemHandover('a');
    expect(await gemsOf('a')).toBe(5);
  });

  test('F10 ⚠⚠ a character created AFTER the plan gets nothing from it', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 6 });
    await put('a', player({ hoursElapsed: 5 }));
    await runLegacyGemHandover('a');
    await put('new', player({ name: 'Newcomer', hoursElapsed: 0 }));
    await runLegacyGemHandover('new');
    expect(await gemsOf('new')).toBe(0);
    expect(await gemsOf('a')).toBe(6);
  });

  test('F11 ⚠ nothing to hand over is silent and writes no plan', async () => {
    await put('a', player({ hoursElapsed: 5 }));
    expect(await runLegacyGemHandover('a')).toBe(0);
    expect((await loadGlobalStash()).legacyGemMigration).toBeUndefined();
  });
});

/* ═══ §G — THE FRESH-INSTALL SEED ═══════════════════════════════════════════ */

describe('OTA-1850 §G — one free gem per install, to the first character', () => {
  test('G1 ⚠⚠⚠ WITH NO CHARACTERS YET the seed is HELD, not lost', async () => {
    // Boot banks the seed before anyone exists. Computing a plan here would
    // produce a plan with no rows and zero the pool — losing the free gem.
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 1 });
    expect(await runLegacyGemHandover(null)).toBe(0);
    const stash = await loadGlobalStash();
    expect(stash.resurrectionGems).toBe(1);          // still waiting
    expect(stash.legacyGemMigration).toBeUndefined();
  });

  test('G2 ⚠⚠⚠ THE FIRST CHARACTER CREATED RECEIVES IT', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 1 });
    await put('first', player({ name: 'First', hoursElapsed: 0 }));
    await claimLegacyGems('first');
    expect(await gemsOf('first')).toBe(1);
    expect((await loadGlobalStash()).resurrectionGems).toBe(0);
  });

  test('G3 ⚠⚠⚠ AND THE SECOND CHARACTER GETS NONE — it is per install, not per head', async () => {
    await saveGlobalStash({ ...EMPTY_STASH(), resurrectionGems: 1 });
    await put('first', player({ name: 'First', hoursElapsed: 0 }));
    await claimLegacyGems('first');
    await put('second', player({ name: 'Second', hoursElapsed: 0 }));
    await claimLegacyGems('second');
    expect(await gemsOf('first')).toBe(1);
    expect(await gemsOf('second')).toBe(0);
  });
});

/* ═══ §H — WHAT THE SOURCE MAY NO LONGER DO ═════════════════════════════════ */

describe('OTA-1850 §H — the old install-wide paths are gone from gameplay', () => {
  test('H1 ⚠⚠⚠ no gameplay file mints a gem through the install-wide stash', () => {
    for (const parts of [
      ['app', 'state', 'gameStore.ts'],
      ['app', 'state', 'combatResolution.ts'],
      ['app', 'state', 'slices', 'slotSlice.ts'],
    ]) {
      expect(codeOnly(parts)).not.toContain('addResurrectionGems');
    }
  });

  test('H2 ⚠⚠⚠ resurrection goes through the ONE-WRITE door', () => {
    const slice = codeOnly(['app', 'state', 'slices', 'slotSlice.ts']);
    expect(slice).toContain('spendGemAndRevive');
    // and does not read an install-wide total to decide eligibility
    expect(slice).not.toContain('get().resurrectionGems <= 0');
  });

  test('H3 ⚠⚠⚠ THE ROSTER ASKS THE RECORD, NOT THE INSTALL', () => {
    const title = codeOnly(['app', 'screens', 'TitleScreen.tsx']);
    expect(title).toContain('slot.resurrectionGems');
    // the global chit is gone: no store-wide gem selector remains
    expect(title).not.toContain('useGameStore((s) => s.resurrectionGems)');
    expect(title).not.toContain('TResourceChit');
  });

  test('H4 ⚠⚠ the count reads on the DOSSIER, in the record’s own meta voice', () => {
    const title = codeOnly(['app', 'screens', 'TitleScreen.tsx']);
    expect(title).toContain('item.resurrectionGems');
    expect(title).toContain('RESURRECTION GEM');
  });

  test('H5 ⚠⚠ boot shows no install-wide total, because none exists', () => {
    const boot = codeOnly(['app', 'state', 'slices', 'bootSlice.ts']);
    expect(boot).not.toContain('resurrectionGems: stash.resurrectionGems');
    expect(boot).toContain('runLegacyGemHandover');
  });

  test('H6 ⚠⚠⚠ THE ECONOMY IS UNTOUCHED — the cost is still exactly one gem', () => {
    const sys = codeOnly(['app', 'engine', 'saveSystem.ts']);
    expect(sys).toContain('held - 1');
    expect(sys).not.toMatch(/held\s*-\s*[02-9]/);
  });

  test('H7 ⚠⚠ the boss keepsake banks its gem and its paid-mark in ONE update', () => {
    const store = codeOnly(['app', 'state', 'gameStore.ts']);
    const at = store.indexOf('gemsAfterGrant(get().player, keep.gem)');
    expect(at).toBeGreaterThan(-1);
    const mark = store.indexOf('recordKeepsakePaid', at);
    expect(mark).toBeGreaterThan(at);
    const between = store.slice(at, mark);
    expect(between).not.toContain('.then(');          // no async gap to crash in
    expect(between).not.toContain('await ');
  });
});
