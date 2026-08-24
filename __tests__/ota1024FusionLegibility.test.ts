/**
 * OTA-1024 — FUSION LEGIBILITY: THE PLAYER LEARNS THE PRICE BEFORE THE TAP.
 *
 * ⚠⚠⚠ TWO COMPLAINTS, ONE SHAPE. Reading 29 identical ♥ rows: *"they are all too
 * alike, there isn't 3 different kinds here?"* — and then, having spent down to
 * 11 TC, a fee denial he only met AFTER tapping. He called it *"a lit button that
 * doesn't fire."* Both are the same defect: the game knew something and did not
 * say it until the player had already committed.
 *
 * ⚠⚠ REBUILT AT OTA-1470, because the affordance this suite guarded MOVED. The
 * fee line used to live on a full-width `crucibleBtn` inside the vendor screen;
 * OTA-1470 removed that button and put the vendor's Crucible on the tile chip
 * beside the store chip, from the first moment, at the owner's ask.
 *
 * ⚠ THE OLD PIN DIED THE RIGHT WAY AND FOR THE WRONG REASON. It read:
 *
 *     expect(vend).toMatch(/you have \$\{player\?\.tc \?\? 0\}/);
 *     expect(vend).toMatch(/crucibleBtnShort/);
 *
 * — two quotations of the button's SOURCE. It could not survive the button
 * moving one file to the left, even though every word of OTA-1024's lesson
 * survived intact. This rebuild asserts the CLAIM instead: wherever the Crucible
 * is offered, the fee and the balance are on screen before the tap, and the
 * shortfall is coloured as a warning. That claim is portable; the old one was a
 * screenshot.
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

import * as fs from 'fs';
import * as path from 'path';
import { gateFusion, fusionMaterialTags } from '../app/engine/itemFusion';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { buildStallVendor } from '../app/engine/vendors';
import type { InventoryItem } from '../app/engine/types';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const INV = read('app', 'screens', 'InventoryScreen.tsx');
const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));
const VEND = codeOnly(read('app', 'screens', 'VendorScreen.tsx'));

/** The Crucible chip block, bounded by its own landmarks — no byte windows. */
const chipBody = (): string => {
  const a = EXPL.indexOf('const atLocationCrucible');
  expect(a).toBeGreaterThan(-1);
  const b = EXPL.indexOf('Dismiss Fusing Crucible', a);
  expect(b).toBeGreaterThan(a);
  return EXPL.slice(a, b);
};

describe('OTA-1024 — the price is on screen BEFORE the tap', () => {
  it('⚠⚠⚠ THE CRUCIBLE AFFORDANCE NAMES THE FEE', () => {
    const body = chipBody();
    expect(body).toContain('25 TC');
  });

  it('⚠⚠⚠ AND, WHEN HE IS SHORT, HIS ACTUAL BALANCE — the 11 TC lesson', () => {
    // Not "you need more coin". The NUMBER, because "you have 11" is what turns
    // an abstract fee into a decision he can make standing there.
    const body = chipBody();
    expect(body).toMatch(/you have \$\{player\.tc \?\? 0\}/);
  });

  it('⚠⚠⚠ THE SHORTFALL IS COLOURED AS A WARNING, not as trivia', () => {
    // The amber is load-bearing. On a two-line chip a grey hint reads as flavour
    // and gets skipped — which is precisely how he missed the fee the first time.
    const body = chipBody();
    expect(body).toContain('placeChipHintShort');
    expect(EXPL).toMatch(/placeChipHintShort: \{ color: '#e0a75f' \}/);
  });

  it('⚠⚠ short-of-coin is DERIVED, not typed twice', () => {
    // A second hand-written `< 25` is how the colour and the sentence come to
    // disagree about whether the player can afford it.
    const body = chipBody();
    expect((body.match(/const shortOfCoin\s*=/g) ?? []).length).toBe(1);
    const i = body.indexOf('const shortOfCoin');
    expect(body.slice(i, body.indexOf(';', i))).toMatch(/<\s*25/);
  });

  it('⚠⚠ a FREE Crucible does not invent a fee — the flag gates both halves', () => {
    // An outpost forge and a wild permit cost nothing. If `shortOfCoin` were not
    // gated on `vendorCrucible`, a broke player at their own forge would be told
    // to find 25 TC that nobody is asking for.
    const body = chipBody();
    const i = body.indexOf('const shortOfCoin');
    expect(body.slice(i, body.indexOf(';', i))).toContain('vendorCrucible');
    expect(body).toContain("'★★ Crucible ready'");
  });

  it('⚠⚠⚠ AND THE OLD BUTTON IS NOT STILL SAYING IT SOMEWHERE ELSE', () => {
    // OTA-1470 removed it. Two places quoting one fee is how they drift apart —
    // and it would also be the two-affordances defect returning by the back door.
    expect(VEND).not.toContain('USE CRUCIBLE');
    expect(VEND).not.toContain('crucibleBtn');
  });
});

