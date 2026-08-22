/**
 * OTA-1431 — THE EMBLEM, WHEN YOU PICK THE FACTION.
 *
 * Owner: *"wire them in now, as you choose your faction, the emblem should show
 * for a few seconds as a popup."*
 *
 * ⚠⚠ THE PARITY CHECK IS THE POINT OF THIS FILE. Nine emblems, nine factions,
 * and the only thing joining them is that a filename matches an id in a JSON
 * file. Nothing in TypeScript can see that: `require()` of a PNG is opaque to
 * tsc, and a faction added later with no art degrades to a silently missing
 * popup that nobody notices until a player picks it. That is the exact failure
 * shape OTA-1415 exists for — eleven moved `require()` paths that typechecked
 * clean and shipped nothing for 21 OTAs. So this walks getFactions() and asserts
 * BOTH directions: every faction has art, and every piece of art has a faction.
 */
import { factionCrest, crestFactionIds } from '../app/engine/factionCrests';
import { racePortrait, portraitRaceIds } from '../app/engine/racePortraits';
import { getFactions, getRaces } from '../app/engine/character';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const FLASH = read('app', 'components', 'ArtFlash.tsx');
const CREATE = read('app', 'screens', 'CharacterCreationScreen.tsx');

describe('OTA-1431 — every faction has an emblem, and every emblem a faction', () => {
  it('⚠⚠ all nine factions resolve to art', () => {
    const factions = getFactions();
    expect(factions.length).toBe(9);
    for (const f of factions) {
      expect({ id: f.id, hasArt: factionCrest(f.id) !== undefined })
        .toEqual({ id: f.id, hasArt: true });
    }
  });

  it('⚠⚠ …and no emblem is stranded on an id no faction uses', () => {
    // The other direction. A crest keyed to a typo'd id would never render and
    // never fail — it would just quietly be the faction that has no popup.
    const ids = new Set(getFactions().map((f) => f.id));
    for (const id of crestFactionIds()) {
      expect({ id, isRealFaction: ids.has(id) }).toEqual({ id, isRealFaction: true });
    }
    expect(crestFactionIds().sort()).toEqual([...ids].sort());
  });

  it('⚠ an unknown / null / empty faction gets undefined, not a broken image', () => {
    expect(factionCrest('mud_barons')).toBeUndefined();
    expect(factionCrest(null)).toBeUndefined();
    expect(factionCrest(undefined)).toBeUndefined();
    expect(factionCrest('')).toBeUndefined();
  });

  it('⚠⚠ the art files are actually on disk under the faction ids', () => {
    // `require()` of a missing asset is a Metro-time failure, invisible to tsc
    // and to jest's asset mock. Check the filesystem directly — this is the
    // cheap version of the check that OTA-1415 had to invent a whole script for.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    for (const f of getFactions()) {
      const p = path.join(__dirname, '..', 'assets', 'crests', `${f.id}.png`);
      expect({ id: f.id, onDisk: fs.existsSync(p) }).toEqual({ id: f.id, onDisk: true });
      // …and is a real PNG with an alpha channel, not a placeholder or a JPEG
      // renamed. Colour type 6 = RGBA, byte 25 of the IHDR.
      const head = fs.readFileSync(p).subarray(0, 26);
      expect({ id: f.id, png: head.subarray(1, 4).toString() }).toEqual({ id: f.id, png: 'PNG' });
      expect({ id: f.id, colourType: head[25] }).toEqual({ id: f.id, colourType: 6 });
    }
  });
});

