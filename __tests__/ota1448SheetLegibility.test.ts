/**
 * OTA-1448 — THREE THINGS THE CHARACTER SHEET WAS NOT SAYING.
 *
 * Owner, reading his own sheet:
 *   1. *"The Arbiter section — I have no idea what the text in there means,
 *      and I don't think the player does either. Maybe post all the outcomes
 *      that are possible and gray them all out except what level you are at so
 *      we can see progression."*
 *   2. *"In the defense category it should always show what makes up your AC,
 *      you shouldn't have to tap to see it."*
 *   3. *"Corruption should be in the same section as hp and stamina under your
 *      image, not listed with your wallet."*
 *
 * ⚠⚠ ONE DEFECT, THREE FACES: the sheet knew something and did not show it.
 * The Arbiter's two ladders existed with no rungs drawn, so a line that changed
 * between sessions read as the writing wandering rather than progress earned.
 * The AC breakdown existed behind a tap, on the one number a player most wants
 * to audit. Corruption was filed under WALLET, which framed a condition eating
 * your stats as an accounting line. This is OTA-1402's rule applied to a
 * screen instead of a refusal: the game must not know a thing and stay quiet.
 */
import {
  arbiterSheetLines, regardBandOf, regardScore,
  STANCE_ORDER, STANCE_MIN_CORES, STANCE_LABEL,
  REGARD_ORDER, REGARD_BAND_FLOOR, REGARD_LABEL, REGARD_MIN,
} from '../app/engine/arbiterPersona';
import { blockAt } from '../test-utils/srcBlock';
import type { PlayerCharacter, WorldMemory } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const SHEET = read('app', 'screens', 'CharacterScreen.tsx');

const player = (over: Partial<PlayerCharacter> = {}) => ({
  name: 'T', raceId: 'reclaimer', factionId: 'reclaimers_guild',
  corruption: 0, menace: 0, factionStanding: [], storyChoices: {},
  ...over,
} as unknown as PlayerCharacter);
const wm = { npcRelations: {} } as unknown as WorldMemory;

describe('OTA-1448 — the band floors are ONE set of numbers', () => {
  it('⚠⚠ every floor in the table is exactly where regardBandOf switches', () => {
    // The sheet draws the ladder from REGARD_BAND_FLOOR while the engine judges
    // with regardBandOf. If those ever disagree the screen teaches the player a
    // threshold the game does not use — the OTA-1156/1158 copied-constant
    // defect, on a new surface. They are the same symbols now; this proves it.
    for (const band of REGARD_ORDER) {
      const floor = REGARD_BAND_FLOOR[band];
      expect({ band, at: regardBandOf(floor) }).toEqual({ band, at: band });
      if (floor > REGARD_MIN) {
        // One below the floor must be the band BELOW — never this one.
        expect({ band, below: regardBandOf(floor - 1) === band }).toEqual({ band, below: false });
      }
    }
  });

  it('⚠ the floors ascend, so the ladder can be drawn in order', () => {
    const floors = REGARD_ORDER.map((b) => REGARD_BAND_FLOOR[b]);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
  });
});

describe('OTA-1448 — the sheet is handed everything it needs to draw the ladders', () => {
  it('⚠⚠ ids, score and cores come back — no recomputing on the screen', () => {
    const s = arbiterSheetLines(player(), wm)!;
    expect(s.stanceId).toBe('witness');
    expect(s.bandId).toBe(regardBandOf(regardScore(player(), wm)));
    expect(typeof s.score).toBe('number');
    expect(s.cores).toBe(0);
  });

  it('⚠⚠ the stance id tracks Cores, which is the only thing that moves it', () => {
    const withCores = (n: number) => player({
      mainQuest: { coresRecovered: Array.from({ length: n }, (_, i) => `c${i}`) },
    } as Partial<PlayerCharacter>);
    expect(arbiterSheetLines(withCores(0), wm)!.stanceId).toBe('witness');
    expect(arbiterSheetLines(withCores(1), wm)!.stanceId).toBe('interested');
    expect(arbiterSheetLines(withCores(3), wm)!.stanceId).toBe('invested');
    expect(arbiterSheetLines(withCores(6), wm)!.stanceId).toBe('implicated');
    expect(arbiterSheetLines(withCores(9), wm)!.stanceId).toBe('named');
    expect(arbiterSheetLines(withCores(9), wm)!.cores).toBe(9);
  });

  it('⚠ the prose lines still match the ids — the old contract is intact', () => {
    const s = arbiterSheetLines(player(), wm)!;
    expect(s.stance).toBe(STANCE_LABEL[s.stanceId]);
    expect(s.regard).toBe(REGARD_LABEL[s.bandId]);
  });
});

