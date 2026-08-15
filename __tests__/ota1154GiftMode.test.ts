// OTA-1154 — GIFT MODE, AND THE LIST THAT USED TO OFFER WHAT IT WOULD REFUSE.
//
// Owner, two asks in one message:
//   *"the list we pick from to give out must exclude all equipped gear, armor and
//   anything in the bandolier or tool pouch. also no item that is given away would
//   break a mission or storyline beat."*
//   *"or would it be better to just have the gift button open your inventory and
//   then you can pick an item and while you are in gift mode that button will be
//   added to the pop-up menu when you tap on the item."*
//
// ⚠ WHY THE SECOND ASK FIXES THE FIRST. The old picker was a modal listing your
// TWELVE most valuable items — `.sort(by worth).slice(0, 12)` — so a cheap item a
// vendor specifically loves was UNOFFERABLE if you carried twelve pricier ones.
// It also listed worn armour and then refused the tap ("you are still wearing
// that"), which is a choice the game offers and takes back. Both are the same
// underlying fault: a second place deciding what you may give. Moving the pick
// into the inventory means the rules live once, next to the equip state that
// already answers them.
//
// ⚠ AND THE OLD GUARD WAS NAME-BASED. It compared `player.equipped[slot]` to
// `item.name`, so a SECOND identical locket in the pack was refused because the
// FIRST one was worn — and it knew nothing about the bandolier, the tool pouch,
// fusion reservations or accepted fetch contracts. giftBlockReason is instance-id
// exact and covers all of them.
import { giftBlockReason, canGiftItem } from '../app/engine/giftEligibility';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const item = (over: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id: 'i1', name: 'Hearty Stew', kind: 'consumable', quantity: 1, tags: ['food'], ...over } as InventoryItem);

const player = (over: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({
    name: 'Verbal', inventory: [], equipped: {}, activeFactionQuests: [], ...over,
  } as unknown as PlayerCharacter);

describe('OTA-1154 — what may never be given away', () => {
  it('an ordinary item in the pack is giftable', () => {
    const it = item();
    expect(giftBlockReason(it, player({ inventory: [it] }))).toBeNull();
    expect(canGiftItem(it, player({ inventory: [it] }))).toBe(true);
  });

  it('worn gear is blocked BY INSTANCE, so a second copy stays giftable', () => {
    // The exact case the old name-based guard got wrong.
    const worn = item({ id: 'worn', name: 'Aetheric Locket' });
    const spare = item({ id: 'spare', name: 'Aetheric Locket' });
    // ⚠ Both fields, because that is the real save shape: `amulet` names the slot
    // and `amuletId` pins WHICH copy. resolveEquippedItem needs the name present
    // and then prefers the id — which is precisely why the old name-only guard
    // refused the spare: it never looked at the id at all.
    const p = player({
      inventory: [worn, spare],
      equipped: { amulet: 'Aetheric Locket', amuletId: 'worn' } as never,
    });
    expect(giftBlockReason(worn, p)).toBe('you are wearing it');
    expect(giftBlockReason(spare, p)).toBeNull();
  });

  it('the bandolier and the tool pouch are both closed', () => {
    const racked = item({ id: 'b1', name: 'Acid Flask' });
    const stowed = item({ id: 't1', name: 'Pry Bar' });
    const p = player({
      inventory: [racked, stowed],
      equipped: { bandolierIds: ['b1'], toolPouchIds: ['t1'] } as never,
    });
    expect(giftBlockReason(racked, p)).toBe('it is racked in your bandolier');
    expect(giftBlockReason(stowed, p)).toBe('it is in your tool pouch');
  });

  it('something reserved for the Crucible is not quietly handed away', () => {
    const res = item({ id: 'r1', reservedForFusion: true });
    expect(giftBlockReason(res, player({ inventory: [res] }))).toBe('it is reserved for the Crucible');
  });

  it('⚠ an ordinary item an accepted FETCH contract is waiting on is blocked', () => {
    // The mission-breaking case, and the one that is not a hard lock: a fetch
    // contract wants normal catalog loot, so nothing marks the item as special.
    // Giving away your last one does not fail the contract loudly — it just makes
    // it uncompletable until you find another.
    const { FACTION_QUESTS } = require('../app/engine/factionQuests');
    const fetchQuest = FACTION_QUESTS.find((q: { fetch?: unknown }) => q.fetch);
    if (!fetchQuest) throw new Error('no fetch contract in the catalog to test against');
    const wanted = item({ id: 'w1', name: fetchQuest.fetch.itemName });
    const p = player({ inventory: [wanted], activeFactionQuests: [{ id: fetchQuest.id, stage: 0 }] as never });
    expect(giftBlockReason(wanted, p)).toBe('a contract you have accepted is waiting on it');
    // ...and it is freely giftable again once no contract wants it.
    expect(giftBlockReason(wanted, player({ inventory: [wanted] }))).toBeNull();
  });
});

describe('OTA-1154 — category lock: one predicate, not two', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const STORE = read('app/state/gameStore.ts');
  const INV = read('app/screens/InventoryScreen.tsx');
  const MODAL = read('app/components/GiftModal.tsx');

  it('the store gates giveGift on the shared predicate', () => {
    expect(STORE).toContain('giftBlockReason(item, player)');
  });

  it('the inventory draws GIVE from the SAME predicate', () => {
    expect(INV).toContain('giftBlockReason(pending.item, player) === null');
  });

  it('⚠ the old name-based worn guard is GONE', () => {
    // If this reappears, there are two answers again and they will drift — the
    // name-based one refuses a second identical copy that the id-based one allows.
    expect(STORE).not.toMatch(/const wornSlot = ARMOR_SLOTS\.find/);
  });

  it('⚠ the twelve-item cap is GONE — that was the unofferable-favourite bug', () => {
    expect(MODAL).not.toContain('.slice(0, 12)');
    expect(MODAL).not.toContain('sellPriceFor');
  });
});

describe('OTA-1154 — everyone who can receive a gift can be offered one', () => {
  const fs = require('fs');
  const path = require('path');
  const EXPL = fs.readFileSync(path.join(__dirname, '..', 'app/screens/ExplorationScreen.tsx'), 'utf8');

  it('⚠ the Hidden Market is no longer excluded from the vendor chip', () => {
    // The GIFT button lives inside that chip, so excluding the Market made every
    // Market face ungiftable by button — including twelve shopkeepers who have
    // authored tastes and also work a Market stall.
    expect(EXPL).not.toMatch(/vendorChipDismissed &&[\s\S]{0,60}location\?\.id !== 'hidden_market' && \(/);
  });

  it('the wanderer chip has its own GIFT button', () => {
    expect(EXPL).toMatch(/Give a gift to \$\{currentScene\.wanderer\.name\}/);
  });

  it('there are at least two GIFT entry points now', () => {
    const hits = EXPL.match(/openGift\(\)/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
