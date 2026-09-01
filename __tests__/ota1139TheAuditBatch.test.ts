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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
// OTA-1139 — THE 24-HOUR AUDIT, AND THE FOUR THINGS IT CAUGHT.
//
// The owner asked for a full audit of everything shipped in the last day
// (OTA-1128..1161). The re-derivation swept every claim those OTAs made
// against the live code; most held. Four did not, and every one of them is a
// case of the last day's own lessons applied one file short of everywhere:
//
//   1. `playerPowerScore` was a FOURTH inline copy of the gear-AC walk — no
//      amulet/ring AC, catalog acBonus where combat prefers the rolled
//      instance. Found by the sweep OTA-1135 said should never be needed
//      again; the Power gauge disagreed with the panel by exactly the
//      jewellery. It now calls standingAc — the same call, not the same idea.
//
//   2. The EnemyPanel printed `e.damage` raw in two places — OTA-1136's boss
//      understatement on the surface the player opens SPECIFICALLY to size a
//      fight up. A boss card read `1d8+3` while the resolver rolled
//      `1d8+3+1d6` twice. `enemyDamageCompact` is the chip-width truth.
//
//   3. The scene-intro bank pre-synthesized RAW text while the live path
//      strips arbiter frames first — so for any intro carrying quoted
//      dialogue the presynth cache key could never match what speak() looks
//      up: homework audio computed, paid for, unreachable. The bank now
//      presynthesizes the STRIPPED form; quote-free prose is unchanged.
//
//   4. llama.rn's `prompt_ms` is not always per-call: the device log carried
//      `investigate_lore ok 5353ms read 54112ms` — a 54-second prefill inside
//      a 5-second call. That impossible sample fed OTA-1127's ms/tok range
//      unguarded, and the PARKED caching investigation is waiting on exactly
//      that range to decide anything. Impossible samples no longer move it.

import { playerPowerScore } from '../app/engine/powerRating';
import { standingAc, effectiveStats } from '../app/engine/equipment';
import { enemyDamageCompact, enemyDamageDisplay } from '../app/engine/combatRules';
import { recordQwenCall, qwenJobStats, resetQwenTelemetry } from '../app/ai/generation/qwenTelemetry';
import type { PlayerCharacter } from '../app/engine/types';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

describe('OTA-1139 audit №1 — the Power gauge reads the ONE AC', () => {
  it('⚠ jewellery moves Power now, exactly as it moves the panel', () => {
    const bare = {
      ac: 10, hpMax: 24, inventory: [],
      stats: { strength: 9, dexterity: 13, intelligence: 6, wisdom: 6, charisma: 6 },
      equipped: {},
    } as unknown as PlayerCharacter;
    const jeweled = {
      ...bare,
      equipped: { amulet: "Reclaimer's Aegis Pendant", ring: "Titan's Iron Band", ring2: 'Ring of the Deep Current' },
    } as unknown as PlayerCharacter;
    // The accessories carry stat bonuses too (effectiveStats already saw
    // those); the AUDIT defect was the AC term alone. So the honest assertion
    // is compositional: the Power delta must equal the stat delta PLUS the
    // standingAc delta — before this OTA it equalled the stat delta only,
    // because the gauge's private AC walk could not see a ring.
    const best = (p: PlayerCharacter): number => {
      const e = effectiveStats(p);
      return Math.max(e.strength, e.dexterity, e.intelligence);
    };
    const statDelta = best(jeweled) - best(bare);
    const acDelta = standingAc(jeweled) - standingAc(bare);
    expect(acDelta).toBe(3); // the three points of jewellery, again
    expect(playerPowerScore(jeweled) - playerPowerScore(bare)).toBe(statDelta + acDelta);
  });

  it('⚠ the inline walk is GONE from powerRating — the call is shared, not the idea', () => {
    const src = read('app/engine/powerRating.ts');
    expect(src).toContain('const ac = standingAc(player);');
    expect(src).not.toContain('resolveDisplayArmorByName');
    expect(src).not.toContain('for (const slot of ARMOR_SLOTS)');
  });

  it('and the trim still applies, because standingAc owns it', () => {
    const heavy = {
      ac: 40, hpMax: 24, inventory: [],
      stats: { strength: 9, dexterity: 13, intelligence: 6, wisdom: 6, charisma: 6 },
      equipped: {},
    } as unknown as PlayerCharacter;
    // standingAc trims past the knee; a gauge reading the untrimmed stack was
    // the exact OTA-955 bug, and it must not come back via this refactor.
    expect(playerPowerScore(heavy)).toBeLessThan(9 + 2 + 40 + 3);
  });
});

