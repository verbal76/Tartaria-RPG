# Tartaria-RPG — Working Notes

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
5. **Report honestly** whether the fix is category-complete or has NAMED
   residuals — never imply category coverage that wasn't verified.

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

## Shipping rule: OTA-only, and BATCH the push (min 5)

Every change is shipped as an **OTA update** unless a native build
is the only way to accomplish it. Default flow per change:

1. Edit code in `app/` / `__tests__/` / `docs/` etc.
2. Bump `OTA_BUILD_ID` in `app/buildInfo.ts` (`YYYY-MM-DD-NNN`
   format; increment NNN per change)
3. `git add -A && git commit` to `HaL2001` — **commit locally, do
   NOT push yet** (see batching rule below).

### Batching rule — accumulate ≥5, the USER triggers the push

We do **not** push singular OTAs anymore. Pushing 60 OTAs in a day
is what set up the OTA-338 brick (a mid-session OTA apply during a
double-reload corrupted the live save). The rule now:

- **Minimum 5 OTAs per batch before a push.** Build + commit each
  change locally on `HaL2001` (its own OTA id + Anvil codename), and
  keep a running **"Next Batch — staging list"** at the top of
  HANDOFF.md §0 so the queued-but-unpushed OTAs are legible at a
  glance.
- **The push command comes from the USER.** Never `git push HaL2001`
  on your own — pushing IS the ship (it publishes the OTA to phones).
  Stage the work, report "N/5 staged," and wait for the user to say
  push.
- **Exceptions (push before 5 is allowed):** (a) the user explicitly
  overrides ("push now"), or (b) we hit a state that forces a native
  build / store submit (`[build-aab]` / `[build-ios]` / `[submit-ios]`)
  — in which case the batch ships alongside the build per the user's
  call.
- After a user-approved push, clear the staging list and reset the
  count for the next batch.

**Native build is only required when:**
- Adding a new native module / Expo plugin (camera, BLE, etc.)
- Changing `app.json` / `app.config.js` runtime version
- Modifying native iOS/Android files under `ios/` or `android/`
- Bumping the Expo SDK version
- Anything that changes the JS engine, Hermes config, or
  native permissions manifest

For everything else — engine logic, JSON catalog edits, UI
component changes, screens, hooks, tests, assets that are
bundled JS-side — OTA is the only path. Don't suggest
`eas build` / native rebuilds for changes that fit in the JS
bundle.

If unsure whether a change requires a build, default to OTA and
let the harness reject if it can't be applied — it's faster than
the round trip of a native rebuild.

## OTA commit title convention — codename FIRST

Every OTA commit's first-line title MUST start with the build
codename (from `app/buildCodename.ts` / `docs/build-codenames.md`),
followed by an em-dash, then the `OTA-NNN` identifier, then the
description. Format:

```
<Codename> — OTA-NNN — <short description>
```

Examples:

- `Smoke Anvil — OTA-267 — Build codename obfuscation layer`
- `Tin Tine — OTA-268 — Vendor: gift verb routing fix`
- `[build-ios] [submit-ios] Cinder Drift — OTA-266 — Info.plist...`
  (build/submit markers stay as the absolute first tokens; the
  codename slots in right after them)

**Why:** the user views commits on a phone where titles truncate at
~30-40 characters. With the codename leading, a truncated title
("Smoke Anvil — OTA-267 — Build cod...") still tells them which
build the commit corresponds to at a glance. The codename-only
prefix means they don't have to expand each title to figure out
which OTA they're looking at when triaging or referencing builds
later.

**Codename selection:** when bumping `OTA_BUILD_ID` in
`app/buildInfo.ts`, also add a new entry to the `CODENAMES` map in
`app/buildCodename.ts` drawing from the next unused name in
`docs/build-codenames.md`'s reserved pool. Move that name from the
reserved pool up into the current-mapping table in the doc. The
commit then uses that fresh codename as its title prefix.

## HANDOFF.md — the build timeline

`HANDOFF.md` is the canonical record of every issue tracked
against this project. Two sections only: **Open Issues** and
**Closed Issues**. The file is the dev-facing source of truth
for "what's been fixed, by which OTA, how, and what's still
broken." Read it before planning ANY fix.

### Workflow per OTA / APK push

Every time you ship an OTA or APK, the same commit must
update HANDOFF.md:

1. **If the OTA closes a tracked Open Issue:**
   - Remove the entry from the Open Issues section.
   - Add an entry to Closed Issues at the top of the
     "fixed" list with: **OTA-NNN** (or APK#) · **what was
     broken** (the playtester's symptom or the design ask) ·
     **how it was fixed** (the actual code change in one
     paragraph) · **why this approach** (one line).

2. **If the OTA closes an issue that wasn't tracked as Open
   (you noticed it in a log, opportunistic fix, etc.):**
   - Add it directly to Closed Issues with the same WHO /
     WHAT / WHEN / WHERE / WHY structure. Skip the "Open"
     phase.

3. **If the OTA introduces a NEW open issue** (you noticed
   something but couldn't fix in this OTA, or shipped a
   feature with known limitations):
   - Add it to Open Issues.

4. **Commit HANDOFF.md alongside the code change.** Same
   commit. No "I'll update the doc later."

### Before planning any fix

Burn through HANDOFF.md first. Two things to look for:
- **Is this issue already closed?** If yes, the fix exists —
  check whether it's working, whether it regressed, or
  whether the user wants a tweak. Don't reinvent.
- **Will my plan break a previously-closed fix?** The Closed
  section names which fix touched which code path. If your
  plan crosses one of those paths, factor in that constraint
  before writing the new fix.

### Periodic "what's open" requests

The user will periodically ask for a list of open issues.
That's the Open Issues section, top to bottom. Keep entries
tight: one-line title + 2-3 line description + last-known
state ("blocked on X", "needs design call", "deferred — low
priority").

### Why this matters

Without HANDOFF.md as the running timeline, every session has
to re-derive history from `buildInfo.ts` comments and `git
log`. That works but it's slow and error-prone — agents
will sometimes propose fixes that resurrect old bugs because
they didn't grep deep enough. The Open/Closed structure makes
the state of the world legible at a glance.

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
