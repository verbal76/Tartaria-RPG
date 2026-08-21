/**
 * OTA-1409 — THREE FROM THE 4.31.5 PLAY SESSION.
 *
 * The owner played for twenty minutes and sent the log. Three defects, and all
 * three are the same species: **the game had the right information and used the
 * wrong one.**
 *
 *   1. An arrival at Asgardar narrated as "You approach the Unaligned Poacher"
 *      — a man dead 51 seconds and one tile away.
 *   2. `−260 TC` printed for a payment of ~249.
 *   3. The Arbiter calling the player "companion" — its own job title.
 */
import { formatRecentHistory, buildLlmContext } from '../app/engine/contextInjector';
import type { GameLogEntry } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;

const STORE = read('app', 'state', 'gameStore.ts');
const NARRATION = read('app', 'ai', 'narration.ts');
const INJECTOR = read('app', 'engine', 'contextInjector.ts');

const line = (ts: number, channel: GameLogEntry['channel'], text: string): GameLogEntry =>
  ({ id: `l${ts}`, ts, channel, text });

// ── 1 — the poacher who followed him to Asgardar ────────────────────────────

describe('OTA-1409 (1) — recent history stops at the scene boundary', () => {
  /** The owner's actual log, reduced to the lines that mattered. */
  const log: GameLogEntry[] = [
    line(1000, 'player', 'attack with the mud repeater crossbow'),
    line(2000, 'player', 'approach Unaligned Poacher'),
    line(3000, 'player', 'investigate footprint'),
    // …travel to Asgardar. The new scene commits at 4000.
  ];

  it('⚠⚠ the exact prompt that produced the bug', () => {
    // Unscoped, this is what the model was handed for a SCENE INTRO about a
    // place it had never seen — and "approach Unaligned Poacher" was the only
    // concrete noun in it.
    expect(formatRecentHistory(log)).toBe(
      'investigate footprint ← approach Unaligned Poacher ← attack with the mud repeater crossbow',
    );
  });

  it('⚠⚠ …and with the boundary, the arrival has no history to misread', () => {
    expect(formatRecentHistory(log, 4000)).toBe('None — just arrived.');
  });

  it('⚠⚠ it STOPS at the boundary rather than skipping past it', () => {
    // Walking on to collect three lines would reach back through the previous
    // scene and reintroduce the bug — "recent" would mean "the last three things
    // you ever typed". One in-scene line is one line, not a reason to go digging.
    const withOne = [...log, line(5000, 'player', 'look')];
    expect(formatRecentHistory(withOne, 4000)).toBe('look');
  });

  it('⚠ history WITHIN a scene is untouched — this narrows nothing else', () => {
    const sameScene = [
      line(5000, 'player', 'search the crates'),
      line(6000, 'player', 'take the rope'),
    ];
    expect(formatRecentHistory(sameScene, 4000)).toBe('take the rope ← search the crates');
  });

  it('⚠ no stamp means the old behaviour, not an empty history', () => {
    // A pre-generated intro for a place the player has not reached has no scene
    // of its own to be bounded by. Silently filtering it to nothing would be a
    // second bug wearing the first one's fix.
    expect(formatRecentHistory(log, undefined)).toContain('Unaligned Poacher');
    expect(formatRecentHistory(log, 0)).toContain('Unaligned Poacher');
  });

  it('⚠⚠ buildLlmContext passes it through, so the fix reaches the prompt', () => {
    const ctx = buildLlmContext({
      player: null, scene: null, gameLog: log, sceneStartedAt: 4000,
    });
    expect(ctx.recent_history).toBe('None — just arrived.');
  });

  it('⚠ the stamp is written in the SAME set() that installs the scene', () => {
    // Any gap between the two is a window in which the scene is current and the
    // boundary is not — which is the bug again, narrower.
    expect(STORE).toContain(
      "set({ currentScene: scene, pendingRolls: null, pendingHookContinue: null, sceneStartedAt: Date.now() });",
    );
    expect(NARRATION).toContain('sceneStartedAt: forLoc ? undefined : state.sceneStartedAt,');
  });
});

// ── 2 — the price that was quoted instead of the price that was paid ────────

