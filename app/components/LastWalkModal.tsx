/* ⚠⚠⚠ OTA-1844 — THE LAST WALK'S ONE SURFACE.
 *
 * Deliberately NOT CallDogModal. That modal is about a living dog you own, and
 * its verbs are ownership verbs — pet it, treat it, raise its loyalty by a
 * number. This one is about somebody else's dog, already dead, who owes you
 * nothing: the acts have no stats behind them, there is no counter to move, and
 * LEAVE is a real answer rather than a dismissal.
 *
 * ⚠⚠ THERE IS NO ATTACK BUTTON HERE AND THERE NEVER WILL BE. The hostile path
 * exists in the engine only so that a swing taken through some OTHER surface
 * ends the encounter honestly. It is not offered, because offering it would make
 * killing a dead player's dog a thing this game asks you to consider.
 */
import React from 'react';
import { useGameStore } from '../state/gameStore';
// ⚠ OTA-1836 — this presentation surface reaches real gameplay mutations.
import { useHumanAction } from '../state/humanActivity';
import { BrandedModal } from './BrandedModal';
import { dogTitle, LAST_WALK_ACTS, LAST_WALK_ACT_LABEL } from '../engine/fallenDogs';

export function LastWalkModal() {
  const dog = useGameStore((s) => s.lastWalkDog);
  const given = useGameStore((s) => s.lastWalkGiven);
  const choose = useHumanAction('chooseLastWalk');

  if (!dog) return null;
  const done = given ?? [];

  return (
    <BrandedModal
      visible
      title={dog.name}
      body={`${dogTitle(dog)}.\n\nThin, still, and watching you. ${dog.name} is not going to come to you on {possessive} own.`
        .replace('{possessive}', dog.pronoun === 'they' ? 'their' : dog.pronoun === 'he' ? 'his' : 'her')}
      buttons={[
        ...LAST_WALK_ACTS.map((act) => ({
          // A given act stays on the card rather than vanishing: the player can
          // see what they have already offered, and pressing it again costs
          // nothing and says so.
          label: done.includes(act) ? `${LAST_WALK_ACT_LABEL[act]} ✓` : LAST_WALK_ACT_LABEL[act],
          onPress: () => choose(act),
          tone: 'primary' as const,
        })),
        {
          label: 'WALK AWAY',
          onPress: () => choose('leave'),
          tone: 'neutral' as const,
        },
      ]}
      // ⚠ Dismissing the card is walking away, and it is treated as exactly
      // that — no closure, no rest, the companion stays out there.
      onRequestClose={() => choose('leave')}
    />
  );
}
