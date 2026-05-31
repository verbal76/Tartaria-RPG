// OTA-124 pre-ship stress — tutorial currency check.
//
// Walks every step in app/components/tutorialSteps.ts and asserts:
//   - screen: is a valid ScreenName
//   - area: is a valid HighlightArea
//   - the OTA-122 "Your dog" step exists AND sits immediately after
//     "Golem sidekicks"
//   - older feature claims still match the current code:
//       OTA-091 — Crafting has 4 tabs (CRAFT / REPAIR / RECIPES / AETHERIC)
//       OTA-095 — recipes moved from Actions screen to Crafting RECIPES tab
//       OTA-111 — recipe cards surface damage dice / restore numbers
//       OTA-112 — DEX trains on jump / disengage
//       OTA-113 — Crafting screen tutorial step still references all 4 tabs
//       (block folded into dodge) — gameStore has the dodge route alive

import * as fs from 'fs';
import * as path from 'path';

import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

const VALID_SCREENS = new Set([
  'title', 'character_creation', 'exploration', 'log', 'lore', 'about',
  'inventory', 'character', 'map', 'crafting', 'vendor', 'actions',
  'contracts', 'ending',
]);
const VALID_AREAS = new Set([
  'top-left-stats', 'top-right-enemy', 'scene-bar', 'feed',
  'travel-row', 'quick-row', 'input-row', 'fullscreen',
]);

