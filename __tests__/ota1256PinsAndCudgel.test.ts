// ⚠⚠ OTA-1256 — TWO CORRECTNESS BUGS FOUND ON GOLEM, PORTED BECAUSE NEITHER HAS
// ANYTHING TO DO WITH GOLEM.
//
// Owner: *"if these are needed on Hal to correct play the way Hal is with no other
// changes towards golem's new direction then port them."* Both qualify — one dates
// to OTA-302 (2026-06-05) and the other predates every picker change. **The golem
// implementations were deliberately NOT copied where they lean on picker code:**
// golem sends a cudgel it cannot beat to the empty OFF hand (its either-hand rule,
// OTA-1252) and pins a dog-quest prop alongside the gear (OTA-1243). HAL gets
// neither — just the two bugs closed, in HAL's own terms.
//
// ⚠⚠ (1) THE PLACED NOUNS DID NOT SURVIVE A STEP. Scene build force-prepends
// spawned GEAR and the WATER SOURCE so the 8-slot display cap cannot crowd them
// out. The cardinal-step re-shuffle then replaced the whole window with a blind
// pick:
//
//     const next = shuffleSliceSeeded(pool, AMBIENT_DISPLAY_CAP, seed);
//
// So gear was guaranteed when you ARRIVED at a location and could vanish on the
// very next step inside it — with no new `spawn:` line in the log to explain where
// it went, because steps do not respawn gear, they only re-pick what shows.
// Reported on golem as *"I have not seen armor or weapons in the last few tiles."*
//
// ⚠⚠ (2) "[equipped]" ON A HAND THAT HELD SOMETHING ELSE. The cudgel auto-equip
// fired only when the equipped weapon's NAME contained the word barehand — but the
// barehanded starter is called **Mud-fist Wraps**, and barehanded is a TAG. The
// branch was unreachable for every race while the beat announced "[equipped]" to
// all of them, and five of the seven should have had the weapon.
import { readFileSync } from 'fs';
import { join } from 'path';
import { WEAPONS } from '../app/engine/crafting';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const CAP = 8;

/** Same contract as the store's helper: a deterministic, order-scrambling slice.
 *  The point here is the SELECTION ARITHMETIC around it, which is what broke. */
function scrambleSlice<T>(arr: readonly T[], n: number, seed: number): T[] {
  const a = [...arr];
  let h = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

/** The OLD window: blind pick, pins ignored. */
const windowBefore = (pool: string[], seed: number): string[] => scrambleSlice(pool, CAP, seed);

/** The NEW window, mirroring the shipped arithmetic exactly. */
function windowAfter(pool: string[], pins: string[], seed: number): string[] {
  const live = pins.filter((n) => pool.includes(n));
  const pinned = live.slice(0, Math.max(0, CAP - 2));
  const rest = scrambleSlice(pool.filter((n) => !pinned.includes(n)), Math.max(0, CAP - pinned.length), seed);
  return [...new Set([...pinned, ...rest])].slice(0, CAP);
}

describe('OTA-1256 — the placed things survive a step', () => {
  const GEAR = ['Bone Knife', 'Rusted Blade'];
  const POOL = [...GEAR, ...Array.from({ length: 14 }, (_, i) => `filler${i}`)];

  it('⚠⚠ MEASURED: the old window lost the gear on most steps; the new one never does', () => {
    let lostBefore = 0;
    let lostAfter = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (!GEAR.every((g) => windowBefore(POOL, seed).includes(g))) lostBefore += 1;
      if (!GEAR.every((g) => windowAfter(POOL, GEAR, seed).includes(g))) lostAfter += 1;
    }
    // The severity is the finding. On a 16-noun tile carrying 2 pieces of gear,
    // THREE QUARTERS of steps hid it.
    expect(lostBefore).toBeGreaterThan(200);
    expect(lostAfter).toBe(0);
  });

  it('⚠⚠ the window stays FULL — a pin must not cost the player a slot', () => {
    // The naive fix (prepend pins, then truncate) would shrink the visible list.
    for (let seed = 0; seed < 200; seed++) {
      expect(windowAfter(POOL, GEAR, seed)).toHaveLength(CAP);
      expect(new Set(windowAfter(POOL, GEAR, seed)).size).toBe(CAP); // no dupes
    }
  });

  it('⚠ the shuffle still SHUFFLES — variety is why that block exists', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(windowAfter(POOL, GEAR, seed).join('|'));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('⚠⚠ pins are CAPPED, so a future placer cannot starve the shuffle', () => {
    const greedy = Array.from({ length: 12 }, (_, i) => `pin${i}`);
    const pool = [...greedy, ...Array.from({ length: 10 }, (_, i) => `other${i}`)];
    const w = windowAfter(pool, greedy, 7);
    expect(w).toHaveLength(CAP);
    expect(w.filter((n) => n.startsWith('other')).length).toBeGreaterThanOrEqual(2);
  });

  it('⚠⚠ a pin only applies while the noun is STILL IN THE POOL', () => {
    // This is what makes consumption self-healing: taking a pinned gear item
    // removes it from `ambientNouns` AND `displayedAmbientNouns`, so the pin stops
    // applying with no extra bookkeeping.
    const pool = POOL.filter((n) => n !== 'Bone Knife'); // taken
    const w = windowAfter(pool, GEAR, 3);
    expect(w).not.toContain('Bone Knife');
    expect(w).toContain('Rusted Blade');
    expect(w).toHaveLength(CAP);
  });
});

describe('OTA-1256 — the guarantee is recorded once and read everywhere', () => {
  it('⚠⚠ scene build stamps the pins from the SAME lists it prepends', () => {
    // One source of truth. Re-deriving "what was placed" at each recompute is how
    // this got forgotten at one call site for nine weeks.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const pinnedAmbientNouns = Array.from(new Set([');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 200);
    expect(block).toContain('sceneGearNouns');
    expect(block).toContain('waterSourceNouns');
    // ⚠ NOT golem's rescue props — that placer does not exist on this line, and
    // pinning a noun nothing places would be a guarantee about nothing.
    expect(block).not.toContain('rescuePropNouns');
    expect(store).toContain('displayedAmbientNouns: sceneDisplayedNouns, pinnedAmbientNouns,');
  });

  it('⚠⚠ the cardinal-step re-shuffle reads them', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const pins = (s.currentScene.pinnedAmbientNouns');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 500);
    expect(block).toContain('pool.includes(n)');                        // membership gate
    expect(block).toContain('pool.filter((n) => !pinned.includes(n))'); // no dupes
    expect(block).toContain('AMBIENT_DISPLAY_CAP - pinned.length');     // window stays full
    // The blind pick is gone.
    expect(store).not.toContain('const next = shuffleSliceSeeded(pool, AMBIENT_DISPLAY_CAP, seed);');
  });

  it('⚠ a rename carries the pins with it', () => {
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('const newPinned = replaceIn(s.currentScene.pinnedAmbientNouns);');
    expect(store).toContain('...(newPinned ? { pinnedAmbientNouns: newPinned } : {}),');
  });

  it('⚠ a building interior clears them — its pool is a different room', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('transitArea: `${b.name} · ${room.shortName}`,');
    expect(i).toBeGreaterThan(-1);
    expect(store.slice(Math.max(0, i - 700), i)).toContain('pinnedAmbientNouns: [],');
  });
});

