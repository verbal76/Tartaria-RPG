// Tutorial currency check — refreshed for the Tungsten Spire rewrite.
//
// The old OTA-124 version of this file asserted the pre-Tungsten tutorial
// shape (a single 3-step welcome array + a ~28-step per-system tour that
// included "Golem sidekicks", "Your dog", "Crafting — four tabs", etc.).
// Tungsten Spire replaced TUTORIAL_STEPS with a 10-beat in-feed play loop
// and trimmed TUTORIAL_DOCS_FULL down to a screen-orientation reference;
// the per-system pages were intentionally dropped (those systems now
// teach themselves at their trigger sites via FirstTimeHint). This file
// is updated to lock in the NEW structure and to guard the thing that
// actually matters: every play-loop beat must have an advancement trigger
// so the tutorial can't stall.

import * as fs from 'fs';
import * as path from 'path';

import { TUTORIAL_STEPS, TUTORIAL_DOCS_FULL } from '../app/components/tutorialSteps';

const VALID_SCREENS = new Set([
  'title', 'character_creation', 'exploration', 'log', 'lore', 'about',
  'inventory', 'character', 'map', 'crafting', 'vendor', 'actions',
  'contracts', 'ending',
]);
const VALID_AREAS = new Set([
  'top-left-stats', 'top-right-enemy', 'scene-bar', 'objective-chip', 'feed',
  'travel-row', 'quick-row', 'input-row', 'fullscreen',
]);

// The canonical 10-beat play loop, in order. This is the contract the
// gameStore state machine advances through.
const EXPECTED_BEAT_IDS = [
  // 'look' is taught FIRST — before the cudgel take — so the player learns the
  // "get your bearings / re-read the room" button before handling any prop.
  // Door-open branch (arb4): the old look / move_north / read_note beats
  // were replaced by a single explore_or_leave choice popup.
  'name', 'look', 'cudgel', 'rope', 'scrap', 'climb', 'investigate',
  'explore_or_leave', 'main_quest', 'pick_city',
] as const;

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
function readExplorationScreenSource(): string {
  return fs.readFileSync(
    path.join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'),
    'utf-8',
  );
}
function readActionsScreenSource(): string | null {
  const p = path.join(__dirname, '..', 'app', 'screens', 'ActionsScreen.tsx');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

describe('Tungsten Spire — tutorial play loop (TUTORIAL_STEPS)', () => {
  it.each(TUTORIAL_STEPS.map((s, i) => [i, s.screen, s.area, s.title] as const))(
    'step %i (%s / %s — "%s") has valid screen + area',
    (_i, screen, area, _title) => {
      expect(VALID_SCREENS.has(screen)).toBe(true);
      expect(VALID_AREAS.has(area)).toBe(true);
    },
  );

  it('every play-loop step has a non-empty title and body', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.trim()).not.toBe('');
      expect(step.body.trim()).not.toBe('');
    }
  });

  it('is exactly the 9 canonical beats, in order', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([...EXPECTED_BEAT_IDS]);
  });

  it('contains no welcome-card step (the play loop is diegetic, not a card tour)', () => {
    expect(TUTORIAL_STEPS.some((s) => s.welcome === true)).toBe(false);
  });

  it('only pick_city leaves the exploration screen (it routes to contracts)', () => {
    for (const step of TUTORIAL_STEPS) {
      if (step.id === 'pick_city') {
        expect(step.screen).toBe('contracts');
      } else {
        expect(step.screen).toBe('exploration');
      }
    }
  });

  it('the rope beat demos typed input (draftText pre-fills "take rope")', () => {
    const rope = TUTORIAL_STEPS.find((s) => s.id === 'rope')!;
    expect(rope.draftText).toBe('take rope');
    expect(rope.inputPulse).toBe(true);
  });
});

describe('Tungsten Spire — every beat has an advancement trigger (no-stall guard)', () => {
  // The state machine only moves when something calls
  // maybeAdvanceTutorial('<beatId>'). If a beat id is defined but never
  // triggered, the tutorial stalls there forever. Scan the two files
  // that drive it (gameStore intercepts most verbs; ExplorationScreen
  // owns the MAIN QUEST chip tap) and assert full coverage.
  const triggerSources =
    readGameStoreSource() + '\n' + readExplorationScreenSource();

  it.each(EXPECTED_BEAT_IDS.map((id) => [id] as const))(
    "beat '%s' is advanced by a maybeAdvanceTutorial() call",
    (beatId) => {
      expect(triggerSources.includes(`maybeAdvanceTutorial('${beatId}')`)).toBe(true);
    },
  );
});

