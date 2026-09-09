# 13 — combat glyphs (masters)

The owner-supplied *Tartaria Combat Glyph Replacement Pack*, kept whole.

**Not bundled.** `app.json` ships `assets/**/*` into the app; this tree is not
under it. Git keeps these, the bundler never sees them, and the phone carries one
resolution rather than four. Owner's standing rule from OTA-1764: *"Do not load
all four resolutions into the mobile runtime merely because they exist."*

| here | what |
| --- | --- |
| `128/` | the runtime set, byte-identical to `assets/combat-glyphs/` |
| `256/` | master |
| `512/` | master |
| `masters/` | the clean 512px working masters cropped from the approved artwork |
| `SOURCE_AUDIT.txt` | per-icon: which generated source image, and the crop box |

`128/` is duplicated here on purpose. It is the resolution that ships, and
keeping it beside its own masters means the two cannot silently drift into a
stale export nobody can tell apart by looking — a test asserts every file in
`assets/combat-glyphs/` is md5-identical to its twin here.

## The twelve

`bludgeoning` `slashing` `piercing` `aetheric` `radiation` `burn` `cold`
`poison` `acid` `corruption` `electrical` — the eleven damage/coating types — plus
`discovery_star`, which is a verdict and not a damage family.

Burn, cold, poison and electrical are **one image each** whether they appear as a
weapon's own damage or as a coat.

## Not covered

`degradation` and `stun` have no artwork of their own. `degradation` resolves the
**acid** art anyway — it is aliased to acid before the lookup, exactly as its text
glyph prints ⚗ rather than ⚙ — so `stun` is the only genuine hole, and it falls
back to its ✱. See `assets/combat-glyphs/README.md`.

## Status

**PROVISIONAL** pending actual-device approval of displayed size and spacing.
The artwork itself is approved. Displayed at **28dp on both surfaces** since
OTA-1767 — the combat chip grows to hold the mark rather than the mark shrinking
to fit the chip.
