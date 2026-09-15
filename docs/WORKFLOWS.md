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

---

# 8. NATIVE RELEASE OPERATIONS

**Added 2026-09-15. Application authority at the time of writing: OTA-1824,
`015c323726bb5aed4401fd8adf364fa5400177d7`.** This supersedes the OTA-1823
authority (`5b819d98`) that the earlier Android archaeology used. Sections 1–7
above are the *census* of every build path; this section is the *operating
procedure* for the two that put a native binary in a human's hands.

The Apple path below is not a proposal. It ran end to end on 2026-09-15 and the
build is live in TestFlight. The Android path is recovered from source and is
**documented but not re-proven by this section** — the distinction is kept
explicit throughout, because this repository's recurring failure mode is a
capability that quietly stopped existing while the documentation still promised
it.

---

## ⚠⚠⚠ 8.0 THE OWNER-UI NAMING RULE — READ BEFORE WRITING ANY INSTRUCTION

**Kevin does not select workflows by YAML filename.** He reads the workflow list
in the GitHub Actions UI, where each entry shows its **visible name** — the
`name:` at the top of the file, rendered in white.

Every owner-facing instruction therefore **leads with the visible name**:

> ✅ **CORRECT** — GitHub → Actions → **"iOS Build (Tartaria Realms)"** → Run workflow
> ❌ **WRONG** — "Run `build-ios.yml`"

> ✅ **CORRECT** — GitHub → Actions → **"Android Build (Tartaria Realms)"** → Run workflow
> ❌ **WRONG** — "Run `build-apk.yml`"

The YAML filename may appear **parenthetically**, or in an agent/engineering
reference block. It must never be the owner's primary navigation instruction.
**Future agents: preserve this rule.** It is not a style preference — a filename
is not a thing Kevin can click.

### ⚠⚠ THE TRAP INSIDE THE RULE: do not read the owner's name off the API

**An agent cannot see Kevin's screen, and the obvious proxy for it is wrong.**

The GitHub Actions API method `list_workflows` returns a `name` per workflow, and
it is tempting to treat that as "what the UI shows". **It is not.** That field can
be stale for years, and on this repository one entry is:

| workflow | `list_workflows` says | its RUNS carry | **what Kevin's sidebar shows** |
|---|---|---|---|
| `build-ios.yml` | `iOS Build (Tartaria Realms)` | same | same |
| `submit-ios.yml` | `Publish · iOS → TestFlight` | — | same |
| **`build-apk.yml`** | **`Build Android APK`** ← **STALE** | `Android Build (Tartaria Realms)` | **`Android Build (Tartaria Realms)`** |

The cause is visible in the data: that list entry was last updated **2026-05-15**,
and `build-apk.yml` **does not exist on the repository's default branch (`main`)**,
so GitHub has never refreshed the entry from a default-branch version. The trunk
carries `name: Android Build (Tartaria Realms)`, which is what runs display — and,
**confirmed by the owner on 2026-09-15, what the sidebar displays too.** The API
row is the only thing carrying the dead name.

⚠⚠ **THE RULE FOR AGENTS, and it is the opposite of the intuitive one:**

> **Read the owner-facing workflow name from `name:` in the workflow file on the
> trunk (`golem-line`) — not from `list_workflows`.** The file is the authority.
> The API list entry is a cache that nothing on this repository invalidates.

Cross-check it against a recent run's `name` if you want a second reading; runs
and the file agree. `list_workflows` is the outlier, and an instruction built on
it sends Kevin looking for a string that is not on his screen.

⚠ A direct link is **not** a violation of the naming rule, and is a good belt-and-
braces addition for a workflow he runs rarely. The rule forbids making Kevin
*search a list by filename*; a link is one click and cannot be misread.
`https://github.com/verbal76/Tartaria-RPG/actions/workflows/build-apk.yml`

---

## 8.1 APPLE / TESTFLIGHT — THE OWNER BUTTON

**This is the canonical owner-initiated native Apple release path.**

