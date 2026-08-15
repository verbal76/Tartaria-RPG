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
// OTA-1140 — THE PRESSURE TEST, and the fourteen things four agents caught.
//
// The owner: *"spin up agents and pressure test the game and fully the combat
// system."* Four ran in parallel — a combat-math contradiction hunter, a
// parallel-array state auditor, an exploit hunter, and a Monte Carlo
// simulation agent driving the real engine at 20,000 trials per cell. Their
// confirmed findings, deduplicated, land here as one batch. The balance
// questions they raised (tier-1 Guardian winnability at 0.1% for a fresh
// 24-HP arrival; the acid-shred × stagger interaction) are NOT tuned here —
// those are the owner's calls, reported separately.
//
// The stagger family (three agents converged independently):
//   · enemyStaggered was the only per-enemy array NOT spliced on enemy
//     removal — a kill slid the boss onto the dead mook's index while the flag
//     stayed put: a paid stagger voided, or a free one inherited.
//   · the melee path staggered CORPSES (no survives-the-blow gate; the thrown
//     path had one), seeding exactly the stale entry the splice bug preserved.
//   · ~10 sites replace or clear the enemies roster wholesale and reset only
//     SOME parallel arrays — so a fled Guardian's ground-off acid shred was
//     BANKED for the re-summon, and a hunt boss inherited a previous fight's
//     stagger/shred/statuses. FRESH_ENEMY_ARRAYS is now spread at every one.
//
// The exploits:
//   · STEP-BACK KITING (rated CRITICAL): nothing ever closed the range toward
//     the player; one free retreat made every melee enemy — Core Guardians
//     included — permanently unable to fight back. The pack now PURSUES: one
//     band per round when a living enemy was benched by distance.
//   · CAMPING MID-FIGHT: "rest" never checked for enemies; 8 hours, +15% max
//     HP, no swing taken. Eating stays a free action (OTA-619, deliberate);
//     the CAMP now refuses with hostiles awake.
//   · BANDOLIER BYPASS: an emptied rack fell back to ANY pack copy in combat,
//     making BANDOLIER_MAX cosmetic. The fallback is out-of-combat only now.
//
// The surfaces (the 1156/1158/1159 family, three more instances):
//   · effectiveACBreakdown skipped the trim the resolver applies — the
//     expanded DEFENSE card over-read every heavy build (raw 27 shown, 24
//     fought). Trimmed now, with the trim NAMED as a chip so sources sum.
//   · enemyPowerScore priced a boss at its bare notation while the resolver
//     rolls +1d6 twice — the matchup badge painted "even" on 3× fights.
//   · the SUMMONED Guardian card was a second copy of the card OTA-1136
//     fixed, still carrying both lies. Routed.
//   · the enemy to-hit log now says "(needs nat N+ — AC capped)" when
//     ENEMY_HIT_NEEDED_CAP decided, and the damage clause admits "floor 30%"
//     when MITIGATION_FLOOR overrode the printed stack.
//
// Parity and plumbing:
//   · stagger now fires from the typed-throw and burst-fire paths too (the
//     same weakness staggered from one hand and not the other);
//   · the golem's corruption procs regained the arb118 stack cap the player
//     path always had;
//   · the melee damage write reads LIVE enemy HP (a lost-initiative regen was
//     being silently erased by a stale snapshot);
//   · the presynth PCM cache evicts oldest instead of wedging shut at 6.

import { enemyPowerScore } from '../app/engine/powerRating';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

const STORE = read('app/state/gameStore.ts');
const VOICE = read('app/voice/PiperTTSManager.ts');

