// OTA-211 — Aether Stat Picker. Surfaces when the player runs
// `infuse <food>` (or taps an equivalent action). Five buttons —
// STR / DEX / INT / WIS / CHA — each calls selectAetherStat to
// apply the +3 buff for 5 real-world minutes.

import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';

export function AetherStatPickerModal() {
  const visible = useGameStore((s) => s.aetherStatPickerOpen);
  const close = useGameStore((s) => s.closeAetherStatPicker);
  const select = useGameStore((s) => s.selectAetherStat);

  if (!visible) return null;

  return (
    <BrandedModal
      visible
      title="Aether Lacing"
      body="The dust catches behind your eyes. Which edge does it sharpen?"
      buttons={[
        { label: 'Strength (+3 STR / 5 min)', onPress: () => select('strength'), tone: 'primary' },
        { label: 'Dexterity (+3 DEX / 5 min)', onPress: () => select('dexterity'), tone: 'primary' },
        { label: 'Intelligence (+3 INT / 5 min)', onPress: () => select('intelligence'), tone: 'primary' },
        { label: 'Wisdom (+3 WIS / 5 min)', onPress: () => select('wisdom'), tone: 'primary' },
        { label: 'Charisma (+3 CHA / 5 min)', onPress: () => select('charisma'), tone: 'primary' },
        { label: 'Cancel', onPress: close, tone: 'neutral' },
      ]}
      onRequestClose={close}
    />
  );
}
