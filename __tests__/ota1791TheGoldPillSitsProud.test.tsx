/**
 * OTA-1791 — THE GOLD PILL SITS PROUD.
 *
 * Control-depth batch 2. Owner: *"Apply the governed control-depth language to
 * the filled-gold btnPrimary family. But do not paint ten hand-copied
 * implementations independently … consolidate the repeated filled-gold primary
 * control into the smallest appropriate existing kit/control primitive. Then
 * let those consumers receive the same governed depth construction through that
 * authority."* And the preserve list: the fill, the button behaviour, each
 * modal's layout, accessibility, copy, and press behaviour "except for adoption
 * of the governed depth language".
 *
 * ⚠⚠ THE AUTHORITY IS `tFilledGold(pressed)`. Fill and ring from `T.gold`,
 * `tControlDepth` riding on top, `null` for the inert pill. Ten files consume
 * it; each keeps its own chassis. The claims below are about BEHAVIOUR where
 * behaviour exists (the helper's output, a rendered pill's style under press)
 * and about the BOUNDARY where the ruling drew one (ten in, four out).
 *
 * ⚠ FOUR FILES OF THE SAME NAME ARE NOT THIS CONTROL. `btnPrimary` in Ending,
 * CraftQuantity, DifficultyCustom and MissionEncounterCard is a dark plate, a
 * sage outline, a dark fill on a gold ring, and the bright frame gold. They are
 * asserted untouched, so a later pass sees the boundary as a decision.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { T, tFilledGold, tControlDepth } from '../app/ui/tartariaKit';
import { WhisperCompleteModal } from '../app/components/WhisperCompleteModal';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { root: { findAllByType(t: unknown): { props: Record<string, unknown> }[] }; unmount(): void };
  act(cb: () => void): void;
};

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
/** Comments stripped — the claims are about code, not about the notes beside it. */
const codeOf = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const TEN = [
  'ApproachModal', 'BrandedModal', 'BugReportModal', 'CraftRefusalModal', 'CraftResultModal',
  'FeedbackModal', 'HookContinueModal', 'InvitePlaytesterModal', 'SearchModal', 'WhisperCompleteModal',
];
const NOT_THIS_CONTROL = [
  ['screens', 'EndingScreen.tsx'],
  ['components', 'CraftQuantityModal.tsx'],
  ['components', 'DifficultyCustomModal.tsx'],
  ['components', 'MissionEncounterCard.tsx'],
] as const;

const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

describe('OTA-1791 — one filled-gold authority', () => {
  it('resting: the brand gold as fill AND ring, with the lit top edge and shaded bottom edge on it', () => {
    const s = flat(tFilledGold(false));
    expect(s.backgroundColor).toBe(T.gold);
    expect(s.borderColor).toBe(T.gold);
    expect(s.borderTopColor).toBe(T.controlRaisedLit);
    expect(s.borderBottomColor).toBe(T.controlRaisedDark);
    expect(s.transform).toBeUndefined();
    // The default is the resting pill.
    expect(flat(tFilledGold())).toEqual(s);
  });

  it('pressed: the light moves, the face settles — the SAME construction the combat chips use', () => {
    const s = flat(tFilledGold(true));
    expect(s.backgroundColor).toBe(T.gold);
    expect(s.borderTopColor).toBe(T.controlRaisedDark);
    expect(s.borderBottomColor).toBe(T.controlRaisedLit);
    expect(s.transform).toEqual([{ translateY: 1.5 }]);
    // Not a second effect for a second colour: the depth half IS tControlDepth.
    expect(flat([tControlDepth(true)])).toEqual(expect.objectContaining({
      borderTopColor: s.borderTopColor, borderBottomColor: s.borderBottomColor, transform: s.transform,
    }));
  });

  it('inert (null): the fill stays and NO depth is handed over — an absence, not a third variant', () => {
    const s = flat(tFilledGold(null));
    expect(s.backgroundColor).toBe(T.gold);
    expect(s.borderColor).toBe(T.gold);
    expect(s).not.toHaveProperty('borderTopColor');
    expect(s).not.toHaveProperty('borderBottomColor');
    expect(s).not.toHaveProperty('transform');
  });

  it('the language is still three things: no gradient, gloss, elevation or shadow rides in', () => {
    for (const v of [false, true, null]) {
      const s = flat(tFilledGold(v));
      for (const k of Object.keys(s)) {
        expect(k).not.toMatch(/elevation|shadow|opacity/i);
      }
    }
  });
});

