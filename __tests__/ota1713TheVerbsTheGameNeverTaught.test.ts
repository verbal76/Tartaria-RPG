/**
 * OTA-1713 — THE VERBS THE GAME NEVER TAUGHT.
 *
 * `check:verbreach` passes, and it passes honestly: it answers in three buckets
 * — REACHED, TYPED-ONLY, UNKNOWN — because its predecessor conflated "I did not
 * find it" with "it is not there" and was wrong on all three verbs it was
 * spot-checked against. What it leaves behind is a SHORTLIST it is not entitled
 * to judge: 29 verbs with no control found, and 73 handlers it could not follow.
 * This is the hand-verification of that shortlist.
 *
 * ⚠⚠ THE RIGHT QUESTION IS NOT "IS THERE A BUTTON". Typed-only is a legitimate
 * design in a text RPG, and this game teaches typed verbs deliberately: the
 * ACTIONS screen is a reference of cards, each carrying the phrases a player
 * would actually type. So a verb is DISCOVERABLE if it has a control OR the
 * ACTIONS screen teaches a phrase that PARSES to it.
 *
 * ⚠ And "teaches a phrase that parses" is the load-bearing half. My first pass
 * asked whether the verb's own NAME appeared anywhere on the screen, and it was
 * wrong in both directions — it cleared `multi_fire` and `recruit` (taught as
 * "burst fire" and "hire", which the name test could not see) while clearing
 * `retreat` on the strength of the word appearing in unrelated prose. Matching
 * the parser's own synonym table against the taught keywords is the measurement;
 * anything else is a guess wearing a number.
 *
 * ⚠⚠⚠ WHAT IT FOUND: `advance` and `retreat`. A matched pair sharing one
 * handler, and the ONLY two combat manoeuvres the game never taught — dash,
 * disengage, take cover, aim, reload, maneuver, quick fire, burst fire and fight
 * back all have cards. None of the manoeuvres has a button (that is the design),
 * so for these two nothing anywhere told a player they exist. They are not
 * trivia: they move you between range bands, and naming a target shifts your
 * focus mid-fight, which is how you pick who you are toe to toe with in a
 * three-enemy brawl instead of taking whoever the fight handed you.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const concepts = JSON.parse(src('app', 'data', 'lore', 'concepts.json')) as {
  concepts: { id: string; title: string; keywords?: string[]; answer: string }[];
};

/** The parser's own synonym table — intent → the phrases that reach it. */
function parserSynonyms(): Map<string, string[]> {
  const ps = src('app', 'engine', 'parser.ts');
  const out = new Map<string, string[]>();
  let cur: string | null = null;
  let buf = '';
  for (const line of ps.split('\n')) {
    const m = /^ {2}([a-z_]+): \[/.exec(line);
    if (m) {
      cur = m[1]!;
      buf = line;
      if (line.trimEnd().endsWith('],')) { out.set(cur, [...buf.matchAll(/'([^']+)'/g)].map((x) => x[1]!)); cur = null; buf = ''; }
      continue;
    }
    if (cur) {
      buf += `\n${line}`;
      if (line.trimEnd().endsWith('],')) { out.set(cur, [...buf.matchAll(/'([^']+)'/g)].map((x) => x[1]!)); cur = null; buf = ''; }
    }
  }
  return out;
}

/** Everything the ACTIONS screen actually puts in front of a player: the cards
 *  named by its SECTIONS, flattened to one searchable corpus. */
function taughtCorpus(): string {
  const ar = src('app', 'screens', 'ActionReferenceScreen.tsx');
  const block = ar.slice(ar.indexOf('const SECTIONS'), ar.indexOf('const SECTIONS') + 6000);
  const shown = new Set([...block.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]!));
  return concepts.concepts
    .filter((c) => shown.has(c.id))
    .map((c) => `${c.title} ${(c.keywords ?? []).join(' ')} ${c.answer}`.toLowerCase())
    .join(' | ');
}

/** Verbs with no control that verbreach could see. Kept verbatim from its
 *  output so this test is auditing the same list a reader of the gate sees. */
const NO_CONTROL_FOUND = `stealth diplomacy escape travel cast wait join advance retreat dig swim jump
  dash disengage help ready mount take_cover aim reload maneuver quick_fire multi_fire fight_back
  recruit drop open stow_pouch unpouch`.split(/\s+/).filter(Boolean);

/** ⚠ The two the gate reported as unreachable that DO have controls — its own
 *  false negatives, verified by hand. Both are Inventory buttons whose handlers
 *  sit in the 73 it said it could not follow, which is the gate being honest
 *  about its limits rather than wrong. */
const HAS_A_CONTROL_INSTEAD: Record<string, string> = {
  stow_pouch: 'InventoryScreen — STOW IN POUCH on the item modal (stowInPouch)',
  unpouch: 'InventoryScreen — the UNPOUCH button on a filled pouch slot (unpouchItem)',
};

describe('OTA-1713 — every live verb is reachable or taught', () => {
  it('⚠⚠⚠ THE INSTRUMENT — no verb is left with neither a control nor a phrase', () => {
    const syn = parserSynonyms();
    const corpus = taughtCorpus();
    const orphans: string[] = [];
    for (const verb of NO_CONTROL_FOUND) {
      if (verb in HAS_A_CONTROL_INSTEAD) continue;
      const phrases = syn.get(verb) ?? [verb];
      if (!phrases.some((ph) => corpus.includes(ph.toLowerCase()))) orphans.push(verb);
    }
    // Before this OTA: ['advance', 'retreat'].
    expect(orphans).toEqual([]);
  });

  it('the two the gate could not see really do have buttons', () => {
    const inv = src('app', 'screens', 'InventoryScreen.tsx');
    expect(inv.includes('stowInPouch(item.name, item.id);')).toBe(true);
    expect(inv.includes('unpouchItem(slot.name!, slot.id ?? undefined)')).toBe(true);
  });

  it('⚠⚠ the cards teach phrases the PARSER actually routes, not invented ones', () => {
    // A card that teaches a word the parser does not know is worse than no card:
    // it sends the player to a dead end in the game's own voice. So every
    // keyword on the two new cards has to be a real synonym.
    const syn = parserSynonyms();
    for (const [id, verb] of [['advance_action', 'advance'], ['retreat_action', 'retreat']] as const) {
      const card = concepts.concepts.find((c) => c.id === id)!;
      expect(card).toBeTruthy();
      const known = new Set((syn.get(verb) ?? []).map((s) => s.toLowerCase()));
      for (const kw of card.keywords ?? []) {
        expect({ id, kw, routes: known.has(kw.toLowerCase()) }).toEqual({ id, kw, routes: true });
      }
    }
  });

  it('⚠⚠⚠ "retreat" READS AS FLEEING — a collision recorded, not silently flipped', () => {
    // Found while checking the cards taught real phrases. The word `retreat`
    // sits, undocumented, in the ESCAPE synonym list — so typing the most
    // obvious word for the retreat intent leaves the encounter instead of
    // opening one range band. It almost certainly predates the intent existing.
    //
    // ⚠ NOT CHANGED HERE, and the restraint is the point: moving the word would
    // flip a live combat behaviour on my judgement, mid-fight, where a player
    // who types "retreat" to run would instead stand their ground. `escape`
    // keeps run / flee / bolt / scram / fall back regardless, so nobody is stuck
    // for a way out — but which meaning the word should carry is the owner's
    // call. The card names the trap in the meantime, which costs nothing and is
    // what a reference screen is for.
    const ps = src('app', 'engine', 'parser.ts');
    const escape = /escape: \[([\s\S]*?)\],/.exec(ps)![1]!;
    expect(escape.includes("'retreat'")).toBe(true);
    const card = concepts.concepts.find((c) => c.id === 'retreat_action')!;
    expect(card.answer.includes('read as FLEEING the encounter outright')).toBe(true);
    // And the card does not claim the word as its own keyword, because it isn't.
    expect((card.keywords ?? []).includes('retreat')).toBe(false);
  });

  it('and they are shown, beside the family they belong to', () => {
    const ar = src('app', 'screens', 'ActionReferenceScreen.tsx');
    expect(ar.includes("'move_action', 'advance_action', 'retreat_action', 'sprint_action'")).toBe(true);
  });

  it('⚠ the cards describe what the ENGINE does — the focus shift is real', () => {
    // The most useful thing these verbs do is the one a player would never
    // guess, so the card says it; that claim has to be true.
    const g = src('app', 'state', 'gameStore.ts');
    expect(g.includes("case 'advance':\n      case 'retreat': {")).toBe(true);
    expect(g.includes('You shift focus to ${currentScene.enemies[idx]!.name}.')).toBe(true);
    const combat = src('app', 'state', 'combatResolution.ts');
    expect(combat.includes("direction: 'advance' | 'retreat',")).toBe(true);
  });
});

describe('OTA-1713 — the codex stops showing the same faction twice', () => {
  const dupes = (): string[] => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const c of concepts.concepts) { if (seen.has(c.id)) dup.add(c.id); seen.add(c.id); }
    return [...dup].sort();
  };

  it('⚠⚠ FOUR ids are authored twice — declared, so a fifth cannot slip in', () => {
    // Found while adding the two action cards: a duplicate-id check on my own
    // insert tripped on data that was already there. Every other reader resolves
    // a concept with `find(c => c.id === id)`, so the second card of each pair
    // was already dead to them — only the codex list showed both.
    expect(dupes()).toEqual([
      'conspiracy_architects', 'servants_of_giants', 'stone_builders', 'tartarian_revivalists',
    ]);
  });

  it('⚠⚠⚠ the codex agrees with every other reader, and its count counts what it shows', () => {
    // `key={c.id}` over the whole bank meant four duplicate React keys — a
    // reconciliation hazard, not a cosmetic one — and the player saw the same
    // faction twice under two titles saying different things.
    const codex = src('app', 'components', 'LoreCodexBody.tsx');
    expect(codex.includes('if (seen.has(c.id)) return false;')).toBe(true);
    expect(codex.includes('<Text style={styles.counter}>{concepts.length} entries</Text>')).toBe(true);
  });

  it('⚠ NOTHING WAS DELETED — which of each pair is the good text is a content call', () => {
    // Both write-ups stay in the file. The list just keeps the first, matching
    // what the rest of the app already resolves.
    const raw = src('app', 'data', 'lore', 'concepts.json');
    for (const id of dupes()) {
      expect({ id, copies: raw.split(`"id": "${id}"`).length - 1 }).toEqual({ id, copies: 2 });
    }
  });
});
