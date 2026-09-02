// OTA-1166 — ARRIVING SOMEWHERE MEANS FINDING SOMEONE.
//
// Owner: "once you reach that location it spawns a set number, say three groups within
// five blocks of you in different directions, so that you always have a chance of running
// into them… those three groups are now actively hunting you… that eliminates the wait
// factor. now it's just how well are you geared up. nobody knows that we're prepping you.
// they still think they found them, or they found you."
//
// ⚠ THIS REPLACES A WORKAROUND. A bounty's real cost was WAITING: `maybePatrolAmbush`
// won't fire twice inside a 6-hour cooldown, and only fires at all if a patrol of the
// right faction is within 2 tiles — so a player could arrive on time, play perfectly, and
// meet nobody. OTA-1165 answered that by widening the DEADLINE, which bought time to keep
// waiting rather than removing the wait. Owner: "sometimes we spend an hour going back and
// forth on the best way to step around that cardboard box instead of just picking it up."

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
  quarrySeedCells, arrivalBeat, QUARRY_GROUPS, QUARRY_RING_MIN, QUARRY_RING_MAX,
} from '../app/engine/quarrySeed';
import { patrolsNear } from '../app/engine/worldEvents';
import { useGameStore } from '../app/state/gameStore';
import { canonicalCellOf } from '../app/engine/worldMap';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');

const dist = (a: { gx: number; gy: number }, x: number, y: number) =>
  Math.abs(a.gx - x) + Math.abs(a.gy - y);

describe('OTA-1166 — where the groups are placed', () => {
  it('places the owner’s three', () => {
    expect(QUARRY_GROUPS).toBe(3);
    expect(quarrySeedCells(0, 0, QUARRY_GROUPS, 1).length).toBe(3);
  });

  it('⚠ NONE OF THEM LANDS ON TOP OF THE PLAYER', () => {
    // A group at distance 0-1 would engage on the very next action and read as an ambush
    // waiting at the gate, not a hunt. They have to CLOSE first.
    for (let salt = 0; salt < 40; salt++) {
      for (const c of quarrySeedCells(10, 10, QUARRY_GROUPS, salt)) {
        expect(dist(c, 10, 10)).toBeGreaterThanOrEqual(QUARRY_RING_MIN);
      }
    }
  });

  it('⚠ AND NONE IS FURTHER OUT THAN THE RING — "within five blocks"', () => {
    for (let salt = 0; salt < 40; salt++) {
      for (const c of quarrySeedCells(10, 10, QUARRY_GROUPS, salt)) {
        // Manhattan across two axes, so the bound is the major plus its minor share.
        expect(dist(c, 10, 10)).toBeLessThanOrEqual(QUARRY_RING_MAX * 2);
      }
    }
  });

  it('⚠ IN DIFFERENT DIRECTIONS — the whole point of the spread', () => {
    // Three groups bunched on one side leaves a clean escape and a player who walks the
    // wrong way meets nobody, which is the failure this OTA exists to prevent.
    for (let salt = 0; salt < 40; salt++) {
      const cells = quarrySeedCells(10, 10, QUARRY_GROUPS, salt);
      const quadrants = new Set(cells.map((c) => `${Math.sign(c.gx - 10)},${Math.sign(c.gy - 10)}`));
      expect(quadrants.size).toBe(QUARRY_GROUPS);
    }
  });

  it('two contracts on the same outpost do not lay the identical ring', () => {
    const a = quarrySeedCells(10, 10, QUARRY_GROUPS, 5);
    const b = quarrySeedCells(10, 10, QUARRY_GROUPS, 6);
    expect(a).not.toEqual(b);
  });

  it('is deterministic — the same salt gives the same ring', () => {
    expect(quarrySeedCells(3, 4, QUARRY_GROUPS, 99)).toEqual(quarrySeedCells(3, 4, QUARRY_GROUPS, 99));
  });

  it('each group gets its own wander phase, so they do not move as one blob', () => {
    const cells = quarrySeedCells(0, 0, QUARRY_GROUPS, 12);
    expect(new Set(cells.map((c) => c.phase)).size).toBe(QUARRY_GROUPS);
  });

  it('a nonsense count is handled rather than throwing', () => {
    expect(quarrySeedCells(0, 0, 0, 1)).toEqual([]);
    expect(quarrySeedCells(0, 0, -3, 1)).toEqual([]);
  });
});

describe('OTA-1166 — the arrival beat', () => {
  const line = arrivalBeat('Mud Monarchs', 'Monarch Waystation');

  it('says you have arrived and tells you to look', () => {
    expect(line).toContain('Monarch Waystation');
    expect(line).toContain('Mud Monarchs');
    expect(line).toMatch(/eyes up|walk it|look/i);
  });

  it('⚠ NEVER ADMITS THE PLACEMENT — the player must believe they found them', () => {
    // Owner: "nobody knows that we're prepping you. they still think they found them."
    expect(line).not.toMatch(/spawn|placed|three groups|generated/i);
  });
});

