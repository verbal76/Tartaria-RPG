// OTA-873 — Crucible "Upgrade weapon" mode: spend 5 reserved pieces to add a SECOND
// coating slot to a weapon. A dual-coat weapon holds two coatings at once and BOTH
// fire on every landing hit. Covers:
//  (helpers)  coatingCapacity / nextCoatSlot / coatedDisplayName
//  (combat)   buildCombatSteps stages a second 'coating2' roll step
//  (store)    upgradeWeaponCoatingSlot consumes exactly 5 + sets coatingSlots=2, and
//             refuses a non-coatable / already-dual weapon / wrong pick count
//  (store)    applyCoating fills slot 2 (adds a 2nd coating) rather than replacing

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

import { buildCombatSteps } from '../app/engine/combatRules';
import { coatingCapacity, nextCoatSlot, coatedDisplayName } from '../app/engine/weaponCoating';
import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem, PlayerCharacter, Enemy } from '../app/engine/types';

const poison = { kind: 'poison' as const, dice: '1d4', label: 'Venomous' };
const acid = { kind: 'acid' as const, dice: '1d4', label: 'Corrosive' };

describe('OTA-873 — coating-slot helpers', () => {
  it('coatingCapacity is 1 by default and 2 once upgraded', () => {
    expect(coatingCapacity({})).toBe(1);
    expect(coatingCapacity({ coatingSlots: 2 })).toBe(2);
  });
  it('nextCoatSlot routes to slot 1, then slot 2 (upgraded), then replace', () => {
    expect(nextCoatSlot({})).toBe('coating');                                   // bare → slot 1
    expect(nextCoatSlot({ coating: poison })).toBe('replace');                  // single-slot, full → replace
    expect(nextCoatSlot({ coating: poison, coatingSlots: 2 })).toBe('coating2'); // dual, slot 2 open
    expect(nextCoatSlot({ coating: poison, coating2: acid, coatingSlots: 2 })).toBe('replace'); // both full
  });
  it('coatedDisplayName shows both coating adjectives', () => {
    expect(coatedDisplayName({ name: 'Rusted Blade', coating: poison, coating2: acid })).toBe('Venomous Corrosive Rusted Blade');
  });
});

function makePlayer(inv: InventoryItem[], equipped: Record<string, string>): PlayerCharacter {
  return {
    name: 'T', raceId: 'human_drifter', factionId: null, classId: null,
    hp: 20, maxHp: 20, stamina: 10, maxStamina: 10, ac: 10, tc: 0, level: 1, xp: 0,
    stats: { strength: 12, dexterity: 12, intelligence: 10, wisdom: 10, charisma: 10, constitution: 10 },
    inventory: inv, equipped, activeQuests: [], completedQuests: [], factionStanding: {},
    statusEffects: [], currentLocationId: 'tartarian_outskirts',
    activeFactionQuestIds: [], completedFactionQuestIds: [], activeHunts: [], completedHuntIds: [],
    activeMysteries: [], completedMysteryIds: [], activeStorylines: [], completedStorylineIds: [],
    mapX: 4, mapY: 4,
  } as unknown as PlayerCharacter;
}

const goblin: Enemy = { name: 'Mud Goblin', type: 'mud', abilityPoint: 'str', attack: '2', damage: '1d4', hp: 10, rarity: 'Common', loot: [] } as Enemy;

describe('OTA-873 — combat stages both coatings', () => {
  it('a dual-coat weapon adds a second coating roll step', () => {
    const w: InventoryItem = { id: 'w1', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [], coating: poison, coating2: acid } as InventoryItem;
    const steps = buildCombatSteps('attack the goblin', makePlayer([w], { mainId: 'w1' }), goblin);
    expect(steps.some((s) => s.id === 'coating')).toBe(true);
    expect(steps.some((s) => s.id === 'coating2')).toBe(true);
  });
  it('a single-coat weapon stages only one coating step', () => {
    const w: InventoryItem = { id: 'w2', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [], coating: poison } as InventoryItem;
    const steps = buildCombatSteps('attack the goblin', makePlayer([w], { mainId: 'w2' }), goblin);
    expect(steps.filter((s) => s.id === 'coating' || s.id === 'coating2')).toHaveLength(1);
  });
});

