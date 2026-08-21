# Workflows audit — every build path in this repo

**Audited 2026-08-20 (OTA-1390), on the trunk `golem-line` at 4.31.5.**

The branch collapse (OTA-1384) put four products on one branch. Everything that
turns this repo into something you can install lives in `.github/workflows/`, and
that directory was never part of the divergence census — so this is the first
time it has been read end to end. Four of the holes below were found by running
builds, not by reading files.

⚠ **The single rule that explains most of this file:** since OTA-1384 the branch
no longer says which product a build is. `TARTARIA_LINE` does. Every build
workflow takes it as an input, defaults it to the dev line, and prints the
identity it actually resolved before it builds anything.

---

## 1. How a build gets started

There are three ways, and knowing which applies to which workflow is the whole
practical content of this document.

| way | when to use it |
|---|---|
| **Run workflow** button (`workflow_dispatch`) | you are at a keyboard with the Actions tab open |
| **Commit-title marker** | anything automated, or any session that cannot reach the Actions UI. This is the repo's established convention — see `HANDOFF.md` §5 |
| **Automatic on push** | only CI, the golem OTA, and the web build |

⚠⚠ **A marker alone is not always enough.** `build-apk.yml` and `build-ios.yml`
path-ignore `app/**`, `assets/**`, `scripts/**`, `__tests__/**` and `**.md`.
That is deliberate — a JS-only change ships over the air and must not burn 30–60
minutes of runner time — but it means an OTA-stamp commit (which touches only
`app/buildInfo.ts` and `VERSION.md`) starts **nothing**, so the marker is never
read. Those two need a **trigger touch**: edit `.github/build-trigger.txt` in the
same commit. `.github/**` is not path-ignored, so that starts them, and the
marker then decides what they build.

### Marker table

| marker | fires | trigger touch needed? |
|---|---|---|
| `[build-aab]` | production AAB (Play Console) | **yes** |
| `[build-ios]` | TestFlight-ready IPA via EAS | **yes** |
| `[submit-ios]` | + auto-submit to TestFlight (use with `[build-ios]`) | with the above |
| `[build-ios-native]` | IPA built on a GitHub macOS runner | no |
| `[build-exe]` | portable Windows `.exe` | no |
| `[build-linux]` | Linux / Steam Deck AppImage | no |
| `[build-dmg]` | unsigned macOS `.dmg` | no |
| `[build-desktop]` | all three desktop targets | no |
| `[ota-hal]` | OTA to the **live** HAL channels | no |
| `[ota-ios-only]` / `[ota-android-only]` | narrows an OTA to one platform | no |

### Where a marker has to sit — OTA-1418

**Anywhere in the commit TITLE.** Order does not matter, so markers combine:
`[build-aab] [build-ios] OTA-XXXX — description` fires both.

⚠ **The two iOS markers used to require FIRST position** (`^` anchor) while the
other seven matched anywhere. The odd ones out were also the ones it had already
bitten: at **OTA-302** a commit led with `[build-aab]`, so `[build-ios]` later in
the same title was ignored, the profile silently resolved to `preview`, and the
run built an IPA that could never reach TestFlight. A marker that only works in
first position fails whenever two products ship together — the normal case on a
trunk that builds four. Both now match anywhere in the title.

⚠ **The title-only limit is deliberate and stays.** A marker in the commit BODY
does **not** select a build profile. That guard is what stops a commit
*discussing* `[build-ios]` — like this very paragraph — from shipping to
TestFlight.

⚠⚠ **THE PUBLISHER IS NOW TITLE-ONLY TOO — OTA-1419.** All three of its marker
reads (`[ota-hal]`, `[ota-ios-only]`, `[ota-android-only]`) pipe through
`head -1`. Before this, they grepped the **whole message**, so a commit that
merely *mentioned* `[ota-hal]` in prose published to the **live player channel**.
That was live, not theoretical: the OTA-1417 commit body carried the string
while explaining what the marker does, and the OTA-1418 body had to be written
with the iOS markers deliberately **unbracketed** to avoid allocating a 10×
macOS runner. When writing about the tooling can ship to players, the tooling is
wrong — not the writing.

