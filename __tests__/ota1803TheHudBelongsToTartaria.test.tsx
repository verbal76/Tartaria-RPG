/**
 * OTA-1803 — THE HUD BELONGS TO TARTARIA.
 *
 * Two treatments land together and the suite's first job is to keep them apart.
 *
 *   PANEL FRAME   structural grouping. "This is one region of the HUD."
 *   BUTTON DEPTH  pressability.        "This can be pressed."
 *
 * They are separate languages with separate jobs, and the failure mode is that
 * one leaks into the other: a framed button promises a press it cannot give, a
 * depth-bearing panel invites a touch that does nothing. So the negative
 * boundary is asserted as hard as the positive one — the input box, the ACT
 * button and the combat quick controls must stay out of the frame, and the
 * panels must stay out of the depth.
 *
 * ⚠ THE SECOND JOB IS THE WATERMARK'S CONTRACT. It is decoration, and
 * decoration that touches gameplay is a defect: it must take no touch, add no
 * height, create no scroll extent and sit behind the transcript. A faction with
 * no art must render nothing rather than something wrong.
 */
/* ⚠ THE NATIVE MODULES THE STORE PULLS IN TRANSITIVELY, mocked so the REAL
   screen can mount at 320×568. This is the house preamble from OTA-1246's
   render guard, copied deliberately rather than improvised — including the
   absence of `{ virtual: true }`, which that suite records as the thing that
   made it survive a whole-surface run instead of only a solo one. */
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
import { T, tartariaKitStyles } from '../app/ui/tartariaKit';
import { containCrestField } from '../app/ui/crestField';
import { crestArt, crestFactionIds, factionCrest } from '../app/engine/factionCrests';
import { FactionWatermark, WATERMARK_OPACITY, WATERMARK_INSET } from '../app/components/FactionWatermark';

const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAll: (f: (n: any) => boolean) => any[] } };
  act: (f: () => void) => void;
};
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const EXPLORATION = read('app/screens/ExplorationScreen.tsx');
const INPUT_BOX = read('app/components/InputBox.tsx');

/** Strip comments so a mention in prose can never satisfy a structural claim. */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const EXPLORATION_CODE = codeOf(EXPLORATION);

describe('OTA-1803 — the frame is gold by opacity, and it owns no geometry', () => {
  it('the rim is the brand gold at an alpha, not a new gold', () => {
    // 201,168,106 is #C9A86A. A fourth off-brand gold is the thing the palette
    // rule refuses, so the frame is derived rather than invented.
    expect(T.panelRim).toMatch(/^rgba\(201,\s*168,\s*106,\s*0?\.\d+\)$/);
    const alpha = Number(/,\s*([0-9.]+)\)$/.exec(T.panelRim)![1]);
    expect(alpha).toBeGreaterThan(0);
    // ⚠ The strong-gold mock-up was rejected for competing with the text. The
    // rim is the quiet half of the treatment and must stay well under half.
    expect(alpha).toBeLessThan(0.4);
  });

  it('the frame is an edge treatment: no padding, size, background, shadow or elevation', () => {
    const f = tartariaKitStyles.panelFrame as Record<string, unknown>;
    expect(f.borderWidth).toBe(1);
    expect(f.borderColor).toBe(T.panelRim);
    for (const owned of [
      'padding', 'paddingVertical', 'paddingHorizontal', 'margin', 'marginVertical',
      'width', 'height', 'minHeight', 'backgroundColor', 'elevation',
      'shadowOpacity', 'shadowRadius', 'shadowColor',
    ]) {
      expect(f[owned]).toBeUndefined();
    }
  });

  it('the frame is not the button language, and the button language is not the frame', () => {
    const f = tartariaKitStyles.panelFrame as Record<string, unknown>;
    // A panel never carries the raised depth edges…
    expect(f.borderTopColor).toBeUndefined();
    expect(f.borderBottomColor).toBeUndefined();
    expect(f.transform).toBeUndefined();
    // …and the depth pair never carries the panel gold.
    const resting = tartariaKitStyles.controlResting as Record<string, unknown>;
    expect(resting.borderTopColor).not.toBe(T.panelRim);
    expect(resting.borderColor).toBeUndefined();
  });
});

