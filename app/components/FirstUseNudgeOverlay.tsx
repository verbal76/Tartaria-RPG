import React from 'react';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from './BrandedModal';
import { FIRST_USE_NUDGES } from '../data/firstUseNudges';

// OTA-066 — top-level overlay that renders a first-use feature-intro
// popup whenever the engine queues one via triggerFirstUseNudge(id).
// Mounted in App.tsx so it can fire on any screen. Single-modal queue
// (triggerFirstUseNudge no-ops while one is already pending) keeps the
// UX from stacking popups during noisy moments.
export function FirstUseNudgeOverlay() {
  const pendingId = useGameStore((s) => s.pendingFirstUseNudge);
  const dismiss = useGameStore((s) => s.dismissFirstUseNudge);

  const nudge = pendingId ? FIRST_USE_NUDGES[pendingId] : null;

  return (
    <BrandedModal
      visible={nudge !== null}
      title={nudge?.title ?? ''}
      body={nudge?.body}
      buttons={[{ label: 'Got it', tone: 'primary', onPress: dismiss }]}
      onRequestClose={dismiss}
    />
  );
}
