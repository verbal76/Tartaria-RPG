// OTA-1193 — DODGE GETS A COOLDOWN, AND THE BUTTON SHOWS IT.
//
// Owner: "put a cooldown timer on dodge. once it's used have it turn red and slowly fill
// back to blue; when it's full blue it can be used again. make the color fill left to
// right with no fade. now how long is the cool down timer? 10 seconds? 15?"
//
// ⚠ THE ANSWER WAS ROUNDS, NOT SECONDS, AND THAT WAS A DELIBERATE PUSH-BACK ON THE BRIEF.
// The game is turn-based and the owner's log shows him acting every 1-2 seconds in combat
// (`02:46:14 dodge → 02:46:15 attack`), so a 15-second wall-clock lock would cost SEVEN TO
// TEN actions and make the optimal play "put the phone down" — dead air, worse than the
// mashing it replaces, punishing fast players and rewarding slow ones for nothing skillful.
//
// ⚠ WHY A COOLDOWN AT ALL: dodge resolves as `d20 + DEX >= the enemy's attack TOTAL`, so at
// DEX 19 only a natural 1 fails. His log shows FIVE dodges, FIVE wins — including a nat 2
// and a nat 3 — each granting a ×2-dice opening that then rolled `slashing ×2.25 for 52`
// into a 47 HP raider. The dodge MATHS is untouched; only the uptime is capped.

jest.setTimeout(30000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import {
  DODGE_COOLDOWN_ROUNDS, dodgeFill, dodgeReady, dodgeCooldownLine,
} from '../app/engine/dodgeCooldown';
import { useGameStore } from '../app/state/gameStore';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const INPUT = read('app', 'components', 'InputBox.tsx');

describe('OTA-1193 — the cooldown is counted in rounds', () => {
  it('⚠ THREE ROUNDS — dodge, two locked, ready on the third', () => {
    expect(DODGE_COOLDOWN_ROUNDS).toBe(3);
  });

  it('ready when absent, so no existing save is locked out by the migration', () => {
    expect(dodgeReady(undefined)).toBe(true);
    expect(dodgeReady(0)).toBe(true);
    expect(dodgeReady(1)).toBe(false);
  });

  it('⚠ THE FILL IS DISCRETE — one hard step per action, no tween', () => {
    // Owner: "fill left to right with no fade." Continuous values here would invite the
    // renderer to animate between frames and undo that.
    expect(dodgeFill(3)).toBeCloseTo(0);
    expect(dodgeFill(2)).toBeCloseTo(1 / 3);
    expect(dodgeFill(1)).toBeCloseTo(2 / 3);
    expect(dodgeFill(0)).toBe(1);
    expect(dodgeFill(undefined)).toBe(1);
  });

  it('the fill never escapes 0…1 on nonsense input', () => {
    expect(dodgeFill(-5)).toBe(1);
    expect(dodgeFill(999)).toBe(0);
  });

  it('⚠ THE REFUSAL NAMES THE UNIT — beats, not seconds', () => {
    // A cooldown that refuses without saying how long is the OTA-1187 defect again; and
    // saying "seconds" would teach a unit the bar is not counting in.
    expect(dodgeCooldownLine(2)).toMatch(/2 more beats/);
    expect(dodgeCooldownLine(1)).toMatch(/1 more beat/);
    expect(dodgeCooldownLine(2)).not.toMatch(/second/i);
  });
});

describe('OTA-1193 — the store arms and ticks it', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Dodge', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('a fresh character can dodge', () => {
    expect(dodgeReady(useGameStore.getState().player!.dodgeCooldown)).toBe(true);
  });

  it('⚠ THE COOLDOWN TICKS DOWN ONE PER ACTION, and reaches ready again', async () => {
    // Arm it directly — the dodge verb needs a live combat scene, and what is under test
    // here is the REFILL cadence, not the stance.
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, dodgeCooldown: DODGE_COOLDOWN_ROUNDS } });
    for (let i = 0; i < DODGE_COOLDOWN_ROUNDS; i++) {
      await useGameStore.getState().submitPlayerAction('look around');
    }
    expect(dodgeReady(useGameStore.getState().player!.dodgeCooldown)).toBe(true);
  });

  it('and it is NOT ready one action early', async () => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, dodgeCooldown: DODGE_COOLDOWN_ROUNDS } });
    await useGameStore.getState().submitPlayerAction('look around');
    expect(dodgeReady(useGameStore.getState().player!.dodgeCooldown)).toBe(false);
  });

  it('⚠ IT NEVER GOES NEGATIVE — the tick is guarded', async () => {
    for (let i = 0; i < 4; i++) await useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().player!.dodgeCooldown ?? 0).toBe(0);
  });

  it('⚠ THE REFUSAL BUZZES AND DOES NOT SPEND THE TURN', () => {
    // A cooldown that silently eats the action is worse than no cooldown.
    const i = STORE.indexOf('OTA-1193 — THE COOLDOWN GATE');
    expect(i).toBeGreaterThan(-1);
    // ⚠ Wide enough to clear the comment banner. The first draft sliced 900 chars and
    // read only prose — the code it meant to assert on started after that.
    const block = STORE.slice(i, i + 1800);
    expect(block).toContain('DC.dodgeCooldownLine(player.dodgeCooldown)');
    expect(block).toContain('buzzBlocked();');
    expect(block).toContain('break;');
  });

  it('the stance arms the full count, so the tail leaves exactly the intended lock', () => {
    // The per-action tail runs on the dodge action too; arming the full count leaves
    // DODGE_COOLDOWN_ROUNDS - 1 rounds red. Off-by-one here is "every other round".
    expect(STORE).toContain('dodgeCooldown: (require(\'../engine/dodgeCooldown\')');
  });
});