describe('OTA-1432 — it plays on the COMMIT, not on the tap', () => {
  it('⚠⚠ tapping a faction row only selects it — no popup', () => {
    // OTA-1431 read "as you choose your faction" as the row tap. It is not.
    // Owner: *"when we pick the faction isn't when we click on it, but when we
    // hit next."* Tapping rows is BROWSING — you tap through several to read
    // their goals and flavor. A popup there lands in the middle of a comparison.
    expect(CREATE).toContain('onPress={() => setFactionId(f.id)}');
    expect(CREATE).not.toContain('pickFaction');
  });

  it('⚠⚠ hitting NEXT from the faction step plays the emblem, and WAITS for it', () => {
    // The flash sits between the decision and the next step: its own onDone is
    // the transition, so tapping to skip advances instantly and letting it run
    // advances when it ends — one path out, from one place.
    const i = CREATE.indexOf("if (step === 'faction') {");
    expect(i).toBeGreaterThan(-1);
    expect(CREATE.indexOf('setCrestFor(factionId);', i)).toBeGreaterThan(i);
    expect(CREATE).toContain("onDone={() => { setCrestFor(null); setStep('motive'); }}");
  });

  it('⚠⚠ a faction with NO art advances instead of stranding the player', () => {
    // FactionCrestFlash renders null when there is no art, so it would never
    // call onDone — setting crestFor unconditionally would leave a tenth faction
    // sitting on the faction step with a NEXT button that does nothing. This is
    // a soft-lock guard, not a tidiness check.
    expect(CREATE).toContain('if (factionCrest(factionId)) {');
    const i = CREATE.indexOf("if (step === 'faction') {");
    const guard = CREATE.indexOf('if (factionCrest(factionId)) {', i);
    const fallthrough = CREATE.indexOf("setStep('motive');", guard);
    expect(fallthrough).toBeGreaterThan(guard);
  });

  it('⚠⚠ tapping anywhere dismisses it, and kills the timer on the way out', () => {
    // Without the clearTimer the pending dismiss outlives the popup it belongs
    // to and fires against the NEXT emblem, closing it a beat after it opened.
    expect(FLASH).toContain('onPress={() => { clearTimer(); onDone(); }}');
    expect(FLASH).toContain('onRequestClose={() => { clearTimer(); onDone(); }}');
    expect(FLASH).toContain('return clearTimer;');
  });

  it('⚠ it holds for a couple of seconds, not "a few"', () => {
    const m = FLASH.match(/const HOLD_MS = (\d+);/);
    expect(m).toBeTruthy();
    const hold = Number(m![1]);
    expect(hold).toBeGreaterThanOrEqual(1500);
    expect(hold).toBeLessThanOrEqual(3000);
  });

  it('⚠⚠ contain, not cover — the nine are not square and not one size', () => {
    // assets/crests/README.md signs the geometry off as do-not-fix: sizes run
    // 1145x1374 to 1254x1254 with the artwork touching the frame edge. `cover`
    // would crop a different amount off each one; a fixed aspect would squash
    // them. Only `contain` shows all nine whole.
    expect(FLASH).toContain('resizeMode="contain"');
    expect(FLASH).not.toContain('resizeMode="cover"');
    // ⚠ OTA-1433 — ONE box for every shape, sized off BOTH screen axes and left
    // to `contain`. It now has to hold crests (near-square, edge-to-edge art)
    // AND race portraits running 0.667 to 1.250 with one landscape among six
    // portraits. A box measured off a single axis would overflow one of them.
    expect(FLASH).toContain('const boxW = width * 0.9;');
    expect(FLASH).toContain('const boxH = height * 0.62;');
  });

  it('⚠ it unmounts with the faction step, taking its timer with it', () => {
    // Mounted at the screen root it would survive a BACK tap and fire its
    // dismiss against a screen the player has already left.
    const step = CREATE.indexOf("{step === 'faction' && (");
    expect(step).toBeGreaterThan(-1);
    const flash = CREATE.indexOf('<ArtFlash', step);
    expect(flash).toBeGreaterThan(step);
    const nextStep = CREATE.indexOf("{step === 'motive' && (", step);
    expect(flash).toBeLessThan(nextStep);
  });
});

/**
 * OTA-1433 — THE RACE PORTRAITS, ON THE SAME COMPONENT.
 *
 * Owner, having seen the faction emblem land: *"same thing, show the popup at
 * selection."*
 *
 * ⚠⚠ "SAME THING" IS THE MOMENT A COMPONENT GETS COPIED, and a copy is how this
 * session's most-repeated defect arrives — two implementations, one bug fixed in
 * one of them (the many-doors mistake). So `FactionCrestFlash` became `ArtFlash`,
 * taking a source and a key instead of a faction id, and both call sites are the
 * same component. These tests assert that: not that the behaviour matches, but
 * that there is only one implementation of it to match.
 */