describe('OTA-1139 audit №2 — the enemy panel tells the boss truth in chip width', () => {
  it('a boss chip carries the +1d6 and the ×2', () => {
    // ⚠ OTA-1608 supersede — every card now carries the damage TYPE at the
    // end (the same inference the rolls use); the numeric claim is unchanged.
    expect(enemyDamageCompact({ damage: '1d8+3', boss: true })).toMatch(/^1d8\+3\+1d6 ×2 \w+$/);
  });

  it('an ordinary enemy chip is untouched', () => {
    expect(enemyDamageCompact({ damage: '2d6' })).toMatch(/^2d6 \w+$/);
    expect(enemyDamageCompact({ damage: '1d4+1', boss: false })).toMatch(/^1d4\+1 \w+$/);
  });

  it('missing notation falls back rather than printing undefined', () => {
    expect(enemyDamageCompact({})).toMatch(/^1d6 \w+$/);
  });

  it('⚠ both panel sites route through it — no raw e.damage remains', () => {
    const panel = read('app/components/EnemyPanel.tsx');
    expect((panel.match(/enemyDamageCompact\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(panel).not.toContain('Damage ${e.damage}');
    expect(panel).not.toContain('value={String(view.enemy.damage)}');
  });

  it('compact and long form agree on the arithmetic', () => {
    // Two displays of one fact must not drift from each other — that is the
    // whole 1156/1158/1159 family in one sentence.
    expect(enemyDamageDisplay({ damage: '1d8+3', boss: true })).toContain('1d8+3+1d6');
    expect(enemyDamageCompact({ damage: '1d8+3', boss: true })).toContain('1d8+3+1d6');
  });
});

describe('OTA-1139 audit №3 — the bank pre-synthesizes what will be SPOKEN', () => {
  it('⚠ the bank strips the arbiter frame before presynthesize', () => {
    const store = read('app/state/gameStore.ts') + '\n' + read('app/ai/narration.ts')
      + '\n' + read('app/state/slices/bootSlice.ts');
    const at = store.indexOf('void piper.presynthesize(');
    expect(at).toBeGreaterThan(0);
    expect(store).toContain('void piper.presynthesize(safStrip(text))');
    // And the raw-text call is gone.
    expect(store).not.toContain('void piper.presynthesize(text)');
  });

  it('the live path strips with the SAME function, so the keys can meet', () => {
    const ctrl = read('app/voice/TTSController.ts');
    expect(ctrl).toContain('const stripped = stripArbiterFrame(text);');
  });
});

describe('OTA-1139 audit №4 — an impossible prefill cannot move the ms/tok range', () => {
  beforeEach(() => { resetQwenTelemetry(); });

  it('⚠ THE REPRODUCTION: read 54112ms inside a 5353ms call is rejected', () => {
    recordQwenCall({
      job: 'investigate_lore', totalMs: 5353, waitMs: 0, outcome: 'ok',
      prefillMs: 54112, promptTokens: 128,
    } as never);
    const stats = qwenJobStats().find((j) => j.job === 'investigate_lore');
    // 54112/128 ≈ 423 ms/tok would have become the "worst" — a number the
    // parked caching investigation would then have taken as real.
    expect(stats?.worstMsPerPromptTok ?? 0).not.toBeGreaterThan(422);
  });

  it('a physically possible sample still lands', () => {
    recordQwenCall({
      job: 'investigate_lore', totalMs: 5353, waitMs: 0, outcome: 'ok',
      prefillMs: 2000, promptTokens: 128,
    } as never);
    const stats = qwenJobStats().find((j) => j.job === 'investigate_lore');
    expect(stats?.worstMsPerPromptTok).toBeCloseTo(2000 / 128, 1);
  });

  it('the guard names the device-log line that forced it', () => {
    const tel = read('app/ai/generation/qwenTelemetry.ts');
    expect(tel).toContain('read 54112ms');
    expect(tel).toContain('r.prefillMs <= r.totalMs');
  });
});
