// OTA-859 [bounty board] — the player can hold MORE THAN ONE bounty at a time and grind
// faction standing. This pins the pure board helpers (listBounties surfaces every eligible
// contract, bountyKey gives each a stable identity) and the in-store stacking + shared
// kill-progress behaviour (a single kill advances EVERY held bounty whose quarry matches).

jest.setTimeout(20000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { listBounties, bountyKey, pickBounty, type FactionBounty } from '../app/engine/factionBounty';
import type { FactionMeta } from '../app/engine/worldPulse';
import { useGameStore } from '../app/state/gameStore';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Forgotten Order', rivals: ['monarchs', 'ghost'], allies: [] },
  { id: 'monarchs', name: 'Mud Monarchs', rivals: ['order'], allies: [] },
  { id: 'ghost', name: 'Ghost Legion', rivals: ['order'], allies: [] },
];
const OUTPOST: Record<string, string> = { order: 'order_camp', monarchs: 'monarch_waystation', ghost: 'ghost_hollow' };
const outpostOf = (fid: string) => OUTPOST[fid];
const locName = (loc: string) => loc;

describe('OTA-859 — listBounties surfaces the whole board', () => {
  it('a faction favored above the threshold posts a contract for EACH of its outpost-holding rivals', () => {
    const standings = [{ factionId: 'order', standing: 30 }];
    const board = listBounties(FACTIONS, standings, outpostOf, locName, {});
    // Forgotten Order favored → both its rivals (monarchs, ghost) become contracts.
    expect(board.length).toBe(2);
    const targets = board.map((b) => b.targetFactionId).sort();
    expect(targets).toEqual(['ghost', 'monarchs']);
    // pickBounty is still the head of the same list (back-compat).
    expect(bountyKey(pickBounty(FACTIONS, standings, outpostOf, locName, {})!)).toBe(bountyKey(board[0]!));
  });

  it('bountyKey is stable per giver+target+place and distinguishes different contracts', () => {
    const board = listBounties(FACTIONS, [{ factionId: 'order', standing: 30 }], outpostOf, locName, {});
    const keys = new Set(board.map(bountyKey));
    expect(keys.size).toBe(board.length); // all distinct
  });

  it('max caps how many are surfaced', () => {
    const board = listBounties(FACTIONS, [{ factionId: 'order', standing: 30 }], outpostOf, locName, {}, 1);
    expect(board.length).toBe(1);
  });
});

describe('OTA-859 — the store holds several bounties and grinds them together', () => {
  const mkBounty = (giver: string, target: string, loc: string, count: number): FactionBounty => ({
    giverFactionId: giver, giverName: giver, targetFactionId: target, targetName: target,
    targetLocationId: loc, targetLocationName: loc, count, progress: 0, rewardTc: 50, rewardRep: 8,
  });

  it('acceptBounty stacks up to the cap, refuses duplicates, and a shared kill advances every matching contract', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Grinder', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();

    // Two contracts on the SAME quarry faction from two givers, plus one on another quarry.
    const bA = mkBounty('alpha', 'monarchs', 'monarch_waystation', 3);
    const bB = mkBounty('beta', 'monarchs', 'monarch_waystation2', 3);
    const bC = mkBounty('gamma', 'ghost', 'ghost_hollow', 3);

    useGameStore.getState().acceptBounty(bA);
    useGameStore.getState().acceptBounty(bA); // duplicate — must be refused
    useGameStore.getState().acceptBounty(bB);
    useGameStore.getState().acceptBounty(bC);
    let slate = useGameStore.getState().player!.activeBounties ?? [];
    expect(slate.length).toBe(3); // bA, bB, bC — the dup did not stack

    // A fourth distinct contract overflows the cap of 3 and is refused.
    useGameStore.getState().acceptBounty(mkBounty('delta', 'order', 'order_camp', 3));
    expect((useGameStore.getState().player!.activeBounties ?? []).length).toBe(3);

    // A single monarchs kill advances BOTH monarchs contracts, not the ghost one.
    // Drive it through the same helper the kill path uses.
    const { killCountsForBounty } = require('../app/engine/factionBounty');
    slate = useGameStore.getState().player!.activeBounties ?? [];
    const advanced = slate.map((b) => ({ ...b, progress: killCountsForBounty(b, 'monarchs') ? b.progress + 1 : b.progress }));
    const monarchsProg = advanced.filter((b) => b.targetFactionId === 'monarchs').map((b) => b.progress);
    const ghostProg = advanced.filter((b) => b.targetFactionId === 'ghost').map((b) => b.progress);
    expect(monarchsProg).toEqual([1, 1]); // both monarchs bounties ticked
    expect(ghostProg).toEqual([0]);       // the ghost bounty untouched
  });
});
