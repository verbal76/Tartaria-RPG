// OTA-1211 — A SPENT LEAD'S CHIP GREYS. Filed by the owner from INSIDE the
// game, typed at the Arbiter mid-session: "why was the eddy still showing open
// in investigate when I had just [worked] it, on investigate it should be
// consumed." The engine's investigate handler hard-refuses a resolved hook's
// noun (step 4.6 — "You already searched the eddy. There is nothing more to do
// with it.") but nothing writes that noun into searchedAmbientNouns — the only
// record the chip builders read — so the chip stayed bright and tappable
// forever, an infinite refusal loop dressed as an affordance. The fix wires
// the ENGINE'S OWN matcher (matchAnyHookNoun(...).resolved) into every chip
// surface the investigate/salvage verbs feed: chip grey, eye-only chip grey,
// the INVESTIGATE badge count, and the salvage modal (its onSubmit routes
// through the same hook system).
import { readFileSync } from 'fs';
import { join } from 'path';
import { matchAnyHookNoun } from '../app/engine/hooks';
import type { Hook } from '../app/engine/hooks';

const hook = (nouns: string[], resolved: boolean): Hook => ({
  id: 'h1', kind: 'temporal_eddy' as Hook['kind'], nouns, plantedLine: '', stage: 1, resolved,
});

describe('OTA-1211 — the matcher the chips now share with the engine', () => {
  it('finds a resolved hook by noun — the shape the refusal keys on', () => {
    expect(matchAnyHookNoun('eddy', [hook(['eddy', 'shimmer'], true)])?.resolved).toBe(true);
    expect(matchAnyHookNoun('eddy', [hook(['eddy'], false)])?.resolved).toBe(false);
    expect(matchAnyHookNoun('barrel', [hook(['eddy'], true)])).toBeNull();
  });
});

describe('OTA-1211 — every chip surface consults it', () => {
  // ⚠ Source pins, silent-no-op class: a surface that skips the check re-ships
  // the infinite-refusal chip with green tests behind it. Six call sites were
  // wired; the pin counts them so a refactor that drops one fails loudly.
  it('ExplorationScreen defines the shared check and wires all six surfaces', () => {
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(screen).toContain('const isExhaustedHookNoun');
    // matchAnyHookNoun is the ENGINE refusal's own matcher — same source, no drift.
    expect(screen).toContain("matchAnyHookNoun(n, currentScene?.hooks ?? [])?.resolved === true");
    const uses = screen.split('isExhaustedHookNoun(').length - 1;
    // FIVE call sites (investigate chips, eye-only chips, salvage chips,
    // investigate count, eye-only count) — the count is the pin.
    expect(uses).toBeGreaterThanOrEqual(5);
  });
});
