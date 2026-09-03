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

// OTA-1655 — THE CARD IS ASKED, NOT READ.
//
// This suite exists because of a measurement, not a bug report. The owner asked
// for an audit of every OTA shipped in the last 24 hours — *"make sure they all
// work"* — so each of the twenty suites was scored by HOW it proves its OTA:
// assertions that call the code and check the answer, versus assertions that
// read the source file and look for a string.
//
//   ota1634 25/26 behavioural   ota1644 27/28   ota1649 73/88
//   ota1635 25/25               ota1645 24/24   ota1650 68/72
//   ota1636 21/26               ota1646 34/39   ota1651  1/23  ⚠
//   ota1637 28/38               ota1647 24/25   ota1652 20/22
//   ota1638 24/36               ota1648 10/17   ota1653 21/27
//   ota1639 15/16   ota1640 19/25   ota1641 16/17   ota1642 16/18   ota1643 53/53
//
// ⚠ OTA-1651 IS THE OUTLIER AND IT IS THE ONE THAT MOVED WHAT THE PLAYER SEES.
// Twenty-two of its twenty-three assertions are `expect(SOURCE).toContain(…)`
// against EnemyPanel.tsx and StatsPanel.tsx. A source pin cannot tell a working
// card from a broken one: rename a local and it goes red on correct code; route
// the same text through another helper and it stays green on a card that lost
// the line. Two of those pins even assert a `.indexOf` ORDERING between two
// source strings — the order the calls appear in the FILE, not the order the
// lines come out in.
//
// `enemyDetailBody` was already pure, so the fix was one export. What follows
// asks the card the questions OTA-1651 answered.

import { enemyDetailBody, type EnemyView } from '../app/components/EnemyPanel';
import type { Enemy } from '../app/engine/types';

function foe(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Rust Stalker',
    type: 'Construct',
    rarity: 'Uncommon',
    hp: 22,
    attack: 'Road Blade',
    damage: '1D8+2',
    flavor: 'A frame of scavenged rebar that walks like it remembers being a man.',
    traits: [],
    loot: [],
    ...over,
  } as unknown as Enemy;
}

function view(over: Partial<EnemyView> = {}): EnemyView {
  return { enemy: foe(), currentHp: 22, ...over } as EnemyView;
}

