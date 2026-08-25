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

// ⚠⚠ OTA-1274 — "THERE WAS A ROOM CALLED BREAK" — AND THE AUDIT UNDERNEATH IT.
//
// The owner asked for an odd-name pass over the outpost rooms. Running every
// skin's chip names through the REAL parser found the defect class his eye had
// caught the corner of: rooms whose typed names ARE parser verbs.
//
//     Vault   → jump   conf 1.00   (base + dynasty skins)
//     Break   → attack conf 1.00   (conspiracy — his find)
//     Forge   → craft  conf 1.00   (three skins)
//     Chamber → climb  conf 0.82   (fuzzy 'clamber')
//     Plans   → ready  conf 0.82   (fuzzy 'plan')
//     Reading → reload conf 0.64   (fuzzy 'reloading')
//
// In every skin, typing some room's own name did something other than walk.
// Two skins also had DUPLICATE chips (two VIGILs, two PLANSes), and the
// revivalists slept in a room whose chip read CRASH — parser-clean and still
// the worst possible word in an app being debugged for freezes.
//
// ⚠⚠ THE ROOT FIX IS THE INTERCEPT, NOT A RENAME TREADMILL. Buildings solved
// this in arb25 (room names resolve BEFORE the parser); hubs now get the same
// door via matchHubRoomName — STRICT whole-input matching, so "break the door"
// still swings and only the bare name walks. It also made hub travel
// SKIN-AWARE: a Dynasty player typing 'promenade' (the word on their screen)
// used to match nothing, because resolution only ever read the base layout's
// names.
//
// Renames kept for the genuinely odd: Break→Breakroom (chip), The Crash
// Room→The Cell Bunks, the duplicate VIGIL→Shrine, the duplicate
// PLANS→Plan Floor / Plan Room.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import staticHub from '../app/data/world/static_hub.json';
import variantsData from '../app/data/world/hub_faction_variants.json';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

// ⚠ OTA-1339 — ONE LIVING CHARACTER PER NAME now holds at the tutorial name beat,
// and every fresh character this file creates lives on in its slot. A fixed name
// here would be refused from the second creation onward, wedging the helper at the
// name ask — so each birth types a unique letter suffix (digits would be sanitized
// away by the name cleaner, so letters it is).
let bornSerial = 0;
const bornTag = (): string =>
  String.fromCharCode(97 + Math.floor(bornSerial / 26)) + String.fromCharCode(97 + (bornSerial++ % 26));
async function freshConspiracyAtExplore(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'conspiracy_architects',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
  sub('Greg' + bornTag()); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden's Vest");
  useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  // OTA-1500 — the screen_pick beat (the on-screen ★ offer) sits between armor
  // and rope now; its store action is the tap the beat teaches.
  useGameStore.getState().tutorialScreenPick();
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) {
    sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
  }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
}

const room = (): string | null => useGameStore.getState().player?.hubRoomId ?? null;

describe('OTA-1274 — the names themselves', () => {
  type Room = { shortName: string; name: string };
  const skins: Record<string, Room[]> = { BASE: (staticHub as { rooms: Room[] }).rooms };
  for (const [fac, rooms] of Object.entries((variantsData as { factions: Record<string, Record<string, Room>> }).factions)) {
    skins[fac] = Object.values(rooms).filter((r) => r && typeof r.shortName === 'string');
  }

  it('⚠⚠ no skin carries duplicate chips — two buttons, one word, was real twice', () => {
    for (const [fac, rooms] of Object.entries(skins)) {
      const shorts = rooms.map((r) => r.shortName.toLowerCase());
      expect({ fac, dupes: shorts.filter((s, i) => shorts.indexOf(s) !== i) }).toEqual({ fac, dupes: [] });
    }
  });

  it('⚠⚠ the owner\'s BREAK is gone, and so is CRASH', () => {
    for (const [fac, rooms] of Object.entries(skins)) {
      for (const r of rooms) {
        expect({ fac, short: r.shortName.toLowerCase() }).not.toEqual({ fac, short: 'break' });
        expect({ fac, short: r.shortName.toLowerCase() }).not.toEqual({ fac, short: 'crash' });
      }
    }
    const conspiracies = skins.conspiracy_architects!;
    expect(conspiracies.some((r) => r.shortName === 'Breakroom')).toBe(true);
    const revivalists = skins.tartarian_revivalists!;
    expect(revivalists.some((r) => r.name === 'The Cell Bunks')).toBe(true);
  });
});

