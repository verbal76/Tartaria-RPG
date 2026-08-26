// OTA-1511 — THE SPEAR LEAVES YOUR HAND (step 5, the last of the combat
// range rework).
//
// ⚠⚠⚠ Owner, verbatim: *"you should have spare and then throw spear button."*
//
// The long shafts (throwable+spear — javelins and throwing spears) are the
// one throwable population with NO throw path: OTA-605 turns them away from
// the bandolier ("carry it in hand") and its throw button with them. Now they
// hurl via throwHeldWeapon — the same rack-in-the-off-hand + throwSettlement
// dance the bandolier's weapon tail uses, so the whole attack pipeline comes
// free: throwable reach bands, authored catalog dice, coatings,
// consume-on-hit with auto-unequip, and the group's answer. The THROW SPEAR
// button lights when a SPARE rides the pack. The OTA-1140 seal holds:
// rackable small ordnance still has to be racked — spears are
// bandolier-INELIGIBLE, so no cap is bypassed.
//
// ⚠⚠ AND THE SHADOW FIX RIDES ALONG: getEquippedWeapon's OTA-208 throwable
// synthesize loop pre-empted the catalog for EVERY throwable-tagged item, so
// a catalogued throwing weapon landed weight-scaled dice with a hardcoded
// 'aetheric' type instead of its authored row — the same shadow class the
// OTA-1510 shield-dice branch died of. Authored rows win now; the
// catalog-absent shards/plates/samples the loop was built for still
// synthesize.

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
jest.mock('../app/engine/rng', () => ({
  ...jest.requireActual('../app/engine/rng'),
  rollDie: jest.fn((sides: number) => (sides === 20 ? 10 : 2)),
  rollFromNotation: jest.fn(() => 10),
  pick: jest.fn(<T,>(arr: T[]) => arr[0]),
}));

import { useGameStore } from '../app/state/gameStore';
import { getEquippedWeapon } from '../app/engine/combatRules';
import { itemIsHandThrownSpear, isBandolierEligible } from '../app/engine/bandolierEligibility';
import { WEAPONS } from '../app/engine/crafting';
import type { Enemy, InventoryItem, PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const ROOT = join(__dirname, '..');
const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
const INPUT = readFileSync(join(ROOT, 'app', 'components', 'InputBox.tsx'), 'utf8');
const RULES = readFileSync(join(ROOT, 'app', 'engine', 'combatRules.ts'), 'utf8');

const foe = (name: string, over: Partial<Enemy> = {}): Enemy => ({
  name, type: 'Human', abilityPoint: 'Strength 6', attack: 'Cudgel',
  damage: '10', hp: 60, rarity: 'Common', loot: [], ...over,
});

const SPEAR: InventoryItem = {
  id: 'i_throwspear', name: 'Mud Spear (Throwing)', kind: 'weapon', quantity: 1,
  tags: ['throwable', 'weapon', 'ranged', 'two_handed', 'spear', 'mud_dwellers'],
} as InventoryItem;

async function fighter(name: string, extra: InventoryItem[]) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
  store.getState().skipTutorial?.();
  const p = store.getState().player!;
  useGameStore.setState({
    player: {
      ...p, hp: 100, hpMax: 100, stamina: 50, staminaMax: 50,
      inventory: [...p.inventory, ...extra],
      statusEffects: [],
      ac: 1,
    } as unknown as PlayerCharacter,
  });
  return store;
}

function stageFight(enemies: Enemy[]) {
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies,
      enemyHps: enemies.map((e) => e.hp),
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: enemies.map(() => true),
      enemyKnockedOut: enemies.map(() => false),
      enemyStaggered: enemies.map(() => 0),
      stealthOpenerUsed: true,
    },
  });
}

const log = () => useGameStore.getState().gameLog.map((e) => e.text).join('\n');

function drainRolls() {
  let guard = 0;
  while (useGameStore.getState().pendingRolls) {
    if (guard++ > 60) throw new Error('roll loop did not terminate');
    const pr = useGameStore.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    useGameStore.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
  }
}
async function settleAttack() {
  for (let i = 0; i < 10; i++) {
    drainRolls();
    await new Promise((r) => setTimeout(r, 120));
  }
  drainRolls();
}

describe('OTA-1511 — the hand-thrown-spear population', () => {
  it('⚠⚠ exactly the six long shafts qualify — launchers, emergency melee spears, and knives all stay out', () => {
    const rows = WEAPONS.filter((w: { name: string; tags?: string[] }) =>
      itemIsHandThrownSpear({ id: 'x', name: w.name, kind: 'weapon', quantity: 1, tags: w.tags ?? [] } as InventoryItem));
    expect(rows.map((r: { name: string }) => r.name).sort()).toEqual([
      'Bone Javelin', 'Bone War Javelin', 'Mud Spear (Throwing)',
      'Plasma Spear', 'Tartarian Hand Spear', 'Tartarian Spear (Throw)',
    ]);
    // Each carries authored dice — the pipeline never needs to invent any.
    for (const r of rows as Array<{ damageDice?: string }>) expect(r.damageDice).toMatch(/^\d+d\d+$/);
    // The launcher launches, the emergency melee spear stays typed-improvised,
    // the knife stays on the bandolier.
    const named = (n: string) => {
      const w = WEAPONS.find((x: { name: string }) => x.name === n)!;
      return itemIsHandThrownSpear({ id: 'x', name: w.name, kind: 'weapon', quantity: 1, tags: w.tags ?? [] } as InventoryItem);
    };
    expect(named('Bone Spear Launcher')).toBe(false);
    expect(named('Iron Spear')).toBe(false);
    expect(named('Throwing Knife')).toBe(false);
  });

  it('⚠ the OTA-605 seal holds: every hand-thrown spear is still bandolier-INELIGIBLE', async () => {
    const store = await fighter('Sealcheck', [SPEAR]);
    const verdict = isBandolierEligible(SPEAR, store.getState().player!);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('too long for the bandolier');
  });
});

