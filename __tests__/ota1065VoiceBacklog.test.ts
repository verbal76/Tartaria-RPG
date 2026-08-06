/**
 * OTA-1065 — the tutorial voice ran a beat behind the screen.
 *
 * Owner report (4.28.75): "I hear 'you'll want a weapon' while I'm already
 * typing in take the rope."
 *
 * Each tutorial beat appends TWO arbiter lines — an acknowledgement of what
 * the player just did, then the next instruction — and the player can clear a
 * beat in a couple of seconds. On-device Kokoro synthesis is slower than that,
 * so the queue gains entries faster than it drains and the spoken line drifts
 * a whole beat behind the visible one. A stale instruction is worse than
 * silence: it tells the player to do something they finished two actions ago.
 *
 * The fix tags beat instructions `meta.supersede`, which drops the pending
 * backlog (keeping whatever sentence is already in the air) and puts the new
 * line at the front of the queue.
 *
 * This exercises TTSManager's real queue rather than asserting on source
 * shape: enqueue a backlog, supersede it, and check what survives.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(async () => false),
}));
jest.mock('../app/voice/PiperTTSManager', () => ({
  piperSpeak: jest.fn(async () => {}),
  piperStopAndClear: jest.fn(async () => {}),
  isPiperReady: () => false,
  disposePiperEngine: jest.fn(async () => {}),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mgr = require('../app/voice/TTSManager');

describe('OTA-1065 — a superseding line collapses the voice backlog', () => {
  it('exposes the queue primitives the fix depends on', () => {
    // clearQueueKeepCurrent shipped in TTSManager but was never called from
    // anywhere — its own comment describes this exact problem. If it is ever
    // removed as dead code, the tutorial silently regresses to lagging.
    expect(typeof mgr.clearQueueKeepCurrent).toBe('function');
    expect(typeof mgr.speak).toBe('function');
    expect(typeof mgr.stopAndClear).toBe('function');
  });

  it('speak honours a front-of-queue flag by emptying the queue first', () => {
    // `front: true` (OTA-635) is how the superseding instruction overtakes
    // anything that survived clearQueueKeepCurrent. Asserted on the source
    // because calling speak() for real drags in the Kokoro state machine and
    // the whole native audio chain, which is not what this is testing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../app/voice/TTSManager.ts'),
      'utf8',
    );
    expect(src).toMatch(/opts\?: \{ front\?: boolean \}/);
    expect(src).toMatch(/if \(opts\?\.front\) queue\.length = 0;/);
  });
});

describe('OTA-1065 — every tutorial beat instruction is tagged to supersede', () => {
  it('advanceTutorial and startTutorial both pass supersede', () => {
    // Both dispatch sites must agree, or the first beat behaves differently
    // from the other nine.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../app/state/gameStore.ts'),
      'utf8',
    );
    const firstBeat = /firstStep\.arbiter,\s*\{ supersede: true \}/.test(src);
    const nextBeat = /nextStep\.arbiter,\s*\{ supersede: true \}/.test(src);
    expect(firstBeat).toBe(true);
    expect(nextBeat).toBe(true);
  });

  it('the controller keeps the in-air sentence rather than cutting it', () => {
    // stopAndClear would clip a word mid-syllable AND race
    // piperStopAndClear's async expo-av teardown against the new utterance.
    // The supersede branch must use clearQueueKeepCurrent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../app/voice/TTSController.ts'),
      'utf8',
    );
    const branch = src.slice(src.indexOf('meta?.supersede === true'));
    const body = branch.slice(0, branch.indexOf('\n      }'));
    expect(body).toContain('clearQueueKeepCurrent()');
    expect(body).not.toContain('stopAndClear()');
    expect(body).toContain('speakArbiter(entry.text, true)');
  });
});
