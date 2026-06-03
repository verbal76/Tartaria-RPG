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
  '2026-06-01-269': 'Brass Coil',
  '2026-06-01-270': 'Lead Helm',
  '2026-06-01-271': 'Copper Fence',
  '2026-06-01-272': 'Slate Spire',
  '2026-06-01-273': 'Pewter Vault',
  '2026-06-01-274': 'Bronze Mantle',
  '2026-06-01-275': 'Granite Drift',
  '2026-06-02-276': 'Marble Anvil',
  '2026-06-02-277': 'Chalk Tine',
  '2026-06-02-278': 'Soot Helm',
  '2026-06-02-279': 'Ember Coil',
  '2026-06-02-280': 'Ash Fence',
  '2026-06-02-281': 'Pitch Spire',
  '2026-06-02-282': 'Tar Vault',
  '2026-06-02-283': 'Wax Mantle',
  '2026-06-02-284': 'Resin Drift',
  '2026-06-02-285': 'Lacquer Anvil',
  '2026-06-02-286': 'Gilt Tine',
  '2026-06-02-290': 'Reed Spire',
  '2026-06-02-292': 'Briar Mantle',
  '2026-06-02-293': 'Husk Drift',
  '2026-06-02-294': 'Lichen Anvil',
  '2026-06-02-295': 'Moss Tine',
  '2026-06-02-296': 'Loam Helm',
  '2026-06-02-297': 'Quartz Coil',
  '2026-06-02-298': 'Cobalt Drift',
  '2026-06-02-299': 'Nickel Tine',
  '2026-06-02-300': 'Zinc Anvil',
  '2026-06-03-301': 'Tungsten Spire',
  // Isolated arbiters-line test build — NOT a production OTA. Fresh-minted
  // pair (the reserved metallic-noun pool was exhausted at Tungsten Spire).
  // Sits on the dead 'arbiters-line' channel; never published OTA-side.
  '2026-06-03-arb1': 'Flint Coil',
  // First real OTA on the arbiters-line channel (tutorial keyboard +
  // name-prompt copy). The test line keeps the '<noun> Coil' suffix so
  // these read as the arbiters-line lineage at a glance: Flint Coil →
  // Cinder Coil → …
  '2026-06-03-arb2': 'Cinder Coil',
  // Tutorial picker-confusion fix + Arbiter pacing acks + LOOK highlight.
  '2026-06-03-arb3': 'Slag Coil',
  // Door-open branch: explore-vs-leave choice popup replaces the old
  // look/go-north/read-note beats; 'leave outpost' advances the tutorial.
  '2026-06-03-arb4': 'Forge Coil',
  // Travel-row "continue" wording → "tap → CITY"; arbiter queue capped
  // (no more cut-off lines); em/en dashes spoken as comma pauses.
  '2026-06-03-arb5': 'Quench Coil',
  // Keyboard hygiene: no auto-pop (only on tap), Enter dismisses, modals
  // keyboard-avoided so the text box rides above the keyboard.
  '2026-06-03-arb6': 'Anvil Coil',
  // Kokoro prosody: bundle short sentences before inference, trim
  // head/tail silence, bundle streamed narration (fast first sentence).
  '2026-06-03-arb7': 'Bellows Coil',
  // Kokoro crossfade: adjacent ready chunks concatenated into one
  // waveform with an equal-power crossfade at each join.
  '2026-06-03-arb8': 'Temper Coil',
  // Model-loading banner reworded + recolored amber/orange so it reads as
  // a calm "this is normal" notice rather than a red error alert.
  '2026-06-03-arb9': 'Kindle Coil',
  // Loading banner shows real per-engine download % (Qwen + Kokoro),
  // "finishing…" for the no-progress compile step, "initial install is
  // longest" copy; Kokoro %-gate lowered 4s→2s for a truer ramp.
  '2026-06-03-arb10': 'Glow Coil',
  // Kokoro robustness: normalize native audio to a real Float32Array so the
  // trim/crossfade post-processing can't throw "undefined is not a function";
  // error status now names the failing step ([warmup]/[speak]).
  '2026-06-03-arb11': 'Spark Coil',
  // Tutorial: name prompt is the first Arbiter line (danger/ask/hub hints
  // suppressed during tutorial); em-dashes removed from spoken tutorial +
  // entry lines; cleanForSpeech also converts spaced hyphens to commas.
  '2026-06-03-arb12': 'Flare Coil',
  // Voice latency: ship first sentence as a small chunk (fast start),
  // crossfade only within a line; tutorial action buttons go amber once
  // their item is taken (green only for the current beat's action).
  '2026-06-03-arb13': 'Surge Coil',
};

// OTA-274 — separate codename pool for native AAB builds. The OTA
// codename above tells the dev which JS bundle is running; this map
// tells the dev which native APK binary is installed. They drift
// out of sync naturally — an OTA bundle is one beat (Pewter Vault,
// Bronze Mantle, etc.), an AAB is a bigger event that may persist
// across dozens of OTAs.
//
// Keyed by Android `versionCode`, which the workflow stamps from
// GitHub Actions `run_number` at build time. Add a new entry here
// every time an AAB is uploaded to Play Console internal testing
// AND `MINIMUM_RECOMMENDED_APK_BUILD` is bumped to match. The
// banner + About screen pull the codename for the build number
// they see in `Application.nativeBuildVersion`.
const APK_CODENAMES: Record<number, string> = {
  263: 'Slate Keep',
  // OTA-297 — Stone Castle AAB shipped; versionCode = GitHub Actions
  // run_number for that build (pending follow-up).
  // OTA-298 — Granite Hold AAB layered on top of Stone Castle with
  // the JSON lazy-load pass. versionCode same TBD pattern. Both AAB
  // codename entries get filled in via a small follow-up OTA once
  // the actual run_numbers land — for now the About screen shows
  // "(build N)" fallback for both, but the lookup table is ready.
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

/**
 * Codename for the given AAB versionCode. Returns "(build N)" wrapped
 * in parens if the build number isn't in the map — pre-Slate-Keep
 * AABs that predate this codename layer fall back to the raw number.
 */
export function getApkCodename(versionCode: number | string | null | undefined): string {
  const n = typeof versionCode === 'string' ? parseInt(versionCode, 10) : versionCode;
  if (n == null || Number.isNaN(n)) return '(unknown build)';
  return APK_CODENAMES[n] ?? `(build ${n})`;
}

/**
 * Same as getApkCodename but returns null if the build is unmapped.
 */
export function getApkCodenameOrNull(versionCode: number | string | null | undefined): string | null {
  const n = typeof versionCode === 'string' ? parseInt(versionCode, 10) : versionCode;
  if (n == null || Number.isNaN(n)) return null;
  return APK_CODENAMES[n] ?? null;
}
