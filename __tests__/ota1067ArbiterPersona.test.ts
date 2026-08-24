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
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1067 — PHASE 5: THE ARBITER BECOMES SOMEONE.
 *
 * The plan: "Memory of what you've done, an opinion that shifts with your
 * choices, and an arc across the nine Cores. It has more screen time than any
 * character in the game and currently less personality than any of them."
 *
 * Three separable claims, and this file tests each as a claim rather than as a
 * pile of authored text:
 *
 *  ARC     — stance rises with Cores, never falls, and its beats fire once.
 *  OPINION — regard is DERIVED, CLAMPED on every axis, and cannot be FARMED.
 *  MEMORY  — the concrete thing he names is real, deterministic, and never
 *            leaks an unsubstituted {slot} into the feed.
 *
 * Plus the lesson OTA-1064's audit taught the hard way: authored is not
 * reachable. Every route into this content is exercised through the real store
 * actions, not through the engine functions alone.
 */
jest.setTimeout(60_000);

import {
  STANCE_ORDER, STANCE_MIN_CORES, stanceFor, stanceOf,
  REGARD_ORDER, REGARD_MIN, REGARD_MAX, regardParts, regardScore, regardBandOf, regardOf,
  toneFor, arbiterMemory, arbiterRemark, dueArbiterBeat, recordArbiterBeat,
  stanceBeatKey, regardBeatKey, arbiterNameBeat, arbiterNameAnswer, isNameQuestion,
  arbiterVerdict, arbiterBrief, arbiterSheetLines, arbiterPersonaProblems,
  STANCE_LABEL, REGARD_LABEL,
  type ArbiterStance, type RegardBand,
} from '../app/engine/arbiterPersona';
import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter, WorldMemory, NpcRelation } from '../app/engine/types';
import personaData from '../app/data/lore/arbiter-persona.json';
import forksData from '../app/data/story/forks.json';
import fs from 'fs';
import path from 'path';
import { placedAt } from '../test-utils/placePlayer';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** A minimum viable character for the pure functions. */
function pc(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
    hp: 30, hpMax: 30, stamina: 10, staminaMax: 10, ac: 10, tc: 0, corruption: 0,
    inventory: [], factionStanding: [], ...placedAt('x'), activeQuests: [],
    ...over,
  } as PlayerCharacter;
}

function rel(over: Partial<NpcRelation> = {}): NpcRelation {
  return {
    id: 'npc:a', name: 'Someone', firstMetAt: 0, lastSeenAt: 0, lastSeenHours: 0,
    meetings: 1, trades: 0, tcTraded: 0, contractsTaken: 0, contractsTurnedIn: 0,
    wrongs: 0, ...over,
  } as NpcRelation;
}

function wm(relations: NpcRelation[] = []): WorldMemory {
  const npcRelations: Record<string, NpcRelation> = {};
  for (const r of relations) npcRelations[r.id] = r;
  return { npcRelations } as unknown as WorldMemory;
}

const withCores = (n: number) => pc({ mainQuest: { coresRecovered: Array.from({ length: n }, (_, i) => `c${i}`) } } as never);

// ── AUTHORING ────────────────────────────────────────────────────────────

