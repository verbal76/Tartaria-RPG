/**
 * OTA-1532/1533/1534/1535 — THE JOURNEYS OF CHEDDAR BOB.
 *
 * Four defects from one new-character log, three of them typed into the game as
 * the owner hit them.
 *
 * ⚠⚠⚠ (1532) THE LEAD FROM NIX NEVER PAID. *"somo was supposed to see a lead from
 * nix when I traveled where is it?"* He persuaded Nix at 22:30:16, walked west
 * onto fresh ground at 22:31:08, and got nothing. The payout lived inside
 * `beginScene`, and OTA-1301 states the reason in writing: *"A cardinal step
 * inside a location does not rebuild the scene."* His log proves it — every other
 * move carries a `[debug] scene:` line and the westward step carries none. The one
 * journey the lead's own copy describes was the one journey that could not pay it.
 *
 * The owner's redesign is better than a re-wire: *"the payout should be from a
 * tile move, like we need to make some distance to keep them safe."* A lead now
 * costs DISTANCE, counted where distance happens.
 *
 * ⚠⚠⚠ (1533) THE MUD WAS A FOUNTAIN. *"how many times can I investigate this
 * mud"* — the honest answer was forever. The picked-clean guard exempts
 * `consumable`/`misc`, and every dig result is one of those two kinds, so the
 * guard never applied to anything. Twelve scrapes in ninety seconds on one patch,
 * ending on a MUDSTONE (Rare). The exemption is kept — a second Small Rock out of
 * a mud-flat is right — but it gains a floor: Common only, and a per-patch cap.
 *
 * ⚠⚠ (1534) A GUESS COST STANDING. Irma took −2 for a Salvage Cap. *"I don't
 * think that should give negative standing since you need to guess at first what
 * they are in to and like."* The refusal comment already carried the answer: the
 * REFUSAL is the anti-junk-dump mechanism, because the item is not taken. The
 * standing hit was a second punishment on a player with no way to know. A repeat
 * offer still costs — being told no and doing it again is not a guess.
 *
 * ⚠ (1535) THE TEXT BAR IS INSTRUMENTED, NOT GUESSED AT. *"every time I am in the
 * tutorial at the take rope part, and only rarely in game."* OTA-1075 is the same
 * beat reported before, and its fix addressed focus not landing; this is the bar
 * being COVERED, a different symptom. Under the keyboard, under the feed, or never
 * mounted are three bugs with three fixes and the source distinguishes none of
 * them. So this ships the three numbers that do.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const STORE = src('app', 'state', 'gameStore.ts');
const TYPES = src('app', 'engine', 'types.ts');
const GIFT = src('app', 'engine', 'gifting.ts');
const KBBAR = src('app', 'components', 'KeyboardInputBar.tsx');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('OTA-1532 — a lead is paid in distance', () => {
  it('⚠⚠⚠ the payout is GONE from beginScene, where it could never fire', () => {
    // ⚠ Pinned on the OLD GATE, not on a slice. The first draft carved a window
    // out of beginScene by index and fell through to the whole file when the
    // anchor missed — then failed on the NEW payout it was supposed to allow.
    // The condition below is the one that could never be true on a tile step.
    const code = codeOnly(STORE);
    expect(code).not.toContain('if (lead && !opts?.isOpening && !hasEnemies && !hubRoom && !isNeutralMarket) {');
    // …and the note explaining where it went is where the next reader will look.
    expect(STORE).toContain('THE LEAD PAYOUT MOVED TO THE TILE STEP');
  });

  it('⚠⚠⚠ …and it runs where tile steps are counted', () => {
    // Same block that increments wastelandStepsSinceEncounter — the one place the
    // engine agrees a tile was actually crossed.
    const code = codeOnly(STORE);
    const step = code.indexOf('const wasteSteps = (get().wastelandStepsSinceEncounter ?? 0) + 1;');
    const pay = code.indexOf('const left = (typeof lead.stepsLeft === \'number\' ? lead.stepsLeft : 1) - 1;');
    expect(step).toBeGreaterThan(-1);
    expect(pay).toBeGreaterThan(step);
    expect(pay - step).toBeLessThan(1200);
  });

  it('⚠⚠ the lead is stamped with its distance when granted', () => {
    expect(codeOnly(STORE)).toContain('pendingLead: { ...lead, stepsLeft: LEAD_STEPS_TO_CACHE }');
    expect(STORE).toContain('export const LEAD_STEPS_TO_CACHE = 3;');
  });

  it('⚠⚠ a lead granted before 1532 pays on the first step rather than stranding', () => {
    // The absence of a field must not eat a reward already earned.
    expect(codeOnly(STORE)).toContain("typeof lead.stepsLeft === 'number' ? lead.stepsLeft : 1");
  });

  it('⚠ the type carries the distance', () => {
    expect(TYPES).toContain('rewardItem?: string; stepsLeft?: number } | null;');
  });
});

describe('OTA-1533 — the mud patch has a floor', () => {
  it('⚠⚠⚠ the commodity exemption now requires Common rarity AND an unspent patch', () => {
    const code = codeOnly(STORE);
    expect(code).toContain("const isCommodityRarity = found.rarity === 'Common';");
    expect(code).toContain('&& isCommodityRarity');
    expect(code).toContain('< MUD_DIG_YIELDS_PER_PATCH');
  });

  it('⚠⚠⚠ …so a Rare falls back under the picked-clean guard', () => {
    // The twelfth scrape handed him a Mudstone (Rare). Rarity is half the floor.
    const code = codeOnly(STORE);
    // ⚠ SEARCHED FORWARD FROM THE RARITY LINE. There are two
    // `!isStackableCommodity && roomLootAlreadyGrabbed` sites — the search path
    // and the dig path — and a bare indexOf finds the search one, which sits
    // thousands of lines earlier. The dig path is the one this OTA changed.
    const rarity = code.indexOf("const isCommodityRarity = found.rarity === 'Common';");
    expect(rarity).toBeGreaterThan(-1);
    const guard = code.indexOf('if (!isStackableCommodity && roomLootAlreadyGrabbed(', rarity);
    expect(guard).toBeGreaterThan(rarity);
  });

  it('⚠⚠ every yield spends one of the patch\'s allowance', () => {
    // A cap nobody increments is not a cap.
    expect(codeOnly(STORE)).toContain('digYields: (prev.digYields ?? 0) + 1');
    expect(STORE).toContain('export const MUD_DIG_YIELDS_PER_PATCH = 6;');
  });

  it('⚠⚠ the exemption is kept, not deleted — a mud-flat is still worth scraping', () => {
    // Removing it outright would make the world feel sealed; the bug was the
    // missing floor, not the idea.
    expect(codeOnly(STORE)).toContain("dugCat.kind === 'consumable' || dugCat.kind === 'misc'");
  });

  it('⚠ rooms dug before 1533 read as zero rather than being sealed retroactively', () => {
    expect(codeOnly(STORE)).toContain('?.digYields ?? 0;');
    expect(TYPES).toContain('digYields?: number;');
  });
});

describe('OTA-1534 — a first guess is free', () => {
  it('⚠⚠⚠ an insulting gift offered for the FIRST time costs no standing', () => {
    expect(codeOnly(GIFT)).toContain('standingDelta: offeredBefore ? -STANDING_INSULT : 0,');
  });

  it('⚠⚠⚠ …and a repeat still costs, because that is not a guess', () => {
    expect(codeOnly(GIFT)).toContain('const offeredBefore = timesGiven(rel, item.name) > 0;');
  });

  it('⚠⚠ the refusal is untouched — it is what stops junk-dumping', () => {
    // The item is not taken, so nothing is gained by trying. That was always the
    // real deterrent; the standing hit was stacked on top of it.
    expect(codeOnly(GIFT)).toContain('refused: true');
  });

  it('⚠ a disliked-but-accepted gift still buys nothing and still costs nothing', () => {
    expect(codeOnly(GIFT)).toContain("reaction !== 'polite' && reaction !== 'disliked'");
  });
});

describe('OTA-1535 — the text bar is measured, not guessed', () => {
  it('⚠⚠⚠ the bar records which fallback rung supplied its position', () => {
    // Under the keyboard, under the feed, or never mounted are three different
    // bugs. This is the field that tells them apart.
    const code = codeOnly(KBBAR);
    expect(code).toContain("const rung = keyboardOffset > 0 ? 'live' : lastKeyboardHeight > 0 ? 'cached' : 'estimate';");
    expect(code).toContain('kbbar: mounted bottom=');
  });

  it('⚠⚠ …together with the window height and the live tutorial beat', () => {
    // The owner's report is beat-specific ("every time at take rope"), so the
    // beat has to be in the record or the log cannot confirm it.
    const code = codeOnly(KBBAR);
    expect(code).toContain('winH=');
    expect(code).toContain('beat=');
  });

  it('⚠⚠ it writes once per distinct state, not once per render', () => {
    // A per-render line would flood the very log it is meant to make readable.
    expect(codeOnly(KBBAR)).toContain('if (bottomLoggedFor !== ');
  });

  it('⚠ an instrument may never break the thing it measures', () => {
    const code = codeOnly(KBBAR);
    const i = code.indexOf('kbbar: mounted bottom=');
    expect(code.slice(i, i + 400)).toContain('catch');
  });

  it('⚠ and it changes no behaviour — the offset chain is untouched', () => {
    expect(codeOnly(KBBAR)).toContain('Math.round(Dimensions.get(\'window\').height * 0.36)');
  });
});
