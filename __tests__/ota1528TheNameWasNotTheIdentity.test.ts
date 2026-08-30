/**
 * OTA-1528 — THE NAME WAS NOT THE IDENTITY, AND THE GATE READ THE WRONG STAT.
 *
 * Two defects found chasing one question the owner asked about a screenshot: why
 * did his portrait say `RESIST Aetheric · WEAK Burn` about an Eternal Dynasty
 * Raider whose own chips said `Vuln Piercing`?
 *
 * ⚠⚠⚠ (1) STRIKE-TO-LEARN WAS TEACHING THE WRONG ANSWER. `recordEnemyIntel` keyed
 * the bestiary on `enemy.name.toLowerCase()` while `randomizeEnemyDefense` rolls a
 * fresh weakness per spawn. The spawn ordinal is presentation — which of the four
 * is on the left — and it repeats every encounter. His log, one corpus:
 *
 *   Weakness exposed — Raider 1 flinches. (burn ×1.5 for 5)
 *   Weakness exposed — Raider 2 flinches. (piercing ×2.25 for 13)
 *   Weakness exposed — Raider 3 flinches. (piercing ×2.25 for 21)
 *
 * Two different answers under names that recur. The card showed a PREVIOUS Raider
 * 1's weakness, and he fought a piercing-weak raider with a burn weapon. Stale
 * intel the player acts on is worse than none.
 *
 * ⚠ The ×2.25 is itself the corroboration: 1.5 (Human is weak to piercing) × 1.5
 * (`vulnerable:piercing` rolled on top) is the OTA-698 stacking case, which
 * independently confirms both the kind and the roll.
 *
 * ⚠⚠⚠ (2) THE WISDOM GATE READ THE BASE STAT. `ExplorationScreen` passed
 * `player.stats.wisdom` while `StatsPanel` renders `formatStat(base,
 * effectiveStats(player).wisdom)`. `WIS 12 (+1)` decodes as base 11, effective 12
 * — and `WEAKNESS_READ_WIS` is 12. So the sheet said 12, the popup said "Wisdom 12
 * reads them on sight", and the gate saw 11 and refused. Gear that raises Wisdom
 * bought nothing for the one thing Wisdom is advertised to do on this screen. It
 * is also why the card was in the observed branch at all, which is how defect (1)
 * became visible.
 *
 * ⚠⚠ THE ERROR CLASS, SHARED: A KEY THAT IS NOT THE THING IT NAMES. A display
 * label standing in for an identity, and a base stat standing in for the number
 * the player is shown. Both read plausibly and both are wrong at exactly the
 * moment they matter.
 */
import { enemyIntelKey } from '../app/engine/enemyTraits';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const PANEL = src('app', 'components', 'EnemyPanel.tsx');
const EXPLORE = src('app', 'screens', 'ExplorationScreen.tsx');
const COMBAT = src('app', 'state', 'combatResolution.ts');
const STORE = src('app', 'state', 'gameStore.ts');

const codeOnly = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** The owner's two raiders, as their own chips described them. */
const PIERCING_RAIDER = [
  'armored', 'savage', 'quick', 'vulnerable:piercing',
  'inured:slashing', 'inured:poison', 'inured:corruption', 'resist:aetheric', 'profiled',
];
const BURN_RAIDER = [
  'armored', 'savage', 'quick', 'vulnerable:burn',
  'inured:piercing', 'inured:slashing', 'inured:poison', 'inured:corruption',
  'resist:aetheric', 'profiled',
];

describe('OTA-1528 — a lesson belongs to the profile, not to the label', () => {
  it('⚠⚠⚠ THE OWNER\'S CASE: two differently-rolled raiders no longer share one row', () => {
    // Pre-1528 both of these were `eternal dynasty raider 1`, so whichever was hit
    // last described both.
    expect(enemyIntelKey('Eternal Dynasty Raider 1', PIERCING_RAIDER))
      .not.toBe(enemyIntelKey('Eternal Dynasty Raider 1', BURN_RAIDER));
  });

  it('⚠⚠⚠ …and the spawn ordinal stops splitting one lesson into four', () => {
    // The flip side, and the reason the fix is not simply "add the instance id":
    // Raider 1 and Raider 3 with the SAME roll are the same thing, and making the
    // player re-learn it per ordinal would be busywork.
    expect(enemyIntelKey('Eternal Dynasty Raider 1', PIERCING_RAIDER))
      .toBe(enemyIntelKey('Eternal Dynasty Raider 3', PIERCING_RAIDER));
    expect(enemyIntelKey('Eternal Dynasty Raider 12', PIERCING_RAIDER))
      .toBe(enemyIntelKey('Eternal Dynasty Raider', PIERCING_RAIDER));
  });

  it('⚠⚠ only the defence-bearing traits enter the key', () => {
    // Armored/Savage/Quick describe how a thing FIGHTS, not what bites it. Letting
    // them split the bestiary would re-create the forgetting through another door.
    const a = enemyIntelKey('Raider', ['armored', 'vulnerable:piercing']);
    const b = enemyIntelKey('Raider', ['savage', 'quick', 'vulnerable:piercing']);
    expect(a).toBe(b);
  });

  it('⚠⚠ trait ORDER cannot change the key — the roll is a set, not a sequence', () => {
    expect(enemyIntelKey('Raider', ['vulnerable:piercing', 'resist:aetheric', 'inured:poison']))
      .toBe(enemyIntelKey('Raider', ['inured:poison', 'resist:aetheric', 'vulnerable:piercing']));
  });

  it('⚠ an enemy with no defence traits keys on its bare name', () => {
    // Authored, unrandomized enemies (and bosses) keep a stable single row.
    expect(enemyIntelKey('Silt Thief', ['armored'])).toBe('silt thief');
    expect(enemyIntelKey('Silt Thief', [])).toBe('silt thief');
    expect(enemyIntelKey('Silt Thief', undefined)).toBe('silt thief');
  });

  it('⚠ it never throws on the empty or missing name', () => {
    expect(enemyIntelKey(undefined, PIERCING_RAIDER)).toContain('|');
    expect(enemyIntelKey('', [])).toBe('');
  });

  it('⚠ case and stray whitespace do not fork a row', () => {
    expect(enemyIntelKey('  ETERNAL Dynasty Raider 2  ', PIERCING_RAIDER))
      .toBe(enemyIntelKey('eternal dynasty raider', PIERCING_RAIDER));
  });
});

