import vendorsData from '../data/npcs/vendors.json';

export interface VendorOffer {
  itemName: string;
  price: number;
}

export interface VendorTemplate {
  id: string;
  name: string;
  title: string;
  faction: string | null;
  description: string;
  offers: VendorOffer[];
  /** Per-NPC Kokoro voice id. Authored per vendor in vendors.json
   *  so each speaker sounds distinct on the bundled engine. The
   *  vendor's voice slot in the Kokoro pool is lazy-loaded by
   *  beginScene when the vendor enters the scene and disposed when
   *  the player walks away. */
  voiceId?: string;
  /** 'male' / 'female' — used as a hint for the system-TTS fallback
   *  and (eventually) for any gender-flavoured narration. */
  gender?: 'male' | 'female';
}

// A live vendor in the current scene. Carries a mutable offer list so
// items sold to the player disappear from the menu for the rest of the
// session at that scene.
export interface VendorInstance {
  id: string;
  name: string;
  title: string;
  faction: string | null;
  description: string;
  offers: VendorOffer[];
  voiceId?: string;
  gender?: 'male' | 'female';
}

export const VENDORS = (vendorsData as { vendors: VendorTemplate[] }).vendors;

// Random vendor pick. Used when a peaceful scene rolls a vendor encounter.
// Returns a fresh VendorInstance (mutable offers, decoupled from template).
export function pickRandomVendor(): VendorInstance {
  const v = VENDORS[Math.floor(Math.random() * VENDORS.length)]!;
  return {
    id: v.id,
    name: v.name,
    title: v.title,
    faction: v.faction,
    description: v.description,
    offers: v.offers.map((o) => ({ ...o })),
    voiceId: v.voiceId,
    gender: v.gender,
  };
}

// Look up a vendor by display name. Used by the hub system to spawn
// the anchored NPC for a given hub room (Halem the Trader at the gate,
// Irma Ironhand at the armory, etc.). Returns a fresh VendorInstance
// or null if no template matches.
export function findVendorByName(name: string): VendorInstance | null {
  const lowered = name.toLowerCase();
  const v = VENDORS.find((vt) => vt.name.toLowerCase() === lowered);
  if (!v) return null;
  return {
    id: v.id,
    name: v.name,
    title: v.title,
    faction: v.faction,
    description: v.description,
    offers: v.offers.map((o) => ({ ...o })),
    voiceId: v.voiceId,
    gender: v.gender,
  };
}
