// OTA-1151 — THE PROMPT WAS SAYING THE SAME THING FOUR TIMES.
//
// Owner: "go after the big ones." The measured big one, from the 4.29.57
// device log:
//
//   qwen⏱ narration:scene_intro ok 19255ms wait 3744ms read 11004ms/write
//   3544ms in 854t→out 33t reuse 0t HIT-CAP (151ch)
//
// 854 prompt tokens read to produce a 33-token sentence, and 11.0 seconds of
// the 19.3 spent purely READING. That prices prefill at 12.9 ms per prompt
// token on this device, which turns every prompt line into a number.
//
// So the prompt was priced line by line rather than guessed at. A
// representative scene_intro measured 3,194 characters / ~888 tokens:
//
//   311t  VOICE_RULES                ← a THIRD of the whole prompt
//   142t  Inventory & Equipment
//    77t  CANON LORE
//    65t  SECOND PERSON ONLY
//    63t  Environment
//    62t  the task
//    29t  NO_INVENTED_PLACES
//    27t  **The player is at "X"…**
//    17t  [SYSTEM FACTS] header
//    15t  the persona line
//    12t  Location: <biome> - <room>
//    …    exits, entities, stats, last action
//
// ⚠ THE FINDING. Three successive OTAs each added a "do not invent places"
// guard and none removed the previous one, so the model was reading the SAME
// RULE FOUR TIMES, in four different wordings, for ~123 tokens:
//
//   1. NO_INVENTED_PLACES  'NEVER name "Borderlands" … not named below'
//   2. VOICE_RULES         'DO NOT name any location, room, weather, or NPC…'
//   3. the body            'Location: <biome> - <room>'
//   4. the body            '**The player is at "X". If you name any place,
//                            it MUST be "X".**'
//
// A 0.5B model given one instruction in four wordings does not obey it four
// times as hard; it spends attention reconciling them. The third-person ban
// was doubled the same way — SHARED_PREAMBLE's blanket "NEVER write 'The
// player' / 'they' / 'the adventurer' / 'the figure' / 'the explorer'"
// strictly contains VOICE_RULES' weaker "if a draft sentence BEGINS with…".
//
// ⚠ WHAT WAS *NOT* CUT, AND WHY. Every guard in this prompt has a scar behind
// it — OTA-1054's third-person recap, the "Borderlands" playtest failure, the
// hallucinated trap sequences. None of those guards were removed; only the
// duplicate STATEMENTS of them were. The verb catalog stayed too, because
// teaching the player the engine's vocabulary through narration is a real
// feature and it is the one part of the block a model cannot supply from
// training data. What went from it was padding: slash-alternates
// ("retreat / step back", "hide / sneak"), the parenthetical item list after
// "use", and six verbs a 20-word aside will never reach for.
//
// ⚠ AND THE HONEST ARITHMETIC, WHICH IS THE MORE VALUABLE HALF OF THIS OTA.
// 888 → 760 tokens is ~1.7 s off every narration at 12.9 ms/token. That is
// real and it is free. It is ALSO not enough, and the same measurement says
// why: 19.3 s = 3.7 wait + 11.0 read + 3.5 write + ~1.0 other. Even a prompt
// of ZERO tokens leaves ~8 s, because the model writes at 107 ms/token and
// waits ~3.7 s for the native-ML lock. Prompt trimming cannot make
// scene_intro fast. It has to stop being on the critical path — which is
// exactly what OTA-1145's bank did for ambient. That is a design call and it
// is the owner's, so it is written down here rather than guessed at.
//
// ⚠ SECOND FINDING, FOUND WHILE MEASURING: the COMBAT branch of
// buildSystemPrompt is unreachable in the shipped game. narrateViaArbiter
// muzzles on any hostile entity and returns the template BEFORE it builds a
// prompt (Phase 4 §1.2), and the only other caller is the ambient path. So
// ctx.in_combat is never true at buildSystemPrompt. COMBAT_RULES and
// COMBAT_TASK are live only in tests. Recorded, not deleted — the muzzle is a
// policy that could be relaxed, and quietly removing the branch would make
// that a rewrite instead of a flag flip.

