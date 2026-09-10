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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1800 — GREEN MEANS USABLE NOW, NOT MERELY IN RANGE.
 *
 * ⚠⚠⚠ THE CONTRACT, IN THE OWNER'S WORDS:
 *
 *   *"GREEN = PRESSING THIS WEAPON IS A VALID ACTION NOW. Not merely: GREEN =
 *   ENEMY DISTANCE MATCHES WEAPON RANGE."*
 *
 * and the presentation ruling that hangs off it:
 *
 *   dark body   = this is my equipped weapon
 *   green name  = I can use it right now
 *   neutral name= equipped, but not currently a valid action
 *
 * ⚠⚠ WHY THIS SUITE EXISTS AT ALL. The combat button has now been wrong about
 * this THREE times, each time the same way and each time one gate further down:
 *
 *   OTA-1006  the button re-derived reach from the display catalog and missed
 *             the forge stamp — a close-only fused weapon glowed at mid range.
 *   OTA-1517  the store had refused melee against grounded foes below since
 *             OTA-960; the button had never heard of elevation. Four taps.
 *   OTA-1800  the store has refused a JAMMED weapon since OTA-1564; the button
 *             had never heard of that either. A jammed Rust Rifle at close
 *             range painted itself ready and the tap bounced.
 *
 * Each fix taught the button one more rule. That is a losing pattern, so this
 * one changed the shape instead: `weaponSwingRefusal` IS the store's gates, and
 * the button asks it rather than assembling an answer. What this suite pins is
 * that arrangement — not the three rules, which belong to the store.
 *
 * ⚠ IT ASSERTS NO COMBAT RULE. Nothing here says what SHOULD refuse a swing;
 * every case below asks only whether the presentation agrees with the gate. A
 * balance change that alters when a weapon may swing leaves this suite green,
 * which is correct: it is a suite about agreement, not about mechanics.
 */
import {
  weaponSwingRefusal,
  weaponJamLock,
  type WeaponSwingFacts,
} from '../app/state/combatResolution';
import { weaponTone } from '../app/components/InputBox';
import type { PlayerCharacter } from '../app/engine/types';
import { reachBandsFor } from '../app/engine/types';
import type { StatusEffect, CombatRange } from '../app/engine/types';

/** The presentation rule under test, stated once: the button is green exactly
 *  when the gate has no refusal. This mirrors `weaponTone`'s final line. */
const nameIsGreen = (f: WeaponSwingFacts): boolean => weaponSwingRefusal(f) === null;

const MELEE = reachBandsFor('melee');
const THROWN = reachBandsFor('throwable');

const jam = (label: string, rounds = 2): StatusEffect => ({
  kind: 'weapon_overheated',
  remainingRounds: rounds,
  label,
});

/** The owner's own physical example: a greatsword against a foe that steps back
 *  and is approached again. */
const GREATSWORD = "Reaver's Greatsword";
const sword = (range: CombatRange | null | undefined, over: Partial<WeaponSwingFacts> = {}): WeaponSwingFacts => ({
  bands: MELEE,
  range,
  swungWeaponName: GREATSWORD,
  ...over,
});

describe('OTA-1800 case 1-3 — the owner\'s step-back / approach sequence', () => {
  // ⚠ These three are the owner's verification cases verbatim, and they are
  // about the NAME only: the body is dark in all three by construction, because
  // nothing in the presentation path varies the fill with readiness any more.
  it('CASE 1 — enemy at close, every requirement met: the name is green', () => {
    expect(nameIsGreen(sword('close'))).toBe(true);
  });

  it('CASE 2 — STEP BACK to mid: the name returns to neutral', () => {
    expect(nameIsGreen(sword('mid'))).toBe(false);
    expect(weaponSwingRefusal(sword('mid'))).toBe('out-of-reach');
  });

  it('CASE 3 — APPROACH back to close: the name is green again', () => {
    expect(nameIsGreen(sword('close'))).toBe(true);
  });

  // ⚠ CASE 5 — the equipment identity is stable while readiness moves. Same
  // weapon, same hand, same everything except the band; only the answer moves.
  it('CASE 5 — readiness changes without the equipped weapon changing', () => {
    const answers = (['close', 'mid', 'close'] as CombatRange[]).map((r) => nameIsGreen(sword(r)));
    expect(answers).toEqual([true, false, true]);
    // The weapon named in the facts never changed — that is the point.
    expect(sword('close').swungWeaponName).toBe(sword('mid').swungWeaponName);
  });
});

