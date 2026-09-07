/**
 * OTA-1727 - THE WEAPON CARD STOPS CUTTING THE WARNING OFF.
 *
 * Owner: *"Reorganize weapon metadata into three fixed semantic rows. Row 1 =
 * rarity, damage roll, damage type, durability, and on-hit/proc damage. Row 2 =
 * explicit One-handed or Two-handed plus equip state/action. Row 3 = scaling
 * stat followed by resistances/special properties. Remove the existing
 * Hand/Two-handed and equip text from Row 1 so it is not duplicated. Do not fix
 * overflow by reducing font size. Important combat information should not be
 * silently clipped off the right edge."*
 *
 * MEASURED FIRST, AND THE OVERFLOW WAS NOT MARGINAL. Two separate clipping
 * sites, both silent - no ellipsis, no scroll, the text simply is not there:
 *
 *   ROW 1 had `flexDirection: 'row'` with NO flexWrap. React Native defaults a
 *   row to nowrap, so every chip past the right edge was cut. On a 320pt row
 *   (360dp phone less the screen, body and stripe insets): 185 of 301 weapons
 *   overflowed in the plainest case - rarity, damage dice, durability, equip
 *   text - and 301 of 301 once the weapon was coated and reserved. Worst:
 *   Shockwave Club at 402pt bare, 488pt dressed.
 *
 *   ROW 3 was `numberOfLines={1}`. That truncated 138 of 301 weapons, and what
 *   it cut was not decoration:
 *
 *       15 weapons never showed that they cannot be coated
 *        3 never showed a PERMANENT armour/shield unlock
 *        3 never showed a flat on-hit rider
 *        2 never showed the friendly-fire line
 *        1 never showed that it eventually EXPLODES in your hands
 *        1 never showed that it pierces armour
 *
 *   The friendly-fire one is the sharpest. OTA-1565 added that line with the
 *   note that this card "is the only warning a player gets before they buy a
 *   weapon that can kill their own dog" - and then the row cut it off. The Ember
 *   Storm Stave carries four lines of rules and displayed one.
 *
 * THE FIX IS THE LAYOUT, NOT THE TYPE SIZE. Moving the hand and equip chips down
 * to their own row gives Row 1 most of its budget back; flexWrap is what
 * guarantees neither row can ever silently cut again; and Row 3 simply wraps.
 * No font got smaller - the owner ruled that out and this suite pins it.
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import React from 'react';
import { readFileSync } from 'fs';
import { between, expectAbsent } from '../test-utils/srcBlock';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): {
    toJSON(): unknown;
    unmount(): void;
    root: { findAll(p: (n: TestNode) => boolean): TestNode[] };
  };
};
interface TestNode { props: Record<string, unknown>; children: unknown[] }

import { useGameStore } from '../app/state/gameStore';

const SRC = readFileSync(join(__dirname, '..', 'app', 'screens', 'InventoryScreen.tsx'), 'utf8');
jest.setTimeout(120000);

/** Every string rendered anywhere under the tree, flattened. */
function textOf(n: TestNode): string {
  const walk = (x: unknown): string => {
    if (typeof x === 'string') return x;
    if (typeof x === 'number') return String(x);
    if (Array.isArray(x)) return x.map(walk).join('');
    const c = (x as TestNode | null)?.children;
    return c ? walk(c) : '';
  };
  return walk(n.children);
}

const PACK = [
  // a TWO-HANDER, a ONE-HANDER, and the weapon with the most rules in the game
  { id: 'w1', name: 'Stone Spear', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
    durability: { current: 30, max: 40 } },
  { id: 'w2', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
    durability: { current: 12, max: 20 } },
  { id: 'w3', name: 'Ember Storm Stave', kind: 'weapon', rarity: 'Rare', quantity: 1, tags: ['weapon'],
    durability: { current: 40, max: 40 } },
];

const SCENE = {
  location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
  ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
  enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
};

let tree: ReturnType<typeof renderer.create>;
let allText = '';

beforeAll(async () => {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().submitPlayerAction('Walker');
  const base = useGameStore.getState().player;
  useGameStore.setState({
    tutorialStep: null, currentScene: SCENE,
    player: base ? { ...base, inventory: PACK, tc: 500 } : base,
  } as never);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InventoryScreen } = require('../app/screens/InventoryScreen');
  renderer.act(() => { tree = renderer.create(React.createElement(InventoryScreen)); });
  expect(tree.toJSON()).not.toBeUndefined();
  // ⚠ Sections default COLLAPSED (`collapsedSections[cat] ?? true`), so a plain
  // mount renders no rows at all — an empty render that would have passed every
  // assertion below vacuously. This is OTA-1255's own lesson, one screen over.
  const header = tree.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && textOf(n).includes('WEAPONS'),
  )[0];
  expect(header).toBeDefined();
  renderer.act(() => { (header!.props.onPress as () => void)(); });
  allText = tree.root.findAll(() => true).map(textOf).join('\n');
  // self-check that the expand actually worked before anything is asserted on it
  expect(allText).toContain('Ember Storm Stave');
});

afterAll(() => { renderer.act(() => { tree.unmount(); }); });

// ===== the three rows, on a real render ==================================