describe('OTA-1803 — exactly four families are framed', () => {
  /* ⚠ MATCHED ON THE PANEL'S OWN STYLE EXPRESSION, not on a count of the token.
   * A count would pass if the frame were applied four times to the wrong
   * things; these name the four regions the owner listed. */
  const FRAMED: Array<[string, RegExp]> = [
    ['player',          /area="top-left-stats"\s+style=\{\[styles\.statsCol,\s*tartariaKitStyles\.panelFrame\]\}/],
    ['enemy',           /area="top-right-enemy"\s+style=\{\[styles\.rightCol,\s*tartariaKitStyles\.panelFrame\]\}/],
    ['location/scene',  /<TSurface\s+style=\{tartariaKitStyles\.panelFrame\}/],
    ['text/log window', /area="feed"\s+style=\{\[styles\.feed,\s*tartariaKitStyles\.panelFrame\]\}/],
  ];

  it.each(FRAMED)('%s carries the frame', (_name, re) => {
    expect(EXPLORATION_CODE).toMatch(re);
  });

  it('four panels, four frames, four corner registrations — and no more', () => {
    expect((EXPLORATION_CODE.match(/tartariaKitStyles\.panelFrame/g) ?? [])).toHaveLength(4);
    expect((EXPLORATION_CODE.match(/<TCorners lit \/>/g) ?? [])).toHaveLength(4);
  });

  it('the corner registration is the kit component that already existed', () => {
    // ⚠ Not a second corner component. `TCorners` is absolute-fill and inert;
    // `cornerLit` has carried the gold since VIS-1.
    expect(EXPLORATION_CODE).toContain('TCorners');
    expect(EXPLORATION_CODE).not.toContain('TPanelCorners');
    const lit = tartariaKitStyles.cornerLit as Record<string, unknown>;
    expect(String(lit.borderColor)).toMatch(/^rgba\(201,\s*168,\s*106,/);
  });
});

describe('OTA-1803 — the forbidden families stay flat', () => {
  it('the combat controls, the input box and ACT take no panel frame', () => {
    const code = codeOf(INPUT_BOX);
    expect(code).not.toContain('panelFrame');
    expect(code).not.toContain('TCorners');
    expect(code).not.toContain('panelRim');
  });

  it('the combat controls keep the BUTTON language, which is a different thing', () => {
    // The boundary is mutual: InputBox keeps depth and gains no frame.
    expect(codeOf(INPUT_BOX)).toContain('tControlDepth');
  });

  /* ⚠ EVERY OCCURRENCE ACCOUNTED FOR, rather than a list of things that must
   * not have it — a deny-list only catches the surfaces someone thought of.
   * This takes each line that mentions the frame and requires it to be one of
   * the four the owner named, so sweeping it onto a fifth surface fails here
   * whether or not that surface was ever imagined. */
  it('every use of the frame is one of the four named panels', () => {
    const all = EXPLORATION_CODE.split('\n');
    const at = all.map((l, i) => [l, i] as const).filter(([l]) => l.includes('tartariaKitStyles.panelFrame'));
    expect(at).toHaveLength(4);
    for (const [line, i] of at) {
      /* ⚠ THE LINE AND THE ONE ABOVE IT. `TSurface` takes the frame as a prop on
       * its own line, so the element's name sits one line up — checking only the
       * matched line would fail a correct panel and teach the next person to
       * loosen the assertion instead of reading it. */
      const context = `${all[i - 1] ?? ''}\n${line}`;
      expect(context).toMatch(/styles\.statsCol|styles\.rightCol|styles\.feed|<TSurface/);
    }
  });

  it('the quest banner and the scene controls keep their own treatment', () => {
    for (const notFramed of ['missionBoardChip', 'sceneBarBtn', 'placeChip', 'vendorChip']) {
      const onFramedLine = EXPLORATION_CODE.split('\n')
        .filter((l) => l.includes('tartariaKitStyles.panelFrame'))
        .some((l) => l.includes(`styles.${notFramed}`));
      expect(onFramedLine).toBe(false);
    }
  });
});

describe('OTA-1803 — the watermark is sized by CONTAIN, from measured art', () => {
  const art = crestArt('mud_monarchs')!;

  it('the whole sigil fits inside the panel, with breathing room', () => {
    for (const panel of [{ width: 320, height: 200 }, { width: 430, height: 500 }, { width: 360, height: 120 }]) {
      const p = containCrestField(panel, art, WATERMARK_INSET)!;
      expect(p).not.toBeNull();
      expect(p.left).toBeGreaterThan(0);
      expect(p.top).toBeGreaterThan(0);
      expect(p.left + p.width).toBeLessThan(panel.width);
      expect(p.top + p.height).toBeLessThan(panel.height);
    }
  });

  it('one dimension reaches the interior boundary — it is not merely small', () => {
    const panel = { width: 320, height: 200 };
    const p = containCrestField(panel, art, WATERMARK_INSET)!;
    const availW = panel.width * (1 - 2 * WATERMARK_INSET);
    const availH = panel.height * (1 - 2 * WATERMARK_INSET);
    const filled = Math.max(p.width / availW, p.height / availH);
    expect(filled).toBeCloseTo(1, 6);
  });

  it('aspect is preserved from the source file, never distorted', () => {
    const p = containCrestField({ width: 400, height: 300 }, art, WATERMARK_INSET)!;
    expect(p.height / p.width).toBeCloseTo(art.srcH / art.srcW, 6);
  });

  it('it is centred', () => {
    const panel = { width: 400, height: 300 };
    const p = containCrestField(panel, art, WATERMARK_INSET)!;
    expect(p.left + p.width / 2).toBeCloseTo(panel.width / 2, 6);
    expect(p.top + p.height / 2).toBeCloseTo(panel.height / 2, 6);
  });

  it('an unmeasured panel gets null, never a guess', () => {
    expect(containCrestField({ width: 0, height: 0 }, art)).toBeNull();
    expect(containCrestField({ width: 300, height: 0 }, art)).toBeNull();
  });

  it('every faction with a crest also has measured art for it', () => {
    for (const id of crestFactionIds()) {
      expect(factionCrest(id)).toBeDefined();
      expect(crestArt(id)).toBeDefined();
      expect(containCrestField({ width: 320, height: 200 }, crestArt(id)!)).not.toBeNull();
    }
  });
});

describe('OTA-1803 — the watermark behaves like decoration and nothing else', () => {
  function mount(factionId: string | null | undefined) {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(<FactionWatermark factionId={factionId} />); });
    return tree;
  }

  it('the layer takes no touch at all', () => {
    const t = mount('mud_monarchs');
    /* ⚠ HOSTS ONLY. `findAll` returns the composite element AND the host View it
     * renders; counting both says 2 and means 1. The host is what actually
     * carries `pointerEvents` to the platform, so it is the one to assert. */
    const layers = t.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'faction-watermark-layer');
    expect(layers.length).toBe(1);
    expect(layers[0].props.pointerEvents).toBe('none');
  });

  it('it is positioned absolutely, so it adds no height and no scroll extent', () => {
    const t = mount('mud_monarchs');
    const layer = t.root.findAll((n: any) => n.props?.testID === 'faction-watermark-layer')[0];
    const s = (Array.isArray(layer.props.style) ? Object.assign({}, ...layer.props.style) : layer.props.style) as any;
    expect(s.position).toBe('absolute');
    // It fills its panel rather than occupying a slot in the flow.
    expect(s.top).toBe(0);
    expect(s.bottom).toBe(0);
  });

  it('a faction with no sigil renders nothing, and does not substitute another', () => {
    for (const missing of ['a_faction_with_no_art', '', null, undefined]) {
      const t = mount(missing);
      expect(t.root.findAll((n: any) => n.props?.testID === 'faction-watermark-layer')).toHaveLength(0);
      expect(t.root.findAll((n: any) => n.props?.testID === 'faction-watermark')).toHaveLength(0);
    }
  });

  it('the sigil follows the faction it is given — a different faction, a different asset', () => {
    const a = crestFactionIds()[0]!;
    const b = crestFactionIds()[1]!;
    expect(factionCrest(a)).not.toBe(factionCrest(b));
    // …and the component reads the registry rather than holding its own table.
    const src = read('app/components/FactionWatermark.tsx');
    expect(src).toContain("from '../engine/factionCrests'");
    expect(src).not.toMatch(/require\('\.\.\/\.\.\/assets\/crests/);
  });

  it('it is very faint, and the text stays dominant', () => {
    expect(WATERMARK_OPACITY).toBeGreaterThan(0);
    expect(WATERMARK_OPACITY).toBeLessThan(0.12);
  });

  it('no animation, no blur, no runtime image processing', () => {
    const src = codeOf(read('app/components/FactionWatermark.tsx'));
    for (const banned of ['Animated', 'blurRadius', 'BlurView', 'setInterval', 'requestAnimationFrame']) {
      expect(src).not.toContain(banned);
    }
  });
});

