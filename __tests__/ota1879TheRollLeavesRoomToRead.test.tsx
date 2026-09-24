// OTA-1879 — THE ROLL LEAVES ROOM TO READ.
//
// ⚠⚠⚠ THE OWNER'S OBJECTIVE IS THE SPEC, AND IT IS A CONSERVATION ORDER:
// SAME LOOK · SAME INFORMATION · SAME INTERACTION · SMALLER FOOTPRINT.
// He watched a fight on a large, tall phone and the combat-roll surface still
// pressed the transcript off the screen. The forensics found no growth to
// remove: DiceRoller reads no window, no device and no scale, so it is the SAME
// height on a 4.7" phone and a 6.8" one — about 368pt at the post-roll peak, of
// which ~112pt was air. The container's padding nested inside the card's own
// padding, five 8pt gaps, and four small margins doubling gaps they sat beside.
//
// ⚠⚠ SO THIS SUITE'S JOB IS TO MAKE THE CONSERVATION HALF LOAD-BEARING, not just
// the reduction. Anyone can make a panel shorter by deleting something; the
// owner explicitly refused that. §A proves the composition and the information
// are still on screen, §B pins the typography that must not move, §C proves the
// interaction contract, and only then does §E ask whether it got smaller.
//
// ⚠ AND THE REDUCTION IS MEASURED AGAINST THE OLD GEOMETRY WITH ONE MODEL. Both
// sides of every comparison run through the same line-box estimate and the same
// live font sizes, so what the numbers compare is SPACING and nothing else. The
// absolute pt values are derived, not device-measured, and are labelled as such
// wherever they appear; the DIFFERENCE is what this package promised.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// ⚠ DiceRoller imports `logUiTap` from the store (OTA-1695), so the store's
// transitive native modules have to be mocked — same recipe as ota1878.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; root: TI; unmount(): void };
};

import { DICE_ROLLER_STYLES, DiceRoller } from '../app/components/DiceRoller';
import { AUTO_RESOLVE_HOLD_MS } from '../app/diagnostics/rollTiming';
import type { PendingRollState, RollStep } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const DICE_SRC = src('app', 'components', 'DiceRoller.tsx');

interface TI {
  type: unknown;
  props: Record<string, unknown>;
  parent: TI | null;
  children: unknown[];
  findAll(fn: (n: TI) => boolean): TI[];
  findAllByProps(p: Record<string, unknown>): TI[];
}

const _mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  const roots = _mounted.splice(0);
  renderer.act(() => { for (const r of roots) { try { r.unmount(); } catch { /* gone */ } } });
});

// ── the two real combat steps, shaped as combatRules.ts builds them ──────────
const ATTACK: RollStep = {
  id: 'attack', label: 'Roll to ATTACK', sides: 20, count: 1,
  bonus: 4, bonusLabel: 'STR +2  weapon +2',
  target: 13, targetLabel: 'AC 13',
  context: 'close  to hit Mud Raider',
};
// ⚠ The sparsest legitimate pre-roll state: the DAMAGE step carries no target,
// so its card shows the dice notation ALONE. That is the state `card.minHeight`
// exists for, and the one that was reserving blank space.
const DAMAGE: RollStep = {
  id: 'damage', label: 'Roll for DAMAGE', sides: 6, count: 1,
  bonus: 2, bonusLabel: 'STR +2', context: 'a clean line to the ribs',
};

const rollState = (steps: RollStep[], currentStep = 0): PendingRollState =>
  ({ actionText: 'attack raider', steps, currentStep } as PendingRollState);

function mount(state: PendingRollState, onRoll = jest.fn(), onCancel = jest.fn()) {
  let tree!: { toJSON(): unknown; root: TI; unmount(): void };
  renderer.act(() => {
    tree = renderer.create(
      <DiceRoller state={state} onRoll={onRoll} onCancel={onCancel} />,
    ) as unknown as { toJSON(): unknown; root: TI; unmount(): void };
  });
  _mounted.push(tree);
  return { tree, onRoll, onCancel };
}

/** ⚠ Everything the tree actually RENDERS, read off the rendered JSON rather
 *  than walked as instances: a test instance's children give composites and
 *  strings in a shape that is easy to walk past, and this suite's job is to
 *  prove that words are on screen, so it asks the rendered output directly. */
const rendered = (tree: { toJSON(): unknown }): string => JSON.stringify(tree.toJSON());
const said = (tree: { toJSON(): unknown }, needle: string): boolean =>
  rendered(tree).includes(needle);

