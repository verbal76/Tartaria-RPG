// ⚠ OTA-1343 — ACID JOINS THE LORE.
//
// Owner: *"we could work acid somehow into the lore."* The sketch he approved:
// a vendor topic + an Arbiter line + an Acid Flask description rewrite. All
// three tell ONE story — battery bile from the old world's drowned jar-batteries
// (the flood shorted the lightning out; the bile kept) — so the flask the player
// crafts, the trader who sells it, and the Arbiter watching the first coat all
// agree on where the stuff comes from.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findGearByName } from '../app/engine/crafting';
import dialogueTopics from '../app/data/npcs/dialogue_topics.json';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

const arbiterBileLines = () =>
  useGameStore.getState().gameLog.filter((e) =>
    (e as { channel?: string }).channel === 'arbiter'
    && String((e as { text: string }).text).includes('Battery bile')).length;

describe('OTA-1343 — acid joins the lore', () => {
  it('⚠ the Acid Flask description tells the bile story and keeps its mechanics', () => {
    const desc = (findGearByName('Acid Flask') as { description?: string } | undefined)?.description ?? '';
    expect(desc).toContain('Battery bile');
    expect(desc).toContain('jar-batteries');
    // The mechanics sentence is untouched — the owner said no wording churn on rules.
    expect(desc).toContain('1d4 a turn');
    expect(desc).toContain("eats the target's armor");
  });

  it('⚠ Halem carries the acid-trade topic, telling the same story', () => {
    const halem = (dialogueTopics as { npcs: Record<string, { topics: { id: string; label: string; lines: string[] }[] }> }).npcs.halem_trader!;
    const topic = halem.topics.find((t) => t.id === 'halem_acid');
    expect(topic).toBeTruthy();
    expect(topic!.label.toLowerCase()).toContain('acid');
    expect(topic!.lines.join(' ')).toContain('Battery bile');
    expect(topic!.lines.join(' ')).toContain('jar-batteries');
  });

  it('⚠⚠ the Arbiter tells the bile story on the FIRST acid coat, and only then', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Etcher', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          { id: 'flask1', name: 'Acid Flask', kind: 'consumable', rarity: 'Uncommon', quantity: 2, tags: ['potion', 'weapon_coating', 'acid'] },
          { id: 'blade1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: [], durability: { current: 20, max: 20 } },
          { id: 'blade2', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: [], durability: { current: 20, max: 20 } },
        ] as InventoryItem[],
      } as never,
    }));
    expect(arbiterBileLines()).toBe(0);
    store.getState().applyCoating('flask1', 'blade1');
    expect(arbiterBileLines()).toBe(1);
    // Second coat — the story is told once per save, not per flask.
    store.getState().applyCoating('flask1', 'blade2');
    expect(arbiterBileLines()).toBe(1);
    expect(store.getState().worldMemory.acidLoreIntroShown).toBe(true);
  });
});
