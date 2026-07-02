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

2. **`golem-line` — the TESTING branch for HAL.**
   Where improvements to the HAL game are trialed first (on the test phone) before
   they're promoted to `HaL2001`. Same game as HAL, but a separate app id/channel
   (`golem-line`) so it installs side-by-side. This is usually where HAL work
   starts.

3. **`engine_Dev` — a SEPARATE project.**
   The lore-agnostic RPG **Engine** (content is upload/pack-driven) — *not* the
   Tartaria game. It shares a lot of engine code with HAL/golem but is its own
   product with its own app id/channel (`engine_Dev`). Don't conflate it with the
   Tartaria game; a "HAL improvement" does not automatically belong here.

> Typical flow for a Tartaria-game change: build & test it on **golem-line**, then
> promote the same change to **HaL2001** when the user approves. An engine change
> belongs on **engine_Dev** and stands alone.

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