describe('OTA-1800 case 4 — a condition that is not distance', () => {
  /* ⚠⚠⚠ THE ONE THAT WAS ACTUALLY BROKEN, and the reason the owner's §3 exists.
   * Range says yes. The store says no, because OTA-1564's jam gate refuses a
   * `weapon_overheated` lock naming this weapon. Before this OTA the button
   * answered the range question and painted green. */
  it('a JAMMED weapon in perfect range is NOT green', () => {
    const facts = sword('close', { statusEffects: [jam(GREATSWORD)] });
    expect(weaponSwingRefusal(facts)).toBe('jammed');
    expect(nameIsGreen(facts)).toBe(false);
  });

  it('the jam is by NAME — a seized sidearm does not stop the other hand', () => {
    const facts = sword('close', { statusEffects: [jam('Rust Rifle')] });
    expect(weaponJamLock(facts.statusEffects, GREATSWORD)).toBeNull();
    expect(nameIsGreen(facts)).toBe(true);
  });

  it('a lock that has run out of rounds no longer refuses', () => {
    const facts = sword('close', { statusEffects: [jam(GREATSWORD, 0)] });
    expect(nameIsGreen(facts)).toBe(true);
  });

  // ⚠ ELEVATION — OTA-960's rule, which the button learned at OTA-1517. Kept
  // here because it is the other non-distance refusal and the pair of them is
  // the argument for asking one predicate rather than three.
  it('a melee weapon against grounded foes below is NOT green, in band or not', () => {
    const facts = sword('close', { groundedFoesBelow: true });
    expect(weaponSwingRefusal(facts)).toBe('cannot-fire-down');
    expect(nameIsGreen(facts)).toBe(false);
  });

  it('a weapon that fires down IS green against grounded foes below', () => {
    const facts: WeaponSwingFacts = { bands: THROWN, range: 'close', groundedFoesBelow: true };
    expect(nameIsGreen(facts)).toBe(true);
  });
});

describe('OTA-1800 — the order of refusals is the store\'s order', () => {
  /* ⚠ The store prints the FIRST refusal it hits and stops, so a weapon that is
   * both jammed AND out of reach is told about the reach — the thing the player
   * can act on by moving. A predicate that reported these in a different order
   * would light the button correctly and describe it wrongly. */
  it('out-of-reach outranks a jam', () => {
    const facts = sword('mid', { statusEffects: [jam(GREATSWORD)] });
    expect(weaponSwingRefusal(facts)).toBe('out-of-reach');
  });

  it('elevation outranks a jam', () => {
    const facts = sword('close', { groundedFoesBelow: true, statusEffects: [jam(GREATSWORD)] });
    expect(weaponSwingRefusal(facts)).toBe('cannot-fire-down');
  });
});

describe('OTA-1800 — out of combat says nothing', () => {
  it('no band means no readiness claim at all', () => {
    // `weaponTone` returns undefined here and the chip takes its plain chassis:
    // there is no target, so "can I use this now" has no answer to give.
    expect(weaponSwingRefusal(sword(null))).toBeNull();
    expect(weaponSwingRefusal(sword(undefined))).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠⚠ THE STALENESS CASES the owner's §16 asks for by name. Each drives the
   predicate through a real transition and checks the answer MOVED — a cached or
   stale readiness would hold its previous value and fail here.
   ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1800 §16 — readiness is never stale', () => {
  it('after STEP BACK the green does not survive the move', () => {
    let green = nameIsGreen(sword('close'));
    expect(green).toBe(true);
    green = nameIsGreen(sword('mid'));   // the step back
    expect(green).toBe(false);
  });

  it('after APPROACH the neutral does not survive the move', () => {
    let green = nameIsGreen(sword('far'));
    expect(green).toBe(false);
    green = nameIsGreen(sword('close')); // the approach
    expect(green).toBe(true);
  });

  it('a jam applied mid-fight takes the green away without anything else moving', () => {
    const before = sword('close');
    const after = sword('close', { statusEffects: [jam(GREATSWORD)] });
    expect(nameIsGreen(before)).toBe(true);
    expect(nameIsGreen(after)).toBe(false);
    // Same band, same weapon: only the lock differs.
    expect(after.range).toBe(before.range);
    expect(after.swungWeaponName).toBe(before.swungWeaponName);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠⚠⚠ THE CONNECTION ITSELF — and this block exists because the negative
   control found the suite without it was not enough.
   ══════════════════════════════════════════════════════════════════════════
   Everything above exercises `weaponSwingRefusal`, the authority. NC-5 cut
   `weaponTone` loose from that authority — letting the button re-derive
   readiness from range alone, which is the exact defect §3 forbids — and every
   test above stayed GREEN, because none of them ever called the consumer.

   A rule with no reader is not enforced. So these call the real presentation
   function and drive it through a state that ONLY the authority knows about:
   a jammed weapon in perfect range. A button computing its own range answer
   cannot pass this, no matter how correct the predicate beside it is. */
const SWORD = 'Iron Sword';
const armed = (over: Partial<PlayerCharacter> = {}): PlayerCharacter => ({
  equipped: { main: SWORD },
  inventory: [],
  stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 10 },
  ...over,
} as unknown as PlayerCharacter);

describe('OTA-1800 — the button reads the authority, it does not re-derive', () => {
  it('sanity: an unjammed sword at close reads strike', () => {
    expect(weaponTone(armed(), 'main', 'close', false, SWORD)).toBe('strike');
  });

  // ⚠⚠ THE ONE NC-5 NEEDED. Range says close. The gate says jammed. A button
  // answering the range question returns 'strike' here and is wrong.
  it('a JAMMED sword at close does NOT read strike', () => {
    const p = armed({ statusEffects: [jam(SWORD)] } as Partial<PlayerCharacter>);
    expect(weaponTone(p, 'main', 'close', false, SWORD)).toBe('needs-approach');
  });

  it('out of band still reads needs-approach', () => {
    expect(weaponTone(armed(), 'main', 'far', false, SWORD)).toBe('needs-approach');
  });

  it('out of combat the button makes no readiness claim', () => {
    expect(weaponTone(armed(), 'main', null, false, SWORD)).toBeUndefined();
  });
});
