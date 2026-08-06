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
// OTA-1160 — THE WEAKNESS HAS TO BE WORTH BRINGING.
//
// The owner threw a Searing Paste at a Guardian carrying `vulnerable:burn` — her
// authored weakness, hit with a crafted consumable he had to spend — and the
// device log priced the whole exchange in two lines:
//
//   You hurl the Searing Paste … 9 burn (2/turn × 3, vulnerable). (16 HP left)
//   Hierophant Mara-of-Yuldra deals 4 cold damage. You fall.
//
// ⚠ THE SYSTEM WORKED, AND THAT IS THE PROBLEM. Base 6, ×1.5 for the
// vulnerability, 9 dealt. Every part of that is correct. Correctly identifying a
// boss's weakness and spending a consumable on it bought THREE POINTS of extra
// damage, in a round where she hit for 23. His words: *"the coatings I threw on
// it were its weaknesses but it took no damage."* It took damage. It did not
// take NOTICE.
//
// ⚠ AND THE FIX IS NOT A BIGGER MULTIPLIER. Raising ×1.5 to ×2 turns his 9 into
// 12 — still noise against 23 a round — and inflates every ordinary weakness hit
// in the game to fix the one that mattered. The problem was never the damage
// number. It was that THE RIGHT ANSWER CHANGED NOTHING ABOUT WHAT HAPPENED NEXT.
//
// So a weakness hit STAGGERS, and a staggered boss forfeits the second swing
// OTA-1159 measured at half its round output. In the owner's own round that is
// 13 damage he does not take — larger than the 9 the vial dealt, and it arrives
// as a thing he can watch work rather than a multiplier he has to compute.
//
// ⚠ DELIBERATELY NOT A LOCK, and the tests below are mostly about that:
//   · ONE round, and it is consumed by the swing it prevents — never by a tick,
//     so it cannot silently persist into a later round;
//   · it never touches the FIRST swing, so a boss always answers;
//   · a killing blow does not stagger a corpse.
// A player who keeps hitting the weakness trades a half-damage round for the
// cost of carrying the right tool. That trade is the whole OTA.
//
// ⚠ THE THROWN PATH IS THE ONE HE ACTUALLY HIT and it is tested first, because
// the weapon path already FELT good — the same log has the Cudgel opening an
// Aetheric Drone for 27 on `bludgeoning ×1.5`, with the Arbiter coaching the
// swap. Weapons were never the complaint; consumables were.

import { combineDamageTypeMatch, traitDamageMultiplier } from '../app/engine/enemyTraits';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

const STORE = read('app/state/gameStore.ts');
const GUARDIANS = read('app/engine/coreGuardians.ts');

describe('OTA-1160 — ⚠ the reproduction: Mara really is burn-weak', () => {
  it('the Guardian the owner fought carries the trait he exploited', () => {
    const from = GUARDIANS.indexOf('const MARA_HIEROPHANT');
    const def = GUARDIANS.slice(from, from + 900);
    expect(from).toBeGreaterThan(0);
    expect(def).toContain("'vulnerable:burn'");
    expect(def).toContain("'resist:cold'");
  });

  it('⚠ and it was worth exactly three points before this OTA', () => {
    // 2/turn × 3 turns = 6 base. The trait multiplies it to 9. That is the whole
    // reward for bringing the right consumable to a boss doing 23 a round.
    const traitMod = traitDamageMultiplier(['giant_vigil', 'vulnerable:burn', 'resist:cold'], 'burn');
    expect(traitMod.multiplier).toBe(1.5);
    expect(Math.round(6 * traitMod.multiplier)).toBe(9);
    expect(Math.round(6 * traitMod.multiplier) - 6).toBe(3);
  });

  it('⚠ the multiplier is UNCHANGED — this OTA buys a tempo, not a number', () => {
    // If a later edit "fixes" this by inflating the multiplier instead, every
    // ordinary weakness hit in the game moves with it. That is the thing this
    // OTA deliberately did not do.
    expect(traitDamageMultiplier(['vulnerable:burn'], 'burn').multiplier).toBe(1.5);
    expect(traitDamageMultiplier(['resist:cold'], 'cold').multiplier).toBe(0.5);
  });

  it('an authored vulnerable: trait folds into "weak" — one check, not two', () => {
    // The store tests `combineDamageTypeMatch(...).match === 'weak'` once.
    // Testing for 'vulnerable' alongside it would be dead code: this function
    // never returns that string.
    const combined = combineDamageTypeMatch('normal', 'vulnerable');
    expect(combined.match).toBe('weak');
    expect(combined.multiplier).toBe(1.5);
  });
});

