# Branch & recovery ledger

> GENERATED from `docs/branch-ledger.json` by `node scripts/branch-ledger.mjs --render`. Edit the JSON, never this file;
> `npm run check:branchledger` fails if they disagree. Policy: `docs/SOURCE-OF-TRUTH.md`.

Authoritative source: **`golem-line`**, audited at `88389c751ada0e989148efa3df0a1a7b4e49cab7` on 2026-10-12.

## Classification vocabulary

- `already_integrated` — Tip is an ancestor of the trunk, or every change is present verbatim.
- `integrated_via_equivalent` — Changes exist on the trunk through an equivalent implementation (verified by normalised diff, test slug/content match, or behaviour).
- `missing_recoverable` — Valuable work not on the trunk that is safe to recover or review.
- `missing_conflict` — Valuable work not on the trunk whose recovery needs conflict resolution or an owner decision.
- `superseded` — Replaced by later trunk work or documents; nothing worth recovering.
- `intentionally_removed` — Removed on purpose; must not be restored.
- `experimental_incomplete` — Experiment or unfinished work.
- `unknown_owner_review` — Cannot be classified without the owner; NOT recovered.
- `infrastructure_ledger` — Release ledger / infrastructure ref, not feature work.

## Summary

| classification | branches |
|---|---:|
| `already_integrated` | 18 |
| `integrated_via_equivalent` | 9 |
| `missing_recoverable` | 2 |
| `missing_conflict` | 1 |
| `superseded` | 8 |
| `experimental_incomplete` | 1 |
| `unknown_owner_review` | 6 |
| `infrastructure_ledger` | 1 |
| **total** | **46** |

## Ledger