> **GitHub → Actions → "iOS Build (Tartaria Realms)" → Run workflow**
> *(engineering reference: `.github/workflows/build-ios.yml`)*

Then configure the four fields:

| field | value | notes |
|---|---|---|
| **Use workflow from** (Ref) | `golem-line` | the trunk |
| **Profile** | `production` | `preview` cannot reach TestFlight — see §2's profile/channel table |
| **Submit** | `true` | adds `--auto-submit` |
| **Line** | `hal` | ⚠ **must be set explicitly** — the input defaults to `golem` |

### ⚠⚠ BEFORE PRESSING RUN WORKFLOW — confirm the source

The dispatch UI offers **branches and tags only**; you cannot select a SHA.
`actions/checkout@v4` in this workflow takes no `ref:`, so it builds **whatever
the selected branch's tip is at dispatch time**. Confirm that tip *is* the
intended validated authority before pressing the button:

```
git ls-remote origin refs/heads/golem-line
```

That SHA must equal the application authority you mean to ship. If someone has
pushed since CI went green, you would be building something else, and nothing in
the run would say so.

### ⚠⚠⚠ THE GREEN CHECKMARK DOES NOT MEAN THE BUILD SUCCEEDED

`build-ios.yml` invokes `eas build … --no-wait`. The step returns **the moment
EAS accepts the job**, so the GitHub run finishes in roughly **90 seconds** and
goes green having compiled nothing.

**This is proven, not theoretical.** Run **196** (`5b819d98`) reports
`conclusion: success` in GitHub Actions — and the build it queued, EAS build
**197**, died at `** ARCHIVE FAILED **` with five Swift errors. A green run and a
dead binary, on the same dispatch.

**Where the real outcome lives:** the run log prints two URLs. Read those, not
the checkmark.

```
See logs: https://expo.dev/accounts/hot-attic-games/projects/tartaria-/builds/<build-id>
Submission details: https://expo.dev/accounts/hot-attic-games/projects/tartaria-/submissions/<submission-id>
```

⚠ `expo.dev` is **blocked by the agent network egress proxy**, so an agent
session cannot open either link. An agent may read the GitHub run log (which
carries the build id, the build number and the submission id) and must then
either ask the owner for the EAS/App Store Connect outcome or report it as
unverified. **Do not report "build succeeded" from a green Actions run.**

### ⚠ DO NOT MANUALLY RUN "Publish · iOS → TestFlight"

The workflow visible as **"Publish · iOS → TestFlight"** (`submit-ios.yml`) is
**not the normal first button**, and must not be prescribed as a routine
follow-up step after a successful build with `submit=true`.

OTA-1824 proved that the canonical iOS build workflow performs the whole chain
itself: native build → IPA → automatic Apple submission → Apple processing →
TestFlight availability. Telling Kevin to run the submit workflow afterwards
invites a duplicate submission for a build Apple already has.

**Use it only** when evidence shows a *successful* native build did not perform
its expected automatic submission — i.e. the EAS build completed but no
submission exists. That is a repair path, not a step.

### THE PROVEN EXAMPLE — OTA-1824

Recorded so the chain never has to be re-derived:

| stage | evidence |
|---|---|
| application authority | `015c323726bb5aed4401fd8adf364fa5400177d7` |
| required CI | run **2162** (id 34911463993) — all 8 required jobs SUCCESS |
| Golem publication | publisher run **1396** (id 34911749773) — release `tartaria@4.32.11+2026-09-15-1824-the-helper-is-called-not-quoted`, revision `015c323726bb`, deploy `golem` |
| HAL promotion | `promotions` record at `3983a991`; promote run **19** (id 34912895642) |
| HAL publication | publisher run **1397** (id 34912940555) — same release, revision `015c323726bb`, `OTA complete for line 'hal' — 3 target(s)`, deploy `hal` |
| owner dispatch | build-ios run **198** (id 34913585498), `workflow_dispatch`, at `015c3237` |
| build number stamped | `Bumping expo.ios.buildNumber from 198 to 199` |
| EAS build | id `4a62f6ee-2158-49b9-be5f-c27d07dc1541`, `Build number: 199` |
| native Swift compile | **SUCCESS** |
| production IPA | **SUCCESS** |
| automatic submission | `✔ Scheduled iOS submission`, id `db3e37e2-de28-40cc-9064-9b7eb3525f11` |
| Apple processing | **COMPLETE** |
| TestFlight | **LIVE — actual Apple Build 199** |

