// OTA-1030 — THE PROMPT LEAKED INTO THE FEED. The owner, at Asgardar: "it said
// 'you walked beside the player a long while' twice back to back... it's like
// someone was talking to the arbitor." It was: that sentence is the literal
// opening of the ambient brief the game hands the local model
// (contextInjector AMBIENT_INSTRUCTION). The model recited its brief instead of
// answering it, and the LIVE STREAMING TAIL mirrors raw tokens to the screen —
// so the player read the prompt under "The Arbiter:" while the post-generation
// filters, which only ever see the FINAL text, correctly dropped it to nothing
// (the log shows `arbiter: ambient ∅`, a line the feed never recorded).
import * as fs from 'fs';
import * as path from 'path';
import { looksLikeInstructionEcho } from '../app/engine/foreignText';

describe('OTA-1030 — the echo detector catches the brief coming back', () => {
  it('catches the exact line the owner saw, in both tenses', () => {
    expect(looksLikeInstructionEcho('You have walked beside the player a long while.')).toBe(true);
    expect(looksLikeInstructionEcho('you walked beside the player a long while')).toBe(true);
  });

  it('catches the rest of the ambient brief, clause by clause', () => {
    const brief = [
      'Make ONE short, UNPROMPTED aside — a passing reflection on how far they have come.',
      'DO NOT narrate or react to their last action.',
      'ONE short sentence — about 18 words, no more.',
      'Speak as a companion who has travelled a long road at their side.',
      'Never repeat or restate any of these directions.',
      'Write in SECOND PERSON, present tense.',
      '[SYSTEM FACTS - DO NOT INVENT EXITS, ENEMIES, OR PLACE NAMES]',
    ];
    for (const clause of brief) {
      expect({ clause, echo: looksLikeInstructionEcho(clause) }).toEqual({ clause, echo: true });
    }
  });

  it('catches third-person recaps that call them "the player"', () => {
    expect(looksLikeInstructionEcho('The player paused at the threshold.')).toBe(true);
    expect(looksLikeInstructionEcho('The adventurer considers the door.')).toBe(true);
  });

  it('an empty stream is not an echo (the preview just has nothing yet)', () => {
    expect(looksLikeInstructionEcho('')).toBe(false);
  });
});

describe('OTA-1030 — and never fires on real narration (false-positive sweep)', () => {
  // Sweep every authored line the game actually speaks. If the detector flags
  // one of these, it would silently blank a legitimate Arbiter line — the exact
  // failure mode a guard like this must not have.
  const LORE_DIR = path.join(__dirname, '..', 'app', 'data', 'lore');
  const collect = (node: unknown, out: string[]): void => {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { for (const v of node) collect(v, out); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k.startsWith('_')) continue; // authoring notes, not spoken lines
        collect(v, out);
      }
    }
  };

  const FILES = [
    'arbiter-mood-quotes.json', 'arbiter-intent-quotes.json', 'ambient-flavor.json',
    'location-flavors.json', 'scene-flavors.json', 'mystery-seeds.json',
  ];

  for (const file of FILES) {
    it(`${file} — every authored line survives the guard`, () => {
      const full = path.join(LORE_DIR, file);
      const lines: string[] = [];
      collect(JSON.parse(fs.readFileSync(full, 'utf8')), lines);
      expect(lines.length).toBeGreaterThan(0);
      const flagged = lines.filter((l) => looksLikeInstructionEcho(l));
      expect(flagged).toEqual([]);
    });
  }

  it('hand-picked narration in the Arbiter\'s actual voice passes', () => {
    const real = [
      'The Arbiter looks around. "The Giants planned for everything except being remembered like this."',
      '"Eat something," the Arbiter says, almost gentle. "Stamina doesn\'t refill on grit. You\'ve got rations."',
      'The Arbiter watches the dust hang. "The room has not been disturbed in some time."',
      'You give the walking-staff your full attention. It returns the gesture by being exactly what it appears to be.',
      'The script is half-faded. Most of it is a name, or a list of names, or a debt no one paid.',
      'You have come a long way from the mud, and it still shows in your boots.',
    ];
    for (const line of real) {
      expect({ line, echo: looksLikeInstructionEcho(line) }).toEqual({ line, echo: false });
    }
  });
});

describe('OTA-1030 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  // ⚠ OTA-1398 — SLICE 7 re-pointed this, and did not relax it. The narration
  // path left gameStore for `app/ai/narration.ts`; the pins below read the file
  // that now owns them, plus gameStore for anything that stayed. Concatenating
  // the two is how ota1173/ota1175 already handle a subsystem that spans a seam.
  const store = read('app', 'state', 'gameStore.ts') + '\n' + read('app', 'ai', 'narration.ts');
  const injector = read('app', 'engine', 'contextInjector.ts');

  it('the ambient brief no longer opens with a narration-shaped sentence', () => {
    // The parrot bait: a complete second-person sentence in the very register
    // the model was being asked to produce.
    expect(injector).not.toMatch(/You have walked beside the player/);
    expect(injector).toMatch(/Speak as a companion who has travelled a long road/);
    expect(injector).toMatch(/Never repeat or restate any of these directions/);
  });

  it('BOTH streaming paths vet the live preview instead of mirroring raw tokens', () => {
    // The old shape read the store and appended blindly.
    expect(store).not.toMatch(/const current = get\(\)\.partialArbiterText \?\? '';/);
    // The new shape: local accumulator, guard, blank on trip. Two call sites —
    // the reactive narrator and the ambient companion.
    expect((store.match(/if \(looksLikeInstructionEcho\(streamed\)\) \{/g) ?? []).length).toBe(2);
    expect((store.match(/previewBlocked = true;/g) ?? []).length).toBe(2);
  });

  it('both final filter chains drop an echoed sentence as well', () => {
    expect((store.match(/\.filter\(\(s\) => !looksLikeInstructionEcho\(s\)\)/g) ?? []).length).toBe(2);
  });
});
