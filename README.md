# Tartaria Realms

A procedural narrative RPG set in the Tartaria Prima universe by Kevin Ernst. Built phone-first with React Native + Expo, designed to be developed and shipped entirely from a phone via GitHub.

## Status

`v0.1.0` — first vertical slice. Title screen, character creation (7 races × 5 factions), procedural exploration with stats / inventory / adventure feed, persistent game log on device, world memory, weighted RNG content pipeline, lore codex.

## Tech

- Expo SDK 52, React Native 0.76, TypeScript
- Zustand state, AsyncStorage persistence
- EAS Build for APKs, EAS Update for OTA
- Classic Expo entry (`expo/AppEntry.js`) — `app/` is the game-code namespace, not an expo-router routes folder

## Layout

```
App.tsx                 # entry, screen switch
app/
  components/           # StatsPanel, InventoryPanel, AdventureFeed, InputBox
  screens/              # Title, CharacterCreation, Exploration, Log, Lore
  engine/               # parser, questGenerator, narrativeGenerator, rng, character, encounter, worldMemory, saveSystem, gameLog, types
  state/                # zustand store
  data/
    races/              # 7 playable races from the manual
    factions/           # 5 canon factions
    enemies/            # ~95 canon bestiary entries (Common → Legendary)
    locations/          # 21 canon places
    npcs/               # named figures
    events/             # timeline, scene openings
    quests/             # objectives, complications, rewards
    weather/, hazards/, relics/, spells/
docs/
  lore-source.txt       # full text of tartar.docx for engine extraction
.github/workflows/
  eas-build-apk.yml     # phone-triggerable APK build
  eas-update.yml        # OTA on push to main
```

## Building from your phone

You already wired up:
- EAS project `af723f5e-e446-4296-aa6e-f1d4a4fbe82a` under owner `hot-attic-games`, slug `tartaria-`
- GitHub Actions secret named `TARTARIA` holding your EAS access token

### To get an APK

1. Open the GitHub mobile app or the website.
2. Go to **Actions** → **EAS Build (Android APK)**.
3. Tap **Run workflow** → leave profile as `apk` → **Run**.
4. The workflow queues an EAS Build. Watch progress at `https://expo.dev/accounts/hot-attic-games/projects/tartaria-/builds`.
5. When done, tap the build to get a direct APK download link. Install on your device.

Pushes to `main` also auto-trigger an APK build. OTA updates auto-publish on `main` push via the EAS Update workflow.

### Build profiles (defined in `eas.json`)

| Profile      | Output     | Channel       | Use                               |
| ------------ | ---------- | ------------- | --------------------------------- |
| development  | APK        | development   | Dev client, debug                 |
| preview      | APK        | preview       | Internal preview builds           |
| apk          | APK        | production    | Quick APK matching production OTA |
| production   | AAB        | production    | Play Store                        |

## The procedural content pipeline

Every piece of content lives in JSON under `app/data/`. The engine modules read these at runtime and assemble narrative on the fly. To add content, append to the relevant JSON. No code change needed.

The full Tartaria Prima manual sits at `docs/lore-source.txt` as plain text for cheap reading and grepping. The engine's data files were extracted from it.

## Local dev (optional, off-phone)

```bash
npm install
npx expo start         # Expo Go on phone (LAN required)
npm test               # jest unit tests
npm run typecheck      # tsc --noEmit
```

## Roadmap

Phase 2 — combat with the procedural action system, runecaster spell-casting, faction reputation effects on encounters.
Phase 3 — settlements, NPC vendors, caravan logistics.
Phase 4 — voice narration, dynamic soundtrack, multiplayer trade.

See `docs/lore-source.txt` for the full manual.
