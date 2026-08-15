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
 * OTA-1051 — Phase 0, items 3 and 4.
 *
 * ── ARBITER COOLDOWN DISCIPLINE ────────────────────────────────────────────
 * ROOT CAUSE: every guard on the ambient path runs at generation START — no
 * combat, not in the tutorial, cooldown expired — and NONE run at emit. On
 * device a musing takes 14-20s (owner's 4.28.79 log: `ambient ✓ 14080ms`), by
 * which time the player has crossed a room or opened a fight. The line was
 * composed for a moment that no longer exists.
 *
 * This was deliberate: the arb163 comment says ambient asides "can run to
 * completion in the background and speak whenever ready". The REACTIVE path
 * already has the discipline the ambient path lacks (arbiterGenerationEpoch,
 * checked as "cancelled mid-flight"). Ambient was exempted from it.
 *
 * The fix is not the epoch — every reactive generation bumps that counter, so
 * reusing it would discard nearly every ambient line and silently kill a
 * feature that only just started working (OTA-1031). What makes an ambient
 * musing read wrong is that the SITUATION changed underneath it. So the
 * situation is stamped at start and checked before it speaks.
 *
 * ── STORY BEATS ────────────────────────────────────────────────────────────
 * ROOT CAUSE: there is no notion of "story" in the log at all. A main-quest
 * phase turn, the 3-Core twist, the 4-Core forge and every motive-drip beat
 * call appendLog('arbiter', …) — the same channel, colour and chip the Arbiter
 * uses to shrug about your stamina. A `storyBeat` meta flag (not a new
 * LogChannel — that would ripple into TTS routing, HIDDEN_CHANNELS and the
 * copy-all export) reaches the renderer, which gives the beat a rule, a STORY
 * chip and its own air.
 */
jest.setTimeout(60_000);

import { useGameStore, STORY_BEAT_META } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

describe('OTA-1051 — the story-beat marker', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('is a meta flag, NOT a new log channel', () => {
    // A channel drives TTS routing, HIDDEN_CHANNELS and the copy-all export.
    // A story beat needs none of those changed — only how it looks. If this
    // ever becomes a channel, every one of those consumers needs revisiting.
    expect(STORY_BEAT_META).toEqual({ storyBeat: true });
  });

  it('survives appendLog onto the entry the renderer reads', async () => {
    const store = await boot('Marked');
    store.getState().appendLog('arbiter', 'The stair opens.', { ...STORY_BEAT_META });
    const last = store.getState().gameLog[store.getState().gameLog.length - 1]!;
    expect((last.meta as { storyBeat?: boolean })?.storyBeat).toBe(true);
    expect(last.channel).toBe('arbiter'); // voice unchanged — only the look
  });

  it('leaves ordinary lines unflagged, so the marker means something', async () => {
    const store = await boot('Plain');
    store.getState().appendLog('reward', '✦ Rusted Bolt (Common).');
    store.getState().appendLog('arbiter', 'The Arbiter watches you sign.');
    for (const e of store.getState().gameLog.slice(-2)) {
      expect((e.meta as { storyBeat?: boolean })?.storyBeat).toBeUndefined();
    }
  });

  it('the flag does not disturb the meta bag it shares with combatOutcome', async () => {
    const store = await boot('Shared');
    store.getState().appendLog('combat', 'You hit.', { combatOutcome: 'player_dmg', ...STORY_BEAT_META });
    const last = store.getState().gameLog[store.getState().gameLog.length - 1]!;
    const meta = last.meta as { storyBeat?: boolean; combatOutcome?: string };
    expect(meta.storyBeat).toBe(true);
    expect(meta.combatOutcome).toBe('player_dmg');
  });
});

describe('OTA-1051 — the story sites are actually wired', () => {
  // Reading the source is the honest check here: the main-quest phase beats
  // fire deep inside a progression that a unit test cannot reach without
  // fabricating five Cores, and a test that fabricated them would be asserting
  // its own setup rather than the wiring.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'),
    'utf8',
  );

  it('marks the main-quest phase narration', () => {
    expect(src).toMatch(/narrationForPhase\(nextState\.phase[\s\S]{0,220}STORY_BEAT_META/);
  });

  it('marks the descent beat', () => {
    expect(src).toMatch(/descentLine, \{ \.\.\.STORY_BEAT_META \}/);
  });

  it('marks the 3-Core twist and the 4-Core forge', () => {
    expect(src).toMatch(/twistLine, \{ \.\.\.STORY_BEAT_META \}/);
    expect(src).toMatch(/fourCoreForgeLine\(\), \{ \.\.\.STORY_BEAT_META \}/);
  });

  it('marks the motive drip and The Missing\'s resolution', () => {
    expect(src).toMatch(/beat\.speaker, beat\.text, \{ \.\.\.STORY_BEAT_META \}/);
    expect(src).toMatch(/res\.arrival\)[\s\S]{0,120}STORY_BEAT_META/);
  });

  it('does NOT mark contract stage narration — that has MISSION and the card', () => {
    // Scoping matters: if half the feed is a story beat, the marker is wallpaper.
    expect(src).not.toMatch(/stage0\.narration, \{ \.\.\.STORY_BEAT_META \}/);
  });
});

describe('OTA-1051 — ambient staleness', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'),
    'utf8',
  );

  it('stamps the situation at generation start', () => {
    expect(src).toMatch(/const stamp = takeAmbientStamp\(get\)/);
  });

  it('checks the stamp BEFORE the line is appended', () => {
    const stale = src.indexOf('const staleReason = ambientStaleReason(get, stamp)');
    const emit = src.indexOf("if (ambientUsable) get().appendLog('arbiter', finalText)");
    expect(stale).toBeGreaterThan(0);
    expect(emit).toBeGreaterThan(stale);
  });

  it('a stale line is never spoken', () => {
    // ambientUsable is the single gate on the appendLog, and staleReason is
    // the first term in it.
    expect(src).toMatch(/const ambientUsable = !staleReason && /);
  });

  it('every drop reason reaches the debug marker a pasted log will show', () => {
    for (const reason of ['combat-started', 'moved-location', 'moved-room', 'moved-scene', 'log-moved-on']) {
      expect(src).toContain(`return '${reason}'`);
    }
    expect(src).toMatch(/stale:\$\{staleReason\}/);
  });

  it('does NOT reuse arbiterGenerationEpoch', () => {
    // The epoch is bumped by EVERY reactive generation. Gating ambient on it
    // would discard almost every musing and silently undo OTA-1031.
    const fnStart = src.indexOf('async function maybeGenerateAmbientArbiter');
    const fnEnd = src.indexOf('\nasync function ', fnStart + 10);
    const body = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toContain('arbiterGenerationEpoch');
  });

  it('combat is guarded at BOTH ends, not just at the start', () => {
    // The pre-existing guard refuses to BEGIN in combat; the new one refuses
    // to finish into one. A fight that starts mid-generation is the loudest
    // possible change of subject.
    expect(src).toMatch(/if \(!scene \|\| !player \|\| scene\.enemies\.length > 0\) return;/);
    expect(src).toMatch(/if \(now\.inCombat && !at\.inCombat\) return 'combat-started';/);
  });
});