/** The ROLL control: the one press target that also stamps the touch clock. */
function rollButton(root: TI): TI {
  const btn = root.findAll((n) => typeof n.props.onPress === 'function'
    && typeof n.props.onPressIn === 'function')[0];
  if (!btn) throw new Error('#210: the ROLL control is not on screen');
  return btn;
}

function pressRoll(root: TI): void {
  const btn = rollButton(root);
  renderer.act(() => { (btn.props.onPress as () => void)(); });
}

// ── the geometry model ───────────────────────────────────────────────────────
//
// ⚠⚠ ONE MODEL, BOTH SIDES. React Native sets no `lineHeight` anywhere in this
// component, so a text row's height is the font's own line box — font-metric
// dependent, and therefore DERIVED rather than proven. 1.30 is the estimate the
// forensics used. It appears ONCE, and every figure below (old and new) runs
// through it with the LIVE font sizes, so nothing in this suite can be satisfied
// by shrinking type: the only variable between the two sides is spacing.
const LINE = 1.3;
const box = (fontSize: number): number => fontSize * LINE;

const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number') throw new Error(`#210 geometry: ${what} is not a number`);
  return v;
};
const S = DICE_ROLLER_STYLES;

/** The spacing bag — the only thing this package changed. */
interface Spacing {
  containerPadding: number;
  containerGap: number;
  cardPadding: number;
  cardMinHeight: number;
  preRollGap: number;
  postRollGap: number;
  diceResultsMarginBottom: number;
  dividerMarginVertical: number;
  contextMarginBottom: number;
  verdictMarginTop: number;
  advLabelMarginTop: number;
  rollBtnPaddingVertical: number;
  advancingHintPaddingVertical: number;
}

/** What shipped before this package. The baseline the reduction is measured
 *  against — recorded here because git history is not a test fixture. */
const OLD: Spacing = {
  containerPadding: 14,
  containerGap: 8,
  cardPadding: 14,
  cardMinHeight: 80,
  preRollGap: 6,
  postRollGap: 4,
  diceResultsMarginBottom: 4,
  dividerMarginVertical: 4,
  contextMarginBottom: 4,
  verdictMarginTop: 2,
  advLabelMarginTop: 2,
  rollBtnPaddingVertical: 14,
  advancingHintPaddingVertical: 12,
};

/** What ships now — read out of the LIVE StyleSheet, never re-typed. */
const NEW: Spacing = {
  containerPadding: num(S.container.padding, 'container.padding'),
  containerGap: num(S.container.gap, 'container.gap'),
  cardPadding: num(S.card.padding, 'card.padding'),
  cardMinHeight: num(S.card.minHeight, 'card.minHeight'),
  preRollGap: num(S.preRoll.gap, 'preRoll.gap'),
  postRollGap: num(S.postRoll.gap, 'postRoll.gap'),
  diceResultsMarginBottom: num(S.diceResults.marginBottom, 'diceResults.marginBottom'),
  dividerMarginVertical: num(S.divider.marginVertical, 'divider.marginVertical'),
  contextMarginBottom: num(S.context.marginBottom, 'context.marginBottom'),
  verdictMarginTop: num(S.verdict.marginTop, 'verdict.marginTop'),
  advLabelMarginTop: num(S.advLabel.marginTop, 'advLabel.marginTop'),
  rollBtnPaddingVertical: num(S.rollBtn.paddingVertical, 'rollBtn.paddingVertical'),
  advancingHintPaddingVertical: num(S.advancingHint.paddingVertical, 'advancingHint.paddingVertical'),
};

const BORDER = 1;               // container and card both, unchanged
const cardChrome = (s: Spacing): number => 2 * s.cardPadding + 2 * BORDER;

/** The card in the sparsest pre-roll state: dice notation alone. */
const sparseCardContent = (): number => box(num(S.diceNotation.fontSize, 'diceNotation'));
const sparsePreRollCard = (s: Spacing): number =>
  Math.max(s.cardMinHeight, sparseCardContent() + cardChrome(s));

/** The card in the richest pre-roll state: notation + `vs AC n`. */
const richPreRollCard = (s: Spacing): number => Math.max(
  s.cardMinHeight,
  box(num(S.diceNotation.fontSize, 'diceNotation')) + s.preRollGap
    + box(num(S.targetText.fontSize, 'targetText')) + cardChrome(s),
);

