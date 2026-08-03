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
import { sellPriceFor } from '../engine/sellPrice';

export function GiftModal() {
  const ctx = useGameStore((s) => s.pendingGift);
  const inventory = useGameStore((s) => s.player?.inventory);
  const vendor = useGameStore((s) => s.currentScene?.vendor);
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
          : `Anything under ${GIFT_FLOOR_TC} TC will be taken as an insult, not a gift.`
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
