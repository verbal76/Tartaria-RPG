/**
 * OTA-1538 — THE DOG HAD NOWHERE LEFT TO BE FOUND.
 *
 * Owner: *"investigate if we lost the dog opening mission, haven't seen a dog in
 * a while."*
 *
 * ⚠⚠⚠ THE WIRING WAS NEVER BROKEN. The whole chain is intact end to end:
 * `matchRescueHookNoun` → `tryFireRescueScenario` (spawns the captor into the
 * live scene) → `completeRescueScenario` on the captor's death → the
 * `pendingDogOnboarding` popup. So is the gate — no dog, no onboarding in
 * flight, an empty scene, and one of six intents. Nothing regressed.
 *
 * ⚠⚠⚠ THE WORLD HAD STOPPED CONTAINING THE HOOKS. A census of every noun the
 * world can place (1,281 strings across 38 locations) against the 19 authored
 * rescue hook nouns found **13 of the 19 matching nothing at all**:
 *
 *   smelter  anvil post · smelter · forge ruin
 *   wagon    wagon wheel · roadside camp · overturned wagon
 *   cellar   cellar door · cellar · trapdoor · buried structure
 *   snare    snare pit · snare · trapper camp
 *
 * Which left the rescue firing almost entirely through words that merely SHARE
 * a token with a hook: the smelter rescue — a slag floor, a chain ending in a
 * dog's collar — reachable through `chain bridge` and `barnacle chain`; the
 * wagon rescue through `pulley wheel` and `cipher wheel`; the cellar rescue
 * only ever through a `drain hatch`. None of those reads as "a dog is here",
 * so the encounter had become something you tripped over rather than found.
 *
 * ⚠⚠ THIS IS OTA-1241'S UNFINISHED HALF, AND THE COUNT HAS NOT MOVED. That OTA
 * fixed the MATCHER (`firepit` was firing the snare rescue through "pit") and
 * documented this same gap in the same breath — *"13 of the 20 rescue hook
 * nouns match NOTHING in the game's 975 scene nouns"* — then shipped without
 * closing it. It even wrote down why that was dangerous: *"the loose matcher
 * was not merely a bug, it was LOAD-BEARING."* Tightening the match while
 * leaving the props unplaced is exactly what made the mission scarce. The world
 * has grown 975 → 1,281 nouns since, and the dead count is still 13.
 *
 * ⚠ SO THE FIX IS CONTENT, NOT CODE. Every hook noun is placed in two locations
 * chosen for its own fiction, weighted to low-danger starter ground — the
 * rescue can only fire before the player has a dog, so it must live where a
 * dogless character actually walks. The matcher, the gate and the scenarios are
 * untouched.
 */
import { RESCUE_SCENARIOS, type RescueScenarioId } from '../app/engine/dogCompanion';
import { rescueScenarioForNoun } from '../app/engine/storyNouns';
import LOCATIONS from '../app/data/locations/locations.json';

type Loc = { id: string; danger?: number; tags?: string[]; interactables?: string[] };
const LOCS = LOCATIONS as unknown as Loc[];

/** Every noun string the world can place, harvested the way the census did. */
const worldNouns = (): Set<string> => {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') { Object.values(v as object).forEach(walk); return; }
    if (typeof v === 'string' && v.length < 60) out.add(v.toLowerCase());
  };
  walk(LOCATIONS);
  return out;
};

const ALL_HOOKS: { id: RescueScenarioId; noun: string }[] =
  (Object.keys(RESCUE_SCENARIOS) as RescueScenarioId[])
    .flatMap((id) => RESCUE_SCENARIOS[id].hookNouns.map((noun) => ({ id, noun })));

const THE_THIRTEEN = [
  'anvil post', 'smelter', 'forge ruin',
  'wagon wheel', 'roadside camp', 'overturned wagon',
  'cellar door', 'cellar', 'trapdoor', 'buried structure',
  'snare pit', 'snare', 'trapper camp',
];

