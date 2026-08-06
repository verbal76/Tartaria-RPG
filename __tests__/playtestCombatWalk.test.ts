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
 * ⚠ THE COMBAT WALK — FIGHTS PLAYED THROUGH THE FEED, NOT THROUGH THE DICE.
 *
 * The phases 0-5 harness skips fights on purpose: combat's dice have their
 * own unit suites, and the story consequences of winning are what that walk
 * grades. This walk covers the half that leaves: when the seeded world DOES
 * put enemies in front of the player, the fight itself has to read right.
 *
 * So: walk until encounters happen (no spawn forcing — the seeded arrival
 * rolls decide, same as a phone), then fight every one of them with the same
 * typed 'attack' a thumb sends, healing when hurt, and grade the FEED:
 * combat narration on the combat channel, damage that names a number, an
 * outcome for every engagement, and no template slots or contradictions.
 *
 * Deliberately loose about WHO shows up and WHO wins — the seed decides and
 * either outcome is a valid playthrough. Strict about SHAPES: a swing that
 * narrates nothing, an enemy that dies without a line, a fight that never
 * ends — those are the failures this exists to catch.
 */
jest.setTimeout(240_000);

import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';
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

const WALK = [
  'tartarian_outskirts', 'mud_seas', 'great_tartary_plains', 'buried_cities',
  'obsidian_pillars', 'zharaks_teeth', 'cradle_of_dusk', 'drakova',
];

interface Fight {
  foes: string[];
  swings: number;
  outcome: 'cleared' | 'escaped' | 'died' | 'stalled';
}
interface Report {
  fights: Fight[];
  lines: { channel: string; text: string }[];
  died: boolean;
}
let report: Report;

/** ⚠ YIELD LIKE A PHONE. handlePlayerDeath (and other consequences) are
 *  deferred via Promise.resolve().then(...) — a microtask. On a device the
 *  event loop yields between taps so they fire instantly; a synchronous test
 *  loop never yields, so the walk's first cut starved the death flow and
 *  "found" a zombie player at 0 HP with dead undefined. That was the harness
 *  outrunning the runtime, not the game failing to kill. Every action in this
 *  walk is followed by a flush, the way every real tap is. */
const flush = () => new Promise<void>((r) => setImmediate(r));

const liveEnemies = () => {
  const s = useGameStore.getState().currentScene;
  if (!s) return [];
  return s.enemies.filter((_, i) => (s.enemyHps[i] ?? 0) > 0);
};

/** ⚠ THE DICE OVERLAY, TAPPED. An attack stages pendingRolls and
 *  submitPlayerAction drops ALL input while it is up — the thumb rolls the
 *  dice on the overlay and DiceRoller auto-resolves via resolveRollStep.
 *  This is that tap: roll each staged step with the SAME seeded RNG the run
 *  uses everywhere else, exactly the values a phone's roller would produce.
 *  (The walk's first cut typed 'attack' sixty times into a wall: every swing
 *  after the first was silently swallowed by the open overlay.) */
function rollThroughOverlay(): void {
  for (let guard = 0; guard < 12; guard++) {
    const pr = useGameStore.getState().pendingRolls;
    if (!pr) return;
    const step = pr.steps[pr.currentStep]!;
    const adv = step.rollMode === 'advantage';
    const dis = step.rollMode === 'disadvantage';
    const rolls = adv || dis ? 2 : step.count;
    const values: number[] = [];
    for (let i = 0; i < rolls; i++) values.push(1 + Math.floor(Math.random() * step.sides));
    const kept = adv ? [Math.max(...values)] : dis ? [Math.min(...values)] : values;
    useGameStore.getState().resolveRollStep(kept);
  }
}

