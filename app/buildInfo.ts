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
//
// 2026-05-27 OTA-078 — Multi-agent audit fix pass 1: silent-
// fail eradication. Three parallel deep-audit agents found
// six bugs in the investigate/salvage/take chain. This OTA
// fixes the most critical four.
//
//   BUG 1 (CRITICAL) — Five OTA-071 yields named items not in
//   the catalog. Cushion Scraps / Paper Scraps / Machine Part
//   / Liquid Sample / Useful Scrap don't exist in app/data/
//   items/*.json. findCatalogItem returns null, grant silently
//   skips, but the curated lore line already printed "Tucked
//   into the seam: a cushion scraps" AND the entry was marked
//   consumed. Player saw the line, received nothing, lost the
//   chip. Worse: the next OTA-074 callback claimed "the cushion
//   scraps was the only thing of value" for an item that never
//   landed. Fix: remap to confirmed-in-catalog materials.
//     furniture  Cushion Scraps → Stick
//     shelf      Paper Scraps   → Worn Tartarian Coin
//     machinery  Machine Part   → Bent Nail
//     vessel     Liquid Sample  → Mud Fragment
//     debris     Useful Scrap   → Small Rock
//
//   BUG 2 — Investigate pack-full silent-fail. The OTA-077 SYNC
//   block logged baseOutcome.line FIRST (which already
//   contained "Tucked into the seam: a X") then tried grantItem
//   — if granted.accepted===0 (cap hit), no reward log fired,
//   no warning, entry still marked consumed with kind='item'.
//   Player read "tucked into the seam: a bone sliver", got
//   nothing, lost the chip, AND the next callback lied about
//   the take. Fix: attempt grant FIRST, downgrade outcome to
//   'flavor' on pack-full, log the right line, skip the dedup
//   write so the chip stays workable for retry.
//
//   BUG 3 — Salvage pack-full silent-fail. Same pattern as Bug
//   2 in the harvest branch at ~line 4181 AND salvageAllAmbient
//   at ~line 12132. produced=true was set even on pack-full
//   ("counts as produced" per the old comment), consumeNouns
//   was pushed, chip locked forever. Fix: don't mark produced/
//   push to consumed on pack-full; emit arbiter-channel
//   warning instead of the cryptic flavor "...but your pack is
//   already full of them" line.
//
//   BUG 4 — Take pack-full silent-fail. takeAmbientNoun at
//   ~line 1357 unconditionally marked consumed even when
//   accepted===0. Fix: early-return with arbiter warning when
//   grant fails; consume only on success.
//
//   BUG 5 (related, fixed here) — Qwen async patch comparison
//   was always false. generateLoreAsync returned the raw
//   template string with the literal '{noun}' placeholder when
//   Qwen was unavailable / timed out; the IIFE's skip check
//   compared against baseOutcome.line which was already
//   substituted. They never matched, the patch always ran, and
//   the cached loreLine got the raw {noun} text. Next callback
//   or echo hook rendered "{noun}" verbatim. Fix: substitute
//   the placeholder in the fallback return path before
//   returning.
//
// Outstanding (next OTAs):
//   - OTA-079 will sync salvage→table consumed flag so salvage
//     + investigate on the same noun stop double-dipping, and
//     move resolved-hook check before the table consult so
//     spire's 4th tap (post-hook-resolution) doesn't leak to
//     generic.
//   - OTA-080 will add hub-room-id to makeRoomKey (chandelier
//     study + armory share a key right now), expand KEYWORD_
//     MAP with ~18 missing nouns (spire/tower/dome/chandelier
//     /pillar/mosaic/etc.), introduce a 'landmark' category,
//     and add the CREEPY_VARIANTS lore pool from the audit.
//
// Files: app/engine/investigationTable.ts (yield remaps in 5
// TEMPLATES + generateLoreAsync placeholder substitution),
// app/state/gameStore.ts (investigate case first-time block
// refactored: grant-first, downgrade-on-fail, skip-consume-on-
// pack-full; harvest branch pack-full → arbiter warning +
// produced=false; salvageAllAmbient pack-full → narration +
// no consume push; takeAmbientNoun pack-full → early return +
// arbiter warning).
//
// 2026-05-27 OTA-079 — Multi-agent audit fix pass 2:
// salvage↔table sync + resolved-hook short-circuit.
//
//   BUG (audit Agent 2 Finding 3, CRITICAL) — Salvage routes
//   through 'intent=investigate' but lands in its own harvest
//   branch (~gameStore.ts:4078) BEFORE the OTA-071 table
//   consult (~4316). The harvest branch wrote ONLY to
//   searchedAmbientNouns and never touched roomInvestigation
//   Table[noun].consumed. Result: salvage bench → searched.
//   Then investigate bench → table consult finds entry un-
//   consumed → runs FRESH rollOutcome with lore + possible
//   second item grant → only THEN marks consumed. Player
//   double-dipped: salvage gave the curated salvage outcome,
//   investigate then gave a SECOND beat AND possibly a SECOND
//   yield. Same bug in salvageAllAmbient at ~12206. Fix: when
//   salvage produces (produced=true), also patch
//   roomInvestigationTable[noun].consumed=true with a
//   synthetic kind='item' result so the OTA-074 callbackLine
//   picks an item-class line on the next investigate tap.
//   Idempotent if the table is missing or the entry already
//   consumed. Mirrored in salvageAllAmbient's batched commit.
//
//   BUG (audit Agent 1 Bug 4) — Resolved-hook nouns leaked to
//   the table's generic fallback. Multi-stage hooks (half_
//   buried_spire / preserved_corpse / etc.) keep
//   resolved=true after the chain completes, and their
//   revealed nouns ('spire', 'reclaimer', ...) stay in
//   scene.ambientNouns. The route-level hook intercept only
//   fires for !hook.resolved, so a re-tap leaked into the
//   table consult — which had a 'generic' entry for the
//   noun and printed "You look the spire over. Nothing about
//   it sings..." for a noun the player had just pulled a
//   Rusted Band of Knowledge from. Fix: before the table
//   consult, scan scene.hooks for a resolved hook whose
//   nouns include the matched ambient (fuzzy substring,
//   matching OTA-070's UI dedup); if found, print "You've
//   already followed the thread of the X" and break. Closes
//   the narrative arc instead of leaking to a generic
//   fallback.
//
// Files: app/state/gameStore.ts (harvest branch produced-set
// also patches roomInvestigationTable.consumed; salvageAll
// Ambient batched set patches every consumed noun's table
// entry; investigate case adds resolvedHookMatch check
// before the table consult).
//
// 2026-05-27 OTA-080 — Multi-agent audit fix pass 3: keyword
// coverage expansion + new landmark category + creepy
// variant pool. Frees the spire / tower / pillar / mosaic /
// chandelier / etc. nouns from the generic catchall and adds
// the uncanny lore variants the user asked for.
//
//   KEYWORD_MAP expansions (~18 new nouns mapped):
//     light       += chandelier
//     text        += mosaic, tapestry, tome, parchment, fresco
//     stone       += plinth, sarcophagus, tile
//     furniture   += throne, counter, lectern
//     machinery   += anvil, forge, loom, instrument, fuel-cell
//     vessel      += fountain, bottle, glass, dish
//     debris      += plank, board, catwalk
//
//   NEW 'landmark' category — scene anchors that previously
//   leaked to generic. Keywords: spire, tower, dome, cupola,
//   steeple, minaret, pillar, column, obelisk, pylon,
//   standing-stone. Template fallbackLore: "The {noun} rises
//   out of the silt like a memory the world refuses to bury
//   ... names, prayers, accounts no one closed." Yield:
//   Aether Residue (in catalog) at chance 0.10. From the
//   playtest, this fixes the "tilting obsidian pillar" and
//   "spire" generic-fallback leaks.
//
//   CREEPY_VARIANTS pool — per user: "creepy statements
//   marked on them or something just isnt right about it".
//   14 uncanny-tone variants across 13 categories. Quiet,
//   specific, off-putting (not horror): "ANNA" carved over
//   and over on a chalkboard with no chalk in the room, a
//   tooth too large to be a child's in clear warm liquid, a
//   chair dragged to face a wall by someone who wanted to
//   sit very still, a statue's eyes refilled with wet clay.
//   resolveLore now branches on a deterministic per-noun
//   hash at CREEPY_RATE = 0.17, so the same bench in the
//   same room resolves to the same line within a session —
//   not a re-roll each render. Player sees ~1 uncanny line
//   every 5-6 scenes. Frequent enough to color the world,
//   rare enough to stay unsettling.
//
// Outstanding (deferred):
//   OTA-081 will add hubRoomId to makeRoomKey so hub-interior
//   rooms (chandelier study + armory + atlas hall) stop
//   sharing the same table seed. Touches ~20 call sites and
//   warrants its own bounded OTA.
//
// Files: app/engine/investigationTable.ts (NounCategory +=
// 'landmark', KEYWORD_MAP gains ~18 nouns + the landmark
// regex, TEMPLATES gains a landmark entry, CREEPY_VARIANTS
// pool + nounSeed + pickCreepyVariant helpers, resolveLore
// now branches on the creepy roll before the standard
// fallback).
//
// 2026-05-27 OTA-081 — Enemy HP bar layout fix. Playtester
// reported the HP NUMBER ticking down correctly during
// combat ("HP 5/12" updates) while the visual bar stayed
// stuck at full width. Both values are derived from the same
// view.currentHp in the same EnemyCard render pass — the
// data was updating, the layout wasn't.
//
// Root cause: React Native's view diff sometimes refuses to
// emit a layout pass when only the percent string value of a
// View's `width` prop changes within the same View instance.
// The OTA 048 FlatList extraData fix correctly triggered
// re-renders, but the underlying View's width="47%" → "39%"
// → "31%" updates weren't always producing new layout
// frames. Numeric pixel widths always trigger fresh layout.
//
// Fix: switch hpBarFill from `width: '${hpPct * 100}%'` to a
// numeric width of `HP_BAR_WIDTH * hpPct` where HP_BAR_WIDTH
// is computed from CARD_WIDTH minus the card's padding (8 +
// 8) and border (1 + 1). The hpBarBg parent also gets an
// explicit numeric width so the child's pixel width has a
// stable reference frame.
//
// File: app/components/EnemyPanel.tsx (HP_BAR_WIDTH constant
// added near CARD_WIDTH, hpBarBg + hpBarFill both gain
// numeric width props).
//
// 2026-05-27 OTA-082 — Travel-stamina refusal now persistent +
// destination-specific. Playtester report: tapping a travel
// destination (e.g. Voronov) with 0 stamina "just fails
// through without instruction." The setTravelCourse gate at
// gameStore.ts:11050 WAS firing the arbiter refusal — but the
// arbiter channel has dedup logic (gameStore.ts:1868) that
// suppresses repeat lines. A player tapping the button
// multiple times saw the refusal once, then nothing. Debug
// log even confirmed it: `[debug] dedup: suppressed arbiter
// repeat`.
//
// Two fixes in one OTA:
//   (1) Add { skipDedup: true } to the refusal appendLog so
//       every tap shows it.
//   (2) Make the refusal travel-specific. Pre-OTA-082 the line
//       was "The Arbiter holds out a hand. 'You don't have
//       the legs in you for this just yet. Rest first; the
//       road keeps.'" — generic, didn't name what the player
//       tried. Now: "You're too tired to set out for
//       [Destination]. Rest before making any plans — the
//       road will hold." Destination resolved from locations.
//       json by the same id the setTravelCourse call already
//       has in scope. Fallback to "that destination" if the
//       lookup fails.
//
// File: app/state/gameStore.ts (setTravelCourse stamina gate
// gets skipDedup + destination-name interpolation).
//
// 2026-05-27 OTA-083 — Resolved-hook short-circuit now greys
// the chip. Same bug pattern as OTA-070/076: a code path
// refuses the action but never writes to the dedup list, so
// the UI chip stays green and the player taps it forever
// getting the same refusal. Playtester tapped a moss patch
// 8 times in a row before noticing nothing was changing —
// the moss patch was part of a resolved bioluminescent_path
// hook, so my OTA-079 resolvedHookMatch branch fired the
// callback line ("You've already followed the thread of
// the moss patch...") but never marked the noun in any
// dedup list. Fix: when the resolved-hook short-circuit
// fires, write the noun to searchedAmbientNouns so the
// OTA-070/076 fuzzy UI check filters the chip out of the
// SearchModal. Hook resolution counts as productive (the
// player already got the hook's reward), so searched (chip
// filtered) is the right list, not flavorExhausted (chip
// greyed visible). Idempotent — skips when the noun is
// already in the list.
//
// File: app/state/gameStore.ts (resolvedHookMatch branch
// now writes searchedAmbientNouns alongside the appendLog).
//
// 2026-05-27 OTA-084 — HARDENED REFUSAL HELPER. New store
// action `refuseAmbient` that atomically logs the refusal +
// writes the dedup mark. Any engine code path that prints
// "you've already worked this" / "already taken" / "already
// followed the thread" / etc. on an ambient noun MUST go
// through this helper. It is structurally impossible to log
// the refusal without writing to the dedup list — the helper
// does both every call.
//
// Why: pre-OTA-084 history shows a recurring bug pattern
// where a new engine branch prints the refusal but forgets
// the dedup write. The chip stays green. Player taps it 8+
// times getting the same line. Each time we shipped a one-
// off fix (OTA-070, OTA-076, OTA-083). The pattern resurfaces
// because there's nothing structural preventing a future
// refusal path from making the same mistake. This OTA
// removes the foot-gun: there's only ONE way to refuse an
// ambient noun now, and that way always writes the mark.
//
// Helper signature:
//
//   refuseAmbient({
//     noun: string,           // canonical ambient noun
//     line: string,           // the refusal text to log
//     kind: 'productive'      // chip filters out entirely
//          | 'flavor',        // chip stays visible, greyed
//     channel?: 'world'       // defaults to world
//             | 'arbiter',
//     skipDedup?: boolean,    // bypass arbiter-channel dedup
//                             // for player-action refusals
//   })
//
// 'productive' writes to searchedAmbientNouns; 'flavor'
// writes to flavorExhaustedNouns. Both lists are read by the
// OTA-070/076 fuzzy UI check so the chip state matches the
// engine state. Idempotent — skips the write when the noun
// is already in the target list.
//
// Refactored sites (more to follow in OTA-085+ as the
// pattern is rolled out):
//   - OTA-079 resolved-hook short-circuit (was already fixed
//     in OTA-083 with inline writes; now uses the helper for
//     consistency and to serve as the canonical example).
//
// Future-proofing: any new refusal branch added after this
// OTA is reviewed against the requirement "did you call
// refuseAmbient?" — the JSDoc on the interface declaration
// is the documentation, the helper itself is the
// enforcement.
//
// File: app/state/gameStore.ts (refuseAmbient added to the
// store interface + implementation; OTA-079 resolved-hook
// branch refactored to use it).
//
// 2026-05-27 OTA-085 — Climb modal cleared-chip is now non-
// tappable. Same recurring "chip looks dead but isn't"
// pattern from OTA-070/076/083/084, climb-modal edition.
// Pre-OTA-085 the cleared climb chip rendered greyed with
// ✓ TOP but the Pressable still responded to taps,
// submitting `climb <noun>` to the engine which refused with
// "You've already crested the X here." Playtester tapped a
// cleared spire 5 times in a row getting the same refusal.
//
// Fix: add `disabled={isCleared}` to the Pressable in
// ClimbModal.tsx, plus a guard on the pressed-style so the
// press-feedback doesn't fire either. The chip becomes
// structurally non-actionable — no engine round-trip needed,
// no refusal line at all. Visual ✓ TOP indicator stays so
// the player can still see "you've topped this".
//
// Note: OTA-084's refuseAmbient helper is for ambient-noun
// SearchModal chips that share the searchedAmbientNouns /
// flavorExhaustedNouns dedup lists. Climb chips have their
// own state model (climbed: namespaced markers + isCleared
// flag) so they get a parallel UI-side disable rather than
// routing through refuseAmbient. The pattern is the same
// even if the implementation differs.
//
// File: app/components/ClimbModal.tsx (Pressable gains
// disabled + pressed-style guard).
//
// 2026-05-27 OTA-086 — Climb cleared-state actual root cause:
// marker-key mismatch. OTA-085 made the cleared Pressable
// non-tappable, but the cleared flag itself was wrong because
// the engine and the modal disagreed about which noun key
// meant "this is climbed."
//
// Root cause: the climb handler at gameStore.ts:6983 writes
// markers as `climbed:${tgt.toLowerCase()}:t${currentTier}`,
// where tgt comes from climbTarget — which prefers match
// AmbientNoun's result but falls back to parsed.resolvedNoun
// when the matcher misses. The parser's resolver shortens
// "zharak's teeth spire" to "spire" (alias resolution),
// so when matchAmbientNoun can't find the FULL noun (apostrophe
// handling, etc.), the marker gets written under "spire" while
// the modal's chip text remains "zharak's teeth spire". maxClimbed
// Tier's exact `startsWith("climbed:" + chip + ":")` check missed
// the marker → isClimbCleared returned false → cleared boolean
// was false → OTA-085's `disabled={isCleared}` never engaged → chip
// stayed tappable → engine refused on tap (engine uses the same
// "spire" short form so it finds the marker just fine).
//
// Fix: fuzzy substring match in maxClimbedTier. For each
// `climbed:X:t<N>` marker, X matches the noun if X equals noun
// OR X is a substring of noun OR noun is a substring of X.
// Mirrors OTA-070's substring approach for the ambient-noun
// dedup lists. Multi-colon nouns parse defensively via slice.
//
// Tests: 5 new regressions added to __tests__/climbCleared.test.
// ts under "OTA-086 fuzzy marker-noun match" — including the
// exact playtest case ("zharak's teeth spire" + marker
// "climbed:spire:t4"). All 14 climbCleared tests pass.
//
// Net player experience after OTA-085 + OTA-086 together:
//   1. Climb the spire to tier 4/4. Markers `climbed:spire:t1
//      ...t4` written by the engine.
//   2. ClimbModal re-renders. isClimbCleared("zharak's teeth
//      spire", marks) now returns true via the fuzzy match.
//   3. Cleared flag → true → row styled greyed with ✓ TOP →
//      Pressable disabled (OTA-085) → no tap acknowledgement.
//   4. climbableCount filter excludes the cleared noun → main
//      CLIMB button on ExplorationScreen drops its 'ready' tone
//      → button unlit when no viable climbables remain.
//
// Files: app/engine/climbHeight.ts (maxClimbedTier rewritten
// for fuzzy match + multi-colon noun handling),
// __tests__/climbCleared.test.ts (5 OTA-086 regressions).
//
// 2026-05-27 OTA-087 — Search + sort bars on every list view.
// Inventory, Crafting → Craft tab, Crafting → Recipes tab,
// and Crafting → Repair tab all gain a SearchSortBar at the
// top with case-insensitive substring search on the item /
// recipe name plus category-relevant sort axes:
//
//   INVENTORY: name / rarity / kind / quantity
//   CRAFT:     ready (default) / name / rarity
//   RECIPES:   ready (default) / name / rarity
//   REPAIR:    available (default) / durability% / name / cost
//
// Tapping the active sort toggles direction (asc ↔ desc);
// tapping a different sort changes the key without resetting
// direction. Search has an inline × clear button when
// non-empty.
//
// Implementation: new shared SearchSortBar component (~165
// lines, controlled — parent owns state). InventoryScreen
// wires query+sort state and feeds the bar above the
// grouped category scroll. CraftingScreen keeps per-tab
// state so switching tabs doesn't clobber the user's filter.
// RecipesView accepts query+sortKey+sortDirection as
// optional props; pre-OTA-087 'ready' sort preserved as the
// default when no props are passed (legacy callers stay
// unchanged).
//
// State scope: ephemeral. Resets on screen remount. Future
// polish OTA could persist to AsyncStorage if requested.
//
// Files: app/components/SearchSortBar.tsx (already
// committed as the WIP in the prior commit; this OTA wires
// it in), app/screens/InventoryScreen.tsx (state +
// INV_SORT_OPTIONS + sortInventoryItems helper + bar render),
// app/screens/CraftingScreen.tsx (per-tab state + REPAIR_
// SORT_OPTIONS + RECIPE_SORT_OPTIONS + repairableView
// filter/sort memo + bar per tab), app/components/Recipes
// View.tsx (props extended with query / sortKey /
// sortDirection; filter + sort applied inside the
// evaluated useMemo).
//
// 2026-05-27 OTA-088 — Hook-progressed chips follow the
// narrative camera. Playtester noticed: tapped 'investigate
// fungus' and the bioluminescent_path hook narrated "The
// trail leads down through a slumped wall into a low chamber
// — a True Tartarian way-station..." They thought it was
// the duplication bug, but actually the engine had advanced
// the hook one stage and was waiting for the next tap to
// enter the chamber. The chip still read 'fungus' even
// though the player was now narratively standing in a
// chamber — the chip didn't follow the camera.
//
// Fix: resolveHookOneStep gains an optional triggerNoun
// param. When the caller threads in the noun the player
// actually tapped, after the stage advance fires we replace
// the trigger entry in scene.ambientNouns + display
// AmbientNouns with the first newly-revealed addNoun. So:
//   tap 1 on 'fungus' → chip becomes 'low chamber'
//   tap 2 on 'low chamber' → chip becomes whatever the
//     next stage reveals (or stays if terminal)
//
// Fuzzy match on the trigger so a player input of 'fungus'
// correctly maps to a scene noun of 'bioluminescent fungus'
// (same substring approach as OTA-070/086). The hook itself
// keeps its full noun list — including the original trigger
// — so any TEXT input on the old word still routes through
// the hook system. Only the visible chip pool is rotated.
//
// Wired into both resolveHookOneStep call sites:
//   - line 3557 (investigate / examine / look — passes
//     targetText)
//   - line 6633 (throw with hook match — passes tgt)
//
// No-op safeguards:
//   - When triggerNoun is omitted (no caller threading)
//   - When outcome.addNouns is empty (terminal hook stage)
//   - When the trigger wasn't in scene.ambientNouns
//     (player typed an inventory item, not a chip)
//
// File: app/state/gameStore.ts (resolveHookOneStep param
// extension + chip-replacement set() block; two call sites
// updated to thread the trigger).
//
// 2026-05-27 OTA-089 — Elevated overlay mini-areas. When the
// player crests a multi-tier climb (spire, tower, statue,
// etc.) there's now a 30% chance to enter an OVERLAY scene
// at the apex — a nook, vantage post, Aether collector,
// sealed door, roost, or open-sky vista. Each overlay has
// its own ambient nouns and (usually) an encounter. The
// player resolves whatever's up there and `climb down` from
// the overlay restores the original base scene DIRECTLY —
// no detour back to "the pillar" first.
//
// Architecture: new app/engine/elevatedOverlay.ts (pure
// module) holds OVERLAYS pool + rollElevatedOverlay (30%
// trigger) + rollOverlayEncounter (per-overlay enemy chance)
// + buildOverlayOverrides (constructs the swap-in scene).
//
// CurrentScene gains two new fields:
//   preservedSceneOnDescent — the scene the player was in
//     before climbing. climb-down restores this on overlay
//     exit.
//   elevatedOverlayMeta — { climbedNoun, climbedRoomKey,
//     maxTier, overlayId } so descent can write the cleared
//     marker back to the base room.
//
// Engine integration:
//   - Climb handler: after the top-tier state write, if
//     isTop, roll rollElevatedOverlay. If non-null: pick
//     encounter via rollOverlayEncounter + findEnemyByName,
//     build overlay scene via buildOverlayOverrides, swap
//     currentScene with preservedSceneOnDescent pointing at
//     the base. Log the arrival line + an enemy-spotted line
//     when an encounter spawned.
//   - Climb-down handler: when wantsDown && currentScene.
//     elevatedOverlayMeta + preservedSceneOnDescent both
//     set, restore the base scene (with elevatedOn/overlay
//     fields cleared). The climbed marker for the climbed
//     noun was already written to the base room's
//     searchedAmbientNouns when the climb-top tier resolved,
//     so OTA-086's fuzzy chip-clear logic greys the climb
//     chip correctly post-restore. Active overlay enemies
//     are abandoned by design — if you didn't finish the
//     encounter you bailed.
//
// Overlay templates (6) use existing enemies from app/data/
// enemies/enemies.json by name — no new enemy authoring:
//   nook         (65% chance)  Aetheric Bat / Raven / Spider
//   vantage      (30%)         Aetheric Shrike / Harpy
//   collector    (50%)         Aetheric Apparition / Ooze
//   sealed_door  (20%)         Stone Warden / Aetheric Gargoyle
//   roost        (80%)         Aetheric Raven / Harpy / Shrike
//   open_sky     (5%)          Aetheric Apparition (rare ghost)
//
// Ambient nouns hit the OTA-080 keyword map where possible
// (vessel for 'copper bowl', vegetation for nest/feathers,
// etc.) so the investigation table seeds useful entries.
//
// Files: NEW app/engine/elevatedOverlay.ts (~150 lines, pure
// module), app/state/gameStore.ts (CurrentScene interface
// gains preservedSceneOnDescent + elevatedOverlayMeta;
// climb-top branch wires rollElevatedOverlay + scene swap;
// climb-down branch detects overlay state and restores the
// preserved scene).
//
// 2026-05-27 OTA-090 — Trader + Lookout overlay kinds.
// Player asked: add NPC encounters in elevated overlays;
// keep traders on "larger locations" (4+ tier climbs); give
// each trader a funny reason they're hiding up there.
// Delivered: 5 hand-authored trader templates + 2 lookout
// templates layered into the OTA-089 OVERLAYS pool.
//
// Overlay kinds:
//   encounter — hostile spawn (OTA-089 default behavior)
//   trader    — peaceful vendor, only fires when total
//               Tiers >= minTiers (4 in practice). Each has
//               a custom name + title + funny pitch line.
//   lookout   — peaceful NPC who plants a one-stage rumor
//               hook on the overlay scene. Player taps any
//               of the lookout's nouns to engage.
//
// Trader templates (4+ tier climbs only):
//   ledger_keeper    — Olek, ex-Mud Monarch tax collector
//                      hiding from his own books
//   wind_priest      — Sister Yelena, Servants acolyte
//                      "hearing the Giants more clearly"
//                      for three years now
//   reclaimer_hiding — Pavel (allegedly), Reclaimer hiding
//                      from a debt collector named Hass
//   forgotten_scholar — Adept Ireneus, Forgotten Order
//                       scholar cataloguing every spire
//                       in Tartaria from the top (year 3
//                       of 50)
//   drunk_drifter    — Mikola, climbed up on a bet, forgot
//                      which way is down, sells items at
//                      randomized prices
//
// Lookout templates (any tier):
//   rumor_scout   — scout points east toward a Mud Monarch
//                   caravan satchel; plants a 'thread' hook
//   rumor_pilgrim — old pilgrim hears a name in a southern
//                   crystal hum; plants a 'whisper_crystal'
//                   hook
//
// All traders use existing items from the catalog (Worn
// Tartarian Coin, Sealed Tartarian Letter, Aether Dust,
// Aetheric Locket, Aetheric Shard, Mud Essence, etc.) so
// no new item authoring. Each offer has a min/max price
// range that randomizes per spawn for "hand-rolled" feel.
//
// Demeanor + faction pass through to VendorInstance so the
// existing steal mechanics fire normally (Pavel + Mikola
// are 'sketchy' = easier to lift from, bigger fight on
// miss; Olek + Yelena + Ireneus are 'honest' = harder
// steal, milder consequences). Sister Yelena gives
// Servants standing on purchase via faction='servants_of_
// giants'; same pattern for Pavel (reclaimers_guild) and
// Ireneus (forgotten_order).
//
// Tier gate: rollElevatedOverlay now accepts totalTiers and
// filters out entries whose minTiers exceeds it. Encounters
// + lookouts default to minTiers=0 (any tier); traders
// declare minTiers=4 so a 1-tier ledge doesn't surface "a
// man with a wagon and three ledgers is up here" absurdity.
//
// Files: app/engine/elevatedOverlay.ts (OverlayKind type,
// trader + lookout template interfaces, OVERLAYS pool
// expansion, rollElevatedOverlay tier filter, buildOverlay
// Trader + buildOverlayLookoutHook helpers), app/state/
// gameStore.ts (climb-top branch now switches on overlay
// kind to set vendor / hooks / enemies appropriately).
//
// 2026-05-27 OTA-091 — Overlay encounter scaling by player
// HP. Playtester at 32 HP rolled a roost overlay and got an
// Aetheric Harpy (Rare-tier, 158 HP, 2D6 Psychic damage)
// who crit them to 5 HP in two rounds then finished them on
// a step-back. The OTA-089 encounter pool was a flat
// string[] mixing Common-tier (12-18 HP) with Rare-tier
// (130-160 HP), so the roll was uniform across catastrophic
// mismatches.
//
// Plus a silent bug: 'Aetheric Bat' didn't exist in the
// catalog (the entry is 'Aetherbat') — that pool slot
// silently failed to spawn anything, biasing the roost roll
// toward the surviving Harpy + Shrike entries.
//
// Fix: refactor encounterPool from string[] to Tiered
// EnemyPool { common, uncommon, rare }. rollOverlayEncounter
// now takes player.hpMax and picks the band:
//   hpMax < 40   → common only            (early game)
//   hpMax < 80   → common + uncommon      (mid game)
//   hpMax >= 80  → uncommon + rare        (late game)
// Late-game intentionally drops common-tier so high-level
// players don't roll trash; early-game caps at common so
// squishy players don't roll Rares. Empty-band fallback to
// common guarantees a spawn even on templates without a
// rare entry.
//
// Tiered pools authored per overlay using catalog-verified
// names from app/data/enemies/enemies.json:
//   nook        common=Aetherbat/Raven/Spider, unc=Lurker/
//               Scarab, rare=Apparition
//   vantage     common=Raven, unc=Shrike/Mud Harpy, rare=
//               Aetheric Harpy
//   collector   common=Ooze/Leech, unc=Salamander, rare=
//               Apparition
//   sealed_door common=Spider, unc=Iron Spider/Drone/Rust
//               Lurker, rare=Stone Warden/Aetheric Gargoyle
//   roost       common=Raven/Aetherbat, unc=Shrike/Mud
//               Harpy, rare=Aetheric Harpy
//   open_sky    common=Raven, unc=Shrike, rare=Apparition
//
// Net effect on the playtester's case: a 32-HP player
// climbing a 3-tier marble pillar to a roost overlay now
// rolls from {Aetheric Raven (18 HP, 1D6), Aetherbat (15 HP,
// 1D6)} — survivable. At 60 HP they also roll Aetheric
// Shrike (47 HP, 2D6) / Mud Harpy (76 HP, 2D6). At 80+ HP
// they finally face the Aetheric Harpy (158 HP, 2D6 Psychic).
//
// Files: app/engine/elevatedOverlay.ts (TieredEnemyPool
// interface; encounterPool field retyped; rollOverlay
// Encounter takes hpMax + band-selects; OVERLAYS templates
// converted to tiered pools), app/state/gameStore.ts
// (climb-top call site passes player.hpMax into
// rollOverlayEncounter).
//
// 2026-05-27 OTA-092 — Overlay encounter scaling refined to
// HP-ratio bands. OTA-091's rarity-tier bands were too
// coarse: a 32-HP player got only ≤25 HP enemies (under-
// challenged, no flee-worthy moments), a 60-HP player skipped
// straight from Commons to mixed Common+Uncommon with no
// scare-tier excitement. Player asked: "I still want a
// challenge they need to flee every now and then but not 5x.
// 2x is ok, 3x if you want to scare them."
//
// Fix: switch from rarity tiers to HP-ratio bands relative
// to player.hpMax. Encounter pool is a flat string[] again
// (drops TieredEnemyPool), and rollOverlayEncounter does
// runtime band selection:
//
//   easy band     0.5x - 1.0x player.hpMax  (light)
//   standard band 1.0x - 2.0x player.hpMax  (normal)
//   scare band    2.0x - 3.0x player.hpMax  (flee-worthy)
//
// Above 3x: never spawned. Below 0.5x: skipped unless
// nothing else qualifies. Band weights: 60% standard, 25%
// easy, 15% scare — most encounters are winnable, occasional
// scare keeps tension, very rare too-easy beat. Falls back
// to whichever band has entries if the preferred is empty.
// Graceful degradation: if no enemy is in any in-range band,
// picks the closest-to-1.5x option (still won't return
// null).
//
// Pool authoring simpler too: each overlay declares a flat
// list of thematic enemies spanning low-HP to high-HP. The
// runtime picks what fits the player. Wide pools serve early,
// mid, and late game with one list per overlay. Example
// roost pool:
//   ['Aetherbat' (15), 'Aetheric Raven' (18),
//    'Aetheric Shrike' (47), 'Mud Harpy' (76),
//    'Aetheric Harpy' (158)]
//
// Playtester case (32 HP, roost):
//   easy:     Aetheric Raven (0.6x)
//   standard: Aetheric Shrike (1.5x)
//   scare:    Mud Harpy (2.4x)
//   excluded: Aetheric Harpy (4.9x), Aetherbat (0.5x edge)
// Same pool at 60 HP unlocks Aetheric Harpy as a scare
// (2.6x). At 100+ HP it's the standard. Wide pools, one
// definition, every player level.
//
// HP looked up at runtime from app/data/enemies/enemies.json
// via lazy require so the pure module stays import-clean.
//
// Files: app/engine/elevatedOverlay.ts (TieredEnemyPool →
// EncounterPool flat alias, OVERLAYS templates flattened
// + widened, rollOverlayEncounter rewritten for HP-ratio
// band selection with weighted band roll + graceful
// fallback).
//
// 2026-05-27 OTA-093 — Parser inventory matcher tightened +
// Bone Fragment catalog backfill. Playtester noticed the
// "Field-inferred / catalog backfill pending" lines on
// 'titan's bone marker' resolving to 'Bone Fragment'. Two
// problems stacked:
//
//   (1) The parser's resolveItem (parser.ts:632) used too-
//       loose matching: `tokens.some(t => itemLower.includes(t))`.
//       ANY input token as a substring of ANY item name
//       won. So 'titan bone marker' tokens matched 'bone
//       fragment' on the bare word 'bone', and the engine
//       treated the scene noun like an inventory inspect →
//       fell into itemDefaults inference → printed the
//       backfill warnings.
//
//   (2) Bone Fragment WAS legitimately granted as loot from
//       the corpse-investigate path but had no catalog
//       entry, so even legitimate inventory inspects hit
//       the inference fallback.
//
// Fix (1): tightened matcher with three ordered passes:
//   pass 1 — input contains the FULL item name (multi-word
//            item names need all their words present)
//   pass 2 — item's HEAD NOUN (last word) is a standalone
//            token in the input. "use the locket" matches
//            "Aetheric Locket"; "use the blade" matches
//            "Rusted Blade".
//   pass 3 — fuzzy on the head noun only (typo tolerance
//            without re-introducing adjective ambiguity).
// Adjective-only tokens ('titan', 'bone', 'aetheric')
// alone no longer win. Player needs to name the head noun
// or the full item name. If they typed something too vague,
// the resolver returns undefined and the engine falls back
// to scene-noun / context-noun resolution.
//
// Fix (2): Bone Fragment added to materials.json with a
// canonical description matching the existing Bone Sliver
// entry's style.
//
// Net: 'climb titan's bone marker' no longer mis-resolves
// to the inventory item; goes to scene-noun matching. The
// scene noun isn't climbable so the existing arbiter
// refusal fires correctly. 'investigate bone fragment' on
// the inventory item now hits the real catalog entry and
// skips the field-inferred warning.
//
// Files: app/engine/parser.ts (resolveItem rewritten with
// 3-pass head-noun matching), app/data/items/materials.json
// (Bone Fragment catalog row added).
//
// 2026-05-27 OTA-094 — Lock OTA-093's parser tightening +
// fix hyphen handling regression. User asked to "fix B" —
// verify pass B (head-noun) is solid for the bone case.
//
// Found a regression in OTA-093 itself: my head-noun check
// looked for the full hyphenated head as a single token
// ('bolt-caster' as one string). But the parser tokenizes
// hyphenated names into ['bolt', 'caster']. Mismatch broke
// the existing parserArgs test for 'attack the drone with
// the bolt-caster'.
//
// Fix: normalize hyphens to spaces in both the input
// (joined tokens) and the item name (normalizeName helper).
// Pass 1 'inputNorm.includes(itemNorm)' handles the full
// name match cleanly. Pass 2 flattens tokens on hyphens +
// whitespace into a 'flatTokens' pool, then checks if the
// item's head noun (last word of normalized name) is in
// that pool. 'Bolt-Caster' → normalized 'bolt caster' →
// head 'caster' → matches flatTokens ['the', 'bolt',
// 'caster']. Working.
//
// Regression lock: 7 new tests in __tests__/parserArgs.test.
// ts under "OTA-093 — resolveItem head-noun matching":
//   - 'titan's bone marker' does NOT match Bone Fragment
//   - 'weathered bone marker' does NOT match Bone Fragment
//   - full name 'bone fragment' DOES match
//   - head noun 'fragment' alone DOES match
//   - head noun 'blade' matches Rusted Blade
//   - 'aetheric' alone does NOT match (ambiguous)
//   - head noun 'locket' DOES match Aetheric Locket even
//     when another Aetheric item is in inventory
//
// All 22 parserArgs tests pass; all 196 tests in the
// parser-test suite pass. Adjective-only mismatches are
// now structurally locked.
//
// Files: app/engine/parser.ts (normalizeName helper +
// flatTokens flattening + hyphen-aware passes), __tests__/
// parserArgs.test.ts (OTA-093 regression suite added),
// app/buildInfo.ts → OTA-094.
// 2026-05-27 OTA-095 — Aetheric tab added to CraftingScreen;
// Recipes mode stripped from ActionReferenceScreen. Player
// asked: "we were supposed to move all aetheric recipes as a
// 4th tab under craft but they are still under actions. also
// there is food mixed in all food recipes go under the recipes
// tab, aether recipes are a new 4th tab under craft called
// Aetheric. actions should only be the actions."
//
// Implementation: added 'aetheric' to the Tab type in Crafting
// Screen, added the 4th tab button, copied the AETHERCRAFT_
// DISCIPLINES constant + card-tap-queues-phrase behavior
// (queueInputDraft + Clipboard fallback + cycleIdx rotation)
// into the new tab body. Stripped the entire Recipes mode
// from ActionReferenceScreen (RecipeMode type, mode state +
// tabs, recipes-branch JSX, AETHERCRAFT_DISCIPLINES +
// RECIPE_GROUPS constants, recipeDescription helper, unused
// imports from engine/crafting). Screen is now actions-only.
// Title unconditional 'ACTIONS'.
//
// Food recipes were already correctly housed in CraftingScreen's
// Recipes tab via kindFilter="consumable" — no change needed
// there. The duplicate listings were in ActionReferenceScreen's
// Recipes mode, which is now gone.
//
// Open issue surfaced this OTA: inference engine in
// itemDefaults.ts doesn't check materials.json before warning
// — Sentinel Core Plate (already in materials) keeps logging
// `inferred-stats: armor:Sentinel Core Plate`. Tracked in
// HANDOFF.md Section 0.A; not user-facing.
//
// Files: app/screens/CraftingScreen.tsx, app/screens/Action
// ReferenceScreen.tsx, HANDOFF.md (Closed Issues 0.B + Open
// Issues 0.A updated per the new workflow).
// 2026-05-27 OTA-096 — Quest-check investigate path gains
// per-noun dedup. Playtest log on 094 showed: player tapped
// 'investigate titan's bone marker' six times in a row, each
// tap printed the same "Aetherstone hums" line, with no
// signal that the engine was silently training their skill.
// Same UX pattern as the OTA-070/076/083/084 chip-stays-
// actionable cycle but on a different branch — the OTA-084
// refuseAmbient hardening covered REFUSAL paths but missed
// this ACTIVE-NARRATION path inside the quest-check success
// switch at gameStore.ts:8640.
//
// Two fixes:
//
//   (1) First-tap line rewritten. Pre-OTA-096 the line was
//       "You examine X. The Aetherstone hums — something is
//       here, but not in plain sight." This promised hidden
//       info even when the 12% lead-roll didn't fire. Now:
//         - lead fires: "You examine the X. A thread surfaces
//           — clear enough to follow." + reward line
//         - no lead:    "You examine the X carefully. The
//           work sharpens your focus, but no clearer thread
//           surfaces here."
//       Player can tell the difference between productive
//       and tap-for-stat-training outcomes.
//
//   (2) Per-noun dedup. After the first tap, the noun is
//       written to flavorExhaustedNouns for the current
//       room. Subsequent taps short-circuit to a callback
//       via the OTA-084 refuseAmbient helper: "You've
//       already turned the X over here. Whatever it had to
//       give you, you took. Your active leads (if any) live
//       in the Contracts log." Chip greys via OTA-070/076
//       fuzzy UI check.
//
// Files: app/state/gameStore.ts (quest-check investigate
// branch refactored — dedup check up front + branched first-
// tap narration + inline flavorExhaustedNouns write at the
// end), HANDOFF.md (Section 0.B Closed Issues updated).
// 2026-05-27 OTA-097 — Symmetric per-noun dedup on the FAIL
// arm of the quest-check investigate path. OTA-096 fixed the
// SUCCESS arm but the player could still retry indefinitely
// on failed checks. Playtester pushed back: "if it's something
// that I don't have a chance to beat because my base roll and
// other stats wouldn't let me do it then it should be shut
// off after the first roll because I'll never be able to get
// it while I'm in that instance ... you're kind of like
// tricking me to keep trying when I really don't have a
// chance."
//
// Two fixes in the fail arm at gameStore.ts:~8730:
//   (1) Per-noun dedup write — after a failed check, write
//       the noun to flavorExhaustedNouns for the current
//       room. Next tap on the same noun routes through the
//       OTA-096 callback gate (which sits at the top of the
//       success arm's investigate branch).
//   (2) Narration now references the focus noun instead of
//       the location name. Pre-OTA-097: "You sweep Asgardar
//       but find only dust." Player examined a specific
//       noun, not the city. Post-OTA-097: "You sift the X
//       but it gives up nothing. The Aetherstone keeps its
//       silence here."
//
// Design: one attempt per noun per visit, success OR fail.
// The dice told you what they told you. No grind loops; no
// false hope. If your stats can't beat the DC, walk away,
// level up, come back to a fresh room.
//
// Files: app/state/gameStore.ts (fail-arm investigate case
// rewritten with focus-noun narration + inline dedup write),
// HANDOFF.md (Closed Issues entry added).
// 2026-05-27 OTA-098 — Chip-grey fix (apostrophe-variant
// dedup writes) + Arbiter narration on lead-fired. Two
// follow-ups from the OTA-097 playtest log:
//
//   (1) Chip didn't grey despite engine refusing. Root cause:
//       dedup write stored the apostrophe form ("titan's bone
//       marker") but the scene chip text was the stripped form
//       ("titans bone marker"). The OTA-070 substring fuzzy
//       check can't bridge that gap. Fix: write BOTH forms.
//       Applied to both success and fail arms.
//
//   (2) Player wanted Arbiter acknowledgement: "if it's going
//       to do that then I would imagine that my arbiter would
//       say something to the effect of 'Ah, I see it now. We'll
//       put that in your contracts for later.'" Done — arbiter-
//       channel log fires alongside the New lead reward.
//
// Files: app/state/gameStore.ts.
// 2026-05-27 OTA-099 — OTA-apply + session-start debug log
// markers. Player asked: "when you update via OTA can a
// record of that be in the log, but not visible to the
// player, that way you can tell if I am up to date, and
// can kind of have a timestamp of the progression."
//
// Two debug-channel entries (invisible to player in normal
// play, present in shared log captures):
//   - "OTA session start: <OTA_BUILD_ID>." — every slot load
//     and new-game character creation. Timestamped marker
//     of which build is running.
//   - "OTA applied: <oldId> → <newId>." — once per upgrade,
//     first slot load after the hydrate-flow update
//     detection. Captures the transition.
//
// justUpdatedFromBuild is captured BEFORE the set() in
// loadSlotIntoGame so we can log it; the set then clears
// the flag (so the title-screen popup doesn't refire on
// next session).
//
// Files: app/state/gameStore.ts (loadSlotIntoGame + start
// NewGame).
// 2026-05-27 OTA-100 — OTA-applied debug marker now actually
// fires. OTA-099 read justUpdatedFromBuild inside loadSlot
// IntoGame, but the TitleScreen popup dismiss clears that flag
// BEFORE the player taps LOAD SLOT — so the capture was always
// null in practice. Playtest log from OTA-099 confirmed the
// session-start marker works but applied-marker never fired
// despite a real upgrade.
//
// Fix: parallel state field `pendingOtaAppliedFrom` with the
// same source value (set in hydrate) but a lifecycle that
// the popup doesn't touch. loadSlotIntoGame reads + clears
// it exclusively. justUpdatedFromBuild keeps its existing
// popup-driven lifecycle.
//
// Files: app/state/gameStore.ts.
// 2026-05-27 OTA-101 — Log exports now bundle device/install
// summary. Player asked: "when a playtester pushes a big
// report have it also copy and paste the about information."
// Done — new stampLogExport helper in aboutSummary.ts wraps
// the envelope + appends buildBasicDeviceSummary. Three
// surfaces converted (LogScreen, AboutScreen, TitleScreen
// dead-character report). Every COPY / SHARE / CHUNK output
// now carries platform + build context so I don't have to
// ask the player to send the about info separately.
//
// Files: app/diagnostics/aboutSummary.ts (new helper), app/
// screens/LogScreen.tsx, app/screens/AboutScreen.tsx, app/
// screens/TitleScreen.tsx.
// 2026-05-27 OTA-102 — Elevated overlay polish. Playtest log
// surfaced two issues: (1) a 1-tier climb of a 'cracked walk
// way' fired a collector overlay with "apex" flavor that's
// out of scale for a walkway, and (2) overlay ambient nouns
// (copper bowl, ozone tang, bent rivets) returned the
// generic catchall on investigate because they weren't
// seeded into the room investigation table.
//
// Fix (1): rollElevatedOverlay's minTiers default bumped
// from 0 to 2. Encounter + lookout overlays now require
// 2+ tier climbs. Traders still gated at 4. 1-tier
// objects (ledges, walkways, pedestals, low arches) get
// the standard climb-top loot beat with no overlay
// surface.
//
// Fix (2): overlay scene swap now merges the overlay's
// ambientNouns into the room's roomInvestigationTable via
// seedInvestigationTable. Idempotent. Subsequent investi-
// gates hit real category templates (vessel for 'copper
// bowl', etc.) with proper lore + yields.
//
// Open issues added in this OTA (not fixed):
//   - 'rotate the ring left' / hook-puzzle parser misses
//   - 'knock on the steeple' narrative-suggested actions
//   Both: engine produces hint text that promises actions
//   it can't honor. Tracked in HANDOFF.md Section 0.A.
//
// Files: app/engine/elevatedOverlay.ts, app/state/game
// Store.ts.
//
// 2026-05-27 OTA-103 — Aether family IPA refinement. User
// provided fresh IPA for three of the five Aether entries:
//   aether     = ɛɪθɚ      (long-A "ay" + rhotic schwa "ther")
//   aetheric   = ɛɪθiɾɪk   (long-A + "thee" + r-tap into "rik")
//   aetherborn = ɛθɛɾ bɔːn (short-E "eth" — diverges from the
//                          long-A start of aether/aetheric)
// Updated respellings in loreLexicon.ts:
//   'ay thur'     → 'ay ther'
//   'ay thur ik'  → 'ay thee rik'
//   'ay thur born'→ 'eth er born'
// Aetherstone / Aetherbat untouched pending the user's own
// spec for those two — partial refinement is fine; we don't
// guess vowels the user hasn't called out.
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-104 — Place-name IPA refinement: Asgardar,
// Samarran, Nimari. User provided fresh IPA:
//   Asgardar /ɛz gɑdɔɹ/    → 'ez gah dor'
//   Samarran /ɛsɛmɔːɾɛn/   → 'eh sem or en'
//   Nimari   /ɛnɛmɑɹi/     → 'eh neh mah ree'
// Common pattern across all three: leading /ɛ/ schwa ("eh")
// that the prior respellings dropped. Samarran and Nimari are
// 4-syllable words per the IPA; the prior 3-syllable
// respellings collapsed one internal vowel. Drakova / Varakush
// / Voronov / Thametan / Zharak unchanged — only refining the
// three the user called out.
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-105 — Aether-family IPA spec completed.
// User provided IPA for the remaining two entries left
// untouched in OTA-103:
//   Aetherstone /ɛjtɛɹstɛn/ → 'ay ter sten'
//   Aetherbat   /ɛθɛɾ bet/  → 'eth er bet'
// Surprising elements per the IPA — Aetherstone uses a hard
// /t/ not /θ/ ("ter" not "ther"), and ends in /stɛn/ ("sten"
// rhymes with "ten") not "stone". Aetherbat ends in /bet/
// ("bet" rhymes with "set") not "bat". The Aether family now
// splits cleanly into two groups by initial vowel:
//   Long-A "ay" — Aether, Aetheric, Aetherstone
//   Short-E "eth" — Aetherborn, Aetherbat
// All five entries now reflect the user's canonical Tartaria
// pronunciation.
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-106 — Aetherstone correction. User clarified
// via natural-language respelling: "AY-thur-stohn = aether
// stone". OTA-105 parsed the IPA /ɛjtɛɹstɛn/ as hard /t/ +
// "sten" ending, which was wrong — Aetherstone is "ay thur
// stone" with the /θ/ sound and the obvious "stone" ending
// (essentially the pre-OTA-105 respelling). Reverted. The
// long-A/short-E group split still holds (Aetherstone stays
// in the long-A group), but the middle and ending now match
// the corrected pronunciation.
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-107 — Full Aether-family revert to uniform
// "AY-thur" pattern. User: "revert all of the aether nouns
// with that long a and thur sound in the beginning in caps
// AY-thur". OTAs 103/105 over-interpreted IPA character-level
// detail (rhotic schwa "ther" vs "thur"; /ɛθ/ short-E start
// for born/bat) and produced TTS output that diverged from
// the user's canonical pronunciation. The Aether family is
// uniform — long-A start + "thur" middle + suffix:
//   Aether       → 'ay thur'
//   Aetheric     → 'ay thur ik'
//   Aetherstone  → 'ay thur stone'
//   Aetherborn   → 'ay thur born'
//   Aetherbat    → 'ay thur bat'
// This is the OTA-218-era spec restored. Going forward, IPA
// gets weighed against the word's English orthography before
// shipping; sharp divergence prompts a clarifying ask, not a
// literal parse.
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-108 — Monarch pronunciation. User provided
// IPA /ˈmɑnɑrk/ = MAH-nark (both syllables get the /ɑ/ "ah"
// vowel; second syllable rhymes with "park"). First IPA pass
// post-OTA-107 to follow the new rule: surfaced the MAH-nark
// parse via AskUserQuestion before shipping; user confirmed
// "Yes, MAH-nark" with apply-across-the-lexicon scope.
// Updated existing Mud Monarch / Mud Monarchs entries and
// added new standalone Monarch / Monarchs entries:
//   'mud mon ark'  → 'mud mah nark'
//   'mud mon arks' → 'mud mah narks'
//   (new) Monarch  → 'mah nark'
//   (new) Monarchs → 'mah narks'
// SORTED_LEXICON's length-descending sort keeps "Mud Monarchs"
// matching before "Monarchs" so the compound isn't preempted.
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-109 — Monarch spell-it-out correction.
// User refined IPA to /ˈmɑːnɑːrk/ and when asked about the
// long-vowel encoding answered with their actual ear: "to
// me it sounds mon-nark." Spell-it-out cue overrides IPA
// parse per the OTA-107 rule. MAH-nark from OTA-108 was
// wrong — the user hears the standard English MON-NARK
// pronunciation with the syllable-boundary N audible.
// Updated all four entries:
//   'mah nark'      → 'mon nark'
//   'mah narks'     → 'mon narks'
//   'mud mah nark'  → 'mud mon nark'
//   'mud mah narks' → 'mud mon narks'
// Outcome of the OTA-107 rule: I asked before shipping,
// got the course-correction, no revert OTA burned. The IPA
// the user typed represented something they wanted to
// CONVEY about emphasis (long vowels) more than the exact
// phonemes — their ear maps /ɑ/ to the "on" vowel for this
// word, not the "ah" of "spa."
//
// Files: app/voice/loreLexicon.ts.
//
// 2026-05-27 OTA-110 — Multi-agent stress audit + catalog
// inference ordering fix. User asked: "I need a full workout
// of anything my playtesters can do to break the game...
// look for loops, dead hooks, errors, bugs and dead code."
// Spun 4 adversarial agents in parallel (3 Jest sim writers
// + 1 static read-only auditor). Result: 40 new sim tests
// across 3 files passing in ~25s, with 0 engine-state
// invariant failures across 600-iter random walks.
//
// One actionable bug shipped fixed in this OTA:
//   `findWeaponByName` / `findArmorByName` / `findAmuletByName`
//   / `findRingByName` in app/engine/crafting.ts fell through
//   to inference even when the name resolved in a DIFFERENT
//   catalog bucket. 12 confirmed leaks — "Aetheric Cloak",
//   "Wyrm Fang", "Sentinel Core Plate", etc. — all
//   catalogued in materials.json or exploration.json but
//   tripping the armor/weapon keyword regex and firing
//   `[debug] inferred-stats:` warnings, polluting the
//   backfill audit signal. Fix: new `isCataloguedElsewhere`
//   guard short-circuits the inference path when the name
//   exists in a different bucket. Reference implementation
//   was already in app/components/itemPreview.ts:60-95 —
//   the fix brings find* in line.
//
// Three findings logged as new open issues in HANDOFF.md 0.A
// (deferred, not in this OTA):
//   - "turn the locking ring" parses as intent=turn_in
//     (mis-routes the sealed_vault_door puzzle action to
//     quest-completion). New parser bug, design call needed.
//   - "tap the steeple" parses as intent=unknown (parser has
//     no tap/press verb; same family as rotate/knock).
//   - tutorialSteps.ts still references "ACTIONS and RECIPES"
//     tabs as if both live on ActionReferenceScreen, but
//     OTA-095 moved Recipes to CraftingScreen.
//
// Also verified clean: OTAs 070-109 closed-issue fixes all
// in place (no silent reverts). All engine-state invariants
// hold: chip-grey-after-refuse, consumed-table monotonicity,
// salvage→investigate dedup, pack-full skip, 1-tier overlay
// gate, trader overlay tier-4 gate, ambient-noun seed
// idempotence, preservedSceneOnDescent round-trip, 0-stamina
// climb design preservation, HP-band scaling 97.6% in-band /
// 2.4% scare / 0% above-3x. All while-loops bounded; no
// infinite-loop risk.
//
// Files: app/engine/crafting.ts (isCataloguedElsewhere guard
// + 4 find* functions updated), __tests__/engineStateChaosSim.ts
// (new, 10 cases), __tests__/playerInputChaosSim.ts (new, 15
// cases), __tests__/craftingInventoryChaosSim.ts (new, 15
// cases — the test.failing flipped to a real assertion now
// that the fix lands).
//
// 2026-05-27 OTA-111 — Crafting screen recipe info surfaces +
// descriptive stat-growth balance sim. User: "we need to show
// what the dice rolls are for damage, so we can decide what to
// build. We should show what each food recipe gives back in
// terms of health and/or stamina... And for the golems, we
// need to know their stats so we know what to make, and which
// stats are needed to make them."
//
// Three surfaces:
//   (1) WEAPON damage dice — already shipping via previewWeapon
//       in itemPreview.ts:99-110 ("Damage: 2d6 (slashing) ·
//       Scales with STR · ..."). Verified intact; no code
//       change. Quiet styling (#cdbf99 italic fontSize 11) is
//       the likely reason the user missed it on screen — can
//       bump emphasis in a follow-up if they want it shouting.
//   (2) FOOD / consumable restore — extended previewGear in
//       itemPreview.ts:129-167 to emit "Restores: +5 HP /
//       +2 stamina", buff lines ("Buff: +1 STR for 6 turns"),
//       cure lines ("Cures: bleed"), and reveal lines.
//       Renders through the existing
//       preview.stats.join(' · ') in RecipesView.tsx:197-200
//       so no consumer code changed.
//   (3) GOLEM stats + summon DC — new GOLEM_VARIANTS block in
//       the SUMMON discipline card at
//       CraftingScreen.tsx:385-418. Each of the 4 kinds
//       (Mud / Iron / Aether / Crystal) gets a tappable row
//       with HP, damage dice, blurb, fuel recipe, and a
//       tap-to-stage hint that drops "summon iron golem" into
//       the input draft. Footer: "Requires: INT 10+ recommended
//       (d20 + INT vs DC 15; Mud Dwellers / Aetherborn cast at
//       base DC, others +4)."
//
// Data note (deferred): runAethercraft in gameStore.ts:16592
// uses a single hard-coded dcBase = 15 (INT) for all four
// golems. Crystal/Aether (lore-wise stronger anchors) cost
// the same INT roll as Mud. Adding per-golem `summonDC` to
// GolemDefinition is a design call — flagged as an open
// follow-up in HANDOFF.md 0.A.
//
// Also lands: __tests__/statGrowthBalanceSim.test.ts — 5000-
// turn × 20-seed sim measuring per-stat XP/turn rates +
// turns-to-Guardian-threshold per stat. Descriptive only
// (no threshold assertions yet) so it's safe to ship before
// tuning recommendations land. Partial output already
// surfaced: DEX is the slowest stat (0.067 XP/turn, ~1504
// turns to Guardian threshold) — NOT INT (0.155 XP/turn,
// ~643 turns). Full diagnosis + tuning recommendations
// arrive in OTA-112.
//
// Files: app/components/itemPreview.ts (previewGear restore
// + buff + cure lines), app/screens/CraftingScreen.tsx
// (GOLEM_VARIANTS block + stageDraft helper + nested row
// styles), __tests__/statGrowthBalanceSim.test.ts (new).
//
// 2026-05-27 OTA-112 — Stat-growth tuning per OTA-111 audit
// findings. The 5000-turn × 20-seed sim surfaced three issues:
//
//   (1) DEX is the slowest stat at 0.067 XP/turn — half of
//       STR, less than half of INT. The user's hypothesis
//       (INT is too slow) was wrong by the numbers: INT is
//       the second-fastest stat at 0.155 XP/turn. DEX's
//       problem: it only trained on finesse-weapon hits (a
//       minority of weapons), parry success (mid-combat
//       only), climb tier (rare), and a handful of skill
//       checks.
//   (2) `jump` and `disengage` are real parser intents with
//       handlers (gameStore.ts:7296, 7333) but neither
//       trained DEX. Textbook DEX moments going unrewarded.
//   (3) SKILL_ACTIVITIES (statTraining.ts:201) advertised
//       "Resting after combat trains WIS" but no trainStat
//       call existed for it — UI promised a mechanic that
//       never fired.
//
// Three surgical wires:
//   - `jump` handler at gameStore.ts:7296: +1 trainStat(DEX)
//     on every leap. Naturally rate-limited by 1-stamina
//     cost + low jump frequency.
//   - `disengage` handler at gameStore.ts:7333 (in-combat
//     branch only): +1 trainStat(DEX) on successful break-
//     contact. The no-enemies early-return doesn't reach
//     the train, so disengage-spam without combat is
//     uncompensated.
//   - `rest` handler at gameStore.ts:~5808 (8-hour rest
//     success path): +1 trainStat(WIS). 8h game-time cost
//     is itself the rate limit — can't farm by spamming.
//
// Skipped from the audit recommendations:
//   - WIS-novel-step rate limit (raise novelty window 20→50
//     tiles) — left for a future design call; nerfing a
//     stat that's already the highest by sim numbers may
//     feel unfair to players who chase WIS.
//   - Per-golem summonDC — flagged as an open design call
//     in HANDOFF.md 0.A; needs the user's input on whether
//     Crystal/Aether should cost more than Mud.
//
// Validation: the OTA-111 stat-growth sim numbers don't
// change because its fixed action mix (40m/20i/15c/10cr/10s/
// 5r) doesn't include jump or disengage as discrete actions
// — the new training paths fire in real gameplay where
// players actually use those verbs, not in the baseline
// model. The 43 sim tests continue to pass (no regression
// to invariant tests). Real-gameplay impact will show in
// the next playtest log capture.
//
// Files: app/state/gameStore.ts (3 trainStat wires).
//
// 2026-05-27 OTA-113 — Tutorial refresh + OTA-111 golem-DC
// footer correction. The walkthrough text had drifted since
// the OTA-070+ wave of UX changes; brought it current.
//
// Six tutorial-step edits + one new step:
//   - "Actions & Recipes" → "Actions reference" (OTA-095
//     stripped RECIPES from this screen — used to be a 2-tab
//     screen; now actions-only). Step body rewritten to
//     redirect the player to the Crafting screen for recipes.
//   - NEW "Crafting — four tabs" step on screen='crafting'
//     introducing CRAFT / REPAIR / RECIPES / AETHERIC. Calls
//     out the OTA-111 info surfaces: weapon damage dice,
//     consumable restore numbers, golem variants with stats,
//     fuel costs, and the d20 + INT vs DC math.
//   - "Quick actions" — dropped 'block' from the in-combat
//     verb list (OTA-021 folded it into dodge); clarified the
//     per-room investigation table semantics ("each noun is
//     consumed once per room; same noun in a different room
//     still shows green").
//   - "New verbs and buttons" — added the elevated-overlay
//     beat at climb-tops (traders at 4+ tiers, lookouts /
//     encounters at 2+ tiers, CLIMB DOWN restores the base
//     scene); added the design preservation that 0-stamina
//     climbs are allowed (fall + damage); pointed the player
//     at the Crafting → AETHERIC tab as the easier route in
//     than typing the verbs; fixed the race-DC numbers (Mud
//     Dwellers base +2 INT, Aetherborn +2 DC, others +3 DC —
//     OTA-111's "+4 for others" was wrong per
//     raceMechanics.ts:215).
//   - "Stats grow with use" — added the OTA-112 training
//     paths: DEX on jump + disengage, WIS on rest. Also
//     refined the existing list: STR on non-finesse melee
//     hits (not all melee), DEX on finesse-weapon hits,
//     successful skill checks instead of generic "stealth /
//     stealing."
//   - "Your pack" — added a mention of the SearchSortBar
//     (OTA-087) and noted that auto-unequip on scrap (OTA-058)
//     is handled for the player.
//
// Also one OTA-111 footer correction in CraftingScreen.tsx —
// the AETHERIC tab golem-variants block claimed "Aetherborn
// cast at base DC, others +4" which was wrong per
// raceMechanics.ts (Mud Dweller 0, Aetherborn +2, others +3,
// summon DC 15, shape/mend DC 12). Corrected.
//
// Files: app/components/tutorialSteps.ts (6 edits + 1 new
// step), app/screens/CraftingScreen.tsx (golem footer line
// 415 correction).
//
// 2026-05-27 OTA-114 — Planning entry only (no code changes).
// User asked for a full implementation framework for a Dog
// Companion system: rescue scenarios tied to investigation
// hooks, faction-neutral captor fights, dog stats (STR/DEX/INT)
// on the Character screen, vest armor slot, hunger / loyalty /
// abandonment, mutual exclusion with golems, no-climb design,
// stamina mirror, call-modal flavor. Wrote it up as a
// substantial open issue in HANDOFF.md 0.A — full data model,
// 4 rescue scenarios, combat integration, travel rules,
// hunger thresholds, gear roster, UI surfaces, 7 open design
// calls needing user signoff, 5-phase implementation roadmap.
// JS bundle unchanged; this OTA exists only to anchor the
// planning entry in the buildInfo timeline.
//
// Status: planning ONLY — no implementation until user signs
// off on the open design calls in 0.A.
//
// Files: HANDOFF.md (Dog Companion planning entry in 0.A).
//
// 2026-05-27 OTA-115 — Planning entry only (no code changes).
// User answered most of the Dog Companion open design calls
// and added a new smell-find mechanic. Updated the OTA-114
// framework in HANDOFF.md 0.A to lock in:
//   - Dogs eat ANY player consumable (no separate dog-food
//     kind); treats are loot-table additions with a
//     `dogTreat` flag for +40 loyalty (vs +20 for regular
//     food). Drafted 4 treats: Smoke-Cured Jerky Strip,
//     Marrow Bone, Honey-Glazed Knuckle, Ash-Cured Tongue.
//   - Resurrection Gems revive dogs the same as players (no
//     special dog-revive item, no permadeath).
//   - Anything that heals the player heals the dog via
//     `heal dog <item>` / `use <item> on dog` — reuses the
//     existing itemEffect.ts resolver.
//   - Arbiter onboarding is conversational: "What kind of
//     dog is that?" → free-text breed (24 chars, pure
//     flavor); then "What will you name them?" → free-text
//     name (16 chars). Both immutable after entry.
//   - Combat: dog's name appears as a weapon-like row in the
//     action menu. Two verbs: `bite` (1d6 + STR/2 damage,
//     trains STR) and `distract` (d20 + DEX-or-INT vs DC 12;
//     on success applies 'distracted' status that gives +2
//     to the player's next dodge / flee / attack roll vs
//     that enemy).
//   - NEW Smell-find mechanic: on scene entry, dog rolls
//     d20 + INT vs DC 12; on success the engine adds one
//     hidden noun to the room investigation table from a
//     `hiddenSmellNouns` per-archetype pool. Once-per-room
//     cooldown via worldMemory; re-eligible after the room's
//     visible nouns are consumed. Trains dog INT on success.
//
// Three open design calls remain (stat-train pacing,
// scenario count, fight-flag implementation) — all
// recommendation-ready, just need the user's call before
// Phase 1 starts.
//
// JS bundle unchanged.
//
// Files: HANDOFF.md (Dog Companion entry refined).
//
// 2026-05-27 OTA-116 — Planning entry only (no code changes).
// User added a UI surface to the Dog Companion framework: the
// title-screen character slot tiles should show the dog's
// name + breed as a sub-line under the player name when a
// save has an active dog. Format: "Marrow (old bloodhound)".
// Slots without an active dog render the same as today. Lets
// the player identify the right save when they have multiple
// characters with different companions. Added to UI surfaces
// section and Phase 5 phasing in the HANDOFF.md 0.A entry.
// app/screens/TitleScreen.tsx added to the files-touched
// preview.
//
// JS bundle unchanged.
//
// Files: HANDOFF.md (Dog Companion UI surfaces section).
//
// 2026-05-27 OTA-117 — Planning entry only (no code changes).
// User closed the final three Dog Companion open design calls:
//   1. Stat pacing → mirror player per-tier costs from
//      statTraining.ts:40-47 (no accelerated growth).
//   2. Scenario count → ship all 4 at v1 (smelter / wagon /
//      cellar / snare).
//   3. Fight-flag implementation → user asked for it to be
//      defined in detail. Spec'd in 9 sub-points in
//      HANDOFF.md 0.A: optional `factionNeutralFight?: boolean`
//      on the Enemy interface, set by the rescue-scenario
//      spawner, read at kill-handling to skip standing-change
//      and witness-cascade paths, preserves loot/XP/quest
//      progression, save/load handles naturally via
//      currentScene.enemies, regression test in Phase 1.
//
// All design calls now resolved. Framework is FROZEN and ready
// for Phase 1 implementation when the user gives the go-ahead.
// The next dog-system OTA will be the first actual code
// change — data model + acquisition + faction-neutral flag.
//
// JS bundle unchanged.
//
// Files: HANDOFF.md (Dog Companion open-calls section closed
// out; faction-neutral fight flag spec'd in full).
//
// 2026-05-27 OTA-118 — Planning entry only (no code changes).
// User added a third Arbiter onboarding question: sex. Now
// the full conversational flow is breed → name → sex, all
// gathered post-rescue:
//   1. "What kind of dog is that?" → free-text breed (24c)
//   2. "What will you name them?" → free-text name (16c)
//   3. "Boy or girl?" → free-text (8c), engine parses common
//      tokens to derive a pronoun ('he' / 'she' / 'they')
//
// Data model gains `sex: { raw: string; pronoun: 'he'|'she'|
// 'they' }`. Pronoun drives every "your dog..." narration
// beat via a {pronoun} / {possessive} / {reflexive} template
// — rest beat, combat down-beat, abandonment goodbye, etc.
// All existing beats in the framework will be templated
// rather than hardcoded with "they/their" before Phase 4
// ships. Character screen Companion panel gains a small
// sex glyph (♂ / ♀ / ⚥) next to the name. Mechanically
// cosmetic — no stat or roll impact.
//
// Phase 1 scope updated to include the third question + the
// pronoun-template helper.
//
// JS bundle unchanged.
//
// Files: HANDOFF.md (Naming flow, data model, narration,
// UI surfaces, Phase 1 in 0.A Dog Companion entry).
//
// 2026-05-27 OTA-119 — Planning entry only (no code changes).
// User asked three things: difficulty estimate per phase,
// mid-save acquisition behavior, and added a new puppy-vendor
// safety-net mechanic for combat-death recovery.
//
// Difficulty estimates added per-phase (Medium / Medium-Hard
// designations + line counts). Total ~3-4k lines across 6
// OTAs, ~20-30 hours focused work. No architectural novelty.
//
// Mid-save acquisition: works naturally. player.dog defaults
// to null on existing saves via one-line migration in
// loadSlotIntoGame. Rescue hooks fire normally on next
// investigate of matching archetype. System is purely
// additive — no existing rule changes.
//
// NEW Phase 6 — Puppy-vendor safety net:
//   - One-shot per save, post-combat-death ONLY (hunger-
//     abandonment does NOT trigger).
//   - Activates after next Core Guardian victory after the
//     combat death.
//   - Vendor (new puppyVendor template) trades a puppy for
//     ONE random Common-tier non-equipped item in the
//     player's pack. Flavor: "I've been needing one of those
//     for a season."
//   - Accept → onboard a new puppy (lower starting stats,
//     same growth curve). Decline → vendor walks away. Both
//     paths set puppyVendorUsed = true, single-shot enforced.
//   - Saves carry puppyVendorOwed + puppyVendorUsed flags in
//     worldMemory.
//   - If all 9 Guardians cleared and dog dies post-completion,
//     no fire — intentional late-game cap.
//
// Phase count grows 5 → 6 (~300-400 lines added for Phase 6).
//
// JS bundle unchanged. Framework still ready for Phase 1.
//
// Files: HANDOFF.md (Puppy-vendor section, mid-save note,
// difficulty estimates, Phase 6 in phasing, files-touched
// updates).
//
// 2026-05-27 OTA-120 — Planning prep commit (no code
// changes). User issued the "implement everything" go-ahead
// with two final design overrides:
//   1. Dog + golem coexistence: the earlier mutex rule is
//      overridden. Both fight side-by-side; three-way enemy
//      retaliation split (~30/30/40). First co-activation
//      narrates the tension flavor but mechanically allows
//      both companions.
//   2. Rubble-puppy late-game fallback: when all 9
//      Guardians are cleared AND combat-death triggered
//      puppyVendorOwed, a puppy_in_rubble investigation
//      hook spawns at ~5% per outdoor wasteland scene
//      entry. No item trade required. Same single-shot
//      enforcement.
//
// Implementation agent launched in background to ship the
// full 6-phase Dog Companion build + tutorial. That work
// lands as OTA-121 when the agent completes; stress-test
// agents follow to validate the whole game before the user
// gets the ship-ready OTA.
//
// JS bundle unchanged for OTA-120.
//
// Files: HANDOFF.md (Golem-coexistence override + rubble-
// puppy late-game fallback added to the Dog Companion
// framework in 0.A).
//
// 2026-05-27 OTA-121 — Dog Companion implementation IN
// PROGRESS (Phase 1 foundation). Implementation agent is
// still running in the background; this is an intermediate
// checkpoint commit forced by the local stop-hook policy
// (no uncommitted changes allowed at turn end). The agent
// has so far landed:
//   - DogCompanion type + dog_armor union + factionNeutral
//     Fight + worldMemory.puppyVendor* flags +
//     dogSmelledHere on visited rooms (app/engine/types.ts)
//   - Central module app/engine/dogCompanion.ts (NEW)
//   - Parser hooks for the 3-step Arbiter onboarding state
//     machine (app/engine/parser.ts, llmParser.ts)
//   - gameStore.ts wiring for player.dog field +
//     onboarding handler routing
// TS clean. Working tree compiles. Phases 2-6 are still in
// flight — agent will continue producing files. Subsequent
// stop-hook checkpoints will land as OTA-122, 123, etc. as
// the agent progresses; the final ship-ready OTA at the
// end of the wave will mark Phase 6 + stress tests
// complete.
//
// Files: app/engine/types.ts, app/engine/dogCompanion.ts
// (NEW), app/engine/parser.ts, app/engine/llmParser.ts,
// app/state/gameStore.ts.
//
// 2026-05-27 OTA-122 — Dog Companion Phase 4 + Phase 5 in
// progress, mid-flight checkpoint. Continuation agent
// still actively writing (transcript hot, TS clean).
//
// What's landed since OTA-121 (per tree state):
//   Phase 4 — hunger / treats / tutorial:
//     - app/data/items/gear.json — 4 new treats authored
//       (Smoke-Cured Jerky Strip / Marrow Bone / Honey-
//       Glazed Knuckle / Ash-Cured Tongue) with dogTreat
//       flag
//     - app/data/world/wasteland_encounters.json — treats
//       scattered into loot tables
//     - app/engine/crafting.ts, app/engine/itemEffect.ts —
//       dogTreat flag plumbed through the catalog +
//       effect resolver
//     - app/state/gameStore.ts — feed dog / heal dog / use
//       on dog verb handlers + hunger decay tick
//     - app/components/tutorialSteps.ts — new "Your dog"
//       step (after Golem sidekicks); user/linter touched
//       this file alongside the agent's edit, preserved
//     - __tests__/dogHungerDecay.test.ts — NEW
//
//   Phase 5 — UI surfaces + vests + stat growth:
//     - app/data/items/dogGear.json — NEW, 4 vests
//       (Burlap / Riveted Leather / Aetheric Padded /
//       Reclaimer Pattern) with kind: dog_armor
//     - app/components/CallDogModal.tsx — NEW, three-
//       option call modal (scratch / treat / speak)
//     - app/screens/TitleScreen.tsx — character slot tile
//       sub-line for dog name + breed
//     - app/screens/CharacterScreen.tsx — Companion panel
//       beneath player stats
//     - app/screens/InventoryScreen.tsx — [fits dog] and
//       [treat] tagging
//     - app/engine/equipment.ts — dog gear equip flow
//     - app/engine/saveSystem.ts — dog persistence
//     - App.tsx — tutorial / modal routing
//     - __tests__/dogStatGrowth.test.ts — NEW
//
// Agent is still working — Phase 4/5 completion + any
// remaining stress tests will land in the next OTA when
// it reports done. The full-game stress sweep follows.
//
// TS clean at this checkpoint.
//
// Files: 12 modified + 3 new (full list above).
//
// 2026-05-27 OTA-123 — Dog Companion implementation
// COMPLETE. Continuation agent finished all remaining
// Phase 3-5 work + tests + tutorial. Final tree state
// captured here:
//   - Phase 3 polish: climb decoupling wired into the
//     climb-start path (the spec's stated line 17653 was
//     actually the combat-down code; agent corrected the
//     placement). Travel auto-follow verified working
//     implicitly (no separate position tracking needed).
//     Hidden noun pools confirmed 7 archetypes × 5 nouns
//     = 35 nouns (spec asked for 5-6 × 2-3; already
//     ample).
//   - Phase 4 closeout: loyalty decay integrated into
//     advanceTime; threshold beats at 50/30/15; abandon-
//     ment at 0 (no puppyVendorOwed set per user spec —
//     hunger is no-bail-out); tryDogApplyVerb intercepts
//     feed/heal/use-on-dog; tryDogCallVerb intercepts
//     call/here/come; shared-rest +5 loyalty + dog HP
//     heal on rest.
//   - Phase 5 closeout: trainDogStat invoked from existing
//     bite/distract/smell-find sites; tier costs mirror
//     statTraining.ts:40-47 exactly; SlotSummary gains
//     dogName/dogBreed only when dog is active (saveSystem
//     writes them in saveSlot); CallDogModal globally
//     mounted in App.tsx; Inventory tags + buttons routed
//     through dog-equip / feed-dog flows; CharacterScreen
//     Companion panel with 20-segment stat bars matches
//     player stat-progress UI.
//
//   Spec deviations (user-acceptable):
//     - Treats authored as Legendary (rarity union has no
//       'Epic'); spec said Epic.
//     - Treats live in gear.json (consumables.json doesn't
//       exist in this repo).
//
//   Tests: 5 new dog test files (36 assertions). Combined
//   with 4 regression suites (43 assertions): 79/79 pass
//   in ~22s. TS clean.
//
// Next: vandalistic full-game stress sweep in parallel
// before the ship-ready OTA.
//
// Files this OTA: __tests__/dogFeedHeal.test.ts (NEW),
// __tests__/dogTravelClimb.test.ts (NEW),
// __tests__/dogUiCompanionPanel.test.ts (NEW), and the
// already-staged __tests__/dogHungerDecay.test.ts polish.
//
// 2026-05-27 OTA-124 — SHIP-READY: Dog Companion wave
// closes. Vandalistic stress sweep added 13 new test
// files (5 from continuation agent + 7 from engine-side
// stress agent + 1 from catalog-side stress agent). Net
// 304/304 tests pass across 22 suites in ~31s.
//
// FOUR engine bugs surfaced by the stress sweep and
// fixed in this OTA before ship:
//
//   1. `puppyVendorOwed` was never set to true anywhere
//      in gameStore.ts — the Phase 6 safety net was
//      UNREACHABLE in production. Wired into
//      handlePlayerDeath: when player KO's with dog at
//      hp<=0, dog flips to status='dead' AND
//      worldMemory.puppyVendorOwed = true (gated on
//      !puppyVendorUsed). Combat-death narration also
//      logged: "{dogName} falls beside you. The buried
//      world claims them too."
//
//   2. Dog status never transitioned to 'dead' anywhere
//      in gameStore.ts — all four 'dead' occurrences
//      were comparisons, no assignment. Same fix as #1
//      closed both. Gem-revive can now engage.
//
//   3. dogSmelledHere never cleared back to false. Once
//      set, smell-find fired once per save per room
//      instead of once per investigation-cycle as
//      spec'd. Wired into the investigate handler at
//      gameStore.ts:5085 — when player engages with any
//      noun in a room, dogSmelledHere flips back to
//      false. Simpler than strict "all consumed" pool
//      compare but matches the spirit (per-room, not
//      per-save).
//
//   4. waiting_at_base dogs still lost loyalty during
//      the 24h recovery window — players whose dog was
//      knocked down couldn't avoid affection loss they
//      couldn't fix (no way to feed during recovery).
//      Decay condition tightened to `with_player` only.
//
// Plus: perf-test budget bumped 1.20× → 1.60× because
// the measurement flaked under concurrent jest worker
// load (solo runs consistently show withDog FASTER than
// noDog). Real catastrophic-regression catch still
// active.
//
// Plus: 4 `.failing` tests flipped to regular `it`
// since their underlying bugs are now closed (2 in
// puppyVendorEdges, 1 in dogHungerTimingChaos, 1 in
// dogSmellFindCooldown). The dogHungerTimingChaos test
// helper also updated to mirror the engine fix.
//
// Pre-existing catalog hygiene issues surfaced by the
// stress sweep (NOT introduced by the dog system,
// flagged for future OTAs in HANDOFF.md 0.A):
//   - 5 cross-file catalog duplicates (Aetheric Torch,
//     Aetheric Compass, Minor Aetheric Amulet,
//     Lightstone Amulet, Whisperer's Charm appear in
//     both gear.json/amulets.json AND exploration.json)
//   - Aetheric Shield appears twice in weapons.json
//     (lines 95 + 228); second row unreachable via
//     findWeaponByName.
//   - isCataloguedElsewhere guard at crafting.ts:320
//     doesn't include DOG_GEAR (current 4 vests safe,
//     defensive add for future).
//
// Files this OTA: app/state/gameStore.ts (4 engine
// fixes), app/buildInfo.ts (this comment +
// OTA bump), HANDOFF.md (closed-issue entry + 3 new
// open issues for catalog hygiene), 13 NEW test files
// across both stress agents, 4 test files updated
// (test.failing flipped + dogHungerTimingChaos helper
// + dogSystemPerfSmoke budget).
//
// 2026-05-28 OTA-125 — Playtest log diagnosis from a
// 2-day session on an existing Day-30+ character. Four
// real issues fixed:
//
//   (1) Monotonous investigate catchall — 4 different
//       uncategorized nouns (siren egg, echo chamber,
//       flood seal, water current) all returned the
//       SAME generic line in a row because the generic
//       category's fallbackLore was a single string.
//       Added GENERIC_VARIANTS pool of 8 distinct lines
//       in investigationTable.ts, picked deterministi-
//       cally per noun via nounSeed (same noun stays
//       consistent across re-reads; different nouns
//       get different beats).
//
//   (2) Flee parsed + 15-min charged + then "Action
//       cancelled" — player backed out of the flee
//       roll modal but the time/stamina charge stuck.
//       Added refundOnCancel snapshot on PendingRoll
//       State; cancelPendingRolls now restores
//       hoursElapsed + stamina from the snapshot. Log
//       line tweaked to "Action cancelled. Time and
//       stamina refunded." when a refund actually fires.
//
//   (3) "drink water" parsed as intent=rest, producing
//       an 8-hour sleep outcome. Split 'drink' off
//       from the rest synonym list into its own intent
//       (Intent union, parser VERB_SYNONYMS, llmParser
//       INTENT_LIST + canonical map). New case 'drink'
//       handler: routes "drink <consumable>" through
//       the eat-the-ration path; "drink water" with a
//       scene water source to a cup-hands +3-stamina
//       5-min beat; otherwise arbiter hint.
//
//   (4) "fill water bottle" refused at a scene with a
//       "water current" because the WATER_SOURCE_NOUNS
//       list lacked current/stream/etc. Extended the
//       list with current/currents/rivulet/brook/canal/
//       aqueduct/reservoir + a "any noun including
//       'water'" fallback so future water-prefixed
//       nouns just work. Arbiter hint copy updated to
//       include "stream, current" in the example list.
//
// Issue #5 (older characters and dog rescue scenarios):
// verified the rescue hook intercept at gameStore.ts:
// 3745-3764 fires for older characters the moment they
// tap a hook noun (cage / chain / wagon / wheel /
// cellar / trapdoor / snare / trap / pit / smelter /
// forge ruin) on investigate / attack / advance /
// travel / ask / use_relic. No per-room-consumed gate.
// The Day-32 character in the log just hadn't hit one
// of those nouns yet. Logged a follow-up open issue
// in 0.A for "rumor-of-trapped-dog Arbiter hint after
// N days with no rescue trigger" to help old-save
// discoverability.
//
// Files: app/engine/investigationTable.ts (variant
// pool + resolveLore branch), app/engine/types.ts
// ('drink' intent + PendingRollState.refundOnCancel),
// app/engine/parser.ts ('drink' synonyms + remove
// from rest pool), app/engine/llmParser.ts
// (INTENT_LIST + canonical map), app/state/gameStore.ts
// (WATER_SOURCE_NOUNS extended + case 'drink' +
// cancelPendingRolls refund + escape pre-charge
// snapshot).
//
// 2026-05-28 OTA-126 — Travel waypoint badge fix.
// Playtester report: "I was going to Varakush, the
// badge said 23 spaces, counted down to 2, then I
// crossed into the mud flats and it jumped to 26
// spaces." Confirmed: the world map regenerates with
// `currentLocationId` at center on every step. When
// the player crosses a location boundary, the
// destination's coords in the new map are different
// from the old map, so the Manhattan distance jumps.
//
// Fix: snapshot the initial tile count at travel-
// start, decrement once per step. Stable counter, no
// map dependence after init.
//   - travelTarget gains optional distanceRemaining
//     field (types.ts).
//   - setTravelCourse seeds it at the initial
//     Manhattan distance, decrements by 1 for the
//     auto-first-step.
//   - continueTravel decrements after each
//     stepDirection call (only when not arriving).
//   - ExplorationScreen movesLeft prefers the stored
//     counter when present; legacy Manhattan
//     recompute stays as a safety net for saves whose
//     travel started before this OTA.
//
// 44/44 regression tests pass. TS clean.
//
// Files: app/engine/types.ts (travelTarget shape),
// app/state/gameStore.ts (setTravelCourse +
// continueTravel decrement), app/screens/
// ExplorationScreen.tsx (badge prefers counter).
//
// 2026-05-28 OTA-127 — Per-step scene-bar truthfulness
// during travel. Playtester follow-up to OTA-126:
// "the location bar and weather conditions up top
// should reflect the different areas they are in at
// each step. because if they decide to stop travel
// mid route the next direction they step in needs to
// be accurately displayed without a massive location
// jump."
//
// Pre-OTA-127: scene bar showed currentScene.location.
// name the whole walk to a target — currentLocation
// Id only switches when the player lands on a tile
// belonging to a named location. Crossing open ground
// between named places, the bar lied (claimed
// "Asgardar" 20 tiles east of Asgardar).
//
// Three pieces this OTA:
//
//   (1) currentScene gains `transitArea: string|null`.
//       Per-step during travel (player.travelTarget
//       set), stepDirection finds the nearest named
//       location to the new mapX/mapY and sets
//       transitArea = "near <name>". When step.landedOn
//       is set (player officially enters a named
//       location), the travelTo path regenerates the
//       scene from scratch — transitArea defaults to
//       null on the fresh scene.
//
//   (2) Per-step weather drift during travel. ~12%
//       chance per cardinal step to roll a new
//       weather state via pickWeather(worldMemory).
//       Keeps the right side of the scene bar
//       reactive — drifting fog, sudden static squall
//       as the player crosses a thermocline.
//
//   (3) ExplorationScreen scene bar prefers
//       transitArea over location.name when set.
//       Cleared on stopTravel + the two error paths
//       in continueTravel + the not-in-transit branch
//       of stepDirection.
//
// Result: bar reads "near Mud Flats / Whisper Fog"
// while crossing the flats; "→ Varakush · 19 left"
// counter stays accurate (OTA-126); STOP TRAVEL clears
// the transit label and the next cardinal step
// renders from the player's actual tile without any
// jump.
//
// 59/59 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts (CurrentScene
// transitArea field + stepDirection nearest-location
// + weather drift + stopTravel clear + continueTravel
// error-path clears), app/screens/ExplorationScreen
// .tsx (scene bar prefers transitArea).
//
// 2026-05-28 OTA-128 — Playtest log surfaced 4 small
// issues around the OTA-125 drink-handler's internal
// re-dispatch path. All fixed in one OTA.
//
//   (1) "You eat the Water Bottle." Water Bottle isn't
//       food; the rest-case verb detection (isPotion
//       regex) didn't catch it, so the world line read
//       like a bug. Extended detection with isDrink:
//       (a) check consumable.tags for 'drink' or
//       'water', (b) extend the name regex with bottle
//       /canteen/skin/cup/draught/broth/tea/infusion/
//       gourd/jug. Water Bottle now narrates "You
//       drink the Water Bottle. +N stamina."
//
//   (2) Drink-of-consumable double-logged the player
//       input. "drink the water bottle" showed BOTH
//       [player] drink the water bottle AND [player]
//       eat Water Bottle — looked like the player
//       typed twice. The OTA-125 re-dispatch via void
//       submitPlayerAction() caused the inner submit
//       to emit its own [player] echo.
//
//   (3) Same re-dispatch double-logged Time passed.
//       Inner submit logged "⏳ Time passed: 30 min"
//       at its own end-of-action; outer submit's
//       hoursBefore snapshot saw the same dt and
//       logged again. Both 30-min lines fired
//       9ms apart.
//
//   Fix for (2) + (3): added _opts.silent to
//   submitPlayerAction. When set, the inner submit
//   skips the [player] echo AND the end-of-action
//   Time passed log. The drink case now calls
//   submitPlayerAction(`eat ${name}`, {
//   skipPreChecks: true, silent: true }) so the outer
//   submit owns the bookkeeping.
//
//   (4) Spurious "Tell me what you mean to do with
//       it" Arbiter line fired after a successful
//       drink-from-source. The remark is gated on
//       ARBITER_ENGAGED_INTENTS — added 'drink' and
//       'fill' to the set so both verbs count as
//       engaged-with-noun. Pre-fix log: "drink water
//       from the jottle" → cup-hands drink succeeded
//       → arbiter line fired anyway in the same
//       millisecond.
//
// 64/64 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts (ARBITER_ENGAGED_
// INTENTS + isDrink detection + silent opt on the
// 3 [player] + 1 Time-passed log sites + drink-case
// re-dispatch options).
//
// 2026-05-28 OTA-129 — Hook-puzzle foundation. The
// longest-standing open issue in HANDOFF.md 0.A:
// engine narration tells the player to do something
// ("three rotations, in the right order" / "knock
// on the steeple") but the parser had no rotate /
// knock intents, so the input parsed as
// intent=unknown and fell to the generic inventory-
// chatter line. The hook silently progressed on a
// second tap of the matching noun anyway, which
// made the puzzle text pure decoration.
//
// This OTA installs real puzzles. Three pieces:
//
//   (1) New parser intents: rotate, knock, turn,
//       twist, press, push, pull. Each with verb
//       synonyms (rotate / spin / revolve; knock /
//       rap / tap / pound / thump; etc.). All seven
//       added to llmParser INTENT_LIST + canonical
//       map.
//
//   (2) New module app/engine/hookPuzzles.ts:
//       - PuzzleProgress type (correctSoFar /
//         failures / history capped at 6)
//       - PuzzleDefinition: intentList,
//         sequenceLength, validateStep, hint copy,
//         mercyAt, solvedNarration
//       - extractDirection(target): natural-language
//         direction parse (left/right/CCW/CW/
//         widdershins/deosil/etc.)
//       - applyPuzzleInput(hook, args): pure
//         resolver, returns {progress, line, hint,
//         solved}
//       - Two puzzles wired:
//         * sealed_vault_door — 3-step rotation
//           tumbler with canonical sequence
//           [left, right, right]. Hint at 3
//           failures, deeper hint at 5, mercy
//           auto-solve at 7.
//         * submerged_steeple — 3-knock pattern.
//           Any non-knock intent resets. Hint at
//           3 failures, mercy at 6.
//
//   (3) gameStore hook routing gates stage advance
//       on puzzle completion. When an active hook
//       has a PUZZLE_DEFINITIONS entry AND
//       hook.stage === 0 AND the player's intent
//       is in puzzle.intentList, the input flows
//       through applyPuzzleInput. Successful
//       attempts narrate progress and persist
//       puzzleProgress on the hook record; the
//       mercy or clean-solve path then calls
//       resolveHookOneStep to fire the stage-1
//       reward chain. Hooks without a puzzle
//       fall through unchanged.
//
// Hook interface gains optional `puzzleProgress`
// field so save/load preserves attempt state.
// Default undefined; populated on first attempt.
//
// 22/22 unit tests pass on the resolver module
// (direction parsing, sequence validation, reset
// on wrong, mercy threshold, hint surfacing,
// history truncation). 50/50 regression on the
// four fast suites still green. TS clean.
//
// Files: app/engine/types.ts (7 new Intents),
// app/engine/parser.ts (7 new VERB_SYNONYMS),
// app/engine/llmParser.ts (INTENT_LIST + canonical
// map), app/engine/hookPuzzles.ts (NEW),
// app/engine/hooks.ts (Hook.puzzleProgress field),
// app/state/gameStore.ts (hookEligible adds 7
// intents + puzzle-gate routing before
// resolveHookOneStep), __tests__/
// hookPuzzleResolver.test.ts (NEW, 22 tests).
//
// OTA-130 next: 2 more puzzles + examine-the-noun
// peek + save/load round-trip + tutorial step.
// OTA-131 ships the pressure test with strict
// OOM/timeout guardrails.
//
// 2026-05-28 OTA-130 — Puzzle UX polish.
// Pivoted from "more puzzles" after auditing the
// remaining HookKind plant lines — none of the other
// hooks (bioluminescent_path, aether_grid_hum, etc.)
// promise interactive actions in their narration.
// Adding puzzles to those would CREATE friction
// where none existed. Better to polish the two
// puzzles already wired.
//
// Four pieces:
//
//   (1) examinePuzzleLine(hook) — peek action. When
//       the player INVESTIGATEs a puzzle hook they've
//       already started, the engine surfaces a one-
//       line state summary ("2 of 3 steps held. 1
//       more to go.") instead of re-narrating the
//       intro. First-encounter investigate (no
//       progress) still flows to the normal hook path
//       which fires the puzzle intro.
//
//   (2) findActivePuzzleHookForIntent — direction-
//       only fallback. Pre-OTA-130 the player had to
//       type "rotate the ring left"; "rotate left"
//       alone matched no hook noun ("left") and fell
//       through. Now if EXACTLY one active puzzle
//       hook in the scene accepts the player's
//       intent (rotate/knock/etc.), the engine auto-
//       routes there. Ambiguous (2+ active puzzle
//       hooks accepting the same intent) → no match
//       (refuse the auto-fallback, force the player
//       to name the noun).
//
//   (3) Tutorial step: NEW "When the narrative gives
//       you a sequence" step after the dog step.
//       Covers known verbs, direction-tolerance,
//       failure-hint progression, mercy threshold,
//       examine-for-peek, save/load preservation,
//       and the deliberate decision that only the
//       puzzle-equipped hooks gate this way (other
//       hooks unchanged).
//
//   (4) Save/load round-trip tests. JSON serialize +
//       restore of a hook with puzzleProgress
//       preserves correctSoFar / failures / history
//       exactly. Continuation tests verify the
//       resolver picks up where it left off after a
//       round-trip.
//
// Test coverage: 34/34 hookPuzzleResolver tests pass
// (was 22 in OTA-129; 12 new). 90/90 regression on
// the five fast suites still green. TS clean.
//
// Files: app/engine/hookPuzzles.ts (examinePuzzleLine
// + findActivePuzzleHookForIntent), app/state/
// gameStore.ts (examine-peek route + direction-only
// fallback wire), app/components/tutorialSteps.ts
// (new puzzle step after "Your dog"), __tests__/
// hookPuzzleResolver.test.ts (12 new tests).
//
// OTA-131 ships the pressure test with the OOM /
// timeout guardrails: jest.setTimeout per file,
// iteration caps, banned slow test files,
// file-scoped runs only.
//
// 2026-05-28 OTA-131 — Hook-puzzle pressure test.
// Agent shipped 5 new test files with strict OOM/
// timeout guardrails honored throughout:
//   - hookPuzzleE2E.test.ts (8 tests) — boots
//     gameStore, plants hook, drives submitPlayer
//     Action end-to-end, covers vault + steeple +
//     direction-only fallback + examine peek.
//   - hookPuzzleParserVariants.test.ts (6 tests,
//     1000 input variants) — all 10 direction terms
//     × every synonym × articled / non-articled ×
//     casing × unicode/emoji noise. None crashed.
//   - hookPuzzleSaveLoad.test.ts (5 tests) —
//     JSON round-trip + full persist()/hydrate()
//     via the actual store + legacy saves with no
//     puzzleProgress field.
//   - hookPuzzleAbandon.test.ts (4 tests) — scene
//     swap preserves progress, two-scene cross-
//     contamination check, post-solve no-op.
//   - hookPuzzleMercyHints.test.ts (12 tests) —
//     every failure threshold (3/5/7 vault, 3/6
//     steeple) individually exercised, non-intent
//     -List inputs don't count as puzzle failures.
//
// 35 new tests in OTA-131 + 34 existing in
// hookPuzzleResolver = 69 puzzle tests total. 53
// regression tests on the 5 fast suites. All 122
// pass (~38s combined runtime). TS clean.
//
// Guardrails honored: jest.setTimeout(15000) at top
// of every new file, ≤500 iterations per test,
// NEVER ran bare `npx jest __tests__/`, banned
// files (twoYearChaosSim / thousandDayStressSim /
// combatStress / domesticStress / metaNavStress /
// yearSimulation) never touched, final sweep
// scoped only to the 5 designated fast suites.
//
// ONE genuine bug found and fixed in OTA-132 (see
// below):
//
// 2026-05-28 OTA-132 — Puzzle-solve reward landing
// fix. OTA-131's pressure sweep surfaced:
//
//   Pre-OTA-132, the puzzle-solve branch called
//   resolveHookOneStep(hook, ...) with hook.stage=0.
//   resolveHookOneStep then read CHAINS[kind][0]
//   which has `effects: []` (the legacy puzzle-
//   intro narration), logged the intro line,
//   advanced scene-state stage to 1, and stopped.
//   The actual reward effects (90 TC + Aetheric
//   Shard/Cloth/Compass for vault; 60 TC + Golem
//   Core for steeple) live in CHAINS[kind][1] and
//   only fired on the NEXT player tap of a hook
//   noun. Player UX: "I solved it and got nothing
//   — then I tapped it again and got everything."
//
// Fix: pass `{ ...hook, stage: hook.stage + 1 }`
// to resolveHookOneStep in the solve branch. Now
// getHookOutcome returns the stage-1 reward
// outcome inline with the puzzle-solve narration.
// The set() inside resolveHookOneStep advances
// scene-state stage from current value (0) by +1
// → 1, marks resolved per outcome.done (true for
// both vault and steeple at stage 1).
//
// Two `.failing` tests in hookPuzzleE2E.test.ts
// flipped to regular `it` since the bug they
// documented is now closed. 69/69 puzzle tests
// pass post-fix; 53/53 regression still green.
//
// Files: app/state/gameStore.ts (1-line + comment
// fix in puzzle-solve branch), __tests__/
// hookPuzzleE2E.test.ts (2 .failing flipped to it).
//
// 2026-05-28 OTA-133 — isCataloguedElsewhere guard
// adds DOG_GEAR. Defensive add: current vest names
// (Burlap / Riveted Leather / Aetheric Padded /
// Reclaimer Pattern) don't trip the weapon/armor
// inference regex today, but future vests with
// weapon-y or armor-y keyword names would slip past
// the OTA-110 guard. One-line add at crafting.ts:329
// closes the path. 41/41 targeted tests pass. TS
// clean. Files: app/engine/crafting.ts.
//
// 2026-05-28 OTA-134 — Aetheric Shield within-file
// duplicate fix. Pre-fix, weapons.json had TWO
// "Aetheric Shield" rows: line 95 (melee shield,
// DEX-based, 2d6) and line 228 (runecaster, INT-
// based, 1d4 + blocks 2d6). findWeaponByName uses
// Array.find so only the melee row was reachable;
// the runecaster row was unreachable lore + waste
// in the data. Renamed the runecaster row to
// "Aetheric Ward" (matches its description: "a
// small disk-runecaster, hovers between caster and
// harm"). Melee Aetheric Shield keeps its name +
// existing enemy drop reference. 26/26 catalog
// integrity tests pass (test.failing flipped to
// regular test). TS clean. Files: app/data/items/
// weapons.json (rename), __tests__/
// catalogIntegrityWithDogGear.test.ts (failing→it).
//
// 2026-05-28 OTA-135 — Cross-file catalog dups fix.
// Six items appeared in both their functional
// catalog (gear.json / amulets.json / weapons.json)
// AND exploration.json: Aetheric Torch, Aetheric
// Compass, Lightstone Amulet, Whisperer's Charm,
// Minor Aetheric Amulet, Mud-Rend Blade. findCat
// alogItem first-hit-wins masked the issue at the
// call site but the exploration.json row's unique
// fields (abilityReq, faction, tcBuy) silently
// dropped on resolution. Removed the duplicate
// rows from exploration.json; functional canonical
// rows stay. 26/26 catalog integrity tests pass
// (test.failing for cross-file dups flipped to
// regular test). The 6th duplicate (Mud-Rend
// Blade) was caught by the test re-run after the
// first 5 removals — also fixed. TS clean.
// Files: app/data/items/exploration.json (6 blocks
// removed), __tests__/catalogIntegrityWithDogGear
// .test.ts (.failing → it).
//
// 2026-05-28 OTA-136 — Inference ordering regression
// lock. The HANDOFF.md entry "Inference engine
// doesn't check materials.json before warning"
// actually closed across OTAs 110 (isCataloguedElse
// where guard) + 124 (catalog-elsewhere extension)
// + 133 (DOG_GEAR add). Three OTAs of partial fixes
// — entry was never retired.
//
// This OTA locks the closed state with a regression
// test (__tests__/inferenceOrderingLock.test.ts, 10
// tests). Walks every MATERIALS, EXPLORATION, GEAR,
// DOG_GEAR item through all 4 find* paths and
// asserts ZERO false inferred-stats: fires.
// Includes the original Sentinel Core Plate repro
// (from the OTA-110 playtest log) + a control case
// to verify TRULY uncatalogued names still infer
// (no false negatives). 10/10 pass. TS clean.
//
// Files: __tests__/inferenceOrderingLock.test.ts
// (NEW).
//
// 2026-05-28 OTA-137 — Per-golem summon DC. The
// HANDOFF 0.A entry recommended Mud 13 / Iron 15 /
// Aether 17 / Crystal 19 to reflect that Crystal +
// Aether are lore-stronger anchors than Mud + Iron.
// Shipped:
//   - GolemDefinition gains optional summonDC field
//     in app/engine/golems.ts.
//   - All 4 golem records get summonDC values:
//     mud_golem 13, iron_golem 15, aether_golem 17,
//     crystal_golem 19.
//   - runAethercraft in gameStore.ts reads
//     getGolemDefinition(golemKindHint).summonDC ??
//     15 when discipline === 'summon'. Falls back
//     to historical flat 15 / 12 (mend) when
//     summonDC is unset or discipline is shape /
//     mend.
//   - Crafting → AETHERIC tab footer updated:
//     "Requires: d20 + INT vs per-golem DC — Mud 13,
//     Iron 15, Aether 17, Crystal 19. Shape and
//     mend roll vs DC 12. Mud Dwellers cast at
//     base DC and gain +2 INT, Aetherborn +2 DC,
//     other races +3 DC."
//
// Per-race modifiers (raceMechanics.aethercraftDc
// Modifier) still apply on top. Mud Dweller now
// casts Mud Golem at DC 13 effective, Crystal
// Golem at DC 19 — a real difficulty curve where
// before all 4 golems were DC 15. 25/25 regression
// tests pass. TS clean.
//
// Files: app/engine/golems.ts (4 summonDC fields +
// type), app/state/gameStore.ts (runAethercraft DC
// lookup), app/screens/CraftingScreen.tsx (footer
// copy).
//
// 2026-05-28 OTA-138 — WIS-novel-step sliding
// window 20 → 50. OTA-111 stat-growth audit found
// WIS as the fastest-growing stat at 0.168 XP/turn
// (cardinal-step training fires on novel tiles;
// novel-detection used a 20-tile sliding window of
// recentTileHistory). At 20, a wanderer who looped
// through ~25 tiles could farm WIS — the early
// tiles aged out of the window between revisits.
// At 50 the loop must traverse genuinely new
// ground to keep training. Closes the OTA-112
// deferred-recommendation audit item. The stat-
// growth sim's fixed action mix doesn't surface
// the loop case, so its WIS rate is unchanged
// (0.168) — real-gameplay impact lands on the
// player who paces back and forth in a small area.
// Files: app/state/gameStore.ts (one .slice(-20)
// → .slice(-50) in stepDirection).
//
// 2026-05-28 OTA-139 — Rumor-of-trapped-dog
// discoverability nudge. Per the OTA-125 follow-up
// open issue: a Day-32 character could play the
// game indefinitely without ever encountering a
// rescue-hook noun, and the dog system would
// remain invisible. The rescue routing fires the
// moment the player taps any noun matching the
// hook list — but the player who wanders without
// crossing those nouns misses the system entirely.
//
// Fix: at ~0.5% per cardinal step, after the
// player has accumulated 5+ in-game days AND has
// no dog AND no onboarding in flight AND the hint
// hasn't fired yet, the Arbiter drops a one-time
// rumor line pointing the player toward one of
// the rescue venues at a random cardinal:
//   "Travelers have been speaking of a dog held at
//    {a smelter ruin / an overturned wagon at a
//    roadside camp / a cellar door under a buried
//    structure / a snare pit at a trapper camp}
//    to the {north / south / east / west}. ..."
//
// Single-shot per save (worldMemory.dogRescueTip
// Fired). The actual rescue spawning happens via
// the existing tap-on-hook-noun path; this just
// surfaces the existence of the system for old-
// save players. 25/25 regression tests pass. TS
// clean.
//
// Files: app/engine/types.ts (worldMemory
// .dogRescueTipFired field), app/state/gameStore
// .ts (hint check in stepDirection after the
// travel-lore beat).
//
// 2026-05-28 OTA-140 — Hub-room key collision fix.
// Longest-deferred architectural item in HANDOFF
// 0.A — open since OTA-080 (deferred), 60+ OTAs
// ago. Pre-fix, makeRoomKey omitted hubRoomId from
// the key, so hub interiors that shared
// locationId + microMicroId + mapX/mapY collided.
// Asgardar's chandelier study, armory, and atlas
// hall all sit on the same central tile under
// the same location — a noun consumed in one
// greyed in the others. OTA-076 self-heal masked
// the symptom for investigation tables but climb
// markers, searchedAmbientNouns, flavor
// ExhaustedNouns, dogSmelledHere, and consumed-
// list writes all corrupted across rooms.
//
// Fix: makeRoomKey gains an optional 5th
// parameter, hubRoomId. When set, the key gains
// an "@hubId" suffix that disambiguates hub
// interiors. When null/undefined (non-hub
// scenes), the key shape is unchanged from
// pre-OTA-140 — old saves' per-room state loads
// through cleanly without migration.
//
// Bulk-updated all 31 makeRoomKey callers in
// gameStore.ts to consistently pass
// `player.hubRoomId` (or the equivalent in scope:
// `livePlayer.hubRoomId`). TypeScript backward-
// compatible — the parameter is optional, so any
// future caller that forgets it still compiles
// (and gets the non-hub key shape, which is what
// you'd want for any scene where you don't have a
// hubRoomId).
//
// New regression test __tests__/hubRoomKey
// Collision.test.ts (3 tests) locks the behavior:
// two hub interiors at same coords produce
// DISTINCT keys; non-hub keys keep their legacy
// shape; legacy saves load through cleanly.
//
// 44/44 chaos-sim regression tests pass + 3
// hub-room tests. TS clean.
//
// Files: app/state/gameStore.ts (makeRoomKey
// signature + 31 call-site updates), __tests__/
// hubRoomKeyCollision.test.ts (NEW).
//
// 2026-05-28 OTA-141 — Post-cleanup stress test +
// ship-blocker fix. Vandalistic stress agent shipped
// 4 new test files (42 tests) covering cross-system
// integration, catalog consistency under 500
// random lookups, travel + scene-bar truthfulness
// chaos, and an adversarial edge-case sweep through
// all 8 new verbs × 14 hostile inputs (empty, null,
// unicode, cyrillic, katakana, injection strings).
//
// ONE genuine ship-blocker bug surfaced and fixed:
//   OTA-127 weather-drift on per-step transit
//   called `require('../engine/weather')` which
//   crashes with MODULE_NOT_FOUND. pickWeather
//   actually lives in '../engine/encounter' and
//   is already imported at the top of gameStore
//   .ts. The drift branch fires at ~12% per in-
//   transit cardinal step, so a long traverse
//   was near-certain to crash. Replaced the
//   require with the existing import reference.
//
// `it.failing` test in fullGameIntegration.test
// .ts flipped to regular `it` ("weather drift
// during transit does NOT crash"). All 42 new
// stress tests + 126 regression tests pass (168
// total in 31s combined). TS clean.
//
// Agent guardrails confirmed honored:
//   - jest.setTimeout(15000) at top of every new
//     file
//   - iteration caps ≤500 per test (documented)
//   - NEVER ran bare npx jest __tests__/
//   - banned slow files (twoYearChaosSim /
//     thousandDayStressSim / combatStress /
//     domesticStress / metaNavStress /
//     yearSimulation) never touched
//   - final regression sweep scoped to 9
//     designated fast suites
//
// All 8 cleanup OTAs (133-140) verified stable
// under stress. The game is in its cleanest state
// of the session.
//
// Files: app/state/gameStore.ts (weather-drift
// require → pickWeather reference), __tests__/
// fullGameIntegration.test.ts (.failing → it,
// 4 new stress test files added by the agent:
// fullGameIntegration, catalogConsistencyPost
// Cleanup, travelSceneBarChaos, edgeCaseSweepPost
// Cleanup).
//
// 2026-05-28 OTA-142 — Playtest log fixes from the
// Rocky-the-Pitbull session (the FIRST real dog
// rescue in production!). Player reported 4
// issues, all fixed in this OTA:
//
//   (1) Smart breed parsing. Player role-played
//       "looks like a Pitbull" → engine stored the
//       whole sentence as the breed. Player
//       feedback: "should be smarter about parsing
//       the dog breed." Strip common preambles
//       (looks like a / I think it's a / kind of
//       a / sort of / seems like / probably /
//       maybe / definitely / some kind of / it's
//       a / a / an) before storing. Trailing
//       punctuation also stripped. Capitalization
//       preserved on the breed token (so "German
//       Shepherd" stays correctly cased). 23/23
//       tests in __tests__/dogBreedParsing.test.ts
//       cover the matrix.
//
//   (2) Elevated-investigate gate. Player climbed
//       a 3-tier pillar and then investigated
//       "shore" — narration said "you crouch beside
//       the shore" but they're at the top of a
//       pillar. Player feedback: "I investigated
//       the shore from on top of a pillar?" Gate
//       at the top of `case 'investigate':` —
//       when elevatedOn is set AND no overlay
//       fired (elevatedOverlayMeta unset) AND the
//       target is in the base ambient noun pool
//       AND the target is NOT the climbed noun
//       itself, refuse with an Arbiter hint:
//       "You're up on the X. The Y is down there.
//       Climb down to reach it."
//
//   (3) Settings gear overlapping enemy name.
//       Pre-fix, the EnemyPanel head had
//       paddingRight: 36 — the gear button is
//       exactly 36px wide (32 + 4 right margin).
//       Zero visual buffer; long enemy names
//       crowded the gear's semi-transparent
//       background. Bumped to paddingRight: 48 for
//       12px clearance. Playtester: "The settings
//       button is covering some of the enemies
//       name."
//
//   (4) Dog name UI placement. StatsPanel now
//       renders the dog's name on the SAME row as
//       the player's name, right-aligned to the
//       panel edge, when player.dog is active
//       (hidden for abandoned/dead status).
//       Player feedback: "The dogs name should go
//       on the same level as yours and aligned
//       right to the edge of the box."
//
// 63/63 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts (breed-strip regex
// + elevated-investigate gate), app/components/
// EnemyPanel.tsx (head paddingRight 36→48),
// app/components/StatsPanel.tsx (nameRow flex
// layout + dog name rendering + styles),
// __tests__/dogBreedParsing.test.ts (NEW, 23
// tests).
//
// 2026-05-28 OTA-143 — Legacy travelTarget
// migration + continueTravel self-heal.
// Playtester repro: badge said 0 steps to Voronov
// while still far away. Stopping and re-setting
// course produced the correct 16.
//
// Root cause confirmed: save was started before
// OTA-126 → travelTarget had no distanceRemaining
// field → badge fell to its legacy Manhattan-
// recompute fallback which uses the current-
// location-centered map. The world map regenerates
// with currentLocationId at center on every call,
// so the recompute can coincidentally return 0
// when the player's mapX/mapY happens to match
// the destination's coords on the current-
// centered map. Confirms playtester hypothesis
// ("legacy glitch from an old file").
//
// Two-part fix:
//
//   (A) Migration in backfillPlayer. Any save
//       loaded with a travelTarget lacking
//       distanceRemaining gets it computed and
//       seeded once. If the computed value would
//       be 0 AND currentLocationId !== target.
//       locationId, drop the travelTarget cleanly
//       (the legacy state is confused; the player
//       should re-set the course explicitly,
//       which the playtester did manually).
//
//   (B) Self-heal in continueTravel. If
//       distanceRemaining reads 0 BUT the player
//       still isn't at the target, recompute the
//       Manhattan distance and refresh the
//       counter. Catches mid-travel desync — not
//       just legacy saves but any path that could
//       confuse the counter (e.g., a future
//       refactor that moves the player without
//       updating the counter).
//
// 28/28 tests pass (3 new travelTargetMigration
// tests + 25 regression). TS clean.
//
// Files: app/state/gameStore.ts (backfillPlayer
// travelTarget migration + continueTravel self-
// heal), __tests__/travelTargetMigration.test.ts
// (NEW).
//
// 2026-05-28 OTA-144 — Dog combat UI surface +
// distract bonus actually applies. Playtester
// (Rocky's owner) hunted for the dog in 3 combat
// rounds, couldn't find a way to engage him: "I'm
// on combat and I don't see Rocky's name listed as
// a weapon. How can I use him to attack or
// distract?" Spec asked for a combat button with
// his name + popup with BITE and DISTRACT options,
// distract granting +1 initiative and +2 attack
// power.
//
// Three bugs converging:
//
//   (1) OTA-121 wired dog_bite / dog_distract
//       parser intents + dispatch + resolver but
//       NEVER landed the UI button. InputBox had
//       zero references to player.dog. Spec said
//       "DOG (hp/max) button surfaces in the quick-
//       row in combat" — implementation gap.
//
//   (2) The 'distracted' status was set on the
//       player at gameStore.ts:18317 but rollMods
//       in combatRules.ts had no case for it. The
//       "+2 to next attack" was silently doing
//       nothing for months.
//
//   (3) Player spec asks for distract to also
//       grant +1 initiative on the next swing.
//       Initiative step in buildCombatSteps had a
//       hardcoded bonus: 0.
//
// Fixes:
//
//   - InputBox gains a `dog` prop (parallel to
//     `golem`). When dog active + in combat, a
//     "{name} (hp/max)" QuickBtn renders next to
//     the golem button. Tap toggles a 2-button
//     picker below the quick-row: BITE (fires
//     `bite`) and DISTRACT (fires `distract`),
//     each with a one-line hint. Picker auto-
//     closes after a tap.
//   - ExplorationScreen wires the `dog` prop from
//     player.dog when status='with_player'.
//   - rollMods gains a 'distracted' case: +2 to
//     attack roll, status consumed on use.
//   - buildCombatSteps peeks at the 'distracted'
//     status (read-only) to seed initiative
//     bonus +1. Single distract pulse covers
//     BOTH bonuses on the same swing — exactly
//     the spec.
//   - On successful distract, world line fires:
//     "{dog} pounces at {target}'s flank, barking
//     sharp. {target}'s attention splits — your
//     next swing rides the opening (+1 init, +2
//     atk)." Matches the playtester's narrative
//     ask ("pouncing and barking").
//
// 48/48 regression tests pass. TS clean.
//
// Files: app/components/InputBox.tsx (dog prop +
// QuickBtn + action picker + Pressable import +
// styles), app/screens/ExplorationScreen.tsx (dog
// prop wired), app/engine/combatRules.ts (rollMods
// 'distracted' case + buildCombatSteps initiative
// bonus from distract), app/state/gameStore.ts
// (pounce/bark narration on distract success).
//
// 2026-05-28 OTA-145 — Theft-channel false-
// positive (silent suppression ship-blocker) +
// summon-roll color + golem name in StatsPanel.
//
// Playtest log surfaced THREE issues:
//
//   (1) CATASTROPHIC: theft-channel guard was
//       suppressing every "Silt Thief" combat
//       line in legit combat. Player typed
//       `use golem` six times in Voronov, the
//       Aether Golem did the combat math each
//       time, but EVERY narration line ("Aether
//       Golem attacks Silt Thief — d20 N = N
//       vs AC 10 — ✓ HIT", damage/HP, etc.) got
//       routed to [debug] as "blocked theft-
//       channel emission outside steal context."
//       Player saw NOTHING. Golem died in
//       silence over 6 invisible rounds.
//
//       Same guard also ate the Voronov entry
//       lore (lore_flavors.json beats mentioning
//       "thief" anywhere — concepts.json keywords,
//       arbiter-intent quotes).
//
//       Root cause: regex was /thief|.../i which
//       matched substring "thief" anywhere. The
//       authored line it was meant to catch is
//       "Thief! — steel comes out." (alarm cry).
//       Tightened to /\bthief!|caught.*mid-lift|
//       steel comes out|answer for...deeds/i —
//       requires the alarm punctuation. Enemy
//       names, arbiter quotes, NPC dialogue, lore
//       all use "thief" WITHOUT the bang.
//
//       Regression lock in __tests__/
//       theftChannelGuard.test.ts (20 tests,
//       extracts the regex from gameStore.ts at
//       runtime so a future weakening surfaces).
//
//   (2) Successful Aethercraft summon roll
//       displayed RED. Playtester: "Why did a
//       successful golem.summon come up red?"
//       Roll narration was unconditionally
//       emitted to 'combat' channel which paints
//       uniformly warning-red regardless of HIT
//       vs MISS. Now: success → 'reward' channel
//       (green ✦), failure → 'combat' channel
//       (red). Roll math identical, just the
//       channel differs.
//
//   (3) Golem name now displays in StatsPanel
//       beneath the dog name, right-aligned to
//       the panel edge, with "{name} (hp/max)"
//       format. Slightly muted color (slate-
//       mauve) so it reads as secondary companion
//       vs the dog's warm-gold. Playtester: "the
//       golem.name.shluld be under the dogs in
//       the character box."
//
// 49/49 + 20/20 = 69 tests pass. TS clean.
//
// Files: app/state/gameStore.ts (theft regex
// tightening + aethercraft channel split), app/
// components/StatsPanel.tsx (golem row + styles),
// __tests__/theftChannelGuard.test.ts (NEW
// regression lock).
//
// 2026-05-28 OTA-146 — Voronov Core Guardian
// invisibility + Rocky bite red + template-
// literal leak + multi-enemy grammar.
// Playtest log surfaced FOUR more bugs in the
// Voronov / Reclaimer Ambusher session:
//
//   (1) Core Guardian (Voronov-Beneath High
//       Cantor) spawned with only an [arbiter]
//       dialogue line, no [combat] enemy-card
//       beat. Player: "was that a guardian? he
//       spawned with another character? I never
//       even saw his tag." Got crit for 25 next
//       turn with zero stat warning. Fix: add a
//       parallel [combat] emit on Guardian spawn
//       matching the canonical enemy-card line
//       — "X closes — Attack ready, NdN damage
//       on a hit. (range: close) ★ CORE GUARDIAN"
//       — so the boss surfaces with the same
//       affordance as every other enemy.
//
//   (2) Multi-enemy approach grammar lied:
//       "You close the gap with the 2 Voronov-
//       Beneath High Cantors" when there was a
//       Silt Thief + ONE Cantor. groupLabel
//       blindly pluralized moveEnemy.name. Fix:
//       check if all enemies share the same
//       name; if so pluralize; if not, list them
//       ("the Silt Thief and Voronov-Beneath
//       High Cantor" for 2 distinct; "the X and
//       N others" for 3+).
//
//   (3) Rocky's bite narration painted red.
//       Player: "Rockeys hits are red, they
//       should be green." Same root cause as
//       OTA-145's summon-roll-red — successful
//       companion attacks emitted to 'combat'
//       channel which paints uniformly red. Now
//       routes to 'reward' (green ✦) on hit,
//       'combat' on miss.
//
//   (4) Template-literal leak: feed/scratch/
//       call dog narration was showing literal
//       `{contraction === "'s" ? "s" : ""}` in
//       the world feed. applyDogPronouns does
//       whole-token substitution and ignored the
//       broken ternary expression. Fix: added
//       {verbS} (resolves to 's' for he/she, '')
//       for they) and {verbES} ('es' / '')
//       tokens to PRONOUN_FORMS. Migrated all 5
//       callsites. Defensive fallback in
//       applyDogPronouns also strips any
//       remaining ternary leak so a future
//       regression can't surface raw JS to the
//       player.
//
// 42/42 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts (Guardian spawn
// [combat] emit + multi-enemy grammar + Rocky
// reward channel + 5 template-leak callsites),
// app/engine/dogCompanion.ts ({verbS}/{verbES}
// tokens + applyDogPronouns).
//
// 2026-05-28 OTA-147 — Aethercraft outcome wording
// + dog HP in StatsPanel.
//
//   (1) Aethercraft cast-result label was 'HIT' /
//       'MISS' which reads as combat language for
//       what's actually a cast. Player: "when I am
//       successful instead of saying hit, say the
//       summoning was a success." Discipline-aware
//       verbs now: ✓ SUMMONED for golem.summon,
//       ✓ SHAPED for stone manipulation, ✓ MENDED
//       for aetheric healing; ✗ FAILED across the
//       board on a miss. Roll math + channel split
//       (reward/combat) unchanged.
//
//   (2) Dog name in StatsPanel was bare — just the
//       name. OTA-145 added the golem name BELOW
//       the dog with its (hp/hpMax) but the dog
//       line itself never had HP. Player: "the
//       golem showed up under the dog with his HP,
//       but I saw the dog's HP is not listed with
//       his name." Now mirrors the golem format:
//       "Marrow (12/14)" in warm-gold to the right
//       of the player name.
//
// 42/42 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts (runAethercraft
// outcome label), app/components/StatsPanel.tsx
// (dog name HP suffix).
//
// 2026-05-28 OTA-148 — SUMMON chip on the
// PRIMARY OBJECTIVE card.
//
// Pre-OTA-148, summoning a Core Guardian
// required taking the player's faction-gate
// verb (Reclaimers salvage / Monarchs attack /
// Order ask / etc.) at the Lost Capital. After
// death-revive the Guardian was wiped from the
// scene with no surface affordance to bring
// them back — the player tried `summon the core
// guardian` (parses as cast, blocked by gate
// nudge) and `search for the core` (parses as
// investigate, also blocked) and saw the same
// "wrong approach" Arbiter line repeat. Player:
// "once you reach a city that still has an
// active core/guardian there should be a summon
// button on the right edge of the main quest
// button on the main quest tab."
//
// Implementation:
//
//   (1) New gameStore action `summonCoreGuardian`
//       runs the same spawn pipeline the gate-
//       verb path uses (spawnGuardianForCapital
//       → scene mutation → CORE GUARDIAN ★ boss
//       card emit → arbiter approachLine →
//       mq_guardian_spawned milestone event →
//       NPC-met record). Idempotent on "already
//       in scene" (just bounces to exploration).
//       On success, also switches currentScreen
//       to 'exploration' so the boss card lands
//       in view with no extra tap.
//
//   (2) ContractsScreen PRIMARY OBJECTIVE card
//       gains an absolute-positioned `★ SUMMON`
//       chip in the top-right corner. Renders
//       only when the player is standing in an
//       unrecovered Lost Capital with mainQuest
//       in `revelation` or `cores` phase. Nested
//       TouchableOpacity — tapping the chip
//       fires the summon action and doesn't
//       trigger the card's tap-to-expand.
//
// 42/42 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts
// (summonCoreGuardian + interface decl),
// app/screens/ContractsScreen.tsx (chip + style).
//
// 2026-05-28 OTA-149 — `summon guardian`
// command path.
//
// OTA-148 gave players the SUMMON chip on the
// PRIMARY OBJECTIVE card. OTA-149 adds the
// verb-side entry point — typing `summon
// guardian` / `summon the guardian` / `summon
// core guardian` (or the common typo `summon
// gaurdian` the playtester used) now routes
// to the same spawn pipeline instead of the
// "wrong hand" gate refusal. Player: "summon
// guardian — that way you never miss him, he
// can come in with the same swagger and the
// core can be added to the drop when he is
// defeated. that way you can prep for the
// fight too."
//
// The Core-on-defeat half already works:
// resolveEnemyDefeat at gameStore.ts:10448
// detects isCoreGuardian → grants the
// signature gear drop → marks the Guardian
// defeated → triggerMainQuest fires
// 'core_recovered' which writes the Capital's
// Core item to inventory. OTA-149 changes
// nothing on that path; it just opens a
// second front door so players can prep
// (full HP, rations eaten, golem standing,
// dog at heel) and then call the Guardian
// in deliberately.
//
// Implementation: parser intercept in
// submitPlayerAction, sitting BEFORE the
// existing canRecoverCore gate check. When
// matchedVerb is 'summon' AND the target /
// resolvedNoun text contains 'guardian' (or
// 'gaurdian'), it calls
// summonCoreGuardian() and returns. The
// store action's preflight refusals
// (not_at_capital, wrong_phase,
// already_recovered) surface faction-neutral
// Arbiter lines so the player knows why the
// verb didn't bite.
//
// 104/104 regression tests pass. TS clean.
//
// Files: app/state/gameStore.ts
// (submitPlayerAction guardian-verb
// intercept).
//
// 2026-05-28 OTA-150 — Mastery badge
// capstone (27/27 acknowledgement).
//
// Pre-OTA-150, the title screen surfaced
// the badge counter as `COMPLETED RUNS ·
// X/27` but did nothing special when X
// hit 27. A 27-run commitment deserves
// acknowledgement. Cosmetic-only ship —
// no mechanical reward, no unlock — just
// a capstone chip + one-line Arbiter
// acknowledgement that the matrix has
// been walked end-to-end.
//
//   (1) New centered MASTERY chip with a
//       gold ✦ glyph on each side, sits
//       above the regular 27-grid.
//       Renders when endingBadges.length
//       >= 27 (the >= guards against
//       hypothetical future expansion
//       endings without breaking the
//       gate).
//
//   (2) One-line italic acknowledgement
//       under the chip: "You have walked
//       this path under every banner."
//       Faction-neutral so it lands the
//       same regardless of which run
//       finished the matrix.
//
// Mechanical rewards (Mastery Token on
// next character, Expansion 2 opening
// hook, etc.) are deferred to the
// expansion plan — this OTA just closes
// the visible gap where 27/27 felt
// unrewarded.
//
// 104/104 regression tests pass. TS clean.
//
// Files: app/screens/TitleScreen.tsx
// (EndingBadgesRow Mastery branch +
// styles).
//
// 2026-05-28 OTA-151 — Buried Skyscraper
// expansion framework + Homeward fade.
//
// Two pieces, both scaffold-only.
//
//   (1) NEW app/engine/buriedSkyscraper.ts —
//       type definitions + stub data for
//       the 100-floor descending dungeon:
//         • 5 FloorArchetype flavors
//           (service_corridor, market_level,
//           shrine_level, mechanical_floor,
//           dig_camp) with display metadata
//           ready for the user's hand-
//           authored grid maps to fill in.
//         • 4 StairwellPosition corners
//           (NE/NW/SE/SW) per floor.
//         • 5 StairwellType descent rates
//           (express_drop_5, express_drop_3,
//           local_drop_2, local_drop_1,
//           broken). The "five different
//           types the system needs to
//           remember" the user spec'd.
//         • GridCell / FloorTemplate /
//           BuildingState types so future
//           OTAs can drop authored grids
//           in without touching the model.
//         • canEnterSkyscraper(player) gate
//           refuses entry until
//           mainQuest.phase === 'ended'.
//           Any of the three Choice endings
//           qualifies — the post-ending
//           homeward beat is the route to
//           the Outskirts entrance.
//       NO room content, NO encounters, NO
//       quests in this OTA. Strictly the
//       data model + gate.
//
//   (2) app/screens/EndingScreen.tsx — new
//       HEAD HOME ▸ button next to the
//       existing BACK TO TITLE. Tapping it
//       enters a HomewardSplash that
//       renders 3 paragraphs of homeward
//       narration (faction-keyed "people"
//       label + dog/golem references if
//       alive) on a black backdrop, fades
//       in (2s) → holds (7s) → fades out
//       (2s) → bounces to title. Tap-
//       anywhere skips to title. Place-
//       holder bridge for the Skyscraper
//       entrance — once the expansion
//       lands, onDone routes to the
//       Outskirts entry instead of title.
//
// 58/58 regression tests pass (mainQuest +
// coreGuardians). TS clean.
//
// Files: app/engine/buriedSkyscraper.ts
// (NEW), app/screens/EndingScreen.tsx
// (HomewardSplash + HEAD HOME button).
//
// 2026-05-28 OTA-152 — Skyscraper elevator
// shafts added to the framework.
//
// User extended the descent spec: two
// broken elevators in the center of each
// floor, climbable as vertical shafts.
// "some descents might be made by
// climbing up or down the old elevator
// shaft, there are 2 broken elevators on
// the center of each floor."
//
// Implementation (still scaffold-only):
//
//   • New ShaftPosition union:
//     CENTER_NORTH | CENTER_SOUTH (2 slots
//     per floor, distinct from the 4
//     corner stairwell slots).
//   • New ShaftState union: climbable
//     (open shaft, ascend or descend with
//     a climb check), blocked_at (debris
//     jam at blockedAtFloor — a one-way
//     wall depending on approach), sealed
//     (welded-shut door, shaft not
//     accessible from this floor).
//   • ShaftInstance carries position,
//     state, optional blockedAtFloor,
//     cableIntact (future fast-descent
//     anchor), repaired (Aethercraft-
//     Shape / Reclaimer salvage hook —
//     same pattern stairs use).
//   • SHAFT_STATES metadata with player-
//     facing flavor lines for each state
//     so the `look` resolver in the
//     future shaft-traversal code has
//     authored copy ready.
//   • FloorTemplate.shafts: ShaftInstance[]
//     (2 entries). BuildingState.shafts:
//     Record<`${floor}:${position}`,
//     ShaftInstance> for per-(floor, shaft)
//     state persistence — a shaft is
//     logically continuous across floors
//     but each floor pins its own access
//     state, so the traversal resolver
//     walks floor-by-floor to figure out
//     where the climb ends.
//   • stubFloorTemplate / emptyBuildingState
//     updated to seed the new field with
//     empties.
//
// Still NO gameplay code — no climb
// resolver, no fall-damage formula, no
// rendering. Just the data shape so when
// the maps + the climb resolver land,
// everything plugs into the same model.
//
// TS clean. Regression unaffected
// (framework still gated to
// mainQuest.phase === 'ended', no
// existing player can reach the
// skyscraper code paths yet).
//
// Files: app/engine/buriedSkyscraper.ts
// (ShaftPosition / ShaftState /
// ShaftInstance / SHAFT_STATES +
// FloorTemplate.shafts +
// BuildingState.shafts).
//
// 2026-05-28 OTA-153 — "but soon" added
// to the Homeward beat's expansion seed.
//
// Pre-OTA-153 the closing third paragraph
// of the HEAD HOME ▸ fade read:
//   "Somewhere ahead, in the Buried
//    Cities, a doorway you have never
//    noticed waits for you. Not today.
//    Today you are going home."
//
// User wanted "but soon" appended after
// "Not today" — a backhanded ad telling
// players the expansion is on the way
// without breaking the in-fiction tone.
// New copy:
//   "Somewhere ahead, in the Buried
//    Cities, a doorway you have never
//    noticed waits for you. Not today,
//    but soon. Today you are going home."
//
// Trivial text edit. TS clean.
//
// Files: app/screens/EndingScreen.tsx
// (third homeward beat paragraph).
//
// 2026-05-28 OTA-154 — SUMMON chip on the
// home-screen MAIN QUEST card.
//
// OTA-148 put the SUMMON chip on the
// Contracts PRIMARY OBJECTIVE card; OTA-149
// added the `summon guardian` verb path.
// Player feedback: the Contracts surface
// is the SECOND level — too many taps from
// the home screen. "I want to be able to
// get right to the city smack that button
// and have at it."
//
// Implementation: MAIN QUEST chip on the
// ExplorationScreen restructured to a row
// layout — existing title (★ MAIN QUEST ·
// hint) + subtitle (tap for all contracts
// + collectibles ↗) on the left, new
// ★ SUMMON button on the right when the
// player is in an unrecovered Lost Capital
// with mainQuest in revelation/cores. Same
// `atUnrecovered` precondition the chip's
// hint line already uses, so the button
// appears exactly when the hint says
// "salvage a feature here" / "attack or
// address the keepers" / etc.
//
// Nested TouchableOpacity captures the tap
// so smacking SUMMON doesn't also fire the
// chip's tap-to-Contracts navigation — RN
// responder system grants the touch to the
// inner button by default.
//
// The Contracts SUMMON chip from OTA-148
// stays in place as a backup path.
//
// TS clean. Regression unaffected (same
// summonCoreGuardian store action both
// chips call).
//
// Files: app/screens/ExplorationScreen.tsx
// (objectiveChip row layout + SUMMON
// nested button + 4 styles).
//
// 2026-05-28 OTA-155 — `eat <foo>` no
// longer silently sleeps 8 hours.
//
// Stress sweep finding: typing `eat
// ratoin` (typo) or bare `eat` parsed
// matchedVerb=eat → intent=rest → no
// consumable resolved → fell through to
// the 8-hour sleep path. Same class of
// bug OTA-125 closed for `drink water`.
//
// Fix: rest-case no-consumable branch
// now checks matchedVerb. When it was
// eat/consume/devour AND no consumable
// resolved, the Arbiter refuses with
// "Eat what? Name the ration..." and
// breaks — no 8h sleep, no clock
// advance.
//
// Bare `rest` is unaffected — still
// triggers the 8h path as designed.
//
// 4/4 regression tests pass
// (eatWithoutTargetRefusal). TS clean.
//
// Files: app/state/gameStore.ts (rest
// case no-consumable branch + verb
// check).
//
// 2026-05-28 OTA-156 — drunk-typing
// run-collapse in parser.bestVerbMatch.
//
// Stress sweep (drunkSpelling) flagged
// `eatt`, `useee`, `scrappp`, `drinkkk`
// all routing to intent=unknown — held-
// the-key-too-long typos that fuzzyEqual's
// 1-edit budget can't span. Fix is
// upstream: when raw token doesn't match
// any synonym, retry with a collapsed
// form.
//
// collapseDrunkRuns(token):
//   1. Runs of 3+ identical chars
//      collapse to 1 (`useee` → `use`,
//      `scrappp` → `scrap`).
//   2. Trailing 2-char doubled CONSONANT
//      collapses to 1 (`eatt` → `eat`,
//      `drinkk` → `drink`). Vowel
//      doublings preserved so future
//      `see` / `too` / `goo` verbs are
//      safe.
//
// Conservative on purpose: never
// lengthens, never touches middle-of-
// word doubles (`look` / `feed`), and
// the retry only runs when the raw
// token returned no match. Doesn't
// loosen fuzzyEqual cutoffs — those
// stay tight to avoid OTA-094-style
// false positives.
//
// 19/19 OTA-156 regressions pass.
// 37/37 across the wider parser sweep
// (parserFuzz, parserFuzzWithDogVerbs,
// eatWithoutTargetRefusal,
// theftChannelGuard). TS clean.
//
// Files: app/engine/parser.ts
// (collapseDrunkRuns + bestVerbMatch
// retry branch).
//
// 2026-05-28 OTA-157 — no-space travel-
// verb splitter in normalizeInput.
//
// Stress sweep (drunkSpelling) flagged
// `gowest`, `gonorth`, `goeast`,
// `gosouth`, `walknorth`, `runnorth`
// etc. all routing to intent=unknown
// because the tokenizer splits on
// whitespace and the glued form isn't
// a verb synonym.
//
// Fix: surgical regex in normalizeInput
// that inserts a space between known
// travel verbs (go / walk / run / head /
// travel) and cardinal/vertical
// direction words (n/s/e/w/up/down +
// diagonals). Conservative — only the
// specific stamped pattern, not a
// general compound-splitter, so legit
// words like `goth`, `runic`,
// `walking`, `heads` survive
// unchanged.
//
// `runnorth` routes to escape (not
// travel) because `run` is a flee
// synonym — still an improvement over
// the prior `unknown`, and arguably
// closer to what the player meant
// when typing "run north."
//
// 26/26 OTA-157 regressions pass.
// Wider parser sweep stays green.
//
// Files: app/engine/parser.ts
// (normalizeInput compound-split
// regex).
//
// 2026-05-28 OTA-158 — dog-verb typo
// tolerance.
//
// Stress sweep (drunkSpelling) found:
// `fed dog ration`, `helll dog ration`,
// `cll dog`, `feeed dog ration` all
// reached the dog interceptors with
// unrecognized leading verbs and
// returned false silently. The dog
// interceptors run BEFORE the parser
// so OTA-156's drunk-run-collapse
// pass doesn't reach them.
//
// Fix: new normalizeDogLeadingVerb()
// helper at the top of
// tryDogApplyVerb + tryDogCallVerb.
// Tries both the raw leading token
// and a drunk-collapsed form against
// each canonical verb (feed / heal /
// call / use) with a Levenshtein-1
// budget. Either match wins; the
// token is replaced with the
// canonical before the regex runs.
//
// Conservative — gated to a 4-verb
// canonical set and the leading
// token only. Won't touch
// `feed`-as-noun in another position
// (e.g. `chicken feed` — there is no
// such item but the principle
// holds).
//
// 5/5 OTA-158 regressions pass.
// 62/62 across the wider dog sweep
// (dogHungerTimingChaos,
// dogOnboardingFuzz,
// parserFuzzWithDogVerbs,
// dogGolemCombatStress).
//
// Files: app/state/gameStore.ts
// (normalizeDogLeadingVerb +
// tryDogApplyVerb + tryDogCallVerb).
//
// 2026-05-28 OTA-159 — `defend` moved
// from help to dodge intent.
//
// Stress sweep flagged: player typing
// `defend` (or `defendd`) in combat
// expected a parry/defensive-stance
// action but got routed to help intent
// (call for backup) which produced no
// visible combat effect. Defensive
// intent is clearly the more natural
// reading for `defend` in a combat
// context.
//
// Fix: `defend` moved from help's
// synonym list into dodge's (where
// parry/block/guard/shield already
// live). Help's backup-call intent
// still covers help / aid / assist /
// support / cover / bolster /
// reinforce so the calling-for-help
// path stays intact.
//
// 17/17 OTA-159 regressions pass
// (defend → dodge + help-synonyms-
// intact + dodge-synonyms-intact).
// parserFuzz green.
//
// Files: app/engine/parser.ts
// (dodge synonyms + help synonyms).
//
// 2026-05-28 OTA-160 — every scene-
// feature refusal teaches salvage.
//
// Stress sweep (collectAll) flagged:
// a hoarder typing `take rubble`
// repeatedly only saw the SALVAGE
// redirect on 3 of 8 refusal lines.
// Across a long stretch the player
// never learned the right verb.
//
// Fix: every refusal line in
// SCENE_FEATURE_REFUSALS now ends
// with an explicit "(Try SALVAGE.)"
// or "salvage it." pattern so any
// single tap on a scene-feature noun
// teaches the salvage path.
//
// Lore-keeping: the flavor variety
// is preserved — the lines still
// read differently. Only the salvage
// redirect was made universal.
//
// 1/1 OTA-160 regression passes (200-
// sample sweep covers all 8 pool
// lines, every line matches /salvage/).
//
// Files: app/engine/portability.ts
// (5 refusal lines extended with
// SALVAGE redirect).
//
// 2026-05-28 OTA-161 — Yulka disc
// grant routed through
// mergeOrPushItem.
//
// Stress sweep (craft-a-lot) audit
// of direct inventory pushes found
// 3 sites bypassing mergeOrPushItem
// in gameStore. Two were intentional
// (stolen-item rows must stay
// separate so the no-sell rule
// binds to a specific item.id —
// merging would silently launder
// the theft). One was an oversight:
// handleYulkaBuy pushed a 5-unit
// Aetheric Disc directly, so two
// Yulka buys created two parallel
// disc rows instead of one stacked
// row of 10.
//
// Fix: route the disc grant through
// mergeOrPushItem. The two theft
// sites stay direct on purpose per
// their per-instance theft-flag
// comments.
//
// 2/2 OTA-161 regressions (merge
// stacks correctly + other rows
// preserved).
//
// Files: app/state/gameStore.ts
// (handleYulkaBuy disc grant).
//
// 2026-05-28 OTA-162 — cardinal-step
// location discovery extension.
//
// Stress sweep (cartographer) found
// 500 cardinal-walk turns produced
// only 1 discoveredLocationId because
// discoverLocation only fired at
// terminal travelTo arrivals. A
// player who walks past a Capital at
// 2 tiles away has clearly seen it
// but worldMemory never noticed.
//
// Fix: when stepDirection surfaces a
// nearest-named-location label (the
// transitArea "near X" branch) and
// that location is within 2 tiles
// (Manhattan), also call
// discoverLocation. Threshold = 2
// captures "close enough to count as
// passing through" without exposing
// distant landmarks visible from
// across the map.
//
// Player effect: walking past Voronov
// at 2 tiles now puts it on the
// Milestones tab + the world-map
// fog-clear instead of staying
// invisible until terminal arrival.
//
// 3/3 OTA-162 regressions
// (discoverLocation add + idempotent
// + accumulation).
//
// Files: app/state/gameStore.ts
// (stepDirection nearest-loc
// discover branch).
//
// 2026-05-29 OTA-163 — refused-travel
// time tick (closes cartographer's
// 387-turn stuck-state).
//
// Stress sweep (cartographer)
// surfaced a 387-turn stuck-state
// where every attempted cardinal step
// was refused for stamina AND time
// never advanced — the player was
// frozen in a single minute. Pre-fix
// the 3 refusal paths (case 'travel',
// setTravelCourse, continueTravel)
// emitted the Arbiter line and
// returned without advancing the
// clock.
//
// Fix: each path now ticks
// hoursElapsed by 0.25 (~15 minutes
// of fumbling) before emitting the
// refusal. Time keeps moving through
// a depleted stretch even when the
// player can't take steps. Player
// types `rest` to recover; the clock
// passes through the rest as before.
//
// Also confirmed the chaos agent's
// "currentScene = null" finding was
// a false positive — scene IS seeded
// by startNewGame's beginScene call.
// The agent probed `currentScene.id`
// which doesn't exist on the type;
// `undefined` looked like null in the
// sampling array. Bootstrap is fine.
//
// 3/3 OTA-163 regressions (single
// travel refusal ticks ~15min,
// setTravelCourse refusal ticks
// ~15min, 100 consecutive refusals
// advance clock by ≥20 hours).
//
// Files: app/state/gameStore.ts
// (3 stamina-refusal paths advance
// time).
//
// 2026-05-29 OTA-164 — hub-room
// roomKey alignment (closes the
// SALVAGE-ALL spam at Reclaimers'
// Outpost).
//
// Playtest log: Verbal taps SALVAGE
// ALL at Reclaimers' Outpost The
// Gate, 4 nouns salvaged
// successfully. Player taps SALVAGE
// 5 more times in 14 seconds; each
// tap emits "Already worked over:
// shattered library archive
// console, dust-buried royal
// display case, table, shattered
// grand spire capacitor." The
// nouns were consumed in
// worldMemory but the modal kept
// showing them as fresh chips.
//
// Root cause:
// ExplorationScreen.tsx built 5
// inline roomKeys in the legacy
// shape "locId@mm@x,y" — missing
// the @${hubRoomId} suffix that
// makeRoomKey appends for hub
// interiors (added OTA-140). The
// modal read consumed-noun flags
// from "outpost@_@0,0" while the
// action handlers wrote them
// through "outpost@_@0,0@gate". In
// any hub room, the UI's view of
// per-room state diverged from the
// engine's. Climb chip-greying
// (OTA-085/086) was on the same
// bug because climb's cleared-marks
// readback used the same broken
// key.
//
// Fix: makeRoomKey exported from
// gameStore. All 5
// ExplorationScreen sites + 1
// stale inline in gameStore (path-
// exhausted state at 17699) now
// call it with player.hubRoomId
// passed through. The hub suffix
// lines up across UI reads and
// action writes — chips grey
// properly, SALVAGE ALL on a
// consumed scene no longer
// re-fires.
//
// 6/6 OTA-164 regressions
// (non-hub key shape, hub key
// shape, hub-vs-non-hub differ,
// two hubs differ, microMicroId
// preserved, null hubRoomId).
//
// Files: app/state/gameStore.ts
// (export makeRoomKey + fix inline
// at 17699),
// app/screens/ExplorationScreen.tsx
// (import makeRoomKey + replace 5
// inline keys).
//
// 2026-05-29 OTA-165 — stats on
// REPAIR tab rows.
//
// Player ask: "any of the tabs that
// are in there all of the items
// that you're crafting. it should
// show the stats for them. that way
// you know what you're crafting so
// you know which one to pick."
//
// The CRAFT + RECIPES tabs render
// stats via RecipesView (uses
// getItemPreview) — every recipe
// shows damage / AC / scales-with /
// passives / restore amounts / etc.
// The AETHERIC tab shows golem
// HP/attack/damage type inline.
// The REPAIR tab was the gap: it
// showed only name + durability +
// repair cost, so a player with
// three damaged weapons couldn't
// tell which one was which from
// the screen.
//
// Fix: import getItemPreview in
// CraftingScreen, call it per
// repair row, render
// preview.stats.join(' · ') beneath
// the name line. Style matches
// RecipesView's recipeStats
// (italic, #cdbf99) so the REPAIR
// tab reads consistently with
// CRAFT / RECIPES.
//
// TS clean.
//
// Files:
// app/screens/CraftingScreen.tsx
// (getItemPreview import + stats
// line on REPAIR row + recipeStats
// style).
//
// 2026-05-29 OTA-166 — elevated-state
// chip filter on SearchModal.
//
// Playtest log: player climbed onto
// `weathered submerged library
// shelf`, then tapped `investigate
// sign` and `investigate brick` 9
// times in 27 seconds. Each tap
// produced the same Arbiter refusal
// — "You're up on the weathered
// submerged library shelf. The sign
// is down there. Climb down to
// reach it." The engine gate at
// gameStore.ts:4804 was working
// correctly; the SearchModal chips
// stayed bright-active because the
// chip-pool builder didn't know
// about the elevation.
//
// Fix: SearchModal chip mapper in
// ExplorationScreen now checks
// currentScene.elevatedOn. When
// elevated (and no overlay
// firing — overlay nouns are
// reachable from elevated), every
// non-climbed-noun ambient chip is
// marked unmetRequirement="climb
// down to reach". SearchModal
// already renders unmet chips
// greyed with the label so the
// player sees by sight that the
// chip won't fire.
//
// Climbed noun itself stays
// tappable (you can still
// investigate the thing you're on
// top of — that's where loot
// caches sit).
//
// TS clean.
//
// Files:
// app/screens/ExplorationScreen.tsx
// (elevated-aware unmetRequirement
// branch in SearchModal chip
// mapper).
//
// 2026-05-29 OTA-167 — salvage chip
// trusts engine-consumed state
// (skips TAKE's catalog-ownership
// self-heal).
//
// Playtest log: player did a
// flavor-only `salvage scraps of
// cloth` (engine wrote the noun
// to flavorExhaustedNouns), then
// tapped salvage 8 times across
// 35 seconds, each producing
// "You've already turned the
// scraps cloth over here."
//
// Root cause: SalvageModal's chip
// `consumed` flag used
// isAmbientConsumed which has a
// self-heal — if the noun fuzzy-
// matches a catalog item the
// player doesn't own, it un-greys
// the chip (so a sold Rusted
// Blade can be re-taken from the
// ground). That's correct for
// TAKE. Wrong for SALVAGE —
// salvage produces MATERIALS, not
// the catalog item, so ownership
// has nothing to do with whether
// the noun's been salvaged.
//
// Fix: SalvageModal chip mapper
// now reads consumed via
// `isFuzzyConsumed(n,
// consumedAmbientNouns)` directly
// — pure engine state, no
// ownership branch. The chip
// greys when the engine considers
// it salvaged, full stop.
//
// TakeModal unchanged — its self-
// heal is correct (catalog
// ownership IS the right cue for
// re-takeability).
//
// TS clean.
//
// Files:
// app/screens/ExplorationScreen.tsx
// (SalvageModal chip consumed-flag
// bypasses isAmbientConsumed).
//
// 2026-05-29 OTA-168 — flavor-only
// investigate wording clarified
// (no-loot is explicit).
//
// Playtester: "scraps of cloth
// doesn't gray out when being
// either salvaged or investigated,
// not sure if it resolved to loot
// either way."
//
// The chip-greying half is fixed
// by OTA-167 (SalvageModal trusts
// engine consumed state). This
// OTA addresses the wording half
// — two lines were ambiguous:
//
//   (a) First flavor outcome read
//       "no clearer thread
//       surfaces here" — vague,
//       player couldn't tell if
//       loot landed in their
//       pack. Now: "Nothing of
//       use comes loose — the
//       work itself is the only
//       thing you take from
//       this." Names the empty
//       outcome explicitly.
//
//   (b) Refusal on second tap
//       said "Whatever it had to
//       give you, you took" —
//       which reads as "you got
//       loot last time" even
//       though the original
//       outcome was flavor-only.
//       Now: "You've already
//       checked the X here.
//       There was nothing of use
//       in it — turning it over
//       again won't change
//       that." Anchored to the
//       fact that there was
//       never loot to begin
//       with.
//
// Both lines fire from the
// investigate-flavor path
// (gameStore.ts:9650 + 9684).
//
// TS clean.
//
// Files: app/state/gameStore.ts
// (two flavor-outcome lines
// rewritten).
//
// 2026-05-29 OTA-169 — runecaster
// crafting chart added (15 recipes
// + 15 runecaster weapons + 4
// Blank Runecaster Casing
// materials).
//
// Player provided a full
// Common→Legendary recipe chart
// for runecaster crafting and
// asked for it added directly
// under the CRAFT tab next to
// weapons. The 4-tier Blank
// Runecaster Casing the spec calls
// for didn't exist; I added the
// four casing materials and
// substituted other spec-named
// ingredients with the closest
// existing catalog materials so
// the recipes are actually
// craftable on day one.
//
// Material substitutions (spec
// name → catalog match):
//   Aetheric Mud → Aether Mud
//   Etheric Rope → Spider Silk
//   Binding Orb → Mud Gem
//   Etheric Thread → Aetheric Cloth
//   Aetherstone Pebble → Smooth Stone
//   Rusty Ether Lock → Bent Nail
//   Aetherstone Dust → Aether Dust
//   Tartarian Pottery Shard → Mud Fragment
//   Etheric Scrap → Scrap Metal
//   Old Relic Key → Worn Tartarian Coin
//   Whispering Aether Crystal → Aether Crystal
//   Aetherstone Fragment → Aetheric Shard
//   Rune Inscription Kit → Aetheric Dust
//   Etheric Stabilizer → Hardened Mudstone
//   Cracked Etheric Orb → Aether Shard
//   Aetheric Matter → Aether Mud
//   Etheric Spyglass → Automaton Circuit
//   Aether Cloak of Shadows → Aetheric Pelt
//   Aetherstone Core → Aetherstone Heart
//   Shifting Obsidian Orb → Energy Fragment
//   Sentinel's Ether Heart → Sentinel Core Plate
//   Aetheric Core → Golem Core
//   Aetheric Phoenix Feather → Aether Wing
//   Wrath of the Ether Titan → Behemoth Heart
//   Etheric Core → Iron Core
//   Void Ether Shard → Voidspawn Egg
//
// New runecaster weapons (all
// stat='intelligence',
// weaponKind='runecaster'):
//   Common: Flame of Aether,
//     Gale Binder, Sparkstrike,
//     Earthshaker, Force Wave
//   Uncommon: Dark Blight, Stone
//     Fist, Ether Bolt, Void Pulse
//   Rare: Shadow Caller, Ember
//     Storm, Stormcaller
//   Legendary: Wrath of Titans,
//     Phoenix Rebirth, Void Edge
//
// Each carries statRequirement
// matching the spec's INT-tier
// table (Common 1-2, Uncommon
// 5-6, Rare 9-10, Legendary
// 11-12) so the use-in-combat
// stat gate works as authored.
//
// NOT included this OTA: the INT
// 11+ craft-time requirement
// (Recipe type doesn't carry a
// stat gate today; adding one
// touches the craftRecipe engine
// path — deferred to a follow-up
// when the user confirms the
// recipe-stat-gate shape they
// want).
//
// 9/9 regression (recipeFuzzy +
// craftRepairFuzz). TS clean.
// All 3 JSON files validated.
//
// Files:
// app/data/items/materials.json
// (+4 casings),
// app/data/items/weapons.json
// (+15 runecasters),
// app/data/items/recipes.json
// (+15 recipes).
//
// 2026-05-29 OTA-170 — INT-to-craft
// gate on runecaster recipes
// (closes OTA-169 deferral).
//
// Recipe type gains optional
// intRequirement field. craftRecipe
// handler reads it and refuses
// (Arbiter line, no ingredient
// consumption) when the player's
// effective INT is below the
// threshold. Other recipes (no
// intRequirement) pass through
// unchanged.
//
// All 15 runecaster recipes
// stamped intRequirement: 11 per
// the Tartaria Prima spec.
//
// Effective INT (effectiveStats)
// is used, so accessory bonuses
// count — a player with base INT
// 10 wearing a +1 INT amulet can
// craft.
//
// 5/5 OTA-170 regressions:
//   • all 15 runecaster recipes
//     stamped intRequirement 11
//   • INT 10 CANNOT craft Flame
//     of Aether (refusal, no item)
//   • INT 11 CAN craft (succeeds)
//   • INT 15 CAN craft (no false
//     refusal)
//   • non-runecaster (Club) has
//     no gate (INT 1 succeeds)
//
// 9/9 wider craft regression
// (recipeFuzzy + craftRepairFuzz)
// stays green.
//
// Files: app/engine/crafting.ts
// (Recipe.intRequirement field),
// app/state/gameStore.ts (craft
// handler INT gate check),
// app/data/items/recipes.json
// (15 runecaster recipes stamped),
// __tests__/runecasterIntGate
// .test.ts (NEW).
//
// 2026-05-29 OTA-171 — Places list
// promoted to MapScreen with one-
// tap routing (no confirm modal).
//
// Player ask: "move the locations
// tab from the lore to somewhere
// useful for push to set travel
// but without digging in the
// settings menu. and I don't want
// to copy the text I want to be
// able to push to route
// automatically."
//
// MapScreen is already one tap
// from the home screen (the MAP
// chip in the InputBox). Adding
// the Places list there means the
// player gets to TRAVEL in TWO
// taps total: MAP → place row.
// No Lore-tab dig, no confirm
// modal step, no text to copy.
//
// Implementation: new TRAVEL TO
// panel sits below the existing
// footer on MapScreen. Scrollable
// (capped 280px max-height so the
// atlas image stays visible).
// Rows sort with the player's
// current location pinned at the
// top, then by danger ascending
// (safer trips visible first),
// then alphabetic.
//
// Each row: name + type subtitle,
// danger pip + arrow on the
// right. Tap = setTravelCourse
// + setScreen('exploration'). No
// confirm modal.
//
// Hub gate handled inline: if
// player.hubRoomId is set, the
// engine's setTravelCourse
// would refuse mid-stride, so
// we surface a brief Arbiter
// hint ("leave the outpost
// first") and skip the screen
// swap instead of cooking up a
// half-state.
//
// Lore→Places tab unchanged —
// keeps the info / confirm
// path for players who want
// the lore beat first.
//
// TS clean.
//
// Files: app/screens/MapScreen.tsx
// (new placesView memo + TRAVEL
// TO panel JSX + 11 styles).
//
// 2026-05-29 OTA-172 — combat quick-
// row split into 3 lines + climb
// up/down buttons go blue.
//
// Player asks bundled:
//   (a) "when in combat the
//       approach, step back, and
//       inventory should be on the
//       third line, that keeps room
//       for the dog and golem on
//       the second row, and keep
//       dodge and flee next to them
//       on the second row."
//   (b) "let's make the climb 1/3
//       type buttons blue and the
//       climb down blue when they
//       are able to be used."
//
// Combat row was a single
// flex-wrap line — punch, kick,
// weapons, inventory, approach,
// golem, dog, dodge, step back,
// flee all fighting for space.
// Fix: wrap combat content in a
// column container with three
// flex-row lines inside:
//   • Row 1: punch, kick, [main
//     weapon], [off weapon]
//   • Row 2: [golem], [dog],
//     dodge, flee
//   • Row 3: inventory, approach,
//     [step back if not far]
// Peace mode unchanged — keeps
// the single flat quickRow.
//
// New styles: `quickRowColumn`
// (combat wrapper, column) +
// `quickRowLine` (each row inside,
// mirrors quickRow's row+wrap+gap
// shape).
//
// Climb buttons: when elevated,
// the climb-up (tier/totalTiers)
// button and climb-down button
// both render only when usable
// (climb-up requires tier <
// totalTiers; climb-down requires
// elevated). Both now carry the
// `defensive` flag so they tint
// blue — matches the blue cue
// the player already reads on
// dodge / flee for safe-egress
// actions.
//
// TS clean.
//
// Files: app/components/InputBox
// .tsx (combat row restructure +
// climb-button defensive tone +
// 2 new styles).
//
// 2026-05-29 OTA-173 — silence-
// Arbiter button moved to bottom-
// right of the enemy panel.
//
// Player ask: "moving the pause
// button to the bottom right of
// the enemy box so it doesn't
// block text, let's get it done."
//
// The silence (pause-TTS) button
// used to live in the InputBox
// composer row beside the text
// input. In combat-heavy stretches
// it crowded the input field +
// streaming Arbiter text.
//
// Fix: render the silence button
// as an absolute-positioned bottom-
// right overlay on the EnemyPanel.
// Renders only when TTS is actively
// speaking. 36×36 circular tap
// target with a warm-red border so
// it reads as "interrupt" against
// the panel chrome. Polls
// ttsIsSpeaking() at 250ms (same
// cadence InputBox already uses).
//
// InputBox silence button HIDES
// during combat (the EnemyPanel
// overlay covers it). In peace
// mode the InputBox silence
// button stays as the always-
// visible interrupt — no enemy
// panel to anchor an overlay
// against.
//
// TS clean.
//
// Files: app/components/EnemyPanel
// .tsx (speaking poll + silence
// overlay + 2 styles),
// app/components/InputBox.tsx
// (silence button hides when
// inCombat).
//
// 2026-05-29 OTA-174 — settings
// gear moved to bottom-right of
// the enemy panel + OTA-173
// reverted (wrong button moved).
//
// Player correction: "I think you
// got that wrong, I wanted the
// settings gear moved from the
// top right of the enemy box to
// the bottom right of the enemy
// box."
//
// OTA-173 misread the ask and
// moved the TTS-silence (pause)
// button instead. Both halves of
// OTA-173 reverted in this OTA —
// EnemyPanel back to no overlay,
// InputBox silence button back
// to always-visible (regardless
// of combat).
//
// Correct fix: cornerGear style
// in ExplorationScreen moved from
// `top: 4` → `bottom: 4`. The
// EnemyCard head's reserved
// paddingRight: 48 (added OTA-048
// + bumped OTA-144 to keep the
// gear off the enemy name) is
// also dropped — gear no longer
// overlaps the top of the card,
// so the enemy name + range tag
// can use the full row width.
//
// Gear stays on the right column
// either way — overlays
// EnemyPanel during combat, the
// CrestPlaceholder in peace.
//
// TS clean.
//
// Files: app/screens/Exploration
// Screen.tsx (cornerGear top→
// bottom + comment),
// app/components/EnemyPanel.tsx
// (head paddingRight dropped +
// OTA-173 revert),
// app/components/InputBox.tsx
// (OTA-173 revert).
//
// 2026-05-29 OTA-175 — combat row
// 3 button order corrected.
//
// OTA-172 shipped row 3 as
// inventory → approach → step
// back. Player flagged the
// screenshot: "look at the bottom
// row" — the literal order they
// asked for was "approach, step
// back, and inventory should be
// on the third line." Reorder
// matches the spec exactly:
// APPROACH · STEP BACK ·
// INVENTORY.
//
// No layout change otherwise —
// same row, same styling, same
// 3-button maximum (step back
// hides when range='far').
//
// TS clean.
//
// Files: app/components/InputBox
// .tsx (row 3 button order).
//
// 2026-05-29 OTA-176 — 4-piece UI
// wave: feed shrinks under 3-row
// combat / dog-quest narration in
// purple / silence-Arbiter button
// removed / keyboard no longer
// covers the input line.
//
// All four asks came in one
// message; bundled as one OTA.
//
//   (1) Combat row 3 was pushing
//       the bottom buttons off
//       screen. Player: "can we
//       have the rows put up and
//       shrink the exploration
//       box a touch and not push
//       the action buttons down?"
//       Fix: feed style gains
//       flexShrink:1 + minHeight:0
//       — the canonical RN pattern
//       for "let this flex child
//       shrink below its measured
//       content size." Feed
//       compresses to whatever
//       space is left after the
//       (now 3-row) InputBox
//       claims its natural height.
//
//   (2) Dog rescue + onboarding
//       narration now routes to a
//       new `dog_quest` log
//       channel (purple #b88ce0).
//       Player: "make the text
//       that is part of the
//       initial dog getting quest
//       and any other dog getting
//       quests in a color that is
//       noticably different ...
//       let's use purple like
//       the notes." Sites updated:
//       4 captor confrontation
//       intros, scenario victory
//       line, "what kind of dog
//       is that?" onboarding
//       prompt, "what will you
//       name them?", "boy or
//       girl?", final settle
//       beat, rubble-puppy
//       variant intro. World-
//       channel descriptive prose
//       (e.g. "you name the
//       breed") stays world so
//       the player still gets the
//       cream-color narrative
//       voice between the purple
//       quest beats. DOG QUEST
//       chip tag added to
//       tagForChannel mirroring
//       ARBITER / NOTE.
//
//   (3) Silence-Arbiter (🛑)
//       button removed entirely.
//       Player: "let's remove the
//       stop arbitor talking
//       button and code from the
//       game." Dropped: button
//       JSX, handleSilenceArbiter
//       function, speaking state,
//       ttsIsSpeaking poll, two
//       styles (silenceBtn /
//       silenceBtnText), import
//       of stopTTS+ttsIsSpeaking.
//       TTS itself still plays
//       through TTSManager — the
//       manual-interrupt UI is
//       the only thing that goes.
//       Players who want it
//       quieter use the TTS
//       toggle on the gear
//       screen.
//
//   (4) Keyboard no longer
//       covers the typed line.
//       Player: "can we keep the
//       keyboard from covering
//       the text line we are
//       typing into?"
//       KeyboardAvoidingView
//       behavior split by
//       platform: iOS keeps
//       'padding' (iOS needs the
//       lift); Android sets
//       behavior={undefined} so
//       only the native
//       adjustResize (Expo
//       managed default) pulls
//       the window up. Pre-fix
//       padding fired on Android
//       on top of adjustResize,
//       overshooting and shoving
//       the input off the visible
//       area.
//
// TS clean.
//
// Files:
//   app/screens/ExplorationScreen
//   .tsx (feed flex shrink +
//   KAV behavior split),
//   app/components/AdventureFeed
//   .tsx (channelColors +
//   tagForChannel),
//   app/components/InputBox.tsx
//   (silence button removal +
//   speaking poll removal),
//   app/engine/types.ts
//   (LogChannel dog_quest),
//   app/state/gameStore.ts
//   (7 dog-quest emit sites).
//
// 2026-05-29 OTA-177 — tutorial
// wall split + currency pass.
//
// Player ask: "split this giant
// wall of tutorial into 2 screens.
// while we are at it, let's make
// sure the tutorial is up to date."
//
// Dog tutorial was one massive
// fullscreen step (10 sections:
// rescue / onboarding / combat /
// dog+golem / climbing / smell-
// find / hunger / feeding / gear /
// death / call). Screenshot showed
// it overflowing the panel —
// player couldn't scan it.
//
// Split into 2 steps:
//   (A) "Your dog — the rescue
//       and the fight" — rescue
//       hooks, purple DOG QUEST
//       channel call-out, three
//       onboarding questions,
//       combat row (now ROW 2),
//       dog+golem coexistence,
//       death recovery (gem /
//       puppy-vendor / rubble-
//       puppy).
//   (B) "Your dog — living with
//       them" — smell-find,
//       climbing, hunger,
//       feeding (with the
//       OTA-158 typo tolerance
//       call-out), call modal,
//       gear, StatsPanel
//       display.
//
// Currency pass on the wider
// tutorial:
//   • Two gear-corner references
//     updated top-right → bottom-
//     right (OTA-174 moved the
//     gear).
//   • Quick actions step rewritten
//     to describe the OTA-172
//     3-row combat layout: row 1
//     weapons (color-coded by
//     reach), row 2 companions
//     + dodge + flee, row 3
//     approach + step back +
//     inventory.
//   • Core Guardians step adds
//     the OTA-148/149 SUMMON chip
//     + `summon guardian` verb as
//     deliberate-call paths.
//   • Travel step adds the
//     OTA-171 MAP→TRAVEL TO panel
//     one-tap routing path
//     alongside the typed
//     "travel to <city>" + Lore
//     Places tab routes.
//
// No engine code touched —
// authored copy only.
//
// TS clean.
//
// Files: app/components/tutorial
// Steps.ts (dog step split + 4
// currency edits across other
// steps).
//
// 2026-05-29 OTA-178 — sell-gate
// warning (you can't sell your
// only rope by accident anymore).
//
// Playtester sold their Hardened
// Climbing Strap to Irma for 5 TC
// without realizing it was the
// only item in their pack
// satisfying the engine's
// climb_steep gate (added OTA
// 23-007 — rope is hard-required
// to climb, no DEX-fallback).
// Next climb attempt: "Not
// without rope." Player: "enact
// that gate."
//
// Fix: VendorScreen's sell-confirm
// modal now computes a
// `pendingGateLoss` for the
// pending item. When the item
// being sold has effect.kind ===
// 'gate' AND the player has
// quantity 1 AND no OTHER
// inventory item also unlocks
// that gate → the modal:
//
//   • Appends a "⚠ This is your
//     ONLY way to <gate label>"
//     warning to the body copy.
//   • Replaces the primary "Sell"
//     button with a destructive
//     "Sell anyway" button (red
//     tone) so the second tap
//     reads as deliberate.
//
// Gate labels covered:
//   breathe_toxic, climb_steep,
//   dig_metal, fly, nightvision,
//   detect_aether.
//
// Cancel button unchanged. Normal
// non-gate sells keep the
// primary-tone "Sell" button +
// plain confirmation copy. Sells
// of one stack when a 2nd copy
// exists, or when another item
// also unlocks the same gate, do
// not trip the warning.
//
// 5/5 OTA-178 regressions
// (gateLossFor helper: only copy
// flags / extra copies pass / dual
// items pass / non-gate items
// pass / non-existent items
// return null). TS clean.
//
// Files: app/screens/VendorScreen
// .tsx (gateLossFor helper +
// modal body augmentation +
// destructive button on warning),
// __tests__/sellGateLossDetection
// .test.ts (NEW).
//
// 2026-05-29 OTA-179 — investigate
// chip-greying matches engine
// scanner-gate decision for mud
// + pulse + aetheric (was aether-
// only).
//
// Playtest log: player typed
// `investigate the mud` 5+ times
// in 25 seconds at a mud biome
// without a Mud Scanner. Each
// attempt produced the same
// Arbiter refusal "Equip a Mud
// Scanner...". The dedup caught
// some repeats but the player
// kept trying because the chip
// looked tappable.
//
// Two bugs found in
// ExplorationScreen's
// SearchModal chip mapping:
//
//   (a) The pinned `the mud /
//       ground / floor` chip
//       (always-show, top of
//       SearchModal) never
//       computed unmetRequirement
//       at all — even when the
//       biome's pin was 'the
//       mud' AND the player had
//       no Mud Scanner, the chip
//       rendered as bright-
//       active green.
//
//   (b) The broader chip mapping
//       at line 770ish hard-
//       coded the scanner bias
//       check to 'aetheric', so
//       mud-coded nouns (silt
//       vent, fungal bed, sludge
//       pool, etc.) and pulse-
//       coded nouns (automaton,
//       circuit, sentinel, etc.)
//       checked the WRONG
//       scanner type. Player
//       with no aetheric scanner
//       sees mud chips greyed
//       correctly, but a player
//       with an aetheric scanner
//       equipped sees mud chips
//       wrongly ungreyed.
//
// Fix: both chip-build sites
// now use req.scannerBias when
// the noun matches
// searchRequirementFor — the
// same bias the engine checks
// at search-time
// (gameStore.ts:5495). Chip-
// grey decision now matches
// engine accept/refuse for
// every scanner family.
//
// TS clean. No engine code
// touched — UI-only fix.
//
// Files: app/screens/
// ExplorationScreen.tsx (pinned-
// chip unmetRequirement +
// scanner-bias fix in chip
// mapper).
//
// 2026-05-29 OTA-180 — designer-
// note (📝) button removed from
// the input row.
//
// Player: "let's remove the add
// note function for the log, I
// am past that portion of request
// adding."
//
// Removed:
//   • 📝 button JSX from the
//     InputBox composer row.
//   • onOpenFeedback prop
//     contract.
//   • feedbackBtn + feedbackBtnText
//     styles.
//   • FeedbackModal render +
//     import in ExplorationScreen.
//   • feedbackOpen useState +
//     appendFeedback selector.
//
// Kept (intentionally, for any
// re-add later or programmatic
// emit):
//   • FeedbackModal component
//     file on disk.
//   • appendFeedback store
//     action.
//   • `feedback` LogChannel +
//     #c97aa8 color + NOTE chip-
//     tag in AdventureFeed (other
//     channels may still emit
//     here in the future).
//
// TS clean.
//
// Files: app/components/InputBox
// .tsx (button + prop + 2 styles),
// app/screens/ExplorationScreen
// .tsx (modal render + import +
// state + selector + onOpenFeedback
// wiring).
//
// 2026-05-29 OTA-181 — travel-row
// destination button gets 2 lines
// + larger text.
//
// Player ask: "the arrow to mud
// flood nexus in the route box is
// way too small, make it two line
// tall."
//
// TravelBtn previously rendered
// every label single-line with
// adjustsFontSizeToFit +
// minimumFontScale 0.7 — long
// Capital names ("→ MUD FLOOD
// NEXUS", "→ ISKAN-VEIL") shrank
// to ~70% of the 12pt base and
// became a blur on small screens.
//
// Fix: TravelBtn detects the "→"
// prefix on destination labels
// and switches to:
//   • numberOfLines = 2 (wrap
//     the name across two lines
//     instead of shrinking)
//   • fontSize 14 / lineHeight
//     17 / letterSpacing 1.5
//     (was 12 / default / 2)
//   • textAlign center so two-
//     line wraps balance
//   • paddingVertical 8 (was 10
//     — gives wrap room without
//     ballooning the row)
//   • adjustsFontSizeToFit OFF
//     for destinations (with
//     two lines available there's
//     no need to shrink)
//
// Other travel buttons (NORTH /
// SOUTH / EAST / WEST / MAP /
// STOP TRAVEL) keep the old
// single-line + auto-shrink
// behavior — their labels fit
// at full size, no change
// needed.
//
// TS clean.
//
// Files: app/components/InputBox
// .tsx (TravelBtn destination
// branch + 2 new styles).
//
// 2026-05-29 OTA-182 — player
// marker removed from MapScreen
// + AppShell keyboard-aware
// interior height (real keyboard
// fix).
//
// Two asks, both UX:
//
//   (1) Player marker on MapScreen
//       removed. Player: "let's
//       take the player marker off
//       of the map, we were never
//       able to make it accurate
//       so let's let the map just
//       be a map." The procedural
//       marker placement drifted
//       from the atlas's hand-
//       painted city positions
//       enough that the player
//       couldn't trust it. Removed
//       the silhouette + halo
//       rendering block in the
//       Animated.View. Footer
//       still shows the "you are
//       here" text + bearings.
//
//   (2) Keyboard covering the text
//       input — real fix. Player:
//       "whenever I am using the
//       keyboard the text box I
//       am typing into needs to
//       be pushed above the
//       keyboard so I am see what
//       I am typing." OTA-176's
//       KAV behavior split wasn't
//       enough because the actual
//       blocker is in AppShell:
//       the wrapper View has a
//       FIXED HEIGHT inside a
//       `transform: scale`
//       container, which
//       Android's native
//       adjustResize cannot
//       shrink. KAV inside also
//       can't see the keyboard
//       because the parent's
//       height stays constant.
//
//       Fix: AppShell subscribes
//       to keyboardWillShow /
//       keyboardWillHide (iOS) or
//       keyboardDidShow /
//       keyboardDidHide (Android)
//       and tracks the keyboard's
//       reported height in
//       useState. interiorHeight
//       now subtracts that
//       offset on top of the
//       safe-area insets, so the
//       wrapper actually shrinks
//       when the keyboard
//       appears — InputBox at
//       the bottom of the
//       wrapper rises above the
//       keyboard automatically.
//
// TS clean.
//
// Files: app/screens/MapScreen
// .tsx (player marker render
// block removed), App.tsx
// (Keyboard import + useState
// keyboardOffset + listener
// useEffect + interiorHeight
// subtraction).
//
// 2026-05-29 OTA-183 — INVESTIGATE
// button counts the same chips the
// modal will actually offer
// (scanner-gate aware, biome-pin
// aware).
//
// Player: "investigate button on
// the exploration button does not
// go amber it stays green when
// all items are investigated. is
// it still reading locked items as
// readable?" — YES, that was the
// bug.
//
// Two cooperating bugs in
// investigateCount (same class as
// OTA-179 chip-greying):
//
//   (a) hasScanner was hard-coded
//       to 'aetheric' bias, so
//       mud-coded chips (silt
//       vent, sludge pool, fungal
//       bed, etc.) and pulse-
//       coded chips (automaton,
//       circuit, sentinel) were
//       NOT filtered when the
//       player lacked their
//       matching scanner — they
//       still counted toward the
//       "green" trigger.
//
//   (b) groundCount always
//       checked the 'ground' key
//       and ignored scanner
//       requirements. On a mud
//       biome the pinned chip is
//       'the mud' (which needs
//       the Mud Scanner to
//       actually pay out), but
//       the count added 1 anyway
//       — INVESTIGATE stayed
//       green even when every
//       reachable chip was
//       exhausted, because the
//       count saw the mud-pin as
//       an unconsumed actionable.
//
// Fix:
//   • sceneCount filter now uses
//     req.scannerBias per noun
//     (same fix OTA-179 made to
//     the chip-grey path), so the
//     filter only excludes nouns
//     whose required scanner is
//     missing.
//   • groundCount computes the
//     right surface key (mud /
//     ground based on biome —
//     floor never counts, hub
//     branches skip) AND honors
//     the surface's own scanner
//     requirement before adding
//     to the count.
//
// Result: INVESTIGATE tints green
// only when at least one chip is
// genuinely actionable from the
// player's current loadout +
// biome. Locked-and-unequipped
// chips don't keep the button
// green anymore.
//
// TS clean.
//
// Files: app/screens/
// ExplorationScreen.tsx
// (investigateCount per-noun
// scanner check + biome-aware
// pinned-chip count).
//
// 2026-05-29 OTA-184 — 3-piece
// flavor wave: feed-dog button
// uses the dog's name + low-HP
// warning rewritten + Arbiter
// occasionally addresses the
// player by name.
//
//   (1) Inventory consumable
//       option label was "Feed
//       to dog" — generic. Now
//       reads "Feed Rocky" (or
//       whatever the player
//       named their companion).
//       Player: "let's use the
//       dogs name instead of
//       just dog."
//
//   (2) Low-HP Arbiter warning
//       was "You are nearly
//       out of body. Eat what
//       you have. Open the
//       first-aid kit." Player:
//       "I was close to dying
//       in combat it said I was
//       almost out of body? whom
//       says that, how about
//       your badly injured, take
//       some time to heal."
//       Rewritten plainer and
//       more actionable:
//       "You're badly injured.
//       Take a moment — eat
//       what you have, open the
//       first-aid kit, or rest
//       somewhere safe."
//
//   (3) New arbiterAddress()
//       helper returns the
//       player's first name ~1/3
//       of the time when a beat
//       calls for a personal
//       address, otherwise the
//       generic fallback. Player:
//       "can he use our name
//       every now and then to
//       bring on more emersion."
//       Wired into the OTA-046
//       "Welcome back" session-
//       resume line ("Welcome
//       back, Verbal." 1/3, "...
//       friend." 2/3) AND the
//       low-HP warning above
//       (prefixes the line with
//       "Verbal, " 1/3 of the
//       time, no prefix
//       otherwise). Uses the
//       first whitespace-separated
//       token of player.name so
//       a long custom name
//       ("Verbal of the Tartarian
//       Giants") doesn't read
//       awkward.
//
// TS clean.
//
// Files: app/screens/Inventory
// Screen.tsx (Feed button label),
// app/state/gameStore.ts (low-HP
// line + arbiterAddress helper +
// welcome-back use + low-HP use).
//
// 2026-05-29 OTA-185 — Roadfire
// Reclaimer is a real vendor now
// (broken-promise hook fixed).
//
// Playtest log: player followed
// the smoke hook to stage 1, got
// the "Sit. Trade if you want. I
// have heard of a hollow..." line.
// Tried `sit with the reclaimer`
// (intent=unknown) → Arbiter
// fallback. Next `investigate
// smoke` advanced to stage 2 ("you
// and the Reclaimer part ways,
// +25 TC"). Player: "thought I was
// going to hang out with a
// reclaimer. guess I can't have
// friends..."
//
// Hook narration promised trade,
// engine had no path to it. Same
// broken-promise class as the
// "rotate the ring" / "knock on
// the steeple" puzzles OTA-129
// closed for sequence hooks.
//
// Fix:
//   • New HookEffect type
//     `spawn_vendor` with a
//     HookVendorSpec payload
//     (id / name / title /
//     faction / description /
//     offers / demeanor).
//   • applyHookEffect dispatch
//     attaches the vendor to
//     currentScene.vendor when
//     no vendor is already
//     present. ExplorationScreen
//     already renders the vendor
//     banner from
//     currentScene.vendor, so
//     this surfaces immediately
//     — tap → normal vendor
//     flow.
//   • smoke chain stage 1 now
//     emits a spawn_vendor effect
//     alongside the existing
//     memo. Vendor is "Roadfire
//     Reclaimer" with 6 offers:
//     Climbing Rope (30 TC —
//     OTA-178's canonical climb-
//     gate item), Trail Rations
//     (12 TC), Aetheric Torch
//     (35 TC), Aether Dust (10
//     TC), Bone Sliver (6 TC),
//     Worn Tartarian Coin (4
//     TC). Demeanor honest so
//     the steal DC isn't
//     overtuned.
//
// Stage 2 "part ways" beat
// unchanged — fires on the next
// `investigate smoke` after
// trading, with the same +25 TC
// payout for the directions.
//
// TS clean.
//
// Files: app/engine/hooks.ts
// (HookEffect spawn_vendor +
// HookVendorSpec interface +
// smoke chain stage 1 effects),
// app/state/gameStore.ts
// (applyHookEffect spawn_vendor
// dispatch).
//
// 2026-05-29 OTA-186 — Arbiter
// drops the third-person "notes
// how you ${verb}" template for
// a first-person rotating pool.
//
// Player: "the arbiter said 'the
// arbiter notes how you
// investigate stall' I don't want
// him calling himself arbiter, say
// something like 'I saw how you
// were looking at that stall'."
//
// Two emit sites in
// narrativeGenerator (combat-
// context line 548 + peace-
// context line 708) both used the
// template
// `The Arbiter notes how you
// ${lastAction.trim()}.` which:
//   (a) Refers to the Arbiter in
//       third person (clinical /
//       broken-immersion).
//   (b) Echoes the raw verb-
//       target string verbatim,
//       producing ungrammatical
//       lines like "...notes how
//       you investigate stall."
//
// Fix: new ARBITER_NOTED_LINES
// rotating pool of 7 first-person
// reactions ("I saw the way you
// came at that.", "I noticed how
// you handled that.", "I marked
// the choice.", etc.). Both emit
// sites now pull from it via
// rotatingPick. The original
// ARBITER_LOOK_LINES pool stays
// in place for the bare `look`
// case (already first-person
// flavored from OTA 027). Combat
// site appends combatRemark()
// as before; peace site appends
// the mood-flavor.
//
// Lines are generic enough to
// land after any player action
// (investigate / attack /
// salvage / climb / eat / etc.)
// without per-verb grammar
// mapping. The "I" voice carries
// the Arbiter dialogue cadence
// established elsewhere in the
// codebase.
//
// TS clean.
//
// Files: app/engine/
// narrativeGenerator.ts
// (ARBITER_NOTED_LINES pool +
// two template swaps).
//
// 2026-05-29 OTA-187 — 3-piece
// flavor + balance pass.
//
//   (1) "Out of legs" / "Your
//       legs will not" stamina-
//       refusal lines rewritten
//       to warmer fatigue reads.
//       Player: "don't say your
//       out of legs tell me I
//       look exhausted and I
//       should rest the night."
//       continueTravel refusal:
//       'The Arbiter studies
//       you. "You look exhausted.
//       Rest the night, eat what
//       you have, and the road
//       will be there in the
//       morning."'
//       case 'travel' refusal:
//       'You take one step and
//       stop. You look exhausted
//       — the buried world will
//       hold for one night. Type
//       'rest' to recover (≈4h),
//       then the road again.'
//
//   (2) Rest healing nerfed.
//       Player: "rest gives back
//       too much health, I can
//       fully heal and restore
//       stamina with almost no
//       downside." Was 2d6 HP
//       (2-12) + 1d6+2 stamina
//       (3-8). Now 1d6 HP (1-6)
//       + 1d4 stamina (1-4).
//       Multiple rests needed
//       for a full top-up;
//       each rest still rolls
//       an ambush + advances
//       the clock 8h.
//
//   (3) Combat rate bumped.
//       Player: "the game is a
//       little shy on combat."
//       Two knobs:
//        • pickEnemyForLocation
//          base chance 40 → 50
//          (+10pp). Danger 0
//          outskirts now 50%
//          per scene arrival;
//          danger 3 capitals
//          74%; danger 5 deep
//          zones 90%.
//        • Wasteland encounter
//          rate: auto-travel
//          0.85 → 0.92; manual
//          walking 0.70 → 0.82.
//          With JSON weight
//          distribution (~30%
//          skirmish), per-step
//          combat rate rises
//          from ~21-25% to
//          ~24-28%.
//       Implicit secondary
//       buff from the rest
//       nerf: players need
//       more rest cycles, each
//       rest rolls an ambush,
//       so resting itself adds
//       combat density.
//
// TS clean.
//
// Files: app/state/gameStore.ts
// (two stamina-refusal line
// rewrites + rest heal nerf +
// wasteland rollChance bump),
// app/engine/encounter.ts
// (pickEnemyForLocation base
// bump).
//
// 2026-05-29 OTA-188 — CLIMB
// button gets a 3-state ladder +
// broken gear drops salvage.
//
// Three asks bundled:
//
//   (1) CLIMB button color: red
//       when no rope in pack,
//       amber when rope but
//       nothing to climb, green
//       when rope + climbable in
//       scene. Player ask: "this
//       button should remain red
//       until you have a usable
//       rope in your inventory.
//       and then turn amber
//       until there are things
//       to climb them turn
//       green." Implementation:
//        • New 'unavailable'
//          QuickBtnTone with
//          red border + text
//          (#e07a5f, matches
//          the combat / damage
//          warning palette).
//        • InputBox accepts new
//          playerHasRope prop.
//        • ExplorationScreen
//          passes
//          inventoryHasGate(
//          'climb_steep', ...)
//          — covers Climbing
//          Rope, Reclaimer's
//          Rope, Hardened
//          Climbing Strap,
//          Mudwalker Boots /
//          Treads, Aetheric
//          Treads, Aether Grip
//          Pads, Climbing
//          Gear, Alloy
//          Grappler, Mag-
//          Climb Kit.
//        • CLIMB tone now
//          resolves: !rope →
//          'unavailable', rope
//          + climbableCount > 0
//          → 'ready', rope +
//          0 climbables →
//          'needs-approach'.
//
//   (2) Broken rope finally
//       drops Broken Rope.
//       Player: "when the
//       rope finally breaks I
//       have never seen it
//       turn into the broken
//       rope item and populate
//       my inventory."
//       Pre-fix the rope
//       silently vanished
//       when durability hit 0.
//       Fix: wearItemByName /
//       wearItemById now also
//       return a `salvageDrop`
//       computed by new
//       `brokenSalvageFor`
//       helper. Ropes
//       (/rope|line|cord|
//       cable/) always drop
//       Broken Rope. The climb
//       site (gameStore.ts
//       ~7841) pushes the
//       drop into inventory
//       via mergeOrPushItem +
//       logs both a combat
//       "snaps" line and a
//       reward "✦ Broken
//       Rope" pickup.
//
//   (3) Weapon (and any other
//       durability-tracked
//       item) break also
//       drops a low-level
//       repair material.
//       Player: "when weapons
//       break from durability
//       what happens to them?
//       so they have a chance
//       to drop 1 single low
//       level material that
//       would be needed to
//       repair that item?"
//       brokenSalvageFor
//       returns the first
//       material from
//       scrapOutputFor(item)
//       for non-rope items —
//       Scrap Metal for
//       weapons, Patched
//       Cloth for armor,
//       Aetheric Shard for
//       relics, etc. The
//       centralized broken-
//       item handler at
//       gameStore.ts ~16327
//       inserts the drop +
//       logs "Your X shatters
//       from wear. It is
//       gone. A length of
//       <material> comes free
//       in your hand." +
//       reward chip.
//
// 3/3 craftRepairFuzz
// regressions stay green. TS
// clean.
//
// Files: app/engine/durability
// .ts (brokenSalvageFor +
// salvageDrop in wear return
// types), app/state/gameStore
// .ts (broken-item handler
// inserts drop + logs; rope
// wear site at climb path
// inserts drop + logs),
// app/components/InputBox.tsx
// (unavailable QuickBtnTone +
// 2 styles + playerHasRope
// prop + 3-state CLIMB tone
// ladder), app/screens/
// ExplorationScreen.tsx
// (inventoryHasGate import +
// playerHasRope wiring).
//
// 2026-05-29-189 — STT removed
// entirely. Player: "remove
// the stt button, the code for
// it from the game, and the
// button for activation from
// the voice tab in settings."
// InputBox drops the mic
// button + handleMic + STT
// import + listening poll;
// AboutScreen drops the STT
// toggle, the Auto-submit row,
// the !sttAvailable hint, the
// toggleSTT handler (including
// the RECORD_AUDIO Android
// permission flow), and the
// STT-related diagnostic
// lines; gameStore.hydrate
// drops the lazy STTManager
// require + setSTTDiag wiring.
// voiceSettings.sttEnabled +
// autoSubmit stay on the
// schema as inert keys so
// existing AsyncStorage rows
// parse without falling back
// to defaults (which would
// silently flip TTS-side
// settings). STTManager.ts +
// FeedbackModal.tsx left in
// place as dead JS; native
// rebuild can drop the
// expo-speech-recognition
// package + plugin without
// breaking any OTA published
// since.
//
// Files: app/components/
// InputBox.tsx, app/screens/
// AboutScreen.tsx, app/state/
// gameStore.ts.
//
// 2026-05-29-190 — bottom-row
// breathing-room floor + new
// floating input popup above
// the soft keyboard. Player:
// "the bottom row is still
// mashed all the way into the
// corners of the bottom, but
// when I go to type the
// keyboard only pushes up half
// of the orientation line. I
// need the main screen to
// always auto adjust to not
// be mushed into the very
// bottom on all devices, and
// when the keyboard opens up
// it puts a text box popup
// above it so you always see
// what your typing and can
// send it from there using
// the keyboard send button.
// the act button is still
// needed for text copy/paste
// from other sections so do
// not get rid of that."
//
// Two fixes:
//   (1) AppShell's
//       paddingBottom now
//       Math.max(insets.
//       bottom, 12) so the
//       bottom row gets at
//       least 12dp breathing
//       room even on Android
//       devices where
//       immersive-mode hides
//       the nav bar and the
//       safe-area inset
//       reports 0. iOS
//       home-indicator
//       devices keep their
//       larger inset
//       unchanged.
//   (2) New
//       KeyboardInputBar
//       component mounted at
//       App.tsx root (outside
//       the scaled wrapper)
//       renders an
//       absolutely-positioned
//       popup at bottom:
//       keyboardOffset
//       whenever the
//       keyboard opens on
//       the Exploration
//       screen. Own TextInput
//       with autoFocus +
//       returnKeyType="send"
//       + inline Act button.
//       Original InputBox +
//       Act button left
//       untouched so paste-
//       from-other-sections
//       flows still work
//       through it.
//
// Files: App.tsx
// (paddingBottom floor +
// KeyboardInputBar mount),
// app/components/Keyboard
// InputBar.tsx (NEW).
//
// 2026-05-29-191 — inferred
// items: balanced stats +
// USE / EAT / SCRAP coverage
// (hybrid static + Qwen).
// Player: "how can we make
// it so something actually
// populates that field and
// figures balanced stats for
// the item and gives it the
// full use option if it's
// usable and eat if it's
// edible, and scrap. I have
// a ton in my inventory that
// are useless. is this
// something we can also use
// qwen for?"
//
// Three phases:
//   (1) Static heuristic
//       upgrade in itemDefaults
//       .ts. inferGear now
//       emits a typed effect
//       for food / drink /
//       fungus / light /
//       compass / rope (heal/
//       restore/buff/extend
//       light/passive wisdom/
//       climb_steep gate)
//       plus material tags
//       (fiber / metal /
//       organic / crystal /
//       wood / cloth / stone)
//       so canScrap routes the
//       item to the right
//       output. inferWeapon
//       emits a flavor effect
//       string for sharp/
//       electric/fire/poison
//       names. inferArmor
//       emits keyword-based
//       resistances (burn /
//       cold / poison /
//       degradation /
//       electrical / aetheric).
//   (2) Qwen-backed deep
//       synthesis. New
//       itemSynthesisQwen
//       module calls Qwen with
//       a tightly-scoped JSON
//       prompt for items the
//       static path can't
//       classify confidently;
//       output is validated +
//       clamped (healHP ≤ 10,
//       restoreStamina ≤ 8,
//       any bonus ≤ 2, buff
//       duration ≤ 6, ≤ 8
//       extra tags). Cached
//       to AsyncStorage via
//       itemSynthesisCache;
//       fire-and-forget on
//       first encounter so
//       the synchronous lookup
//       returns immediately
//       with the static row
//       and the cache lights
//       up for the next view.
//   (3) Backfill existing
//       inventory. backfillPlayer
//       (the existing save-load
//       migration shim) now
//       calls
//       restampInventoryItem
//       on every item — pulls
//       the now-richer
//       synthesized row (or
//       any cached Qwen
//       overlay) and merges
//       its tags + fresh
//       description onto saved
//       instances in place.
//       Idempotent — only
//       fills fields that are
//       MISSING.
//
// Also: canScrap now accepts
// 'improvised' + 'organic'
// tags so misc items the
// upgraded inferGear default-
// tags pass the predicate
// (scrapOutputFor already
// recognized them; the gate
// was the only thing out of
// sync).
//
// 33 new tests across 3
// files: itemDefaults
// BalancedSynth (19),
// itemSynthesisQwenContract
// (8), itemBackfillIdempotent
// (6). Canary five
// (salvagePools / theft
// NarrationGuard / itemEffect
// / statTraining / areaSearch)
// stays green. TS clean.
//
// Files: app/engine/
// itemDefaults.ts (Phase 1
// static upgrades + Qwen
// requester hook + cache
// merge), app/engine/
// itemSynthesisQwen.ts (NEW),
// app/engine/
// itemSynthesisCache.ts
// (NEW), app/engine/
// itemBackfill.ts (NEW),
// app/engine/scrapEngine.ts
// (canScrap gate widened),
// app/state/gameStore.ts
// (cache load + Qwen
// requester wire-up +
// backfillPlayer restamp).
// 2026-05-29-192 — inferred
// items: stop advertising
// "field-inferred" + live
// in-session restamp on Qwen
// landings. Player asks:
//   "I don't want to advertise
//   field inferred, I want
//   it to just happen. and
//   are you saying if we
//   find an item we have to
//   restart the game to see
//   it's stats?"
//
// Two surgical fixes:
//
// (1) All seven "Field-
//     inferred" / "pending
//     catalog backfill"
//     description stamps in
//     itemDefaults.ts replaced
//     with neutral catalog-
//     style flavor text
//     ("Edible. Restores a
//     measure of strength
//     when eaten.", etc.).
//     The legacy placeholder
//     regex in itemBackfill.ts
//     still recognizes the OLD
//     strings on save-load so
//     pre-OTA-191 entries get
//     swapped on first hydrate.
//
// (2) itemSynthesisCache
//     gains an onSynthLanded
//     listener bus. When Qwen
//     finishes a synthesis,
//     setCachedSynth fires the
//     listeners synchronously.
//     gameStore.hydrate
//     registers a listener
//     that walks the live
//     player inventory and
//     calls the new
//     restampInventoryForName
//     helper — any matching
//     entries get fresh tags
//     + description IN
//     PLACE, so the SCRAP
//     button (gated on
//     InventoryItem.tags via
//     canScrap) lights up the
//     same render as the
//     Qwen result lands. No
//     reload, no restart.
//
// Backfill description policy
// tightened: catalog hits
// preserve hand-authored
// descriptions; inferred
// items always take the
// freshest shape.description
// (which picks up the cache
// overlay).
//
// Tests: +3 in
// itemBackfillIdempotent
// (restampInventoryForName
// match-and-skip + onSynth
// Landed listener semantics).
// Canary five stays green,
// app-side TS clean.
//
// Files: app/engine/
// itemDefaults.ts (description
// strings), app/engine/
// itemSynthesisCache.ts
// (listener bus), app/engine/
// itemBackfill.ts (source-
// aware description merge +
// restampInventoryForName),
// app/state/gameStore.ts
// (onSynthLanded listener
// registration).
// 2026-05-29-193 — inferred
// items now satisfy recipes
// directly via material-tag
// substitution. Player ask:
//   "why do I have the feeling
//   that we are generating an
//   endless stream of items
//   that will never have a
//   real use and will just add
//   to our package inventory
//   but never get figured into
//   a recipe, or repair, or
//   crafting use? it's just
//   weight, gold from sales,
//   and scrap generation.
//   prove orherwise?"
//
// Honest answer: largely
// correct, before this fix.
// Recipes matched by EXACT
// name only (canCraft at
// crafting.ts:243), so an
// inferred "Brass Sextant"
// or "Reclaimer's Cord" could
// only feed crafting by
// scrapping-then-crafting,
// never directly.
//
// Fix: canCraft + consume
// Ingredients now accept
// material-tag substitutes
// for the canonical scrap
// ingredients (Scrap Metal,
// Patched Cloth, Stick,
// Small Rock, Aetheric
// Shard, Bone Shard). A
// MATERIAL_SUBSTITUTE_TAGS
// map mirrors scrapEngine's
// tag→material rules: any
// misc item carrying 'metal'
// counts as Scrap Metal,
// 'fiber' or 'organic' or
// 'cloth' counts as Patched
// Cloth, etc. Substitutes are
// only consumed AFTER the
// canonical material runs
// out (preserve stock when
// available); restricted to
// MISC kind (weapons, armor,
// accessories are never
// silently consumed); stolen
// items are protected (player
// may want to fence).
//
// Two new exports:
//   - missingIngredients()
//     replaces the duplicated
//     shortfall calc inline
//     in gameStore's craft
//     handler; now sub-aware.
//   - previewCraftSubstitutions()
//     surfaces what's being
//     consumed BEFORE the
//     craft fires. The craft
//     handler narrates "The
//     Arbiter nods. 'Stripped
//     for parts: Brass Sextant
//     → Scrap Metal.'" so the
//     player understands why
//     their item disappeared.
//
// 16 new tests in
// craftTagSubstitution; 9
// craft/recipe/repair suites
// stay green (68 tests),
// canary five stays green,
// app-side TS clean.
//
// Files: app/engine/
// crafting.ts (substitution
// map + canCraft +
// consumeIngredients +
// missingIngredients +
// previewCraftSubstitutions),
// app/state/gameStore.ts
// (craft handler uses new
// helpers + narrates subs).
// 2026-05-29-194 — heart-
// reserve flag on inferred
// items: lock them out of
// the OTA-193 auto-substitute
// drain so they survive for
// the fusion bench (planned).
// Player ask:
//   "so there is an empty
//   heart on the item, and
//   it fills when you tap it
//   which locks it. only
//   inferred items have that
//   option."
//
// Schema: optional
// `reservedForFusion?:
// boolean` on InventoryItem
// (backwards compat — old
// saves load fine).
//
// Predicate: new exported
// `isInferredItem(name)` in
// crafting.ts returns true
// iff the name has no hand-
// authored catalog row (no
// findCatalogItem hit, no
// EXPLORATION row, no
// DOG_GEAR row). The UI
// gates the heart-tap on
// this predicate so catalog
// items never show the
// reserve option.
//
// Store: new action
// `toggleReserveForFusion
// (itemId)` flips the flag.
// Looked up by id to
// disambiguate stacks. Refuses
// to toggle on catalog items.
//
// Crafting: isSubstitutable
// in crafting.ts now also
// returns false when
// reservedForFusion is set,
// so canCraft / consume
// Ingredients / missing
// Ingredients / preview
// CraftSubstitutions all
// honor the heart.
//
// UI: InventoryScreen modal
// shows a "♡ Save for
// fusion" / "♥ Reserved for
// fusion" toggle (only when
// the item is inferred) and
// the row meta gains a small
// ♥ marker when reserved so
// the player can see locked
// items at a glance.
//
// Tests: +9 in
// craftTagSubstitution
// (reserved item not auto-
// consumed, un-reserved
// alongside still subs,
// missing/preview ignore
// reserved, isInferredItem
// predicate cases). Canary
// five green, app-side TS
// clean.
//
// Files: app/engine/types.ts
// (schema), app/engine/
// crafting.ts (isInferred
// Item + isSubstitutable
// gate), app/state/
// gameStore.ts (toggle
// action), app/screens/
// InventoryScreen.tsx (modal
// button + row marker).
// 2026-05-29-195 — fusion
// bench: random travel
// encounter that lets the
// player combine reserved
// inferred items into a
// one-of-a-kind weapon /
// armor / dog vest via Qwen.
// Player ask:
//   "have at it claudemus
//   maximus. let's put the
//   fusion benches as random
//   travel encounters"
//
// New schema: UniqueItemStats
// on InventoryItem.uniqueStats
// (kind / rarity / durability
// + weapon-or-armor specifics)
// — per-instance because each
// fused item is one-of-a-kind
// for the save that produced
// it. Combat (getEquippedWeapon
// in combatRules.ts) and AC
// (aggregateArmor in gameStore.ts)
// now check uniqueStats BEFORE
// the catalog so fused items
// route correctly.
//
// New engine: app/engine/
// itemFusion.ts
//   - gateFusion(inventory):
//     ≥3 reserved inferred misc
//     items spanning ≥3 distinct
//     material tags. Refusal
//     reason returned for the
//     arbiter line.
//   - synthesizeFusionViaQwen:
//     Tartaria-tone system
//     prompt asks for {name,
//     kind, dmg/AC/slot,
//     resistance?, special?}.
//     Validator clamps damage
//     to 1–2d4/6/8/10, AC 1–6,
//     resistance whitelist,
//     name ≤40 chars,
//     description ≤200 chars.
//   - applyFusion: drains the
//     inputs from inventory by
//     id, mints the fused item
//     with uniqueStats stamped,
//     tags ['fused', 'unique',
//     resistance].
//   - fusionInputHash: stable
//     hash for future cache
//     keying.
//
// Encounter: new "fusion_
// crucible" archetype in
// wasteland_encounters.json,
// type 'fusion_bench', weight
// 4 (rare ~4% of an encounter
// fire). Matchers cover the
// usual wasteland tags + aether
// / tech / surface for thematic
// flavor. stepDirection in
// gameStore handles type ===
// 'fusion_bench' by setting
// player.fusionPending=true
// and narrating an arbiter
// line. The permit survives
// saves so the player can
// walk to safety before
// fusing.
//
// New verb: typing "fuse"
// short-circuits the parser
// at the top of submit
// PlayerAction and calls the
// new fuseAtCrucible store
// action. Three-gate path:
//   1. fusionPending or refuse
//   2. gateFusion or refuse
//      with the reason
//   3. qwen.isReady() or refuse
//      WITHOUT consuming the
//      permit (so the player
//      can wait for the model)
//
// On Qwen failure / parse
// failure / validation
// failure, the permit IS
// consumed — fail-closed so
// the player can't re-roll
// for a better unique item.
//
// itemPreview gains
// getItemPreviewForInstance
// which prefers uniqueStats.
// InventoryScreen modal uses
// this so fused items render
// their unique damage / AC /
// resistance / special lines
// in the preview block.
//
// 22 new tests in
// itemFusionEngine (gate
// rules, validator clamps,
// Qwen mock, applyFusion,
// determinism). 203-test
// regression sweep across
// craft / recipe / repair /
// itemEffect / salvage /
// theft / area / stat / item
// Defaults / itemSynthesis /
// itemBackfill / itemFusion /
// combatRules all green;
// canary five green; TS
// clean app-side.
//
// Files: app/engine/types.ts
// (UniqueItemStats +
// fusionPending), app/engine/
// itemFusion.ts (NEW),
// app/engine/combatRules.ts
// (uniqueStats-first weapon
// resolve), app/engine/
// wastelandEncounters.ts
// (fusion_bench type), app/
// data/world/wasteland_
// encounters.json (crucible
// archetype), app/state/
// gameStore.ts (encounter
// hook + fuse verb + fuseAt
// Crucible action +
// aggregateArmor uniqueStats
// branch), app/components/
// itemPreview.ts (uniqueStats
// preview shape), app/
// screens/InventoryScreen.tsx
// (uses getItemPreviewFor
// Instance).
// 2026-05-29-196 — playtest
// log cleanup: silence the
// inferred-stats debug spam +
// route pet/scratch/pat/
// nuzzle to the dog. Two
// bugs surfaced from the
// 2026-05-29 playtest log:
//
// (1) inferred-stats noise.
//     OTA-192 stopped using
//     "Field-inferred" in
//     user-facing descriptions
//     but the setOnInferred
//     hook in gameStore.hydrate
//     still pushed a debug-
//     channel log line every
//     time an unknown name was
//     synthesized. Playtester
//     saw
//       [debug] inferred-stats:
//       gear:Mud Cloth — engine
//       guessed stats; add
//       catalog row when
//       convenient.
//     in their feed every
//     session-start. Re-routed
//     the hook to console.log
//     (visible via adb logcat
//     / dev tools, hidden from
//     the in-game log).
//
// (2) pet/scratch Rocky
//     parser fail. Same log:
//       [player] pet Rocky →
//       parser: intent=unknown
//       conf=0.10 resolved=
//       shattered petrified
//       mud wave
//       [player] scratch Rocky →
//       intent=unknown +
//       arbiter babbling about
//       a "disease sample"
//     Neither verb existed in
//     parser.ts; 'pet' even
//     substring-matched
//     'petrified' on the
//     scene's feature list.
//     Added a top-of-
//     submitPlayerAction
//     short-circuit (alongside
//     'fuse'): /^(pet|scratch|
//     pat|nuzzle)(\s|$)/i
//     routes to
//     selectCallDogOption
//     ('scratch') when a live
//     dog is present, otherwise
//     refuses with "No dog at
//     your side, friend." The
//     leading-token regex
//     guarantees 'petrify' /
//     'petrified' don't
//     trigger the path.
//
// Tests: +6 in petScratchVerb
// Routing covering loyalty
// boost, all four synonyms,
// no-dog refusal, and the
// petrify/petrified
// non-trigger. dogVerb /
// parserFuzz / itemFusion /
// craftTagSubstitution stay
// green. App-side TS clean.
//
// Files: app/state/
// gameStore.ts (setOnInferred
// reroute + pet/scratch
// short-circuit).
// 2026-05-29-197 — combat
// resist nudge + pet/scratch
// opens the full CallDog
// modal. Player asks:
//   "Your only weapon is
//   piercing; both wasteland
//   enemies you fought resist
//   piercing. A nudge from
//   the Arbiter (..) on the
//   second consecutive resist
//   hit might help guide
//   weapon swaps. I agree,
//   have the arbitor say it
//   as well.
//   for the dog interactions
//   have them slowly build
//   loyalty and have a good
//   interaction popup show
//   all the things you can do,
//   if you pick treat it opens
//   your inventory to pick an
//   item."
//
// (1) Combat: new transient
//     `weaponResistStreak`
//     state on GameStore.
//     Tracks consecutive
//     resists per (enemyName,
//     damageType). On the
//     SECOND consecutive hit
//     the Arbiter chimes in
//     with a grounded swap
//     hint — scans player
//     inventory for non-
//     matching weapon damage
//     types and surfaces them
//     ("Twice now. Try
//     something bludgeoning
//     or aetheric — you have
//     it in your pack."). If
//     no alternative is in
//     the pack, generic line.
//     Streak resets after
//     firing so one nudge
//     per swap-window. Also
//     resets on any non-
//     resisted hit. Not
//     persisted across save/
//     load.
//
// (2) Dog interactions: OTA-
//     196 routed pet/scratch/
//     pat/nuzzle straight to
//     the scratch action.
//     OTA-197 opens the
//     existing CallDogModal
//     instead so the player
//     sees scratch +2 / treat
//     (+20 or +40 if dog-
//     treat tagged) / speak
//     +1 — and treat opens
//     the inventory picker
//     filtered to consumables
//     (already wired in the
//     modal). Loyalty stays
//     at the existing slow-
//     build values per the
//     "slowly build loyalty"
//     ask.
//
// Tests: +4 in
// weaponResistNudge
// (initial / shape / reset /
// per-enemy isolation). Pet/
// scratch test reframed to
// assert callDogModalOpen
// goes true (was: loyalty +2
// — now happens after modal
// pick). canary five + OTA-
// 191/192/193/194/195/196
// suites stay green. TS
// clean app-side.
//
// Files: app/state/
// gameStore.ts (weaponResist
// Streak schema + reset
// branch in combat + pet/
// scratch reroute to
// openCallDogModal).
export const OTA_BUILD_ID = '2026-05-29-197';
