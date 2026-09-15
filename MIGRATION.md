# Tartaria RPG — Android Modernization Migration Reference

**Status:** Gate 9 complete. Clean Golem migration authorized.  
**Application authority before migration:** OTA-1824 `015c323726bb5aed4401fd8adf364fa5400177d7`  
**Proof branch:** `api36-config-proof` — **RADIOACTIVE. NEVER MERGE.**

## Proven outcome

Gate 9 commit `d68b35bd0ebfde65ba228edd62eec721ca9ed49f`, run `34965134370`:

- **29 PASS / 0 FAIL of 29 ARM64 ELFs**
- `compileSdk 36`, `targetSdk 36`
- 16 KB packaging PASS (`bundletool` + `zipalign -P 16`)
- ARM64-only proof artifact
- Production signing identity preserved
- Proof AAB: 201,569,491 bytes
- Proof AAB SHA-256: `d20821213f477a2728996a4c80b262b799bd58e682374c03b9f5113bdcd79217`

The Android API36 / 16 KB laboratory campaign is closed. No further framework ladder is justified. The next phase is clean reconstruction on the real `golem-line`, followed by a real Golem Android artifact and owner physical qualification. HAL remains untouched until acceptance.

## Final migration target

| Component | Target |
|---|---|
| Expo | `54.0.37` |
| React Native | `0.81.5` |
| React | `19.1.0` |
| expo-modules-core | `3.0.30` |
| AGP | `8.11.0` |
| Gradle | `8.14.3` |
| Kotlin | `2.1.20` — coherent graph, **not manually pinned** |
| NDK | `27.1.12297006` (r27b) |
| Build Tools | `35.0.0` |
| compileSdk | `36` |
| targetSdk | `36` |
| Architecture | New Architecture enabled |
| JS engine | Hermes |
| ABI | `arm64-v8a` only |

The obsolete Tartaria Kotlin `1.9.25` pin must be removed. Do **not** force NDK r28. Gate 6 showed SDK54 release lint can exhaust a 512 MiB Metaspace cap; the real factory must prove effective Metaspace is at least 1 GiB or unbounded while keeping `lintVital` enabled.

## Dependency movement

The clean migration uses the coherent Expo54 graph, not `latest` and not opportunistic upgrades:

- `expo ~52.0.0` → `~54.0.37`
- `react-native 0.76.3` → `0.81.5`
- `react 18.3.1` → `19.1.0`
- `react-dom 18.3.1` → `19.1.0`
- `@expo/metro-runtime ~4.0.1` → `~6.1.2`
- `@react-native-async-storage/async-storage 1.23.1` → `2.2.0`
- `@sentry/react-native 6.10.0` → `~7.2.0`
- `react-native-safe-area-context 4.12.0` → `~5.6.0`
- `react-native-web ~0.19.13` → `~0.21.0`
- `expo-build-properties ^55.0.14` → `~1.0.10` — intentional SDK54 coherent resolution
- `expo-application ~6.0.0` → `~7.0.8`
- `expo-asset ~11.0.0` → `~12.0.13`
- `expo-av ~15.0.2` → `~16.0.8`
- `expo-clipboard ~7.0.0` → `~8.0.8`
- `expo-constants ~17.0.0` → `~18.0.14`
- `expo-file-system ~18.0.0` → `~19.0.24`
- `expo-font ~13.0.0` → `~14.0.12`
- `expo-intent-launcher ~12.0.0` → `~13.0.8`
- `expo-navigation-bar ~4.0.0` → `~5.0.10`
- `expo-speech ~13.0.1` → `~14.0.8`
- `expo-splash-screen ~0.29.0` → `~31.0.13`
- `expo-status-bar ~2.0.0` → `~3.0.9`
- `expo-updates ~0.26.0` → `~29.0.20`
- `jest-expo ~52.0.0` → `~54.0.18`

React 19-compatible `@types/react` must be selected from actual install/typecheck evidence. Leave TypeScript at its current version unless the real typecheck proves movement is required.

Hold unless direct migration evidence proves otherwise:

- `llama.rn 0.4.8`
- `onnxruntime-react-native 1.24.3`
- `react-native-executorch 0.8.4`
- `expo-speech-recognition`
- `zustand`

## Native 16 KB repairs

### llama.rn 0.4.8

Do **not** upgrade llama. Preserve the existing Tartaria patch protections:

- six ARM64 kernel family
- SVE build suppression
- `hasSve=false` Tensor G5 / Pixel 10 Pro XL crash protection
- `getSelectedVariant` / `getTartariaDiag`
- `loadedVariant`
- `cpuDiag`

Extend `patches/llama.rn+0.4.8.patch` only with the Gate 7B package-local CMake opt-in:

`-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`

Gate 7B moved all six llama ELFs from `0x1000` to `0x4000`; Gate 9 held all six byte-identical and compliant.

### onnxruntime-react-native 1.24.3

Keep `onnxruntime-react-native 1.24.3`. Create `patches/onnxruntime-react-native+1.24.3.patch` against pristine npm 1.24.3 and add exactly one functional CMake argument in the RN >=71 branch:

`-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`

The patch must not bake in the workflow's later ONNX core rewrite.

Gate 9 moved `libonnxruntimejsi.so` from `0x1000` to `0x4000` with changed bytes.

Keep `onnxruntime-android` core at **1.22.0**. Gate 9 held `libonnxruntime.so` compliant and byte-identical to Gate 7B. Keep `react-native-executorch 0.8.4`; Expo Modules Core and ExecuTorch already ship upstream flexible-page-size opt-ins.

## Native version and OTA boundary

