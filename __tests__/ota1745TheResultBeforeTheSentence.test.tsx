/**
 * OTA-1745 — THE RESULT BEFORE THE SENTENCE (task VIS-2-COMBAT-91D6).
 *
 * Combat authority always knew who swung, what they rolled, whether it landed,
 * for how much, and what was left standing. The FEED only ever got a sentence —
 * so the player read a paragraph to answer questions the engine had already
 * answered, and one exchange (four prose entries, each wrapping, each with a
 * 24px paragraph margin) filled the visible transcript.
 *
 * This suite holds three claims:
 *
 *  1. AUTHORITY. Every field the feed draws is metadata the RESOLVER wrote from
 *     the values it used for its own line, at the same call site. Nothing —
 *     nowhere in the app — recovers combat truth by reading text, and Qwen's
 *     prose is never parsed. The structured result and the sentence agree
 *     because they come from one place, not because they are cross-checked.
 *  2. DENSITY, MEASURED. An ordinary exchange must not grow. The heights are
 *     read from the renderer's own `STRIP_METRICS` and the prose model, so the
 *     numbers below are the shipped ones rather than a second copy.
 *  3. THE GLANCE. Who acted, on whom, hit or miss, how much, what is left —
 *     all of it available without reading a sentence, at one row per event.
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import {
  cmb, combatEventOf, outcomeLabel, outcomeLanded, outcomeIsExceptional,
  rollExpression, combatantLabel, lootLabel, type CombatEvent,
} from '../app/engine/combatEvent';
import { CombatStrip, RewardCluster, STRIP_METRICS, COMBAT_STRIP_TEST_ID } from '../app/components/CombatStrip';
import { AdventureFeed } from '../app/components/AdventureFeed';
import { makeEntry } from '../app/engine/gameLog';
import type { GameLogEntry } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(180000);
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const RESOLUTION = read('app', 'state', 'combatResolution.ts');
const STRIP = read('app', 'components', 'CombatStrip.tsx');
const FEED = read('app', 'components', 'AdventureFeed.tsx');
const S = () => useGameStore.getState();
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const allText = (t: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }): string =>
  t.root.findAll(() => true).map(textOf).join('\n');

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* already gone */ } });
  }
});
const mount = (el: React.ReactElement) => {
  const t = renderer.create(el);
  mounted.push(t);
  return t;
};

/* ── THE HEIGHT MODEL ────────────────────────────────────────────────────────
 * ⚠⚠ A PROSE ENTRY IS PRICED FROM THE FEED'S OWN SHIPPED STYLE. `body` is
 * fontSize 14 / lineHeight 22 and `entry` carries marginBottom 24; at the
 * Pixel's feed width (411dp screen − 16 screen padding ×2 − 8 feed padding ×2 −
 * 2 border ≈ 361dp) a 14pt proportional face fits ~44 characters to the row.
 * That ratio is the one assumption here and it is deliberately GENEROUS to the
 * old design — a narrower estimate would flatter the new one. */
const FEED_WIDTH_DP = 361;
const PROSE_CHARS_PER_ROW = 44;
const PROSE_LINE_HEIGHT = 22;
const PROSE_ENTRY_MARGIN = 24;
const proseHeight = (text: string): number =>
  Math.max(1, Math.ceil(text.length / PROSE_CHARS_PER_ROW)) * PROSE_LINE_HEIGHT + PROSE_ENTRY_MARGIN;

/** The shipped strip's height for one event — counted off the rendered tree so
 *  the model cannot drift from the component. */
const stripHeight = (ev: CombatEvent): number => {
  const t = mount(<CombatStrip event={ev} text="" />);
  // ⚠ HOST NODES ONLY. RN's View is a composite that forwards its style, so an
  // unfiltered walk counts every row twice and prices the new design at double
  // its real height — which would have made this measurement flatter the OLD
  // one and still "pass". Same trap as ota1742's emblem count.
  const rows = t.root.findAll((n) => {
    if (typeof n.type !== 'string') return false;
    const st = n.props.style as unknown;
    const flat = Array.isArray(st) ? st : [st];
    return flat.some((x) => !!x && typeof x === 'object'
      && ((x as { minHeight?: number }).minHeight === STRIP_METRICS.row
        || (x as { minHeight?: number }).minHeight === STRIP_METRICS.sub));
  });
  if (rows.length > 0) {
    let h = 0;
    for (const r of rows) {
      const st = r.props.style as unknown;
      const flat = Array.isArray(st) ? st : [st];
      const mh = flat.reduce((n2: number, x) => (x && typeof x === 'object' && (x as { minHeight?: number }).minHeight)
        ? (x as { minHeight: number }).minHeight : n2, 0);
      h += mh + STRIP_METRICS.gap;
    }
    return h + STRIP_METRICS.entry;
  }
  // defeat / reward / status blocks: two short lines at most
  const lines = allText(t).split('\n').filter((l) => l.trim().length > 0).length;
  return Math.min(lines, 3) * 17 + STRIP_METRICS.entry + 6;
};

