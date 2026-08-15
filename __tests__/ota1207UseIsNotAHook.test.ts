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

// OTA-1207 — TWO DEFECTS OFF THE 2026-08-10 DEVICE LOG (Pixel, OTA-1206 live).
//
// 1. `use Aetheric Torch` was HIJACKED by an etheric_storm hook: the item's own
//    adjective ('aetheric') sits in the hook's noun list, the hook intercept ate
//    the use-intent, and the storm story beat fired instead of the torch. The
//    player asked for a thing they were CARRYING — that action belongs to the
//    item path (which itself knows how to aim at leads, OTA-776).
// 2. The Asgardar vision's lore_note always narrated "the locket" while the loot
//    table rolls it at weight 25 of 100 — the owner rolled coins and was told
//    about a locket that never existed (the OTA-1158 class: text promising what
//    code doesn't grant).
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { Hook } from '../app/engine/hooks';

jest.setTimeout(120000);

async function settle(pred: () => boolean, deadlineMs = 4000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('OTA-1207 — using a carried item is not hook engagement', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  async function bootWithHook(hookNouns: string[]) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Bearer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    const scene = store.getState().currentScene!;
    const lead: Hook = {
      id: 'h_use', kind: 'strange_smoke' as Hook['kind'],
      nouns: hookNouns, plantedLine: '', stage: 0, resolved: false,
    };
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [], hooks: [lead],
        ambientNouns: ['silt bank'], displayedAmbientNouns: ['silt bank'],
      },
    });
    return store;
  }

  it('⚠ the device-log repro: `use aetheric torch` reaches the TORCH, not the hook chain', async () => {
    // The hook's nouns deliberately contain the item's adjective — the exact
    // collision from the log (etheric_storm lists 'aetheric').
    const store = await bootWithHook(['aetheric', 'storm']);
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('use aetheric torch');
    await settle(() => store.getState().currentScene?.hooks[0]?.torchCharged === true);
    const hook = store.getState().currentScene?.hooks[0];
    // The RIGHT path: the torch's own lead-aiming charged the hook (OTA-776)...
    expect(hook?.torchCharged).toBe(true);
    // ...and the WRONG path never ran: no story-thread advance, stage untouched.
    expect(hook?.stage).toBe(0);
    const since = store.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    expect(since).not.toMatch(/STORY THREAD/);
  });

  it('a use-target that is a SCENE noun (not carried) still routes to the hook', async () => {
    const store = await bootWithHook(['winch']);
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('use the winch');
    await settle(() => store.getState().gameLog.length > before);
    const since = store.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    // ⚠ Judged on the ROUTING DECISION (the intercept's own debug line), not the
    // advance narration — what the thread says next varies by hook kind, and the
    // thing this guard must never break is that a scene-noun use still ROUTES.
    expect(since).toMatch(/route: hook intercept/);
  });
});

describe('OTA-1207 — a rolled-loot lore_note may not narrate one specific roll', () => {
  it('⚠ no treasure archetype with 2+ weighted loot rows names a row in its lore_note', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('../app/data/world/wasteland_encounters.json');
    const offenders: string[] = [];
    const walk = (o: any) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        const loot = o.loot;
        const note: string | undefined = o.lore_note;
        if (note && Array.isArray(loot) && loot.length >= 2) {
          for (const row of loot) {
            const name = String(row?.name ?? '');
            if (!name) continue;
            // Match on the distinctive last word ('Locket', 'Crystal'…) so a
            // note can't smuggle the item in under a shortened name.
            const lastWord = name.split(/\s+/).pop()!;
            if (new RegExp(`\\b${lastWord}\\b`, 'i').test(note)) {
              offenders.push(`${name} <- "${note.slice(0, 60)}..."`);
            }
          }
        }
        Object.values(o).forEach(walk);
      }
    };
    walk(data);
    expect(offenders).toEqual([]);
  });
});
