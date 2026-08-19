// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
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

// ⚠⚠ OTA-1321 — THE FIRST FIGHT EXPLAINS ITSELF, ONCE.
//
// Owner: *"let's add a first time pop-up for the first fight explaining briefly,
// how to heal, what Dodge and stealth do, and where to go to change armor and
// weapons and the approach button."*
//
// Two rules are worth more than the card itself, and both are pinned below.
//
// ⚠ RULE 1 — IT IS RAISED FROM ONE DERIVED CONDITION, NOT FROM THE SPAWN SITES.
// An enemy lands in a scene from at least three places (the wilderness roll, the
// OTA-1032 indoor rest-ambush, the OTA-089 climb-top overlay). Hanging a "first
// fight" flag on each is how the third gets forgotten and the card silently stops
// firing for the players who meet an ambush before they pick a fight.
//
// ⚠ RULE 2 — IT DESCRIBES THE GAME THAT SHIPPED. Two drafts were wrong before the
// third: the card claimed healing costs your turn (OTA-619 made eating a FREE
// action, and `combatHealNoCounter` locks it), and that an out-of-reach weapon is
// "greyed out" (QuickBtn's `outOfRange` path buzzes and returns — it says nothing
// at all, which is the whole reason the player has to be told). A tutorial card
// that misdescribes the game teaches the player to distrust the next one, so the
// facts are re-read off the handlers here rather than trusted.
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const CARD = read('components', 'CombatPrimerModal.tsx');
const SCREEN = read('screens', 'ExplorationScreen.tsx');
const INPUTBOX = read('components', 'InputBox.tsx');
const STORE = read('state', 'gameStore.ts');

// ⚠ Several assertions below are "this string is GONE", and in this codebase the
// removal is always recorded in a comment naming the string that left. Strip both
// comment forms first, or every such test fails on its own tombstone.
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const CARD_PROSE = codeOnly(CARD);
const SCREEN_CODE = codeOnly(SCREEN);
const STORE_CODE = codeOnly(STORE);

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

describe('OTA-1321 — the primer is raised once, from one place', () => {
  it('⚠⚠ RULE 1: the screen derives it from a live enemy + the milestone, and nothing else raises it', () => {
    expect(SCREEN).toContain('const combatPrimerOpen = liveEnemyCount > 0');
    expect(SCREEN).toContain('!combatPrimerSeen');
    expect(SCREEN).toContain('<CombatPrimerModal');
    // The engine never opens it. If a spawn site ever starts pushing the card,
    // the other two spawn sites are already out of date.
    expect(STORE_CODE).not.toContain('combatPrimerOpen');
    expect(STORE_CODE).not.toContain('setCombatPrimerVisible');
  });

  it('⚠⚠ a veteran is never handed a card headed YOUR FIRST FIGHT', () => {
    // The milestone is NEW, so every save in the wild reads it as undefined. The
    // kill count is the second clause that keeps the card off their screen.
    expect(SCREEN).toContain('enemiesDefeatedEver === 0');
    expect(CARD_PROSE).toContain('YOUR FIRST FIGHT');
  });

  it('⚠ every exit from the card lands on the SAME latch', () => {
    // FIGHT, Android hardware back (onRequestClose), and the PC right-click.
    expect(SCREEN).toContain('onClose={markCombatPrimerSeen}');
    expect(SCREEN).toContain('if (combatPrimerOpen) { markCombatPrimerSeen(); return true; }');
    expect(CARD).toContain('onRequestClose={onClose}');
  });

  it('⚠ it stands the keyboard bar down and presents on a settled frame, like the door beat', () => {
    expect(SCREEN).toContain('|| doorBeatOpen || combatPrimerOpen');
    expect(SCREEN).toContain('setCombatPrimerVisible(true), 450');
    expect(SCREEN).toContain('visible={combatPrimerVisible}');
  });

  it('⚠⚠ the OTA-860 hint it replaces is GONE — not two cards on one beat', () => {
    expect(SCREEN_CODE).not.toContain('combat_first_fight');
    // ...and its one unique idea survived the merge.
    expect(CARD_PROSE).toContain('talked down');
  });
});