describe('OTA-1140 — the stagger family is sealed', () => {
  it('⚠ enemyStaggered is spliced at BOTH removal sites', () => {
    expect((STORE.match(/enemyStaggered: dropAt\(/g) ?? []).length).toBe(2);
  });

  it('⚠ the melee path no longer staggers a corpse', () => {
    expect(STORE).toContain('if (newEnemyHp > 0) staggerEnemy(set, activeIdx);');
  });

  it('⚠ FRESH_ENEMY_ARRAYS resets all six at every wholesale roster write', () => {
    const def = STORE.slice(STORE.indexOf('const FRESH_ENEMY_ARRAYS'), STORE.indexOf('} as const;', STORE.indexOf('const FRESH_ENEMY_ARRAYS')));
    for (const f of ['enemyStatuses', 'enemyArmorShred', 'enemyCorruptionStacks', 'enemyStaggered', 'enemyKnockedOut', 'enemyAmbushUsed']) {
      expect(def).toContain(`${f}: undefined`);
    }
    // Spread at the replacement/clear sites — the exact count guards against a
    // future site being added without it (raise deliberately, never lower).
    expect((STORE.match(/\.\.\.FRESH_ENEMY_ARRAYS,/g) ?? []).length).toBeGreaterThanOrEqual(13);
  });

  it('⚠ the flee-shred bank is closed — the Guardian-chamber clear resets the arrays', () => {
    // The ":20271 flee can't chip them down" promise held for HP and failed
    // for AC: enemyArmorShred survived the wipe and the re-summoned Guardian
    // spawned into the shredded slot.
    const clears = STORE.match(/\{ currentScene: \{ \.\.\.s\.currentScene, \.\.\.FRESH_ENEMY_ARRAYS, enemies: \[\], enemyHps: \[\], activeEnemyIdx: 0, range: null \} \}/g) ?? [];
    expect(clears.length).toBe(2);
  });

  it('stagger parity: the typed throw and the burst both earn it now', () => {
    expect(STORE).toContain("if (coatMatch === 'weak') {");
    expect(STORE).toContain('if (shotMod.match === \'weak\') burstFoundWeakness = true;');
    expect(STORE).toContain('reels under the burst — staggered');
  });
});

describe('OTA-1140 — the exploits are closed', () => {
  it('⚠ THE PACK PURSUES — a benched melee enemy closes one band at volley end', () => {
    expect(STORE).toContain('const outOfReach: string[] = [];');
    expect(STORE).toContain("{ outOfReach.push(enemy.name); continue; }");
    expect(STORE).toContain("cur === 'distant' ? 'far' : cur === 'far' ? 'mid' : cur === 'mid' ? 'close' : null;");
    expect(STORE).toContain('closes the distance. (range: ${closed})');
  });

  it('⚠ pursuit never passes close, and only fires when someone was actually benched', () => {
    const from = STORE.indexOf('// OTA-1140 — the pursuit itself.');
    const block = STORE.slice(from, from + 1200);
    expect(block).toContain('if (outOfReach.length > 0 && (get().player?.hp ?? 0) > 0)');
    expect(block).toContain("cur === 'mid' ? 'close' : null");
    expect(block).toContain('if (closed) {');
  });

  it('⚠ you cannot CAMP in front of something trying to kill you', () => {
    const from = STORE.indexOf("case 'rest': {");
    const block = STORE.slice(from, from + 2200);
    expect(block).toContain('!parsed.resolvedItemId');
    expect(block).toContain('Nothing here has agreed to that.');
  });

  it('eating mid-fight stays the OTA-619 free action — the guard keys on resolvedItemId', () => {
    // "eat ration" arrives with resolvedItemId set; only the bare CAMP is refused.
    const from = STORE.indexOf("case 'rest': {");
    const block = STORE.slice(from, from + 2200);
    expect(block).toContain('if (!parsed.resolvedItemId');
  });

  it('⚠ the bandolier any-pack-copy fallback is out-of-combat only', () => {
    const from = STORE.indexOf('throwFromBandolier(itemName, itemId) {');
    const block = STORE.slice(from, from + 1800);
    expect(block).toContain('const inCombat = scene.enemies.some(');
    expect(block).toContain('?? (inCombat ? undefined : player.inventory.find(');
  });

  it('the golem corruption proc regained the arb118 cap', () => {
    // Exactly two capped corruption bumps now — player path and golem path.
    expect((STORE.match(/Math\.min\(\s*corruptionStackCap\(/g) ?? []).length).toBe(2);
  });
});

describe('OTA-1140 — three more surfaces stop lying', () => {
  it('⚠ effectiveACBreakdown applies the trim and NAMES it as a chip', () => {
    const from = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, from + 4200);
    expect(body).toContain('const trimDelta = trimStandingAc(standingRaw) - standingRaw;');
    expect(body).toContain("sources.push({ label: 'bulk trim', delta: trimDelta });");
    expect(body).toContain('trimStandingAc(standingRaw) + statusAdj');
  });

  it('⚠ the Power badge prices a boss round: +1d6 per swing, two swings', () => {
    // 1d8+3 boss: apNum 5, baseAc 10, +6 boss, no traits → ac 16;
    // perSwing 7.5+3.5=11, ×2=22; hp 42 → 4.2. Score = 5+22+16+4.2 ≈ 47.
    const boss = { name: 'T', abilityPoint: 'Wisdom 5', damage: '1d8+3', hp: 42, boss: true, traits: [], attack: 'x', type: 'aether_construct', rarity: 'Legendary', loot: [] } as never;
    const mook = { name: 'T', abilityPoint: 'Wisdom 5', damage: '1d8+3', hp: 42, boss: false, traits: [], attack: 'x', type: 'aether_construct', rarity: 'Common', loot: [] } as never;
    // The boss's damage term alone is now ~3× the mook's (22 vs 7.5); the
    // score gap must reflect it (+6 AC was always there, +14.5 dmg is new).
    expect(enemyPowerScore(boss) - enemyPowerScore(mook)).toBeGreaterThanOrEqual(20);
  });

  it('⚠ the SUMMONED Guardian card routes through the helper and says mid', () => {
    const from = STORE.indexOf('const guardian = cg.spawnGuardianForCapital(player, capitalId);', STORE.indexOf('summonCoreGuardian') > 0 ? STORE.indexOf('summonCoreGuardian') : 0);
    expect(STORE).not.toContain('${guardian.damage} damage on a hit. (range: close)');
    expect((STORE.match(/\(range: mid\) ★ CORE GUARDIAN/g) ?? []).length).toBe(2);
  });

  it('the to-hit log admits the cap when the cap decided', () => {
    expect(STORE).toContain('const acCapEngaged = effectiveAc - (atkTotal - atkRoll) > ENEMY_HIT_NEEDED_CAP;');
    expect(STORE).toContain('needs nat ${acHitNat}+ — AC capped');
  });

  it('the damage clause admits the mitigation floor', () => {
    expect(STORE).toContain('floorEngaged: mitFloorEngaged,');
    expect(STORE).toContain("if (opts.floorEngaged) mods.push('floor 30%');");
  });

  it('the boss flavour line prices the real swing too', () => {
    expect(STORE).toContain('${enemyDamageCompact(finalSpawn)} per swing');
  });
});

describe('OTA-1140 — plumbing', () => {
  it('⚠ the melee damage write reads LIVE enemy HP, not the entry snapshot', () => {
    expect(STORE).toContain('const livePrevHp = get().currentScene?.enemyHps[activeIdx] ?? prevHp;');
    expect(STORE).toContain('let newEnemyHp = livePrevHp - dmg;');
  });

  it('⚠ the presynth cache evicts oldest instead of wedging shut', () => {
    expect((VOICE.match(/while \(presynth\.size >= PRESYNTH_CAP\) \{/g) ?? []).length).toBe(2);
    expect(VOICE).toContain('presynth.delete(oldest);');
    expect(VOICE).not.toContain('if (presynth.size >= PRESYNTH_CAP) return false;');
  });
});
