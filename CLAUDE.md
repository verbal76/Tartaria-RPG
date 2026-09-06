# Tartaria-RPG — Working Notes (CLAUDE.md)

> **HANDOFF.md is the operational source of truth — it took over most of what
> used to live here.** The multi-line operating model (HaL2001 / golem-line /
> engine_Dev), cold-start worktree setup, CI gates, the per-OTA change loop,
> push cadence + authorization, cross-line parity, native-build rules,
> commit/PR conventions, the open-issues watch list, and the OTA history all
> live in **HANDOFF.md** on each branch — read its §0–§3 before doing
> anything. This file keeps only the standing JUDGMENT rules that aren't
> process: how to fix, how to weigh canon, and the paste-triage workflows.
> Rules below that contradict HANDOFF are wrong — HANDOFF wins. (Rewritten
> 2026-07-26 at the owner's direction; the retired sections — "batch ≥5
> before pushing", codename-first commit titles, the old Open/Closed-issues
> HANDOFF format — are gone, not merely deprecated.)

## FIX RULE — kill the CATEGORY'S root cause, never just the incident

Owner directive (2026-07-26): every fix must target the ROOT CAUSE of the
issue's whole CATEGORY whenever possible — we are eliminating the causes of
CLASSES of errors, not patching the specific incident that got reported.
For every bug report:

1. **Find the root cause and PROVE it** — instrument / probe the live code
   path if reading isn't conclusive. Never patch the symptom you can see.
2. **Name the category** the report is one instance of ("every stat
   level-up toast", "any takeable item as a climb target", "every offer
   surface for this contract kind"), then fix at the CHOKE POINT all
   instances share — one helper, one gate function, one pool — so the whole
   class dies at once, not just the call site that appeared in the log.
3. **Verify coverage mechanically** — grep for every other instance of the
   pattern and assume your first search was incomplete. (Case on record:
   the 2026-07-26 stat-toast fix found 7 sites; the verification pass the
   owner demanded found 22.)
4. **Lock the category shut** where practical: a regression test that fails
   if the pattern ever reappears (see `ota994StatToastLock`'s source-scan
   lock) and/or a ship-script grep guard.

**Full step-by-step playbook** — bug-report intake, the exploit lens, how to
build additions, and the ship-mechanics traps that burned prior sessions —
is `HANDOFF.md` **§3a ROOT-CAUSE PLAYBOOK**. Work its checklists VERBATIM for
every bug report, every fix, and every new system; run its §E self-audit
before declaring anything done.
5. **Report honestly** whether the fix is category-complete or has NAMED
   residuals — never imply category coverage that wasn't verified.

**Why this rule replaced the old batch-≥5 push cap (owner, 2026-07-26):**
the batching era was quick-fired minor fixes — bandaids on incidents, not
root causes — and every push burned GitHub Actions build minutes, so pushes
were rationed. Root-cause category fixes are the real cure: one meaty OTA
kills the whole class instead of five bandaids trickling out, which calms
the push volume on its own. If OTAs start quick-firing again, that's a
signal the fixes have drifted back to bandaids — tighten the category
discipline, don't reinstate the cap.

## Canon precedence (lore vs. gameplay vs. shipped code)

When reconciling content from the design docs against shipped game
mechanics, this is the precedence order — ALWAYS:

1. **Shipped app code wins.** If the engine implements something, the
   engine is the source of truth. Don't refactor away balanced shipped
   mechanics to match a doc.
2. **`docs/tartaria-hack-v2.5.txt` wins over the legacy bible** for any
   gameplay rule (mechanics, DCs, dice, combat order, character
   creation, balance tables). The hack file IS the canonical gameplay
   doc as of OTA-235.
3. **`docs/tartaria-ttrpg-bible-LEGACY.txt` is reference-only** for
   world flavor / lore that the hack doesn't restate. Original prose
   for factions, geography, Etheric anomalies is still good — but
   don't treat its mechanical bits as canonical.

When the app is missing a mechanic the hack specifies, pull the spec
from the hack and **balance it against shipped code during dev** —
don't blind-ingest the hack's numbers. The user has said this
explicitly: "we have done mountains of balancing during this app's
development. When in doubt, the lore gameplay mechanics lose to the
app's mechanics."

The `app/data/lore/canon-*.json` files (events, titles, food/drink,
skills, weapons, armor, currency, loot, task tiers, action tiers)
are LORE COPIES of the doc tables — they feed Qwen narration and the
Ask the Arbiter MiniLM lookup. Treat them as authoritative for what
the ARBITER knows, not for what the engine does.

## Shipping quick-truths (details: HANDOFF §2–§6)

- **Everything ships as an OTA** unless it genuinely needs a native build
  (new native module, `app.json`/runtime change, `ios/`/`android/` edits,
  SDK bump — full list in HANDOFF §5; confirm with the owner first).
  Default to OTA.
- **Push cadence: each OTA is pushed as it lands** on the line branches the
  owner authorized this session — pushing IS shipping for the mobile lines.
  Never push a line without that session's authorization. (The old
  "batch ≥5, owner triggers the push" rule is retired.)
