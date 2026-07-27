jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-994 — the four documented residuals, closed (owner: "complete 1-4 that
// were left open"). Owner's design calls, locked here: the reclaim is
// PRISTINE, the WEAPON is guaranteed, and the Hollowed door needs proven
// progress beside the HP bar.
import * as fs from 'fs';
import * as path from 'path';
import {
  buildFallenGearSnapshot, reconstructFallenPiece, revenantReclaimWeapon,
  revenantFromFallen, pinSeededKit, _setFallenCacheForTests, cachedFallen,
} from '../app/engine/fallenRevenants';
import { effectiveHealAmount } from '../app/components/itemPreview';
import { scaledHealHP } from '../app/engine/itemEffect';

const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

describe('OTA-994 — the reclaim: real gear captured at death, real gear back', () => {
  const fusedSword = {
    id: 'inst_1', name: 'Duskrender, Oath of Cinders', kind: 'weapon' as const, rarity: 'Legendary' as const,
    quantity: 1, tags: ['weapon', 'fused'],
    durability: { current: 3, max: 14 },
    instanceStats: { statBonuses: [{ stat: 'strength', amount: 2 }] },
  };
  const chest = {
    id: 'inst_2', name: 'Sentinel Core Plate', kind: 'armor' as const, quantity: 1,
    tags: ['armor'], durability: { current: 5, max: 12 },
  };
  const p = {
    equipped: { main: 'Duskrender, Oath of Cinders', mainId: 'inst_1', chest: 'Sentinel Core Plate', chestId: 'inst_2' },
    inventory: [chest, fusedSword],
  };

  it('captures FULL copies — weapon first, id/quantity stripped, instance stats kept', () => {
    const snap = buildFallenGearSnapshot(p as any);
    expect(snap[0]!.name).toBe('Duskrender, Oath of Cinders');
    expect(snap[0]!.slot).toBe('main');
    expect((snap[0] as any).id).toBeUndefined();
    expect((snap[0] as any).quantity).toBeUndefined();
    expect(snap[0]!.instanceStats?.statBonuses?.[0]).toEqual({ stat: 'strength', amount: 2 });
    expect(snap[1]!.slot).toBe('chest');
  });

  it('reconstruction is PRISTINE (owner call): fresh id, one copy, durability at max, stats intact', () => {
    const snap = buildFallenGearSnapshot(p as any);
    const back = reconstructFallenPiece(snap[0]!, 'reclaim_test');
    expect(back.id).toBe('reclaim_test');
    expect(back.quantity).toBe(1);
    expect(back.durability).toEqual({ current: 14, max: 14 });
    expect(back.instanceStats?.statBonuses?.[0]?.amount).toBe(2);
    expect(back.tags).toContain('loot');
  });

  it('the guaranteed piece is the main-hand weapon; snapshot-less records yield null', () => {
    const snap = buildFallenGearSnapshot(p as any);
    expect(revenantReclaimWeapon({ gear: snap })?.name).toBe('Duskrender, Oath of Cinders');
    expect(revenantReclaimWeapon({ gear: [] })).toBeNull();
    expect(revenantReclaimWeapon({})).toBeNull();
  });

  it('death records the snapshot; the defeat block grants the weapon outright and the rolls skip it', () => {
    expect(STORE).toContain('buildFallenGearSnapshot(player)');
    expect(STORE).toContain('revenantReclaimWeapon(');
    expect(STORE).toContain('basePool.filter((n) => n !== revWeaponName)');
    expect(STORE).toContain('reconstructFallenPiece(revPiece');
  });

  it('a knocked-out Hollowed stripped clean counts as put to rest (no rise-again kit farm)', () => {
    expect(STORE).toContain('reconstructFallenPiece(koPiece');
    const koBlock = STORE.slice(STORE.indexOf('const koKit'), STORE.indexOf('const koKit') + 1400);
    expect(koBlock).toContain('markAvenged(');
    expect(koBlock).toContain('activeRevenant: undefined');
  });
});

describe('OTA-994 — legacy seeded kits pin on first generation', () => {
  it('a record without a recorded kit locks its synthesized kit into the cache', () => {
    const legacy = {
      name: 'Old Karr', raceName: 'Human', epitaph: 'e', locationName: 'L',
      kills: 30, corruption: 'c', hours: 9, ts: 111,
    } as any;
    _setFallenCacheForTests([legacy]);
    const foe = revenantFromFallen(legacy, 80);
    const pinned = cachedFallen().find((f) => f.ts === 111)!;
    expect(pinned.gearNames && pinned.gearNames.length).toBeTruthy();
    expect(foe.loot.length).toBeGreaterThan(0);
    // Pinning never overwrites a REAL recorded kit.
    pinSeededKit({ ...legacy, gearNames: ['Named Blade'] }, ['Other']);
    expect(cachedFallen().find((f) => f.ts === 111)!.gearNames).toEqual(pinned.gearNames);
    _setFallenCacheForTests(null);
  });
});

describe('OTA-994 — the sky is remembered per location', () => {
  it('beginScene reads/writes the map, prunes stale entries, migrates the legacy slot', () => {
    expect(STORE).toContain('worldMemory.sceneWeatherByLoc ?? {}');
    expect(STORE).toContain('pruned[location.id] = { id: weather.id, rolledAtHours: skyHoursNow };');
    expect(STORE).toContain('legacySky.locationId === location.id');
  });
  it('the drift stamps the open-road key in the MAP — the single slot is never written again', () => {
    expect(STORE).toContain('[driftLocId]: { id: newWeather.id, rolledAtHours: driftHours }');
    expect(STORE).not.toContain('sceneWeather: { id: newWeather.id');
    expect(STORE).not.toContain('sceneWeather: { id: weather.id');
  });
});

describe('OTA-994 — Hollowed polish', () => {
  it('the door needs PROVEN PROGRESS beside the HP bar (no day-one Giants)', () => {
    expect(STORE).toContain('enemiesDefeated ?? 0) >= 10');
    expect(STORE).toContain('hoursElapsed ?? 0) >= 12');
    expect(STORE).toContain('&& rvProven && !rvRolled.includes(rvTileKey)');
  });
  it('diced ground banks the tile (mirrors the stranded-escort bank, capped)', () => {
    expect(STORE).toContain("revenantRolledTiles: [...(s2.worldMemory.revenantRolledTiles ?? []), rvTileKey].slice(-120)");
  });
  it('the rumour marker cannot spawn the boss over a live fight', () => {
    const c = STORE.slice(STORE.indexOf("case 'spawn_fallen_revenant': {"), STORE.indexOf("case 'spawn_fallen_revenant': {") + 900);
    expect(c).toContain('(get().currentScene?.enemies ?? []).length > 0');
  });
  it('the memorial write retries instead of firing-and-forgetting', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'fallenRevenants.ts'), 'utf8');
    expect(src).toContain('for (let attempt = 0; attempt < 3; attempt++)');
    expect(src).not.toContain('void markFallenAvenged(ts, by).catch');
  });
});

describe('OTA-994 — the preview promises the scaled heal', () => {
  it('outside a live game the flat value stands', () => {
    expect(effectiveHealAmount(30)).toEqual({ amount: 30, scaled: false });
  }, 30000);
  it('the preview math IS the Use-button math (#120 scaledHealHP)', () => {
    expect(scaledHealHP(30, 200)).toBe(30);
    expect(scaledHealHP(30, 300)).toBe(45);
    expect(effectiveHealAmount(5).amount).toBeGreaterThanOrEqual(5);
  }, 30000);
  it('previewGear routes healHP through the effective amount (flat line gone)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'itemPreview.ts'), 'utf8');
    expect(src).toContain('effectiveHealAmount(g.effect.healHP)');
    expect(src).not.toContain('restoreParts.push(`+${g.effect.healHP} HP`)');
  });
});
