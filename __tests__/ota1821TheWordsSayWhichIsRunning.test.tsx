jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));

/**
 * OTA-1821 — THE WORDS SAY WHICH ONE IS RUNNING.
 *
 * ⚠⚠⚠ TARGET 7. Owner, looking at an active Hunt on the device: the ACTIVATE /
 * DEACTIVATE control stopped reading as the same physical Tartaria key once it
 * was running. OTA-1361 ("the set active buttons should glow on missions") built
 * the active state as FOUR layers — a tinted fill, a brighter border at double
 * width, a box glow, and a text halo. Three of those four draw the PERIMETER, and
 * on hardware the result is that the button appears to flatten into a lit frame:
 * the depth is replaced by an outline around the rectangle.
 *
 * THE REPAIR IS ONE STYLE FAMILY AND NOTHING ELSE. The body is declared once, on
 * `trackBtn`, and NEITHER state overrides it — `trackBtnOn` and `trackBtnOff` are
 * both deliberately empty. The fourth layer survives and is now the whole signal:
 * `trackBtnTextOn` keeps its colour, its weight and its halo, in the accent that
 * already existed. No new colour is minted.
 *
 * ⚠⚠ WHY THE STYLE FAMILY IS THE SEAM AND THE HELPER IS NOT. `trackToggle` covers
 * six contract kinds (hunt, mystery, storyline, whisper, lead, broker). It does
 * NOT cover GREAT CLIMBS or FACTION QUESTS — those are HAND-COPIED inline
 * duplicates of the helper's body, not calls to it, and Faction Quests does not
 * even share the helper's label (it routes through `escortToggleLabel`). What all
 * three shapes DO share, byte for byte, is the style array. So the narrowest seam
 * that reaches all eight contract families is the `trackBtn*` STYLE FAMILY, and
 * repairing it touches no call site at all. §1 proves that claim rather than
 * assuming it; if a fourth call shape is ever added with a different array, §1.2
 * goes red.
 *
 * ⚠ NOT AN ACCESSIBILITY INDICATOR — CHECKED BEFORE TOUCHING IT. The programmatic
 * signal is `accessibilityState={{ selected }}`, present at every call site and
 * untouched here (§5). The removed perimeter was decorative active-state styling,
 * never a focus ring. Had it been a focus indicator this repair would have been
 * refused outright.
 *
 * ⚠ THE STRONGEST SECTION IS §3, AND IT IS A REAL RENDER. Source text can say the
 * declarations are empty; only a mount can say what the control actually resolves
 * to. §3 starts a real game, accepts a real hunt, renders the REAL ContractsScreen,
 * reads the resolved style off the REAL control in the ACTIVE state, flips the
 * contract off through the REAL store action, re-reads it, and requires the two
 * bodies to be deep-equal. That is the owner's sentence — "the body must read the
 * same whether the contract is running or not" — expressed as an assertion.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: { findAll: (p: (n: TestInstance) => boolean, o?: { deep: boolean }) => TestInstance[] };
    unmount: () => void;
  };
  act: (cb: () => unknown) => Promise<void>;
};

type TestInstance = {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown;
};

const SRC = path.join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx');
const BODY = fs.readFileSync(SRC, 'utf8');

/**
 * Comment lines are stripped before EVERY token scan. Learned the hard way more
 * than once on this codebase: a scan for a forbidden token will otherwise match
 * the prose in the very comment that explains why the token was removed.
 */
const CODE = BODY.split('\n')
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/'));
  })
  .join('\n');

/** The one style-array expression every activate/deactivate control passes. */
const SHARED_ARRAY =
  /\[kit\.ctl, styles\.trackBtn, \w+ \? styles\.trackBtnOn : styles\.trackBtnOff, pressed && styles\.trackBtnPressed\]/g;

/** Read one top-level `name: { ... }` declaration out of the StyleSheet block. */
function decl(name: string): string {
  const at = CODE.indexOf(`\n  ${name}: {`);
  if (at === -1) throw new Error(`style ${name} not declared`);
  const open = CODE.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === '{') depth++;
    else if (CODE[i] === '}') { depth--; if (depth === 0) return CODE.slice(open, i + 1); }
  }
  throw new Error(`style ${name} never closed`);
}