| branch | tip SHA | tip date | ahead/behind trunk | classification | owner review | disposition |
|---|---|---|---|---|:---:|---|
| `golem-line` | `88389c751ada` | 2026-10-12 | +0 / −0 | `already_integrated` |  | Keep. Only line that platform builds and OTAs may publish from. |
| `Dev_engine_PC` | `3a39fe837f4a` | 2026-07-03 | +447 / −1996 | `unknown_owner_review` | yes | Do NOT recover. Owner decision, as engine_Dev. |
| `HaL2001` | `6435954f696e` | 2026-08-20 | +810 / −1996 | `integrated_via_equivalent` |  | Archived. Retain as history; no further work lands here. |
| `api36-config-proof` | `d68b35bd0ebf` | 2026-09-15 | +11 / −245 | `experimental_incomplete` | yes | Experiment record only. Deletion candidate; owner decides. |
| `apple_ios` | `4784a10e3ef2` | 2026-08-19 | +829 / −1991 | `superseded` |  | Archived; superseded by the trunk iOS build workflows. |
| `arbiters-line` | `fd338c746da8` | 2026-07-03 | +64 / −2033 | `unknown_owner_review` | yes | Not recovered: native-build changes need a native build and an owner decision. |
| `claude/actions-budget-policy` | `0d719bc1d3bc` | 2026-10-06 | +0 / −3 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/api36-golem-migration` | `149d23e2a6e9` | 2026-09-16 | +0 / −224 | `already_integrated` | yes | Merged. Deletion candidate; owner decides. |
| `claude/armor-coating-golem` | `5f4c96f428ec` | 2026-07-03 | +7 / −1959 | `already_integrated` | yes | Merged in substance. Deletion candidate; owner decides. |
| `claude/armor-coating-tartaria` | `a43a4440cd8e` | 2026-07-03 | +31 / −1996 | `integrated_via_equivalent` | yes | Superseded by trunk coatings work. Deletion candidate; owner decides. |
| `claude/armor-resist-preview-golem` | `a86f3a326b41` | 2026-07-03 | +7 / −1958 | `already_integrated` | yes | Merged in substance. Deletion candidate; owner decides. |
| `claude/armor-resist-preview-tartaria` | `dd4e5caef247` | 2026-07-03 | +32 / −1996 | `integrated_via_equivalent` | yes | Superseded by trunk coatings work. Deletion candidate; owner decides. |
| `claude/ci-b8a49253` | `b8a49253d1e0` | 2026-10-05 | +0 / −6 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/coating-land-rule-golem` | `a9327cf571d4` | 2026-07-03 | +6 / −1957 | `already_integrated` | yes | Merged in substance. Deletion candidate; owner decides. |
| `claude/coating-land-rule-tartaria` | `8f3b625140da` | 2026-07-03 | +33 / −1996 | `integrated_via_equivalent` | yes | Superseded by trunk coatings work. Deletion candidate; owner decides. |
| `claude/coatings-section-hal2001` | `49dc899d52ac` | 2026-07-03 | +30 / −1996 | `integrated_via_equivalent` | yes | Superseded by trunk coatings work. Deletion candidate; owner decides. |
| `claude/coatings-section-port` | `abc89aa068a4` | 2026-07-03 | +7 / −1960 | `already_integrated` | yes | Merged in substance. Deletion candidate; owner decides. |
| `claude/fix-jest-timer-leak` | `b8a49253d1e0` | 2026-10-05 | +0 / −6 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/golem-emblems-github-fnkt0v` | `6de648e1f14e` | 2026-08-22 | +0 / −1117 | `already_integrated` | yes | Merged. Deletion candidate; owner decides. |
| `claude/handoff-review-gI5Ve` | `f3722170e620` | 2026-07-03 | +13 / −3236 | `superseded` | yes | Deletion candidate; owner decides. |
| `claude/hello-iteration-8-yctnkj` | `b42fbbc9e625` | 2026-09-25 | +25 / −3236 | `missing_recoverable` |  | guardian-audit/ RECOVERED to docs/guardian-audit/ (documentation only). Branch left in place. |
| `claude/infra-about-splash-ota` | `090713306333` | 2026-10-04 | +0 / −21 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/ios-cxx20-llama-rn` | `3d43bb82ca0c` | 2026-09-16 | +0 / −218 | `already_integrated` | yes | Merged. Deletion candidate; owner decides. |
| `claude/iteration-8-candidate` | `dc37a4ddc577` | 2026-10-04 | +0 / −12 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/iteration-8-followups` | `516aa68fec20` | 2026-10-05 | +1 / −12 | `missing_conflict` | yes | Untouched; owner merges or closes PR #32. |
| `claude/jolly-cori-g4l8rg` | `487de55121cd` | 2026-10-04 | +25 / −3236 | `superseded` | yes | Deletion candidate; owner decides. |
| `claude/new-session-MvF82` | `77e163997ce0` | 2026-07-03 | +83 / −2686 | `unknown_owner_review` | yes | Not recovered: these are product decisions made months ago against a much older tree; restoring uncertain features is out of scope. Owner review. |
| `claude/qa-campaign-ready` | `7005aa4811ac` | 2026-10-04 | +0 / −29 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/release-naming-convention` | `f6607dcec29c` | 2026-10-04 | +0 / −33 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/rpg-final-review-MpGGM` | `e286c07d2067` | 2026-07-24 | +17 / −3236 | `superseded` | yes | Deletion candidate; owner decides. |
| `claude/sleepy-bohr-4kXYm` | `82f0e47f5cbd` | 2026-07-03 | +58 / −2330 | `unknown_owner_review` | yes | Not recovered. Reviewed together with release/prod-aab-arb39. |
| `claude/splash-hold-fix` | `3a63f1d78bff` | 2026-10-05 | +0 / −9 | `already_integrated` |  | Merged. Deletion candidate; owner decides. |
| `claude/steam-deck-compat` | `58b5319cd850` | 2026-10-11 | +1 / −1 | `missing_recoverable` | yes | Left as draft PR #34 for owner review. |
| `claude/tartaria-game-handoff-n9cn1h` | `e6849ee89f4c` | 2026-07-17 | +18 / −3236 | `superseded` | yes | Deletion candidate; owner decides. |
| `engine_Dev` | `d8ef2a759aae` | 2026-07-26 | +630 / −1996 | `unknown_owner_review` | yes | Do NOT recover. Owner decides whether it belongs in its own repository. |
| `html_dev` | `70987a4caa88` | 2026-08-20 | +853 / −1996 | `integrated_via_equivalent` |  | Archived. Retain as history; no further work lands here. |
| `iOS-initial` | `33773c11fa2b` | 2026-07-03 | +7 / −2565 | `superseded` | yes | Superseded. Deletion candidate; owner decides. |
| `linux_dev` | `3df147db4671` | 2026-08-21 | +843 / −1996 | `integrated_via_equivalent` |  | Archived. Retain as history; no further work lands here. |
| `mac_dev` | `91edf82f226d` | 2026-08-21 | +845 / −1996 | `integrated_via_equivalent` |  | Archived. Retain as history; no further work lands here. |
| `main` | `487de55121cd` | 2026-10-04 | +25 / −3236 | `superseded` | yes | Keep as default-branch pointer. Do not build from it (the guard refuses). Workflow-copy drift is flagged for owner review. |
| `probe/se2-branch-3c1bcea9` | `3c1bcea9ff68` | 2026-09-11 | +0 / −299 | `already_integrated` | yes | Merged. Deletion candidate; owner decides. |
| `promotions` | `9cfcbebf5719` | 2026-09-27 | +73 / −3237 | `infrastructure_ledger` |  | Keep. Never rewritten. |
| `release/prod-aab-arb39` | `8f0c94527493` | 2026-07-03 | +60 / −2330 | `unknown_owner_review` | yes | Not recovered: uncertain, includes native changes. Owner review. |
| `revert` | `e8cec6b40714` | 2026-07-03 | +5 / −2764 | `superseded` | yes | Superseded. Deletion candidate; owner decides. |
| `steam_Dev` | `592339c5a3e9` | 2026-08-20 | +994 / −1996 | `integrated_via_equivalent` |  | Archived. Retain as history; no further work lands here. |
| `submit-workflow-to-main` | `b86bb39f5d05` | 2026-07-03 | +14 / −3236 | `already_integrated` | yes | Merged. Deletion candidate; owner decides. |

## Entries

### `golem-line`

- **Tip:** `88389c751ada0e989148efa3df0a1a7b4e49cab7` — sentry-inbox: sync player-log bundles [skip ci]
- **Role:** authoritative · **Classification:** `already_integrated`
- **What it is:** THE authoritative integrated codebase. Every product (golem/hal/steam/html) and every platform (Android, iOS, web, Windows, macOS, Linux, Steam Deck) builds from here.
- **Evidence:** Auto-publishes the Golem OTA on a green push; HAL is promoted from it by exact SHA via the promotions ledger.
- **Disposition:** Keep. Only line that platform builds and OTAs may publish from.

### `Dev_engine_PC`

- **Tip:** `3a39fe837f4a3d5227c61c945232a4ecf62c3bac` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** separate_product · **Classification:** `unknown_owner_review`
- **What it is:** PC variant of the engine product.
- **Evidence:** 283 of 304 changed files absent from trunk; same separate-product finding as engine_Dev.
- **Disposition:** Do NOT recover. Owner decision, as engine_Dev.

### `HaL2001`

- **Tip:** `6435954f696e98c6a44b80e0c85d338ebd9be95e` — ARCHIVE HaL2001 — retired to the trunk, nothing deleted
- **Role:** archived_line · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse HaL product line; carries ARCHIVED.md.
- **Evidence:** four-line collapse (DIVERGENCE.md, convergence commit c3d14db8c): the trunk builds this product through TARTARIA_LINE. Normalised-diff vs trunk@convergence: no game-source residue beyond line-specific files. 358 test files absent by name are matched by slug/content to trunk renumbers; the 7 unmatched were run against the trunk and are superseded by later trunk work (OTA-1382/1528/1611 backfill, OTA-1659 lexicon, OTA-1842 name gate) or pin a relocated source literal (OTA-1277 covers the room marks).
- **Disposition:** Archived. Retain as history; no further work lands here.

### `api36-config-proof`

- **Tip:** `d68b35bd0ebfde65ba228edd62eec721ca9ed49f` — API36 Gate 9: ONNX JSI flexible-page-size surgical proof (temporary, not published)
- **Role:** temporary_workspace · **Classification:** `experimental_incomplete`
- **What it is:** API 36 / 16 KB gate experiments (Gates 1.5-9), each commit self-described "TEMPORARY BRANCH, NEVER MERGE".
- **Evidence:** Gate harness workflows plus patches. The surviving patches (patches/llama.rn+0.4.8.patch, patches/onnxruntime-react-native+1.24.3.patch) are on the trunk; the migration landed via 76cfc7ba5 / f848a50a6 / c94f9c5bb.
- **Disposition:** Experiment record only. Deletion candidate; owner decides.

### `apple_ios`

- **Tip:** `4784a10e3ef25193b3bb32ac1945af1c53e78439` — Merge remote-tracking branch 'origin/HaL2001' into apple_ios
- **Role:** archived_line · **Classification:** `superseded`
- **What it is:** Pre-collapse iOS line, stale base (1991 commits behind).
- **Evidence:** 49 files exist only on the trunk; 111 differ; remaining content equivalent via the collapse.
- **Disposition:** Archived; superseded by the trunk iOS build workflows.

### `arbiters-line`

- **Tip:** `fd338c746da8d2a64f0236c1ce018b60a88e475c` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `unknown_owner_review`
- **What it is:** Isolated test line: Qwen SVE-crash native fix, Tensor G5 safe-kernel pinning, build-285 size trims, OTA-563..567.
- **Evidence:** 13 commits not patch-equivalent. Trunk LlamaRuntime still references the SVE / Tensor handling, but the native build-size and kernel patches could not be matched byte-wise.
- **Disposition:** Not recovered: native-build changes need a native build and an owner decision.

### `claude/actions-budget-policy`

- **Tip:** `0d719bc1d3bc0b3ee2674cb51ec4d281b03716d4` — ci: GitHub Actions budget policy — trunk push + non-draft PR only, heavy sims on demand, no no-op iOS runs [skip ci]
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** GitHub Actions budget policy (commit 0d719bc1d).
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/api36-golem-migration`

