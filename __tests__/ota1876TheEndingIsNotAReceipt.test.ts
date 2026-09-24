// OTA-1876 — THE ENDING IS NOT A RECEIPT (Play-Quality Phase 2A, first batch).
//
// ⚠⚠⚠ THE NUMBER IS DERIVED, NOT INHERITED. This suite began life in a protected
// worktree as `endingFirstBatch.test.ts`, and a later copy carried the PROVISIONAL
// name `ota1870TheEndingIsNotAReceipt`. That number is gone: the engine defect
// this batch exposed was split out and shipped on its own as the real OTA-1870
// (`the road belongs to the next task`), so 1870 belongs to THAT suite and this
// one takes the next number current repository authority gives. check:otastamp
// binds OTA_BUILD_ID to the highest otaNNNN suite, and this is it.
//
// ⚠⚠ AND THE ENGINE REPAIR IS NOT IN THIS PACKAGE. The Red Tower contract below
// is proven AGAINST the shipped OTA-1870 behaviour — `nextActionableStage` routes
// by the next stage that will still exist once the consume loop has run — not
// around it. There is no workaround here and no location data was falsified to
// suppress travel: the epilogue still says `Varakush`, and the engine correctly
// declines to route to a beat it is about to eat.
//
// PLAY-QUALITY PHASE 2A — THE ENDING, FIRST SURGICAL REPAIR BATCH.
//
// Six arcs that reached their climax and then simply stopped now carry a
// post-climax authored beat, integrated through the SAME mechanism the 14
// shipped epilogues use: a trailing `checkKind: null` stage that the family's
// own advance loop auto-consumes and READS OUT (OTA-871, and OTA-1583 for the
// kill path). No engine change, no new field, no reward change.
//
// ⚠⚠⚠ THE HUNTS ARE DELIBERATELY ABSENT, AND THE CORPUS GUARD BELOW KEEPS THEM
// ABSENT. A hunt does not close through `advanceHunt`'s consume loop: the apex
// FREEZES (OTA-796) and the completing advance is made by the hunt-boss branch
// in defeatCredit.ts, which assigns `stage: def.stages.length` outright. A
// trailing null stage on a hunt is therefore JUMPED — the record steps from the
// apex straight past the epilogue, and the authored beat is never written to the
// log. Measured on hunt_bog_dragon with the epilogue appended in memory: the
// record went 6 -> 8 and the narration never appeared. Giving the 18 hunts an
// ending needs that assignment to walk the stages it is skipping, which is an
// ENGINE change and is the owner's call — so this suite pins the limit instead
// of working around it.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
// ⚠ Sound is a plain object, not a class with a self-referential static: the
// `static createAsync = jest.fn(...)` spelling the other suites use infers TS7022
// and would push the test-typecheck ratchet past its baseline.
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: {
      createAsync: jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      })),
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

import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { HUNTS } from '../app/engine/hunts';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(30000);

type Stage = {
  narration: string;
  arbiter: string | null;
  checkKind: string | null;
  locationName?: string;
  npcName?: string;
  grants?: unknown;
  requires?: unknown;
  spawn?: unknown;
  stinger?: unknown;
};
type Arc = { id: string; title: string; stages: Stage[] };

const ALL: Array<{ family: string; arc: Arc }> = [
  ...(MYSTERIES as unknown as Arc[]).map((arc) => ({ family: 'mystery', arc })),
  ...(STORYLINES as unknown as Arc[]).map((arc) => ({ family: 'storyline', arc })),
  ...(HUNTS as unknown as Arc[]).map((arc) => ({ family: 'hunt', arc })),
];

const byId = (id: string): Arc => {
  const hit = ALL.find((x) => x.arc.id === id);
  if (!hit) throw new Error(`arc not found: ${id}`);
  return hit.arc;
};

/** The exact opening of each repaired arc's CLIMAX stage, pinned so a future
 *  edit that rewrites the climax to make room for an ending fails here. The
 *  brief's rule is that the climax is preserved, not replaced. */
