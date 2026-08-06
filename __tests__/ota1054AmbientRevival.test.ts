// OTA-1054 — THE AMBIENT COMPANION COULD NEVER SPEAK. Found while reading the
// owner's Asgardar logs: every ambient generation ends `arbiter: ambient ∅`
// (75627ms in one log, 26173ms in the next) and not once `ambient ✓`. It was a
// contradiction, not bad luck — the shared VOICE_RULES order the model
// "Sentences must START with \"You\" or \"Your\"", and the ambient filter then
// dropped every sentence starting with "You". The path discarded its own output
// by construction, holding the shared generation lock for up to 75s per attempt
// while it did (which pushes the REACTIVE Arbiter onto canned templates).
import * as fs from 'fs';
import * as path from 'path';
import { isSecondPersonActionOpener } from '../app/engine/foreignText';

describe('OTA-1054 — reflections live, scene narration still dies', () => {
  it('lets through the reflective openers ambient exists to produce', () => {
    const reflections = [
      'You have come a long way from the mud, and it still shows in your boots.',
      "You've grown harder since the road took your name.",
      'You carry the weight better than you did.',
      'You were softer when we met.',
      'You still flinch at the dark, but less.',
      'You no longer ask me which way is safe.',
      'You know these tunnels now the way you once knew a street.',
      'You survived worse than this and said nothing about it.',
      "You're steadier than the day I found you.",
    ];
    for (const line of reflections) {
      expect({ line, blocked: isSecondPersonActionOpener(line) }).toEqual({ line, blocked: false });
    }
  });

  it('still blocks the invented-scenery openers the filter was written for', () => {
    // The original failure: scenery narrated into a room that has none.
    const hallucinations = [
      'You step back, surveying the alleyway and its stone pillars.',
      'You turn toward the vaulted ceiling.',
      'You reach for the sarcophagus lid.',
      'You walk into the Grand Hall.',
      'You look around the flooded kitchen.',
      'You draw your blade and advance.',
    ];
    for (const line of hallucinations) {
      expect({ line, blocked: isSecondPersonActionOpener(line) }).toEqual({ line, blocked: true });
    }
  });

  it('ignores sentences that do not open with a bare "You"', () => {
    // "Your ..." was never caught by the old rule either (no word boundary),
    // and third-person openers are handled by the other filters.
    expect(isSecondPersonActionOpener('Your hands are steadier now than when we met.')).toBe(false);
    expect(isSecondPersonActionOpener('The Arbiter watches the dust hang.')).toBe(false);
    expect(isSecondPersonActionOpener('')).toBe(false);
  });
});

describe('OTA-1054 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const store = read('app', 'state', 'gameStore.ts');
  const injector = read('app', 'engine', 'contextInjector.ts');

  it('the ambient path filters on REGISTER, not on the pronoun', () => {
    expect(store).toMatch(/\.filter\(\(s\) => !isSecondPersonActionOpener\(s\)\)/);
    // The blanket ban is gone — it is what made the feature unreachable.
    expect(store).not.toMatch(/\.filter\(\(s\) => !\/\^\\s\*you\\b\/i\.test\(s\)\)/);
  });

  it('the contradiction is documented at BOTH ends so it cannot be re-introduced', () => {
    // The rule that made the old filter fatal still stands in the prompt...
    expect(injector).toMatch(/Sentences must START with/);
    // ...so the filter side has to stay register-based.
    expect(store).toMatch(/VOICE_RULES orders the model to start/);
  });

  it('the REACTIVE path never filters second-person openers (it narrates actions)', () => {
    // Isolate the reactive narrator's own body — from its definition to the
    // ambient function's — so the shared import at the top of the file doesn't
    // count as a use.
    const start = store.indexOf('async function narrateViaArbiter');
    const end = store.indexOf('async function maybeGenerateAmbientArbiter');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(store.slice(start, end)).not.toMatch(/isSecondPersonActionOpener/);
  });
});