- **Tip:** `149d23e2a6e9ccb5d8cd43b142ab9f8481128e07` — The OTA-1735 boot pin follows the chain it describes
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** API-36 golem migration.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/armor-coating-golem`

- **Tip:** `5f4c96f428eca8031f4e95b46571fec298ce2e0a` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Golem-side port of the armor-coating series.
- **Evidence:** Content present on the trunk (7 of 8, 4 of 5, 4 of 5, 5 of 6 files; remainder older versions).
- **Disposition:** Merged in substance. Deletion candidate; owner decides.

### `claude/armor-coating-tartaria`

- **Tip:** `a43a4440cd8ed0ae11beda1b3416af051182a770` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse HaL/Tartaria port series for armor coatings (OTA-643..646 and neighbours).
- **Evidence:** Coatings, resist preview and landing rule are present on the trunk (grep of app/ + buildInfo history); the files still unmatched are older versions of files the trunk has since changed.
- **Disposition:** Superseded by trunk coatings work. Deletion candidate; owner decides.

### `claude/armor-resist-preview-golem`

- **Tip:** `a86f3a326b41d6ae23f7fef4bf4d20d7877123e9` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Golem-side port of the armor-coating series.
- **Evidence:** Content present on the trunk (7 of 8, 4 of 5, 4 of 5, 5 of 6 files; remainder older versions).
- **Disposition:** Merged in substance. Deletion candidate; owner decides.

### `claude/armor-resist-preview-tartaria`

- **Tip:** `dd4e5caef247988ba6e7c90afde93b481c4e4a09` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse HaL/Tartaria port series for armor coatings (OTA-643..646 and neighbours).
- **Evidence:** Coatings, resist preview and landing rule are present on the trunk (grep of app/ + buildInfo history); the files still unmatched are older versions of files the trunk has since changed.
- **Disposition:** Superseded by trunk coatings work. Deletion candidate; owner decides.

### `claude/ci-b8a49253`

- **Tip:** `b8a49253d1e07295f2fe20ea36d45c923ea4603c` — OTA-1891 — a suite owns the timers it armed (harness only, GOLEM ONLY)
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** CI receipt candidate for OTA-1891 (b8a49253d).
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/coating-land-rule-golem`

