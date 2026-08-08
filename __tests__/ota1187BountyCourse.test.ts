// OTA-1187 — THE SET-COURSE CONTROL TELLS YOU WHAT IT DID.
//
// Owner: "once you accept a bounty there's a separate block that asks you to auto route.
// it changes colors cuz it registers your choice but it doesn't actually auto route. but
// then when you go to missions you see it listed so it's kind of confusing. you should
// have the set auto route on both pages in case they miss it and have it disappear once
// they do it. but even when it accepts the click visually it doesn't actually set an
// auto route."
//
// ⚠ THE COLOUR WAS NEVER CONFIRMATION. `activeOpacity` dims a TouchableOpacity on any
// tap, so a silent no-op and a successful route looked identical. Reproduced before
// fixing: with the player standing on the target's own cell, setTravelCourse returned
// having set nothing AND written ZERO log lines — the only early return in that function
// without a voice.

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
  bountyCourseState, bountyCourseLabel, bountyCourseIsButton,
} from '../app/engine/bountyCourse';
import { useGameStore } from '../app/state/gameStore';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const STORE = read('app', 'state', 'gameStore.ts');
const WORLD = read('app', 'screens', 'WorldScreen.tsx');
const CONTRACTS = read('app', 'screens', 'ContractsScreen.tsx');

const nameOf = (id: string) => id.replace(/_/g, ' ');

describe('OTA-1187 — the four states of a bounty course control', () => {
  it('⚠ ARRIVED is not a button — the state the owner actually hit', () => {
    // A bounty names the outpost its quarry gathers at, and you walk there. Standing on
    // it is the ONE refusal every player is guaranteed to meet.
    const s = bountyCourseState({ currentLocationId: 'waystation' }, 'waystation', 'Waystation', nameOf, true);
    expect(s.kind).toBe('arrived');
    expect(bountyCourseIsButton(s)).toBe(false);
    expect(bountyCourseLabel(s)).toMatch(/You're at Waystation/);
  });

  it('ROUTED replaces the button with progress — "have it disappear once they do it"', () => {
    const s = bountyCourseState(
      { currentLocationId: 'home', travelTarget: { locationId: 'waystation', distanceRemaining: 5 } },
      'waystation', 'Waystation', nameOf,
    );
    expect(s.kind).toBe('routed');
    expect(bountyCourseIsButton(s)).toBe(false);
    expect(bountyCourseLabel(s)).toContain('5 tiles to go');
  });

  it('BUSY names the course you are already on, instead of silently yanking it', () => {
    const s = bountyCourseState(
      { currentLocationId: 'home', travelTarget: { locationId: 'other_camp', distanceRemaining: 3 } },
      'waystation', 'Waystation', nameOf,
    );
    expect(s.kind).toBe('busy');
    expect(bountyCourseIsButton(s)).toBe(false);
    expect(bountyCourseLabel(s)).toContain('other camp');
  });

  it('OFFER is the only tappable state', () => {
    const s = bountyCourseState({ currentLocationId: 'home' }, 'waystation', 'Waystation', nameOf, false);
    expect(s.kind).toBe('offer');
    expect(bountyCourseIsButton(s)).toBe(true);
    expect(bountyCourseLabel(s)).toBe('SET COURSE TO WAYSTATION ›');
  });

  it('a whisper course counts as busy too', () => {
    const s = bountyCourseState(
      { currentLocationId: 'home', whisperCourse: { label: 'the whisper' } },
      'waystation', 'Waystation', nameOf, false,
    );
    expect(s.kind).toBe('busy');
  });

  it('exactly one of the four states is ever a button', () => {
    const views = [
      { currentLocationId: 'waystation' },
      { currentLocationId: 'home', travelTarget: { locationId: 'waystation' } },
      { currentLocationId: 'home', travelTarget: { locationId: 'x' } },
      { currentLocationId: 'home' },
    ];
    const tappable = views.filter((v, i) =>
      bountyCourseIsButton(bountyCourseState(v, 'waystation', 'Waystation', nameOf, i === 0)));
    expect(tappable.length).toBe(1);
  });
});

describe('OTA-1187 — the store stopped failing in silence', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Course', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('⚠ REPRO — routing to the tile you stand on now SAYS SO', () => {
    // ⚠ THE FEED IS `gameLog`, NOT `log`. The first pass at this repro read `.log`,
    // which does not exist on the store — `?? []` swallowed it and every run reported
    // "zero log lines" no matter what the code did. An assertion that cannot fail is
    // worse than no assertion: it was cited as evidence. Read the real field.
    const st = () => useGameStore.getState() as unknown as { gameLog: Array<{ text: string }> };
    expect(Array.isArray(st().gameLog)).toBe(true); // the field exists — guard the guard
    const here = useGameStore.getState().player!.currentLocationId;
    const before = st().gameLog.length;
    useGameStore.getState().setTravelCourse(here);
    const added = st().gameLog.slice(before);
    expect(useGameStore.getState().player!.travelTarget).toBeFalsy(); // still correctly refuses
    expect(added.map((l) => l.text).join(' ')).toMatch(/already on it/i);
  });

  it('the destination is resolved BEFORE the same-cell compare', () => {
    // ⚠ ORDERING IS THE BUG. An id the map cannot place collapses to a default cell,
    // which can equal the player's own — so an unresolvable destination used to take the
    // silent same-cell return instead of the explanatory "not on any map" one.
    const iMap = STORE.indexOf('doesn\'t sit on any map');
    const iCell = STORE.indexOf('grid0.x === tgtCell0.x');
    expect(iMap).toBeGreaterThan(-1);
    expect(iCell).toBeGreaterThan(-1);
    expect(iMap).toBeLessThan(iCell);
  });

  it('every early return in setTravelCourse now has a voice', () => {
    const i = STORE.indexOf('setTravelCourse(locationId: string)');
    const body = STORE.slice(i, STORE.indexOf('Tungsten Spire — during the pick_city', i));
    // The only silent `return` left is the guard for a missing player/scene, which is a
    // programming precondition rather than a refusal a player can provoke.
    const silentReturns = (body.match(/^\s*if \([^)]*\) return;\s*$/gm) ?? []);
    expect(silentReturns.length).toBe(1);
    expect(silentReturns[0]).toContain('!player');
  });
});