/** Keys that draw the PERIMETER or the FILL — the three OTA-1361 layers removed. */
const PERIMETER_KEYS = [
  'borderColor', 'borderWidth', 'backgroundColor',
  'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation',
];

// ══════════════════════════════════════════════════════════════════════════════
// §1 — THE SHARED SEAM: one style family, three call shapes, eight families
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1821 §1 — the repair sits on the narrowest seam that reaches all three classes', () => {
  test('1.1 every activate/deactivate control passes the IDENTICAL style array', () => {
    const hits = CODE.match(SHARED_ARRAY) ?? [];
    expect(hits.length).toBe(3);
    /**
     * ⚠ IDENTICAL MODULO THE CONDITION VARIABLE, and that qualifier is the honest
     * claim rather than a softened one. The three call sites live in different
     * scopes and each names its own "is this one running" local — the helper and
     * the faction-quest copy both call it `tracked`, the climbs copy calls it
     * `climbActive`. Demanding one literal spelling would be demanding that two
     * unrelated scopes share a variable name, which proves nothing about the
     * STYLE. Normalising the condition and then requiring exactly one form is the
     * assertion that actually bites: any drift in kit.ctl, the family names, the
     * order, or the pressed arm still fails here.
     */
    const normalised = new Set(hits.map((h) => h.replace(/\b(tracked|climbActive)\b/, '<active?>')));
    expect(normalised.size).toBe(1);
    expect([...normalised][0]).toBe(
      '[kit.ctl, styles.trackBtn, <active?> ? styles.trackBtnOn : styles.trackBtnOff, pressed && styles.trackBtnPressed]',
    );
    // and the two legitimate condition spellings are exactly the two expected
    expect(new Set(hits).size).toBe(2);
  });

  test('1.2 the three shapes are the helper, GREAT CLIMBS, and FACTION QUESTS', () => {
    // the helper's own parameter is `tracked`; the climbs copy uses `climbActive`
    expect(CODE).toMatch(/styles\.trackBtn, tracked \? styles\.trackBtnOn/);
    expect(CODE).toMatch(/styles\.trackBtn, climbActive \? styles\.trackBtnOn/);
    // two of the three spell it `tracked` — the helper and the faction-quest copy
    const trackedShapes = (CODE.match(/styles\.trackBtn, tracked \? styles\.trackBtnOn/g) ?? []).length;
    expect(trackedShapes).toBe(2);
  });

  test('1.3 the helper alone reaches six contract kinds; the copies add two more', () => {
    const sig = /const trackToggle = \(\s*kind: ([^,]+),/.exec(CODE);
    expect(sig).not.toBeNull();
    for (const kind of ['hunt', 'mystery', 'storyline', 'whisper', 'lead', 'broker']) {
      expect(sig![1]).toContain(`'${kind}'`);
    }
    // the two hand-copies are driven by their own store actions, not the helper
    expect(CODE).toMatch(/setGreatClimbActive\(/);
    expect(CODE).toMatch(/setFactionQuestActive\(/);
  });

  test('1.4 MISSION, BOUNTY and HUNT coverage is stated by the source, not assumed', () => {
    // HUNT — reached, through the helper
    expect(CODE).toMatch(/trackToggle\('hunt'/);
    // MISSION — the screen's own word for the mystery/storyline/faction/broker family
    expect(CODE).toMatch(/trackToggle\('mystery'/);
    expect(CODE).toMatch(/trackToggle\('storyline'/);
    // BOUNTY — TRUTHFULLY NOT REACHED. Bounties have no activate/deactivate control
    // at all; the bounty card is a single SET-COURSE affordance. If one is ever
    // added it must use this same family, and this assertion is where that is caught.
    expect(CODE).not.toMatch(/trackToggle\('bounty'/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §2 — THE PERIMETER IS GONE FROM BOTH STATE DECLARATIONS
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1821 §2 — neither state contributes anything to the body', () => {
  test('2.1 trackBtnOn declares no perimeter, fill, glow or elevation key', () => {
    const d = decl('trackBtnOn');
    for (const k of PERIMETER_KEYS) expect(d).not.toContain(k);
    expect(d.replace(/\s/g, '')).toBe('{}');
  });

  test('2.2 trackBtnOff declares no perimeter, fill, glow or elevation key', () => {
    const d = decl('trackBtnOff');
    for (const k of PERIMETER_KEYS) expect(d).not.toContain(k);
    expect(d.replace(/\s/g, '')).toBe('{}');
  });

  test('2.3 the OTA-1361 glow literals are gone from the whole screen', () => {
    expect(CODE).not.toContain('#7ef0dd'); // the brighter active rim
    expect(CODE).not.toContain('#123a3a'); // the tinted active fill
  });

  test('2.4 the resting body is declared ONCE, on trackBtn, and is not flat', () => {
    const d = decl('trackBtn');
    expect(d).toContain("borderColor: '#5a6a6e'"); // the resting rim, now the only rim
    expect(d).toContain('borderWidth: 1');         // NOT doubled, NOT removed
    expect(d).toContain("backgroundColor: 'transparent'");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §3 — ONE BODY, BOTH STATES — PROVED BY RENDERING THE REAL SCREEN
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1821 §3 — the rendered control has the same body running or not', () => {
  const TOGGLE = /SET ACTIVE|DEACTIVATE/;

  /** Text reachable from a test instance, without touching React's circular fibers. */
  function textOf(inst: TestInstance): string {
    const acc: string[] = [];
    const walk = (n: unknown, d = 0): void => {
      if (n == null || d > 14) return;
      if (typeof n === 'string') { acc.push(n); return; }
      if (Array.isArray(n)) { n.forEach((x) => walk(x, d + 1)); return; }
      const c = (n as { children?: unknown }).children;
      if (c) walk(c, d + 1);
    };
    walk(inst.children);
    return acc.join(' ');
  }

  type Sample = { label: string; body: Record<string, unknown>; selected: unknown; textStyle: unknown };

  function sampleToggles(tree: { root: { findAll: (p: (n: TestInstance) => boolean, o?: { deep: boolean }) => TestInstance[] } }): Sample[] {
    const seen = new Set<unknown>();
    const out: Sample[] = [];
    // ⚠ findAll returns each prop once per composite AND per host element, so the
    // same control comes back twice. Dedupe by the style FUNCTION's identity.
    const cands = tree.root.findAll((n) => typeof n.props?.style === 'function', { deep: true });
    for (const c of cands) {
      const txt = textOf(c);
      if (!TOGGLE.test(txt)) continue;
      const fn = c.props.style as (s: { pressed: boolean }) => unknown;
      if (seen.has(fn)) continue;
      seen.add(fn);
      // ⚠ scoped to THIS control, not the whole tree: a tree-wide search would
      // happily return some other toggle's label and quietly compare a control
      // against a stranger.
      // ⚠ Pressable renders a host View whose own style is the RESOLVED ARRAY, so
      // "an array style containing the label" matches the button body first. The
      // label is the node whose flattened style actually sets a `color`.
      const textInst = (c as unknown as { findAll: (p: (n: TestInstance) => boolean, o?: { deep: boolean }) => TestInstance[] })
        .findAll((n) => {
          if (!Array.isArray(n.props?.style) || !TOGGLE.test(textOf(n))) return false;
          const f = StyleSheet.flatten(n.props.style as never) as Record<string, unknown> | undefined;
          return !!f && f.color !== undefined;
        }, { deep: true })[0];
      out.push({
        label: (txt.match(TOGGLE) as RegExpMatchArray)[0],
        body: StyleSheet.flatten(fn({ pressed: false })) as Record<string, unknown>,
        selected: (c.props.accessibilityState as { selected?: unknown } | undefined)?.selected,
        textStyle: textInst ? StyleSheet.flatten(textInst.props.style as never) : null,
      });
    }
    return out;
  }

  let active: Sample;
  let inactive: Sample;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ContractsScreen } = require('../app/screens/ContractsScreen') as typeof import('../app/screens/ContractsScreen');

    await TR.act(async () => {
      await useGameStore.getState().startNewGame({
        name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
        motiveId: 'debt', pressure: 'owed',
      } as never);
    });
    // a real hunt, taken the way the game takes one — accepting it makes it active
    await TR.act(async () => { useGameStore.getState().acceptHunt('hunt_bog_dragon'); });

    let tree!: ReturnType<typeof TR.create>;
    await TR.act(() => { tree = TR.create(React.createElement(ContractsScreen)); });
    await TR.act(async () => { await Promise.resolve(); });

    const runningNow = sampleToggles(tree);
    expect(runningNow.length).toBeGreaterThan(0);
    active = runningNow[0] as Sample;

    // flip it off through the REAL store action the button itself calls
    await TR.act(async () => {
      useGameStore.getState().setContractActive('hunt', 'hunt_bog_dragon', false);
    });
    await TR.act(async () => { await Promise.resolve(); });

    const pausedNow = sampleToggles(tree);
    expect(pausedNow.length).toBeGreaterThan(0);
    inactive = pausedNow[0] as Sample;
  }, 120_000);

  test('3.1 the two samples really are the two different states', () => {
    expect(active.label).toBe('DEACTIVATE');
    expect(inactive.label).toBe('SET ACTIVE');
  });

  test('3.2 ⚠ THE OWNER SENTENCE: the resolved body is IDENTICAL in both states', () => {
    expect(active.body).toEqual(inactive.body);
  });

  test('3.3 the active body carries no glow, no fill tint and no elevation', () => {
    for (const k of ['shadowColor', 'shadowOpacity', 'shadowRadius', 'elevation']) {
      expect(active.body[k]).toBeUndefined();
    }
    expect(active.body.backgroundColor).toBe('transparent');
  });

  test('3.4 the button is NOT flattened — it keeps one rim and the kit depth key', () => {
    expect(active.body.borderWidth).toBe(1);
    expect(active.body.borderColor).toBe('#5a6a6e');
    // kit.ctl's dimensional key — the lit top edge and the dark bottom edge
    expect(active.body.borderTopColor).toBeTruthy();
    expect(active.body.borderBottomColor).toBeTruthy();
    expect(active.body.borderTopColor).not.toBe(active.body.borderBottomColor);
    expect(inactive.body.borderTopColor).toBe(active.body.borderTopColor);
  });

  /**
   * ⚠⚠ ADDED AFTER NEGATIVE CONTROL 3 CAUGHT TOO LITTLE. NC-3 blanked the active
   * text colour — the state where the perimeter is gone AND the words no longer
   * distinguish, i.e. a control with NO active signal whatsoever, which is the
   * worst possible outcome of this repair. Exactly one source-level assertion went
   * red. That was thin coverage of the single most important consequence, so the
   * suite was WIDENED (not the control weakened) to demand it of the RENDER too.
   */
  test('3.5 with the body equal, the RENDERED words must be what distinguishes them', () => {
    expect(active.textStyle).not.toBeNull();
    expect(inactive.textStyle).not.toBeNull();
    const a = active.textStyle as Record<string, unknown>;
    const i = inactive.textStyle as Record<string, unknown>;
    // the whole repair rests on this: same body, therefore the text MUST differ
    expect(a).not.toEqual(i);
    expect(a.color).not.toBe(i.color);
    // and the active word specifically must be the highlighted one, with its halo
    expect(a.color).toBe('#c7fff4');
    expect(a.textShadowColor).toBe('#54d6c4');
    expect(i.color).toBe('#8aa0a4');
  });

  test('3.6 the control still reports its state programmatically', () => {
    expect(active.selected).toBe(true);
    expect(inactive.selected).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §4 — THE WORDS, AND ONLY THE WORDS, CARRY THE ACTIVATION
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1821 §4 — the active signal moved into the text', () => {
  test('4.1 the active text keeps its colour, its weight and its halo', () => {
    const d = decl('trackBtnTextOn');
    expect(d).toContain("color: '#c7fff4'");
    expect(d).toContain("fontWeight: '800'");
    expect(d).toContain("textShadowColor: '#54d6c4'");
    expect(d).toMatch(/textShadowRadius: \d+/);
  });

  test('4.2 the inactive text stays the quiet grey, so the two words differ', () => {
    expect(decl('trackBtnTextOff')).toContain("color: '#8aa0a4'");
  });

  test('4.3 the accent is the EXISTING one — no new colour was minted', () => {
    // #54d6c4 is the screen's long-standing teal: it already carried the label.
    expect(decl('trackBtnText')).toContain("color: '#54d6c4'");
    expect(decl('trackBtnTextOn')).toContain('#54d6c4');
  });

  test('4.4 the words themselves still say which state the control is in', () => {
    expect(CODE).toContain("'▮▮ DEACTIVATE' : '▶ SET ACTIVE'");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §5 — ACCESSIBILITY AND GAMEPLAY ARE UNTOUCHED
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1821 §5 — nothing behavioural was traded for the look', () => {
  test('5.1 every call shape still declares accessibilityState selected', () => {
    const states = CODE.match(/accessibilityState=\{\{ selected: (tracked|climbActive) \}\}/g) ?? [];
    expect(states.length).toBe(3);
  });

  test('5.2 every call shape still declares the button role', () => {
    // the three toggles sit among other buttons, so assert per-shape adjacency
    for (const shape of CODE.match(SHARED_ARRAY) ?? []) {
      const at = CODE.indexOf(shape);
      const window = CODE.slice(at, at + 400);
      expect(window).toContain('accessibilityRole="button"');
      expect(window).toMatch(/accessibilityState=\{\{ selected:/);
    }
  });

  test('5.3 the gameplay activation calls are unchanged', () => {
    expect(CODE).toMatch(/onPress=\{\(\) => setContractActive\(kind, id, !tracked\)\}/);
    expect(CODE).toMatch(/onPress=\{\(\) => setGreatClimbActive\(c\.id, !climbActive\)\}/);
    expect(CODE).toMatch(/onPress=\{\(\) => setFactionQuestActive\(def\.id, !tracked\)\}/);
  });

  test('5.4 the press state is still its own separate arm', () => {
    expect(decl('trackBtnPressed')).toContain('opacity: 0.7');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §6 — SCOPE: NO UNRELATED BUTTON FAMILY INHERITED THIS CHANGE
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1821 §6 — the blast radius is one style family', () => {
  /**
   * ⚠ THE BRIEF FORBADE A GLOBAL OUTLINE REMOVAL, and this screen is full of
   * other `*On` / `*Active` styles that legitimately paint a perimeter to mark a
   * selected state — sort bars, slate filters, milestone cells. They are NOT the
   * activate/deactivate control class and they are deliberately still lit.
   */
  test('6.1 other selected-state styles keep their perimeters', () => {
    expect(decl('slateBtnOn')).toContain("borderColor: '#c9a86a'");
    expect(decl('sortBarOn')).toContain("borderColor: '#7fb0a8'");
    expect(decl('sortBarReadyOn')).toContain("borderColor: '#9ec96a'");
    expect(decl('mqSortBtnOn')).toContain("borderColor: '#7fb0a8'");
    expect(decl('cellActive')).toContain("borderColor: '#c9a86a'");
  });

  test('6.2 other BUTTON families keep their own rims', () => {
    expect(decl('routeBtnPrimary')).toContain("borderColor: '#c9a86a'");
    expect(decl('routeBtnNeutral')).toContain("borderColor: '#3a342c'");
    expect(decl('refusalButtonPrimary')).toContain("borderColor: '#f0bd77'");
  });

  test('6.3 no blue/cyan accent was removed screen-wide', () => {
    expect(CODE).toContain('#54d6c4'); // the toggle label + halo accent, still here
    expect(CODE).toContain('#9ec0ef'); // routeBtnText's blue, untouched
    expect(CODE).toContain('#7fb0a8'); // the sort bars' cyan, untouched
  });

  test('6.4 exactly three style names in the family, and only two were emptied', () => {
    expect(decl('trackBtn').length).toBeGreaterThan(40);       // the body survives
    expect(decl('trackBtnOn').replace(/\s/g, '')).toBe('{}');  // emptied
    expect(decl('trackBtnOff').replace(/\s/g, '')).toBe('{}'); // emptied
    expect(decl('trackBtnPressed')).toContain('opacity');      // untouched
  });
});