describe('OTA-1274 — typing a room name walks you there', () => {
  beforeAll(async () => { await freshConspiracyAtExplore(); });

  it('⚠⚠ bare "operations" walks (its name; the parser alone would refuse it)', () => {
    expect(room()).toBe('outpost_gate');
    useGameStore.getState().submitPlayerAction('operations');
    expect(room()).toBe('outpost_central');
  });

  it('⚠⚠ THE OWNER\'S ROOM: bare "breakroom" walks to the Break Room — no attack', () => {
    // From Operations, the Break Room is adjacent (west).
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('breakroom');
    expect(room()).toBe('outpost_messhall');
    const feed = useGameStore.getState().gameLog.slice(from)
      .map((e: { text: string }) => String(e.text)).join(' | ').toLowerCase();
    expect(feed).not.toContain('nothing to attack');
  });

  // ⚠⚠ OTA-1279 REPLACED THIS TEST'S RULE. It used to pin earned fast-travel:
  // a bare room name jumped you across the outpost once you had visited that
  // room. The owner's navigation spec deletes that outright — *"Do NOT
  // automatically calculate a path and teleport the player through intermediate
  // rooms... Normal room navigation should move ONE GRAPH EDGE AT A TIME."*
  // What OTA-1274 actually bought — a room name never firing the verb it
  // collides with — is what survives, and it now holds for unvisited rooms too.
  it('⚠⚠ "documents" is REFUSED, not jumped to — and the refusal points the way', () => {
    // The Document Room (outpost_lab, node R03) is three steps off. Naming it
    // must not attack, must not jump, and must not eject the player overland.
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('documents');
    expect(room()).toBe('outpost_messhall');
    const feed = useGameStore.getState().gameLog.slice(from)
      .map((e: { text: string }) => String(e.text)).join(' | ').toLowerCase();
    expect(feed).toContain("isn't off this one");
    // The first step named is the one the graph says: back east to Operations.
    expect(feed).toContain('head east');
  });

  it('⚠⚠ ...and walking it by hand takes exactly the three steps the graph says', () => {
    useGameStore.getState().submitPlayerAction('go east');    // Mess  → Operations (R05→R01)
    expect(room()).toBe('outpost_central');
    useGameStore.getState().submitPlayerAction('go north');   // → Evidence Vault  (R01→R02)
    expect(room()).toBe('outpost_relic_vault');
    useGameStore.getState().submitPlayerAction('go west');    // → Document Room   (R02→R03)
    expect(room()).toBe('outpost_lab');
    // Adjacent-by-name still just walks — from here the vault block is one step.
    useGameStore.getState().submitPlayerAction('evidence');
    expect(room()).toBe('outpost_relic_vault');
  });

  it('⚠⚠ a cardinal with no door on it REFUSES — it used to walk you out of the outpost', () => {
    // The vault block (R02) has south/west/east and no north. Pre-OTA-1279 an
    // unmatched cardinal fell through to the overland handler and cleared
    // hubRoomId — you typed `go north` in a dead end and left the building.
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('go north');
    expect(room()).toBe('outpost_relic_vault');
    const feed = useGameStore.getState().gameLog.slice(from)
      .map((e: { text: string }) => String(e.text)).join(' | ').toLowerCase();
    expect(feed).toContain('no way north from here');
    // ...and it lists the doors that DO exist, so the refusal is navigable.
    expect(feed).toContain('you can go');
  });

  it('⚠⚠ "break the door" still SWINGS — the matcher is whole-input strict', () => {
    const before = room();
    useGameStore.getState().submitPlayerAction('break the door');
    expect(room()).toBe(before);   // no walk — the verb keeps its sentence
  });

  it('⚠ the intercept never fires outside a hub', async () => {
    // Outside, 'vault' is honestly the jump verb again — the override is a
    // hub-room rule, not a global rename of the verb.
    // ⚠ OTA-1284 hardening (found on HAL's twin of this test): leave from the
    // SAFE gate on a fresh character. The walking tests above can leave a
    // spawned hostile in a deep room, and with an enemy in the scene
    // 'leave outpost' is combat movement, not a door.
    await freshConspiracyAtExplore();
    expect(room()).toBe('outpost_gate');
    useGameStore.getState().submitPlayerAction('leave outpost');
    expect(room()).toBeNull();
    const before = useGameStore.getState().player!.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('vault');
    expect(useGameStore.getState().player?.hubRoomId ?? null).toBeNull();
    void before;
  });
});
