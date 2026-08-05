// OTA-1123 — THE INVENTORY LEARNS THE SAME GRIP.
//
// Owner, after OTA-1122's group sell: "yes wire drop, fusable select and scrap
// the same way."
//
// The point is the sameness. One gesture, one meaning, wherever you are: HOLD a
// row to start a group, TAP to add or remove, act on the lot. A player who never
// holds a row sees no change at all.
//
// What this suite guards:
//   · the group's per-action eligibility MIRRORS the single-item paths, so a
//     bulk button can never sweep up something one tap would have refused and
//     can never claim a count it cannot deliver;
//   · DROP is instance-exact — two rows of the same name drop the ones you
//     ticked, not whichever sorts first;
//   · the confirm carries the warnings each single path raises, especially
//     SCRAP's silent auto-unequip;
//   · the selection is derived from the live inventory, so a row that stops
//     existing falls out of the group instead of lingering as a dead id.

jest.setTimeout(30000);

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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const view = src('app/screens/InventoryScreen.tsx');

describe('OTA-1123 — DROP is instance-exact', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Holder', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('⚠ drops the TICKED copy, not whichever same-name row sorts first', async () => {
    // Two "Odd Trinket" rows with different durability. A group drop that
    // resolved by NAME would take an arbitrary one — and the player would watch
    // the wrong instance hit the dirt while the count still looked right.
    const p = useGameStore.getState().player!;
    const worn = { id: 'trinket_good', name: 'Odd Trinket', kind: 'misc', quantity: 1, tags: ['loot'], durability: { current: 9, max: 10 } } as unknown as InventoryItem;
    const junk = { id: 'trinket_junk', name: 'Odd Trinket', kind: 'misc', quantity: 1, tags: ['loot'], durability: { current: 1, max: 10 } } as unknown as InventoryItem;
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, worn, junk] } });

    useGameStore.getState().dropInventoryItem('Odd Trinket', 'trinket_junk');
    await new Promise((r) => setTimeout(r, 1200));

    const left = useGameStore.getState().player!.inventory.filter((i) => i.name === 'Odd Trinket');
    expect(left).toHaveLength(1);
    expect(left[0]!.id).toBe('trinket_good');
    expect(left[0]!.durability?.current).toBe(9);
  });

  it('a name-only call still works, so typed "drop X" is unaffected', async () => {
    const p = useGameStore.getState().player!;
    const one = { id: 'solo', name: 'Lone Cog', kind: 'misc', quantity: 1, tags: ['loot'] } as unknown as InventoryItem;
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, one] } });
    useGameStore.getState().dropInventoryItem('Lone Cog');
    await new Promise((r) => setTimeout(r, 1200));
    expect(useGameStore.getState().player!.inventory.find((i) => i.id === 'solo')).toBeUndefined();
  });
});

describe('OTA-1123 — one gesture, one meaning', () => {
  it('HOLD starts a group anywhere in the inventory; TAP adds once one is open', () => {
    expect(view).toContain('const beginInvSelect = (id: string) => { setInvSelectMode(true); setInvSelected([id]); };');
    // Checked FIRST in the tap handler so it beats every other tap meaning on
    // this screen — including the FUSABLE reserve-toggle.
    expect(view).toMatch(/const handleItemTap = \(item: InventoryItem\) => \{[\s\S]{0,400}?if \(invSelectMode\) \{ toggleInvSelect\(item\.id\); return; \}/);
    expect(view).toContain('onLongPress={() => handleItemLongPress(item)}');
  });

  it('the pouch / bandolier fill modes still own the tap — no two live modes', () => {
    expect(view).toMatch(/if \(pouchFilterActive \|\| bandolierFilterActive\) return;[\s\S]{0,120}beginInvSelect/);
  });

  it('emptying the group leaves the mode', () => {
    expect(view).toMatch(/const toggleInvSelect[\s\S]{0,400}if \(next\.length === 0\) setInvSelectMode\(false\);/);
  });

  it('a picked row is ticked, outlined, and reads as a checkbox', () => {
    expect(view).toContain('grouped && groupPicked && styles.rowGrouped');
    expect(view).toContain("{groupPicked ? '☑' : '☐'}");
    expect(view).toContain("accessibilityRole={grouped || selectable ? 'checkbox' : 'button'}");
  });
});

describe('OTA-1123 — the group can only do what one tap could', () => {
  it('DROP skips worn and quest-bound rows, exactly as the drop verb does', () => {
    expect(view).toContain('const droppable = selectedItems.filter((i) => !isQuestLockedItem(i) && !wornIds.has(i.id));');
  });

  it('SCRAP allows worn gear (it auto-unequips) but never raw stock or quest items', () => {
    // OTA-058 made scrap auto-unequip rather than refuse, so excluding worn gear
    // here would be stricter than the single-item path — a different rule, which
    // is the drift this asserts against.
    expect(view).toContain('const scrappable = selectedItems.filter((i) => !isQuestLockedItem(i) && canScrap(i));');
  });

  it('RESERVE / RELEASE route through the OTA-1120 bulk action, not a second path', () => {
    expect(view).toContain('reserveManyForFusion(reservable.map((i) => i.id), true);');
    expect(view).toContain('reserveManyForFusion(releasable.map((i) => i.id), false);');
    expect(view).toContain('const reservable = selectedItems.filter((i) => !isQuestLockedItem(i) && !i.reservedForFusion && isFusionEligible(i));');
  });

  it('a button is HIDDEN when it would act on nothing, and the counts come from the same predicates', () => {
    expect(view).toContain('{droppable.length > 0 && (');
    expect(view).toContain('{scrappable.length > 0 && (');
    expect(view).toContain('DROP {droppable.length}');
    expect(view).toContain('SCRAP {scrappable.length}');
    // …and when NOTHING can act, the bar says why rather than going blank.
    expect(view).toContain('quest-bound items stay with you');
  });

  it('⚠ the confirm names SCRAP\'s silent auto-unequip', () => {
    // The single-item path takes worn gear off without asking (OTA-058). At
    // group scale that has to be said out loud, or a player strips their own kit
    // by ticking a row they forgot they were wearing.
    expect(view).toContain('Worn right now — these will be taken off first');
    expect(view).toContain('This cannot be undone.');
  });

  it('the confirm itemises what is going, and says what was skipped', () => {
    expect(view).toContain(".map((i) => `· ${i.name}");
    expect(view).toContain("Skipped: ${selectedItems.length - droppable.length}");
    expect(view).toContain("Skipped: ${selectedItems.length - scrappable.length}");
  });

  it('selection is DERIVED from the live inventory, never stored as rows', () => {
    expect(view).toContain('const selectedItems = invSelected');
    expect(view).toContain('.find((i) => i.id === id && i.quantity > 0))');
    expect(view).toContain('.filter((i): i is InventoryItem => !!i);');
  });

  it('a completed group action clears the selection AND the mode', () => {
    expect(view).toMatch(/const runGroupAction = \(\) => \{[\s\S]*?exitInvSelect\(\);\s*\};/);
    expect(view).toContain('const exitInvSelect = () => { setInvSelectMode(false); setInvSelected([]); setInvGroupAction(null); };');
  });

  it('the FUSABLE banner now names the hold, and points at where per-unit lives', () => {
    // OTA-1120's long-press-opens-the-sheet hatch is gone (the hold is the group
    // now), so the banner has to say where the single-unit control went.
    expect(view).toContain('hold a row to build a group');
    expect(view).toContain('switch sort and tap the item');
  });
});
