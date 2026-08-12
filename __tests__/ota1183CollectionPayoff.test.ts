// OTA-1183 — PUNCHLIST P1 CLOSED. A completed collectible set now pays out.
//
// ⚠ WHAT IT WAS. 57 fragments across 10 character stories — the largest gather loop in the
// game — and finishing one flipped a pill style and printed a banner on a screen the
// player had to navigate to. No reward, no title, no notification at the moment it
// happened. The owner could not describe what completing a set did, which was the symptom.
//
// ⚠ THE PAYOFF IS THE OWNER'S DESIGN, NOT MINE (2026-08-09), and the punch list exists
// precisely so I catalogue rather than invent:
//
//   *"they should end in story screen like the chapters screens that put the whole story
//   together to read, and it should say whatever the collectable sets name is is complete.
//   you should get a title for completing all of them, some types of historian title, and
//   it should add an investigate all button like the take all and salvage all."*
//
// Four parts, and this suite pins each one to that sentence.

import {
  storyCompletedBy,
  completedStoryCount,
  assembledStory,
  CHARACTER_STORIES,
} from '../app/engine/collectables';
import { EMPTY_TITLE_PROGRESS, WIRED_TITLES } from '../app/engine/titles';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const firstStory = CHARACTER_STORIES[0]!;
const allFragmentIds = CHARACTER_STORIES.flatMap((s) => s.fragments.map((f) => f.id));

describe('OTA-1183 — set completion is detected exactly once', () => {
  test('the closing fragment reports the story it closed', () => {
    const ids = firstStory.fragments.map((f) => f.id);
    const before = ids.slice(0, -1);
    const closer = ids[ids.length - 1]!;
    const done = storyCompletedBy(closer, before);
    expect(done).not.toBeNull();
    expect(done!.id).toBe(firstStory.id);
  });

  test('a non-closing fragment reports nothing', () => {
    const ids = firstStory.fragments.map((f) => f.id);
    expect(storyCompletedBy(ids[0]!, [])).toBeNull();
  });

  test('⚠ re-granting a fragment already owned closes nothing', () => {
    // Otherwise the completion screen and the title bump could fire twice off one set —
    // the loop paying out more than once is its own kind of broken.
    const ids = firstStory.fragments.map((f) => f.id);
    expect(storyCompletedBy(ids[ids.length - 1]!, ids)).toBeNull();
  });

  test('an unknown fragment id is safe', () => {
    expect(storyCompletedBy('not_a_real_fragment', [])).toBeNull();
  });

  test('it returns the STORY, not a boolean', () => {
    // The screen and the log line both name the character. "Zalmar's story is complete"
    // reads as an event; "a story is complete" reads as a system message.
    const ids = firstStory.fragments.map((f) => f.id);
    const done = storyCompletedBy(ids[ids.length - 1]!, ids.slice(0, -1));
    expect(typeof done!.characterName).toBe('string');
    expect(done!.characterName.length).toBeGreaterThan(0);
  });
});

