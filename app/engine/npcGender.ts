// ⚠ OTA-1440 — WHO IS "HE" AND WHO IS "SHE", from the one place that already
// knows: vendors.json has carried a `gender` field on all 30 authored vendors
// since before this OTA, unread by anything. This is its first reader.
//
// ⚠ NULL IS AN ANSWER, NOT A GAP. Wanderers, roadside traders, escort leaders
// and hub NPCs record no gender, and the authored constructs are 'neutral' on
// purpose — a Core Guardian is an it-shaped they. Every consumer treats null as
// "use the neutral text", which is the exact text every player has always seen,
// so nothing changes for anyone the data does not explicitly describe.
//
// Keyed by the AUTHORED id because npcLedgerId passes authored vendor ids
// through unchanged (the `return id` fallthrough) — so the ledger id the talk
// system carries IS the vendors.json id for everyone in this table, and the
// minted ids (roadside:/wanderer:/escort:) simply miss, which is correct.

import vendorsData from '../data/npcs/vendors.json';
import type { NpcGender } from './flourish';

interface VendorRow { id?: string; gender?: string }

const rows: VendorRow[] = Array.isArray(vendorsData)
  ? (vendorsData as VendorRow[])
  : ((vendorsData as { vendors?: VendorRow[] }).vendors ?? []);

const GENDER_BY_ID: Readonly<Record<string, NpcGender>> = Object.fromEntries(
  rows
    .filter((v): v is VendorRow & { id: string } => !!v.id && (v.gender === 'male' || v.gender === 'female'))
    .map((v) => [v.id, v.gender as NpcGender]),
);

/** The recorded gender for an NPC id, or null — never a guess. */
export function npcGenderFor(npcId: string | null | undefined): NpcGender | null {
  return npcId ? GENDER_BY_ID[npcId] ?? null : null;
}

/** Every id with a recorded gender. Exported for the parity test. */
export function genderedNpcIds(): string[] {
  return Object.keys(GENDER_BY_ID);
}
