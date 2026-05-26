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
//
// 2026-05-26 OTA-059 — Crafting screen 3-tab restructure.
//   (1) CRAFT tab now shows EVERY non-consumable blueprint
//       (weapons / armor / relics / gear). Craftable rows are
//       highlighted with the green stripe and sorted to the top;
//       non-craftable rows show what's missing. Pre-OTA only
//       available + "almost (top 8)" rendered — the rest of the
//       book was invisible.
//   (2) REPAIR tab unchanged (already shows everything that needs
//       mending, highlights when repairable).
//   (3) NEW RECIPES tab (3rd tab) shows only consumable blueprints
//       (stews / tinctures / draughts / brews / tonics). Moved from
//       InventoryScreen so all crafting lives under one screen.
//   (4) InventoryScreen → single ITEMS view. RECIPES tab removed.
//
// 2026-05-26 OTA-060 — Arbiter false-positive on legit scene nouns.
// Playtester climbed a "jagged dormant architectural sentinel"
// (4-word flavor-prefixed noun) and got the Arbiter saying "I'm
// not sure what you're trying to tell me" right after a successful
// climb. Two compounding bugs:
//   (1) 'climb' missing from ARBITER_ENGAGED_INTENTS so post-action
//       the on-target defer branch fired with the climbed noun.
//       Added climb, search, drop, scrap, talk, advance, retreat,
//       unequip — every clearly-engaged action verb.
//   (2) The garbage-noun heuristic in narrativeGenerator flagged
//       any noun > 3 words as junk, but salvage/climb-eligible
//       scene nouns routinely run 4-5 words. Bumped to > 6 words
//       and > 60 chars so flavor-prefixed parser-resolved nouns
//       survive while actual player rants are still caught.
//
// 2026-05-26 OTA-061 — `investigate path` path-narration fixes.
// Playtester ran `investigate path` 7 times in 16 seconds and got
// 7 different far-off random destinations, plus a leaked raw enum:
//   "The Arbiter notes a lost_capital toward Drakova"
// Two bugs in narratePossibleDirections:
//   (1) `location.type` (an enum like 'lost_capital') went through
//       .toLowerCase() but underscores stayed. Now humanized:
//       underscores collapse to spaces.
//   (2) Each call did `pick(others)` against all world locations,
//       producing fresh random pairs on every re-investigate. Now
//       seeded by `${scene.location.id}:${mapX}:${mapY}` via FNV-1a
//       so re-investigating the same noun on the same tile gives
//       the SAME answer — the Arbiter "remembers" what they told
//       you here. Moving to a new tile re-seeds. Dropped the
//       chance(60) on the second fragment so the output is always
//       a consistent two-destination read (when ≥2 world tiles
//       are discoverable).
export const OTA_BUILD_ID = '2026-05-26-061';
