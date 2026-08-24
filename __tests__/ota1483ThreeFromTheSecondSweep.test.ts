// OTA-1483 — THREE FROM THE 4.32.11 LOG, SECOND SWEEP.
//
// ⚠⚠ 1. ASK ANSWERED THE WRONG QUESTION. "aetheric abilities" came back with the
//    AETHERIC DAMAGE TYPE ("Invisible, concussive force…"), not the abilities
//    answer. Two defects stacked: `findConcept` sorted CONCEPTS by their longest
//    keyword and then returned on ANY keyword hit — so a concept could win the
//    race on a 20-char keyword and match on its 8-char one; the comment above
//    the sort ("so 'burn damage' matches before 'burn'") claimed a property the
//    code did not have. And the abilities concept had no "abilities" keyword at
//    all. Fixed: the longest MATCHED keyword wins, and the data gains the
//    phrasings a player actually types.
//
// ⚠⚠ 2. A GUARDIAN "SPAWNED WITH NO LOGGED PLAYER ACTION" — true, as far as the
//    feed could show. ★ SUMMON is a BUTTON: nothing passes submitPlayerAction,
//    no "> …" line lands, and the next feed entry was the Guardian card, from
//    nowhere. Same rule as OTA-1273's GIVE fix: the player's act is logged
//    before the thing it causes.
//
// ⚠⚠ 3. THE INVESTIGATE CHIP STAYED LIT THROUGH ITS OWN SWEEP. The paced
//    INVESTIGATE ALL (OTA-1263) is live for ~2.2s per noun, and the chip kept
//    its green "ready" glow the whole time — a lit invitation to tap the very
//    control whose stream was mid-sentence. The chip now reads "investigating…"
//    unlit until the sweep exits by ANY door (finished / combat / player acted),
//    through ONE exit function so no abort path can forget to unlight it.

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

import { useGameStore, findConcept } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { isCoreGuardian } from '../app/engine/coreGuardians';
import { canonicalCellOf, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../app/engine/worldMap';
import conceptsData from '../app/data/lore/concepts.json';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CONCEPTS = (conceptsData as { concepts: Array<{ id?: string; keywords: string[] }> }).concepts;

// ═══ 1 — ASK answers the question that was asked ═══════════════════════════

describe('findConcept — the longest MATCHED keyword wins', () => {
  it("⚠⚠ THE OWNER'S CASE — 'aetheric abilities' answers abilities, not damage", () => {
    const hit = findConcept('aetheric abilities');
    expect(hit).not.toBeNull();
    expect((hit as { id?: string }).id).toBe('aetheric_related_actions');
    // …and the damage-type question still gets the damage-type answer.
    expect((findConcept('aetheric damage') as { id?: string }).id).toBe('aetheric');
    expect((findConcept('what is aetheric') as { id?: string }).id).toBe('aetheric');
  });

  it('⚠ the phrasings a player types all land on the abilities concept', () => {
    for (const q of ['aether abilities', 'aetheric powers', 'aether powers', 'aether magic', 'aetheric actions']) {
      expect((findConcept(q) as { id?: string })?.id).toBe('aetheric_related_actions');
    }
  });

  it("⚠⚠ the comment's own example is finally true — 'burn damage' beats 'burn'", () => {
    // The old code CLAIMED this property in a comment and did not have it in
    // general; it held only when the sort happened to cooperate. Now it is the
    // rule: the longest matched keyword wins, whatever concept owns it.
    const specific = findConcept('aetheric healing');
    expect((specific as { id?: string })?.id).toBe('aetheric_healing');
    const lich = findConcept('tell me about the aetheric lich');
    expect((lich as { id?: string })?.id).toBe('aetheric_lich');
    const behemoth = findConcept('what is the aetheric behemoth');
    expect((behemoth as { id?: string })?.id).toBe('aetheric_behemoth');
  });

  it("⚠⚠ EVERY concept's own longest keyword resolves to that concept — the whole corpus", () => {
    // The property, swept across all 178 rather than sampled. A concept whose
    // own most-specific keyword resolves elsewhere is unreachable by its best
    // question — exactly the abilities defect, anywhere it might still live.
    let checked = 0;
    const collisions: string[] = [];
    for (const c of CONCEPTS) {
      const longest = [...c.keywords].sort((a, b) => b.length - a.length)[0];
      if (!longest) continue;
      const hit = findConcept(longest) as { id?: string } | null;
      checked++;
      if (hit?.id !== c.id) {
        // A tie (two concepts sharing an identical longest keyword) resolves by
        // catalogue order — record it rather than fail, but ONLY for true ties.
        const other = CONCEPTS.find((o) => o.id === hit?.id);
        const tie = other?.keywords.some((k) => k.length >= longest.length && longest.includes(k.toLowerCase()));
        if (!tie) collisions.push(`${c.id} ("${longest}") → ${hit?.id}`);
      }
    }
    expect(checked).toBeGreaterThan(150);
    expect(collisions).toEqual([]);
  });

  it('nonsense and empties return null rather than a confident wrong answer', () => {
    expect(findConcept('definitely not a concept anyone wrote')).toBeNull();
    expect(findConcept('')).toBeNull();
    expect(findConcept(undefined)).toBeNull();
    expect(findConcept('   ')).toBeNull();
  });
});

// ═══ 2 — the summon logs the hand that caused it ═══════════════════════════

describe('★ SUMMON logs the player act before the Guardian card', () => {
  it('⚠⚠ the feed shows who started it, then what answered', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Caller', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id,
    } as never);
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const cell = canonicalCellOf('voronov');
    store.setState((s) => ({
      currentScreen: 'exploration',
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [] },
      player: {
        ...s.player!,
        currentLocationId: 'voronov',
        travelTarget: undefined, hubRoomId: null,
        gridX: cell.x, gridY: cell.y,
        mapX: WORLD_MAP_CENTER_X, mapY: WORLD_MAP_CENTER_Y,
        hoursElapsed: 100,
        mainQuest: { phase: 'cores' as const, coresRecovered: [], guardiansDefeated: [], lastCoreAtHours: 40 },
      },
    }));
    // ⚠ Read the feed the way the PLAYER does — as one text in order. HANDOFF #4
    // groups a world line into the previous world ENTRY when they land within
    // 500ms (mutating the earlier entry), so slicing by entry index can lose a
    // merged line that is perfectly visible on screen. A first draft did, and
    // failed on the merge, not the feature.
    const before = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(before).not.toContain('call its Guardian up');
    const res = store.getState().summonCoreGuardian();
    expect(res.ok).toBe(true);

    const feed = store.getState().gameLog.map((e) => e.text).join('\n');
    const actAt = feed.indexOf('call its Guardian up');
    const cardAt = feed.indexOf('★ CORE GUARDIAN');
    expect(actAt).toBeGreaterThan(-1);   // the player's act is in the feed
    expect(cardAt).toBeGreaterThan(-1);  // and so is the Guardian
    expect(actAt).toBeLessThan(cardAt);  // in cause-then-effect order
    expect((store.getState().currentScene?.enemies ?? []).filter((e) => isCoreGuardian(e)).length).toBe(1);
  });

  it('⚠ a refusal does NOT log the act line — nothing answered, nothing was called', async () => {
    // The act line narrates a summons that HAPPENS. Logging it before a refusal
    // would be the game narrating an action it then refuses — OTA-1301's class.
    const store = useGameStore;
    const cell = canonicalCellOf('voronov');
    store.setState((s) => ({
      player: {
        ...s.player!,
        gridX: cell.x + 3, mapX: WORLD_MAP_CENTER_X + 3, // off the anchor
      },
    }));
    const mark = store.getState().gameLog.length;
    const res = store.getState().summonCoreGuardian();
    expect(res.ok).toBe(false);
    const after = store.getState().gameLog.slice(mark).map((e) => e.text).join('\n');
    expect(after).not.toContain('call its Guardian up');
  });
});

