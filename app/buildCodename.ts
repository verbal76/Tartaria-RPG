// OTA-267 — Build codename obfuscation layer.
//
// Player-facing context: the user is opening Android playtest to a
// large public group (~hundred testers off Facebook Gaming Dads) and
// wants the About screen + bug report output to NOT leak the
// `OTA-NNN` numbering pattern that matches commit messages /
// HANDOFF.md entries on the GitHub repo. The repo flips back to
// private after the build cycle, but historical commit messages
// indexed by Google during the public window could still surface in
// a curious tester's search.
//
// This module is the abstraction layer: every user-visible reference
// to the build pulls the codename instead of the raw OTA_BUILD_ID
// string. The mapping is maintained here AND in
// docs/build-codenames.md (the dev's cross-reference when reading
// bug reports). Each new OTA adds one entry; old entries are kept
// so an existing playtester whose save was last updated on an
// older OTA still shows a stable codename in their "OTA applied"
// dialog and bug reports.
//
// Codename scheme: noun-noun pairs evocative of Tartaria but generic
// enough to not be obvious as game-specific search hits. ~40
// curated pairs in reserve; we burn them sequentially per OTA.

import { OTA_BUILD_ID } from './buildInfo';

const CODENAMES: Record<string, string> = {
  '2026-05-31-255': 'Iron Drift',
  '2026-05-31-256': 'Mud Mantle',
  '2026-05-31-257': 'Ash Tine',
  '2026-05-31-258': 'Hollow Anvil',
  '2026-05-31-259': 'Salt Vault',
  '2026-05-31-260': 'Bone Helm',
  '2026-05-31-261': 'Coal Coil',
  '2026-05-31-262': 'Glass Fence',
  '2026-05-31-263': 'Crystal Spire',
  '2026-05-31-264': 'Rust Vault',
  '2026-05-31-265': 'Stone Mantle',
  '2026-05-31-266': 'Cinder Drift',
  '2026-05-31-267': 'Smoke Anvil',
  '2026-06-01-268': 'Tin Tine',
};

/**
 * Codename for the given OTA build id (defaults to the live OTA).
 * Returns a fallback "(<raw id>)" wrapped in parens if the id isn't
 * in the map — preserves diagnostic info for super-old saves whose
 * last-seen OTA predates this codename layer. The parens make it
 * obvious to the dev that the codename map needs an entry.
 */
export function getBuildCodename(otaId: string = OTA_BUILD_ID): string {
  return CODENAMES[otaId] ?? `(${otaId})`;
}

/**
 * Same as getBuildCodename but returns null if the id is unmapped.
 * Used by call sites that want to render fallback text differently
 * (e.g., the OTA-applied dialog, which falls back to "an older
 * build" rather than exposing the raw OTA id).
 */
export function getBuildCodenameOrNull(otaId: string = OTA_BUILD_ID): string | null {
  return CODENAMES[otaId] ?? null;
}
