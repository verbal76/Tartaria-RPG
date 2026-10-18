# Single source of truth — one codebase, many build targets

**Standing engineering policy (owner directive, 2026-10-12).** Recorded in `CLAUDE.md`
("Single source of truth") and enforced mechanically; this file is the detail.

## The rule

1. **There is one authoritative integrated codebase: `golem-line`.** Android, iOS,
   web, Windows, macOS, Linux and Steam Deck are *build targets* of it, selected by
   `TARTARIA_LINE` (`golem` / `hal` / `steam` / `html`), `Platform.OS`, `.web.tsx` files
   and `app.config.js` — never separate hand-maintained versions. (The four-line collapse
   is `DIVERGENCE.md`; convergence commit `c3d14db8c`.)
2. **Branches are temporary workspaces.** Work is integrated into the trunk or it is
   not part of any product. A branch never becomes a second version of the game.
3. **Nothing valuable may be stranded.** Every branch is classified in
   [`BRANCH-LEDGER.md`](BRANCH-LEDGER.md) (generated from `branch-ledger.json`). Deleting a
   branch, restoring uncertain work and merging protected lines remain owner decisions.
4. **A build says what it is.** Every platform build records the exact commit, ref,
   integration status, app/display/OTA/runtime versions, product line, profile, timestamp
   and toolchain (`build-provenance.json`, uploaded beside the artifact).
5. **A coordinated release is one SHA.** `scripts/release-manifest.cjs` refuses a set of
   builds whose provenance disagrees.

## What enforces it (all free of extra Actions minutes)

| mechanism | where | what it stops |
|---|---|---|
| `scripts/assert-authoritative-source.cjs` | step right after checkout in `build-apk`, `build-ios`, `build-ios-native`, `build-web`, `build-linux`, `build-mac`, `build-steam-exe` | compiling a commit that is not on `golem-line`. Fails closed if the relation cannot be established. A deliberate pre-integration candidate must be dispatched with `approved_source_sha` = its full SHA and is stamped `approved-unintegrated`. |
| `scripts/build-provenance.cjs` | the same workflows, uploaded as `build-provenance-<platform>` (90 days) | an artifact nobody can trace to a source |
| `scripts/release-manifest.cjs` | run by hand / a release job after downloading the provenance artifacts | a multiplatform release assembled from different SHAs, or from an unintegrated candidate |
| `npm run check:branchledger` | `ci.yml` gates job (required, already running) | a malformed/stale ledger; a rendered ledger that disagrees with its JSON |
| `__tests__/singleSourceOfTruth.test.ts` | required jest surface | any `build-*.yml` without the guard + provenance + approval input; the ledger/guard/policy records going missing |

Existing protections are untouched: the OTA pipeline (`ci.yml` → `publish` →
`eas-update-golem.yml`), the CI receipt (`verify-ci-receipt.cjs`), `required-jobs.json`,
HAL promotion by exact SHA (`promotions` ledger), the public release name
(`docs/RELEASE-NAMING.md`) and the GitHub Actions budget policy (`CLAUDE.md`).

## Keeping the ledger honest

- It is a **record of an audit**, not a live mirror. `node scripts/branch-ledger.mjs --live`
  (needs remote-tracking branches) lists branches with no entry and ledgered tips that
  moved; it is informational by default (`--strict` makes an unledgered branch fail) so a new
  topic branch can never break the trunk.
- A new long-lived branch that carries work not on the trunk gets an entry. A branch whose
  tip is an ancestor of the trunk needs none beyond housekeeping.
- Edit `docs/branch-ledger.json`, then `node scripts/branch-ledger.mjs --render`.

## Recovery results of the 2026-10-12 audit (summary — detail in the ledger)

- **Recovered:** `guardian-audit/` (20 documentation files) from
  `claude/hello-iteration-8-yctnkj` → `docs/guardian-audit/`. It existed on no other ref.
- **Integrated through equivalent implementation:** the five pre-collapse product lines
  (HaL2001, html_dev, steam_Dev, mac_dev, linux_dev) — normalised diff vs the convergence
  commit shows only line-specific files; the seven HaL-only tests with no name match were
  run against the trunk and are superseded by named later work (OTA-1382/1528/1611,
  OTA-1659, OTA-1842) or pin a relocated source literal.
- **Left for the owner (not recovered, not deleted):** `engine_Dev` / `Dev_engine_PC` (a
  separate product living in this repository), the pre-collapse `arbiters` family
  (`arbiters-line`, `release/prod-aab-arb39`, `claude/sleepy-bohr-4kXYm` — includes native
  changes), `claude/new-session-MvF82` (first-use nudges, in-pack repair UI), PR #32
  (`claude/iteration-8-followups`) and PR #34 (`claude/steam-deck-compat`).
- **Tags:** 328 of 336 tags point at pre-collapse commits that are not ancestors of the
  trunk. They are release provenance for shipped binaries — keep them; do not treat their
  absence from the trunk's history as missing work.
