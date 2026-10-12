# Guardian Critical-Path Audit — Pass 1 Authority Record

## Ambiguity flagged first (per Hard Rule: do not silently choose)

This session's **primary working directory** (`/home/user/Tartaria-RPG`) is
checked out on branch `claude/hello-iteration-8-yctnkj` (HEAD `65428be0`),
which descends from `main`. **`main` carries no application source at all** —
its own `HANDOFF.md` states *"You are on `main`. Do NOT develop here. `main`
is an (essentially empty) base/PR-target branch."* Its top level is only
`HANDOFF.md`, `HANDOFF-ARCHIVE.md`, `README.md`, `.github/`, `.gitignore`,
and two unrelated binary attachments (`tartar.docx`, a PNG). There is no
`app/`, no `__tests__/`, no `package.json` — nothing a gameplay audit can
read.

A second, populated checkout of this same repository exists in this
container at `/tmp/hunt`, a `git worktree` on branch **`golem-line`** at
`HEAD f25aee76603c1316985940987def2e125f188b61`, which matches
`origin/golem-line` exactly (fast-forward, nothing ahead or behind). This
worktree carries the full application: `app/`, `__tests__/`,
`package.json`, `.github/workflows/`, and everything else the codebase
comment trail (`HANDOFF.md` on `main` itself) describes as "real work."

`golem-line`'s own `HANDOFF.md` (read from the worktree, see below) also
disagrees with `main`'s copy on branch topology: `main`'s `HANDOFF.md`
(dated 2026-08-07) describes `HaL2001` as the primary live branch pushed
first each pass, with `golem-line` as a secondary "big changes" fork
running 23 commits behind. That is **not** the process this container's
own prior session history shows in practice: the live workflow is CI on
`golem-line` (the trunk) → automatic Golem OTA publish → a separate
`promotions` control-plane branch that promotes one exact validated SHA at
a time to the `hal` line via `eas-update-golem.yml -f line=hal`. This
reads as **documentation drift** (`main`'s `HANDOFF.md` describing an
earlier topology that the team has since moved past), not as two live
branches in active parallel use. It is recorded here as an open question,
not resolved by inference — see `unknowns.md` UNK-001.

**Given the above, this audit's source-of-truth for "the repository" is
the `golem-line` worktree at `/tmp/hunt`, because it is the only checkout
in this container that contains application source, and because the
CI/build/OTA-publish tooling inspected below treats `golem-line` as the
trunk under validation.** All file:line references throughout the
`guardian-audit/` artifacts are relative to this tree unless stated
otherwise.

## Authority record

| Field | Value |
|---|---|
| Repository | `verbal76/Tartaria-RPG` (GitHub) |
| Primary working directory (session default) | `/home/user/Tartaria-RPG` — branch `claude/hello-iteration-8-yctnkj`, HEAD `65428be0af0e4ae3208a0d61463cfc5e1a9bde47`, **no application source present** |
| Audit source tree (used for this pass) | `/tmp/hunt` — git worktree, branch **`golem-line`** |
| Audit HEAD SHA | `f25aee76603c1316985940987def2e125f188b61` |
| `origin/golem-line` | `f25aee76603c1316985940987def2e125f188b61` — **identical**, worktree is exactly at the remote tip |
| Worktree status | `git status --porcelain` → only `?? node_modules` (untracked, expected: dependency install, not source). No tracked-file modifications, nothing staged, nothing ahead/behind origin. **Clean.** |
| Remote | `https://github.com/verbal76/Tartaria-RPG` (fetch + push) |
| Other worktrees present in this container | Numerous scratch worktrees under `/tmp/*` and `/tmp/claude-0/*` (`promotions`, `promotions-p2`, `promotions-p3`, `main`, `docs-ios`, and several detached-HEAD scratch clones) — leftover from prior release-engineering sessions in this same container. **Not used for this audit**; noted only so their presence isn't mistaken for audit output. |

## Build/version authority

Read from `/tmp/hunt/app/buildInfo.ts` (see `existing-observability.md` and
`persistence-map.md` for how this is consumed):

- `export const OTA_BUILD_ID = '2026-09-25-1884-the-picker-takes-the-region';`
- `DISPLAY_VERSION` also lives in this file (drives the Sentry release
  string `tartaria@<DISPLAY_VERSION>+<OTA_BUILD_ID>` at publish time).

## OTA / CI authority

- CI workflow: `.github/workflows/ci.yml` — typecheck (source), typecheck
  (tests · ratchet baseline), source gates (`check:*` scripts, 21+
  blocking steps), lint, 4 sharded `jest` groups (fast surface), plus an
  unblocking "heavy sims" reported-only job. A `publish` job auto-dispatches
  the Golem OTA publisher after all required jobs pass on `golem-line`.
- Publisher workflow: `.github/workflows/eas-update-golem.yml` — takes
  `sha` + `line` inputs; publishes to the named line's EAS channel set and
  cuts a Sentry release.
- Promotion control plane: separate branch **`promotions`**, workflow
  `.github/workflows/promote.yml` — one-record-per-SHA JSON files under
  `promotions/promote-hal-<40-hex-sha>.json`; each dispatches
  `eas-update-golem.yml` with `-f line=hal` for that exact SHA.
- These are **release/CI mechanics**, not gameplay systems — recorded here
  for completeness/authority only, not carried into the system-candidate
  inventory.

## Existing Walker / harness locations (pointer only — full archaeology in `existing-walker-map.md`)

Initial grep hits, to be expanded:
- `__tests__/` contains a large number of suites; several reference a
  scripted "walker"/simulation harness (`*Walker*`, `*Sim*`,
  `*ChaosSim*`, `*Stress*` naming patterns).
- `scripts/` contains repo tooling (`heavy-suites.mjs`, `shard-suites.cjs`,
  `check-*.mjs`, `ci-typecheck-tests.mjs`) — CI/test infra, not gameplay
  Walker code per se; distinguished in `existing-walker-map.md`.

## Relevant CI/test locations (pointer only)

- `__tests__/` — the entire Jest suite (~1380+ files at this HEAD per the
  most recent full-surface run: `Test Suites: 1383 passed, 1383 total`).
- `jest.config.js`, `jest.setup.js` — harness configuration.
- `package.json` scripts: `test`, `test:ci`, `test:ci:fast`,
  `test:ci:heavy`, `test:ci:fast:shard`, `typecheck:tests`,
  `check:testsplit`.

STATUS: authority recorded. Proceeding to broad discovery.
