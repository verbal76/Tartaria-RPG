# THE BAKER'S DOZEN — 2.5.0 PERMANENT LEDGER

**Authority SHA:** `61f104e0f4b9d2ad3663f22d19ec9ce6e88afe86` (public `golem-line` head at the
time of writing; worktree clean, no drift).

**Status of this file:** the durable repository authority for Baker's Dozen stability work
after the 2.5.0 stack migration. It supersedes conversational memory.

---

## WHY THIS DOCUMENT EXISTS

The Baker's Dozen had been surviving **partly through conversational memory**. A
requalification audit at `61f104e0` searched `docs/`, every root `*.md` (including
`HANDOFF.md`, `HANDOFF-ARCHIVE.md` and `CLAUDE.md`), every file under `app/` and
`__tests__/`, all commit bodies across all branches, and `sentry-inbox/`.

> **The authoritative original 1–13 ledger does not exist in this repository.**

Only items **3, 3A, 7, 8, 9, 11 and 13** are named anywhere in source or history. Seven
slots — **1, 2, 4, 5, 6, 10, 12** — could not be recovered. (The `sentry-inbox` hits for
"baker" are in-game flavour text about a dead baker, not the ledger. Checked and discarded.)

This document therefore records:

- **A.** what is actually source-recovered;
- **B.** what is current on the 2.5.0 stack;
- **C.** what remains NOT RECOVERED;
- **D.** what is closed;
- **E.** what requires reproduction before anyone touches it;
- **F.** what is a legitimate independent defect **regardless of whether it contributes to
  any freeze**.

### These are not only freeze work

The Baker's Dozen is a set of **stability and architecture defects and risks in their own
right**. An item earns repair by being incorrect, fragile, expensive or unsafe. It does not
need to be a freeze suspect to deserve attention, and it does not become a freeze cause by
being on this list.

---

## THE RULE: BAKER DEFECT ≠ PROVEN FREEZE CAUSE

**No item in this ledger may be described as causing the current Apple freeze without
separate evidence.**

The current unresolved Apple freeze is an **OPEN symptom** with no identified culprit. The
requalification audit that produced this document explicitly did **not** identify one. When
an item here is repaired, the honest claim is "this defect is fixed", never "the freeze is
fixed" — unless device evidence says so independently.

---

## STACK-MIGRATION CONTEXT

Current 2.5.0 architecture, read from source at the authority SHA:

| Component | Version |
|---|---|
| Expo | `54.0.37` |
| React Native | `0.81.5` |
| React | `19.1.0` |
| New Architecture | **enabled** (`app.json`, `android/gradle.properties`) |
| JS engine | Hermes (RN 0.81 default; `jsEngine` unset) |
| llama.rn | `0.4.8` |
| react-native-executorch | resolved **`0.8.5`** (`package.json` declares `^0.8.4`) |
| onnxruntime-react-native | `1.24.3` |

Two consequences govern every verdict below:

1. **Old native-stack evidence does not automatically represent current runtime behaviour.**
   Jetsam numbers, prefill timings and queue observations taken before the migration
   describe a different allocator, a different bridge model and different ML libraries.

2. **Application-logic defects may survive stack migration unchanged.** The shared ML lock,
   the preemption door, the activity clock and the deferred-submit path are all TypeScript
   inside the OTA bundle. They crossed the migration untouched. The migration replaced what
   is *underneath* them, not them.

A corollary worth stating once: with the New Architecture enabled, the old RN bridge no
longer exists in the form the historical "bridge/reload teardown" concern described. That
premise is materially invalidated — not because the symptom stopped, but because the
mechanism was renamed out of existence.

---

## PERMANENT LEDGER

Source references are **as of `61f104e0`**; line numbers drift, symbol names do not.

