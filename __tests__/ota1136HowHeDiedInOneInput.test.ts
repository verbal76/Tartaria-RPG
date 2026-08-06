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
// OTA-1136 — HOW HE DIED IN ONE INPUT, AND THE CARD THAT HID IT.
//
// The owner walked into Yuldra-Tul at 24/24 HP, typed `approach`, and was dead
// before he got a second input: *"how did I die so fast? all I hit was
// approach."*
//
//   Hierophant Mara-of-Yuldra closes — Frost Staff Strike ready,
//   1d8+3 damage on a hit. (range: close) ★ CORE GUARDIAN
//   …
//   d20 → 16 + ATK 5 = 21 vs your AC 19 — ✓ HIT
//   presses the second strike — bosses do not yield the tempo.
//   d20 → 15 + ATK 5 = 20 vs your AC 19 — ✓ HIT
//   deals 13 cold damage [armor −18%]. You have 11 HP remaining.
//   deals 11 cold damage [armor −18%]. You fall.
//
// ⚠ THE ARITHMETIC DOES NOT FIT THE CARD, AND THAT IS THE FINDING. `1d8+3` tops
// out at ELEVEN. It dealt 13 through 18% armour — about 16 raw. The card was
// not describing the attack the resolver runs:
//
//   · applyEnemyCounter adds +1d6 to EVERY connecting swing of a boss-flagged
//     enemy, on top of the declared notation; and
//   · a boss takes a SECOND swing after the first lands, so one player action —
//     including a plain move — eats two of them.
//
// Real envelope: 2 × (1d8+3 + 1d6) = 10 to 34, against a 24 HP bar. The card
// advertised 4 to 11. He did not misplay the fight; he priced it off the number
// he was shown, and that number was a third of the truth.
//
// ⚠ AND THE SAME CARD SAID "(range: close)" WHILE THE SPAWN SET 'mid'. Twelve
// lines above the log call, the Guardian spawn block writes `range: 'mid'`. So
// the player was told he was already in reach, typed `approach` to act on it,
// and spent his one action closing a gap the card had denied existed — into a
// boss that answers any action with two swings.
//
// ⚠ THIS IS THE OTA-1133 / OTA-1135 FAMILY, THIRD TIME. A surface disagreeing
// with the resolver: the sheet said AC 16 while the Arbiter said 10; the panel
// said AC 15 while combat defended at 18; the enemy card said 1d8+3 while the
// resolver rolled 1d8+3+1d6 twice. Nothing about the fight changes here — the
// card just stops understating it.
//
// ── The greeting, and the beat after the name ───────────────────────────────
//
// Owner: *"on the greeting remove the Good — it hits weird in the sentence, and
// there should be a slight delay after the name, like how we use a comma to
// pause a sentence."* Both halves are real.
//
// "Good —" read as the Arbiter APPROVING of the return rather than greeting it,
// and spoken aloud the dash landed as a stumble between the name and the
// thought. Gone.
//
// ⚠ THE PAUSE WAS A COIN FLIP, WHICH IS WHY IT SOUNDED WRONG SOME OF THE TIME.
// arb165 already inserts real silence at a sentence boundary — but only inside
// `joinBatch`, which only runs when the drain BUNDLED two or more chunks, which
// depends on whether the next chunk happened to be inferred yet. So the same
// sentence paused or did not according to how fast Kokoro was that second. The
// single-chunk path now pads the same beat when more of the SAME line is queued
// behind it, so the pause is a property of the punctuation rather than of
// timing. And 160 ms is under what a listener reads as a deliberate beat, so it
// is 280.

import { enemyDamageDisplay } from '../app/engine/combatRules';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

const STORE = read('app/state/gameStore.ts');
const VOICE = read('app/voice/PiperTTSManager.ts');
const RULES = read('app/engine/combatRules.ts');