describe('Tungsten Spire — Tutorial Replay reference (TUTORIAL_DOCS_FULL)', () => {
  it('every reference page has valid screen + area and non-empty copy', () => {
    for (const step of TUTORIAL_DOCS_FULL) {
      expect(VALID_SCREENS.has(step.screen)).toBe(true);
      expect(VALID_AREAS.has(step.area)).toBe(true);
      expect(step.title.trim()).not.toBe('');
      expect(step.body.trim()).not.toBe('');
    }
  });

  it('opens with exactly one welcome-card page', () => {
    const welcomes = TUTORIAL_DOCS_FULL.filter((s) => s.welcome === true);
    expect(welcomes.length).toBe(1);
    expect(welcomes[0]).toBe(TUTORIAL_DOCS_FULL[0]);
  });

  it('is the trimmed screen-orientation reference (per-system pages dropped)', () => {
    // The rewrite intentionally removed the old per-system tour pages.
    // Lock that in so a future edit re-adding them is a deliberate choice,
    // not an accident, and so the count can't silently balloon back.
    const titles = TUTORIAL_DOCS_FULL.map((s) => s.title.toLowerCase());
    for (const dropped of ['golem sidekicks', 'your dog', 'crafting']) {
      expect(titles.some((t) => t.startsWith(dropped))).toBe(false);
    }
  });
});

describe('Adjacent feature claims still match the code', () => {
  it('CraftingScreen still has tabs CRAFT / REPAIR / RECIPES / AETHERIC', () => {
    const src = readCraftingScreenSource();
    expect(src.includes("'craft'")).toBe(true);
    expect(src.includes("'repair'")).toBe(true);
    expect(src.includes("'recipes'")).toBe(true);
    expect(src.includes("'aetheric'")).toBe(true);
    expect(/type Tab\s*=\s*['"]craft['"]\s*\|\s*['"]repair['"]\s*\|\s*['"]recipes['"]\s*\|\s*['"]aetheric['"]/.test(src)).toBe(true);
  });

  it('OTA-095 — Actions screen no longer carries a Recipes tab', () => {
    const src = readActionsScreenSource();
    if (!src) return; // file absent → claim vacuously satisfied
    expect(/recipes\s*tab/i.test(src) || /tab.*=.*['"]recipes['"]/i.test(src)).toBe(false);
  });

  it('OTA-113 — gameStore "block" case still routes to the dodge fold message', () => {
    const src = readGameStoreSource();
    expect(src.includes("case 'block':")).toBe(true);
    expect(src.includes('block folded into dodge')).toBe(true);
  });

  it('OTA-112 — gameStore intent dispatcher contains jump + disengage handlers', () => {
    const src = readGameStoreSource();
    expect(src.includes("case 'jump':")).toBe(true);
    expect(src.includes("case 'disengage':")).toBe(true);
  });
});

describe('No dangling references to removed features in tutorial copy', () => {
  const allSteps = [...TUTORIAL_STEPS, ...TUTORIAL_DOCS_FULL];

  it('no mention of the OTA 048-retired "bottom-menu" / "run-control row"', () => {
    for (const step of allSteps) {
      expect(step.body.toLowerCase().includes('bottom menu')).toBe(false);
      expect(step.body.toLowerCase().includes('run-control row')).toBe(false);
    }
  });

  it('every concrete capitalized "X Screen" mention resolves to a known screen concept', () => {
    const knownConceptWords = new Set([
      'world', 'character', 'player', 'sheet', 'inventory',
      'pack', 'crafting', 'actions', 'contracts',
      'about', 'settings', 'lore', 'codex', 'title', 'vendor', 'trader',
      'shop', 'map', 'log', 'ending',
    ]);
    const GENERIC_FILLER = new Set([
      'the', 'every', 'one', 'this', 'that', 'which', 'a', 'an',
    ]);
    for (const step of allSteps) {
      const matches = step.body.match(/\b([A-Za-z]+)\s+[Ss]creen\b/g) ?? [];
      for (const m of matches) {
        const conceptWord = m.split(' ')[0]!.toLowerCase();
        if (GENERIC_FILLER.has(conceptWord)) continue;
        expect(knownConceptWords.has(conceptWord)).toBe(true);
      }
    }
  });
});
