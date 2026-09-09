# 12-damage-icons — masters from the OTA-1763 icon trial (RETIRED)

## ⚠⚠ RETIRED AT OTA-1766. NOTHING IN THE GAME READS THESE.

The trial this belonged to is over. The owner approved a different pack —
*Tartaria Combat Glyph Replacement* — keyed to the game's own damage vocabulary
rather than to the ten invented concepts the trial used, and it went live in
Lore ▸ Glyphs, on the combat weapon buttons and on the discovery star. See
`art/13-combat-glyphs/` and `assets/combat-glyphs/`.

`assets/damage/` and `app/engine/damageIcons.ts` were deleted with the trial.
`environmental` has **no counterpart** in the new vocabulary — there is no
"environmental" damage type in the game, which is precisely the binding question
OTA-1763 declined to answer and the approved pack answered by not needing to ask.

**⚠ THIS TREE IS KEPT ANYWAY, AND THAT IS DELIBERATE.** The thunderstorm was
COMMISSIONED for this game (OTA-1764, replacing `L544` after the owner rejected
it for reading as a suitcase). These four files are the only copy of it.
Deleting an unused asset is tidy; deleting the only copy of a commissioned one is
destructive, and a folder that has gone quiet makes the two easy to confuse.

**Source masters. Not bundled.** `app.json` bundles `assets/**/*`; this tree is
tracked in git and never reaches the phone.

| File | Runtime counterpart | Note |
|---|---|---|
| `environmental_64.png` | — | was `assets/damage/environmental.png`; retired at OTA-1766 |
| `environmental_128.png` | — | master only |
| `environmental_256.png` | — | master only |
| `environmental_512.png` | — | master only |

**Custom Tartaria Environmental Thunderstorm**, added at OTA-1764 to replace the
provisional `L544`, which was rejected for reading as a suitcase rather than a
hazard. Status: PROVISIONAL pending actual-device visual approval.

⚠ **Do not `require()` anything in here.** The runtime draws one resolution. The
larger masters exist so the icon can be re-exported if a surface ever needs it
bigger — not so four copies can be shipped because they happen to exist.
