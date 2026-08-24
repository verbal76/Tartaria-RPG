// ⚠⚠ OTA-1490 — OWNER TOOLS UNLOCK BY DEVICE, NOT BY CHARACTER.
//
// Owner: *"I have 2 characters on 1 account and only 1 has the send log
// option."* OTA-1489 gated SEND LOG on the LOADED character's name
// (`sharingUnlockedFor`) — but ownership is a property of the DEVICE in the
// hand, not of which character it currently has loaded. So the unlock is now
// sticky: the first time a character wearing an unlock name is seen here, the
// device is marked, and every character on it gets the owner tools from then
// on. A player's device never holds an unlock-named character of the owner's,
// so the flag never sets there; a player who happens to NAME a character
// "verbal…" unlocks exactly what that name already unlocked since OTA-1489 —
// a button that uploads their own diagnostics on their own deliberate tap.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sharingUnlockedFor } from '../engine/fallenLedger';

export const OWNER_TOOLS_KEY = '@tartaria/ownerTools';

/** Mark the device once an unlock-named character is present. Idempotent. */
export async function noteOwnerCharacterSeen(name: string | null | undefined): Promise<void> {
  if (!sharingUnlockedFor(name)) return;
  try { await AsyncStorage.setItem(OWNER_TOOLS_KEY, 'true'); } catch { /* next visit retries */ }
}

/** ⚠ OTA-1490 — THE UNIVERSAL UNLOCK: seven taps on the About info block.
 *  The name-based unlock cannot cover the owner's real topology ("golem and
 *  hal installed with 3 characters across 2 accounts") — each install has its
 *  own storage, and an install whose characters carry ordinary names would
 *  never set the flag. The dev-mode tap ritual works on ANY install with ANY
 *  roster. It is deliberately obscure, and even a player who stumbles into it
 *  unlocks only a button that uploads their own diagnostics on their own tap. */
export async function unlockOwnerTools(): Promise<void> {
  try { await AsyncStorage.setItem(OWNER_TOOLS_KEY, 'true'); } catch { /* tap again */ }
}

/** The gate: this character's name unlocks directly, OR the device was marked
 *  by one that did. A read error answers with the name check alone — the
 *  sticky half degrades to exactly the OTA-1489 behavior, never wider. */
export async function ownerToolsUnlocked(name: string | null | undefined): Promise<boolean> {
  if (sharingUnlockedFor(name)) return true;
  try {
    return (await AsyncStorage.getItem(OWNER_TOOLS_KEY)) === 'true';
  } catch {
    return false;
  }
}
