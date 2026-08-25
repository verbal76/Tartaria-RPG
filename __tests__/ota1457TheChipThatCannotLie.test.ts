/**
 * OTA-1457 — THE FEED'S TRAILING ACTION CHIP.
 *
 * One tappable chip at the bottom of the narrative feed: take an upgrade and
 * wear it, without leaving the place you are already reading. Asked for by an
 * outside review; specified in docs/feed-action-chips-spec.md.
 *
 * ⚠⚠⚠ THE CLAIMS PINNED HERE ARE THE ONES THAT MAKE IT SAFE, NOT THE ONES THAT
 * MAKE IT EXIST. "A chip renders" is worth nothing. There are exactly three ways
 * this feature could hurt a player, and each has a section below:
 *
 *   1. IT OFFERS SOMETHING THE GAME THEN REFUSES. The player taps, gets a
 *      refusal, and learns the chips are decoration. Prevented structurally: the
 *      chip is chosen from `gatherChips` — the picker's own array, consumed rows
 *      already flagged — so if the picker would refuse it, the feed cannot offer
 *      it. Same guarantee, same array, as OTA-1455's parser hint.
 *
 *   2. IT YANKS THE FEED. This feed auto-scrolls unconditionally, so anything
 *      that changes content height above the fold drags the view down mid-read.
 *      Prevented structurally: the chip renders OUTSIDE the entry map.
 *
 *   3. IT BECOMES THE ONLY ROUTE. The feed scrolls; a chip that scrolls away is
 *      gone. If it were the only way to wear the armour, the game offered
 *      something once and silently withdrew it — OTA-1402 in new clothes.
 *      Prevented by construction, and pinned by proof-of-removal below.
 *
 * ⚠⚠ AND THE PINS ARE ON BEHAVIOUR, NOT WORDING. Five label-shaped pins broke in
 * two days (ota1194, ota1271, two in ota1454, ota1379) — each asserting a string
 * as a stand-in for a property nobody had written down. Nothing here matches
 * button copy: the copy is free to keep improving.
 */
// ⚠⚠ A SEAM, USED BY EXACTLY ONE TEST BELOW, AND HERE IS WHY IT HAD TO EXIST.
// `pickFeedActionChip` consults TWO lookups and offers a chip only when both
// answer. Proof-by-removal showed the first version of that test DID NOT BITE:
// deleting the second guard left it green, because every fixture built from the
// real catalog had both lookups agreeing. A test that cannot fail is worse than
// no test — it reports a guard as covered when nothing exercises it.
//
// They CAN disagree in the real code: the armour branch of `isUpgradeOverEquipped`
// compares `acBonus`, while `upgradeEquipSlot` compares `armorScore` — different
// axes, so a piece can win one and lose the other. Rather than hunt the catalog
// for a pair that happens to straddle that today (a fixture that silently stops
// straddling it the next time a stat is tuned), the disagreement is forced.
// Everything else in this file runs the real implementations.
const mockOverride: { slot?: unknown } = {};
jest.mock('../app/engine/gatherSort', () => {
  const actual = jest.requireActual('../app/engine/gatherSort');
  return {
    ...actual,
    upgradeEquipSlot: (...args: unknown[]) =>
      'slot' in mockOverride ? mockOverride.slot : actual.upgradeEquipSlot(...args),
  };
});

import {
  pickFeedActionChip,
  feedActionChipLabel,
  feedActionChipA11yLabel,
  type GatherChipRow,
} from '../app/engine/feedActionChip';
import type { PlayerCharacter } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const FEED = read('app', 'components', 'AdventureFeed.tsx');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');

// A player wearing nothing, so any catalog armour is an upgrade over bare skin.
function bare(): PlayerCharacter {
  return {
    name: 'Test', inventory: [], equipment: {}, stats: {},
  } as unknown as PlayerCharacter;
}
const rows = (...r: Array<[string, boolean]>): GatherChipRow[] =>
  r.map(([noun, consumed]) => ({ noun, consumed }));

