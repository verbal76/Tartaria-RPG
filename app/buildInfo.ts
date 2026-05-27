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
export const OTA_BUILD_ID = '2026-05-27-109';
