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

// ⚠⚠⚠ OTA-1608 — ONE CARD, ONE ARITHMETIC.
//
// The owner's audit question, verbatim: "and you went through all enemies in
// the game to ensure nothing in the enemy portraits, no matter where it is
// pulled from can hallucinate?" The honest answer was NO — OTA-1607 proved
// one cell (DMG) against one source. This sweep is the yes.
//
// The class is: a card field derived from a DIFFERENT source than the roll
// uses. Found twice more: the portrait and its popup each kept a HAND COPY of
// the AC formula (the 3rd and 4th copies — OTA-1545 already buried one in
// the debug spawn line for exactly this drift), and the ATK cell printed
// parseInt(enemy.attack) — a move NAME on every bestiary row — while every
// d20 line computes abilityPoint + trait bonus.
//
// Now the rolls, the card, and the popup all call enemyAC / enemyAttackBonus
// / enemyDamageCompact / enemyDamageType / the shared defenses reconcile.
// This suite drives EVERY MINT an enemy can come from — all bestiary rows,
// all 18 scaled hunt bosses, scaled escorts, the nine Core Guardians (base
// and scaled), and a fallen-hero revenant — and holds that every number the
// card can print is a number the dice will use.

import { readFileSync } from 'fs';
import { join } from 'path';
import { enemyAC, enemyAttackBonus, enemyDamageCompact } from '../app/engine/combatRules';
import { enemyDamageType, DAMAGE_TYPE_KEYWORDS, DAMAGE_TYPE_ALIASES } from '../app/engine/damageTypes';
import { HUNTS, scaleHuntBoss, scaleHuntEscort } from '../app/engine/hunts';
import { GUARDIANS_BY_CAPITAL, scaleStaticBoss } from '../app/engine/coreGuardians';
import { revenantFromFallen } from '../app/engine/fallenRevenants';
import enemiesData from '../app/data/enemies/enemies.json';
import type { Enemy, PlayerCharacter } from '../app/engine/types';

// Canonical = a recognized keyword that is NOT itself an alias (psychic and
// friends parse, then fold — they never come OUT of enemyDamageType).
const CANONICAL_DAMAGE_TYPES = (DAMAGE_TYPE_KEYWORDS as readonly string[]).filter((t) => !(t in DAMAGE_TYPE_ALIASES));

const ROWS: Enemy[] = (Array.isArray(enemiesData)
  ? enemiesData
  : (Object.values(enemiesData as Record<string, unknown>).find(Array.isArray) as Enemy[])) as Enemy[];

// A mid-game player shape for the scalers — only the fields they read.
const scalePlayer = { hpMax: 40, hp: 40, name: 'Auditor' } as never as PlayerCharacter;

/** The card's four numeric promises, checked against the roll resolvers —
 *  which is now trivially true BY CONSTRUCTION (same function), so what this
 *  really holds is that every mint produces values those resolvers can
 *  honestly render: finite AC/ATK, real dice, a canonical damage type. */
function auditEnemy(e: Enemy, label: string, offenders: string[]) {
  const ac = enemyAC(e);
  if (!Number.isFinite(ac) || ac < 1) offenders.push(`${label}: AC ${ac}`);
  const atk = enemyAttackBonus(e);
  if (!Number.isFinite(atk) || atk < 0) offenders.push(`${label}: ATK ${atk}`);
  const dmg = enemyDamageCompact(e);
  if (!/^\d+d\d+/.test(dmg)) offenders.push(`${label}: DMG "${dmg}" has no dice`);
  const dt = enemyDamageType(e);
  if (!CANONICAL_DAMAGE_TYPES.includes(dt)) {
    offenders.push(`${label}: deals non-canonical type "${dt}"`);
  }
  for (const alias of Object.keys(DAMAGE_TYPE_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(dmg)) offenders.push(`${label}: DMG "${dmg}" renders alias '${alias}'`);
  }
  if (!Number.isFinite(e.hp) || e.hp < 1) offenders.push(`${label}: hp ${e.hp}`);
}

