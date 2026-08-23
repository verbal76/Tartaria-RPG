/**
 * OTA-1402 — A REFUSED HAND-IN SAYS WHY, WHERE THE PLAYER IS LOOKING.
 *
 * Owner, from the 2026-08-20 device log:
 *
 *     "I tried to remote hand in about 10 missions all did nothing."
 *
 * ⚠⚠ THE GAME ANSWERED HIM EVERY SINGLE TIME. Twenty lines of it. The log has
 * them, ~2s apart, from 20:18:47 to 20:19:23. Nothing was broken.
 *
 * ⚠⚠ THE ANSWER WAS RENDERED ABOVE THE SCROLLING LIST. OTA-1014 added a refusal
 * strip and placed it "where the player is looking" — which was true for a short
 * list and stopped being true the moment one scrolled. The strip sits above the
 * `<ScrollView>`; a player scrolled down to the seventh contract taps COMPLETE
 * and the explanation appears on a part of the screen that is no longer on the
 * screen. Ten taps, ten explanations, none visible.
 *
 * ⚠⚠ AND HE DREW THE WRONG CONCLUSION FROM THE SILENCE, which is the real cost.
 * He read the refusals as faction STANDING. They never were: standing (Known /
 * Trusted / Honored / hostile) does not enter into it. It is a COUNTERPARTY
 * rule — a hall settles its own faction's work, and all ten of those contracts
 * belonged to other factions. His Architects contract in the same burst
 * completed normally (+55 TC, +5 rep, 20:18:45), which is the proof the mechanic
 * was working. A message nobody sees does not merely fail to inform; it lets a
 * wrong theory form and stand, and the wrong theory here sends a player off to
 * grind standing that was never the obstacle.
 *
 * ⚠ SO THE MESSAGE ALSO CHANGED, not just its address. It now names the RULE,
 * says plainly that standing is not the problem, and uses the faction's real
 * name — every previous site printed `factionId.replace(/_/g, ' ')`, which is
 * why the log reads "eternal dynasty" and "servants of giants": ids in a
 * costume, from a game that has proper names for all nine.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  WRONG_COUNTERPARTY_TITLE,
  factionDisplayName,
  wrongCounterpartyBody,
  wrongCounterpartyLine,
} from '../app/engine/contractRefusal';
import { FACTIONS } from '../app/engine/factions';
import { blockAt } from '../test-utils/srcBlock';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const quest = src('app', 'state', 'slices', 'questSlice.ts');
const screen = src('app', 'screens', 'ContractsScreen.tsx');
const refusal = src('app', 'engine', 'contractRefusal.ts');
const store = src('app', 'state', 'gameStore.ts');

describe('OTA-1402 — the refusal explains the rule, not just the verdict', () => {
  it('⚠⚠ it says standing is NOT the reason, because that is the wrong conclusion', () => {
    // The owner drew exactly this conclusion from the same refusal. A message
    // that only says "won't take it" invites it.
    const body = wrongCounterpartyBody({
      sourceLabel: 'the Conspiracy Architects hall',
      contractFactionId: 'eternal_dynasty',
      title: 'Dead Drops',
    });
    expect(body).toMatch(/not about your standing/i);
    expect(body).toMatch(/whose contract it is/i);
    // ⚠ It describes the counterparty by WHO ANSWERS FOR WHERE YOU ARE, rather
    // than assuming a building. See the title test below.
    expect(body).toContain('the Conspiracy Architects hall');
    expect(body).toMatch(/where you are standing/i);
  });

  it('⚠⚠ it uses the faction NAME, never the raw id', () => {
    // Every previous site printed `factionId.replace(/_/g, ' ')`, which is why
    // the device log reads "eternal dynasty" and "servants of giants".
    const withUnderscores = FACTIONS.filter((f) => f.id.includes('_'));
    expect(withUnderscores.length).toBeGreaterThan(0);
    for (const f of withUnderscores) {
      expect(factionDisplayName(f.id)).toBe(f.name);
      expect(factionDisplayName(f.id)).not.toBe(f.id.replace(/_/g, ' '));
    }
  });

  it('⚠ it names where the contract CAN go, both ways', () => {
    const body = wrongCounterpartyBody({ sourceLabel: 'a runner', contractFactionId: FACTIONS[0]!.id });
    expect(body).toContain(FACTIONS[0]!.name);
    expect(body).toMatch(/trading post/i);
  });

  it('⚠ the FEED line stays short — the explanation belongs in the popup', () => {
    // A five-line refusal repeated per tap is the Chatty-Kathy failure again.
    const line = wrongCounterpartyLine({ sourceLabel: 'a runner', contractFactionId: 'mud_monarchs' });
    expect(line.length).toBeLessThan(180);
    expect(line).not.toContain('\n');
  });

  it('⚠ an unknown faction degrades to something that reads as a defect', () => {
    // Silently printing a plausible-looking name for an id the roster does not
    // know would hide a real problem behind a sentence that looks deliberate.
    expect(factionDisplayName(null)).toBe('another faction');
    expect(factionDisplayName('not_a_faction')).toBe('not a faction');
  });
});

describe('OTA-1402 — one refusal, four sites', () => {
  it('⚠⚠ every wrong-counterparty path goes through the one helper', () => {
    // Four sites had four phrasings and had already drifted: two said "Wrong
    // agent", one "wrong faction", one "waves you off". A rule explained in four
    // places is four chances to explain it differently.
    expect((quest.match(/refuseWrongCounterparty\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    // ⚠ Comments stripped first. This file's own header quotes the four phrasings
    // it replaced, so a raw match flags the explanation as the violation — the
    // non-unique-anchor trap this repo keeps paying for.
    const code = quest.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const gone of [
      "won't take it — wrong faction",
      'Wrong agent.',
      'waves you off',
    ]) {
      expect(code).not.toContain(gone);
    }
  });

  it('⚠⚠ NOTHING in the contract paths prints a raw faction id any more', () => {
    // ⚠⚠ THE TEST FOUND MORE THAN IT WAS AIMED AT, so the fix widened to match.
    // It was written to check the four refusal sites; it turned up ELEVEN
    // `factionId.replace(/_/g, ' ')` prints across accepts, broker lines and —
    // most visibly — the reward lines. The owner's own log carries one:
    // `+5 rep with conspiracy architects`. Same defect, same fix, and no reason
    // to leave seven of them standing because the report only named four.
    expect(quest).not.toMatch(/\.replace\(\/_\/g, ' '\)/);
    expect((quest.match(/factionDisplayName\(/g) ?? []).length).toBeGreaterThanOrEqual(11);
  });

  it('⚠ the helper writes the feed line AND raises the notice, every time', () => {
    const i = quest.indexOf('function refuseWrongCounterparty');
    const body = quest.slice(i, quest.indexOf('\n  }', i));
    expect(body).toContain("get().appendLog('arbiter', line);");
    expect(body).toContain('contractsNotice: {');
    expect(body).toContain('body: wrongCounterpartyBody(input)');
  });

  it('⚠⚠ the FEED is rate-limited and the POPUP is not, which is the right way round', () => {
    // The feed does not need to say it ten times. The popup must reflect the tap
    // that just happened — a suppressed popup is how "the button does nothing"
    // comes back, and `appendLog`'s dedup could not help here anyway: the
    // faction name varies per contract, so twenty near-identical lines walked
    // straight through it.
    const i = quest.indexOf('function refuseWrongCounterparty');
    const body = quest.slice(i, quest.indexOf('\n  }', i));
    const gate = body.indexOf('REFUSAL_FEED_QUIET_MS');
    const setNotice = body.indexOf('set({');
    expect(gate).toBeGreaterThan(-1);
    expect(setNotice).toBeGreaterThan(gate);      // the set() is OUTSIDE the gate
    expect(body.slice(setNotice)).not.toContain('REFUSAL_FEED_QUIET_MS');
    expect(quest).toContain('const REFUSAL_FEED_QUIET_MS = 20_000;');
  });
});

describe('OTA-1402 — the card cannot be scrolled away from', () => {
  it('⚠⚠ a notice with a BODY renders as an overlay, not as the top strip', () => {
    // The whole defect in one assertion: the strip is above the ScrollView.
    expect(screen).toContain('{contractsNotice && !contractsNotice.body ? (');
    expect(screen).toContain('{contractsNotice?.body ? (');
    expect(screen).toContain('styles.refusalOverlay');
    expect(screen).toMatch(/refusalOverlay: \{\s*\n\s*position: 'absolute'/);
  });

  it('⚠⚠ …and it is NOT a native <Modal>, for a reason already paid for once', () => {
    // arb73: this screen is itself presented inside a Modal, and iPad/iOS can
    // present a NESTED native Modal invisibly — rendering nothing while its
    // backdrop still eats touches. That turns "the button does nothing" into
    // "the screen does nothing", which is worse than the bug being fixed.
    const i = screen.indexOf('{contractsNotice?.body ? (');
    const block = blockAt(screen, '{contractsNotice?.body ? (');
    expect(block).not.toContain('<Modal');
    expect(screen).toContain('present a nested native Modal INVISIBLY');
  });

  it('⚠ it can be dismissed two ways, and both go through the same clear', () => {
    const i = screen.indexOf('{contractsNotice?.body ? (');
    // ⚠⚠ WINDOWED BY THE BLOCK'S OWN END, NOT BY A BYTE COUNT. The first spelling
    // sliced a fixed 1,600 characters and OTA-1403 pushed the dismiss button past
    // it by adding the runner offer — the same fixed-window rot that has needed
    // hand-widening four separate times in this repo (ota1172 carries three such
    // notes). A slice that falls short reads as "the code is missing" rather than
    // "my window is too small", which is the worst way for a test to be wrong.
    // The card is the last thing this component renders, so "to the end of the
    // render" IS the block — and unlike a byte count or a `) : null}` search
    // (which now matches the nested runner offer first) it cannot go stale.
    const block = screen.slice(i, screen.indexOf('\n  );\n}', i));
    // ⚠ OTA-1403 — the dismiss button's onPress became an arrow when it gained a
    // conditional label ("NOT NOW" when a runner offer is present, "GOT IT"
    // otherwise), so counting the bare handler string is no longer the way to
    // ask this. What matters is that BOTH exits clear the notice and neither
    // leaves it standing.
    expect(block).toContain('onPress={clearContractsNotice}');          // backdrop
    expect(block).toContain("accessibilityLabel={contractsNotice.action ? 'Not now' : 'Got it'}");
    expect(block).toContain("'NOT NOW' : 'GOT IT'");
  });

  it('⚠ the old strip still works for callers that raise a bare line', () => {
    // Not every notice is a refusal with a rule to explain; a bare `text` notice
    // keeps the cheaper treatment rather than being forced into a card.
    // ⚠ OTA-1403 widened the type with an optional `action`. Matched on the two
    // fields this claim is about rather than the whole line, so the next
    // addition does not fail a test that is not about it.
    expect(store).toMatch(/contractsNotice: \{[\s\S]{0,600}?body\?: string;/);
    expect(screen).toContain('styles.contractsNotice,');
  });
});

describe('OTA-1402 — the UI wrapper does not downgrade the rich refusal', () => {
  it('⚠⚠ a notice raised inside the call is not clobbered by the log scrape', () => {
    // `completeContractFromUI` scrapes the last arbiter line into the notice —
    // built when every refusal was a bare feed line. Left alone it would
    // overwrite the card with the one-liner, silently putting the strip back.
    const i = quest.indexOf('completeContractFromUI(kind, id) {');
    const body = quest.slice(i, quest.indexOf('completeContractFromUIInner(kind, id) {', i));
    expect(body).toContain('const contractsNoticeBefore = get().contractsNotice;');
    expect(body).toContain('const raisedRich =');
    expect(body).toContain('if (raisedRich) return;');
    // and the guard runs BEFORE the scrape
    expect(body.indexOf('if (raisedRich) return;')).toBeLessThan(body.indexOf('let refusal'));
  });

  it('⚠ a COMPLETION still clears any refusal left over from a previous tap', () => {
    const i = quest.indexOf('completeContractFromUI(kind, id) {');
    const body = quest.slice(i, quest.indexOf('completeContractFromUIInner(kind, id) {', i));
    expect(body).toContain('if (get().contractsNotice) set({ contractsNotice: null });');
  });
});

describe('OTA-1402 — the title says the rule', () => {
  it('⚠ it names the mismatch, not the rejection', () => {
    // "REFUSED" tells the player what they already know from the button not
    // working. "WRONG HALL" tells them what to do differently.
    expect(WRONG_COUNTERPARTY_TITLE).toMatch(/WRONG FACTION/);
    expect(WRONG_COUNTERPARTY_TITLE).not.toMatch(/denied|refused|error|failed/i);
    // ⚠ And it must NOT say "hall". The owner hit this standing on the open tile
    // OUTSIDE an outpost and was told a hall had refused him — a building he was
    // not in. Naming a place the player is not in makes a true message read as a
    // broken one.
    expect(WRONG_COUNTERPARTY_TITLE).not.toMatch(/hall/i);
  });

  it('⚠ and the file records the report it came from', () => {
    expect(refusal).toContain('all did nothing');
    expect(refusal).toContain('It is a COUNTERPARTY rule');
  });
});