describe('OTA-1538 — every rescue hook exists in the world', () => {
  it('⚠⚠⚠ NO authored hook noun matches nothing — the census returns zero dead', () => {
    // The ratchet. OTA-1241 measured 13 dead and shipped; this is the assertion
    // that stops the count from ever silently climbing again.
    const nouns = [...worldNouns()];
    // ⚠ ONE predicate, mirroring rescueScenarioForNoun's own rule exactly: an
    // exact match, or a multi-word hook appearing as a phrase, or a single-word
    // hook appearing as a whole word. An earlier draft ANDed this with a looser
    // token test, which could only ever make the ratchet pass more easily —
    // a guard that can pass vacuously is worse than no guard.
    const isLive = (noun: string): boolean => nouns.some((t) =>
      t === noun
      || (noun.includes(' ') ? t.includes(noun) : t.split(/[^a-z0-9]+/).includes(noun)));
    const dead = ALL_HOOKS.filter(({ noun }) => !isLive(noun.toLowerCase()));
    expect(dead.map((d) => `${d.id}:${d.noun}`)).toEqual([]);
  });

  it('⚠⚠⚠ each of the thirteen is placed, and routes to its OWN scenario', () => {
    // Placement is worthless if the noun lands on a different rescue than the
    // one it was authored for — that was OTA-1241's other complaint (`trap`
    // reaching CELLAR through "trapdoor").
    const nouns = worldNouns();
    for (const noun of THE_THIRTEEN) {
      expect(nouns.has(noun)).toBe(true);
      const owner = ALL_HOOKS.find((h) => h.noun === noun);
      expect(owner).toBeDefined();
      expect(rescueScenarioForNoun(noun)).toBe(owner!.id);
    }
  });

  it('⚠⚠ all four scenarios are reachable through a hook authored FOR them', () => {
    // Before this, cellar was reachable only via `hatch` and smelter mostly via
    // `chain` — tokens shared with unrelated props. Each scenario now has at
    // least one live noun that is its own.
    const nouns = worldNouns();
    for (const id of Object.keys(RESCUE_SCENARIOS) as RescueScenarioId[]) {
      const own = RESCUE_SCENARIOS[id].hookNouns.filter((n) => nouns.has(n.toLowerCase()));
      expect(own.length).toBeGreaterThan(0);
    }
  });

  it('⚠⚠ the rescue lives where a DOGLESS character walks — low-danger ground', () => {
    // The gate only fires while the player has no dog, so a hook placed solely
    // in a danger-5 buried capital is a hook nobody reaches in time. Every
    // scenario must be reachable somewhere at danger <= 2.
    const easy = LOCS.filter((l) => (l.danger ?? 9) <= 2);
    const reached = new Set<string>();
    for (const l of easy) {
      for (const n of l.interactables ?? []) {
        const id = rescueScenarioForNoun(n.toLowerCase());
        if (id) reached.add(id);
      }
    }
    expect([...reached].sort()).toEqual(['cellar', 'smelter', 'snare', 'wagon']);
  });

  it('⚠ no hook noun is placed twice in the same location', () => {
    for (const l of LOCS) {
      const inter = l.interactables ?? [];
      expect(new Set(inter).size).toBe(inter.length);
    }
  });

  it('⚠ the matcher, the gate and the scenarios were NOT touched', () => {
    // This OTA is content. If a future edit "fixes" the dog by loosening the
    // matcher again, OTA-1241's whole class comes back — every door, ruin and
    // camp in the game a dog trigger.
    expect(rescueScenarioForNoun('firepit')).toBeNull();
    expect(rescueScenarioForNoun('door')).toBeNull();
    expect(rescueScenarioForNoun('ruin')).toBeNull();
    expect(rescueScenarioForNoun('camp')).toBeNull();
    // …and `trap` still means SNARE, not cellar-through-trapdoor.
    expect(rescueScenarioForNoun('trap')).toBe('snare');
    expect(rescueScenarioForNoun('trapdoor')).toBe('cellar');
  });
});
