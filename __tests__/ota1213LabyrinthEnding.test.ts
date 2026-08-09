// OTA-1213 — PUNCHLIST P13 CLOSED. The Labyrinth of Shadows has an ending.
//
// ⚠ WHAT IT WAS. Reaching the maze's heart on a CLEAN run printed one line and ticked the
// Wayfarer counter. **Any other run printed two lines and nothing else** — no TC, no item,
// no progress — and the run object was discarded. A maze walked with one wrong turn paid
// exactly what a maze walked with nine paid. On a challenge P5 confirmed is live.
//
// Owner: *"we need an ending to p13 the labyrinth. it should already award a title, make it
// have a lore enriching ending."*
//
// ⚠⚠ THE LORE WAS ALREADY IN THE DATA. `locations.json` on Iskan-Veil: *"a maze of false
// doors and overlaid corridors. Every map of Iskan-Veil is wrong by design."* And
// `concepts.json` names its Core's job among the nine: **masking**. So the reveal is the
// answer to what the place IS — the labyrinth is not a puzzle guarding the Core, it is the
// Core still working.

import { isCleanRun, LABYRINTH, startRun } from '../app/engine/labyrinth';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const STORE = SRC('app/state/gameStore.ts');

// The ending block, bounded by its own landmarks rather than a fixed slice.
const ENDING = (() => {
  const i = STORE.indexOf('OTA-1213 (PUNCHLIST P13) — THE MAZE HAS AN ENDING NOW');
  const j = STORE.indexOf('if (res.deadEnd)', i);
  return STORE.slice(i, j);
})();

describe('OTA-1213 — the ending exists and fires for EVERY finish', () => {
  test('the block is present and bounded', () => {
    expect(ENDING.length).toBeGreaterThan(500);
  });

  test('⚠⚠ the reveal is NOT gated on a clean run — that was the defect', () => {
    // The lore beats must sit outside the `if (clean)` branch. If they ever move inside it,
    // an imperfect run goes back to paying two lines and nothing.
    const cleanBranch = ENDING.indexOf('if (clean) {');
    const reveal = ENDING.indexOf('if (!heartSeen) {');
    const closeClean = ENDING.indexOf('recordTitleProgress');
    expect(cleanBranch).toBeGreaterThan(-1);
    expect(closeClean).toBeGreaterThan(cleanBranch);
    expect(reveal).toBeGreaterThan(closeClean);
  });

  test('the Wayfarer title still rides the CLEAN run only', () => {
    const i = ENDING.indexOf('if (clean) {');
    const j = ENDING.indexOf('} else {', i);
    expect(ENDING.slice(i, j)).toContain('labyrinthCleanRuns: 1');
  });

  test('⚠ and the "walk it cleaner" steer now comes AFTER the ending, not instead of it', () => {
    const reveal = ENDING.indexOf('if (!heartSeen) {');
    const steer = ENDING.indexOf("You found the center, not the path");
    expect(steer).toBeGreaterThan(reveal);
  });
});

describe('⚠⚠ OTA-1213 — ONCE per character. A repeatable maze must not be a farm.', () => {
  test('the maze really is re-enterable — the premise for the gate', () => {
    // If an attempt gate ever appears on enterLabyrinth this test should fail and the
    // once-only flag revisited, rather than silently guarding nothing.
    const i = STORE.indexOf("/\\b(labyrinth|maze)\\b/i.test(trimmed)");
    expect(i).toBeGreaterThan(-1);
    const gate = STORE.slice(STORE.lastIndexOf('if (', i), i + 200);
    expect(gate).not.toContain('challengeAttempts');
  });

  test('the reveal and the keepsake are gated on labyrinthHeartSeen', () => {
    expect(ENDING).toContain('const heartSeen = !!getStore().player?.labyrinthHeartSeen;');
    expect(ENDING).toContain('if (!heartSeen) {');
    expect(ENDING).toContain('labyrinthHeartSeen: true,');
  });

  test('⚠ a repeat visit still says something, but pays nothing', () => {
    const i = ENDING.lastIndexOf('} else {');
    const tail = ENDING.slice(i);
    expect(tail).toContain('The still chamber again');
    expect(tail).not.toContain('grantItem');
    expect(tail).not.toContain('recordMemorableEvent');
  });

  test('⚠ the title counter is safe to re-tick — its threshold is >= 1', () => {
    const titles = SRC('app/engine/titles.ts');
    expect(titles).toMatch(/p\.labyrinthCleanRuns >= 1/);
  });
});

describe('OTA-1213 — the keepsake', () => {
  test('it is quest-tagged, so it can never be sold, gifted, scrapped or fused', () => {
    expect(ENDING).toContain("tags: ['quest', 'story', 'keepsake', 'lore']");
  });

  test('⚠⚠ a full pack does not silently eat it', () => {
    // The one artifact of the ending disappearing without a word is the ends-in-nothing
    // defect in miniature. The grant is checked and the failure is spoken.
    expect(ENDING).toContain('if (grant.accepted > 0)');
    expect(ENDING).toContain('Your pack is full');
  });

  test('the ending is recorded as a memorable event', () => {
    expect(ENDING).toContain("kind: 'labyrinth_heart'");
    expect(ENDING).toContain("locationId: 'iskan_veil'");
  });
});

describe('⚠ OTA-1213 — the lore matches the data it came from', () => {
  test('Iskan-Veil really is the Architects’ masking capital', () => {
    // The reveal asserts two facts about the world. If the source data ever changes, this
    // fails and the narration gets revisited rather than quietly becoming wrong.
    // ⚠ locations.json is a bare ARRAY, not `{ locations: [...] }`. The first version
    // assumed the wrapper and died on `undefined.find` — a reminder that a data shape is
    // worth reading rather than guessing, even for a one-line assertion.
    const locs = JSON.parse(SRC('app/data/locations/locations.json')) as
      { id: string; description?: string }[];
    const iv = locs.find((l) => l.id === 'iskan_veil')!;
    expect(iv).toBeDefined();
    expect(iv.description).toMatch(/Every map of Iskan-Veil is wrong by design/);
    expect(SRC('app/data/lore/concepts.json')).toMatch(/Iskan-Veil \(masking\)/);
  });

  test('the challenge is still live, or none of this is reachable', () => {
    const lc = SRC('app/engine/locationChallenges.ts');
    expect(lc).toMatch(/TIER_C_ENABLED\s*=\s*true/);
    expect(lc).toContain('labyrinth_of_shadows');
  });

  test('the maze engine still defines a finish to reach', () => {
    expect(LABYRINTH.finish).toHaveLength(2);
    expect(isCleanRun(startRun())).toBe(false); // a fresh run has not finished
  });
});