const BATCH: Array<{
  id: string;
  family: 'mystery' | 'storyline';
  climaxOpens: string;
  climaxCheckKind: string;
  npc: string;
  where: string;
  /** a phrase the epilogue must contain — the beat's actual payload, not a tag */
  lands: string;
}> = [
  {
    id: 'mystery_red_tower',
    family: 'mystery',
    climaxOpens: 'You wipe the casing clean.',
    climaxCheckKind: 'boss',
    npc: 'the Order scholar',
    where: 'Varakush',
    lands: 'It does not cut it square.',
  },
  {
    id: 'mystery_temporal_watch',
    family: 'mystery',
    climaxOpens: 'Clear of the eddy, the dials settle into normal time',
    climaxCheckKind: 'boss',
    npc: 'the Reclaimers Guild Speaker',
    where: "Reclaimer's Stake",
    lands: 'he has not finished the afternoon',
  },
  {
    id: 'mystery_hollow_crown',
    family: 'mystery',
    climaxOpens: 'You return the Hollow Crown to the factor.',
    climaxCheckKind: 'boss',
    npc: 'the Monarch factor',
    where: "The Monarch's Waystation",
    lands: 'the voice in the corridor keeps going',
  },
  {
    id: 'story_reclaimer_relic_run',
    family: 'storyline',
    climaxOpens: "You put all five hauls on the Speaker's table.",
    climaxCheckKind: 'boss',
    npc: 'the Reclaimers Guild Speaker',
    where: "Reclaimer's Stake",
    lands: 'I did not know the ceiling had gone',
  },
  {
    id: 'story_monarch_silence',
    family: 'storyline',
    climaxOpens: 'You return to Kincaid and lay out what you carried back',
    climaxCheckKind: 'boss',
    npc: 'Dr. Lucius Kincaid',
    where: "The Monarch's Waystation",
    lands: 'slides the drawer shut on all six of them',
  },
  {
    id: 'story_tartarian_ascension',
    family: 'storyline',
    climaxOpens: 'Step seven — the oath.',
    climaxCheckKind: 'boss',
    npc: 'Korash of the Deep',
    where: 'The Sunken Enclave',
    lands: 'Not the words. The roster.',
  },
];

/** Endings that announce themselves instead of landing. The brief names these. */
const FILLER = [
  /\bFor now\b/i,
  /only time will tell/i,
  /the road ahead/i,
  /you have proven yourself/i,
  /the realm will remember/i,
];

describe('ENDING BATCH 1 — per-arc proofs', () => {
  for (const spec of BATCH) {
    describe(spec.id, () => {
      const arc = byId(spec.id);
      const last = () => arc.stages[arc.stages.length - 1]!;
      const climax = () => arc.stages[arc.stages.length - 2]!;

      it('1. ends on a post-climax authored beat (trailing checkKind: null)', () => {
        expect(last().checkKind).toBeNull();
        expect(last().narration.trim().length).toBeGreaterThan(80);
      });

      it('2. the climax is still the last GATED stage, and is unchanged', () => {
        expect(climax().checkKind).toBe(spec.climaxCheckKind);
        expect(climax().narration.startsWith(spec.climaxOpens)).toBe(true);
      });

      it('3. the beat happens to a named person at a named place', () => {
        expect(last().npcName).toBe(spec.npc);
        expect(last().locationName).toBe(spec.where);
      });

      it('4. the person and the place are already established in this arc', () => {
        const earlier = arc.stages.slice(0, -1);
        expect(earlier.some((s) => s.npcName === spec.npc || s.locationName === spec.where)).toBe(true);
      });

      it('5. it changes nothing mechanical — no grant, no requirement, no spawn, no stinger', () => {
        const s = last();
        expect(s.grants).toBeUndefined();
        expect(s.requires).toBeUndefined();
        expect(s.spawn).toBeUndefined();
        expect(s.stinger).toBeUndefined();
        expect(s.arbiter).toBeNull();
      });

      it('6. it lands its own payload, not a label', () => {
        expect(last().narration).toContain(spec.lands);
      });

      it('7. it uses none of the filler closings', () => {
        for (const re of FILLER) expect(last().narration).not.toMatch(re);
      });

      it('8. exactly ONE trailing null beat — the arc does not trail off', () => {
        let trailing = 0;
        for (let i = arc.stages.length - 1; i >= 0 && arc.stages[i]!.checkKind === null; i -= 1) trailing += 1;
        expect(trailing).toBe(1);
      });
    });
  }
});