describe('OTA-1193 — the button shows it', () => {
  it('⚠ TWO FLAT LAYERS, NO GRADIENT AND NO ANIMATION', () => {
    // Owner: "turn red and slowly fill back to blue… fill left to right with no fade."
    expect(INPUT).toContain('cooldownTrack');
    expect(INPUT).toContain('cooldownFill');
    // A hard edge: the blue is a plain View whose WIDTH changes.
    // ⚠ COMMENTS STRIPPED FIRST. The banner above this JSX literally says "no Animated
    // value anywhere", so a raw match flags the explanation as the violation. That is the
    // FIFTH time this shape has bitten in one session — assert on code, never on prose
    // about code.
    // ⚠ Strip whole COMMENT BLOCKS, not comment-looking LINES. A JSX comment's
    // continuation lines carry no marker at all, so a per-line filter leaves most of the
    // banner in — which is how the second draft still flagged the sentence "no Animated
    // value anywhere" as an Animated usage.
    const i = INPUT.indexOf('OTA-1193 — THE RECHARGE BAR');
    const codeOnly = INPUT.slice(i - 10, i + 1400)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/Animated|LinearGradient|opacity:/);
    expect(codeOnly).toContain('styles.cooldownFill');
  });

  it('fills from the LEFT', () => {
    const i = INPUT.indexOf('cooldownFill: {');
    const style = INPUT.slice(i, i + 160);
    expect(style).toContain('left: 0');
    expect(style).not.toContain('right: 0');
  });

  it('⚠ THE CHIP STAYS TAPPABLE WHILE RED — the engine answers, the UI does not swallow', () => {
    // Disabling it in the UI would refuse in silence, which is the bug OTA-1187 existed to
    // remove. The tap goes through and the store buzzes + explains.
    const i = INPUT.indexOf('OTA-1193 — DODGE carries a recharge bar');
    const block = INPUT.slice(i, i + 400);
    expect(block).toContain('cooldownFill={dodgeFill(dodgeCooldown)}');
    expect(block).not.toContain('blocked');
  });

  it('the fill is clipped to the chip and read from ONE place', () => {
    expect(INPUT).toContain("overflow: 'hidden'");
    expect(INPUT).toContain("import { dodgeFill } from '../engine/dodgeCooldown'");
  });

  it('a recharging chip announces itself to a screen reader', () => {
    expect(INPUT).toMatch(/recharging/);
  });
});
