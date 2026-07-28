// OTA-808 — ParleyModal. Surfaced when the player opens a social encounter with a
// GENERIC opener ("talk to / greet") against a wild NPC or an animal they're
// fighting. Presents the two contextual choices with their stakes spelled out, so a
// risky commit (intimidate → fail = a fight / a vicious hit) is a deliberate tap,
// never a mis-parsed verb. A player who typed a specific verb never sees this — they
// committed already. See engine/parley.ts + gameStore.resolveParley.

import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';
import { choicesFor, temperamentReadout, temperamentTell } from '../engine/parley';

export function ParleyModal() {
  const ctx = useGameStore((s) => s.pendingParley);
  const resolve = useGameStore((s) => s.resolveParley);
  const close = useGameStore((s) => s.closeParley);

  if (!ctx) return null;
  const [safe, hard] = choicesFor(ctx.kind); // [calm|persuade, intimidate]
  const read = ctx.wisRevealed ? temperamentReadout(ctx.temperament) : temperamentTell(ctx.temperament);

  const safeLabel = ctx.kind === 'animal' ? 'Calm it' : 'Persuade them';
  const safeHint = ctx.kind === 'animal'
    ? 'Ease off — if it doesn\'t take, the fight simply goes on.'
    : 'Reason with them — if it fails, they clam up and you lose the lead.';
  const hardHint = ctx.kind === 'animal'
    ? 'Dominate it — if it fails, it lands a vicious hit.'
    : 'Lean on them for what they carry — if it fails, they turn on you.';

  return (
    <BrandedModal
      visible
      title={`${ctx.targetName}`}
      body={`${read}\n\nHow do you play it?`}
      buttons={[
        {
          label: `${safeLabel} — ${safeHint}`,
          onPress: () => resolve(safe),
          tone: 'primary',
        },
        {
          label: `Intimidate — ${hardHint}`,
          onPress: () => resolve(hard),
          tone: 'destructive',
        },
        {
          label: 'Back off',
          onPress: close,
          tone: 'neutral',
        },
      ]}
      onRequestClose={close}
    />
  );
}
