/**
 * OTA-1403 — REMOTE HAND-IN WORKS FOR ALL FOUR FAMILIES, AND THE BUTTON CAN
 * REACH IT.
 *
 * Owner, correcting my diagnosis of the 2026-08-20 log:
 *
 *     "you can remotely hand in from anywhere outside"
 *
 * ⚠⚠ HE WAS RIGHT ABOUT THE DESIGN AND THE CODE DISAGREED — IN EXACTLY ONE OF
 * FOUR PLACES.
 *
 *     hunt       `if (!remote && !vendorCanTakeContract(...))`   ✅
 *     mystery    `if (!mystViaCourier && ...)`                    ✅
 *     storyline  `if (!storyViaCourier && ...)`                   ✅
 *     faction    `if (!questViaBroker && factionId !== turn)`     ❌  no remote
 *
 * `turnInFactionQuest` TOOK the `remote` parameter, DOCUMENTED it ("REMOTELY by
 * courier from anywhere, for a cut"), threaded it into `creditTurnIn`, and
 * implemented its own fetch exception for it — then refused on faction mismatch
 * before any of that could run. Three of four is the shape that hides: the
 * feature works everywhere you happen to test it.
 *
 * ⚠⚠ PROVEN BY PROBE BEFORE IT WAS FIXED, not reasoned about. A throwaway test
 * called `turnInFactionQuest(id, true)` — explicitly remote — against a
 * mismatched counterparty and printed:
 *
 *     deed faction: stone_builders   title: The Survey Line
 *     REMOTE HAND-IN — still on slate? true
 *     "the Conspiracy Architects hall won't take it — that contract is
 *      Stone Builders's."
 *
 * (That probe also caught "Stone Builders's". Four of the nine faction names end
 * in s, and no amount of reading the code was going to surface that.)
 *
 * ⚠⚠ AND THE SECOND HALF: THE BUTTON COULD NEVER REACH THE COURIER AT ALL. The
 * Contracts COMPLETE button delegates to the face-to-face turn-in by design — B2
 * closed a pay-from-any-tile hole and that was right — so "send word" has only
 * ever been reachable by TYPING it. A player tapping buttons could not get at a
 * feature the game has had since OTA-456, which is most of why ten taps read as
 * ten dead ends. The refusal card now offers it.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({ InferenceSession: { create: jest.fn() }, Tensor: class {} }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
// ⚠ The explicit type is not decoration: without it TS7022 fires ("referenced
// directly or indirectly in its own initializer") and the test-typecheck ratchet
// goes red. Several older suites carry that error; this one does not add to it.
type MockSound = { playAsync: () => void; unloadAsync: () => void };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(), unloadAsync: jest.fn() },
      }));
    },
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { possessive, wrongCounterpartyBody } from '../app/engine/contractRefusal';
import { FACTIONS } from '../app/engine/factions';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const quest = src('app', 'state', 'slices', 'questSlice.ts');
const screen = src('app', 'screens', 'ContractsScreen.tsx');

/** A non-fetch, non-staged deed — the kind a runner is allowed to carry. */
function courierableDeed() {
  const def = FACTION_QUESTS.find((q) => !q.fetch && (!q.stages || q.stages.length === 0));
  if (!def) throw new Error('no courierable deed in the catalog');
  return def;
}

function standOnMismatchedGround(deedId: string): void {
  useGameStore.setState({
    player: {
      name: 'Probe', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      hp: 10, hpMax: 10,
      stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      inventory: [], tc: 0,
      // ⚠ Real shape, not a stub: the remote path reaches the PAYOUT now (it did
      // not before, which is the bug), and the payout writes standing. A fixture
      // that stops at the refusal cannot tell you the fix works.
      factionStanding: FACTIONS.map((f) => ({ factionId: f.id, standing: 0 })),
      worldMemory: undefined,
      // ⚠ architect_blind is a Conspiracy Architects site; the deed below is not
      // theirs. hubRoomId null = standing OUTSIDE, which is where the owner was.
      currentLocationId: 'architect_blind', hubRoomId: null,
      activeFactionQuestIds: [deedId],
      activeFactionQuests: [{ id: deedId, stage: 0, tracked: true }],
      activeQuests: [], activeHunts: [], activeMysteries: [], activeStorylines: [],
    } as never,
    currentScene: null, contractsNotice: null, gameLog: [],
  });
}

