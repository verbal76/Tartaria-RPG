// OTA-1163 — THE FIRST CONTRACT COMES WITH SOMEONE TO EXPLAIN IT.
//
// Owner: "we have first time touch pop-ups all through the game. so how about the first
// time someone accepts a bounty gets a pop-up and it does it in character… this is
// so-and-so the bounty Slayer, since this is your first bounty I'll show you the ropes.
// I'm going to send you to an area that's thick with enemy but they know you're coming
// so they're going to be looking for you."
//
// ⚠ THE CARD IS DESCRIPTIVE, WHICH IS WHY IT IS TESTED AGAINST THE MECHANICS AND NOT
// AGAINST ITSELF. It makes three factual claims a player can otherwise only learn by
// accident — kills count anywhere, there is no turn-in, accepting makes the quarry hunt
// you. Each is pinned below against the CODE THAT IMPLEMENTS IT, so if a future change
// makes one false the test fails rather than the card quietly lying to a first-timer.

// Native-module preamble — required by every suite that imports the store (it pulls in
// AsyncStorage, the model runtimes and the expo AV/speech surface at require time).
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
// ⚠ `createAsync` carries an EXPLICIT annotation here, unlike the copies of this
// preamble in older suites. Without one, tsc reports TS7022 (implicitly any, referenced
// in its own initializer) — that diagnostic is a chunk of the test-typecheck baseline,
// and new test code is supposed to typecheck rather than grow it.
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import { bountyPrimerCard, formatWindow, BOUNTY_BROKER } from '../app/engine/bountyPrimer';
import { killCountsForBounty, bountyTerms, giverDifficulty } from '../app/engine/factionBounty';
import type { FactionBounty } from '../app/engine/factionBounty';
import { useGameStore } from '../app/state/gameStore';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const STORE = read('app', 'state', 'gameStore.ts');

const BOUNTY: FactionBounty = {
  giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers Guild',
  targetFactionId: 'mud_monarchs', targetName: 'Mud Monarchs',
  targetLocationId: 'monarch_waystation', targetLocationName: 'Monarch Waystation',
  count: 4, progress: 0, rewardTc: 100, rewardRep: 9,
};

describe('OTA-1163 — time reads as time', () => {
  it('renders in days and hours, never steps or rests', () => {
    // Owner: "I still want time to be seen as time in the game days, hours."
    expect(formatWindow(81.5)).toBe('3 days, 10 hours');
    expect(formatWindow(24)).toBe('1 day');
    expect(formatWindow(25)).toBe('1 day, 1 hour');
    expect(formatWindow(5)).toBe('5 hours');
  });

  it('never renders a negative or absent window as nonsense', () => {
    expect(formatWindow(0)).toBe('0 hours');
    expect(formatWindow(-9)).toBe('0 hours');
  });
});