- **Tip:** `a9327cf571d423e851eda95d5086d48813390ccf` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Golem-side port of the armor-coating series.
- **Evidence:** Content present on the trunk (7 of 8, 4 of 5, 4 of 5, 5 of 6 files; remainder older versions).
- **Disposition:** Merged in substance. Deletion candidate; owner decides.

### `claude/coating-land-rule-tartaria`

- **Tip:** `8f3b625140daabc6fa7521e87b67a498d47fad25` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse HaL/Tartaria port series for armor coatings (OTA-643..646 and neighbours).
- **Evidence:** Coatings, resist preview and landing rule are present on the trunk (grep of app/ + buildInfo history); the files still unmatched are older versions of files the trunk has since changed.
- **Disposition:** Superseded by trunk coatings work. Deletion candidate; owner decides.

### `claude/coatings-section-hal2001`

- **Tip:** `49dc899d52ac6d461823b3e6ee8d99e9cc69b150` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse HaL/Tartaria port series for armor coatings (OTA-643..646 and neighbours).
- **Evidence:** Coatings, resist preview and landing rule are present on the trunk (grep of app/ + buildInfo history); the files still unmatched are older versions of files the trunk has since changed.
- **Disposition:** Superseded by trunk coatings work. Deletion candidate; owner decides.