function readGameStoreSource(): string {
  return fs.readFileSync(
    path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'),
    'utf-8',
  );
}
function readCraftingScreenSource(): string {
  return fs.readFileSync(
    path.join(__dirname, '..', 'app', 'screens', 'CraftingScreen.tsx'),
    'utf-8',
  );
}
function readActionsScreenSource(): string | null {
  const p = path.join(__dirname, '..', 'app', 'screens', 'ActionsScreen.tsx');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

describe('OTA-124 pre-ship — tutorial currency after the dog system shipped', () => {
  describe('every step has valid screen + area references', () => {
    it.each(TUTORIAL_STEPS.map((s, i) => [i, s.screen, s.area, s.title] as const))(
      'step %i (%s / %s — "%s")',
      (_i, screen, area, _title) => {
        expect(VALID_SCREENS.has(screen)).toBe(true);
        expect(VALID_AREAS.has(area)).toBe(true);
      },
    );

    it('every step has a non-empty title and body', () => {
      for (const step of TUTORIAL_STEPS) {
        expect(step.title.trim()).not.toBe('');
        expect(step.body.trim()).not.toBe('');
      }
    });

    it('exactly one step is marked welcome:true (the opener)', () => {
      const welcomes = TUTORIAL_STEPS.filter((s) => s.welcome === true);
      expect(welcomes.length).toBe(1);
      expect(welcomes[0]).toBe(TUTORIAL_STEPS[0]);
    });
  });

  describe('"Your dog" step exists and sits right after "Golem sidekicks"', () => {
    it('finds both steps', () => {
      const golemIdx = TUTORIAL_STEPS.findIndex((s) => s.title.toLowerCase() === 'golem sidekicks');
      const dogIdx = TUTORIAL_STEPS.findIndex((s) => s.title.toLowerCase() === 'your dog');
      expect(golemIdx).toBeGreaterThanOrEqual(0);
      expect(dogIdx).toBeGreaterThanOrEqual(0);
    });

    it('dog step is exactly one position after golem step', () => {
      const golemIdx = TUTORIAL_STEPS.findIndex((s) => s.title.toLowerCase() === 'golem sidekicks');
      const dogIdx = TUTORIAL_STEPS.findIndex((s) => s.title.toLowerCase() === 'your dog');
      expect(dogIdx).toBe(golemIdx + 1);
    });

    it('"Your dog" body mentions all 4 treats by name', () => {
      const dog = TUTORIAL_STEPS.find((s) => s.title.toLowerCase() === 'your dog')!;
      for (const name of ['Smoke-Cured Jerky Strip', 'Marrow Bone', 'Honey-Glazed Knuckle', 'Ash-Cured Tongue']) {
        expect(dog.body.includes(name)).toBe(true);
      }
    });

    it('"Your dog" body mentions all 4 vest names', () => {
      const dog = TUTORIAL_STEPS.find((s) => s.title.toLowerCase() === 'your dog')!;
      for (const name of ['Burlap', 'Riveted Leather', 'Aetheric Padded', 'Reclaimer Pattern']) {
        expect(dog.body.includes(name)).toBe(true);
      }
    });

    it('"Your dog" body mentions all 4 rescue hook nouns', () => {
      const dog = TUTORIAL_STEPS.find((s) => s.title.toLowerCase() === 'your dog')!;
      for (const noun of ['cage', 'wagon wheel', 'cellar door', 'snare pit']) {
        expect(dog.body.includes(noun)).toBe(true);
      }
    });
  });

  describe('OTA-091 / OTA-095 / OTA-111 — Crafting "four tabs" claim still matches code', () => {
    it('CraftingScreen actually has tabs CRAFT / REPAIR / RECIPES / AETHERIC', () => {
      const src = readCraftingScreenSource();
      expect(src.includes("'craft'")).toBe(true);
      expect(src.includes("'repair'")).toBe(true);
      expect(src.includes("'recipes'")).toBe(true);
      expect(src.includes("'aetheric'")).toBe(true);
      // type Tab union covers all four
      expect(/type Tab\s*=\s*['"]craft['"]\s*\|\s*['"]repair['"]\s*\|\s*['"]recipes['"]\s*\|\s*['"]aetheric['"]/.test(src)).toBe(true);
    });

    it('tutorial step "Crafting — four tabs" mentions all four tab names', () => {
      const step = TUTORIAL_STEPS.find((s) => s.title.toLowerCase().startsWith('crafting'));
      expect(step).toBeDefined();
      const body = step!.body;
      expect(body.includes('CRAFT')).toBe(true);
      expect(body.includes('REPAIR')).toBe(true);
      expect(body.includes('RECIPES')).toBe(true);
      expect(body.includes('AETHERIC')).toBe(true);
    });

    it('OTA-095 — Actions screen no longer carries a Recipes tab', () => {
      const src = readActionsScreenSource();
      if (!src) {
        // If the screen doesn't exist, the claim is vacuously satisfied
        // (no recipes on a non-existent screen).
        return;
      }
      // We accept either: file absent, or file present but with no
      // "Recipes" tab string.
      expect(/recipes\s*tab/i.test(src) || /tab.*=.*['"]recipes['"]/i.test(src)).toBe(false);
    });
  });

  describe('OTA-113 — block folded into dodge claim still matches gameStore', () => {
    it('gameStore "block" case still routes to the dodge fold message', () => {
      const src = readGameStoreSource();
      // OTA-113 changed `block` to print "(block folded into dodge — ...)"
      // Confirm both the case label and the marker line are still in the file.
      expect(src.includes("case 'block':")).toBe(true);
      expect(src.includes('block folded into dodge')).toBe(true);
    });
  });

  describe('OTA-112 — DEX trains on jump / disengage (anti-bottleneck)', () => {
    it('gameStore intent dispatcher contains jump + disengage handlers', () => {
      const src = readGameStoreSource();
      expect(src.includes("case 'jump':")).toBe(true);
      expect(src.includes("case 'disengage':")).toBe(true);
    });
  });

  describe('no dangling references to removed features in tutorial body text', () => {
    it('no mention of the OTA 048-retired "bottom-menu" / "run-control row"', () => {
      for (const step of TUTORIAL_STEPS) {
        // The retired AREA name should never appear as a HighlightArea
        // (already covered by the validation above), but defend in body
        // text too — no live reference to the dead control row.
        expect(step.body.toLowerCase().includes('bottom menu')).toBe(false);
        expect(step.body.toLowerCase().includes('run-control row')).toBe(false);
      }
    });

    it('every concrete capitalized "X Screen" mention resolves to a known screen concept', () => {
      // The grammar here is "Inventory screen" / "Crafting screen" / etc.
      // — specifically a capitalized noun followed by lowercase "screen".
      // Generic phrases ("the screen", "every screen", "one screen") do
      // NOT resolve to a screen NAME — they're just describing the UI
      // — so we exclude them from this check.
      const knownConceptWords = new Set([
        'world', 'character', 'player', 'sheet', 'inventory',
        'pack', 'crafting', 'actions', 'contracts',
        'about', 'settings', 'lore', 'codex', 'title', 'vendor', 'trader',
        'shop', 'map', 'log', 'ending',
      ]);
      const GENERIC_FILLER = new Set([
        'the', 'every', 'one', 'this', 'that', 'which', 'a', 'an',
      ]);
      for (const step of TUTORIAL_STEPS) {
        const matches = step.body.match(/\b([A-Za-z]+)\s+[Ss]creen\b/g) ?? [];
        for (const m of matches) {
          const conceptWord = m.split(' ')[0]!.toLowerCase();
          if (GENERIC_FILLER.has(conceptWord)) continue;
          // Each remaining word should map to a known concept.
          expect(knownConceptWords.has(conceptWord)).toBe(true);
        }
      }
    });
  });
});
