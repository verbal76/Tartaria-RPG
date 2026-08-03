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
 * OTA-1064 — CAN THE PLAYER ACTUALLY GET THERE?
 *
 * ⚠ THE WHOLE POINT OF THIS FILE. Every previous Phase 2 test asked whether a
 * topic was AUTHORED and correctly GATED. None of them asked whether any route
 * in the shipped game reaches it. So OTA-1062 shipped 44 topics for the
 * procedural cast, went green on 621 suites, and delivered a feature in which:
 *
 *   - the TALK chip asked `hasTopicsFor(vendor.id)` — the SPAWN id — so it
 *     never appeared for 24 roadside or 5 overlay traders;
 *   - the `talk to <name>` router asked the same question the same wrong way;
 *   - `talk to <wanderer>` has always been swallowed by the parley branch, so
 *     all 28 wanderer-archetype topics were dead;
 *   - an escort leader is not in the scene at all (they live on
 *     player.activeFactionQuests), so nothing routed to them;
 *   - a Core Guardian only ever exists as an ENEMY, and every route into a
 *     conversation required an empty scene.
 *
 * Authored ≠ reachable. These tests assert REACHABILITY, through the same store
 * actions and the same identity function the game uses.
 */
jest.setTimeout(60_000);

import { hasTopicsFor, topicsFor, TOPIC_CLASS_KEYS, classKeyFor, type TalkContext } from '../app/engine/dialogue';
import { npcLedgerId } from '../app/engine/npcMemory';
import { useGameStore } from '../app/state/gameStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TOPICS = require('../app/data/npcs/dialogue_topics.json') as {
  npcs: Record<string, { displayName: string; topics: { id: string; label: string }[] }>;
};

/** Comments are prose, not behaviour — a rule about what the CODE does must not
 *  be satisfied or broken by a sentence describing it. */
const codeOnly = (src: string) =>
  src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const at = (over: Partial<TalkContext> = {}): TalkContext => ({
  regard: 'stranger', contractsTurnedIn: 0, standing: 0, titles: [],
  hasRecentRaidNews: false, chapter: 'hook', cores: 0, choices: [], ...over, // OTA-1065
});

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1064 — the identity bug that made a whole cast mute', () => {
  it('a spawn id is NOT a ledger id, and only the ledger id finds topics', () => {
    // This is the entire defect in four lines. The left column is what the two
    // call sites were passing; the right column is what the topic sets are
    // keyed on.
    const roadside = { id: 'roadside_4821', name: 'Grit Maalen' };
    const overlay = { id: 'overlay_ledge_k3x9', name: 'Sella Vurn' };
    expect(hasTopicsFor(roadside.id)).toBe(false);
    expect(hasTopicsFor(npcLedgerId(roadside))).toBe(true);
    expect(hasTopicsFor(overlay.id)).toBe(false);
    expect(hasTopicsFor(npcLedgerId(overlay))).toBe(true);
  });

  it('...and a NAMED vendor survived only by coincidence', () => {
    // Their raw id happens to equal their ledger id, which is why the bug hid
    // for three OTAs: the 30 people anybody would test by hand all worked.
    expect(npcLedgerId({ id: 'irma_ironhand', name: 'Irma Ironhand' })).toBe('irma_ironhand');
    expect(hasTopicsFor('irma_ironhand')).toBe(true);
  });

  it('both call sites now ask with the ledger id', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const store: string = require('fs').readFileSync(
      require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    const screen: string = require('fs').readFileSync(
      require('path').join(__dirname, '../app/screens/ExplorationScreen.tsx'), 'utf8');
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(store).toContain('hasTopicsFor(vendorNpcId(currentScene.vendor))');
    expect(screen).toContain('hasTopicsFor(npcLedgerId(currentScene.vendor))');
    // ...and nowhere asks the old way.
    expect(store).not.toContain("hasTopicsFor(vId)");
    expect(screen).not.toContain("hasTopicsFor(currentScene.vendor.id");
  });
});

