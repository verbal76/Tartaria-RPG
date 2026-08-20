# Restore Points

Named snapshots to go back to if something goes wrong. **Nothing here is a live
branch** — each is a photograph of the repository at one moment, and every one
of these commits is already on GitHub.

⚠ **Going back to one of these gives up everything done since.** For a bad
change the first move is almost always to revert *that change*, not to return
here. These are the backstop for when that is not enough.

---

## The one you will actually reach for

| name | commit | what it is |
|---|---|---|
| **pre-segmentation** | `08e3b502` | The trunk immediately before `gameStore.ts` is split up. 45,050 lines, one file, 76 exports, imported by 473 files. 886 suites / 8,259 tests green. One codebase produces all four products, and all six build targets have been run from it. |

⚠⚠ **THIS POINTER MOVED, AND THAT IS THE POINT.** It first named `453467f7` —
the trunk before segmentation was *expected* to start. Seven OTAs landed before it
actually did (1385–1391: the OTA sequences unified, then the build pipeline
repaired one target at a time). Going back to `453467f7` today would land you on a
trunk that **cannot build Windows, Linux, macOS or the web**, and whose live OTA
channel has no publisher at all. That is a worse place to stand than most of the
bugs you would be escaping.

⚠ A restore point is only worth having if it names the last known-good state, so
**re-point it when a phase ends**, not once at the beginning and never again.

If a segmentation slice goes wrong: **revert that slice first.** Each one is its
own gated commit, so stepping back one commit is nearly always enough.

---

## Before the branch collapse — one per product line

On the morning of 2026-08-20 there were four separate branches. A tag points at
a single commit, so there are four snapshots rather than one.

| name | commit | line | version |
|---|---|---|---|
| pre-collapse/golem | `5058a095` | golem | 4.29.271 · OTA-1377 |
| pre-collapse/hal | `61998319` | HAL | 4.29.228 · OTA-1362 |
| pre-collapse/steam | `0d322d51` | steam | 4.29.215 · OTA-1366 |
| pre-collapse/html | `350da5f3` | html | 4.30.6 · web7 |

---

## How to use one

```bash
# look at it without changing anything
git show 453467f7 --stat
git switch --detach 453467f7        # wander around, then `git switch -` to come back

# take one file back from it
git checkout 453467f7 -- app/state/gameStore.ts

# undo a bad change properly (the usual answer)
git revert <the-bad-commit>
```

---

## ⚠ These are NOT git tags yet, and here is why

The session that created these restore points could push branches but not tags —
the git proxy returns `403` on `refs/tags/*`. The commits are pushed and
permanent; only the friendly names are missing.

To turn them into real tags, run these five lines locally:

```bash
git fetch origin
git tag -a pre-collapse/golem 5058a095 -m "golem before the 2026-08-20 branch collapse (4.29.271 / OTA-1377)"
git tag -a pre-collapse/hal   61998319 -m "HAL before the 2026-08-20 branch collapse (4.29.228 / OTA-1362)"
git tag -a pre-collapse/steam 0d322d51 -m "steam before the 2026-08-20 branch collapse (4.29.215 / OTA-1366)"
git tag -a pre-collapse/html  350da5f3 -m "html before the 2026-08-20 branch collapse (4.30.6 / web7)"
git tag -a pre-segmentation   453467f7 -m "the trunk immediately before gameStore segmentation (4.29.278 / OTA-1384)"
git push origin pre-collapse/golem pre-collapse/hal pre-collapse/steam pre-collapse/html pre-segmentation
```

Until then this file is the lookup, and it is committed, so it cannot be lost the
way a remembered commit id can.

---

## The retired branches are still there too

Collapsing onto one trunk does not delete anything. Each line's last independent
commit stays reachable forever:

| branch | last commit | version |
|---|---|---|
| `golem-line` | *(now the trunk)* | 4.29.278 · OTA-1384 |
| `HaL2001` | `e9407547` | 4.29.233 · OTA-1367 |
| `steam_Dev` | `362a5d57` | 4.29.220 · OTA-1371 |
| `html_dev` | `67ac8754` | 4.30.10 · web11 |

⚠ Those three go stale the moment new work lands on the trunk. They are
snapshots of 2026-08-20, not spare engines that can be shipped from later.
