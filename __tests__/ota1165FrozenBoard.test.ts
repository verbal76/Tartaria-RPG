// OTA-1165 — THE BOARD YOU FROZE IS THE DEAL YOU GET.
//
// Owner: "if you see that faction bounty is allied with the faction that you're trying to
// build rep with… and accept that bounty then it locks it in. so even if they go to war
// one second later, you still had that locked in faction standing outcome."
// And on the cycle: "clear memory, save snapshot, unlock bounties… has bounty been
// accepted? yes cool unpause — it does that automatically in the background."
//
// ⚠ THE DEFECT THIS CLOSES IS TWO SYSTEMS DISAGREEING ABOUT WHO IS ALLIED WITH WHOM.
// `worldMemory.factionRelations` is a LIVE, symmetric matrix that patrols move as they gut
// each other — it is what GRUDGES & ALLIANCES shows and what decides who fights whom.
// `factions.json`'s allies/rivals arrays are static, hand-written and ASYMMETRIC. The
// player's standing spillover read the STATIC one. Owner: "which one is the truth?"

jest.setTimeout(30000);
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

import {
  politicsOf, canAcceptBounty, refusalLine, killWindowHours, HOURS_PER_REQUIRED_KILL,
} from '../app/engine/bountyPolitics';
import { adjustRelation, FRIENDLY_AT, HOSTILE_AT } from '../app/engine/factionRelations';
import type { RelationsMatrix } from '../app/engine/factionRelations';
import { applyRepChange } from '../app/engine/factions';
import { bountyDeadlineFor, BOUNTY_DEADLINE_HOURS } from '../app/engine/factionBounty';
import { useGameStore } from '../app/state/gameStore';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const WORLD = read('app', 'screens', 'WorldScreen.tsx');

const IDS = ['a', 'b', 'c', 'd'];

describe('OTA-1165 — the live matrix decides who is a friend', () => {
  it('⚠ SYMMETRIC FOR FREE — the thing the static JSON could never be', () => {
    // The JSON is one-way: Forgotten Order lists the Reclaimers, the Reclaimers list
    // nobody. The matrix writes every pair under BOTH keys, so this cannot happen.
    let m: RelationsMatrix = {};
    m = adjustRelation(m, 'a', 'b', FRIENDLY_AT + 5);
    expect(politicsOf(m, 'a', IDS, 0).allies).toContain('b');
    expect(politicsOf(m, 'b', IDS, 0).allies).toContain('a');
  });

  it('reads the live thresholds, not a hand-written list', () => {
    let m: RelationsMatrix = {};
    m = adjustRelation(m, 'a', 'b', FRIENDLY_AT);      // exactly friendly
    m = adjustRelation(m, 'a', 'c', HOSTILE_AT);       // exactly hostile
    m = adjustRelation(m, 'a', 'd', 1);                // wary peace — neither
    const p = politicsOf(m, 'a', IDS, 7);
    expect(p.allies).toEqual(['b']);
    expect(p.rivals).toEqual(['c']);
    expect(p.takenAtHour).toBe(7);
  });

  it('a faction is never its own ally or rival', () => {
    const p = politicsOf({}, 'a', IDS, 0);
    expect(p.allies).not.toContain('a');
    expect(p.rivals).not.toContain('a');
  });
});

describe('OTA-1165 — applyRepChange honours a frozen snapshot', () => {
  const standing = [
    { factionId: 'reclaimers_guild', standing: 0 },
    { factionId: 'forgotten_order', standing: 0 },
    { factionId: 'mud_monarchs', standing: 0 },
  ];

  it('⚠ THE SNAPSHOT WINS OVER THE STATIC ARRAYS', () => {
    // Forgotten Order's JSON allies are [reclaimers_guild]. The override says otherwise,
    // and the override is what a contract froze at accept.
    const out = applyRepChange(standing, 'forgotten_order', 10, {
      allies: ['mud_monarchs'], rivals: ['reclaimers_guild'],
    });
    const by = Object.fromEntries(out.standing.map((s) => [s.factionId, s.standing]));
    expect(by.forgotten_order).toBe(10);
    expect(by.mud_monarchs).toBe(5);        // ally per the snapshot
    expect(by.reclaimers_guild).toBe(-5);   // rival per the snapshot
  });

  it('omitting the override keeps the old static behaviour exactly', () => {
    const out = applyRepChange(standing, 'forgotten_order', 10);
    const by = Object.fromEntries(out.standing.map((s) => [s.factionId, s.standing]));
    expect(by.forgotten_order).toBe(10);
    expect(by.reclaimers_guild).toBe(5);    // the JSON ally
  });

  it('an empty snapshot means NO spillover, and is not mistaken for "no snapshot"', () => {
    // A giver with no friends and no enemies is a real state the matrix can produce.
    const out = applyRepChange(standing, 'forgotten_order', 10, { allies: [], rivals: [] });
    const by = Object.fromEntries(out.standing.map((s) => [s.factionId, s.standing]));
    expect(by.forgotten_order).toBe(10);
    expect(by.reclaimers_guild).toBe(0);
  });
});

