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
  bountyDeadlineFor, BOUNTY_DEADLINE_HOURS, type FactionBounty,
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

  // ⚠ RETARGETED BY OTA-1162, NOT WEAKENED. OTA-863's CLAIM — a job budget plus a
  // distance term, floored at the base — is unchanged and still asserted below. Only
  // the SIZE of the distance term moved: 1h/tile was priced against walking time and
  // ignored that a tile also costs 2 stamina, which rest repays at 1h per point. The
  // real cost is ~2.25h/tile, rounded up to HOURS_PER_TILE_TRUE (2.5).
  it('OTA-863 — the deadline is distance-aware: 24h job budget + honest travel per tile', () => {
    expect(bountyDeadlineFor(0)).toBe(BOUNTY_DEADLINE_HOURS);
    expect(bountyDeadlineFor(10)).toBe(BOUNTY_DEADLINE_HOURS + 25);
    expect(bountyDeadlineFor(31)).toBe(BOUNTY_DEADLINE_HOURS + 77.5);
    expect(bountyDeadlineFor(-5)).toBe(BOUNTY_DEADLINE_HOURS); // never below base
    // ⚠ THE FLOOR IS THE ASSERTION. The job does not shrink with the walk — a contract
    // on the outpost underfoot is still 3-9 kills — so the base must survive at 0 tiles.
    expect(bountyDeadlineFor(0)).toBeGreaterThan(0);
    // A bounty carrying its own longer deadline uses it, not the 24h base.
    const far: FactionBounty = {
      giverFactionId: 'g', giverName: 'G', targetFactionId: 't', targetName: 'T',
      targetLocationId: 'x', targetLocationName: 'X', count: 3, progress: 0, rewardTc: 50, rewardRep: 8,
      acceptedAtHour: 100, deadlineHours: 55,
    };
    expect(bountyHoursLeft(far, 100)).toBe(55);
    expect(bountyExpired(far, 100 + 40)).toBe(false); // still 15h left — a flat-24 would've lapsed
    expect(bountyExpired(far, 100 + 55)).toBe(true);
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
    // ⚠ OTA-1165 — accepting now requires a FROZEN BOARD: the contract stamps the
    // politics it was signed under, so there must be a snapshot to stamp. The freeze
    // AUTO-RELEASES on accept, which is why it is re-taken before each one.
    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty(bounty);
    const held = useGameStore.getState().player!.activeBounties ?? [];
    expect(held.length).toBe(1);
    expect(held[0]!.acceptedAtHour).toBeDefined();       // stamped on accept
    expect(held[0]!.deadlineHours).toBeGreaterThanOrEqual(BOUNTY_DEADLINE_HOURS); // OTA-863: 24 + tiles

    // Jump the in-game clock past THIS bounty's own (distance-aware) deadline, then take
    // one action to trigger the sweep.
    const p = useGameStore.getState().player!;
    const deadline = held[0]!.deadlineHours ?? BOUNTY_DEADLINE_HOURS;
    useGameStore.setState({ player: { ...p, hoursElapsed: (held[0]!.acceptedAtHour ?? 0) + deadline + 5 } });
    await useGameStore.getState().submitPlayerAction('look around');

    expect((useGameStore.getState().player!.activeBounties ?? []).length).toBe(0); // lapsed
  });
});
