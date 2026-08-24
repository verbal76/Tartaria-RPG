/**
 * OTA-1475 — THE HIDDEN MARKET POSTS FOR EVERYBODY.
 *
 * ⚠⚠⚠ THE OWNER, 4.32.11, standing in the Market square:
 *
 *   "also, I think in the hidden market in the square should be a version of the
 *    missions board like in the starter outpost, since it's a no fighting zone,
 *    then I'm guessing that all of the factions should be able to post there
 *    without interaction from each other"
 *
 * ⚠⚠ THE TRUCE IS ALREADY IN THE FICTION and the Market says so itself, in the
 * same log, when a hostile party finds him there:
 *
 *   02:56 (00:15:48)  "Steel glints out past the stalls — and stays there. The
 *                      Market's truce is older than any grudge; whoever wants
 *                      you settles for watching you trade."
 *
 * Nine factions that will not fight in the square have no reason not to nail
 * work to the same post. And a BROKER stall in that same market already searches
 * every faction's HUNT pool (`isBrokerVendorId`); this is the same idea for the
 * contract board, which had exactly one shape — `{ faction: string }`, one
 * faction, `outpost_central` only.
 *
 * ⚠ "WITHOUT INTERACTION FROM EACH OTHER" IS THE LOAD-BEARING PHRASE, and it is
 * why every layer here keeps the rows GROUPED. Taking a Reclaimers posting off
 * the Market board is Reclaimers work: it pays and costs Reclaimers standing and
 * does not touch what the Eternal Dynasty will post tomorrow. Nothing merges the
 * pools; the square only puts them side by side under one roof.
 */
import {
  neutralBoardPostings, factionOfFactionQuest, availableFactionQuests,
  FACTION_QUESTS,
} from '../app/engine/factionQuests';
import { FACTIONS, getStanding } from '../app/engine/factions';
import { BUILDINGS } from '../app/engine/buildings';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));
const BOARD = codeOnly(read('app', 'state', 'slices', 'boardSlice.ts'));
const QUEST = codeOnly(read('app', 'state', 'slices', 'questSlice.ts'));
const MODAL = codeOnly(read('app', 'components', 'MissionBoardModal.tsx'));
const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));

const NONE: string[] = [];
const rep0 = () => 0;

describe('OTA-1475 — the pool: nine factions, side by side, still separate', () => {
  it('⚠⚠⚠ THE CATALOGUE IS LOADED — nine factions and a real quest table', () => {
    expect(FACTIONS.length).toBe(9);
    expect(FACTION_QUESTS.length).toBeGreaterThan(30);
  });

  it('⚠⚠⚠ A BRAND-NEW CHARACTER FINDS WORK FROM MORE THAN ONE COLOUR', () => {
    // The whole point of the ask: the Market is the one place a rep-0 player can
    // see what every faction wants without walking to nine outposts.
    const groups = neutralBoardPostings(FACTIONS, rep0, NONE, NONE);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.reduce((n, g) => n + g.postings.length, 0)).toBeGreaterThan(1);
  });

  it('⚠⚠⚠ AND EVERY ROW IS FILED UNDER ITS OWN FACTION — no merging', () => {
    // "without interaction from each other". A posting appearing under the wrong
    // heading would make the player fly the wrong colour for it.
    for (const g of neutralBoardPostings(FACTIONS, rep0, NONE, NONE)) {
      for (const q of g.postings) {
        expect({ id: q.id, under: g.factionId, actually: q.factionId })
          .toEqual({ id: q.id, under: g.factionId, actually: g.factionId });
      }
    }
  });

  it('⚠⚠⚠ IT IS EXACTLY THE NINE OUTPOST BOARDS, CONCATENATED — one definition', () => {
    // Not a second filter that could drift from `availableFactionQuests`. The
    // Market shows what each faction's own board would show, and nothing else.
    for (const rep of [0, 25, 60]) {
      const groups = neutralBoardPostings(FACTIONS, () => rep, NONE, NONE);
      const fromBoard = new Set(groups.flatMap((g) => g.postings.map((q) => q.id)));
      const fromNine = new Set(FACTIONS.flatMap((f) => availableFactionQuests(f.id, rep, NONE, NONE)).map((q) => q.id));
      expect({ rep, same: fromBoard.size === fromNine.size }).toEqual({ rep, same: true });
      for (const id of fromNine) expect(fromBoard.has(id)).toBe(true);
    }
  });

  it('⚠⚠ standing is asked PER FACTION, not once for the player', () => {
    // A board that used one standing for all nine would offer work he has not
    // earned from eight of them. The injected reader is what prevents it.
    const asked: string[] = [];
    neutralBoardPostings(FACTIONS, (fid) => { asked.push(fid); return 0; }, NONE, NONE);
    expect(new Set(asked).size).toBe(FACTIONS.length);
  });

  it('⚠⚠ higher standing with ONE faction opens rows under that heading only', () => {
    const target = FACTIONS[0]!.id;
    const low = neutralBoardPostings(FACTIONS, rep0, NONE, NONE);
    const high = neutralBoardPostings(FACTIONS, (f) => (f === target ? 100 : 0), NONE, NONE);
    const count = (gs: typeof low, fid: string) =>
      gs.find((g) => g.factionId === fid)?.postings.length ?? 0;
    expect(count(high, target)).toBeGreaterThanOrEqual(count(low, target));
    for (const f of FACTIONS.slice(1)) {
      expect({ f: f.id, same: count(high, f.id) === count(low, f.id) }).toEqual({ f: f.id, same: true });
    }
  });

  it('⚠⚠ an EMPTY faction is dropped, not shown as a bare heading', () => {
    // Five empty headings bury the two with work — the same reasoning that keeps
    // `huntBoardWithReasons` from listing somebody else's business.
    const all = FACTION_QUESTS.map((q) => q.id);
    expect(neutralBoardPostings(FACTIONS, rep0, NONE, all)).toEqual([]);
  });

  it('⚠⚠ accepted and finished work drops off, per faction', () => {
    const first = neutralBoardPostings(FACTIONS, rep0, NONE, NONE)[0]!;
    const taken = first.postings[0]!;
    const after = neutralBoardPostings(FACTIONS, rep0, [taken.id], NONE);
    const stillThere = after.find((g) => g.factionId === first.factionId)?.postings ?? [];
    expect(stillThere.map((q) => q.id)).not.toContain(taken.id);
  });
});

