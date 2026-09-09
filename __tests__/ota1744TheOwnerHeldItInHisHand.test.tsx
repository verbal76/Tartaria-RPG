/**
 * OTA-1744 — THE OWNER HELD IT IN HIS HAND (task VIS-1-PHONE-FIX-4D8A).
 *
 * Visual #1 shipped, and then it met a Pixel 10 Pro XL. Everything in this
 * suite is a correction to something the PHONE said, not something a plan said:
 *
 *  1. DOUBLE SCROLL. *"When the character roster is scrolled, the whole lower
 *     portion of the screen moves with it."* It did — NEW TARTARIAN and the OTA
 *     button were the FlatList's `ListFooterComponent` and the roster label was
 *     its `ListHeaderComponent`, so the actions were scroll CONTENT. One scroll
 *     region now, and nothing nested inside it.
 *  2. THE EMBLEM WAS A THUMBNAIL. 58pt on a phone made the one thing expanding
 *     a record exists to reveal unreadable. 96pt, same canonical art, same
 *     `contain` fit.
 *  3. THE BLACK LINE above every dossier's gold rim. TWO causes, both real:
 *     `TSettle` rested an INACTIVE card at the START of its own entrance
 *     (translateY 4, scale 0.994, permanently), leaving a strip of the
 *     shadow-casting parent uncovered above it; and Android's `elevation` paints
 *     its shadow on every side including the top, ignoring `shadowOffset`.
 *  4. THE UTILITY SEDIMENT. RESTORE FROM BACKUP, INVITE PLAYTESTER and REPORT
 *     BUG moved to Settings; EXIT GAME was deleted, because on Android it only
 *     backgrounds the app. The recovered space goes to the roster, not to
 *     something new.
 *  5. RECOVERED TECHNOLOGY, NOT BRONZE. Structural rims went to cool machined
 *     alloy; the brand gold is now spent only where something is selected or
 *     asked for.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { TitleScreen } from '../app/screens/TitleScreen';
import { factionCrest, crestFactionIds } from '../app/engine/factionCrests';
import { FACTION_PLATE_TEST_ID } from '../app/ui/tartariaKit';
import type { SlotSummary } from '../app/engine/saveSystem';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(180000);
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const ABOUT = read('app', 'screens', 'AboutScreen.tsx');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const S = () => useGameStore.getState();
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const allText = (t: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }): string =>
  t.root.findAll(() => true).map(textOf).join('\n');

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* already gone */ } });
  }
});

const slot = (over: Partial<SlotSummary> = {}): SlotSummary => ({
  slotId: 'slot-a', playerName: 'Corvin', raceId: getRaces()[0]!.id,
  locationId: 'ashen_hollow', hp: 22, hpMax: 30,
  savedAt: Date.now() - 60_000, createdAt: Date.now() - 600_000,
  factionId: getFactions()[0]!.id, resurrectionGems: 0, ...over,
} as SlotSummary);

const roster = (n: number): SlotSummary[] =>
  Array.from({ length: n }, (_, i) => slot({
    slotId: `slot-${i}`,
    playerName: `Tartarian ${i + 1}`,
    factionId: getFactions()[i % getFactions().length]!.id,
  }));

async function mountTitle(slots: SlotSummary[], gems = 0) {
  useGameStore.setState({
    slots, resurrectionGems: gems, crashedSlotIds: [],
    otaBootResolved: true, cognitiveStatus: 'ready',
  });
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TitleScreen />); });
  await flush();
  useGameStore.setState({ slots, otaBootResolved: true, cognitiveStatus: 'ready' });
  await flush();
  mounted.push(tree);
  return tree;
}

