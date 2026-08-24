/**
 * OTA-1324 — THE CRUCIBLE AFFORDANCE OBEYS THE GATE ITS OWN HANDLER ENFORCES.
 *
 * ⚠⚠⚠ Owner's device log (4.29.186, roadside stall, mid-first-journey): he tapped
 * the vendor's Fusing Crucible FOUR times in seventy seconds and got the same
 * wall every time — *"The Crucible's not for first-timers. Leave the outpost and
 * see something of the world first."*
 *
 * `useVendorCrucible` refuses while `macroVisitSeq < 1`, and that is correct. The
 * defect is that the check lived ONLY inside the handler: the control rendered
 * lit, accepted the tap, and answered with a refusal. The requirement is known at
 * RENDER time, so it is consulted at render time.
 *
 * ⚠ Same shape as OTA-1024, where he spent down to 11 TC, tapped, and learned
 * about the fee from a buried system line. He called it "a lit button that
 * doesn't fire." Same defect, different gate.
 *
 * ⚠⚠ THE HANDLER'S REFUSAL STAYS. Hiding a control is not the same as securing
 * it, and there are other doors into the Crucible (`fuse` typed at a vendor tile,
 * a chip dismissed with ✕); the refusal is the backstop.
 *
 * ⚠⚠⚠ REBUILT AT OTA-1470. The control this suite guarded MOVED — the full-width
 * button inside the vendor screen is gone, and the vendor's Crucible is now the
 * tile chip beside the store chip, from the first moment, at the owner's ask. The
 * old pins quoted the button's JSX verbatim:
 *
 *     expect(codeOnly(VENDOR)).toContain("{(player?.macroVisitSeq ?? 0) >= 1");
 *     expect(code).toContain("activeBuildingId === 'market'");
 *
 * Every one of OTA-1324's rules survived OTA-1470 unchanged; only the file they
 * live in moved, and the pins still failed. So they are rebuilt around the RULES:
 * a render-time gate on the same field, the handler's refusal intact behind it,
 * and arb153's never-both de-duplication carried across whole.
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

// ⚠ OTA-1399 — SLICE 8 sent vendor / inventory / crafting into `app/state/slices/`.
// `storeSource()` reads gameStore AND every slice — a slice IS the store, same
// object, same keys, same importers.
import { storeSource } from '../test-utils/storeSource';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { BUILDINGS } from '../app/engine/buildings';
import { buildStallVendor } from '../app/engine/vendors';
import type { InventoryItem } from '../app/engine/types';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const EXPL = codeOnly(read('screens', 'ExplorationScreen.tsx'));
const VENDOR = codeOnly(read('screens', 'VendorScreen.tsx'));
const STORE = storeSource();

/** The Crucible chip block, bounded by its own landmarks. */
const chipBody = (): string => {
  const a = EXPL.indexOf('const atLocationCrucible');
  expect(a).toBeGreaterThan(-1);
  const b = EXPL.indexOf('Dismiss Fusing Crucible', a);
  expect(b).toBeGreaterThan(a);
  return EXPL.slice(a, b);
};

/** The `vendorCrucible` declaration alone — the render-time gate. */
const vendorGate = (): string => {
  const body = chipBody();
  const i = body.indexOf('const vendorCrucible');
  expect(i).toBeGreaterThan(-1);
  return body.slice(i, body.indexOf(';', i));
};

