# Tartaria — START HERE (main branch router)

**You are on `main`. Do NOT develop here.** `main` is an (essentially empty)
base/PR-target branch. Real work happens on one of the lines below.

## ⛔ First thing, every session: ask which branch to work on

Before making ANY change, ask the user **which of the three main branches** this
session is for, and switch to that branch's worktree. Do not guess, and do not
start editing on `main`. Each line has its own app identity, its own OTA channel,
and its own full `HANDOFF.md` (read that branch's handoff once you're on it).

## The three main branches

1. **`HaL2001` — PRODUCTION (the live game, in the wild with internal testers).**
   The distributed Tartaria Realms build real testers are playing. A code push
   here publishes an OTA to their devices (channels `hal2001` + `preview` +
   `ios-preview`). Treat it as production: only ship vetted changes, and only when
   the user says to.

2. **`golem-line` — HAL's warm standby (kept CURRENT with HAL).**
   Same game as HAL, separate app id/channel (`golem-line`) so it installs
   side-by-side. Its purpose: when a major, potentially engine-breaking change
   begins, development forks onto golem so production Tartaria is never at risk.
   Until then it must not fall behind — minor changes/upgrades ship to BOTH
   HaL2001 and golem-line in the same pass.

3. **`engine_Dev` — a SEPARATE, PARALLEL project.**
   The Tartaria game stripped of ALL lore: a bare **interaction engine** whose
   content is entirely JSON/content-pack driven (alter the JSON and it becomes
   any game — the current build in it is "The Philadelphia Experiment"). It is
   *not* the Tartaria game. Only the interaction engine plus generic prefills
   (fallbacks for JSON sections a content author forgets) are hardcoded, and
   those prefills must be lore-NEUTRAL — never Tartaria-flavored, never
   containing Tartaria terms. Own app id/channel (`engine_Dev`). A "HAL
   improvement" does not automatically belong here — only engine-level fixes
   port over; Tartaria content edits never do.

> Typical flow for a Tartaria-game change: minor changes/upgrades ship to
> **HaL2001 AND golem-line in one pass** (golem-as-trial is reserved for work the
> user explicitly wants staged, and golem is the fork point for major
> engine-breaking development). An engine change belongs on **engine_Dev** and
> stands alone.

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
