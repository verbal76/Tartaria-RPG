# Four-Line Divergence Census — Step 1

**Measured 2026-08-20 against golem `5f6881df` (4.29.273 · OTA-1379) plus uncommitted OTA-1380.**

The question this answers: *of everything that differs between the four product
lines, how much did we CHOOSE and how much is rot?* A `git diff` cannot tell
them apart, because both are stored in the same medium. That is the whole reason
porting is slow and the reason drift survives.

Method: `scripts/divergence.py` normalises away the things that are known noise —
comments, `OTA-nnnn` / `webN` / `arbN` numbering, `DISPLAY_VERSION` strings,
date stamps, whitespace — and reports what is left. `buildInfo.ts` and
`buildCodename.ts` are excluded (they are per-line changelogs by design, 24k
lines of superseded comments). Identifiers, player-visible strings and control
flow are deliberately **not** normalised: those are the differences that matter.

⚠ **NOTHING IS ON THIS LIST FROM A GREP.** Every entry below was opened and
read. Where a difference turned out to be cosmetic it is recorded as cosmetic
rather than quietly dropped, so the next person does not re-investigate it.

---

## The headline

| pair | raw paths differing | **real code differences** |
|---|---:|---:|
| golem ↔ HAL | 1,053 | **14** |
| golem ↔ steam | 186 | **11** |
| golem ↔ html | 1,052 | **13** |

394 shared source files per pair. **Over 98% of the apparent divergence is
comment prose and per-line OTA numbering.** The lines are far closer than the
diff suggests — which is good news for collapsing them, and bad news for
spotting the handful of differences that are real, because they are buried under
a thousand that are not. That is precisely the problem a single trunk solves.

Of the 14/11/13, most are **work in flight** — golem is ahead by OTA-1380, which
has not been ported yet. Excluding that, the four lines carry **three genuine
unintended divergences** and a handful of deliberate ones.

---

## E — REAL DRIFT. Nobody chose these.

### E1 ⚠⚠ The `tracked` single-active backfill exists on two lines out of four

| | golem | HAL | steam | html |
|---|---|---|---|---|
| backfill present | ✗ | ✓ | ✗ | ✓ |
| readers of `tracked !== false` | 22 | 22 | 22 | 22 |

HAL and html migrate legacy saves so exactly the first faction quest is
`tracked: true`. golem and steam do not. All four then read tracked-ness through
`q.tracked !== false`, which treats **`undefined` as tracked**.

So on a legacy save: **golem and steam show every accepted faction quest as
active; HAL and html show one.** Same save, same code path, different game.

The split is 2/2 with no rationale recorded on any line. This is the clearest
example in the census of why the census exists: it is invisible in a diff
(one line among a thousand comment changes) and it changes what the player sees.

**Fix: port the backfill to golem and steam.** The predicate is the same
everywhere already; only the migration is missing.

### E2 ⚠ `TTSManager.ts` — steam applies the same line twice

`if (opts?.front) queue.length = 0;` appears at **both** line 195 and line 205 on
steam. golem, HAL and html have it once.

Idempotent, so it is not a live bug — clearing an already-cleared queue costs
nothing. It is recorded because of what it *is*: a botched-port artifact, the
exact failure mode hand-porting produces, sitting in the file that a future
reader will use as the reference for how the queue behaves.

**Fix: delete the duplicate on steam.**

### E3 ⚠ The codex clipboard fallback is missing on two lines

steam and html carry `payloadIn` / `payloadOut` in `LoreCodexBody.tsx` — a
manual paste box for when the clipboard is unavailable, with copy that says so
("This machine would not give up its clipboard"). golem and HAL have neither.

Platform-motivated in origin (desktop and web clipboard permissions are the
harder case), so this could be filed as intentional. It is filed here instead
because **a mobile clipboard write can fail too**, and when it does, the golem
and HAL player gets "Could not copy. Try again." with their ledger nowhere —
which for the fallen exchange means their dead cannot cross at all.

**Fix: port the fallback to golem and HAL.** It is strictly better everywhere.

---

## D — INTENTIONAL, but a trap that should be written down

### D1 A persisted field has two different names across the lines