describe('OTA-873 — upgradeWeaponCoatingSlot + dual-slot applyCoating', () => {
  const reserved = (n: number): InventoryItem =>
    ({ id: `rsv_${n}`, name: `Odd Fragment ${n}`, kind: 'misc', quantity: 1, tags: ['loot'], reservedForFusion: true }) as InventoryItem;

  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Smith', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    const p = useGameStore.getState().player!;
    const blade: InventoryItem = { id: 'blade', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [] } as InventoryItem;
    useGameStore.setState({
      player: {
        ...p,
        fusionPending: true, // Crucible permit
        inventory: [
          ...p.inventory.filter((i) => i.name !== 'Rusted Blade'),
          blade,
          ...[1, 2, 3, 4, 5].map(reserved),
        ],
      },
    });
  });

  it('spends exactly 5 reserved pieces and grants a 2nd coating slot', () => {
    useGameStore.getState().upgradeCoatingSlot('blade', ['rsv_1', 'rsv_2', 'rsv_3', 'rsv_4', 'rsv_5']);
    const inv = useGameStore.getState().player!.inventory;
    const blade = inv.find((i) => i.id === 'blade')!;
    expect(coatingCapacity(blade)).toBe(2);
    expect(inv.filter((i) => i.name.startsWith('Odd Fragment'))).toHaveLength(0); // all 5 consumed
  });

  it('refuses the upgrade with the wrong number of pieces (weapon stays single-slot)', () => {
    useGameStore.getState().upgradeCoatingSlot('blade', ['rsv_1', 'rsv_2', 'rsv_3']); // only 3
    const blade = useGameStore.getState().player!.inventory.find((i) => i.id === 'blade')!;
    expect(coatingCapacity(blade)).toBe(1);
    // and nothing was consumed
    expect(useGameStore.getState().player!.inventory.filter((i) => i.name.startsWith('Odd Fragment'))).toHaveLength(5);
  });

  it('EXPLOIT GUARD — passing the same reserved id 5× is refused (no 1-piece upgrade)', () => {
    // Regression for the dup-id cost bypass: the same id repeated must NOT satisfy the
    // 5-piece gate. Weapon stays single-slot and the one fragment is not spent.
    useGameStore.getState().upgradeCoatingSlot('blade', ['rsv_1', 'rsv_1', 'rsv_1', 'rsv_1', 'rsv_1']);
    const inv = useGameStore.getState().player!.inventory;
    expect(coatingCapacity(inv.find((i) => i.id === 'blade')!)).toBe(1); // NOT upgraded
    expect(inv.filter((i) => i.name.startsWith('Odd Fragment'))).toHaveLength(5); // nothing consumed
  });

  // OTA-1117 — RETARGETED. This used to assert the stack was REFUSED outright.
  // That refusal told the player to "split one off first" — an instruction the game
  // gives no way to follow, so a stacked piece could never be upgraded at all and
  // the picker hid it. The upgrade now PEELS one unit (the same move OTA-800 makes
  // for coating a stack). The invariant this test exists to guard is unchanged and
  // still asserted below: the STACK is never stamped, so five pieces buy exactly
  // one upgraded instance, never N.
  it('EXPLOIT GUARD — a quantity>1 weapon stack peels ONE unit; the stack stays bare', () => {
    const p = useGameStore.getState().player!;
    // Turn the blade into a stack of 3.
    useGameStore.setState({
      player: { ...p, inventory: p.inventory.map((i) => (i.id === 'blade' ? { ...i, quantity: 3 } : i)) },
    });
    useGameStore.getState().upgradeCoatingSlot('blade', ['rsv_1', 'rsv_2', 'rsv_3', 'rsv_4', 'rsv_5']);
    const inv = useGameStore.getState().player!.inventory;
    const stack = inv.find((i) => i.id === 'blade')!;
    expect(stack.quantity).toBe(2);                 // one unit peeled off
    expect(coatingCapacity(stack)).toBe(1);         // the STACK is still bare — no mass-upgrade
    const peeled = inv.filter((i) => i.name === 'Rusted Blade' && i.id !== 'blade');
    expect(peeled).toHaveLength(1);
    expect(peeled[0]!.quantity).toBe(1);
    expect(coatingCapacity(peeled[0]!)).toBe(2);    // exactly ONE instance bought the channel
    expect(inv.filter((i) => i.name.startsWith('Odd Fragment'))).toHaveLength(0); // and it cost the 5
  });

  it('upgrades an ARMOR piece by raising its worked-in-resist capacity (+1)', () => {
    const p = useGameStore.getState().player!;
    const vest: InventoryItem = { id: 'vest', name: 'Padded Vest', kind: 'armor', quantity: 1, tags: [], addedResists: ['poison', 'acid', 'cold'] } as InventoryItem;
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, vest] } });
    useGameStore.getState().upgradeCoatingSlot('vest', ['rsv_1', 'rsv_2', 'rsv_3', 'rsv_4', 'rsv_5']);
    const after = useGameStore.getState().player!.inventory.find((i) => i.id === 'vest')!;
    expect(after.resistCapBonus).toBe(1); // 3 → 4 effective cap
    expect(useGameStore.getState().player!.inventory.filter((i) => i.name.startsWith('Odd Fragment'))).toHaveLength(0);
  });

  it('applyCoating fills the SECOND slot on an upgraded weapon instead of replacing the first', () => {
    // upgrade, seed slot 1 with poison, then apply an Acid Flask → should land in slot 2
    useGameStore.getState().upgradeCoatingSlot('blade', ['rsv_1', 'rsv_2', 'rsv_3', 'rsv_4', 'rsv_5']);
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [
          ...p.inventory.map((i) => (i.id === 'blade' ? { ...i, coating: poison } : i)),
          { id: 'flask', name: 'Acid Flask', kind: 'consumable', quantity: 1, tags: ['weapon_coating', 'acid'] } as InventoryItem,
        ],
      },
    });
    useGameStore.getState().applyCoating('flask', 'blade');
    const blade = useGameStore.getState().player!.inventory.find((i) => i.id === 'blade')!;
    expect(blade.coating?.kind).toBe('poison'); // slot 1 untouched
    expect(blade.coating2?.kind).toBe('acid');  // slot 2 filled
  });
});
