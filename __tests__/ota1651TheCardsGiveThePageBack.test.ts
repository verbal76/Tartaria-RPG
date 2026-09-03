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

// ⚠⚠⚠ OTA-1651 — THE CARDS GIVE THE PAGE BACK.
//
// Owner, with a screenshot of the exploration screen: *"in the shrunken
// character portrait we can remove all of the gold writing telling me what's
// equipped. under the stars numbers and remove the faction standing there as
// well. for the enemy portrait remove the weapon reference on top, I guess that
// is referencing my axe? if so it doesn't need to be there I'm not sure what the
// reclaimers line is there, and we don't need the flavor text, this is a fight,
// move the flavor text to the expanded enemy card. that should shorten both
// cards enough to give some room back to the main text block in the center of
// the exploration screen."*
//
// ⚠⚠ TWO THINGS COME OFF, TWO THINGS MOVE, AND THE DIFFERENCE MATTERS.
//
//   • OFF, because they are reference material and the full sheet is one tap
//     away: the four-line gold Equipped block, and Faction standing.
//   • MOVED, because they are real answers he asked for earlier and would miss:
//     the bestiary flavour line (OTA-897) and the per-hand reach row (OTA-1502)
//     both go into `enemyDetailBody`, the tap-for-info popup.
//
// ⚠ HE GUESSED RIGHT ABOUT THE AXE. Those two lines on the ENEMY card were his
// own main and off hands — ● = that hand reaches this foe, ○ = it cannot. A bare
// weapon name on someone else's card reads as theirs, which is why it confused
// him; in the popup it says so in words.
import { readFileSync } from 'node:fs';

const STATS = readFileSync('app/components/StatsPanel.tsx', 'utf8');
const PANEL = readFileSync('app/components/EnemyPanel.tsx', 'utf8');

/** Source with block and line comments stripped — the OTA-1497 rule. These
 *  files DOCUMENT what they removed and why, and a scan that cannot tell
 *  documentation from code would forbid saying so. */
const code = (src: string): string =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('OTA-1651 — the cards give the page back', () => {
  describe('the shrunken character portrait', () => {
    it('the gold Equipped block is gone', () => {
      expect(code(STATS)).not.toMatch(/Equipped:\s*\{equippedLabel\}/);
      expect(code(STATS)).not.toContain('styles.equipped');
    });

    it('faction standing is gone', () => {
      expect(code(STATS)).not.toMatch(/Faction standing:/);
    });

    it('⚠ and the machinery behind them went too, not just the rows', () => {
      // A row deleted while its builder stays is dead code that still costs a
      // render pass — and `slotParts` walked the inventory on every frame to
      // resolve coated names for a block nobody would see.
      expect(code(STATS)).not.toContain('equippedLabel');
      expect(code(STATS)).not.toContain('slotParts');
      expect(code(STATS)).not.toContain('factionStanding');
    });

    it('⚠⚠ WHAT STAYS, and it is the point of the card', () => {
      // The trim is aimed at reference material only. Everything the player
      // fights by is untouched — and so are the OTA-1650 companion glyphs added
      // an hour before this.
      for (const kept of [
        'HP', 'STA', 'AC', 'Corr',           // the vitals row
        'PWR',                                // the power rating
        'Effects:', 'Contracts:',             // live state, not reference
        'tap for full sheet ›',               // where the trimmed detail went
        'GOLEM_ARMED_GLYPH', 'DOG_ARMORED_GLYPH',
      ]) {
        expect(STATS).toContain(kept);
      }
    });
  });

  describe('the enemy card in a fight', () => {
    it('the flavour line is off the combat card', () => {
      expect(code(PANEL)).not.toContain('style={styles.flavorLine}');
    });

    it('the two hand rows are off the combat card', () => {
      expect(code(PANEL)).not.toContain('{!!view.hands?.length && (');
      expect(code(PANEL)).not.toContain('styles.handsRow');
    });

    it('⚠ the styles went with the rows — no dead block to mislead a refactor', () => {
      expect(code(PANEL)).not.toMatch(/handsRow: \{/);
      expect(code(PANEL)).not.toMatch(/handIn: \{/);
      expect(code(PANEL)).not.toMatch(/flavorLine: \{/);
    });

    it('⚠⚠ WHAT STAYS: everything a swing is decided by', () => {
      // The range chip is the one that matters — it is the card-level answer to
      // the same question the hand rows answered per hand, and it is what the
      // attack gate actually rolls against.
      for (const kept of ['IN RANGE', 'OUT OF RANGE', 'styles.range', 'hpBarFill', 'RESIST', 'WEAK']) {
        expect(PANEL).toContain(kept);
      }
    });
  });

  describe('nothing was deleted that the owner had asked for before', () => {
    it('the flavour reappears in the expanded card', () => {
      const i = PANEL.indexOf('function enemyDetailBody(');
      expect(i).toBeGreaterThan(-1);
      const body = PANEL.slice(i, PANEL.indexOf('\n}', i));
      expect(body).toContain('e.flavor');
      // ⚠ ABOVE the numbers: the popup is opened to look at the creature, so the
      // sentence describing it comes before the stat block, not after it.
      expect(body.indexOf('lines.push(e.flavor)')).toBeLessThan(body.indexOf('lines.push(`HP '));
    });

    it('the hands reappear in the expanded card, in words', () => {
      const i = PANEL.indexOf('function enemyDetailBody(');
      const body = PANEL.slice(i, PANEL.indexOf('\n}', i));
      expect(body).toContain('view.hands');
      expect(body).toContain("'Main hand' : 'Off hand'");
      expect(body).toContain("'reaches this one' : 'cannot reach from here'");
    });

    it('⚠⚠⚠ THE REACH RESOLVER IS UNTOUCHED — this OTA moved a view, not a rule', () => {
      // OTA-1502 built `view.hands` off the same resolver the attack gate rolls
      // with, precisely so a card could not drift from a swing. Presentation
      // moved; the model and its source did not.
      expect(PANEL).toContain("hands?: Array<{ slot: 'main' | 'off'; label: string; inRange: boolean }>;");
      const expl = readFileSync('app/screens/ExplorationScreen.tsx', 'utf8');
      expect(expl).toContain('playerWeaponReach(player, slot)');
      expect(expl).toContain('inRange: band !== null && h.bands.includes(band),');
    });
  });
});