describe('OTA-1457 — the chip cannot offer what the picker would refuse', () => {
  it('⚠⚠⚠ A CONSUMED ROW IS NEVER OFFERED — the flag the picker greys on', () => {
    // The single most important assertion in this file. A chip naming an
    // already-worked-over noun is a guaranteed refusal on the player's first tap.
    const live = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]));
    const spent = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", true]));
    expect(live).not.toBeNull();
    expect(spent).toBeNull();
  });

  it('⚠⚠⚠ …and it SKIPS PAST consumed rows rather than stopping at them', () => {
    // The subtle version of the same bug: a spent row early in the list must not
    // hide a live upgrade behind it, or the chip silently vanishes in exactly the
    // rooms where the player has been working.
    const chip = pickFeedActionChip(
      bare(),
      rows(["Mud-Warden's Vest", true], ["Mud-Warden's Vest", false]),
    );
    expect(chip).not.toBeNull();
  });

  it('⚠⚠ NOTHING is offered for a room with no upgrade — silence over a false promise', () => {
    expect(pickFeedActionChip(bare(), rows(['rubble', false], ['scrap', false]))).toBeNull();
  });

  it('⚠⚠ NOTHING is offered when there is no player, or no chips at all', () => {
    // Both reachable during boot and screen transitions. A throw here would take
    // the exploration screen down; a chip here would act on a null player.
    expect(pickFeedActionChip(null, rows(["Mud-Warden's Vest", false]))).toBeNull();
    expect(pickFeedActionChip(bare(), null)).toBeNull();
    expect(pickFeedActionChip(bare(), [])).toBeNull();
    expect(pickFeedActionChip(undefined, undefined)).toBeNull();
  });

  it('⚠⚠ a chip always has SOMEWHERE TO GO — the slot is asserted, not assumed', () => {
    const chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]));
    expect(chip).not.toBeNull();
    expect(typeof chip!.slot).toBe('string');
    expect(chip!.slot.length).toBeGreaterThan(0);
    expect(chip!.itemName.length).toBeGreaterThan(0);
  });

  it('⚠⚠⚠ WHEN THE TWO LOOKUPS DISAGREE, NO CHIP — and it does not throw', () => {
    // The ★-with-nowhere-to-put-it bug that OTA-1237 existed to fix, one layer
    // out. `isUpgradeOverEquipped` says yes; `upgradeEquipSlot` says there is no
    // slot. Offering anyway would either crash on `wear.slot` or promise a wear
    // the game cannot perform.
    //
    // ⚠ Both failure shapes are checked: the call must RETURN NULL, not throw.
    // A throw here takes the exploration screen down with it.
    mockOverride.slot = null;
    try {
      let chip: unknown;
      expect(() => { chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false])); }).not.toThrow();
      expect(chip).toBeNull();
    } finally {
      delete mockOverride.slot;
    }
    // …and the seam is properly torn down: the real lookup is back.
    expect(pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]))).not.toBeNull();
  });

  it('⚠ it is DETERMINISTIC — first match in picker order, so it cannot flicker', () => {
    // A chip that changed which item it named between renders would be unreadable
    // at the exact moment somebody is reaching for it.
    const r = rows(["Mud-Warden's Vest", false], ["Mud-Warden's Vest", false]);
    const a = pickFeedActionChip(bare(), r);
    const b = pickFeedActionChip(bare(), r);
    expect(a).toEqual(b);
    const src = read('app', 'engine', 'feedActionChip.ts');
    expect(src).not.toContain('Math.random');
    expect(src).not.toContain('.sort(');
  });

  it('⚠ it carries the NOUN, never an item id — one identifier, one resolver', () => {
    // A second identifier is a second thing that can drift out of sync with the
    // first. The take path resolves nouns; so does the chip.
    const chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]));
    expect(chip!.noun).toBe("Mud-Warden's Vest");
    // OTA-1498 added `reason` — the comparator's verdict for the button face.
    // Still no item id: one identifier, one resolver, unchanged.
    expect(Object.keys(chip!).sort()).toEqual(['itemName', 'noun', 'reason', 'slot']);
  });
});

describe('OTA-1457 — it says what it will do, out loud', () => {
  const chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]))!;

  it('⚠⚠ the screen-reader sentence names BOTH actions and the replacement', () => {
    // A narration-only player must not be surprised by the second half. The chip
    // takes AND wears AND displaces whatever was in that slot — three facts, and
    // the third is the one that could cost somebody a better piece.
    const a11y = feedActionChipA11yLabel(chip).toLowerCase();
    expect(a11y).toContain('take');
    expect(a11y).toContain('wear');
    expect(a11y).toContain('replaces');
    expect(a11y).toContain(chip.slot.toLowerCase());
  });

  it('⚠ the visible label names the ITEM, so two chips could never be confused', () => {
    expect(feedActionChipLabel(chip)).toContain(chip.itemName);
  });

  it('⚠ neither string is blank for any offered chip', () => {
    expect(feedActionChipLabel(chip).trim().length).toBeGreaterThan(0);
    expect(feedActionChipA11yLabel(chip).trim().length).toBeGreaterThan(0);
  });
});