describe('OTA-1165 — the deadline finally prices the WAITING', () => {
  it('⚠ a 9-kill job no longer gets a 3-kill job’s time', () => {
    // The patrol cooldown puts a hard 6h floor between engagements, so this was the
    // missing term: same distance, same clock, three times the work.
    const three = bountyDeadlineFor(10, 3);
    const nine = bountyDeadlineFor(10, 9);
    expect(nine).toBeGreaterThan(three);
    expect(nine - three).toBe(6 * HOURS_PER_REQUIRED_KILL);
  });

  it('the three terms are base + travel + job', () => {
    expect(bountyDeadlineFor(10, 4)).toBe(BOUNTY_DEADLINE_HOURS + 25 + killWindowHours(4));
  });

  it('omitting count is the old two-term number — every legacy caller still works', () => {
    expect(bountyDeadlineFor(10)).toBe(BOUNTY_DEADLINE_HOURS + 25);
  });

  it('the base still floors it', () => {
    expect(bountyDeadlineFor(0, 0)).toBe(BOUNTY_DEADLINE_HOURS);
    expect(bountyDeadlineFor(-5, -5)).toBe(BOUNTY_DEADLINE_HOURS);
  });
});

describe('OTA-1165 — every refusal names itself', () => {
  const base = { atTargetCell: false, targetLocationName: 'Varakush', boardFrozen: true };

  it('⚠ STANDING ON THE TARGET — the 0-tile contract that started all of this', () => {
    const v = canAcceptBounty({ ...base, atTargetCell: true });
    expect(v.ok).toBe(false);
    expect(refusalLine(v)).toMatch(/standing in Varakush/);
  });

  it('⚠ CAMPING — no repeat work from a board you just collected on', () => {
    const v = canAcceptBounty({
      ...base, currentOutpostId: 'varakush', currentOutpostName: 'Varakush',
      lastClearedOutpostId: 'varakush',
    });
    expect(v.ok).toBe(false);
    expect(refusalLine(v)).toMatch(/somewhere else/i);
  });

  it('clearing elsewhere lifts the camp lock', () => {
    const v = canAcceptBounty({
      ...base, currentOutpostId: 'varakush', lastClearedOutpostId: 'reclaimer_stake',
    });
    expect(v.ok).toBe(true);
  });

  it('⚠ BOARD RUNNING — and the line POINTS AT THE BUTTON', () => {
    // Owner: "a pop-up that wording guides you down to that pause button."
    const v = canAcceptBounty({ ...base, boardFrozen: false });
    expect(v.ok).toBe(false);
    expect(refusalLine(v)).toMatch(/FREEZE THE BOARD/);
    expect(refusalLine(v)).toMatch(/GRUDGES & ALLIANCES/);
  });

  it('⚠ ORDER: a fixable reason beats the freeze nag', () => {
    // Standing on the target while the board runs should say STANDING ON THE TARGET —
    // sending them to freeze a board that will refuse them anyway is a wasted round trip.
    const v = canAcceptBounty({ ...base, atTargetCell: true, boardFrozen: false });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('standing_on_target');
  });

  it('a clean accept passes', () => {
    expect(canAcceptBounty(base).ok).toBe(true);
  });

  it('refusalLine returns null for a pass — nothing to say', () => {
    expect(refusalLine({ ok: true })).toBeNull();
  });
});