// Source-reading suite with no `import` of its own would be a SCRIPT; this one
// imports, so it is already a module. Kept explicit for the next reader.
import { buildSystemPrompt, type LlmContext } from '../app/engine/contextInjector';

jest.setTimeout(60_000);

const CTX = {
  current_biome: 'Buried Capital',
  room_name: 'Obsidian Pillars',
  environmental_description: 'A forest of black glass columns rising out of the mud.',
  available_exits: 'north, east, south, west',
  active_entities: 'None.',
  player_stats: 'HP 46/58, Stamina 12/20, AC 16',
  // ⚠ A REALISTIC PACK, deliberately. The whole point of this suite is the
  // arithmetic, and a toy fixture would price a prompt no player ever sends.
  // This is the shape the device log carried: a capped stowed list plus the
  // full worn kit.
  full_inventory:
    "Aetheric Torch, Reclaimer's Rope, Ration (x4), First Aid Kit (x2), Scrap Iron (x18), "
    + 'Aether Mud (x3), Cracked Lens, Bone Needle, Signal Flare, Rust Salve (x2), Tide Tooth (x6), '
    + 'Copper Wire (x9), Chart Fragment, Salvaged Coil, …and 31 more, 412 TC '
    + '| Wearing: main hand Rail Saber, off hand Bog Buckler, head Skyreacher Hood, '
    + 'chest Sentinel Core Plate, hands Reclaimer Wraps, legs Skyreacher Strap, '
    + 'feet Mud-Tread Boots, cloak Ash Shroud, amulet Aetheric Locket, ring Ring of the Quiet Step',
  recent_history: 'look around ← go north ← search the pillars',
  in_combat: false,
  ambient: false,
  player_faction_id: undefined,
} as unknown as LlmContext;

const promptOf = (over: Partial<LlmContext> = {}): string =>
  buildSystemPrompt({ ...CTX, ...over } as LlmContext)[0]!.content;

/** Count non-overlapping occurrences of a needle. */
const times = (hay: string, needle: string): number =>
  hay.split(needle).length - 1;

describe('OTA-1151 — the rule is stated ONCE, not four times', () => {
  it('⚠ "do not invent places" appears exactly once as a RULE', () => {
    const p = promptOf();
    // The consolidated statement.
    expect(times(p, 'NEVER name a location, room, weather or person')).toBe(1);
    // The three copies that are gone. Each is asserted by its own distinctive
    // fragment, so a future edit that reinstates one is caught by name.
    expect(p).not.toContain('DO NOT name any location, room, weather, or NPC');
    expect(p).not.toContain('If you name any place, it MUST be');
    expect(p).not.toContain('Location: Buried Capital - Obsidian Pillars');
  });

  it('⚠ …and exactly one line still names THIS room as the only nameable place', () => {
    const p = promptOf();
    expect(times(p, 'the ONLY place you may name')).toBe(1);
    expect(p).toContain('**The player is at "Obsidian Pillars" (Buried Capital)');
    // The biome survived the merge — it was carried by the deleted
    // `Location:` line and would have been lost silently otherwise.
    expect(p).toContain('Buried Capital');
  });

  it('⚠ the third-person ban is stated once, by the copy that says MORE', () => {
    const p = promptOf();
    // SHARED_PREAMBLE bans the third person ANYWHERE in the sentence, which
    // strictly contains the deleted "if a draft sentence BEGINS with" clause.
    expect(p).toContain("NEVER write 'The player'");
    expect(p).not.toContain('If a draft sentence begins with "The player"');
    // The positive form of the rule — start with You/Your — is not a
    // duplicate of the ban and stays.
    expect(p).toContain('Sentences must START with');
  });

  it('every guard that had a SCAR behind it is still present', () => {
    const p = promptOf();
    for (const guard of [
      '**SECOND PERSON ONLY.**',                                    // OTA-1054
      '"Borderlands"',                                              // the playtest failure
      'Do not invent emotions, motivations, traps, mechanics',      // hallucinated traps
      'If you would have to invent scenery to fill a sentence, end early.',
      'End on a complete sentence.',                                // mid-sentence cutoffs
      'cast, channel, weave, incant',                               // the game-specific verbs
    ]) {
      expect(p).toContain(guard);
    }
  });

  it('the ambient branch got the same dedup — its two copies also collapsed', () => {
    const p = promptOf({ ambient: true } as Partial<LlmContext>);
    expect(times(p, 'NEVER name a location, room, weather or person')).toBe(1);
    expect(p).not.toContain('other than the location named below');
    expect(times(p, 'If you would have to invent scenery')).toBe(1);
    // Ambient still must not read the verb catalog — OTA-1129/1131's finding,
    // unchanged by this one.
    expect(p).not.toContain('brawl');
  });
});

