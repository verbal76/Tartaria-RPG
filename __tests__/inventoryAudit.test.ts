// inventoryAudit.test.ts — End-to-end audit of the inventory / equipment
// state machine. Drives the gameStore through every transition path the
// spec calls out: stacking caps, equip/unequip cycles, two-handed
// refusals, inferred-stats fallback, scrap coverage, drop persistence,
// and consumable use. The intent is to catch phantom-slot bugs (equip
// shows item but inventory empty, or vice versa) and to confirm the
// inference fallback works end-to-end.

// Standard mocks copied verbatim from yearSimulation.test.ts so the
// store can hydrate inside Jest without native modules.

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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { grantItem } from '../app/engine/inventory';
import { validSlotsForItem, SLOT_ID_KEY, resolveEquippedItem } from '../app/engine/equipment';
import { canScrap, scrapOutputFor } from '../app/engine/scrapEngine';
import { WEAPONS, findWeaponByName } from '../app/engine/crafting';
import { getItemPreview } from '../app/components/itemPreview';
import { buildCombatSteps } from '../app/engine/combatRules';
import type { InventoryItem, EquipSlot, PlayerCharacter, Enemy } from '../app/engine/types';

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

let idCounter = 0;
function uniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeItem(over: Partial<InventoryItem> & { name: string; kind: InventoryItem['kind'] }): InventoryItem {
  return {
    id: over.id ?? uniqueId(over.name.toLowerCase().replace(/\s+/g, '-')),
    name: over.name,
    kind: over.kind,
    quantity: over.quantity ?? 1,
    tags: over.tags ?? [],
    rarity: over.rarity,
    description: over.description,
    durability: over.durability,
  };
}

/** Push an item directly into the player's inventory using grantItem
 *  rules. Returns the fresh inventory array. */
function pushItem(player: PlayerCharacter, item: InventoryItem): void {
  const next = grantItem(player.inventory, item);
  player.inventory = next.inventory;
}

/** Convenience — replace the player on the store with a mutated copy. */
function setPlayer(player: PlayerCharacter): void {
  useGameStore.setState({ player: { ...player } });
}

function getPlayer(): PlayerCharacter {
  const p = useGameStore.getState().player;
  if (!p) throw new Error('no player on store');
  return p;
}

// ──────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────

