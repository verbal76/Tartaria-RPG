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

// ⚠⚠ OTA-1281 — ALL NINE OUTPOSTS, WALKED. The owner's acceptance question for
// OTA-1279, verbatim: *"is the room remapping error free and fully functional?
// crawl all 9 maps."*
//
// Two layers, because "the map" is two claims:
//   · ENGINE: every edge of every skin resolves — by cardinal, by the SKINNED
//     name on the player's screen, and back again — and every doorless cardinal
//     refuses. 9 skins × 28 directed edges, exhaustive, no sampling.
//   · PLAYED: a fresh character of every faction walks their own outpost edge
//     by edge through submitPlayerAction — the same door the owner's taps go
//     through — covering all 28 directed edges, then the refusal paths, then
//     the way out.
//
// ⚠⚠ THE CRAWL EARNED ITSELF BEFORE IT RAN. Checking the name tables while
// planning it found a collision class shipped since OTA-1274: resolveHubTravel
// took the FIRST substring hit in direction order, and the Order skin ships a
// prefix pair — Quarters reads "Cells", the Chapel reads "Cell". Typing `cells`
// (the word on the screen) walked you into the CHAPEL. Fixed by longest-name-
// wins in both phases, pinned below. matchHubRoomName had the sibling defect:
// a tie between one room's SCREEN name and another's BASE name (conspiracy
// labels the Workshop "Lab"; outpost_lab's base shortName is also "Lab") was
// settled by array index. The skin pass now outranks the base pass — the
// player types what they can see.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { HUB, findHubRoom, resolveHubTravel, matchHubRoomName } from '../app/engine/hub';
import { DIRECTIONS, type Direction } from '../app/engine/outpostGraph';
import variantsData from '../app/data/world/hub_faction_variants.json';