describe('OTA-1791 — the ten consumers read the authority, and only the authority', () => {
  for (const name of TEN) {
    it(`${name} paints its confirm pill through tFilledGold and no longer by hand`, () => {
      const code = codeOf(read('app', 'components', `${name}.tsx`));
      expect(code).toMatch(/import \{[^}]*\btFilledGold\b[^}]*\} from '\.\.\/ui\/tartariaKit'/);
      expect(code).toMatch(/tFilledGold\(pressed\)/);
      // The hand-copied rule is gone: no button style in the file fills itself
      // with the brand gold any more. (Other gold in these files — BugReport's
      // selected-slot radio dot, for one — is a MARK, not this control, and is
      // the legacy hunt's to classify.)
      expect(code).not.toMatch(/\bbtn\w*:\s*\{[^}]*backgroundColor:\s*'#c9a86a'/i);
      expect(code).not.toMatch(/\bbtnPrimary\b/);
    });
  }

  it('a disabled pill is asked for the inert form, never the resting one', () => {
    // The four whose primary can be disabled while still painted gold.
    for (const name of ['ApproachModal', 'FeedbackModal']) {
      const code = codeOf(read('app', 'components', `${name}.tsx`));
      expect(code).toMatch(/tFilledGold\(null\)/);
    }
    // BrandedModal's tone table answers 'primary' with the inert fill; the live
    // pill in its button row takes the pressed state directly.
    const branded = codeOf(read('app', 'components', 'BrandedModal.tsx'));
    expect(branded).toMatch(/case 'primary': return tFilledGold\(null\)/);
    expect(branded).toMatch(/b\.tone === 'primary' \? tFilledGold\(pressed\)/);
  });
});

describe('OTA-1791 — the boundary: four files of the same name are NOT this control', () => {
  for (const [dir, file] of NOT_THIS_CONTROL) {
    it(`${file} keeps its own btnPrimary and does not read the gold authority`, () => {
      const code = codeOf(read('app', dir, file));
      expect(code).toMatch(/\bbtnPrimary\b/);
      expect(code).not.toMatch(/\btFilledGold\b/);
      // And none of them is a filled brand-gold pill — that is why they are out.
      expect(code).not.toMatch(/btnPrimary:\s*\{[^}]*backgroundColor:\s*'#c9a86a'/i);
    });
  }
});

describe('OTA-1791 — a rendered pill carries the depth under press', () => {
  it('WhisperCompleteModal\'s CLOSE pill rests lit-on-top and presses lit-on-bottom, settling 1.5dp', () => {
    const tree = renderer.create(
      <WhisperCompleteModal visible title="A whisper" lines={['done']} rewards={['✦ 3 coins']} onClose={() => {}} />,
    );
    const pills = tree.root.findAllByType(Pressable);
    expect(pills.length).toBeGreaterThanOrEqual(1);
    const styleFn = pills[pills.length - 1]!.props.style as (s: { pressed: boolean }) => unknown;
    expect(typeof styleFn).toBe('function');
    const resting = flat(styleFn({ pressed: false }));
    const pressed = flat(styleFn({ pressed: true }));
    expect(resting.backgroundColor).toBe(T.gold);
    expect(resting.borderTopColor).toBe(T.controlRaisedLit);
    expect(resting.borderBottomColor).toBe(T.controlRaisedDark);
    expect(resting.opacity).toBeUndefined(); // the fade is gone; depth replaced it
    expect(pressed.borderTopColor).toBe(T.controlRaisedDark);
    expect(pressed.borderBottomColor).toBe(T.controlRaisedLit);
    expect(pressed.transform).toEqual([{ translateY: 1.5 }]);
    expect(pressed.opacity).toBeUndefined();
    // Layout preserved: the chassis is still the modal's own.
    expect(resting.borderWidth).toBe(1);
    expect(resting.borderRadius).toBe(3);
    tree.unmount();
  });
});
