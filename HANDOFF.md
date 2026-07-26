# Tartaria — START HERE (main branch router)

**You are on `main`. Do NOT develop here.** `main` is an (essentially empty)
base/PR-target branch. Real work happens on one of the lines below.

## ⛔ First thing, every session: ask which branch to work on

Before making ANY change, ask the user **which of the three main branches** this
session is for, and switch to that branch's worktree. Do not guess, and do not
start editing on `main`. Each line has its own app identity, its own OTA channel,
and its own full `HANDOFF.md` (read that branch's handoff once you're on it).

## The three main branches

1. **`HaL2001` — the LIVE game (at testers).**
   The distributed Tartaria Realms build real testers are playing. A code push
   here publishes an OTA to their devices (channels `hal2001` + `preview` +
   `ios-preview`). Treat it as production: only ship vetted changes, and only when
   the user says to.

2. **`golem-line` — HAL's WARM STANDBY (role clarified 2026-07-13).**
   Not a trial scratch pad: golem must STAY CURRENT with HAL. Minor changes and
   upgrades land on BOTH `HaL2001` and `golem-line` in the same pass (per-line OTA
   bumps, one commit + push per line) so the parity gap never widens. Its purpose:
   when a major, potentially engine-breaking change begins, development forks onto
   golem so production Tartaria is never at risk. Same game as HAL, separate app
   id/channel (`golem-line`), installs side-by-side.

3. **`engine_Dev` — a SEPARATE project.**
   The lore-agnostic RPG **Engine** (content is upload/pack-driven) — *not* the
   Tartaria game. It shares a lot of engine code with HAL/golem but is its own
   product with its own app id/channel (`engine_Dev`). Don't conflate it with the
   Tartaria game; a "HAL improvement" does not automatically belong here.

> Typical flow for a Tartaria-game change: ship it to **HaL2001 AND golem-line in
> the same pass** (golem-as-trial is reserved for changes the user explicitly wants
> staged). An engine change belongs on **engine_Dev** and stands alone.

## Every line is isolated — no cross-pollination

Each line publishes ONLY to its own channel / app id: **Tartaria (HaL2001) → the
`hal2001` channel only, golem → `golem-line` only, engine → `engine_Dev` only.** A
push to one line can never reach another line's testers. This is enforced in CI
(the shared `eas-update.yml` gates on a per-pushed-branch `case`, defaulting to
_skip_; golem has its own firewall workflow `eas-update-golem.yml`), and the
desktop/web builds are isolated by their own build workflows + app ids. Never copy
one line's publish step into another. (Full detail is in each line's own HANDOFF.)

## Other branches (not the three mains)

Downstream / packaging lines forked from the above — **`steam_Dev`**, **`mac_dev`**,
**`linux_dev`**, **`html_dev`** (desktop/web builds), **`apple_ios`**,
**`Dev_engine_PC`** (engine's Windows `.exe`), and the retired **`arbiters-line`**.
Plus utility/parked branches (`iOS-initial`, `release/**`, `revert`,
`submit-workflow-to-main`) and ephemeral `claude/*` feature branches. These are not
where new work starts unless the user names one specifically.

## Once you're on a line

Read that branch's own `HANDOFF.md` — it carries the current operating model
(multi-line, descriptive OTA slugs, push-each cadence), the per-line identity
table, the change loop, cross-line parity rules, and the current open issues. Full
historical issue tracker + OTA changelog for each branch is preserved in its
`HANDOFF-ARCHIVE.md`.

---
_This `main` handoff is intentionally short — it only routes you to the right
branch. The detail lives on the branch you pick._
