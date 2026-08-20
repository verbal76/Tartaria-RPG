/**
 * OTA-web8 — a cleared room stays cleared; the one item stops coming back.
 *
 * Owner: *"once i've cleared a room in an outpost and go back into it why does
 * the take/salvage repopulate but just one item?"*
 *
 * The mechanism, reproduced against the real spawner below: a room's gear is a
 * seeded stream, but it is post-filtered against a 10-deep ROLLING window of
 * recently-spawned names. Hiding a pick is temporary; taking one is permanent.
 * So a piece the window masked on arrival was never offered, never consumed,
 * and surfaced alone on the next visit.
 *
 * The fix stamps the post-window list as the room's roster on first roll, so
 * the mask becomes permanent. This suite locks the mechanism (so a future
 * reader can see the bug that was here), the fix, and the three properties the
 * fix must not break: the consumed filter still runs, the restock still
 * restocks, and the window still gives adjacent rooms variety on first sight.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { pickTakeableGearForScene } from '../app/engine/takeableGearSpawns';
import { isSalvageable } from '../app/engine/interactionTags';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const store = src('app', 'state', 'gameStore.ts');
const types = src('app', 'engine', 'types.ts');

/** The room key whose seeded stream is long enough to be masked. */
function keyWithStream(min: number): { key: string; stream: string[] } {
  for (let i = 0; i < 2000; i++) {
    const key = `loc:mm:0,0@R${i}`;
    const stream = pickTakeableGearForScene(key);
    if (stream.length >= min) return { key, stream };
  }
  throw new Error('no room key produced a long enough stream');
}

