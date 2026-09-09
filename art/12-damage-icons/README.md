# 12-damage-icons — masters for the illustrated damage icons

**Source masters. Not bundled.** `app.json` bundles `assets/**/*`; this tree is
tracked in git and never reaches the phone. The runtime copy of each icon lives
in `assets/damage/`, and `assets/damage/README.md` records what every one of them
shows and where it came from.

| File | Runtime counterpart | Note |
|---|---|---|
| `environmental_64.png` | `assets/damage/environmental.png` | byte-identical — the runtime IS the 64 |
| `environmental_128.png` | — | master only |
| `environmental_256.png` | — | master only |
| `environmental_512.png` | — | master only |

**Custom Tartaria Environmental Thunderstorm**, added at OTA-1764 to replace the
provisional `L544`, which was rejected for reading as a suitcase rather than a
hazard. Status: PROVISIONAL pending actual-device visual approval.

⚠ **Do not `require()` anything in here.** The runtime draws one resolution. The
larger masters exist so the icon can be re-exported if a surface ever needs it
bigger — not so four copies can be shipped because they happen to exist.