| ITEM | RECOVERED LABEL / DESCRIPTION | ORIGINAL LAYER | 2.5.0 STATUS | IMPACT | EVIDENCE | CURRENT ACTION | NOTES |
|---|---|---|---|---|---|---|---|
| **#1** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | Do not back-fill from leads; the lead list is longer than the gap |
| **#2** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | |
| **#3** | Excessive process memory / iOS Jetsam pressure. Historical evidence: ~1.85–1.89 GB process use and `per-process-limit` termination on a 3 GB iPhone XR (three reports) | MIXED | **REPRODUCE / REBENCHMARK** | **CRITICAL** if present — native process termination is possible | Historical only, all on the old stack | Owner-device 2.5.0 memory rebenchmark using the #3A instrumentation | Every allocator in the picture changed at 2.5.0; the old numbers carry forward nothing |
| **#3A** | Memory instrumentation / timeline. "An instrument, not a fix" — explicitly forbidden from repairing any memory behaviour | APP LOGIC | **CLOSED / PRESENT IN CURRENT SOURCE** | n/a (observability) | Source-derived current | No repair; use as the measurement authority for #3 | `app/diagnostics/memoryTimeline.ts` (`noteMemoryMark`, `noteMemoryMarkIfMoved`, `memoryTimeline`); `app/diagnostics/runtimePressureWatch.ts`; marks from `app/state/slices/bootSlice.ts`; surfaced by `app/diagnostics/aboutSummary.ts` |
| **#4** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | |
| **#5** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | |
| **#6** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | |
| **#7** | Qwen prompt weight / long native prefill | MIXED | **REPRODUCE / REBENCHMARK** | MEDIUM if present — recoverable stall | Historical only | Measure on llama.rn **0.4.8** before any optimisation | A prior ruling of "not proven / already mitigated" was made on llama.rn 0.3.x. That is a different engine |
| **#8** | Native-ML priority / lane / shared queue policy | APP LOGIC | **REPRODUCE BEFORE CHANGING** | MEDIUM if harmful behaviour remains | Source-derived current (mechanism intact); historical only (harm) | Evaluate with current 2.5.0 evidence, particularly after #7 measurements | `app/ai/nativeMlLock.ts` — `runExclusiveNativeMl`, `ML_PRIORITY_*`. Pure TypeScript; migrated unchanged. Consumers: `LlamaRuntime.ts`, `SemanticEmbeddingService.ts` |
| **#9** | Player preemption arriving too late for running prefill | APP LOGIC | **CLOSED BY CURRENT SOURCE** | MEDIUM if regressed | Source-derived current | No work unless a regression is reproduced | `shouldAbort` in `app/ai/generation/LlamaRuntime.ts` and `QwenGenerativeEngine.ts`; armed with the combat muzzle's own question in `app/ai/narration.ts`. A throwing predicate cannot cost a job |
| **#10** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | |
| **#11** | Take / Take-All synchronous sweep / render / persistence burst | APP LOGIC | **CURRENTLY RELEVANT / REQUIRES MEASUREMENT** | MEDIUM — temporary dead-touch; no save or progression risk identified | Source-derived current | **Focused instrumentation before implementation** | `app/screens/ExplorationScreen.tsx` — `for (const n of nouns) takeDirect(n)`, one synchronous call per noun. The call site's own comment records that the sweep is not optimised |
| **#12** | **AUTHORITATIVE WORDING NOT RECOVERED** | UNKNOWN | **NOT RECOVERED** | — | UNKNOWN | Future Codex archaeology | |
| **#13** | Player activity accounting / false-idle admission | APP LOGIC | **CURRENT PROVEN DEFECT** | MEDIUM — optional ML work admitted on top of a player who is plainly still playing | **Source-derived current** | **Bounded repair** (see below) | `app/state/humanActivity.ts` — `noteHumanInteraction`, `humanGetState`, `useHumanAction`, `HUMAN_GAMEPLAY_MUTATIONS` |

---

## #13 — THE SIX CURRENT BYPASSES

Two authorities gate optional background work: `lastPlayerActionAt` (read by `introFillTick`
against a 6–20 s floor, and by `playerActionIsSettling` against a 1.5 s window) and
`uiIdleSince`. A gameplay mutation that refreshes neither makes an active player look idle.

`HUMAN_GAMEPLAY_MUTATIONS` lists 36 accounted actions, and the structural census in
`__tests__/ota1816PlayerActionsKeepTheClockHonest.test.tsx` (§5) proves no screen reaches a
**listed** name through a bare selector.