describe('OTA-1457 — it cannot yank the feed', () => {
  it('⚠⚠⚠ THE CHIP RENDERS OUTSIDE THE ENTRY MAP — structurally trailing-only', () => {
    // The feed auto-scrolls unconditionally (`scrollToEnd` from BOTH the
    // entry-count effect and onContentSizeChange — yank-to-bottom since OTA 026).
    // A chip inside the map could attach to a historic entry, change content
    // height above the fold, and drag the view down under the player's thumb.
    //
    // Pinned positionally rather than by comment: the chip's JSX must appear
    // AFTER the map closes.
    const mapCloses = FEED.indexOf('      })}');
    const chipAt = FEED.indexOf('{actionChipLabel ? (');
    expect(mapCloses).toBeGreaterThan(-1);
    expect(chipAt).toBeGreaterThan(mapCloses);
  });

  it('⚠⚠ and the unconditional auto-scroll it depends on is still unconditional', () => {
    // If someone reintroduces a near-bottom gate, the reasoning above changes and
    // this whole section needs rethinking — so it fails loudly here first.
    //
    // ⚠ FIRST DRAFT OF THIS ASSERTION WAS `expect(FEED).not.toContain('isNearBottom')`
    // AND IT FAILED ON A COMMENT — the OTA 026 note above the scroller says
    // "Reverting the OTA 025 isNearBottom gate". That is the codebase's own
    // history describing the thing being forbidden, and forbidding the WORD would
    // mean deleting the explanation of WHY. Same shape as the bad 29/47 verb
    // count: matching text where a property was meant. So the claim is asserted
    // where it actually lives — the scroll function must be UNCONDITIONAL.
    expect(FEED).toContain('scrollToEnd({ animated: true })');
    expect(FEED).toContain('onContentSizeChange={handleAutoScroll}');
    const i = FEED.indexOf('const handleAutoScroll = () => {');
    expect(i).toBeGreaterThan(-1);
    const body = FEED.slice(i + 'const handleAutoScroll = () => {'.length, FEED.indexOf('};', i));
    // No branch, no early return, no threshold arithmetic — it always scrolls.
    expect(body).not.toMatch(/\bif\b/);
    expect(body).not.toMatch(/\breturn\b/);
    expect(body).not.toMatch(/contentOffset|layoutMeasurement|contentSize/);
  });

  it('⚠ the chip does not change size after render — no expanding confirm step', () => {
    // A chip that grows in place is the same height change by another route.
    const tail = FEED.slice(FEED.indexOf('{actionChipLabel ? ('));
    expect(tail).not.toContain('useState');
    expect(tail).not.toContain('setExpanded');
  });
});

