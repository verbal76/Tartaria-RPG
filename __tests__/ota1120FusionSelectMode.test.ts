// OTA-1120 — THE FUSABLE VIEW BECOMES A SELECTION SURFACE.
//
// Owner: "we also need a select all button on the category headers in inventory
// when we select sort by fusable so you can select a whole category. and if you
// tap on an item that has been selected it automatically deselects."
//
// Reserving a category one row at a time was the same complaint OTA-968 answered
// for a single stack, one level up. Two changes, one idea: in the FUSABLE view
// every row is Crucible stock and the only question is in or out, so the view
// stops behaving like a browser and starts behaving like a checklist.
//
// The load-bearing facts this suite guards:
//   · reserveManyForFusion moves WHOLE stacks and enforces every gate a single
//     tap enforces — a bulk control that could reserve a quest item, or that
//     moved one unit per row, would be worse than no control;
//   · it is idempotent, so a double-tap cannot double-count;
//   · freeing is always allowed, so no rule change can strand a row;
//   · the tap toggles in BOTH directions (deselect-on-tap without
//     select-on-tap would be maddening), and long-press keeps the item menu.

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

// Inferred (catalog-absent) misc loot — the Crucible's actual fodder.
const scrap = (id: string, name: string, qty = 1, over?: Partial<InventoryItem>): InventoryItem =>
  ({ id, name, kind: 'misc', quantity: qty, tags: ['loot'], ...(over ?? {}) }) as InventoryItem;

const inv = () => useGameStore.getState().player!.inventory;
const byId = (id: string) => inv().find((i) => i.id === id);

describe('OTA-1120 — reserveManyForFusion', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Picker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [
          ...p.inventory,
          scrap('a', 'Odd Fragment A'),
          scrap('b', 'Odd Fragment B'),
          scrap('c', 'Odd Fragment C', 4), // a stack, to prove whole-stack movement
        ],
      },
    });
  });

  it('reserves a whole category in ONE call, whole stacks and all', () => {
    useGameStore.getState().reserveManyForFusion(['a', 'b', 'c'], true);
    expect(byId('a')?.reservedForFusion).toBe(true);
    expect(byId('b')?.reservedForFusion).toBe(true);
    const stack = byId('c')!;
    expect(stack.reservedForFusion).toBe(true);
    // The whole stack moved — a bulk control that peeled one unit per row would
    // leave the player worse off than tapping.
    expect(stack.quantity).toBe(4);
  });

  it('CLEAR is the exact inverse — freeing is always allowed', () => {
    useGameStore.getState().reserveManyForFusion(['a', 'b', 'c'], true);
    useGameStore.getState().reserveManyForFusion(['a', 'b', 'c'], false);
    for (const id of ['a', 'b', 'c']) {
      expect(byId(id)?.reservedForFusion).toBeFalsy();
    }
    expect(byId('c')?.quantity).toBe(4);
  });

  it('IDEMPOTENT — calling it twice cannot double-count or duplicate a row', () => {
    const before = inv().length;
    useGameStore.getState().reserveManyForFusion(['a', 'b', 'c'], true);
    const after1 = inv().map((i) => `${i.id}:${i.quantity}:${i.reservedForFusion ?? false}`).sort();
    useGameStore.getState().reserveManyForFusion(['a', 'b', 'c'], true);
    const after2 = inv().map((i) => `${i.id}:${i.quantity}:${i.reservedForFusion ?? false}`).sort();
    expect(after2).toEqual(after1);
    expect(inv().length).toBe(before);
  });

  it('skips ids that are not in the pack instead of throwing', () => {
    useGameStore.getState().reserveManyForFusion(['a', 'ghost_id'], true);
    expect(byId('a')?.reservedForFusion).toBe(true);
    expect(byId('ghost_id')).toBeUndefined();
  });

  it('a QUEST-LOCKED row is never swept up by the bulk button', () => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [...p.inventory, scrap('q', 'Nimari Core', 1, { tags: ['quest'] })],
      },
    });
    useGameStore.getState().reserveManyForFusion(['a', 'q'], true);
    expect(byId('a')?.reservedForFusion).toBe(true);
    expect(byId('q')?.reservedForFusion).toBeFalsy(); // the lock holds
  });

  it('a row that cannot be forge-reserved is refused, exactly as a single tap would be', () => {
    // OTA-756: a catalog weapon can't be freshly reserved. The bulk path must
    // apply the SAME gate — a select-all that quietly reserved things the
    // Crucible then ignores is the ♥-that-does-nothing bug, at scale.
    const p = useGameStore.getState().player!;
    const blade = { id: 'w', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [] } as InventoryItem;
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, blade] } });
    useGameStore.getState().reserveManyForFusion(['w'], true);
    expect(byId('w')?.reservedForFusion).toBeFalsy();
  });

  it('an already-reserved row can always be FREED even if it could not be re-reserved', () => {
    // The escape hatch: nothing gets stranded by a future rule change.
    const p = useGameStore.getState().player!;
    const blade = { id: 'w2', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [], reservedForFusion: true } as InventoryItem;
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, blade] } });
    useGameStore.getState().reserveManyForFusion(['w2'], false);
    expect(byId('w2')?.reservedForFusion).toBe(false);
  });

  it('folds a moved row into an existing same-unit row already in the target state', () => {
    // Two rows of the same thing, one already reserved: after the bulk reserve
    // the player should see ONE row of 5, not two rows they have to reason about.
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [...p.inventory, scrap('c_rsv', 'Odd Fragment C', 1, { reservedForFusion: true })],
      },
    });
    useGameStore.getState().reserveManyForFusion(['c'], true);
    const rows = inv().filter((i) => i.name === 'Odd Fragment C');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(5);
    expect(rows[0]!.reservedForFusion).toBe(true);
  });

  it('does nothing at all when every id is already in the target state', () => {
    useGameStore.getState().reserveManyForFusion(['a'], true);
    const snapshot = JSON.stringify(inv());
    useGameStore.getState().reserveManyForFusion(['a'], true);
    expect(JSON.stringify(inv())).toBe(snapshot);
  });
});

