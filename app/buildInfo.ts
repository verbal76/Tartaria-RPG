// OTA verification marker. Bumped manually on each JS-only push so the
// About screen can prove the OTA actually reached the device.
//
// Compare the value shown in About → "OTA build" against the latest
// bump in this file. If they match, the OTA pipeline delivered.
//
// Format: YYYY-MM-DD-NNN where NNN is a per-day counter.
//
// 2026-05-25 OTA-020 — diagnostic re-publish to flush the preview
// channel. User reports their device stuck on OTA-010 despite the
// "Last OTA applied: Yes" flag. The flag is binary-historical and
// only confirms ANY OTA was applied (010 at 07:45), not the latest.
// If this publish succeeds end-to-end (workflow green in GH Actions)
// and the device still shows 010 after cold-start, it's a fetch-
// cadence issue, not a publish issue.
//
// 2026-05-26 OTA-057 — stat-training exploit mitigation.
//   (1) Tile-novelty gate: cardinal-step WIS / STR-passive / CHA-
//       passive training only fires when the destination tile is
//       NOT in player.recentTileHistory (sliding 20-tile window).
//       Kills pacing-between-two-screens WIS farming; long
//       exploration still trains.
//   (2) WIS/CHA conceptual split: removed the WIS double-train on
//       the 7 active social verbs (buy / sell / gift / accept-
//       hunt / accept-mystery / accept-storyline / accept-faction-
//       quest). CHA = active push, WIS = passive perception /
//       outcome. WIS still trains on completion turn-ins, hearing
//       whispers, novel travel, resting after combat.
//   (3) SKILL_ACTIVITIES display map updated to reflect the split.
//
// 2026-05-26 OTA-058 — scrap UX repairs (playtester report).
//   (1) MIN-YIELD on failed scrap. Pre-OTA, a failed scrap roll
//       consumed the item and yielded nothing — anti-spam by design
//       but read as "wasted click." Failure now grants 1 unit of
//       the first material from scrapOutputFor() as consolation.
//       Anti-spam intent stays (the item is still consumed).
//   (2) AUTO-UNEQUIP on scrap. Pre-OTA, scrapping an equipped item
//       refused with "unequip first." A playtester hit this 3× on
//       an Aetheric Locket and reported it as "stayed in inventory,
//       yielded nothing." scrapInventoryItem now auto-unequips the
//       matching slot (by id, so duplicate-name items don't trigger
//       it) then runs the normal scrap flow.
export const OTA_BUILD_ID = '2026-05-26-058';
