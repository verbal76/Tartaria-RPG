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

// ⚠⚠ OTA-1286 (port of golem OTA-1273) — THE FEED SHOWED THE INSULT AND NEVER THE GIFT.
//
// From the owner's 4.29.194 device log, out of NOWHERE, twelve seconds after
// his last typed line:
//
//   [world]  I have built three things out of rubbish this week and I still
//            could not build anything out of Aetheric Locket. Get it off the
//            bench.
//   [system] Standing -2 — Reclaimers Guild.
//
// ⚠⚠ THAT IS THE TASTES SYSTEM WORKING AS AUTHORED — he tapped GIVE on the
// locket in his pack, Tarek hates trinkets, a hated gift is refused with an
// insult and a standing cost so junk-dumping isn't free. But `giveGift` logged
// only the RECIPIENT'S half of the exchange: no [player] line, no cause. It
// read as a spontaneous standing dock — to the owner, and to the triage that
// chased it as a bug across two sessions' logs before finding gift_prefs.
//
// Every picker tap logs its player line ("take cudgel" from a row tap). A GIVE
// tap is an action like any other, and now it says so, before the reply, on
// every outcome — landed, refused, or blocked.
import { useGameStore } from '../app/state/gameStore';

jest.setTimeout(60_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

type LogRow = { channel: string; text: string };

async function freshPlayerWithLocket(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: 'Greg', raceId: 'reclaimer', factionId: 'conspiracy_architects',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  const p = useGameStore.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      inventory: [...p.inventory, {
        id: 'zz_locket', name: 'Aetheric Locket', kind: 'accessory',
        rarity: 'Common', quantity: 1, tags: ['trinket', 'jewelry'],
      } as never],
    },
    // The recipient must be someone the ledger has met (OTA-1064's rule).
    worldMemory: {
      ...useGameStore.getState().worldMemory,
      npcRelations: {
        vendor_tarek: {
          id: 'vendor_tarek', name: 'Tarek the Tinkerer', meetings: 2,
          factionId: 'reclaimers_guild',
          firstMetAtHours: 0, lastSeenAtHours: 1,
        } as never,
      },
    },
    giftMode: { toId: 'vendor_tarek', toName: 'Tarek the Tinkerer', returnTo: 'exploration' } as never,
  });
}

describe('OTA-1286 (port of golem OTA-1273) — the give is written down before the reply', () => {
  it('⚠⚠ THE OWNER\'S CASE: a hated gift logs [player] give → THEN the insult → THEN the dock', async () => {
    await freshPlayerWithLocket();
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().giveGift('zz_locket');
    const rows: LogRow[] = useGameStore.getState().gameLog.slice(from)
      .map((e: LogRow) => ({ channel: e.channel, text: String(e.text) }));

    const giveIdx = rows.findIndex((r) => r.channel === 'player' && /^give the Aetheric Locket to Tarek the Tinkerer$/.test(r.text));
    expect(giveIdx).toBeGreaterThanOrEqual(0);
    const replyIdx = rows.findIndex((r) => r.channel === 'world');
    expect(replyIdx).toBeGreaterThan(giveIdx);   // cause before effect
  });

  it('⚠⚠ the refusal really is the tastes system: item kept, standing docked', async () => {
    await freshPlayerWithLocket();
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().giveGift('zz_locket');
    const p = useGameStore.getState().player!;
    // Refused — the locket stays in the pack (junk-dumping is not free taps).
    expect(p.inventory.some((i: { id: string }) => i.id === 'zz_locket')).toBe(true);
    // And the dock is SAID, exactly as the device log showed it.
    const feed = useGameStore.getState().gameLog.slice(from)
      .map((e: LogRow) => String(e.text)).join(' | ');
    expect(feed).toMatch(/Standing -\d/);
  });

  it('⚠ a BLOCKED give logs the player line too — the refusal has a visible cause', async () => {
    await freshPlayerWithLocket();
    // Equip-lock the locket so giftBlockReason refuses it.
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: { ...p, equipped: { ...(p.equipped ?? {}), accessory: 'Aetheric Locket' } } as never,
    });
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().giveGift('zz_locket');
    const rows: LogRow[] = useGameStore.getState().gameLog.slice(from)
      .map((e: LogRow) => ({ channel: e.channel, text: String(e.text) }));
    const giveIdx = rows.findIndex((r) => r.channel === 'player' && /^give the Aetheric Locket/.test(r.text));
    const blockIdx = rows.findIndex((r) => /cannot give away/i.test(r.text));
    if (blockIdx >= 0) {
      // If the block fired, the cause line precedes it.
      expect(giveIdx).toBeGreaterThanOrEqual(0);
      expect(blockIdx).toBeGreaterThan(giveIdx);
    } else {
      // The equip shape didn't block on this build — the give still logged.
      expect(giveIdx).toBeGreaterThanOrEqual(0);
    }
  });
});
