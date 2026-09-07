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
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { spawnGuardianForCapital, dropsForCapital, GUARDIANS_BY_CAPITAL } from '../app/engine/coreGuardians';
import { canonicalCellOf } from '../app/engine/worldMap';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(300000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');
const CAP = Object.keys(GUARDIANS_BY_CAPITAL)[0]!;

async function boot(): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  await flush();
}
/** ⚠⚠ SWING UNTIL IT IS DOWN. One `attack` does not reliably kill: a miss, a
 *  reach refusal or a roll card all eat the action, and a test that accepts
 *  "nothing happened" would let the re-run case pass VACUOUSLY - which the first
 *  version of this suite did, 0 -> 0 on both sides. */
async function fightItOut(): Promise<number> {
  for (let i = 0; i < 40; i++) {
    const st = useGameStore.getState();
    if ((st.currentScene?.enemies ?? []).length === 0) return i;
    if (st.pendingRolls) {
      const step = st.pendingRolls.steps[st.pendingRolls.currentStep] as { dice?: string } | undefined;
      const n = Number(/d(\d+)/.exec(String(step?.dice ?? 'd20'))?.[1] ?? 20);
      st.resolveRollStep([Math.max(1, n)]); await flush(); continue;
    }
    const me = st.player!;
    if ((me.hp ?? 0) < 30) useGameStore.setState({ player: { ...me, hp: me.hpMax ?? 60, stamina: me.staminaMax ?? 20 } } as never);
    const sc = useGameStore.getState().currentScene!;
    // keep the guardian on one hit point so the kill does not depend on damage rolls
    useGameStore.setState({ currentScene: { ...sc, enemyHps: (sc.enemyHps ?? []).map(() => 1), range: 'close' } } as never);
    await useGameStore.getState().submitPlayerAction('attack');
    await flush(); await flush();
  }
  return -1;
}

const countOf = (name: string): number =>
  (useGameStore.getState().player?.inventory ?? []).filter((i) => i.name === name).reduce((n, i) => n + (i.quantity ?? 1), 0);

/** Stand the Guardian up in the scene and put the player on the capital's cell. */
function armGuardian(alreadyBeaten: boolean): void {
  const p = useGameStore.getState().player!;
  const c = canonicalCellOf(CAP);
  const withMq = {
    ...p, currentLocationId: CAP, gridX: c.x, gridY: c.y, travelTarget: null,
    hp: p.hpMax ?? 60,
    mainQuest: { phase: 'cores' as const, coresRecovered: [], guardiansDefeated: alreadyBeaten ? [CAP] : [] },
  };
  const g = spawnGuardianForCapital(withMq as never, CAP)!;
  useGameStore.setState({
    player: withMq,
    currentScene: { ...useGameStore.getState().currentScene!, enemies: [g], enemyHps: [1], activeEnemyIdx: 0, range: 'close' },
  } as never);
}

describe('OTA-1729 - the Core Guardian payout guards itself', () => {
  it('⚠ SOURCE: the drop is gated on the same flag the block writes', () => {
    const SRC = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(SRC).toContain('const alreadyBeaten = (get().player?.mainQuest?.guardiansDefeated ?? []).includes(capitalId);');
    expect(SRC).toContain('const drops = alreadyBeaten ? null : cg.dropsForCapital(capitalId);');
  });

  it('⚠⚠ a FIRST defeat still hands over the signature weapon and armour', async () => {
    await boot(); armGuardian(false);
    const d = dropsForCapital(CAP)!;
    const before = countOf(d.weapon.name) + countOf(d.armor.name);
    const rounds = await fightItOut();
    const after = countOf(d.weapon.name) + countOf(d.armor.name);
    W(`  first defeat at ${CAP} (${rounds} rounds): signature pieces ${before} -> ${after}`);
    expect(rounds).toBeGreaterThanOrEqual(0);          // it actually died
    expect(after).toBeGreaterThan(before);
  });

  it('⚠⚠⚠ a RE-RUN against an already-beaten Guardian hands over NOTHING', async () => {
    await boot(); armGuardian(true);   // the flag the block itself writes is already set
    const d = dropsForCapital(CAP)!;
    const before = countOf(d.weapon.name) + countOf(d.armor.name);
    const rounds = await fightItOut();
    const after = countOf(d.weapon.name) + countOf(d.armor.name);
    W(`  re-run at ${CAP} (${rounds} rounds): signature pieces ${before} -> ${after} (must not move)`);
    // ⚠ the kill must actually have happened, or this assertion proves nothing
    expect(rounds).toBeGreaterThanOrEqual(0);
    expect(useGameStore.getState().currentScene?.enemies ?? []).toHaveLength(0);
    expect(after).toBe(before);
  });
});
