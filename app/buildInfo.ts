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
//
// 2026-05-26 OTA-062 — `investigate path` now greys its chip + lets
// the Investigate tab cycle back to amber. OTA-061 stabilized the
// destination text but `narratePossibleDirections` still wrote only
// to the log and never touched room memory, so the path chip stayed
// green forever and the Investigate tab never returned to amber on
// a tile where every other ambient noun had been investigated.
// Playtester log: 7 successive `investigate path` taps on the same
// tile, all green-state, all returning the same stable line.
// Fix marks 'path' as flavor-exhausted in the current room's
// flavorExhaustedNouns list — same pattern the generic flavor-only
// investigate uses at gameStore.ts:4369. Chip greys after one tap;
// further taps still produce the same (stable) direction line if
// the player re-types `investigate path` directly.
//
// 2026-05-26 OTA-063 — Bug-report flow + enriched About header.
//   (1) New REPORT BUG button on the TitleScreen bottom bar (next
//       to EXIT GAME). Opens BugReportModal: pick character (or
//       "General — no character"), type a description, tap SEND.
//   (2) Send action builds a full bug report (description + device
//       summary + character log), stages the entire thing on the
//       clipboard, and opens
//         mailto:hotatticgames@gmail.com?subject=Bug%20Report...
//       The clipboard staging is the workaround for the mailto
//       body-length cap (~2KB iOS Mail, varies Android Gmail) —
//       character logs run 50-200KB and would silently truncate
//       inline. Player pastes the report into the composer
//       before sending. Same pattern as the existing dead-log
//       clipboard copy on the title screen.
//   (3) Enriched About / Voice diagnostic headers via the new
//       buildBasicDeviceSummary() helper in
//       app/diagnostics/aboutSummary.ts. Adds device name (where
//       exposed), locale, timezone, screen dimensions, density,
//       Hermes flag, and capture timestamp alongside the existing
//       app version / APK build / OTA build ID. Same string
//       feeds the bug-report email body so triage from a report
//       starts with identical identifying info to what the
//       player sees in About.
//
// 2026-05-26 OTA-064 — Bug-report log truncation + clearer paste
// instructions. Playtester filed an OTA-063 bug report and Gmail
// silently truncated the paste; the entries the player actually
// wanted to flag (the most recent ones) were the ones dropped.
//   (1) The log section in the clipboard report is now REVERSED
//       (newest entry at top) and capped at 40_000 chars so the
//       whole report fits in a single Gmail compose paste. Older
//       entries are intentionally trimmed — bug reports get
//       filed seconds after the issue, so the newest tail is the
//       relevant evidence. Header line in the report announces
//       the order ("Newest entry at top — X of Y entries").
//   (2) Mailto body rewritten as a structured READ ME FIRST with
//       a numbered paste sequence and an explicit "PASTE BELOW
//       THIS LINE" marker. Old wording was a one-line
//       parenthetical that at least one tester missed entirely
//       and sent the email with no paste.
//   (3) BugReportModal helper text updated to match: "your
//       description, device info, and the most recent log
//       entries (newest first) will be copied" — sets the
//       expectation that the log is trimmed-newest, not full.
//
// 2026-05-26 OTA-065 — INVITE PLAYTESTER button on the
// TitleScreen bottom bar, next to REPORT BUG and EXIT GAME.
//   (1) New InvitePlaytesterModal collects a friend's Gmail
//       address with @gmail.com validation (allows dots / plus-
//       tags / digits in the local part per Gmail's own rules).
//       Submit opens mailto:hotatticgames@gmail.com with
//       subject "New Playtester" and a body containing the
//       suggested address + requester's OTA build + ISO
//       timestamp for whitelisting context.
//   (2) Bottom bar restructured: footer-text left, action-
//       button row right (INVITE / REPORT BUG / EXIT GAME).
//       Three tones — cool-blue INVITE, amber REPORT BUG, red
//       EXIT GAME — keep the buttons glanceable. Per-button
//       paddingHorizontal lowered from 12 to 10 so all three
//       fit on a 360dp Android screen with the footer text.
//   (3) Owner workflow: read the email at hotatticgames@gmail
//       .com, whitelist the address in the EAS / playtester
//       tooling, and reply directly to the requester with the
//       install link. Advertised as up-to-24-hours, usually
//       within the hour.
//
// 2026-05-26 OTA-066 — INVITE button label spelled out as
// "INVITE PLAYTESTER" per playtester request ("have it say
// both words"). Forced a bottom-bar restructure: the action
// row + footer no longer fit on a single 360dp row (~388dp
// content). bottomBar is now flexDirection: column with the
// action button row on top (right-aligned via flex-end) and
// the footer text below. Visual hierarchy is the same — three
// peripheral actions in a row, version diag underneath.
//
// 2026-05-26 OTA-067 — dev cheat for the project owner. If a
// fallen character is named "Verbal" (case-insensitive,
// trimmed), handlePlayerDeath grants a Resurrection Gem on
// death via the standard addResurrectionGems(+1) path. The
// player still dies and gets routed back to the title screen
// as normal — they just immediately have a gem to revive that
// character with. No effect for any other character name;
// everyone else dies on the regular drop rules (boss / pity
// timer / 0.5% rare). Loud reward-channel log line confirms
// the grant in the session log.
//
// 2026-05-26 OTA-068 — Title-screen bottom-bar polish.
//   (1) Three action buttons (INVITE PLAYTESTER, REPORT BUG,
//       EXIT GAME) are now CENTERED in their row (was flex-end
//       / right-aligned in OTA-065) with an 8dp gap between
//       them. Reads as a balanced cluster.
//   (2) Version footer ("v2.4.1 / 2148") is now CENTERED on
//       its own line (was left-aligned with a small marginLeft
//       since OTA-065).
//   (3) NEW playtester thank-you line above the action row:
//       "Thank you for helping us test our new game, enjoy
//       Tartaria!" in italic muted-amber (#8a7d5c). Sized
//       between the bright action button text and the deep
//       muted footer so it reads as warm-but-secondary.
//
// 2026-05-26 OTA-069 — INVESTIGATE tab tone now excludes
// Aether-scanner-gated chips from the actionable count.
// Playtester screenshot: only an Aether-locked "crystal" chip
// remained in scene (every other ambient noun was investigated
// /  taken / scrap'd), no scanner equipped, but the INVESTIGATE
// button was still green-tinted as if there was something to
// do. A scanner-gated chip with no scanner isn't actionable —
// the SearchModal greys it and labels it "requires Aetheric
// scanner". investigateCount in ExplorationScreen now applies
// the same searchRequirementFor + playerHasScannerEquipped
// check the SearchModal already uses, so the tab tint matches
// the modal state.
//
// 2026-05-26 OTA-070 — chip consumed-check now uses substring-
// fuzzy matching, mirroring the engine's alreadySearched logic
// at gameStore.ts:4189. Pre-OTA the chip greyed via exact match
// (Set.has(chipLower)) but the engine refuses via fuzzy match
//   n === chipLower || chipLower.includes(n) || n.includes(chipLower)
// — so any variant phrasing in memory (e.g., 'wooden bench' for
// a chip 'bench') made the engine refuse 'investigate bench'
// with "Nothing more to find" WITHOUT writing 'bench' to memory.
// The chip's exact match then never saw 'bench', stayed green
// forever, and the player tapped the dead chip indefinitely.
// Playtester filed it as: "I investigated that item multiple
// times and it's still there." Now a chip the engine would
// refuse is greyed in the modal AND excluded from the
// INVESTIGATE tab tone count, identical to engine state. New
// helper isFuzzyConsumed encapsulates the fuzzy match and is
// applied in three places: productively-consumed filter, flavor-
// exhausted grey flag, and investigateCount predicate. Skips
// empty-string pool entries (which would otherwise trivially
// match any chip via "".includes('')) — matches the engine's
// nonClimbMarkers filter that strips empty + climbed: markers
// before the same .some() check.
//
// Surgical fix only; a follow-on OTA series is planned to
// introduce a per-room investigation table that gives every
// scene noun persistent attributes (lore / item / hook) at
// generation time, so investigates never bottom out at
// "Nothing more to find" — the user's bigger architectural
// suggestion. This OTA is the immediate UI-engine alignment.
//
// 2026-05-26 OTA-071 — Per-room investigation table
// (foundational OTA, 1/5 in the noun-table series). Every
// ambient noun added to a scene at generation time now seeds
// an entry in worldMemory.visitedRooms[roomKey].roomInvestiga
// tionTable. Schema: { noun, category, generatedAt, loreLine,
// yield, hookKind, consumed, consumedAt, result }. Categorizer
// keyword-matches the noun against 5 templates (furniture,
// shelf, machinery, vessel, debris) + a generic fallback.
// Each template has a curated fallback lore string used as
// the first-investigate outcome. Yield data is held but NOT
// rolled this OTA — OTA-073 activates yield mechanics.
//
// Engine integration: investigate handler consults the table
// BEFORE the existing alreadySearched / requirement / catalog
// branches. First investigate prints the entry's lore line +
// marks consumed + writes flavorExhausted (so OTA-070's fuzzy
// UI check greys the chip). Repeat investigate prints the
// SPECIFIC callback line ("...keeps its lore but offers
// nothing new") instead of the pre-table generic "Nothing
// more to find" refusal.
//
// Pinned ground/floor/mud nouns are intentionally excluded
// from the table — the existing dig-here path owns those.
// Re-entered rooms preserve their table + consumed flags
// (idempotent seed). Legacy saves without a table fall
// through to existing logic, no breaks.
//
// Files: NEW app/engine/investigationTable.ts (~190 lines —
// pure module, no React/zustand). app/engine/types.ts —
// VisitedRoom.roomInvestigationTable field added.
// app/state/gameStore.ts — beginScene seeds the table after
// scene commit; investigate case consults it before existing
// dedup paths.
//
// Next: OTA-072 adds lazy Qwen lore generation with curated
// fallback, OTA-073 activates yield mechanics + hook seeding,
// OTA-074 polishes callback narration per result.kind,
// OTA-075 wires hooks to reference past investigations.
//
// 2026-05-26 OTA-072 — Lazy Qwen lore generation for the
// investigation table (2/5 in the series). First investigates
// of a table noun now route through Qwen2.5-0.5B for a
// generated atmospheric sentence; falls back to the curated
// template lore when Qwen isn't ready or times out (2.5s
// cap). The generated lore is cached into entry.loreLine on
// the room state so future callbacks reference the Qwen-
// enriched version.
//
// Implementation: new generateLoreAsync helper in investi-
// gationTable.ts takes a LoreGenerator function (chat
// messages → string Promise) so the pure module stays decoupled
// from the QwenGenerativeEngine class. The engine integration
// in gameStore.ts wraps qwen.generate in a closure when
// qwen.isReady(), passes null otherwise.
//
// Lore prompt: short system message instructs Qwen to act as
// the Arbiter narrator, produce ONE atmospheric sentence about
// the scene object, max 30 words, no second-person ("you"),
// no setup phrases. User message includes the noun, category,
// and current location name. Output is trimmed (strip quotes,
// sentence-boundary cut past 60 chars, hard cap at 240 chars)
// before logging.
//
// UX: player taps INVESTIGATE → modal closes → 50-300ms gap
// (Qwen inference latency) → lore line appears. Without Qwen
// the curated template fires immediately. The async work runs
// inside an IIFE so the surrounding switch stays synchronous —
// no breaking changes to the rest of the intent dispatch.
//
// Files: app/engine/investigationTable.ts (LoreGenerator
// type + generateLoreAsync + buildLorePrompt + trimLore),
// app/state/gameStore.ts (investigate case body refactored
// to await Qwen lore inside an IIFE before logging +
// committing consumed state).
//
// 2026-05-26 OTA-073 — Template expansion + yield mechanics
// (3/5 in the series).
//   (1) NounCategory grew from 5 to 15: added door, corpse,
//       statue, altar, vegetation, bone, light, container,
//       text, stone. Each has a curated fallback lore line +
//       most have a small-chance item yield from the existing
//       scrap/material catalog (Bent Nail, Bone Sliver, Stick,
//       Worn Tartarian Coin, Smooth Stone, Small Rock, Fire-
//       wood, etc.) so grantItem accepts the yield cleanly.
//       Text + container yield null intentionally — text is
//       lore-only; containers go through the existing open
//       /disarm verb path.
//   (2) KEYWORD_MAP reordered so more specific categories
//       fire BEFORE the OTA-071 originals where keywords
//       overlap (altar before furniture, bone before shelf).
//   (3) rollOutcome's yield-roll path activated: when
//       entry.yield exists AND rand() < chance, returns
//       kind='item' with the item name + a "Tucked into the
//       seam: a [item]" line that flows naturally after the
//       lore.
//   (4) Engine first-investigate IIFE: when outcome.kind ==
//       'item', looks up catalog via findCatalogItem and
//       grants through the standard grantItem inventory
//       pipeline + emits a reward-channel log line. Silent
//       skip if the named item isn't in the catalog so a
//       future template typo can't crash the flow.
//
// Files: app/engine/investigationTable.ts (NounCategory +
// KEYWORD_MAP + TEMPLATES expansions, rollOutcome yield path),
// app/state/gameStore.ts (item-grant branch in the IIFE).
//
// 2026-05-26 OTA-074 — Callback narration polish + chip-state
// alignment (4/5 in the series).
//   (1) callbackLine now picks from variant pools per result
//       kind (item / flavor / hook / default), 3-5 templates
//       each, via rotatingPick so consecutive callbacks on
//       different consumed nouns don't read identical. Item
//       callbacks reference the actual item by name; flavor
//       callbacks reference the noun naturally; hook callbacks
//       acknowledge the lead the player already pulled.
//   (2) Engine first-investigate write site now branches on
//       outcome.kind: 'item' outcomes write to
//       searchedAmbientNouns (chip filtered out entirely —
//       matches the existing "produced an item" convention);
//       'flavor' outcomes write to flavorExhaustedNouns (chip
//       stays visible greyed). Both lists honor OTA-070's
//       fuzzy UI check so engine + UI state stay aligned.
//
// Files: app/engine/investigationTable.ts (CALLBACK_*_LINES
// pools + pickCallback helper + callbackLine refactor),
// app/state/gameStore.ts (write-site branch on outcome.kind).
//
// 2026-05-26 OTA-075 — Cross-room investigation echo hooks
// (5/5 — final in the series). When the player enters a new
// scene with no chain hook pending and no enemies, 15% chance
// to plant a hook that references a past investigation from a
// DIFFERENT room — "you think back to the bench from earlier
// — the cushion scraps you pulled from it. Something here
// reminds you of it." Makes discoveries feel connected across
// the world instead of evaporating after the room exits.
//
// findReferenceableInvestigation scans worldMemory.visited
// Rooms, skips the current room, filters to consumed entries
// with kind='item' or kind='hook' (flavor-only investigates
// would produce a weak echo, skipped), sorts by consumedAt
// descending so recent investigations echo first. Returns
// null when no eligible entry exists, leaving the existing
// hook-plant logic untouched. buildEchoHookLine generates a
// kind-specific plantedLine (item-named for kind='item',
// thread-acknowledging for kind='hook').
//
// Integration in beginScene: after the chain-hook check at
// line ~2104, if initialHooks.length === 0 (no chain owned
// the slot) AND no enemies AND the probability roll succeeds,
// plant the echo as a synthetic 'thread'-kind Hook. The
// existing hook stage/resolve machinery handles it from
// there — no new pipelines.
//
// Files: app/engine/investigationTable.ts (findReferenceable
// Investigation + buildEchoHookLine + ScanRoomShape duck-
// typed interface to avoid the circular import with engine
// /types.ts), app/state/gameStore.ts (echo hook plant block
// in beginScene right after the chain-hook injection).
//
// This concludes the OTA-071→075 investigation-table series.
// The full architecture: every ambient noun seeded as a
// persistent entry at scene generation, Qwen-augmented lore
// on first investigate, curated yields with the existing
// catalog, per-kind callback variants on repeat, cross-room
// echoes on new scenes. Five OTAs, each shippable and
// reversible; the player gets a richer, more connected
// investigation loop than the pre-OTA-071 "Nothing more to
// find" generic refusal.
//
// 2026-05-27 OTA-076 — Salvage chip + legacy room self-heal.
// Playtester report: tapped SALVAGE bench after the OTA-075
// upgrade, engine refused with the OLD "you've already worked
// over the bench here. Nothing more to find." line and the
// chip stayed green forever. Two root causes:
//
//   (1) The bench's room was visited BEFORE OTA-071 shipped,
//       so beginScene's table-seed never fired for it (the
//       player was still inside the room when the OTA landed
//       and didn't re-enter). The investigate handler's table
//       consult found no entry, fell through to the legacy
//       alreadySearched branch, hit the bench's pre-existing
//       searched/flavor memory entry, and printed the old
//       refusal — bypassing every OTA-071→075 improvement.
//       Fix: opportunistic table seed in the investigate
//       handler. When tableRoom exists but
//       roomInvestigationTable is missing, seed it inline
//       from currentScene.ambientNouns before the entry
//       lookup. Covers pre-OTA-071 saves and any future
//       regression that misses a seed call. Idempotent —
//       won't reseed if a table is already present.
//
//   (2) The salvage chip's consumed-flag (in SalvageModal
//       + salvageableCount) read isAmbientConsumed which
//       used exact .has on consumedAmbientNouns. Same OTA-070
//       eternal-green bug as the investigate chip — variant
//       phrasings in memory ("wooden bench") never matched
//       the chip noun ("bench") so the chip stayed green
//       even when the engine refused via fuzzy match.
//       Fix: isAmbientConsumed now leads with isFuzzyConsumed
//       (the OTA-070 helper) instead of exact .has. Self-heal
//       (only treat as consumed when the catalog item is in
//       inventory) stays intact. Take + ground chip
//       consultations share the helper and pick up the fix
//       for free.
//
// Files: app/state/gameStore.ts (opportunistic table seed in
// the investigate case before the table-entry lookup),
// app/screens/ExplorationScreen.tsx (isAmbientConsumed swap
// exact .has → isFuzzyConsumed).
//
// 2026-05-27 OTA-077 — Sync chip-consume + keyword coverage
// expansion + noun-aware generic lore. Three bugs from the
// playtest log all rooted in the OTA-072 async-IIFE pattern
// and the overly-broad generic category:
//
//   (1) "Multiple taps to get rid of a chip." OTA-072 ran the
//       entire outcome (lore, log, set-consumed) inside an
//       async IIFE awaiting Qwen lore. Chip stayed green for
//       the 50-2500ms Qwen latency window; players tapped
//       repeatedly trying to make the still-green chip
//       respond, spawning duplicate IIFEs that interleaved
//       their log lines. Fix: split the work. SYNC =
//       rollOutcome + log curated lore + grant item + mark
//       consumed + write dedup list (chip greys IMMEDIATELY).
//       ASYNC = fetch Qwen lore + patch entry.result.line for
//       future callback / echo reference. Visible log line for
//       THIS investigate stays curated — replacing logged
//       entries after the fact is jarring; the Qwen upgrade
//       lands on the next repeat tap's callback or the next
//       room entry's echo hook.
//
//   (2) Generic catchall too broad. Playtest log showed spool
//       / runecaster / chalkboard all falling through to the
//       generic template ("You look it over. Nothing about it
//       sings..."). Fix: KEYWORD_MAP expansions — machinery
//       gets spool / reel / bobbin / coil / gear / cog /
//       sprocket / lever / pipe / cable / wire / runecaster /
//       capacitor / dial / gauge; text gets chalkboard /
//       blackboard / slate / ledger / journal / writ / map /
//       note. Coverage now catches the playtest's specific
//       nouns.
//
//   (3) Identical generic lines hid which noun was resolving.
//       Pre-OTA-077, two investigates in quick succession
//       (spool + runecaster) both fell through to the generic
//       template and printed identical "You look it over"
//       lines, indistinguishable in the log when one IIFE
//       landed late. Fix: noun-aware template substitution.
//       Templates can include {noun} as a placeholder which
//       resolveLore substitutes with entry.noun. Generic
//       template now reads "You look the {noun} over..." so
//       two investigates produce two readable lines.
//
// Files: app/state/gameStore.ts (investigate case first-time
// path refactored from full-IIFE to SYNC log/grant/consume +
// ASYNC Qwen-patch IIFE), app/engine/investigationTable.ts
// (KEYWORD_MAP machinery + text expansions, generic template
// noun-aware, resolveLore performs {noun} substitution).
export const OTA_BUILD_ID = '2026-05-27-077';