Bundle id resolved to the bare store id `com.hotatticgames.tartarprim` — the
production flip described in §5 — not the `.hal2001` suffix. That is correct for
an App Store Connect build and is *not* the same identity as the Android HAL
sideload in §8.2.

⚠ The log line `No complete App Store Connect credentials, skipping TestFlight
setup` appears on this **successful** run. It refers to a different credential
set and did **not** block submission — the submission was scheduled four lines
later. Do not "fix" it.

### ⚠⚠ BUILD NUMBERS ARE READ, NEVER PREDICTED

Step 7 stamps `app.expo.ios.buildNumber = github.run_number`, and EAS
`autoIncrement` then adds one. Observed: run 188 → Build 189 · run 196 → Build
197 · run 198 → Build 199.

**That history is not a licence to predict.** A skipped run still consumes a
run_number, the stamping step could change, and EAS owns the increment. **Always
read the actual assigned number from the run log** (`Bumping expo.ios.buildNumber
from N to M`, or `Build number: M`) and report *that*. A predicted number stated
as fact is how an agent ends up claiming a binary that does not exist — see the
"Build 190" episode, where the number was unreachable and saying otherwise would
have been a fiction.

**Do not alter the build-number mechanic** to force a particular number. The
stamping step's own comment documents the Apple duplicate-rejection regression it
exists to prevent.

---

## 8.2 ANDROID HAL APK — THE OWNER BUTTON