⚠ **Still whole-message: the job-level `if:` gates.** GitHub's expression
language has no "first line" function, so `contains()` there sees the body. The
consequence is bounded and one-directional — a body mention can *start* a job,
which then reads the title, finds no marker, and skips. It costs minutes (10× on
`build-ios-native.yml`) and ships nothing. Every decision that actually
*publishes or submits* is made in shell, from the title alone.

---

## 2. The six shipping targets

| target | workflow | runner | output | trigger |
|---|---|---|---|---|
| **Android** | `build-apk.yml` | ubuntu | APK (preview) / AAB (production) + GitHub Release | dispatch · `[build-apk]` / `[build-aab]` + touch · tag `v*` |
| **iOS** | `build-ios.yml` | EAS servers | TestFlight-ready IPA | dispatch · `[build-ios]` + touch · tag `v*-ios` |
| **iOS (fallback)** | `build-ios-native.yml` | macOS (**10x cost**) | `.ipa` artifact | dispatch · `[build-ios-native]` |
| **Web** | `build-web.yml` | ubuntu | static site artifact | dispatch · auto on web-relevant paths |
| **Windows (.exe)** | `build-steam-exe.yml` | windows (**2x cost**) | portable `.exe` + public Release | dispatch · `[build-exe]` / `[build-desktop]` |
| **Linux / Steam Deck** | `build-linux.yml` | ubuntu | AppImage artifact | dispatch · `[build-linux]` / `[build-desktop]` |
| **macOS** | `build-mac.yml` | macOS (**10x cost**) | unsigned `.dmg` artifact | dispatch · `[build-dmg]` / `[build-desktop]` |

That is seven workflows for six targets: iOS has two paths, because EAS builds
and the macOS-runner fallback are different routes to the same `.ipa`.

⚠ **The three desktop targets all start from `npx expo export --platform web`.**
The web bundle is wrapped in the Electron shell under `desktop/`. So a break in
the web export breaks four targets at once, not one — which is why `build-web.yml`
is the only build with an automatic trigger.

⚠ **The macOS `.dmg` is unsigned.** It builds without an Apple certificate, but
the first launch needs right-click → Open to get past Gatekeeper. Notarisation
would remove that step and is not set up.

---

### ⚠⚠ "preview" MEANS TWO OPPOSITE THINGS — OTA-1422

There is a build **profile** called `preview` and an update **channel** called
`preview`. They are unrelated, and confusing them has cost real time twice.

| | what it is | effect |
|---|---|---|
| **profile** `preview` | `distribution: internal` in `eas.json` — a sideload build with no App Store credentials | **cannot reach TestFlight.** If the iOS build resolves to this profile, the run produces something unsubmittable |
| **channel** `preview` | what the *production* profile stamps into the binary (`eas.json` → `production.channel`) | **required.** The shipped TestFlight build polls this channel; publishing only to `hal2001` leaves iOS with *"Last OTA applied: No"* |

So: **profile preview breaks the iOS build. Channel preview is what keeps it
updatable.** One is a failure, the other is the mechanism.

Both halves have already bitten:

* **OTA-302 / arb172** — the commit title led with another marker, the *profile*
  fell back to `preview`, and the build could never be submitted. Fixed at
  OTA-1418 (a marker may now sit anywhere in the title).
* **OTA-303** — the publisher sent only to `hal2001`, so the TestFlight build,
  polling *channel* `preview`, never received an OTA. Fixed by publishing
  `preview → ios` as well; re-verified server-side at OTA-1174, and the HAL
  target set is `hal2001:android hal2001:ios preview:ios` to this day.