The migration changes `expo.version` from **2.4.1 → 2.5.0**.

`runtimeVersion` remains `policy=appVersion`. RN76 and RN81 must not share runtime `2.4.1`; the new native generation requires its own `2.5.0` compatibility boundary.

**NATIVE FIRST. OTA SECOND.** No 2.5.0 OTA may be published before a 2.5.0 native binary exists and is intentionally qualified. The clean implementation must audit publisher behavior before any push capable of accidental publication.

## Lockfile and JS/TS validation gap

The proof gates used `npm install`; they did not prove the real committed `package-lock.json` used by the factory's `npm ci`.

The clean migration must:

1. regenerate `package-lock.json` from the intended graph;
2. prove clean `npm ci` succeeds;
3. record the exact resolved native anchors;
4. prove both patch-package patches apply cleanly;
5. run Expo Android prebuild and read the generated toolchain values;
6. run Jest/focused tests, source/test typechecks and lint;
7. make only the smallest migration-caused compatibility repairs, with no opportunistic cleanup.

The first committed application migration boundary should be coherent: Expo54/RN81/React19/API36/version 2.5.0/regenerated lockfile/both native patches. Do **not** first commit the new patches onto the old Expo52/RN76 application.

## Real Android factory

Continue using the owner-visible **Android Build (Tartaria Realms)** workflow. Do not redesign Android around EAS Build.

Minimum factory surgery:

- delete the step that pins Kotlin 1.9.25 in RN/Expo catalogs;
- delete or convert the Kotlin 1.9.25 propagation/suppression step to read-only reporting;
- remove `-Pandroid.kotlinVersion=1.9.25` and `-PkotlinVersion=1.9.25`;
- guardedly provision `platforms;android-36` and `build-tools;35.0.0`;
- preserve the ONNX `latest.integration → 1.22.0` pin **after** `npm ci` / patch-package;
- preserve `github.run_number` Android `versionCode` injection;
- measure effective Gradle JVM arguments and require Metaspace >=1 GiB or unbounded;
- keep `lintVital` enabled;
- add complete post-build ARM64 ELF inventory and separate `bundletool` / `zipalign -P 16` verification.

Preserve signing, Golem/HAL distinctions, ARM64 strategy, retry wrapper, artifact staging and GitHub Release behavior.

The proof branch's `versionCode=1` is a proof-harness artifact and must never become the real release versionCode.

## Clean Golem acceptance sequence

1. Reconstruct the coherent application migration on real Golem without merging the proof branch.
2. Prove `npm ci`, patches, prebuild/toolchain, Jest/focused tests, typechecks and lint before the application migration is committed.
3. Commit factory surgery separately.
4. Run normal required CI. Heavy CI is not automatically authorized.
5. Dispatch **Android Build (Tartaria Realms)** with `profile=production`, `line=golem`.
6. Inspect the **actual** Golem AAB, not the proof artifact.
7. Require/report package identity, version 2.5.0, real Actions-derived versionCode, compile/target 36, ABI and signer.
8. Enumerate every actual ARM64 `.so`; do not assume the inventory remains 29. Require every `LOAD p_align >= 0x4000`.
9. Re-prove ONNX JSI, ONNX core 1.22.0 and all six llama controls.
10. Run independent 16 KB packaging verification.
11. STOP after artifact validation. No Play, HAL, OTA or iOS publication.

## Owner physical qualification

Static compliance is not runtime acceptance. After the real Golem artifact passes, owner qualification covers:

- cold boot, existing character, new character, save/reload;
- normal gameplay/travel/combat, inventory/vendor and major overlays/modals;
- Qwen/llama inference, `loadedVariant`, `cpuDiag`, Tensor G5 / Pixel 10 SVE protection;
- ONNX MiniLM cognition and ExecuTorch;
- audio/microphone and background/foreground;
- Android 16 edge-to-edge/insets, predictive back and lifecycle/task behavior;
- crash/freeze regression observation;
- actual 16 KB runtime page size where available.

Do not intentionally reproduce historical freezes.

HAL remains the known-working safety line until the migrated Golem build is physically accepted.

## iOS blast radius

Android success does not qualify iOS. Expo/RN/React/Expo modules/Sentry/expo-updates are shared.

Build 199 / OTA-1824 remains the pre-migration iOS reference. After Android Golem qualification, iOS requires a fresh native build and bounded physical requalification under version/runtime 2.5.0.

## Explicit exclusions

Do **not**:

- merge, cherry-pick, rebase or otherwise land `api36-config-proof`;
- copy its proof workflows into Golem;
- force NDK r28;
- add global max/common-page-size linker flags;
- disable `lintVital`;
- upgrade llama, ONNX or ExecuTorch merely for 16 KB compliance;
- move ONNX core off 1.22.0;
- touch model/prompt/inference behavior without a demonstrated migration failure;
- publish Play or OTA;
- promote HAL;
- run iOS or Heavy CI as part of the initial clean Android migration;
- redesign the Android factory around EAS Build;
- perform unrelated cleanup.

## Evidence boundary

Gate 9 proves the proposed native stack can produce an API36, 16 KB-compliant signed ARM64 artifact. It does **not** prove the real Golem factory, regenerated lockfile, JS/TS/test surface, or gameplay/runtime behavior. Those are the remaining clean-migration gates.

When the real Golem artifact is accepted statically, report it precisely as:

> **REAL GOLEM ANDROID ARTIFACT**  
> API 36: PROVEN  
> 16 KB ELF: PROVEN  
> 16 KB PACKAGING: PROVEN  
> RUNTIME/GAMEPLAY: DEVICE VERIFICATION REQUIRED
