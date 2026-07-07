// OTA-1000 — every scene "call to action" does something.
//
// Playtest design note: "if there's a call to action, the call to action
// has to actually DO something — even if it's something as minor as you
// knock on the steeple door when nobody's been able to answer in many
// years. Make those backstory fills."
//
// Before this change, evocative verbs the scene prose invites dead-ended:
//   • `knock` was a recognized intent but had NO switch case, so with no
//     matching hook it produced zero world output (a silent dead-end).
//   • `ring` / `pray` / `touch` / `tilt` / `answer` demoted to
//     intent='unknown' and drew the generic "Try: look around" refusal.
//
// Now a `gesture` intent covers the evocative verbs, and a call-to-action
// fallback (after the hook resolver, before the main switch) emits a
// thematic backstory-fill line for knock + gesture when no hook matched.
// A verb that DOES match an active hook must still route to the hook —
// the fallback only fires when the hook resolver declined.

jest.setTimeout(20000);

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
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { parseInput } from '../app/engine/parser';
import { callToActionLine, gestureFamily } from '../app/engine/callToAction';

async function bootstrap(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function lastWorldLine(): string | undefined {
  const log = useGameStore.getState().gameLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.channel === 'world') return log[i]!.text;
  }
  return undefined;
}

// The generic dead-end refusal the old code showed for these verbs.
const DEAD_END = /Try: look around|I'm not sure what you're trying to tell me|Tell me what you would do with it/i;

describe('OTA-1000 — call-to-action pure flavor unit', () => {
  it('classifies verbs into the right gesture family', () => {
    expect(gestureFamily('knock')).toBe('knock');
    expect(gestureFamily('ring')).toBe('sound');
    expect(gestureFamily('shout')).toBe('vocal');
    expect(gestureFamily('touch')).toBe('touch');
    expect(gestureFamily('pray')).toBe('reverent');
    expect(gestureFamily('tilt')).toBe('manipulate');
  });

  it('produces a non-empty line and strips a leading article from the noun', () => {
    const line = callToActionLine('knock', 'the steeple door');
    expect(line.length).toBeGreaterThan(20);
    expect(line).toMatch(/steeple door/);
    expect(line).not.toMatch(/the the/i);
  });

  it('falls back to an atmospheric phrase when the player names no noun', () => {
    const line = callToActionLine('shout', '');
    expect(line).toMatch(/dark ahead/);
  });
});

describe('OTA-1000 — parser routes evocative verbs to gesture', () => {
  it('ring / pray / touch / tilt / answer no longer demote to unknown', () => {
    for (const verb of ['ring', 'pray', 'touch', 'tilt', 'answer']) {
      const parsed = parseInput(`${verb} the thing`, { recentNouns: ['thing'] });
      expect(parsed.intent).toBe('gesture');
    }
  });
});

describe('OTA-1000 — call to action always does something in-scene', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  const CASES: Array<[string, RegExp]> = [
    ['knock on the steeple door', /steeple door/],
    ['ring the bells', /bells/],
    ['pray at the altar', /altar/],
    ['touch the pillar', /pillar/],
    ['answer the door', /door/],
    ['tilt the statue', /statue/],
  ];

  for (const [cmd, nounRe] of CASES) {
    it(`\`${cmd}\` emits a backstory-fill line, not a dead-end`, async () => {
      const store = await bootstrap(`CTA_${cmd.replace(/\W+/g, '_')}`);
      const scene = store.getState().currentScene!;
      store.setState({
        currentScene: {
          ...scene,
          enemies: [],
          hooks: [],
          ambientNouns: ['steeple door', 'bells', 'altar', 'pillar', 'door', 'statue', 'silt'],
          displayedAmbientNouns: ['steeple door', 'bells', 'altar', 'pillar', 'door', 'statue'],
        },
      });

      const logLenBefore = store.getState().gameLog.length;
      store.getState().submitPlayerAction(cmd);

      // Something new was logged.
      expect(store.getState().gameLog.length).toBeGreaterThan(logLenBefore);
      const world = lastWorldLine();
      expect(world).toBeTruthy();
      expect(world!).toMatch(nounRe);
      // And it is NOT the old generic dead-end refusal.
      const tail = store.getState().gameLog.slice(-4).map((e) => e.text).join('\n');
      expect(tail).not.toMatch(DEAD_END);
    });
  }
});

describe('OTA-1000 — a matching hook still wins over the flavor fallback', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('`knock` on an active steeple puzzle routes to the puzzle, not the flavor line', async () => {
    const store = await bootstrap('SteepleKnocker');
    const scene = store.getState().currentScene!;
    // Plant the steeple puzzle hook (3-knock). Its noun is "steeple".
    store.setState({
      currentScene: {
        ...scene,
        enemies: [],
        ambientNouns: ['steeple', 'silt'],
        displayedAmbientNouns: ['steeple', 'silt'],
        hooks: [
          {
            id: 'steeple_test',
            kind: 'submerged_steeple',
            nouns: ['steeple', 'steeple door', 'door'],
            resolved: false,
            stage: 0,
          } as any,
        ],
      },
    });

    store.getState().submitPlayerAction('knock on the steeple');
    // The puzzle resolver narrates its own intro/progress — the debug
    // "hook intercept" route line proves the hook won, not the fallback.
    const tail = store.getState().gameLog.slice(-6).map((e) => `[${e.channel}] ${e.text}`).join('\n');
    expect(tail).toMatch(/hook intercept|steeple|knock/i);
    // The generic flavor line ("stopped waiting a long time before you
    // arrived" / "does not return with company") must NOT be what showed.
    expect(tail).not.toMatch(/stopped waiting a long time before you arrived|does not return with company/i);
  });
});