describe('OTA-1064 — every authored class set has a live route', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const store: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('there are 11 class sets and not one of them is decorative', () => {
    expect(TOPIC_CLASS_KEYS).toHaveLength(11);
  });

  it('the wanderer archetypes reach their topics through the parley modal', () => {
    // Not by stealing `talk to <name>` from the parley — the parley pays a lead,
    // goods or standing and is the point of meeting somebody on the road. The
    // conversation is a THIRD option on the same screen.
    expect(store).toContain('topicsNpcId');
    expect(store).toMatch(/parleyIntoTalk: \(\) => \{/);
    // ...and stepping into it must not roll or resolve anything.
    const fn = codeOnly(store.slice(store.indexOf('parleyIntoTalk: () => {'), store.indexOf('async hydrate()')));
    expect(fn).not.toContain('runParleyOutcome');
    expect(fn).not.toContain('resolveParley');
  });

  it('an escort leader is reachable by name even though they are not in the scene', () => {
    expect(store).toContain('ANYBODY ELSE YOU NAMED');
    expect(store).toMatch(/const who = \(parsed\.resolvedNoun \?\? parsed\.target \?\? ''\)\.trim\(\);\s*\n\s*if \(who\) \{\s*\n\s*get\(\)\.talkToNpc\(who\);/);
  });

  it('a Core Guardian is reachable while it is trying to kill you', () => {
    expect(store).toContain('A CORE GUARDIAN WILL ANSWER A QUESTION');
    // ⚠ and it must sit BEFORE the talk-down refusal, or the refusal eats it.
    expect(store.indexOf('A CORE GUARDIAN WILL ANSWER A QUESTION'))
      .toBeLessThan(store.indexOf('if (isTalkDownBlocked(foes))'));
  });

  it('⚠ ...but talking to a Guardian still cannot end the fight', () => {
    // OTA-806's guardrail is older than this feature and outranks it: "you
    // can't sweet-talk a Guardian off its post". The conversation is free
    // precisely BECAUSE it changes nothing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const td: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/talkDown.ts'), 'utf8');
    expect(td).toContain('e.boss === true');
    const guardBlock = codeOnly(store.slice(
      store.indexOf('A CORE GUARDIAN WILL ANSWER A QUESTION'),
      store.indexOf('--- Combat parley')));
    expect(guardBlock).not.toContain('runEnemyGroupCounters');
    expect(guardBlock).not.toContain('advanceTime');
    expect(guardBlock).not.toContain('resolveParley');
  });
});

describe('OTA-1064 — the buttons say different things for different people', () => {
  const classRows = TOPIC_CLASS_KEYS.map((k) => ({
    key: k, labels: TOPICS.npcs[k]!.topics.map((t) => t.label),
  }));

  it('no two class sets present the identical list of buttons', () => {
    // All 11 shipped with the SAME four labels. The content underneath was
    // distinct and well written, and the player could not tell, because the
    // only thing they ever see before choosing is the label. A scavenger and a
    // Core Guardian both offered "Ask what they are not saying".
    const rows = classRows.map((r) => r.labels.join('|'));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('and no set repeats a label within itself', () => {
    for (const { key, labels } of classRows) {
      expect(new Set(labels).size).toBe(labels.length);
      expect(key).toBeTruthy();
    }
  });

  it('every class key a real npc id maps to is authored', () => {
    // A class key the engine can derive but nobody wrote is a silent hole: the
    // person simply has nothing to say and no test would notice.
    const samples = [
      'wanderer:traveler:corin', 'wanderer:refugee:ana', 'wanderer:tinker:bo',
      'wanderer:scout:dell', 'wanderer:pilgrim:esk', 'wanderer:drifter:fen',
      'wanderer:scavenger:gret', 'roadside:grit_maalen', 'escort:hessa',
      'guardian:asgardar', 'overlay:sella_vurn',
    ];
    for (const id of samples) {
      const key = classKeyFor(id);
      expect(key).toBeTruthy();
      expect(TOPIC_CLASS_KEYS).toContain(key!);
      expect(topicsFor(id, at()).length).toBeGreaterThan(0);
    }
  });
});

describe('OTA-1064 — driving the real store', () => {
  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Reach', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  const scene = () => useGameStore.getState().currentScene!;
  const clearTalk = () => {
    useGameStore.setState({ pendingTalk: null, pendingParley: null });
    const wm = useGameStore.getState().worldMemory;
    useGameStore.setState({ worldMemory: { ...wm, talkedTopics: {} } });
  };

  it('a roadside trader can be talked to — the case that was dead', () => {
    clearTalk();
    useGameStore.setState({
      currentScene: {
        ...scene(), enemies: [], enemyHps: [], wanderer: null,
        vendor: { id: 'roadside_991', name: 'Grit Maalen', faction: null, title: 'Road Hawker', offers: [] } as never,
      },
    });
    useGameStore.getState().talkToNpc('Grit');
    const talk = useGameStore.getState().pendingTalk;
    expect(talk).toBeTruthy();
    expect(talk!.npcId).toBe('roadside:grit_maalen');
    expect(talk!.topics.length).toBeGreaterThan(0);
  });

  it('an escort leader can be talked to while walking with you', () => {
    clearTalk();
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      currentScene: { ...scene(), enemies: [], enemyHps: [], vendor: null, wanderer: null },
      player: {
        ...p,
        activeFactionQuests: [{ id: 'q1', tracked: true, escort: { leaderName: 'Hessa Dorn', hp: 9, count: 3 } } as never],
      },
    });
    useGameStore.getState().talkToNpc('Hessa');
    const talk = useGameStore.getState().pendingTalk;
    expect(talk).toBeTruthy();
    expect(talk!.npcId).toBe('escort:hessa_dorn');
  });

  it('...and NOT once the party is dead', () => {
    clearTalk();
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        activeFactionQuests: [{ id: 'q1', tracked: true, escort: { leaderName: 'Hessa Dorn', hp: 0, count: 0 } } as never],
      },
    });
    useGameStore.getState().talkToNpc('Hessa');
    expect(useGameStore.getState().pendingTalk).toBeNull();
  });

  it('a living Core Guardian is talkable; a dead one is not', () => {
    clearTalk();
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, activeFactionQuests: [] } });
    const guardian = {
      // ⚠ The REAL authored name. capitalIdFromGuardian resolves the Capital by
      // exact name equality against GUARDIANS_BY_CAPITAL, so an invented name
      // yields null and the person has no ledger identity at all. That is a
      // real fragility in the Guardian path, not just a test detail.
      name: 'Sentinel-Priest Vaelka', boss: true, rarity: 'Legendary',
      traits: ['core_guardian'], hp: 200, attack: '+9', damage: '2d8',
    };
    useGameStore.setState({
      currentScene: {
        ...scene(), vendor: null, wanderer: null,
        enemies: [guardian] as never, enemyHps: [200], activeEnemyIdx: 0,
      },
    });
    const people = useGameStore.getState().pendingTalk;
    expect(people).toBeNull();
    useGameStore.getState().talkToNpc('Vaelka');
    const talk = useGameStore.getState().pendingTalk;
    // Only meaningful if the fixture really is recognised as a Guardian; if the
    // trait shape ever changes this assertion is what says so.
    expect(talk).toBeTruthy();
    expect(talk!.npcId).toBe('guardian:asgardar');

    clearTalk();
    useGameStore.setState({ currentScene: { ...scene(), enemyHps: [0] } });
    useGameStore.getState().talkToNpc('Vaelka');
    expect(useGameStore.getState().pendingTalk).toBeNull();
  });
});

