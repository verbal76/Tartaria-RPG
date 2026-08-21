# ⚠⚠ THIS BRANCH IS ARCHIVED — 2026-08-21

`linux_dev` stopped here. **Nothing has been deleted.** Every commit and every
line of code on this branch is exactly where it was; what ended is its future,
not its past.

| | |
|---|---|
| **last independent commit** | `0679bc9a` |
| **what it was** | the standing branch for the Linux / Steam Deck AppImage build |
| **what builds that now** | `golem-line`, the trunk, via `.github/workflows/build-linux.yml` |

---

## Why it stopped

At OTA-1383/1384 the four product branches collapsed into one trunk. A census
(`DIVERGENCE.md`) measured them ~98% identical: 1,053 differing paths normalised
down to fourteen real differences, most of them fixes ported to three lines and
forgotten on the fourth. A drift and a deliberate difference look the same in
git, so the deliberate ones camouflaged the accidental ones.

`golem-line` now builds all four products, selected by `TARTARIA_LINE`
(`app.config.js`). **This branch's packaging workflow already fires from the
trunk, not from here** — `.github/workflows/build-linux.yml` triggers on `golem-line`. That has been
true since the collapse, which means this branch has produced nothing for weeks
while still looking like a live line in `git branch`.

⚠ That gap is the reason for this file. A branch that builds nothing but reads
as current is a trap for the next person: they check it out, see it is hundreds
of commits behind, and have to work out whether that is drift or design. It is
design, and now it says so.

---

## What NOT to do with this branch

- ⚠⚠ **Do not merge it into the trunk.** It is ~860 commits behind and merging
  it would drag pre-collapse state back over current code.
- ⚠⚠ **Do not merge the trunk into it.** That would recreate the four-branch
  world this collapse removed, and quietly restore the drift.
- **Do not push to it.** Nothing reads it.
- **Do not delete it.** The history is the record of how this product line was
  built, and `RESTORE-POINTS.md` still references it.

## Where the work happens now

`golem-line`. See `HANDOFF.md` §4 — *"Which lines a change goes to"* — for the
routing rule, and `docs/WORKFLOWS.md` for how Linux / Steam Deck AppImage is actually built and
shipped.

**ARCHIVED.**
