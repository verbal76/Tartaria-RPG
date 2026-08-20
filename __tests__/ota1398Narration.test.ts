/**
 * OTA-1398 — SLICE 7: narration and the Arbiter's voice leave gameStore.
 *
 * ~1,250 lines to `app/ai/narration.ts` — everything that decides whether the
 * local model writes a line instead of the authored template, what it is allowed
 * to say, whether the line it produced is still true by the time it arrives, and
 * how often the Arbiter may speak unasked.
 *
 * ⚠⚠ THE FIRST SLICE THAT HAD TO MOVE THINGS DOWN BEFORE IT COULD MOVE ITSELF —
 * three of them, in one OTA, all for the same reason: each is read by the
 * narration path AND by gameStore. `playerIsSprinting` and the visible-log
 * counter carry mutable state, so they could not travel with either owner
 * (assigning to an imported binding is a compile error). `playerGridCell` is
 * pure, but it has twenty-four call sites in the store, so importing it back
 * from the leaf would have been the same cycle in the other direction.
 *
 * ⚠⚠ AND `cancelGeneration` STILL DID NOT MOVE — the plan said it would, and
 * measuring says it should not. It has carried a note since slice 2 reading
 * "it travels with the narration slice", because it mutates
 * `arbiterGenerationEpoch`. But slice 7 is a LEAF, not a slice: it takes no deps
 * and holds no store actions, and a leaf cannot hold one. The epoch has TWO
 * writers, so it moved DOWN behind accessors and the action stayed an action.
 * Fifth time in seven slices that measuring has corrected the plan.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

/** ⚠ Strip comments before asserting a name is ABSENT. Both files below explain
 *  at length the very imports they are forbidden to make, so a raw match flags
 *  the explanation as the violation — the trap this repo has paid for more than
 *  once. Presence checks read the raw text; absence checks read this. */
const codeOnly = (t: string): string => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const store = src('app', 'state', 'gameStore.ts');
const narr = src('app', 'ai', 'narration.ts');
const sprint = src('app', 'state', 'sprint.ts');
const grid = src('app', 'state', 'playerGrid.ts');
const counter = src('app', 'state', 'visibleLogCount.ts');

