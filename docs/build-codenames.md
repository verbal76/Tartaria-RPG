# Build Codenames — Dev Cross-Reference

When triaging a bug report, the playtester's About screen / report
email shows a **codename** instead of the raw `OTA_BUILD_ID`. This
file is the lookup table. Keep it open in another tab when reading
bug reports.

> ⚠️ This file is internal. Don't share it with playtesters or paste
> it into anything public. The whole point of the codename layer is
> that testers can't search-engine their way back to the GitHub repo
> via the OTA-NNN pattern — this mapping reverses that and defeats
> the obfuscation if leaked. The repo also flips back to private
> after major build cycles per the OTA-265 workflow plan; the
> mapping stays inside the private repo or your local notes.

## Current mapping

| OTA build ID            | Codename       | Notes                                                      |
|-------------------------|----------------|------------------------------------------------------------|
| `2026-05-31-255`        | Iron Drift     | Auto-resolve dice rolls                                    |
| `2026-05-31-256`        | Mud Mantle     | Investigate dedup wording fix                              |
| `2026-05-31-257`        | Ash Tine       | Investigate chips stay greyed + auto-close modal           |
| `2026-05-31-258`        | Hollow Anvil   | Vendor STEAL stays bright when broke                       |
| `2026-05-31-259`        | Salt Vault     | Hook CONTINUE popup                                        |
| `2026-05-31-260`        | Bone Helm      | Boxing/karate exception on dodge                           |
| `2026-05-31-261`        | Coal Coil      | Dice auto-resolve hold tuned 1500→800ms                    |
| `2026-05-31-262`        | Glass Fence    | SalvageModal: SALVAGE ALL + height-aware                   |
| `2026-05-31-263`        | Crystal Spire  | HookContinueModal: stage history + ABANDON                 |
| `2026-05-31-264`        | Rust Vault     | Crafting: post-craft popup + menu stays open               |
| `2026-05-31-265`        | Stone Mantle   | iOS build (native, GitHub Actions macOS fallback)          |
| `2026-05-31-266`        | Cinder Drift   | iOS Info.plist defensive shotgun                           |
| `2026-05-31-267`        | Smoke Anvil    | Codename obfuscation layer                                 |
| `2026-06-01-268`        | Tin Tine       | About: replace Expo updateId UUID with codename            |
| `2026-06-01-269`        | Brass Coil     | Tool pouch: tappable empty slots + filter + scanner-equip  |

## Reserved pool (assign next 30+ OTAs from this list)

To keep codenames consistent and Tartaria-flavor without burning
fresh creativity per OTA, the next codenames in order will be
drawn from:

1. Lead Helm
2. Copper Fence
3. Slate Spire
4. Pewter Vault
5. Bronze Mantle
6. Granite Drift
7. Marble Anvil
8. Chalk Tine
9. Soot Helm
10. Ember Coil
11. Ash Fence
12. Pitch Spire
13. Tar Vault
14. Wax Mantle
15. Resin Drift
16. Lacquer Anvil
17. Gilt Tine
18. Brass Helm
19. Mire Coil
20. Bog Fence
21. Reed Spire
22. Thorn Vault
23. Briar Mantle
24. Husk Drift
25. Lichen Anvil
26. Moss Tine
27. Loam Helm
28. Quartz Coil

When bumping `OTA_BUILD_ID` in `app/buildInfo.ts`, also add an entry
to `app/buildCodename.ts`'s `CODENAMES` map drawing from the next
unused codename in this list. Move the codename here from the
reserved pool up into the current-mapping table above.

## Commit title format — codename FIRST

When committing an OTA, the commit's **first-line title MUST start
with the codename**, followed by an em-dash, then the OTA-NNN id,
then the description:

```
<Codename> — OTA-NNN — <description>
```

E.g.:

- `Smoke Anvil — OTA-267 — Build codename obfuscation layer`
- `Tin Tine — OTA-268 — Vendor: gift verb routing fix`
- `[build-ios] [submit-ios] Cinder Drift — OTA-266 — Info.plist...`
  (build/submit markers stay first; codename slots in right after)

**Why:** the user reads commits on a phone where titles truncate
around 30-40 chars. Codename-first means a truncated title is still
useful as a build-identity glance. Convention is also documented
in CLAUDE.md so it's enforced across sessions.

## How the obfuscation actually works

1. About screen + bug report email + OTA-applied dialog all show
   the codename (e.g., "Cinder Drift") instead of `2026-05-31-266`.
2. A curious tester searching "Tartaria Realms Cinder Drift" doesn't
   hit the GitHub repo — the codename pattern isn't anywhere in
   commit messages or HANDOFF.md.
3. When a tester reports a bug, you grep this file for their
   codename → find the OTA-NNN → look up HANDOFF.md or
   `app/buildInfo.ts` to see what changed in that build.
4. The `OTA_BUILD_ID` string is still used internally (save migrations,
   `app/buildInfo.ts` change notes, commit messages) — it just isn't
   shown to the user.

## What's still visible to the tester (unavoidable)

These leak the game's bundle id or name, but not the GitHub repo:

- **App ID** (`com.hotatticgames.tartarprim` or `.hal2001`): Android
  Settings → Apps shows it. Not hideable.
- **Game name** ("Tartaria Realms"): on the home screen icon. Not
  hiding.
- **App version** ("3.0.0"): cosmetic display version.
- **APK build version** ("2.4.1"): the runtimeVersion floor. Both
  versions appear on About + bug reports; neither matches a
  GitHub commit pattern.

Apple/Google bundle ids and version strings are unavoidable. The
OTA-NNN pattern was the one search-engine breadcrumb, and the
codename layer kills it.
