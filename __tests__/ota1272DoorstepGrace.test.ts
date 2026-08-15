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

// ⚠⚠ OTA-1272 — THE DOORSTEP GRACE.
//
// Owner, after his fresh character walked out of the tutorial outpost into a
// pack of FOUR Mud Wasps and died to the first hit: *"a pack of enemies right
// outside the door is rough get at least 2 free tile moves, then whatever."*
//
// The device log, in full: `leave outpost` → "A Mud Wasp emerges" in the SAME
// log batch → the Arbiter says flee → one exchange → "The buried world claims
// Frank." The exit tile rolled a full encounter (plus pack members) before the
// player had taken a single step.
//
// ⚠⚠ THE RULE, AS SHIPPED: walking out of an outpost grants free passage for
// the exit scene plus the next TWO overland moves (SAFE_EXIT_FREE_SCENES = 3
// wilderness scenes). While it holds, the encounter roll is skipped entirely —
// same suppression seam as the post-boss grace — and one unit burns per scene,
// so the window is measured in MOVES the way he asked, not in hours that rot
// while the player reads. From the third move on: whatever the tile rolls.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

jest.setTimeout(180_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

async function freshGameAtExplore(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
  sub('Frank'); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden's Vest");
  useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) {
    sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
  }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
}

const enemies = (): number => useGameStore.getState().currentScene?.enemies.length ?? 0;
const graceLeft = (): number => useGameStore.getState().player?.safeExitMovesLeft ?? 0;

describe('OTA-1272 — the doorstep is safe, and stays safe for two moves', () => {
  it('⚠⚠ THE OWNER\'S DEATH, RE-RUN THREE TIMES: the exit tile NEVER spawns', async () => {
    // The wasp pack was a random roll, so one clean exit proves little.
    // Three fresh characters walk out; the doorstep must be empty every time,
    // regardless of what the dice wanted.
    for (let run = 0; run < 3; run++) {
      await freshGameAtExplore();
      useGameStore.getState().submitPlayerAction('leave outpost');
      expect({ run, enemiesOnExit: enemies() }.enemiesOnExit).toBe(0);
      // The exit scene burned one of the three units.
      expect(graceLeft()).toBe(2);
    }
  });

  it('⚠⚠ ...and the NEXT TWO MOVES are free EVEN ON HOT DICE — then the window closes', async () => {
    await freshGameAtExplore();
    useGameStore.getState().submitPlayerAction('leave outpost');
    expect(enemies()).toBe(0);

    // ⚠⚠ Math.random pinned to 0.01 makes every spawn roll in the game want to
    // fire — the wasteland roll, the corruption pressure, the Aetherkin rise,
    // the revenant, the rival war party. Under grace, NONE may. This is what
    // caught the war party: the first draft gated four spawners, passed on
    // fair dice, and a probe run died to the FIFTH two steps from the gate.
    const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.01);
    try {
      useGameStore.getState().submitPlayerAction('go north');   // free move 1
      expect(enemies()).toBe(0);
      expect(graceLeft()).toBe(1);

      useGameStore.getState().submitPlayerAction('go north');   // free move 2
      expect(enemies()).toBe(0);
      expect(graceLeft()).toBe(0);
    } finally {
      rnd.mockRestore();
    }
    // "then whatever" — no assertion that move 3 spawns (it is a fair roll
    // again); the next test proves the shield genuinely drops.
  });

  it('⚠⚠ the window CLOSES — with grace spent, a hot tile spawns exactly as before', async () => {
    // The suppression must not have quietly neutered encounters everywhere.
    // Force the dice hot (Math.random → 0.01 makes every chance() pass) and
    // begin a wilderness scene twice: once under grace (must stay empty),
    // once with grace spent (must spawn). Same tile, same dice — only the
    // counter differs, so whatever appears is the grace and nothing else.
    await freshGameAtExplore();
    useGameStore.getState().submitPlayerAction('leave outpost');
    const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.01);
    try {
      useGameStore.setState((s) => ({
        player: s.player ? { ...s.player, safeExitMovesLeft: 3 } : s.player,
      } as never));
      useGameStore.getState().beginScene({ skipHubEntry: true });
      expect(enemies()).toBe(0);            // shield up: hot dice, no spawn

      useGameStore.setState((s) => ({
        player: s.player ? { ...s.player, safeExitMovesLeft: 0 } : s.player,
      } as never));
      useGameStore.getState().beginScene({ skipHubEntry: true });
      expect(enemies()).toBeGreaterThan(0); // shield down: same dice, spawn
    } finally {
      rnd.mockRestore();
    }
  });

  it('⚠ the tutorial leave-door grants the same passage', async () => {
    // chooseTutorialLeave walks the player out through its own code path —
    // the four exit doors all stamp the same counter, or the tutorial player
    // (the greenest character in the game) would be the one left unshielded.
    await freshGameAtExplore();
    useGameStore.getState().chooseTutorialLeave?.();
    if (useGameStore.getState().player?.hubRoomId === null) {
      expect(enemies()).toBe(0);
      expect(graceLeft()).toBeGreaterThanOrEqual(2);
    }
  });
});
