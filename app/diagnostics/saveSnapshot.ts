// OTA-341 — save-state snapshot for the COPY SAVE diagnostic. Player ask:
// *"we don't have a way yet to export the save files to the logs, we should
// add that."* Born directly from the OTA-338 brick: the player's save crashed
// ~90% of cold opens and we had NO way to capture it before they deleted the
// character to recover — so the exact fatal state was lost.
//
// COPY SAVE drops the loadable save state (player + worldMemory, minus the
// narration gameLog) on the clipboard so a bricked save can be pasted back
// and reproduced EXACTLY through loadSlotIntoGame in a test. A HIGHLIGHTS
// block up top surfaces the fields most likely to brick a load (dog state +
// the new mortality fields, puppy-vendor flags, pending onboarding) for a
// quick eyeball before diving into the JSON.

import type { PlayerCharacter } from '../engine/types';

export function buildSaveSnapshot(
  player: PlayerCharacter | null,
  worldMemory: unknown,
): string {
  if (!player) return 'No active character — nothing to export.';
  const wm = (worldMemory ?? {}) as Record<string, unknown>;
  const dog = player.dog;
  const lines: string[] = [];

  lines.push('--- HIGHLIGHTS (brick-suspect fields) ---');
  lines.push(`player: ${player.name} · race ${player.raceId} · faction ${player.factionId}`);
  lines.push(`hp ${player.hp}/${player.hpMax} · dead ${player.dead === true} · hoursElapsed ${player.hoursElapsed ?? 0} · loc ${player.currentLocationId ?? '?'}`);
  lines.push(`inventory ${player.inventory?.length ?? 0} items · statusEffects ${(player.statusEffects ?? []).length} · golem ${player.golem ? 'yes' : 'no'}`);
  lines.push(`mainQuest phase ${player.mainQuest?.phase ?? '?'} · guardiansDefeated ${(player.mainQuest?.guardiansDefeated ?? []).length}`);
  if (dog) {
    lines.push(`dog: ${dog.name} · status ${dog.status} · hp ${dog.hp}/${dog.hpMax} · loyalty ${dog.loyalty}`);
    lines.push(`dog mortality fields: downedAtHour ${dog.downedAtHour ?? '∅'} · bleedWarned ${dog.bleedWarned ?? '∅'} · loyaltyBeatFloor ${dog.loyaltyBeatFloor ?? '∅'} · lastFedAtHour ${dog.lastFedAtHour ?? '∅'}`);
  } else {
    lines.push('dog: (none)');
  }
  lines.push(`puppyVendor: owed ${wm.puppyVendorOwed === true} · queued ${wm.puppyVendorQueued === true} · used ${wm.puppyVendorUsed === true}`);
  lines.push(`pendingDogOnboarding: ${wm.pendingDogOnboarding ? JSON.stringify(wm.pendingDogOnboarding) : '(none)'}`);
  lines.push(`pendingChains ${Array.isArray(wm.pendingChains) ? wm.pendingChains.length : 0} · chainMemos ${Array.isArray(wm.chainMemos) ? wm.chainMemos.length : 0}`);

  lines.push('');
  lines.push('--- FULL STATE JSON (player + worldMemory; loadSlotIntoGame-reproducible) ---');
  let json: string;
  try {
    json = JSON.stringify({ player, worldMemory });
  } catch (e) {
    json = `(serialization failed: ${e instanceof Error ? e.message : String(e)})`;
  }
  lines.push(json);
  return lines.join('\n');
}

export function stampSaveExport(
  snapshot: string,
  deviceSummary: string,
  playerName?: string,
): string {
  const begin = `=== TARTARIA SAVE · ${snapshot.length} CHARS · BEGIN ===`;
  const end = `=== END SAVE · ${snapshot.length} CHARS ===`;
  const header = playerName ? `Tartaria Realms · ${playerName}` : 'Tartaria Realms';
  return `${begin}\n${snapshot}\n${end}\n\n${header}\n\n${deviceSummary}\n`;
}
