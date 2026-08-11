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

// OTA-1214 — EVERY LEAD CAN COMPLETE. The owner's follow-up to the hunt fix —
// "every mission, hunt, whisper, and every other style of side quest?" — found
// the LEADS family effectively 100% uncompletable: the only trigger was
// kill-verb name matching ('kill/slay/defeat/hunt/retrieve'), and not one of
// the 18 authored objective verbs is in that set. Every lead ever generated
// accumulated forever. Now: at the lead's own pinned location, the verb-matched
// intent completes it (LEAD_VERB_TRIGGERS); kill-shaped verbs also settle on
// any enemy defeated at the site; and the audit below makes an uncompletable
// lead unauthorable.
import { readFileSync } from 'fs';
import { join } from 'path';
import objectivesData from '../app/data/quests/objectives.json';
import { LEAD_VERB_TRIGGERS } from '../app/engine/questGenerator';
import { CHAINS } from '../app/engine/whispers';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(120000);

async function settle(pred: () => boolean, deadlineMs = 4000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('OTA-1214 — the audit: no lead verb without a trigger', () => {
  it('⚠⚠ every objectives.json verb has a LEAD_VERB_TRIGGERS entry with a real door', () => {
    const offenders: string[] = [];
    for (const o of objectivesData as Array<{ verb: string }>) {
      const t = LEAD_VERB_TRIGGERS[o.verb.toLowerCase()];
      if (!t || ((t.intents ?? []).length === 0 && !t.onKillAtSite)) offenders.push(o.verb);
    }
    expect(offenders).toEqual([]);
  });
  it('⚠ every whisper chain has a dispatcher arm (a chain that plants but cannot fire is the same defect)', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    for (const chain of CHAINS) {
      expect(store).toContain(`'${chain.id}'`);
    }
  });
});

describe('OTA-1214 — LIVE: a lead completes at its own site', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  function seedLead(store: typeof useGameStore, atSite: boolean) {
    const p = store.getState().player!;
    const here = p.currentLocationId;
    const lead = {
      id: 'lead_test_1',
      objective: { verb: 'Investigate', target: 'a new Aetheric anomaly', tags: ['exploration'] },
      complication: { text: 'the silt is unstable', tags: [] },
      location: { id: atSite ? here : 'asgardar', name: 'Test Site', danger: 2, description: '', tags: [], discoverable: true },
      reward: { type: 'currency', amount: 40, label: '40 TC', tags: [] },
      state: 'open',
      tracked: true,
    };
    useGameStore.setState({
      player: { ...p, activeQuests: [lead as unknown as NonNullable<typeof p.activeQuests>[number]] },
    });
  }

  async function boot() {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Scout', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    const scene = store.getState().currentScene!;
    useGameStore.setState({ currentScene: { ...scene, enemies: [], hooks: [] } });
    return store;
  }

  it('⚠⚠ Investigate-verb lead, AT the site: one investigate completes it and pays', async () => {
    const store = await boot();
    seedLead(store, true);
    const tcBefore = store.getState().player!.tc;
    await store.getState().submitPlayerAction('investigate the area');
    await settle(() => store.getState().player!.activeQuests?.[0]?.state === 'completed');
    expect(store.getState().player!.activeQuests?.[0]?.state).toBe('completed');
    expect(store.getState().player!.tc).toBe(tcBefore + 40);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Lead resolved: Investigate a new Aetheric anomaly/);
  });

  it('away from the site the lead holds open', async () => {
    const store = await boot();
    seedLead(store, false);
    await store.getState().submitPlayerAction('investigate the area');
    await new Promise((r) => setTimeout(r, 400));
    expect(store.getState().player!.activeQuests?.[0]?.state).toBe('open');
  });
});