describe('OTA-1409 (2) — the ledger line reports what was actually taken', () => {
  /** The shipped arithmetic, mirrored: what the log line should say. */
  const paid = (before: number, cost: number): number => Math.min(cost, before);

  it('⚠⚠ short of the price — the owner\'s row', () => {
    // ~249 TC, a 260 TC page. The old line read the balance AFTER the write, so
    // `Math.min(260, 0)` was 0 and the `|| 260` fallback printed the STICKER
    // PRICE — the one case the min() existed to handle was the one it could not
    // report.
    expect(paid(249, 260)).toBe(249);
  });

  it('⚠⚠ …and it was wrong the OTHER way for anyone who could afford it', () => {
    // 300 TC and a 260 TC page printed `−40 TC`: the min() was comparing the
    // price against the CHANGE. It was only ever right when the two coincided.
    expect(paid(300, 260)).toBe(260);
    expect(paid(260, 260)).toBe(260);
  });

  it('⚠⚠ the balance is read BEFORE the write — that is the whole fix', () => {
    const i = STORE.indexOf('const before = get().player?.tc ?? 0;');
    expect(i).toBeGreaterThan(-1);
    const setAt = STORE.indexOf('tc: Math.max(0, st.player.tc + fx.tc!)', i);
    expect(setAt).toBeGreaterThan(i);
    // And the old read-after-write expression is gone, not left beside it.
    expect(STORE).not.toContain("Math.min(Math.abs(fx.tc), get().player?.tc ?? 0) || Math.abs(fx.tc)");
  });

  it('⚠ falling short is SAID, rather than passed off as the asking price', () => {
    expect(STORE).toContain('TC short — they took what you had.');
  });

  it('⚠ the clamp itself is unchanged — paying what you have is the design', () => {
    expect(STORE).toContain('tc: Math.max(0, st.player.tc + fx.tc!)');
    expect(STORE).toContain('"you pay what you have" is what the writing');
  });
});

// ── 3 — the Arbiter calling the player by its own job title ────────────────

describe('OTA-1409 (3) — the ambient beat stops re-labelling the player', () => {
  /** The shipped filter, mirrored. */
  const apposition =
    /^\s*(?:and\s+)?you\s*,\s*(?:my|a|an|the|our)?\s*(companion|friend|traveller|traveler|wanderer|comrade|partner|stranger)\s*,/i;

  it('⚠⚠ both lines from the owner\'s logs, one day apart', () => {
    expect(apposition.test('You, a companion, have walked a long road, traversing the Borderlands.')).toBe(true);
    expect(apposition.test('You, my companion, have traveled far and wide, traversing through the winding streets of the Borderlands.')).toBe(true);
  });

  it('⚠⚠ they slipped every existing guard, and each for a good reason', () => {
    const s = 'You, my companion, have traveled far and wide.';
    // Voice rules DEMAND a "You" opener, so the opener test passes it.
    expect(/^You\b/.test(s)).toBe(true);
    // OTA-1125's filter drops first-person-only sentences; this has "you" too.
    const firstPerson = /\b(i|i'm|i've|i'll|my|mine|me|myself)\b/i.test(s);
    const secondPerson = /\b(you|your|you're|you've|yours|yourself)\b/i.test(s);
    expect(firstPerson && !secondPerson).toBe(false);
    // Nothing here is an off-canon named entity.
    expect(/\b(the player|the adventurer|the explorer|the figure)\b/i.test(s)).toBe(false);
  });

  it('⚠⚠ NARROW: warm address survives, only the RE-LABELLING is dropped', () => {
    // The OTA-1031 lesson — a filter that eats the feature is worse than the
    // defect. "my friend" at the END is the Arbiter being warm, which is the
    // beat working exactly as intended.
    expect(apposition.test('You have walked a long road, my friend.')).toBe(false);
    expect(apposition.test('You have come further than most, and I have seen most.')).toBe(false);
    expect(apposition.test('Your hands are steadier than they were.')).toBe(false);
    // A comma after "You" that is not an apposition is left alone.
    expect(apposition.test('You, of all people, should know better.')).toBe(false);
  });

  it('⚠ the filter ships where the other ambient guards live', () => {
    expect(NARRATION).toContain('THE NARRATOR CALLING THE PLAYER BY ITS OWN JOB TITLE');
    expect(NARRATION).toContain('companion|friend|traveller|traveler|wanderer|comrade|partner|stranger');
  });

  it('⚠⚠ …and the invitation that produced the geography is gone from the prompt', () => {
    // "the road behind you both" is what asked for travelogue. A 0.5B model told
    // to reflect on a road describes a road, and it does not know which roads
    // exist — hence streets in open mud, and alleyways in a kitchen.
    // ⚠ codeOnly — the deletion is EXPLAINED directly above the prompt, and that
    // explanation quotes the phrase it deleted. Fifth time this session an
    // assertion has tripped over a comment about itself; an absence pin must
    // read the code, or it forbids explaining the change.
    const codeOnly = INJECTOR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).not.toContain('the road behind you both');
    expect(INJECTOR).toContain('Never describe places, scenery or where they have been');
    // ⚠ AND IT IS SHORT, because ota1108 measures this prompt against the
    // reaction prompt and prefill is the cost driver — his own logs put it at
    // ~10-12ms per prompt token. The first draft of this instruction was three
    // times longer and pushed the ambient prompt over that budget; the test
    // caught it, and the right answer was fewer words, not a looser bound.
    // The person-facing prompts stay: this narrowed the subject, not the beat.
    expect(INJECTOR).toContain('how far they have ');
    expect(INJECTOR).toContain('your changing read of them');
  });
});