describe('OTA-1324 — the affordance consults the gate before it lights', () => {
  it('⚠⚠⚠ THE RENDER GATE EXISTS AND READS THE SAME FIELD THE HANDLER REFUSES ON', () => {
    expect(vendorGate()).toMatch(/macroVisitSeq \?\? 0\) >= 1/);
    // The handler's own gate, unchanged — one rule, read in two places is fine;
    // read in ONE place and enforced in the other is the bug.
    expect(STORE).toContain('if ((player.macroVisitSeq ?? 0) < 1) {');
  });

  it('⚠⚠⚠ AND IT GATES THE PAID DOOR ONLY, not the whole chip', () => {
    // A location's own forge is free and has never carried a first-timer rule —
    // a live wild permit is the clearest case, since you can hold one before you
    // have ever left. Hanging `macroVisitSeq` on the chip as a whole would
    // silently take that forge away from the player who paid for it.
    //
    // The structure that guarantees it: the early return is an AND of two
    // negations, so `atLocationCrucible` alone is sufficient to render, and
    // `macroVisitSeq` lives on the `vendorCrucible` arm and nowhere else.
    const body = chipBody();
    expect(body).toContain('if (!atLocationCrucible && !vendorCrucible) return null;');
    const guard = body.slice(0, body.indexOf('if (!atLocationCrucible'));
    const mentions = guard.match(/macroVisitSeq/g) ?? [];
    const inLocation = guard
      .slice(guard.indexOf('const atLocationCrucible'), guard.indexOf(';', guard.indexOf('const atLocationCrucible')));
    // exactly two: arb153's returned-to-your-outpost case, and the vendor gate
    expect(mentions.length).toBe(2);
    expect((inLocation.match(/macroVisitSeq/g) ?? []).length).toBe(1);
    // and the free arm still names itself free
    expect(body).toContain("'★★ Crucible ready'");
  });

  it('⚠⚠ THE REFUSAL IS STILL THERE — hiding a control is not securing it', () => {
    expect(STORE).toContain("The Crucible's not for first-timers");
  });

  it('⚠⚠⚠ AND IT STILL FIRES, on the path a hidden chip cannot cover', async () => {
    // `fuse` typed at a vendor tile, or a chip dismissed with ✕, both still reach
    // the handler. Never-left must still be refused there — behaviourally, not by
    // the string being present in the file.
    const store = await bootAtVendor(0);
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/not for first-timers/);
  });

  it('⚠⚠⚠ AND THE REFUSAL COSTS NOTHING — no coin, no permit, no burnt materials', async () => {
    const store = await bootAtVendor(0);
    const before = store.getState().player!.tc;
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const p = store.getState().player!;
    expect(p.tc).toBe(before);
    expect(p.fusionPending).toBeFalsy();
    expect(p.inventory.filter((i) => i.reservedForFusion).length).toBe(3);
  });

  it('⚠⚠ one journey out is enough — the boundary is ≥ 1, on both sides', async () => {
    const store = await bootAtVendor(1);
    store.getState().useVendorCrucible();
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).not.toMatch(/not for first-timers/);
    expect(store.getState().player!.fusionPending).toBe(true);
    // and the render gate agrees at exactly the same number
    expect(vendorGate()).toMatch(/>= 1/);
  });

  // ── harness ────────────────────────────────────────────────────────────────
  const mat = (id: string, tag: string): InventoryItem => ({
    id, name: `Test ${tag} Chunk ${id}`, kind: 'misc', rarity: 'Common', quantity: 1,
    tags: [tag], reservedForFusion: true,
  });

  async function bootAtVendor(macroVisitSeq: number) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Smith', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    store.setState((s) => ({
      tutorialDemoVendor: null,
      // ⚠ A REAL VENDOR, minted by the game's own builder — see the same note in
      // ota1024FusionLegibility. A cast in a fixture silences the one signal
      // that says the fixture stopped resembling the thing it stands in for.
      currentScene: { ...s.currentScene!, vendor: buildStallVendor('materials', 'Ovik') },
      player: {
        ...s.player!,
        tc: 100,
        hubRoomId: null,
        macroVisitSeq,
        fusionPending: false,
        inventory: [...s.player!.inventory, mat('m1', 'metal'), mat('m2', 'wood'), mat('m3', 'stone')],
      },
    }));
    return store;
  }
});

describe('OTA-1324 — arb153: the two Crucibles never both show', () => {
  it('⚠⚠⚠ ALL THREE LOCATION CASES ARE CARRIED, NOT TWO', () => {
    // A live permit, an outpost you have left and returned to, and the market
    // building. Dropping any one of them puts two Crucibles on one screen — the
    // exact duplication arb153 removed. OTA-1470 reversed which affordance
    // survives; it must not have reversed this.
    const body = chipBody();
    const i = body.indexOf('const atLocationCrucible');
    const decl = body.slice(i, body.indexOf(';', i));
    expect(decl).toContain('player.fusionPending');
    expect(decl).toContain('player.hubRoomId && (player.macroVisitSeq ?? 0) >= 1');
    expect(decl).toContain("activeBuildingId === 'market'");
  });

  it('⚠⚠⚠ AND THE VENDOR ARM STANDS DOWN WHEREVER THE LOCATION HAS ONE', () => {
    expect(vendorGate()).toContain('!atLocationCrucible');
  });

  it('⚠⚠⚠ THE VENDOR-SCREEN COPY IS GONE — this is now the only Crucible control', () => {
    // OTA-1470. Two affordances for one Crucible, swapping on whether he had
    // already paid, is what he was reporting; leaving either one behind
    // reinstates it.
    expect(VENDOR).not.toContain('USE CRUCIBLE');
    expect(VENDOR).not.toContain('crucibleBtn');
    expect(VENDOR).not.toContain('useVendorCrucible()');
  });

  it('⚠⚠⚠ AND SUPPRESSING THE CHIP INSIDE BUILDINGS STRANDS NOBODY', () => {
    // ⚠ THE REACHABILITY QUESTION OTA-1470 HAD TO ANSWER. The chip returns null
    // inside any building (OTA-775). The removed vendor-screen button did not —
    // so if a NON-market building could hold a vendor, that vendor's Crucible
    // would have been deleted rather than moved.
    //
    // It cannot: a building room only carries a vendor via `stallCategory`, and
    // every `stallCategory` in the game is a market stall. The market has its own
    // free cauldron (InputBox's in-market fuse button) and is already excluded by
    // `atLocationCrucible`. This asserts the fact rather than trusting tonight's
    // reading of it — the day somebody hangs a trader in the shack, this fails.
    const withStalls = Object.entries(BUILDINGS)
      .filter(([, b]) => (b.rooms ?? []).some((r) => !!r.stallCategory))
      .map(([id]) => id);
    expect(withStalls).toEqual(['market']);
    expect(EXPL).toContain("if (activeBuildingId || currentScene?.location?.id === 'hidden_market') return null;");
  });

  it('⚠ the in-market fuse control is the one that covers the market', () => {
    // Named so the previous test's reasoning has a visible second leg rather
    // than resting on a comment.
    expect(codeOnly(read('components', 'InputBox.tsx')))
      .toContain("activeBuildingId === 'market' && onFuse");
  });
});