beforeAll(async () => {
  const realRandom = Math.random;
  Math.random = seeded(77002026);
  try {
    await useGameStore.getState().startNewGame({
      name: 'Brawler', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    useGameStore.setState({ tutorialStep: null, storyIntro: null, chapterCard: null });

    const fights: Fight[] = [];

    for (let step = 0; step < 120; step++) {
      const st = useGameStore.getState();
      if (st.pendingFork) { st.answerFork(st.pendingFork.options[0]!.id); continue; }
      if (st.chapterCard) { useGameStore.setState({ chapterCard: null }); continue; }
      if (st.player?.dead) break;

      const foes = liveEnemies();
      if (foes.length > 0) {
        // ⚠ FIGHT IT THE WAY A THUMB DOES: type 'attack' until the scene
        // clears, the player drops, or the fight refuses to progress. The
        // stall bound is generous — a long fight is fine, a fight where
        // sixty swings change nothing is a bug with a name.
        const fight: Fight = { foes: foes.map((f) => f.name), swings: 0, outcome: 'stalled' };
        const outnumberedAtStart = foes.length >= 2;
        for (let round = 0; round < 60; round++) {
          if (useGameStore.getState().player?.dead) { fight.outcome = 'died'; break; }
          if (liveEnemies().length === 0) {
            fight.outcome = fight.swings > 0 && outnumberedAtStart ? 'escaped' : 'cleared';
            break;
          }
          const hp = useGameStore.getState().player!.hp;
          const hpMax = useGameStore.getState().player!.hpMax;
          if (hp < hpMax * 0.5) {
            // A hurt player reaches for the kit mid-fight; if there is none,
            // the swing continues — dying is a legal playthrough.
            useGameStore.getState().submitPlayerAction('use first aid kit');
            rollThroughOverlay();
            await flush();
          }
          // ⚠ RANGE IS REAL. A melee blade at mid-range is refused with
          // "ADVANCE to close in" — the OTA-1029 reach-gate doing its job
          // (the walk's second cut swung sixty times into that refusal).
          // So the walk closes distance first, the way the refusal says to.
          //
          // ⚠ AND SO IS DEFENSE. Attack-only at AC 10 loses 1v2 on every
          // seed tried — which is the combat model working, not failing:
          // dodge exists (and the owner's own playtests flagged it as the
          // dominant defensive verb). The walk fights like a player who has
          // read the tutorial: swing, then guard, and keep the blade moving.
          const range = useGameStore.getState().currentScene?.range;
          const outnumbered = liveEnemies().length >= 2;
          if (outnumbered) {
            // ⚠ A LEVEL-ONE CHARACTER DOES NOT WIN A 2v1, and the game is
            // built knowing it: attack-only died in 2-7 swings on every seed
            // tried, at full honesty. Flee (contested, OTA-1032) is the verb
            // the game hands you for exactly this moment, so the walk uses
            // it — and if the escape roll fails, it keeps fighting, which is
            // also exactly what happens on a phone.
            useGameStore.getState().submitPlayerAction('flee');
          } else if (range && range !== 'close') {
            useGameStore.getState().submitPlayerAction('advance');
          } else if (round % 2 === 1) {
            useGameStore.getState().submitPlayerAction('dodge');
          } else {
            useGameStore.getState().submitPlayerAction('attack');
          }
          rollThroughOverlay();
          await flush();
          fight.swings += 1;
        }
        if (fight.outcome === 'stalled' && liveEnemies().length === 0) fight.outcome = 'cleared';
        fights.push(fight);
        // A real player licks their wounds before walking on.
        for (let r = 0; r < 6 && !useGameStore.getState().player?.dead
          && (useGameStore.getState().player?.hp ?? 0) < (useGameStore.getState().player?.hpMax ?? 1) * 0.8; r++) {
          useGameStore.getState().submitPlayerAction('rest');
          rollThroughOverlay();
          await flush();
        }
        continue;
      }

      // No fight on this tile — move on. Arrival rolls are the game's own;
      // nothing here forces a spawn.
      useGameStore.getState().travelTo(WALK[step % WALK.length]!);
      await flush();
      const now = useGameStore.getState().player!;
      useGameStore.setState({
        player: { ...now, hoursElapsed: (now.hoursElapsed ?? 0) + 10 } as PlayerCharacter,
      });
    }

    report = {
      fights,
      lines: useGameStore.getState().gameLog.map((e) => ({ channel: String(e.channel), text: String(e.text) })),
      died: useGameStore.getState().player?.dead === true,
    };
  } finally {
    Math.random = realRandom;
  }
});

const visible = () => report.lines.filter((l) => isPlayerVisibleChannel(l.channel as LogChannel));
const combatLines = () => report.lines.filter((l) => l.channel === 'combat');

describe('combat walk — the seeded world actually fought back', () => {
  it('⚠ encounters happened without being forced', () => {
    // If the seed stops producing fights on this walk, the walk is not a
    // combat walk any more — change the route, not the game.
    expect(report.fights.length).toBeGreaterThan(0);
  });

  it('⚠ every fight ENDED — cleared or died, never stalled', () => {
    // Sixty swings with live enemies still standing is a progress bug
    // regardless of the dice: hit chances, enemy HP and damage ranges make
    // sixty rounds of stalemate astronomically unlikely unless something is
    // eating the swing.
    expect(report.fights.map((f) => `${f.foes.join('+')} → ${f.outcome}`))
      .toEqual(report.fights.map((f) => `${f.foes.join('+')} → ${f.outcome === 'stalled' ? 'ENDED' : f.outcome}`));
  });

  it('the fights narrated on the combat channel', () => {
    expect(combatLines().length).toBeGreaterThan(0);
  });

  it('damage says a number somewhere — the OTA-842 breakdown is alive', () => {
    const numbered = combatLines().filter((l) => /\d/.test(l.text));
    expect(numbered.length).toBeGreaterThan(0);
  });

  it('a cleared fight leaves no live enemy behind in state', () => {
    // The feed and the state must agree: if the last fight cleared, the
    // scene's enemy HPs say so too.
    const last = report.fights[report.fights.length - 1]!;
    if (last.outcome === 'cleared' && !report.died) {
      expect(liveEnemies().length).toBe(0);
    }
  });

  it('⚠ no template slots, no undefined, no [object Object] under fire', () => {
    // Combat is the highest line-volume system in the game; it is where a
    // formatting hole ships first.
    const bad = visible().filter((l) =>
      /\{[a-zA-Z]+\}/.test(l.text) || /undefined|NaN|\[object Object\]/.test(l.text));
    expect(bad.map((b) => b.text.slice(0, 90))).toEqual([]);
  });

  it('death, if it happened, was told to the player', () => {
    if (report.died) {
      const feed = visible().map((l) => l.text).join('\n').toLowerCase();
      expect(/fall|dead|death|black|end/.test(feed)).toBe(true);
    }
  });

  it('the walk leaves a readable trace for the owner', () => {
    const digest = [
      '',
      '── COMBAT-WALK DIGEST ──────────────────────────────────────',
      `  fights           ${report.fights.length}`,
      ...report.fights.map((f) => `    ${f.foes.join(' + ')}  —  ${f.swings} swings → ${f.outcome}`),
      `  combat lines     ${combatLines().length}`,
      `  player           ${report.died ? 'DIED (a legal playthrough)' : `alive at ${useGameStore.getState().player?.hp}/${useGameStore.getState().player?.hpMax} HP`}`,
      '────────────────────────────────────────────────────────────',
      '',
    ].join('\n');
    process.stdout.write(digest);
    expect(digest).toContain('COMBAT-WALK DIGEST');
  });
});