| golem | HAL | steam | html |
|---|---|---|---|
| `dogRevivedOta915` | `dogRevivedOta938` | `dogRevivedOta915` | `dogRevivedOta938` |

This is **deliberate and correctly reasoned** — HAL's own build ledger records it
was *"caught and NOT copied: `dogRevivedOta938` is a PERSISTED field"*, i.e.
somebody spotted that renaming a key already written into player saves would
orphan it, and left the two names alone. Good call.

Harmless **today** because the flag is inert on all four lines (declared in
`types.ts`, no reader anywhere; the dog is loaded as saved since OTA-938). The
trap is that inert is not the same as gone: if anything ever reads it again, two
lines look for a key the other two never wrote, and the failure is silent.

**Action: none now.** When the lines collapse, this is the one field that cannot
simply be unified — it needs a reader that accepts either name.

---

## C — INTENTIONAL, product decisions

| difference | lines | why |
|---|---|---|
| `fallenLedger.ts` name gate (`sharingUnlockedFor`) | HAL only | OTA-1363, owner-directed: the exchange panel is visible only to Verbal / Sasmooch on the live channel |
| `backfillEnemyIntelFromDefeats` | HAL only | marked *"HAL ONLY, per owner"* in the source |

Both are exactly what a feature flag should be, currently expressed as a branch
difference. **These two are the first candidates to become `FEATURES` entries.**

---

## B — INTENTIONAL, platform

| difference | lines | why |
|---|---|---|
| `GamepadNav.tsx` / `.web.tsx` | steam, html | controller input; no equivalent on phone |
| `kokoroWeb.ts` / `.web.ts` | steam, html | Web Speech path |
| `TTSManager.ts` web branch | steam, html | routes to `kokoroSpeakWeb` when `Platform.OS === 'web'` |
| `SplashOverlay.tsx` | steam, html | desktop/web splash timing |
| `App.tsx` `GamepadNav` import | steam, html | mounts the above |
| `app.json` | all four | update channel, runtime version, product name |

All six are genuine platform capability differences. Under a single trunk these
become `Platform.OS` checks and `.web.tsx` resolution — which the codebase
**already uses** for `GamepadNav.web.tsx` and `kokoroWeb.web.ts`, so the pattern
is proven in-tree, just not applied consistently.

---

## A — WORK IN FLIGHT (golem ahead; not divergence)

`crashLedger.ts`, `crashReporter.ts` (golem-only files), `AboutScreen.tsx` (+67
tokens), `App.tsx` OTA-1380 wiring, `aboutSummary.ts` (+6), and part of
`gameStore.ts` — all OTA-1380, built on golem and not yet ported. Also OTA-1378
and OTA-1379 are applied to all four but only committed on golem.

**This category disappears the moment the ports land.** It is listed so nobody
mistakes it for divergence when re-running the census.

---

## Cosmetic only — checked, no action, do not re-investigate

| file | what it is |
|---|---|
| `app/engine/hooks.ts` | `stranded_traveler: 0` sits one key earlier on HAL |
| `app/screens/ExplorationScreen.tsx` | an empty `{ }` block on golem |
| `app/screens/VendorScreen.tsx` | `rarityHexColor` import on a different line |
| `app/data/items/recipes.json` | `_note` prose (JSON has no comments, so the notes are data and the normaliser cannot strip them) |
| `app/data/world/hub_faction_variants.json` | the file's own `description` string |
| `app/data/lore/concepts.json` | whitespace |

---

## What Step 1 concludes

1. **The lines are ~98% identical.** Collapsing them is a much smaller job than
   the 1,053-file diff implies.
2. **Three real drifts exist**, and one of them (E1) changes what the player
   sees on a legacy save. All three are cheap to fix.
3. **Only two product differences and six platform differences are deliberate.**
   That is the entire flag set a single trunk would need — eight entries, not
   the hundreds the branch count suggests.
4. **The census is repeatable.** Re-run it after any port to catch new drift
   before it sets; it takes about four minutes.

Step 2 is fixing E1–E3. Step 3 is turning C and B into `FEATURES` / `Platform`
checks. Step 4 is the collapse itself.
