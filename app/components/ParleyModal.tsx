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
  const intoTalk = useGameStore((s) => s.parleyIntoTalk);

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
        // OTA-1087 — THE THIRD OPTION, and the only door the seven wanderer
        // archetypes have. Their 28 authored topics were unreachable because
        // `talk to <them>` has always landed on this modal and stopped here.
        // Offering the conversation as a peer of persuade/intimidate rather
        // than taking the verb from them costs the parley nothing: this CLOSES
        // the parley without rolling, the wanderer stays in the scene, and
        // walking out of the conversation gets this screen back.
        ...(ctx.topicsNpcId
          ? [{
              label: 'Just talk — ask them about the road. Costs nothing, forfeits nothing.',
              onPress: intoTalk,
              tone: 'neutral' as const,
            }]
          : []),
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
