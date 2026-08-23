# Feed action chips — the `entry.meta` payload contract

**Status:** spec only. Nothing in this document is implemented.
**Scope:** one trailing, tappable chip appended to the newest feed entry.

---

## 1. Why the payload is not in the text

The obvious design is a token in the prose — `You pry a mail hauberk from the wreck. [equip_item:mail_hauberk]` — and the renderer strips it. That design is wrong here, and the reason is specific to this codebase rather than general taste.

`GameLogEntry.text` is not display-only. The same string is consumed by:

- **TTS routing.** The Arbiter's voice reads feed text. A token in the string is a token spoken aloud, and the failure is silent — it only shows up on a device with narration on.
- **The copy-all bug-report export.** `aboutSummary.ts` ships feed text into the report the owner pastes back. Tokens there corrupt the one instrument used to diagnose everything else.
- **The playtest harness**, which grades the feed the player reads against `HIDDEN_LOG_CHANNELS`.

Three consumers, none of which would fail loudly. So the payload rides on `entry.meta`, which already exists precisely for this:

```ts
export interface GameLogEntry {
  id: string;
  ts: number;
  channel: LogChannel;
  text: string;
  meta?: Record<string, unknown>;
}
```

`meta` already carries `combatOutcome` and `storyBeat` — both presentation flags deliberately kept off `LogChannel`, because the channel drives TTS routing, hidden-channel filtering and the export, and a presentation change must alter none of those. A chip is the same kind of thing.

**Rule: nothing that affects how an entry LOOKS may be encoded in `text` or in `channel`.**

---

## 2. The payload

```ts
/** A single trailing action chip on a feed entry. Presentation only:
 *  it must never be the ONLY route to the action it offers. */
export interface FeedActionChip {
  /** Discriminator. Adding a kind is adding a case to the renderer's
   *  switch AND to the reachability gate below — both, or neither. */
  kind: 'equip_from_ground';

  /** Button copy, already resolved. The renderer does no interpolation:
   *  a string the engine did not author is a string no test can pin. */
  label: string;

  /** Screen-reader sentence. Required, not optional — the EXIT chip
   *  shipped without one for months and no test could tell. */
  a11yLabel: string;

  /** The scene noun, exactly as `gatherChips` carries it. NOT an item id:
   *  the take path resolves nouns, and a second identifier is a second
   *  thing that can drift out of sync. See §3. */
  noun: string;

  /** Stable per entry, for testID and for dedupe across re-renders. */
  chipId: string;
}
```

Carried as `meta.actionChip?: FeedActionChip`. One chip per entry, not an array — see §5.

---

## 3. Why `noun`, and not an item id

The action this chip performs already exists, atomically, and has since OTA-1237 (`ExplorationScreen.tsx:2343`):

```ts
const wear = isUpgradeOverEquipped(player, noun) ? upgradeEquipSlot(player, noun) : null;
takeAmbientNoun(noun);
if (wear) {
  const held = useGameStore.getState().player?.inventory ?? [];
  if (held.some((i) => i.name.toLowerCase() === wear.name.toLowerCase() && i.quantity > 0)) {
    useGameStore.getState().equipItem(wear.name, wear.slot);
  }
}
```

Two properties of that block are load-bearing and the chip must inherit both:

1. **The slot comes from the same catalog lookups the ★ mark does**, so a row cannot advertise an upgrade and then have nowhere to put it.
2. **The equip is gated on the take having actually landed.** `takeAmbientNoun` refuses by *logging*, not by throwing — a full pack, an already-worked-over noun. Equipping regardless answers one refusal with a second one ("I don't see it on you") for a player who did nothing wrong.

The chip therefore calls this path with a noun. It does not reimplement it, and it does not carry an item id that would have to be kept consistent with the noun the take path resolves. **One identifier, one resolver.**

---

## 4. Where the chip may appear — the scroll constraint

`AdventureFeed.tsx` auto-scrolls unconditionally:

