// ⚠⚠ OTA-1357 — THE ACTIVE MISSION GLOWS, AND THE TOWERS BEHAVE LIKE MISSIONS.
//
// Three asks from the owner, all about the CONTRACTS slate:
//   1. "the set active bottons should glow on missions"
//   2. "the great climbs should be able to be activated and deactivated"
//   3. "the[y] should get sorted by distance as well"
//
// (1) was a legibility bug: active and paused differed only by hue — teal border
// vs grey border — which you have to hunt for down a long slate. The active one
// now lights up (tinted fill, brighter border, box glow, text halo).
//
// (2) was a real one-way door. `routedClimbId` has been the "tower you're
// running" flag since OTA-1306, but SET COURSE was the only thing that could
// raise it and NOTHING could lower it by hand — so a tower you'd walked away
// from stayed the mission you were on until you activated some other contract.
//
// ⚠ AND (2) EXPOSED A HOLE WORTH MORE THAN THE FEATURE. setFactionQuestActive
// has cleared `routedClimbId` all along, but setContractActive's identical
// single-active sweep never did — so activating a hunt / mystery / storyline
// left the tower still flagged. Invisible while nothing rendered the flag; the
// moment the climb cards grew an ACTIVE pill it would show two live missions at
// once. Closed here, with the test that would have caught it.
//
// (3) was a section that quietly opted out: every other list has obeyed the sort
// bar since OTA-1152, the five towers alone rendered in fixed catalog order.
import React from 'react';

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

import { useGameStore } from '../app/state/gameStore';
import { GREAT_CLIMBS } from '../app/engine/greatClimbs';
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): {
    toJSON(): unknown;
    unmount(): void;
    root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] };
  };
};