describe('OTA-1403 — a remote faction hand-in is no longer refused', () => {
  it('⚠⚠ THE REGRESSION TEST FOR THE PROBE: remote:true clears the slate', () => {
    // Before this OTA the contract stayed on the slate and the refusal printed.
    const def = courierableDeed();
    standOnMismatchedGround(def.id);
    expect(def.factionId).not.toBe('conspiracy_architects');

    useGameStore.getState().turnInFactionQuest(def.id, true);

    const stillHeld = (useGameStore.getState().player!.activeFactionQuestIds ?? []).includes(def.id);
    expect(stillHeld).toBe(false);
  });

  it('⚠ …and it does NOT print the wrong-counterparty refusal', () => {
    const def = courierableDeed();
    standOnMismatchedGround(def.id);
    useGameStore.getState().turnInFactionQuest(def.id, true);
    const feed = useGameStore.getState().gameLog.map((e) => e.text).join('\n');
    expect(feed).not.toMatch(/won't take it/i);
  });

  it('⚠⚠ face-to-face STILL refuses — the fix did not open a pay-from-anywhere hole', () => {
    // B2 closed that hole deliberately. `remote` is the courier, at a 25% cut;
    // it is not a way to collect full pay from wherever you happen to stand.
    const def = courierableDeed();
    standOnMismatchedGround(def.id);
    useGameStore.getState().turnInFactionQuest(def.id);   // remote defaults false
    const stillHeld = (useGameStore.getState().player!.activeFactionQuestIds ?? []).includes(def.id);
    expect(stillHeld).toBe(true);
    expect(useGameStore.getState().contractsNotice).not.toBeNull();
  });
});

describe('OTA-1403 — the guard the other three families always had', () => {
  it('⚠⚠ all four wrong-counterparty gates now consult remote/courier', () => {
    for (const gate of [
      'if (!remote && !CB.vendorCanTakeContract(',                 // hunt
      'if (!mystViaCourier && !CB.vendorCanTakeContract(',         // mystery
      'if (!remote && !questViaBroker && candidate.factionId !== turnFaction)', // faction deed
    ]) {
      expect(quest).toContain(gate);
    }
    expect(quest).toContain('const storyViaCourier = remote;');
  });

  it('⚠ the earlier "nobody here to take it" gate was skipping remote too', () => {
    // On a tile with no vendor, board or owning faction there is nobody to hand
    // to face to face — and that is irrelevant to a runner.
    expect(quest).toContain('if (!remote && ((!turnFaction && !atBroker) || !turnSourceName))');
  });

  it('⚠⚠ the fetch exception is now REACHABLE, which it was not before', () => {
    // `if (remote && candidate.fetch)` sat below a gate that refused every remote
    // hand-in on faction mismatch, so the rule it encodes — you cannot mail the
    // goods — could only ever fire for a same-faction remote turn-in.
    const i = quest.indexOf('if (!remote && !questViaBroker');
    const j = quest.indexOf('remote && candidate.fetch');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it('⚠ a FETCH deed is refused the runner offer rather than offered and then refused', () => {
    expect(quest).toContain("candidate.fetch ? undefined : { kind: 'faction_quest', id: candidate.id },");
  });

  it('⚠⚠ a HUNT is never offered a runner, and the reason is written down', () => {
    // The trophy is shown in person (OTA-810) and turnInHunt refuses `remote`
    // outright. A button that would then refuse is the silent refusal in a hat.
    const i = quest.indexOf("if (!remote && !CB.vendorCanTakeContract(");
    const block = quest.slice(i, i + 700);
    expect(block).toContain('NO RUNNER OFFER HERE');
    expect(block).not.toContain("kind: 'hunt'");
  });
});

describe('OTA-1403 — the button can reach the courier now', () => {
  it('⚠⚠ the store exposes it, and delegates rather than reimplementing the payout', () => {
    // A second copy of the cut/rep/clock rules is how the button and the typed
    // command start disagreeing.
    const i = quest.indexOf('sendContractByRunner(kind, id) {');
    expect(i).toBeGreaterThan(-1);
    const body = quest.slice(i, quest.indexOf('\n  },', i));
    expect(body).toContain('get().turnInFactionQuest(id, true);');
    expect(body).toContain('get().turnInMystery(id, true);');
    expect(body).toContain('get().turnInStoryline(id, true);');
    expect(body).toContain('set({ contractsNotice: null });');
  });

  it('⚠⚠ the refusal card renders the offer only when the store set one', () => {
    expect(screen).toContain('{contractsNotice.action ? (');
    expect(screen).toContain('sendContractByRunner(');
    expect(screen).toContain("'NOT NOW' : 'GOT IT'");
  });

  it('⚠ the offer names the price, so it is not a free undo', () => {
    expect(quest).toContain("label: 'SEND BY RUNNER (−25%)'");
    const body = wrongCounterpartyBody({
      sourceLabel: 'a runner', contractFactionId: 'stone_builders', courierable: true,
    });
    expect(body).toMatch(/quarter of the pay/i);
    expect(body).toMatch(/Full standing either way/i);
  });

  it('⚠ …and a contract no runner can carry gets no such sentence', () => {
    const body = wrongCounterpartyBody({
      sourceLabel: 'a runner', contractFactionId: 'stone_builders',
    });
    expect(body).not.toMatch(/quarter of the pay/i);
  });
});

describe("OTA-1403 — the probe's other catch", () => {
  it("⚠⚠ no faction is ever called \"Stone Builders's\"", () => {
    // Found by running the probe, not by reading the code. Four of the nine
    // faction names end in s, so the naive `${name}'s` was wrong 44% of the time
    // in exactly the message a confused player reads most carefully.
    const endingInS = FACTIONS.filter((f) => f.name.endsWith('s'));
    expect(endingInS.length).toBeGreaterThanOrEqual(3);
    for (const f of endingInS) {
      expect(possessive(f.name)).toBe(`${f.name}'`);
      expect(possessive(f.name)).not.toContain("s's");
    }
    for (const f of FACTIONS.filter((x) => !x.name.endsWith('s'))) {
      expect(possessive(f.name)).toBe(`${f.name}'s`);
    }
  });

  it('⚠ and no refusal string builds a possessive by hand any more', () => {
    const refusal = src('app', 'engine', 'contractRefusal.ts');
    const code = refusal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\$\{who\}'s/);
  });
});
