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


// ⚠⚠ OTA-1303 — FOUR THINGS THE OWNER'S 4.29.206 WALK SHOWED, ALL OF THEM
// THE SAME SHAPE: A RULE THAT WAS ONLY EVER TAUGHT TO ONE OF ITS READERS.
//
//   1. The overland compass printed INSIDE A BUILDING. OTA-1298 gated the
//      arrival radar on being indoors; the LOOK handler was never told, and its
//      one guarded branch (`inBuilding && ladder`) could not fire because
//      `ladder` is built as null whenever `inBuilding` is true. So a shack
//      interior offered north/east/south/west and no way out — in a building
//      system whose own header says "FLAT access, not a cardinal graph".
//   2. `leave outpost` two tiles OUTSIDE the outpost walked him an hour into
//      nowhere. The leave-hub predicates were only ever asked "should I skip
//      the interior handler?", never "is there a hub to leave?".
//   3. ⚠⚠ THE BIG ONE — INFINITE GEAR. A cardinal step inside a location does
//      not rebuild the scene, so OTA-1244's pinned arrival-tile gear followed
//      him from tile to tile, and the take handler's consumed-set is keyed PER
//      TILE — so every tile granted another copy of the same armor. Measured
//      before the fix: five steps north, five identical pairs of greaves.
//   4. He fled a Drowned Aetherkin on open mud-flats and was told he broke for
//      "the entrance" while "the chamber" settled behind him.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};
const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
const feedSince = (n: number): string[] =>
  useGameStore.getState().gameLog.slice(n).map((e: { text: string }) => String(e.text));
const tileGear = (): string[] =>
  ((useGameStore.getState().currentScene as { tileGearNouns?: string[] })?.tileGearNouns) ?? [];
const copiesOf = (name: string): number =>
  (useGameStore.getState().player?.inventory ?? []).filter((i: { name: string }) => i.name === name).length;

async function atTheGate(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  sub('Francis'); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden\'s Vest");
  useGameStore.getState().equipItem("Mud-Warden\'s Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) {
    sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
  }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
}

async function outsideTheGate(): Promise<void> {
  await atTheGate();
  sub('leave outpost');
}

