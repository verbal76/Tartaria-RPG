// ⚠⚠ OTA-1365 — THE LORE TABS: capitalised, and ordered by how often you open
// them WHILE PLAYING.
//
// Owner: *"all of the tabs under the lore are not capitalized and are not
// organized in a fashion where the most used one for gameplay are top left. I
// imagine beasts and fallen would be the 2 most used and in that order."*
//
// Both true. The old order was just the sequence the tabs were built in — races
// first because it shipped first — so the two you actually reach for mid-run sat
// fifth and last. The row WRAPS (OTA fix after a hidden horizontal scroll cut
// FALLEN and LORE off past the right edge), so first in the array really is the
// top-left tab and this is a real placement claim, not a cosmetic one.
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/** Every string in the rendered tree, in document order. */
function texts(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const n of node) texts(n, out); return out; }
  const kids = (node as { children?: unknown }).children;
  if (kids != null) texts(kids, out);
  return out;
}

const EXPECTED = ['BEASTS', 'FALLEN', 'PLACES', 'FACTIONS', 'RACES', 'LORE', 'TIMELINE'];

describe('OTA-1365 — the lore tabs', () => {
  it('⚠⚠ THE OWNER\'S ORDER: BEASTS first, FALLEN second, as actually rendered', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LoreCodexBody } = require('../app/components/LoreCodexBody') as { LoreCodexBody: () => React.ReactElement };
    let tree!: { toJSON(): unknown; unmount(): void };
    renderer.act(() => { tree = renderer.create(React.createElement(LoreCodexBody)); });
    try {
      const all = texts(tree.toJSON());
      const positions = EXPECTED.map((label) => ({ label, at: all.indexOf(label) }));
      // Every tab is on screen — the row wraps precisely so none is cut off.
      for (const p of positions) expect(p.at).toBeGreaterThan(-1);
      // And they come out in this order, top-left first.
      const rendered = [...positions].sort((a, b) => a.at - b.at).map((p) => p.label);
      expect(rendered).toEqual(EXPECTED);
    } finally {
      renderer.act(() => { tree.unmount(); });
    }
  });

  it('⚠ every tab label is capitalised — no lower-case leftovers', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');
    const i = src.indexOf('const TAB_LABEL');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('};', i));
    for (const label of EXPECTED) expect(block).toContain(`'${label}'`);
    // The old raw-id rendering (which printed the lower-case section key) is gone.
    expect(src).not.toContain("{s === 'bestiary' ? 'beasts' : s}");
  });

  it('⚠ the order is declared once, so the row and the labels cannot drift apart', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');
    // ⚠ OTA-1667 inserted GLYPHS third (the weapon key, moved out of Settings
    // to the door the owner named). BEASTS and FALLEN keep the first two seats —
    // his call at OTA-1365 — and the rest keep their relative order.
    expect(src).toContain("const TAB_ORDER: Section[] = ['bestiary', 'fallen', 'glyphs', 'places', 'factions', 'races', 'lore', 'timeline'];");
    expect(src).toContain('{TAB_ORDER.map((s) => (');
    expect(src).toContain('{TAB_LABEL[s]}');
  });
});