/** The card once dice have landed. `verdict` is present on the attack step and
 *  absent on damage, which is the only difference between the two post-rolls. */
const postRollCard = (s: Spacing, withVerdict: boolean): number => {
  const dieColumn = box(num(S.dieFace.fontSize, 'dieFace'))
    + num(S.dieResult.gap, 'dieResult.gap')
    + box(num(S.dieValue.fontSize, 'dieValue'));
  let content = dieColumn + s.diceResultsMarginBottom;
  content += s.postRollGap + box(num(S.bonusLine.fontSize, 'bonusLine'));
  content += s.postRollGap + (num(S.divider.height, 'divider.height') + 2 * s.dividerMarginVertical);
  content += s.postRollGap + box(num(S.total.fontSize, 'total'));
  if (withVerdict) {
    content += s.postRollGap + box(num(S.verdict.fontSize, 'verdict')) + s.verdictMarginTop;
  }
  return content + cardChrome(s);
};

const rollFootprint = (s: Spacing): number =>
  2 * s.rollBtnPaddingVertical + box(num(S.rollBtnText.fontSize, 'rollBtnText'));
const hintFootprint = (s: Spacing): number =>
  2 * s.advancingHintPaddingVertical + box(num(S.advancingHintText.fontSize, 'advancingHintText'));

/** The whole panel. Six children → five container gaps, in every state. */
const panel = (s: Spacing, card: number, control: number): number =>
  2 * BORDER + 2 * s.containerPadding + 5 * s.containerGap
  + Math.max(box(num(S.stepKind.fontSize, 'stepKind')), box(num(S.stepCount.fontSize, 'stepCount')))
  + box(num(S.rollLabel.fontSize, 'rollLabel'))
  + box(num(S.context.fontSize, 'context')) + s.contextMarginBottom
  + card
  + control
  + (2 * num(S.cancelBtn.paddingVertical, 'cancelBtn.paddingVertical')
     + box(num(S.cancelText.fontSize, 'cancelText')));

const phases = (s: Spacing) => ({
  attackPreRoll: panel(s, richPreRollCard(s), rollFootprint(s)),
  attackPostRoll: panel(s, postRollCard(s, true), hintFootprint(s)),
  damagePreRoll: panel(s, sparsePreRollCard(s), rollFootprint(s)),
  damagePostRoll: panel(s, postRollCard(s, false), hintFootprint(s)),
});

