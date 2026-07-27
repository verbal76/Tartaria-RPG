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

// OTA-992 — studs-down corrections, batch 2: contracts + toasts.
// The audit's findings, locked:
//   D2.1  SET ACTIVE never paused anything — two taps left several contracts
//         live at once forever after, defeating OTA-995's whole point.
//   D2.3  hook-granted hunts/mysteries parked in SILENCE (a regression — the
//         player investigated the target and nothing advanced, unexplained).
//   D1.1  8 stat toasts still printed the BASE stat (the {to} helper + parley).
//   D1.4  the clause blamed "your gear" for race/food/corruption modifiers.
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore, statNowClause } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

const rec = (id: string, tracked: boolean) =>
  ({ id, stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 1, tracked }) as any;

describe('OTA-992 — single-active is enforced at ACTIVATION', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('activating hunt B stands hunt A down (the two-tap hole, closed)', async () => {
    const store = await boot('Warden');
    store.setState({ player: { ...store.getState().player!, activeHunts: [rec('hunt_a', true), rec('hunt_b', false)] } as any });
    store.getState().setContractActive('hunt', 'hunt_b', true);
    const hunts = store.getState().player!.activeHunts!;
    expect(hunts.find((h: any) => h.id === 'hunt_b')!.tracked).toBe(true);
    expect(hunts.find((h: any) => h.id === 'hunt_a')!.tracked).toBe(false);
  });

  it('activation sweeps ACROSS kinds — a mystery stands a hunt down, and vice versa', async () => {
    const store = await boot('Warden2');
    store.setState({ player: {
      ...store.getState().player!,
      activeHunts: [rec('hunt_a', true)],
      activeMysteries: [rec('mys_a', false)],
      activeStorylines: [rec('story_a', true)],
      activeFactionQuests: [rec('fq_a', true)],
    } as any });
    store.getState().setContractActive('mystery', 'mys_a', true);
    const p = store.getState().player! as any;
    expect(p.activeMysteries.find((m: any) => m.id === 'mys_a').tracked).toBe(true);
    expect(p.activeHunts.find((h: any) => h.id === 'hunt_a').tracked).toBe(false);
    expect(p.activeStorylines.find((s: any) => s.id === 'story_a').tracked).toBe(false);
    expect(p.activeFactionQuests.find((q: any) => q.id === 'fq_a').tracked).toBe(false);
  });

  it('activating a faction quest stands the other kinds down too', async () => {
    const store = await boot('Warden3');
    store.setState({ player: {
      ...store.getState().player!,
      activeHunts: [rec('hunt_a', true)],
      activeFactionQuests: [rec('fq_a', false)],
    } as any });
    store.getState().setFactionQuestActive('fq_a', true);
    const p = store.getState().player! as any;
    expect(p.activeFactionQuests.find((q: any) => q.id === 'fq_a').tracked).toBe(true);
    expect(p.activeHunts.find((h: any) => h.id === 'hunt_a').tracked).toBe(false);
  });

  it('DEACTIVATION does not touch the others (the sweep is activation-only)', async () => {
    const store = await boot('Warden4');
    store.setState({ player: {
      ...store.getState().player!,
      activeHunts: [rec('hunt_a', true), rec('hunt_b', false)],
      activeMysteries: [rec('mys_a', false)],
    } as any });
    store.getState().setContractActive('hunt', 'hunt_a', false);
    const p = store.getState().player! as any;
    expect(p.activeHunts.find((h: any) => h.id === 'hunt_a').tracked).toBe(false);
    expect(p.activeHunts.find((h: any) => h.id === 'hunt_b').tracked).toBe(false);
    expect(p.activeMysteries.find((m: any) => m.id === 'mys_a').tracked).toBe(false);
  });

  it('ambient-tier kinds (whisper/lead/broker) stay out of the sweep by design', () => {
    // The sweep is deliberately scoped to routed kinds; a breadcrumb must not
    // stand your mission down, and activating a mission must not silence the
    // breadcrumbs. Locked at the source so a future edit re-litigates it here.
    const sweep = STORE.slice(STORE.indexOf("if (changed && nextActive && (kind === 'hunt'"), STORE.indexOf("if (changed && nextActive && (kind === 'hunt'") + 1200);
    expect(sweep).not.toContain('activeWhispers');
    expect(sweep).not.toContain('activeQuests');
    expect(sweep).not.toContain('brokerMission');
  });

  it('a hook-granted contract that parks SAYS SO (audit D2.3)', () => {
    const parkedLines = STORE.match(/Parked — you're already running a contract\. Activate it in Contracts → (Hunts|Mysteries) when you're ready\./g) ?? [];
    expect(parkedLines.length).toBe(2);
  });
});

describe('OTA-992 — the toast category, actually closed', () => {
  it('statNowClause reads the EFFECTIVE stat and no longer blames gear', async () => {
    const store = await boot('Sage');
    const p = store.getState().player!;
    // A REAL catalog amulet (+2 WIS) — the exact modifier class the sheet shows.
    store.setState({ player: {
      ...p,
      inventory: [...p.inventory, {
        id: 'la1', name: 'Lightstone Amulet', kind: 'gear', rarity: 'Uncommon', quantity: 1, tags: ['amulet'],
      }],
      equipped: { ...(p.equipped ?? {}), amulet: 'Lightstone Amulet', amuletId: 'la1' },
    } as any });
    const live = store.getState().player!;
    const base = live.stats.wisdom;
    const clause = statNowClause(live, 'wisdom', base);
    expect(clause).toContain(`base ${base}`);
    expect(clause).toContain('as you stand');
    expect(clause).not.toContain('with your gear on');
  });

  it('the applyTrainAndLog helper and the parley toast route through the clause', () => {
    const helper = STORE.slice(STORE.indexOf('function applyTrainAndLog('), STORE.indexOf('function applyTrainAndLog(') + 900);
    expect(helper).toContain('statNowClause(get().player, stat, tr.leveled.to)');
    expect(STORE).toContain("`✦ Your words carried it. +1 CHA (${statNowClause(get().player, 'charisma', trained.leveled.to)}).`");
    // The raw parley jump is gone.
    expect(STORE).not.toContain('`Charisma ${trained.leveled.from} → ${trained.leveled.to}.`');
  });
});
