/**
 * OTA-1530 — THE STRANGER GETS THE SCREEN, AND CAN FINALLY GIVE YOU WORD.
 *
 * Three things the owner raised about his first wanderer in many characters'
 * worth of play — the icon, the encounter, and whether one could be pressed for a
 * whisper.
 *
 * ⚠⚠⚠ (1) THE GREETING WAS NEVER MISSING. *"I never saw an opening statement or
 * setup for them."* It fired, on time, exactly as OTA-807 wrote it. His log at
 * 02:21:38.996 carries the full scavenger arrival and "This is Tolen, a twitchy
 * scavenger. (Try "talk to Tolen" — a fair word carries.)" — and then, in the same
 * millisecond and the four after it, the ash-storm block, the location
 * description, the compass line and the Arbiter. Six world lines at .996–.001.
 * The introduction to the only person he had met on the open road in thirty days
 * was line one of a six-line dump fired by walking out of a door.
 *
 * So the fix is not more words. It is a place to put the ones already written —
 * the same trade OTA-1043 made for the dog card after the identical complaint
 * ("fired too fast — I hadn't seen the results of the fight").
 *
 * ⚠⚠ (2) THE ICON. *"the icon is a horrible choice."* ☺ was the only emoticon
 * anywhere in the game. ❖ is a traveller's marker in the ✦ ★ ⚄ ⚠ family the rest
 * of the UI already speaks, and it has no face.
 *
 * ⚠⚠⚠ (3) A WHISPER OFF THE ROAD. *"is there an option to interrogate them for a
 * whisper?"* There was not. Every chain plants from a hub-room overheard beat or
 * an authored vendor topic, and of the 347 authored dialogue topics — 42 of them
 * on the seven wanderer archetypes — exactly zero grant one. The person whose
 * whole function is carrying word from somewhere else was the one person who
 * could not give you word. Now a PERSUADE can, one time in five.
 *
 * ⚠ It hangs on persuade rather than intimidate on purpose: intimidate already
 * takes what they CARRY, persuade takes what they KNOW, and a rumour is
 * knowledge. Stacked on top of the lead rather than swapped for it, so rolling it
 * is a good day and a player who never rolls it loses nothing.
 */
import { WANDERER_WHISPER_CHANCE } from '../app/engine/wanderers';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const EXPLORE = src('app', 'screens', 'ExplorationScreen.tsx');
const CARD = src('app', 'components', 'WandererEncounterModal.tsx');
const STORE = src('app', 'state', 'gameStore.ts');
const APP = src('App.tsx');
/** ⚠ STRIPS JSX COMMENTS TOO, not just `//` and continuation lines. The first
 *  draft of this suite kept `{/* … *\/}` blocks and then asserted ☺ was gone from
 *  the file — which failed on the OTA-1530 comment that NAMES the glyph it
 *  replaced. Same trap OTA-1377 and OTA-1526 both hit: a guard that reads prose
 *  indicts the note explaining the fix. What must not survive is the RENDER. */
const codeOnly = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('OTA-1530 — the icon has no face', () => {
  it('⚠⚠ the wanderer chip is marked ❖, and ☺ is gone from the app', () => {
    expect(codeOnly(EXPLORE)).toContain('❖ {currentScene.wanderer.name}');
    expect(codeOnly(EXPLORE)).not.toContain('☺');
  });

  it('⚠ the vendor chip is still unmarked, so the two chips stay tellable apart', () => {
    // The smiley was, accidentally, the fastest way to tell a wanderer from a
    // vendor at a glance. Replacing it with nothing would have cost that.
    expect(codeOnly(EXPLORE)).toContain('{currentScene.vendor.name}');
    expect(codeOnly(EXPLORE)).not.toContain('❖ {currentScene.vendor.name}');
  });
});

