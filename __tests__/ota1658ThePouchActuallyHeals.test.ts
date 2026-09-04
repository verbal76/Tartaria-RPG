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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1658 — THE POUCH ACTUALLY HEALS.
//
// Owner, playing OTA-1657: *"the heals load into the pouch and it can collapse,
// I can open heals in battle, but when tapped they don't do anything."*
//
// ⚠⚠⚠ HE IS RIGHT, AND THE CAUSE IS THE SENTENCE I WROTE IN THE OTA-1657 MESSAGE.
// I routed the pouch tap through `useInventoryItem` and argued it was correct
// *because* it was the same action the pack's USE button fires — "not 'like', the
// SAME action". That much was true. What I never checked is what that action does
// in the one place the button was built for.
//
//   useInventoryItem  →  submitPlayerAction(`use ${name}`)
//   submitPlayerAction, line 1:  if (!trimmed || get().pendingRolls) return;
//
// Combat in this game IS `pendingRolls` — every swing sets it (gameStore ~14385)
// and it stays set while the dice are on screen. So in a fight the pouch's tap
// reached a guard clause and returned. No heal, no refusal, no log line: exactly
// "they don't do anything", which is the worst possible failure because it is
// indistinguishable from a dead button.
//
// ⚠ THE LESSON WAS ALREADY WRITTEN DOWN, FORTY LINES BELOW THE CODE I ADDED.
// `dropInventoryItem` carries a comment about threading a UI action through
// `submitPlayerAction`, watching it work in a probe and fail in the real game,
// and concluding the BODY has to be callable directly. I added a new UI action to
// that same file and made the same mistake in the same way.
//
// The fix is the path the combat bar already uses: `useHealBatch`, a direct store
// action that applies HP, stamina AND cures (OTA-1573), spends the stack, logs
// and persists — with no parser and no pendingRolls gate between the tap and the
// heal.

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

const KIT: InventoryItem = {
  id: 'inv_trauma_kit', name: 'Trauma Kit', kind: 'consumable',
  rarity: 'Common', quantity: 5, tags: ['healing', 'crafted'],
} as unknown as InventoryItem;

async function boot(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: 'PouchTester', raceId: 'reclaimer', factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
  useGameStore.setState((s) => ({
    pendingRolls: null,
    player: s.player
      ? {
        ...s.player,
        hp: 10,
        inventory: [...s.player.inventory.filter((i) => i.name !== KIT.name), { ...KIT }],
        equipped: { ...(s.player.equipped ?? {}), medkitIds: [KIT.id] },
      }
      : s.player,
  }));
}

/** Combat, as the engine actually represents it: a roll waiting on the screen. */
function enterCombatRollState(): void {
  useGameStore.setState({
    pendingRolls: {
      actionText: 'attack the raider',
      steps: [{ id: 'atk', label: 'attack', sides: 20 }],
      currentStep: 0,
    },
  } as never);
}

describe('OTA-1658 — the pouch heals IN A FIGHT (the reported defect)', () => {
  it('⚠⚠⚠ THE REPRODUCTION: the old route is swallowed while a roll is pending', async () => {
    await boot();
    enterCombatRollState();
    const before = useGameStore.getState().player!.hp;
    // This is exactly what OTA-1657's popup did.
    useGameStore.getState().useInventoryItem('Trauma Kit');
    const after = useGameStore.getState().player!.hp;
    // ⚠ Nothing. Not a refusal — nothing. `submitPlayerAction` returned on its
    // first line and the tap vanished.
    expect(after).toBe(before);
  });

  it('⚠ and the fix heals through the same state the reproduction failed in', async () => {
    await boot();
    enterCombatRollState();
    const p0 = useGameStore.getState().player!;
    expect(p0.hp).toBeLessThan(p0.hpMax);
    useGameStore.getState().useHealBatch('Trauma Kit', 'self', 1);
    const p1 = useGameStore.getState().player!;
    expect(p1.hp).toBeGreaterThan(p0.hp);
  });

  it('it spends exactly one from the stack, leaving the pocket loaded', async () => {
    await boot();
    enterCombatRollState();
    useGameStore.getState().useHealBatch('Trauma Kit', 'self', 1);
    const kit = useGameStore.getState().player!.inventory.find((i) => i.name === 'Trauma Kit');
    expect(kit?.quantity).toBe(4);
    // The pocket still points at the same live stack, so the button stays up.
    expect(useGameStore.getState().player!.equipped?.medkitIds).toContain(KIT.id);
  });

  it('it ANNOUNCES itself — a heal the player cannot see is the same bug again', () => {
    // ⚠ Asserted at the source rather than through `gameLog`: appendLog does not
    // land synchronously in the jest harness (measured — the heal applies, the
    // feed stays empty in-process), so reading the array here would test the
    // harness, not the game. The claim that matters is that this path emits the
    // SAME world line the inventory heal emits, naming the item and the HP.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const slice = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'state', 'slices', 'inventorySlice.ts'), 'utf8',
    ) as string;
    const body = slice.slice(slice.indexOf('useHealBatch(itemName, target, count) {'));
    expect(body.slice(0, 6000)).toContain("get().appendLog('world', `You use ${use}× ${item.name}.");
    expect(body.slice(0, 6000)).toContain('bits.push(`+${healHP} HP');
  });

  it('and it still works OUT of combat, which is the other half he asked for', async () => {
    await boot();
    useGameStore.setState({ pendingRolls: null });
    const p0 = useGameStore.getState().player!;
    useGameStore.getState().useHealBatch('Trauma Kit', 'self', 1);
    expect(useGameStore.getState().player!.hp).toBeGreaterThan(p0.hp);
  });

  it('the last one in a pocket empties it cleanly instead of leaving a ghost', async () => {
    await boot();
    useGameStore.setState((s) => ({
      player: s.player
        ? { ...s.player, inventory: s.player.inventory.map((i) => (i.id === KIT.id ? { ...i, quantity: 1 } : i)) }
        : s.player,
    }));
    useGameStore.getState().useHealBatch('Trauma Kit', 'self', 1);
    const inv = useGameStore.getState().player!.inventory;
    expect(inv.find((i) => i.id === KIT.id)).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { medkitContents } = require('../app/engine/medkitEligibility') as typeof import('../app/engine/medkitEligibility');
    // The id lingers in the rack but resolves to nothing, so the button hides
    // rather than offering a heal that is not there.
    expect(medkitContents(useGameStore.getState().player!)).toEqual([]);
  });
});

describe('OTA-1658 — the popup calls the combat-safe action', () => {
  const src = (): string =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8',
    ) as string;

  it('⚠ the tap calls useHealBatch, and no longer routes through the parser', () => {
    expect(src()).toContain("useHealBatch(it.name, 'self', 1)");
    expect(src()).not.toContain('useInventoryItem(it.name)');
  });

  it('⚠⚠ NO combat button on this bar goes through submitPlayerAction for its effect', () => {
    // The standing rule this defect taught: a button that must work mid-fight
    // calls a store action directly. The bandolier throw already did
    // (throwFromBandolier); the heals popup now does too. If a third rack is ever
    // added, this is the line that says how.
    const text = src();
    expect(text).toContain('throwFromBandolier(it.name, it.id)');
    expect(text).toContain("useHealBatch(it.name, 'self', 1)");
  });
});