describe('OTA-1608 — every mint, every card number, one arithmetic', () => {
  it('⚠⚠⚠ THE WHOLE BESTIARY — every row renders finite AC/ATK, real dice, a canonical type', () => {
    const offenders: string[] = [];
    for (const r of ROWS) auditEnemy(r, `bestiary:${r.name}`, offenders);
    expect(offenders).toEqual([]);
    expect(ROWS.length).toBeGreaterThan(100);
  });

  it('⚠⚠⚠ ALL 18 SCALED HUNT BOSSES — the Reaver class of mint', () => {
    const offenders: string[] = [];
    let bosses = 0;
    for (const h of HUNTS) {
      for (const power of [undefined, 6, 12] as const) {
        const boss = scaleHuntBoss(scalePlayer, h as never, power);
        if (!boss) continue;
        bosses++;
        auditEnemy(boss, `huntboss:${h.id}@${power ?? 'base'}`, offenders);
        if (!boss.name.includes('(hunted)')) offenders.push(`huntboss:${h.id}: name "${boss.name}" lost the (hunted) tag`);
      }
    }
    expect(offenders).toEqual([]);
    expect(bosses).toBeGreaterThanOrEqual(18);
  });

  it('⚠⚠ SCALED ESCORTS — the ambush-pack mint', () => {
    const offenders: string[] = [];
    for (const name of ['Tartarian Raider', 'Mud Boar']) {
      for (const e of scaleHuntEscort(scalePlayer, name, 9, 3)) {
        auditEnemy(e, `escort:${name}`, offenders);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ THE NINE CORE GUARDIANS — base and tier-scaled', () => {
    const offenders: string[] = [];
    const defs = Object.values(GUARDIANS_BY_CAPITAL);
    expect(defs.length).toBeGreaterThanOrEqual(9);
    for (const g of defs) {
      auditEnemy(g.base, `guardian:${g.capitalId}`, offenders);
      auditEnemy(scaleStaticBoss(10, g.base), `guardian-scaled:${g.capitalId}`, offenders);
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ A FALLEN-HERO REVENANT — the permadeath mint', () => {
    const offenders: string[] = [];
    const rev = revenantFromFallen({
      name: 'Cheddar Bob', ts: Date.now(), locId: 'great_tartary_plains',
      raceId: 'tartarian_giants', gearNames: [],
    } as never, 40);
    auditEnemy(rev, 'revenant:Cheddar Bob', offenders);
    expect(offenders).toEqual([]);
  });

  it('⚠⚠⚠ HIS FIGHT, RECONCILED — the Mud Spirit card now promises exactly what his log rolled', () => {
    const spirit = ROWS.find((r) => r.name === 'Mud Spirit')!;
    expect(enemyAttackBonus(spirit)).toBe(5);   // log: "d20 → 20 + ATK 5"
    expect(enemyAC(spirit)).toBe(10);           // log: "vs Mud Spirit AC 10" (pre-shred)
    expect(enemyDamageCompact(spirit)).toBe('2d6 aetheric');
    expect(enemyDamageType(spirit)).toBe('aetheric'); // log: "deals 5 aetheric damage"
  });

  it('⚠⚠ the wiring is pinned — no hand copies of the arithmetic survive anywhere the card renders', () => {
    const EP = readFileSync(join(__dirname, '..', 'app', 'components', 'EnemyPanel.tsx'), 'utf8');
    // The card and the popup both ask the roll's resolvers…
    expect(EP).toContain('const ac = enemyAC(view.enemy);');
    expect(EP).toContain('const ac = enemyAC(e);');
    expect(EP).toContain('enemyAttackBonus(view.enemy)');
    expect(EP).toContain('enemyAttackBonus(e)');
    // …and the old inline copies are gone for good.
    expect(EP).not.toContain('5 + apNum');
    expect(EP).not.toContain('parseInt(String(view.enemy.attack)');
    // The rolls themselves use the shared derivation.
    const CR = readFileSync(join(__dirname, '..', 'app', 'state', 'combatResolution.ts'), 'utf8');
    expect(CR).toContain('const atkBonus = enemyAttackBonus(enemy);');
    expect(CR).toContain('const baseAtk = enemyAttackBonus(enemy);');
  });
});