### `claude/coatings-section-port`

- **Tip:** `abc89aa068a43c8e40cec3f6d8977f70dff589d5` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Golem-side port of the armor-coating series.
- **Evidence:** Content present on the trunk (7 of 8, 4 of 5, 4 of 5, 5 of 6 files; remainder older versions).
- **Disposition:** Merged in substance. Deletion candidate; owner decides.

### `claude/fix-jest-timer-leak`

- **Tip:** `b8a49253d1e07295f2fe20ea36d45c923ea4603c` — OTA-1891 — a suite owns the timers it armed (harness only, GOLEM ONLY)
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** jest timer-leak fix (b8a49253d).
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/golem-emblems-github-fnkt0v`

- **Tip:** `6de648e1f14e1f1f7096e71d7a4db608b840aa04` — art(crests): re-match all nine emblems to the factions they actually depict
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Golem emblem assets.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/handoff-review-gI5Ve`

- **Tip:** `f3722170e62023bb612ee5dcdf5729d11b49362a` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `superseded`
- **What it is:** Handoff review session branch: ios-native workflow, HANDOFF additions, two uploaded files.
- **Evidence:** Workflow exists in later form on the trunk; HANDOFF superseded; uploaded files exist on main.
- **Disposition:** Deletion candidate; owner decides.

### `claude/hello-iteration-8-yctnkj`

- **Tip:** `b42fbbc9e6256391a40f2336a1932131a466860a` — Guardian audit addendum: bounded priority map, Guardian-feasibility narrowed
- **Role:** temporary_workspace · **Classification:** `missing_recoverable`
- **What it is:** Cut from main. Carries the Guardian Critical-Path Audit Pass 1 (20 files, 536 KB of forensic documentation) plus main-router doc commits.
- **Evidence:** guardian-audit/ exists on no other ref (blob-presence audit). Router-doc commits are superseded by HANDOFF.md.
- **Disposition:** guardian-audit/ RECOVERED to docs/guardian-audit/ (documentation only). Branch left in place.
- **Recovery:** recovered → `docs/guardian-audit/` (commits `bc1d0662f`, `b42fbbc9e`)