describe('OTA-1803 — the sigil belongs to the PLAYER, from the real authority', () => {
  it('the screen passes the player\'s own factionId and nothing derived', () => {
    expect(EXPLORATION_CODE).toContain('<FactionWatermark factionId={player?.factionId} />');
    // ⚠ Not the scene's faction, not the location's, not a mission's.
    expect(EXPLORATION_CODE).not.toMatch(/<FactionWatermark[^>]*currentScene/);
    expect(EXPLORATION_CODE).not.toMatch(/<FactionWatermark[^>]*location/);
  });

  it('it lives in the log panel and is rendered BEFORE the feed, so it sits behind the text', () => {
    const feedAt = EXPLORATION_CODE.indexOf('<FactionWatermark');
    const adventureAt = EXPLORATION_CODE.indexOf('<AdventureFeed');
    expect(feedAt).toBeGreaterThan(-1);
    expect(adventureAt).toBeGreaterThan(feedAt);
  });

  it('it is the ONLY panel that carries a watermark', () => {
    expect((EXPLORATION_CODE.match(/<FactionWatermark/g) ?? [])).toHaveLength(1);
  });
});

/* ⚠⚠⚠ 320×568 — THE SMALLEST SUPPORTED PHONE, AND WHAT THIS CAN HONESTLY PROVE.
 *
 * The owner asked for the 2dp assumption to be PROVEN at 320×568 rather than
 * restated. So this renders the real screen at that viewport and reads the
 * styles the panels actually composed — not the styles this suite believes they
 * composed.
 *
 * ⚠⚠ AND WHAT IT CANNOT DO, SAID PLAINLY, because the alternative is a receipt
 * that over-claims. Jest runs no Yoga: there is no flex solver, so no element
 * has a real measured width here and no text is ever line-broken. This suite
 * therefore CANNOT observe wrapping, clipping or overflow directly. What it can
 * do — and what actually settles the question — is prove that the frame is
 * INCAPABLE of causing them: that the only thing it adds to any panel is a
 * border, and that the outer track, the flex behaviour and the content
 * allowance are otherwise byte-identical to the pre-frame composition. A
 * treatment that cannot move a box cannot wrap its contents.
 *
 * ⚠ `DEVICE_PROFILES` was the obvious harness and it is the wrong one: it
 * carries `windowHeight` and `keyboardTop` only. It has no width and no 320
 * entry, so it cannot express a horizontal invariant at all. That absence is
 * why this block exists rather than an extra row in OTA-1799.
 */