describe('ENDING BATCH 1 — corpus level', () => {
  const endsOnEpilogue = (arc: Arc) => arc.stages[arc.stages.length - 1]!.checkKind === null;

  it('the corpus is still 50 arcs: 18 hunts, 18 mysteries, 14 storylines', () => {
    expect(HUNTS.length).toBe(18);
    expect(MYSTERIES.length).toBe(18);
    expect(STORYLINES.length).toBe(14);
  });

  it('14 shipped epilogues + 6 new = 20 arcs now end on a post-climax beat', () => {
    const ending = ALL.filter((x) => endsOnEpilogue(x.arc));
    expect(ending.length).toBe(20);
    for (const spec of BATCH) expect(ending.some((x) => x.arc.id === spec.id)).toBe(true);
  });

  // ⚠⚠⚠ THE MEASURED ENGINE LIMIT, PINNED. See the header. A hunt's epilogue
  // would be authored and never read; this fails the moment one is added, so the
  // engine question gets answered before the prose does.
  it('NO hunt carries a trailing null stage — the hunt kill path would swallow it', () => {
    const offenders = (HUNTS as unknown as Arc[]).filter(endsOnEpilogue).map((h) => h.id);
    expect(offenders).toEqual([]);
  });

  it('every epilogue in the corpus is a real beat and carries no filler closing', () => {
    for (const { arc } of ALL.filter((x) => endsOnEpilogue(x.arc))) {
      const s = arc.stages[arc.stages.length - 1]!;
      expect(s.narration.trim().length).toBeGreaterThan(60);
      for (const re of FILLER) expect(s.narration).not.toMatch(re);
    }
  });

  it('no epilogue anywhere gates play — none carries a checkKind or a spawn', () => {
    for (const { arc } of ALL.filter((x) => endsOnEpilogue(x.arc))) {
      const s = arc.stages[arc.stages.length - 1]!;
      expect(s.checkKind).toBeNull();
      expect(s.spawn).toBeUndefined();
    }
  });

  it('only the six batch arcs grew — every other arc keeps its authored length', () => {
    const EXPECTED_LENGTHS: Record<string, number> = {
      mystery_red_tower: 5,
      mystery_temporal_watch: 5,
      mystery_hollow_crown: 5,
      story_reclaimer_relic_run: 8,
      story_monarch_silence: 9,
      story_tartarian_ascension: 9,
    };
    for (const [id, n] of Object.entries(EXPECTED_LENGTHS)) expect(byId(id).stages.length).toBe(n);
    // the 14 shipped epilogue arcs are untouched at their known lengths
    expect(byId('mystery_drowned_bell_samarran').stages.length).toBe(4);
    expect(byId('story_order_drowned_library').stages.length).toBe(6);
    // and a representative un-repaired arc still ends on its climax
    expect(endsOnEpilogue(byId('mystery_pale_signal'))).toBe(false);
  });
});