jest.setTimeout(600_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const FACTIONS = [
  'reclaimers_guild', 'forgotten_order', 'mud_monarchs', 'true_tartarians',
  'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
  'stone_builders', 'tartarian_revivalists',
] as const;

const VARIANTS = (variantsData as {
  factions: Record<string, Record<string, { name: string; shortName: string }>>;
}).factions;

const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const byId = Object.fromEntries(HUB.rooms.map((r) => [r.id, r]));
const short = (roomId: string, skin: string): string =>
  VARIANTS[skin]?.[roomId]?.shortName ?? byId[roomId]!.shortName;

/** Every directed edge, as a walk: a DFS that goes down each branch and back
 *  up it — 28 moves on a 15-node tree, ending where it began. This is the
 *  route a completionist player actually has to take. */
function fullTour(startId: string): Array<{ from: string; dir: Direction; to: string }> {
  const moves: Array<{ from: string; dir: Direction; to: string }> = [];
  const seen = new Set([startId]);
  const dfs = (id: string): void => {
    for (const dir of DIRECTIONS) {
      const to = byId[id]!.exits[dir];
      if (!to || seen.has(to)) continue;
      seen.add(to);
      moves.push({ from: id, dir, to });
      dfs(to);
      moves.push({ from: to, dir: OPPOSITE[dir], to: id });
    }
  };
  dfs(startId);
  return moves;
}

describe('OTA-1281 — ENGINE: every edge of every skin, exhaustively', () => {
  for (const faction of FACTIONS) {
    const skin = VARIANTS[faction] ? faction : null;   // reclaimers = base names
    it(`⚠⚠ ${faction}: 28 edges by cardinal, 28 by screen name, all dead cardinals refuse`, () => {
      for (const room of HUB.rooms) {
        for (const dir of DIRECTIONS) {
          const to = room.exits[dir];
          if (to) {
            // By cardinal...
            const byDir = resolveHubTravel(room.id, `go ${dir}`, skin);
            expect({ room: room.id, dir, got: byDir }).toEqual({ room: room.id, dir, got: { roomId: to, via: 'cardinal' } });
            // ...by the name on the player's screen...
            const name = short(to, faction).toLowerCase();
            const byName = resolveHubTravel(room.id, `go to the ${name}`, skin);
            expect({ room: room.id, typed: name, got: byName })
              .toEqual({ room: room.id, typed: name, got: { roomId: to, via: 'adjacent' } });
            // ...and the return edge exists (symmetry, per skin, per edge).
            const back = resolveHubTravel(to, `go ${OPPOSITE[dir]}`, skin);
            expect({ from: to, back: OPPOSITE[dir], got: back?.roomId }).toEqual({ from: to, back: OPPOSITE[dir], got: room.id });
          } else {
            // A doorless cardinal REFUSES in-hub — it must never resolve to
            // null, because null falls through to overland travel.
            const refused = resolveHubTravel(room.id, `go ${dir}`, skin);
            expect({ room: room.id, dir, via: refused?.via }).toEqual({ room: room.id, dir, via: 'no_exit_that_way' });
          }
        }
      }
    });
  }

  it("⚠⚠ THE COLLISION THE CRAWL FOUND: Order's `cells` walks to the QUARTERS, not the Chapel", () => {
    // From the Mess both are adjacent: Quarters west ("Cells"), Chapel south
    // ("Cell"). First-substring-in-direction-order picked south. Longest wins.
    expect(resolveHubTravel('outpost_messhall', 'go to the cells', 'forgotten_order'))
      .toEqual({ roomId: 'outpost_quarters', via: 'adjacent' });
    expect(resolveHubTravel('outpost_messhall', 'go to the cell', 'forgotten_order'))
      .toEqual({ roomId: 'outpost_chapel', via: 'adjacent' });
    // The bare-name intercept obeys the same rule (it is strict, so it never
    // had the substring hole — pinned so it stays that way).
    expect(matchHubRoomName('cells', 'outpost_messhall', 'forgotten_order')).toBe('outpost_quarters');
    expect(matchHubRoomName('cell', 'outpost_messhall', 'forgotten_order')).toBe('outpost_chapel');
  });

  it('⚠⚠ THE TIE THE CRAWL FOUND: a SCREEN name outranks another room\'s BASE name', () => {
    // Conspiracy labels the Workshop "Lab"; outpost_lab's base shortName is
    // also "Lab". The player can only see the skin, so typed `lab` must mean
    // the room their screen calls Lab — by rule now, not by array index.
    expect(matchHubRoomName('lab', 'outpost_central', 'conspiracy_architects')).toBe('outpost_workshop');
    // And the room the screen calls "Documents" is reached by ITS screen name.
    expect(matchHubRoomName('documents', 'outpost_central', 'conspiracy_architects')).toBe('outpost_lab');
  });
});

describe('OTA-1281 — PLAYED: a character of every faction walks their outpost', () => {
  const beat = (): string | null => {
    const i = useGameStore.getState().tutorialStep;
    return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
  };
  const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
  const room = (): string | null => useGameStore.getState().player?.hubRoomId ?? null;
  const feedFrom = (n: number): string => useGameStore.getState().gameLog.slice(n)
    .map((e: { text: string }) => String(e.text)).join(' | ').toLowerCase();

  async function freshAtGate(faction: string): Promise<void> {
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'reclaimer', factionId: faction,
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    sub('Greg'); sub('look around'); sub('take the cudgel');
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

  for (const faction of FACTIONS) {
    it(`⚠⚠ ${faction}: all 28 edges walked, refusals refuse, and the way out works`, async () => {
      await freshAtGate(faction);
      expect(room()).toBe('outpost_gate');
      // ⚠ Every directed edge, through the same door the owner's taps use.
      for (const step of fullTour('outpost_gate')) {
        expect({ faction, at: room(), step }).toEqual({ faction, at: step.from, step });
        sub(`go ${step.dir}`);
        expect({ faction, step, landed: room() }).toEqual({ faction, step, landed: step.to });
      }
      // The tour visits all 15 — and the visited-set (the ✓ marks, OTA-1277)
      // must agree, because it is the same memory.
      const visited = new Set(useGameStore.getState().worldMemory.hubVisited ?? []);
      for (const r of HUB.rooms) {
        expect({ faction, room: r.id, visited: visited.has(r.id) }).toEqual({ faction, room: r.id, visited: true });
      }
      // A far room by its SCREEN name is a refusal with directions, not a move.
      let mark = useGameStore.getState().gameLog.length;
      sub(short('outpost_workshop', faction).toLowerCase());
      expect({ faction, at: room() }).toEqual({ faction, at: 'outpost_gate' });
      expect(feedFrom(mark)).toContain("isn't off this one");
      // A doorless cardinal refuses in-hub — the gate has no west door.
      mark = useGameStore.getState().gameLog.length;
      sub('go west');
      expect({ faction, at: room() }).toEqual({ faction, at: 'outpost_gate' });
      expect(feedFrom(mark)).toContain('no way west from here');
      // An adjacent room by its screen name walks.
      sub('go north');
      sub(short('outpost_armory', faction).toLowerCase());
      expect({ faction, at: room() }).toEqual({ faction, at: 'outpost_armory' });
      // And the outpost can be left.
      sub('go west');
      sub('leave outpost');
      expect({ faction, at: room() }).toEqual({ faction, at: null });
    });
  }
});
