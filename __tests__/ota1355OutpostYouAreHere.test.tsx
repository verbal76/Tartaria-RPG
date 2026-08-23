// ⚠⚠ OTA-1355 — THE MARKER WALKS THE OUTPOST: room icon, glide, and ✓ marks.
//
// Owner: *"when a player is on an outpost can we have the you are here icon
// show you what room you are in? and do the slow zoom effect as well? like
// when you first start? and can we also show the checkmark on the map for
// rooms you have explored? and if you go back in the room you explored have
// it show the icon, not the checkmark while you are in it."*
//
// Pinned here: (1) the per-skin mark table covers all nine outposts × all
// fifteen rooms with sane fractions — the artist did NOT paint every skin's
// labels in the same chambers, so a missing entry would strand a marker on
// someone else's room; (2) inside an outpost the pulsing marker MOUNTS on the
// interior art and ⌖ ME is present (rendered, not source-pinned — the
// OTA-1246 lesson); (3) visited rooms wear ✓ but the room you are STANDING in
// does not — it wears the icon; (4) the open-glide effect exists and fires
// through the same centerOnPlayer path as ⌖ ME.
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
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; root: RendererNode };
};

// ⚠⚠ OTA-1449 — CLOSE WHAT YOU OPEN. This suite mounted a screen and never
// unmounted it. The screens carry LOOPING animations (the tutorial highlight,
// the map's "you are here" ring), and a loop whose component is still mounted
// keeps ticking after the test file finishes — straight into jest tearing the
// module registry down under it. The tick then reaches freed internals and
// kills the worker, which ends the run with NO SUMMARY LINE AT ALL: no pass
// count, no fail count, nothing to notice. A test system that can die silently
// is the same defect this project spent OTA-1447 removing from its source pins.
//
// ⚠ The app itself was never at risk: every looping animation in app/ cancels
// itself in its unmount cleanup, and screens unmount normally in play. This is
// test hygiene, and it is why a dozen sibling suites already call unmount().
const _mounted: Array<{ unmount(): void }> = [];
// ⚠ Typed as the renderer's OWN create, so callers keep `.toJSON()` / `.root`
// exactly as before — the tracking is invisible to every existing assertion.
const trackedCreate = ((el: Parameters<typeof renderer.create>[0]) => {
  const tree = renderer.create(el);
  _mounted.push(tree as unknown as { unmount(): void });
  return tree;
}) as typeof renderer.create;
afterEach(() => {
  const roots = _mounted.splice(0);
  (renderer as unknown as { act(cb: () => void): void }).act(() => {
    for (const r of roots) { try { r.unmount(); } catch { /* already gone */ } }
  });
});
type RendererNode = {
  findAll(pred: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[];
};

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { OUTPOST_ROOM_MARKS, outpostRoomMark } from '../app/engine/outpostRoomMarks';
import { STRUCTURAL_IDS } from '../app/engine/outpostGraph';
import { blockAt } from '../test-utils/srcBlock';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

const NINE_FACTIONS = [
  'mud_monarchs', 'eternal_dynasty', 'forgotten_order', 'reclaimers_guild',
  'true_tartarians', 'tartarian_revivalists', 'conspiracy_architects',
  'stone_builders', 'servants_of_giants',
];

async function mountInOutpost(visited: string[]) {
  const store = useGameStore;
  await store.getState().hydrate();
  const races = getRaces();
  const factions = getFactions();
  const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;
  await store.getState().startNewGame({ name: 'Roomfinder', raceId: races[0]!.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  // Boot puts the character inside the outpost gate; pin the visited set.
  store.setState((s) => ({
    player: { ...s.player!, hubRoomId: 'outpost_gate' } as never,
    worldMemory: { ...s.worldMemory, hubVisited: visited },
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MapScreen } = require('../app/screens/MapScreen');
  let tree!: { toJSON(): unknown; root: RendererNode };
  renderer.act(() => { tree = trackedCreate(<MapScreen />); });
  const withLayout = tree.root.findAll((n) => typeof n.props.onLayout === 'function');
  renderer.act(() => {
    for (const n of withLayout) {
      (n.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width: 400, height: 700 } } });
    }
  });
  return tree;
}

describe('OTA-1355 — the outpost map knows the room you are in', () => {
  it('⚠⚠ every one of the nine skins marks all fifteen rooms with sane fractions', () => {
    expect(Object.keys(OUTPOST_ROOM_MARKS).sort()).toEqual([...NINE_FACTIONS].sort());
    for (const fid of NINE_FACTIONS) {
      for (const sid of STRUCTURAL_IDS) {
        const f = outpostRoomMark(fid, sid);
        expect(f).toBeTruthy();
        expect(f.fx).toBeGreaterThan(0.02);
        expect(f.fx).toBeLessThan(0.98);
        expect(f.fy).toBeGreaterThan(0.02);
        expect(f.fy).toBeLessThan(0.98);
      }
    }
    // Unknown faction falls back to the base skin rather than no marker at all.
    expect(outpostRoomMark('no_such_faction', 'R01')).toEqual(outpostRoomMark('reclaimers_guild', 'R01'));
  });

  it('⚠⚠ inside the outpost: the pulsing marker MOUNTS on the room, ⌖ ME is present, visited rooms wear ✓, the room you stand in does NOT', async () => {
    // Standing at the Gate (R10); Square (R01) and Armory (R06) already walked.
    const tree = await mountInOutpost(['outpost_gate', 'outpost_central', 'outpost_armory']);
    expect(tree.root.findAll((n) => n.props.testID === 'player-marker').length).toBeGreaterThanOrEqual(1);
    expect(tree.root.findAll((n) => n.props.testID === 'center-on-player').length).toBeGreaterThanOrEqual(1);
    // ⚠ OTA-1451 — RETARGETED, SAME CLAIM. The testID is `room-mark-<id>` now,
    // and the Gate HAS one, because that row also carries the 🚪 door glyph. The
    // rule this test has always asserted — the room you stand in wears the
    // marker and NOT a checkmark — is unchanged, so it is now read off the GLYPH
    // rather than counted off node presence, which is the stronger check anyway.
    // ⚠ The testID sits on the <Text> that holds the glyph, so `children` is the
    // rendered string itself — no walking, and nothing to stringify (a test
    // instance holds a Fiber, and JSON.stringify of one throws on the cycle).
    const glyphOf = (id: string): string => {
      const node = tree.root.findAll((n) => n.props.testID === `room-mark-${id}`)[0];
      return typeof node?.props.children === 'string' ? node.props.children : '';
    };
    expect(glyphOf('R01')).toContain('✓');
    expect(glyphOf('R06')).toContain('✓');
    // The current room (Gate = R10) shows the icon, not the checkmark.
    expect(glyphOf('R10')).not.toContain('✓');
    // ⚠ …and it DOES wear the door, because the Gate is the way out. Owner:
    // *"the exit doesn't feel right where it is, it should be easily noticeable."*
    expect(glyphOf('R10')).toContain('🚪');
  });

  it('⚠ ⌖ ME centers on the room without throwing (the same glide path the auto-open uses)', async () => {
    const tree = await mountInOutpost(['outpost_gate']);
    const btn = tree.root.findAll((n) => n.props.testID === 'center-on-player')[0]!;
    expect(() => renderer.act(() => { (btn.props.onPress as () => void)(); })).not.toThrow();
  });

  it('⚠ source lock: the open-glide effect exists, runs once, and rides centerOnPlayer', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'screens', 'MapScreen.tsx'), 'utf8');
    const at = src.indexOf('const autoGlided = useRef(false);');
    expect(at).toBeGreaterThan(-1);
    const effect = blockAt(src, 'const autoGlided = useRef(false);');
    expect(effect).toContain('autoGlided.current = true;');
    expect(effect).toContain('centerOnPlayer(outpostRoomMark(');
    // And the ✓ list is built from the SAME visited set the travel chips read,
    // skipping the room the player is standing in.
    expect(src).toContain("if (roomId === player.hubRoomId) continue;");
    expect(src).toContain('hubVisited ?? []');
  });
});