**The census iterates the list, not the screens.** A gameplay mutation never added to the
list is invisible to it — which is the exact risk `humanActivity.ts` names in its own
comment: *"the sixty-first gets added unnoted with nothing to say so."*

A census of all store names reachable from screens at `61f104e0`, minus the list, hand-
classified against the file's own membership rule (*a store action that a human press invokes
directly and that mutates gameplay*), leaves six:

| Action | Call site | Why it qualifies |
|---|---|---|
| `acceptMissionOffer` | `ExplorationScreen.tsx`, bare selector | Commits the contract — creates the broker mission and its grid markers. `acceptHunt`, `acceptMystery`, `acceptStoryline` and `acceptFactionQuest` are **all** on the list |
| `declineMissionOffer` | `ExplorationScreen.tsx`, bare selector | Sets a persistent soft flag that suppresses re-prompting |
| `continueHook` | `ExplorationScreen.tsx`, bare selector | Advances a hook stage and pays stage rewards |
| `abandonHook` | `ExplorationScreen.tsx`, bare selector | Marks the hook resolved and forfeits remaining stage rewards — irreversible |
| `confirmLeaveAndTravel` | `ExplorationScreen.tsx`, bare selector | Leaves the outpost and sets course. `setTravelCourse` **is** on the list |
| `confirmCraftSubstitution` | `CraftingScreen.tsx`, bare `useGameStore.getState()` | **The same action goes through `humanGetState()` on `ExplorationScreen.tsx`.** One mutation, two doors, one accounted |

Correctly excluded and **not** part of this repair: state reads, navigation, opening a
picker, clearing a notice, refusal nudges, tutorial advancement and save/meta actions. Those
exclusions are deliberate and pinned in the suite.

**Bounded repair shape** (not started; do not begin it in the same commit as this document):
add the six to `HUMAN_GAMEPLAY_MUTATIONS`, convert the six seams to `useHumanAction` /
`humanGetState`, and widen the census so it walks **screens** rather than the list — so the
sixty-seventh door cannot be added unnoted either.

---

## CURRENT 2.5.0 WORK ORDER

1. **#13** — repair activity-accounting bypasses.
2. **#11** — instrument and measure the Take / Take-All burst.
3. **#3** — rebenchmark process memory / Jetsam on current 2.5.0 hardware.
4. **#7** — rebenchmark Qwen prefill on llama.rn 0.4.8.
5. **#8** — reassess the shared ML queue using current measurements.
6. **#3A** — remains instrumentation only.
7. **#9** — remains closed unless a regression appears.
8. **#1, #2, #4, #5, #6, #10, #12** — await Codex archaeology.

> **This order is based on current evidence and engineering readiness, not on presumed
> contribution to the Apple freeze.**

#13 is first because it is the only item whose defect is visible in source rather than
inferred from a device. #11 is second and is **measurement-first** — its mechanism is proven,
its harm is not. #3, #7 and #8 all require current-stack evidence before anyone changes code,
because each lost its evidentiary basis to the migration.

---

## DEVICE BASELINE

Established migration receipts, unless current source contradicts them:

- **Android** — 2.5.0, Play build 476. Modern stack distributed in place; Pixel and Samsung
  both ran the new native path. Samsung Qwen became healthy after a stale ML auto-disable
  reset.
- **iOS** — 2.5.0, TestFlight build 208. Modern stack built through EAS; the llama.rn C++20
  compatibility repair is proven by successful archive and delivery.

These prove **deployment and runtime viability**. They prove nothing about memory ceilings,
prefill duration or queue behaviour under load, and they close no Baker item.

`runtimeVersion` policy is `appVersion` (2.5.0), so OTAs reach those binaries and no older
ones.

---

## MAINTENANCE

- When an item is repaired, update its row **in place** — status, evidence and action — and
  cite the OTA. Do not delete rows; a closed item's history is why the next person does not
  reopen it.
- When Codex recovers a NOT RECOVERED item, replace the placeholder with the recovered
  wording and say where it came from. Do not promote a lead into a slot on resemblance alone.
- If an item is repaired and the Apple freeze persists, record that too. A negative result on
  a real defect is still a result.
