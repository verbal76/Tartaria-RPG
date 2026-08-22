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
import { getFactions } from '../app/engine/character';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const FLASH = read('app', 'components', 'FactionCrestFlash.tsx');
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
    // Box measured off the SHORT edge, so a sideways handset does not overflow.
    expect(FLASH).toContain('Math.min(width, height)');
  });

  it('⚠ it unmounts with the faction step, taking its timer with it', () => {
    // Mounted at the screen root it would survive a BACK tap and fire its
    // dismiss against a screen the player has already left.
    const step = CREATE.indexOf("{step === 'faction' && (");
    expect(step).toBeGreaterThan(-1);
    const flash = CREATE.indexOf('<FactionCrestFlash', step);
    expect(flash).toBeGreaterThan(step);
    const nextStep = CREATE.indexOf("{step === 'motive' && (", step);
    expect(flash).toBeLessThan(nextStep);
  });
});