// ═══ 3 — the chip knows the sweep is running ═══════════════════════════════

describe('the INVESTIGATE chip during the paced sweep', () => {
  const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));
  const INPUT = codeOnly(read('app', 'components', 'InputBox.tsx'));

  it('self-test — real sources, comments stripped', () => {
    expect(EXPL.length).toBeGreaterThan(10_000);
    expect(INPUT.length).toBeGreaterThan(10_000);
  });

  it('⚠⚠ every sweep exit goes through ONE door, and that door unlights the chip', () => {
    // The sweep has three ways to end: finished, combat abort, player acted.
    // A flag cleared on two of three is a lit button lying in the other
    // direction. Count the exits: every `return` inside step() must be
    // preceded by the single endSweep() call.
    const at = EXPL.indexOf('const endSweep = ');
    expect(at).toBeGreaterThan(-1);
    const fn = EXPL.slice(at, EXPL.indexOf('step();', at));
    // Three guarded exits + the natural end, all through endSweep…
    expect((fn.match(/endSweep\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // …and NO bare `return;` inside step() that bypasses the door. Every return
    // in the sweep body must have endSweep() on the same line before it.
    for (const line of fn.split('\n')) {
      if (/\breturn;/.test(line)) expect(line).toContain('endSweep()');
    }
    // …and the sweep marks itself running before the first step.
    const before = EXPL.slice(0, at);
    expect(before.lastIndexOf('setInvestigateSweepRunning(true)')).toBeGreaterThan(-1);
  });

  it('⚠ the chip drops its glow and says what it is doing', () => {
    expect(INPUT).toContain('investigateSweeping');
    expect(INPUT).toMatch(/investigateSweeping\s*\?\s*'investigating…'\s*:\s*'investigate'/);
    // The tone gate short-circuits BEFORE the count — a sweep with chips left
    // to do is precisely when the old code glowed.
    expect(INPUT).toMatch(/investigateSweeping\s*\?\s*undefined/);
  });

  it('⚠ the chip stays PRESSABLE — a dead control teaches nothing (OTA-220)', () => {
    // Unlighting is a signal, not a lock: opening the picker mid-sweep is
    // harmless, and the sweep already stops itself if the player ACTS.
    expect(INPUT).not.toMatch(/disabled=\{[^}]*investigateSweeping/);
  });
});
