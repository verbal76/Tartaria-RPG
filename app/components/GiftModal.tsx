// OTA-1083 / rewritten OTA-1177 — the RECIPIENT picker.
//
// It was two steps in one modal: who, then what. The second step is gone — the
// GIFT button now opens the pack and GIVE appears on the item's own popup, so
// the item list lives where the item rules already live. See giftEligibility.ts
// and the gift-mode banner in InventoryScreen.
//
// This step still renders only when there is a GENUINE choice — a vendor AND a
// wanderer in the same scene. One person present is not a choice, and openGift
// skips straight past it into gift mode rather than asking a ceremonial question.
import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';
import { getRelation } from '../engine/npcMemory';

/** OTA-1106 — what the player has WITNESSED of this person's tastes, phrased
 *  for the picker. Entries are ledger strings ('loves:metal', 'cold:food')
 *  recorded only when a gift's reaction revealed them — never the authored
 *  list. Empty until you've learned something. */
function knownTastesLine(tastes: readonly string[] | undefined): string | null {
  if (!tastes || tastes.length === 0) return null;
  const phrased = tastes.map((t) => {
    const [kind, subject] = [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)];
    // ⚠ OTA-1176 — THREE TIERS NOW, AND THE ELSE-BRANCH USED TO SWALLOW THEM.
    // This was `kind === 'loves' ? loves : 'no use for'`, so the moment `likes:`
    // discoveries existed they would have rendered as "no use for" — the picker
    // telling the player the exact opposite of what they had just witnessed.
    // `cold:` is the pre-OTA-1176 spelling of `dislikes:` and still sits in old
    // saves' ledgers, so it is read here rather than migrated.
    if (kind === 'loves') return `loves ${subject}`;
    if (kind === 'likes') return `likes ${subject}`;
    return `no use for ${subject}`;
  });
  return `You know of them: ${phrased.join(' · ')}.`;
}

export function GiftModal() {
  const ctx = useGameStore((s) => s.pendingGift);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const choose = useGameStore((s) => s.chooseGiftRecipient);
  const close = useGameStore((s) => s.closeGift);

  if (!ctx) return null;

  // ⚠ OTA-1177 — THIS IS NOW A RECIPIENT PICKER AND NOTHING ELSE.
  //
  // It used to be two steps: who, then what. The second step listed only your
  // TWELVE most valuable items (sorted by worth, sliced), which meant a cheap
  // thing a vendor specifically loves was simply unofferable if you happened to
  // be carrying twelve pricier ones — and the list included worn armour, which
  // `giveGift` then refused on tap. Owner's call: the GIFT button opens the pack
  // instead, and GIVE appears on the item's own popup. So `chooseGiftRecipient`
  // hands off to gift mode and this modal closes; the item half is deleted rather
  // than left behind as a second, smaller, disagreeing list.
  //
  // It still appears ONLY when there is a real question — one person present is
  // not a choice, and openGift skips straight past this.
  return (
    <BrandedModal
      visible
      title="Give something"
      body={[
        'Who to?',
        // What their reactions have taught you, if anything — shown while the
        // choice is being made, since that is when it is useful.
        ...ctx.candidates
          .map((c) => {
            const line = knownTastesLine(getRelation(worldMemory, c.id)?.giftTastes);
            return line ? `${c.name}: ${line.replace('You know of them: ', '')}` : null;
          })
          .filter((l): l is string => !!l),
      ].join('\n\n')}
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
