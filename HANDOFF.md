# Tartaria — START HERE (main branch router)

**You are on `main`. Do NOT develop here.** `main` is an (essentially empty)
base/PR-target branch. Real work happens on one of the lines below.

## The lines, and the order of a pass (owner directive, 2026-08-07)

Owner, verbatim: *"hal is the live branch that my testers have access to, golem is
the testing ground for big changes, steam line stays up to date for my PC testing
and possible steam submissions. so unless there is a high chance we are doing game
braking changes keep all 3 current."*

…and, **amended later the same day**: *"you can stack updates for the exe and we
can do an update and push when a full exe is needed. we still push Hal first and
then port to golem."*

**So a pass is TWO lines, in this order: `HaL2001` FIRST, then port to
`golem-line`.** Per-line OTA bumps, one commit + push per line. Fork to golem alone
only when a change has a high chance of breaking the game; that is a HIGH bar.
**`steam_Dev` is BATCHED** — it accumulates and comes up in one merge when the
owner wants an `.exe`.

1. **`HaL2001` — the LIVE game, at testers.** Push here FIRST. A push publishes an
   OTA to their devices (channels `hal2001` + `preview` + `ios-preview`). Treat it
   as production. **Device logs come from here almost always.**

2. **`golem-line` — the testing ground for BIG changes.** When a major,
   potentially engine-breaking change begins, development forks onto golem so
   production Tartaria is never at risk. Otherwise it is ported right after HAL in
   the same pass, so the fork point is never stale. Separate app id/channel
   (`golem-line`); installs side-by-side. Parity offset: **golem = HAL − 23.**

3. **`steam_Dev` — the PC line, BATCHED: the owner's PC testing and possible Steam
   submission path.** ⚠ It was briefly promoted to a standing per-pass line on
   2026-08-07 and demoted again hours later — an `.exe` only matters when the owner
   sits down to test on PC, so topping it up every OTA spent CI on an artifact
   nobody was going to run. **Bring it up as a single merge of `HaL2001`'s current
   tip when an `.exe` is wanted, and do not poll its build** — the owner watches
   those. Windows/Electron via `build-steam-exe.yml`; updates ship through the
   Steam depot, **not** OTA — a push to `steam_Dev` publishes nothing to any
   device. It is also the PR base for `mac_dev`, `html_dev` and `linux_dev`, so it
   should not be left arbitrarily far behind — catch it up when you build.

## ⛔ `engine_Dev` is OFF LIMITS

Owner, 2026-08-07: *"engine_dev is a separate project, leave it be for now, it's
off limits unless I tell you."* Do not commit to it, do not port to it, do not
include it in a pass. **Only the owner reopens it.** (It is the lore-agnostic RPG
Engine — content is upload/pack-driven — and was previously listed here as one of
the three main lines. That is no longer true and was the reason for this rewrite.)

## Working phase and standards

**QoL improvements and balancing.** Quick, surgical, well-thought-out changes —
and **test the crap out of everything before pushing.**

⚠ **The local gates are the ONLY gate that runs before the player gets the code.**
On a line branch the OTA publish finishes in ~90 seconds while CI takes ~5 minutes,
and both fire on the same push — so CI *structurally cannot* gate an OTA here.
Measured 2026-08-07: golem's publish completed at 01:48:50Z with CI still running
at 01:49:26Z. Run `typecheck:ci`, `lint`, the test-typecheck ratchet and
`test:ci:fast` in the worktree **before** you push, every time.

⚠ **One commit per OTA per line, docs included** (`buildInfo`, `VERSION.md`,
`HANDOFF.md` ride with the code). A second push inside the CI window cancels the
first commit's run via branch concurrency, which permanently destroys the CI record
of the commit that actually shipped.

## ⚠ Prohibitions in these docs need receipts

HANDOFF.md is a one-way write channel between sessions with no review step, so a
confident WRONG sentence travels exactly as far as a right one. The dangerous shape
is a **prohibition**: a wrong instruction fails loudly the first time someone
follows it, but a wrong prohibition fails silently forever, because nobody attempts
the thing and nothing looks broken. Two got through this way — *"you cannot gate
spin-offs locally"* (disproved 2026-08-07 by running `npm install`) and *"there are
no PRs on line branches"* (contradicted by the handoff's own step 6).

**So: if you write that something is impossible, say how you established it and
when.** Policy is exempt — "do NOT push to main" is a directive, not a claim.
Enforced on the line branches by `npm run check:handoff`, a blocking CI step.

## Every line is isolated — no cross-pollination

Each line publishes ONLY to its own channel / app id: **Tartaria (HaL2001) → the
`hal2001` channel only, golem → `golem-line` only.** A push to one line can never
reach another line's testers. This is enforced in CI (the shared `eas-update.yml`
gates on a per-pushed-branch `case`, defaulting to _skip_; golem has its own
firewall workflow `eas-update-golem.yml`), and the desktop/web builds are isolated
by their own build workflows + app ids. Never copy one line's publish step into
another. (Full detail is in each line's own HANDOFF.)

## Other branches (not the three you keep current)

Downstream / packaging lines forked from the above — **`mac_dev`**, **`linux_dev`**,
**`html_dev`** (desktop/web builds, all based on `steam_Dev`), **`apple_ios`**, and
the retired **`arbiters-line`**. Plus `Dev_engine_PC` (engine's Windows `.exe`,
which tracks the off-limits `engine_Dev` — leave it alone), utility/parked branches
(`iOS-initial`, `release/**`, `revert`, `submit-workflow-to-main`) and ephemeral
`claude/*` feature branches. These are not where new work starts unless the user
names one specifically.

⚠ Spin-off worktrees **can** be gated locally — `npm install` in one just works
(~25s). An earlier claim that they never can was a habit mistaken for a limitation.

## Once you're on a line

Read that branch's own `HANDOFF.md` — it carries the current operating model, the
per-line identity table, the change loop, the root-cause playbook, cross-line
parity rules, and the current open issues. Full historical issue tracker + OTA
changelog for each branch is preserved in its `HANDOFF-ARCHIVE.md`.

---
_This `main` handoff is intentionally short — it only routes you to the right
branch. The detail lives on the branch you pick._
