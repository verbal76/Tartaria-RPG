# The illustrated damage icons — a trial, not a migration

**Wired in at OTA-1763**, into exactly one place: the trial block at the bottom of
the Lore cheat sheet (`app/components/WeaponGlyphKey.tsx`), reached from the
codex. `app/engine/damageIcons.ts` keys them by concept id.

**Status: PROVISIONAL — awaiting actual-device approval.** Nothing in live
combat, InputBox, the weapon buttons, inventory, weapon cards or the engine
reads this folder. The existing text glyph system (`engine/weaponGlyphs.ts`) is
untouched and still owns every production surface.

## Why this trial exists

The game paints damage as **text glyphs** today — `⚒ ▲ ✦ ⚔ 🔥 ⚡ ☠ ❄ ☢`. The
question is whether illustrated artwork reads better at the sizes the interface
actually uses. It is being asked on ONE surface first, on a real phone, before
anything commits.

⚠ **The two glyph surfaces are not the same size, and that was measured rather
than assumed** (OTA-1763's trace):

| | Lore cheat sheet | Live combat weapon button |
|---|---|---|
| where | `WeaponGlyphKey.cell` | `InputBox.coatGlyph` inside `quickText` |
| size | **15pt**, explicit | **12pt**, INHERITED — `coatGlyph` sets no `fontSize` |
| box | `width: 28`, fixed | **none** — inline `Text`, hair-space (` `) padded |
| cell | `#0d0b09`, radius 3 | `#0d0b09`, no radius |
| halo | `textShadowRadius: 3` | `textShadowRadius: 3` |

So combat renders its glyphs **20% smaller than the cheat sheet**, in an inline
text flow with no fixed box to put an image into. **This Lore trial is therefore
not a 1:1 proxy for combat** — approving artwork here does not by itself approve
it there, and the combat container is a separate design problem the owner has
explicitly deferred until the artwork is chosen.

## The nine files

Source resolution **64×64, 8-bit RGBA**, unmodified. The source pack IDs are
provenance only — runtime code never sees them, which is why the files were
renamed on the way in.

| Concept | Runtime file | Source ID | What the picture shows |
|---|---|---|---|
| Impact | `impact.png` | W50 | A one-handed mallet, wooden haft, dark head. No frame; sits on transparency. |
| Rupture | `rupture.png` | W193 | A heavy single-edged blade / machete. No frame; sits on transparency. |
| Heat | `heat.png` | 101 | A framed card: a figure engulfed in red flame. Light border. |
| Galvanic | `galvanic.png` | 298 | A framed card: blue lightning arcing across a limb. Light border. |
| Noxious | `noxious.png` | 98 | A green skull with rising fumes over discoloured flesh. |
| Resonance | `resonance.png` | 304 | A framed card: a white-blue burst breaking a cylinder. Light border. |
| Cold / Freezing | `cold.png` | 109 | A hand with frost-blackened, reddened fingers. |
| Radiation | `radiation.png` | 99 | A framed card: the yellow-green trefoil. Light border. |
| Gas / Fumes | *(reuses `noxious.png`)* | 98 | — see Noxious. Intentional for this trial. |
| Environmental | `environmental.png` | ⚠ **custom** — see below | A thunderstorm. Replaced L544 at OTA-1764. |

⚠ **Ten concepts, nine binaries.** Gas / Fumes deliberately points at
`noxious.png` rather than duplicating the bytes. That is the owner's
instruction for this trial, not an oversight.

## ⚠ Environmental was replaced — L544 is RETIRED

The first observation this trial reported was that `L544` *"reads as a container
/ kit, not as an environment or a hazard. Its silhouette is a rectangle."* The
owner agreed and rejected it: *"it visually reads as a suitcase/case rather than
an environmental hazard."*

| | |
|---|---|
| Source | **Custom Tartaria Environmental Thunderstorm** |
| Asset family | custom |
| Semantic filename | `environmental.png` — **unchanged** |
| Master resolutions | 64 / 128 / 256 / 512 |
| Runtime test resolution | **64×64** |
| Status | PROVISIONAL, pending actual-device visual approval |
| Retired | `L544`, no longer Environmental and not retained anywhere |

⚠ **This was an ASSET REPLACEMENT ONLY.** The semantic key, the mapping, the
Lore layout, the display-size experiment and live combat are all untouched —
`damageIcons.ts` was not edited at all, because the semantic filename did not
change. That is the architecture working: a correct art table means swapping a
picture is swapping a file.

⚠ **The 128 / 256 / 512 masters are NOT in this folder, on purpose.**
`app.json` bundles `assets/**/*` into the app, so a master sitting here would
ship four copies of one icon to a phone that only ever draws the 64. They live
in `art/12-damage-icons/` with the rest of the source art, which is tracked in
git and not bundled — the same split `art/README.md` describes for every other
family.

## ⚠ What the contact sheet showed, reported and NOT acted on

These observations are for the owner's visual call. Nothing here has been
changed, substituted or regenerated — the owner's rule was explicit: *"Do not
substitute, redraw, recolor, regenerate, or use placeholders"* and *"Do not
select the final size or replace questionable icons without asking me."*

1. **The set is not visually uniform.** Four of the nine (`heat`, `galvanic`,
   `resonance`, `radiation`) are **framed illustrated cards with a light
   border**. The other five (`impact`, `rupture`, `noxious`, `cold`,
   `environmental`) are **unframed objects on transparency**. Side by side at a
   small size these read as two different systems: little picture-cards next to
   floating props. This is the single most likely thing to need a decision.
2. **`cold.png` is a frostbitten hand, not an obvious cold symbol.** At 28pt its
   silhouette is a hand; "freezing" comes from the colour, which is the first
   thing to go when an image gets small.
3. **`environmental.png` reads as a container / kit**, not as an environment or
   a hazard. Its silhouette is a rectangle.
4. **`impact` and `rupture` depict WEAPONS, the other seven depict EFFECTS.**
   A mallet and a blade are the causes; flame, lightning and fumes are the
   results. Whether that mixture is a problem is a judgement about the game's
   vocabulary, not about the artwork's quality.

## The dark cell was removed, on the owner's call

Owner, on seeing the artwork render: *"if we have these I don't think we need the
black outline anymore. I like how those render."*

The `#0d0b09` inlay and the `textShadowRadius: 3` halo exist because a **text
glyph** is a bare single-colour shape that has to stay legible against whatever
the player has tuned the background to. **Illustrated artwork brings its own
ground**, so the inlay earned nothing for seven of the nine and was adding an
unasked-for black tile behind the three that sit on transparency. The trial box
stays — it is what keeps the three sizes aligned in their columns — only the
paint is gone.

⚠ The halo on the **text glyph rows above the trial**, and in **live combat**, is
untouched. Those are the glyphs it was written for, and they still need it.

## Eventual candidate surfaces

Recorded so the scope of this trial is unambiguous, and in the owner's order of
intent:

- the Lore cheat sheet (**this trial — the only wired surface today**)
- live combat weapon buttons (**deferred**; needs a new image container, because
  the current 12pt inline `Text` cannot take a PNG)
- damage / resistance displays

## The binding question, still open

The owner supplied *concept → file*. The **game's** damage vocabulary is a
different list — `engine/damageTypes.ts` canonicalises bludgeoning, slashing,
piercing, aetheric, radiation, stun, burn, cold, poison, acid, corruption,
degradation, electrical — and only two or three of the ten concepts share a name
with it. Deciding that `rupture` means slashing (or piercing, or both), that
`resonance` means aetheric (or stun), and what `gas` and `environmental` refer
to in the game at all, is a ruling about the game's own vocabulary rather than an
art question. It is deliberately not made in `damageIcons.ts`.
