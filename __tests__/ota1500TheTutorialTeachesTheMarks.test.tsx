// OTA-1500 — THE TUTORIAL TEACHES THE MARKS, AND THE SCREEN'S OWN OFFER.
//
// ⚠⚠⚠ THE OWNER, 2026-08-25: *"we are going to need to add that to the
// tutorial, and have them pick an item from the screen as well. we will need
// to explain the star and arrows."* And, confirming the vocabulary: *"the
// pyramid and inverted pyramid on both the on screen picker and the
// take/salvage screens to indicate good and bad with the appropriate color."*
//
// THREE PIECES:
//   1. The feed chip's glyph joins the picker's vocabulary — ★ when the
//      destination slot is bare, ▲ when it displaces something it beats.
//      (Never ▼: a downgrade is never offered, OTA-1457.)
//   2. A new beat, `screen_pick`, between armor and rope: a real catalog cap
//      against the bare head slot, offered ON the text roll — the surface the
//      tutorial had always hidden — and one tap wears it.
//   3. The beat's copy explains all three marks in the owner's terms.

import { TUTORIAL_STEPS, TUT_LOCK_BEATS } from '../app/components/tutorialSteps';
import {
  pickFeedActionChip, feedActionChipLabel, type GatherChipRow,
} from '../app/engine/feedActionChip';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');
const STORE = read('app', 'state', 'gameStore.ts');

const bare = (): PlayerCharacter =>
  ({ name: 'T', inventory: [], equipment: {}, stats: {} } as unknown as PlayerCharacter);
const armed = (main: string): PlayerCharacter =>
  ({
    name: 'T',
    inventory: [{ id: 'w1', name: main, kind: 'weapon', quantity: 1 }],
    equipped: { main },
    equipment: {},
    stats: {},
  } as unknown as PlayerCharacter);
const rows = (...r: Array<[string, boolean]>): GatherChipRow[] =>
  r.map(([noun, consumed]) => ({ noun, consumed }));

describe('OTA-1500 — the chip wears the picker\'s marks', () => {
  it('⚠⚠⚠ ★ for a bare slot, on the face', () => {
    const chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]))!;
    expect(chip.mark).toBe('★');
    expect(feedActionChipLabel(chip)).toMatch(/^★ Take & wear/);
  });

  it('⚠⚠⚠ ▲ when it displaces — same rule as the picker row', () => {
    // Rusted Blade (1d6) in the main hand, off hand ALSO the compared case:
    // a Cudgel (1d8) with a free off hand fills it — that is a ★. Fill both
    // to force the displace case.
    const p = ({
      name: 'T',
      inventory: [
        { id: 'w1', name: 'Rusted Blade', kind: 'weapon', quantity: 1 },
        { id: 'w2', name: 'Rusted Blade', kind: 'weapon', quantity: 1 },
      ],
      equipped: { main: 'Rusted Blade', off: 'Rusted Blade' },
      equipment: {}, stats: {},
    } as unknown as PlayerCharacter);
    const chip = pickFeedActionChip(p, rows(['Cudgel', false]))!;
    expect(chip.mark).toBe('▲');
    expect(feedActionChipLabel(chip)).toMatch(/^▲ Take & wield Cudgel — 1d8 over your 1d6$/);
  });

  it('⚠ the javelin is a ★ into the OFF hand — mark and clause still agreeing', () => {
    // ⚠ OTA-1512 — the owner named the hands ("always melee in main and ranged
    // in off"), so a ranged piece is an off-hand piece. That hand is bare here,
    // so the destination is empty and the honest mark is the bare-slot ★ with
    // the bare-slot clause. The CLAIM this test makes is unchanged and is the
    // one that matters: the mark and the clause describe the same destination.
    const chip = pickFeedActionChip(armed('Cudgel'), rows(['Bone Javelin', false]))!;
    expect(chip.mark).toBe('★');
    expect(chip.reason).toBe('your off hand is free');
  });
});

describe('OTA-1500 — the screen_pick beat exists and sits where it teaches', () => {
  const ids = TUTORIAL_STEPS.map((s) => s.id);

  it('⚠⚠⚠ between armor and rope — gear vocabulary lands right after the first wear', () => {
    const a = ids.indexOf('armor');
    const s = ids.indexOf('screen_pick');
    const r = ids.indexOf('rope');
    expect(a).toBeGreaterThan(-1);
    expect(s).toBe(a + 1);
    expect(r).toBe(s + 1);
  });

  it('⚠⚠ the copy explains all three marks, in the owner\'s terms', () => {
    const step = TUTORIAL_STEPS[ids.indexOf('screen_pick')]!;
    // The written body carries the glyphs; the Arbiter's SPOKEN line says
    // "star" in words — TTS reads a ★ badly, and the voice is the point there.
    expect(step.body).toContain('★');
    for (const text of [step.body, step.arbiter ?? '']) {
      expect(text).toMatch(/★|star/i);
      expect(text).toMatch(/green/i);
      expect(text).toMatch(/red/i);
      expect(text).toMatch(/pack/i);
    }
    // the beat highlights the feed — the surface the offer lives on
    expect(step.area).toBe('feed');
  });

  it('⚠⚠ the beat is locked like its siblings, so the lesson cannot be wandered past', () => {
    expect(TUT_LOCK_BEATS).toContain('screen_pick');
  });
});

describe('OTA-1500 — the offer shows during its own beat, and only then', () => {
  it('⚠⚠⚠ the tutorial gate opens for exactly the screen_pick beat', () => {
    expect(EXPL).toContain("tutBeat !== null && tutBeat !== 'screen_pick' ? null : pickFeedActionChip(player, gatherChips)");
  });

  it('⚠⚠ the cap is the beat\'s prop, consumed-tracked like the vest', () => {
    expect(EXPL).toContain('tutBeat === \'screen_pick\' ? "Reclaimer\'s Salvage Cap"');
    expect(EXPL).toContain("tutBeat === 'screen_pick' ? !!s.tutorialPropsConsumed.cap");
  });

  it('⚠⚠⚠ both doors reach the same store action — chip and sheet alike', () => {
    // A tutorial prop is not a scene noun; the generic take path cannot grant
    // it. Whichever surface the player taps, tutorialScreenPick does the
    // grant + wear + advance.
    const count = (EXPL.match(/tutorialScreenPick\(\)/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('⚠⚠ the pack door hides during the beat — the lesson is the one-tap wear', () => {
    expect(EXPL).toContain("feedChip && tutBeat !== 'screen_pick' ? feedPackChipLabel(feedChip) : null");
  });

  it('⚠⚠ the store action follows the vest rules: say it only if it happened, equip checked', () => {
    const i = STORE.indexOf('tutorialScreenPick() {');
    expect(i).toBeGreaterThan(-1);
    const body = STORE.slice(i, STORE.indexOf('maybeAdvanceTutorial(beatId) {', i));
    expect(body).toContain('if (!get().tutorialPropsConsumed.cap) {');
    expect(body).toMatch(/grantTutorialItem\(get, set, 'cap'\)/);
    expect(body).toMatch(/held\.some|inventory/);
    expect(body).toContain("get().maybeAdvanceTutorial('screen_pick');");
  });

  it('⚠ the cap is a REAL catalog head piece, so its ★ computes honestly', () => {
    expect(STORE).toContain("name: \"Reclaimer's Salvage Cap\"");
    const chip = pickFeedActionChip(bare(), rows(["Reclaimer's Salvage Cap", false]));
    expect(chip).not.toBeNull();
    expect(chip!.slot).toBe('head');
    expect(chip!.mark).toBe('★');
  });
});
