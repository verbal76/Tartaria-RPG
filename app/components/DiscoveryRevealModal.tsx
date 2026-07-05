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
  const requestContractsTab = useGameStore((s) => s.requestContractsTab);
  const requestInventoryCategory = useGameStore((s) => s.requestInventoryCategory);

  if (!reveal) return null;

  const buttons = reveal.cta
    ? [
        {
          label: reveal.cta.label,
          tone: 'primary' as const,
          onPress: () => {
            const target = reveal.cta!.screen as ScreenName;
            // OTA-606 — deep-link to a specific Contracts tab (the first-
            // collectible popup wants the Collectibles tab, not the default).
            if (reveal.cta!.contractsTab) requestContractsTab(reveal.cta!.contractsTab);
            // OTA-683 — deep-link to an expanded Inventory section (a forged
            // piece → its weapon/armor row, since sections default collapsed).
            if (reveal.cta!.inventoryCategory) requestInventoryCategory(reveal.cta!.inventoryCategory);
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