describe('OTA-web8 — the defect, reproduced', () => {
  it('⚠⚠ the rolling window HIDES a pick, and hiding is not consuming', () => {
    const { key, stream } = keyWithStream(3);
    const hidden = stream[1]!;
    // VISIT 1 — the window happens to hold this room's second pick, because a
    // room a few steps back rolled the same name.
    const visit1 = pickTakeableGearForScene(key, new Set([hidden.toLowerCase()]));
    expect(visit1).not.toContain(hidden);
    expect(visit1.length).toBe(stream.length - 1);
    // The player takes everything they can SEE. The masked piece was never on
    // offer, so nothing marks it consumed.
    const consumed = new Set(visit1.map((n) => n.toLowerCase()));
    expect(consumed.has(hidden.toLowerCase())).toBe(false);
    // VISIT 2 — the ring is 10 deep and every room pushes 1–3 names, so the
    // masked piece has aged out. Nothing hides it and nothing consumed it.
    const visit2 = pickTakeableGearForScene(key, new Set<string>())
      .filter((n) => !consumed.has(n.toLowerCase()));
    expect(visit2).toEqual([hidden]);
  });

  it('⚠ …and it is ONE item because a room holds 1–3 pieces', () => {
    // Not a coincidence worth re-deriving later: the count in the report is a
    // property of the pool, not of the bug.
    for (let i = 0; i < 60; i++) {
      const n = pickTakeableGearForScene(`loc:mm:0,0@probe${i}`).length;
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('⚠ …and it reads as TAKE *and* SALVAGE because gear carries the salvage tag', () => {
    // One noun, two chip rows — which is why the report named two systems.
    const hits: string[] = [];
    for (let i = 0; i < 400 && hits.length === 0; i++) {
      for (const n of pickTakeableGearForScene(`loc:mm:0,0@R${i}`)) {
        if (isSalvageable(n)) hits.push(n);
      }
    }
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('OTA-web8 — the fix: the mask becomes permanent', () => {
  it('⚠⚠ the room stamps its post-window list as a roster', () => {
    expect(types).toContain('gearRoster?: string[];');
    expect(store).toContain('const roster: string[] = pickTakeableGearForScene(roomKey, recent);');
    expect(store).toContain('[roomKey]: { ...base, gearRoster: roster }');
  });

  it('⚠⚠ and every later visit READS the roster instead of re-rolling', () => {
    // This line is the fix. Without the early return the window is consulted
    // again on re-entry, which is the only way a masked pick can come back.
    expect(store).toContain(
      'if (stamped) return stamped.filter((n: string) => !isConsumedNoun(consumed, n));');
    const fn = store.slice(store.indexOf('function rollTileGear('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // the roster read happens BEFORE the window is even built
    expect(body.indexOf('const stamped =')).toBeLessThan(body.indexOf('const recent ='));
  });

  it('⚠⚠ the consumed filter still runs on top — a cleared room stays cleared', () => {
    // The roster says what the room HOLDS. It must never say what the room is
    // still OFFERING, or the fix would resurrect everything the player took.
    const fn = store.slice(store.indexOf('function rollTileGear('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body.match(/!isConsumedNoun\(consumed, n\)/g)?.length).toBe(2);
    expect(body).toContain('const picks: string[] = roster.filter((n: string) => !isConsumedNoun(consumed, n));');
  });

  it('⚠ the window is still fed, so adjacent rooms still get variety', () => {
    // The fix must not quietly disable the feature it is correcting. The ring
    // is still written — just once per room, on the roll that decides it,
    // instead of on every walk-through.
    expect(store).toContain("recentTakeableGearNames: roster.length > 0");
    expect(store).toContain(".slice(-10)");
  });

  it('⚠ the roster is NOT wiped by the macro-visit restock', () => {
    // A restocked room puts its own goods back out. The restock block names
    // every field it clears; gearRoster is deliberately not among them.
    const i = store.indexOf('searchedAmbientNouns: [],');
    const block = store.slice(i, store.indexOf('};', i));
    expect(block).toContain('flavorExhaustedNouns: []');
    expect(block).toContain('clearedAtMacroSeq: undefined');
    expect(block).not.toContain('gearRoster');
  });

  it('⚠ a missing visit record is a shell, not a crash — and never greets as a return', () => {
    // rollTileGear runs BEFORE beginScene's visit block, so on a genuinely
    // first entry there is no record to hang the roster on. Same shell the
    // OTA-071 investigation seeder already creates; OTA-1104's guard is what
    // stops a shell reading as a prior visit.
    expect(store).toContain(
      'const base: VisitedRoom = prev ?? { firstVisitAt: Date.now(), lastVisitAt: Date.now(), visitCount: 0 };');
    expect(store).toContain('if (existing && existing.visitCount >= 1) {');
  });

  it('⚠ the visit block still SPREADS, so the roster survives the same build', () => {
    // beginScene writes the visit record after rollTileGear. If that write ever
    // goes back to rebuilding the record field-by-field (the bug OTA-1104
    // fixed), the roster is wiped on the very entry that stamped it.
    const i = store.indexOf("firstVisitAt: existing?.firstVisitAt ?? Date.now(),");
    expect(i).toBeGreaterThan(0);
    expect(store.slice(i - 200, i)).toContain('...existing,');
  });
});

describe('OTA-web8 — what was NOT touched', () => {
  it('the seeded draw itself is unchanged — OTA-991 post-filters, still', () => {
    const spawns = src('app', 'engine', 'takeableGearSpawns.ts');
    // Filtering inside the loop would make picks a function of (seed, window)
    // and reopen the leave-and-return farm. The roster fix works BECAUSE the
    // stream is immutable; it is not a licence to move this filter.
    expect(spawns).toContain('if (exclude && exclude.size > 0 && exclude.size < COMMON_GEAR.length) {');
    expect(spawns).toContain('return picks.filter((n) => !exclude.has(n.toLowerCase()));');
  });

  it('the salvageable pool has no window and needed no change', () => {
    // Seeded off the room key alone, so it was never able to drift. Named here
    // because the report blamed it and it was innocent.
    const salv = src('app', 'engine', 'salvageableSpawns.ts');
    expect(salv).toContain('export function pickSalvageablesForScene(');
    expect(salv).not.toContain('recentTakeableGearNames');
    expect(salv).not.toContain('exclude');
  });

  it('the display cap still filters consumed AFTER the pick, so it cannot slide', () => {
    // The other candidate the report could have been: an 8-noun window over a
    // bigger pool would reveal a fresh noun each time one retired. It does not
    // — the cap is computed first and the consumed filter shrinks the result.
    const capAt = store.indexOf('displayedAmbientNouns = [...reservedPicks,');
    const filterAt = store.indexOf('sceneDisplayedNouns = displayedAmbientNouns.filter');
    expect(capAt).toBeGreaterThan(0);
    expect(filterAt).toBeGreaterThan(capAt);
  });
});