describe('OTA-1165 — the freeze cycle', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Freeze', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    // ⚠ The freeze is store-level transient state, so it does NOT reset with a new game.
    // Clearing it here is test hygiene, not a workaround: the first draft of this suite
    // leaked a snapshot across describe blocks and two tests failed for the wrong reason.
    useGameStore.setState({ frozenBoard: null });
  });

  it('starts unfrozen, and toggles both ways', () => {
    expect(useGameStore.getState().frozenBoard).toBeNull();
    useGameStore.getState().toggleBoardFreeze();
    expect(useGameStore.getState().frozenBoard).toBeTruthy();
    useGameStore.getState().toggleBoardFreeze();
    expect(useGameStore.getState().frozenBoard).toBeNull();
  });

  it('⚠ EVERY PRESS DISCARDS THE OLD SNAPSHOT AND TAKES A FRESH ONE', () => {
    // Owner: "an automatic wipe and reset and recapture — that way you're never looking
    // at old data."
    useGameStore.getState().toggleBoardFreeze();
    const first = useGameStore.getState().frozenBoard;
    useGameStore.getState().toggleBoardFreeze(); // release
    // The war moves on...
    useGameStore.setState((s) => ({ worldMemory: {
      ...s.worldMemory,
      factionRelations: adjustRelation(s.worldMemory.factionRelations ?? {}, 'mud_monarchs', 'forgotten_order', 90),
    } }));
    useGameStore.getState().toggleBoardFreeze(); // re-freeze
    const second = useGameStore.getState().frozenBoard;
    expect(second).toBeTruthy();
    expect(second!.relations).not.toEqual(first!.relations);
  });

  it('⚠ IT IS NEVER PERSISTED — a frozen board must not survive a reload', () => {
    // It is transient state on the store, not in worldMemory or on the player.
    expect(STORE).toContain('frozenBoard: null,');
    expect(STORE).not.toMatch(/worldMemory[^\n]*frozenBoard/);
  });

  it('⚠ LEAVING THE WORLD SCREEN RELEASES IT — no spending a stale snapshot', () => {
    // Hold the board, wander off, come back: the snapshot must be gone, or a contract
    // could lock in politics from before the war moved.
    useGameStore.getState().toggleBoardFreeze();
    expect(useGameStore.getState().frozenBoard).toBeTruthy();
    useGameStore.getState().setScreen('exploration');
    expect(useGameStore.getState().frozenBoard).toBeNull();
  });

  it('...but moving around WITHIN the world screen keeps it', () => {
    useGameStore.getState().toggleBoardFreeze();
    useGameStore.getState().setScreen('world');
    expect(useGameStore.getState().frozenBoard).toBeTruthy();
  });
});

describe('OTA-1165 — accepting is gated, and accepting releases', () => {
  const OFFER = {
    giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers Guild',
    targetFactionId: 'mud_monarchs', targetName: 'Mud Monarchs',
    targetLocationId: 'monarch_waystation', targetLocationName: 'Monarch Waystation',
    count: 4, progress: 0, rewardTc: 100, rewardRep: 9,
  };

  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Gate', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    // ⚠ The freeze is store-level transient state, so it does NOT reset with a new game.
    // Clearing it here is test hygiene, not a workaround: the first draft of this suite
    // leaked a snapshot across describe blocks and two tests failed for the wrong reason.
    useGameStore.setState({ frozenBoard: null });
  });

  it('⚠ A RUNNING BOARD REFUSES — and says so rather than failing silently', () => {
    expect(useGameStore.getState().frozenBoard).toBeNull();
    useGameStore.getState().acceptBounty(OFFER as never);
    expect((useGameStore.getState().player!.activeBounties ?? []).length).toBe(0);
    const notice = useGameStore.getState().contractsNotice;
    expect(notice?.text ?? '').toMatch(/FREEZE THE BOARD/);
  });

  it('frozen → accepted, politics stamped, and the freeze auto-releases', () => {
    useGameStore.getState().toggleBoardFreeze();
    useGameStore.getState().acceptBounty(OFFER as never);
    const held = useGameStore.getState().player!.activeBounties ?? [];
    expect(held.length).toBe(1);
    expect(held[0]!.politics).toBeTruthy();
    expect(Array.isArray(held[0]!.politics!.allies)).toBe(true);
    // ⚠ Owner: "once you accept the bounty it automatically unfreezes."
    expect(useGameStore.getState().frozenBoard).toBeNull();
  });

  it('the stamped deadline includes the kill term', () => {
    useGameStore.getState().toggleBoardFreeze();
    useGameStore.getState().acceptBounty(OFFER as never);
    const held = useGameStore.getState().player!.activeBounties![0]!;
    expect(held.deadlineHours!).toBeGreaterThanOrEqual(BOUNTY_DEADLINE_HOURS + killWindowHours(OFFER.count));
  });
});

describe('OTA-1165 — the board quotes what it will charge', () => {
  it('⚠ the offer card passes `count` to the estimate', () => {
    // It did not, so a card advertised a shorter window than the accepted contract
    // carried — the same defect class as a vendor showing a price it does not charge.
    expect(WORLD).toContain('bountyDeadlineFor(tiles, offer.count)');
    expect(WORLD).not.toContain('bountyDeadlineFor(canonicalDistanceFromGrid(cell.x, cell.y, targetLocationId))');
  });

  it('the ACCEPT button stays live when locked, so the tap can explain itself', () => {
    // Owner: "it shouldn't be dead… you should get the buzz." A disabled control that
    // explains nothing is the OTA-1164 defect wearing a different hat.
    expect(WORLD).toContain('FREEZE THE BOARD TO ACCEPT');
    expect(WORLD).not.toMatch(/disabled=\{!frozen\}/);
    expect(STORE).toMatch(/buzzBlocked\(\);\s*\n\s*return;/);
  });
});
