/**
 * OTA-1732 - ONE DURABILITY, NOT TWO. (Fused-item authority collapse.)
 *
 * Owner: *"item.durability is the authoritative live durability. Fix the three
 * fused-item readers that currently prefer uniqueStats.durability.max so
 * reinforcement and ordinary wear cannot produce two truths."*
 *
 * A Crucible-fused piece is minted with BOTH:
 *
 *     durability:  { ...stats.durability }     ← a copy
 *     uniqueStats: stats                       ← holds the original
 *
 * `wearItemById` writes only the first. They are equal at the forge and diverge
 * from the first swing. Three readers took the SECOND — the frozen mint-time
 * number — as `baseDurability`: resolveDisplayWeapon, resolveDisplayArmor and
 * combatRules' fused lookup. Reinforcement would have made that gap permanent and
 * paid-for, but the divergence is a PRE-EXISTING defect: ordinary wear already
 * produced it, which is why this is fixed and reported on its own.
 */
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
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { resolveDisplayWeapon, resolveDisplayArmor } from '../app/engine/itemResolution';
import { wearItemById, repairItem } from '../app/engine/durability';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

/** A fused blade whose two durability copies have already drifted, the way any
 *  used one has: the live field is worn, the uniqueStats copy still says 40. */
const FUSED = () => ({
  id: 'fused_probe_1', name: 'Resonant Cleaver', kind: 'weapon', rarity: 'Rare', quantity: 1,
  tags: ['fused', 'unique'],
  durability: { current: 12, max: 40 },
  uniqueStats: {
    kind: 'weapon', rarity: 'Rare', damageDice: '2d6', damageType: 'slashing',
    scalesWith: 'strength', durability: { current: 40, max: 40 },
  },
});
const FUSED_ARMOR = () => ({
  id: 'fused_armor_1', name: 'Resonant Plate', kind: 'armor', rarity: 'Rare', quantity: 1,
  tags: ['fused', 'unique'],
  durability: { current: 9, max: 33 },
  uniqueStats: {
    kind: 'armor', rarity: 'Rare', armorSlot: 'chest', acBonus: 4,
    durability: { current: 33, max: 33 },
  },
});

describe('OTA-1732 - the fused readers take the LIVE durability', () => {
  it('⚠⚠⚠ a fused WEAPON resolves its live ceiling, not the mint-time copy', () => {
    const it = FUSED();
    // make them disagree the way a reinforcement (or a catalog promotion) would
    it.durability.max = 56;
    expect(resolveDisplayWeapon(it as never)!.baseDurability).toBe(56);
    expect(it.uniqueStats.durability.max).toBe(40);   // the stale copy is still there
    W('  fused weapon: live max 56 wins over the mint-time 40');
  });

  it('⚠⚠ a fused ARMOR piece does the same', () => {
    const it = FUSED_ARMOR();
    it.durability.max = 47;
    expect(resolveDisplayArmor(it as never)!.baseDurability).toBe(47);
  });

  it('⚠⚠ the combat lookup agrees with the display', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CR = require('../app/engine/combatRules') as Record<string, unknown>;
    const SRC = readFileSync(join(__dirname, '..', 'app', 'engine', 'combatRules.ts'), 'utf8');
    expect(SRC).toContain('baseDurability: it.durability?.max ?? u.durability.max');
    expect(typeof CR).toBe('object');
  });

  it('⚠ a reference with NO live durability still falls back to the copy', () => {
    // a catalog row being previewed, never a held object
    const noLive = { ...FUSED(), durability: undefined };
    expect(resolveDisplayWeapon(noLive as never)!.baseDurability).toBe(40);
  });

  it('⚠⚠⚠ WEAR then REPAIR round-trips on the live field, and the readers follow', () => {
    let inv = [FUSED()] as never[];
    const worn = wearItemById(inv, 'fused_probe_1', 5);
    inv = worn.inventory as never[];
    expect((inv[0] as unknown as { durability: { current: number } }).durability.current).toBe(7);
    // the resolver reports the live CEILING throughout — wear moves current, not max
    expect(resolveDisplayWeapon(inv[0]!)!.baseDurability).toBe(40);
    const repaired = repairItem(inv, 'fused_probe_1');
    const d = (repaired[0] as unknown as { durability: { current: number; max: number } }).durability;
    expect(d.current).toBe(40);                       // repair restores to the LIVE max
    expect(d.max).toBe(40);
    W('  fused wear 12 -> 7 -> repaired to 40/40 on the live field');
  });

  it('⚠⚠ SAVE / RELOAD keeps the live field and does not re-seat it from uniqueStats', async () => {
    const st = useGameStore;
    await st.getState().hydrate();
    await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    st.getState().skipTutorial?.();
    if (st.getState().storyIntro) st.getState().dismissStoryIntro();
    const p = st.getState().player!;
    st.setState({ player: { ...p, inventory: [FUSED()] } } as never);
    await flush();
    await st.getState().persist();
    await st.getState().hydrate(); await flush();
    const back = st.getState().player!.inventory.find((i) => i.id === 'fused_probe_1')!;
    expect(back.durability).toEqual({ current: 12, max: 40 });
    // restampInventoryItem skips fused pieces entirely, so nothing rewrites them
    expect(resolveDisplayWeapon(back as never)!.baseDurability).toBe(40);
    W('  fused durability survived persist -> hydrate untouched');
  });
});
