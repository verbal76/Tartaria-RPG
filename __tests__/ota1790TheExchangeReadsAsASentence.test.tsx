/**
 * OTA-1790 — THE EXCHANGE READS AS A SENTENCE.
 *
 * The reference pack's central instruction: *"The current transcript contains
 * the right facts but makes the player reconstruct the event from fragments.
 * Replace the math/problem-reading presentation with plain-language event
 * reporting."* Its target, verbatim: *"YOU HIT Conspiracy Architect 1 for 25
 * HP"*. Its prohibition, verbatim: *"Do not show the old equation-like
 * fragments, duplicated actor/outcome labels, arrows, or disconnected damage
 * values when the same information can be read as one sentence."*
 *
 * ⚠⚠⚠ WHAT SHIPPED WAS ALL FOUR OF THOSE, AND IT COST TWO ROWS PER SWING.
 * One player attack writes TWO log lines — the to-hit verdict and then the
 * damage — and VIS-2's strip drew each as its own instrument row:
 *
 *     YOU ▸ Raider                     HIT
 *     YOU ▸ Raider                     HIT   25
 *       Rusted Blade          Raider 12/40
 *
 * Duplicated actor labels, a duplicated stamp, an arrow, and a damage value
 * marooned in a column eight positions away from the words that explain it.
 *
 * ⚠⚠ THE FOLD IS PRESENTATION, AND THAT IS WHY NOTHING WAS LOST. Both lines
 * still reach `appendLog` with every number in them, so the disk log, the LOG
 * export and the owner's playtest reports read exactly as they did. Layer B's
 * prose rides on the EVENT instead of replacing the sentence — one authority,
 * two audiences. Asserted below, because "we did not break the log" is the kind
 * of claim that is only true until somebody tidies it.
 *
 * ⚠ AND THE ENEMY SIDE CARRIES NO WEAPON MARK, BY FINDING. `Enemy` has `attack`
 * and `damage` as dice strings and nothing that names an object. The only
 * weapon-shaped fact in reach is the damage type, and deriving a sword from
 * "slashing" would make the mark a DAMAGE-TYPE icon — which the pack says in so
 * many words the weapon glyph is not. So the column stays reserved and stays
 * empty there. The test pins the gap so a later pass has to argue with it.
 */
import fs from 'node:fs';
import path from 'node:path';

import { eventLine, eventSentence, foldExchanges } from '../app/engine/combatSentence';
import type { CombatEvent } from '../app/engine/combatEvent';
import { swungFamily, weaponFamilyArt, WEAPON_ART_SIZE } from '../app/engine/weaponFamilyArt';
import { hitProse, missProse, killProse, enemyStrikeProse, attackHit } from '../app/engine/combatProse';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const STRIP = 'app/components/CombatStrip.tsx';
const FEED = 'app/components/AdventureFeed.tsx';
const STORE = 'app/state/gameStore.ts';
const SENTENCE = 'app/engine/combatSentence.ts';

/* ⚠⚠⚠ GRADE THE CODE, NOT THE PROSE — TWENTY-EIGHTH SIGHTING, and this file
 * needs it twice over. Every ⚠ block above quotes the pack, and the pack quotes
 * the very fragments this pass deleted: `YOU ▸ Raider`, `arrow`, `stamp`. A
 * scanner reading raw source would find them in the comments that explain why
 * they are gone and report the defect as still present. */