```ts
const handleAutoScroll = () => { scrollRef.current?.scrollToEnd({ animated: true }); };
useEffect(() => { handleAutoScroll(); }, [visible.length]);
// ...
<ScrollView onContentSizeChange={handleAutoScroll} …>
```

This is yank-to-bottom by deliberate choice, not sticky-to-bottom (OTA 026 reverted the `isNearBottom` gate after a playtester lost her death to a full climb and three investigates and *"had to keep scrolling down"*).

Consequence:

- **A chip on the newest entry is safe.** The feed is already at the bottom; adding height there scrolls to a position the player is already looking at.
- **A chip injected into, or expanded within, a historic entry is not.** It changes content height, `onContentSizeChange` fires, and the feed yanks to bottom under the player's thumb mid-read.

**Rule: chips append to the newest entry only. A chip is never added to an entry that is not currently last, and a chip never changes size after first render.**

This also rules out an expanding/confirming chip. If a chip needs confirmation, it opens the existing modal — it does not grow in place.

---

## 5. One chip per entry

An array invites a row of chips, a row of chips wraps, wrapping changes height, and §4 forbids height changes. It also reintroduces the OTA-1454 problem one layer down: several same-weight buttons in a line, none ranked.

If a beat genuinely offers two actions, it is a picker, and the picker already exists.

---

## 6. The property that decides whether this ships

**A chip must never be the only route to the action it offers.**

The feed scrolls. A chip that scrolls off is gone, and if it was the only way to equip that hauberk then the game offered something once and withdrew it silently — which is OTA-1402's failure (*the-game-knows-and-does-not-say*) wearing new clothes.

So the chip is an **accelerator for an action already reachable** through the gather picker. Concretely: a chip may only be emitted for a noun that is live in `gatherChips` at emit time — the same array `parserHint` reads for exactly the same reason (OTA-1455). If the picker would refuse it, the feed cannot offer it.

---

## 7. The gate

Per the standing test rule, the pins are on the claims, not the labels. A test that matches chip copy breaks the next time the copy improves — that is what took out four pins in OTA-1455.

| # | Claim | Fails when |
|---|---|---|
| 1 | No chip payload appears in `entry.text` for any emit site | someone encodes a token in prose |
| 2 | Every emitted `kind` has a renderer case **and** a reachability entry | a kind is added in one place only |
| 3 | Chips are emitted only for nouns live in `gatherChips` | §6 is violated |
| 4 | The chip's action routes through the OTA-1237 block, not a copy | the atomic path is reimplemented |
| 5 | The equip is gated on the take landing | the refusal-on-refusal bug returns |
| 6 | `a11yLabel` is non-empty for every emit site | a chip ships mute |
| 7 | Chip attaches only to the last visible entry | §4 is violated |
| 8 | Removing the chip leaves every action still reachable | §6 is violated by deletion |

Test 8 is the one that matters most and the easiest to forget: it is proof **by removal**, the same discipline every fix this month has been held to. Delete the chip feature entirely and no action becomes unreachable — if that is not true, the chip has quietly become load-bearing UI.

Tests 2 and 3 belong in the CI gate rather than in jest, alongside `check:verbreach`, and for the reason that script was rebuilt: an instrument that cannot distinguish ABSENT from UNRESOLVED reports confident nonsense. Whatever scans emit sites must self-check against a known-good set and exit non-zero on contradiction.

---

## 8. Open questions

1. **Does a chip persist across a screen change?** The feed survives; the scene may not. A chip whose noun is in a room the player has left must render disabled or not at all, and "not at all" changes height (§4). Leaning disabled, greyed, matching the picker's consumed-row treatment.
2. **Does the chip echo into the player log** the way a typed command does? Consistency says yes; it also means a tap produces two entries and a scroll.
3. **TTS:** the chip label is not in `text`, so it is not spoken. Is a chip a thing a narration-only player should be told about?
