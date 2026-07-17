// OTA-862 [bounty board v2] — bounties are offered by ANY faction regardless of standing
// (a faction that dislikes you gives a harder job that pays more standing), and every
// accepted bounty carries a 24 in-game-hour deadline after which it lapses off the slate.

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

import {
  bountyTerms, giverDifficulty, bountyHoursLeft, bountyExpired, listBounties,
  BOUNTY_DEADLINE_HOURS, type FactionBounty,
} from '../app/engine/factionBounty';
import type { FactionMeta } from '../app/engine/worldPulse';
import { useGameStore } from '../app/state/gameStore';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Order', rivals: ['monarchs'], allies: [] },
  { id: 'monarchs', name: 'Monarchs', rivals: ['order'], allies: [] },
];
const OUTPOST: Record<string, string> = { order: 'order_camp', monarchs: 'monarch_camp' };

describe('OTA-862 — difficulty scales with the giver’s opinion of you', () => {
  it('the less a faction likes you, the more kills it demands and the more standing it pays', () => {
    expect(giverDifficulty(50)).toBe(0);
    expect(giverDifficulty(5)).toBe(1);
    expect(giverDifficulty(-10)).toBe(2);
    expect(giverDifficulty(-40)).toBe(3);
    // Harder job, but a bigger standing reward — the road back into favor.
    expect(bountyTerms(0, -40).count).toBeGreaterThan(bountyTerms(0, 100).count);
    expect(bountyTerms(0, -40).rewardRep).toBeGreaterThan(bountyTerms(0, 100).rewardRep);
  });

  it('a hostile faction (-20) still posts a contract — no standing gate', () => {
    const board = listBounties(FACTIONS, [{ factionId: 'order', standing: -20 }], (f) => OUTPOST[f], (l) => l, {});
    // order still wants monarchs hunted even though it dislikes the player.
    expect(board.some((b) => b.giverFactionId === 'order' && b.targetFactionId === 'monarchs')).toBe(true);
  });
});

describe('OTA-862 — the 24 in-game-hour deadline', () => {
  it('bountyHoursLeft counts down and bountyExpired flips at the deadline', () => {
    const b: FactionBounty = {
      giverFactionId: 'order', giverName: 'Order', targetFactionId: 'monarchs', targetName: 'Monarchs',
      targetLocationId: 'monarch_camp', targetLocationName: 'Monarch Camp', count: 3, progress: 0,
      rewardTc: 50, rewardRep: 8, acceptedAtHour: 100,
    };
    expect(bountyHoursLeft(b, 100)).toBe(BOUNTY_DEADLINE_HOURS);
    expect(bountyExpired(b, 100)).toBe(false);
    expect(bountyExpired(b, 100 + BOUNTY_DEADLINE_HOURS - 1)).toBe(false);
    expect(bountyExpired(b, 100 + BOUNTY_DEADLINE_HOURS)).toBe(true);
    // A legacy bounty with no stamp never expires.
    expect(bountyExpired({ ...b, acceptedAtHour: undefined }, 9999)).toBe(false);
  });

  it('a held bounty lapses off the slate once its window passes and an action ticks the clock', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Clock', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();

    const bounty: FactionBounty = {
      giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers', targetFactionId: 'mud_monarchs',
      targetName: 'Mud Monarchs', targetLocationId: 'monarch_waystation', targetLocationName: 'Waystation',
      count: 3, progress: 0, rewardTc: 50, rewardRep: 8,
    };
    useGameStore.getState().acceptBounty(bounty);
    const held = useGameStore.getState().player!.activeBounties ?? [];
    expect(held.length).toBe(1);
    expect(held[0]!.acceptedAtHour).toBeDefined(); // stamped on accept

    // Jump the in-game clock well past the deadline, then take one action to trigger the sweep.
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, hoursElapsed: (held[0]!.acceptedAtHour ?? 0) + BOUNTY_DEADLINE_HOURS + 5 } });
    await useGameStore.getState().submitPlayerAction('look around');

    expect((useGameStore.getState().player!.activeBounties ?? []).length).toBe(0); // lapsed
  });
});
