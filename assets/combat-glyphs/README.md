# The combat glyphs — the illustrated damage, coating and discovery art

**Wired in at OTA-1766**, from the owner-supplied *Tartaria Combat Glyph
Replacement Pack*. Owner: *"The new combat glyph pack is approved. Go ahead and
move from the test to the actual implementation."*

`app/engine/combatGlyphArt.ts` keys these by **canonical damage type** — the same
strings `app/engine/weaponGlyphs.ts` keys its text glyphs on. Two surfaces read
that one table:

| surface | what it draws | size |
| --- | --- | --- |
| Lore ▸ Glyphs (`WeaponGlyphKey`) | the legend rows, base types and coats | 28dp |
| combat weapon buttons (`InputBox`) | coats, own damage, the discovery star | 18dp |

The sizes differ **because the surfaces do**, not by preference. The legend row
inherited a `width: 28` cell from the text glyph it replaced. A weapon chip is
`paddingVertical: 6` around 12pt text, so 18dp sits inside the content box it
already had; 28 would add about 12dp to the height of every weapon button in a
fight. Both numbers live in `GLYPH_ART_SIZE` and nowhere else.

## The twelve

Eleven damage/coating types plus the discovery star. **Burn, cold, poison and
electrical are one image each whether they appear as a weapon's own damage or as
a coat** — that falls out of keying by canonical type rather than by role, and it
is the same rule `weaponGlyphs` already applies to the characters ("fire is fire
whether it is painted on or built in").

| file | bytes | md5 |
| --- | --- | --- |
| `acid.png` | 35,661 | `e590e46897a18fb2e93867714e62b5d9` |
| `aetheric.png` | 34,809 | `e133fb75439bbd9f0091c164d88af222` |
| `bludgeoning.png` | 39,485 | `b17584dd59210120fa09cbc333f3ec9b` |
| `burn.png` | 35,558 | `631099fcf9ebaa1c0a78e7a938172d7b` |
| `cold.png` | 38,003 | `ff6c4549c634009ce3f9305ab03961f2` |
| `corruption.png` | 38,254 | `ffb0931be6e49631e4d872bcb25f4995` |
| `discovery_star.png` | 24,390 | `f3b83d185e9f0464ff858fc8f8d5d5ec` |
| `electrical.png` | 37,038 | `9ad83968d6e29bc070bce86219bec61c` |
| `piercing.png` | 35,022 | `072491bfa2bbc58d49c5ec3d1a18ab2d` |
| `poison.png` | 36,483 | `cbad75e459bcf8e0e8352d6c2b841e8f` |
| `radiation.png` | 34,498 | `30e4a145853c1b3caef6a81bc7a85d0f` |
| `slashing.png` | 31,871 | `0993dfc5175467746dcbc9d4056f26a9` |

The discovery star is **not** a damage family. The pack's own note: *"It indicates
that the current weapon delivers a damage/coating type that is a discovered
weakness of the enemy."* It is exported separately so nothing that iterates the
damage types can pick up a verdict by mistake.

## ⚠ Two names have no file, but only `stun` falls back

`weaponGlyphs.BASE_DAMAGE_GLYPH` carries **thirteen** types. This pack draws
**eleven**. `degradation` (⚙) and `stun` (✱) have no image of their own.

But `glyphArt()` **canonicalises before it looks up**, and OTA-1652 aliases
`degradation → acid` — so a degradation weapon resolves the *acid* artwork and
never reaches the fallback. That is correct, because it matches the character
path exactly: OTA-1667 recorded that "even a weapon that authored degradation
would print ⚗, never ⚙". The artwork inherits the aliasing from sharing
`canonicalDamageType` rather than re-deciding it.

So **`stun` is the one genuine hole**, and it falls back rather than vanishing:
both surfaces paint ✱. No catalog weapon deals stun today (OTA-1667 measured all
301), but "unreachable today" is not "impossible tomorrow", and a weapon authored
with a stun base must show something rather than an empty box.

## ⚠⚠ These are opaque RGB, and that is worth knowing before judging them

All twelve are **PNG colour type 2 — RGB with no alpha channel.** They are
full-bleed illustrated tiles: measured, the ink spans the whole frame
(bounding box 0–100% horizontally, 1–98% vertically) and the border ring
averages luminance 13–47, so the edge carries artwork rather than a flat black
frame.

Two consequences, stated rather than discovered later:

- The UI-side black box **is** gone. `InputBox`'s `#0d0b09` cell and its black
  halo do not sit behind the artwork, and the Lore cell has no ground either.
  Owner: *"Remove the remaining black box/background behind the weapon icons."*
- But because there is **no alpha**, each icon is still an opaque rectangle of
  its own dark artwork against the chip. That edge is in the pixels, not in the
  UI, and it cannot be removed here without recolouring the art — which the pack
  forbids (*"Do not tint/recolor these PNGs"*). If the owner wants the marks to
  float on the chip rather than sit on their own ground, that needs alpha
  versions from the source, not a code change.

The previous trial set was mixed — seven full-bleed tiles and three objects on
transparency — and reported as reading like "two icon systems". This set is
uniform, which resolves that observation.

## Resolution

**128px ships.** One runtime resolution, chosen by measurement rather than by
habit: the largest displayed size is Lore's 28dp, which is 84 device pixels on a
3× phone. A 64px source would upscale 1.31× and go soft; 128 downsamples and
stays sharp at both 28dp and combat's 18dp on any density. The whole family is
436 KB, against the 20 MB of faction crests `app.json` already bundles.

`art/13-combat-glyphs/` keeps the 128 / 256 / 512 sets and the 512 masters,
tracked in git and outside the `assets/**/*` tree the bundler ships, so the phone
carries one resolution rather than four.

Per-file source provenance — which generated image each icon was cropped from,
and the crop box — is in `art/13-combat-glyphs/SOURCE_AUDIT.txt`.

## Status

**PROVISIONAL pending actual-device approval of size and spacing.** The artwork
is approved; the two displayed sizes are this pass's measured proposal and are
one number each in `GLYPH_ART_SIZE`.

## Retired by this pass

`assets/damage/` — the nine OTA-1763 trial icons (`impact`, `rupture`, `heat`,
`galvanic`, `noxious`, `resonance`, `cold`, `radiation`, `environmental`) and
`app/engine/damageIcons.ts`, the trial's table. They keyed **ten invented
concepts** rather than the game's damage vocabulary, because OTA-1763
deliberately refused to bind artwork to game types and left that binding open as
an owner decision. The owner closed it by supplying files named for the game's
own types, so both the concepts and the table that held them are gone.

The custom Tartaria thunderstorm commissioned for `environmental` (OTA-1764) has
no counterpart in this pack's vocabulary. Its masters are **kept** in
`art/12-damage-icons/` — tracked, unbundled — because deleting them would destroy
the only copy of a commissioned asset. Nothing in `app/` reads them.