describe('OTA-1398 — narration moved, whole', () => {
  it.each([
    'narrateViaArbiter',
    'maybeGenerateAmbientArbiter',
    'fillMusingBank',
    'takeAmbientStamp',
    'ambientStaleReason',
    'takeBankedMusing',
    'takeBankedSceneIntro',
    'introBankKey',
    'introPrefetchCandidates',
    'takeArbiterFlavorBudget',
    'inScriptedTutorialPhase',
  ])('%s lives in the leaf, not in gameStore', (fn) => {
    expect(narr).toMatch(new RegExp(`^export (async )?function ${fn}\\(`, 'm'));
    expect(store).not.toMatch(new RegExp(`^(export )?(async )?function ${fn}\\(`, 'm'));
  });

  it('⚠⚠ every piece of narration state travelled with it', () => {
    // Ten `let`s and two module-scope collections. If one had stayed, the two
    // copies would drift: a bank that fills in one file and is read from another
    // reads as "the intro sometimes repeats" and nothing else.
    for (const name of [
      'arbiterGenerationEpoch',
      'lastQwenGenStartMs',
      'lastAmbientGenStartMs',
      'lastArbiterFlavorAt',
      'arbiterFlavorTile',
      'arbiterFlavorThisTile',
      '_narrationAllowStatic',
    ]) {
      expect(narr).toMatch(new RegExp(`^let ${name}\\b`, 'm'));
      expect(store).not.toMatch(new RegExp(`^let ${name}\\b`, 'm'));
    }
    for (const name of ['musingBank', 'sceneIntroBank']) {
      expect(narr).toMatch(new RegExp(`^(export )?const ${name}\\b`, 'm'));
      expect(store).not.toMatch(new RegExp(`^(export )?const ${name}\\b`, 'm'));
    }
  });

  it('⚠⚠ the leaf imports NO VALUE from the store', () => {
    // The rule every slice follows. A value import back compiles, passes a
    // one-sided unit test, and resolves to `undefined` on a device.
    for (const line of narr.split('\n')) {
      if (!/from\s+['"]\.\.\/state\/gameStore['"]/.test(line)) continue;
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
    expect(codeOnly(narr)).not.toMatch(/\buseGameStore\b/);
  });

  it('⚠ what STAYED stayed for a reason, not by accident', () => {
    // Three things sat inside the moved range and are not narration: the
    // story-beat meta flag (used at six appendLog sites across the store), the
    // accept-CHA cooldown, and the dog-vest loot roll. Extracting them because
    // they were nearby would have been the opposite of measuring.
    for (const kept of ['STORY_BEAT_META', 'trainAcceptCharismaGated', 'rollDogVestLootName']) {
      expect(store).toContain(kept);
      expect(narr).not.toMatch(new RegExp(`^(export )?(const|function) ${kept}\\b`, 'm'));
    }
  });
});

describe('OTA-1398 — three things had to move DOWN first', () => {
  it('⚠⚠ the sprint detector went to a module neither owner holds', () => {
    // gameStore reads it (the vendor-voice warm, the action pipeline) and so
    // does the narration leaf (the sprint gate). It carries a `let`.
    expect(existsSync(path('app', 'state', 'sprint.ts'))).toBe(true);
    expect(sprint).toMatch(/^let sprintActionTimes/m);
    expect(store).not.toMatch(/^let sprintActionTimes/m);
    expect(narr).not.toMatch(/^let sprintActionTimes/m);
    expect(store).toContain("from './sprint';");
    expect(narr).toContain("from '../state/sprint';");
  });

  it('⚠⚠ the visible-log counter did too, and it is the clearest case', () => {
    // `appendLog` WRITES it; the ambient staleness stamp READS it. Two owners,
    // one `let` — it cannot live in either.
    expect(existsSync(path('app', 'state', 'visibleLogCount.ts'))).toBe(true);
    expect(counter).toMatch(/^let visibleLogLines = 0;/m);
    expect(counter).toContain('export function noteVisibleLogLine(): void {');
    expect(counter).toContain('export function visibleLogTotal(): number {');
    expect(store).toContain('noteVisibleLogLine();');
    expect(narr).toContain('visibleLogTotal()');
    expect(store).not.toMatch(/_playerVisibleLogCount\s*\+=/);
  });

  it('⚠ …and the channel gate stayed at the CALL SITE, deliberately', () => {
    // The caller is the only thing that knows the channel. Pushing that
    // decision down would have made a counter import the log types to make a
    // judgement it has no other reason to know about.
    expect(store).toContain("if (channel !== 'debug' && channel !== 'cognitive') noteVisibleLogLine();");
    expect(codeOnly(counter)).not.toContain('cognitive');
  });

  it('⚠⚠ playerGridCell moved for the OPPOSITE reason — no state, too many callers', () => {
    // It is pure, so nothing forced it. But narration needs it and so do
    // twenty-four sites in the store, and a leaf may not import a value back.
    expect(existsSync(path('app', 'state', 'playerGrid.ts'))).toBe(true);
    expect(grid).toContain('export function playerGridCell(');
    expect(store).not.toMatch(/^export function playerGridCell\(/m);
    expect(store).toContain("from './playerGrid';");
    expect(narr).toContain("from '../state/playerGrid';");
    expect(grid).not.toMatch(/^let /m);   // still pure
  });

  it('⚠ each of the three is a LEAF — none of them reaches back into the store', () => {
    for (const body of [sprint, grid, counter]) {
      expect(body).not.toMatch(/from\s+['"]\.\/gameStore['"]/);
      expect(codeOnly(body)).not.toMatch(/\buseGameStore\b/);
    }
  });
});

describe('OTA-1398 — cancelGeneration, and the plan being wrong about it', () => {
  it('⚠⚠ it is STILL a store action, and the epoch moved instead', () => {
    // Slice 2 left it behind with a note saying it would travel with the
    // narration slice. Slice 7 is a leaf, and a leaf cannot hold a store action.
    expect(store).toMatch(/^  cancelGeneration\(\) \{/m);
    expect(narr).not.toMatch(/cancelGeneration\(\)\s*\{/);
  });

  it('⚠⚠ the epoch has TWO writers, so it went DOWN behind accessors', () => {
    // A fresh narration bumps it; cancelGeneration bumps it to discard one in
    // flight. Exactly the shape the memory latches had in slice 5.
    expect(narr).toMatch(/^let arbiterGenerationEpoch = 0;/m);
    expect(narr).toContain('export function bumpArbiterGeneration(): void {');
    expect(store).toContain('bumpArbiterGeneration();');
    expect(store).not.toContain('arbiterGenerationEpoch++');
  });

  it('⚠ the accessor surface is two functions, and says to keep it that way', () => {
    expect(narr).toContain('Keep this surface at two.');
  });
});

describe('OTA-1398 — four test seams could not follow the code they test', () => {
  it('⚠⚠ they stayed in gameStore because their bodies READ the store', () => {
    // Each was `theRealThing(() => useGameStore.getState())` — a value read of
    // the store, which is the one import a leaf may never make. Their job IS
    // "call the real thing with the live store", so the store is where they go.
    for (const seam of [
      '_takeAmbientStampForTest',
      '_ambientStaleReasonForTest',
      '_takeBankedMusingForTest',
      '_takeBankedSceneIntroForTest',
    ]) {
      expect(store).toContain(`export function ${seam}(`);
      expect(narr).not.toContain(`export function ${seam}(`);
    }
  });

  it('⚠ …and the real things are exported so the wrappers are one line each', () => {
    for (const fn of ['takeAmbientStamp', 'ambientStaleReason', 'takeBankedMusing', 'takeBankedSceneIntro']) {
      expect(narr).toMatch(new RegExp(`^export function ${fn}\\(`, 'm'));
    }
  });

  it('⚠⚠ no test call site changed — the addresses other files use are re-exported', () => {
    // 473 files import from gameStore. A move that renamed what they import
    // would be a different change wearing this one's clothes.
    for (const name of ['narrateViaArbiter', 'sceneIntroBank', 'INTRO_BANK_PER_LOC', 'playerGridCell']) {
      expect(store).toContain(name);
    }
    expect(store).toContain('export function _playerVisibleLogTotal(): number { return visibleLogTotal(); }');
  });
});

describe('OTA-1398 — seven slices in', () => {
  it('gameStore is under 41,800 lines', () => {
    // 45,050 → 44,891 → 44,816 → 44,160 → 43,542 → 43,281 → 42,956 → here.
    expect(store.split('\n').length).toBeLessThan(41800);
  });

  it('⚠ storeSource still reads the store and its slices ONLY', () => {
    // Second slice running where a move DOWN is invisible to it, and the answer
    // is the same: the suites that need the leaf name the leaf at their own call
    // site. A helper that reads wherever the code went would make every pin in
    // this repo unfalsifiable, which its own header says at length.
    const h = src('test-utils', 'storeSource.ts');
    expect(h).not.toContain('narration');
    expect(h).not.toContain('diagnostics');
    expect(h).toContain('WHEN NOT TO USE IT');
  });
});