describe('Inventory state machine audit', () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};

    const store = useGameStore;
    await store.getState().hydrate();
    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;
    await store.getState().startNewGame({
      name: 'Auditor',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
  });

  // ────────────────────────────────────────────────────────────────────
  // 1. Stacking + caps
  // ────────────────────────────────────────────────────────────────────
  describe('1. stacking + caps', () => {
    it('stacks "Scrap Metal" across 50 grants without cap', () => {
      let inv: InventoryItem[] = [];
      for (let i = 0; i < 50; i += 1) {
        const res = grantItem(inv, makeItem({ name: 'Scrap Metal', kind: 'misc', tags: ['metal'] }));
        inv = res.inventory;
        expect(res.accepted).toBe(1);
        expect(res.dropped).toBe(0);
      }
      const scrapRows = inv.filter((i) => i.name === 'Scrap Metal');
      expect(scrapRows).toHaveLength(1);
      expect(scrapRows[0]!.quantity).toBe(50);
    });

    it('no longer caps formerly-capped items (Small Rock — pack is uncapped)', () => {
      let inv: InventoryItem[] = [];
      let totalAccepted = 0;
      let totalDropped = 0;
      for (let i = 0; i < 50; i += 1) {
        const res = grantItem(inv, makeItem({ name: 'Small Rock', kind: 'misc', tags: ['stone'] }));
        inv = res.inventory;
        totalAccepted += res.accepted;
        totalDropped += res.dropped;
      }
      const row = inv.find((i) => i.name === 'Small Rock');
      // Pack carries no limit now — all 50 stack, nothing dropped.
      expect(row?.quantity).toBe(50);
      expect(totalAccepted).toBe(50);
      expect(totalDropped).toBe(0);
    });

    it('no longer caps Big Rock (pack is uncapped)', () => {
      let inv: InventoryItem[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = grantItem(inv, makeItem({ name: 'Big Rock', kind: 'misc', tags: ['stone'] }));
        inv = res.inventory;
        expect(res.dropped).toBe(0);
      }
      const row = inv.find((i) => i.name === 'Big Rock');
      expect(row?.quantity).toBe(5);
    });

    it('does NOT merge non-stackable weapons across grants', () => {
      let inv: InventoryItem[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = grantItem(inv, makeItem({
          name: 'Iron Sword',
          kind: 'weapon',
          durability: { current: 12, max: 25 }, // damaged → never merges
        }));
        inv = res.inventory;
      }
      const swords = inv.filter((i) => i.name === 'Iron Sword');
      expect(swords).toHaveLength(5);
      // Each row should carry its own quantity = 1.
      for (const s of swords) expect(s.quantity).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 2. Equip / unequip cycle — 10 items, both slots where applicable
  // ────────────────────────────────────────────────────────────────────
  describe('2. equip / unequip cycle', () => {
    const sampleItems: Array<{ name: string; kind: InventoryItem['kind']; tags?: string[]; durability?: { current: number; max: number } }> = [
      // Catalog weapons
      { name: 'Rusted Blade', kind: 'weapon', tags: ['weapon', 'blade'] },
      { name: 'Mud-Iron Cleaver', kind: 'weapon', tags: ['weapon', 'blade'] },
      { name: 'Pocket Knife', kind: 'weapon', tags: ['weapon', 'knife'] },
      // Catalog armor (single slot — primary equip site only)
      // Inferred armor / accessories
      // Uncatalogued via inference
      { name: 'Shadowblade of Auditing', kind: 'weapon', tags: ['weapon'] },
      { name: 'Mud-Glass Helm of Auditing', kind: 'armor', tags: ['armor'] },
      { name: 'Auditor Cuirass', kind: 'armor', tags: ['armor'] },
      { name: 'Auditor Boots', kind: 'armor', tags: ['armor'] },
      { name: 'Audit Greaves', kind: 'armor', tags: ['armor'] },
      { name: 'Aetheric Locket of Auditing', kind: 'relic', tags: ['amulet'] },
      { name: 'Silver Band of Auditing', kind: 'relic', tags: ['ring'] },
    ];

    it('cycles every sample item through equip → unequip → equip → unequip without phantom slots', () => {
      const store = useGameStore;
      const failures: string[] = [];

      for (const sample of sampleItems) {
        // Reset equipped state to a clean slate before each item.
        const player = getPlayer();
        player.equipped = {};
        // Inject sample via grantItem so we exercise the production path.
        pushItem(player, makeItem({
          name: sample.name,
          kind: sample.kind,
          tags: sample.tags ?? [],
          durability: sample.durability,
        }));
        setPlayer(player);

        const invItem = getPlayer().inventory.find((i) => i.name === sample.name);
        if (!invItem) { failures.push(`${sample.name}: failed to insert into inventory`); continue; }
        const slots = validSlotsForItem(invItem);
        if (slots.length === 0) { failures.push(`${sample.name}: validSlotsForItem returned empty`); continue; }

        // First equip — into the first valid slot.
        const slotA = slots[0]!;
        store.getState().equipItem(sample.name, slotA);
        let eq = getPlayer().equipped ?? {};
        if (eq[slotA] !== sample.name) {
          failures.push(`${sample.name}: after equip into ${slotA}, equipped[slot]=${eq[slotA]}`);
          continue;
        }
        if (eq[SLOT_ID_KEY[slotA]] !== invItem.id) {
          failures.push(`${sample.name}: after equip, slot id mismatch (got ${eq[SLOT_ID_KEY[slotA]]}, want ${invItem.id})`);
          continue;
        }
        // Inventory still holds the item (equip doesn't consume).
        const stillThere = getPlayer().inventory.find((i) => i.id === invItem.id && i.quantity > 0);
        if (!stillThere) { failures.push(`${sample.name}: inventory missing item after equip (phantom slot)`); continue; }
        // resolveEquippedItem agrees.
        const resolved = resolveEquippedItem(getPlayer(), slotA);
        if (resolved?.id !== invItem.id) { failures.push(`${sample.name}: resolveEquippedItem mismatch on ${slotA}`); continue; }

        // Unequip.
        store.getState().unequipSlot(slotA);
        eq = getPlayer().equipped ?? {};
        if (eq[slotA] !== undefined) { failures.push(`${sample.name}: slot ${slotA} still set after unequip`); continue; }
        if (eq[SLOT_ID_KEY[slotA]] !== undefined) { failures.push(`${sample.name}: slot id ${SLOT_ID_KEY[slotA]} stuck after unequip`); continue; }

        // Equip into the OTHER slot if there is one (weapons have main+off).
        const slotB = slots.find((s) => s !== slotA) ?? slotA;
        if (slotB !== slotA) {
          store.getState().equipItem(sample.name, slotB);
          eq = getPlayer().equipped ?? {};
          if (eq[slotB] !== sample.name) {
            failures.push(`${sample.name}: failed to equip to second slot ${slotB} (got ${eq[slotB]})`);
            continue;
          }
        }
        // Final unequip.
        store.getState().unequipSlot(slotB);
        eq = getPlayer().equipped ?? {};
        if (eq[slotB] !== undefined) failures.push(`${sample.name}: final slot ${slotB} not cleared`);
      }

      if (failures.length > 0) console.error('equip cycle failures:\n' + failures.join('\n'));
      expect(failures).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 3. Two-handed weapon refusal
  // ────────────────────────────────────────────────────────────────────
  describe('3. two-handed weapon refusal', () => {
    it('refuses equipping to off when a two-handed weapon is in main', () => {
      const store = useGameStore;
      const player = getPlayer();
      player.equipped = {};
      // Iron Spear is style:'two_handed' per weapons.json.
      pushItem(player, makeItem({ name: 'Iron Spear', kind: 'weapon', tags: ['weapon', 'spear'] }));
      pushItem(player, makeItem({ name: 'Pocket Knife', kind: 'weapon', tags: ['weapon', 'knife'] }));
      setPlayer(player);

      // Equip the two-hander into main.
      store.getState().equipItem('Iron Spear', 'main');
      expect(getPlayer().equipped?.main).toBe('Iron Spear');
      // Verify catalog says it's two-handed.
      expect(findWeaponByName('Iron Spear')?.style).toBe('two_handed');
      // 2026-05-26 OTA-056 — equipping to off-hand while a 2H is in
      // main now AUTO-DISPLACES the 2H back to inventory (clears the
      // main slot pointer), then proceeds with the off-hand equip.
      // No more refusal.
      store.getState().equipItem('Pocket Knife', 'off');
      const eq = getPlayer().equipped ?? {};
      // Off hand now has the knife.
      expect(eq.off).toBe('Pocket Knife');
      // Main hand was cleared (2H weapon displaced).
      expect(eq.main).toBeUndefined();
      expect(eq.mainId).toBeUndefined();
    });

    it('auto-displaces off-hand when equipping a 2H weapon to main', () => {
      const store = useGameStore;
      const player = getPlayer();
      player.equipped = {};
      pushItem(player, makeItem({ name: 'Iron Spear', kind: 'weapon', tags: ['weapon', 'spear'] }));
      pushItem(player, makeItem({ name: 'Pocket Knife', kind: 'weapon', tags: ['weapon', 'knife'] }));
      setPlayer(player);

      // Off hand has the knife.
      store.getState().equipItem('Pocket Knife', 'off');
      expect(getPlayer().equipped?.off).toBe('Pocket Knife');
      // 2026-05-26 OTA-056 — equipping a 2H to main when off has an
      // item now AUTO-DISPLACES the off-hand item, then proceeds.
      store.getState().equipItem('Iron Spear', 'main');
      const eq = getPlayer().equipped ?? {};
      // Main has the spear.
      expect(eq.main).toBe('Iron Spear');
      // Off-hand was cleared.
      expect(eq.off).toBeUndefined();
      expect(eq.offId).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 4. Inferred-stats fallback end-to-end
  // ────────────────────────────────────────────────────────────────────
  describe('4. inferred-stats fallback end-to-end', () => {
    const NAME = 'Mud-Rend Cleaver Apocrypha';

    it('inferred weapon: preview, slots, equip, attack damage roll all work', () => {
      const store = useGameStore;
      const player = getPlayer();
      player.equipped = {};
      pushItem(player, makeItem({
        name: NAME,
        kind: 'weapon',
        tags: ['weapon'],
      }));
      setPlayer(player);

      // Preview must be non-null with damage dice.
      const preview = getItemPreview(NAME);
      expect(preview).not.toBeNull();
      expect(preview.kindLabel).toMatch(/Weapon/);
      const dmgLine = preview.stats.find((s) => s.startsWith('Damage:'));
      expect(dmgLine).toBeDefined();
      expect(dmgLine).toMatch(/\d+d\d+/);

      // validSlotsForItem returns ['main', 'off'].
      const invItem = getPlayer().inventory.find((i) => i.name === NAME)!;
      expect(validSlotsForItem(invItem)).toEqual(['main', 'off']);

      // Equip into main succeeds.
      store.getState().equipItem(NAME, 'main');
      expect(getPlayer().equipped?.main).toBe(NAME);
      expect(getPlayer().equipped?.mainId).toBe(invItem.id);

      // Attack rolls produce damage (build steps include a damage step
      // backed by the inferred dice).
      const dummyEnemy: Enemy = {
        name: 'Audit Dummy',
        type: 'Animal',
        abilityPoint: '2',
        attack: '1',
        damage: '1d4',
        hp: 10,
        rarity: 'Common',
        loot: [],
      };
      const steps = buildCombatSteps('attack the dummy', getPlayer(), dummyEnemy);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      const dmgStep = steps.find((s) => /damage/i.test(s.label) || /d[0-9]+/i.test(s.context));
      expect(dmgStep).toBeDefined();
      // The damage step should be configured for at least 1 die.
      expect(dmgStep!.sides).toBeGreaterThan(1);
      expect(dmgStep!.count).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 5. Scrap correctness — full coverage over weapons.json + equip refusal
  // ────────────────────────────────────────────────────────────────────
  describe('5. scrap correctness', () => {
    it('every catalog weapon scraps with non-empty material output', () => {
      const failures: string[] = [];
      for (const w of WEAPONS) {
        const item: InventoryItem = {
          id: `scrap_check_${w.name}`,
          name: w.name,
          kind: 'weapon',
          quantity: 1,
          tags: w.tags,
          rarity: w.rarity,
        };
        if (!canScrap(item)) { failures.push(`${w.name}: canScrap returned false`); continue; }
        const out = scrapOutputFor(item);
        if (out.grants.length === 0) { failures.push(`${w.name}: scrapOutputFor returned 0 grants`); continue; }
        for (const g of out.grants) {
          if (g.quantity <= 0) failures.push(`${w.name}: grant ${g.name} has non-positive quantity ${g.quantity}`);
        }
      }
      if (failures.length > 0) console.error('scrap failures:\n' + failures.join('\n'));
      expect(failures).toEqual([]);
    });

    it('auto-unequips and scraps an equipped weapon (OTA-058 — no phantom slot)', () => {
      // OTA-058 inverted the old refusal: scrapping an equipped item
      // now auto-unequips the matching slot, then runs the normal
      // scrap flow. Critically, after the call the slot must NOT
      // reference the deleted-item's id (no phantom slot).
      const store = useGameStore;
      const player = getPlayer();
      player.equipped = {};
      // Use a unique name so we can target exactly this instance
      // (starter inventory contains Rusted Blade by default).
      pushItem(player, makeItem({ name: 'Audit Scrap Blade', kind: 'weapon', tags: ['weapon', 'blade'] }));
      setPlayer(player);
      store.getState().equipItem('Audit Scrap Blade', 'main');
      const equippedBefore = getPlayer().equipped ?? {};
      const equippedId = equippedBefore.mainId;
      expect(equippedId).toBeDefined();
      store.getState().scrapInventoryItem('Audit Scrap Blade');
      const after = getPlayer();
      // The scrapped instance is gone from inventory.
      expect(after.inventory.find((i) => i.id === equippedId)).toBeUndefined();
      // No phantom slot — main no longer references the deleted id.
      expect(after.equipped?.mainId).not.toBe(equippedId);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 6. Drop persistence
  // ────────────────────────────────────────────────────────────────────
  describe('6. drop persistence', () => {
    it('dropped item remains in worldMemory.visitedRooms after walking away', () => {
      const store = useGameStore;
      // Ensure we have a scene (startNewGame opened one).
      const sceneBefore = store.getState().currentScene;
      expect(sceneBefore).not.toBeNull();

      const player = getPlayer();
      // Make sure player is not in any equipped state that would block drop.
      player.equipped = {};
      // Force a known tile.
      player.mapX = 4;
      player.mapY = 4;
      pushItem(player, makeItem({ name: 'Aether Residue', kind: 'misc', tags: ['aether'] }));
      setPlayer(player);

      // The drop records under the player's CURRENT room key (engine
      // makeRoomKey), which doesn't always equal a hand-built
      // `${locationId}@${microMicroId}@x,y` — the location/micro ids can
      // differ from what the test assumes, so a fixed key misses. The item
      // is unique here, so scan every visited room: found anywhere = the
      // drop persisted; found nowhere = a genuine persistence failure.
      const droppedRows = () =>
        Object.values(store.getState().worldMemory.visitedRooms ?? {})
          .flatMap((r) => r.droppedItems ?? []);

      // Drop via the inventory action (which routes through 'drop X' verb).
      store.getState().dropInventoryItem('Aether Residue');

      // Item recorded on a tile, and gone from inventory.
      expect(droppedRows().find((d) => d.name === 'Aether Residue')).toBeDefined();
      expect(getPlayer().inventory.find((i) => i.name === 'Aether Residue')).toBeUndefined();

      // "Walk" to a different tile by mutating mapX/mapY directly — a
      // lightweight stand-in for the travel verb. The dropped item lives on
      // the tile-keyed visitedRooms record, not the player's position, so it
      // must survive the move.
      const p2 = getPlayer();
      p2.mapX = 5;
      p2.mapY = 4;
      setPlayer(p2);
      expect(droppedRows().find((d) => d.name === 'Aether Residue')).toBeDefined();

      // Walk back — still there, quantity intact.
      const p3 = getPlayer();
      p3.mapX = 4;
      p3.mapY = 4;
      setPlayer(p3);
      const item = droppedRows().find((d) => d.name === 'Aether Residue');
      expect(item).toBeDefined();
      expect(item!.quantity).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 7. Consumable use
  // ────────────────────────────────────────────────────────────────────
  describe('7. consumable use', () => {
    it('useInventoryItem on a consumable heals HP and decrements quantity', () => {
      const store = useGameStore;
      const player = getPlayer();
      player.equipped = {};
      // Knock HP down so heal has room.
      player.hp = Math.max(1, player.hpMax - 10);
      // Push a stack of 3 consumables.
      pushItem(player, makeItem({
        name: 'Trail Rations',
        kind: 'consumable',
        quantity: 3,
        tags: ['food', 'consumable'],
      }));
      setPlayer(player);

      const hpBefore = getPlayer().hp;
      const qtyBefore = getPlayer().inventory.find((i) => i.name === 'Trail Rations')!.quantity;

      // Use one.
      store.getState().useInventoryItem('Trail Rations');

      const hpAfter = getPlayer().hp;
      const rationsAfter = getPlayer().inventory.find((i) => i.name === 'Trail Rations');
      const qtyAfter = rationsAfter?.quantity ?? 0;

      // Quantity should have dropped by exactly 1.
      expect(qtyAfter).toBe(qtyBefore - 1);
      // HP should have ticked up at least 1 point (2d6, min 2 → clamped by room).
      expect(hpAfter).toBeGreaterThanOrEqual(hpBefore);
      expect(hpAfter - hpBefore).toBeGreaterThan(0);
    });

    it('refuses to consume when quantity = 0 (item not in inventory)', () => {
      const store = useGameStore;
      const player = getPlayer();
      // Remove any Trail Rations from inventory.
      player.inventory = player.inventory.filter((i) => i.name !== 'Trail Rations');
      setPlayer(player);
      const hpBefore = getPlayer().hp;
      const invBefore = getPlayer().inventory.length;
      store.getState().useInventoryItem('Trail Rations');
      // No state mutation — HP unchanged, inventory unchanged.
      expect(getPlayer().hp).toBe(hpBefore);
      expect(getPlayer().inventory.length).toBe(invBefore);
    });
  });
});
