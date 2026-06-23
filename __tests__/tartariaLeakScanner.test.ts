// engine_Dev — TARTARIA LEAK SCANNER (the automated version of "I keep seeing
// Tartaria bleed through"). It counts hardcoded Tartaria proper nouns that live
// INSIDE STRING LITERALS in engine/state/screen source — i.e. the player-facing
// bleed, not comments (cosmetic) or functional ids (aether_shape, the 'aetheric'
// damage type). The build FAILS if any file grows or a new file introduces a bleed,
// so the only direction is DOWN. As content is surgically extracted to JSON/data and
// the engine pointed at it, lower the baseline numbers below to lock the progress in.
//
// Goal: drive BASELINE_TOTAL → 0 = the engine carries no hardcoded setting content.

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const NOUNS_G = /Tartar|Aether|Etheric|Reclaimer|Mud Monarch|Mud Dweller|Forgotten Order|Mudstone|Aetherstone|Bog Dragon/g;

// Count noun occurrences that sit inside a quoted string on a line, honoring a
// line-comment (//) start outside strings. Block comments are stripped by scanFile.
function countInStrings(code: string): number {
  let inStr = false, quote = '', buf = '', n = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inStr) {
      if (c === quote) { inStr = false; n += (buf.match(NOUNS_G) ?? []).length; buf = ''; }
      else buf += c;
    } else if (c === '"' || c === "'" || c === '`') { inStr = true; quote = c; buf = ''; }
    else if (c === '/' && code[i + 1] === '/') break;
  }
  return n;
}

function scanFile(file: string): number {
  let inBlock = false, n = 0;
  for (let line of fs.readFileSync(file, 'utf8').split('\n')) {
    let code = line;
    if (inBlock) { const e = code.indexOf('*/'); if (e < 0) continue; code = code.slice(e + 2); inBlock = false; }
    code = code.replace(/\/\*.*?\*\//g, '');
    const b = code.indexOf('/*'); if (b >= 0) { code = code.slice(0, b); inBlock = true; }
    if (code.trim().startsWith('//')) continue;
    n += countInStrings(code);
  }
  return n;
}

// Per-file baseline (captured 2026-06-22). RATCHET: these may only ever go DOWN.
const BASELINE: Record<string, number> = {
  'app/state/gameStore.ts': 150, 'app/engine/mainQuest.ts': 85, 'app/engine/itemAliases.ts': 55,
  'app/engine/hooks.ts': 49,
  // elevatedOverlay.ts extracted to app/data/overlays/elevated-overlays.json (45 → 0).
  // salvagePools.ts extracted to app/data/salvage/salvage-pools.json (41 → 0).
  // powers.ts: DEFAULT_POWERS extracted to app/data/powers/default-powers.json (24→0).
  'app/engine/powers.ts': 0, 'app/engine/coreGuardians.ts': 23,
  // extracted to app/data/: digging.ts (18→0), scrapEngine.ts (15→0).
  // whispers.ts: the yulka chain DATA extracted to app/data/whispers/builtin-whispers.json (9→0).
  'app/engine/areaSearch.ts': 13, 'app/engine/whispers.ts': 0,
  // golems.ts: built-in defs extracted to app/data/summons/builtin-sidekicks.json (8→0).
  'app/engine/character.ts': 9, 'app/engine/golems.ts': 0, 'app/engine/titles.ts': 7,
  'app/engine/raceAbilities.ts': 6, 'app/engine/contentPack.ts': 6, 'app/engine/buriedSkyscraper.ts': 0,
  // buriedSkyscraper floor flavors genericized; itemFusion adjective pools + dog-vest
  // example name genericized (5→0 each).
  'app/engine/climbHeight.ts': 5, 'app/engine/itemFusion.ts': 0, 'app/engine/dogCompanion.ts': 0,
  'app/screens/TitleScreen.tsx': 4, 'app/screens/ExplorationScreen.tsx': 4, 'app/screens/CraftingScreen.tsx': 0,
  'app/screens/DeveloperSettingsScreen.tsx': 4, 'app/engine/raceMechanics.ts': 3, 'app/engine/combatRules.ts': 3,
  'app/engine/portability.ts': 2, 'app/engine/narrativeGenerator.ts': 2, 'app/engine/crafting.ts': 2,
  'app/engine/hunts.ts': 2, 'app/engine/encounter.ts': 2, 'app/engine/locationChallenges.ts': 0,
  // FACTION_COVETED_ITEM map extracted to app/data/factions/coveted-items.json (2→0).
  'app/engine/itemEffect.ts': 2, 'app/screens/AboutScreen.tsx': 2, 'app/screens/ActionReferenceScreen.tsx': 2,
  // investigate LLM prompt now uses getNarratorPersona()/getWorldSetting() (1→0);
  // hookPuzzles vault-tumbler intro genericized (1→0).
  'app/engine/statTraining.ts': 1, 'app/engine/investigationTable.ts': 0, 'app/engine/vendors.ts': 1,
  'app/engine/itemDefaults.ts': 1, 'app/engine/hookPuzzles.ts': 0, 'app/engine/sceneNounMaterial.ts': 1,
  'app/engine/arbiterKnowledge.ts': 1, 'app/engine/buildings.ts': 1, 'app/screens/MapScreen.tsx': 1,
  'app/screens/VendorScreen.tsx': 1, 'app/screens/EndingScreen.tsx': 1,
};
const BASELINE_TOTAL = Object.values(BASELINE).reduce((a, c) => a + c, 0);

function candidateFiles(): string[] {
  const out = execSync(
    'grep -rlE "Tartar|Aether|Etheric|Reclaimer|Mud Monarch|Mud Dweller|Forgotten Order|Mudstone|Aetherstone|Bog Dragon" app/engine app/state app/screens --include=*.ts --include=*.tsx',
    { encoding: 'utf8', cwd: path.resolve(__dirname, '..') },
  ).trim();
  return out ? out.split('\n') : [];
}

describe('Tartaria leak scanner — hardcoded setting strings only shrink', () => {
  const root = path.resolve(__dirname, '..');
  const counts: Record<string, number> = {};
  for (const f of candidateFiles()) {
    const n = scanFile(path.join(root, f));
    if (n > 0) counts[f] = n;
  }
  const total = Object.values(counts).reduce((a, c) => a + c, 0);

  test(`total is at or below baseline (now ${total} / baseline ${BASELINE_TOTAL})`, () => {
    expect(total).toBeLessThanOrEqual(BASELINE_TOTAL);
  });

  test('no file exceeds its baseline, and no NEW file introduces a bleed', () => {
    const violations: string[] = [];
    for (const [f, n] of Object.entries(counts)) {
      const base = BASELINE[f];
      if (base === undefined) violations.push(`NEW bleed file: ${f} (${n}) — extract to JSON or add to baseline if unavoidable`);
      else if (n > base) violations.push(`${f} grew: ${base} → ${n}`);
    }
    expect(violations.join('\n') || 'clean').toBe('clean');
  });

  test('progress: list files whose count dropped (so the baseline can be tightened)', () => {
    const dropped = Object.entries(BASELINE)
      .filter(([f, base]) => (counts[f] ?? 0) < base)
      .map(([f, base]) => `${f}: ${base} → ${counts[f] ?? 0}`);
    if (dropped.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Tartaria extracted since baseline — tighten BASELINE for:\n' + dropped.join('\n'));
    }
    expect(true).toBe(true);
  });
});
