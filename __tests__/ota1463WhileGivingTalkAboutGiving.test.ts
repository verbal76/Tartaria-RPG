/**
 * OTA-1463 — WHILE GIVING, THE SHEET TALKS ABOUT GIVING.
 *
 * ⚠⚠⚠ THE OWNER, TYPED INTO THE GAME MID-SESSION (2026-08-24T00:11:33):
 *
 *   "I just tried to gift scrap metal to brisk cartwright and it told me that
 *    I cannot equip it"        "I'm not trying to equip it"
 *   "it even says at the top of the screen that I'm gifting so that's a glitch"
 *
 * He was right that it reads as a refusal and wrong only about what was refused:
 * NOTHING WAS. `Give to Bersk Cartwright` was on the sheet the whole time —
 * `giftBlockReason(Scrap Metal)` is null, so the gift action was drawn. What he
 * read was the modal's body text, which explained equip slots to a man holding
 * an open gift bar that said GIVING TO BERSK CARTWRIGHT.
 *
 * ⚠⚠ SO THIS IS THE PROJECT'S NAMED DEFECT RUNNING BACKWARDS. "The game offers a
 * thing and does not look like it's offering" normally means a missing
 * affordance; here the affordance was present and correct and the PROSE talked
 * the player out of using it. A pin that only checked "is the GIVE action
 * offered?" would have been green through the entire complaint.
 *
 * ⚠ These tests therefore assert on the SENTENCE THE PLAYER READS, for every
 * combination of (gift mode on/off) × (item giftable/blocked) × (item
 * equippable/not) — because the defect lived only in the interaction of those,
 * and each one alone looked fine.
 */
import { giftBlockReason, canGiftItem } from '../app/engine/giftEligibility';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const SCREEN = read('app', 'screens', 'InventoryScreen.tsx');

/** ⚠ Comments stripped first. This file's own header quotes the old sentence
 *  ("cannot be equipped") and the word "gift" many times; the screen's new
 *  comment block does the same. Every assertion below would otherwise be
 *  reading documentation instead of code — the exact hazard that produced a
 *  bogus count in check:voicepools and a self-tripping assertion in ota1459. */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = codeOnly(SCREEN);

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'i1', name: 'Scrap Metal', quantity: 1, ...over,
} as InventoryItem);

/** ⚠ `inventory` is NOT optional padding. `equippedInstanceIds` resolves each
 *  slot through `resolveEquippedItem`, which looks the id up in the pack and
 *  requires `quantity > 0` — an empty inventory makes every "worn" fixture
 *  silently resolve to nothing, and the first draft of this suite did exactly
 *  that and reported the worn case as unblocked. The fixture was wrong, not the
 *  rule; recorded because a fixture that under-populates a lookup produces a
 *  GREEN test for a broken claim, which is the worse direction to fail in. */
const player = (over: Partial<PlayerCharacter> = {}): PlayerCharacter => ({
  equipped: {}, inventory: [item()], activeFactionQuests: [], activeFactionQuestIds: [],
  activeHunts: [], completedHuntIds: [],
  ...over,
} as unknown as PlayerCharacter);

describe('OTA-1463 — the owner\'s exact case', () => {
  it('⚠⚠⚠ SCRAP METAL WAS ALWAYS GIVEABLE — the refusal he read was not a refusal', () => {
    // The whole complaint rests on this. If Scrap Metal had genuinely been
    // blocked, the fix would be in the eligibility rules instead of the copy.
    expect(giftBlockReason(item(), player())).toBeNull();
    expect(canGiftItem(item(), player())).toBe(true);
  });

  it('⚠⚠⚠ AND THE EQUIP SENTENCE NO LONGER OUTRANKS GIFT MODE', () => {
    // The ordering IS the bug. `modalBody` is a ternary chain, and the
    // non-equippable arm used to sit above any notion of gift mode, so every
    // material in the pack answered a question the player had not asked.
    const chain = CODE.slice(CODE.indexOf('const modalBody ='), CODE.indexOf('const fusionHint'));
    const giftAt = chain.indexOf('giftMode');
    const equipAt = chain.indexOf('This item cannot be equipped');
    expect(giftAt).toBeGreaterThan(-1);
    expect(equipAt).toBeGreaterThan(-1);
    expect({ giftBeforeEquip: giftAt < equipAt }).toEqual({ giftBeforeEquip: true });
  });

  it('⚠⚠ the equip sentence still exists for the case it was written for', () => {
    // Outside gift mode it is correct and useful. This OTA re-ordered it; a
    // "fix" that deleted it would strand every player who taps a material with
    // no gift in progress and wonders why nothing happens.
    expect(CODE).toContain('This item cannot be equipped, but you can still keep, sell, or use it.');
  });
});