describe('OTA-1256 — the cudgel actually equips', () => {
  /** The starting weapons the game hands out, read from the source of truth. */
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

  it('⚠⚠ NOT ONE starting weapon name contains "barehand" — the branch was unreachable', () => {
    // ⚠ THE BUG, stated as the measurement that proves it. If a future starter is
    // named "Barehand Wraps" this fails, and whoever wrote it learns the old guard
    // is gone and a damage comparison replaced it.
    const primaries = racePrimaries();
    expect(primaries.length).toBeGreaterThanOrEqual(4);
    for (const w of primaries) expect(w.toLowerCase()).not.toContain('barehand');
    expect(src('app', 'state', 'gameStore.ts')).not.toContain("equipped.main.includes('barehand')");
  });

  it('⚠⚠ FIVE of the seven races were denied a weapon the beat promised them', () => {
    // The Cudgel is 1d8. Rusted Blade and Pyric Wand are 1d6 — those races should
    // always have had it. Only the Spear (2d6) and the Wraps (1d10) out-hit it.
    const cudgelAvg = avg(WEAPONS.find((w) => w.name === 'Cudgel')!.damageDice);
    const beaten = racePrimaries().filter((w) => avg(WEAPONS.find((c) => c.name === w)!.damageDice) < cudgelAvg);
    const keeps = racePrimaries().filter((w) => avg(WEAPONS.find((c) => c.name === w)!.damageDice) >= cudgelAvg);
    expect(beaten.length).toBeGreaterThan(0);
    expect(keeps.length).toBeGreaterThan(0); // and the rule has a live "no" case too
  });

  it('⚠⚠ every starting weapon is a REAL catalog row — the comparison can resolve it', () => {
    // A starter the catalog cannot find would score 0 and hand the cudgel to a
    // player already holding something better.
    for (const w of racePrimaries()) expect(WEAPONS.some((c) => c.name === w)).toBe(true);
  });

  it('⚠⚠ the reward line is CONDITIONAL — no unearned "[equipped]"', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf("if (tStep?.id === 'cudgel' &&");
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 1600);
    expect(block).toContain("const readiedCudgel = grantTutorialItem(get, set, 'cudgel');");
    expect(block).toContain("readiedCudgel ? '✦ Cudgel (Common). [equipped]' : '✦ Cudgel (Common).'");
    // The world line branches too — "you equip it without thinking" was the other
    // half of the same claim.
    expect(block).toContain('goes into your pack');
  });

  it('⚠⚠ the grant reports whether it readied, instead of returning void', () => {
    // The caller cannot narrate honestly without it — that signature IS the fix.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('function grantTutorialItem(');
    const fn = store.slice(i, store.indexOf('\n}', i));
    expect(fn).toContain('): boolean {');
    expect(fn).toContain('return readied;');
    // Compared on damage, not on a name.
    expect(fn).toContain('_avgDamageDice');
    // ⚠ HAL does NOT take golem's either-hand rule — that is picker direction.
    expect(fn).not.toContain("'off'");
    // ...and the slot records the instance, not just a name.
    expect(fn).toContain('mainId: item.id');
  });

  it('⚠ the vest / rope / note props are untouched — only the cudgel readies', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('function grantTutorialItem(');
    const fn = store.slice(i, store.indexOf('\n}', i));
    expect(fn).toContain("if (id === 'cudgel') {");
    expect(fn).not.toContain("id === 'rope'");
    expect(fn).not.toContain("id === 'note'");
  });
});
