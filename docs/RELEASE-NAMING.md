# Release naming — "Tartaria Realms v<number>"

**Owner rule (studio-wide).** Every playable build is named by a product name and one
sequential number, so the owner never has to decipher a branch, SHA, build number,
codename or OTA id to know which file is newest.

    Tartaria Realms v283              ← GitHub Release title
    Tartaria-Realms-v283.apk          ← Android file (also .aab for the Play bundle)
    Tartaria-Realms-v283-Windows.exe  ← Windows file

The next delivered build is **Tartaria Realms v284**, then v285, and so on.

## The one number

`release/public-version.json` holds it (`product`, `fileStem`, `version`). It is the ONLY
public version. `scripts/release-naming.cjs` turns it into the release title, the artifact
filename and the first lines of the release notes, and the workflows
(`build-apk.yml`, `build-steam-exe.yml`) call that script. Nothing else spells a public name.

- Public versions are plain integers: v1, v2, v3 … Never semver (`v0.2.0`), never a
  codename (`b9`, `g2`, `final`, `api36`, `poc`).
- **Every NEW PLAYABLE BUILD intentionally delivered to the owner takes the next number.**
  Bump `version` in `release/public-version.json` in the same commit that asks for the build
  (`[build-apk]` / `[build-aab]` / dispatch). That edit is outside the workflow's `paths-ignore`,
  so it is also the "trigger touch" such a commit needs.
- A number identifies **one** delivered build state. It is never reused for a different
  commit and a delivered binary is never overwritten. The workflows enforce this *before the
  build starts*: if a release titled `Tartaria Realms v<N>` already exists from a different
  commit, the run fails and says to bump the number.
- Failed or cancelled CI runs, and developer-only intermediate builds that were never
  presented as something to install, do **not** consume a number.
- **One release, several platforms.** The same number, built from the same commit, joins the
  existing normal release (an AAB of the build that already has an APK is *uploaded to* that
  release, never `--clobber`ed). Android versionCode and CI run numbers stay internal.

## Where the technical identifiers live

They are engineering metadata — **provenance, never the version**:

| identifier | where it is kept |
|---|---|
| git SHA (full) | release notes → "Source commit"; About → Copy All |
| Android versionCode / CI run number | release notes; About → Install → Build |
| git tag (`golem-apk-N`, `aab-build-N`, `Hal2001-N`, `pc-v…`) | the release's tag; release notes |
| SHA-256 of the artifact | release notes |
| package id, OTA channel, runtimeVersion | release notes; About |
| OTA id / codename, `DISPLAY_VERSION` | About + Copy All (as the **OTA revision**) |
| workflow run | release notes |

The release **title** and **filename** carry none of them. The top of the notes says what to
install; the technical block follows after a rule.

## OTA revisions are not public versions

A native build or other delivered artifact consumes a public version. An OTA revision
(`OTA_BUILD_ID`, `DISPLAY_VERSION`, the codename) is the *internal* revision layered on that
build, and diagnostics show it **separately** (About: "Version v283" and "OTA revision …").
Every OTA still bumps `OTA_BUILD_ID` and `DISPLAY_VERSION` exactly as `VERSION.md` and
`CLAUDE.md` say — that scheme is unchanged and is now explicitly the *internal* one.

## History and how v283 was chosen (2026-10-04)

Before this convention the releases page held 333 releases in five schemes: `apk-build-N`
(214), `Hal2001-N` (36), `aab-build-N` (26), `golem-apk-N` (8) — all numbered by the Android
workflow's CI run number — plus 49 `pc-v4.x` prereleases. Android versionCode / run number
(478 at the last build) is **not** a count of deliveries: about 195 runs never produced a
release. The public number is instead the chronological count of delivered playable Android
builds (a GitHub Release carrying an installable artifact; `apk-build-4` carries none and
is not counted): **283**, with `apk-build-8` (2026-05-15) as #1 and `golem-apk-478`
(2026-09-16) as #283. The 49 PC prereleases are a separate legacy series and were not
folded in; the next release that ships a Windows build from the same commit as an Android
one simply shares that release's number.

Old releases and tags were left alone (tags are provenance). Only the newest release was
retitled/renamed under this convention.

## Not yet covered

iOS/TestFlight (Apple build numbers), the web build, and the Linux/macOS desktop artifacts
do not create GitHub Releases today and are not wired to this file. When one starts
shipping as a Release, call `scripts/release-naming.cjs` from its workflow the same way.
