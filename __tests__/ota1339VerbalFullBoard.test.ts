// ⚠⚠ OTA-1339 — TYPE A DEV NAME AND THE WHOLE MISSION BOARD IS ALREADY OPEN.
//
// Owner: *"I want you to put every single side quest mission Tower map everything into the
// missions. that way I don't have to find them… my missions board should be completely
// filled with everything that would ever go there."* Originally Verbal-only; widened the
// same day: *"any benefit Verbal gets when creating a character, Sasmooch gets as well."*
// And in the same order, the name rule for everyone else: *"ensure that everyone else
// except for Verbal and Sasmooch can only have 1 active character of the same name at the
// same time"* — plus the dedication card that greets a newly-created Sasmooch.
//
// What this pins, and why each half matters:
//   - The FILL, for BOTH dev names: all 18 hunts + 18 mysteries + 14 storylines + 65
//     faction quests active, all five Skyreacher Maps in the pack, all five great climbs
//     charted.
//   - The SEEDING RULES: every record starts at its first ACTIONABLE stage (a record
//     parked on a leading null stage is the exact wedge OTA-1220/1219 closed), and nothing
//     is tracked — tracking drives the atlas pin AND quiet-ground encounter suppression,
//     so 115 tracked contracts would silence combat across half the map.
//   - The GATE: an ordinary name gets none of it — and can't be born twice while a living
//     character already carries it; a dead slot frees the name; dev names never collide.
//   - The DEDICATION: Sasmooch's creation raises the card; nobody else's does.
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
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
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

import { useGameStore, migrateLoadedWorldMemory } from '../app/state/gameStore';
import { emptyMemory } from '../app/engine/worldMemory';
import type { WorldMemory } from '../app/engine/types';
import { HUNTS, firstActionableHuntStage } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { GREAT_CLIMBS } from '../app/engine/greatClimbs';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

/** Create a character and type `name` at the tutorial's name step. */
async function bornAs(name: string): Promise<void> {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'PLACEHOLDER', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  // The name step is the tutorial's first typed input; submit the tester name there.
  await store.getState().submitPlayerAction(name);
  await new Promise((r) => setTimeout(r, 200));
}