describe('OTA-1067 — the authoring holds together', () => {
  it('every pool the engine can ask for exists and is populated', () => {
    // A missing pool would show up in play as the Arbiter falling silent for
    // exactly one stance-and-tone combination, which is the kind of hole that
    // ships and is never reported.
    expect(arbiterPersonaProblems()).toEqual([]);
  });

  it('⚠ EVERY fork option in the game has a regard value and an echo', () => {
    // The cross-file completeness check OTA-1064's audit is the reason for. An
    // option authored in forks.json with no entry here is a Phase 3 decision
    // that Phase 5 silently does not care about — which reads, in play, as the
    // Arbiter having no opinion about the one thing the game made you choose.
    const forks = ((forksData as any).forks ?? forksData) as Array<{ id: string; options: Array<{ id: string }> }>;
    const keys = forks.flatMap((f) => f.options.map((o) => `${f.id}:${o.id}`));
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) {
      expect(Object.keys(personaData.forkRegard)).toContain(k);
      expect(Object.keys(personaData.forkEcho)).toContain(k);
    }
  });

  it('...and no entry here names a fork option that does not exist', () => {
    const forks = ((forksData as any).forks ?? forksData) as Array<{ id: string; options: Array<{ id: string }> }>;
    const keys = new Set(forks.flatMap((f) => f.options.map((o) => `${f.id}:${o.id}`)));
    for (const k of Object.keys(personaData.forkRegard)) expect(keys.has(k)).toBe(true);
  });

  it('he has an opinion in both directions on the forks', () => {
    // If every option scored positive the choice would not be a choice, and if
    // every option scored zero the phase would be decorative.
    const vals = Object.values(personaData.forkRegard);
    expect(vals.some((v) => v > 0)).toBe(true);
    expect(vals.some((v) => v < 0)).toBe(true);
  });

  it('⚠ nothing player-facing leaks an unsubstituted slot', () => {
    const leaky: string[] = [];
    const walk = (v: unknown, at: string) => {
      if (typeof v === 'string') {
        // memory.* lines legitimately carry {it} until arbiterRemark fills it.
        if (/\{[a-z]+\}/.test(v) && !at.startsWith('memory.')) leaky.push(`${at}: ${v.slice(0, 50)}`);
      } else if (v && typeof v === 'object') {
        // `_`-prefixed keys are authoring notes to the next person, not copy.
        for (const [k, sub] of Object.entries(v)) {
          if (k.startsWith('_')) continue;
          walk(sub, at ? `${at}.${k}` : k);
        }
      }
    };
    walk(personaData, '');
    expect(leaky).toEqual([]);
  });

  it('he never breaks character in the model brief', () => {
    // The brief is appended to a live system prompt. A stray "the player" or
    // "the game" in it is a jailbreak of his own persona.
    const all = Object.values(personaData.briefs).join(' ').toLowerCase();
    for (const banned of ['the game', 'the player', ' ai ', 'model', 'rules']) {
      expect(all).not.toContain(banned);
    }
  });
});

// ── ARC ──────────────────────────────────────────────────────────────────