describe('OTA-1187 — accepting a second contract routes when no road is running', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Stack', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('⚠ hadCourse reads a LIVE COURSE, not the slate', () => {
    // `slate.length > 0` conflated "you hold a contract" with "you are walking
    // somewhere" — and travelTarget is cleared on ARRIVAL. So once you reached your first
    // contract's outpost, every later contract silently refused to route while the
    // Arbiter said "your current course holds" over a course that no longer existed.
    expect(STORE).toContain('const hadCourse = !!player.travelTarget || !!player.whisperCourse;');
    expect(STORE).not.toContain('const hadCourse = slate.length > 0;');
  });

  it('a stacked contract still does not yank a LIVE course', () => {
    const b = (loc: string) => ({
      giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers Guild',
      targetFactionId: 'mud_monarchs', targetName: 'Mud Monarchs',
      targetLocationId: loc, targetLocationName: loc,
      count: 3, progress: 0, rewardTc: 50, rewardRep: 8,
    });
    // ⚠ OTA-1188 — accepting now requires a FROZEN BOARD: the contract stamps the
    // politics it was signed under, so there must be a snapshot to stamp. The freeze
    // AUTO-RELEASES on accept, which is why it is re-taken before each one.
    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty(b('monarch_waystation') as never);
    const first = useGameStore.getState().player!.travelTarget;
    expect(first).toBeTruthy(); // the first contract routed

    useGameStore.getState().toggleBoardFreeze(); useGameStore.getState().acceptBounty(b('dynasty_hold') as never);
    // Still pointed at the FIRST contract — stacking must not divert a live road.
    expect(useGameStore.getState().player!.travelTarget?.locationId).toBe(first!.locationId);
  });
});

describe('OTA-1187 — both screens share one state machine', () => {
  it('neither screen renders an unconditional set-course control any more', () => {
    for (const [nameStr, src] of [['WorldScreen', WORLD], ['ContractsScreen', CONTRACTS]] as const) {
      expect(`${nameStr}:${src.includes('bountyCourseState')}`).toBe(`${nameStr}:true`);
      expect(`${nameStr}:${src.includes('bountyCourseIsButton')}`).toBe(`${nameStr}:true`);
    }
  });

  it('⚠ the Contracts card is no longer a button when there is nothing to do', () => {
    // The whole card was a Pressable that set a course, and stayed one even when the tap
    // could not work — while the card still read "tap to set course".
    expect(CONTRACTS).toContain('disabled={!canRoute}');
    // ⚠ Scoped to the JSX line, not the bare phrase — the OTA's own comment quotes the
    // old wording, and a loose match flags my explanation as the defect. Third time this
    // pattern has bitten in this session; assert on what shipped, not on prose about it.
    expect(CONTRACTS).not.toContain('standing · tap to set course');
  });

  it('the shared module is the only place the labels live', () => {
    // A literal in a screen is how the two drift apart again.
    expect(WORLD).not.toContain('SET COURSE TO {b.targetLocationName.toUpperCase()}');
    expect(bountyCourseLabel({ kind: 'offer', locationName: 'X' })).toContain('SET COURSE TO X');
  });
});
