/**
 * OTA-1691 — THE ROOM NAMES ITS DEAD. Step-4 mundane reader; the
 * narrative-agency audit's hole 3: `enemiesCleared` was written on every kill
 * and read only for the respawn quiet window; the one line that read it never
 * said whose bodies, and after the window nothing was said at all. One clause
 * writer (voicePools.clearedBodiesNote) rides the return line: the bodies are
 * named inside the window; the clearing is remembered as a fact after it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { clearedBodiesNote } from '../app/engine/voicePools';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1691 — the clause', () => {
  it('names the dead inside the quiet window, pluralised by the one pluraliser', () => {
    expect(clearedBodiesNote(['Mud Wasp'], true)).toBe(' The Mud Wasps you left are still here. Nothing has moved in to replace them.');
    expect(clearedBodiesNote(['Mud Harpy'], true)).toBe(' The Mud Harpies you left are still here. Nothing has moved in to replace them.');
  });

  it('remembers the clearing after the window, as a fact about the place', () => {
    expect(clearedBodiesNote(['Mud Wasp'], false)).toBe(' You cleared this place of Mud Wasps once; the floor has been swept since, one way or another.');
  });

  it('two names at most — the last two cleared — and nothing when the room holds no clears', () => {
    expect(clearedBodiesNote(['Mud Wasp', 'Reclaimer Ambusher', 'Mud Harpy'], true)).toBe(' The Reclaimer Ambushers and Mud Harpies you left are still here. Nothing has moved in to replace them.');
    expect(clearedBodiesNote([], true)).toBe('');
    expect(clearedBodiesNote(undefined, false)).toBe('');
    expect(clearedBodiesNote(['', 'Mud Wasp'], false).startsWith(' You cleared this place of Mud Wasps once')).toBe(true);
  });

  it('a hunted apex is one named beast, not a kind — the ledger tag never reaches the prose', () => {
    // The contrary walker read "You cleared this place of Bog Dragon (hunted)s once" on the
    // steeple and graded it as the apex standing up: the tag is a ledger key, not a word.
    expect(clearedBodiesNote(['Bog Dragon (hunted)'], false)).toBe(' You cleared this place of the Bog Dragon once; the floor has been swept since, one way or another.');
    expect(clearedBodiesNote(['Mud Harpy', 'Bog Dragon (hunted)'], true)).toBe(' The Mud Harpies and the Bog Dragon you left are still here. Nothing has moved in to replace them.');
    expect(clearedBodiesNote(['Bog Dragon (hunted)'], true).includes('(hunted)')).toBe(false);
  });
});

describe('OTA-1691 — the return line carries it', () => {
  const store = src('app', 'state', 'gameStore.ts');

  it('the one call site reads the room ledger and the quiet window, and rides the return line', () => {
    expect(store.includes('const clearedNote = clearedBodiesNote(existing.enemiesCleared, recentlyCleared);')).toBe(true);
    expect(store.includes('get().appendLog(\'world\', `${returnLine(existing.visitCount)}${clearedNote}`);')).toBe(true);
    // The old unnamed sentence is gone from the store; the clause has one home.
    expect(store.includes('The bodies you left are still here')).toBe(false);
  });

  it('the store stays under the line ratchet', () => {
    expect(store.split('\n').length).toBeLessThan(37000);
  });
});
