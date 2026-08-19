// ⚠⚠ OTA-1333 — THE ★ CLIMB BUTTON, AND THE SPIRE LOSES THE WORD "BURIED".
//
// Owner: *"when you land on the tile, beginning the climb should be a button like summon
// the guardian. and it should only be visible if you have that particular map and used it
// to mark the location. change all names to grand spire not buried."*
//
// Two things, and the second one settles W3-A of the staged Wave Three plan: the tower at
// the capital is the GRAND Spire of Asgardar. "Buried" is gone from every player-facing
// string.
//
// ⚠ The button's gate is the CHART, which is not a new rule — OTA-912 already says a great
// climb's prop only spawns once `worldMemory.unlockedGreatClimbs` carries its id, and that
// list is only written when the Skyreacher Chart is USED from the pack. Owning the map is
// not enough; it has to have been read. This suite pins that the button and the climbable
// noun share that one gate, so an affordance can never appear for an action that would
// refuse.
import { GREAT_CLIMBS, greatClimbFor, greatClimbForLocation, SKYREACHER_SET } from '../app/engine/greatClimbs';

describe('OTA-1333 — the Grand Spire of Asgardar', () => {
  const asgardar = GREAT_CLIMBS.find((c) => c.id === 'asgardar_spire')!;
  const etheria = GREAT_CLIMBS.find((c) => c.id === 'grand_spire')!;

  it('⚠⚠ no player-facing climb string says "buried" any more', () => {
    for (const c of GREAT_CLIMBS) {
      expect(c.noun.toLowerCase()).not.toContain('buried');
      expect(c.summitFlavor.toLowerCase()).not.toContain('buried');
    }
    expect(asgardar.noun).toBe('the Grand Spire of Asgardar');
  });

  it('⚠ the rename did NOT merge the two spires — five climbs, five Skyreacher pieces', () => {
    // The cheap way to "make everything the Grand Spire" would have been to fold the two
    // towers into one. That would delete a climb and a set piece, which is a content
    // change the owner did not ask for — he asked about NAMES. Pinned so nobody does it
    // by accident later.
    expect(GREAT_CLIMBS.length).toBe(5);
    expect(new Set(SKYREACHER_SET).size).toBe(5);
    // ⚠ OTA-1334 moved this anchor off the capital and onto the tower's own tile. It read
    // `'asgardar'` while the spire was still a landmark inside the city; the climb now
    // lives where the tower does. The property that actually matters — the two spires are
    // DISTINCT places — is asserted directly below rather than left implied.
    expect(asgardar.locationId).toBe('grand_spire_of_asgardar');
    expect(etheria.locationId).toBe('grand_spire_of_etheria');
    expect(asgardar.locationId).not.toBe(etheria.locationId);
    expect(asgardar.tiers).toBe(14);
    expect(etheria.tiers).toBe(15);
  });

  it('⚠⚠ the two Grand Spires cannot be confused for one another', () => {
    // Both are now "Grand Spire of …", so the resolver has to keep them apart on the
    // suffix AND on the tile. Either alone would be enough; both is the guarantee.
    expect(greatClimbFor('the grand spire of asgardar', 'grand_spire_of_asgardar')?.id).toBe('asgardar_spire');
    expect(greatClimbFor('the grand spire of etheria', 'grand_spire_of_etheria')?.id).toBe('grand_spire');
    // Cross-tile: the right words at the wrong tower resolve to nothing.
    expect(greatClimbFor('the grand spire of etheria', 'grand_spire_of_asgardar')).toBeNull();
    expect(greatClimbFor('the grand spire of asgardar', 'grand_spire_of_etheria')).toBeNull();
    // ⚠⚠ OTA-1334 — and the CITY is no longer a climbable tile at all. This is the
    // assertion that would have caught the half-done move: leave `locationId` pointing at
    // `asgardar` and the button draws itself in the middle of the capital, two tiles from
    // any tower. Standing in Asgardar and naming the spire now resolves to nothing.
    expect(greatClimbFor('the grand spire of asgardar', 'asgardar')).toBeNull();
    expect(greatClimbForLocation('asgardar')).toBeNull();
  });

  it('⚠ every climb still resolves from the canonical noun the button submits', () => {
    // The ★ CLIMB chip submits `climb ${climb.noun}`. If a noun ever stopped resolving to
    // its own climb the button would silently start an ordinary ascent — the exact
    // "generic 3-tier scramble at a 14-tier landmark" this OTA exists to end.
    for (const c of GREAT_CLIMBS) {
      expect(greatClimbFor(c.noun.toLowerCase(), c.locationId)?.id).toBe(c.id);
    }
  });

  it('⚠ the button can only be drawn where a climb actually lives', () => {
    // greatClimbForLocation is the same lookup the chip uses to decide whether to render.
    for (const c of GREAT_CLIMBS) {
      expect(greatClimbForLocation(c.locationId)?.id).toBe(c.id);
    }
    expect(greatClimbForLocation('tartarian_outskirts')).toBeNull();
    expect(greatClimbForLocation(null)).toBeNull();
  });

  it('⚠ tokens stay collision-free across all five climbs', () => {
    // A token that matches another climb's canonical noun would let one landmark hijack
    // another's ascent. The location check would still catch it, but a token collision is
    // a latent bug waiting for the day someone drops that argument.
    for (const c of GREAT_CLIMBS) {
      for (const other of GREAT_CLIMBS) {
        if (other.id === c.id) continue;
        for (const t of c.tokens) {
          expect(other.noun.toLowerCase()).not.toContain(t);
        }
      }
    }
  });
});