describe('OTA-1321 — the card describes the game that shipped', () => {
  it('⚠⚠ HEALING: the card says free, and the engine gives free', () => {
    // OTA-619 / OTA-1140: eating a consumable mid-fight does not hand the enemy
    // group a counter. The `rest` case refuses CAMP in a fight and says so.
    expect(STORE).toContain('combatHealNoCounter');
    expect(CARD_PROSE).toContain('is free');
    expect(CARD_PROSE).not.toContain('costs you the turn');
  });

  it('⚠⚠ APPROACH: an out-of-range weapon BUZZES and says nothing — the card is what says it', () => {
    expect(INPUTBOX).toContain('outOfRange');
    // The buzz-and-return path: no Arbiter line, no log entry, no turn.
    expect(INPUTBOX).toContain('// Combat range gate — buzz only (no tutorial nudge).');
    expect(CARD_PROSE).toContain('buzzes and nothing happens');
    expect(CARD_PROSE).not.toContain('greyed');
  });

  it('⚠ DODGE and STEALTH are described at the numbers the handlers actually use', () => {
    expect(STORE).toContain('your next strike lands double');   // dodge payoff
    expect(STORE).toContain("label: 'unseen — next strike +5'"); // stealth payoff
    expect(STORE).toContain('dodgeCooldownRounds');               // the reset between uses
    expect(CARD_PROSE).toContain('lands double');
    expect(CARD_PROSE).toContain('+5');
  });

  it('⚠⚠ every control the card names is a real button on the fight screen', () => {
    for (const label of ['dodge', 'stealth', 'approach', 'inventory', 'flee']) {
      expect(INPUTBOX).toContain(`label="${label}"`);
      expect(CARD_PROSE.toLowerCase()).toContain(label);
    }
  });

  it("⚠⚠ THE STALE COACHING IS GONE: the Arbiter stops naming a toggle OTA-847 retired", () => {
    // ApproachModal's own props comment records the removal; the nudge never
    // caught up, so for hundreds of builds the Arbiter told players to "flip
    // 'use stealth'" inside a modal that no longer has one.
    expect(read('components', 'ApproachModal.tsx')).toContain('OTA-847 retired the USE STEALTH toggle');
    expect(STORE_CODE).not.toContain("flip 'use stealth'");
    expect(STORE_CODE).toContain('Tap STEALTH before they close');
  });
});

describe('OTA-1321 — the latch, driven through the store', () => {
  it('⚠⚠ marking it seen latches, is idempotent, and does NOT eat the other milestones', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Primer', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    // A character mid-run: the three counters carry real progress.
    store.setState({
      player: {
        ...store.getState().player!,
        milestones: { enemiesDefeated: 0, travelsCompleted: 7, checksSucceeded: 3 },
      },
    });

    expect(store.getState().player!.milestones?.firstCombatPrimerShown).toBeFalsy();
    store.getState().markCombatPrimerSeen();
    const after = store.getState().player!;
    expect(after.milestones?.firstCombatPrimerShown).toBe(true);
    // ⚠ The near-miss this pins: spreading `milestones` from a partial default
    // dropped all three required counters on the way through.
    expect(after.milestones?.travelsCompleted).toBe(7);
    expect(after.milestones?.checksSucceeded).toBe(3);
    expect(after.milestones?.enemiesDefeated).toBe(0);

    // Second call is a no-op, not a rewrite.
    store.getState().markCombatPrimerSeen();
    expect(store.getState().player!.milestones).toEqual(after.milestones);
  });

  it('⚠ the latch survives a save/load round-trip — the card does not come back tomorrow', async () => {
    const store = useGameStore;
    expect(store.getState().player!.milestones?.firstCombatPrimerShown).toBe(true);
    await store.getState().persist();
    await store.getState().hydrate();
    expect(store.getState().player!.milestones?.firstCombatPrimerShown).toBe(true);
  });
});
