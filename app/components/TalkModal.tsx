// OTA-1058 — PHASE 2, VERTICAL SLICE. The topic list for an open conversation.
//
// Deliberately the same shape as ParleyModal: self-mounts off a single piece of
// store state, presents its choices as labelled buttons with the stakes or the
// subject spelled out, and closes on a plain "leave it". The player has already
// learned this interaction; a conversation system that invented its own screen
// would be a second thing to learn for no gain.
//
// The exchange STAYS OPEN after a topic is raised — the reply goes to the feed,
// the list re-renders with that topic spent, and the player can ask something
// else or walk away. That is what makes it a conversation rather than a menu
// that fires once.
//
// No spinner, no async, no model. See engine/dialogue.ts.

import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';

export function TalkModal() {
  const ctx = useGameStore((s) => s.pendingTalk);
  const raise = useGameStore((s) => s.raiseTopic);
  const close = useGameStore((s) => s.closeTalk);
  const talked = useGameStore((s) => s.worldMemory.talkedTopics);

  if (!ctx) return null;

  const spent = (topicId: string, lineCount: number) =>
    (talked?.[`${ctx.npcId}:${topicId}`] ?? 0) >= lineCount;

  return (
    <BrandedModal
      visible
      title={ctx.npcName}
      body="What do you want to ask about?"
      buttons={[
        ...ctx.topics.map((t) => ({
          // A spent topic stays VISIBLE and marked rather than vanishing: a list
          // that silently shrinks reads as the game losing content, and the
          // player has no way to tell "asked already" from "never existed".
          label: spent(t.id, t.lines.length) ? `${t.label} (asked)` : t.label,
          onPress: () => raise(t.id),
          tone: 'neutral' as const,
        })),
        { label: 'Leave it', onPress: close, tone: 'neutral' as const },
      ]}
      onRequestClose={close}
    />
  );
}
