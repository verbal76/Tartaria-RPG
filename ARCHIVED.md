# ⚠⚠ THIS BRANCH IS ARCHIVED — 2026-08-20

`steam_Dev` stopped here. **Nothing has been deleted.** Every commit, every OTA
entry and every line of code on this branch is exactly where it was; what ended
is its future, not its past.

| | |
|---|---|
| **last independent commit** | `362a5d57` — OTA-1383, *"the lines converge"* |
| **last version** | 4.29.220 · OTA-1371 |
| **what it was** | the PC line — desktop layout, gamepad navigation, PC key art |
| **where it went** | `golem-line`, which is now the trunk for all four products |

---

## Why it stopped

There were four branches — golem, HAL, steam, html — and a census
(`DIVERGENCE.md`, still on this branch) measured how far apart they actually
were. The answer was about 2%: 1,053 differing paths normalised down to
**fourteen real differences**, and most of those were fixes ported to three
lines and forgotten on the fourth.

That is the failure mode four branches produce. A drift and a deliberate
difference look identical in git — both are just "this file differs" — so the
deliberate ones camouflaged the accidental ones.

The things that made this line the PC line were never really branch
differences at all. They were **platform capability**, and they now live as
module pairs the bundler resolves on its own:

* `app/components/GamepadNav.tsx` / `.web.tsx`
* `app/ui/splashArt.ts` / `.web.ts`
* `app/voice/kokoroWeb.ts` / `.web.ts`

⚠ Module pairs, not a `Platform.OS` ternary — Metro resolves `require()`
statically, so both arms of `isWeb ? require(pc) : require(phone)` enter the
bundle graph, and with `assetBundlePatterns: ["assets/**/*"]` that would have
shipped the 2.4 MB PC key art into every phone build. The PC art now lives in
`assets-pc/`, outside the embed glob, for the same reason.

## What builds the PC line now

The trunk, with the line named explicitly. In GitHub Actions, dispatch and set
**line = `steam`**:

* **Windows .exe** — *Build · Windows (.exe)* → `line: steam`
* **Linux / Steam Deck AppImage** — *Build · Linux / Steam Deck (AppImage)*
* **macOS .dmg** — *Build · macOS (.dmg)*
* **Web bundle** — *Web Build (Tartaria Realms)* → `line: steam`
* **OTA** — *Publish · OTA* → `line: steam`

### ⚠ Correction — this section said the opposite when it was first written

The first version of this file claimed *"there is still no desktop packaging …
there never was, on this branch either."* **That was wrong, and it was wrong
about this very branch.** `build-steam-exe.yml` — Expo web export → Electron →
portable Windows `.exe`, plus a public GitHub Release — has been here the whole
time, along with the `desktop/` wrapper and `scripts/harden-web-bundle.sh`.
Sibling branches `linux_dev` and `mac_dev` carried the AppImage and `.dmg` jobs.

The mistake was reading `.github/workflows/` on the trunk and describing the
repository from it. That is the exact error one trunk exists to make impossible,
and the census that drove the collapse could not have caught it either: it
measured `app/` only, so `.github/workflows/` and `desktop/` were never in it.

**OTA-1387 on the trunk brings all of it over**, so the trunk can now produce all
six targets — android, iOS, web, Windows, Linux, macOS. `DIVERGENCE.md` on the
trunk carries a *WHAT THIS CENSUS COULD NOT SEE* section recording the gap.

## ⚠ What NOT to do with this branch

* **Do not push to it.** It is a photograph, not a workspace.
* **Do not ship from it.** It went stale the moment work resumed on the trunk.
* **Do not fix a bug here.** The fix would reach nobody. The trunk builds steam.

## Reading it later

```bash
git log origin/steam_Dev               # the whole history, intact
git show 362a5d57                      # the last commit
git switch --detach 362a5d57           # wander around; `git switch -` to leave
git diff 362a5d57 origin/golem-line -- App.tsx
```

`RESTORE-POINTS.md` on the trunk names this commit alongside the other three, so
the four pre-collapse snapshots can be found without remembering a hash.
