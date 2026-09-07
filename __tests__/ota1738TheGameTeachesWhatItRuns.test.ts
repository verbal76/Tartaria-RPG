/**
 * OTA-1738 — THE GAME TEACHES WHAT IT RUNS (task list 4E91C7).
 *
 * The 11B4DF audit found teaching that described a game the engine no longer
 * ran: a Repair tab that "spends TC" (it spends materials), a torch that "burns
 * down while lit" (each use spends one torch), a courier that carries a hunt's
 * trophy (hunts refuse the courier), a spear "spent on a hit" (spent on every
 * concluded throw), a pity gem "every 50 kills" (100), a stealth opener that
 * "costs your turn" (it costs nothing and nothing swings back), a SKIP pill
 * missing from three locked beats, and up to four first-use cards stacked on
 * the first fight under the primer.
 *
 * Every claim below is checked against the RUNTIME — the constant the engine
 * charges, the store action that spends the thing, the predicate the control
 * lights by — never against the copy alone. Where a card quotes a number, the
 * test asserts the card reads the constant, so the copy cannot drift again.
 */
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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore, STAMINA_COSTS, advanceTime } from '../app/state/gameStore';
import { STAMINA_COSTS as ENGINE_STAMINA } from '../app/engine/staminaCosts';
import { PITY_KILL_INTERVAL } from '../app/engine/resurrectionRules';
import { TEACHINGS, ALL_TEACHINGS, DOG_FEEDING_LINE, MOVEMENT_COST_LINE } from '../app/components/teachingRegistry';
import { TUTORIAL_STEPS, TUTORIAL_DOCS_FULL, TUT_LOCK_BEATS, isTutorialLocked } from '../app/components/tutorialSteps';
import { LOYALTY_DECAY_HOURS, DOG_LOYALTY_BANDS, createDogCompanion } from '../app/engine/dogCompanion';
import { REPLACEMENT_DOG_PRICE, FACTION_DOG_PRICE, ORDINARY_DOG, FACTION_DOGS, dogMarketRowByName } from '../app/engine/dogMarket';
import { REINFORCE_MAX_LEVEL, repairCost } from '../app/engine/durability';
import { scrapSuccessChance, repairCostMaterials, scrapOutputFor, canScrap } from '../app/engine/scrapEngine';
import { spareThrowingSpear } from '../app/engine/bandolierEligibility';
import { COATING_DOT_TURNS } from '../app/engine/weaponCoating';
import { getRaces, getFactions } from '../app/engine/character';
import {
  setHintsDisabled, resetAllFirstTimeHints, resetFirstTimeHint, isHintSeen, markHintSeen,
} from '../app/components/useFirstTimeHint';
import { BOUNTY_PRIMER_HINT_ID } from '../app/state/slices/boardSlice';
import type { FactionBounty } from '../app/engine/factionBounty';
import type { Enemy, InventoryItem, PlayerCharacter } from '../app/engine/types';