describe('OTA-1160 — ⚠ a thrown vial on a weakness staggers', () => {
  it('the throw path staggers, and says so', () => {
    const from = STORE.indexOf('You hurl the ${item.name}. It bursts across');
    const block = STORE.slice(from, from + 1600);
    expect(from).toBeGreaterThan(0);
    expect(block).toContain("burstCombined.match === 'weak'");
    expect(block).toContain('staggerEnemy(set, idx);');
    expect(block).toContain('staggered, and slow to recover');
  });

  it('⚠ a KILLING throw does not stagger a corpse', () => {
    const from = STORE.indexOf('You hurl the ${item.name}. It bursts across');
    const block = STORE.slice(from, from + 1600);
    expect(block).toContain("if (newHp > 0 && burstCombined.match === 'weak')");
  });

  it('a resisted or ordinary throw staggers nothing', () => {
    // Only the 'weak' branch reaches staggerEnemy — there is no second call site
    // in the throw block that could fire on a resist.
    const from = STORE.indexOf('You hurl the ${item.name}. It bursts across');
    const block = STORE.slice(from, from + 1600);
    expect((block.match(/staggerEnemy\(/g) ?? []).length).toBe(1);
  });
});

describe('OTA-1160 — ⚠ a weapon hit on a weakness staggers too', () => {
  it('the flinch is mechanical now, not just a word', () => {
    expect(STORE).toContain('Weakness exposed — ${enemy.name} flinches.');
    const from = STORE.indexOf('Weakness exposed — ${enemy.name} flinches.');
    const block = STORE.slice(from, from + 800);
    // RETARGETED BY OTA-1163 — the melee stagger is now gated on surviving the
    // blow, closing the corpse-stagger seam the pressure test found.
    expect(block).toContain('if (newEnemyHp > 0) staggerEnemy(set, activeIdx);');
  });

  it('⚠ a RESISTED hit does not — the branch is the weakness branch', () => {
    const from = STORE.indexOf('Weakness exposed — ${enemy.name} flinches.');
    const block = STORE.slice(from, from + 800);
    // The resist branch begins right after; nothing between it and the stagger.
    const resistAt = block.indexOf('shrugs off the');
    const staggerAt = block.indexOf('staggerEnemy(set, activeIdx);');
    expect(staggerAt).toBeGreaterThan(0);
    expect(resistAt).toBeGreaterThan(staggerAt);
  });
});

describe('OTA-1160 — ⚠ what the stagger actually costs the boss', () => {
  it('a staggered boss forfeits the SECOND swing', () => {
    const from = STORE.indexOf('bosses do not yield the tempo');
    const block = STORE.slice(from - 1400, from + 400);
    expect(from).toBeGreaterThan(0);
    expect(block).toContain('if (takeStagger(get, set, liveIdx)) {');
    expect(block).toContain('STAGGERED: no second swing this round.');
  });

  it('⚠ THE FIRST SWING ALWAYS LANDS — hitting a weakness never makes a boss harmless', () => {
    // The check sits inside the `if (enemy.boss)` second-strike block, AFTER the
    // ordinary counter has already resolved. Moving it to the top of the volley
    // would turn a stagger into a skipped round.
    const bossAt = STORE.indexOf('if (enemy.boss) {\n      const liveAfter = get().player;');
    const staggerAt = STORE.indexOf('if (takeStagger(get, set, liveIdx)) {');
    const counterAt = STORE.indexOf('applyEnemyCounter(enemy, livePlayer ?? fallbackPlayer, get, set, liveIdx);');
    expect(counterAt).toBeGreaterThan(0);
    expect(bossAt).toBeGreaterThan(counterAt);
    expect(staggerAt).toBeGreaterThan(bossAt);
  });

  it('⚠ it is CONSUMED by the swing it prevents, never left to a tick', () => {
    // takeStagger reads and clears in one step. A stagger that expired on a
    // round tick instead could persist through an action that never triggered a
    // second swing, and quietly eat the NEXT round's too.
    const from = STORE.indexOf('function takeStagger(');
    const fn = STORE.slice(from, from + 700);
    expect(from).toBeGreaterThan(0);
    expect(fn).toContain('if (cur <= 0) return false;');
    expect(fn).toContain('next[idx] = 0;');
    expect(fn).toContain('return true;');
  });

  it('the setter is bounds-safe and lazily creates the array', () => {
    const from = STORE.indexOf('function staggerEnemy(');
    const fn = STORE.slice(from, from + 800);
    expect(fn).toContain('if (idx < 0 || idx >= n) return s;');
    expect(fn).toContain('s.currentScene.enemyStaggered ?? s.currentScene.enemies.map(() => 0)');
    expect(fn).toContain('while (next.length < n) next.push(0);');
  });

  it('the state lives on the scene, so a new fight starts clean', () => {
    // Parallel to enemyArmorShred / enemyCorruptionStacks — beginScene replaces
    // currentScene wholesale, so nothing carries a stagger between encounters.
    expect(STORE).toContain('enemyStaggered?: number[];');
    const from = STORE.indexOf('enemyStaggered?: number[];');
    const doc = STORE.slice(from - 700, from);
    expect(doc).toContain('parallel to `enemies`');
  });
});

describe('OTA-1160 — the file records why the multiplier was left alone', () => {
  it('names the measured reward and the reason it was not enough', () => {
    expect(STORE).toContain('THE WEAKNESS HAS TO BE WORTH BRINGING');
    expect(STORE).toContain('It did take damage. It did not take NOTICE.');
  });

  it('and states the rejected fix explicitly', () => {
    expect(STORE).toContain('THE FIX IS NOT A BIGGER MULTIPLIER');
    expect(STORE).toContain('RIGHT\n *  ANSWER CHANGED NOTHING ABOUT WHAT HAPPENED NEXT');
  });

  it('and the bound that keeps it from becoming a stun-lock', () => {
    expect(STORE).toContain('DELIBERATELY NOT A LOCK');
  });
});