function codeOf(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

const stripRaw = read(STRIP);
const stripCode = codeOf(stripRaw);

describe('OTA-1790 — the scanner is graded before it grades', () => {
  it('the stripper removes comments and keeps code', () => {
    expect(codeOf('const a = 1; // ▸ arrow\nconst b = 2;')).toBe('const a = 1; \nconst b = 2;');
    expect(codeOf('/* YOU ▸ Raider */const c = 3;')).toBe('const c = 3;');
    // a quoted comment marker is CODE and must survive
    expect(codeOf("const s = '// not a comment';")).toBe("const s = '// not a comment';");
  });

  it("the raw strip DOES name the fragments it deleted, and the stripped one does not", () => {
    // if this first line ever fails, the header stopped explaining itself
    expect(stripRaw).toContain('YOU ▸ Raider');
    expect(stripCode).not.toContain('▸');
  });
});

/* ─── A. THE EVENT LINE ──────────────────────────────────────────────────── */

const HIT: CombatEvent = {
  kind: 'damage', side: 'player', target: 'Conspiracy Architect 1',
  outcome: 'hit', dmg: 25, family: 'sword',
};
const INCOMING: CombatEvent = {
  kind: 'damage', side: 'enemy', actor: 'Conspiracy Architect 1',
  outcome: 'hit', dmg: 8,
};

describe("OTA-1790 — the pack's own sentences, word for word", () => {
  it('the player hit reads player → HIT → enemy → damage', () => {
    expect(eventSentence(HIT)).toBe('YOU HIT Conspiracy Architect 1 for 25 HP');
  });

  it('the enemy hit reads enemy → HIT YOU → damage', () => {
    expect(eventSentence(INCOMING)).toBe('Conspiracy Architect 1 HIT YOU for 8 HP');
  });

  it('a player miss names no damage at all', () => {
    expect(eventSentence({ ...HIT, outcome: 'miss', dmg: undefined }))
      .toBe('YOU MISSED Conspiracy Architect 1');
  });

  it('an enemy miss reads from the enemy', () => {
    expect(eventSentence({ ...INCOMING, outcome: 'miss', dmg: undefined }))
      .toBe('Conspiracy Architect 1 MISSED YOU');
  });

  /* ⚠⚠ THE PACK'S ZERO-DAMAGE CASE, VERBATIM. A blow that connects and does
   * nothing is the most confusing thing a transcript can print without saying
   * why, and the engine has always known why. */
  it('armour absorption is stated, not left as a silent zero', () => {
    expect(eventSentence({ ...INCOMING, dmg: 0 }))
      .toBe('Conspiracy Architect 1 HIT YOU for 0 HP — ARMOUR ABSORBED');
  });

  /* ⚠⚠⚠ A DEFENSIVE OUTCOME IS REPORTED FROM THE DEFENDER'S SIDE. `side` says
   * who swung; on a dodge nobody cares who swung. The pack's own example is
   * written this way — *"YOU BLOCKED Conspiracy Architect 1"*. */
  it('the enemy twisting clear of YOUR swing is reported as the enemy doing it', () => {
    expect(eventSentence({ ...HIT, outcome: 'dodged', dmg: undefined }))
      .toBe('Conspiracy Architect 1 DODGED YOU');
  });

  it('YOU evading THEIR swing is reported as you doing it', () => {
    expect(eventSentence({ ...INCOMING, outcome: 'evaded', dmg: undefined }))
      .toBe('YOU EVADED Conspiracy Architect 1');
  });

  it('a held slip reads the same way', () => {
    expect(eventSentence({ ...INCOMING, outcome: 'slipped', dmg: undefined }))
      .toBe('YOU SLIPPED Conspiracy Architect 1');
  });

  /* ⚠ THE TWO EXCEPTIONAL OUTCOMES KEEP THEIR EMPHASIS AND LOSE THEIR JARGON.
   * "YOU CRIT Raider" is not a sentence and "YOU FUMBLED Raider" is not English;
   * both survive as the sentence's closing note, which is where VIS-2's
   * `outcomeIsExceptional` rule wanted them all along. */
  it('a crit is a HIT with a note', () => {
    expect(eventSentence({ ...HIT, outcome: 'crit' }))
      .toBe('YOU HIT Conspiracy Architect 1 for 25 HP — CRITICAL');
  });

  it('a fumble is a MISS with a note', () => {
    expect(eventSentence({ ...HIT, outcome: 'fumble', dmg: undefined }))
      .toBe('YOU MISSED Conspiracy Architect 1 — FUMBLE');
  });

  /* ⚠⚠ A MISS OR A BLOCK MUST NOT FABRICATE DAMAGE — the pack's regression list
   * by name. The tail is the ONLY place a number can enter the sentence, and it
   * is gated on the outcome having landed. */
  it('nothing that did not land carries a damage tail', () => {
    for (const o of ['miss', 'fumble', 'dodged', 'evaded', 'slipped'] as const) {
      const l = eventLine({ ...HIT, outcome: o, dmg: 25 })!;
      expect([o, l.tail]).toEqual([o, '']);
    }
  });

  it('a reward, a defeat and a status are not exchanges and get no sentence', () => {
    for (const kind of ['reward', 'defeat', 'status'] as const) {
      expect(eventLine({ ...HIT, kind })).toBeNull();
    }
  });

  /* ⚠⚠⚠ THE LONG-NAME RULE. The pack: *"Allow long enemy names to wrap/truncate
   * according to a governed rule without scrambling HIT/target/damage order."*
   * The governed rule is WRAP — nothing is clipped in the data — and the order
   * is fixed by the builder, so a 60-character name changes the sentence's
   * length and nothing else about it. */
  it('a very long enemy name changes only the name', () => {
    const long = 'Thrice-Bound Architect of the Drowned Cartographic Assembly 11';
    const l = eventLine({ ...HIT, target: long })!;
    expect(l.subject).toBe('YOU');
    expect(l.verb).toBe('HIT');
    expect(l.object).toBe(long);
    expect(l.tail).toBe(' for 25 HP');
    expect(eventSentence({ ...HIT, target: long })).toBe(`YOU HIT ${long} for 25 HP`);
  });

  it('an unnamed combatant is the player', () => {
    expect(eventLine({ kind: 'damage', side: 'player', outcome: 'hit', dmg: 3 })!.object).toBe('YOU');
  });
});

/* ─── B. THE FOLD ────────────────────────────────────────────────────────── */

const swing = (over: Partial<CombatEvent>): CombatEvent => ({
  kind: 'swing', side: 'player', target: 'Raider', outcome: 'hit',
  roll: { d20: 14, bonus: 6, bonusLabel: 'STR 6', total: 20, vs: 13, vsLabel: 'Raider AC' },
  ...over,
});
const entry = (id: string, ev?: CombatEvent) => ({ id, meta: ev ? { cmb: ev } : undefined });

describe('OTA-1790 — one exchange, one row', () => {
  it('a verdict and its damage become a single row carrying both', () => {
    const rows = foldExchanges([entry('a', swing({})), entry('b', HIT2())]);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.kind).toBe('entry');
    expect(r.key).toBe('b');
    expect(r.kind === 'entry' && r.event?.dmg).toBe(25);
    // the verdict's roll survived the fold — mechanics stay inspectable
    expect(r.kind === 'entry' && r.event?.roll?.d20).toBe(14);
  });

  function HIT2(): CombatEvent {
    return { kind: 'damage', side: 'player', target: 'Raider', outcome: 'hit', dmg: 25, family: 'sword' };
  }

  /* ⚠⚠ THE CRIT SURVIVES THE MERGE. The resolver writes `crit` on the VERDICT
   * and a plain `hit` on the damage that follows it, so a naive merge would
   * silently demote every critical hit in the game to an ordinary one. */
  it('an exceptional verdict wins over the damage line’s plain outcome', () => {
    const rows = foldExchanges([entry('a', swing({ outcome: 'crit' })), entry('b', HIT2())]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind === 'entry' && rows[0]!.event?.outcome).toBe('crit');
    expect(eventSentence(rows[0]!.kind === 'entry' ? rows[0]!.event : null))
      .toBe('YOU HIT Raider for 25 HP — CRITICAL');
  });

  /* ⚠ A VERDICT NOTHING CONSUMES KEEPS ITS ROW. A dodge has no damage line
   * coming; the swing is the whole story. */
  it('a dodged swing still renders, on its own', () => {
    const rows = foldExchanges([entry('a', swing({ outcome: 'dodged' }))]);
    expect(rows).toHaveLength(1);
    expect(eventSentence(rows[0]!.kind === 'entry' ? rows[0]!.event : null)).toBe('Raider DODGED YOU');
  });

  /* ⚠⚠⚠ CHRONOLOGY IS NOT NEGOTIABLE — the pack's *"two-sided exchange preserves
   * chronology"*. The fold removes rows; it never moves one. */
  it('a two-sided exchange keeps its order, and each side folds separately', () => {
    const enemySwing: CombatEvent = {
      kind: 'swing', side: 'enemy', actor: 'Raider', outcome: 'hit',
      roll: { d20: 11, bonus: 4, bonusLabel: 'ATK 4', total: 15, vs: 12, vsLabel: 'your AC' },
    };
    const enemyDmg: CombatEvent = { kind: 'damage', side: 'enemy', actor: 'Raider', outcome: 'hit', dmg: 8 };
    const rows = foldExchanges([
      entry('a', swing({})), entry('b', HIT2()),
      entry('c', enemySwing), entry('d', enemyDmg),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['b', 'd']);
    expect(rows.map((r) => eventSentence(r.kind === 'entry' ? r.event : null)))
      .toEqual(['YOU HIT Raider for 25 HP', 'Raider HIT YOU for 8 HP']);
  });

  /* ⚠⚠ THE MATCH IS NARROW BECAUSE A GROUP FIGHT INTERLEAVES. A five-raider
   * round writes several exchanges into one sweep, and a loose match would
   * staple one raider's roll onto another raider's blow. */
  it("a verdict never pairs with a different combatant's damage", () => {
    const rows = foldExchanges([
      entry('a', swing({ target: 'Raider' })),
      entry('b', { kind: 'damage', side: 'player', target: 'Wretch', outcome: 'hit', dmg: 4 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['a', 'b']);
  });

  it('a second verdict for the same foe closes the first one’s window', () => {
    const rows = foldExchanges([
      entry('a', swing({})),
      entry('b', swing({ outcome: 'miss' })),
      entry('c', { kind: 'damage', side: 'player', target: 'Raider', outcome: 'miss' }),
    ]);
    // 'a' found nothing before 'b' interrupted it and keeps its own row
    expect(rows.map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('a lull between the verdict and the blow does not break the pair', () => {
    // the enemy damage line is dispatched in a microtask, so other lines land between
    const rows = foldExchanges([
      entry('a', swing({ side: 'enemy', actor: 'Raider', target: undefined })),
      entry('mid'),
      entry('b', { kind: 'damage', side: 'enemy', actor: 'Raider', outcome: 'hit', dmg: 8 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['mid', 'b']);
  });

  it('a defeat consumes its killing verdict, leaving no orphan above it', () => {
    const rows = foldExchanges([
      entry('a', swing({})),
      entry('b', { kind: 'defeat', side: 'player', defeated: 'Raider', dmg: 25, family: 'sword' }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['b']);
    expect(rows[0]!.kind === 'entry' && rows[0]!.event?.roll?.d20).toBe(14);
  });

  /* ⚠ VIS-2's REWARD CLUSTERING MOVED HERE UNCHANGED, so the behaviour it
   * defends is graded in its new home too. */
  it('adjacent rewards still cluster, and a gap still breaks the run', () => {
    const loot = (n: string): CombatEvent => ({ kind: 'reward', side: 'player', loot: [{ name: n }] });
    const together = foldExchanges([entry('r1', loot('Bolt')), entry('r2', loot('Rag'))]);
    expect(together).toHaveLength(1);
    expect(together[0]!.kind).toBe('rewards');
    const split = foldExchanges([entry('r1', loot('Bolt')), entry('x'), entry('r2', loot('Rag'))]);
    expect(split.map((r) => r.kind)).toEqual(['rewards', 'entry', 'rewards']);
  });

  it('a plain prose line passes through with no event', () => {
    const rows = foldExchanges([entry('w')]);
    expect(rows).toEqual([{ key: 'w', kind: 'entry', index: 0, event: null }]);
  });
});

/* ─── C. THE MARKS ───────────────────────────────────────────────────────── */

describe('OTA-1790 — the weapon mark says what delivered the blow', () => {
  it('bare hands are a family, not a missing weapon', () => {
    expect(swungFamily(null, true)).toBe('unarmed');
    // and the row is ignored when the swing was bare-handed: a punch is a punch
    // even while a sword is in the main hand
    expect(swungFamily({ tags: ['blade'], weaponKind: 'melee' }, true)).toBe('unarmed');
    expect(weaponFamilyArt(swungFamily(null, true))).toBeDefined();
  });

  it('a weapon swing reads the row the engine resolved', () => {
    expect(swungFamily({ tags: ['blade'], weaponKind: 'melee' }, false)).toBe('sword');
    expect(swungFamily({ tags: ['crossbow'], weaponKind: 'ranged' }, false)).toBe('crossbow');
    expect(swungFamily({ tags: ['runecaster'], weaponKind: 'runecaster' }, false)).toBe('runecaster');
  });

  it('an unresolvable row draws nothing rather than something wrong', () => {
    expect(swungFamily({ tags: [] }, false)).toBeNull();
    expect(weaponFamilyArt(swungFamily({ tags: [] }, false))).toBeUndefined();
  });

  /* ⚠⚠⚠ THE DENSITY IS DERIVED, NOT PICKED. The event line is 14/20 and the mark
   * is exactly one line box tall, so it can never make an exchange taller than
   * the sentence it labels. The pack allowed this explicitly — *"Do not blindly
   * force 28dp if this transcript context demonstrably requires a smaller
   * governed density"* — and the derivation is what makes it not a taste call. */
  it('the mark is one event-line box tall, and the column is wider than the mark', () => {
    expect(WEAPON_ART_SIZE.transcript).toBe(20);
    expect(stripCode).toContain('lineHeight: 20');
    expect(WEAPON_ART_SIZE.column).toBeGreaterThan(WEAPON_ART_SIZE.transcript);
  });

  /* ⚠⚠ THE COLUMN IS RESERVED WHETHER OR NOT THERE IS A PICTURE. Otherwise
   * successive exchanges would not align, which is the one thing the pack asks
   * of this column by name. */
  it('the column keeps its size with no artwork in it', () => {
    expect(stripCode).toMatch(/markCol:\s*\{[^}]*width:\s*WEAPON_ART_SIZE\.column/);
    expect(stripCode).toMatch(/markCol:\s*\{[^}]*height:\s*WEAPON_ART_SIZE\.transcript/);
  });

  /* ⚠⚠⚠ TWO FAMILIES, TWO TABLES, AND THE STRIP MAY NOT CONFUSE THEM. The pack:
   * *"Weapon glyph = what delivered the attack. Damage/coating glyph = what kind
   * of damage/effect occurred. Do not collapse those concepts into one icon."* */
  it('the weapon mark comes from one table and the coating mark from the other', () => {
    expect(stripCode).toMatch(/weaponFamilyArt\(family as WeaponFamily \| undefined\)/);
    expect(stripCode).toContain('glyphArt(ev.coating)');
    // and the coating mark is only ever drawn on a status row
    const statusRow = stripCode.slice(stripCode.indexOf('function StatusRow'), stripCode.indexOf('export function CombatStrip'));
    expect(statusRow).toContain('glyphArt(ev.coating)');
    expect(statusRow).not.toContain('weaponFamilyArt');
  });
});

/* ─── D. LAYER B ─────────────────────────────────────────────────────────── */

describe('OTA-1790 — the prose is a consequence, not a second copy of the numbers', () => {
  const NUMBERS = /\d/;

  it('no player prose restates the damage or the remaining HP', () => {
    for (let i = 0; i < 60; i++) {
      expect(hitProse('Rusted Blade', 'Raider')).not.toMatch(NUMBERS);
      expect(missProse('Rusted Blade', 'Raider')).not.toMatch(NUMBERS);
      expect(killProse('Rusted Blade', 'Raider')).not.toMatch(NUMBERS);
      expect(enemyStrikeProse('Raider', 'slashing')).not.toMatch(NUMBERS);
    }
  });

  /* ⚠ THE WEAPON IS NAMED WHENEVER IT IS KNOWN — *"Do not reduce every player
   * hit to generic 'you attack.'"* — and never invented when it is not. */
  it('a named weapon is named, and bare hands invent nothing', () => {
    const named = new Set(Array.from({ length: 40 }, () => hitProse('Fire-coated Sword', 'Raider')));
    for (const line of named) expect(line.toLowerCase()).toContain('fire-coated sword');
    const bare = new Set(Array.from({ length: 40 }, () => hitProse(null, 'Raider')));
    for (const line of bare) expect(line.toLowerCase()).not.toContain(' with the ');
  });

  /* ⚠⚠⚠ THE ARMOUR CLAIM IS PASSED, NEVER GUESSED. *"Your armour turns the blow
   * aside"* is a statement about mechanics; printing it on a blow the plate did
   * not touch would be a lie the player cannot check. */
  it('the armour line appears only when the caller says the armour acted', () => {
    const held = new Set(Array.from({ length: 40 }, () => enemyStrikeProse('Raider', 'slashing', { armour: true })));
    for (const line of held) expect(/armour|plate/i.test(line)).toBe(true);
    const through = new Set(Array.from({ length: 40 }, () => enemyStrikeProse('Raider', 'slashing')));
    for (const line of through) expect(/armour turns|plate takes/i.test(line)).toBe(false);
  });

  /* ⚠⚠ THE LOG TEXT IS UNTOUCHED, WHICH IS WHY THE DISK LOG LOST NOTHING. The
   * resolver still writes the full sentence — damage and remaining HP in it —
   * and the shorter prose rides on the EVENT beside it. */
  it('the log line the resolver writes still carries every number', () => {
    const line = attackHit('Rusted Blade', 'Raider', 25, 12);
    expect(line).toContain('25');
    expect(line).toContain('12');
    expect(line.toLowerCase()).toContain('rusted blade');
  });
});

/* ─── E. THE WIRING, AT ITS CALL SITES ───────────────────────────────────── */

const storeCode = codeOf(read(STORE));

describe('OTA-1790 — the engine writes the facts, the renderer reads them', () => {
  /* ⚠⚠⚠ THE MARK IS NEVER DERIVED FROM THE DISPLAY NAME. The pack: *"Use the
   * actual resolved weapon/item family from combat state, not prose string
   * matching."* `weaponName` may already carry a coating prefix, so the family
   * is resolved from the catalog row the swing actually fights with. */
  it('the family is resolved from the resolved row, beside the swing', () => {
    expect(storeCode).toMatch(/const swingFamily = swungFamily\(getEquippedWeapon\(player, [\s\S]{0,80}?\), swungNoun === null\)/);
    // the display name and the family are two different questions of one noun
    expect(storeCode).toContain('const weaponName = coatedWeaponNoun(player, swungNoun);');
  });

  it('every player exchange event carries the family and its prose', () => {
    for (const site of [
      /kind: 'damage', side: 'player'[^)]*outcome: 'hit'[^)]*family: swingFamily, prose: hitProse\(/,
      /kind: 'damage', side: 'player'[^)]*outcome: 'miss'[^)]*family: swingFamily, prose: missProse\(/,
      /kind: 'defeat', side: 'player'[^)]*family: swingFamily, prose: killProse\(/,
      /kind: 'swing', side: 'player'[^)]*family: swingFamily/,
    ]) expect(storeCode).toMatch(site);
  });

  /* ⚠ A THROW IS A THROW WHATEVER THE ITEM ALSO IS — the pack's own rule, and
   * the throw path is the only site that can know it happened. */
  it('the throw path stamps the thrown family', () => {
    expect(storeCode).toMatch(/family: 'thrown'/);
  });

  /* ⚠⚠ THE COATING IS NAMED AT THE PROC, AND ONLY AT THE PROC. `applyCoatingProc`
   * runs on a roll that actually landed; nothing else in the store writes a
   * `coating` onto an event. */
  it('exactly one site claims a coating, and it is the proc', () => {
    const claims = storeCode.match(/coating: proc\.kind/g) ?? [];
    expect(claims).toHaveLength(1);
    expect(storeCode).not.toMatch(/coating: \w*[Ww]eapon\.coating/);
  });

  /* ⚠⚠⚠ THE ENEMY GAP, PINNED. See the header: the engine has no enemy weapon
   * family to read, and inferring one from the damage type would turn the weapon
   * mark into a damage-type icon. */
  it('the incoming blow carries prose and deliberately no family', () => {
    const res = codeOf(read('app/state/combatResolution.ts'));
    const site = /cmb\(\{ kind: 'damage', side: 'enemy'[\s\S]{0,400}?\}\)\)/.exec(res)?.[0] ?? '';
    expect(site).not.toBe('');
    expect(site).toContain('enemyStrikeProse(');
    expect(site).not.toContain('family:');
  });
});

describe('OTA-1790 — the renderer holds layout and nothing else', () => {
  /* ⚠⚠⚠ THE FOLD MAKES NEW OBJECTS, SO THE WINDOW HAD TO BECOME STABLE.
   * `visible` was recomputed on every render, which was wasteful but harmless
   * while `rows` only handed each memoised `FeedRow` its immutable ENTRY. A
   * MERGED exchange is a new object, so an unmemoised window means a fresh
   * `event` prop on every folded row on every log line — the five-raider stall
   * OTA-1696 measured and fixed, reintroduced through the back door. `gameLog`
   * is the store's own array and is stable between appends. */
  it('the feed memoises its window, so a folded event keeps its identity', () => {
    const feed = codeOf(read(FEED));
    expect(feed).toMatch(/const visible = useMemo\([\s\S]{0,300}\[entries\],\s*\)/);
    expect(feed).toMatch(/const rows = useMemo\(\(\) => foldExchanges\(visible\), \[visible\]\)/);
    // and the row really is memoised, or none of the above buys anything
    expect(feed).toContain('const FeedRow = React.memo(');
  });

  it('nothing in the strip or the feed parses a combat sentence', () => {
    for (const src of [stripCode, codeOf(read(FEED))]) {
      expect(src).not.toMatch(/entry\.text\.(match|split|indexOf|includes)/);
      expect(src).not.toMatch(/\btext\.match\(/);
    }
    // the strip never re-derives the words: it asks the builder for them
    expect(stripCode).toContain('const line = eventLine(ev);');
  });

  /* ⚠⚠ ONE TEXT NODE FOR THE SENTENCE. Nesting the parts inside one `<Text>` is
   * what makes the wrap the platform's problem; sibling views are what would let
   * HIT / target / damage come apart at a narrow width. */
  it('the sentence is one wrapping text node with the parts nested inside it', () => {
    const row = stripCode.slice(stripCode.indexOf('function ExchangeRow'), stripCode.indexOf('function DefeatRow'));
    expect(row).toContain('<Text style={styles.line}>');
    for (const part of ['line.subject', 'line.verb', 'line.object', 'line.tail', 'line.note']) {
      expect(row).toContain(part);
    }
    // and it is not clamped: a long name is allowed its second line
    expect(/styles\.line[\s\S]{0,200}numberOfLines/.test(row)).toBe(false);
  });

  /* ⚠⚠⚠ THE FRAGMENTS ARE GONE FROM THE CODE, not merely from one screenshot. */
  it('the arrow, the stamp column and the damage column no longer exist', () => {
    for (const gone of ['styles.arrow', 'styles.result', '<Stamp', 'styles.dmg', 'styles.subRow']) {
      expect(stripCode).not.toContain(gone);
    }
  });

  /* ⚠⚠⚠ `row-reverse` HAD TO GO, AND THE STRUCTURAL DIRECTION CUE DID NOT.
   * VIS-2 flipped the whole row to move the spine to the far side, which a
   * reserved glyph column cannot survive — the mark would land on a different x
   * on every incoming blow and the column would stop being one. So BOTH edges
   * are reserved and one of them is lit: 4px buys back the same non-chromatic
   * "which way did this go" cue, and the mark's x is now identical in both
   * directions rather than merely close. */
  it('both edges are reserved and exactly one is lit, per direction', () => {
    expect(stripCode).not.toContain("flexDirection: 'row-reverse'");
    expect(stripCode).toContain('fromPlayer ? styles.spineOut : styles.spineOff');
    expect(stripCode).toContain('fromPlayer ? styles.spineOff : styles.spineIn');
    // the unlit edge still occupies its width, or the column would shift
    expect(stripCode).toMatch(/spine:\s*\{[^}]*width: 2/);
    expect(stripCode).toMatch(/spineOff:\s*\{[^}]*'transparent'/);
  });

  /* ⚠ AND THE SENTENCE IS THE THIRD CUE, AND THE STRONGEST OF THEM. VIS-2 had
   * three structural cues — spine edge, reading direction, name order — none of
   * which was English. `YOU HIT Raider` and `Raider HIT YOU` need no convention
   * learned and survive a monochrome screenshot outright. */
  it('the word order alone states the direction', () => {
    const out = eventSentence(HIT);
    const inc = eventSentence(INCOMING);
    expect(out.indexOf('YOU')).toBeLessThan(out.indexOf('Conspiracy'));
    expect(inc.indexOf('Conspiracy')).toBeLessThan(inc.indexOf('YOU'));
  });

  /* ⚠⚠ WHAT THE TARGET HAS LEFT SURVIVED VIS-2's SECOND ROW. In a group fight
   * `EnemyPanel` shows the ACTIVE enemy only, so this is the one place the
   * player learns what they left on the body they just hit. */
  it('the standing readout rides inside the sentence, and only on a landed blow', () => {
    expect(eventSentence({ ...HIT, hp: { now: 6, max: 24 } }))
      .toBe('YOU HIT Conspiracy Architect 1 for 25 HP · 6/24');
    expect(eventLine({ ...HIT, outcome: 'miss', dmg: undefined, hp: { now: 24, max: 24 } })!.standing).toBe('');
    // it is part of the same text run, so it cannot float into a column
    const row = stripCode.slice(stripCode.indexOf('function ExchangeRow'), stripCode.indexOf('function DefeatRow'));
    expect(row).toContain('{line.standing}');
    expect(row.indexOf('{line.standing}')).toBeLessThan(row.indexOf('</Text>\n        <View'));
  });

  /* ⚠ THE ROW DOES NOT DECLARE ITS OWN HEIGHT. The pack: *"Do not hard-code a
   * transcript row height around one screenshot or one enemy name."* `minHeight`
   * keeps a one-line exchange as dense as it was; a wrapped one grows. */
  it('the exchange row has a floor, not a fixed height', () => {
    expect(stripCode).toMatch(/row:\s*\{[^}]*minHeight: STRIP_METRICS\.row/);
    expect(stripCode).not.toMatch(/row:\s*\{[^}]*[^n]height: STRIP_METRICS\.row/);
    expect(stripCode).toMatch(/row:\s*\{[^}]*alignItems: 'flex-start'/);
  });

  /* ⚠⚠ THE TRANSCRIPT IS INFORMATIONAL. The pack: *"Keep touch targets and
   * transcript rows independent; transcript glyphs are informational, not
   * buttons."* The only press this row has ever had is the roll disclosure, and
   * it is disabled outright when there is no roll to disclose. */
  it('a mark is not a button and a row with no maths cannot be pressed', () => {
    const row = stripCode.slice(stripCode.indexOf('function ExchangeRow'), stripCode.indexOf('function DefeatRow'));
    expect(row).toContain('disabled={!hasMath}');
    expect(row).toContain('onPress={hasMath ? onToggle : undefined}');
    const mark = stripCode.slice(stripCode.indexOf('function WeaponMark'), stripCode.indexOf('function ExchangeRow'));
    expect(mark).not.toContain('onPress');
    expect(mark).toContain('accessible={false}');
  });

  /* ⚠ THE SCREEN READER HEARS THE SENTENCE, not a third phrasing invented here.
   * It used to say "YOU attacks Raider: HIT, 25 damage". */
  it('the accessibility label is built from the same parts as the visible line', () => {
    const row = stripCode.slice(stripCode.indexOf('function ExchangeRow'), stripCode.indexOf('function DefeatRow'));
    expect(row).toMatch(/accessibilityLabel=\{`\$\{line\.subject\} \$\{line\.verb\}/);
    expect(row).not.toContain('attacks');
  });
});

/* ─── F. THE EXTRACTION ──────────────────────────────────────────────────── */

describe('OTA-1790 — the prose came home, and the store gave back more than it took', () => {
  /* ⚠⚠⚠ THE OWNER'S RULING WAS *"EXTRACT, DO NOT JUST RAISE IT"*, and the
   * ceiling was at 36,998 of 36,998 with nothing left. Five pure functions of
   * (weapon, name, damage) were living at the bottom of the store; this file was
   * already named for them and already declared the rule they obey. */
  it('the four attack lines and their helper live in combatProse now', () => {
    const prose = read('app/engine/combatProse.ts');
    for (const fn of ['weaponPhrase', 'attackOpener', 'attackHit', 'attackMiss', 'attackKill']) {
      expect(prose).toContain(`export function ${fn}`);
      expect(storeCode).not.toMatch(new RegExp(`^function ${fn}\\(`, 'm'));
    }
    expect(storeCode).toMatch(/import \{[^}]*attackOpener[^}]*\} from '\.\.\/engine\/combatProse'/);
  });

  it('combatProse stayed pure — no store, no components, no native', () => {
    const prose = read('app/engine/combatProse.ts');
    const imports = [...prose.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    expect(imports).toEqual(['./rng']);
  });

  /* ⚠⚠ AND THE MOVE WAS VERBATIM. Same words, same pools, same order — every
   * line the game has ever printed still prints. */
  it('the moved lines are the lines that shipped', () => {
    const prose = read('app/engine/combatProse.ts');
    for (const line of [
      '`Your strike${wp} lands for ${dmg}. ${enemyName} staggers — ${remainingHp} HP remaining. It answers.`',
      '`Half a beat too slow. ${enemyName} steps inside your reach.`',
      '`The killing blow${wp}: ${dmg}. ${enemyName} drops where it stood.`',
      '`You bring the ${w.toLowerCase()} to bear on ${enemyName}.`',
    ]) expect(prose).toContain(line);
  });

  it('the store shrank, and the ceiling can be lowered onto it', () => {
    const gate = read('scripts/check-store-ceiling.mjs');
    const ceiling = Number(/CEILING\s*=\s*(\d+)/.exec(gate)?.[1]);
    const lines = read(STORE).split('\n').length;
    expect(lines).toBeLessThanOrEqual(ceiling);
    // the ratchet is a ratchet: it must sit ON the measurement, not above it
    expect(ceiling).toBe(lines);
  });
});

/* ─── G. THE BUILDER IS ITS OWN AUTHORITY ────────────────────────────────── */

describe('OTA-1790 — one place decides the word order', () => {
  it('nothing outside combatSentence builds the sentence', () => {
    const sentence = codeOf(read(SENTENCE));
    expect(sentence).toContain("outcomeLanded(o) ? 'HIT' : 'MISSED'");
    for (const rel of [STRIP, FEED, STORE, 'app/state/combatResolution.ts']) {
      const src = codeOf(read(rel));
      expect(src).not.toMatch(/'\s*HIT\s*'\s*:\s*'\s*MISSED\s*'/);
      expect(src).not.toContain('ARMOUR ABSORBED');
    }
  });

  it('the builder reads the authority and never a rendered string', () => {
    const sentence = codeOf(read(SENTENCE));
    expect(sentence).not.toContain('entry.text');
    expect(sentence).not.toMatch(/\.match\(|RegExp\(/);
  });
});