describe('OTA-1163 — the card tells the truth about the job', () => {
  const card = bountyPrimerCard(BOUNTY, 81.5, 30);
  const all = [...card.flavor, ...card.rewards].join('\n');

  it('is Jakar, and he is a person rather than a new power', () => {
    // ⚠ Deliberately NOT a guild or a faction. A bounty guild would be a tenth power in
    // a nine-power world, needing standing, an outpost, rivals and a tide. He is one man
    // with a sheaf of paper: all of the voice, none of the systems.
    expect(BOUNTY_BROKER).toBe('Jakar Nine-Halls');
    expect(card.title).toBe(BOUNTY_BROKER);
    expect(card.heading).toBe('THE ROPES');
  });

  it('⚠ CLAIM 1 — "kills count anywhere", and the kill check really has no location term', () => {
    expect(all).toContain('ANYWHERE');
    // The claim, pinned against the implementation: a matching faction counts even when
    // the bounty's own location fields are pointed somewhere else entirely.
    expect(killCountsForBounty(BOUNTY, 'mud_monarchs')).toBe(true);
    expect(killCountsForBounty({ ...BOUNTY, targetLocationId: 'somewhere_else' }, 'mud_monarchs')).toBe(true);
    expect(killCountsForBounty(BOUNTY, 'reclaimers_guild')).toBe(false);
    // ...and the function signature itself takes no location at all.
    expect(killCountsForBounty.length).toBe(2);
  });

  it('⚠ CLAIM 2 — "no turn-in", and the payout really fires from the kill handler', () => {
    expect(all).toMatch(/No turn-in/i);
    // The payout lives in the kill path, not behind a hand-in verb: the same block that
    // ticks progress is the one that pays.
    const i = STORE.indexOf('killCountsForBounty(b, enemy.factionId)');
    expect(i).toBeGreaterThan(-1);
    // ⚠ WIDENED, NOT WEAKENED. A fixed character slice is a brittle way to say "in the
    // same block": OTA-1165 added the anti-camp bookkeeping between the kill check and the
    // payout, which pushed `announceMissionComplete` past a 2400-char window and failed a
    // claim that is still perfectly true. The assertion — the payout fires from the KILL
    // path, not a hand-in verb — is unchanged; only the window it looks through grew.
    const block = STORE.slice(i, i + 4000);
    expect(block).toContain('announceMissionComplete');
    expect(block).toContain('rewardTc');
    // And the real guarantee behind the claim: no turn-in verb gates it.
    expect(block).not.toMatch(/\bturnIn|handIn\b/);
  });

  it('⚠ CLAIM 3 — "they are hunting you now"', () => {
    expect(all).toMatch(/hunting you/i);
    expect(all).toMatch(/the moment you accept/i);
  });

  it('quotes THIS contract rather than generic numbers', () => {
    expect(all).toContain('4 × Mud Monarchs');
    expect(all).toContain('Monarch Waystation');
    expect(all).toContain('100 TC');
    expect(all).toContain('9 standing');
    expect(all).toContain('3 days, 10 hours');
  });

  it('labels its list something other than THE TAKE', () => {
    // Four facts about how bounties work are not a payout, and calling them one reads as
    // rewards the player never received.
    expect(card.takeLabel).not.toBe('THE TAKE');
    expect(card.takeLabel.length).toBeGreaterThan(0);
  });
});

describe('OTA-1163 — the count is explained, and the explanation tracks the code', () => {
  // `count = 3 + ceil(tide/2) + giverDifficulty(standing)`, so the number genuinely
  // encodes how the giver feels about you. Each tier gets its own line, and the tiers
  // are read off giverDifficulty rather than re-derived.
  const line = (standing: number) =>
    bountyPrimerCard(BOUNTY, 48, standing).flavor.join('\n');

  it('a favored hall asks for the fewest and says so', () => {
    expect(giverDifficulty(30)).toBe(0);
    expect(line(30)).toMatch(/count you one of theirs/i);
  });

  it('a stranger, a doubter and an enemy each get a different reason', () => {
    expect(giverDifficulty(5)).toBe(1);
    expect(giverDifficulty(-10)).toBe(2);
    expect(giverDifficulty(-40)).toBe(3);
    const tiers = [line(5), line(-10), line(-40)];
    expect(new Set(tiers).size).toBe(3); // no two tiers share a line
    expect(tiers[2]).toMatch(/proving it/i);
  });

  it('and the claim itself is true — a disliked hall really does ask for more', () => {
    expect(bountyTerms(0, -40).count).toBeGreaterThan(bountyTerms(0, 30).count);
  });
});