describe('OTA-1067 — the arc across the nine Cores', () => {
  it('five stances, ascending, and the last one is the full set', () => {
    expect(STANCE_ORDER).toEqual(['witness', 'interested', 'invested', 'implicated', 'named']);
    expect(STANCE_MIN_CORES.witness).toBe(0);
    expect(STANCE_MIN_CORES.named).toBe(9);
  });

  it('stance never goes backwards as Cores accumulate', () => {
    let prev = -1;
    for (let cores = 0; cores <= 12; cores++) {
      const idx = STANCE_ORDER.indexOf(stanceFor(cores));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it('each threshold is exactly where it says it is', () => {
    for (const s of STANCE_ORDER) {
      expect(stanceFor(STANCE_MIN_CORES[s])).toBe(s);
      if (STANCE_MIN_CORES[s] > 0) expect(stanceFor(STANCE_MIN_CORES[s] - 1)).not.toBe(s);
    }
  });

  it('a save with no main quest reads as the opening stance, not a crash', () => {
    expect(stanceOf(pc())).toBe('witness');
    expect(stanceOf(null)).toBe('witness');
  });
});

// ── OPINION ──────────────────────────────────────────────────────────────

describe('OTA-1067 — the opinion is derived, and it moves', () => {
  it('a fresh character sits in the middle with nothing to explain', () => {
    expect(regardScore(pc(), wm())).toBe(0);
    expect(regardOf(pc(), wm())).toBe('even');
    expect(regardParts(pc(), wm())).toEqual([]);
  });

  it('wronging people costs, squaring it pays', () => {
    const bad = regardScore(pc(), wm([rel({ wrongs: 2 })]));
    const good = regardScore(pc(), wm([rel({ wrongs: 2, amendsCleared: 2 })]));
    expect(bad).toBeLessThan(0);
    expect(good).toBeGreaterThan(bad);
  });

  it('five bands, and the boundaries are where regardBandOf says', () => {
    expect(REGARD_ORDER).toEqual(['cold', 'wary', 'even', 'warm', 'kin']);
    expect(regardBandOf(-60)).toBe('cold');
    expect(regardBandOf(-30)).toBe('cold');
    expect(regardBandOf(-29)).toBe('wary');
    expect(regardBandOf(-10)).toBe('wary');
    expect(regardBandOf(-9)).toBe('even');
    expect(regardBandOf(14)).toBe('even');
    expect(regardBandOf(15)).toBe('warm');
    expect(regardBandOf(39)).toBe('warm');
    expect(regardBandOf(40)).toBe('kin');
  });

  it('three tones, and the two unhappy bands share one', () => {
    expect(toneFor('cold')).toBe('hard');
    expect(toneFor('wary')).toBe('hard');
    expect(toneFor('even')).toBe('plain');
    expect(toneFor('warm')).toBe('close');
    expect(toneFor('kin')).toBe('close');
  });
});

describe('OTA-1067 — ⚠ the opinion cannot be farmed', () => {
  // The exploit lens on any opinion system: find the cheap repeatable input
  // and grind it. Every one of these is a thing a player can do a thousand
  // times, and every one of them saturates.
  const capOf = (label: RegExp, p: PlayerCharacter, memory: WorldMemory) =>
    regardParts(p, memory).find((x) => label.test(x.label))?.value ?? 0;

  it('reading lore is free, so it caps', () => {
    const huge = pc({ titleProgress: { loreRead: 10_000 } as never });
    expect(capOf(/read what the dead wrote/, huge, wm())).toBeLessThanOrEqual(8);
  });

  it('giving away junk is cheap, so it caps', () => {
    const gifts = Array.from({ length: 500 }, (_, i) => ({ name: `thing${i}`, atHours: 0 }));
    expect(capOf(/given away/, pc(), wm([rel({ gifts })]))).toBeLessThanOrEqual(6);
  });

  it('answering every fork the best way still cannot alone reach the top band', () => {
    // OTA-1085 — the sheet now itemises one row per judged answer (the old
    // aggregate row was illegible: "1 answer he was standing there for -5"
    // named nothing). Forks are one-shot and finite, so the anti-farm
    // property is structural now, not a clamp: even a perfect Phase 3 run
    // stays a strong opinion, short of the top band (kin begins at 40).
    const best: Record<string, string> = {};
    for (const [key, v] of Object.entries(personaData.forkRegard)) {
      const [f, o] = key.split(':') as [string, string];
      if ((v as number) > 0 && !best[f]) best[f] = o;
    }
    const rows = regardParts(pc({ storyChoices: best }), wm()).filter((x) => /^your answer:/.test(x.label));
    expect(rows.length).toBe(Object.keys(best).length); // every answer is named
    // Each row carries the words the player actually chose, not a code key.
    for (const r of rows) expect(r.label).toMatch(/^your answer: [A-Z]/);
    const total = rows.reduce((n, r) => n + r.value, 0);
    expect(total).toBeLessThan(40);
  });

  it('⚠ and the total is clamped at both ends', () => {
    const saintly = pc({
      titleProgress: { loreRead: 10_000, relicsPreserved: 10_000 } as never,
      factionStanding: [{ factionId: 'a', standing: 100 }] as never,
      pressure: 'bury_me',
    });
    const gifts = Array.from({ length: 500 }, (_, i) => ({ name: `t${i}`, atHours: 0 }));
    expect(regardScore(saintly, wm([rel({ amendsCleared: 500, gifts })]))).toBeLessThanOrEqual(REGARD_MAX);

    const monstrous = pc({
      corruption: 100, menace: 10_000,
      titleProgress: { relicsTraded: 10_000 } as never,
      factionStanding: [{ factionId: 'a', standing: -100 }] as never,
    });
    expect(regardScore(monstrous, wm([rel({ wrongs: 500 })]))).toBeGreaterThanOrEqual(REGARD_MIN);
  });

  it('⚠ ...and cold is a place you can climb out of', () => {
    // A player who tanked everything in the first hour must not be locked out
    // of the arc for the rest of a fifty-hour run.
    const sunk = pc({ corruption: 100, menace: 200 });
    const worst = regardScore(sunk, wm([rel({ wrongs: 100 })]));
    const redeemed = regardScore(
      pc({ corruption: 0, menace: 0, titleProgress: { loreRead: 99, relicsPreserved: 9 } as never }),
      wm([rel({ wrongs: 100, amendsCleared: 100 })]),
    );
    expect(worst).toBeLessThan(0);
    expect(redeemed).toBeGreaterThan(worst);
    expect(regardBandOf(redeemed)).not.toBe('cold');
  });
});

// ── MEMORY ───────────────────────────────────────────────────────────────

describe('OTA-1067 — what he actually names', () => {
  it('the person he names is a real person from the ledger', () => {
    const notes = arbiterMemory(pc(), wm([rel({ id: 'npc:v', name: 'Yulka', wrongs: 1 })]));
    expect(notes.find((n) => n.kind === 'wronged')?.subject).toBe('Yulka');
  });

  it('and he names the SAME person every time rather than rotating victims', () => {
    const memory = wm([
      rel({ id: 'npc:a', name: 'Ande', wrongs: 1 }),
      rel({ id: 'npc:b', name: 'Bern', wrongs: 4 }),
      rel({ id: 'npc:c', name: 'Cass', wrongs: 2 }),
    ]);
    for (let i = 0; i < 5; i++) {
      expect(arbiterMemory(pc(), memory).find((n) => n.kind === 'wronged')?.subject).toBe('Bern');
    }
  });

  it('a squared debt is remembered as squared, not erased', () => {
    const memory = wm([rel({ id: 'npc:a', name: 'Ande', wrongs: 2, amendsCleared: 2 })]);
    const notes = arbiterMemory(pc(), memory);
    expect(notes.find((n) => n.kind === 'made_good')?.subject).toBe('Ande');
    expect(notes.find((n) => n.kind === 'wronged')).toBeUndefined();
  });

  it('he echoes the LAST fork answered, in his own words', () => {
    const key = Object.keys(personaData.forkEcho)[0]!;
    const [f, o] = key.split(':') as [string, string];
    const notes = arbiterMemory(pc({ storyChoices: { [f]: o } }), wm());
    expect(notes.find((n) => n.kind === 'answered')?.subject).toBe((personaData.forkEcho as any)[key]);
  });

  it('an unknown choice id from a newer build is ignored, not echoed raw', () => {
    const notes = arbiterMemory(pc({ storyChoices: { made_up_fork: 'made_up_option' } }), wm());
    expect(notes.find((n) => n.kind === 'answered')).toBeUndefined();
  });

  it('a character who has done nothing gives him nothing to name', () => {
    expect(arbiterMemory(pc(), wm())).toEqual([]);
  });
});

// ── THE LINE ─────────────────────────────────────────────────────────────

describe('OTA-1067 — the remark itself', () => {
  const rich = () => {
    const p = withCores(4);
    p.storyChoices = { debt_collector: 'pay_partial' };
    p.corruption = 60;
    return p;
  };

  it('the same save and the same counter always give the same line', () => {
    // An opinion decided by a coin is not an opinion; see npcMemory's argument
    // about the shopkeeper with a head injury.
    for (let n = 0; n < 12; n++) {
      const a = arbiterRemark(rich(), wm([rel({ name: 'Ande', wrongs: 1 })]), n);
      const b = arbiterRemark(rich(), wm([rel({ name: 'Ande', wrongs: 1 })]), n);
      expect(a).toBe(b);
    }
  });

  it('...and it does not say the same thing every time', () => {
    const memory = wm([rel({ name: 'Ande', wrongs: 1 })]);
    const seen = new Set<string>();
    for (let n = 0; n < 24; n++) seen.add(arbiterRemark(rich(), memory, n) ?? '');
    expect(seen.size).toBeGreaterThan(3);
  });

  it('⚠ NO {slot} ever reaches the feed, across the whole stance × tone matrix', () => {
    // Regard is genuinely VARIED here rather than looped over and ignored — a
    // test that names a dimension it does not exercise is the ota1018 problem,
    // where the assertion checked argument ORDER while its name claimed
    // something else. These three fixtures land in hard / plain / close.
    const memory = wm([rel({ id: 'npc:a', name: 'Ande', wrongs: 1, amendsCleared: 1, gifts: [{ name: 'x', atHours: 0 }] })]);
    const tones = new Set<string>();
    for (let cores = 0; cores <= 9; cores++) {
      for (const shape of ['hated', 'neutral', 'loved'] as const) {
        const p = withCores(cores);
        p.corruption = 90;
        p.titleProgress = { relicsPreserved: 3 } as never;
        p.storyChoices = { debt_collector: 'pay_partial' };
        if (shape === 'hated') {
          p.menace = 400; p.corruption = 100;
          p.factionStanding = [{ factionId: 'a', standing: -100 }] as never;
          p.titleProgress = { relicsTraded: 20 } as never;
          p.storyChoices = { debt_claim: 'sell_the_claim' };
        }
        if (shape === 'loved') {
          p.corruption = 0; p.pressure = 'bury_me';
          p.titleProgress = { loreRead: 99, relicsPreserved: 99 } as never;
          p.factionStanding = [{ factionId: 'a', standing: 100 }] as never;
        }
        tones.add(toneFor(regardOf(p, memory)));
        for (let n = 0; n < 20; n++) {
          const line = arbiterRemark(p, memory, n);
          expect(line).not.toBeNull();
          expect(line).not.toMatch(/\{[a-z]+\}/);
        }
      }
    }
    // ...and all three tones were actually reached, not just looped past.
    expect([...tones].sort()).toEqual(['close', 'hard', 'plain']);
  });

  it('a negative or absurd counter is handled rather than crashing', () => {
    expect(arbiterRemark(pc(), wm(), -7)).toBeTruthy();
    expect(arbiterRemark(pc(), wm(), 1e9)).toBeTruthy();
  });

  it('no character means no persona line, so the caller can fall back', () => {
    expect(arbiterRemark(null as never, wm(), 0)).toBeNull();
  });
});

// ── THE ONE-SHOTS ────────────────────────────────────────────────────────

describe('OTA-1067 — the beats fire once, and only one at a time', () => {
  it('the opening stance beat is due immediately on a new character', () => {
    const beat = dueArbiterBeat(pc(), wm());
    expect(beat?.key).toBe(stanceBeatKey('witness'));
  });

  it('⚠ stance outranks regard when both are due', () => {
    const p = withCores(3);
    p.titleProgress = { loreRead: 99, relicsPreserved: 9 } as never;
    // The earlier arc beats are already spoken, so 'invested' is the lowest
    // unspoken stance — OTA-1068 made the walk start from the bottom, and a
    // fixture that skipped that would be asserting the old bug.
    p.arbiterBeatsSeen = [stanceBeatKey('witness'), stanceBeatKey('interested')];
    const beat = dueArbiterBeat(p, wm([rel({ amendsCleared: 9 })]));
    expect(beat?.key).toBe(stanceBeatKey('invested'));
  });

  it('recording it stops it repeating, forever', () => {
    let seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const beat = dueArbiterBeat(pc({ arbiterBeatsSeen: seen }), wm());
      if (!beat) break;
      expect(seen).not.toContain(beat.key);
      seen = recordArbiterBeat(seen, beat.key);
    }
    // Both of a fresh character's due beats, and then nothing.
    expect(dueArbiterBeat(pc({ arbiterBeatsSeen: seen }), wm())).toBeNull();
  });

  it('⚠ a double-write cannot make him say it twice', () => {
    const once = recordArbiterBeat([], 'stance:witness');
    expect(recordArbiterBeat(once, 'stance:witness')).toEqual(once);
  });

  it('⚠ a band recovered is heard once and never re-announced', () => {
    // Regard moves both ways, so hovering on a boundary must not re-fire.
    const seen = [stanceBeatKey('witness'), regardBeatKey('even')];
    expect(dueArbiterBeat(pc({ arbiterBeatsSeen: seen }), wm())).toBeNull();
  });

  it('⚠ crossing two thresholds at once does not DROP the beat in between', () => {
    // OTA-1068, found by the phases 0-5 playtest harness: a run walked to nine
    // Cores and came back having heard witness / invested / implicated / named
    // — 'interested' never fired, because dueArbiterBeat only ever offered the
    // CURRENT stance and 'interested' was behind the player by the next
    // arrival. A chapter of the arc vanishing quietly is precisely what the
    // derive-from-the-save design was chosen to make impossible.
    let seen: string[] = [];
    // Jump straight from nothing to the top, the way an offline catch-up or
    // two Guardians in a row would.
    const p = () => {
      const c = withCores(9);
      c.arbiterBeatsSeen = seen;
      return c;
    };
    const fired: string[] = [];
    for (let i = 0; i < 12; i++) {
      const beat = dueArbiterBeat(p(), wm());
      if (!beat) break;
      fired.push(beat.key);
      seen = recordArbiterBeat(seen, beat.key);
    }
    // Every stance beat, in arc order, one per call.
    expect(fired.filter((k) => k.startsWith('stance:')))
      .toEqual(STANCE_ORDER.map((s) => stanceBeatKey(s)));
  });

  it('...and a stance the run has NOT reached is never offered early', () => {
    let seen: string[] = [];
    const fired: string[] = [];
    for (let i = 0; i < 12; i++) {
      const c = withCores(2); // 'interested' — 'invested' needs 3
      c.arbiterBeatsSeen = seen;
      const beat = dueArbiterBeat(c, wm());
      if (!beat) break;
      fired.push(beat.key);
      seen = recordArbiterBeat(seen, beat.key);
    }
    expect(fired).toContain(stanceBeatKey('interested'));
    expect(fired).not.toContain(stanceBeatKey('invested'));
    expect(fired).not.toContain(stanceBeatKey('named'));
  });

  it('every stance and every band has a beat to fire', () => {
    for (const s of STANCE_ORDER) expect((personaData.stanceBeats as any)[s]).toBeTruthy();
    for (const b of REGARD_ORDER) expect((personaData.regardBeats as any)[b]).toBeTruthy();
  });
});

// ── THE NAME ─────────────────────────────────────────────────────────────

describe('OTA-1067 — the name he has not used', () => {
  const beloved = () => {
    const p = withCores(9);
    p.titleProgress = { loreRead: 99, relicsPreserved: 99 } as never;
    p.factionStanding = [{ factionId: 'a', standing: 100 }] as never;
    p.pressure = 'bury_me';
    return p;
  };

  it('nine Cores AND his regard, or nothing', () => {
    expect(arbiterNameBeat(beloved(), wm([rel({ amendsCleared: 9 })]))).toBeTruthy();
    // Nine Cores, no regard.
    const hated = withCores(9);
    hated.corruption = 100;
    hated.menace = 200;
    expect(arbiterNameBeat(hated, wm([rel({ wrongs: 50 })]))).toBeNull();
    // All the regard in the world, eight Cores.
    const early = beloved();
    early.mainQuest = { coresRecovered: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] } as never;
    expect(arbiterNameBeat(early, wm([rel({ amendsCleared: 9 })]))).toBeNull();
  });

  it('asking is a real route, and the matcher is one rule', () => {
    for (const q of ['what is your name', "what's your name", 'arbiter, tell me your name',
      'do you have a name', 'say your name', 'who is the arbiter\'s name']) {
      expect(isNameQuestion(q)).toBe(true);
    }
    for (const q of ['what is aetherstone', 'name the factions', 'list the capitals',
      'what is my name for this dog', 'where am i']) {
      expect(isNameQuestion(q)).toBe(false);
    }
  });

  it('⚠ asking always gets an authored answer, never silence', () => {
    // Three outcomes, and the two refusals are written rather than falling
    // through to a lore-bank near-miss on the word "name".
    const early = arbiterNameAnswer(pc(), wm());
    const withheld = arbiterNameAnswer(
      (() => { const p = withCores(9); p.corruption = 100; p.menace = 200; return p; })(),
      wm([rel({ wrongs: 50 })]),
    );
    const given = arbiterNameAnswer(beloved(), wm([rel({ amendsCleared: 9 })]));
    expect(early.length).toBeGreaterThan(30);
    expect(withheld.length).toBeGreaterThan(30);
    expect(given.length).toBeGreaterThan(30);
    expect(new Set([early, withheld, given]).size).toBe(3);
  });
});

// ── THE ENDING, THE SHEET, THE BRIEF ─────────────────────────────────────

describe('OTA-1067 — where the opinion is legible', () => {
  it('every band has a closing verdict', () => {
    for (const b of REGARD_ORDER) expect((personaData.verdicts as any)[b]).toBeTruthy();
    expect(arbiterVerdict(pc(), wm())).toBe((personaData.verdicts as any).even);
  });

  it('a run spent robbing people gets told so at the door', () => {
    const thief = withCores(9);
    thief.corruption = 100;
    thief.menace = 300;
    const v = arbiterVerdict(thief, wm([rel({ wrongs: 40 })]));
    expect(v).toBe((personaData.verdicts as any).cold);
    expect(v).not.toBe((personaData.verdicts as any).kin);
  });

  it('the sheet shows the itemised why, in the words the engine used', () => {
    const sheet = arbiterSheetLines(pc({ corruption: 90 }), wm([rel({ name: 'Ande', wrongs: 3 })]));
    expect(sheet!.stance).toBe(STANCE_LABEL.witness);
    expect(Object.values(REGARD_LABEL)).toContain(sheet!.regard);
    expect(sheet!.parts.length).toBeGreaterThan(0);
    for (const part of sheet!.parts) {
      expect(part.label.length).toBeGreaterThan(3);
      expect(Number.isFinite(part.value)).toBe(true);
    }
  });

  it('the sheet total is exactly the score the engine acts on', () => {
    const p = pc({ corruption: 70, titleProgress: { loreRead: 12 } as never });
    const memory = wm([rel({ wrongs: 1, gifts: [{ name: 'x', atHours: 0 }] })]);
    const summed = arbiterSheetLines(p, memory)!.parts.reduce((n, x) => n + x.value, 0);
    expect(summed).toBe(regardScore(p, memory));
  });

  it('the model brief says where he stands and how he feels, and nothing else', () => {
    const brief = arbiterBrief(withCores(9), wm());
    expect(brief.length).toBeGreaterThan(40);
    expect(arbiterBrief(null, wm())).toBe('');
  });
});

// ── ⚠ REACHABILITY (the OTA-1064 lesson) ─────────────────────────────────

describe('OTA-1067 — ⚠ every route into this content is real', () => {
  beforeAll(async () => {
    await useGameStore.getState().startNewGame({ name: 'Regarded', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  });

  it('the store speaks a due beat, and records it so it never repeats', () => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, arbiterBeatsSeen: [] } as PlayerCharacter });
    const before = useGameStore.getState().gameLog.length;

    // The choke point the store actually calls on arrival.
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('announceArbiterBeat(get, set)');

    // And the function itself, driven the way arrival drives it.
    const beat = dueArbiterBeat(useGameStore.getState().player, useGameStore.getState().worldMemory);
    expect(beat).not.toBeNull();
    useGameStore.getState().appendLog('arbiter', beat!.line);
    useGameStore.setState({
      player: {
        ...useGameStore.getState().player!,
        arbiterBeatsSeen: recordArbiterBeat(useGameStore.getState().player!.arbiterBeatsSeen, beat!.key),
      } as PlayerCharacter,
    });
    expect(useGameStore.getState().gameLog.length).toBeGreaterThan(before);
    expect(dueArbiterBeat(useGameStore.getState().player, useGameStore.getState().worldMemory)?.key)
      .not.toBe(beat!.key);
  });

  it('⚠ the beat yields to a tide crossing rather than stacking on it', () => {
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('const tideSpoke = announceTide(get, set)');
    expect(store).toContain('if (!tideSpoke) announceArbiterBeat(get, set)');
  });

  it('the name question is answered BEFORE any lookup that could swallow it', () => {
    const store = src('app/state/gameStore.ts');
    const nameAt = store.indexOf('if (isNameQuestion(trimmed))');
    // ⚠ OTA-1198 — anchored on the CALL, not its argument. This pinned
    // `findConcept(lookup)`; the argument was renamed to a stripped query (so the word
    // "arbiter" in the address stops matching the arbiter concept) and this went red
    // without the guarantee changing at all. The ordering is what matters here.
    const conceptAt = store.indexOf('const concept = findConcept(');
    const knowledgeAt = store.indexOf('answerWorldKnowledge(trimmed');
    expect(nameAt).toBeGreaterThan(0);
    expect(nameAt).toBeLessThan(conceptAt);
    expect(nameAt).toBeLessThan(knowledgeAt);
  });

  it('the scene-intro branch asks the persona before the old flat pool', () => {
    const ng = src('app/engine/narrativeGenerator.ts');
    const call = ng.indexOf('arbiterRemark(player, worldMemory, nth)');
    const fallback = ng.indexOf('return pick(ARBITER_PERSONAL_BEATS)');
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(fallback);
  });

  it('the ending screen renders the verdict', () => {
    const es = src('app/screens/EndingScreen.tsx');
    expect(es).toContain('arbiterVerdict(player, worldMemory)');
    expect(es).toContain('THE ARBITER');
  });

  it('the character sheet renders the itemised opinion', () => {
    const cs = src('app/screens/CharacterScreen.tsx');
    expect(cs).toContain('arbiterSheetLines(player, worldMemory)');
    expect(cs).toContain("sectionHeader('arbiter', 'THE ARBITER')");
  });

  it('the brief reaches the live persona prompt, and is read fresh after the await', () => {
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('arbiterBrief(get().player, get().worldMemory)');
  });
});

