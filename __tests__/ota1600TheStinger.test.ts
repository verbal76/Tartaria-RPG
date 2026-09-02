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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1600 — THE STINGER: a text cutscene for the moment the mission's
// fight stands up.
//
// Owner: "should the big boss of the mission have a line of dialogue on a pop
// up to pull your attention back into the mission. like the ambush could have
// had a pop up with the mission title up top and something like the ambush
// leader yells there he is, make short work of him ... not a talk card, just a
// popup to focus your attention? a text cutscenes?"
//
// His own bundle (mti0ay8get84) made the case: the raider pack and the
// Reaver's arrival were single log lines inside combat noise, and he typed
// "still didn't progress" while standing in the mission's own fight. Now the
// one writer that stands bodies up (advanceHunt) raises the popup — mission
// title on top, one authored shout — and logs the line so the record keeps it.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS } from '../app/engine/hunts';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function seedDoubter(stage: number, at: string, opts: { indoors?: boolean } = {}) {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt(at),
      hubRoomId: opts.indoors ? 'outpost_gate' : null,
      stamina: 100,
      travelTarget: undefined,
      whisperCourse: null,
      inventory: p.inventory.filter((i) => !/Mark of Sanction|Spiral-Mark Stone|Ridge-Sign/.test(i.name)),
      activeHunts: [{ id: 'hunt_servants_doubter', stage, tracked: true } as never],
    },
    activeBuildingId: null,
    pendingMissionStinger: null,
  });
  set((s) => (s.currentScene ? {
    currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
  } : s));
}

describe('OTA-1600 — the stinger fires when bodies stand up, and only then', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Stung', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE AMBUSH — the raider pack stands up and the sworn man gets his line, on a card and in the log', () => {
    seedDoubter(1, 'great_tartary_plains');
    get().advanceHunt('hunt_servants_doubter');
    const stinger = get().pendingMissionStinger;
    expect(stinger?.title).toBe('Silence the Doubter');
    expect(stinger?.line).toContain('He said a shrine would send someone');
    expect(get().gameLog.slice(-8).some((e) => e.text.includes('He said a shrine would send someone'))).toBe(true);
    expect((get().currentScene?.enemies ?? []).length).toBe(3); // the shout is never over an empty field
  });

  it('⚠⚠⚠ THE BIG BOSS — the Reaver crests the ridge with his own line', () => {
    get().dismissMissionStinger();
    seedDoubter(4, 'raiders_ridge');
    get().advanceHunt('hunt_servants_doubter');
    expect(get().pendingMissionStinger?.line).toContain('Come, then');
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('⚠⚠ a prose-only close shouts at nobody — no bodies, no popup', () => {
    get().dismissMissionStinger();
    seedDoubter(3, 'raiders_ridge'); // attack_provoke, no spawn: the gauntlet resolves in prose
    get().advanceHunt('hunt_servants_doubter');
    expect(get().pendingMissionStinger).toBeNull();
  });

  it('⚠⚠ the truce refusal is not a fight — indoors, no popup either', () => {
    seedDoubter(1, 'tartarian_outskirts', { indoors: true });
    get().advanceHunt('hunt_servants_doubter');
    expect(get().pendingMissionStinger).toBeNull();
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
  });

  it('⚠⚠ a peaceful advance stands NOBODY up — no boss, no shout (the OTA-1581 contract, finally honoured at the boss scale)', () => {
    seedDoubter(4, 'raiders_ridge');
    get().advanceHunt('hunt_servants_doubter', { peaceful: true });
    expect(get().pendingMissionStinger).toBeNull();
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
  });

  it('⚠ dismiss clears it, once', () => {
    seedDoubter(1, 'great_tartary_plains');
    get().advanceHunt('hunt_servants_doubter');
    expect(get().pendingMissionStinger).not.toBeNull();
    get().dismissMissionStinger();
    expect(get().pendingMissionStinger).toBeNull();
  });
});

describe('OTA-1600 — every stage that stands bodies up carries a line, and no other stage does', () => {
  it('⚠⚠ THE RATCHET: stinger coverage is exactly the stands-up set', () => {
    const missing: string[] = [];
    const stray: string[] = [];
    for (const h of HUNTS) {
      (h.stages ?? []).forEach((raw, i) => {
        const st = raw as { checkKind?: string | null; spawn?: unknown; stinger?: string };
        const standsUp = st.checkKind === 'boss' || !!st.spawn;
        if (standsUp && !(st.stinger && st.stinger.trim().length > 0)) missing.push(`${h.id}#${i}`);
        if (!standsUp && st.stinger) stray.push(`${h.id}#${i}`);
        if (st.stinger) expect(st.stinger.length).toBeLessThanOrEqual(160); // a shout, not a paragraph
      });
    }
    expect(missing).toEqual([]);
    expect(stray).toEqual([]);
  });

  it('⚠⚠ the screen raises the card and holds the first-fight primer behind it', () => {
    const SCREEN = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(SCREEN).toContain('<MissionStingerModal stinger={pendingMissionStinger} onClose={dismissMissionStinger} />');
    const primer = SCREEN.indexOf('const combatPrimerOpen =');
    expect(SCREEN.slice(primer, primer + 240)).toContain('!pendingMissionStinger');
  });

  it('⚠ the one writer sets it only when something actually stood up', () => {
    const QSL = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
    // ⚠ OTA-1622 superseded the line: the FIGHT card is raised through
    // `raiseMissionClose` whenever bodies stood up (the authored stinger when
    // there is one, the stage's prose otherwise), and it now carries the
    // close's freight. The gate is still `stoodUp` and nothing else.
    expect(QSL).toContain('if (stoodUp) {\n      if (stageDef.stinger) get().appendLog(\'combat\', stageDef.stinger);');
    expect(QSL).toContain('fight: true,');
    // And the modal is story, not a tip: the component has no hints gate.
    const MODAL = readFileSync(join(__dirname, '..', 'app', 'components', 'MissionStingerModal.tsx'), 'utf8');
    expect(MODAL).not.toContain('setHintsDisabled');
  });
});