jest.setTimeout(180_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const SCENE = {
  location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
  ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
  enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
};

async function freshPlayer(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: 'Toggler', raceId: 'aetherborn', factionId: 'eternal_dynasty',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().skipTutorial?.();
  useGameStore.setState((s) => (s.player ? {
    tutorialStep: null,
    currentScene: SCENE,
    player: {
      ...s.player, hubRoomId: null, stamina: 200, staminaMax: 200,
      currentLocationId: 'tartarian_outskirts', routedClimbId: null, travelTarget: null,
    },
  } : s) as never);
}

/** Unlock every tower's chart — the state a player is in once they've read all five. */
const unlockAll = (): void => {
  useGameStore.setState((s) => ({
    worldMemory: { ...s.worldMemory, unlockedGreatClimbs: GREAT_CLIMBS.map((c) => c.id), summitBossesDefeated: [] },
  }));
};

describe('OTA-1357 — the towers toggle, and the active mission glows', () => {
  it('⚠⚠ THE OWNER\'S ASK: a tower can be ACTIVATED — and activating is not routing', async () => {
    await freshPlayer();
    unlockAll();
    const climb = GREAT_CLIMBS[0]!;
    useGameStore.getState().setGreatClimbActive(climb.id, true);
    const p = useGameStore.getState().player!;
    expect(p.routedClimbId).toBe(climb.id);
    // ⚠ SET ACTIVE must not drag you across the map. Routing is the separate
    // SET COURSE button; choosing the mission you're on lays no course.
    expect(p.travelTarget ?? null).toBeNull();
  });

  it('⚠⚠ ...and DEACTIVATED — the tower stays on the slate, any course survives', async () => {
    await freshPlayer();
    unlockAll();
    const climb = GREAT_CLIMBS[1]!;
    useGameStore.getState().routeGreatClimb(climb.id);
    expect(useGameStore.getState().player!.routedClimbId).toBe(climb.id);
    const course = useGameStore.getState().player!.travelTarget?.locationId ?? null;
    expect(course).toBe(climb.locationId);

    useGameStore.getState().setGreatClimbActive(climb.id, false);
    const p = useGameStore.getState().player!;
    expect(p.routedClimbId ?? null).toBeNull();
    // Stood down, NOT abandoned: the chart is still read, so the card is still there.
    expect((useGameStore.getState().worldMemory.unlockedGreatClimbs ?? [])).toContain(climb.id);
    // A course already laid keeps its legs — same as a deactivated contract's.
    expect(p.travelTarget?.locationId ?? null).toBe(course);
  });

  it('⚠ the toggle flips both ways with no explicit flag', async () => {
    await freshPlayer();
    unlockAll();
    const climb = GREAT_CLIMBS[2]!;
    useGameStore.getState().setGreatClimbActive(climb.id);
    expect(useGameStore.getState().player!.routedClimbId).toBe(climb.id);
    useGameStore.getState().setGreatClimbActive(climb.id);
    expect(useGameStore.getState().player!.routedClimbId ?? null).toBeNull();
  });

  it('⚠ activating a tower is SINGLE-ACTIVE — every other contract stands down', async () => {
    await freshPlayer();
    unlockAll();
    useGameStore.setState((s) => (s.player ? {
      player: {
        ...s.player,
        activeHunts: [{ id: 'h1', tracked: true }] as never,
        activeMysteries: [{ id: 'm1', tracked: true }] as never,
        activeStorylines: [{ id: 's1', tracked: true }] as never,
      },
    } : s));
    useGameStore.getState().setGreatClimbActive(GREAT_CLIMBS[3]!.id, true);
    const p = useGameStore.getState().player!;
    for (const rec of [...(p.activeFactionQuests ?? []), ...(p.activeHunts ?? []),
                       ...(p.activeMysteries ?? []), ...(p.activeStorylines ?? [])]) {
      expect((rec as { tracked?: boolean }).tracked).toBe(false);
    }
    expect(p.routedClimbId).toBe(GREAT_CLIMBS[3]!.id);
  });

  it('⚠⚠ THE HOLE THE TOGGLE EXPOSED: activating a hunt clears the routed tower', async () => {
    // Before this OTA setContractActive's single-active sweep parked every list
    // but left `routedClimbId` standing — two live missions, one of them invisible.
    await freshPlayer();
    unlockAll();
    useGameStore.setState((s) => (s.player ? {
      player: { ...s.player, activeHunts: [{ id: 'h1', tracked: false }] as never },
    } : s));
    useGameStore.getState().setGreatClimbActive(GREAT_CLIMBS[0]!.id, true);
    expect(useGameStore.getState().player!.routedClimbId).toBe(GREAT_CLIMBS[0]!.id);

    useGameStore.getState().setContractActive('hunt', 'h1', true);
    expect(useGameStore.getState().player!.routedClimbId ?? null).toBeNull();
  });

  it('⚠ an unread chart and a crowned tower both refuse activation', async () => {
    await freshPlayer();
    // Chart unread — no cards, nothing to activate.
    useGameStore.setState((s) => ({ worldMemory: { ...s.worldMemory, unlockedGreatClimbs: [], summitBossesDefeated: [] } }));
    useGameStore.getState().setGreatClimbActive(GREAT_CLIMBS[0]!.id, true);
    expect(useGameStore.getState().player!.routedClimbId ?? null).toBeNull();
    // Crowned — finished work can't be the mission you're on.
    unlockAll();
    useGameStore.setState((s) => ({ worldMemory: { ...s.worldMemory, summitBossesDefeated: [GREAT_CLIMBS[0]!.id] } }));
    useGameStore.getState().setGreatClimbActive(GREAT_CLIMBS[0]!.id, true);
    expect(useGameStore.getState().player!.routedClimbId ?? null).toBeNull();
  });

  // ── The rendered slate ────────────────────────────────────────────────────
  /** Every text string in the tree, in document order. */
  function texts(node: unknown, out: string[] = []): string[] {
    if (node == null) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { for (const n of node) texts(n, out); return out; }
    const kids = (node as { children?: unknown }).children;
    if (kids != null) texts(kids, out);
    return out;
  }
  /** The same walk over UNRENDERED React elements, whose text hides under `props`. */
  function elementTexts(node: unknown, out: string[] = []): string[] {
    if (node == null) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { for (const n of node) elementTexts(n, out); return out; }
    const props = (node as { props?: { children?: unknown } }).props;
    if (props?.children != null) elementTexts(props.children, out);
    return out;
  }
  /** The climbs section's cards, in rendered order, with the moves each card shows. */
  function climbRows(tree: { toJSON(): unknown }): { noun: string; moves: number }[] {
    const all = texts(tree.toJSON());
    const start = all.findIndex((t) => t.includes('THE GREAT CLIMBS'));
    expect(start).toBeGreaterThan(-1);
    const after = all.slice(start + 1);
    const stop = after.findIndex((t) => t.includes('MILESTONES'));
    const section = stop === -1 ? after : after.slice(0, stop);
    const nouns = new Set(GREAT_CLIMBS.map((c) => c.noun));
    const rows: { noun: string; moves: number }[] = [];
    for (const t of section) {
      if (nouns.has(t)) { rows.push({ noun: t, moves: Number.NaN }); continue; }
      const m = /^(\d+) moves? away$/.exec(t);
      const here = t === 'you are here';
      if ((m || here) && rows.length > 0 && Number.isNaN(rows[rows.length - 1]!.moves)) {
        rows[rows.length - 1]!.moves = here ? 0 : Number(m![1]);
      }
    }
    return rows;
  }
  function mountContracts(): { tree: { toJSON(): unknown; unmount(): void; root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] } } } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require('../app/screens/ContractsScreen').ContractsScreen as () => React.ReactElement;
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(React.createElement(Screen)); });
    return { tree };
  }

  it('⚠⚠ THE OWNER\'S ASK: the five towers obey SORT BY DISTANCE', async () => {
    await freshPlayer();
    unlockAll();
    const { tree } = mountContracts();
    try {
      const before = climbRows(tree);
      expect(before.length).toBe(GREAT_CLIMBS.length);
      // Every card knows its own distance, or the sort has nothing to work with —
      // and the five towers really do sit at different removes, so an ordering
      // assertion below is a claim about behaviour and not a tautology.
      expect(before.every((r) => Number.isFinite(r.moves))).toBe(true);
      expect(new Set(before.map((r) => r.moves)).size).toBeGreaterThan(1);
      // Default mode is catalog order — the towers' fixed listing.
      expect(before.map((r) => r.noun)).toEqual(GREAT_CLIMBS.map((c) => c.noun));

      // Press SORT BY DISTANCE, the same button the player taps.
      const sortBtn = tree.root.findAll((n) =>
        typeof n.props.onPress === 'function' &&
        elementTexts((n.props as { children?: unknown }).children).some((t) => t.includes('SORT BY DISTANCE')));
      expect(sortBtn.length).toBeGreaterThan(0);
      renderer.act(() => { (sortBtn[0]!.props.onPress as () => void)(); });

      const after = climbRows(tree);
      expect(after.length).toBe(before.length);
      // Nearest first — and it is the SAME five cards, reordered, none dropped.
      for (let i = 1; i < after.length; i += 1) {
        expect(after[i]!.moves).toBeGreaterThanOrEqual(after[i - 1]!.moves);
      }
      expect([...after.map((r) => r.noun)].sort()).toEqual([...before.map((r) => r.noun)].sort());
      // ⚠ The exact order the shared comparator would produce — a stable sort of
      // the default order by each card's own moves. Anything else means the
      // section is running its own sort instead of the slate's.
      expect(after.map((r) => r.noun)).toEqual(
        [...before].sort((a, b) => a.moves - b.moves).map((r) => r.noun),
      );
    } finally {
      renderer.act(() => { tree.unmount(); });
    }
  });

  it('⚠⚠ the rendered climb card carries the toggle, and it reads the live flag', async () => {
    await freshPlayer();
    unlockAll();
    const first = mountContracts();
    try {
      const t = texts(first.tree.toJSON());
      const start = t.findIndex((x) => x.includes('THE GREAT CLIMBS'));
      const section = t.slice(start).join('|');
      expect(section).toContain('▶ SET ACTIVE');
      expect(section).not.toContain('▮▮ DEACTIVATE');
    } finally {
      renderer.act(() => { first.tree.unmount(); });
    }

    useGameStore.getState().setGreatClimbActive(GREAT_CLIMBS[0]!.id, true);
    const second = mountContracts();
    try {
      const t = texts(second.tree.toJSON());
      const start = t.findIndex((x) => x.includes('THE GREAT CLIMBS'));
      const section = t.slice(start).join('|');
      // The running tower offers the way back out, and says it is the live one.
      expect(section).toContain('▮▮ DEACTIVATE');
      expect(section).toContain('ACTIVE');
    } finally {
      renderer.act(() => { second.tree.unmount(); });
    }
  });

  it('⚠⚠ THE OWNER\'S ASK: the ACTIVE button glows, and every toggle site uses it', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');
    // A real glow, not just another border colour: fill + halo, on both platforms.
    const on = src.slice(src.indexOf('trackBtnOn: {'), src.indexOf('trackBtnOff:'));
    expect(on).toContain("shadowColor: '#54d6c4'");
    expect(on).toContain('shadowRadius');
    expect(on).toContain('elevation');
    expect(on).toContain('backgroundColor');
    expect(src).toContain('textShadowColor:');
    // Every toggle picks the lit style when active — the old shape only ever
    // styled the OFF state, so "active" was the absence of dressing.
    expect(src).not.toContain('!tracked && styles.trackBtnOff');
    expect(src).not.toContain('!tracked && styles.trackBtnTextOff');
    const onStyleUses = src.match(/(?:tracked|climbActive) \? styles\.trackBtnOn : styles\.trackBtnOff/g) ?? [];
    const onTextUses = src.match(/(?:tracked|climbActive) \? styles\.trackBtnTextOn : styles\.trackBtnTextOff/g) ?? [];
    // Contract toggle, faction-quest toggle, and the new climb toggle.
    expect(onStyleUses.length).toBeGreaterThanOrEqual(3);
    expect(onTextUses.length).toBeGreaterThanOrEqual(3);
  });
});