describe('OTA-1463 — every reason a gift can be blocked now reaches the player', () => {
  // ⚠⚠ THE MORE VALUABLE HALF. giftBlockReason has computed these strings all
  // along and none of them were ever rendered: a blocked item simply lost its
  // GIVE button and said nothing. That is the-game-knows-and-does-not-say
  // (OTA-1402) on a second door, and it is why this suite walks every branch
  // rather than spot-checking one.
  const CASES: readonly { why: string; p: () => PlayerCharacter; i: () => InventoryItem; expect: RegExp }[] = [
    {
      why: 'worn',
      // ⚠ BOTH the name and the id. `resolveEquippedItem` reads `eq[slot]` and
      // returns null before it ever looks at `eq[slotId]`, so an id-only fixture
      // resolves to nothing and the worn case reports as giftable. A real save
      // always carries both; a fixture that carries one is testing a state the
      // game cannot be in, and reporting a pass for it.
      p: () => player({ equipped: { chest: 'Scrap Metal', chestId: 'i1' } } as unknown as Partial<PlayerCharacter>),
      i: () => item(),
      expect: /wearing/i,
    },
    {
      why: 'racked in the bandolier',
      p: () => player({ equipped: { bandolierIds: ['i1'] } } as unknown as Partial<PlayerCharacter>),
      i: () => item(),
      expect: /bandolier/i,
    },
    {
      why: 'in the tool pouch',
      p: () => player({ equipped: { toolPouchIds: ['i1'] } } as unknown as Partial<PlayerCharacter>),
      i: () => item(),
      expect: /tool pouch/i,
    },
    {
      why: 'reserved for the Crucible',
      p: () => player(),
      i: () => item({ reservedForFusion: true } as unknown as Partial<InventoryItem>),
      expect: /crucible/i,
    },
  ];

  for (const c of CASES) {
    it(`⚠⚠ ${c.why} — produces a reason, not a silence`, () => {
      const reason = giftBlockReason(c.i(), c.p());
      expect({ why: c.why, reason }).not.toEqual({ why: c.why, reason: null });
      expect(reason!).toMatch(c.expect);
      // ⚠ And it must read as half a sentence, because the screen renders it as
      // `You can't give this to X — <reason>.` A reason that capitalised itself
      // or carried its own full stop would surface as a broken sentence.
      expect(reason!).not.toMatch(/^[A-Z]/);
      expect(reason!.endsWith('.')).toBe(false);
    });
  }

  it('⚠⚠⚠ THE SCREEN ACTUALLY RENDERS THE REASON — not just computes it', () => {
    // Proving the string exists is worth nothing if nothing prints it. This is
    // the join between the engine's answer and the player's eyes.
    expect(CODE).toContain('giftBlockReason(pending.item, player)');
    expect(CODE).toMatch(/You can't give this to \$\{giftMode\.toName\} — \$\{giftBlock\}/);
  });

  it('⚠⚠ …and a GIVEABLE item is told how to give it', () => {
    expect(CODE).toMatch(/Tap "Give to \$\{giftMode\.toName\}" below/);
  });

  it('⚠⚠ the blocked branch is checked BEFORE the giveable one', () => {
    // Reversed, every blocked item would be told to tap a button that is not
    // drawn for it — worse than the original silence.
    const chain = CODE.slice(CODE.indexOf('const modalBody ='), CODE.indexOf('const fusionHint'));
    expect(chain.indexOf('giftBlock !== null')).toBeLessThan(chain.indexOf('Tap "Give to'));
  });
});

describe('OTA-1463 — the quest locks still win over everything', () => {
  it('⚠⚠⚠ A CONTRACT-BOUND ITEM KEEPS ITS OWN EXPLANATION, gift mode or not', () => {
    // Highest-severity ordering claim in the chain: an objective item must never
    // be described as merely "not giftable". Its own body text explains that it
    // cannot be dropped, salvaged, sold or fused either — strictly more
    // information, and the player needs all of it.
    const chain = CODE.slice(CODE.indexOf('const modalBody ='), CODE.indexOf('const fusionHint'));
    expect(chain.indexOf('isQuestLockedItem')).toBeLessThan(chain.indexOf('giftMode'));
    expect(chain.indexOf('reservedForQuest')).toBeLessThan(chain.indexOf('giftMode'));
  });

  it('⚠⚠ and the engine still refuses to give it', () => {
    // The copy change must not have loosened the rule underneath it.
    // ⚠ The lock is a TAG (`quest` / `contract` / `broker` / `whisper`), read
    // through canonicalItemTags — not a boolean on the instance. The first draft
    // invented `questLocked: true`, which no code anywhere reads.
    const locked = item({ name: 'Contract Seal', tags: ['quest'] } as unknown as Partial<InventoryItem>);
    const reason = giftBlockReason(locked, player());
    expect(reason).not.toBeNull();
    expect(reason!).toMatch(/contract/i);
  });
});

describe('OTA-1463 — no body text at all when there is nothing to say', () => {
  it('⚠ an ordinary equippable item outside gift mode still gets no lecture', () => {
    // The chain must still be able to fall all the way through to `undefined`.
    // A refactor that made every item print something would turn a quiet sheet
    // into a noisy one on every single tap.
    const chain = CODE.slice(CODE.indexOf('const modalBody ='), CODE.indexOf('const fusionHint'));
    expect(chain.trimEnd().endsWith(': undefined;')).toBe(true);
  });
});
