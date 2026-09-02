// ⚠⚠⚠ OTA-1620 — THE WHOLE CONTRACTS SCREEN LIVES BEHIND MISSIONS.
//
// Owner, after running OTA-1618: *"it only shows me six missions, so you're
// picking a subcategory and saying that that's all the missions. what I wanted
// was an exact duplication of the contracts screen on the missions button. I
// don't want the contract screen to be separate anymore. I want the whole thing
// under the missions button so I can hit it and be done."* — *"And I would like
// it in the same style as the contracts tab so it looks the same."*
//
// ⚠⚠ THE CARD WAS THE WRONG OBJECT. OTA-1615/1617/1618 built a reader-shaped
// summary and kept adding families and actions to it; he never wanted a
// summary. The screen he wanted already existed — ContractsScreen, every
// section, every button, its own ← BACK. It only needed to be the thing the
// MISSIONS button opens. So MISSIONS opens ContractsScreen itself, the card and
// its wiring are deleted, and the button stays where 1618 put it: on the primary
// row beside MORE, always visible. There was never a tab bar; the "tab" was
// only ever the set of doors into this screen, and MISSIONS is now the main one.
//
// ⚠ What stays: `missionStatusCards` in missionTrace.ts is the LOG's sibling
// reader and other suites hold it to the trace; no surface renders it after
// this OTA (recorded in HANDOFF as debt, not deleted here — one OTA, one change).

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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

jest.setTimeout(120000);

const root = join(__dirname, '..');
const src = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

describe('OTA-1620 — MISSIONS opens the Contracts screen itself', () => {
  const EXPL = src('app', 'screens', 'ExplorationScreen.tsx');
  const APP = src('App.tsx');
  const INPUT = src('app', 'components', 'InputBox.tsx');
  const CONTRACTS = src('app', 'screens', 'ContractsScreen.tsx');

  it('⚠⚠⚠ THE BUTTON OPENS THE SCREEN HE ASKED FOR — the same one, not a summary of it', () => {
    // onOpenMissions goes straight to the Contracts screen; the tutorial beat
    // it advances on the way is kept (Tungsten Spire's main_quest beat).
    const at = EXPL.indexOf('onOpenMissions={() => {');
    expect(at).toBeGreaterThan(-1);
    const body = EXPL.slice(at, at + 400);
    expect(body).toContain("useGameStore.getState().maybeAdvanceTutorial('main_quest');");
    expect(body).toContain("setScreen('contracts');");
    // And App still mounts that screen for that id — one object, one door.
    expect(APP).toContain("{screen === 'contracts' && <ContractsScreen />}");
    // Its own BACK returns to the world: hit the button, do your thing, back.
    expect(CONTRACTS).toContain("onPress={() => setScreen('exploration')}");
  });

  it('⚠⚠⚠ THE CARD IS GONE — component, state, import, wiring', () => {
    expect(existsSync(join(root, 'app', 'components', 'MissionStatusCard.tsx'))).toBe(false);
    expect(EXPL).not.toContain('MissionStatusCard');
    expect(EXPL).not.toContain('missionCardOpen');
    expect(EXPL).not.toContain('onOpenContracts=');
  });

  it('⚠⚠ MISSIONS keeps its place: on the primary row, before MORE, always visible', () => {
    // 1618's placement was the half of that OTA he did want.
    const uses = INPUT.split('<QuickBtn label="missions"').length - 1;
    expect(uses).toBe(1);
    const at = INPUT.indexOf('<QuickBtn label="missions"');
    expect(at).toBeLessThan(INPUT.indexOf("label={moreOpen ? 'less ▾' : 'more ▸'}"));
    expect(at).toBeLessThan(INPUT.indexOf('{(moreOpen || tutLock) && ('));
  });

  it('⚠ the store side is unchanged — the screen id still routes and returns', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Reader', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    store.getState().setScreen('contracts');
    expect(store.getState().currentScreen).toBe('contracts');
    store.getState().setScreen('exploration');
    expect(store.getState().currentScreen).toBe('exploration');
  });
});
