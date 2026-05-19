// Literary and Atmosphere Audit.
//
// Evaluates the world-channel narrative output for:
//   1. Verbosity & pacing (Token Diet)
//   2. Repetition / freshness on biome re-entry (Groundhog Day)
//   3. Dynamic world-building under state changes (Sensory Shift)
//   4. Lexical diversity over a long run (Trope Tracker)
//
// CAVEAT: Qwen is mocked in Jest (llama.rn stubbed to return ''),
// so this test reads TEMPLATED narration only (static strings,
// rotatingPick pools, scene-description templates). It does not
// exercise the live LLM. The same audit logic will work on-device
// when Qwen is producing real text — only the data source changes.

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

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

// Common English function-words / stopwords to exclude from the
// adjective + verb frequency analysis.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'so', 'as', 'then', 'now', 'too',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'into', 'onto', 'over', 'under', 'through', 'between',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did',
  'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our',
  'you', 'your', 'i', 'me', 'my',
  'he', 'she', 'his', 'her', 'him',
  'no', 'not', 'yes',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'one', 'two', 'three', 'few', 'many', 'some', 'any', 'all', 'most',
  'just', 'only', 'even', 'also', 'still', 'here', 'there',
  'when', 'where', 'why', 'how', 'what', 'who', 'which',
  'about', 'above', 'after', 'before', 'against', 'around', 'because',
  'each', 'other', 'than', 'while', 'up', 'down', 'out', 'off', 'back',
  'if', 'else', 'every', 'much', 'more', 'less',
]);

// Tokenize text into lower-case alphabetic words.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Set-based Jaccard similarity over tokenized words.
function jaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  let intersect = 0;
  for (const w of sa) if (sb.has(w)) intersect++;
  const union = sa.size + sb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

// Heuristic adjective + verb extraction. Pure NLP would need a POS
// tagger; we approximate with common suffix patterns + a small
// allowlist. Good enough to surface templating burnout — the words
// flagged here are the ones the templates lean on heaviest.
function looksLikeAdjective(w: string): boolean {
  if (w.length < 4) return false;
  return /(?:ous|ful|less|ish|ive|ant|ent|ary|ile|al)$/.test(w);
}
function looksLikeVerb(w: string): boolean {
  if (w.length < 3) return false;
  // Crude — captures most -ing / -ed forms + a small set of common
  // base verbs. False positives ('ring', 'string') are filtered by
  // the stopword pass.
  return /(?:ing|ed|s)$/.test(w);
}