describe('OTA-1339 — the Verbal full board', () => {
  it('⚠⚠ Verbal is born with every contract open, every map, every climb charted', async () => {
    await bornAs('Verbal');
    const p = useGameStore.getState().player!;
    expect((p.activeHunts ?? []).length).toBe(HUNTS.length);
    expect((p.activeMysteries ?? []).length).toBe(MYSTERIES.length);
    expect((p.activeStorylines ?? []).length).toBe(STORYLINES.length);
    expect((p.activeFactionQuests ?? []).length).toBe(FACTION_QUESTS.length);
    expect((p.activeFactionQuestIds ?? []).length).toBe(FACTION_QUESTS.length);

    // ⚠ Seeding rules, not just counts: first ACTIONABLE stage, and nothing tracked.
    for (const rec of p.activeHunts ?? []) {
      const def = HUNTS.find((h) => h.id === rec.id)!;
      expect(rec.stage).toBe(firstActionableHuntStage(def));
      expect(rec.tracked).toBe(false);
    }
    for (const rec of [...(p.activeMysteries ?? []), ...(p.activeStorylines ?? [])]) {
      expect(rec.tracked).toBe(false);
    }

    // Tower maps: all five held, all five climbs charted, traders will not re-sell.
    const wm = useGameStore.getState().worldMemory;
    expect(new Set(wm.unlockedGreatClimbs ?? []).size).toBe(GREAT_CLIMBS.length);
    const maps = p.inventory.filter((i) => i.name.startsWith('Skyreacher Map'));
    expect(maps.length).toBe(5);
    expect((wm.soldMapIds ?? []).filter((n) => n.startsWith('Skyreacher Map')).length).toBe(5);
    // The dedication is Sasmooch's alone.
    expect(useGameStore.getState().dedicationCard).toBeNull();
  });

  it('⚠⚠ the gate is the exact name — an ordinary name gets an empty board', async () => {
    await bornAs('Ordinary');
    const p = useGameStore.getState().player!;
    expect((p.activeHunts ?? []).length).toBe(0);
    expect((p.activeMysteries ?? []).length).toBe(0);
    expect((p.activeStorylines ?? []).length).toBe(0);
    expect((p.activeFactionQuests ?? []).length).toBe(0);
    expect(p.inventory.filter((i) => i.name.startsWith('Skyreacher Map')).length).toBe(0);
  });

  it('⚠⚠ Sasmooch gets everything Verbal gets — board, maps, climbs, kit — plus the dedication', async () => {
    await bornAs('Sasmooch');
    const p = useGameStore.getState().player!;
    expect((p.activeHunts ?? []).length).toBe(HUNTS.length);
    expect((p.activeMysteries ?? []).length).toBe(MYSTERIES.length);
    expect((p.activeStorylines ?? []).length).toBe(STORYLINES.length);
    expect((p.activeFactionQuests ?? []).length).toBe(FACTION_QUESTS.length);
    expect(p.inventory.filter((i) => i.name.startsWith('Skyreacher Map')).length).toBe(5);
    expect(new Set(useGameStore.getState().worldMemory.unlockedGreatClimbs ?? []).size).toBe(GREAT_CLIMBS.length);
    expect(p.inventory.some((i) => i.name === 'First Aid Kit')).toBe(true);
    // The dedication card is up, immediately, before a single action is taken.
    const card = useGameStore.getState().dedicationCard;
    expect(card).not.toBeNull();
    expect(card!.kicker).toBe('TO MY WIFE');
    expect(card!.body).toContain('Happy 50th Birthday and 15th Anniversary');
    expect(card!.signoff).toContain('Verbal');
  });

  it('⚠⚠ one living character per ordinary name — dead slots free it, dev names never collide', async () => {
    // A living Tamsin exists…
    await bornAs('Tamsin');
    expect(useGameStore.getState().player!.name).toBe('Tamsin');

    // …so a second Tamsin is refused at the name beat: the placeholder from
    // bornAs() is untouched (the real UI seeds '' here), and the beat re-asks.
    await bornAs('Tamsin');
    expect(useGameStore.getState().player!.name).toBe('PLACEHOLDER');
    expect(useGameStore.getState().awaitingTutorialName).toBe(true);

    // A different name goes straight through on the very next submission.
    await useGameStore.getState().submitPlayerAction('Brack');
    expect(useGameStore.getState().player!.name).toBe('Brack');

    // Once every Tamsin slot is dead, the name is free to carry again. The dead
    // mark must land AFTER startNewGame (which refreshes `slots` from disk) and
    // before the name is typed — the guard reads the roster at submit time.
    await useGameStore.getState().startNewGame({ name: 'PLACEHOLDER', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    useGameStore.setState((s) => ({
      slots: s.slots.map((sl) => (sl.playerName === 'Tamsin' ? { ...sl, dead: true } : sl)),
    }));
    await useGameStore.getState().submitPlayerAction('Tamsin');
    await new Promise((r) => setTimeout(r, 200));
    expect(useGameStore.getState().player!.name).toBe('Tamsin');

    // Dev names are exempt: a second living Verbal is always allowed.
    await bornAs('Verbal');
    expect(useGameStore.getState().player!.name).toBe('Verbal');
    await bornAs('Verbal');
    expect(useGameStore.getState().player!.name).toBe('Verbal');
  });

  it('⚠ OTA-1339 spire notice — the load migration leaves a legacy save eligible', () => {
    // A pre-makeover save has no spireMoveNoticeShown field at all; the migration
    // must default it FALSE (eligible for the one-time notice), while emptyMemory
    // stamps a fresh character TRUE (never eligible). Both halves live in
    // different files — this is the seam test between them.
    const legacy = { ...emptyMemory() } as WorldMemory;
    delete (legacy as Partial<WorldMemory>).spireMoveNoticeShown;
    expect(migrateLoadedWorldMemory(legacy).spireMoveNoticeShown).toBe(false);
    expect(migrateLoadedWorldMemory(emptyMemory()).spireMoveNoticeShown).toBe(true);
  });
});
