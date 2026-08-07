// OTA-1060 — the gift flow. Two steps in ONE modal, and the first step usually
// does not appear at all.
//
// The owner's spec was "select an item and a person". In practice the person is
// almost always the only other person in the room, and a mandatory recipient
// picker with one entry on it is a tap of pure ceremony. So the recipient step
// renders only when there is a genuine choice — a vendor AND a wanderer in the
// same scene — and otherwise the modal opens straight onto the pack.
//
// Item list shows worth, because the floor is a real rule (GIFT_FLOOR_TC) and a
// player who cannot see value has no way to tell a gift from an insult until
// they have already given offence.

import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';
import { GIFT_FLOOR_TC } from '../engine/gifting';
import { getRelation } from '../engine/npcMemory';
import { sellPriceFor } from '../engine/sellPrice';

/** OTA-1083 — what the player has WITNESSED of this person's tastes, phrased
 *  for the picker. Entries are ledger strings ('loves:metal', 'cold:food')
 *  recorded only when a gift's reaction revealed them — never the authored
 *  list. Empty until you've learned something. */
function knownTastesLine(tastes: readonly string[] | undefined): string | null {
  if (!tastes || tastes.length === 0) return null;
  const phrased = tastes.map((t) => {
    const [kind, subject] = [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)];
    // ⚠ OTA-1153 — THREE TIERS NOW, AND THE ELSE-BRANCH USED TO SWALLOW THEM.
    // This was `kind === 'loves' ? loves : 'no use for'`, so the moment `likes:`
    // discoveries existed they would have rendered as "no use for" — the picker
    // telling the player the exact opposite of what they had just witnessed.
    // `cold:` is the pre-OTA-1153 spelling of `dislikes:` and still sits in old
    // saves' ledgers, so it is read here rather than migrated.
    if (kind === 'loves') return `loves ${subject}`;
    if (kind === 'likes') return `likes ${subject}`;
    return `no use for ${subject}`;
  });
  return `You know of them: ${phrased.join(' · ')}.`;
}

export function GiftModal() {
  const ctx = useGameStore((s) => s.pendingGift);
  const inventory = useGameStore((s) => s.player?.inventory);
  const vendor = useGameStore((s) => s.currentScene?.vendor);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const choose = useGameStore((s) => s.chooseGiftRecipient);
  const give = useGameStore((s) => s.giveGift);
  const close = useGameStore((s) => s.closeGift);

  if (!ctx) return null;

  // Step one, only when it is a real question.
  if (!ctx.toId) {
    return (
      <BrandedModal
        visible
        title="Give something"
        body="Who to?"
        buttons={[
          ...ctx.candidates.map((c) => ({
            label: c.name,
            onPress: () => choose(c.id),
            tone: 'neutral' as const,
          })),
          { label: 'Never mind', onPress: close, tone: 'neutral' as const },
        ]}
        onRequestClose={close}
      />
    );
  }

  // Quest items and the like are excluded upstream by worth; everything the
  // player can actually part with is listed with what it is worth, so the
  // insult threshold is visible rather than a trap.
  const giftable = (inventory ?? [])
    .filter((i) => i.quantity > 0)
    .map((i) => ({ item: i, worth: sellPriceFor(i, vendor ?? null, 0) }))
    .sort((a, b) => b.worth - a.worth)
    .slice(0, 12);

  return (
    <BrandedModal
      visible
      title={`Give to ${ctx.toName}`}
      body={
        giftable.length === 0
          ? 'You have nothing to give.'
          : [
              // OTA-1083 — discoveries first: what their reactions have taught
              // you. Absent until a gift has actually revealed something.
              knownTastesLine(getRelation(worldMemory, ctx.toId)?.giftTastes),
              `Anything under ${GIFT_FLOOR_TC} TC will be taken as an insult, not a gift.`,
            ].filter(Boolean).join('\n\n')
      }
      buttons={[
        ...giftable.map(({ item, worth }) => ({
          label: `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''} — ${worth} TC`,
          onPress: () => give(item.id),
          tone: 'neutral' as const,
        })),
        { label: 'Never mind', onPress: close, tone: 'neutral' as const },
      ]}
      onRequestClose={close}
    />
  );
}