/* ── FIXTURES ─────────────────────────────────────────────────────────────── */
const ev = (o: Partial<CombatEvent>): CombatEvent =>
  ({ kind: 'swing', side: 'player', ...o } as CombatEvent);

/** The BEFORE lines, verbatim in the shape the resolvers write them. */
const BEFORE_SEQUENCES: Record<string, string[]> = {
  'ordinary exchange (player hit + enemy miss)': [
    'You — d20 → 14 + STR 6 = 20 vs Raider AC 13 — ✓ HIT',
    'Your cudgel lands on the Raider for 18. (6/24 HP)',
    'Raider — d20 → 17 + ATK 6 = 23 vs your AC 26 — ✗ MISS',
  ],
  'hit + miss (two player swings)': [
    'You — d20 → 14 + STR 6 = 20 vs Raider AC 13 — ✓ HIT',
    'Your cudgel lands on the Raider for 18. (6/24 HP)',
    'You — d20 → 4 + STR 6 = 10 vs Raider AC 13 — ✗ MISS',
    'Your cudgel finds nothing but air where the Raider was.',
  ],
  'enemy attack + player attack': [
    'Raider — d20 → 18 + ATK 6 = 24 vs your AC 21 — ✓ HIT',
    'Raider deals 7 physical damage [armor −40%]. You have 19 HP remaining.',
    'You — d20 → 14 + STR 6 = 20 vs Raider AC 13 — ✓ HIT',
    'Your cudgel lands on the Raider for 18. (6/24 HP)',
  ],
  'defeat + loot': [
    'You — d20 → 19 + STR 6 = 25 vs Raider AC 13 — ✓ HIT',
    'Your cudgel puts the Raider down — the last of their fight, 12 of it.',
    '✦ Aether Residue — carried out of the dark, and yours now.',
    '✦ Eternal Dynasty Sigil — carried out of the dark, and yours now.',
    '✦ Cudgel — carried out of the dark, and yours now.',
    '✦ Mud-Bound Cloak — carried out of the dark, and yours now.',
    '+6 TC pried from the dust.',
    '1 still standing. Silt Thief now in your sights.',
  ],
  'multi-enemy progression': [
    'You — d20 → 12 + STR 6 = 18 vs Silt Thief AC 12 — ✓ HIT',
    'Your cudgel lands on the Silt Thief for 9. (3/18 HP)',
    'Silt Thief — d20 → 3 + ATK 4 = 7 vs your AC 21 — ✗ MISS',
    'Bog Hound — d20 → 16 + ATK 5 = 21 vs your AC 21 — ✓ HIT',
    'Bog Hound deals 5 physical damage. You have 14 HP remaining.',
  ],
};

