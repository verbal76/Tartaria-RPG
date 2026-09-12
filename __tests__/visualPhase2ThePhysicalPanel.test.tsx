/**
 * VISUAL LANGUAGE PHASE 2 — THE THIRD PLANE, THE DOCKED TAB, AND THE BOARD.
 *
 * Game Director, after physically inspecting the Phase-1 build: the visual
 * difference is "too subtle." That is authoritative visual evidence and it is
 * NOT a verdict on the grammar — the four families were right. The SIGNAL was
 * too quiet.
 *
 * ⚠⚠ SO PHASE 2 ANSWERS IT WITH GEOMETRY, WHICH IS THE PART A TEST CAN HOLD.
 * Phase 1 gave a control two planes: a lit face edge and a dark side. Two bands
 * touching each other still read as one edge, however dark the lower one gets,
 * and the ruling forbade solving it with alpha. Phase 2 lifts the side off the
 * bottom and puts a CONTACT SHADOW underneath it, so a key has a face, a side,
 * and a dark where it meets the thing it stands on. Three planes.
 *
 *   PHASE 1                 PHASE 2
 *   ┌──────────┐            ┌──────────┐   ← face light
 *   │   FACE   │            │   FACE   │
 *   ├──────────┤ side       ├──────────┤   ← sidewall, 3dp, lifted
 *   └──────────┘            └──────────┘   ← contact shadow
 *
 * ⚠⚠⚠ WHAT THIS SUITE CANNOT PROVE, SAID FIRST. It cannot prove the result
 * looks like a maintained instrument panel, that the tabs read as engaged, that
 * the boards read as lifted, or that any of it is now loud enough. Those are
 * Kevin's eye on a device and nothing else. What it proves is STRUCTURE: that
 * the planes exist and are ordered, that pressed is a geometry change rather
 * than a colour swap, that an active tab is a different OBJECT from an inactive
 * one, that boards are lifted by paint rather than by layout, that the families
 * stay separate, and that nothing behavioural moved.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { T, tartariaKitStyles, tModalCard, tMomentCard, TScreenHeader } from '../app/ui/tartariaKit';

const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAll: (f: (n: any) => boolean, o?: any) => any[] } };
  act: (f: () => void) => void;
};
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const KIT = read('app/ui/tartariaKit.tsx');
const KIT_CODE = codeOf(KIT);
const INPUT_BOX = codeOf(read('app/components/InputBox.tsx'));
const KB_BAR = codeOf(read('app/components/KeyboardInputBar.tsx'));
const ENEMY_PANEL = codeOf(read('app/components/EnemyPanel.tsx'));
const STATS_PANEL = codeOf(read('app/components/StatsPanel.tsx'));
const EXPLORATION = codeOf(read('app/screens/ExplorationScreen.tsx'));

type Style = Record<string, unknown>;
const flat = (s: unknown): Style => Object.assign({}, ...[s].flat(9).filter(Boolean) as Style[]);
const alpha = (rgba: string) => Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(rgba)![1]);

/* ════════════════════════════════════════════════════════════════════════════
   1. THE THIRD PLANE — a key now stands ON something
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 2 — a control has a face, a side, and a contact shadow', () => {
  it('the sidewall is lifted off the bottom so the contact band has somewhere to be', () => {
    const side = flat(tartariaKitStyles.controlPlaneBottom);
    const contact = flat(tartariaKitStyles.controlPlaneContact);
    // The side no longer touches the bottom: that gap IS the third plane.
    expect(side.bottom as number).toBeGreaterThanOrEqual(1);
    expect(contact.bottom).toBe(0);
    // …and they do not overlap, or there would be two bands drawn as one.
    expect(contact.height as number).toBeLessThanOrEqual(side.bottom as number);
  });

  /** ⚠ THE ORDERING IS THE CLAIM, NOT THE NUMBERS. Light on top, a mid-dark
   *  side, and the darkest value where the object meets the surface. If the
   *  contact were ever lighter than the side the object would read as floating
   *  rather than resting, which is the one thing the band exists to say. */
  it('the three values are ordered: face light, then side, then darkest at the contact', () => {
    expect(alpha(T.controlContact)).toBeGreaterThan(alpha(T.controlSidewall));
    expect(flat(tartariaKitStyles.controlPlaneTop).backgroundColor).toBe(T.controlFaceLit);
    expect(flat(tartariaKitStyles.controlPlaneBottom).backgroundColor).toBe(T.controlSidewall);
    expect(flat(tartariaKitStyles.controlPlaneContact).backgroundColor).toBe(T.controlContact);
  });

  it('the side has real thickness — an edge cannot have one', () => {
    expect(flat(tartariaKitStyles.controlPlaneBottom).height as number).toBeGreaterThanOrEqual(3);
  });

  /** ⚠⚠ PHASE 2 IS LOUDER THAN PHASE 1, AND THAT IS THE POINT — but the claim is
   *  a FLOOR, so a later pass can keep raising it and can never quietly undo the
   *  device finding by sliding back to the values Kevin rejected. */
  it('every plane value is at least as strong as the Phase-1 value it replaced', () => {
    expect(alpha(T.controlFaceLit)).toBeGreaterThanOrEqual(0.28);
    expect(alpha(T.controlSidewall)).toBeGreaterThanOrEqual(0.55);
    expect(alpha(T.chassisFaceLit)).toBeGreaterThanOrEqual(0.12);
    expect(alpha(T.chassisSidewall)).toBeGreaterThanOrEqual(0.32);
  });

  /** ⚠ STILL ZERO LAYOUT. The entire licence for drawing depth inside a control
   *  is that none of it can move a box. A third plane does not change that. */
  it.each(['controlPlaneContact', 'chassisPlaneContact'] as const)(
    '%s places and paints itself and owns no geometry', (name) => {
      const s = flat((tartariaKitStyles as Record<string, unknown>)[name]);
      expect(s.position).toBe('absolute');
      for (const banned of [
        'padding', 'paddingVertical', 'margin', 'marginVertical', 'minHeight',
        'width', 'flex', 'borderWidth', 'elevation', 'shadowColor',
      ]) expect(s).not.toHaveProperty(banned);
    });

  /** ⚠⚠ THE FAMILY BOUNDARY SURVIVES THE VOLUME. Both families got louder; a
   *  card must still be quieter than a key or the hierarchy Phase 1 built is
   *  gone. Ratios, not absolutes, so a future pass cannot collapse them. */
  it('a chassis is still strictly shallower than a command, at every band', () => {
    expect(alpha(T.chassisFaceLit)).toBeLessThan(alpha(T.controlFaceLit));
    expect(alpha(T.chassisSidewall)).toBeLessThan(alpha(T.controlSidewall));
    expect(alpha(T.chassisContact)).toBeLessThan(alpha(T.controlContact));
    expect(flat(tartariaKitStyles.chassisPlaneBottom).height as number)
      .toBeLessThan(flat(tartariaKitStyles.controlPlaneBottom).height as number);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   2. PRESSED IS A GEOMETRY CHANGE
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 2 — a key pushed home visibly loses height', () => {
  /* ⚠⚠⚠ OWNER: *"Opacity-only press feedback is insufficient as the governing
   * visual language."* So the pressed state must differ in SHAPE, not only in
   * colour: the side collapses, the contact band is not drawn, and the control
   * travels further than Phase 1's 1.5dp. */
  it('the sidewall collapses when pressed', () => {
    const rest = flat(tartariaKitStyles.controlPlaneBottom).height as number;
    const down = flat(tartariaKitStyles.controlPlaneBottomPressed).height as number;
    expect(down).toBeLessThan(rest);
  });

  it('the travel is at least 2dp and lives in one governed style', () => {
    const t = flat(tartariaKitStyles.controlPressed).transform as [{ translateY: number }];
    expect(t[0].translateY).toBeGreaterThanOrEqual(2);
    // Resting must not translate, or the control sits pre-depressed.
    expect(flat(tartariaKitStyles.controlResting).transform).toBeUndefined();
  });

  /** ⚠ AND THE CONTACT SHADOW GOES AWAY. An object pushed into its housing is
   *  no longer standing on anything; keeping the band would be the one detail
   *  that says "still raised" while everything else says "pressed". */
  it('every governed command drops the contact band while pressed', () => {
    for (const [name, src] of [['QuickBtn/Act', INPUT_BOX], ['header BACK', KIT_CODE]] as const) {
      expect(src).toMatch(/pressed \? null : <View style=\{(tartariaKitStyles|kit)\.controlPlaneContact\}/);
      expect(name).toBeTruthy();
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   3. THE BOARD IS ABOVE THE GAME
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 2 — dialogs and boards are lifted, and lifted by paint', () => {
  /* ⚠⚠ THIS IS THE ONE PLACE ELEVATION IS CORRECT. The compact-control family
   * refuses Android `elevation` because a four-sided halo is wrong on a chip
   * standing on a plate. A board laid over the whole screen is exactly the
   * object a four-sided shadow describes. */
  it('both overlay authorities carry the lift', () => {
    for (const card of [flat(tModalCard()), flat(tMomentCard())]) {
      expect(card.elevation as number).toBeGreaterThan(0);
      expect(card.shadowColor).toBe(T.boardShadow);
      expect(card.shadowRadius as number).toBeGreaterThan(0);
      expect((card.shadowOffset as { height: number }).height).toBeGreaterThan(0);
    }
  });

  /** ⚠ AND IT COSTS NOTHING. `shadow*` and `elevation` are paint; fourteen
   *  dialogs keep the exact geometry they shipped with, which is why this could
   *  be done at the authority rather than screen by screen. */
  it('the lift owns no layout, so every inheriting dialog is the size it was', () => {
    const lift = flat(tartariaKitStyles.boardLift);
    for (const banned of [
      'padding', 'margin', 'width', 'height', 'minHeight', 'maxHeight', 'flex',
      'borderWidth', 'position', 'top', 'bottom',
    ]) expect(lift).not.toHaveProperty(banned);
  });

  it('a board outranks a control: its shadow is larger than any control plane', () => {
    // A control draws depth INSIDE itself; only a board throws a shadow outside.
    for (const name of ['controlPlaneTop', 'controlPlaneBottom', 'controlPlaneContact',
      'chassisPlaneTop', 'chassisPlaneBottom', 'chassisPlaneContact'] as const) {
      const s = flat(tartariaKitStyles[name]);
      expect(s).not.toHaveProperty('elevation');
      expect(s).not.toHaveProperty('shadowColor');
    }
  });

  it('the card geometry the dialogs depend on is untouched', () => {
    const modal = flat(tModalCard());
    expect(modal.maxHeight).toBe('85%');   // OTA-1614 — the scrim stays reachable
    expect(modal.padding).toBe(14);
    expect(flat(tMomentCard()).padding).toBe(20);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   4. HEADERS — BACK is a control, the title is not
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 2 — the shared header separates the control from the label', () => {
  const renderHeader = () => {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(TScreenHeader, { title: 'TARTARIA', onBack: () => {} } as any),
      );
    });
    return tree;
  };

  /* ⚠⚠ SEVEN SCREENS TAKE THIS HEADER, so whatever BACK says about pressability
   * is what most of the game says. Phase 1 gave it the ring and stopped; it now
   * carries the same three planes as every other command. */
  it('BACK carries the full command construction', () => {
    const tree = renderHeader();
    const back = tree.root.findAll(
      (n: any) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function',
      { deep: false },
    );
    expect(back.length).toBe(1);
    const planes = back[0]
      .findAll((n: any) => n.props?.pointerEvents === 'none' && n.props?.style, { deep: false })
      .map((n: any) => flat(n.props.style).backgroundColor);
    expect(planes).toContain(T.controlFaceLit);
    expect(planes).toContain(T.controlSidewall);
    expect(planes).toContain(T.controlContact);
  });

  /** ⚠⚠⚠ THE TITLE DELIBERATELY GETS NOTHING. Owner: *"Do not make the entire
   *  header into one raised slab unless it is actually interactive as one
   *  object."* A header is a control, a label and a slot — three things. */
  it('the title is structural: a header role, no press, no plane', () => {
    const tree = renderHeader();
    const titles = tree.root.findAll((n: any) => n.props?.accessibilityRole === 'header', { deep: false });
    expect(titles.length).toBe(1);
    expect(titles[0].props.onPress).toBeUndefined();
    const titleStyle = flat(titles[0].props.style);
    for (const banned of ['elevation', 'shadowColor']) expect(titleStyle).not.toHaveProperty(banned);
    // The header row itself is not one pressable slab.
    expect(KIT_CODE).not.toMatch(/schRow[^}]*onPress/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   5. PROPAGATION — and the boundaries that survive it
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 2 — the grammar reaches further, and the families stay apart', () => {
  it('every Phase-1 plane consumer took the third band too', () => {
    for (const src of [INPUT_BOX, KB_BAR]) {
      expect(src).toContain('tartariaKitStyles.controlPlaneContact');
    }
    for (const src of [ENEMY_PANEL, STATS_PANEL, EXPLORATION]) {
      expect(src).toContain('tartariaKitStyles.chassisPlaneContact');
    }
  });

  /** ⚠ THE ANCESTOR JOINS ITS OWN FAMILY. `btnFace` carried the inner sheen
   *  (0.20/0.45) tuned when it was the only face treatment in the game; beside
   *  chips drawing a 3dp side it had become the flattest control on screen. */
  it('TButton paints with the same tokens the chips do', () => {
    const face = KIT_CODE.match(/btnFace:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(face).toContain('T.controlFaceLit');
    expect(face).toContain('T.controlSidewall');
  });

  /** ⚠⚠⚠ THE STRUCTURAL FRAME STAYS FLAT. Owner: *"A frame may become easier to
   *  see. It may not become a button."* This is the boundary the whole phase
   *  could most easily have destroyed by making everything louder. */
  it('the read-only frame took none of it', () => {
    const frame = flat(tartariaKitStyles.panelFrame);
    expect(Object.keys(frame).sort()).toEqual(['borderColor', 'borderRadius', 'borderWidth']);
    expect(frame.borderColor).toBe(T.panelRim);
    for (const line of EXPLORATION.split('\n')) {
      if (!line.includes('panelFrame')) continue;
      expect(line).not.toMatch(/controlPlane|chassisPlane|boardLift|tControlDepth/);
    }
  });

  /** ⚠ AND THE INPUT WELL IS NOT A KEY. A recess must never acquire a sidewall:
   *  the whole point is that it is cut INTO the surface, not standing on it. */
  it('the recess took no raised plane', () => {
    const recess = flat(tartariaKitStyles.recess);
    expect(recess.backgroundColor).toBe(T.glass);
    for (const banned of ['elevation', 'shadowColor', 'transform']) {
      expect(recess).not.toHaveProperty(banned);
    }
    expect(KIT_CODE).not.toMatch(/recess:\s*\{[^}]*controlSidewall/);
  });

  it('the kit export budget did not move', () => {
    const decls = [...KIT.matchAll(/^export (function|const) (\w+)/gm)];
    const components = decls.filter((m) => m[1] === 'function' && /^T[A-Z]/.test(m[2] ?? ''));
    expect(components.length).toBe(13);
    expect(decls.length - components.length).toBe(10);
    expect(decls.length).toBe(23);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   6. NOTHING BEHAVIOURAL MOVED
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 2 — gesture ownership, accessibility and the smallest phone', () => {
  /* ⚠⚠⚠ THE arb146 FIREWALL. OTA-1514 records what happens when this inverts:
   * a parent Touchable wins the responder on every vertical drag and the enemy
   * card is capped with no way to scroll. Phase 2 adds another child to that
   * Touchable, so the shape is re-asserted rather than assumed. */
  it('the enemy chain is still ScrollView → Touchable → card', () => {
    const wrap = /const scrollWrap = \([\s\S]*?\n  \);/.exec(ENEMY_PANEL)?.[0] ?? '';
    expect(wrap).not.toBe('');
    const iScroll = wrap.indexOf('<ScrollView');
    const iTouch = wrap.indexOf('<TouchableOpacity');
    expect(iTouch).toBeGreaterThan(iScroll);
    expect(iTouch).toBeLessThan(wrap.indexOf('</ScrollView>'));
    expect(ENEMY_PANEL).toMatch(/snapToInterval=\{cardWidth\}/);
  });

  it('the whole player panel is still the one touch owner', () => {
    expect(EXPLORATION).toMatch(
      /<TouchableOpacity[\s\S]{0,400}?accessibilityLabel="Open player sheet"[\s\S]{0,400}?<StatsPanel/,
    );
    for (const banned of ['onPress', 'TouchableOpacity', 'Pressable', 'accessibilityRole']) {
      expect(STATS_PANEL).not.toContain(banned);
    }
  });

  /** ⚠ EVERY PLANE THE PHASE ADDS IS INERT. One touchable child anywhere in this
   *  set would silently eat a tap from the control it decorates. */
  it('every plane rendered anywhere is pointerEvents none', () => {
    for (const src of [INPUT_BOX, KB_BAR, ENEMY_PANEL, STATS_PANEL, EXPLORATION, KIT_CODE]) {
      const planes = src.match(/<View style=\{[^}]*Plane\w*\}[^/]*\/>/g) ?? [];
      for (const p of planes) expect(p).toContain('pointerEvents="none"');
    }
  });

  it('the inputs keep every behavioural contract', () => {
    for (const src of [INPUT_BOX, KB_BAR]) {
      expect(src).toMatch(/useGameStore\(\(s\)\s*=>\s*s\.explorationDraft\)/);
      for (const prop of ['multiline', 'blurOnSubmit', 'scrollEnabled', 'onSubmitEditing']) {
        expect(src).toContain(prop);
      }
    }
    const wrap = /inputWrap:\s*\{[^}]*\}/.exec(INPUT_BOX)?.[0] ?? '';
    expect(wrap).not.toContain('overflow');
  });

  /** ⚠⚠ 320×568 — the phase's whole technique is paint inside an existing box,
   *  so every load-bearing number should be exactly where it was. The one place
   *  a border DID change is the active tab, and it repays the pixel. */
  it('no governed surface grew: the tab repays its opened border out of padding', () => {
    const chip = /\btabChip:\s*\{[^}]*\}/.exec(KIT_CODE)?.[0] ?? '';
    const on = /\btabChipOn:\s*\{[^}]*\}/.exec(KIT_CODE)?.[0] ?? '';
    const padMatch = /paddingVertical:\s*(\d+)/.exec(chip);
    expect(padMatch).not.toBeNull();
    const pad = Number(padMatch![1]);
    expect(on).toMatch(/borderBottomWidth:\s*0/);
    // 1dp of border removed, 1dp of padding given back → same outer height.
    expect(on).toMatch(new RegExp(`paddingBottom:\\s*${String(pad + 1)}`));
  });

  it('the Exploration layout contracts are untouched', () => {
    expect(EXPLORATION).toMatch(/feed:\s*\{\s*flex:\s*1,\s*flexShrink:\s*1,\s*minHeight:\s*0\s*\}/);
    expect(EXPLORATION).toMatch(/minHeight:\s*34/);
    expect(EXPLORATION).toMatch(/flexBasis:\s*'47%'/);
    const quick = /\bquick:\s*\{[^}]*\}/.exec(INPUT_BOX)?.[0] ?? '';
    expect(quick).toMatch(/paddingHorizontal:\s*10/);
    expect(quick).toMatch(/paddingVertical:\s*6/);
    expect(quick).toMatch(/overflow:\s*'hidden'/);
  });

  /** ⚠⚠⚠ THE SEMANTIC FREEZE. This phase is paint. If it ever reaches the engine,
   *  the native bridge or the freeze instrumentation, that is a defect by
   *  definition — those surfaces are under active investigation and must stay
   *  separable from a visual pass. */
  it('the phase touches no engine, native-ML or freeze-investigation module', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (/(controlPlane|chassisPlane|boardLift|tabMouth|tabPlane)/.test(codeOf(fs.readFileSync(p, 'utf8')))) {
          offenders.push(path.relative(ROOT, p).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    for (const f of offenders) {
      expect(f).not.toMatch(/^app\/(engine|native|state\/gameStore|diagnostics)\//);
    }
    // The whole adoption is UI, and small enough to name.
    expect(offenders.sort()).toEqual([
      'app/components/EnemyPanel.tsx',
      'app/components/InputBox.tsx',
      'app/components/KeyboardInputBar.tsx',
      'app/components/StatsPanel.tsx',
      'app/screens/ExplorationScreen.tsx',
      'app/ui/tartariaKit.tsx',
    ]);
  });
});