describe('OTA-1120 — source locks on the selection surface', () => {
  const view = src('app/screens/InventoryScreen.tsx');

  it('the FUSABLE view is a selection mode, and the pouch/bandolier fills still win the tap', () => {
    // Two "armed" tap modes at once would be a coin flip.
    expect(view).toContain("const fusionSelectMode = sortKey === 'fusionable' && !pouchFilterActive && !bandolierFilterActive;");
  });

  it('a tap TOGGLES in both directions and moves the whole stack', () => {
    expect(view).toContain('if (fusionSelectMode && !isQuestLockedItem(item)) {');
    expect(view).toContain('toggleReserveForFusion(item.id, item.quantity ?? 1);');
  });

  // OTA-1123 — SUPERSEDED, deliberately. This OTA's long-press opened the item
  // sheet as an escape hatch from tap-to-toggle. OTA-1123 gave the whole
  // inventory a hold-to-group gesture, and one gesture has to mean one thing on
  // a screen — so the hold is the group now. The single-unit "Save 1 for fusion"
  // that hatch reached is still reachable (switch off the FUSABLE axis and tap),
  // and the FUSABLE banner says so, which is what the assertion moved to.
  it('long-press starts a GROUP now; the per-unit route is still signposted', () => {
    expect(view).toContain('const handleItemLongPress = ');
    expect(view).toContain('onLongPress={() => handleItemLongPress(item)}');
    expect(view).toContain('beginInvSelect(item.id);');
    // The hatch was not dropped silently — the banner names where it went.
    expect(view).toContain('switch sort and tap the item');
  });

  it('the SELECT ALL chip renders in the header but does not collapse the section', () => {
    expect(view).toContain('styles.selectAllBtn');
    expect(view).toContain('reserveManyForFusion(sel.ids, !sel.allSelected)');
    // Its own onPress — if it inherited the header's, tapping it would fold away
    // the very rows it just reserved.
    expect(view).toMatch(/onPress=\{\(\) => reserveManyForFusion\(/);
  });

  it('the chip only appears in the FUSABLE view, and never claims a count it cannot deliver', () => {
    expect(view).toContain('{fusionSelectMode && (() => {');
    expect(view).toContain('if (sel.eligible === 0) return null;');
    // The count comes from the SAME filter the store applies, quest-locks included.
    expect(view).toContain('rows.filter((i) => !isQuestLockedItem(i) && (i.reservedForFusion || isFusionEligible(i)))');
  });

  it('the mode says itself out loud, and a reserved row is visibly selected', () => {
    expect(view).toContain('styles.fusionModeBanner');
    expect(view).toContain('Tap to reserve');
    expect(view).toContain('styles.rowSelected');
    // OTA-1123 — the role now also covers group mode; the FUSABLE checkbox
    // semantics this test guards are unchanged, they just share the branch.
    expect(view).toMatch(/accessibilityRole=\{grouped \|\| selectable \? 'checkbox' : 'button'\}/);
    expect(view).toMatch(/selectable \? \{ checked: item\.reservedForFusion === true \}/);
  });
});

describe('OTA-1120 — the merge predicate has ONE definition', () => {
  it('sameStackUnit is module-level and every reserve path routes through it', () => {
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('function sameStackUnit(a: InventoryItem, b: InventoryItem): boolean {');
    // Was three identical local closures — three chances for one to fall behind
    // when a new per-instance field lands.
    expect((store.match(/const sameUnit = sameStackUnit;/g) ?? []).length).toBe(2);
    expect(store).not.toMatch(/const sameUnit = \(a: InventoryItem, b: InventoryItem\): boolean =>/);
  });
});