⚠ **A rename was considered and rejected.** The channel name cannot change —
every installed TestFlight build polls that string, so renaming it re-creates
OTA-303 deliberately. The *profile* could be renamed safely, but after OTA-1418
a fallback to `preview` no longer produces a broken build (it resolves to a
non-production profile, and the build step then skips), and `preview` is Expo's
own conventional profile name. The remaining risk is a person misreading a log,
which is what this table is for.

⚠ **This ambiguity had already shipped to testers.** Every playtest APK's
GitHub Release note read *"OTA updates ship continuously to channel preview"* —
untrue since Android moved to a local Gradle build, where the channel comes from
`app.config.js` and is `golem-line` / `hal2001`, never `preview`. The note now
prints the channel resolved for that actual build, and the step fails loudly if
the config carries no channel at all.

---

## 3. Over-the-air updates

`eas-update-golem.yml` — one workflow, one line per run. (The filename is
historical; it has not been golem-only since OTA-1386.)

| line | channel set | notes |
|---|---|---|
| `golem` | `golem-line` / android | the dev phone. **The only automatic publish.** |
| `hal` | `hal2001` / android **+** `hal2001` / ios **+** `preview` / ios | the live testers |
| `steam`, `html` | *(none)* | these do not consume EAS updates; they ship as a new build |

⚠⚠ **`preview` / ios is not a typo, and it is the single most fragile fact in
this repo.** The production iOS build is stamped channel `preview` by `eas.json`'s
production profile, which **overrides** the `expo-channel-name` in the app config.
Publishing to `hal2001` / ios alone reaches nobody on iOS — and it does not look
like a failure: the Expo server correctly answers "no update available." OTA-303
spent a session chasing that as "Last OTA applied: No" on an iPad. The channel set
is written out as a table rather than derived from the config for exactly this
reason; any derivation drops it again.

⚠ **The firewall:** nothing unattended reaches a player. An ordinary push
publishes `golem` and only `golem`; the job fails hard if an unselected run names
anything else. Reaching HAL takes a dispatch or an `[ota-hal]` marker — both of
which are somebody deciding.

⚠ **Runtime-version guard.** Every publish asserts the published `runtimeVersion`
equals `app.json`'s `version` (2.4.1). A mismatch means installed builds silently
ignore the update, so it has to fail loudly here or it fails invisibly there.

---

## 4. CI

`ci.yml` runs on **every branch, every push**, and is the gate:

| job | blocking | what it does |
|---|---|---|
| `typecheck-source` | yes | `tsc` over shipped source, must be clean |
| `typecheck-tests` | yes | ratchet — test type-debt may not grow past baseline (202) |
| `lint` | yes | eslint, HANDOFF claims ratchet, content reachability, **`check:lines`** |
| `test` | yes | the fast jest suite |
| `test-heavy` | **no** (`continue-on-error`) | heavy sims — see the caveat below |

⚠ **`check:lines` is new to CI as of OTA-1386.** It renders all four product
configs through Expo's own resolver and fails if any two share a name, package or
channel. It existed from OTA-1384 and until now only ever ran on a developer's
machine, which is the same as not existing.

⚠ **`test-heavy` is red on every recent commit and it is not a regression.** Three
stale assertions, documented at length in `HANDOFF.md` §8. Because the job is
`continue-on-error`, the overall run still reports success — you have to open the
job to see it. Do not re-investigate from scratch.

---

## 5. Key / signing utilities

Dispatch-only, run rarely, touched only when signing material changes.

| workflow | what it does |
|---|---|
| `generate-keystore.yml` | creates an upload keystore via keytool |
| `inspect-keystore.yml` | lists aliases in the stored keystore |
| `export-cert-pem.yml` | exports the upload certificate as PEM |
| `pepk-encrypt.yml` | encrypts the upload key for Play App Signing |
| `submit-ios.yml` | submits the latest EAS build to TestFlight |

### Secrets each path needs