- **Commit titles:** `OTA-NNN — <short description>` (+ `[build-*]` markers
  first only when a native build is truly intended). The codename-first
  title convention is retired. Trailers per HANDOFF §6.
- **Every OTA bumps `OTA_BUILD_ID` AND `DISPLAY_VERSION`** (PATCH +1 per
  OTA; MINOR on a feature wave — scheme + ledger in VERSION.md).
- **All gates before every push:** typecheck:ci, lint, typecheck:tests
  ratchet, targeted jest, full fast suite (HANDOFF §3).

## Playtest-log triage

**⚠⚠⚠ READ THE OWNER'S OWN COMMENTS FIRST — BEFORE ANY OTHER PASS.** Owner
directive, 2026-09-06: *"the main thing from the logs that I push first should
always be my comments of game issues or changes. so always look for my comments
first."* He types into the game WHILE playing, and those lines are the reason
the log was pushed at all. They live in three places, all of which must be read
before the arithmetic:

  1. the bug report's `--- DESCRIPTION ---` block (the words he typed on the
     report screen);
  2. the `feedback` channel — DESIGNER NOTE entries, dictated or typed mid-play;
  3. any `[player]` notation in the game log itself.

Enumerate every one of them, verbatim, and answer each explicitly. A log pass
that opens with combat arithmetic and never quotes what he actually wrote has
buried the payload under the packaging — and a comment he had to repeat because
it was missed costs him a whole round trip.

When the owner pastes a device log (the `=== TARTARIA LOG · PART N ===`
envelope): DIAGNOSE FIRST. Produce observations — bugs, exploits, balance
evidence, lore/narration incoherence, things working as intended — and do
NOT code fixes until the owner rules on each finding. When fixes are
approved, apply the FIX RULE above per item, and keep the owner's design
calls (intentional exploits, kept tradeoffs) on record in HANDOFF §8 so a
future session doesn't "fix" them.

**⚠ ALWAYS critique TRAVEL and COMBAT — every log, no exceptions** (owner
directive, 2026-08-26: "those 2 items have so many variations they must
always be critiqued"). These two systems have the most moving parts and the
most ways to be quietly wrong, so a log pass is not done until each has its
own explicit verdict:

- **Combat**: check every fight's arithmetic against the systems — spawn
  staggering and per-enemy rings (OTA-1506+), the attack gate judging the
  TARGET'S own band, movement deltas (one ring per head-on step, the
  CONTACT_MIN 0.35 clamp), pursuit per body, counter eligibility per enemy
  reach class (OTA-1508 full/weak bands, weak-edge halving), initiative,
  AC/damage math, DOT ticks, dodge/stealth economies, boss double-swings,
  and the kill promotion re-deriving the band (OTA-1507). Verify the
  numbers, don't skim the prose.
- **Travel**: check every movement beat — overland steps vs the compass and
  where-line, route/auto-travel behavior, tile canon (locations matching
  the atlas), encounter spawn timing on the road, outpost/room navigation
  against the graph, ENTER affordances, weather reposition costs, and
  time-passed stamps against the action taken. If the log contains NO
  travel, say so explicitly rather than silently skipping the category.

State both verdicts even when one is "clean" or "absent" — an unexamined
category reads identical to a passing one, which is how variations slip by.

## Inventory snapshot triage

Whenever the user pastes a COPY INVENTORY export — recognizable
by the `=== TARTARIA INVENTORY · N CHARS · BEGIN ===` envelope
from `app/diagnostics/inventorySnapshot.ts` — automatically run
a triage pass before any other reply:

1. **Scan each `actions:` line for gaps.** Flag items that
   should be usable/equippable but show `drop` only (or `scrap,
   drop` for items whose descriptions imply more).
2. **Cross-reference catalog rows.** For any flagged item, grep
   `app/data/items/*.json` and check whether the description
   implies a mechanic the catalog row doesn't carry — missing
   `effect`, missing `throwable` tag, missing slot routing,
   etc. (See OTA-209's Sentinel Core Plate fix as the model.)
3. **Check the ◆ markers.** Inferred items in the snapshot are
   prefixed with ◆ (per OTA-204). Note which ones are reserved
   for fusion (`♥reserved`) and whether the player is close to
   the fusion gate (≥3 reserved spanning ≥3 distinct material
   tags per OTA-195).
4. **Equipment durability.** Surface anything below 25% with a
   repair cost calculation, accounting for OTA-205's substitute
   materials.
5. **Recurring themes.** Group findings by category — catalog
   gaps, balance flags, UX opportunities — and prioritize:
   ship the small hand-authored fixes; flag engine-verb gaps
   without building speculative infrastructure.
6. **Report findings before asking what to do.** Give a
   concrete list ("Item X has gap Y → OTA-NNN candidate"),
   then ask which to ship. Don't wait for the user to ask the
   triage question.

The snapshot was built specifically so this triage is mechanical
(OTA-202 → 203 → 204 → 206 → 208 progression). Treat every paste
as a request for it, even when the user just says "here's a fresh
one." If they don't want triage, they'll say so.
