// OTA-620 — the Bioluminescent Fungus is food-that-glows ({ healHP: 1,
// revealScene: true }). When a room has no hooks to reveal, the OTA-212 refund
// path was breaking BEFORE the heal/consume committed, so the fungus read as a
// no-op ("nothing to reveal, torch unspent", +0 HP, not consumed). Now it heals
// and is eaten; only a PURE detector (Aetheric Torch, revealScene-only) refunds.

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

async function boot() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Forager', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
}

const qtyOf = (name: string) =>
  (useGameStore.getState().player!.inventory.find((i) => i.name === name)?.quantity ?? 0);

it('OTA-620 — eating a Bioluminescent Fungus with no hooks heals +1 and is consumed', async () => {
  await boot();
  const p0 = useGameStore.getState().player!;
  const fungus: InventoryItem = { id: 'bf_test', name: 'Bioluminescent Fungus', kind: 'consumable', quantity: 2, tags: ['food', 'light'], rarity: 'Uncommon', description: 'x' };
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    player: { ...p0, hp: 10, hpMax: 100, inventory: [...p0.inventory, fungus] },
    currentScene: { ...scene, hooks: [] }, // nothing to reveal
  });

  await useGameStore.getState().submitPlayerAction('use Bioluminescent Fungus');

  const after = useGameStore.getState().player!;
  expect(after.hp).toBe(11);          // +1 HP delivered, not a no-op
  expect(qtyOf('Bioluminescent Fungus')).toBe(1); // one was eaten
});

it('OTA-212 branch still holds — a pure revealScene detector with no hooks takes the no-reveal path', async () => {
  // Guards that the messages.length===0 split still routes a PURE detector
  // (revealScene-only consumable) to the "nothing to reveal / unspent" branch
  // rather than the food-that-glows branch. Uses a Basic Aether Detector: the
  // Aetheric Torch was reworked into an AIMED tool (applyTorchToHook, OTA-776)
  // so 'use Aetheric Torch' no longer routes through the generic revealScene
  // path — a Basic Aether Detector is the clean, still-generic pure detector.
  await boot();
  const p0 = useGameStore.getState().player!;
  const detector: InventoryItem = { id: 'det_test', name: 'Basic Aether Detector', kind: 'exploration', quantity: 2, tags: ['detector'], rarity: 'Common', description: 'x' };
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    player: { ...p0, inventory: [...p0.inventory, detector] },
    currentScene: { ...scene, hooks: [] },
  });

  await useGameStore.getState().submitPlayerAction('use Basic Aether Detector');

  const log = useGameStore.getState().gameLog.map((l) => l.text).join('\n');
  expect(log).toContain('The torch goes back in your pack, unspent');
});