describe('OTA-1136 — ⚠ the enemy card tells the truth about a boss', () => {
  it('⚠ THE REPRODUCTION: the Hierophant advertised a third of her damage', () => {
    // 1d8+3 maxes at 11. She dealt 13 THROUGH 18% armour.
    const shown = enemyDamageDisplay({ damage: '1d8+3', boss: true });
    expect(shown).toContain('1d8+3+1d6');
    expect(shown).toContain('twice per round');
  });

  it('an ordinary enemy reads exactly as before — this is a boss correction', () => {
    expect(enemyDamageDisplay({ damage: '1d6+1' })).toBe('1d6+1 damage on a hit');
    expect(enemyDamageDisplay({ damage: '2d4', boss: false })).toBe('2d4 damage on a hit');
  });

  it('a missing notation falls back rather than printing "undefined"', () => {
    expect(enemyDamageDisplay({})).toBe('1d6 damage on a hit');
    expect(enemyDamageDisplay({ damage: '   ' })).toBe('1d6 damage on a hit');
  });

  it('⚠ the +1d6 it advertises is the one the resolver actually rolls', () => {
    // If someone retunes or removes the boss bonus, this display becomes the
    // new lie. Pinned to the resolver line itself.
    expect(STORE).toContain('if (enemy.boss) {\n      rawDmg += rollDie(6);');
  });

  it('⚠ and "twice per round" is the second swing, not a figure of speech', () => {
    expect(STORE).toContain('bosses do not yield the tempo');
    expect(STORE).toContain('applyEnemyCounter(enemy, liveAfter, get, set, liveIdx, true);');
  });

  it('all three enemy cards route through the one helper', () => {
    // Three sites printed `${x.damage} damage on a hit` by hand. A fourth would
    // reintroduce the same understatement.
    expect(STORE).not.toContain('damage on a hit. (range: close)`);');
    expect((STORE.match(/enemyDamageDisplay\(/g) ?? []).length).toBe(3);
  });
});

describe('OTA-1136 — ⚠ the card no longer claims a range the spawn did not set', () => {
  it('the Core Guardian spawn sets mid, and the card now says mid', () => {
    const from = STORE.indexOf('const guardian = cg.spawnGuardianForCapital(player, capitalId);');
    const block = STORE.slice(from, from + 2500);
    expect(from).toBeGreaterThan(0);
    expect(block).toContain("range: 'mid',");
    expect(block).toContain('(range: mid) ★ CORE GUARDIAN');
    expect(block).not.toContain('(range: close) ★ CORE GUARDIAN');
  });
});

describe('OTA-1136 — ⚠ the greeting, and the beat after the name', () => {
  it('"Good —" is gone from the welcome-back pool', () => {
    const from = STORE.indexOf('const WELCOME_BACK_LINES = [');
    const pool = STORE.slice(from, STORE.indexOf('];', from));
    expect(from).toBeGreaterThan(0);
    // ⚠ THE LINES ONLY — the commentary above them QUOTES the removed phrase on
    // purpose, and a whole-slice assertion would fail on the explanation of the
    // fix rather than on the fix. Same trap ota1115 fell into with the pipes.
    const entries = pool.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('`'));
    expect(entries.length).toBe(5);
    for (const e of entries) expect(e).not.toContain('Good —');
    expect(entries.join('\n')).toContain('"Welcome back, {name}. The buried country is no place to walk alone."');
  });

  it('every line still names the player — that was arb164’s non-negotiable', () => {
    const from = STORE.indexOf('const WELCOME_BACK_LINES = [');
    const pool = STORE.slice(from, STORE.indexOf('];', from));
    const lines = pool.split('\n').filter((l) => l.includes('Welcome back'));
    expect(lines.length).toBe(5);
    for (const l of lines) expect(l).toContain('Welcome back, {name}');
  });

  it('⚠ the sentence pause is long enough to hear', () => {
    expect(VOICE).toContain('const SENTENCE_PAUSE_MS = 280;');
  });

  it('⚠ AND IT NO LONGER DEPENDS ON WHETHER THE BATCHER BUNDLED THE LINE', () => {
    // This is the half that made it sound inconsistent: joinBatch only runs on
    // a multi-chunk batch, so an identical sentence paused or did not according
    // to how fast Kokoro was that second.
    expect(VOICE).toContain('if (next.endsSentence && queue[0] && queue[0].lineId === next.lineId) {');
    expect(VOICE).toContain('padSilence(combined, KOKORO_SAMPLE_RATE, 0, SENTENCE_PAUSE_MS)');
  });

  it('the pad is only for MORE OF THE SAME LINE — a line end keeps its own tail', () => {
    // Padding the last chunk of a line would add the beat to the inter-LINE gap
    // the voice work has spent several OTAs tightening.
    const from = VOICE.indexOf('if (batch.length === 1) {');
    const block = VOICE.slice(from, from + 1200);
    expect(block).toContain('queue[0].lineId === next.lineId');
  });

  it('the pad cannot silence the voice if it throws', () => {
    const from = VOICE.indexOf('if (batch.length === 1) {');
    const block = VOICE.slice(from, from + 1200);
    expect(block).toContain('catch { /* unpadded */ }');
  });

  it('joinBatch still uses the same constant — one beat, not two', () => {
    expect(VOICE).toContain('Math.floor((sampleRate * SENTENCE_PAUSE_MS) / 1000)');
  });
});

describe('OTA-1136 — the file records the third instance of one pattern', () => {
  it('the helper carries the measured contradiction, not a summary of it', () => {
    expect(RULES).toContain('WHAT THE ENEMY CARD SHOULD HAVE BEEN SAYING ALL ALONG');
    expect(RULES).toContain('1d8+3` tops out at ELEVEN');
    expect(RULES).toContain('10 to 34');
  });

  it('and states plainly that the fight itself is unchanged', () => {
    expect(RULES).toContain('Nothing about the fight changes here');
  });
});
