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

// ⚠⚠⚠ OTA-1591 — THE BUZZ LEARNS TO TALK.
//
// FROM THE OWNER'S 2026-08-31 DEVICE LOG, fighting Conspiracy Architects Raiders
// from the top of a dead tree, foes grounded at the base:
//
//   02:52:27.581  ui: tap "🔥 geode-cored cleaver"
//   02:52:28.563  ui: tap "🔥 geode-cored cleaver"
//      … nine taps in 2.7 seconds …
//   02:52:30.297  ui: tap "🔥 geode-cored cleaver"
//   02:52:35.917  [player] attack with the off-hand bone crossbow   ← works
//
// NINE taps on his main hand. Not one [player] line, not one word of output.
// QuickBtn's `outOfRange` branch (OTA-1517) vibrated for 30ms and RETURNED —
// while three layers down, the store's OTA-960 elevation gate held a FREE,
// fully-written refusal that names the weapon, the reason and the remedy, and
// never got to say it. A silent gate in FRONT of a spoken one is the defect
// class B15 closed ("refusals always speak"), rebuilt in the UI layer.
//
// The fix: the amber tint stays, the buzz stays, and the tap now passes through
// to the store — one implementation of the answer, the one with words. This
// suite proves the words actually arrive in his exact scenario, and that the
// refusal is free.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(120000);

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('OTA-1591 — his exact scenario finally gets an answer', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Talker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
  });

  it('⚠⚠⚠ ELEVATED, FOES AT THE BASE, MELEE SWING → THE ARBITER SAYS WHY, FOR FREE', async () => {
    const p = store.getState().player!;
    const raider = {
      name: 'Conspiracy Architects Raider 2',
      hp: 13, attack: 2, damage: '1d4', rarity: 'Common',
    };
    useGameStore.setState({
      player: {
        ...p,
        hp: 100, hpMax: 100, stamina: 40, staminaMax: 40,
        equipped: { ...(p.equipped ?? {}), main: 'Rusty Cleaver', off: undefined, weaponName: 'Rusty Cleaver' },
        inventory: [
          ...(p.inventory ?? []),
          { id: 'w_cleaver', name: 'Rusty Cleaver', kind: 'weapon', rarity: 'Common', quantity: 1 } as never,
        ],
      },
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [raider as never], enemyHps: [13], activeEnemyIdx: 0, range: 'close',
        enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        enemyArmorShred: [0], enemyCorruptionStacks: [0],
        hooks: [],
        elevatedOn: 'dead tree' as never,
        enemiesAtBase: true as never,
      },
    });
    const staminaBefore = store.getState().player!.stamina;
    const logBefore = store.getState().gameLog.length;

    // The exact text the main-hand chip submits — the tap that used to be
    // swallowed before it could become an action.
    await store.getState().submitPlayerAction('attack with the rusty cleaver');
    await new Promise((r) => setTimeout(r, 200));

    const newLines = store.getState().gameLog.slice(logBefore).map((e) => e.text).join('\n');
    // The OTA-960 refusal, verbatim shape: names the target's position, the
    // weapon's limit, and both remedies.
    expect(newLines).toContain('down at the base');
    expect(newLines).toContain("won't reach from up here");
    expect(newLines).toContain('climb down');
    // ⚠ And it is FREE — the gate sits above the stamina spend. A refusal that
    // charged for the lesson would punish the player for the UI's old silence.
    expect(store.getState().player!.stamina).toBe(staminaBefore);
    // The raider took nothing — no swing happened.
    expect(store.getState().currentScene!.enemyHps[0]).toBe(13);
  });
});

describe('OTA-1591 — the chip lets the tap through, and the primer tells the truth', () => {
  const INPUTBOX = readFileSync(join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8');
  const CARD = readFileSync(join(__dirname, '..', 'app', 'components', 'CombatPrimerModal.tsx'), 'utf8');

  it('⚠⚠⚠ THE outOfRange BRANCH BUZZES AND FALLS THROUGH — the early return is gone', () => {
    // Stated against code: the vibrate survives, but it is no longer followed by
    // a `return;` — so onPress() runs and the store's refusal speaks. The old
    // shape (vibrate-then-return) must never come back; nine silent taps in the
    // owner's log are what it costs.
    expect(INPUTBOX).toContain('try { Vibration.vibrate(30); } catch { /* ignore */ }');
    expect(INPUTBOX).not.toContain('try { Vibration.vibrate(30); } catch { /* ignore */ }\n      return;');
  });

  it('⚠⚠ the combat primer no longer teaches the silence', () => {
    // The POSITIVE claim (the card now says the Arbiter answers) lives in
    // ota1321, whose whole subject is the primer describing the shipped game —
    // duplicating its prose pin here tripped the quoted-pin ratchet, and the
    // ratchet is right: one owner per prose claim. This suite keeps only the
    // negative: the old lesson must never come back.
    expect(CARD).not.toContain('buzzes and nothing happens');
  });

  it('⚠ the amber tone still marks the chip before the tap — the hint is layered, not replaced', () => {
    expect(INPUTBOX).toContain("outOfRange={mainT === 'needs-approach'}");
    expect(INPUTBOX).toContain("outOfRange={offT === 'needs-approach'}");
  });
});