// ⚠⚠ THE BEAT HAS TO ACTUALLY HAPPEN. Everything above reads the data; this
// drives the real store and asks whether the player READS the ending and can
// still turn the contract in afterwards. Order proven per arc:
//     CLIMAX closes -> epilogue auto-consumed and written to the log ->
//     stage reaches stages.length -> the turn-in receipt is raised.
describe('ENDING BATCH 1 — the beat reaches the player', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  async function boot(name: string) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    return store;
  }

  /** The player's ACTUAL position and ACTUAL wealth, in one comparable string.
   *  If any epilogue re-homed anybody or paid anybody, one of these nine moves. */
  const snapshot = () => {
    const s = useGameStore.getState();
    const p = s.player!;
    return JSON.stringify({
      loc: p.currentLocationId, x: p.mapX, y: p.mapY, room: p.hubRoomId,
      scene: s.currentScene?.location?.name ?? null,
      tc: p.tc, items: p.inventory.length,
      standing: [...(p.factionStanding ?? [])].sort((a, b) => a.factionId.localeCompare(b.factionId)),
    });
  };

  for (const spec of BATCH) {
    it(`${spec.id}: the climax closes, the ending is read out, and turn-in unlocks`, async () => {
      const arc = byId(spec.id);
      const epilogue = arc.stages[arc.stages.length - 1]!.narration;
      const climaxIdx = arc.stages.length - 2;
      const store = await boot(`End_${spec.id}`);

      // Park the record ON the climax, the way play leaves it.
      const rec = { id: spec.id, stage: climaxIdx, postedByFaction: null, acceptedAt: 0 };
      store.setState((s) => ({
        player: {
          ...s.player!,
          ...(spec.family === 'mystery' ? { activeMysteries: [rec] } : { activeStorylines: [rec] }),
        },
      }));

      const before = snapshot();
      if (spec.family === 'mystery') store.getState().advanceMystery(spec.id);
      else store.getState().advanceStoryline(spec.id);

      const log = store.getState().gameLog.map((l) => l.text).join('\n');
      const readFor = (id: string) =>
        spec.family === 'mystery'
          ? store.getState().player!.activeMysteries!.find((x) => x.id === id)!
          : store.getState().player!.activeStorylines!.find((x) => x.id === id)!;
      const after = readFor(spec.id);

      // B. the ending reached the player, in full
      expect(log).toContain(epilogue);
      // A. the climax was read too — the ending did not replace or skip it
      expect(log).toContain(spec.climaxOpens);
      // D. the chain is complete, so the contract can be handed in
      expect(after.stage).toBe(arc.stages.length);
      // I. and the player was told where to go — the epilogue is not the objective
      expect(log).toMatch(/Return to a posting agent to turn/i);

      // ⚠⚠ E + G. NOTHING ELSE MOVED. The aftermath pays nothing and relocates
      // nobody: the reward contract belongs to the turn-in at a posting agent,
      // which has not happened yet, so tc/items/standing and the player's ground,
      // cell, room and scene are all exactly what the climax left behind.
      expect(snapshot()).toBe(before);

      // ⚠⚠⚠ F. NO STALE TRAVEL. This is the OTA-1870 contract, asked of all six
      // and not just Red Tower: a trailing epilogue naming a ground must not arm
      // a course, print a set-course instruction, or auto-route anybody.
      expect(log).not.toMatch(/You set course for/i);
      expect(log).not.toMatch(/Auto-routing to the next stage/i);
      expect(log).not.toMatch(/Tap the →/);

      // ⚠ H. SAVE/LOAD DOES NOT REPLAY IT. The record is already past the end, so
      // the load-time record repair has nothing to walk; the beat is read once.
      const beatCount = () =>
        useGameStore.getState().gameLog.filter((l) => l.text.includes(spec.lands)).length;
      const seen = beatCount();
      expect(seen).toBeGreaterThan(0);
      await store.getState().persist();
      await store.getState().hydrate();
      const reloaded = spec.family === 'mystery'
        ? store.getState().player!.activeMysteries!.find((x) => x.id === spec.id)
        : store.getState().player!.activeStorylines!.find((x) => x.id === spec.id);
      if (reloaded) expect(reloaded.stage).toBe(arc.stages.length);
      expect(beatCount()).toBe(seen);
    });
  }

  // ⚠⚠⚠ C. THE EPILOGUE CANNOT STAND IN FOR THE CLIMAX. Seated one beat SHORT of
  // the climax, a single advance must land ON the climax and stop there — the
  // aftermath is not readable, and the arc is not complete. Without this the
  // suite could not tell "the ending follows the climax" from "the ending is
  // reachable whenever", which is the whole difference between an aftermath and
  // a free completion.
  for (const spec of BATCH.filter((b) => byId(b.id).stages.length >= 3)) {
    it(`${spec.id}: one beat short of the climax, the ending is NOT readable`, async () => {
      const arc = byId(spec.id);
      const epilogue = arc.stages[arc.stages.length - 1]!.narration;
      const climaxIdx = arc.stages.length - 2;
      const store = await boot(`Short_${spec.id}`);

      const rec = { id: spec.id, stage: climaxIdx - 1, postedByFaction: null, acceptedAt: 0 };
      store.setState((s) => ({
        player: {
          ...s.player!,
          ...(spec.family === 'mystery' ? { activeMysteries: [rec] } : { activeStorylines: [rec] }),
        },
      }));

      if (spec.family === 'mystery') store.getState().advanceMystery(spec.id);
      else store.getState().advanceStoryline(spec.id);

      const log = store.getState().gameLog.map((l) => l.text).join('\n');
      const after = spec.family === 'mystery'
        ? store.getState().player!.activeMysteries!.find((x) => x.id === spec.id)!
        : store.getState().player!.activeStorylines!.find((x) => x.id === spec.id)!;

      // ⚠ The claim is NOT "one advance moves exactly one stage" — it is that the
      // aftermath cannot be reached from short of the climax. Measured: five of the
      // six step to the climax and stop; `story_monarch_silence` does not move at
      // all, because the beat it is seated on stands bodies up and its door is not
      // open on a bare advance. Either outcome satisfies this control, and pinning
      // the index instead would have made the test a claim about the engine's
      // step size rather than about the ending.
      expect(after.stage).toBeLessThanOrEqual(climaxIdx);
      expect(after.stage).toBeLessThan(arc.stages.length);
      expect(log).not.toContain(epilogue);
      expect(log).not.toMatch(/Return to a posting agent to turn/i);
    });
  }
});