describe('OTA-1457 — it is an accelerator, never the only route', () => {
  it('⚠⚠⚠ REMOVING THE CHIP LEAVES THE ACTION FULLY REACHABLE — proof by removal', () => {
    // The property that decides whether this was safe to build. The chip fires
    // `takeAndWear`, which the GATHER PICKER also calls. Delete every chip line
    // and the picker path is untouched, so nothing becomes unreachable.
    expect(EXPL).toContain('takeAndWear(noun)');          // the picker's onTake
    expect(EXPL).toContain('takeAndWear(feedChip.noun)'); // the chip
    // …and the picker's call is NOT inside the chip's wiring.
    const pickerCall = EXPL.indexOf('takeAndWear(noun)');
    const chipCall = EXPL.indexOf('takeAndWear(feedChip.noun)');
    expect(pickerCall).toBeGreaterThan(-1);
    expect(chipCall).toBeGreaterThan(-1);
    expect(pickerCall).not.toBe(chipCall);
  });

  it('⚠⚠⚠ BOTH CALLERS RUN THE SAME CODE — there is exactly ONE take-and-wear', () => {
    // A second hand-written copy is how the two would eventually disagree about
    // when the equip is safe. The equip-after-take sequence must appear once.
    expect((EXPL.match(/const wear = isUpgradeOverEquipped\(/g) ?? []).length).toBe(1);
    expect((EXPL.match(/const takeAndWear = useCallback\(/g) ?? []).length).toBe(1);
  });

  it('⚠⚠⚠ THE EQUIP STILL ONLY RUNS IF THE TAKE LANDED', () => {
    // `takeAmbientNoun` refuses by LOGGING, not throwing — a full pack, an
    // already-worked-over noun. Equipping regardless answers one refusal with a
    // second ("I don't see it on you") at a player who did nothing wrong. This
    // survived being lifted out of the picker; it must keep surviving.
    const i = EXPL.indexOf('const takeAndWear = useCallback(');
    const body = EXPL.slice(i, EXPL.indexOf('}, [player, takeAmbientNoun]);', i));
    expect(body).toContain('takeAmbientNoun(noun)');
    // the inventory is re-read from the store and checked before equipping
    expect(body).toContain('useGameStore.getState().player?.inventory');
    expect(body).toContain('i.quantity > 0');
    // and the equip is inside that guard, not before it
    expect(body.indexOf('quantity > 0')).toBeLessThan(body.indexOf('equipItem('));
  });

  it('⚠⚠⚠ IT IS SUPPRESSED FOR THE WHOLE TUTORIAL — it skips the beat advancement', () => {
    // ⚠⚠ CAUGHT BY ota1253 BEFORE THIS PIN EXISTED, WHICH IS THE POINT OF HAVING
    // BOTH. `takeAndWear` is the NON-TUTORIAL tail of the picker's `onTake` — the
    // tutorial branches sit above it and advance the beat. The chip calls the tail
    // directly, so during the armor beat it granted the vest, equipped it, and left
    // the tutorial stuck on `armor` waiting for a tap the player had been given a
    // faster way past.
    //
    // ⚠ Pinned as the WHOLE tutorial, not the narrower `tutLock`: a scripted beat
    // points at exactly one control, and a second faster route competes with the
    // thing being taught.
    const i = EXPL.indexOf('const feedChip = useMemo(');
    const memo = EXPL.slice(i, EXPL.indexOf('[player, gatherChips, tutBeat],', i));
    expect(memo).toContain('tutBeat !== null ? null :');
    // …and the dep is listed, or the gate goes stale the moment the beat changes —
    // the exact defect class that produced the frozen INVESTIGATE light.
    expect(EXPL.slice(i)).toContain('[player, gatherChips, tutBeat],');
  });

  it('⚠⚠ the chip reads gatherChips — the picker\'s array, not the raw scene list', () => {
    // `displayedAmbientNouns` would include nouns already worked over. This is
    // the same distinction OTA-1455 turns on.
    const i = EXPL.indexOf('const feedChip = useMemo(');
    expect(i).toBeGreaterThan(-1);
    const memo = EXPL.slice(i, EXPL.indexOf('[player, gatherChips, tutBeat],', i));
    expect(memo).toContain('pickFeedActionChip(player, gatherChips)');
    expect(memo).not.toContain('displayedAmbientNouns');
  });
});

describe('OTA-1457 — the prose stays clean', () => {
  it('⚠⚠⚠ NO CHIP PAYLOAD IS ENCODED IN entry.text ANYWHERE', () => {
    // The reason the review's `[equip_item:id]`-in-the-prose design was rejected:
    // GameLogEntry.text also feeds TTS routing (a token becomes a token spoken
    // aloud) and the copy-all bug-report export (tokens corrupt the instrument
    // used to diagnose everything else). Neither fails loudly.
    expect(FEED).not.toContain('[equip_item:');
    expect(EXPL).not.toContain('[equip_item:');
    for (const marker of ['[equip_item', '[take_item', '[action:']) {
      expect(FEED).not.toContain(marker);
      expect(EXPL).not.toContain(marker);
    }
  });

  it('⚠⚠ the feed does not parse text looking for action markup', () => {
    // Even a tolerant "strip anything in brackets" pass would silently eat
    // legitimate prose. There is no such pass, and there must not be one.
    expect(FEED).not.toMatch(/replace\(\s*\/\\\[/);
  });

  it('⚠ the feed stays ignorant of equipment — one place decides what is takeable', () => {
    // AdventureFeed receives a LABEL and a HANDLER, not a chip object. A feed
    // that understood equipment would be a second place that could decide
    // something is takeable, and two deciders is how they disagree.
    expect(FEED).not.toContain('isUpgradeOverEquipped');
    expect(FEED).not.toContain('equipItem');
    expect(FEED).toContain('actionChipLabel');
  });
});

describe('OTA-1457 — it does not undo OTA-1454', () => {
  it('⚠⚠ THE CHIP IS OUTLINED, NOT FILLED — it is a side action, not a strike', () => {
    // OTA-1454 established that a SOLID fill means "turn-ending strike" and an
    // outline means "side action". The review that asked for this chip proposed
    // defaulting it to the `ready` green — the exact fill just retired from the
    // attack buttons — which would re-import the ambiguity one layer down.
    const i = FEED.indexOf('  chip: {');
    expect(i).toBeGreaterThan(-1);
    const style = FEED.slice(i, FEED.indexOf('},', i));
    expect(style).toContain('borderWidth: 1');
    // ⚠ The fill must be a dark ground, NOT the accent — that is what makes it
    // an outline rather than a filled button.
    expect(style).toContain('backgroundColor:');
    expect(style).not.toMatch(/backgroundColor:\s*'#9ec96a'/);
  });

  it('⚠ and the fill is OPAQUE — arb86, the background is player-tunable', () => {
    // A low-alpha fill lets a bright user-picked hue flood straight through.
    const i = FEED.indexOf('  chip: {');
    const style = FEED.slice(i, FEED.indexOf('},', i));
    expect(style).not.toMatch(/rgba\(/);
    expect(style).not.toContain('opacity');
  });
});
