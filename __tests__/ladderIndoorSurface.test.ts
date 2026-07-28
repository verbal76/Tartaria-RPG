// OTA-769 — an INDOOR micro-area (an enclosed structure / the buried underworld:
// the Giant-Kin Mausoleum, the catacombs) must not be handed to an OUTDOOR surface
// tile. Playtest: traveling open silt read "You're in Offering Antechamber, in
// Obsidian Pillars" with "into the Grand Hall" exits. Surface assignment now skips
// indoor micro-areas; DESCEND still reaches them.

import { pickRandomMicroMicroIn } from '../app/engine/worldLadder';

describe('OTA-769 — indoor micro-areas are surface-excluded', () => {
  it('an all-indoor macro (Aetherstone Deep) yields NO micro-area on the surface', () => {
    // Both of the Deep's micro-areas are indoor, so a surface tile there resolves to
    // no room — it reads as the outdoor location, not a mausoleum antechamber.
    expect(pickRandomMicroMicroIn('aetherstone_deep')).toBeNull();
  });

  it('descent (includeIndoor) still reaches the Deep\'s buried rooms', () => {
    const t = pickRandomMicroMicroIn('aetherstone_deep', undefined, { includeIndoor: true });
    expect(t).not.toBeNull();
    expect(['Aetheric Power Grid', 'Giant-Kin Mausoleum']).toContain(t!.micro.name);
  });

  it('a surface macro (Silt Wastes) still assigns an OUTDOOR micro-area on the surface', () => {
    const t = pickRandomMicroMicroIn('silt_wastes');
    expect(t).not.toBeNull();
    expect(t!.micro.indoor).toBeFalsy();
  });

  it('the Subterranean Empire is all-indoor on the surface too', () => {
    expect(pickRandomMicroMicroIn('subterranean_empire')).toBeNull();
    expect(pickRandomMicroMicroIn('subterranean_empire', undefined, { includeIndoor: true })).not.toBeNull();
  });
});
