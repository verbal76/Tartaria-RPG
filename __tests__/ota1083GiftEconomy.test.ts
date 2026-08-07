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

/**
 * OTA-1083 — THE GIFT ECONOMY: THE FENCE, THE TASTES, AND THE RETURN GIFT.
 *
 * Owner: "do all three." (1) The fence buys stolen goods at a deep cut —
 * everyone else keeps refusing word for word. (2) Gift reactions TEACH: a
 * loved gift records what it revealed on the ledger, and the picker shows
 * what you've learned. (3) The return gift: trusted regard plus at least one
 * loved gift, and the authored cast pushes something back across the counter
 * — once, ever, and every authored return gift must resolve in the catalog.
 */
jest.setTimeout(60_000);

import { useGameStore } from '../app/state/gameStore';
import { tasteDiscoveries, returnGiftFor, reactionFor, GIFT_FLOOR_TC } from '../app/engine/gifting';
import { getRelation } from '../app/engine/npcMemory';
import { findCatalogItem } from '../app/engine/crafting';
import type { NpcRelation } from '../app/engine/types';

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Giver', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

const scene = () => useGameStore.getState().currentScene!;
const logText = () => useGameStore.getState().gameLog.map((e) => String(e.text)).join('\n');
const relation = (id: string, name: string): NpcRelation => ({
  id, name, firstMetAt: 0, lastSeenAt: 0, lastSeenHours: 0,
  meetings: 3, trades: 1, tcTraded: 50, contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
});

describe('OTA-1083 — the fence buys stolen goods', () => {
  const putVendor = (demeanor: string) => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      pendingTalk: null, pendingParley: null, pendingPayoff: null,
      player: {
        ...p,
        inventory: [
          ...p.inventory.filter((i) => i.name !== 'Aetheric Gem'),
          { id: 'hot_1', name: 'Aetheric Gem', kind: 'material', rarity: 'Rare', quantity: 1, tags: [], stolen: true } as never,
        ],
      },
      currentScene: {
        ...scene(), enemies: [], enemyHps: [], wanderer: null, vendorInFight: null,
        vendor: { id: 'roadside_991', name: 'Grit Maalen', faction: null, title: 'Road Hawker', demeanor, offers: [] } as never,
      },
    });
  };

  it('⚠ an honest vendor still refuses, word for word', () => {
    putVendor('honest');
    const beforeTc = useGameStore.getState().player!.tc;
    useGameStore.getState().sellToVendor('Aetheric Gem', 'hot_1');
    expect(useGameStore.getState().player!.tc).toBe(beforeTc);
    expect(useGameStore.getState().player!.inventory.some((i) => i.id === 'hot_1')).toBe(true);
    expect(logText()).toContain("don't put it on my table");
  });

  it('the fence pays — at the deep cut, no questions asked', () => {
    putVendor('sketchy');
    const beforeTc = useGameStore.getState().player!.tc;
    useGameStore.getState().sellToVendor('Aetheric Gem', 'hot_1');
    const after = useGameStore.getState().player!;
    expect(after.tc).toBeGreaterThan(beforeTc);
    expect(after.inventory.some((i) => i.id === 'hot_1')).toBe(false);
    expect(logText()).toContain('no questions asked');
    // The cut is real: a Rare fetches well under half what a clean sale would.
    const paid = after.tc - beforeTc;
    expect(paid).toBeLessThan(60);
  });
});

describe('OTA-1083 — reactions teach tastes', () => {
  it('tasteDiscoveries reveals exactly what the reaction proved', () => {
    // ⚠ OTA-1153 — was `Iron Bar` / `loves:metal`. `Iron Bar` is not a real item,
    // and `metal` is no longer one of Irma's loves: it covers Bent Nails and Pry
    // Bars, so loving it made a heavy armorer indiscriminate. Real item, real tag,
    // real love.
    const metal = { name: 'Titanforged Cuirass', tags: ['armor', 'chest', 'titanforged', 'crafted'], worth: 200 };
    expect(tasteDiscoveries('irma_ironhand', metal, 'loved')).toEqual(
      expect.arrayContaining(['loves:titanforged', 'loves:chest']),
    );
    const exact = { name: 'Behemoth Plate', tags: [], worth: 50 };
    expect(tasteDiscoveries('irma_ironhand', exact, 'loved')).toEqual(['loves:Behemoth Plate']);
    // ⚠ OTA-1153 — a matched dislike now reports on the 'disliked' reaction under a
    // `dislikes:` prefix. It used to ride the 'polite' reaction as `cold:`, which
    // could not distinguish "they have no use for this" from "they have no opinion".
    const shroom = { name: 'Blue Cap Mushroom', tags: ['mushroom'], worth: 50 };
    // Both are learned, and that is right: she dislikes the mushroom BY NAME and
    // the whole `mushroom` tag, so one gift teaches the specific and the general.
    expect(tasteDiscoveries('irma_ironhand', shroom, 'disliked')).toEqual(
      expect.arrayContaining(['dislikes:Blue Cap Mushroom', 'dislikes:mushroom']),
    );
    // A liked-for-value gift proves nothing about WHO they are.
    expect(tasteDiscoveries('irma_ironhand', { name: 'Gem', tags: ['gem'], worth: 500 }, 'liked')).toEqual([]);
  });

  it('⚠ a loved gift lands on the ledger: the taste AND the loved count', () => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [...p.inventory, { id: 'gift_1', name: 'Behemoth Plate', kind: 'armor', rarity: 'Uncommon', quantity: 1, tags: [] } as never],
      },
      worldMemory: {
        ...useGameStore.getState().worldMemory,
        npcRelations: {
          ...(useGameStore.getState().worldMemory.npcRelations ?? {}),
          irma_ironhand: relation('irma_ironhand', 'Irma Ironhand'),
        },
      },
      pendingGift: { candidates: [{ id: 'irma_ironhand', name: 'Irma Ironhand' }], toId: 'irma_ironhand', toName: 'Irma Ironhand' } as never,
    });
    // Sanity: this is a loved gift by authored prefs, whatever its exact worth.
    // ⚠ OTA-1153 — `Sentinel Core Plate` is a real item but its real tags are
    // ['automation','tech','salvage','scrap','throwable'] — nothing like the
    // ['metal'] this fixture invented for it, and it is no longer one of Irma's
    // loves. Use an item she is actually written to want, with its own real tags.
    expect(reactionFor('irma_ironhand', { name: 'Behemoth Plate', tags: [], worth: GIFT_FLOOR_TC })).toBe('loved');
    useGameStore.getState().giveGift('gift_1');
    const rel = getRelation(useGameStore.getState().worldMemory, 'irma_ironhand');
    expect(rel?.lovedGifts).toBe(1);
    expect(rel?.giftTastes ?? []).toEqual(expect.arrayContaining(['loves:Behemoth Plate']));
  });
});

describe('OTA-1083 — the return gift', () => {
  it('⚠ every authored return gift resolves in the catalog — no phantom rewards', () => {
    const authored = ['irma_ironhand', 'halem_trader', 'scrap_broker', 'odar_flameforge', 'yara_windcaller',
      'bran_the_beastmaster', 'order_scholar', 'tarek_tinkerer', 'revivalists_quartermaster'];
    for (const npc of authored) {
      const rg = returnGiftFor(npc);
      expect(rg).toBeTruthy();
      expect(findCatalogItem(rg!.item)).toBeTruthy();
      expect(rg!.line.length).toBeGreaterThan(20);
    }
  });

  it('the fallback cast has no return gift — a return requires tastes to have hit', () => {
    expect(returnGiftFor('roadside:someone_random')).toBeNull();
  });
});
