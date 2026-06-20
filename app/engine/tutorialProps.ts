// engine_Dev — tutorial prop resolver. The opening tutorial teaches verbs by
// handling concrete props (take a weapon, take a rope, salvage an armor piece).
// Those props used to be hardcoded Tartaria items (Cudgel / Reclaimer's Rope /
// Broken Chest Plate). This resolves them from the LIVE tables instead, so a
// re-skinned game teaches with its own items (e.g. take a .38 Revolver, salvage
// a flak vest). Falls back to the built-in names when nothing suitable exists.

import { resolveTable } from './contentPack';
import { WEAPONS, ARMOR, GEAR, EXPLORATION } from './crafting';
import { isOversized } from './portability';

interface Row { name?: string; rarity?: string; tags?: string[] }

export interface TutorialProps {
  /** A sensible starter weapon (the "cudgel" beat). */
  weapon: string;
  /** A climbing / rope item (the "rope" beat — needed for the climb beat). */
  rope: string;
  /** A salvageable armor piece (the "scrap" beat). */
  armor: string;
}

function rows(table: readonly unknown[]): Row[] {
  return (table as Row[]).filter((r) => r && typeof r.name === 'string');
}

function pickCommon(table: Row[], pred?: (r: Row) => boolean): Row | undefined {
  const ok = pred ? table.filter(pred) : table;
  return ok.find((r) => r.rarity === 'Common') ?? ok[0] ?? table[0];
}

export function getTutorialProps(): TutorialProps {
  const weapons = rows(resolveTable('weapons', WEAPONS as unknown[]));
  const armors = rows(resolveTable('armor', ARMOR as unknown[]));
  const gear = rows(resolveTable('gear', GEAR as unknown[]));
  const expl = rows(resolveTable('exploration', EXPLORATION as unknown[]));

  const weapon = pickCommon(weapons, (r) => !isOversized(r.name as string))?.name ?? 'Cudgel';
  const ropeRow = [...gear, ...expl].find(
    (r) => (r.tags ?? []).some((t) => /rope|climb/i.test(String(t))) || /rope/i.test(r.name as string),
  );
  const rope = ropeRow?.name ?? "Reclaimer's Rope";
  const armor = pickCommon(armors)?.name ?? 'Broken Chest Plate';

  return { weapon, rope, armor };
}

/** Replace {weapon} / {rope} / {armor} in a tutorial string with the resolved
 *  prop names. No-op for strings without a placeholder. */
export function fillTutorialPlaceholders(text: string): string {
  if (!text || !text.includes('{')) return text;
  const p = getTutorialProps();
  return text
    .replace(/\{weapon\}/g, p.weapon)
    .replace(/\{rope\}/g, p.rope)
    .replace(/\{armor\}/g, p.armor);
}