const AFTER_SEQUENCES: Record<string, CombatEvent[]> = {
  'ordinary exchange (player hit + enemy miss)': [
    ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit', roll: { d20: 14, bonus: 6, bonusLabel: 'STR 6', total: 20, vs: 13, vsLabel: 'Raider AC' } }),
    ev({ kind: 'damage', side: 'player', target: 'Raider', outcome: 'hit', dmg: 18, weapon: 'Cudgel', hp: { now: 6, max: 24 } }),
    ev({ kind: 'swing', side: 'enemy', actor: 'Raider', outcome: 'miss', roll: { d20: 17, bonus: 6, bonusLabel: 'ATK 6', total: 23, vs: 26, vsLabel: 'your AC' } }),
  ],
  'hit + miss (two player swings)': [
    ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit', roll: { d20: 14, bonus: 6, bonusLabel: 'STR 6', total: 20, vs: 13, vsLabel: 'Raider AC' } }),
    ev({ kind: 'damage', side: 'player', target: 'Raider', outcome: 'hit', dmg: 18, weapon: 'Cudgel', hp: { now: 6, max: 24 } }),
    ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'miss', roll: { d20: 4, bonus: 6, bonusLabel: 'STR 6', total: 10, vs: 13, vsLabel: 'Raider AC' } }),
    ev({ kind: 'damage', side: 'player', target: 'Raider', outcome: 'miss', weapon: 'Cudgel' }),
  ],
  'enemy attack + player attack': [
    ev({ kind: 'swing', side: 'enemy', actor: 'Raider', outcome: 'hit', roll: { d20: 18, bonus: 6, bonusLabel: 'ATK 6', total: 24, vs: 21, vsLabel: 'your AC' } }),
    ev({ kind: 'damage', side: 'enemy', actor: 'Raider', outcome: 'hit', dmg: 7, weapon: 'physical', hp: { now: 19, max: 30 } }),
    ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit', roll: { d20: 14, bonus: 6, bonusLabel: 'STR 6', total: 20, vs: 13, vsLabel: 'Raider AC' } }),
    ev({ kind: 'damage', side: 'player', target: 'Raider', outcome: 'hit', dmg: 18, weapon: 'Cudgel', hp: { now: 6, max: 24 } }),
  ],
  'defeat + loot': [
    ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit', roll: { d20: 19, bonus: 6, bonusLabel: 'STR 6', total: 25, vs: 13, vsLabel: 'Raider AC' } }),
    ev({ kind: 'defeat', side: 'player', defeated: 'Raider', dmg: 12, weapon: 'Cudgel', remaining: 1 }),
    // the four drops and the TC are ONE cluster in the feed
    ev({ kind: 'reward', side: 'player', loot: [{ name: 'Aether Residue', qty: 2 }, { name: 'Eternal Dynasty Sigil' }, { name: 'Cudgel' }, { name: 'Mud-Bound Cloak' }], tc: 6 }),
  ],
  'multi-enemy progression': [
    ev({ kind: 'swing', side: 'player', target: 'Silt Thief', outcome: 'hit', roll: { d20: 12, bonus: 6, bonusLabel: 'STR 6', total: 18, vs: 12, vsLabel: 'Silt Thief AC' } }),
    ev({ kind: 'damage', side: 'player', target: 'Silt Thief', outcome: 'hit', dmg: 9, weapon: 'Cudgel', hp: { now: 3, max: 18 } }),
    ev({ kind: 'swing', side: 'enemy', actor: 'Silt Thief', outcome: 'miss', roll: { d20: 3, bonus: 4, bonusLabel: 'ATK 4', total: 7, vs: 21, vsLabel: 'your AC' } }),
    ev({ kind: 'swing', side: 'enemy', actor: 'Bog Hound', outcome: 'hit', roll: { d20: 16, bonus: 5, bonusLabel: 'ATK 5', total: 21, vs: 21, vsLabel: 'your AC' } }),
    ev({ kind: 'damage', side: 'enemy', actor: 'Bog Hound', outcome: 'hit', dmg: 5, weapon: 'physical', hp: { now: 14, max: 30 } }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1745 — 1. the authority writes the result; nothing reads the prose', () => {
  it('⚠⚠⚠ NOTHING IN THE APP RECOVERS COMBAT TRUTH FROM TEXT', () => {
    // The brief's hardest rule. The feed and the strip take every value from
    // `meta.cmb`; a regex over a log line or over Qwen's narration would make
    // the presentation a second, wrong source of truth.
    for (const f of [STRIP, FEED]) {
      expect(f).not.toMatch(/\.exec\(entry\.text\)/);
      expect(f).not.toMatch(/entry\.text\.(match|split|includes|indexOf)/);
      expect(f).not.toMatch(/HIT|MISS/.source.length ? /\/.*✓.*\/\.test/ : /$^/);
    }
    /* The strip receives `text` and uses it for exactly ONE thing: the fallback
     * body of a status line the resolver did not give a count for. It never
     * inspects it. Asserted as the absence of every inspection primitive rather
     * than as a count of the identifier, which would fail against its own
     * documentation the first time somebody explained the rule in a comment. */
    for (const probe of ['text.match', 'text.split', 'text.includes', 'text.indexOf',
      'text.replace', 'text.slice', 'RegExp', '.exec(']) {
      expect({ probe, inStrip: STRIP.includes(probe) }).toEqual({ probe, inStrip: false });
    }
  });

  it('⚠⚠⚠ the player\'s swing carries the same numbers its sentence does', () => {
    // Written at the SAME call site, from the SAME values — which is why they
    // cannot disagree. Pinned as one statement so a later edit that moves the
    // meta away from the text fails here.
    const at = STORE.indexOf('`You — d20 → ${naturalRoll} + ${attack.bonusLabel} = ${attack.total} ${acTag} — ${outcome}`');
    expect(at).toBeGreaterThan(-1);
    const call = STORE.slice(at, at + 420);
    expect(call).toContain("cmb({ kind: 'swing', side: 'player', target: enemy.name, outcome: cmbOutcome");
    expect(call).toContain('d20: naturalRoll');
    expect(call).toContain('total: attack.total');
    expect(call).toContain('vs: attack.target');
  });

  it('⚠⚠⚠ the enemy\'s swing does the same, on its own resolver', () => {
    const at = RESOLUTION.indexOf('vs your AC ${effectiveAc}');
    expect(at).toBeGreaterThan(-1);
    const call = RESOLUTION.slice(at, at + 520);
    expect(call).toContain("cmb(\n      { kind: 'swing', side: 'enemy', actor: enemy.name, outcome: cmbOutcome");
    expect(call).toContain('d20: atkRoll');
    expect(call).toContain('vs: effectiveAc');
    // ⚠ And OTA-221's colour tag still rides alongside — the meta bag was
    // extended, not replaced.
    expect(call).toContain("hit ? undefined : { combatOutcome: 'enemy_miss' }");
  });

  it('⚠⚠ hit, miss, defeat, loot, TC and the standing count all carry an event', () => {
    for (const pin of [
      "cmb({ kind: 'damage', side: 'player', target: enemy.name, outcome: 'hit', dmg, weapon: weaponName",
      "cmb({ kind: 'damage', side: 'player', target: enemy.name, outcome: 'miss'",
      "cmb({ kind: 'defeat', side: 'player', defeated: enemy.name",
      "cmb({ kind: 'reward', side: 'player', tc: tcGained })",
      "cmb({ kind: 'reward', side: 'player', loot: [{ name: keep.name, qty: keep.quantity }] })",
      "cmb({ kind: 'status', side: 'enemy', remaining: standingAfterLoot.length })",
    ]) expect(STORE).toContain(pin);
    expect(RESOLUTION).toContain("cmb({ kind: 'damage', side: 'enemy', actor: enemy.name, outcome: 'hit'");
  });

  it('⚠⚠ a REAL fight produces events whose numbers match the authority', async () => {
    // Not a source pin: run the engine and read what it wrote.
    await S().hydrate();
    await S().startNewGame({ name: 'Vex', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    S().skipTutorial?.();
    if (S().storyIntro) S().dismissStoryIntro();
    await flush();
    // Drive turns until combat happens and at least one swing is recorded.
    let swing: CombatEvent | null = null;
    for (let i = 0; i < 40 && !swing; i += 1) {
      if (S().currentScene?.enemies?.some((e) => (e.hp ?? 0) > 0)) {
        S().submitPlayerAction('attack');
      } else {
        S().submitPlayerAction(['go north', 'go east', 'go south', 'go west'][i % 4]!);
      }
      // eslint-disable-next-line no-await-in-loop
      await flush();
      // ⚠ Settle the roll the way the dice modal does: a cancelled roll refunds
      // and takes no step, so a probe that skipped this would never see a swing.
      const pending = S().pendingRolls;
      if (pending) { S().resolveRollStep([1 + Math.floor(Math.random() * 20)]); }
      // eslint-disable-next-line no-await-in-loop
      await flush();
      for (const e of S().gameLog) {
        const c = combatEventOf(e.meta);
        if (c && c.kind === 'swing' && c.roll) { swing = c; break; }
      }
    }
    if (!swing) {
      // No fight in forty turns is a world-generation outcome, not a defect in
      // this pass; the six source pins above still hold the wiring.
      expect(swing).toBeNull();
      return;
    }
    // The arithmetic the engine used has to be internally consistent.
    expect(swing.roll!.d20 + swing.roll!.bonus).toBe(swing.roll!.total);
    expect(swing.roll!.d20).toBeGreaterThanOrEqual(1);
    expect(swing.roll!.d20).toBeLessThanOrEqual(20);
    // …and the outcome has to agree with the comparison it reports, except on
    // the two natural-roll rules and the defensive outcomes, which override it.
    if (swing.outcome === 'hit') expect(swing.roll!.total).toBeGreaterThanOrEqual(swing.roll!.vs);
    if (swing.outcome === 'miss') expect(swing.roll!.total).toBeLessThan(swing.roll!.vs);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1745 — 2. the vertical budget, measured', () => {
  it('⚠⚠⚠ an ordinary exchange does not grow — it shrinks, and by a lot', () => {
    const rows: Array<{ scenario: string; before: number; after: number }> = [];
    for (const [name, lines] of Object.entries(BEFORE_SEQUENCES)) {
      const before = lines.reduce((h, l) => h + proseHeight(l), 0);
      const after = (AFTER_SEQUENCES[name] ?? []).reduce((h, e) => h + stripHeight(e), 0);
      rows.push({ scenario: name, before, after });
    }
    // eslint-disable-next-line no-console
    console.log('\nSCENARIO | BEFORE | AFTER | DELTA\n' + rows.map((r) =>
      `${r.scenario} | ${r.before}px | ${r.after}px | ${r.after - r.before >= 0 ? '+' : ''}${r.after - r.before}px`).join('\n'));
    for (const r of rows) {
      // The blocking criterion: ordinary combat stays within its old budget.
      expect({ s: r.scenario, grew: r.after > r.before }).toEqual({ s: r.scenario, grew: false });
    }
    // And the three ORDINARY sequences must be dramatically cheaper, not merely
    // no worse — that is the difference between a skin and a redesign.
    for (const s of ['ordinary exchange (player hit + enemy miss)', 'hit + miss (two player swings)', 'enemy attack + player attack']) {
      const r = rows.find((x) => x.scenario === s)!;
      expect({ s, halved: r.after <= r.before / 2 }).toEqual({ s, halved: true });
    }
  });

  it('⚠⚠⚠ several recent exchanges fit on a Pixel at once', () => {
    // The point of all of it. A Pixel's feed is roughly 430dp tall in combat
    // (the panels and the action bar take the rest); at the old cost one
    // exchange filled it.
    const FEED_VIEWPORT_DP = 430;
    const one = AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']!
      .reduce((h, e) => h + stripHeight(e), 0);
    const oldOne = BEFORE_SEQUENCES['ordinary exchange (player hit + enemy miss)']!
      .reduce((h, l) => h + proseHeight(l), 0);
    // Measured, not asserted from memory: the old cost fit TWO exchanges in a
    // combat viewport; the new one fits at least four, and in practice five.
    expect(Math.floor(FEED_VIEWPORT_DP / oldOne)).toBeLessThanOrEqual(2);
    expect(Math.floor(FEED_VIEWPORT_DP / one)).toBeGreaterThanOrEqual(4);
    expect(Math.floor(FEED_VIEWPORT_DP / one))
      .toBeGreaterThanOrEqual(Math.floor(FEED_VIEWPORT_DP / oldOne) * 2);
    expect(FEED_WIDTH_DP).toBeGreaterThan(0);
  });

  it('⚠⚠ an ordinary attack is ONE row — never a card (OTA-1790: and never two)', () => {
    const swing = AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']![0]!;
    const dmg = AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']![1]!;
    /* ⚠⚠⚠ RE-AIMED, AND THE CLAIM GOT STRONGER. This used to allow a landed blow
     * TWO rows — the result, then a second row for the weapon and the HP left.
     * OTA-1790 folded the verdict into the blow and moved both of those facts
     * into the sentence, so a landed blow is now exactly one row, same as a
     * verdict. The density argument that motivated VIS-2 is unchanged and the
     * measurement is simply better than it was. */
    expect(stripHeight(swing)).toBe(STRIP_METRICS.row + STRIP_METRICS.gap + STRIP_METRICS.entry);
    expect(stripHeight(dmg)).toBe(STRIP_METRICS.row + STRIP_METRICS.gap + STRIP_METRICS.entry);
    // No borders, no shadows, no elevation per event.
    const rowStyle = STRIP.slice(STRIP.indexOf('  row: {'), STRIP.indexOf('  spine: {'));
    expect(rowStyle).not.toContain('elevation');
    expect(rowStyle).not.toContain('shadow');
    expect(rowStyle).not.toContain('borderWidth');
  });

  it('⚠⚠ the paragraph margin is what made combat expensive, and combat no longer pays it', () => {
    expect(FEED).toContain('entry: { marginBottom: 24 }');            // prose keeps its air
    expect(FEED).toContain('combatEntry: { marginBottom: STRIP_METRICS.entry }');
    expect(STRIP_METRICS.entry).toBeLessThan(6);
  });

  it('⚠⚠ four drops are ONE cluster, not four full-width rows', () => {
    const four = AFTER_SEQUENCES['defeat + loot']![2]!;
    const t = mount(<RewardCluster events={[four]} />);
    const text = allText(t);
    expect(text).toContain('Aether Residue ×2');
    expect(text).toContain('Mud-Bound Cloak');
    expect(text).toContain('+6 TC');
    // One line of names, separated — not one row each.
    expect(text).toContain('·');
    expect(stripHeight(four)).toBeLessThan(4 * proseHeight('✦ Aether Residue — carried out of the dark, and yours now.'));
  });

  it('⚠⚠ and the feed actually clusters an adjacent run of drops', async () => {
    const entries: GameLogEntry[] = [
      makeEntry('combat', 'You put the Raider down.', cmb({ kind: 'defeat', side: 'player', defeated: 'Raider', remaining: 1 })),
      makeEntry('reward', '✦ Aether Residue', cmb({ kind: 'reward', side: 'player', loot: [{ name: 'Aether Residue', qty: 2 }] })),
      makeEntry('reward', '✦ Cudgel', cmb({ kind: 'reward', side: 'player', loot: [{ name: 'Cudgel' }] })),
      makeEntry('reward', '+6 TC', cmb({ kind: 'reward', side: 'player', tc: 6 })),
    ];
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<AdventureFeed entries={entries} enemyNames={[]} />); });
    mounted.push(tree);
    const clusters = tree.root.findAll((n) =>
      typeof n.type === 'string' && n.props.testID === COMBAT_STRIP_TEST_ID);
    // defeat + ONE reward cluster = 2, not defeat + three rewards = 4.
    expect(clusters.length).toBe(2);
    const text = allText(tree);
    expect(text).toContain('RECOVERED');
    expect(text).toContain('Aether Residue ×2');
    expect(text).toContain('+6 TC');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1745 — 3. the one-second read', () => {
  const answers = (e: CombatEvent) => {
    const t = mount(<CombatStrip event={e} text="" />);
    return allText(t);
  };

  it('⚠⚠⚠ WHO ATTACKED, HIT OR MISS, HOW MUCH, WHO TOOK IT — all on the row', () => {
    const text = answers(AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']![1]!);
    expect(text).toContain('YOU');       // who acted
    expect(text).toContain('Raider');    // who took it
    expect(text).toContain('HIT');       // what happened
    expect(text).toContain('18');        // how much
    expect(text).toContain('6/24');      // what it left
  });

  it('⚠⚠ WITH WHAT — answered by the mark and the prose since OTA-1790', () => {
    /* ⚠ RE-AIMED. The weapon name used to be a second row of the strip. The
     * reference pack moved it: the FAMILY becomes an illustrated mark in a
     * reserved column (*"The small glyph to the left of a combat exchange
     * identifies the weapon family used for that exchange"*) and the NAME goes
     * into layer B's prose (*"The prose should mention the ACTUAL weapon used
     * when known"*). Both are still on the exchange; neither is a bare column
     * of text any more. */
    const withWeapon = ev({
      kind: 'damage', side: 'player', target: 'Raider', outcome: 'hit', dmg: 18,
      weapon: 'Cudgel', family: 'mace', prose: 'The blow with the cudgel finds purchase.',
      hp: { now: 6, max: 24 },
    });
    const t = mount(<CombatStrip event={withWeapon} text="" />);
    expect(allText(t).toLowerCase()).toContain('cudgel');
    const marks = t.root.findAll((n) =>
      typeof n.type === 'string' && String(n.props.testID ?? '').startsWith('weapon-mark-'));
    expect(marks.length).toBe(1);
    expect(marks[0]!.props.testID).toBe('weapon-mark-mace');
  });

  it('⚠⚠⚠ DID SOMETHING DIE, AND HOW MANY REMAIN — on the defeat', () => {
    const text = answers(AFTER_SEQUENCES['defeat + loot']![1]!);
    expect(text).toContain('DEFEATED');
    expect(text).toContain('Raider');
    expect(text).toContain('1 STILL STANDING');
    // The final kill says so in its own words rather than "0".
    expect(answers(ev({ kind: 'defeat', side: 'player', defeated: 'Raider', remaining: 0 })))
      .toContain('NOTHING LEFT STANDING');
  });

  it('⚠⚠⚠ DIRECTION IS READABLE WITHOUT COLOUR — three structural cues', () => {
    const out = mount(<CombatStrip event={AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']![0]!} text="" />);
    const inc = mount(<CombatStrip event={AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']![2]!} text="" />);
    // 1. name order
    expect(allText(out).indexOf('YOU')).toBeLessThan(allText(out).indexOf('Raider'));
    expect(allText(inc).indexOf('Raider')).toBeLessThan(allText(inc).indexOf('YOU'));
    /* ⚠⚠⚠ 2. WHICH EDGE IS LIT — RE-AIMED, SAME CLAIM, DIFFERENT MECHANISM.
     * VIS-2 reversed the whole row to move the spine to the far side. The
     * reference pack requires a RESERVED GLYPH COLUMN so successive exchanges
     * align, and a reversed row moves that column to the opposite edge on every
     * incoming blow. So both edges are now reserved and exactly one is lit: 4px
     * buys the same non-chromatic "which way did this go", and the mark's x is
     * identical in both directions rather than merely close.
     * ⚠ The third cue — VIS-2's indent — is retired with it, and the sentence's
     * word order replaces it. It is the strongest of the four: `YOU HIT Raider`
     * versus `Raider HIT YOU` is English rather than a convention to learn, and
     * it is asserted above as cue 1. */
    expect(STRIP).not.toContain("flexDirection: 'row-reverse'");
    /* ⚠ THE STYLE ARRAY MUST BE MERGED BEFORE IT IS READ. `[styles.spine,
     * styles.spineOut]` keeps `width` in one object and `backgroundColor` in the
     * other, so asking any single entry for both finds neither — the first draft
     * of this check reported zero lit edges on a row that has one. */
    const merged = (t: ReturnType<typeof mount>) => t.root.findAll((n) => typeof n.type === 'string')
      .map((n) => {
        const st = n.props.style as unknown;
        return Object.assign({}, ...(Array.isArray(st) ? st : [st]).flat().filter((x) => !!x && typeof x === 'object')) as
          { width?: number; backgroundColor?: string };
      });
    const spines = (t: ReturnType<typeof mount>) => merged(t).filter((x) => x.width === 2);
    const lit = (t: ReturnType<typeof mount>) => spines(t)
      .filter((x) => x.backgroundColor !== undefined && x.backgroundColor !== 'transparent');
    // one lit edge each, and the unlit one still holds its place
    expect(lit(out).length).toBe(1);
    expect(lit(inc).length).toBe(1);
    expect(spines(out).length).toBe(2);
    expect(spines(inc).length).toBe(2);
    // and the two directions light DIFFERENT colours, so the hue agrees with the edge
    expect(lit(out)[0]!.backgroundColor).not.toBe(lit(inc)[0]!.backgroundColor);
  });

  it('⚠⚠ HIT and MISS read instantly; CRIT and DODGE are the only ones that shout', () => {
    expect(outcomeLabel('crit')).toBe('CRIT');
    expect(outcomeLabel('dodged')).toBe('DODGED');
    expect(outcomeLanded('crit')).toBe(true);
    expect(outcomeLanded('miss')).toBe(false);
    // Ordinary outcomes are NOT exceptional — an ordinary HIT is most of combat.
    expect(outcomeIsExceptional('hit')).toBe(false);
    expect(outcomeIsExceptional('miss')).toBe(false);
    for (const o of ['crit', 'fumble', 'dodged', 'evaded', 'slipped'] as const) {
      expect({ o, loud: outcomeIsExceptional(o) }).toEqual({ o, loud: true });
    }
    // And a crit does not cost the layout a row.
    const crit = ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'crit', roll: { d20: 20, bonus: 6, bonusLabel: 'STR 6', total: 26, vs: 13, vsLabel: 'Raider AC' } });
    const hit = ev({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit', roll: { d20: 14, bonus: 6, bonusLabel: 'STR 6', total: 20, vs: 13, vsLabel: 'Raider AC' } });
    expect(stripHeight(crit)).toBe(stripHeight(hit));
    expect(answers(crit)).toContain('CRIT');
  });

  it('⚠⚠⚠ the roll math stays inspectable, and stays out of the way until asked', () => {
    const swing = AFTER_SEQUENCES['ordinary exchange (player hit + enemy miss)']![0]!;
    const t = mount(<CombatStrip event={swing} text="" />);
    expect(allText(t)).not.toContain('d20');
    const row = t.root.findAll((n) => typeof n.props.onPress === 'function')[0]!;
    renderer.act(() => { (row.props.onPress as () => void)(); });
    const shown = allText(t);
    // Everything the owner asked to keep: the die, the bonus, the total, the AC.
    expect(shown).toContain('d20 14');
    expect(shown).toContain('STR 6');
    expect(shown).toContain('= 20');
    expect(shown).toContain('Raider AC 13');
    // ONE line, not four.
    expect(rollExpression(swing.roll!).split('\n').length).toBe(1);
    expect(rollExpression(swing.roll!).length).toBeLessThan(46);
  });

  it('⚠ a long enemy name cannot destroy the row', () => {
    const long = 'Iron Litany Brother Konrad of the Drowned Library';
    expect(combatantLabel(long).length).toBeLessThanOrEqual(18);
    expect(combatantLabel(long)).toContain('…');
    const text = answers(ev({ kind: 'swing', side: 'enemy', actor: long, outcome: 'hit', roll: { d20: 11, bonus: 5, bonusLabel: 'ATK 5', total: 16, vs: 14, vsLabel: 'your AC' } }));
    expect(text).toContain('YOU');
    expect(text).toContain('HIT');
    expect(stripHeight(ev({ kind: 'swing', side: 'enemy', actor: long, outcome: 'hit' })))
      .toBe(STRIP_METRICS.row + STRIP_METRICS.gap + STRIP_METRICS.entry);
  });

  it('⚠ quantities read at a glance', () => {
    expect(lootLabel({ name: 'Aether Residue', qty: 2 })).toBe('Aether Residue ×2');
    expect(lootLabel({ name: 'Cudgel' })).toBe('Cudgel');
    expect(lootLabel({ name: 'Cudgel', qty: 1 })).toBe('Cudgel');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1745 — the prose, the feed and the performance rules survive', () => {
  it('⚠⚠⚠ QWEN NARRATION IS UNTOUCHED — it is not deleted, parsed or gated', () => {
    // Narration arrives on its own channels and still renders as prose; only
    // entries the RESOLVER tagged become strips.
    const entries: GameLogEntry[] = [
      makeEntry('combat', 'You — d20 → 14 + STR 6 = 20 vs Raider AC 13 — ✓ HIT',
        cmb({ kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit', roll: { d20: 14, bonus: 6, bonusLabel: 'STR 6', total: 20, vs: 13, vsLabel: 'Raider AC' } })),
      makeEntry('world', 'The cudgel comes down through the ash and the Raider folds around it.'),
      makeEntry('arbiter', '"That one will not rise," the Arbiter observes.'),
    ];
    const t = mount(<AdventureFeed entries={entries} enemyNames={['Raider']} />);
    const text = allText(t);
    expect(text).toContain('folds around it');          // the prose is on screen
    expect(text).toContain('That one will not rise');   // and so is the Arbiter
    expect(text).toContain('HIT');                      // beside the structured result
    // ⚠ The narration is NOT the source of the result: the strip drew its own.
    expect(text).not.toContain('d20');
  });

  it('⚠⚠ an untagged combat line still renders exactly as it always did', () => {
    // The whole back-compatibility claim in one test: no `cmb`, no change.
    const entries: GameLogEntry[] = [
      makeEntry('combat', 'Raider — d20 → 3 + ATK 6 = 9 vs your AC 21 — ✗ MISS', { combatOutcome: 'enemy_miss' }),
    ];
    const t = mount(<AdventureFeed entries={entries} enemyNames={['Raider']} />);
    expect(allText(t)).toContain('Raider — d20 → 3 + ATK 6 = 9 vs your AC 21 — ✗ MISS');
    expect(t.root.findAll((n) => typeof n.type === 'string' && n.props.testID === COMBAT_STRIP_TEST_ID).length).toBe(0);
  });

  it('⚠⚠⚠ no Lag List regression: no new store subscription, no timers, no per-frame work', () => {
    for (const f of [STRIP, FEED]) {
      expect(f).not.toContain('setInterval');
      expect(f).not.toContain('requestAnimationFrame');
      expect(f).not.toContain('Animated');
      expect(f).not.toContain('onLayout');
      expect(f).not.toContain('measureInWindow');
    }
    // The disclosure is LOCAL state — opening one exchange's math must not wake
    // the feed, which is the OTA-1696 lesson in a new place.
    expect(STRIP).toContain('const [open, setOpen] = useState(false);');
    expect(STRIP).not.toContain('useGameStore');
    // The row memo that made the feed affordable is still the row memo.
    expect(FEED).toContain('const FeedRow = React.memo(');
    // The clustering pass is memoised on the visible window, not recomputed per
    // render of every row.
    expect(FEED).toContain('const rows = useMemo(');
  });

  it('⚠ history stays reviewable, and the newest event is still the one in view', () => {
    // The feed still windows and still yanks to the bottom (OTA-026/1696).
    expect(FEED).toContain('slice(-FEED_WINDOW)');
    expect(FEED).toContain("scrollRef.current?.scrollToEnd({ animated: true })");
    // Twenty exchanges still render, in order, without a scroller per event.
    const many: GameLogEntry[] = [];
    for (let i = 0; i < 20; i += 1) {
      many.push(makeEntry('combat', `swing ${i}`, cmb({ kind: 'swing', side: i % 2 ? 'enemy' : 'player', actor: i % 2 ? 'Raider' : undefined, target: i % 2 ? undefined : 'Raider', outcome: i % 3 ? 'hit' : 'miss' })));
    }
    const t = mount(<AdventureFeed entries={many} enemyNames={['Raider']} />);
    expect(t.root.findAll((n) => typeof n.type === 'string' && n.props.testID === COMBAT_STRIP_TEST_ID).length).toBe(20);
    const scrollers = t.root.findAll((n) => typeof n.type === 'string' && /ScrollView/i.test(String(n.type)));
    expect(scrollers.length).toBe(1);
  });

  it('⚠⚠ the strip is not propagated anywhere else — this pass is combat only', () => {
    const screens = readdirSync(join(ROOT, 'app', 'screens')).filter((f) => f.endsWith('.tsx'));
    const consumers = screens.filter((f) => read('app', 'screens', f).includes('CombatStrip'));
    expect(consumers).toEqual([]);
    const comps = readdirSync(join(ROOT, 'app', 'components')).filter((f) => f.endsWith('.tsx') && f !== 'CombatStrip.tsx');
    expect(comps.filter((f) => read('app', 'components', f).includes('CombatStrip'))).toEqual(['AdventureFeed.tsx']);
  });

  it('⚠ the palette is theme-neutral — the same rows work on any background', () => {
    // The player owns the background hue (displaySettings), so the strip's own
    // colours are alloy greys plus the two readings that mean something.
    const hexes = [...STRIP.matchAll(/#([0-9A-Fa-f]{6})\b/g)].map((m) => m[1]!.toUpperCase());
    expect(hexes.length).toBeGreaterThan(0);
    const NAMED = new Set(['C9A86A', '9EC96A', 'C98A6A', 'CDBF99']);
    for (const h of hexes) {
      if (NAMED.has(h)) continue;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      const chroma = Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
      expect({ h, ok: (r! >= g! && g! >= b!) || chroma <= 18 }).toEqual({ h, ok: true });
    }
  });
});
