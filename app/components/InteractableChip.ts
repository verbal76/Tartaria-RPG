// Shared chip shape for the per-room interactable lists in Search,
// Salvage, and Take modals. Each chip represents one ambient noun
// the player can tap to act on; `consumed` tells the modal the
// player has already used that noun in this room.
//
// Rendering rule shared across all three modals (per playtester
// spec 2026-05-21):
//   - alwaysShow=false (default) + consumed=true → chip is REMOVED
//     entirely from the list (rusted blade once taken, scrap pile
//     once salvaged, etc.)
//   - alwaysShow=true + consumed=true → chip stays in the list but
//     renders greyed + disabled. Used by 'the ground' in Search,
//     which is a permanent affordance per room even after digging.
//
// Implementing modals just need to filter `chips.filter(c =>
// !c.consumed || c.alwaysShow)` for what to render, and apply the
// greyed style when (c.consumed && c.alwaysShow).

export interface InteractableChip {
  /** The ambient noun the player taps to invoke (e.g. 'rusted blade',
   *  'scrap pile', 'the ground'). */
  noun: string;
  /** Already taken / salvaged / dug in this room. Drives the
   *  hide-vs-grey decision per the alwaysShow flag. */
  consumed: boolean;
  /** When true, the chip persists in the list even when consumed —
   *  rendered greyed + disabled. When false (default), consumed
   *  chips are removed from the list entirely. */
  alwaysShow?: boolean;
  /** OTA 195 — search-only. When set, this noun requires the
   *  player to equip the named item (or category — "Aether
   *  scanner") to search it. ExplorationScreen sets this when
   *  the player doesn't have the required tool equipped; the
   *  Search modal renders the chip grayed-with-tag, still
   *  tappable. Tapping fires the search verb anyway; the
   *  engine emits a "Equip X to search this" refusal. After
   *  the player equips the right tool, the chip is no longer
   *  marked unmetRequirement and renders normally green. */
  unmetRequirement?: string;
}