/**
 * ⚠ THE AUDIT HALF. Three defects found by reading Phases 0-2 for dead ends,
 * loops and degenerate exploits rather than for correctness of the happy path.
 */
describe('OTA-1064 audit — hostility cannot be farmed for rival standing', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const factions: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/engine/factions.ts'), 'utf8');
  const store: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('THE MECHANISM: a standing LOSS is a standing GAIN for every rival', () => {
    // This is why any repeatable penalty is a reward generator. Asserted here
    // so the reason the dock exists is written down next to the dock.
    expect(factions).toContain('if (rivalIds.has(row.factionId) && halfDelta !== 0) return apply(row, -halfDelta);');
  });

  it('a refused gift is metered — it costs the item nothing to offer', () => {
    // resolveGift refuses rather than consumes, by design (OTA-1060). That makes
    // the standing hit free to repeat, so it must not repeat.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gifting: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/gifting.ts'), 'utf8');
    expect(gifting).toContain('refused: true');
    expect(store).toContain('if (delta < 0) {');
    const fn = store.slice(store.indexOf('function applyGiftStanding('), store.indexOf('function talkContextFor('));
    expect(fn).toContain('dockHostileStanding(get, set, npcId, [faction], -delta)');
  });

  it('a beaten vendor is metered — they are anchored to the room and come back', () => {
    const fn = store.slice(store.indexOf('function resolveVendorSubmission('), store.indexOf('void get().persist();'));
    expect(fn).toContain('dockHostileStanding(');
    // ...and the old unmetered call is gone.
    expect(fn).not.toContain('applyRepChange(standing, vendor.faction, -12)');
  });

  it('the dock records a MAGNITUDE, so a small insult cannot buy off a big one', () => {
    const fn = store.slice(store.indexOf('function dockHostileStanding('), store.indexOf("/** OTA-1060 — a gift's standing effect"));
    expect(fn).toContain('const applied = Math.max(0, magnitude - already);');
    expect(fn).toContain('standingDocked: magnitude');
  });
});