describe('OTA-1448 — the screen draws both ladders, whole', () => {
  it('⚠⚠ it walks the ENGINE\'s orders — every rung, not a hand-typed list', () => {
    // A copied list would silently stop showing a stance the day one is added.
    expect(SHEET).toContain('STANCE_ORDER.map((id) =>');
    expect(SHEET).toContain('REGARD_ORDER.map((id) =>');
    expect(SHEET).toContain('STANCE_LABEL[id]');
    expect(SHEET).toContain('REGARD_LABEL[id]');
  });

  it('⚠⚠ the rung you are on is lit and the rest are dimmed', () => {
    // "gray them all out except what level you are at" — the dimming IS the
    // information, so it has to be visible rather than a subtle tint.
    expect(SHEET).toContain('const here = id === arbiter.stanceId;');
    expect(SHEET).toContain('const here = id === arbiter.bandId;');
    expect(SHEET).toContain('!here && styles.ladderRowDim');
    const dim = blockAt(SHEET, 'ladderRowDim:');
    expect(dim).toContain('opacity');
  });

  it('⚠⚠ each rung shows what it COSTS, read from the engine', () => {
    // Progression the player can plan against: Cores for stance, score for
    // regard — both from the same tables the engine judges with.
    expect(SHEET).toContain('STANCE_MIN_CORES[id]');
    expect(SHEET).toContain('REGARD_BAND_FLOOR[id]');
    expect(SHEET).toContain('of 9');
  });

  it('⚠ and it says which ladder moves both ways — they are not the same kind', () => {
    expect(SHEET).toContain('It only ever goes up.');
    expect(SHEET).toContain('it moves both ways');
  });
});

describe('OTA-1448 — the AC breakdown is never hidden', () => {
  it('⚠⚠ THE TAP IS GONE — no toggle state, no affordance, always rendered', () => {
    expect(SHEET).not.toContain('acOpen');
    expect(SHEET).not.toContain('setAcOpen');
    expect(SHEET).not.toContain('tap to see what makes up your AC');
  });

  it('⚠⚠ the breakdown renders whenever there is anything to break down', () => {
    // Guarded only by "are there sources", never by an open/closed flag.
    expect(SHEET).toContain('{acBd.sources.length > 0 && (');
    expect(SHEET).toContain('acBd.sources.map((s, i) =>');
    expect(SHEET).toContain('total Armor Class');
  });
});

describe('OTA-1448 — corruption sits with the body, not the purse', () => {
  it('⚠⚠ it is a bar in the header card, beside HP and STA', () => {
    const header = SHEET.indexOf('{/* ── HEADER CARD');
    const wallet = SHEET.indexOf("sectionHeader('wallet'");
    const cor = SHEET.indexOf("<Text style={styles.barLabel}>COR</Text>");
    expect(header).toBeGreaterThan(-1);
    expect(cor).toBeGreaterThan(header);
    expect(cor).toBeLessThan(wallet); // in the header card, above the wallet
    // …and it is a meter like its neighbours, not a stray number among bars.
    expect(SHEET).toContain('backgroundColor: corrColor');
  });

  it('⚠⚠ the wallet card no longer carries it, and its title says so', () => {
    expect(SHEET).toContain("sectionHeader('wallet', 'WALLET & REPUTATION')");
    // ⚠ The CALL, not a bare substring: the comment above it quotes the old
    // title on purpose ("was WALLET & CONDITION"), and a substring check would
    // fail on the documentation explaining the change — the same
    // text-in-a-comment false positive OTA-1447 taught the slice-pin guard.
    expect(SHEET).not.toContain("sectionHeader('wallet', 'WALLET & CONDITION')");
    const walletCard = SHEET.slice(SHEET.indexOf("sectionHeader('wallet'"));
    expect(walletCard).not.toContain('<Text style={styles.kvKey}>Corruption</Text>');
  });

  it('⚠ the fill clamps, because corruption itself is uncapped', () => {
    // The scale tops out at the hollowed floor; a character past it must not
    // paint a bar wider than the track.
    expect(SHEET).toContain('Math.min(100, Math.max(0, corrPct * 100))');
  });
});