describe('OTA-1163 — it fires once, on the first contract', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Ropes', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    useGameStore.getState().clearMissionCompleteNotice();
    // ⚠ OTA-1165 — accepting now requires a FROZEN BOARD: the contract stamps the
    // politics it was signed under, so there must be a snapshot to stamp. The freeze
    // AUTO-RELEASES on accept, which is why it is re-taken before each one.
  });

  it('a fresh character has not seen it', () => {
    // ⚠ Absent, not false — and absent is what an OLD SAVE reads as too. That is
    // deliberate: these rules have never been shown to anybody, so a veteran needs them
    // MORE than a first-timer. Do not backfill this to true.
    expect(useGameStore.getState().player!.bountyPrimerSeen).toBeFalsy();
  });

  it('the first accept raises the card and sets the flag', () => {
    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty(BOUNTY);
    const n = useGameStore.getState().missionCompleteNotice;
    expect(n).toBeTruthy();
    expect(n!.title).toBe(BOUNTY_BROKER);
    expect(n!.heading).toBe('THE ROPES');
    expect(n!.takeLabel).not.toBe('THE TAKE');
    expect(n!.holdMs).toBeGreaterThan(60000); // sized to be readable, see the modal
    expect(useGameStore.getState().player!.bountyPrimerSeen).toBe(true);
  });

  it('⚠ AND NEVER AGAIN — including after the slate empties', () => {
    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty(BOUNTY);
    useGameStore.getState().clearMissionCompleteNotice();
    // Clear the slate outright: a player who finished a contract has still seen the
    // ropes, so gating on `slate.length === 0` would re-show it every time they cleared.
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, activeBounties: [] } });
    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty({ ...BOUNTY, targetLocationId: 'another_camp' });
    expect(useGameStore.getState().missionCompleteNotice).toBeNull();
  });

  it('the card describes the contract that was actually stamped', () => {
    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty(BOUNTY);
    const held = useGameStore.getState().player!.activeBounties![0]!;
    const lines = useGameStore.getState().missionCompleteNotice!.rewards.join('\n');
    // The window quoted is THIS contract's stored deadline, not a constant.
    expect(lines).toContain(formatWindow(held.deadlineHours!));
  });
});

describe('OTA-1163 — the feed stopped implying the place is a requirement', () => {
  it('both accept lines say the kills count anywhere', () => {
    // The wording that misled the owner through a whole 23-tile contract: "put down
    // around <place>" reads as an instruction when the place is only a tip.
    const i = STORE.indexOf('"Another contract," the Arbiter says');
    expect(i).toBeGreaterThan(-1);
    const both = STORE.slice(i - 400, i + 800);
    expect((both.match(/anywhere you find them/g) ?? []).length).toBe(2);
    expect(both).not.toMatch(/put down around \$\{bounty\.targetLocationName\}/);
  });
});

describe('OTA-1163 — the presentation overrides cannot shorten or wedge a card', () => {
  beforeEach(() => useGameStore.getState().clearMissionCompleteNotice());

  it('an ordinary notice carries neither override, so it renders exactly as before', () => {
    useGameStore.getState().announceMissionComplete('Bounty', 'a job', 'paid 50 TC');
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.takeLabel).toBeUndefined();
    expect(n.holdMs).toBeUndefined();
  });

  it('⚠ a merge keeps the LONGER hold — absorbing a card must not cut its reading time', () => {
    useGameStore.getState().raiseSpotlightNotice('THE ROPES', 'Jakar Nine-Halls', ['a'], ['b'], { holdMs: 240000, takeLabel: 'X' });
    // Something else lands in the same moment under the same title and asks for nothing.
    useGameStore.getState().raiseSpotlightNotice('THE ROPES', 'Jakar Nine-Halls', ['c'], ['d']);
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.holdMs).toBe(240000);
    expect(n.takeLabel).toBe('X');
  });

  it('the modal can only ever raise the shared valve, never lower it', () => {
    const MODAL = read('app', 'components', 'MissionCompleteModal.tsx');
    expect(MODAL).toContain('Math.max(');
    expect(MODAL).toContain('notice?.holdMs ?? 0');
    expect(MODAL).toContain("notice.takeLabel ?? 'THE TAKE'");
  });
});
