jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1007 — the fuse honesty batch. OTA-801 made a FAILED gate open the picker
// anyway, to dodge refusal spam. That traded a visible annoyance for an
// invisible one: a menu the player cannot act in, logging NOTHING. On device,
// three `fuse` commands each produced exactly one log line — the player's own
// echo — and ten minutes of a dead FUSE button ("I honestly thought I was
// fusing all those things"). The picker now opens ONLY when a fusion is really
// possible; otherwise the Crucible names the shortfall, holds it, and closes.
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

// Catalog-ABSENT curio names — the only things the Crucible eats.
const cog = (n: number) => ({
  id: 'cg_' + n, name: 'Brass Cog Cluster', quantity: 1,
  rarity: 'Common' as const, reservedForFusion: true, tags: [] as string[],
});
const mixed = [
  { id: 'm1', name: 'Brass Cog Cluster', quantity: 1, rarity: 'Common' as const, reservedForFusion: true, tags: [] as string[] },
  { id: 'm2', name: 'Knotted Sinew Braid', quantity: 1, rarity: 'Common' as const, reservedForFusion: true, tags: [] as string[] },
  { id: 'm3', name: 'Split Slate Piece', quantity: 1, rarity: 'Common' as const, reservedForFusion: true, tags: [] as string[] },
];

async function bootWith(name: string, extra: any[]) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const p = store.getState().player!;
  store.setState({
    player: {
      ...p, macroVisitSeq: 3, hubRoomId: 'outpost_gate', tc: 500,
      inventory: [...p.inventory.map((i) => ({ ...i, reservedForFusion: false })), ...extra],
    } as any,
    fusionBlockedNotice: null,
    fusionPickerOpen: false,
    pendingFusionSelection: null,
  });
  return store;
}

describe('OTA-1007 — the Crucible refuses out loud', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('TOO FEW pieces: no picker, a notice that names the shortfall, and it closes', async () => {
    const store = await bootWith('Short', [cog(1), cog(2)]);
    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('fuse');
    await new Promise((r) => setTimeout(r, 120));
    const st = store.getState();
    expect(st.fusionPickerOpen).toBe(false);          // THE FIX — was true, silently
    expect(st.fusionBlockedNotice).toBeTruthy();
    expect(st.fusionBlockedNotice!.body).toMatch(/three pieces/i);
    expect(st.fusionBlockedNotice!.body).toContain('2');
    // …and it is no longer silent: the feed carries the same words.
    const logs = st.gameLog.slice(before).map((e) => e.text).join('\n');
    expect(logs).toMatch(/Crucible hums, then cools/i);
  });

  it('TOO ALIKE: the notice names the materials you actually have', async () => {
    const store = await bootWith('Alike', [cog(1), cog(2), cog(3)]);
    store.getState().submitPlayerAction('fuse');
    await new Promise((r) => setTimeout(r, 120));
    const st = store.getState();
    expect(st.fusionPickerOpen).toBe(false);
    expect(st.fusionBlockedNotice!.body).toMatch(/three DIFFERENT materials/i);
    expect(st.fusionBlockedNotice!.body).toMatch(/metal/i);
  });

  it('NOTHING reserved: plain English, and never the word "inferred"', async () => {
    const store = await bootWith('Empty', []);
    store.getState().submitPlayerAction('fuse');
    await new Promise((r) => setTimeout(r, 120));
    const st = store.getState();
    expect(st.fusionPickerOpen).toBe(false);
    const notice = st.fusionBlockedNotice!;
    expect(notice.body).toMatch(/odd salvage/i);
    expect(notice.body.toLowerCase()).not.toContain('inferred');
    expect(notice.title.toLowerCase()).not.toContain('inferred');
  });

  it('a REAL set still opens the picker — the fix does not block good fusions', async () => {
    const store = await bootWith('Ready', mixed);
    store.getState().submitPlayerAction('fuse');
    await new Promise((r) => setTimeout(r, 120));
    const st = store.getState();
    expect(st.fusionPickerOpen).toBe(true);
    expect(st.fusionBlockedNotice).toBeNull();
  });

  it('the stale selection is cleared on refusal, so the next fuse is clean', async () => {
    const store = await bootWith('Sticky', [cog(1), cog(2), cog(3)]);
    // A confirm that cannot pass the diversity gate used to leave this set.
    store.getState().confirmFusionSelection(['cg_1', 'cg_2', 'cg_3'], 'weapon');
    await new Promise((r) => setTimeout(r, 150));
    expect(store.getState().pendingFusionSelection).toBeNull();
  });

  it('the notice clears on demand (the modal dismiss)', async () => {
    const store = await bootWith('Clear', [cog(1)]);
    store.getState().submitPlayerAction('fuse');
    await new Promise((r) => setTimeout(r, 120));
    expect(store.getState().fusionBlockedNotice).toBeTruthy();
    store.getState().clearFusionBlockedNotice();
    expect(store.getState().fusionBlockedNotice).toBeNull();
  });

  it('category lock: the OTA-801 consolation-picker is GONE, all four doors covered', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // The band-aid this OTA removes must not creep back.
    expect(src).not.toContain('const anyReserved = fusion.eligibleInputs');
    expect(src).toContain('fusionBlockedNotice: {');
    // The vendor rig checks BEFORE it charges (no paying for a cold bowl).
    expect(src).toContain("I'll not take your coin for a cold bowl");
    // The picker button gates on the real rule, not the count alone.
    const modal = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'FusionPickerModal.tsx'), 'utf8');
    expect(modal).toContain('picked.length <= MAX_PICK && nMats >= 3');
    // And the notice is actually rendered.
    const screen = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(screen).toContain('<FusionBlockedModal />');
  });
});