describe('OTA-1511 — authored rows win (the OTA-208 shadow fix)', () => {
  it('⚠⚠ an equipped catalogued throwable lands its AUTHORED dice, not weight dice with aetheric stamped on', async () => {
    const store = await fighter('Author', [SPEAR]);
    const p = store.getState().player!;
    useGameStore.setState({
      player: { ...p, equipped: { ...(p.equipped ?? {}), off: SPEAR.name, offId: SPEAR.id } } as unknown as PlayerCharacter,
    });
    const w = getEquippedWeapon(store.getState().player!, 'off');
    expect(w?.name).toBe('Mud Spear (Throwing)');
    expect(w?.damageDice).toBe('1d8');
    expect(w?.damageType).toBe('piercing');
  });

  it('⚠ a catalog-absent throwable still synthesizes the OTA-208 one-shot (weight dice, aetheric)', async () => {
    const chunk: InventoryItem = {
      id: 'i_chunk', name: 'Humming Chunk', kind: 'material', quantity: 1, tags: ['throwable'],
    } as unknown as InventoryItem;
    const store = await fighter('Synth', [chunk]);
    const p = store.getState().player!;
    useGameStore.setState({
      player: { ...p, equipped: { ...(p.equipped ?? {}), off: chunk.name, offId: chunk.id } } as unknown as PlayerCharacter,
    });
    const w = getEquippedWeapon(store.getState().player!, 'off');
    expect(w?.name).toBe('Humming Chunk');
    expect(w?.weaponKind).toBe('ranged');
    expect(w?.damageType).toBe('aetheric');
    expect(w?.damageDice).toBeTruthy();
  });
});

describe('OTA-1511 — THE THROW ITSELF', () => {
  it('⚠⚠⚠ A HURLED SPARE SPEAR: full pipeline, real damage, the shaft is SPENT and the hand comes back', async () => {
    const store = await fighter('Hurler', [SPEAR]);
    stageFight([foe('Raider', { pos: { bearing: 0, distance: 0.5 }, hp: 60 })]);
    store.getState().throwHeldWeapon(SPEAR.name, SPEAR.id);
    await settleAttack();
    const out = log();
    // The attack resolved AS the spear…
    expect(out).toMatch(/Mud Spear \(Throwing\)/);
    // …dealt real damage…
    expect((store.getState().currentScene!.enemyHps[0] ?? 60)).toBeLessThan(60);
    // …the one-shot spent the shaft (qty 1 → gone)…
    expect(store.getState().player!.inventory.some((i) => i.id === SPEAR.id)).toBe(false);
    // …and the hand is not left holding a ghost.
    expect(store.getState().player!.equipped?.offId).not.toBe(SPEAR.id);
  });

  it('⚠⚠ no spear, no throw: the refusal names the long shafts and spends NOTHING', async () => {
    const rock: InventoryItem = {
      id: 'i_rock', name: 'River Stone', kind: 'material', quantity: 1, tags: ['thrown'],
    } as unknown as InventoryItem;
    const store = await fighter('Empty', [rock]);
    stageFight([foe('Raider', { pos: { bearing: 0, distance: 0.5 } })]);
    store.getState().throwHeldWeapon('River Stone', 'i_rock');
    expect(log()).toContain('No throwing spear to hand');
    expect(store.getState().player!.inventory.some((i) => i.id === 'i_rock')).toBe(true);
    expect(store.getState().pendingRolls).toBeFalsy();
  });
});

describe('OTA-1511 — the wiring (source claims)', () => {
  it('⚠⚠ the THROW SPEAR button rides the spare-spear predicate and calls the dedicated hurl', () => {
    expect(INPUT).toContain("import { itemIsHandThrownSpear } from '../engine/bandolierEligibility';");
    expect(INPUT).toContain('useGameStore.getState().throwHeldWeapon(throwSpearItem.name, throwSpearItem.id)');
    expect(INPUT).toContain("((i.id !== eq?.mainId && i.id !== eq?.offId) || i.quantity > 1)) ?? null;");
  });

  it('⚠⚠ throwHeldWeapon rides the SAME settlement dance as the bandolier tail (no second consume path)', () => {
    const fn = STORE.slice(STORE.indexOf('throwHeldWeapon(itemName, itemId) {'));
    const body = fn.slice(0, fn.indexOf('},'));
    expect(body).toContain("set({ throwSettlement: { itemId: item.id, qtyAtThrow: item.quantity, prevOff, prevOffId } });");
    expect(body).toContain("get().submitPlayerAction(`attack with the off-hand ${item.name}`);");
    expect(body).toContain("if (!get().pendingRolls) get().settleThrowRestore('cancelled');");
  });

  it('⚠ the shadow fix sits INSIDE the synthesize loop, before the weight dice', () => {
    const loopAt = RULES.indexOf('const authoredRow = findWeaponByName(it.name);');
    const synthAt = RULES.indexOf("const { throwDamageNotation } = require('./itemWeight');");
    expect(loopAt).toBeGreaterThan(-1);
    expect(loopAt).toBeLessThan(synthAt);
    expect(RULES).toContain('if (authoredRow?.damageDice) return authoredRow;');
  });
});