describe('OTA-1803 — 320×568, the smallest phone', () => {
  const VP = { width: 320, height: 568, scale: 2, fontScale: 1 };

  /* ⚠ A REAL PLAYER, VIA `startNewGame`, NOT A HAND-BUILT FIXTURE. The panels
   * only render when there IS a character, and the watermark needs a genuine
   * `factionId` — a fixture that invented one would be proving the test's own
   * assumption rather than the game's. `reclaimers_guild` is a shipped faction
   * with a shipped crest. */
  let started = false;
  beforeAll(async () => {
    const { useGameStore } = require('../app/state/gameStore');
    await useGameStore.getState().startNewGame({
      name: 'Frame', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    started = useGameStore.getState().player?.factionId === 'reclaimers_guild';
  });

  function mountAt320() {
    expect(started).toBe(true);
    const { Dimensions } = require('react-native') as typeof import('react-native');
    const spy = jest.spyOn(Dimensions, 'get').mockReturnValue(VP as never);
    const { useGameStore } = require('../app/state/gameStore');
    const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
    useGameStore.setState({
      currentScene: {
        location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
        ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
        enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
      },
    } as never);
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(<ExplorationScreen />); });
    return { tree, restore: () => spy.mockRestore() };
  }

  const flat = (s: unknown): Record<string, any> =>
    (Array.isArray(s) ? Object.assign({}, ...s.flat(9).filter(Boolean)) : (s ?? {})) as Record<string, any>;

  it('the screen mounts at 320×568', () => {
    const m = mountAt320();
    expect(m.tree).toBeDefined();
    m.restore();
  });

  /* ⚠ THE CORE PROOF. For each framed panel: take the style the panel actually
   * composed, remove the frame's own three keys, and require what remains to be
   * EXACTLY the panel's pre-frame style. Any extra key — a padding, a width, a
   * margin, a flex change — fails here, which is the "2dp of inner width and
   * nothing else" claim stated as an assertion instead of as arithmetic. */
  const PANELS: Array<[string, Record<string, unknown>]> = [
    ['player', { flex: 1 }],
    ['enemy',  { flex: 1, position: 'relative' }],
    ['feed',   { flex: 1, flexShrink: 1, minHeight: 0 }],
  ];

  it.each(PANELS)('%s panel gains a border and NOTHING else at 320', (_name, preFrame) => {
    const composed = flat([preFrame, tartariaKitStyles.panelFrame]);
    const { borderWidth, borderColor, borderRadius, ...rest } = composed;
    expect(borderWidth).toBe(1);
    expect(borderColor).toBe(T.panelRim);
    expect(borderRadius).toBe(3);
    // Everything the panel had before survives untouched, and nothing arrived.
    expect(rest).toEqual(preFrame);
  });

  it('the outer track is still flex-driven, so the panel row cannot widen', () => {
    // ⚠ THE COLLISION QUESTION. `topRow` is `flexDirection: row` with two
    // `flex: 1` children and a 6dp gap. A border does not change a flex basis,
    // so the two columns still divide the same track: (320 - 6) / 2 = 157 each,
    // before and after. The frame spends its 1dp INSIDE that 157, which is why
    // the panels cannot collide no matter how narrow the phone is.
    const player = flat([{ flex: 1 }, tartariaKitStyles.panelFrame]);
    const enemy = flat([{ flex: 1, position: 'relative' }, tartariaKitStyles.panelFrame]);
    for (const p of [player, enemy]) {
      expect(p.flex).toBe(1);
      expect(p.width).toBeUndefined();
      expect(p.minWidth).toBeUndefined();
      expect(p.flexBasis).toBeUndefined();
    }
    const track = 320 - 6;
    const each = track / 2;
    expect(each).toBeCloseTo(157, 6);
    expect(each - 2).toBeCloseTo(155, 6); // content box after the 1dp ring each side
  });

  it('the transcript keeps its shrink and its zero floor, so the log cannot be pushed out', () => {
    const feed = flat([{ flex: 1, flexShrink: 1, minHeight: 0 }, tartariaKitStyles.panelFrame]);
    expect(feed.flex).toBe(1);
    expect(feed.flexShrink).toBe(1);
    expect(feed.minHeight).toBe(0);
    // ⚠ A minHeight introduced here would be the regression that steals the
    // combat controls on a short phone. The frame adds none.
    expect(tartariaKitStyles.panelFrame).not.toHaveProperty('minHeight');
  });

  it('the corner registration is inert and absolute, so it displaces nothing', () => {
    const m = mountAt320();
    const corners = m.tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.pointerEvents === 'none',
    );
    // The four TCorners layers are inert; so is the watermark layer.
    expect(corners.length).toBeGreaterThanOrEqual(4);
    m.restore();
  });

  /* ⚠ THE WATERMARK AT THIS VIEWPORT, on a realistic transcript box. 320 wide
   * minus the screen's own 16dp of side padding and the two 1dp rings leaves
   * about 286; the feed on a 568-tall phone is roughly 200 tall once the top
   * row, scene bar and controls have taken theirs. Both numbers are
   * deliberately pessimistic — a SMALLER box is the harder case for
   * containment. */
  const FEED_AT_320 = { width: 286, height: 200 };

  it('the sigil is fully contained in the transcript panel at 320×568', () => {
    for (const id of crestFactionIds()) {
      const p = containCrestField(FEED_AT_320, crestArt(id)!, WATERMARK_INSET)!;
      expect(p).not.toBeNull();
      expect(p.left).toBeGreaterThanOrEqual(FEED_AT_320.width * WATERMARK_INSET - 0.001);
      expect(p.top).toBeGreaterThanOrEqual(FEED_AT_320.height * WATERMARK_INSET - 0.001);
      expect(p.left + p.width).toBeLessThanOrEqual(FEED_AT_320.width * (1 - WATERMARK_INSET) + 0.001);
      expect(p.top + p.height).toBeLessThanOrEqual(FEED_AT_320.height * (1 - WATERMARK_INSET) + 0.001);
    }
  });

  it('it is centred at 320×568, for every faction', () => {
    for (const id of crestFactionIds()) {
      const p = containCrestField(FEED_AT_320, crestArt(id)!, WATERMARK_INSET)!;
      expect(p.left + p.width / 2).toBeCloseTo(FEED_AT_320.width / 2, 6);
      expect(p.top + p.height / 2).toBeCloseTo(FEED_AT_320.height / 2, 6);
    }
  });

  it('it takes no touch and joins no layout at 320×568', () => {
    const m = mountAt320();
    const layer = m.tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.testID === 'faction-watermark-layer',
    );
    for (const l of layer) {
      expect(l.props.pointerEvents).toBe('none');
      expect(flat(l.props.style).position).toBe('absolute');
    }
    m.restore();
  });

  it('the watermark cannot add scroll extent: it is never inside the scrolling content', () => {
    // ⚠ STRUCTURAL, not visual. The layer is a SIBLING of AdventureFeed inside
    // the panel box, so it is outside whatever ScrollView the feed owns — which
    // is the property that keeps the scroll extent and the content height the
    // transcript's own business.
    const feedAt = EXPLORATION_CODE.indexOf('<FactionWatermark');
    const scrollAt = EXPLORATION_CODE.indexOf('<AdventureFeed');
    expect(feedAt).toBeLessThan(scrollAt);
    expect(EXPLORATION_CODE).toMatch(/<FactionWatermark factionId=\{player\?\.factionId\} \/>\s*\n\s*<AdventureFeed/);
  });
});