const pressablesSaying = (tree: ReturnType<typeof renderer.create>, label: string): TestNode[] =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(label));

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1744 — 1. only the roster scrolls', () => {
  it('⚠⚠⚠ the actions and the roster heading are NOT list content any more', () => {
    // This is the whole defect: anything handed to a FlatList as header or
    // footer travels with the scroll. Both are now siblings of the list.
    // ⚠ The PROP, not the word — the note recording why both went names them.
    expect(TITLE).not.toContain('ListFooterComponent={');
    expect(TITLE).not.toContain('ListHeaderComponent={');
    const list = TITLE.indexOf('<FlatList');
    const heading = TITLE.indexOf('<View style={styles.rosterHeader}>');
    const actions = TITLE.indexOf('<View style={styles.footerActions}>');
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(list);   // heading fixed, above the list
    expect(actions).toBeGreaterThan(list); // actions fixed, below it
  });

  it('⚠⚠⚠ there is exactly ONE vertical scroller on the screen, and it is the roster', async () => {
    // "Avoid competing nested vertical ScrollViews." Measured on the rendered
    // tree, not read off the source: a second scroller is what produced the
    // page-scroll feel, and a nested one would produce a worse version of it.
    const tree = await mountTitle(roster(12));
    const scrollers = tree.root.findAll((n) =>
      typeof n.type === 'string'
      && /ScrollView/i.test(String(n.type))
      && n.props.horizontal !== true);
    expect(scrollers.length).toBe(1);
    // …and it holds the records, not the buttons.
    expect(allText(tree)).toContain('Tartarian 1');
  });

  it('⚠⚠ the list is given room to scroll rather than growing to fit', () => {
    // `flex: 1` on the list is what makes the roster the part that runs out of
    // space; without it a long roster pushes the actions off the bottom, which
    // is the same complaint in a different shape.
    expect(TITLE).toContain('list: { flex: 1 }');
  });

  it('⚠ the roster heading and its swipe hint survive, and only show with a roster', async () => {
    const withRoster = await mountTitle(roster(3));
    expect(allText(withRoster)).toContain('YOUR TARTARIANS');
    expect(allText(withRoster)).toContain('swipe left to delete');
    const empty = await mountTitle([]);
    expect(allText(empty)).not.toContain('YOUR TARTARIANS');
    expect(allText(empty)).toContain('No Tartarians yet');
    // The primary action is there whether or not anyone has played.
    expect(allText(empty)).toContain('NEW TARTARIAN');
  });

  it('⚠⚠ 0, 1, 3 and many characters all reach the same two fixed actions', async () => {
    for (const n of [0, 1, 3, 12]) {
      // eslint-disable-next-line no-await-in-loop
      const tree = await mountTitle(roster(n));
      const text = allText(tree);
      expect({ n, newBtn: text.includes('NEW TARTARIAN') }).toEqual({ n, newBtn: true });
      expect({ n, ota: text.includes('CHECK FOR OTA UPDATE') }).toEqual({ n, ota: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1744 — 2. the emblem is legible', () => {
  it('⚠⚠⚠ materially larger, and still the canonical art', () => {
    expect(TITLE).toContain('<TFactionPlate source={crest} size={96} />');
    // 58 → 96 is +65% across and ~2.7x the area. The rule the art itself
    // imposes is unchanged: the source PNGs are not square, so `contain`.
    expect(KIT).toContain('resizeMode="contain"');
    expect(KIT).toContain('source, size = 96, style,');
  });

  it('⚠⚠ every faction still resolves to its own file — checked across all of them', () => {
    const ids = getFactions().map((f) => f.id);
    expect(ids.length).toBeGreaterThanOrEqual(9);
    const seen = new Set<number>();
    for (const id of ids) {
      const c = factionCrest(id);
      expect({ id, hasArt: c !== undefined }).toEqual({ id, hasArt: true });
      seen.add(c as number);
    }
    // Distinct art per faction — a bigger plate showing the same picture nine
    // times would be a worse bug than a small one.
    expect(seen.size).toBe(ids.length);
    expect(crestFactionIds().length).toBeGreaterThanOrEqual(ids.length);
  });

  it('⚠⚠ several different factions each mount their own emblem when expanded', async () => {
    const tree = await mountTitle(roster(4));
    const plates = () => tree.root.findAll((n) =>
      typeof n.type === 'string' && n.props.testID === FACTION_PLATE_TEST_ID);
    expect(plates().length).toBe(0);
    for (const name of ['Tartarian 1', 'Tartarian 2', 'Tartarian 3']) {
      // eslint-disable-next-line no-await-in-loop
      await renderer.act(async () => { (pressablesSaying(tree, name)[0]!.props.onPress as () => void)(); });
      // eslint-disable-next-line no-await-in-loop
      await flush();
      expect({ name, plates: plates().length }).toEqual({ name, plates: 1 });
    }
  });

  it('⚠ and it still cannot cover the record or take a tap', () => {
    // ⚠ Same anchor repair as ota1742: slice on the marker that DEFINES the
    // expanded branch, not on the faction-lookup line that later OTAs rewrote.
    const open = TITLE.slice(TITLE.indexOf('styles.dossierOuterOpen,'), TITLE.indexOf('const styles = StyleSheet.create'));
    expect(open).not.toBe('');
    expect(open).toContain('styles.dossierSplit');
    expect(open).toContain('<View style={styles.dossierSeal} pointerEvents="none">');
    expect(KIT).toContain('pointerEvents="none" testID={FACTION_PLATE_TEST_ID}');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1744 — 3. the black line above the record', () => {
  it('⚠⚠⚠ an INACTIVE settle rests at rest, not parked at the start of its entrance', () => {
    // The cause. `new Animated.Value(active ? 1 : 0)` plus a toValue of 0 meant
    // every collapsed record sat permanently at translateY 4 / scale 0.994,
    // uncovering a strip of its own shadow-casting parent along the top edge.
    const settle = KIT.slice(KIT.indexOf('export function TSettle'), KIT.indexOf('const kit = StyleSheet.create'));
    expect(settle).toContain('const v = useRef(new Animated.Value(1)).current;');
    expect(settle).toContain('if (!active || reduce) { v.setValue(1); return; }');
    expect(settle).toContain('v.setValue(0);');   // the entrance still replays
    expect(settle).toContain('toValue: 1,');
    expect(settle).not.toContain('const to = active ? 1 : 0;');
  });

  it('⚠⚠ and no Android elevation halo is painted above a plate', () => {
    // Android draws the elevation shadow on every side and ignores
    // shadowOffset, so it puts a dark line on top of the gold rim. The iOS
    // shadow props stay: they respect the offset and only fall downward.
    const dossier = TITLE.slice(TITLE.indexOf('dossierOuter: {'), TITLE.indexOf('dossierRim: {'));
    expect(dossier).not.toContain('elevation');
    expect(dossier).toContain('shadowOffset: { width: 0, height: 3 }');
    // The depth it never depended on is still there: the rim is lit on top and
    // near-black at the bottom.
    const rim = TITLE.slice(TITLE.indexOf('dossierRim: {'), TITLE.indexOf('dossierRimOpen:'));
    expect(rim).toContain('borderTopColor: T.rimAlloy');
    expect(rim).toContain('borderBottomColor');
  });

  it('⚠ the settle still runs, and still inside the brief’s window', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SETTLE_MS } = require('../app/ui/tartariaKit') as { SETTLE_MS: number };
    expect(SETTLE_MS).toBeGreaterThanOrEqual(150);
    expect(SETTLE_MS).toBeLessThanOrEqual(220);
    expect(KIT).toContain('useNativeDriver: true');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1744 — 4. the utilities left, the capabilities did not', () => {
  it('⚠⚠⚠ four controls are off the title screen', async () => {
    const tree = await mountTitle(roster(2));
    const text = allText(tree);
    for (const gone of ['RESTORE FROM BACKUP', 'INVITE PLAYTESTER', 'REPORT BUG', 'EXIT GAME']) {
      expect({ gone, still: text.includes(gone) }).toEqual({ gone, still: false });
    }
    // And their apparatus went with them — a dead handler is how a removed
    // button comes back.
    expect(TITLE).not.toContain("from '../components/BugReportModal'");
    expect(TITLE).not.toContain("from '../components/InvitePlaytesterModal'");
    expect(TITLE).not.toContain('BackHandler');
    expect(TITLE).not.toContain('inviteBtn:');
    expect(TITLE).not.toContain('bottomBtnRow:');
  });

  it('⚠⚠⚠ RESTORE and INVITE are reachable in Settings, and REPORT A BUG already was', () => {
    expect(ABOUT).toContain('RESTORE FROM BACKUP (paste a backup first)');
    expect(ABOUT).toContain('INVITE A PLAYTESTER');
    expect(ABOUT).toContain('REPORT A BUG');
    expect(ABOUT).toContain('restoreCharacterFromClipboard');
    expect(ABOUT).toContain('sendPlaytesterInvite');
    // RESTORE sits with its own partner, which is the reason it went there:
    // the button that WRITES a backup, then the button that READS one.
    expect(ABOUT.indexOf("'BACK UP CHARACTER'}"))
      .toBeLessThan(ABOUT.indexOf("'RESTORE FROM BACKUP (paste a backup first)'"));
  });

  it('⚠⚠ EXIT GAME is DELETED, not relocated — it only backgrounded the app', () => {
    for (const src of [TITLE, ABOUT]) {
      expect(src).not.toContain('BackHandler.exitApp');
      expect(src).not.toContain("kind: 'exit'");
    }
  });

  it('⚠⚠⚠ RESTORE still never overwrites — that is the whole rule it carries', () => {
    const helper = read('app', 'ui', 'restoreCharacter.ts');
    expect(helper).toContain('importSaveAsNewSlot');
    // The one call it makes to write is the additive one; nothing in the flow
    // can reach a slot that already exists.
    expect(helper).not.toContain('saveSlot');
    expect(helper).not.toContain('deleteSlot');
    expect(helper).not.toContain('setActiveSlot');
  });

  it('⚠ the recovered space is not refilled', async () => {
    // Owner: *"Do not fill the recovered space with new clutter."* The screen's
    // pressable count below the roster is the primary, the OTA button and the
    // settings gear — nothing else.
    const tree = await mountTitle(roster(2));
    const labels = ['NEW TARTARIAN', 'CHECK FOR OTA UPDATE'];
    for (const l of labels) expect(pressablesSaying(tree, l).length).toBeGreaterThan(0);
    expect(allText(tree)).not.toContain('Thank you for helping us test');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1744 — 5. recovered technology, not bronze', () => {
  it('⚠⚠ the structural rim is cool alloy; the gold is reserved for selection', () => {
    expect(KIT).toContain("rim: '#3C3E3F'");
    expect(KIT).toContain('rimAlloy');
    // The record at rest wears the alloy; the OPEN one keeps the brand gold,
    // which is what makes gold read as "this one is live".
    const rest = TITLE.slice(TITLE.indexOf('dossierRim: {'), TITLE.indexOf('dossierRimOpen:'));
    expect(rest).toContain('T.rimAlloy');
    expect(rest).not.toContain('T.gold');
    expect(TITLE).toContain('dossierRimOpen: { borderColor: T.rimLit');
    expect(TITLE).toContain('spineOpen: { width: 5, backgroundColor: T.gold');
  });

  it('⚠ fine technical engraving: index ticks machined across the spine', () => {
    expect(TITLE).toContain('spineTick:');
    // Static views only — the performance rule from LAG-3 still stands.
    const tick = TITLE.slice(TITLE.indexOf('spineTick:'), TITLE.indexOf('spineTick:') + 220);
    expect(tick).toContain('hairlineWidth');
    expect(tick).not.toContain('Animated');
  });

  it('⚠⚠⚠ and none of it is keyed to the owner’s green — the palette is theme-neutral', () => {
    /* ⚠⚠⚠ RE-POINTED BY OTA-1785 — THIS COPY WAS THE WEAKER ONE, AND THAT IS
     * WHY IT GOES. It restated OTA-1742's palette rule with FOUR exempt names
     * instead of five and NO chroma ceiling, so a colour could pass here and
     * fail there, and which you learned about depended on suite ordering. It
     * also read the kit raw until today, which meant a sentence describing a
     * measurement could fail it.
     * The rule now lives in `scripts/check-kit-palette.mjs` — the STRONGER
     * version, kept whole, and a gate as well as an authority. This suite keeps
     * its own claim, which was never the arithmetic: that the ALLOY SHIFT did
     * not sneak a hue into the kit. It asserts that by holding the gate to the
     * shape it must have, and letting the gate do the counting. */
    const gate = read('scripts', 'check-kit-palette.mjs');
    expect(gate).toContain('export const CHROMA_CEILING = 60');
    expect(gate).toContain('export const NEAR_NEUTRAL = 18');
    expect(gate).toContain('r >= g && g >= b');
    // and it is wired, so it actually runs
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:kitpalette']).toBe('node scripts/check-kit-palette.mjs');
  });

  it('⚠⚠ no new per-frame work, no timers, no polling came in with the correction', () => {
    for (const banned of ['setInterval', 'requestAnimationFrame', 'Animated.loop', 'BlurView', 'LinearGradient']) {
      expect(KIT).not.toContain(banned);
    }
    expect((KIT.match(/Animated\.timing\(/g) ?? []).length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1744 — nothing about playing changed', () => {
  it('⚠⚠⚠ first tap expands, second tap loads, swipe-delete wraps both states', async () => {
    const tree = await mountTitle(roster(3));
    const collapsed = pressablesSaying(tree, 'Tartarian 2')[0]!;
    expect((collapsed.props.accessibilityState as { expanded?: boolean }).expanded).toBe(false);
    await renderer.act(async () => { (collapsed.props.onPress as () => void)(); });
    await flush();
    const open = pressablesSaying(tree, 'Tartarian 2')[0]!;
    expect((open.props.accessibilityState as { expanded?: boolean }).expanded).toBe(true);
    expect(String(open.props.accessibilityHint)).toContain('Loads Tartarian 2');
    expect(allText(tree)).toContain('ENTER TARTARIA');
    const renderItem = TITLE.slice(TITLE.indexOf('const renderItem ='), TITLE.indexOf('  return (\n    <View style={styles.container}>'));
    expect((renderItem.match(/<SwipeableRow onDelete=\{\(\) => confirmDelete\(item\)\}>/g) ?? []).length).toBe(2);
  });

  it('⚠⚠ roster ordering, character information and the gems are untouched', async () => {
    const tree = await mountTitle(roster(3), 2);
    const text = allText(tree);
    expect(text.indexOf('Tartarian 1')).toBeLessThan(text.indexOf('Tartarian 2'));
    expect(text.indexOf('Tartarian 2')).toBeLessThan(text.indexOf('Tartarian 3'));
    expect(text).toContain('RESURRECTION GEMS');
    // The record still carries what it carried.
    await renderer.act(async () => { (pressablesSaying(tree, 'Tartarian 1')[0]!.props.onPress as () => void)(); });
    await flush();
    expect(allText(tree)).toContain('HP 22/30');
  });

  it('⚠ Settings is still one tap from the title, and the build line still reads', async () => {
    const tree = await mountTitle(roster(1));
    expect(TITLE).toContain('accessibilityLabel="Settings"');
    expect(TITLE).toContain("onPress={() => setScreen('about')}");
    expect(allText(tree)).toContain('BUILD');
    expect(allText(tree)).toContain('Year 2148');
  });

  it('⚠⚠⚠ the screen still commits nothing while the player looks at it', async () => {
    // LAG-3's rule, re-measured after the layout change: a fixed footer beside
    // a list must not introduce a render loop.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Profiler } = require('react') as typeof import('react');
    useGameStore.setState({
      slots: roster(6), resurrectionGems: 1, crashedSlotIds: [],
      otaBootResolved: true, cognitiveStatus: 'ready',
    });
    let commits = 0;
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => {
      tree = renderer.create(
        <Profiler id="title" onRender={() => { commits += 1; }}><TitleScreen /></Profiler>,
      );
    });
    await flush();
    mounted.push(tree);
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 6200)); });
    await renderer.act(async () => { useGameStore.setState({ slots: roster(6) }); });
    await flush();
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    const settled = commits;
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(commits - settled).toBe(0);
  });
});