describe('OTA-1166 — seeding on arrival', () => {
  const BOUNTY = {
    giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers Guild',
    targetFactionId: 'mud_monarchs', targetName: 'Mud Monarchs',
    targetLocationId: 'monarch_waystation', targetLocationName: 'Monarch Waystation',
    count: 3, progress: 0, rewardTc: 50, rewardRep: 8,
  };

  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Seed', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    useGameStore.setState({ frozenBoard: null });
  });

  const acceptAndTeleport = () => {
    useGameStore.getState().toggleBoardFreeze();
    useGameStore.getState().acceptBounty(BOUNTY as never);
    // Stand the player on the contract's ground without walking there.
    const t = canonicalCellOf(BOUNTY.targetLocationId);
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, gridX: t.x, gridY: t.y, currentLocationId: BOUNTY.targetLocationId } as never });
  };

  it('⚠ ARRIVING PUTS THE QUARRY ON THE GROUND', async () => {
    acceptAndTeleport();
    const before = (useGameStore.getState().worldMemory.patrols ?? []).filter((p) => p.factionId === 'mud_monarchs').length;
    await useGameStore.getState().submitPlayerAction('look around');
    const after = (useGameStore.getState().worldMemory.patrols ?? []).filter((p) => p.factionId === 'mud_monarchs');
    expect(after.length).toBeGreaterThanOrEqual(before + QUARRY_GROUPS);
  });

  it('⚠ ONE-SHOT — walking in and out does not re-arm the trap', async () => {
    acceptAndTeleport();
    await useGameStore.getState().submitPlayerAction('look around');
    const afterFirst = (useGameStore.getState().worldMemory.patrols ?? []).length;
    expect(useGameStore.getState().player!.activeBounties![0]!.quarrySeeded).toBe(true);
    await useGameStore.getState().submitPlayerAction('look around');
    await useGameStore.getState().submitPlayerAction('look around');
    // Ordinary upkeep may add patrols; what must NOT happen is another burst of three
    // Monarchs appearing every single action.
    const monarchs = (useGameStore.getState().worldMemory.patrols ?? []).filter((p) => p.factionId === 'mud_monarchs').length;
    expect(monarchs).toBeLessThan(afterFirst + QUARRY_GROUPS);
  });

  it('the groups land inside the ring, so a couple of steps can reach one', async () => {
    acceptAndTeleport();
    const t = canonicalCellOf(BOUNTY.targetLocationId);
    await useGameStore.getState().submitPlayerAction('look around');
    const near = patrolsNear(useGameStore.getState().worldMemory.patrols ?? [], t.x, t.y, QUARRY_RING_MAX * 2);
    expect(near.filter((p) => p.factionId === 'mud_monarchs').length).toBeGreaterThanOrEqual(QUARRY_GROUPS);
  });

  it('⚠ NOT SEEDED WHEN YOU ARE NOT ON THE CONTRACT’S GROUND', async () => {
    useGameStore.getState().toggleBoardFreeze();
    useGameStore.getState().acceptBounty(BOUNTY as never);
    // Deliberately do NOT move to the target.
    await useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().player!.activeBounties![0]!.quarrySeeded).toBeFalsy();
  });
});

describe('OTA-1166 — it is wired everywhere a player can arrive', () => {
  it('⚠ TWO CALL SITES, AND THE REDUNDANCY IS THE POINT', () => {
    // The travel-arrival hook only covers AUTOROUTED arrivals; a player walking the
    // last tiles with typed cardinals would reach the outpost and find nothing. The
    // per-action catch-all closes that. One-shot makes the overlap free.
    // ⚠ OTA-1632 — three became two: setTravelCourse no longer takes a first step
    // itself, so its own arrival hook went with the step. continueTravel's and the
    // per-action catch-all remain.
    const calls = STORE.match(/maybeSeedQuarry\(get, set\)/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('nothing new engages them — they use the ordinary patrol machinery', () => {
    // The seeded groups go into worldMemory.patrols and are picked up by
    // maybePatrolAmbush, which already skips the hunt roll for a bounty target. If this
    // ever grew its own engagement path, the seeding would stop being undetectable.
    const i = STORE.indexOf('function maybeSeedQuarry');
    const body = STORE.slice(i, STORE.indexOf('function maybePatrolAmbush', i));
    expect(body).toContain('patrols:');
    expect(body).not.toContain('injectFactionParty');
  });
});
