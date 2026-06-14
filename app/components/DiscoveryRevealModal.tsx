// arb142 — a small "you just got something notable" reveal overlay. Driven by
// the store field `discoveryReveal` so any system can raise it: the first-time
// collectible pickup (with a jump-to-Collectibles button so the player learns
// the screen exists) and a Crucible-forged weapon (so the new item's NAME is
// surfaced instead of buried in a huge pack). Self-contained; rendered once at
// the App root next to the other global modals.

import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';
import type { ScreenName } from '../engine/types';

export function DiscoveryRevealModal() {
  const reveal = useGameStore((s) => s.discoveryReveal);
  const dismiss = useGameStore((s) => s.dismissDiscoveryReveal);
  const setScreen = useGameStore((s) => s.setScreen);

  if (!reveal) return null;

  const buttons = reveal.cta
    ? [
        {
          label: reveal.cta.label,
          tone: 'primary' as const,
          onPress: () => {
            const target = reveal.cta!.screen as ScreenName;
            dismiss();
            setScreen(target);
          },
        },
        { label: 'Not now', tone: 'neutral' as const, onPress: () => dismiss() },
      ]
    : [{ label: 'Got it', tone: 'primary' as const, onPress: () => dismiss() }];

  return (
    <BrandedModal
      visible
      title={reveal.title}
      body={reveal.body}
      buttons={buttons}
      onRequestClose={() => dismiss()}
    />
  );
}