describe('OTA-1475 — the contract supplies the faction the board does not have', () => {
  it('⚠⚠⚠ EVERY POSTING ON THE MARKET RESOLVES TO ITS OWN FACTION BY TITLE', () => {
    // This is the whole accept mechanism: the board has no faction, so the paper
    // the player names decides who they answer to. If any title failed to
    // resolve, that row would be untakeable from the Market.
    const unresolvable: string[] = [];
    for (const g of neutralBoardPostings(FACTIONS, rep0, NONE, NONE)) {
      for (const q of g.postings) {
        if (factionOfFactionQuest(q.title) !== q.factionId) unresolvable.push(q.title);
      }
    }
    expect(unresolvable).toEqual([]);
  });

  it('⚠⚠⚠ AND BY ID TOO — the typed path and the tapped path agree', () => {
    for (const q of FACTION_QUESTS.slice(0, 25)) {
      expect({ id: q.id, f: factionOfFactionQuest(q.id) }).toEqual({ id: q.id, f: q.factionId });
    }
  });

  it('⚠⚠ nonsense resolves to null rather than to somebody\'s faction', () => {
    for (const junk of ['', '   ', 'zzzzzzzz', 'the moon']) {
      expect({ junk, f: factionOfFactionQuest(junk) }).toEqual({ junk, f: null });
    }
  });

  it('⚠⚠⚠ THE ACCEPT PATH USES IT, AND ONLY WHEN THE BOARD IS NEUTRAL', () => {
    // A faction outpost's board must keep supplying its OWN faction — otherwise
    // a Reclaimers board would happily hand out Dynasty work.
    expect(QUEST).toContain('const boardIsNeutral = !!scene?.missionBoard && scene.missionBoard.faction === null;');
    const i = QUEST.indexOf('const acceptFaction =');
    const decl = QUEST.slice(i, QUEST.indexOf(';', i));
    expect(decl).toContain('scene?.vendor?.faction');
    expect(decl).toContain('scene?.missionBoard?.faction');
    expect(decl).toContain('boardIsNeutral ? factionOfFactionQuest(titleOrId) : null');
    // ⚠ ORDER MATTERS: a vendor standing at the board still outranks it, and a
    // NAMED board faction outranks the contract. The neutral fallback is last.
    expect(decl.indexOf('vendor?.faction')).toBeLessThan(decl.indexOf('missionBoard?.faction'));
    expect(decl.indexOf('missionBoard?.faction')).toBeLessThan(decl.indexOf('factionOfFactionQuest'));
  });

  it('⚠⚠⚠ AND SO DOES THE TURN-IN — work taken here comes back here', () => {
    expect(QUEST).toContain('const turnBoardNeutral = !!scene?.missionBoard && scene.missionBoard.faction === null;');
    const i = QUEST.indexOf('let turnFaction =');
    const decl = QUEST.slice(i, QUEST.indexOf(';', i));
    expect(decl).toContain('turnBoardNeutral ? factionOfFactionQuest(titleOrId) : null');
  });

  it('⚠⚠ the source is NAMED differently, so he knows which board he is at', () => {
    expect(QUEST).toContain("'the Market post'");
    expect(QUEST).toContain("'the mission board'");
  });
});

