# ⚠⚠ THIS BRANCH IS ARCHIVED — 2026-08-20

`html_dev` stopped here. **Nothing has been deleted.** Every commit, every OTA
entry and every line of code on this branch is exactly where it was; what ended
is its future, not its past.

| | |
|---|---|
| **last independent commit** | `67ac8754` — OTA-web11, *"the lines converge"* |
| **last version** | 4.30.10 · web11 |
| **what it was** | the web line — browser build, no parchment/vignette texture layer |
| **where it went** | `golem-line`, which is now the trunk for all four products |

---

## Why it stopped

There were four branches — golem, HAL, steam, html — and a census
(`DIVERGENCE.md`, still on this branch) measured how far apart they actually
were. The answer was about 2%: 1,053 differing paths normalised down to
**fourteen real differences**, and most of those were fixes ported to three
lines and forgotten on the fourth.

A drift and a deliberate difference look identical in git — both are just "this
file differs" — so the deliberate ones camouflaged the accidental ones.

This line's own difference, the missing texture layer, was never a branch
difference either. It is a platform check, and it now reads as one in `App.tsx`:

```tsx
{Platform.OS !== 'web' && ( /* parchment + vignette */ )}
```

⚠ Behaviour-neutral on a phone — `Platform.OS !== 'web'` is always true there —
so wrapping the phone lines' art changed nothing anyone sees. The wrapper exists
so the file stops differing, not to change what is rendered.

## ⚠ This line's version number was AHEAD, and that mattered

html was on **4.30.10** while the trunk was on **4.29.278**. Continuing the
trunk's patch count would have moved web players' version *backwards*. It is
cosmetic — the Expo `version` that gates OTA compatibility is `2.4.1` and
unchanged on every line — which is exactly why it would have shipped unnoticed
and then looked like a rollback in every About screen, bug report and crash
record. The unified sequence starts at **4.31.0**, above every retired line.

## What builds the web product now

The trunk, with the line named explicitly. In GitHub Actions:

* **Web** — *Web Build (Tartaria Realms)* → `line: html` (the default there)
* **OTA** — *Publish · OTA* → `line: html`

⚠ Until 2026-08-20 the web product had **no build workflow at all** — four
lines, three workflows, and `npm run export:web` only ever run by hand. That was
survivable while this was its own branch somebody exported manually; it is not
survivable on a trunk where every commit lands in the web product too.
`build-web.yml` on the trunk closes it. It builds and uploads; it deliberately
does not deploy, because where the site is hosted is a decision nobody has made.

## ⚠ What NOT to do with this branch

* **Do not push to it.** It is a photograph, not a workspace.
* **Do not ship from it.** It went stale the moment work resumed on the trunk.
* **Do not fix a bug here.** The fix would reach nobody. The trunk builds html.

## Reading it later

```bash
git log origin/html_dev                # the whole history, intact
git show 67ac8754                      # the last commit
git switch --detach 67ac8754           # wander around; `git switch -` to leave
git diff 67ac8754 origin/golem-line -- App.tsx
```

`RESTORE-POINTS.md` on the trunk names this commit alongside the other three, so
the four pre-collapse snapshots can be found without remembering a hash.