describe('OTA-1064 audit — a grant that cannot land does not spend the topic', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const store: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('applyTopicGrant reports whether it delivered', () => {
    expect(store).toMatch(/grant: import\('\.\.\/engine\/dialogue'\)\.TopicGrant,\s*\n\): boolean \{/);
  });

  it('the talkedTopics counter is only bumped when it did', () => {
    // The lead branch printed "the tip will keep" and then the caller spent the
    // topic anyway, so a gated payout evaporated silently, once, forever.
    expect(store).toContain('if (granted) {');
    expect(store).toMatch(/const granted = asked === 0 && topic\.grants/);
  });

  it('⚠ but a PARTIAL delivery still spends it — no money loop', () => {
    // If a topic ever pays coin AND a lead and only the lead defers, replaying
    // it would pay the coin again. Retry is allowed only when nothing landed.
    expect(store).toContain('return !(deferred && !deliveredSomething);');
  });

  it('and no authored topic today combines a lead with coin', () => {
    // The guard above is the rule; this is the current data agreeing with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../app/data/npcs/dialogue_topics.json') as {
      npcs: Record<string, { topics: { grants?: Record<string, unknown> }[] }>;
    };
    const grants = Object.values(raw.npcs).flatMap((n) => n.topics).map((t) => t.grants).filter(Boolean);
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(!!(g!.lead && g!.tc)).toBe(false);
  });
});

describe('OTA-1064 audit — gifting reaches the same cast as talking', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const store: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('the gift picker is derived from the talkable list, not a second copy', () => {
    // An escort leader walks beside you for a whole contract, is fully on the
    // ledger, could be TALKED to, and was not in the gift picker.
    expect(store).toContain('talkablePeople(get).map((p) => ({ id: p.id, name: p.name }))');
  });

  it('a gift to somebody with no ledger row is refused, not eaten', () => {
    // The accept path wrote the memory inside `prev ? ... : st.worldMemory` but
    // decremented the inventory outside it.
    expect(store).toContain('NO ROW, NO GIFT');
    const fn = store.slice(store.indexOf('giveGift: (itemId) => {'), store.indexOf('closeGift: () => {'));
    expect(fn.indexOf('if (!rel) {')).toBeLessThan(fn.indexOf('const out = resolveGift('));
  });

  it('and you still cannot hand a present to something mid-fight', () => {
    const fn = store.slice(store.indexOf('openGift: () => {'), store.indexOf('chooseGiftRecipient: (id) => {'));
    expect(fn).toContain("get().appendLog('system', 'Not mid-fight.');");
  });
});
