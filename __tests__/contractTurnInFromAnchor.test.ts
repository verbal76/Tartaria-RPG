// OTA-616 — turning a contract in from its MAP ANCHOR row. The MapScreen route
// row, when you're standing on the contract's anchor, calls
// completeContractFromUI(kind, id) where id is parsed from the marker key
// (`${family}:${id}`) and family 'faction' maps to kind 'faction_quest'. This
// locks that marker→turn-in chain end to end at the store level.

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

import { useGameStore } from '../app/state/gameStore';
import { openContractMarkers } from '../app/engine/contractMarkers';
import type { InventoryItem } from '../app/engine/types';

async function boot() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Courier', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
}

function scrapMetal(qty: number): InventoryItem {
  return { id: 'sm_test', name: 'Scrap Metal', kind: 'misc', quantity: qty, tags: ['metal'], rarity: 'Common', description: 'x' };
}

describe('OTA-616 — turn a faction fetch quest in from its map anchor', () => {
  it('parses the contract id from the marker key and completes when items are in hand', async () => {
    await boot();
    // Inject the Reclaimers fetch starter (Scrap Run) as active + stock the items.
    // (acceptFactionQuest needs a scene vendor/board; we test the marker→turn-in
    // chain directly, which is what the map row exercises.)
    useGameStore.setState((s) => ({
      player: s.player ? {
        ...s.player,
        activeFactionQuests: [
          ...(s.player.activeFactionQuests ?? []),
          { id: 'fq_reclaimers_starter', stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 0 },
        ],
        activeFactionQuestIds: [...(s.player.activeFactionQuestIds ?? []), 'fq_reclaimers_starter'],
        inventory: [...s.player.inventory, scrapMetal(3)],
      } : s.player,
    }));

    // Build the markers the MAP screen renders, and find Scrap Run's row.
    const marker = openContractMarkers(useGameStore.getState().player).find((m) => m.family === 'faction');
    expect(marker).toBeTruthy();
    // The MapScreen extracts the id exactly this way for the turn-in call.
    const contractId = marker!.key.slice(marker!.family.length + 1);
    expect(contractId).toBe('fq_reclaimers_starter');

    const tcBefore = useGameStore.getState().player!.tc;
    useGameStore.getState().completeContractFromUI('faction_quest', contractId);

    const after = useGameStore.getState().player!;
    // OTA-617 — the player boots AT the Reclaimers' home outpost, so building-level
    // proximity makes this an IN-PERSON turn-in → FULL 35 TC (not the couriered
    // half). And the quest left the active list — the turn-in fired off the
    // marker-derived id.
    expect(after.tc).toBeGreaterThanOrEqual(tcBefore + 35); // B2 — full pay + long-haul bonus
    expect((after.activeFactionQuests ?? []).some((q) => q.id === 'fq_reclaimers_starter')).toBe(false);
  });

  it('OTA-617 — arriving at the faction building auto-submits a ready quest at FULL + shows the completion popup', async () => {
    await boot(); // boots at the Reclaimers' home
    // Inject a ready fetch quest + items, and park the player AWAY so the
    // arrival at the building is what triggers the auto-submit.
    useGameStore.setState((s) => ({
      player: s.player ? {
        ...s.player,
        currentLocationId: 'voronov',
        activeFactionQuests: [{ id: 'fq_reclaimers_starter', stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 0 }],
        activeFactionQuestIds: ['fq_reclaimers_starter'],
        inventory: [...s.player.inventory, scrapMetal(3)],
      } : s.player,
      pendingWhisperComplete: null,
    }));
    const tcBefore = useGameStore.getState().player!.tc;

    // Autoroute-back arrival routes through travelTo (stepDirection → travelTo).
    useGameStore.getState().travelTo('reclaimer_stake');

    const after = useGameStore.getState();
    // Auto-submitted at FULL (35 TC) and cleared from the active list...
    expect(after.player!.tc).toBeGreaterThanOrEqual(tcBefore + 35); // B2 — full pay + long-haul bonus
    expect((after.player!.activeFactionQuests ?? []).some((q) => q.id === 'fq_reclaimers_starter')).toBe(false);
    // ...with a completion popup carrying the mission name + reward total.
    expect(after.pendingWhisperComplete).toBeTruthy();
    expect(after.pendingWhisperComplete!.lines.join(' ')).toContain('Scrap Run');
    expect(after.pendingWhisperComplete!.rewards.join(' ')).toContain('35 TC');
  });

  it('does NOT complete (and keeps the quest) when the items are missing', async () => {
    await boot();
    useGameStore.setState((s) => ({
      player: s.player ? {
        ...s.player,
        activeFactionQuests: [
          ...(s.player.activeFactionQuests ?? []),
          { id: 'fq_reclaimers_starter', stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 0 },
        ],
        activeFactionQuestIds: [...(s.player.activeFactionQuestIds ?? []), 'fq_reclaimers_starter'],
      } : s.player,
    }));
    const tcBefore = useGameStore.getState().player!.tc;
    const marker = openContractMarkers(useGameStore.getState().player).find((m) => m.family === 'faction')!;
    const contractId = marker.key.slice(marker.family.length + 1);

    useGameStore.getState().completeContractFromUI('faction_quest', contractId);

    const after = useGameStore.getState().player!;
    expect(after.tc).toBe(tcBefore); // no payout
    expect((after.activeFactionQuests ?? []).some((q) => q.id === 'fq_reclaimers_starter')).toBe(true);
  });
});
