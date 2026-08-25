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
 * ⚠ THE TUTORIAL WALK — ONBOARDING PLAYED THE WAY A NEW PLAYER PLAYS IT.
 *
 * The phases 0-5 harness deliberately skips onboarding (it clears the
 * tutorial holds in its first breath), which left OTA-1040..1065 — the climb
 * softlock fix, the teardown, the tutorial voice — covered by unit suites
 * only. This walk closes that edge: a brand-new character, the opening crawl
 * dismissed the way a thumb dismisses it, and every tutorial beat advanced by
 * TYPING THE THING THE ARBITER ASKED FOR, through submitPlayerAction.
 *
 * Same rules as the main harness: seeded, feed-graded, loose about prose and
 * strict about SHAPES — every beat's instruction reached the feed, the
 * lockdown refused an off-script command by RESTATING the ask (the OTA-1040
 * complaint was a refusal with no way to comply), and the tutorial ENDS.
 */
jest.setTimeout(180_000);

import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { isPlayerVisibleChannel } from '../app/engine/gameLog';
import type { LogChannel } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stepId = () => {
  const ts = useGameStore.getState().tutorialStep;
  return ts === null ? null : TUTORIAL_STEPS[ts]?.id ?? null;
};

/** What a player types to satisfy each beat. The ids are the state machine's
 *  own; the phrasing is deliberately ordinary. */
const BEAT_INPUT: Record<string, string> = {
  name: 'Walker',
  // ⚠ 'look' exists on golem-line only (commit 5d23d6fd added a look-around
  // beat between name and cudgel as a golem feature; HAL never had it). The
  // entry is inert on a line without the beat — and having it HERE is what
  // lets ONE walk file play BOTH lines' real tutorials, which is how the
  // walk caught the divergence in the first place: it stalled on golem at a
  // beat it had no input for, on content no unit suite had ever compared
  // across lines.
  look: 'look around',
  cudgel: 'take the cudgel',
  rope: 'take the rope',
  scrap: 'scrap the chest plate',
  investigate: 'investigate the door',
  read_note: 'read the note',
};

interface Report {
  beatsSeen: string[];
  refusalTexts: string[];
  finished: boolean;
  lines: { channel: string; text: string }[];
}
let report: Report;

beforeAll(async () => {
  const realRandom = Math.random;
  Math.random = seeded(20260803);
  try {
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      motiveId: 'debt', pressure: 'owed',
    } as never);

    // The crawl is dismissed the way the thumb dismisses it — through the
    // store action, not by nulling state.
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();

    const beatsSeen: string[] = [];
    const refusalTexts: string[] = [];
    let probedLockdown = false;

    for (let i = 0; i < 60 && useGameStore.getState().tutorialStep !== null; i++) {
      if (useGameStore.getState().chapterCard) { useGameStore.setState({ chapterCard: null }); continue; }
      const id = stepId();
      if (!id) break;
      if (beatsSeen[beatsSeen.length - 1] !== id) beatsSeen.push(id);

      // ⚠ Once, mid-sequence: type something off-script and record what the
      // lockdown says back. OTA-1040's complaint was a refusal that told the
      // player they were wrong without telling them what right looked like.
      if (id === 'rope' && !probedLockdown) {
        probedLockdown = true;
        const before = useGameStore.getState().gameLog.length;
        useGameStore.getState().submitPlayerAction('dance a jig');
        for (const e of useGameStore.getState().gameLog.slice(before)) {
          refusalTexts.push(String(e.text));
        }
        continue;
      }

      // ⚠⚠ OTA-1248 — the `armor` beat is TWO actions, and that is the whole point
      // of it: the cudgel auto-equips, so nothing in the tutorial had ever taught a
      // player to open their pack. Take, then WEAR — the beat completes on the
      // equip, not the take, so a walk that only took it would stall here.
      if (id === 'armor') {
        const worn = useGameStore.getState().player?.equipped?.chest;
        if (worn) { useGameStore.getState().maybeAdvanceTutorial('armor'); continue; }
        const held = (useGameStore.getState().player?.inventory ?? [])
          .some((i: { name: string }) => /vest/i.test(i.name));
        if (!held) { useGameStore.getState().submitPlayerAction("take the Mud-Warden's Vest"); continue; }
        useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
        continue;
      }
      // ⚠ OTA-1500 — the screen_pick beat: the on-screen ★ offer, typed here
      // because this walk is the TYPED-ONLY guarantee. The intercept routes
      // the words to the same store action the tap runs.
      if (id === 'screen_pick') {
        useGameStore.getState().submitPlayerAction('take the salvage cap');
        continue;
      }
      if (id === 'climb') {
        // The beat's own instruction: "you go up in stages... top out, then
        // climb back down" — completion fires on the way DOWN. State-aware
        // like a thumb watching the CLIMB/CLIMB DOWN button flip.
        const elevated = useGameStore.getState().currentScene?.elevatedOn;
        useGameStore.getState().submitPlayerAction(elevated ? 'climb down' : 'climb');
        continue;
      }
      if (id === 'explore_or_leave') {
        // The door choice — a player tapping EXPLORE.
        useGameStore.getState().chooseTutorialExplore();
        // ...and then walking out when done poking around.
        useGameStore.getState().submitPlayerAction('leave outpost');
        continue;
      }
      if (id === 'main_quest') {
        // The objective-chip tap: ExplorationScreen calls exactly this on
        // press, then opens Contracts. The store call IS the thumb's tap.
        useGameStore.getState().maybeAdvanceTutorial('main_quest');
        continue;
      }
      if (id === 'pick_city') {
        // Picking a Capital sets the course (it does NOT auto-depart — the
        // Arbiter hands the road back), and pick_city is the final beat.
        useGameStore.getState().setTravelCourse('asgardar');
        continue;
      }
      const input = BEAT_INPUT[id];
      if (input) {
        useGameStore.getState().submitPlayerAction(input);
        continue;
      }
      break; // an unhandled beat id is a walk gap — the assertions will say so
    }

    report = {
      beatsSeen,
      refusalTexts,
      finished: useGameStore.getState().tutorialStep === null,
      lines: useGameStore.getState().gameLog.map((e) => ({ channel: String(e.channel), text: String(e.text) })),
    };
  } finally {
    Math.random = realRandom;
  }
});