describe('OTA-1530 — the encounter is a card, not the fourth line of a dump', () => {
  it('⚠⚠⚠ the card shows the archetype greeting the feed used to bury', () => {
    expect(codeOnly(CARD)).toContain('{wanderer.greeting}');
    expect(codeOnly(CARD)).toContain('{wanderer.name}, {wanderer.role}');
  });

  it('⚠⚠⚠ it is offered ONCE PER PERSON, keyed on the id', () => {
    // Not once per tile and not once ever: walking off and back must not re-raise
    // it, and the next stranger down the road still gets an introduction.
    expect(codeOnly(CARD)).toContain('wanderer.id !== seenId');
    expect(codeOnly(CARD)).toContain('setSeenId(wanderer.id)');
  });

  it('⚠⚠ it waits before opening, so it does not cover what it interrupted', () => {
    // OTA-1043's lesson, applied to the beat that taught it. The greeting lands
    // in the same breath as the weather and the location description.
    expect(CARD).toContain('export const WANDERER_CARD_DWELL_MS = 1200;');
    expect(codeOnly(CARD)).toContain('setTimeout(() => setReady(true), WANDERER_CARD_DWELL_MS)');
  });

  it('⚠⚠ it never opens over a fight or a mission-complete card', () => {
    expect(codeOnly(CARD)).toContain('enemies === 0 && !notice');
  });

  it('⚠⚠ SPEAK hands off to the parley — the card does not re-decide the exchange', () => {
    // PERSUADE / INTIMIDATE stay where they read the temperament and price each
    // verb. Two screens competing to own one exchange is how you get the dog-card
    // bug again.
    expect(codeOnly(CARD)).toContain('submit(`talk to ${wanderer.name}`)');
    expect(codeOnly(CARD)).not.toContain('intimidate');
    expect(codeOnly(CARD)).not.toContain('persuade');
  });

  it('⚠⚠ the tips switch silences the EXPLANATION, never the person', () => {
    // A switch that turned off tips must not also turn off the people you meet.
    const code = codeOnly(CARD);
    expect(code).toContain('{!hintsOff && (');
    // The name/role/greeting are outside every hints gate.
    const greetAt = code.indexOf('{wanderer.greeting}');
    const firstGate = code.indexOf('{!hintsOff && (');
    expect(greetAt).toBeGreaterThan(-1);
    expect(greetAt).toBeLessThan(firstGate);
  });

  it('⚠⚠ it is mounted beside the other blocking cards, behind a SilentBoundary', () => {
    expect(APP).toContain('<SilentBoundary tag="WandererEncounterModal">');
    expect(APP).toContain('<WandererEncounterModal />');
  });
});

describe('OTA-1530 — a persuade can shake a whisper loose', () => {
  it('⚠⚠⚠ one time in five', () => {
    expect(WANDERER_WHISPER_CHANCE).toBe(0.2);
  });

  it('⚠⚠⚠ it lands on PERSUADE, not on intimidate', () => {
    // Intimidate takes what they carry; persuade takes what they know.
    const code = codeOnly(STORE);
    const persuadeAt = code.indexOf("} else if (choice === 'persuade') {");
    const rollAt = code.indexOf('if (Math.random() < WANDERER_WHISPER_CHANCE) {');
    const intimidateAt = code.indexOf('// OTA-809 — Intimidate a person → extort their actual CARRIED GOODS');
    expect(persuadeAt).toBeGreaterThan(-1);
    expect(rollAt).toBeGreaterThan(persuadeAt);
    expect(rollAt).toBeLessThan(intimidateAt === -1 ? Number.MAX_SAFE_INTEGER : intimidateAt);
  });

  it('⚠⚠ it never re-plants a chain the player already holds or has finished', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('...(lp?.activeWhispers ?? []).map((x) => x.id)');
    expect(code).toContain('...(lp?.completedWhisperIds ?? [])');
    expect(code).toContain('CHAINS.find((c) => !held.has(c.id))');
  });

  it('⚠⚠ it is stacked ON TOP of the lead, not swapped for it', () => {
    // The lead payout must still run on the same branch — a persuade that rolls
    // the whisper is a good day, not a coin-flip between two prizes.
    // ⚠ OTA-1532 gave the lead a DISTANCE (`stepsLeft`), so the grant line is no
    // longer `pendingLead: lead`. The claim is unchanged and still pinned: the
    // lead is written on this branch BEFORE the whisper roll, so a persuade that
    // rolls the whisper gets both rather than choosing between them.
    const code = codeOnly(STORE);
    const leadAt = code.indexOf('player: lead ? { ...p, pendingLead: { ...lead, stepsLeft: LEAD_STEPS_TO_CACHE } } : p,');
    const rollAt = code.indexOf('if (Math.random() < WANDERER_WHISPER_CHANCE) {');
    expect(leadAt).toBeGreaterThan(-1);
    expect(leadAt).toBeLessThan(rollAt);
  });

  it('⚠ the planted record carries the same shape every other whisper does', () => {
    const code = codeOnly(STORE);
    const i = code.indexOf('if (Math.random() < WANDERER_WHISPER_CHANCE) {');
    const block = code.slice(i, i + 1200);
    expect(block).toContain("stage: 'planted'");
    expect(block).toContain('targetMapX: tile.x');
    expect(block).toContain('activeFromHour: chain.activeHours?.[0]');
  });
});