### `claude/infra-about-splash-ota`

- **Tip:** `0907133063336f6050f59682ebb1f989f3313fd1` — chore: drop generated canonical-test artifacts that were swept into the branch
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** About / splash infrastructure OTA.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/ios-cxx20-llama-rn`

- **Tip:** `3d43bb82ca0c22e95b495010885cf3049983d496` — llama.rn compiles at the standard React Native now speaks
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** iOS C++20 / llama.rn fix.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/iteration-8-candidate`

- **Tip:** `dc37a4ddc577b179f1670795ec3b76c632ec78a5` — OTA-1890 — the studio card, and the source it came from (GOLEM ONLY, source)
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** iteration-8 candidate.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/iteration-8-followups`

- **Tip:** `516aa68fec20e8cbaca945733c8a4561869729b7` — Iteration 8 follow-ups: ignore generated qualification artifacts, mutation-hardened ambient variety test, I-056 trace
- **Role:** temporary_workspace · **Classification:** `missing_conflict`
- **What it is:** Draft PR #32: iteration-8 follow-ups (1 commit, 12 behind).
- **Evidence:** Unmerged by explicit owner instruction (PR #32 left untouched).
- **Disposition:** Untouched; owner merges or closes PR #32.

### `claude/jolly-cori-g4l8rg`

- **Tip:** `487de55121cd69f3e3613ceeee6ef07d72a23398` — Add files via upload
- **Role:** temporary_workspace · **Classification:** `superseded`
- **What it is:** Same tip as main (487de5512).
- **Evidence:** Identical tip SHA to origin/main.
- **Disposition:** Deletion candidate; owner decides.

### `claude/new-session-MvF82`

- **Tip:** `77e163997ce039b9bae49a4ee7c60d88bbf92636` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `unknown_owner_review`
- **What it is:** Early handoff-era line: in-pack repair UI, first-use nudges, tutorial trim, persist() serialisation, rest-spam ambush fix.
- **Evidence:** Trunk lacks firstUseNudges, an in-pack repair row, and persist serialisation in these forms; trunk has third-party notices and the rest-spam fix in other shapes. gameStore diverged 0.6 similarity over 888 added lines.
- **Disposition:** Not recovered: these are product decisions made months ago against a much older tree; restoring uncertain features is out of scope. Owner review.

### `claude/qa-campaign-ready`

- **Tip:** `7005aa4811acde09d2ffc1f34994b5dca79f8e9d` — test(walker): a stage that draws blades is fought outside, as the Arbiter's refusal says
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** QA campaign readiness.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/release-naming-convention`