describe('OTA-1183 — the Historian title', () => {
  test('the counter tracks STORIES, not fragments', () => {
    expect(EMPTY_TITLE_PROGRESS.collectableStoriesCompleted).toBe(0);
    // ⚠ The 57 fragments are spread 5–7 per story. A fragment threshold would let the
    // title land before the last story closed.
    const sizes = CHARACTER_STORIES.map((s) => s.fragments.length);
    expect(Math.min(...sizes)).not.toBe(Math.max(...sizes));
  });

  test('completedStoryCount counts finished sets only', () => {
    expect(completedStoryCount([])).toBe(0);
    expect(completedStoryCount(firstStory.fragments.slice(0, 1).map((f) => f.id))).toBe(0);
    expect(completedStoryCount(firstStory.fragments.map((f) => f.id))).toBe(1);
    expect(completedStoryCount(allFragmentIds)).toBe(CHARACTER_STORIES.length);
  });

  test('⚠ the title needs ALL ten — nine is not enough', () => {
    const def = WIRED_TITLES.find((d) => d.id === 'historian_of_the_buried_world');
    expect(def).toBeDefined();
    const at = (n: number) => def!.earned(
      {} as never,
      { ...EMPTY_TITLE_PROGRESS, collectableStoriesCompleted: n },
    );
    expect(at(CHARACTER_STORIES.length - 1)).toBe(false);
    expect(at(CHARACTER_STORIES.length)).toBe(true);
  });

  test('it carries a perk, like every other title', () => {
    const def = WIRED_TITLES.find((d) => d.id === 'historian_of_the_buried_world')!;
    const acc = { loreBonus: 0, investigationBonus: 0 } as never as Parameters<NonNullable<typeof def.perk>>[0];
    def.perk!(acc);
    expect((acc as unknown as { loreBonus: number }).loreBonus).toBeGreaterThan(0);
  });

  test('⚠ it is registered in the canon title file, and flagged as an addition', () => {
    // `arbiter-titles.json` was ingested verbatim from the owner's docx and held exactly
    // 21, all wired. This is the 22nd and is NOT from that document — the entry says so,
    // so nobody later mistakes it for canon the owner wrote.
    const data = JSON.parse(SRC('app/data/lore/arbiter-titles.json')) as {
      titles: { id: string; title: string; note?: string }[];
    };
    const row = data.titles.find((t) => t.id === 'historian_of_the_buried_world');
    expect(row).toBeDefined();
    expect(row!.title).toBeTruthy();
    expect(row!.note ?? '').toMatch(/NOT from the original|owner instruction/i);
  });

  test('every engine title still has a data row, and vice versa', () => {
    const data = JSON.parse(SRC('app/data/lore/arbiter-titles.json')) as { titles: { id: string }[] };
    const dataIds = new Set(data.titles.map((t) => t.id));
    const engineIds = new Set(WIRED_TITLES.map((d) => d.id));
    // ⚠ A title in the engine with no data row has no display name; a data row with no
    // engine def can never be earned. Both are the "listed but doesn't work" defect.
    expect([...engineIds].filter((i) => !dataIds.has(i))).toEqual([]);
    expect([...dataIds].filter((i) => !engineIds.has(i))).toEqual([]);
  });
});

describe('OTA-1183 — the story screen shows only what was earned', () => {
  test('it assembles the fragments in author order', () => {
    const built = assembledStory(firstStory.id, firstStory.fragments.map((f) => f.id));
    expect(built).not.toBeNull();
    expect(built!.parts.map((p) => p.id)).toEqual(firstStory.fragments.map((f) => f.id));
  });

  test('⚠ it never returns a fragment the player does not hold', () => {
    // The screen renders `parts` directly. Reading from the catalog instead of the
    // player's list would hand over text that was never earned.
    const partial = firstStory.fragments.slice(0, 2).map((f) => f.id);
    const built = assembledStory(firstStory.id, partial);
    expect(built!.parts).toHaveLength(2);
    expect(built!.parts.every((p) => partial.includes(p.id))).toBe(true);
  });

  test('an unknown story id is safe', () => {
    expect(assembledStory('no_such_story', allFragmentIds)).toBeNull();
  });

  test('the overlay re-derives from the player list, not from the reveal', () => {
    const src = SRC('app/components/StoryRevealOverlay.tsx');
    expect(src).toContain("useGameStore((s) => s.player?.collectables)");
    expect(src).toContain('assembledStory(reveal.storyId, collectables ?? [])');
  });

  test('⚠ it does NOT dismiss on a stray tap, unlike the chapter card', () => {
    // The chapter card is a marker over narration already waiting underneath. This is the
    // thing the player spent 5–7 fragments earning; losing several pages of it to a thumb
    // while scrolling would be the loop ending in nothing all over again.
    const src = SRC('app/components/StoryRevealOverlay.tsx');
    expect(src).not.toMatch(/<Pressable[^>]*style=\{styles\.backdrop\}/);
    expect(src).toContain('accessibilityLabel="Close the story"');
  });

  test('it names the set, as instructed', () => {
    const src = SRC('app/components/StoryRevealOverlay.tsx');
    expect(src).toContain('{story.characterName}');
    expect(src).toMatch(/story is complete/);
  });

  test('openStoryReveal refuses an unfinished set', () => {
    // Reachable from anywhere; it must not depend on its caller being careful.
    const src = SRC('app/state/gameStore.ts');
    const i = src.indexOf('openStoryReveal(storyId)');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, i + 700);
    expect(body).toContain('built.parts.length !== built.story.fragments.length');
    expect(body).toContain('return;');
  });
});

