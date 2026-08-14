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

// ⚠⚠ OTA-1257 — NOT ONE SCREEN ON THIS LINE HAD EVER BEEN RENDERED BY A TEST.
//
// Ported from golem OTA-1255 at the owner's direction: *"yes port the mount tests
// to Hal."* ⚠ **IT COVERS SIX SCREENS HERE, NOT FIVE.** Golem already had an
// ExplorationScreen guard from OTA-1246 — added the hard way, after that crash
// shipped to a phone. **HAL never got one**, so the screen that actually broke is
// included here.
//
// ⚠ MEASURED BEFORE WRITING THIS: exactly one suite on this line calls
// `renderer.create` at all (ota1255LookBeatLock, and it mounts InputBox, not a
// screen). Every other suite that touches a screen SOURCE-PINS it with
// `readFileSync`.
//
// ⚠⚠ THE CRASH CLASS THIS EXISTS FOR, from the golem line where it shipped:
// OTA-1245 hoisted a `useMemo` 82 lines above a helper it called. **A memo FACTORY
// RUNS DURING RENDER**, so under Hermes the const sat in its temporal dead zone and
// read as `undefined`. The app died before a frame drew, on a build called green:
//
//     stage: screen-render · error: undefined is not a function
//     component stack: in ExplorationScreen
//
// ⚠⚠ AND NOTHING COULD HAVE CAUGHT IT. `tsc` cannot see it — a reference inside a
// closure is legal TypeScript, which has no idea the closure runs immediately.
// `eslint`'s `no-use-before-define` WOULD, but measured on golem, enabling it flags
// **2,869 pre-existing sites**, so it cannot be a blocking gate. **A source pin
// proves a line exists; it can never prove a component renders it.**
//
// ⚠⚠ AN EMPTY RENDER IS NOT ENOUGH, AND THAT IS THE LESSON THAT COST THE MOST. The
// first version of the golem guard PASSED WITH THE BUG STILL IN: with no scene, the
// chip list mapped over an empty array and the dead reference was never CALLED.
// Every screen here mounts against a real `startNewGame` player carrying real gear,
// a real scene, and a real vendor — so the per-row work actually runs.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};
import { useGameStore } from '../app/state/gameStore';

jest.setTimeout(120_000);

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/** Gear across several slots, a stack, a consumable and a salvageable — enough
 *  that the per-row work (upgrade marks, slot labels, breakdown yields, price
 *  lines) actually executes rather than mapping over nothing. */
const PACK = [
  { id: 'i1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'] },
  { id: 'i2', name: "Mud-Warden's Vest", kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor'] },
  { id: 'i3', name: 'Aetheric Torch', kind: 'misc', rarity: 'Common', quantity: 1, tags: [] },
  { id: 'i4', name: 'First Aid Kit', kind: 'consumable', rarity: 'Uncommon', quantity: 3, tags: [] },
  { id: 'i5', name: 'Scrap Metal', kind: 'material', rarity: 'Common', quantity: 7, tags: [] },
];

const SCENE = {
  location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
  ambientNouns: ['bench', 'Compact Blaster', 'brick'],
  displayedAmbientNouns: ['bench', 'Compact Blaster', 'brick'],
  pinnedAmbientNouns: [],
  enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
};

beforeAll(async () => {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().submitPlayerAction('Walker');
  const base = useGameStore.getState().player;
  useGameStore.setState({
    tutorialStep: null,
    currentScene: SCENE,
    player: base ? { ...base, inventory: PACK, tc: 500 } : base,
  } as never);
});

/** Mount, walk the tree so lazy children are forced, then unmount. */
function mounts(load: () => { [k: string]: unknown }, name: string): void {
  const Screen = load()[name] as () => React.ReactElement;
  expect(typeof Screen).toBe('function');
  let tree!: { toJSON(): unknown; unmount(): void };
  renderer.act(() => { tree = renderer.create(React.createElement(Screen)); });
  // ⚠ toJSON() FORCES the tree to serialise. A mount that throws lazily inside a
  // child would otherwise be swallowed by act()'s error boundary handling.
  expect(tree.toJSON()).not.toBeUndefined();
  renderer.act(() => { tree.unmount(); });
}

describe('OTA-1257 — every main screen actually mounts', () => {
  it('⚠⚠ ExplorationScreen RENDERS with a populated room — the one that crashed', () => {
    // ⚠ On golem this is OTA-1246's guard, written after the crash reached a
    // phone. This line never had it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => mounts(() => require('../app/screens/ExplorationScreen'), 'ExplorationScreen')).not.toThrow();
  });

  it('⚠⚠ InventoryScreen RENDERS with a full pack', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => mounts(() => require('../app/screens/InventoryScreen'), 'InventoryScreen')).not.toThrow();
  });

  it('⚠⚠ CraftingScreen RENDERS with materials on hand', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => mounts(() => require('../app/screens/CraftingScreen'), 'CraftingScreen')).not.toThrow();
  });

  it('⚠⚠ CharacterScreen RENDERS with gear equipped', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => mounts(() => require('../app/screens/CharacterScreen'), 'CharacterScreen')).not.toThrow();
  });

  it('⚠⚠ ContractsScreen RENDERS', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => mounts(() => require('../app/screens/ContractsScreen'), 'ContractsScreen')).not.toThrow();
  });

  it('⚠⚠ VendorScreen RENDERS with a live vendor and stock', () => {
    // ⚠ The vendor screen is the one that NEEDS state to be interesting: with no
    // active vendor it early-returns a placeholder and every price / stock / rep
    // line is skipped — an empty render that proves nothing, which is exactly the
    // trap OTA-1246's first draft fell into.
    // ⚠ THE REAL `VendorInstance` SHAPE, not an invented one. My first fixture
    // used `inventory:` and the screen died on `vendor.offers.find` — which looked
    // like a product bug for a moment. It is not: `offers` is required on the
    // type, all 30 authored vendors carry it, and instances are built from those
    // templates. **A fixture that does not match the real shape manufactures bugs
    // that do not exist**, which is as expensive as missing a real one.
    const v = {
      id: 'test_vendor', name: 'Irma Ironhand', title: 'Heavy Armorer',
      faction: 'reclaimers_guild', description: 'A gruff smith.',
      offers: [
        { itemName: 'Rusted Blade', price: 40, quantity: 2 },
        { itemName: 'First Aid Kit', price: 25, quantity: 5 },
      ],
    };
    useGameStore.setState({
      currentScene: { ...SCENE, vendor: v },
      activeVendor: v,
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => mounts(() => require('../app/screens/VendorScreen'), 'VendorScreen')).not.toThrow();
  });

  it('⚠⚠ ...and the state they mounted against was REALLY populated', () => {
    // ⚠ THE GUARD ON THE GUARD. If a future edit drops the fixture, every test
    // above keeps passing while proving nothing — the OTA-1246 failure mode
    // exactly. Assert the fixture is still doing its job.
    const p = useGameStore.getState().player;
    expect(p).not.toBeNull();
    expect((p?.inventory ?? []).length).toBeGreaterThanOrEqual(5);
    expect(p?.equipped?.main).toBeTruthy();
    expect((useGameStore.getState().currentScene?.displayedAmbientNouns ?? []).length).toBeGreaterThan(0);
  });
});