describe('OTA-1151 — the arithmetic, pinned so it cannot drift back', () => {
  // 3.6 chars/token is the ratio the device log implies for this prompt shape
  // (854 reported tokens for ~3,070 characters). Approximate on purpose: the
  // point is the SIZE CLASS, not a tokenizer reimplementation.
  const tok = (s: string): number => Math.ceil(s.length / 3.6);

  it('⚠ the peaceful prompt got materially smaller and must stay so', () => {
    // Measured on this fixture: 844 → 716 tokens. (The device log's own
    // scene_intro was 854, so the fixture is the right size class.)
    // Ceiling: catches a fifth copy of a rule creeping back in.
    expect(tok(promptOf())).toBeLessThan(760);
    // Floor: catches a future round of quiet cutting that removes CONTENT
    // rather than duplication. OTA-1144 wrote this guard; OTA-1151 kept it
    // and moved it rather than deleting it, because the two changes are
    // genuinely different and only one of them is free.
    expect(tok(promptOf())).toBeGreaterThan(620);
  });

  it('⚠ the ambient prompt stays the cheap one', () => {
    expect(tok(promptOf({ ambient: true } as Partial<LlmContext>)))
      .toBeLessThan(tok(promptOf()));
  });

  it('prompts stay deterministic — same context, same bytes', () => {
    expect(promptOf()).toBe(promptOf());
    expect(promptOf({ ambient: true } as Partial<LlmContext>))
      .toBe(promptOf({ ambient: true } as Partial<LlmContext>));
  });
});

describe('OTA-1151 — ⚠ the combat branch is unreachable, and that is recorded', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const STORE: string = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');

  it('narrateViaArbiter returns the template BEFORE building a prompt when enemies are up', () => {
    const fn = STORE.slice(STORE.indexOf('async function narrateViaArbiter'));
    const muzzle = fn.indexOf('inCombat');
    const build = fn.indexOf('buildSystemPrompt');
    expect(muzzle).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    // The muzzle check, and the early return it guards, both precede the
    // prompt build. That is why ctx.in_combat is never true here.
    expect(muzzle).toBeLessThan(build);
    expect(fn.slice(muzzle, build)).toContain('inCombat ? \'combat\'');
  });

  it('there are exactly two callers, and neither can be in combat', () => {
    // narrateViaArbiter (muzzled above) and the ambient path (muzzled by its
    // own combat gate). A third caller would mean the combat branch went live
    // and this test should be the thing that says so.
    expect(times(STORE, 'buildSystemPrompt(ctx)')).toBe(2);
  });

  it('the combat branch still WORKS if the muzzle is ever relaxed', () => {
    // Not deleted, because the muzzle is a policy and could be flipped back.
    const p = promptOf({ in_combat: true, active_entities: 'Bog Hound' } as Partial<LlmContext>);
    expect(p).toContain('ACTIVE COMBAT');
    expect(p).toContain('Bog Hound');
    // And it inherited the dedup rather than being left behind on the old text.
    expect(times(p, 'NEVER name a location, room, weather or person')).toBe(1);
    expect(p).not.toContain('If you name any place, it MUST be');
  });
});