describe('OTA-1528 — every door uses the same key', () => {
  it('⚠⚠⚠ the writer keys on the profile', () => {
    expect(codeOnly(COMBAT)).toContain('const key = enemyIntelKey(enemyName, enemyTraits);');
    expect(codeOnly(COMBAT)).not.toContain('const key = enemyName.toLowerCase();');
  });

  it('⚠⚠⚠ …and every call site actually hands the traits over', () => {
    // A writer that accepts traits and three callers that never pass them is the
    // bug with a new signature.
    const calls = [...codeOnly(STORE).matchAll(/recordEnemyIntel\(([^;]*?)\);/gs)];
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c[1]).toMatch(/\.traits/);
  });

  it('⚠⚠⚠ the reader keys on the profile', () => {
    expect(codeOnly(PANEL)).toContain('enemyIntel?.[enemyIntelKey(e.name, e.traits)]');
    expect(codeOnly(PANEL)).not.toContain('enemyIntel?.[name.toLowerCase()]');
  });

  it('⚠⚠ the save backfill writes keys the reader can find', () => {
    // It seeds from enemies.json — authored traits, no per-spawn roll — so it must
    // produce the same shape or a restored save would read as never-fought.
    expect(codeOnly(STORE)).toContain('.enemyIntelKey(e.name, e.traits)] = { weak, resist };');
    expect(codeOnly(STORE)).not.toContain('out[rawName] = { weak, resist };');
  });
});

describe('OTA-1528 — the Wisdom gate agrees with the character sheet', () => {
  it('⚠⚠⚠ the panel is handed the EFFECTIVE wisdom', () => {
    expect(codeOnly(EXPLORE)).toContain('playerWisdom={player ? effectiveStats(player).wisdom : undefined}');
    expect(codeOnly(EXPLORE)).not.toContain('playerWisdom={player?.stats?.wisdom}');
  });

  it('⚠⚠ it is the same source the sheet renders from', () => {
    // StatsPanel: formatStat(player.stats.wisdom, eff.wisdom) with
    // eff = effectiveStats(player). If the gate read anything else, the number on
    // the sheet and the number in the gate could disagree again.
    const STATS = src('app', 'components', 'StatsPanel.tsx');
    expect(STATS).toContain('const eff = effectiveStats(player);');
    expect(STATS).toContain('formatStat(player.stats.wisdom, eff.wisdom)');
    expect(codeOnly(EXPLORE)).toContain("from '../engine/equipment'");
  });

  it('⚠ the threshold itself is untouched — this OTA fixes the input, not the bar', () => {
    // ⚠ OTA-1553 — RETARGETED, NOT RELAXED. The constant is still 12 and the
    // comparison is still the same comparison; the DECLARATION moved into
    // engine/weaponGlyphs, because the combat buttons' ★ has to clear the exact
    // same bar as this card and a second copy of the number is how two readers
    // of one rule drift apart. The panel now imports it. Both halves are still
    // pinned — the literal at its new home, and the panel reading that one.
    const GLYPHS = readFileSync(join(__dirname, '..', 'app', 'engine', 'weaponGlyphs.ts'), 'utf8');
    expect(GLYPHS).toContain('export const WEAKNESS_READ_WIS = 12;');
    expect(codeOnly(PANEL)).toContain('const WEAKNESS_READ_WIS = SHARED_WEAKNESS_READ_WIS;');
    expect(codeOnly(PANEL)).toContain('(playerWisdom ?? 0) >= WEAKNESS_READ_WIS');
  });
});