describe('Literary and Atmosphere Audit', () => {
  jest.setTimeout(120000);

  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
  });

  it('audits verbosity, repetition, dynamic shift, and lexical diversity', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    await store.getState().startNewGame({ name: 'Critic', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const drainRolls = () => {
      let safety = 0;
      while (store.getState().pendingRolls && safety < 50) {
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep];
        if (!step) { try { store.getState().cancelPendingRolls(); } catch { /* ignore */ } break; }
        const values: number[] = [];
        const count = step.count ?? 1;
        const sides = step.sides ?? 6;
        for (let i = 0; i < count; i++) values.push(1 + Math.floor(Math.random() * sides));
        try { store.getState().resolveRollStep(values); } catch { break; }
        safety++;
      }
    };
    const submit = (text: string) => {
      try { store.getState().submitPlayerAction(text); } catch { /* swallow */ }
      drainRolls();
    };
    const restUntil = (s: number) => {
      for (let i = 0; i < 6; i++) {
        const st = store.getState().player?.stamina ?? 0;
        if (st >= s) return;
        submit('rest');
      }
    };

    submit('leave outpost');
    restUntil(4);

    // ─── 1. TOKEN DIET — 500 standard turns ────────────────────
    const worldLines: { text: string; locId: string; hp: number; hourOfDay: number }[] = [];
    const dirs = ['north', 'east', 'south', 'west'];
    let dirIdx = 0;

    const captureNewWorldLines = (beforeLen: number) => {
      const newLogs = store.getState().gameLog.slice(beforeLen);
      const p = store.getState().player;
      const locId = p?.currentLocationId ?? '?';
      const hp = p?.hp ?? 0;
      const hours = p?.hoursElapsed ?? 0;
      const hourOfDay = Math.floor(hours % 24);
      for (const l of newLogs) {
        if (l.channel !== 'world') continue;
        // Skip the player-text echo + parser debug noise.
        if (!l.text || l.text.length < 5) continue;
        worldLines.push({ text: l.text, locId, hp, hourOfDay });
      }
    };

    for (let turn = 0; turn < 500; turn++) {
      const before = store.getState().gameLog.length;
      const choice = turn % 5;
      if (choice === 0) {
        restUntil(2);
        submit('look');
      } else if (choice === 1) {
        restUntil(4);
        submit(`go ${dirs[dirIdx % dirs.length]!}`); dirIdx++;
      } else if (choice === 2) {
        submit('rest');
      } else if (choice === 3) {
        restUntil(2);
        submit('search the ground');
      } else {
        restUntil(4);
        submit(`go ${dirs[dirIdx % dirs.length]!}`); dirIdx++;
      }
      captureNewWorldLines(before);
      // Bail early if dead / no player.
      if (!store.getState().player || store.getState().player?.dead) {
        // Try a self-resurrect; ok to abort if no gems.
        const slotId = store.getState().activeSlotId;
        if (slotId && store.getState().resurrectionGems > 0) {
          await store.getState().resurrectSlot(slotId);
          await store.getState().loadSlotIntoGame(slotId);
        } else {
          break;
        }
      }
    }

    const wordCounts = worldLines.map((l) => l.text.split(/\s+/).filter(Boolean).length);
    const longest = [...worldLines].sort((a, b) => b.text.split(/\s+/).length - a.text.split(/\s+/).length).slice(0, 5);
    const overLimit = worldLines.filter((l) => l.text.split(/\s+/).filter(Boolean).length > 75);
    const avgWords = wordCounts.length > 0 ? wordCounts.reduce((s, n) => s + n, 0) / wordCounts.length : 0;

    // ─── 2. GROUNDHOG DAY — re-enter the same tile 15 times ───
    // Stand on a tile; step out one direction; step back. Capture
    // the first world-channel line after each return. Jaccard
    // similarity > 0.8 between any pair flags stagnation.
    restUntil(8);
    const groundhogLines: string[] = [];
    for (let i = 0; i < 15; i++) {
      // Make sure we have stamina for a round-trip.
      restUntil(6);
      const before = store.getState().gameLog.length;
      submit('go north');
      submit('go south');
      // Capture world lines from this round-trip — focus on
      // re-entry narration. The first world line after the second
      // submit is what we want.
      const after = store.getState().gameLog.slice(before).filter((l) => l.channel === 'world');
      const reentryLine = after.find((l) => /On the ground|Still open|Your boots find|You walk south|You push south|You head south/i.test(l.text));
      if (reentryLine) groundhogLines.push(reentryLine.text);
    }
    // Pairwise similarity.
    const pairFlags: Array<{ i: number; j: number; sim: number }> = [];
    let avgSim = 0;
    let pairCount = 0;
    for (let i = 0; i < groundhogLines.length; i++) {
      for (let j = i + 1; j < groundhogLines.length; j++) {
        const s = jaccard(groundhogLines[i]!, groundhogLines[j]!);
        avgSim += s; pairCount++;
        if (s > 0.8) pairFlags.push({ i, j, sim: s });
      }
    }
    avgSim = pairCount > 0 ? avgSim / pairCount : 0;

    // ─── 3. SENSORY SHIFT — same scene under state changes ────
    // Baseline look. Then manually mutate player state (HP → 1,
    // clock → +12 hours simulating day→night) and look again.
    // The narration should ideally vary with the player's state;
    // if templates are static, they won't.
    restUntil(8);
    let baselineBefore = store.getState().gameLog.length;
    submit('look');
    const baselineLines = store.getState().gameLog.slice(baselineBefore)
      .filter((l) => l.channel === 'world')
      .map((l) => l.text)
      .join(' ');

    // Mutate state.
    const beforePlayer = store.getState().player!;
    store.setState({
      player: {
        ...beforePlayer,
        hp: 1,
        hoursElapsed: (beforePlayer.hoursElapsed ?? 0) + 12,
      },
    });
    const stressedBefore = store.getState().gameLog.length;
    submit('look');
    const stressedLines = store.getState().gameLog.slice(stressedBefore)
      .filter((l) => l.channel === 'world')
      .map((l) => l.text)
      .join(' ');

    const sensorySim = jaccard(baselineLines, stressedLines);
    // Heuristic: if the two look-narrations are nearly identical
    // (sim > 0.85), the template did not vary with the dynamic
    // state. Flag it.
    const sensoryStagnation = sensorySim > 0.85;

    // ─── 4. TROPE TRACKER — frequency over all world lines ────
    const allText = worldLines.map((l) => l.text).join(' ');
    const tokens = tokenize(allText);
    const totalTokens = tokens.length;
    const uniqueTokens = new Set(tokens).size;
    const lexicalDensity = totalTokens > 0 ? uniqueTokens / totalTokens : 0;
    const adjCounts: Record<string, number> = {};
    const verbCounts: Record<string, number> = {};
    for (const t of tokens) {
      if (looksLikeAdjective(t)) adjCounts[t] = (adjCounts[t] ?? 0) + 1;
      else if (looksLikeVerb(t)) verbCounts[t] = (verbCounts[t] ?? 0) + 1;
    }
    const topAdj = Object.entries(adjCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const topVerb = Object.entries(verbCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    // Burnout flag — any single adj/verb that appears > 5% of all
    // tokens is leaning on a crutch.
    const burnoutThreshold = Math.max(20, Math.floor(totalTokens * 0.05));
    const burntAdjectives = topAdj.filter(([_, n]) => n >= burnoutThreshold);
    const burntVerbs = topVerb.filter(([_, n]) => n >= burnoutThreshold);

    console.log = _origLog;
    const report = `
============ LITERARY & ATMOSPHERE AUDIT ============
Caveat: Qwen is mocked in Jest. This audit reads TEMPLATED
narration only (rotatingPick + hand-authored strings). Run the
same harness on-device with live Qwen to measure LLM output.

─── 1. TOKEN DIET (verbosity) ───────────────────────
World lines captured:       ${worldLines.length}
Average words per line:     ${avgWords.toFixed(1)}
Lines over 75 words:        ${overLimit.length} (${worldLines.length > 0 ? Math.round(overLimit.length / worldLines.length * 100) : 0}%)
Top 5 longest:
${longest.map((l, i) => `  ${i + 1}. (${l.text.split(/\s+/).length}w) "${l.text.slice(0, 110).replace(/\n/g, ' ')}…"`).join('\n')}

─── 2. GROUNDHOG DAY (repetition) ───────────────────
Same-tile re-entries:       ${groundhogLines.length}
Pairwise pairs compared:    ${pairCount}
Mean pairwise Jaccard:      ${(avgSim * 100).toFixed(1)}%
Pairs over 80% similarity:  ${pairFlags.length}  ${pairFlags.length > 0 ? '⚠ ATMOSPHERIC STAGNATION' : '✓'}
First 3 stagnation pairs:
${pairFlags.slice(0, 3).map((p) => `  visit ${p.i}↔${p.j}: ${(p.sim * 100).toFixed(0)}% — "${groundhogLines[p.i]?.slice(0, 70)}…" vs "${groundhogLines[p.j]?.slice(0, 70)}…"`).join('\n') || '  (none)'}

─── 3. SENSORY SHIFT (dynamic awareness) ────────────
Baseline (full HP, day):    "${baselineLines.slice(0, 110).replace(/\n/g, ' ')}…"
Stressed (1 HP, +12h):      "${stressedLines.slice(0, 110).replace(/\n/g, ' ')}…"
Similarity:                 ${(sensorySim * 100).toFixed(1)}%
${sensoryStagnation ? '⚠ NO DYNAMIC SHIFT — state changes did not vary the template' : '✓ Template responded to state change'}

─── 4. TROPE TRACKER (lexical diversity) ────────────
Total tokens:               ${totalTokens}
Unique tokens:              ${uniqueTokens}
Lexical density:            ${(lexicalDensity * 100).toFixed(1)}%
Burnout threshold (5%):     ${burntAdjectives.length + burntVerbs.length} word(s) over threshold

Top 20 adjective-like words:
${topAdj.map(([w, n]) => `  ${w.padEnd(18)} ${n}`).join('\n') || '  (none)'}

Top 20 verb-like words:
${topVerb.map(([w, n]) => `  ${w.padEnd(18)} ${n}`).join('\n') || '  (none)'}

Burnout list (≥${burntAdjectives.length + burntVerbs.length > 0 ? burnoutThreshold : '5%'} of all tokens):
${[...burntAdjectives, ...burntVerbs].map(([w, n]) => `  ⚠ ${w} (${n})`).join('\n') || '  (none — vocabulary is healthy)'}
=====================================================
`.trim();

    console.log(report);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      fs.writeFileSync('/tmp/tartaria-literary-audit-report.txt', report);
    } catch { /* ignore */ }

    expect(worldLines.length).toBeGreaterThan(0);
  });
});