jest.setTimeout(240_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

const ROOT = join(__dirname, '..');
const src = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const EXPLORE = src('app', 'screens', 'ExplorationScreen.tsx');
const PRIMER = src('app', 'components', 'CombatPrimerModal.tsx');
const VENDOR = src('app', 'screens', 'VendorScreen.tsx');
const INVENTORY = src('app', 'screens', 'InventoryScreen.tsx');
const ABOUT = src('app', 'screens', 'AboutScreen.tsx');
const GUIDANCE = src('app', 'screens', 'GuidanceScreen.tsx');
const APP = src('App.tsx');
const OVERLAY = src('app', 'components', 'TutorialOverlay.tsx');
const DOG_MODAL = src('app', 'components', 'DogOnboardingModal.tsx');
const CONTRACTS = src('app', 'screens', 'ContractsScreen.tsx');

/** The one slot line the screen keys a card on. */
function candidate(file: string, id: keyof typeof TEACHINGS): string {
  const at = file.indexOf(`{ id: TEACH.${id}.id, when:`);
  expect(at).toBeGreaterThan(-1);
  return file.slice(at, file.indexOf('},', at) + 2);
}

const S = () => useGameStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
async function boot(): Promise<void> {
  await S().hydrate();
  await S().startNewGame({ name: 'Taught', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  S().skipTutorial?.();
  if (S().storyIntro) S().dismissStoryIntro();
  await flush();
}
const foe = (name: string, over: Partial<Enemy> = {}): Enemy => ({
  name, type: 'Human', abilityPoint: 'Strength 6', attack: 'Cudgel',
  damage: '10', hp: 60, rarity: 'Common', loot: [], ...over,
});
function stageFight(enemies: Enemy[], range: 'close' | 'mid', openerUsed: boolean) {
  const scene = S().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene, enemies, enemyHps: enemies.map((e) => e.hp), activeEnemyIdx: 0, range,
      enemyAmbushUsed: enemies.map(() => true), enemyKnockedOut: enemies.map(() => false),
      enemyStaggered: enemies.map(() => 0), stealthOpenerUsed: openerUsed,
    },
  } as never);
}
function drainRolls(value: number) {
  let guard = 0;
  while (S().pendingRolls) {
    if (guard++ > 60) throw new Error('roll loop did not terminate');
    const pr = S().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    S().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => value));
  }
}
async function settle(value: number) {
  for (let i = 0; i < 12; i++) { drainRolls(value); await new Promise((r) => setTimeout(r, 100)); }
  drainRolls(value);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the registry is one body of copy, with stable ids', () => {
  it('every card has a unique id equal to its key, a group and a trigger line', () => {
    const ids = new Set<string>();
    for (const [key, t] of Object.entries(TEACHINGS)) {
      expect(t.id).toBe(key);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.when.length).toBeGreaterThan(8);
      expect(t.body.length).toBeGreaterThan(20);
    }
    expect(ALL_TEACHINGS.length).toBe(ids.size);
  });

  it('⚠ a card whose rule changed carries a NEW id, and no screen still renders the old one', () => {
    const appFiles = ['ExplorationScreen.tsx', 'VendorScreen.tsx', 'ContractsScreen.tsx', 'CraftingScreen.tsx', 'InventoryScreen.tsx']
      .map((f) => codeOnly(src('app', 'screens', f))).join('\n');
    for (const retired of ['torch_first', 'golem_first', 'combat_throw_spear', 'contracts_first_open_v2', 'crafting_tab_repair', 'power_number', 'vendor_first_open']) {
      expect(appFiles).not.toMatch(new RegExp(`['"]${retired}['"]`));
      expect(appFiles).not.toContain(`TEACH.${retired}.`);
    }
    for (const fresh of ['torch_first_v2', 'golem_first_v2', 'combat_throw_spear_v2', 'contracts_first_open_v3', 'crafting_tab_repair_v2'] as const) {
      expect(TEACHINGS[fresh].id).toBe(fresh);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the outpost tutorial', () => {
  it('⚠⚠⚠ SKIP is offered on EVERY locked beat — look, armor and screen_pick included', () => {
    // The pill's own seven-beat list is gone; it asks the same authority the
    // input lock asks. Every beat that locks the row offers the hatch.
    expect(codeOnly(OVERLAY)).toContain('if (!isTutorialLocked(tutorialStep, tutorialExploreChosen)) return null;');
    expect(codeOnly(OVERLAY)).not.toContain('const TUT_LOCK_BEATS');
    for (const beat of ['look', 'armor', 'screen_pick']) expect(TUT_LOCK_BEATS).toContain(beat);
    for (const beat of TUT_LOCK_BEATS) {
      const idx = TUTORIAL_STEPS.findIndex((st) => st.id === beat);
      expect(idx).toBeGreaterThan(-1);
      expect(isTutorialLocked(idx, false)).toBe(true);
    }
    // …and only those: an unlocked beat (or no tutorial) draws no pill.
    const unlocked = TUTORIAL_STEPS.map((st, i) => [st.id, i] as const).filter(([id]) => !!id && !TUT_LOCK_BEATS.includes(id));
    for (const [, i] of unlocked) expect(isTutorialLocked(i, false)).toBe(false);
    expect(isTutorialLocked(null, false)).toBe(false);
  });

  it('⚠⚠ the movement sentence quotes the table the store charges', () => {
    // One table: the engine module IS the store's export (re-export, not a copy).
    expect(STAMINA_COSTS).toBe(ENGINE_STAMINA);
    expect(MOVEMENT_COST_LINE).toContain(`${STAMINA_COSTS.wander} stamina`);
    const door = TUTORIAL_STEPS.find((st) => st.id === 'explore_or_leave')!;
    expect(door.body).toContain(MOVEMENT_COST_LINE);
    expect(door.arbiter).toContain(MOVEMENT_COST_LINE);
    // The store charges exactly that per tile stepped.
    const STORE = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(STORE).toContain('spendStamina(get().player!, STAMINA_COSTS.wander), TILE_HOURS)');
  });

  it('⚠ a tile stepped on a course costs exactly the wander figure', async () => {
    await boot();
    // A named map place the outpost knows a road to (the course is 18 tiles; one step is taken).
    S().setTravelCourse('asgardar');
    await flush();
    expect(S().player!.travelTarget?.locationId).toBe('asgardar');
    const before = S().player!.stamina;
    S().continueTravel();
    await flush();
    const after = S().player!.stamina;
    expect(before - after).toBe(STAMINA_COSTS.wander);
  });

  it('⚠ the Arbiter is offered once, at the close, and nowhere else in the beats', () => {
    const closing = TUTORIAL_STEPS.find((st) => st.id === 'pick_city')!;
    expect(closing.body).toMatch(/Arbiter/);
    expect(closing.body).toMatch(/\bask\b/i);
    const mentions = TUTORIAL_STEPS.filter((st) => /type ask/i.test(st.body)).length;
    expect(mentions).toBe(1);
  });

  it('⚠⚠ the climb card cannot land on the tutorial climb', () => {
    expect(candidate(EXPLORE, 'climb_first')).toContain('tutorialStep === null');
    expect(candidate(EXPLORE, 'climb_first')).toContain('climbTaught');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the first fight', () => {
  it('⚠⚠⚠ the primer is a per-install card: no kill-count gate, no private tips switch', () => {
    const code = codeOnly(EXPLORE);
    expect(code).toContain('useFirstTimeHint(TEACH.combat_primer_v1.id)');
    expect(code).not.toContain('enemiesDefeatedEver === 0');
    expect(code).not.toContain('useHintsDisabled');
    expect(code).toMatch(/combatPrimerOpen = liveEnemyCount > 0[^;]*primerHint\.shouldShow === true;/);
    // Closing it dismisses the install flag AND latches the milestone.
    expect(code).toContain('primerHint.dismiss(); markCombatPrimerSeen();');
  });

  it('⚠⚠ Power is taught IN the primer; the readout waits for the second fight', () => {
    expect(PRIMER).toContain('<Text style={styles.term}>POWER — </Text>');
    expect(codeOnly(PRIMER)).toMatch(/green[^.]*gold[^.]*red/);
    expect(codeOnly(EXPLORE)).not.toContain('power_number');
    expect(candidate(EXPLORE, 'combat_readout')).toContain('combatPrimerSeen && enemiesDefeatedEver >= 1');
  });

  it('⚠⚠⚠ ONE optional surface per beat: a single card, every candidate deferred to the modals', () => {
    // Exactly one FirstTimeHint element on the whole screen.
    expect(codeOnly(EXPLORE).split('<FirstTimeHint').length - 1).toBe(1);
    expect(codeOnly(EXPLORE)).toContain('const modalOwnsBeat = combatPrimerOpen || !!pendingMissionStinger || !!pendingMissionBeat;');
    const lines = codeOnly(EXPLORE).split('\n').filter((l) => l.includes('{ id: TEACH.') && l.includes('when:'));
    expect(lines.length).toBeGreaterThanOrEqual(13);
    for (const l of lines) expect(l).toContain('!modalOwnsBeat');
    // The collision set the owner named, each present as a candidate of the one slot.
    for (const id of ['combat_shield_block', 'combat_throw_spear_v2', 'elevation_first_fight', 'combat_readout', 'golem_first_v2', 'procedure_text_first', 'climb_first'] as const) {
      candidate(EXPLORE, id);
    }
  });

  it('⚠⚠ the FLEE and DODGE lines read the constants the engine charges', () => {
    expect(PRIMER).toContain("import { FLEE_STAMINA_COST } from '../engine/combatRules';");
    expect(PRIMER).toContain("import { DODGE_COOLDOWN_ROUNDS } from '../engine/dodgeCooldown';");
    expect(PRIMER).toContain('<Text style={styles.term}>FLEE — </Text>');
    expect(PRIMER).toContain('{FLEE_STAMINA_COST} stamina');
    expect(PRIMER).toContain('{DODGE_COOLDOWN_ROUNDS} rounds');
    // The truthful failure half: a failed break hands them a swing; the wilds escalate.
    expect(codeOnly(PRIMER)).toMatch(/fails[\s\S]{0,80}swing/);
    expect(codeOnly(PRIMER)).toMatch(/every failed try makes the next/);
  });

  it('⚠⚠⚠ STEALTH, runtime-proven: before contact a passed roll is a free opening — no volley, +5 armed, once per scene', async () => {
    await boot();
    const p = S().player!;
    useGameStore.setState({ player: { ...p, hp: 100, hpMax: 100, stamina: 50, staminaMax: 50, statusEffects: [] } as unknown as PlayerCharacter });
    stageFight([foe('Silt Raider')], 'mid', false);
    const hpBefore = S().player!.hp;
    // ⚠ The STEALTH button submits the verb `sneak` (InputBox); the typed word
    // "stealth" parses as `steal` — reported, not fixed here (parser, not teaching).
    S().submitPlayerAction('sneak');
    await settle(20);
    const t0 = Date.now();
    while (!(S().player!.statusEffects ?? []).some((e) => e.kind === 'stealthed') && Date.now() - t0 < 4000) {
      drainRolls(20); await new Promise((r) => setTimeout(r, 50));
    }
    expect((S().player!.statusEffects ?? []).some((e) => e.kind === 'stealthed')).toBe(true);
    expect(S().player!.hp).toBe(hpBefore);                // nothing swung back
    expect(S().currentScene!.stealthOpenerUsed).toBe(true); // spent for the scene
    // …and the card says exactly that.
    expect(codeOnly(PRIMER)).toMatch(/before contact[\s\S]{0,200}nothing swings at you/);
    expect(codeOnly(PRIMER)).toMatch(/once per\s+scene/);
    expect(codeOnly(PRIMER)).not.toMatch(/costs your turn/);
  });

  it('⚠⚠⚠ THROW SPEAR, runtime-proven: one spear spent per concluded throw, hit OR miss', async () => {
    const SPEAR: InventoryItem = {
      id: 'i_throwspear', name: 'Mud Spear (Throwing)', kind: 'weapon', quantity: 3,
      tags: ['throwable', 'weapon', 'ranged', 'two_handed', 'spear', 'mud_dwellers'],
    } as InventoryItem;
    await boot();
    const p = S().player!;
    useGameStore.setState({
      player: { ...p, hp: 100, hpMax: 100, stamina: 50, staminaMax: 50, inventory: [...p.inventory, SPEAR], statusEffects: [] } as unknown as PlayerCharacter,
    });
    const qty = () => S().player!.inventory.find((i) => i.id === 'i_throwspear')?.quantity ?? 0;
    // The card and the button light on the same predicate.
    expect(spareThrowingSpear(S().player!.inventory, S().player!.equipped)?.id).toBe('i_throwspear');
    stageFight([foe('Silt Raider', { hp: 400 })], 'close', true);
    S().throwHeldWeapon(SPEAR.name, SPEAR.id);
    await settle(2);                                        // a miss
    expect(S().throwSettlement).toBeNull();
    expect(qty()).toBe(2);
    stageFight([foe('Silt Raider', { hp: 400 })], 'close', true);
    S().throwHeldWeapon(SPEAR.name, SPEAR.id);
    await settle(20);                                       // a hit
    expect(S().throwSettlement).toBeNull();
    expect(qty()).toBe(1);
    expect(TEACHINGS.combat_throw_spear_v2.body).toMatch(/hit or miss/i);
    expect(TEACHINGS.combat_throw_spear_v2.body).not.toMatch(/spent on a hit/i);
    expect(codeOnly(PRIMER)).toMatch(/spends\s+one spear, hit or miss/);
  });

  it('⚠ the spare-spear rule: unequipped, or a stack deep enough to keep one in hand', () => {
    const spear = (id: string, quantity: number): InventoryItem =>
      ({ id, name: 'Mud Spear (Throwing)', kind: 'weapon', quantity, tags: ['throwable', 'weapon', 'spear'] } as InventoryItem);
    expect(spareThrowingSpear([spear('a', 1)], {})?.id).toBe('a');
    expect(spareThrowingSpear([spear('a', 1)], { mainId: 'a' })).toBeNull();
    expect(spareThrowingSpear([spear('a', 2)], { mainId: 'a' })?.id).toBe('a');
    expect(spareThrowingSpear([spear('a', 0)], {})).toBeNull();
    expect(spareThrowingSpear([{ id: 'r', name: 'River Stone', kind: 'misc', quantity: 3, tags: ['throwable'] } as InventoryItem], {})).toBeNull();
    expect(candidate(EXPLORE, 'combat_throw_spear_v2')).toContain('spareSpearInPack');
    expect(codeOnly(EXPLORE)).toContain('spareThrowingSpear(player.inventory ?? [], player.equipped)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the pack', () => {
  it('⚠⚠ the salvage card quotes the base odds and states the consumption rule the slice runs', async () => {
    const base = Math.round(scrapSuccessChance(10, 10) * 100);
    expect(TEACHINGS.scrap_first.body).toContain(`${base}%`);
    expect(TEACHINGS.scrap_first.body).toMatch(/gone either way/i);
    expect(TEACHINGS.scrap_first.body).toMatch(/one unit of its first material/i);
    // Runtime: force both rolls to fail — the item is consumed and ONE unit of
    // its first material lands.
    await boot();
    const blade = { id: 'i_blade', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'], durability: { current: 20, max: 20 } } as unknown as InventoryItem;
    expect(canScrap(blade)).toBe(true);
    const first = scrapOutputFor(blade).grants[0]!;
    const p = S().player!;
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory.filter((i) => i.name !== first.name), blade] } as never });
    const rnd = Math.random;
    Math.random = () => 0.999;
    try { S().scrapInventoryItem('Rusted Blade', 'i_blade'); } finally { Math.random = rnd; }
    await flush();
    expect(S().player!.inventory.some((i) => i.id === 'i_blade')).toBe(false);
    expect(S().player!.inventory.find((i) => i.name === first.name)?.quantity).toBe(1);
    // …and the card waits for the tutorial (its salvage beat teaches room salvage).
    expect(candidate(INVENTORY, 'scrap_first')).toContain('tutorialStepForTeaching === null');
    expect(candidate(INVENTORY, 'scrap_first')).toContain('canScrap(i)');
  });

  it('⚠ throwables/coatings key on the bandolier predicate and quote the DOT length', () => {
    expect(TEACHINGS.throwables_first.body).toContain(`${COATING_DOT_TURNS} turns`);
    expect(candidate(INVENTORY, 'throwables_first')).toContain('isBandolierEligible(i, player).eligible || isWeaponCoatingItem(i)');
    expect(codeOnly(INVENTORY).split('<FirstTimeHint').length - 1).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the counter', () => {
  it('⚠⚠⚠ reinforce / workings / repair / dog cards fire only when the row is on the table', () => {
    expect(candidate(VENDOR, 'reinforce_first')).toContain('reinforceRows.length > 0');
    expect(candidate(VENDOR, 'workings_first')).toContain('!o.known && player.tc >= o.price');
    expect(candidate(VENDOR, 'repair_vendor_first')).toContain('i.durability.current < i.durability.max');
    expect(candidate(VENDOR, 'dog_replacement_first')).toContain('dogMarketRowByName(o.itemName)');
    expect(codeOnly(VENDOR).split('<FirstTimeHint').length - 1).toBe(1);
  });

  it('⚠⚠ the two repair systems are taught distinctly, and each matches its engine', () => {
    const bench = TEACHINGS.crafting_tab_repair_v2.body;
    const trader = TEACHINGS.repair_vendor_first.body;
    expect(bench).toMatch(/costs MATERIALS/);
    expect(bench).toMatch(/trader mends[^.]*TC/);
    expect(bench).not.toMatch(/spends TC|costs TC/);
    expect(trader).toMatch(/trader mends for TC/);
    expect(trader).toMatch(/materials instead/);
    // Engine: the bench bill is twice the scrap output; the trader bills TC.
    const worn = { id: 'w', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'], durability: { current: 5, max: 20 } } as unknown as InventoryItem;
    const out = scrapOutputFor(worn).grants;
    expect(repairCostMaterials(worn)).toEqual(out.map((g) => ({ name: g.name, quantity: g.quantity * 2 })));
    expect(repairCost(worn)).toBeGreaterThan(0);
  });

  it('⚠ reinforcement and dog prices are quoted from their constants', () => {
    expect(TEACHINGS.reinforce_first.body).toContain(`+${REINFORCE_MAX_LEVEL}`);
    expect(TEACHINGS.reinforce_first.body).toMatch(/ceiling only|stays worn/i);
    expect(TEACHINGS.dog_replacement_first.body).toContain(`${REPLACEMENT_DOG_PRICE} TC`);
    expect(TEACHINGS.dog_replacement_first.body).toContain(`${FACTION_DOG_PRICE}`);
    expect(dogMarketRowByName(ORDINARY_DOG.itemName)?.price).toBe(REPLACEMENT_DOG_PRICE);
    for (const row of Object.values(FACTION_DOGS)) expect(row.price).toBe(FACTION_DOG_PRICE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the dog', () => {
  it('⚠⚠ the onboarding card teaches feeding from the clock the store decays on', () => {
    expect(DOG_FEEDING_LINE).toContain(`every ${LOYALTY_DECAY_HOURS} hours`);
    expect(DOG_FEEDING_LINE).toContain(DOG_LOYALTY_BANDS.join(', '));
    expect(DOG_FEEDING_LINE).toMatch(/do not come back/);
    expect(DOG_MODAL).toContain('{DOG_FEEDING_LINE}');
    const STORE = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(STORE).toContain('Math.floor(oldGap / LOYALTY_DECAY_HOURS)');
    for (let i = 0; i < DOG_LOYALTY_BANDS.length; i++) expect(STORE).toContain(`at: DOG_LOYALTY_BANDS[${i}]`);
  });

  it('⚠ runtime: one loyalty per unfed interval, none inside it', async () => {
    await boot();
    const p = S().player!;
    const dog = createDogCompanion({ name: 'Marrow', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: p.hoursElapsed ?? 0 });
    const withDog = { ...p, dog: { ...dog, status: 'with_player' as const, loyalty: 10 } } as PlayerCharacter;
    expect(advanceTime(withDog, LOYALTY_DECAY_HOURS - 0.5).dog!.loyalty).toBe(10);
    expect(advanceTime(withDog, LOYALTY_DECAY_HOURS * 2).dog!.loyalty).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the stale copy is gone', () => {
  const DOCS = TUTORIAL_DOCS_FULL.map((st) => st.body).join('\n');
  it('⚠⚠ the replay doc quotes the pity interval and no longer claims a first-install gem', () => {
    expect(DOCS).toContain(`every ${PITY_KILL_INTERVAL}`);
    expect(DOCS).not.toMatch(/every 50/);
    expect(DOCS).not.toMatch(/first install|when you first install|start with one/i);
  });
  it('⚠⚠ no MAP button, no ACTIONS screen — the doors it names exist', () => {
    expect(DOCS).not.toMatch(/MAP button/);
    expect(DOCS).not.toMatch(/\bACTIONS\b/);
    expect(DOCS).toContain('REPLAY TEACHING');
    expect(DOCS).toMatch(/mini-map/);
  });
  it('⚠⚠ torch: each use spends one torch, and the card keys on the charged lead', async () => {
    expect(TEACHINGS.torch_first_v2.body).toMatch(/spends one torch/);
    expect(TEACHINGS.torch_first_v2.body).not.toMatch(/burns down/);
    expect(candidate(EXPLORE, 'torch_first_v2')).toContain('h.torchCharged');
    await boot();
    const p = S().player!;
    const torch = p.inventory.find((i) => i.name === 'Aetheric Torch')!;
    expect(torch).toBeTruthy();
    useGameStore.setState({
      player: { ...p, inventory: p.inventory.map((i) => (i.id === torch.id ? { ...i, quantity: 2 } : i)) },
      currentScene: {
        ...S().currentScene!,
        hooks: [{ id: 'h_probe', kind: 'obelisk', nouns: ['obelisk'], plantedLine: '', stage: 0, resolved: false }],
      },
    } as never);
    S().applyTorchToHook('h_probe');
    await flush();
    expect(S().player!.inventory.find((i) => i.id === torch.id)?.quantity).toBe(1);
    expect(S().currentScene!.hooks.find((h) => h.id === 'h_probe')?.torchCharged).toBe(true);
  });
  it('⚠ golem: mended with its own parts, not a kit; contracts: a hunt is shown in person', () => {
    expect(TEACHINGS.golem_first_v2.body).toMatch(/own parts/);
    expect(TEACHINGS.golem_first_v2.body).not.toMatch(/cannot be healed/);
    expect(codeOnly(src('app', 'state', 'slices', 'inventorySlice.ts'))).toContain("if (target === 'golem') {");
    expect(TEACHINGS.contracts_first_open_v3.body).toMatch(/trophy is shown in person/);
    expect(codeOnly(CONTRACTS)).toContain('TEACH.contracts_first_open_v3');
    expect(codeOnly(CONTRACTS)).toContain('{!missionCompleteNotice && (');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the global tips switch and SHOW ALL TIPS AGAIN govern the primers', () => {
  const BOUNTY: FactionBounty = {
    giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers Guild',
    targetFactionId: 'mud_monarchs', targetName: 'Mud Monarchs',
    targetLocationId: 'monarch_waystation', targetLocationName: 'Monarch Waystation',
    count: 4, progress: 0, rewardTc: 100, rewardRep: 9,
  };
  const accept = () => {
    S().clearMissionCompleteNotice();
    const p = S().player!;
    useGameStore.setState({ player: { ...p, activeBounties: [], activeBounty: undefined } } as never);
    S().toggleBoardFreeze(); S().acceptBounty(BOUNTY);
    return S().missionCompleteNotice;
  };

  it('⚠⚠⚠ bounty primer: silent with tips off, once per install, back after a reset', async () => {
    await S().hydrate();
    await S().startNewGame({ name: 'Ropes', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    S().skipTutorial?.();
    if (S().storyIntro) S().dismissStoryIntro();
    await resetFirstTimeHint(BOUNTY_PRIMER_HINT_ID);
    await setHintsDisabled(true);
    expect(accept()).toBeNull();                                  // tips off: no card
    expect(isHintSeen(BOUNTY_PRIMER_HINT_ID)).toBe(false);        // and not marked seen behind the switch
    await setHintsDisabled(false);
    expect(accept()?.heading).toBe('THE ROPES');                  // first sight on this install
    expect(isHintSeen(BOUNTY_PRIMER_HINT_ID)).toBe(true);
    expect(accept()).toBeNull();                                  // never twice
    await resetAllFirstTimeHints();                               // SHOW ALL TIPS AGAIN
    expect(accept()?.heading).toBe('THE ROPES');
    // A NEW CHARACTER on the same install does not un-see it.
    await S().startNewGame({ name: 'Second', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    S().skipTutorial?.();
    if (S().storyIntro) S().dismissStoryIntro();
    expect(accept()).toBeNull();
  });

  it('⚠ the store-side seen flag is the same key a card dismiss writes', async () => {
    await resetFirstTimeHint('probe_card');
    expect(isHintSeen('probe_card')).toBe(false);
    markHintSeen('probe_card');
    expect(isHintSeen('probe_card')).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asMod = require('@react-native-async-storage/async-storage') as { default?: unknown };
    const AsyncStorage = (asMod.default ?? asMod) as { getItem(k: string): Promise<string | null> };
    expect(await AsyncStorage.getItem('tartaria.hint.v1.probe_card')).toBe('1');
    await resetFirstTimeHint('probe_card');
    expect(await AsyncStorage.getItem('tartaria.hint.v1.probe_card')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — one door to everything the game taught', () => {
  it('⚠⚠ Settings → GUIDANCE → REPLAY TEACHING routes to the Guidance screen, which hosts the Action Reference', () => {
    expect(codeOnly(ABOUT)).toContain("setScreen('guidance')");
    expect(codeOnly(APP)).toContain("screen === 'guidance' && <GuidanceScreen />");
    expect(codeOnly(src('app', 'engine', 'types.ts'))).toContain("| 'guidance'");
    expect(GUIDANCE).toContain("import { ActionReferenceBody } from './ActionReferenceScreen';");
    expect(GUIDANCE).toContain("{tab === 'reference' && <ActionReferenceBody />}");
    expect(GUIDANCE).toContain("import { TUTORIAL_STEPS, TUTORIAL_DOCS_FULL } from '../components/tutorialSteps';");
  });
  it('⚠⚠⚠ the replay is READ-ONLY: it lists seen state and never writes a flag, and no tips switch gates it', () => {
    const code = codeOnly(GUIDANCE);
    expect(code).toContain('readSeenHintIds()');
    expect(code).not.toContain('markHintSeen');
    expect(code).not.toContain('useFirstTimeHint(');
    expect(code).not.toContain('AsyncStorage');
    expect(code).not.toContain('useHintsDisabled');
    expect(code).not.toContain('getHintsDisabled');
  });
});
