# Tartaria Realms — Apple iOS build line (`apple_ios`)

This is the **native iOS** line. Unlike the Windows/Linux builds (Electron wrapping
the web bundle), iOS runs the **full native React Native app** — the on-device AI
(Qwen) and voice (Kokoro) work natively here, exactly like Android. There are **no
web stubs**; this is the real app.

Forked from `golem-line` (the mobile dev line, OTA-622), NOT from `steam_Dev` — the
PC line's web stubs / Electron scaffolding don't belong in a native iOS app.

Identity: name "Tartaria Realms (Apple iOS Dev)", bundle id
`com.hotatticgames.tartarprim.appleios`, channel `apple-ios`.

## Why there's no one-click CI artifact here

iOS apps can't be sideloaded freely like an Android APK or a Windows `.exe`. Apple
requires code-signing + provisioning tied to an Apple Developer account, and getting
a build onto a physical iPad means **TestFlight** or a **device-registered ad-hoc**
build. So the build runs through Apple infrastructure, not a plain GitHub artifact.

## Two ways to get it on your iPad

### A. Mac mini + Xcode (best for dev testing once the Mac arrives)
On the Mac mini:
```
npm install
npx expo prebuild -p ios          # generates the native ios/ Xcode project
npx expo run:ios --device         # build + install to a connected/registered iPad
#   …or: open ios/*.xcworkspace in Xcode, pick your Apple-ID Team (automatic
#        signing), select your iPad, and press Run.
```
Xcode auto-provisions the `.appleios` bundle id for **development** signing and
installs straight to your iPad (just trust the developer profile on the iPad once:
Settings → General → VPN & Device Management). A free Apple ID works for
device-development; a paid Developer account ($99/yr) is only needed for
TestFlight / App Store.

### B. EAS cloud build → TestFlight (no Mac needed to build)
The repo already has `.github/workflows/build-ios.yml` (EAS Build on Expo's hosted
macOS). It needs the GitHub Secrets `EXPO_TOKEN`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `ASC_APP_ID`.
```
eas build --platform ios --profile preview      # ad-hoc; install via link on registered devices
eas build --platform ios --profile production   # TestFlight (needs an App Store Connect app)
```
⚠ This uses your Apple Developer account + EAS build minutes and (for production)
submits to App Store Connect — a deliberate action, so it's left untriggered here.

## What's NOT blocked
The code is 100% ready — this line is just `golem-line` (current game, OTA-622) with
an iOS identity. The only gate is Apple's signing/hardware, which the Mac mini
solves. When it arrives, path A gets it on your iPad in minutes.