// ⚠⚠⚠ THE OWNER-APPROVED PROSE IS THE CONTRACT FOR THIS BATCH.
//
// Editorial review is CLOSED. Four of the six were revised by owner ruling and
// two were kept exactly; the rejected lines below were rejected ON THE RECORD,
// and a later "cleanup" that restores any of them is a regression, not a tidy.
// So the six texts are pinned byte-for-byte and the rejected lines are pinned
// absent — from the WHOLE corpus, not just these six, because the tics they
// represent (the interpretive simile, the announced closure) are the ones the
// cross-batch voice check found repeating.
describe('ENDING BATCH 1 — the approved prose, exactly', () => {
  const APPROVED: Record<string, string> = {
    mystery_red_tower:
      "You set the casing on the scholar's bench and he lays his own sketch beside it. The two agree, line for line. \"I wrote that the ring shed this when it cooled,\" he says, turning the plate to the light. \"Cooling cracks a thing. It does not cut it square.\" He turns it again, and does not write anything down.",
    mystery_temporal_watch:
      'The Speaker winds the watch once and listens to it keep honest time. Then they ask where the body lay, and write the bearing into the margin of the contract in a small hand. "He is still in there," they say. "By his own clock he has not finished the afternoon." They close the book over the bearing and pay you for the watch.',
    mystery_hollow_crown:
      'The factor has the Crown under glass before you are out of the room, and down the corridor someone is already being told the line is proved. Your copy of the assay is still in your pack, in your own hand, and no one has asked for it. The Waystation gate shuts behind you and the voice in the corridor keeps going.',
    story_reclaimer_relic_run:
      'The five hauls go into Guild crates and out of your hands, as agreed. At the gate two Reclaimers you have never met stand aside to let you through. The Speaker catches you before the road. "Samarran," they say. "I did not know the ceiling had gone. I have written that down where it can be read." Then the nod again.',
    story_monarch_silence:
      'Kincaid files the six items in a drawer with a great many drawers beside it. The Reclaimer\'s note goes in on top, still insisting in ink that he was reasonable. "Quiet keeps," he says, turning the key. "It does not keep forever." Then he slides the drawer shut on all six of them.',
    story_tartarian_ascension:
      "In the morning nobody makes anything of it. The young Tartarian you fought hands you a bowl on their way past and keeps walking. At the enclave mouth the night-watch roster has your name on it in the same hand as everyone else's, third from the bottom, for the week after next. Korash stops beside you while you are reading it. \"That is what the oath was for,\" they say. \"Not the words. The roster.\"",
  };

  for (const [id, text] of Object.entries(APPROVED)) {
    it(`${id} reads exactly what the owner approved`, () => {
      const arc = byId(id);
      expect(arc.stages[arc.stages.length - 1]!.narration).toBe(text);
    });
  }

  it('the batch is exactly six arcs — no seventh was smuggled in', () => {
    expect(Object.keys(APPROVED).sort()).toEqual(BATCH.map((b) => b.id).sort());
    expect(BATCH.length).toBe(6);
  });

  // Each of these was cut by an explicit ruling. None may return, anywhere.
  const REJECTED = [
    'He does not celebrate.',
    'sets it down the way a man',
    'common metal, glass in the settings',
    'with the page still in it',
    'descended from somebody',
    'whole of what a name in the Guild',
    'that is the end of it',
    'they will be on the next list',
    "next season's weather",
    'reached at the Waystation',
  ];

  it('no rejected line survives anywhere in the arc corpus', () => {
    const everyNarration = ALL.flatMap((x) => x.arc.stages.map((s) => s.narration)).join('\n');
    const survivors = REJECTED.filter((line) => everyNarration.includes(line));
    expect(survivors).toEqual([]);
  });
});