describe('OTA-1433 — every race has a portrait, and every portrait a race', () => {
  it('⚠⚠ all seven races resolve to art', () => {
    const races = getRaces();
    expect(races.length).toBe(7);
    for (const r of races) {
      expect({ id: r.id, hasArt: racePortrait(r.id) !== undefined })
        .toEqual({ id: r.id, hasArt: true });
    }
  });

  it('⚠⚠ …and no portrait is stranded on an id no race uses', () => {
    const ids = new Set(getRaces().map((r) => r.id));
    for (const id of portraitRaceIds()) {
      expect({ id, isRealRace: ids.has(id) }).toEqual({ id, isRealRace: true });
    }
    expect(portraitRaceIds().sort()).toEqual([...ids].sort());
  });

  it('⚠ an unknown / null / empty race gets undefined, not a broken image', () => {
    expect(racePortrait('mud_wraith')).toBeUndefined();
    expect(racePortrait(null)).toBeUndefined();
    expect(racePortrait(undefined)).toBeUndefined();
    expect(racePortrait('')).toBeUndefined();
  });

  it('⚠⚠ the portraits are on disk under the race ids, and are real PNGs', () => {
    // require() of a missing asset fails at Metro time only — invisible to tsc
    // and to jest's asset mock. This is the cheap filesystem version of the
    // check OTA-1415 had to write a whole script for.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    for (const r of getRaces()) {
      const p = path.join(__dirname, '..', 'assets', 'races', `${r.id}.png`);
      expect({ id: r.id, onDisk: fs.existsSync(p) }).toEqual({ id: r.id, onDisk: true });
      const head = fs.readFileSync(p).subarray(0, 26);
      expect({ id: r.id, png: head.subarray(1, 4).toString() }).toEqual({ id: r.id, png: 'PNG' });
    }
  });
});

describe('OTA-1433 — one flash component, two choices', () => {
  it('⚠⚠ the old faction-only component is GONE, not left beside the new one', () => {
    // A stale second copy is the whole failure this refactor exists to prevent:
    // it would keep compiling, keep passing, and quietly stop receiving fixes.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    expect(fs.existsSync(path.join(__dirname, '..', 'app', 'components', 'FactionCrestFlash.tsx')))
      .toBe(false);
    expect(CREATE).not.toContain('FactionCrestFlash');
  });

  it('⚠⚠ ArtFlash knows nothing about factions or races', () => {
    // It takes a source and a key. The moment it learns an id it has to learn a
    // second one, and then it is two components wearing one filename.
    expect(FLASH).toContain('artKey');
    expect(FLASH).toContain('source: number | undefined;');
    expect(FLASH).not.toContain('factionCrest');
    expect(FLASH).not.toContain('racePortrait');
  });

  it('⚠⚠ BOTH choices play on the commit and BOTH advance from the flash', () => {
    expect(CREATE).toContain("onDone={() => { setRacePortraitFor(null); setStep('faction'); }}");
    expect(CREATE).toContain("onDone={() => { setCrestFor(null); setStep('motive'); }}");
    // …and both use the same component, not a lookalike.
    expect((CREATE.match(/<ArtFlash/g) ?? []).length).toBe(2);
  });

  it('⚠⚠ a race with NO art advances instead of stranding the player', () => {
    // Same soft-lock guard as the faction step: ArtFlash renders null with no
    // source and so never calls onDone, which would leave NEXT doing nothing.
    const i = CREATE.indexOf("if (step === 'race') {");
    expect(i).toBeGreaterThan(-1);
    const guard = CREATE.indexOf('if (racePortrait(raceId)) {', i);
    expect(guard).toBeGreaterThan(i);
    expect(CREATE.indexOf("setStep('faction');", guard)).toBeGreaterThan(guard);
  });

  it('⚠ tapping a race row only selects it — the flash is on NEXT', () => {
    expect(CREATE).toContain('onPress={() => setRaceId(r.id)}');
  });

  it('⚠ the race flash unmounts with the race step', () => {
    const step = CREATE.indexOf("{step === 'race' && (");
    expect(step).toBeGreaterThan(-1);
    const flash = CREATE.indexOf('<ArtFlash', step);
    const nextStep = CREATE.indexOf("{step === 'faction' && (", step);
    expect(flash).toBeGreaterThan(step);
    expect(flash).toBeLessThan(nextStep);
  });
});
