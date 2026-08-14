jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1254 — "[equipped]" ON A HAND THAT HELD SOMETHING ELSE.
//
// From the owner's device log on 4.29.181, a Tartarian Giant, one line apart:
//
//     [reward] ✦ Cudgel (Common). [equipped]
//     [debug] stats: ... worn: main=Mud-fist Wraps chest=Mud-Warden's Vest
//
// ⚠⚠ THE GUARD WAS A NAME CHECK ON A TAG CONCEPT AND NEVER FIRED ONCE.
// `grantTutorialItem` auto-equipped the cudgel only when
// `equipped.main.includes('barehand')` — but the barehanded starter is called
// **Mud-fist Wraps**, and `barehanded` is a TAG, not part of any name. Measured
// against RACE_PRIMARY below: not one of the four starting weapons contains that
// substring, so the branch was unreachable for EVERY race since it was written,
// while the beat announced "[equipped]" to all of them.
//
// ⚠⚠ AND FIVE OF THE SEVEN RACES SHOULD HAVE GOT IT. The Cudgel is 1d8; Rusted
// Blade and Pyric Wand are 1d6. Only the Tartarian Spear (2d6) and the Mud-fist
// Wraps (1d10) out-hit it — and since OTA-1252 those two ready it in the EMPTY OFF
// HAND, which every race starts with. So the beat's promise ("you'll want a
// weapon") now holds for all seven without ever downgrading anyone.
//
// ⚠ THIRD TIME THIS SESSION A LOG LINE HAS CLAIMED SOMETHING THE ENGINE DID NOT
// DO — the five-vest reward (OTA-1250), the "open your pack" chore (OTA-1251), and
// this. **The pattern is always the same: the narration is unconditional and the
// action is not.**
import { WEAPONS } from '../app/engine/crafting';
import { isUpgradeOverEquipped, upgradeEquipSlot } from '../app/engine/gatherSort';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** The starting weapons the game actually hands out, read from the source of
 *  truth rather than restated here. */
function racePrimaries(): string[] {
  const ch = src('app', 'engine', 'character.ts');
  const i = ch.indexOf('const RACE_PRIMARY: Record<string, string> = {');
  const block = ch.slice(i, ch.indexOf('};', i));
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((s) => !s.includes('_'));
}

const avg = (d: string): number => {
  const m = /^(\d+)d(\d+)$/.exec(d);
  return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : 0;
};

/** A freshly-created character of each race: primary in main, off hand EMPTY. */
const starter = (weapon: string) => ({
  equipped: { main: weapon },
  inventory: [{ id: 'p', name: weapon, kind: 'weapon', rarity: 'Common', quantity: 1, tags: [] }],
});

describe('OTA-1254 — the dead guard, measured', () => {
  it('⚠⚠ NOT ONE starting weapon name contains "barehand" — the branch was unreachable', () => {
    // ⚠ THE BUG, stated as the measurement that proves it. If a future starter is
    // named "Barehand Wraps" this fails, and whoever wrote it learns the old guard
    // is gone and the comparison replaced it.
    const primaries = racePrimaries();
    expect(primaries.length).toBeGreaterThanOrEqual(4);
    for (const w of primaries) expect(w.toLowerCase()).not.toContain('barehand');
    // ...and the guard itself is gone.
    expect(src('app', 'state', 'gameStore.ts')).not.toContain("equipped.main.includes('barehand')");
  });

  it('⚠⚠ every starting weapon is a REAL catalog row — the comparison can resolve it', () => {
    // A starter the catalog cannot find would make `isUpgradeOverEquipped` refuse
    // to claim anything, and the cudgel would silently never ready again.
    for (const w of racePrimaries()) {
      expect(WEAPONS.some((c) => c.name === w)).toBe(true);
    }
  });
});

describe('OTA-1254 — the cudgel now goes somewhere, for every race', () => {
  const cudgel = WEAPONS.find((w) => w.name === 'Cudgel');

  it('⚠⚠ EVERY race readies it — into the main hand when it wins, the off hand when it does not', () => {
    expect(cudgel).toBeDefined();
    const cudgelAvg = avg(cudgel!.damageDice);
    let toMain = 0;
    let toOff = 0;
    for (const weapon of racePrimaries()) {
      const p = starter(weapon) as never;
      // ⚠ THE PROMISE: the beat says "you'll want a weapon", so no race may finish
      // this beat with the cudgel sitting unequipped in the pack.
      expect({ weapon, upgrade: isUpgradeOverEquipped(p, 'Cudgel') }.upgrade).toBe(true);
      const slot = upgradeEquipSlot(p, 'Cudgel')?.slot;
      expect({ weapon, slot }.slot).toMatch(/^(main|off)$/);
      if (slot === 'main') toMain += 1; else toOff += 1;
      // ...and the hand it picks follows the numbers, never a coin toss.
      const starterAvg = avg(WEAPONS.find((c) => c.name === weapon)!.damageDice);
      expect({ weapon, slot }.slot).toBe(cudgelAvg > starterAvg ? 'main' : 'off');
    }
    // Both branches are exercised by the shipped roster — this is not a rule with
    // one live case.
    expect(toMain).toBeGreaterThan(0);
    expect(toOff).toBeGreaterThan(0);
  });

  it('⚠⚠ it NEVER displaces a better weapon — the Spear and the Wraps keep the main hand', () => {
    // The old fix ("just always equip it") would have handed a 2d6 Sentinel a 1d8
    // club and called it an upgrade.
    for (const weapon of racePrimaries()) {
      const starterAvg = avg(WEAPONS.find((c) => c.name === weapon)!.damageDice);
      if (starterAvg <= avg(cudgel!.damageDice)) continue;
      expect(upgradeEquipSlot(starter(weapon) as never, 'Cudgel')?.slot).toBe('off');
    }
  });
});

describe('OTA-1254 — the beat says what happened', () => {
  it('⚠⚠ the reward line is CONDITIONAL — no unearned "[equipped]"', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf("if (tStep?.id === 'cudgel' &&");
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 1800);
    expect(block).toContain('const readiedIn = grantTutorialItem(get, set, \'cudgel\');');
    expect(block).toContain("readiedIn ? '✦ Cudgel (Common). [equipped]' : '✦ Cudgel (Common).'");
    // The world line branches too — "you equip it without thinking" was the other
    // half of the same claim.
    expect(block).toContain('goes into your pack');
    expect(block).not.toContain("get().appendLog('reward', '✦ Cudgel (Common). [equipped]');");
  });

  it('⚠⚠ the grant hands the slot back instead of returning void', () => {
    // The caller cannot narrate honestly without it — that signature IS the fix.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('function grantTutorialItem(');
    const fn = store.slice(i, i + 2600);
    expect(fn).toContain('): EquipSlot | null {');
    expect(fn).toContain('return readied?.slot ?? null;');
    // One comparison, shared with the picker's ★.
    expect(fn).toContain("isUpgradeOverEquipped(player, 'Cudgel')");
    expect(fn).toContain("upgradeEquipSlot(player, 'Cudgel')");
  });

  it('⚠ the slot records the INSTANCE id, not just a name', () => {
    // The old line set `main: 'Cudgel'` alone, so the slot resolved to "first item
    // called Cudgel" rather than the one just granted.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('function grantTutorialItem(');
    expect(store.slice(i, i + 2600)).toContain('[SLOT_ID_KEY[readied.slot]]: item.id');
  });
});
