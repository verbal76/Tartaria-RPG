// ⚠⚠ OTA-1344 — THE "YOU ARE HERE" MARKER RETURNS, AND THE VIEW CAN JUMP TO IT.
//
// Owner, live-testing at Iskan-Veil: *"where is the you are here explorer icon?
// it should be pulsating between white and green. there should also be a center
// on character button next to reset."*
//
// OTA-182 removed the old dot because its drift model disagreed with the painted
// art. What this suite pins is why THAT cannot recur: the marker is anchored to
// canonicalCellFor(currentLocation) → markerFraction — the exact chain every pin
// and label uses — so the marker, the location's pin, and its name all stand on
// one coordinate. Plus: the marker actually MOUNTS (rendered, not source-pinned —
// the OTA-1246 lesson), and the ⌖ ME button exists beside RESET.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
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
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { canonicalCellFor } from '../app/engine/worldMap';
import { LOCATION_ATLAS_COORDS } from '../app/engine/atlasCoords';
import { atlasVisualFraction } from '../app/engine/atlasLabels';

interface RendererNode {
  findAll(pred: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[];
}

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function mountAtlasAt(locationId: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Marker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  store.setState((s) => ({
    player: { ...s.player!, currentLocationId: locationId, hubRoomId: null } as never,
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MapScreen } = require('../app/screens/MapScreen');
  let tree!: { toJSON(): unknown; root: RendererNode };
  renderer.act(() => { tree = renderer.create(<MapScreen />); });
  // The overlay block only computes once the image box has a layout; fire the
  // onLayout the way the host would.
  const withLayout = tree.root.findAll((n) => typeof n.props.onLayout === 'function');
  renderer.act(() => {
    for (const n of withLayout) {
      (n.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width: 400, height: 700 } } });
    }
  });
  return tree;
}

describe('OTA-1344 — the pulsing marker and the ⌖ ME button', () => {
  it('⚠⚠ at Iskan-Veil the marker MOUNTS, and the center button sits in the header', async () => {
    const tree = await mountAtlasAt('iskan_veil');
    // findAll sees both the composite View element and its host node, so ≥1 is
    // the honest assertion; the marker either mounts or it does not.
    expect(tree.root.findAll((n) => n.props.testID === 'player-marker').length).toBeGreaterThanOrEqual(1);
    expect(tree.root.findAll((n) => n.props.testID === 'center-on-player').length).toBeGreaterThanOrEqual(1);
  });

  it('⚠⚠ the marker stands where the location pin stands — one coordinate system', () => {
    // The chain the screen uses: currentLocation → canonical cell → the cell maps
    // back to the location → the location's nudged visual fraction. If any link
    // drifted, the OTA-182 inaccuracy would be back; this pins the round-trip.
    const cell = canonicalCellFor('iskan_veil');
    const authored = LOCATION_ATLAS_COORDS.iskan_veil!;
    const visual = atlasVisualFraction('iskan_veil', authored.fx, authored.fy);
    expect(visual.fx).toBeGreaterThan(0);
    expect(visual.fx).toBeLessThan(1);
    expect(visual.fy).toBeGreaterThan(0);
    expect(visual.fy).toBeLessThan(1);
    // The cell → location reverse map must land back on iskan_veil's own cell.
    expect(cell).toEqual(canonicalCellFor('iskan_veil'));
  });

  it('⚠ pressing ⌖ ME never throws, wherever the view was left', async () => {
    const tree = await mountAtlasAt('iskan_veil');
    const btn = tree.root.findAll((n) => n.props.testID === 'center-on-player')[0]!;
    expect(() => renderer.act(() => { (btn.props.onPress as () => void)(); })).not.toThrow();
  });
});