describe('OTA-1475 — it stands in the square, and only the square', () => {
  it('⚠⚠⚠ THE MARKET SQUARE CARRIES IT', () => {
    expect(STORE).toContain("missionBoard: (buildingId === 'market' && roomId === 'market_square')");
    expect(STORE).toContain('? { faction: null }');
  });

  it('⚠⚠⚠ AND THAT ROOM REALLY EXISTS, with no anchor vendor of its own', () => {
    // The square is the room the truce lives in — where you land on entry and
    // pick a direction. A board inside the armour stall would be Korash's board,
    // which is the opposite of the ask. Asserted against the building template
    // rather than trusted from a reading of it.
    const market = BUILDINGS['market']!;
    const square = market.rooms.find((r) => r.id === 'market_square');
    expect(square).toBeTruthy();
    expect(square!.stallCategory).toBeUndefined();
    expect(square!.anchorNpc ?? null).toBeNull();
    // and the four stalls DO have anchors/categories — so "square only" is a
    // real distinction, not a distinction with one member
    expect(market.rooms.filter((r) => r.stallCategory).length).toBe(4);
  });

  it('⚠⚠⚠ THE OUTPOST BOARD IS UNTOUCHED — still one faction, still its own', () => {
    // OTA-451's board is the on-ramp for a brand-new character at their own
    // outpost. Nothing here may have quietly turned it neutral.
    expect(STORE).toContain("hubRoom?.id === 'outpost_central' && player?.factionId");
    expect(STORE).toContain('? { faction: player.factionId }');
  });

  it('⚠⚠ no OTHER building room gets a board', () => {
    const i = STORE.indexOf("missionBoard: (buildingId === 'market'");
    const decl = STORE.slice(i, STORE.indexOf(': null,', i));
    expect(decl).toContain("roomId === 'market_square'");
    // one condition, one room — not a list that could grow by accident
    expect((decl.match(/roomId ===/g) ?? []).length).toBe(1);
  });
});

describe('OTA-1475 — every reader learned the neutral shape', () => {
  it('⚠⚠⚠ THE FEED READER — readMissionBoard groups by faction', () => {
    expect(BOARD).toContain('if (board.faction === null)');
    expect(BOARD).toContain('neutralBoardPostings(');
    expect(BOARD).toContain('The Market Post');
    expect(BOARD).toMatch(/— \$\{g\.factionName\} —/);
  });

  it('⚠⚠⚠ THE MODAL — grouped rows, and the faction named on every reward line', () => {
    expect(MODAL).toContain('const neutral = !!board && board.faction === null;');
    expect(MODAL).toContain('neutralBoardPostings(');
    expect(MODAL).toContain('{neutral && <Text style={styles.groupHead}>');
    // so he can see whose colour he is about to fly BEFORE he taps
    expect(MODAL).toMatch(/neutral \? ` · \$\{g\.factionName\}` : ''/);
    expect(MODAL).toContain('accessibilityLabel={`Accept ${q.title}');
  });

  it('⚠⚠⚠ THE CHIP — it appears when ANY faction has work, not just one', () => {
    // `missionBoardHasPostings` gates whether the chip renders at all. Left
    // asking a single faction, the Market chip would never appear for a rep-0
    // player with no standing in whichever faction happened to be asked.
    const i = EXPL.indexOf('const missionBoardHasPostings');
    const body = EXPL.slice(i, EXPL.indexOf('}, [currentScene?.missionBoard', i));
    expect(body).toContain('board.faction === null');
    expect(body).toContain('neutralBoardPostings(');
  });

  it('⚠⚠ and it calls itself something different, because it IS different', () => {
    expect(EXPL).toContain('⚑ THE MARKET POST');
    expect(EXPL).toContain('⚑ MISSION BOARD');
    expect(EXPL).toContain('every faction posts here');
  });

  it('⚠⚠⚠ NO READER WAS LEFT ON THE OLD ASSUMPTION', () => {
    // ⚠ The many-doors check, done by TYPE rather than by memory: every place
    // that touches `missionBoard.faction` has to have a null branch, and the
    // compiler found them (three files failed `typecheck:ci` the moment the type
    // widened). This asserts the set did not quietly shrink again.
    for (const [name, src] of [['boardSlice', BOARD], ['modal', MODAL], ['exploration', EXPL]] as const) {
      expect({ name, handled: /faction === null/.test(src) }).toEqual({ name, handled: true });
    }
    expect(QUEST).toContain('scene.missionBoard.faction === null');
  });
});

describe('OTA-1475 — an empty Market post still says why', () => {
  it('⚠⚠ OTA-1474\'s rule reaches this door too', () => {
    // Nine pools coming back empty is a different fact from one faction having
    // nothing, and the line says so rather than reusing the single-faction copy.
    expect(BOARD).toContain('The Market post is bare');
    expect(BOARD).toContain('every colour has cleared its work off it');
  });

  it('⚠⚠ the single-faction empty line is still there for the outpost board', () => {
    expect(BOARD).toContain('mission board is clear');
  });
});
