// OTA-840 [never-fail-silently sweep] — an audit of the action pipeline found a short
// list of branches that ended an action with NO player feedback. These lock the fixes:
// an unequip of an empty slot, a typed equip's confirmation, and buy/sell with no
// vendor present all now say something instead of no-op'ing in silence.

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
import type { InventoryItem } from '../app/engine/types';

async function freshGame(name: string) {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name, raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
}
const logText = () => useGameStore.getState().gameLog.map((e) => e.text).join('\n');
const logSince = (n: number) => useGameStore.getState().gameLog.slice(n).map((e) => e.text).join('\n');

it('OTA-840 — unequipping an EMPTY slot is no longer silent', async () => {
  await freshGame('Stripper');
  // Ensure the head slot is empty, then try to take a helmet off.
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, equipped: { ...(p.equipped ?? {}), head: undefined } } });
  const before = useGameStore.getState().gameLog.length;
  await useGameStore.getState().submitPlayerAction('remove helmet');
  expect(logSince(before)).toMatch(/nothing in that slot/i);
});

it('OTA-840 — a typed EQUIP confirms in the feed (was silent)', async () => {
  await freshGame('Equipper');
  const p = useGameStore.getState().player!;
  const blade: InventoryItem = {
    id: 'w840', name: 'Test Sabre', kind: 'weapon', quantity: 1, rarity: 'Common',
    tags: ['weapon', 'melee', 'sword'], damageDice: '1d6', stat: 'strength',
  } as InventoryItem;
  useGameStore.setState({ player: { ...p, inventory: [...p.inventory, blade] } });
  const before = useGameStore.getState().gameLog.length;
  await useGameStore.getState().submitPlayerAction('equip test sabre');
  expect(logSince(before)).toMatch(/Test Sabre/);
  expect(logSince(before)).toMatch(/ready|don|wield|equip/i);
});

it('OTA-840 — buying with no vendor present says so', async () => {
  await freshGame('Buyer');
  // No vendor in the fresh scene.
  const before = useGameStore.getState().gameLog.length;
  useGameStore.getState().buyFromVendor('Anything', 1);
  expect(logSince(before)).toMatch(/no one here to trade/i);
});

it('OTA-840 — selling with no vendor present says so', async () => {
  await freshGame('Seller');
  const before = useGameStore.getState().gameLog.length;
  useGameStore.getState().sellToVendor('Anything', undefined);
  expect(logSince(before)).toMatch(/no one here to trade/i);
});

it('OTA-840 — sanity: the fresh game log is not empty (harness works)', () => {
  expect(logText().length).toBeGreaterThan(0);
});