> **GitHub → Actions → "Android Build (Tartaria Realms)" → Run workflow**
> *(engineering reference: `.github/workflows/build-apk.yml`. An older name,
> "Build Android APK", survives only in the `list_workflows` API row — it is not
> on the owner's screen; see §8.0.)*

For the normal HAL sideload / update APK:

| field | value |
|---|---|
| **Use workflow from** (Ref) | the exact validated source — confirm the tip as in §8.1 |
| **Profile** | `preview` |
| **Line** | `hal` |

### ⚠ THE PROFILE INPUT IS OVERRIDDEN WHEN LINE = HAL

Selecting `preview` matches what the workflow does anyway. The `Determine build
profile and tag` step resolves in this order:

1. `refs/tags/v*` → `production`
2. commit message contains `[build-aab]` → `production`
3. **`TARTARIA_LINE == hal` → `preview`, tag `Hal2001-<run_number>`**
4. otherwise → the `profile` input

So on a dispatch with `line: hal`, rule 3 fires and the `profile` input is not
consulted. This is a safety property worth knowing: **you cannot accidentally
produce a HAL-suffixed production AAB via the line input.** Selecting `preview`
is correct and also inert.

### Expected pipeline

```
exact source (actions/checkout, no ref: → the dispatched SHA)
  → npm ci
  → Android versionCode = github.run_number     (baked into the manifest; OTA cannot override)
  → Kotlin 1.9.25 pinned in both version catalogs
  → onnxruntime-android pinned to 1.22.0        (avoids the latest.integration XML parser bug)
  → npx expo prebuild --platform android
  → stable HAL keystore reconstructed from base64 + build.gradle signing patch
  → ./gradlew assembleRelease  (arm64-v8a only)
  → signed HAL APK
  → GitHub Actions artifact (90-day retention)
  → GitHub Release, tag Hal2001-<run_number>, targeted at $GITHUB_SHA
```

| | |
|---|---|
| **Application ID** | `com.hotatticgames.tartarprim.hal2001` *(resolved through `app.config.js`, verified 2026-09-15)* |
| **Channel** | `hal2001` |
| **App name** | `Tartaria Realms HAL` |
| **Filename shape** | `tartaria-realms-Hal2001-<run_number>.apk` |

### ⚠⚠ HAL PREVIEW AND GOLEM PREVIEW ARE DELIBERATELY DIFFERENT

They share a profile name and nothing else.

| | HAL preview | Golem preview |
|---|---|---|
| signing | **stable HAL upload key** (`ANDROID_KEYSTORE_*`) | **debug-signed fallback**, fresh key per build |
| upgrade behaviour | **updates an existing HAL install in place** | Android refuses the upgrade; uninstall first |
| package | `…tartarprim.hal2001` | `…tartarprim.golem` (separate install) |
| tag | `Hal2001-N` | `golem-apk-N` |

The condition that does this is `profile == 'production' || TARTARIA_LINE == 'hal'`.
**Never present the Golem preview APK to Kevin as the normal HAL update APK** —
it installs and runs, and then refuses to upgrade, which looks like a device
problem rather than a wrong artifact.

⚠ This exact coupling was a live defect once (OTA-1388): the condition read
`github.ref_name == 'HaL2001'`, so on the trunk a `line: hal` APK skipped release
signing and came out debug-signed. Nothing went red. You found out when a
tester's install refused the update.

### ⚠ ORDINARY PUSHES DO NOT BUILD ANDROID — THIS IS CORRECT

The job gate makes an Android build **opt-in on the trunk**. A push to
`golem-line` builds only when the commit title carries `[build-apk]`,
`[build-aab]` or `[golem-apk]`; otherwise the job reports **skipped**.

An Android build is 30–60 minutes of runner time. The trunk takes every commit
for all four products, so firing on every push would be a standing charge. A
skipped Android job on an ordinary OTA push is the gate working.

**Do not "fix" this** because an OTA push produced a skipped Android run. Example
for recognition: run **470** on the OTA-1824 push — `conclusion: skipped`, as
designed.

⚠ Note also the `paths-ignore` list (`app/**`, `assets/**`, `scripts/**`,
`__tests__/**`, `**.md`, …). An OTA-stamp-only commit touches nothing outside it,
so a marker alone starts **nothing** — §1's "trigger touch" applies.

---

## 8.3 ANDROID SIGNING REFERENCE — SECRET **NAMES** ONLY

**No secret value is documented here, and none may be added.** Do not print,
echo, commit, decode or otherwise retrieve any of these.

| secret name | source-derived purpose |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of the shared HAL upload keystore; decoded to `android/app/tartaria-upload.keystore`. Signs the **HAL sideload APK**, and the production AAB when no `*_PROD_*` set exists. |
| `ANDROID_KEYSTORE_PASSWORD` | store password for the above; also used for the `keytool -list` unlock check |
| `ANDROID_KEY_ALIAS` | key alias within that keystore → `MYAPP_UPLOAD_KEY_ALIAS` |
| `ANDROID_KEY_PASSWORD` | key password → `MYAPP_UPLOAD_KEY_PASSWORD` |
| `ANDROID_PROD_KEYSTORE_BASE64` | base64 of a **separate production upload keystore**, used only when `profile == production` **and** this secret is non-empty; decoded to `tartaria-prod-upload.keystore`. Exists because Play Console pins the signing key per package, and the store listing may have been created with a different key than HAL's. |
| `ANDROID_PROD_KEYSTORE_PASSWORD` | store password for the production keystore |
| `ANDROID_PROD_KEY_ALIAS` | key alias within the production keystore |
| `ANDROID_PROD_KEY_PASSWORD` | key password within the production keystore |
| `GITHUB_TOKEN` | Actions-issued token; used **only** by `gh release create` to publish the Release and attach the artifact. Not a signing credential. |

**Guarded fallback, as written:** if `profile == production` and
`ANDROID_PROD_KEYSTORE_BASE64` is empty, the build **falls back to the shared
`ANDROID_KEYSTORE_*` set** and prints a warning that Play Console may reject the
AAB with a wrong-signing-certificate error. If no keystore secret is available at
all, the build **fails hard** rather than shipping a debug-signed artifact.

### ⚠⚠ PRESENCE AND VALIDITY CANNOT BE INFERRED FROM SOURCE

Workflow source shows which secret names are *referenced*. It cannot show whether
a secret is **set**, whether its value **decodes to a valid keystore**, or whether
the password **unlocks** it. GitHub redacts values, and an unset secret
interpolates to an empty string that looks identical to a configured one.

**The build itself is the validation boundary.** The workflow is built around
this: it decodes, runs `keytool -list` to prove the keystore unlocks, prints the
certificate SHA-256 fingerprint for cross-checking against Play Console, and for
production runs `jarsigner -verify` plus a check that the signer CN is **not**
`CN=Tartaria Realms Debug`. Each failure is a hard stop.

So: **never report Android signing as "configured" or "working" on the strength of
reading this file.** Only a run says that.

---

## 8.4 GOOGLE PLAY CONSOLE / TESTING — WHAT IS AND IS NOT PROVEN

This section is deliberately narrow. Read the labels as written.

### PROVEN — the workflow can produce a production AAB

| | |
|---|---|
| **Store application ID** | `com.hotatticgames.tartarprim` (the **bare** id, no line suffix) |
| **How it is reached** | `profile == production` sets `TARTARIA_STORE_BUILD=1`; `app.config.js` resolves the bare id. ⚠ §5: this flip used to be a workflow step rewriting `app.json` and was silently dead for a while. It lives in the config layer now. **Do not move it back.** |
| **Gradle task** | `bundleRelease` |
| **Signing** | production credentials when present, with the §8.3 guarded fallback |
| **Verification** | `jarsigner -verify` + debug-CN rejection, both hard failures |
| **Where the AAB lands** | a GitHub Actions artifact **and** a GitHub Release, tag `aab-build-<run_number>` (or the pushed `v*` tag) |

### ⚠⚠⚠ NOT PROVEN — there is no automatic Play Console upload

The Codex investigation did not establish an existing automatic upload from the
completed production AAB into a Google Play Console testing track.

Searching the source independently on 2026-09-15 agrees, and can say slightly
more — **no upload mechanism is written anywhere**:

* no `upload-google-play` / `r0adkll` action, no `fastlane supply`, no
  `androidpublisher` call, no service-account secret, no `track:` selector
  anywhere in `.github/workflows/`
* `eas.json`'s `submit` block contains **`production.ios` only** — there is no
  `android` submit configuration at all
* the workflow's own GitHub Release note ends the chain by instructing a human:
  *"Play Store AAB bundle — upload to Google Play Console."*

**The production AAB path terminates at a GitHub Release.** Getting it into a
Play Console testing track is a manual human step, and this document does not
claim otherwise.

⚠ **Do not document a Play Console testing-track delivery as existing, working,
or automatic.** Do not describe an Android release chain that ends "→ internal
testing track" by analogy with the Apple chain in §8.1. The Apple chain is proven
end to end; the Android chain is **not**, and the asymmetry is the finding.

⚠ **The bounded negative.** Source proves no upload *step is written*. It cannot
prove nobody uploads by hand, and it cannot prove a track does or does not exist
in the Play Console — that console is outside this repository and outside an agent
session's reach. If the state of the Play Console matters, **ask the owner**; do
not infer it from source, and do not infer it from the absence of an error.

### Open, and named rather than quietly assumed

* Whether a Play Console testing track exists and what is on it — **UNKNOWN from
  here.**
* Whether `ANDROID_PROD_*` is populated, and therefore whether a production AAB
  would be signed with the key the listing expects — **UNKNOWN from here** (§8.3;
  the build is the boundary).
* Whether the recovered Android factory still builds green — **NOT RE-PROVEN.**
  No Android build was started for this documentation pass, by instruction. The
  last recorded Android runs are `skipped` push runs, which prove the gate works
  and nothing about the build.