describe('OTA-1727 - ROW 2 says how the weapon is held, in words', () => {
  it('A TWO-HANDER SAYS "Two-handed" and a one-hander says "One-handed"', () => {
    expect(allText).toContain('Two-handed');
    expect(allText).toContain('One-handed');
  });

  it('"Hand" ALONE IS GONE - it was the odd half of a pair', () => {
    // "Hand" answered a different question from "Two-handed": one named the hand
    // COUNT, the other only that the thing went in a hand. A player had to know
    // that "Hand" meant "not the other one".
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(/(^|[^-])\bHand\b(?!ed)/.test(code)).toBe(false);
  });

  it('and the equip action rides WITH it, not up in Row 1', () => {
    expect(allText).toContain('tap to equip');
  });
});

describe('OTA-1727 - ROW 1 no longer carries what Row 2 says', () => {
  // ⚠ COMMENTS STRIPPED, and the slice ends where Row 2's block begins — not at
  //   its inner <View>, which would leave Row 2's own guard inside the slice.
  //   OTA-1721's lesson, again: a scanner that reads its own prose reports on
  //   itself. The prose below quotes every string this test hunts for.
  const metaRow = SRC
    .slice(SRC.indexOf('<View style={styles.rowMetaRow}>'), SRC.indexOf('OTA-1727 - ROW 2'.replace(' - ', ' \u2014 ')))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('self-test - the slice is the real Row 1 and it is not empty', () => {
    expect(metaRow.length).toBeGreaterThan(500);
    expect(metaRow).toContain('styles.rowDamage');
  });

  it('THE EQUIP TEXT AND THE HAND LABEL ARE NOT DUPLICATED into Row 1', () => {
    expect(metaRow.includes('tap to equip')).toBe(false);
    expect(metaRow.includes('EQUIPPED')).toBe(false);
    expect(metaRow.includes('fillSlotLabel')).toBe(false);
  });

  it('Row 1 still carries rarity, the damage roll + type, durability and the proc', () => {
    expect(metaRow).toContain('item.rarity');
    expect(metaRow).toContain('{w.damageDice} {w.damageType}');
    expect(metaRow).toContain('item.durability.current');
    expect(metaRow).toContain('styles.rowCoating');   // the on-hit / proc chip
  });
});

// ===== nothing is clipped, and nothing shrank ============================

describe('OTA-1727 - the two silent clipping sites are closed', () => {
  it('BOTH META ROWS WRAP. React Native rows default to nowrap - that was the bug', () => {
    for (const style of ['rowMetaRow', 'rowHoldRow']) {
      const at = SRC.indexOf(`  ${style}: {`);
      expect(at).toBeGreaterThan(-1);
      const decl = SRC.slice(at, SRC.indexOf('},', at));
      expect(decl).toContain("flexWrap: 'wrap'");
    }
  });

  it('ROW 3 HAS NO ONE-LINE CAP - it was numberOfLines={1} and it cut real rules', () => {
    // ⚠⚠ OTA-1447's rule, and check:slicepins caught me breaking it: this was a
    // fixed 120-BYTE window, and a negative pin measured in bytes goes SILENT the
    // moment code grows between the anchor and the forbidden text — it stops
    // checking at exactly the point it should scream. `between` bounds the window
    // by the code's own shape, and the canary proves the window is still looking
    // at the right element before the absence means anything.
    const row3 = between(SRC, '<Text style={styles.rowStat}', '</Text>');
    expectAbsent(row3, 'numberOfLines', 'lead, ...rest');
  });

  it('⚠⚠ THE WARNINGS THAT WERE BEING CUT NOW RENDER - measured on the real screen', () => {
    // The Ember Storm Stave's rules ran to four lines inside a one-line cap. The
    // tail - which the player never saw - is what these assert.
    expect(allText).toContain('Scales with INT');
    expect(allText).toContain('Power weapon');         // was cut: "cannot be coated"
    expect(allText).toContain('to every other enemy');  // was cut: the splash
  });

  it('⚠⚠⚠ AND NOTHING GOT SMALLER TO MAKE ROOM - the owner ruled that out by name', () => {
    // "Do not fix overflow by reducing font size." Row 1 metadata stays at 10,
    // the new Row 2 matches it, and the stat row stays at 11.
    const size = (style: string): number => {
      const at = SRC.indexOf(`  ${style}: {`);
      expect(at).toBeGreaterThan(-1);
      const m = /fontSize: (\d+)/.exec(SRC.slice(at, SRC.indexOf('},', at)));
      return Number(m?.[1] ?? -1);
    };
    expect(size('rowMeta')).toBe(10);
    expect(size('rowHold')).toBe(10);
    expect(size('rowEquippable')).toBe(10);
    expect(size('rowEquipped')).toBe(10);
    expect(size('rowStat')).toBe(11);
  });
});

// ===== row 3 order =======================================================

describe('OTA-1727 - ROW 3 leads with the scaling stat', () => {
  it('the scaling stat is hoisted, not left to another file\'s push order', () => {
    // It already came first for most weapons, but only because previewWeapon
    // happens to push `Scales with` second and Row 3 filters out the first
    // entry. Row order is the owner's requirement; it belongs to this row.
    expect(SRC).toContain("const lead = extra.filter((x) => x.startsWith('Scales with'));");
    expect(SRC).toContain('[...lead, ...rest].join');
  });

  it('and on the real render the scaling stat precedes the special properties', () => {
    const line = allText.split('\n').find((l) => l.includes('Scales with INT') && l.includes('Power weapon'));
    expect(line).toBeDefined();
    expect(line!.indexOf('Scales with INT')).toBeLessThan(line!.indexOf('Power weapon'));
  });
});
