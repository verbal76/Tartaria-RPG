// ⚠⚠ OTA-1244 — "I HAVE NOT SEEN ARMOR OR WEAPONS IN THE LAST FEW TILES."
//
// Owner, asking the right question: *"did anything change on the drop rates of
// filtering because of the changes, or did I just hit a bad run?"*
//
// Neither. The drop rates are untouched — `pickTakeableGearForScene` still rolls
// 1–3 pieces per scene — and the OTA-1242 census does not feed scene building at
// all (that split uses `isSalvageable` from interactionTags, not the
// `hasSalvageYield` the census widened). **The drops kept happening. The display
// threw them away.**
//
// ⚠⚠ THE MECHANISM. Scene build force-prepends three placed things so the 8-slot
// display cap cannot crowd them out: spawned gear, a water source, and (OTA-1243)
// the dog-rescue prop. The CARDINAL-STEP re-shuffle — walking N/S/E/W inside a
// location — then replaced the whole window with a blind 8-from-pool pick:
//
//     const next = shuffleSliceSeeded(pool, AMBIENT_DISPLAY_CAP, seed);
//     displayedAmbientNouns = next;          // ← all three guarantees gone
//
// So gear was guaranteed when you ARRIVED at a location and could vanish on the
// very next step inside it — with no new `spawn:` line in the log to explain
// where it went, because steps do not respawn gear, they only re-pick what shows.
//
// ⚠ DATED, BECAUSE BLAME MATTERS FOR A REGRESSION QUESTION: that block is commit
// 650d5fbb, 2026-06-05, OTA-302 — nine weeks and ~940 OTAs before this session.
// ⚠ NOT ENTIRELY INNOCENT THOUGH: OTA-1243's prop injection adds one noun to the
// pool on ~22% of eligible tiles, which on an already-over-cap tile shifts a given
// gear item's survival odds from ~8-in-12 to ~8-in-13. Small, real, and plausibly
// why it surfaced now rather than in June.
import { readFileSync } from 'fs';
import { join } from 'path';

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

describe('OTA-1244 — the placed things survive a step', () => {
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
    // THREE QUARTERS of steps hid it — which is exactly "I have not seen armor or
    // weapons in the last few tiles".
    expect(lostBefore).toBeGreaterThan(200);
    expect(lostAfter).toBe(0);
  });

  it('⚠⚠ the window stays FULL — a pin must not cost the player a slot', () => {
    // The naive fix (prepend pins, then truncate) would shrink the visible list.
    // Pins take their slots and the shuffle fills the remainder from what is left.
    for (let seed = 0; seed < 200; seed++) {
      expect(windowAfter(POOL, GEAR, seed)).toHaveLength(CAP);
      expect(new Set(windowAfter(POOL, GEAR, seed)).size).toBe(CAP); // no dupes
    }
  });

  it('⚠ the shuffle still SHUFFLES — variety is why that block exists', () => {
    // Pinning everything would fix the bug by deleting the feature. Across seeds
    // the unpinned remainder must still vary.
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(windowAfter(POOL, GEAR, seed).join('|'));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('⚠⚠ pins are CAPPED, so a future placer cannot starve the shuffle', () => {
    // Today at most 3 gear + 1 water + 1 prop. If something later pins twelve
    // nouns, the window must still show variety rather than becoming a fixed list.
    const greedy = Array.from({ length: 12 }, (_, i) => `pin${i}`);
    const pool = [...greedy, ...Array.from({ length: 10 }, (_, i) => `other${i}`)];
    const w = windowAfter(pool, greedy, 7);
    expect(w).toHaveLength(CAP);
    // At least two slots survive for the shuffle.
    expect(w.filter((n) => n.startsWith('other')).length).toBeGreaterThanOrEqual(2);
  });

  it('⚠⚠ a pin only applies while the noun is STILL IN THE POOL', () => {
    // This is what makes consumption self-healing: taking a pinned gear item
    // removes it from `ambientNouns` AND `displayedAmbientNouns`, so the pin stops
    // applying with no extra bookkeeping. A pin that outlived its noun would hold
    // a slot open for something that is not there.
    const pool = POOL.filter((n) => n !== 'Bone Knife'); // taken
    const w = windowAfter(pool, GEAR, 3);
    expect(w).not.toContain('Bone Knife');
    expect(w).toContain('Rusted Blade');
    expect(w).toHaveLength(CAP);
  });
});

describe('OTA-1244 — the guarantee is recorded once and read everywhere', () => {
  it('⚠⚠ scene build stamps the pins from the SAME three lists it prepends', () => {
    // One source of truth. Re-deriving "what was placed" at each recompute is how
    // this got forgotten at one call site for nine weeks.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const pinnedAmbientNouns = Array.from(new Set([');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 220);
    expect(block).toContain('sceneGearNouns');
    expect(block).toContain('waterSourceNouns');
    expect(block).toContain('rescuePropNouns');
    // ...and it reaches the scene object.
    expect(store).toContain('displayedAmbientNouns: sceneDisplayedNouns, pinnedAmbientNouns,');
  });

  it('⚠⚠ the cardinal-step re-shuffle reads them', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const pins = (s.currentScene.pinnedAmbientNouns');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 500);
    expect(block).toContain('pool.includes(n)');                 // membership gate
    expect(block).toContain('pool.filter((n) => !pinned.includes(n))'); // no dupes
    expect(block).toContain('AMBIENT_DISPLAY_CAP - pinned.length');     // window stays full
  });

  it('⚠ a rename carries the pins with it', () => {
    // Pins are gated on pool membership, so a pinned noun renamed in the pool but
    // not in the pin list would silently stop being pinned — the guarantee would
    // survive in name only.
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('const newPinned = replaceIn(s.currentScene.pinnedAmbientNouns);');
    expect(store).toContain('...(newPinned ? { pinnedAmbientNouns: newPinned } : {}),');
  });

  it('⚠ a building interior clears them — its pool is a different room', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('transitArea: `${b.name} · ${room.shortName}`,');
    expect(i).toBeGreaterThan(-1);
    expect(store.slice(Math.max(0, i - 600), i)).toContain('pinnedAmbientNouns: [],');
  });
});