describe('OTA-1303 — the world stops contradicting itself', () => {
  describe('the compass does not reach indoors', () => {
    it("⚠⚠ a building interior offers its ROOMS and the way out, never cardinals", async () => {
      await outsideTheGate();
      useGameStore.getState().enterBuilding('flooded_house');
      const mark = useGameStore.getState().gameLog.length;
      sub('look');
      const said = feedSince(mark).join(' ');
      expect(said).not.toContain('Cardinal travel');
      // The way out is the one thing a building interior MUST always name.
      expect(said).toContain('EXIT');
      // ...and the rooms it does have, since that IS its navigation.
      expect(said).toContain('Rooms here:');
    });

    it('⚠ the same look OUTDOORS still prints the compass — we removed the wrong one, not the right one', async () => {
      await outsideTheGate();
      const mark = useGameStore.getState().gameLog.length;
      sub('look');
      expect(feedSince(mark).join(' ')).toContain('Cardinal travel');
    });
  });

  describe('a door you are already through is not a door', () => {
    it("⚠⚠ 'leave outpost' in the open refuses, and costs NOTHING", async () => {
      await outsideTheGate();
      expect(useGameStore.getState().player?.hubRoomId ?? null).toBeNull();
      const hours = useGameStore.getState().player?.hoursElapsed;
      const mark = useGameStore.getState().gameLog.length;
      sub('leave outpost');
      // The owner's log charged him an hour for this. Not one minute now.
      expect(useGameStore.getState().player?.hoursElapsed).toBe(hours);
      expect(feedSince(mark).join(' ')).toContain('already out in the open');
    });

    it('⚠ but it still WORKS from inside the outpost — the taught phrase is untouched', async () => {
      // The refusal keys on "am I in a hub", so the one thing that could go
      // wrong is swallowing the real command. Walk to the gate and leave.
      await atTheGate();
      expect(useGameStore.getState().player?.hubRoomId ?? null).not.toBeNull();
      sub('leave outpost');
      expect(useGameStore.getState().player?.hubRoomId ?? null).toBeNull();
    });
  });

  describe('the gear stays on the tile you left', () => {
    it('⚠⚠ THE OWNER\'S CASE: taking the same armor on five tiles yields ONE of it', async () => {
      await outsideTheGate();
      const target = tileGear()[0];
      expect(typeof target).toBe('string');
      for (let i = 0; i < 5; i++) { sub(`take the ${target}`); sub('go north'); }
      // Pre-fix this read 5 — one fresh copy per tile, forever.
      expect(copiesOf(target as string)).toBe(1);
    });

    it('⚠⚠ ...and pacing between two tiles CONVERGES instead of printing money', async () => {
      await outsideTheGate();
      const before = (useGameStore.getState().player?.inventory ?? []).length;
      const grownBy = (): number => (useGameStore.getState().player?.inventory ?? []).length - before;
      const pace = (n: number): void => {
        for (let i = 0; i < n; i++) {
          tileGear().forEach((g) => sub(`take the ${g}`));
          sub(i % 2 === 0 ? 'go north' : 'go south');
        }
      };
      pace(8);
      const afterEight = grownBy();
      pace(16);
      // Both tiles empty out and STAY empty — the total must not move again.
      expect(grownBy()).toBe(afterEight);
    });

    it('⚠ each tile still carries its OWN gear — OTA-1244\'s complaint stays fixed', async () => {
      await outsideTheGate();
      const seen = new Set<string>();
      let tiles = 0;
      for (let i = 0; i < 6; i++) {
        const g = tileGear();
        if (g.length > 0) tiles++;
        g.forEach((n) => seen.add(n));
        sub('go north');
      }
      // The point of the pin was "I have not seen armor in the last few tiles".
      // Rolling per tile answers that honestly: several tiles, several names.
      expect(tiles).toBeGreaterThanOrEqual(4);
      expect(seen.size).toBeGreaterThanOrEqual(6);
    });

    it('⚠ the producer records which pins are gear — the consumer must never guess', () => {
      const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
      // A catalog-lookup heuristic would mis-sort the first time a water source
      // or rescue prop gains a catalog entry. The scene carries the answer.
      expect(store).toContain('tileGearNouns: fresh');
      expect(store).toContain('const stale = new Set((scene.tileGearNouns ?? []).map((n) => n.toLowerCase()));');
    });
  });

  describe('the site name belongs to the tile', () => {
    const siteOf = (): string | null =>
      (useGameStore.getState().currentScene as { microMicroId?: string | null })?.microMicroId ?? null;

    it("⚠⚠ THE OWNER'S CASE: walking six tiles does not report the same room six times", async () => {
      await outsideTheGate();
      const names: string[] = [];
      for (let i = 0; i < 6; i++) { const n = siteOf(); if (n) names.push(n); sub('go north'); }
      expect(names.length).toBeGreaterThanOrEqual(5);
      // Pre-fix this was one name repeated for the whole location.
      expect(new Set(names).size).toBeGreaterThan(1);
    });

    it('⚠⚠ ...and the look line follows it, instead of freezing on the arrival room', async () => {
      await outsideTheGate();
      const said: string[] = [];
      for (let i = 0; i < 6; i++) {
        const mark = useGameStore.getState().gameLog.length;
        sub('look');
        const line = feedSince(mark).find((t) => t.includes("You're in"));
        if (line) said.push(line.slice(0, line.indexOf('You see:') > 0 ? line.indexOf('You see:') : 90));
        sub('go north');
      }
      expect(new Set(said).size).toBeGreaterThan(1);
    });

    it('⚠ but the SAME tile keeps its site — the room key is built from this id', async () => {
      await outsideTheGate();
      sub('go north');
      const there = siteOf();
      sub('go south');
      sub('go north');
      // A site that re-rolled per visit would re-key the tile and refill its
      // consumed nouns — the save→exit→rehydrate farm OTA-659 closed indoors.
      expect(siteOf()).toBe(there);
    });
  });

  describe('one step, one departure sentence', () => {
    // The four destinationless-wander lead-ins, verbatim from WANDERING_LEADS.
    const LEADS = [
      'After a while you set down on the next stretch of ground.',
      'You walk. Tartaria walks beside you.',
      'Your boots find the next stretch of ground.',
      'You set out on foot. The weather closes around you.',
    ];

    it('⚠⚠ a cardinal step narrates the move ONCE, with its direction intact', async () => {
      await outsideTheGate();
      for (let i = 0; i < 4; i++) {
        const mark = useGameStore.getState().gameLog.length;
        sub('go north');
        const said = feedSince(mark).join(' ');
        // Pre-fix every step printed a directional line AND a wandering lead —
        // the second one dropping the direction the first had just given.
        for (const lead of LEADS) expect(said).not.toContain(lead);
      }
    });

    it('⚠ a DESTINATIONLESS wander still gets its lead — that is whose line it is', async () => {
      await outsideTheGate();
      let sawLead = false;
      for (let i = 0; i < 6 && !sawLead; i++) {
        const mark = useGameStore.getState().gameLog.length;
        sub('wander');
        const said = feedSince(mark).join(' ');
        sawLead = LEADS.some((l) => said.includes(l));
      }
      expect(sawLead).toBe(true);
    });
  });

  it('⚠ fleeing in the open does not name an entrance or a chamber', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = store.indexOf('You break for the entrance');
    expect(i).toBeGreaterThan(-1);
    // The indoor line survives, but only behind an indoors test.
    const window = store.slice(Math.max(0, i - 400), i);
    expect(window).toContain('const fleeIndoors = !!get().activeBuildingId || !!get().player?.hubRoomId;');
    expect(store).toContain('You break away across the open ground.');
  });
});