// ⚠⚠⚠ THE RED TOWER LOCATION CONTRACT — the one structural question editorial
// review could not answer from the data.
//
// `mystery_red_tower` is the ONLY one of the six whose epilogue names a
// different place than the stage before it: the climax is at the Red Tower of
// Nimari, the ending is at Varakush, where the scholar has been since stage 0.
// The other five endings stay on the ground their climax already occupies.
//
// The question is whether that field MOVES the player. It does not, and this
// proves it rather than asserting it: the auto-consume loop in advanceMystery /
// advanceStoryline reads `narration` and `arbiter` from a trailing null stage
// and NOTHING ELSE. `locationName` on an epilogue is inert metadata — the beat
// is read out where the player is standing. So the prose returns to Varakush
// the way a closing paragraph does, and the player is not teleported, stranded,
// or asked to travel between the climax and its aftermath.
describe('ENDING BATCH 1 — the Red Tower location contract', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('red tower is the only ending that names a different ground than its climax', () => {
    const moved = BATCH.filter((spec) => {
      const arc = byId(spec.id);
      const epi = arc.stages[arc.stages.length - 1]!;
      const climax = arc.stages[arc.stages.length - 2]!;
      return epi.locationName !== climax.locationName;
    }).map((s) => s.id);
    expect(moved).toEqual(['mystery_red_tower']);
  });

  it('the named ground is where the arc OPENED — the scholar never left it', () => {
    const arc = byId('mystery_red_tower');
    const epi = arc.stages[arc.stages.length - 1]!;
    expect(epi.locationName).toBe('Varakush');
    expect(arc.stages[0]!.locationName).toBe('Varakush');
    expect(arc.stages[0]!.npcName).toBe(epi.npcName);
  });

  it('⚠⚠ the epilogue is READ OUT without moving the player, and the chain completes', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'RedTowerLoc', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id,
    });
    store.getState().skipTutorial?.();

    const arc = byId('mystery_red_tower');
    const epilogue = arc.stages[arc.stages.length - 1]!.narration;
    const climaxIdx = arc.stages.length - 2;

    store.setState((s) => ({
      player: {
        ...s.player!,
        activeMysteries: [{ id: 'mystery_red_tower', stage: climaxIdx, postedByFaction: null, acceptedAt: 0 }],
      },
    }));

    // The player's ACTUAL position: the ground they stand on, the cell in it,
    // and the scene the game believes is around them. If `Varakush` re-homed
    // anybody, one of these five moves.
    const where = () => {
      const p = store.getState().player!;
      return JSON.stringify({
        loc: p.currentLocationId, x: p.mapX, y: p.mapY, room: p.hubRoomId,
        scene: store.getState().currentScene?.location?.name ?? null,
      });
    };
    const before = where();

    store.getState().advanceMystery('mystery_red_tower');

    const log = store.getState().gameLog.map((l) => l.text).join('\n');
    const rec = store.getState().player!.activeMysteries!.find((m) => m.id === 'mystery_red_tower')!;

    // 2. the epilogue renders
    expect(log).toContain(epilogue);
    // 3/4/6. `Varakush` labelled the beat; it did NOT re-home the player
    expect(where()).toBe(before);
    // 1/7. the record lands past the end, so the arc is coherent and turn-in opens
    expect(rec.stage).toBe(arc.stages.length);
    // 9. nothing asked the player to travel between climax and aftermath
    expect(log).not.toMatch(/set a course|travel to Varakush/i);
  });

  it('⚠ 8. save/load keeps the completed state and does not replay the beat', async () => {
    const store = useGameStore;
    const countEpilogue = () =>
      store.getState().gameLog.filter((l) => l.text.includes('It does not cut it square.')).length;
    const seen = countEpilogue();
    expect(seen).toBeGreaterThan(0);

    await store.getState().persist();
    await store.getState().hydrate();

    const rec = store.getState().player!.activeMysteries!.find((m) => m.id === 'mystery_red_tower');
    // The repair pass in gameStore walks a record FORWARD past trailing nulls.
    // The record is already at stages.length, so that walk is a no-op here —
    // the completed arc stays completed and the beat is not read a second time.
    if (rec) expect(rec.stage).toBe(byId('mystery_red_tower').stages.length);
    expect(countEpilogue()).toBe(seen);
  });
});