describe('OTA-1024 — the handler still names both numbers, as the backstop', () => {
  // ⚠ Render-time legibility is the FIX; the spoken refusal is the SAFETY NET,
  // for `fuse` typed at a vendor tile, for a chip dismissed with ✕, and for any
  // door added later that forgets to look. Both must say the fee and the balance.
  const mat = (id: string, tag: string): InventoryItem => ({
    id, name: `Test ${tag} Chunk ${id}`, kind: 'misc', rarity: 'Common', quantity: 1,
    tags: [tag], reservedForFusion: true,
  });

  const bootAtVendor = async (tc: number) => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Smith', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    store.setState((s) => ({
      tutorialDemoVendor: null,
      // ⚠ A REAL VENDOR, minted by the game's own builder. A hand-rolled literal
      // here was missing `faction` and needed an `as` cast to compile — and a
      // cast in a fixture is the tests-that-pass-checking-nothing shape: it
      // silences the one signal that says the fixture stopped resembling the
      // thing it stands in for.
      currentScene: { ...s.currentScene!, vendor: buildStallVendor('materials', 'Ovik') },
      player: {
        ...s.player!,
        tc,
        hubRoomId: null,
        macroVisitSeq: 2,
        fusionPending: false,
        inventory: [...s.player!.inventory, mat('m1', 'metal'), mat('m2', 'wood'), mat('m3', 'stone')],
      },
    }));
    return store;
  };

  it('⚠⚠⚠ SHORT OF COIN: the refusal quotes the fee AND the balance', async () => {
    const store = await bootAtVendor(11);   // his exact number
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/costs 25 TC to fire; you have 11/);
  });

  it('⚠⚠⚠ AND NOT A COIN MOVES ON A REFUSAL', async () => {
    const store = await bootAtVendor(11);
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const p = store.getState().player!;
    expect(p.tc).toBe(11);
    expect(p.fusionPending).toBeFalsy();
    expect(p.inventory.filter((i) => i.reservedForFusion).length).toBe(3);
  });

  it('⚠⚠ exactly 25 fires — the boundary is ≥, not >', async () => {
    const store = await bootAtVendor(25);
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const p = store.getState().player!;
    expect(p.tc).toBe(0);
    expect(p.fusionPending).toBe(true);
  });

  it('⚠⚠ 24 does not — and says so with the true balance', async () => {
    const store = await bootAtVendor(24);
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getState().player!.tc).toBe(24);
    expect(store.getState().gameLog.map((e) => e.text).join('\n'))
      .toMatch(/costs 25 TC to fire; you have 24/);
  });

  it('⚠⚠ zero coin reads as zero, not as blank or NaN', async () => {
    const store = await bootAtVendor(0);
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/costs 25 TC to fire; you have 0/);
    expect(log).not.toContain('NaN');
    expect(log).not.toContain('undefined');
  });
});

describe('OTA-1024 — SOURCE LOCK (the other half: the ♥ rows say their kinds)', () => {
  it('forge-reservable inventory rows carry their material kinds', () => {
    expect(INV).toMatch(/isForgeReservableItem\(item\) && \(/);
    expect(INV).toMatch(/fusionMaterialTags\(item\)\.join/);
  });
});

describe('OTA-1024 — the row label mirrors the diversity gate', () => {
  const mk = (id: string, name: string, tags: string[]) =>
    ({ id, name, quantity: 1, reservedForFusion: true, tags } as any);

  it('a 3-kind spread passes with exactly the kinds the rows would show', () => {
    const pile = [
      mk('a', 'Flint Core Nodule', ['stone']),
      mk('b', 'Moth Wing', ['trophy', 'loot', 'organic']),
      mk('c', 'Amber Droplet', ['crystal']),
    ];
    const rowKinds = new Set(pile.flatMap((i) => fusionMaterialTags(i)));
    const gate = gateFusion(pile);
    expect(gate.ok).toBe(true);
    expect(new Set(gate.tagProfile)).toEqual(rowKinds);
  });

  it('a same-kind trio still refuses, with the reason naming the spread', () => {
    const pile = [
      mk('a', 'Moth Wing', ['trophy', 'loot', 'organic']),
      mk('b', 'Raven Feather', ['trophy', 'loot', 'organic']),
      mk('c', 'Slug Slime', ['trophy', 'loot', 'organic']),
    ];
    const gate = gateFusion(pile);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/too alike/);
  });
});