// ════════════════════════════════════════════════════════════════════════════
// §A — THE APPROVED COMPOSITION AND EVERY PIECE OF INFORMATION SURVIVE
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1879 §A — same look, same information', () => {
  it('the pre-roll card still says all six things it said before', () => {
    const { tree } = mount(rollState([ATTACK, DAMAGE]));
    const r = tree;
    expect(said(r, 'COMBAT')).toBe(true);          // step kind
    expect(said(r, '1')).toBe(true);               // step count "1 of 2"
    expect(said(r, 'of')).toBe(true);
    expect(said(r, 'Roll to ATTACK')).toBe(true);  // the roll label
    expect(said(r, 'to hit Mud Raider')).toBe(true); // the context line
    expect(said(r, 'd20')).toBe(true);             // the dice notation
    expect(said(r, 'STR +2  weapon +2')).toBe(true); // the bonus, named
    expect(said(r, 'AC 13')).toBe(true);           // the target
    expect(said(r, 'ROLL')).toBe(true);            // the control
    expect(said(r, 'cancel')).toBe(true);          // the way out
  });

  it('the post-roll card still shows dice, bonus, Total and the verdict', () => {
    const { tree } = mount(rollState([ATTACK, DAMAGE]));
    pressRoll(tree.root);
    const r = tree;
    expect(said(r, 'Total')).toBe(true);
    // ⚠ The bonus renders as `+ {step.bonusLabel}` — two text children, so the
    // rendered output holds them separately. Assert the LABEL, which is the
    // information; the `+ ` is the composition, pinned by §B's structure.
    expect(said(r, 'STR +2  weapon +2')).toBe(true);
    expect(said(r, 'AC 13')).toBe(true);           // the enemy comparison
    expect(said(r, '✓') || said(r, '✗')).toBe(true); // the verdict, either way
    expect(said(r, 'next roll…')).toBe(true);      // the next-roll treatment
  });

  it('the LAST step says resolving, not next roll — the multi-roll wording is intact', () => {
    const { tree } = mount(rollState([ATTACK, DAMAGE], 1));
    pressRoll(tree.root);
    expect(said(tree,'resolving…')).toBe(true);
    expect(said(tree,'next roll…')).toBe(false);
  });

  it('advantage still names itself and still fades the discarded die', () => {
    const { tree } = mount(rollState([{ ...ATTACK, rollMode: 'advantage', rollModeLabel: 'aiming' }]));
    expect(said(tree,'ADVANTAGE')).toBe(true);
    expect(said(tree,'2d20')).toBe(true);
    pressRoll(tree.root);
    const dieBoxes = tree.root.findAll((n) => {
      const st = n.props.style;
      return Array.isArray(st) && st[0] === DICE_ROLLER_STYLES.dieResult;
    });
    const faded = dieBoxes.filter((n) =>
      (n.props.style as unknown[]).includes(DICE_ROLLER_STYLES.dieResultFaded));
    // One die is kept and one is the shadow — both still drawn, one still faded.
    expect(dieBoxes.length).toBeGreaterThan(faded.length);
    expect(faded.length).toBeGreaterThanOrEqual(1);
  });

  it('a non-combat check still reads SKILL CHECK — the header is not combat-only', () => {
    const { tree } = mount(rollState([{ ...ATTACK, id: 'stealth', label: 'Roll to SNEAK' }]));
    expect(said(tree,'SKILL CHECK')).toBe(true);
    expect(said(tree,'COMBAT')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — THE PROTECTED VISUAL CONTRACT
// ⚠⚠ This is the half of the owner's ruling that a "make it smaller" change
// would quietly break. Every one of these is a value the owner said to preserve,
// so each is pinned by name. Nothing here is spacing.
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1879 §B — typography, colour and rim are untouched', () => {
  it('every font size in the approved hierarchy is exactly what shipped', () => {
    expect(S.stepKind.fontSize).toBe(10);
    expect(S.stepCount.fontSize).toBe(11);
    expect(S.rollLabel.fontSize).toBe(16);
    expect(S.context.fontSize).toBe(12);
    expect(S.diceNotation.fontSize).toBe(22);
    expect(S.targetText.fontSize).toBe(13);
    expect(S.advLabel.fontSize).toBe(11);
    expect(S.dieFace.fontSize).toBe(28);   // ⚠ the large central emphasis
    expect(S.dieValue.fontSize).toBe(16);  // ⚠ the numeral under it
    expect(S.bonusLine.fontSize).toBe(13);
    expect(S.total.fontSize).toBe(20);     // ⚠ the Total hierarchy
    expect(S.verdict.fontSize).toBe(13);
    expect(S.rollBtnText.fontSize).toBe(16);
    expect(S.advancingHintText.fontSize).toBe(12);
    expect(S.cancelText.fontSize).toBe(11);
  });

  it('weights and letter-spacing are exactly what shipped', () => {
    expect(S.stepKind.fontWeight).toBe('700');
    expect(S.stepKind.letterSpacing).toBe(2);
    expect(S.rollLabel.fontWeight).toBe('700');
    expect(S.rollLabel.letterSpacing).toBe(1);
    expect(S.diceNotation.fontWeight).toBe('700');
    expect(S.diceNotation.letterSpacing).toBe(2);
    expect(S.dieValue.fontWeight).toBe('700');
    expect(S.total.fontWeight).toBe('700');
    expect(S.total.letterSpacing).toBe(1);
    expect(S.verdict.fontWeight).toBe('700');
    expect(S.rollBtnText.fontWeight).toBe('700');
    expect(S.rollBtnText.letterSpacing).toBe(2);
    expect(S.advancingHintText.fontStyle).toBe('italic');
  });

  it('the palette and the rim are exactly what shipped', () => {
    expect(S.container.backgroundColor).toBe('#13110f');
    expect(S.container.borderColor).toBe('#3a342c');
    expect(S.container.borderWidth).toBe(1);
    expect(S.container.borderRadius).toBe(6);
    expect(S.card.backgroundColor).toBe('#0a0908');
    expect(S.card.borderColor).toBe('#3a342c');
    expect(S.card.borderWidth).toBe(1);
    expect(S.card.borderRadius).toBe(4);
    expect(S.rollBtn.backgroundColor).toBe('#c9a86a');
    expect(S.rollBtn.borderRadius).toBe(4);
    expect(S.stepKind.color).toBe('#c9a86a');
    expect(S.total.color).toBe('#cdbf99');
    expect(S.success.color).toBe('#9ec96a');
    expect(S.failure.color).toBe('#e07a5f');
    expect(S.divider.height).toBe(1);
    expect(S.divider.width).toBe(80);      // the rule's own width, not spacing
    expect(S.card.justifyContent).toBe('center'); // the centring stays
    expect(S.card.alignItems).toBe('center');
  });

  it('the card is still a CARD and the dice still sit in a row — no compact mode', () => {
    expect(S.diceResults.flexDirection).toBe('row');
    expect(S.diceResults.gap).toBe(12);
    expect(S.header.flexDirection).toBe('row');
    expect(S.header.justifyContent).toBe('space-between');
    // ⚠ Nothing in this component may become a horizontal strip or a variant.
    expect(DICE_SRC).not.toMatch(/compact|miniature|condensed/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — SAME INTERACTION
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1879 §C — the interaction contract', () => {
  it('ROLL still rolls and still auto-resolves on the same hold', () => {
    jest.useFakeTimers();
    try {
      const { tree, onRoll } = mount(rollState([ATTACK, DAMAGE]));
      pressRoll(tree.root);
      expect(onRoll).not.toHaveBeenCalled();           // the hold is still a hold
      renderer.act(() => { jest.advanceTimersByTime(AUTO_RESOLVE_HOLD_MS); });
      expect(onRoll).toHaveBeenCalledTimes(1);
      const [values, timing] = onRoll.mock.calls[0] as [number[], { shownAt: number; tappedAt: number }];
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBe(1);
      expect(typeof timing.shownAt).toBe('number');    // OTA-1694's two stamps
      expect(typeof timing.tappedAt).toBe('number');
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancel still cancels', () => {
    const { tree, onCancel } = mount(rollState([ATTACK]));
    const cancel = tree.root.findAll((n) =>
      typeof n.props.onPress === 'function' && typeof n.props.onPressIn !== 'function');
    expect(cancel.length).toBeGreaterThanOrEqual(1);
    const way = cancel[0];
    if (!way) throw new Error('#210: the cancel link is not on screen');
    renderer.act(() => { (way.props.onPress as () => void)(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('⚠ the ROLL target survives the smaller face — hitSlop, not pixels', () => {
    const { tree } = mount(rollState([ATTACK]));
    const slop = rollButton(tree.root).props.hitSlop as { top: number; bottom: number };
    expect(slop).toBeTruthy();
    // The face plus the slop must still clear the 44pt guidance even though the
    // visible padding came down. This is the arithmetic, not a wish.
    expect(rollFootprint(NEW) + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    // …and the slop must not be a way of smuggling the visible height back.
    expect(slop.top).toBeLessThanOrEqual(8);
    expect(slop.bottom).toBeLessThanOrEqual(8);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — THE FOOTPRINT IS DEVICE-INDEPENDENT, AND MUST STAY THAT WAY
// ⚠⚠ This is the forensic finding restated as a rule. The surface was never too
// tall BECAUSE of the Pixel; it is the same everywhere. A future "fix" that
// keys height to a viewport or a model name would be a different defect.
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1879 §D — no viewport, no device, no scale', () => {
  it('reads no window, no scale helper and no device name', () => {
    for (const forbidden of [
      'useWindowDimensions', 'Dimensions', 'useUiScale', 'computeUiScale',
      'logicalHeight', 'isShrunk', 'aspectRatio', 'Platform', 'DEVICE_PROFILES',
      'iPhone', 'Pixel', 'windowHeight', 'screenWidth',
    ]) {
      expect(DICE_SRC.includes(forbidden)).toBe(false);
    }
  });

  it('every vertical dimension is an absolute number — no percentage heights', () => {
    for (const [name, rule] of Object.entries(S) as Array<[string, Record<string, unknown>]>) {
      for (const key of ['height', 'minHeight', 'maxHeight', 'padding', 'paddingVertical', 'gap']) {
        const v = (rule as Record<string, unknown>)[key];
        if (v === undefined) continue;
        expect(typeof v).toBe('number');
        expect(`${name}.${key}=${String(v)}`).not.toContain('%');
      }
    }
  });

  it('nothing in the panel grows to fill — no flex on the roll surface', () => {
    for (const [, rule] of Object.entries(S) as Array<[string, Record<string, unknown>]>) {
      expect(rule.flex).toBeUndefined();
      expect(rule.flexGrow).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — IT GOT SMALLER, AND BY THE INTENDED AMOUNT
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1879 §E — the proportionality repair', () => {
  const oldP = phases(OLD);
  const newP = phases(NEW);

  it('every spacing constant came down (or held) — none grew', () => {
    for (const k of Object.keys(NEW) as Array<keyof Spacing>) {
      expect(NEW[k]).toBeLessThanOrEqual(OLD[k]);
    }
  });

  it('the spacing constants stay inside their approved bands', () => {
    // ⚠ Bands, not exact bytes: the owner approved DIRECTIONS. A future pass may
    // move inside these; it may not loosen back out or miniaturise past them.
    expect(NEW.containerPadding).toBeGreaterThanOrEqual(8);
    expect(NEW.containerPadding).toBeLessThanOrEqual(11);
    expect(NEW.cardPadding).toBeGreaterThanOrEqual(8);
    expect(NEW.cardPadding).toBeLessThanOrEqual(11);
    expect(NEW.containerGap).toBeGreaterThanOrEqual(5);
    expect(NEW.containerGap).toBeLessThanOrEqual(7);
    expect(NEW.postRollGap).toBeGreaterThanOrEqual(3);
    expect(NEW.postRollGap).toBeLessThanOrEqual(4);
    expect(NEW.rollBtnPaddingVertical).toBeGreaterThanOrEqual(9);
    expect(NEW.rollBtnPaddingVertical).toBeLessThanOrEqual(12);
    expect(NEW.dividerMarginVertical).toBeGreaterThanOrEqual(2);
    expect(NEW.contextMarginBottom).toBeLessThanOrEqual(2);
    expect(NEW.diceResultsMarginBottom).toBeLessThanOrEqual(2);
  });

  it('⚠⚠ the POST-ROLL PEAK — the tallest state — is materially below the old geometry', () => {
    expect(newP.attackPostRoll).toBeLessThan(oldP.attackPostRoll);
    const saved = oldP.attackPostRoll - newP.attackPostRoll;
    // The owner's target was roughly 35-45pt / 10-12%, and explicitly NOT more:
    // past that the component starts being miniaturised rather than tightened.
    expect(saved).toBeGreaterThanOrEqual(30);
    expect(saved).toBeLessThanOrEqual(55);
    const ratio = saved / oldP.attackPostRoll;
    expect(ratio).toBeGreaterThan(0.08);
    expect(ratio).toBeLessThan(0.16);
  });

  it('all four phases came down, so no phase is left oversized', () => {
    for (const k of Object.keys(newP) as Array<keyof typeof newP>) {
      expect(newP[k]).toBeLessThan(oldP[k]);
      expect(oldP[k] - newP[k]).toBeGreaterThanOrEqual(25);
    }
  });

  it('⚠ the landing jump is closed — pre-roll and advancing footprints now match', () => {
    // OTA-255 said in its own comment that the hint takes the button's
    // footprint. It did not: ~49 against ~40. It does now.
    expect(Math.abs(rollFootprint(OLD) - hintFootprint(OLD))).toBeGreaterThan(5);
    expect(Math.abs(rollFootprint(NEW) - hintFootprint(NEW))).toBeLessThanOrEqual(2);
    // And the match was made by lowering the BUTTON, not by raising the hint —
    // raising the hint would have grown the peak this package is reducing.
    expect(NEW.advancingHintPaddingVertical).toBe(OLD.advancingHintPaddingVertical);
    expect(NEW.rollBtnPaddingVertical).toBeLessThan(OLD.rollBtnPaddingVertical);
  });

  it('⚠ the sparse damage prompt no longer reserves the old blank space', () => {
    const contentBox = sparseCardContent();
    const oldBlank = OLD.cardMinHeight - cardChrome(OLD) - contentBox;
    const newBlank = NEW.cardMinHeight - cardChrome(NEW) - contentBox;
    expect(oldBlank).toBeGreaterThan(18);          // the ~21pt the forensics named
    expect(newBlank).toBeLessThan(oldBlank * 0.75); // materially cut
    // …but the floor still EXISTS and still keeps the notation off the rim, so
    // the sparsest prompt does not read as cramped.
    expect(newBlank).toBeGreaterThan(8);
    expect(NEW.cardMinHeight).toBeGreaterThan(contentBox + cardChrome(NEW));
  });

  it('the floor is derived from the sparsest state, and no post-roll state reaches it', () => {
    expect(NEW.cardMinHeight).toBeGreaterThanOrEqual(sparseCardContent() + cardChrome(NEW));
    expect(postRollCard(NEW, false)).toBeGreaterThan(NEW.cardMinHeight);
    expect(postRollCard(NEW, true)).toBeGreaterThan(NEW.cardMinHeight);
    // The richest pre-roll is content-driven either way, so the floor never
    // dictates the attack prompt's height.
    expect(richPreRollCard(NEW)).toBeGreaterThan(NEW.cardMinHeight);
  });

  it('⚠⚠ and the saving is SPACING ONLY — holding spacing constant, nothing moves', () => {
    // The proof that no type shrank: run the OLD spacing through the LIVE font
    // sizes. If a font had been reduced to buy space, this would come out below
    // the recorded old peak rather than equal to it.
    const oldWithLiveType = phases(OLD).attackPostRoll;
    expect(oldWithLiveType).toBeGreaterThan(355);
    expect(oldWithLiveType).toBeLessThan(380);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — THE NEIGHBOURS THIS PACKAGE MUST NOT HAVE TOUCHED
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1879 §F — the contracts around it', () => {
  it('OTA-1694 — the dice clock wiring is byte-intact', () => {
    expect(DICE_SRC.includes("import { AUTO_RESOLVE_HOLD_MS, type RollTapTiming } from '../diagnostics/rollTiming';")).toBe(true);
    expect(DICE_SRC.includes('useEffect(() => { shownAt.current = Date.now(); }, [state.currentStep, state.openedAt]);')).toBe(true);
    expect(DICE_SRC.includes('const timing: RollTapTiming = { shownAt: shownAt.current, tappedAt: tappedAt.current };')).toBe(true);
    expect(DICE_SRC.includes('}, AUTO_RESOLVE_HOLD_MS);')).toBe(true);
    expect(DICE_SRC.includes('const AUTO_RESOLVE_HOLD_MS = 800;')).toBe(false);
  });

  it('⚠ OTA-1695 — the tap ledger adjacency survives, and hitSlop did not split it', () => {
    // The gate reads these two props as ONE string. The new hitSlop had to go
    // AFTER them for that reason; this asserts it did.
    expect(DICE_SRC.includes('onPressIn={noteTouchDown} onPress={handleRoll}')).toBe(true);
    const slopAt = DICE_SRC.indexOf('hitSlop={ROLL_HIT_SLOP}');
    const pressAt = DICE_SRC.indexOf('onPress={handleRoll}');
    expect(slopAt).toBeGreaterThan(pressAt);
  });

  it('OTA-1379 — DiceRoller is still the first branch and InputBox still the last', () => {
    const expl = src('app', 'screens', 'ExplorationScreen.tsx');
    const roller = expl.indexOf('<DiceRoller');
    const box2 = expl.indexOf('<InputBox');
    expect(roller).toBeGreaterThan(0);
    expect(box2).toBeGreaterThan(roller);
  });

  it('⚠⚠ OTA-1878 is untouched — the threshold, the feed and the reader are as shipped', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nr = require('../app/ui/narrativeReadability');
    expect(nr.CONSTRAINED_NARRATIVE_MIN_HEIGHT).toBe(108);
    expect(nr.READABLE_NARRATIVE_LINES).toBe(4);
    expect(nr.NARRATIVE_BODY_LINE_HEIGHT).toBe(22);
    const expl = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(expl).toContain('feed: { flex: 1, flexShrink: 1, minHeight: 0 }');
    // ⚠ The feed panel's `area`/`style` pair is OTA-1803's own pin and that
    // suite owns the adjacency rule (it strips comments before matching, which
    // a duplicate here would get wrong). This asserts only that both halves
    // still exist, so the two suites cannot disagree about the same fact.
    expect(expl).toContain('area="feed"');
    expect(expl).toContain('style={[styles.feed, tartariaKitStyles.panelFrame]}');
    expect(expl).toContain('narrative-expand');
    expect(src('app', 'components', 'AdventureFeed.tsx'))
      .toContain("from '../ui/narrativeReadability'");
  });

  it('the controls region itself is still the bare gap it was — no wrapper was added', () => {
    expect(src('app', 'screens', 'ExplorationScreen.tsx')).toContain('controls: { gap: 6 }');
  });
});