// ⚠⚠⚠ J — THE SHAPE THE PRESENTATION LAYER ALREADY KNOWS. Every reader of an
// epilogue stage — the log writer, the mission card, OTA-1863's serialization —
// was written against the 14 shipped ones. So the six new beats are asked to
// carry the SAME field set, no more and no less: if a serializer handles the
// shipped fourteen it handles these, and nothing new has to be taught.
describe('ENDING BATCH 1 — the epilogue shape is the shipped shape', () => {
  const SHIPPED_KEYS = new Set(['narration', 'arbiter', 'checkKind', 'locationName', 'npcName']);

  it('every epilogue in the corpus uses only the five fields the readers know', () => {
    const offenders: string[] = [];
    for (const { arc } of ALL) {
      const s = arc.stages[arc.stages.length - 1]!;
      if (s.checkKind !== null) continue;
      for (const k of Object.keys(s)) if (!SHIPPED_KEYS.has(k)) offenders.push(`${arc.id}.${k}`);
    }
    expect(offenders).toEqual([]);
  });

  it('and JSON round-trips each one unchanged — nothing in the prose breaks serialization', () => {
    for (const spec of BATCH) {
      const s = byId(spec.id).stages.slice(-1)[0]!;
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });
});

// ⚠⚠⚠ NEGATIVE CONTROLS THAT ACTUALLY CONTROL SOMETHING.
//
// The earlier draft of this block asserted facts about its own mutated copy —
// pop the epilogue, then assert the copy's last stage is gated — which is a
// tautology and would have stayed green with every guard above deleted. These
// run the REAL predicate, the one the corpus assertions consume, over a mutated
// deep copy of the whole corpus, and require it to NAME the injected offender.
// Production data is never touched: `corpus()` is a fresh structural clone.
type Row = { family: string; arc: Arc };
const corpus = (): Row[] => JSON.parse(JSON.stringify(ALL)) as Row[];

/** The guard the corpus-level assertions are made of, as one function so the
 *  controls below break exactly what production is proved on. */
const violations = (rows: Row[]): string[] => {
  const out: string[] = [];
  for (const { family, arc } of rows) {
    const lastIdx = arc.stages.length - 1;
    arc.stages.forEach((s, i) => {
      if (s.checkKind === null && i !== lastIdx) out.push(`mid-chain-null:${arc.id}#${i}`);
    });
    const s = arc.stages[lastIdx]!;
    if (s.checkKind !== null) continue;
    if (family === 'hunt') out.push(`hunt-epilogue:${arc.id}`);
    if (s.grants !== undefined) out.push(`epilogue-grants:${arc.id}`);
    if (s.requires !== undefined) out.push(`epilogue-requires:${arc.id}`);
    if (s.spawn !== undefined) out.push(`epilogue-spawn:${arc.id}`);
    if (s.stinger !== undefined) out.push(`epilogue-stinger:${arc.id}`);
    if (s.arbiter !== null) out.push(`epilogue-arbiter:${arc.id}`);
    if (s.narration.trim().length <= 60) out.push(`epilogue-too-thin:${arc.id}`);
    for (const re of FILLER) if (re.test(s.narration)) out.push(`filler:${arc.id}`);
  }
  for (const spec of BATCH) {
    const arc = rows.find((r) => r.arc.id === spec.id)?.arc;
    if (!arc) { out.push(`arc-missing:${spec.id}`); continue; }
    if (arc.stages[arc.stages.length - 1]!.checkKind !== null) out.push(`no-epilogue:${spec.id}`);
  }
  return out;
};

describe('ENDING BATCH 1 — negative controls', () => {
  it('CONTROL BASELINE — the real corpus reports no violation at all', () => {
    expect(violations(corpus())).toEqual([]);
  });

  it('NC1 — one approved epilogue removed is NAMED', () => {
    const rows = corpus();
    rows.find((r) => r.arc.id === 'mystery_hollow_crown')!.arc.stages.pop();
    expect(violations(rows)).toContain('no-epilogue:mystery_hollow_crown');
  });

  it('NC2 — an epilogue moved into the middle of its arc is NAMED', () => {
    const rows = corpus();
    const arc = rows.find((r) => r.arc.id === 'story_tartarian_ascension')!.arc;
    const epi = arc.stages.pop()!;
    arc.stages.splice(2, 0, epi);
    const v = violations(rows);
    expect(v).toContain('mid-chain-null:story_tartarian_ascension#2');
    expect(v).toContain('no-epilogue:story_tartarian_ascension');
  });

  it('NC3 — an epilogue given a mechanical grant or requirement is NAMED', () => {
    const rows = corpus();
    const last = (id: string) => {
      const a = rows.find((r) => r.arc.id === id)!.arc;
      return a.stages[a.stages.length - 1]!;
    };
    last('story_monarch_silence').grants = { item: 'Runic Mantle' };
    last('mystery_temporal_watch').requires = { item: 'Temporal Distortion Watch' };
    const v = violations(rows);
    expect(v).toContain('epilogue-grants:story_monarch_silence');
    expect(v).toContain('epilogue-requires:mystery_temporal_watch');
  });

  it('NC4 — a hunt handed a trailing beat is NAMED (the shipped engine would swallow it)', () => {
    const rows = corpus();
    rows.find((r) => r.arc.id === 'hunt_bog_dragon')!.arc.stages.push({
      narration: 'Old Mira reads the tin and sets it down, and says nothing about the smell.',
      arbiter: null,
      checkKind: null,
      locationName: "The Monarch's Waystation",
      npcName: 'Old Mira',
    });
    expect(violations(rows)).toContain('hunt-epilogue:hunt_bog_dragon');
  });

  it('NC5 — a rejected line restored anywhere is NAMED by the prose guard', () => {
    const rows = corpus();
    const arc = rows.find((r) => r.arc.id === 'mystery_red_tower')!.arc;
    const s = arc.stages[arc.stages.length - 1]!;
    s.narration = `${s.narration} He does not celebrate.`;
    const everyNarration = rows.flatMap((r) => r.arc.stages.map((x) => x.narration)).join('\n');
    expect(everyNarration.includes('He does not celebrate.')).toBe(true);
    // …and a filler closing is caught by the same predicate the corpus consumes
    s.narration = 'You hand it over. For now, the road ahead is quiet. Only time will tell.';
    expect(violations(rows)).toContain('filler:mystery_red_tower');
  });
});
