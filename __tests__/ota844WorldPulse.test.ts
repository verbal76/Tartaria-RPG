// OTA-844 [world that moves offscreen] — the WORLD PULSE. Tartaria used to sit still
// between the player's actions; now, every in-game day or so, one faction's fortunes
// rise (pressing rivals, lifting allies) and a rumour reaches the player. Deterministic
// (the tick index selects the mover) so it's reproducible + testable.

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

import { nextWorldTide, tideLabel, TIDE_MIN, TIDE_MAX, type FactionMeta } from '../app/engine/worldPulse';
import { useGameStore } from '../app/state/gameStore';

const FACTIONS: FactionMeta[] = [
  { id: 'a', name: 'Alphas', rivals: ['b'], allies: ['c'] },
  { id: 'b', name: 'Betas', rivals: ['a'] },
  { id: 'c', name: 'Gammas' },
];

describe('OTA-844 (1) — nextWorldTide is deterministic', () => {
  it('the tick index selects the mover; the mover rises, its rival falls, its ally rises', () => {
    const r = nextWorldTide(FACTIONS, {}, 0); // tick 0 → mover = Alphas
    expect(r.moverId).toBe('a');
    expect(r.tides.a).toBe(1);
    expect(r.tides.b).toBe(-1); // rival
    expect(r.tides.c).toBe(1);  // ally
    expect(r.rumor).toContain('Alphas');
    expect(r.rumor).toContain('Betas'); // the rival that gave ground
  });

  it('same (factions, tides, tickIndex) → same result (reproducible)', () => {
    expect(nextWorldTide(FACTIONS, {}, 4)).toEqual(nextWorldTide(FACTIONS, {}, 4));
  });

  it('momentum is clamped to [TIDE_MIN, TIDE_MAX]', () => {
    const r = nextWorldTide(FACTIONS, { a: TIDE_MAX, b: TIDE_MIN }, 0);
    expect(r.tides.a).toBe(TIDE_MAX); // already maxed, stays
    expect(r.tides.b).toBe(TIDE_MIN); // already floored, stays
  });

  it('no factions → no mover, empty rumour', () => {
    const r = nextWorldTide([], {}, 0);
    expect(r.moverId).toBeNull();
    expect(r.rumor).toBe('');
  });
});

describe('OTA-844 (2) — tideLabel', () => {
  it('maps momentum to rising / waning / null', () => {
    expect(tideLabel(0)).toBeNull();
    expect(tideLabel(undefined)).toBeNull();
    expect(tideLabel(1)?.word).toBe('rising');
    expect(tideLabel(3)?.word).toBe('ascendant');
    expect(tideLabel(-1)?.word).toBe('waning');
    expect(tideLabel(-3)?.word).toBe('collapsing');
  });
});

describe('OTA-844 (3) — the pulse fires after a day of in-game time', () => {
  it('a first action stamps the baseline (no rumour on turn one); a later day pulses', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Pulse', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    // Force a full day to have elapsed since the (unset) baseline.
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: { ...p, hoursElapsed: 200 },
      worldMemory: { ...useGameStore.getState().worldMemory, lastWorldTickHour: 100 },
    });
    const before = useGameStore.getState().gameLog.length;
    await useGameStore.getState().submitPlayerAction('look around');
    const st = useGameStore.getState();
    // A rumour should have reached the player, and tides recorded.
    const log = st.gameLog.slice(before).map((e) => e.text).join('\n');
    expect(log).toMatch(/Word on the wind|🗞/);
    expect(Object.keys(st.worldMemory.factionTides ?? {}).length).toBeGreaterThan(0);
    expect(st.worldMemory.lastWorldTickHour).toBe(200);
  });
});