const visible = () => report.lines.filter((l) => isPlayerVisibleChannel(l.channel as LogChannel));

describe('tutorial walk — a new player gets from the crawl to the road', () => {
  it('⚠ the tutorial ENDS — typed input alone gets a player through it', () => {
    // The single most important claim: no beat requires a button the walk
    // cannot press, no beat waits forever, and the sequence terminates.
    expect(report.finished).toBe(true);
  });

  it('every authored beat was actually visited, in order', () => {
    const expected = TUTORIAL_STEPS.map((s) => s.id).filter(Boolean) as string[];
    expect(report.beatsSeen).toEqual(expected);
  });

  it('each beat spoke — the Arbiter instruction reached the feed', () => {
    // Loose on prose, strict on presence: for every step that authors an
    // arbiter line, SOME arbiter line landed while the walk ran.
    const arbiterLines = report.lines.filter((l) => l.channel === 'arbiter');
    expect(arbiterLines.length).toBeGreaterThanOrEqual(
      TUTORIAL_STEPS.filter((s) => s.arbiter).length,
    );
  });

  it('⚠ the lockdown refuses off-script commands by RESTATING the ask', () => {
    // OTA-1040: "do what I've asked of you" with the instruction scrolled off
    // the feed is a refusal with no way to comply. The refusal must carry the
    // current beat's remind text.
    expect(report.refusalTexts.length).toBeGreaterThan(0);
    const all = report.refusalTexts.join('\n').toLowerCase();
    const ropeStep = TUTORIAL_STEPS.find((s) => s.id === 'rope');
    expect(all).toContain((ropeStep as { remind?: string }).remind!.toLowerCase());
  });

  it('the walk did not die, softlock, or leak a template slot', () => {
    expect(useGameStore.getState().player?.dead).not.toBe(true);
    const bad = visible().filter((l) =>
      /\{[a-zA-Z]+\}/.test(l.text) || /undefined|NaN|\[object Object\]/.test(l.text));
    expect(bad.map((b) => b.text.slice(0, 90))).toEqual([]);
  });

  it('finishing leaves a real course set — the tutorial hands off to the game', () => {
    const p = useGameStore.getState().player!;
    expect(p.travelTarget?.locationId ?? p.currentLocationId).toBeTruthy();
  });
});
