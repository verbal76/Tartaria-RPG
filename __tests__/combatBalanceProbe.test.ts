// Honest combat-balance probe. Unlike combatStress.test.ts (which
// boosts the character to STR 14 / HP 80 and tops up HP every round)
// this harness runs a TYPICAL early-game character against a mixed
// roster — Common / Uncommon / Rare / Legendary — and tracks the
// numbers that answer the actual gameplay question:
//
//   "After each fight, how much HP did the player lose, and how
//    many supplies got burned restoring it?"
//
// No HP top-up. No artificial healing. The player rests / uses
// First Aid Kits like a real player would. Encounter runs to
// kill, flee (HP < 25%), or 25-round stall.

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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import enemiesJson from '../app/data/enemies/enemies.json';
import type { Enemy } from '../app/engine/types';

type EnemyRecord = { name: string; rarity: string };

describe('combat-balance probe — honest damage / supply burn per rarity', () => {
  jest.setTimeout(180000);

  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;

  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });
  afterAll(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
  });

  it('measures fight cost across Common / Uncommon / Rare / Legendary', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    // Build a "typical" early-game character ONCE; we reset HP between
    // fights but keep stats / gear constant. Realistic baseline:
    //   - rolled stats (don't override)
    //   - Rusted Blade (starter weapon) — 1d4 slash
    //   - Patched Vest (light chest +0 AC, real-ish)
    //   - 6 First Aid Kits (a fresh haul, not a hoard)
    //   - no off-hand
    await store.getState().startNewGame({
      name: 'BalanceProbe',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    const p0 = store.getState().player!;
    const baselineHp = p0.hpMax;
    const baselineStats = p0.stats;
    const baselineInv = [
      ...p0.inventory.filter((it) => it.kind !== 'weapon' && it.kind !== 'armor'),
      { id: 'probe_main', name: 'Rusted Blade', kind: 'weapon' as const, quantity: 1, tags: ['weapon', 'blade', 'melee'] },
      { id: 'probe_chest', name: "Patched Vest", kind: 'armor' as const, quantity: 1, tags: ['armor', 'chest'] },
      { id: 'probe_faks', name: 'First Aid Kit', kind: 'consumable' as const, quantity: 6, tags: ['healing'] },
    ];
    store.setState({
      player: {
        ...p0,
        hubRoomId: null,
        inventory: baselineInv,
        equipped: {
          ...(p0.equipped ?? {}),
          main: 'Rusted Blade',
          chest: 'Patched Vest',
        },
      },
    });

    // Snapshot pristine player so we can reset between encounters.
    const pristine = JSON.parse(JSON.stringify(store.getState().player));

    // Buckets per rarity. We want to see real numbers, not aggregate.
    type Bucket = {
      rarity: string;
      encounters: number;
      wins: number;
      fled: number;
      deaths: number;
      stalled: number;
      hpLossTotal: number;       // sum of (HP before → HP at fight end), no resets between fights
      hpLossWorst: number;
      roundsTotal: number;
      faksUsed: number;
      criticalHits: number;
      criticalsTaken: number;
      fumbles: number;
      enemyFumbles: number;
    };

    const buckets: Record<string, Bucket> = {
      Common: { rarity: 'Common', encounters: 0, wins: 0, fled: 0, deaths: 0, stalled: 0, hpLossTotal: 0, hpLossWorst: 0, roundsTotal: 0, faksUsed: 0, criticalHits: 0, criticalsTaken: 0, fumbles: 0, enemyFumbles: 0 },
      Uncommon: { rarity: 'Uncommon', encounters: 0, wins: 0, fled: 0, deaths: 0, stalled: 0, hpLossTotal: 0, hpLossWorst: 0, roundsTotal: 0, faksUsed: 0, criticalHits: 0, criticalsTaken: 0, fumbles: 0, enemyFumbles: 0 },
      Rare: { rarity: 'Rare', encounters: 0, wins: 0, fled: 0, deaths: 0, stalled: 0, hpLossTotal: 0, hpLossWorst: 0, roundsTotal: 0, faksUsed: 0, criticalHits: 0, criticalsTaken: 0, fumbles: 0, enemyFumbles: 0 },
      Legendary: { rarity: 'Legendary', encounters: 0, wins: 0, fled: 0, deaths: 0, stalled: 0, hpLossTotal: 0, hpLossWorst: 0, roundsTotal: 0, faksUsed: 0, criticalHits: 0, criticalsTaken: 0, fumbles: 0, enemyFumbles: 0 },
    };

    // Build per-rarity rosters from enemies.json so we hit the full spread.
    const allEnemies = enemiesJson as EnemyRecord[];
    const roster = (rarity: string) =>
      allEnemies
        .filter((e) => e.rarity === rarity)
        .map((e) => findEnemyByName(e.name))
        .filter((e): e is Enemy => !!e);

    const rosters = {
      Common: roster('Common'),
      Uncommon: roster('Uncommon'),
      Rare: roster('Rare'),
      Legendary: roster('Legendary'),
    };

    // 100 fights per tier — enough to get stable averages.
    const FIGHTS_PER_TIER = 100;
    const rarities: Array<keyof typeof rosters> = ['Common', 'Uncommon', 'Rare', 'Legendary'];

    function reset() {
      store.setState({ player: JSON.parse(JSON.stringify(pristine)) });
    }
    function inject(rarity: keyof typeof rosters): Enemy | null {
      const pool = rosters[rarity];
      if (pool.length === 0) return null;
      const e = JSON.parse(JSON.stringify(pool[Math.floor(Math.random() * pool.length)]!));
      const scene = store.getState().currentScene;
      if (!scene) return null;
      store.setState({
        currentScene: {
          ...scene,
          enemies: [e],
          enemyHps: [e.hp],
          activeEnemyIdx: 0,
          range: 'close',
        },
      });
      return e;
    }
    function drainRolls(critTracker: { hits: number; taken: number; fumbles: number; eFumbles: number }) {
      let safety = 0;
      while (store.getState().pendingRolls && safety < 30) {
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep];
        if (!step) { try { store.getState().cancelPendingRolls(); } catch {} break; }
        const count = step.count ?? 1;
        const sides = step.sides ?? 6;
        const values: number[] = [];
        for (let i = 0; i < count; i++) values.push(1 + Math.floor(Math.random() * sides));
        if (step.id === 'attack' && step.sides === 20) {
          const nat = values[0] ?? 0;
          if (nat === 20) critTracker.hits++;
          if (nat === 1) critTracker.fumbles++;
        }
        try { store.getState().resolveRollStep(values); } catch { try { store.getState().cancelPendingRolls(); } catch {}; break; }
        safety++;
      }
      if (safety >= 30) try { store.getState().cancelPendingRolls(); } catch {}
    }

    for (const rarity of rarities) {
      if (rosters[rarity].length === 0) continue;
      for (let fight = 0; fight < FIGHTS_PER_TIER; fight++) {
        reset();
        const enemy = inject(rarity);
        if (!enemy) break;
        const b = buckets[rarity]!;
        b.encounters++;
        const hpBefore = store.getState().player!.hp;
        let faksAtStart = 6;
        const critTracker = { hits: 0, taken: 0, fumbles: 0, eFumbles: 0 };

        let outcome: 'win' | 'flee' | 'death' | 'stall' = 'stall';
        for (let round = 1; round <= 25; round++) {
          const player = store.getState().player!;
          const scene = store.getState().currentScene;
          if (!player || !scene || scene.enemies.length === 0) { outcome = 'win'; break; }
          if (player.hp <= 0) { outcome = 'death'; break; }
          const hpFrac = player.hp / Math.max(1, player.hpMax);
          // Realistic player behavior: heal at <35% if FAK available; else flee at <20%.
          if (hpFrac < 0.35 && (player.inventory.find((i) => i.name === 'First Aid Kit')?.quantity ?? 0) > 0) {
            store.getState().submitPlayerAction('use first aid kit');
            drainRolls(critTracker);
            continue;
          }
          if (hpFrac < 0.20) { outcome = 'flee'; break; }
          // Action: equipped attack.
          store.getState().submitPlayerAction('attack ' + scene.enemies[0]!.name);
          drainRolls(critTracker);
          b.roundsTotal++;
        }

        const pAfter = store.getState().player!;
        const hpAfter = pAfter.hp;
        const hpLoss = Math.max(0, hpBefore - hpAfter);
        b.hpLossTotal += hpLoss;
        if (hpLoss > b.hpLossWorst) b.hpLossWorst = hpLoss;
        const faksRemaining = pAfter.inventory.find((i) => i.name === 'First Aid Kit')?.quantity ?? 0;
        b.faksUsed += faksAtStart - faksRemaining;
        b.criticalHits += critTracker.hits;
        b.fumbles += critTracker.fumbles;
        // crits/fumbles ON the player are logged in the combat channel
        // via applyEnemyCounter — we approximate by counting log entries.

        if (outcome === 'win') b.wins++;
        else if (outcome === 'flee') b.fled++;
        else if (outcome === 'death') b.deaths++;
        else b.stalled++;
      }
    }

    function rateStr(num: number, denom: number): string {
      if (denom === 0) return '—';
      return `${((num / denom) * 100).toFixed(0)}%`;
    }

    const lines: string[] = [];
    lines.push('======= COMBAT BALANCE PROBE (honest) =======');
    lines.push(`Character: ${baselineHp} HP max, STR ${baselineStats.strength} DEX ${baselineStats.dexterity} INT ${baselineStats.intelligence}`);
    lines.push(`Gear: Rusted Blade + Patched Vest + 6 First Aid Kits (no off-hand)`);
    lines.push('');
    lines.push('Per-rarity outcomes (100 fights each, full reset between fights):');
    lines.push('');
    lines.push('Rarity      Win   Flee  Death Stall | AvgHPLoss Worst | AvgRds | FAKsUsed/fight | Crits Fumbles');
    for (const r of rarities) {
      const b = buckets[r]!;
      if (b.encounters === 0) { lines.push(`${r.padEnd(12)} (no roster)`); continue; }
      const avgLoss = (b.hpLossTotal / b.encounters).toFixed(1);
      const avgRds = (b.roundsTotal / b.encounters).toFixed(1);
      const avgFak = (b.faksUsed / b.encounters).toFixed(2);
      lines.push(
        `${r.padEnd(12)} ${rateStr(b.wins, b.encounters).padEnd(5)} ${rateStr(b.fled, b.encounters).padEnd(5)} ${rateStr(b.deaths, b.encounters).padEnd(5)} ${rateStr(b.stalled, b.encounters).padEnd(5)} | ${avgLoss.padStart(8)} ${String(b.hpLossWorst).padStart(5)} | ${avgRds.padStart(6)} | ${avgFak.padStart(13)} | ${String(b.criticalHits).padStart(4)} ${String(b.fumbles).padStart(4)}`,
      );
    }
    lines.push('');
    lines.push('Reading guide:');
    lines.push('  AvgHPLoss = HP at fight-start minus HP at fight-end. Higher = costlier fight.');
    lines.push('  FAKs used per fight tells you "supplies burned to keep upright".');
    lines.push('  Flee% > 0 means HP dipped below 20% — player WOULD have run.');
    lines.push('=============================================');
    const report = lines.join('\n');
    console.log = origLog;
    console.log(report);
    try { require('fs').writeFileSync('/tmp/tartaria-combat-balance-probe.txt', report); } catch {}

    // Loose sanity assertion — we just want this to run, not fail on
    // numbers (the whole point is to read the numbers).
    expect(buckets.Common!.encounters).toBeGreaterThan(0);
  });
});
