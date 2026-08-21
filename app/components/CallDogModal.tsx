// OTA-120 Phase 5 — CallDogModal. Surfaced by the parser intercept on
// `call dog` / `call <dogname>`. Three options: scratch ear (+2
// loyalty), give treat (opens a pack picker filtered to consumables;
// +20 regular / +40 dogTreat), speak softly (+1 loyalty). One-tap;
// 1 minute of game time.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';
import type { InventoryItem } from '../engine/types';

export function CallDogModal() {
  const visible = useGameStore((s) => s.callDogModalOpen);
  const close = useGameStore((s) => s.closeCallDogModal);
  const select = useGameStore((s) => s.selectCallDogOption);
  const player = useGameStore((s) => s.player);
  const [treatPickerOpen, setTreatPickerOpen] = useState(false);

  if (!visible || !player?.dog) return null;
  const dog = player.dog;

  const treatItems: InventoryItem[] = (player.inventory ?? []).filter(
    (i) => i.kind === 'consumable' && i.quantity > 0,
  );

  if (treatPickerOpen) {
    return (
      <BrandedModal
        visible
        title={`Treat for ${dog.name}`}
        body={treatItems.length === 0
          // ⚠ OTA-1423 — `dog` is already in scope three lines up; this said
          // "the dog" while the title one line above said the name.
          ? `Your pack has no food ${dog.name} can eat. Forage, trade, or scavenge a consumable first.`
          : `Pick a consumable to hand ${dog.name}. Dog treats (marked [treat]) give +40 loyalty; regular food gives +20.`}
        buttons={[
          ...treatItems.slice(0, 10).map((item) => ({
            label: `${item.name}${isDogTreatTagged(item) ? ' [treat]' : ''} ×${item.quantity}`,
            onPress: () => {
              select('treat', item.name);
              setTreatPickerOpen(false);
            },
            tone: 'primary' as const,
          })),
          {
            label: 'Cancel',
            onPress: () => setTreatPickerOpen(false),
            tone: 'neutral' as const,
          },
        ]}
        onRequestClose={() => setTreatPickerOpen(false)}
      />
    );
  }

  return (
    <BrandedModal
      visible
      title={`Call ${dog.name}`}
      body={`${dog.name} (${dog.breed}) trots over and waits. What now?`}
      buttons={[
        {
          // ⚠⚠ OTA-1416 — LEADS WITH THE WORD A PLAYER ACTUALLY USES. This read
          // "Scratch their ear (+2 loyalty)" from OTA-120 until the owner typed
          // `pet dog`, got this menu, and reported that none of the options were
          // petting the dog. One of them was. He was looking for "pet" and the
          // button never said it, so the right answer read as a wrong one.
          label: 'Pet them — scratch behind the ear (+2 loyalty)',
          onPress: () => select('scratch'),
          tone: 'primary',
        },
        {
          label: 'Give them a treat',
          onPress: () => setTreatPickerOpen(true),
          tone: 'primary',
        },
        {
          label: 'Speak softly (+1 loyalty)',
          onPress: () => select('speak'),
          tone: 'primary',
        },
        {
          label: 'Close',
          onPress: close,
          tone: 'neutral',
        },
      ]}
      onRequestClose={close}
    />
  );
}

function isDogTreatTagged(item: InventoryItem): boolean {
  if ((item.tags ?? []).includes('dog_treat') || (item.tags ?? []).includes('treat')) {
    return true;
  }
  // Fallback — check catalog effect for dogTreat flag.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName } = require('../engine/crafting');
    const gear = findGearByName(item.name);
    if (gear?.effect?.kind === 'consumable' && gear.effect.dogTreat) return true;
  } catch {
    // ignore
  }
  return false;
}

const styles = StyleSheet.create({
  container: { padding: 12 },
});