| path | secrets |
|---|---|
| Android APK (preview) | none — debug-signed |
| Android APK (HAL sideload) | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Android AAB (production) | the four above, or the `ANDROID_PROD_*` set when present |
| iOS via EAS | `EXPO_TOKEN` (+ `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` as fallback auth) |
| iOS on a macOS runner | `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `APPLE_TEAM_ID` (+ `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` to submit) |
| OTA publish | `TARTARIATWO` |
| Desktop (exe / AppImage / dmg) | **none** — unsigned, artifact-only |

⚠ Two different Expo tokens are in play: `EXPO_TOKEN` for iOS builds and
`TARTARIATWO` for OTA publishes. Not interchangeable; don't consolidate them
without checking which account each belongs to.

⚠ **The Play Console listing is registered under the bare package
`com.hotatticgames.tartarprim`**, while every line wears a suffix so its sideloads
stay a separate install. A production build resolves back to the bare id via
`TARTARIA_STORE_BUILD=1`, handled in `app.config.js`. That flip used to be a
workflow step rewriting `app.json`, and OTA-1384 silently killed it — the step
still ran and no longer reached the binary. Do not move it back out of the config
layer.

---

## 6. What this audit found

Six real holes, all opened or exposed by the collapse. All fixed; listed so the
pattern is visible, because it is one pattern.

| # | hole | how it would have shown up |
|---|---|---|
| 1 | nothing set `TARTARIA_LINE` — every workflow silently built golem | a HAL build wearing golem's name and channel, run green |
| 2 | the store package flip had gone dead | production AAB refused at upload, nothing in the log |
| 3 | `eas build` does not inherit the runner's env | a green iOS build of the wrong product |
| 4 | Windows / Linux / macOS packaging never came onto the trunk | three of six targets unbuildable |
| 5 | `metro.config.js` was missing the web-only native-module stubs | web export fails — and four targets depend on it |
| 6 | the live OTA publisher never came onto the trunk | HAL testers quietly stop receiving updates |
| 7 | `golem-line` was never added to the Android/iOS `push:` branch lists | markers read by nothing — the workflow never starts |

⚠⚠ **#7 was found by running #1–6's fix.** A trial-build commit carrying every
marker fired **four** of six targets. Android and iOS were absent, and not
because of a path filter or a marker: the trunk simply was not in their trigger
list. It had been left off deliberately, back when golem was one dev line that
shipped JS over the air; the collapse made it the trunk for all four products and
nobody revisited the list. Same class again — a capability stopped existing and
nothing said so. `build-ios-native.yml` was worse: `paths-ignore: ['**']` excludes
every path, so no push had ever passed its filter on any branch, while its own
header documented a push marker. Fixed in OTA-1391, with a job-level gate on each
so adding the trunk does not turn every commit into a 30–60 minute build.

**Every one of them was silent.** Nothing went red; a capability just stopped
existing. That is what a census cannot catch — a census is a reading, and a
reading cannot fail the way a build fails. The countermeasure is that all six
targets now build from one trunk and can be fired from one commit, so "does this
still work" is a question you can answer by asking rather than by remembering.

---

## 7. Out of scope

These exist on other branches and were not touched:

| branch | what it carries |
|---|---|
| `Dev_engine_PC`, `engine_Dev` | a separate engine project with its own `.exe` workflow |
| `arbiters-line` | legacy line with its own isolated OTA workflow |
| `iOS-initial`, `apple_ios` | early iOS bring-up branches |
| `HaL2001`, `steam_Dev`, `html_dev` | **archived** by the collapse — each carries an `ARCHIVED.md` saying what builds that product now. Their workflows still exist there and still reference their own branch names; that is correct for a snapshot and wrong to copy forward. |

⚠ `linux_dev` and `mac_dev` are **not** archived. Their packaging is now on the
trunk, so they are redundant, but archiving them is the owner's call and has not
been made.

⚠ **PR #7 is open and stale** — a June draft merging `golem-line` *into*
`HaL2001`. Merging it would overwrite the branch that was just archived.