describe('OTA-1655 — the flavour really is in the expanded card (OTA-1651, asked)', () => {
  it('the flavour sentence is IN the body', () => {
    const body = enemyDetailBody(view(), false);
    expect(body).toContain('A frame of scavenged rebar');
  });

  it('⚠ and it comes ABOVE the numbers, measured on the OUTPUT lines', () => {
    // The owner opens this card to look at the creature, so the sentence
    // describing it precedes the stat block. OTA-1651 asserted this by comparing
    // `.indexOf` of two source strings — the order two `lines.push` CALLS appear
    // in the file, which is not the same claim at all. This reads the rendered
    // lines.
    const lines = enemyDetailBody(view(), false).split('\n');
    const flavourAt = lines.findIndex((l) => l.includes('A frame of scavenged rebar'));
    const hpAt = lines.findIndex((l) => l.startsWith('HP '));
    expect(flavourAt).toBeGreaterThan(-1);
    expect(hpAt).toBeGreaterThan(-1);
    expect(flavourAt).toBeLessThan(hpAt);
  });

  it('an enemy with no flavour renders cleanly rather than a blank gap or "undefined"', () => {
    const body = enemyDetailBody(view({ enemy: foe({ flavor: undefined }) }), false);
    expect(body).not.toContain('undefined');
    expect(body).toContain('HP 22/22');
    // No run of three blank lines where the flavour block would have been.
    expect(body).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('OTA-1655 — the hands are in the expanded card, in words (OTA-1651, asked)', () => {
  it('both hands are named, and each says whether it reaches', () => {
    const body = enemyDetailBody(view({
      hands: [
        { slot: 'main', label: 'Magnetic Axe', inRange: true },
        { slot: 'off', label: 'Rusty Shortbow', inRange: false },
      ],
    }), false);
    expect(body).toContain('Main hand: Magnetic Axe — reaches this one');
    expect(body).toContain('Off hand: Rusty Shortbow — cannot reach from here');
  });

  it('⚠ the words carry it, not the dot — the sentence survives without the glyph', () => {
    // The whole reason this moved off the combat card is that two bare weapon
    // names plus a lit/unlit dot read as a stray reference to the player's own
    // axe. Strip the glyphs and the line must still say what it means.
    const body = enemyDetailBody(view({
      hands: [{ slot: 'main', label: 'Magnetic Axe', inRange: true }],
    }), false).replace(/[●○]/g, '').trim();
    expect(body).toContain('Main hand: Magnetic Axe — reaches this one');
  });

  it('no hands supplied → no hands section, and nothing empty left behind', () => {
    const body = enemyDetailBody(view({ hands: [] }), false);
    expect(body).not.toContain('Main hand');
    expect(body).not.toContain('Off hand');
    expect(body).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('OTA-1655 — what the card was ALREADY meant to carry still comes out', () => {
  it('the identity line, the HP/AC line and the damage line all render', () => {
    const body = enemyDetailBody(view(), false);
    expect(body).toContain('Construct');
    expect(body).toContain('Uncommon');
    expect(body).toMatch(/HP 22\/22\s+AC \d+/);
    expect(body).toMatch(/Attack \+\d+\s+Damage /);
  });

  it('a BOSS is marked, and its defences are spelled out without the Wisdom gate', () => {
    // ⚠ The defences come from `defensesFor` — the OTA-1611 reconciler that reads
    // the enemy's type and traits — NOT from fields a fixture can hand it. So the
    // claim under test is that a boss's defences are DISCLOSED and each one is
    // named in words plus a labelled type, whatever those types turn out to be.
    const boss = enemyDetailBody(view({ enemy: foe({ boss: true } as Partial<Enemy>) }), false);
    expect(boss).toContain('BOSS');
    expect(boss).toMatch(/\(Weak: [A-Z]/);
    expect(boss).toMatch(/\(Resists: [A-Z]/);
    // …and never the wisdom-gated refusal, because a boss is always readable.
    expect(boss.toLowerCase()).not.toContain("can't read its weaknesses");
  });

  it('⚠ a non-boss you cannot read says SO — a silent card would read as "no defences"', () => {
    // canRead false and nothing observed: the card must not simply omit the
    // section, or an unread enemy is indistinguishable from a defenceless one.
    const body = enemyDetailBody(view(), false);
    expect(body.toLowerCase()).toContain("can't read its weaknesses");
    expect(body).not.toMatch(/\(Weak: [A-Z]/);
  });

  it('what you have already SEEN is revealed even when you cannot read it on sight', () => {
    const body = enemyDetailBody(view(), false, { weak: ['burn'], resist: [] });
    expect(body).toMatch(/Weak: Burn/i);
    expect(body).toContain("You've seen it flinch");
    // …and the card tells you how to learn the rest, rather than going quiet.
    expect(body).toContain('Keep striking with new types');
  });

  it('Wisdom 12 reads them on sight — canRead true discloses what the gate withheld', () => {
    const gated = enemyDetailBody(view(), false);
    const read = enemyDetailBody(view(), true);
    expect(gated.toLowerCase()).toContain("can't read its weaknesses");
    expect(read.toLowerCase()).not.toContain("can't read its weaknesses");
    expect(read).toMatch(/\(Weak: [A-Z]/);
  });

  it('the threat verdict is spelled out, not left to a colour', () => {
    for (const [threat, says] of [['red', 'RED'], ['yellow', 'YELLOW'], ['green', 'GREEN']] as const) {
      expect(enemyDetailBody(view({ threat }), false)).toContain(says);
    }
  });

  it('the body is a plain string for any enemy shape thrown at it', () => {
    // A popup that throws takes the whole screen with it. Exercise the shapes a
    // save can actually hold: no flavour, no traits, no range, zero HP.
    const shapes: EnemyView[] = [
      view(),
      view({ enemy: foe({ flavor: undefined, traits: undefined }) }),
      view({ currentHp: 0 }),
      view({ rangeLabel: 'far', inRange: false, threat: 'green' }),
      view({ hands: [{ slot: 'off', label: 'Bare hands', inRange: false }] }),
    ];
    for (const v of shapes) {
      expect(typeof enemyDetailBody(v, true)).toBe('string');
      expect(enemyDetailBody(v, true).length).toBeGreaterThan(0);
    }
  });
});