describe('OTA-1183 — completion is announced where the player is looking', () => {
  const src = SRC('app/state/gameStore.ts');

  test('it fires through announceMissionComplete, not a quiet log line', () => {
    const i = src.indexOf('const finished = storyCompletedBy(fragmentId, owned);');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, i + 1600);
    expect(block).toContain('announceMissionComplete');
    expect(block).toContain("story is complete");
  });

  test('the title progress is recorded with the story count', () => {
    const i = src.indexOf('const finished = storyCompletedBy(fragmentId, owned);');
    const block = src.slice(i, i + 1600);
    expect(block).toContain('recordTitleProgress(get, set, { collectableStoriesCompleted: done })');
  });

  test('the story screen is raised', () => {
    const i = src.indexOf('const finished = storyCompletedBy(fragmentId, owned);');
    const block = src.slice(i, i + 1600);
    expect(block).toContain('set({ storyReveal: { storyId: finished.id } })');
  });

  test('⚠ the first-collectible tutorial cannot collide with the completion screen', () => {
    expect(src).toContain('if (totalOwned <= 1 && !finished)');
  });

  test('it is computed from the list BEFORE the grant', () => {
    // Computing it after would make every later fragment of a finished set re-fire the
    // whole payout.
    const i = src.indexOf('const finished = storyCompletedBy(fragmentId, owned);');
    const before = src.slice(Math.max(0, i - 1500), i);
    expect(before).toContain('const owned = player.collectables ?? [];');
  });
});

describe('OTA-1183 — INVESTIGATE ALL', () => {
  test('the button exists and mirrors the SALVAGE ALL threshold', () => {
    const src = SRC('app/components/SearchModal.tsx');
    expect(src).toContain('INVESTIGATE ALL ({actionableChips.length})');
    expect(src).toContain('actionableChips.length >= 2');
  });

  test('⚠ it sweeps only ACTIONABLE chips — never consumed, never locked', () => {
    // Sweeping a locked noun spends the tap on a refusal the player can already see
    // greyed with a 🔒 — the exact "the button didn't do anything" complaint SALVAGE ALL
    // collected in OTA-037.
    const src = SRC('app/components/SearchModal.tsx');
    expect(src).toContain('const actionableChips = visibleChips.filter((c) => !c.unmetRequirement)');
    expect(src).toContain('.filter((c) => !c.consumed)');
  });

  test('the count on the button is the count of things that will happen', () => {
    const src = SRC('app/components/SearchModal.tsx');
    expect(src).toContain('onInvestigateAll(actionableChips.map((c) => c.noun))');
  });

  test('⚠ it loops the REAL investigate path, adding no second resolver', () => {
    // Investigate resolves through hooks, ambient nouns, items, puzzles and elevation
    // gates. A bulk re-implementation would be a new set of failure modes; looping the
    // real submit cannot resolve differently from the manual taps it replaces.
    //
    // ⚠⚠ OTA-1236 — THE RULE IS UNCHANGED; THE LINE IT WAS PINNED TO MOVED. The loop
    // still calls the same `submit(\`investigate <noun>\`)` a manual tap makes — that
    // is the property this test exists to protect, and it still holds. What was added
    // around it is ORDER (ordinary nouns, then story hooks, then the dog rescue) and a
    // BREAK when an enemy appears, because the rescue spawns a captor and every
    // investigate queued behind it would land during combat and be refused. Neither
    // resolves anything; both decide what gets submitted and when to stop.
    const src = SRC('app/screens/ExplorationScreen.tsx');
    const i = src.indexOf('onInvestigateAll={(nouns) => {');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, i + 600);
    expect(block).toContain('submit(`investigate ${n}`)');
    // Still a loop over nouns, still no bulk resolver anywhere.
    expect(block).toMatch(/for \(const n of [A-Za-z]+\)/);
    expect(src).not.toContain('investigateAllAmbient');
  });
});