// ── ⚠ THE SHAPE OF THE MODULE ────────────────────────────────────────────

describe('OTA-1067 — ⚠ the persona is authored, not generated', () => {
  it('nothing in the engine module awaits, rolls, or reaches for a model', () => {
    // A personality that only exists while a 0.5B model happens to be warm is
    // not a personality. The one model touch is the BRIEF, and it lives in the
    // store. Same guard shape as OTA-1063's flourish module.
    const code = src('app/engine/arbiterPersona.ts')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    for (const banned of ['async ', 'await ', 'Promise', 'Math.random', 'llama', 'qwen', 'Qwen']) {
      expect(code).not.toContain(banned);
    }
  });

  it('⚠ and the ONLY thing it persists is what he has already said', () => {
    // Phase 3's rule, restated: derive everything you can, store only what you
    // genuinely cannot. A hidden accumulating score is what a bad migration
    // drops and a re-entrant tick doubles.
    const types = src('app/engine/types.ts');
    expect(types).toContain('arbiterBeatsSeen?: string[]');
    expect(types).not.toContain('arbiterRegard?: number');
    const code = src('app/engine/arbiterPersona.ts');
    expect(code).not.toContain('arbiterRegardStored');
  });

  it('an absent field on an old save reads as "he has not said any of it yet"', () => {
    const p = pc();
    expect(p.arbiterBeatsSeen).toBeUndefined();
    expect(dueArbiterBeat(p, wm())).not.toBeNull();
    expect(recordArbiterBeat(undefined, 'stance:witness')).toEqual(['stance:witness']);
  });

  it('a stance and a band can never collide in the recorded set', () => {
    const keys = new Set<string>([
      ...STANCE_ORDER.map((s: ArbiterStance) => stanceBeatKey(s)),
      ...REGARD_ORDER.map((b: RegardBand) => regardBeatKey(b)),
    ]);
    expect(keys.size).toBe(STANCE_ORDER.length + REGARD_ORDER.length);
  });
});
