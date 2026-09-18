/* ⚠⚠⚠ OTA-1845 — THE ONE SURFACE A SENDER GETS.
 *
 * Another player's living character is standing in front of you asking for help
 * with their dead. That is the whole card: who they are, what they want, and two
 * ways to answer.
 *
 * ⚠⚠ THERE IS NO ATTACK BUTTON AND NOTHING FOR ONE TO DO. Unlike the Last Walk,
 * where a hostile path exists in the engine so a swing taken elsewhere ends
 * honestly, there is no hostile path here AT ALL — no enemy is ever built for a
 * rider, so there is nothing a combat surface could be pointed at.
 *
 * ⚠ AND NEITHER BUTTON PAYS. Answering grants no XP, no coin, no item and no
 * standing; it is a sentence, not a transaction. The reward for helping is the
 * closure that travels back to them, which the existing Fallen systems already
 * carry.
 */
import React from 'react';
import { useGameStore } from '../state/gameStore';
// ⚠ OTA-1836 — this presentation surface reaches a real gameplay mutation.
import { useHumanAction } from '../state/humanActivity';
import { BrandedModal } from './BrandedModal';
import { visitAskLine, visitTitle, VISIT_DISMISS_LABEL, VISIT_REPLY_LABEL } from '../engine/senderIntro';

export function LedgerVisitModal() {
  const visitor = useGameStore((s) => s.ledgerVisitor);
  const answer = useHumanAction('answerLedgerVisit');

  if (!visitor) return null;

  const race = visitor.sender?.raceName?.trim();
  return (
    <BrandedModal
      visible
      title={visitor.sender?.name?.trim() || 'A RIDER'}
      body={`${visitTitle(visitor)}${race ? ` — ${race}` : ''}.\n\n"${visitAskLine(visitor)}"`}
      buttons={[
        { label: VISIT_REPLY_LABEL, onPress: () => answer(true), tone: 'primary' as const },
        { label: VISIT_DISMISS_LABEL, onPress: () => answer(false), tone: 'neutral' as const },
      ]}
      // ⚠ Dismissing is saying nothing, and it is treated as exactly that. There
      // is no outcome difference to hide in: the rider leaves either way, and
      // the Fallen they asked about are already in this world regardless.
      onRequestClose={() => answer(false)}
    />
  );
}
