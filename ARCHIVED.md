# ⚠⚠ THIS BRANCH IS ARCHIVED — 2026-08-20

`HaL2001` stopped here. **Nothing has been deleted.** Every commit, every OTA
entry and every line of code on this branch is exactly where it was; what ended
is its future, not its past.

| | |
|---|---|
| **last independent commit** | `e9407547` — OTA-1383, *"the lines converge"* |
| **last version** | 4.29.233 · OTA-1367 numbering, 4.29.233 display |
| **what it was** | the LIVE channel — the build other people were actually playing |
| **where it went** | `golem-line`, which is now the trunk for all four products |

---

## Why it stopped

There were four branches — golem, HAL, steam, html — and a census
(`DIVERGENCE.md`, still on this branch) measured how far apart they actually
were. The answer was about 2%: 1,053 differing paths normalised down to
**fourteen real differences**, and most of those turned out to be fixes that had
been ported to three lines and forgotten on the fourth.

That is the failure mode four branches produce. A drift and a deliberate
difference look identical in git — both are just "this file differs" — so the
deliberate ones camouflaged the accidental ones, and the only way to find a
missing fix was to remember it was missing.

So the differences that were real were turned into things you can read:

* **one product flag** — `app/config/features.ts`, `FEATURES.fallenSharing`
* **platform capability** — `Platform.OS` and Metro's `.web` resolution
* **one config table** — `app.config.js`, four strings per product

and then the four branches became one trunk.

## What builds HAL now

The trunk, with the line named explicitly. In GitHub Actions, dispatch the
workflow and set **line = `hal`**:

* **Android** — *Android Build (Tartaria Realms)* → `line: hal`
* **iOS** — *iOS Build (Tartaria Realms)* → `line: hal`
* **OTA** — *Publish · OTA* → `line: hal`

⚠ An automatic push can only ever publish to `golem`. Reaching HAL's channel
takes a person choosing it. That is deliberate: it is what is left of the old
firewall, which used to be "this workflow only knows one channel name".

## ⚠ What NOT to do with this branch

* **Do not push to it.** It is a photograph, not a workspace.
* **Do not ship from it.** It went stale the moment work resumed on the trunk,
  and it has been stale ever since — increasingly so.
* **Do not fix a bug here.** The fix would reach nobody. The trunk builds HAL.

## Reading it later

```bash
git log origin/HaL2001                 # the whole history, intact
git show e9407547                      # the last commit
git switch --detach e9407547           # wander around; `git switch -` to leave
git diff e9407547 origin/golem-line -- app/state/gameStore.ts
```

`RESTORE-POINTS.md` on the trunk names this commit alongside the other three, so
the four pre-collapse snapshots can be found without remembering a hash.
