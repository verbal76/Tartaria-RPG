// OTA 041 — Regression for two blockers caught in pre-ship audit:
// completeContractFromUI dropped rewardItem grants for mysteries and
// storylines (the vendor turn-in paths handled it; only the UI path
// was broken). 6 mysteries + 4 storylines lost their reward items
// before this fix.

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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findMysteryById } from '../app/engine/mysteries';
import { findStorylineById } from '../app/engine/factionStorylines';
import { FACTION_QUESTS } from '../app/engine/factionQuests';

describe('completeContractFromUI grants rewardItem (OTA 041 fix)', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('mystery: rewardItem lands in inventory when completed via UI', async () => {
    const mystery = findMysteryById('mystery_red_tower')!;
    expect(mystery.rewardItem).toBeTruthy();

    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Sleuth', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // Inject a fully-progressed mystery on the player's slate + a matching-faction
    // vendor in scene (B2 — the UI complete is a FACE-TO-FACE hand-in now).
    const p0 = store.getState().player!;
    const sc0 = store.getState().currentScene!;
    store.setState({
      player: {
        ...p0,
        activeMysteries: [{ id: mystery.id, stage: mystery.stages.length, postedByFaction: mystery.factionId ?? null, acceptedAt: Date.now() }],
      },
      currentScene: { ...sc0, vendor: { id: 'test_agent', name: 'Test Agent', faction: mystery.factionId ?? null } as never },
    });

    const inventoryNamesBefore = store.getState().player!.inventory.map((i) => i.name);
    const beforeCount = inventoryNamesBefore.filter((n) => n === mystery.rewardItem).length;

    store.getState().completeContractFromUI('mystery', mystery.id);

    const after = store.getState().player!;
    const afterCount = after.inventory.filter((i) => i.name === mystery.rewardItem).length;
    expect(afterCount).toBe(beforeCount + 1);
    expect(after.activeMysteries?.some((m) => m.id === mystery.id)).toBe(false);
    expect((after.completedMysteryIds ?? []).includes(mystery.id)).toBe(true);
  });

  it('storyline: rewardItem lands in inventory when completed via UI', async () => {
    const story = findStorylineById('story_order_red_tower')!;
    expect(story.rewardItem).toBeTruthy();

    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Chronicler', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const p0 = store.getState().player!;
    const sc0 = store.getState().currentScene!;
    store.setState({
      player: {
        ...p0,
        activeStorylines: [{ id: story.id, stage: story.stages.length, postedByFaction: story.factionId ?? null, acceptedAt: Date.now() }],
      },
      currentScene: { ...sc0, vendor: { id: 'test_agent', name: 'Test Agent', faction: story.factionId ?? null } as never },
    });

    const beforeCount = store.getState().player!.inventory.filter((i) => i.name === story.rewardItem).length;

    store.getState().completeContractFromUI('storyline', story.id);

    const after = store.getState().player!;
    const afterCount = after.inventory.filter((i) => i.name === story.rewardItem).length;
    expect(afterCount).toBe(beforeCount + 1);
    expect(after.activeStorylines?.some((s) => s.id === story.id)).toBe(false);
    expect((after.completedStorylineIds ?? []).includes(story.id)).toBe(true);
  });

  // OTA-458 — the Contracts-screen COMPLETE button must respect the OTA-450 fetch
  // gate. A starter fetch quest has no stages, so it slipped past the stage gate and
  // paid out for free; now the UI path verifies the items are held and consumes them.
  it('faction_quest (fetch): UI complete refuses without the items, then succeeds and consumes them', async () => {
    const fetchQuest = FACTION_QUESTS.find((q) => q.fetch)!;
    expect(fetchQuest.fetch).toBeTruthy();
    const { itemName, quantity } = fetchQuest.fetch!;

    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Gatherer', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const p0 = store.getState().player!;
    // Active quest on the slate, but NO fetch items in the pack.
    store.setState({
      player: {
        ...p0,
        inventory: p0.inventory.filter((i) => i.name.toLowerCase() !== itemName.toLowerCase()),
        activeFactionQuests: [{ id: fetchQuest.id, stage: 0, postedByFaction: fetchQuest.factionId, acceptedAt: Date.now() }],
        activeFactionQuestIds: [fetchQuest.id],
      },
    });

    // Empty-handed: refused, quest stays active, no completion.
    store.getState().completeContractFromUI('faction_quest', fetchQuest.id);
    let after = store.getState().player!;
    expect((after.activeFactionQuestIds ?? []).includes(fetchQuest.id)).toBe(true);
    expect((after.completedFactionQuestIds ?? []).includes(fetchQuest.id)).toBe(false);

    // Now hold exactly the required items + a same-faction agent in scene (B2 — the
    // UI complete is a FACE-TO-FACE hand-in now; no agent → refused, not half-pay).
    const p1 = store.getState().player!;
    const sc1 = store.getState().currentScene!;
    store.setState({
      player: {
        ...p1,
        inventory: [
          ...p1.inventory.filter((i) => i.name.toLowerCase() !== itemName.toLowerCase()),
          { id: 'fetch_stack', name: itemName, kind: 'material', rarity: 'Common', quantity, tags: [] } as never,
        ],
      },
      currentScene: { ...sc1, vendor: { id: 'test_agent', name: 'Test Agent', faction: fetchQuest.factionId } as never },
    });
    const tcBefore = store.getState().player!.tc;

    store.getState().completeContractFromUI('faction_quest', fetchQuest.id);
    after = store.getState().player!;

    // Completed, reward paid, and the fetch items consumed.
    expect((after.completedFactionQuestIds ?? []).includes(fetchQuest.id)).toBe(true);
    expect((after.activeFactionQuestIds ?? []).includes(fetchQuest.id)).toBe(false);
    // B2/OTA-824 — face-to-face → FULL pay + a long-haul bonus (>= full, never half).
    expect(after.tc).toBeGreaterThanOrEqual(tcBefore + fetchQuest.reward.tc);
    const held = after.inventory
      .filter((i) => i.name.toLowerCase() === itemName.toLowerCase())
      .reduce((n, i) => n + (i.quantity ?? 1), 0);
    expect(held).toBe(0);
  });
});