- **Tip:** `f6607dcec29caa8cc4d867b75bf939169a1153d4` — ci: an Android build publishes a release, so no branch builds merely on push
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** public release naming convention.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/rpg-final-review-MpGGM`

- **Tip:** `e286c07d2067d1c09e3ae0ef678104e087277d1d` — ci: run-pepk.yml — run Google's PEPK tool against upload keystore
- **Role:** temporary_workspace · **Classification:** `superseded`
- **What it is:** Review session branch cut from main: iOS native/submit/pepk workflows, HANDOFF additions, two uploaded files (tartar.docx, a png).
- **Evidence:** Workflows exist in later form on the trunk; HANDOFF superseded; uploaded files exist on main.
- **Disposition:** Deletion candidate; owner decides.

### `claude/sleepy-bohr-4kXYm`

- **Tip:** `82f0e47f5cbd2df83fcd1187e375602e63e6de90` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `unknown_owner_review`
- **What it is:** Near-duplicate of release/prod-aab-arb39 (58 commits).
- **Evidence:** Shares the same unmatched commits as release/prod-aab-arb39.
- **Disposition:** Not recovered. Reviewed together with release/prod-aab-arb39.

### `claude/splash-hold-fix`

- **Tip:** `3a63f1d78bff8e4d4a3e7d0a538dbbe0a2737867` — OTA-1891 — the card is seen for its whole hold (GOLEM ONLY, source)
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** studio splash hold fix (3a63f1d78).
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `claude/steam-deck-compat`

- **Tip:** `58b5319cd850e04a75eae5cd1a909ed61126af10` — Steam Deck / Steam Machine: controller text entry, glyphs, 1280x800 fullscreen, 12px text floor (desktop build only)
- **Role:** temporary_workspace · **Classification:** `missing_recoverable`
- **What it is:** Draft PR #34: Steam Deck / Steam Machine compatibility pass (1 commit, 1 behind).
- **Evidence:** Valid, unmerged, locally tested; on-device performance unmeasured.
- **Disposition:** Left as draft PR #34 for owner review.

### `claude/tartaria-game-handoff-n9cn1h`

- **Tip:** `e6849ee89f4c937236d30992b93b45836e7f458c` — chore: gitignore .claude/ agent-worktree scratch
- **Role:** temporary_workspace · **Classification:** `superseded`
- **What it is:** Handoff session branch cut from main: iOS native/submit workflows, HANDOFF additions, gitignore, two uploaded files.
- **Evidence:** Workflows exist in later form on the trunk; HANDOFF superseded; uploaded files exist on main.
- **Disposition:** Deletion candidate; owner decides.

### `engine_Dev`

- **Tip:** `d8ef2a759aaeb4455c1cd6ddca9a4e78bf47c41f` — docs(CLAUDE.md): record WHY root-cause fixes replaced the batch-5 push cap
- **Role:** separate_product · **Classification:** `unknown_owner_review`
- **What it is:** A separate product (engine) living in this repository; main HANDOFF marks it off limits.
- **Evidence:** 408 of 554 changed files absent from trunk, 271 of them exist at the tip; it is a different product, not unmerged trunk work.
- **Disposition:** Do NOT recover. Owner decides whether it belongs in its own repository.

### `html_dev`

- **Tip:** `70987a4caa8882ac1588b8b22f0b7cbc8bcf7405` — ARCHIVE html_dev — retired to the trunk, nothing deleted
- **Role:** archived_line · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse html product line; carries ARCHIVED.md.
- **Evidence:** four-line collapse (DIVERGENCE.md, convergence commit c3d14db8c): the trunk builds this product through TARTARIA_LINE. Normalised-diff vs trunk@convergence: no game-source residue beyond line-specific files.
- **Disposition:** Archived. Retain as history; no further work lands here.

### `iOS-initial`

- **Tip:** `33773c11fa2be1b84fd77a8b6cdf492853810bbe` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `superseded`
- **What it is:** First iOS bring-up: app.json bundle id, eas.json preview profile, HANDOFF rewrite.
- **Evidence:** Four files; the trunk iOS configuration (app.config.js lines, build-ios*.yml) replaced the bundle id / profile work, HANDOFF was rewritten since.
- **Disposition:** Superseded. Deletion candidate; owner decides.

### `linux_dev`

- **Tip:** `3df147db4671a2a307f8bc713e328c49028d85a5` — ARCHIVE linux_dev — the trunk already builds this, nothing deleted
- **Role:** archived_line · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse linux product line; carries ARCHIVED.md.
- **Evidence:** four-line collapse (DIVERGENCE.md, convergence commit c3d14db8c): the trunk builds this product through TARTARIA_LINE. Normalised-diff vs trunk@convergence: no game-source residue beyond line-specific files.
- **Disposition:** Archived. Retain as history; no further work lands here.

### `mac_dev`

- **Tip:** `91edf82f226d2992239d3d37b5c3a6004017bbd9` — ARCHIVE mac_dev — the trunk already builds this, nothing deleted
- **Role:** archived_line · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse mac product line; carries ARCHIVED.md.
- **Evidence:** four-line collapse (DIVERGENCE.md, convergence commit c3d14db8c): the trunk builds this product through TARTARIA_LINE. Normalised-diff vs trunk@convergence: no game-source residue beyond line-specific files.
- **Disposition:** Archived. Retain as history; no further work lands here.

### `main`

- **Tip:** `487de55121cd69f3e3613ceeee6ef07d72a23398` — Add files via upload
- **Role:** default_branch_pointer · **Classification:** `superseded`
- **What it is:** GitHub default branch. HANDOFF router pointing sessions at golem-line, stubs of build workflows, privacy-policy history, sentry-inbox.yml (dispatch endpoint is only surfaced for a definition on the default branch).
- **Evidence:** 25 commits ahead are docs routers and workflow stubs; no game source. Workflow copies on main drift from the trunk copies.
- **Disposition:** Keep as default-branch pointer. Do not build from it (the guard refuses). Workflow-copy drift is flagged for owner review.

### `probe/se2-branch-3c1bcea9`

- **Tip:** `3c1bcea9ff68078e2de2ae1e7d6b4b8e85912abb` — CI authority — the receipt names every gate, and reads the contract from the SHA it publishes
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Branch-existence probe from the SE2 investigation.
- **Evidence:** Tip is an ancestor of the trunk (0 ahead).
- **Disposition:** Merged. Deletion candidate; owner decides.

### `promotions`

- **Tip:** `9cfcbebf5719416f178ffb5d09eb30cf9a33a1b6` — Promote 6f811009 to HAL — Aerial/Aetherkin trait-label repair
- **Role:** release_ledger · **Classification:** `infrastructure_ledger`
- **What it is:** Orphan, append-only HAL promotion ledger (promote-hal-<sha>.json records).
- **Evidence:** No merge-base with the trunk by design; promote.yml reads it.
- **Disposition:** Keep. Never rewritten.

### `release/prod-aab-arb39`

- **Tip:** `8f0c94527493f3e990ccc54f7e52feb3091f120a` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** historical_fork · **Classification:** `unknown_owner_review`
- **What it is:** Pre-collapse "arbiters" production AAB line (Qwen/TTS/InputBox work, 60 commits).
- **Evidence:** 55 commits not patch-equivalent; 14 files touched, partly diverged from the trunk versions (gameStore 0.76 similarity, PiperTTSManager 0.83). Not a straight gap: trunk reworked those files for months.
- **Disposition:** Not recovered: uncertain, includes native changes. Owner review.

### `revert`

- **Tip:** `e8cec6b40714a62f81b8d9500b76d2d62f3b7bc3` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `superseded`
- **What it is:** HANDOFF.md / HANDOFF-ARCHIVE.md revert experiment (2 files).
- **Evidence:** Diff vs merge-base touches only HANDOFF.md and HANDOFF-ARCHIVE.md; the trunk rewrote HANDOFF since.
- **Disposition:** Superseded. Deletion candidate; owner decides.

### `steam_Dev`

- **Tip:** `592339c5a3e927eabb6e794e74f5747058e55a3e` — ARCHIVE steam_Dev: correct a wrong claim in the archive note
- **Role:** archived_line · **Classification:** `integrated_via_equivalent`
- **What it is:** Pre-collapse steam product line; carries ARCHIVED.md.
- **Evidence:** four-line collapse (DIVERGENCE.md, convergence commit c3d14db8c): the trunk builds this product through TARTARIA_LINE. Normalised-diff vs trunk@convergence: no game-source residue beyond line-specific files. desktop/ and splashArt.web.ts differ by design; the trunk desktop shell is the continuation.
- **Disposition:** Archived. Retain as history; no further work lands here.

### `submit-workflow-to-main`

- **Tip:** `b86bb39f5d0573b0e53824b0dd09970f4c7eb020` — docs: rewrite HANDOFF — current multi-line operating model; archive prior log
- **Role:** temporary_workspace · **Classification:** `already_integrated`
- **What it is:** Adds submit-ios TestFlight workflow to main so its dispatch button works (PR #6 merged).
- **Evidence:** Merged into main (commit 94ed8677c).
- **Disposition:** Merged. Deletion candidate; owner decides.
