// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
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


// ⚠⚠ OTA-1320 — THE AUDIT OF THE AUDIT: four holes found by re-verifying
// tonight's own work (owner: "check for glitches, bugs, bad code degenerative
// exploits and any other tracking issues").
//
//   (1) ⚠⚠ THE GEAR DUPE SURVIVED FOR LEGACY SAVES. OTA-1301's cardinal-step
//       drop reads the scene's OWN tileGearNouns record — and a save written
//       BEFORE that OTA has pinned gear and no record, so the drop filtered
//       nothing and the legacy pin minted a copy per tile exactly as before.
//       Measured: 4 copies in 4 steps ON the fixed build. The owner's live
//       save was in this exact state when the fix shipped.
//   (2) ⚠ A Resurrection Gem left the fallen-seed register uncleaned, so a
//       Gem-revived character who LATER genuinely disappeared could never be
//       restored from backup — the OTA-1311 gate still called them fallen.
//   (3) ⚠⚠ The bulk sweep could sell your LAST gate tool. planCommonGearSale
//       predates a reachable bulk confirm (dead button until OTA-1307); once
//       1307 wired the button, the sweep went live WITHOUT the OTA-178 red
//       warning the single-item sell shows. Concrete target: Aether-Breath
//       Mask — Common ARMOR, gate breathe_toxic — was in the sweep.
//   (4) ⚠ routedClimbId was write-only: never cleared on contract activation
//       or summit victory, stale state waiting to lie to its first reader.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { recordFallenSeed, hasFallenSeed, clearFallenSeed } from '../app/engine/saveSystem';
import { findCatalogItem } from '../app/engine/crafting';
import { isGearItem } from '../app/engine/bulkSell';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const beat = (): string | null => { const i = useGameStore.getState().tutorialStep; return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null; };
const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
const count = (n: string): number => (useGameStore.getState().player?.inventory ?? []).filter((i: { name: string }) => i.name === n).length;

async function freshOutdoors(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty', motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  sub('Francis'); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden's Vest");
  useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) { sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb'); }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
  sub('leave outpost');
}

describe('OTA-1320 — the audit of the audit', () => {
  it("⚠⚠ (1) THE LEGACY SAVE: pre-1301 pinned gear does NOT dupe after a real load", async () => {
    await freshOutdoors();
    const LEGACY = "Mud-Treader's Greaves";
    // A pre-1301 scene: gear pinned, tileGearNouns ABSENT (undefined is dropped
    // by JSON, exactly as an old save would arrive).
    useGameStore.setState((s) => ({
      currentScene: {
        ...s.currentScene!,
        ambientNouns: Array.from(new Set([LEGACY, ...(s.currentScene!.ambientNouns ?? [])])),
        displayedAmbientNouns: Array.from(new Set([LEGACY, ...(s.currentScene!.displayedAmbientNouns ?? [])])),
        pinnedAmbientNouns: [LEGACY],
        tileGearNouns: undefined,
      } as never,
    }));
    await useGameStore.getState().persist();
    const slotId = (useGameStore.getState() as unknown as { activeSlotId?: string }).activeSlotId!;
    // ⚠ Through the REAL door — loadSlotIntoGame is the boot/OTA-relaunch path
    // (hydrate() is not; the first probe used it and proved nothing).
    await useGameStore.getState().loadSlotIntoGame(slotId);
    const scene = useGameStore.getState().currentScene as { tileGearNouns?: string[] };
    // The backfill derived the record from the pins, once, at the seam.
    expect(scene.tileGearNouns).toContain(LEGACY);
    for (let i = 0; i < 4; i++) { sub(`take the ${LEGACY}`); sub('go north'); }
    // Pre-fix this read 4 — one fresh copy per tile, forever.
    expect(count(LEGACY)).toBe(1);
  });

  it('⚠ (1b) the backfill guesses by catalog ONLY at the legacy seam — the step path stays record-driven', () => {
    const store = read('state', 'gameStore.ts');
    const i = store.indexOf('OTA-1320 — BACKFILL tileGearNouns ON LEGACY SCENES');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 2200);
    expect(block).toContain('tileGearNouns === undefined');
    expect(block).toContain('findCatalogItem(n, { aliases: true })');
    // The cardinal-step consumer still reads the record, never the catalog.
    const step = store.slice(store.indexOf('THE GEAR STAYS ON THE TILE YOU LEFT'));
    expect(step.slice(0, 1600)).toContain('scene.tileGearNouns ?? []');
  });

  it('⚠ (2) a Resurrection Gem pays the register off — and a later death re-registers', async () => {
    const SEED = 'Audit|aetherborn|eternal_dynasty|1';
    await recordFallenSeed(SEED);
    expect(await hasFallenSeed(SEED)).toBe(true);
    await clearFallenSeed(SEED);
    expect(await hasFallenSeed(SEED)).toBe(false);
    await recordFallenSeed(SEED);
    expect(await hasFallenSeed(SEED)).toBe(true);
    // And the clear is wired into the ONE sanctioned revival, after the gem
    // spend (a failed save returns before either).
    const store = read('state', 'gameStore.ts');
    const r = store.indexOf('async resurrectSlot(');
    const body = store.slice(r, r + 4000);
    expect(body).toContain('clearFallenSeed(characterSeedOf(revived))');
    expect(body.indexOf('addResurrectionGems(-1)')).toBeLessThan(body.indexOf('clearFallenSeed'));
  });

  it('⚠⚠ (3) the bulk sweep holds out your LAST gate tool — and the target is real', () => {
    // The Aether-Breath Mask is Common ARMOR with a gate effect: it was in the
    // sweep, and one tap could sell your only way to breathe toxic air with no
    // red warning. Prove the target is real, then pin the exclusion.
    const mask = findCatalogItem('Aether-Breath Mask', { aliases: true });
    expect(mask?.rarity).toBe('Common');
    expect(isGearItem({ name: 'Aether-Breath Mask' })).toBe(true);
    const screen = read('screens', 'VendorScreen.tsx');
    expect(screen).toContain('const bulkSellable = sellable.filter(({ item }) => !gateLossFor(item.name));');
    // BOTH the button plan and the fire-time re-plan read the filtered list —
    // a filter on only one of them is the count lying to the confirm.
    const calls = screen.match(/planCommonGearSale\((\w+)\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toBe('planCommonGearSale(bulkSellable)');
  });

  it('⚠ (4) routing a contract clears a routed tower — the field cannot go stale', async () => {
    await freshOutdoors();
    useGameStore.setState((s) => ({
      worldMemory: { ...s.worldMemory, unlockedGreatClimbs: ['grand_spire'] },
    }));
    useGameStore.getState().routeGreatClimb('grand_spire');
    expect(useGameStore.getState().player!.routedClimbId).toBe('grand_spire');
    // Put a contract on the slate and activate it — the tower is no longer
    // "the mission you're on", so the field must say so.
    useGameStore.setState((s) => (s.player ? {
      player: { ...s.player, activeFactionQuests: [{ id: 'audit_q', tracked: false }] as never },
    } : s));
    useGameStore.getState().setFactionQuestActive('audit_q', true);
    expect(useGameStore.getState().player!.routedClimbId ?? null).toBeNull();
    // And the summit write clears its own tower (source pin — the boss fight
    // itself is walked by the climb walkers).
    const store = read('state', 'gameStore.ts');
    const i = store.indexOf('summitBossesDefeated: nextDefeated');
    expect(store.slice(i, i + 700)).toContain("routedClimbId === summitClimbId");
  });
});
