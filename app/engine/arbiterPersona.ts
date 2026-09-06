// OTA-1067 — PHASE 5: THE ARBITER BECOMES SOMEONE.
//
// The build plan, verbatim: "Memory of what you've done, an opinion that
// shifts with your choices, and an arc across the nine Cores. It has more
// screen time than any character in the game and currently less personality
// than any of them."
//
// That last sentence is the whole brief, and it is fair. Today the Arbiter is
// a pool of good lines picked at random. ARBITER_PERSONAL_BEATS has thirteen
// entries and one of them is "There is a name I have not used in a long time.
// Not even to myself. Not yet to you." — a promise the game has never had any
// machinery to keep. He says it on hour two and again on hour ninety, to a
// player who robbed him blind and to a player who carried nine Cores out of
// the mud, in exactly the same tone, and then never mentions it again.
//
// This file is the machinery. Three things, and they are deliberately
// separate:
//
//   STANCE  — WHERE HE IS, an arc across the nine Cores. Content changes:
//             what he is willing to talk about at all. Rises only.
//   REGARD  — WHAT HE THINKS OF YOU, derived from what you have actually
//             done. Tone changes: how he says any of it. Moves both ways.
//   MEMORY  — WHAT HE NAMES. Concrete recorded facts — the person you
//             wronged, the debt you made good, the question you answered in
//             Phase 3 — surfaced by name instead of alluded to.
//
// ── DERIVED, NOT STORED (the Phase 3 rule, again) ────────────────────────
// Regard and stance are PURE FUNCTIONS of the save. Nothing accumulates a
// hidden "arbiter points" counter that a bad migration could drop or a
// duplicated call could double. The only thing persisted is
// `player.arbiterBeatsSeen` — the set of one-shot lines already SPOKEN —
// because "has he said this yet" is genuinely not derivable from anything
// else. Same shape as tideStageSeen and storyChoices, same reasoning.
//
// ── AND NOTHING HERE ROLLS DICE ──────────────────────────────────────────
// npcMemory made this argument first and it holds harder for the Arbiter: he
// is one continuous voice, so his opinion of you must be a function of your
// conduct, not of a coin. Callers supply a rotation counter for variety; the
// same state always yields the same line.
import type { PlayerCharacter, WorldMemory } from './types';
import { choiceKeys, optionById, forkById } from './storyForks';
// ⚠ OTA-1716 — the roster, so a standing row can name WHO vouches for you or
// wants you dead. `factionDisplayName` lives in contractRefusal, which imports
// half the contract stack; this needs one name lookup, so it reads the roster
// directly rather than dragging that in.
import { FACTIONS } from './factions';
import { pressureOf } from './pressure';
import personaData from '../data/lore/arbiter-persona.json';

// ── STANCE: THE ARC ACROSS THE NINE CORES ────────────────────────────────

export type ArbiterStance = 'witness' | 'interested' | 'invested' | 'implicated' | 'named';

/** Ascending. Index is the ordering; nothing else may infer position. */
export const STANCE_ORDER: readonly ArbiterStance[] = [
  'witness', 'interested', 'invested', 'implicated', 'named',
] as const;

/** Cores required to reach each stance. Nine Cores, five stances — the last
 *  one is the full set, because 'named' is the payoff of the line he has been
 *  dangling since OTA-236 and a payoff you can get eight-ninths of the way to
 *  is not a payoff. */
export const STANCE_MIN_CORES: Record<ArbiterStance, number> = {
  witness: 0,
  interested: 1,
  invested: 3,
  implicated: 6,
  named: 9,
};

export function stanceFor(coresRecovered: number): ArbiterStance {
  let out: ArbiterStance = 'witness';
  for (const s of STANCE_ORDER) {
    if (coresRecovered >= STANCE_MIN_CORES[s]) out = s;
  }
  return out;
}

export function stanceOf(p: Pick<PlayerCharacter, 'mainQuest'> | null | undefined): ArbiterStance {
  return stanceFor(p?.mainQuest?.coresRecovered?.length ?? 0);
}

// ── REGARD: THE OPINION ──────────────────────────────────────────────────

export type RegardBand = 'cold' | 'wary' | 'even' | 'warm' | 'kin';
export const REGARD_ORDER: readonly RegardBand[] = ['cold', 'wary', 'even', 'warm', 'kin'] as const;

/** ⚠ Three tones, not five. The band is what he thinks; the tone is what a
 *  writer can actually keep distinct across sixty lines. Splitting the
 *  authoring five ways produced pairs nobody could tell apart in play, which
 *  is worse than three that read clearly. */
export type ArbiterTone = 'hard' | 'plain' | 'close';

export function toneFor(band: RegardBand): ArbiterTone {
  if (band === 'cold' || band === 'wary') return 'hard';
  if (band === 'even') return 'plain';
  return 'close';
}

/** ⚠ EVERY CONTRIBUTION IS CLAMPED, AND SO IS THE TOTAL.
 *
 *  The exploit lens on an opinion system is always the same: find the input
 *  that repeats cheaply and farm it. Reading lore is free and repeatable, so
 *  it caps at +8. Gifts are cheap at high TC, so they cap at +6. Nothing here
 *  can be ground; every dial saturates, and the total saturates again. What
 *  MOVES regard late in a run is conduct that costs something — debts made
 *  good, relics kept out of a vendor's hands, the answers you gave in Phase 3.
 *
 *  The negatives are clamped for the opposite reason: a player who tanked
 *  every faction in the first hour should not be locked out of the arc for the
 *  rest of the run. Cold is a place you can climb out of. */
export const REGARD_MIN = -60;
export const REGARD_MAX = 60;

export interface RegardPart {
  /** Shown on the character sheet. The player is allowed to know why. */
  label: string;
  value: number;
  /** OTA-1161 — marks a row the sheet can DRILL INTO. 'gifts': the count is a
   *  summary of `npcRelations[].gifts`, and the player asked to see what he
   *  gave, to whom, and how it landed. ⚠ OTA-1683 — 'wrongs': the owner tapped
   *  "2 wrongs still standing" and nothing opened; it now lists who holds each
   *  wrong and what clears it (see npcMemory.wrongsLedger). Absent = a plain,
   *  flat row. */
  kind?: 'gifts' | 'wrongs';
  /** ⚠⚠ OTA-1716 — WHAT THIS ROW IS, IN THE PLAYER'S OWN SHEET. Owner: *"in the
   *  'what moved it' section... everything listed in it should be able to be
   *  tapped on to see what it is. as of now, only wrongs and gifts do."* He is
   *  right, and the two that did drill were the two that happened to own a
   *  ledger — which made tappability an accident of implementation rather than
   *  a promise. Every row now carries its own explanation, BUILT AT THE SAME
   *  SITE AS ITS NUMBER from the same values, so the drill-down cannot drift
   *  from the arithmetic the way a hand-written help screen would. Lines are
   *  rendered in order; the first names the quantity, the last names the rule
   *  and the cap. */
  detail?: string[];
}

const FORK_REGARD: Record<string, number> = personaData.forkRegard as Record<string, number>;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** OTA-1716 — a faction's own name for the two standing rows. Falls back to the
 *  de-underscored id, which reads as the defect it would be. */
function factionName(id: string | undefined): string {
  if (!id) return 'someone';
  return FACTIONS.find((f) => f.id === id)?.name ?? id.replace(/_/g, ' ');
}

/** OTA-1716 — "+4 each, to a ceiling of +12", written once so a row's rule and
 *  its cap always agree with the clamp directly above it. */
function ruleLine(per: string, cap: number): string {
  return `${per} ${cap >= 0 ? `Ceiling +${cap}` : `Floor ${cap}`}.`;
}

/** The itemised opinion. Exported so the character sheet can render exactly
 *  the numbers the engine used — a hidden score the player cannot inspect is
 *  the same legibility failure Phase 4's tide lines were written to avoid. */
export function regardParts(
  p: Pick<PlayerCharacter, 'corruption' | 'menace' | 'factionStanding' | 'titleProgress' | 'storyChoices' | 'pressure'> | null | undefined,
  wm: Pick<WorldMemory, 'npcRelations'> | null | undefined,
): RegardPart[] {
  if (!p) return [];
  const parts: RegardPart[] = [];
  const rels = Object.values(wm?.npcRelations ?? {});

  // ── What you did to people ──
  let outstanding = 0, cleared = 0, gifts = 0;
  // OTA-1716 — who each cleared debt was cleared WITH. Same pass, same numbers.
  const clearedWith: string[] = [];
  for (const r of rels) {
    cleared += r.amendsCleared ?? 0;
    if ((r.amendsCleared ?? 0) > 0) {
      clearedWith.push(`${r.name}${r.role ? ` (${r.role})` : ''} — ${r.amendsCleared} cleared`);
    }
    outstanding += Math.max(0, (r.wrongs ?? 0) - (r.amendsCleared ?? 0));
    gifts += (r.gifts ?? []).length;
  }
  if (outstanding > 0) parts.push({ label: `${outstanding} wrong${outstanding === 1 ? '' : 's'} still standing`, value: clamp(outstanding * -6, -24, 0), kind: 'wrongs' });
  if (cleared > 0) {
    parts.push({
      label: `${cleared} debt${cleared === 1 ? '' : 's'} made good`,
      value: clamp(cleared * 4, 0, 12),
      detail: [...clearedWith, ruleLine('A wrong you paid off at its holder\u2019s own counter. +4 each.', 12)],
    });
  }
  // ⚠ OTA-1161 — "things given away" → "gifts given". The owner's wording, and the
  // better one: "given away" reads as loss or charity when the mechanic is a gift
  // with a named recipient and a reaction. It is also the word every OTHER surface
  // uses (the GIVE button, the gift picker, giftBoons, giftTastes) — this sheet row
  // was the only place calling it something else.
  // ⚠ `kind: 'gifts'` is what makes the row tappable on the sheet. The count here and
  // the ledger it opens are built from the SAME npcRelations[].gifts arrays, so the
  // number and the list can never disagree.
  if (gifts > 0) parts.push({ label: `${gifts} gift${gifts === 1 ? '' : 's'} given`, value: clamp(gifts, 0, 6), kind: 'gifts' });

  // ── What you carry ──
  const corruption = p.corruption ?? 0;
  if (corruption > 40) {
    parts.push({
      label: 'the Aether is in you',
      value: clamp(-Math.floor((corruption - 40) / 10), -15, 0),
      detail: [
        `Corruption ${corruption}. Nothing counts until 40; you are ${corruption - 40} past it.`,
        ruleLine('1 against you for every 10 over 40.', -15),
      ],
    });
  }
  const menace = p.menace ?? 0;
  if (menace >= 10) {
    parts.push({
      label: 'you rule by fear',
      value: clamp(-Math.floor(menace / 10), -12, 0),
      detail: [`Menace ${menace}, earned by threat and by what you did in front of people.`,
        ruleLine('1 against you for every 10.', -12)],
    });
  }

  // ── How the world reads you ──
  const standings = p.factionStanding ?? [];
  const best = standings.reduce((m, s) => Math.max(m, s.standing ?? 0), 0);
  const worst = standings.reduce((m, s) => Math.min(m, s.standing ?? 0), 0);
  // ⚠ OTA-1716 — "someone" is exactly the word the row could not previously
  // cash. It can now: same reduce, carrying the id alongside the number.
  const bestId = standings.find((x) => (x.standing ?? 0) === best)?.factionId;
  const worstId = standings.find((x) => (x.standing ?? 0) === worst)?.factionId;
  if (best >= 50) {
    parts.push({
      label: 'someone down here vouches for you',
      value: 6,
      detail: [`${factionName(bestId)} stands at +${best} with you.`,
        'Any faction at +50 or better is worth +6. It does not stack.'],
    });
  }
  if (worst <= -50) {
    parts.push({
      label: 'someone down here wants you dead',
      value: -6,
      detail: [`${factionName(worstId)} stands at ${worst} with you.`,
        'Any faction at \u221250 or worse costs 6. It does not stack.'],
    });
  }

  // ── What you did with the past ──
  const tp = p.titleProgress;
  const loreRead = tp?.loreRead ?? 0;
  if (loreRead >= 3) {
    parts.push({
      label: 'you read what the dead wrote',
      value: clamp(Math.floor(loreRead / 3), 0, 8),
      detail: [`${loreRead} lore entries read.`,
        ruleLine('+1 for every 3 \u2014 reading is free, so it saturates early.', 8)],
    });
  }
  const preserved = tp?.relicsPreserved ?? 0;
  if (preserved > 0) {
    parts.push({
      label: `${preserved} relic${preserved === 1 ? '' : 's'} left where it stood`,
      value: clamp(preserved * 2, 0, 8),
      detail: [`${preserved} relic${preserved === 1 ? '' : 's'} you found and did not take.`,
        ruleLine('+2 each.', 8)],
    });
  }
  const traded = tp?.relicsTraded ?? 0;
  if (traded >= 2) {
    parts.push({
      label: `${traded} relics sold on`,
      value: clamp(-Math.floor(traded / 2), -8, 0),
      detail: [`${traded} relics sold across a vendor\u2019s table. The first one is free \u2014 he counts pairs.`,
        ruleLine('1 against you for every 2.', -8)],
    });
  }

  // ── What you ANSWERED (Phase 3). The heaviest single input, deliberately:
  //    these are the only places the game ever asked you a question with no
  //    right answer and made you pick. ──
  // OTA-1085 — ITEMISED. This used to be one aggregate row ("1 answer he
  // was standing there for  -5") and the owner, reading his own sheet,
  // could not name the answer it was charging him for. Each judged answer
  // is now its own row, labelled with the words the player actually chose
  // ("your answer: Sell the bundle to a Tomekeeper  -5"). The old ±20
  // aggregate sub-clamp is retired with the aggregation: forks are
  // one-shot and finite (ten questions, each answered once, deltas ±5),
  // so nothing here can be farmed, and the ±60 total clamp still holds.
  for (const key of choiceKeys(p)) {
    const d = FORK_REGARD[key];
    if (typeof d !== 'number' || d === 0) continue;
    const [forkId = '', optionId = ''] = key.split(':');
    const opt = optionById(forkId, optionId);
    const fork = forkById(forkId);
    // ⚠ OTA-1716 — the row names the option; the drill names the QUESTION. A
    // player reading "your answer: Sell the bundle to a Tomekeeper -5" months
    // later has no way to recall what was being asked, which is the whole
    // reason OTA-1085 itemised these in the first place.
    parts.push({
      label: opt ? `your answer: ${opt.label}` : 'an answer he was standing there for',
      value: d,
      detail: [
        ...(fork ? [`${fork.title} \u2014 \u201c${fork.question}\u201d`] : []),
        ...(opt ? [`You chose: ${opt.label}`] : []),
        ...(opt?.hint ? [opt.hint] : []),
        ...(opt?.epilogue ? [`On your ending screen: \u201c${opt.epilogue}\u201d`] : []),
        'Asked once, answered once. Nothing here can be re-rolled or farmed.',
      ],
    });
  }

  // ── What you asked the mud for (Phase 4). He notices. ──
  const tier = pressureOf(p);
  const pressureWhy = 'Your difficulty choice, which you can ease at any time and never raise again. He respects the harder road and says so.';
  if (tier === 'bury_me') parts.push({ label: 'you asked for no mercy', value: 5, detail: ['Pressure: BURY ME \u2014 the hardest setting in the game.', pressureWhy] });
  else if (tier === 'let_it_come') parts.push({ label: 'you asked for none of the easy road', value: 2, detail: ['Pressure: LET IT COME.', pressureWhy] });
  else if (tier === 'salvage') parts.push({ label: 'you came for the salvage', value: -2, detail: ['Pressure: SALVAGE \u2014 the gentlest setting.', pressureWhy] });

  return parts;
}

export function regardScore(
  p: Parameters<typeof regardParts>[0],
  wm: Parameters<typeof regardParts>[1],
): number {
  return clamp(regardParts(p, wm).reduce((n, part) => n + part.value, 0), REGARD_MIN, REGARD_MAX);
}

/** ⚠ OTA-1448 — THE BAND FLOORS, IN ONE PLACE. These were four inline
 *  comparisons inside `regardBandOf`, which meant the character sheet could not
 *  show the player what the next band costs without copying the numbers — and a
 *  copied threshold is the OTA-1156/1158 defect this project keeps paying for.
 *  The ladder the sheet draws and the rule the engine applies are now the same
 *  symbols, so they cannot drift.
 *
 *  Ascending, same shape as STANCE_MIN_CORES. `cold` floors at REGARD_MIN
 *  because the total is clamped there. */
export const REGARD_BAND_FLOOR: Record<RegardBand, number> = {
  cold: REGARD_MIN,
  wary: -29,
  even: -9,
  warm: 15,
  kin: 40,
};

export function regardBandOf(score: number): RegardBand {
  let out: RegardBand = 'cold';
  for (const b of REGARD_ORDER) {
    if (score >= REGARD_BAND_FLOOR[b]) out = b;
  }
  return out;
}

export function regardOf(
  p: Parameters<typeof regardParts>[0],
  wm: Parameters<typeof regardParts>[1],
): RegardBand {
  return regardBandOf(regardScore(p, wm));
}

// ── MEMORY: WHAT HE NAMES ────────────────────────────────────────────────

export type MemoryKind = 'wronged' | 'made_good' | 'answered' | 'cores' | 'corruption' | 'preserved';

export interface MemoryNote {
  kind: MemoryKind;
  /** The concrete thing, substituted into the authored line's {it} slot. A
   *  person's name, a count, an echo of the option you picked. */
  subject: string;
}

interface PersonaData {
  forkRegard: Record<string, number>;
  forkEcho: Record<string, string>;
  stanceBeats: Record<string, string>;
  regardBeats: Record<string, string>;
  remarks: Record<string, Record<string, string[]>>;
  memory: Record<string, Record<string, string[]>>;
  verdicts: Record<string, string>;
  nameBeat: string;
  nameRefusals: { early: string; withheld: string };
  briefs: Record<string, string>;
}

const data = personaData as unknown as PersonaData;

/** Everything he could name right now, most-specific first. Pure read. */
export function arbiterMemory(
  p: Pick<PlayerCharacter, 'corruption' | 'titleProgress' | 'storyChoices' | 'mainQuest'> | null | undefined,
  wm: Pick<WorldMemory, 'npcRelations'> | null | undefined,
): MemoryNote[] {
  if (!p) return [];
  const out: MemoryNote[] = [];
  const rels = Object.values(wm?.npcRelations ?? {});

  // A person you wronged and never squared. Named, and the same person every
  // time — worst debt wins, ties broken on id, so he does not rotate through
  // your victims like a slideshow.
  const owed = rels
    .filter((r) => Math.max(0, (r.wrongs ?? 0) - (r.amendsCleared ?? 0)) > 0)
    .sort((a, b) =>
      ((b.wrongs ?? 0) - (b.amendsCleared ?? 0)) - ((a.wrongs ?? 0) - (a.amendsCleared ?? 0))
      || a.id.localeCompare(b.id));
  if (owed[0]?.name) out.push({ kind: 'wronged', subject: owed[0].name });

  // A debt you DID square. Same rule.
  const squared = rels.filter((r) => (r.amendsCleared ?? 0) > 0).sort((a, b) => a.id.localeCompare(b.id));
  if (squared[0]?.name) out.push({ kind: 'made_good', subject: squared[0].name });

  // The last question you answered, echoed in his words rather than the
  // option label — he is remembering it, not reading it off a card.
  const keys = choiceKeys(p);
  for (let i = keys.length - 1; i >= 0; i--) {
    const echo = data.forkEcho[keys[i] as string];
    if (echo) { out.push({ kind: 'answered', subject: echo }); break; }
  }

  const cores = p.mainQuest?.coresRecovered?.length ?? 0;
  if (cores > 0) out.push({ kind: 'cores', subject: cores === 1 ? 'one Core' : `${cores} Cores` });

  if ((p.corruption ?? 0) > 40) out.push({ kind: 'corruption', subject: 'what you are carrying' });

  const preserved = p.titleProgress?.relicsPreserved ?? 0;
  if (preserved > 0) out.push({ kind: 'preserved', subject: preserved === 1 ? 'the one you left standing' : `the ${preserved} you left standing` });

  return out;
}

// ── THE LINES ────────────────────────────────────────────────────────────

function rotate<T>(pool: readonly T[], nth: number): T | null {
  if (pool.length === 0) return null;
  return pool[Math.abs(Math.floor(nth)) % pool.length] as T;
}

/** ⚠ THE ONLY REASON THIS TAKES `nth` INSTEAD OF ROLLING.
 *  See the header. The caller supplies a counter that moves as the player
 *  plays (tiles found + foes down, at the one call site), so the line varies
 *  across a session and is identical on any replay of the same save. */
export function arbiterRemark(
  p: Parameters<typeof regardParts>[0] & Parameters<typeof arbiterMemory>[0],
  wm: Parameters<typeof regardParts>[1],
  nth: number,
): string | null {
  if (!p) return null;
  const stance = stanceOf(p as Pick<PlayerCharacter, 'mainQuest'>);
  const tone = toneFor(regardOf(p, wm));

  // Every third remark reaches for something he can actually NAME, when there
  // is something. That ratio is the point of the phase: a voice that only ever
  // alludes is a voice with no memory, and a voice that names something every
  // single line is a voice that will not shut up about your business.
  if (nth % 3 === 2) {
    const notes = arbiterMemory(p, wm);
    const note = rotate(notes, Math.floor(nth / 3));
    if (note) {
      const line = rotate(data.memory[note.kind]?.[tone] ?? [], Math.floor(nth / 3));
      if (line) return line.split('{it}').join(note.subject);
    }
  }

  return rotate(data.remarks[stance]?.[tone] ?? [], nth);
}

// ── THE ONE-SHOTS ────────────────────────────────────────────────────────

/** Keys written into `player.arbiterBeatsSeen`. Namespaced so a stance and a
 *  band can never collide, and so an unknown key from a newer build is
 *  inert rather than corrupting. */
export function stanceBeatKey(s: ArbiterStance): string { return `stance:${s}`; }
export function regardBeatKey(b: RegardBand): string { return `regard:${b}`; }

export interface ArbiterBeat { key: string; line: string }

/** The line he owes you right now, or null.
 *
 *  ⚠ STANCE OUTRANKS REGARD when both are due, and only ONE fires per call.
 *  Two pieces of the Arbiter's inner life arriving back-to-back in the same
 *  feed reads as a system announcing itself, which is the exact failure this
 *  phase exists to fix.
 *
 *  ⚠ AND THE BAND CROSSING IS NOT MONOTONIC. Stance only rises, so its beats
 *  fire once and stay fired. Regard moves both ways, and a player who claws
 *  back from 'cold' to 'even' has earned hearing about it — but only once per
 *  band, ever, or a score hovering on a boundary would announce itself every
 *  few steps. Recorded, not compared. */
export function dueArbiterBeat(
  p: (Parameters<typeof regardParts>[0] & Pick<PlayerCharacter, 'mainQuest' | 'arbiterBeatsSeen'>) | null | undefined,
  wm: Parameters<typeof regardParts>[1],
): ArbiterBeat | null {
  if (!p) return null;
  const seen = p.arbiterBeatsSeen ?? [];

  // ⚠ THE LOWEST UNSPOKEN STANCE UP TO WHERE HE IS — not the current one.
  //
  // Found by the phases 0-5 playtest harness (OTA-1068), which walked a run to
  // nine Cores and came back with `witness, invested, implicated, named`:
  // 'interested' never fired. Asking only about the CURRENT stance means that
  // crossing two thresholds between two arrivals drops the intermediate beat
  // FOREVER — it is behind him, so it is never due again. A chapter of the arc
  // vanishing quietly is exactly the failure the "derive it from the save"
  // design was chosen to make impossible, and I put it right back in.
  //
  // Walking upward means an over-levelled run delivers the missed beats in
  // order, one per arrival, so the arc still reads in sequence.
  const stance = stanceOf(p);
  const reached = STANCE_ORDER.indexOf(stance);
  for (let i = 0; i <= reached; i++) {
    const s = STANCE_ORDER[i]!;
    const sKey = stanceBeatKey(s);
    if (seen.includes(sKey)) continue;
    const line = data.stanceBeats[s];
    if (line) return { key: sKey, line };
  }

  const band = regardOf(p, wm);
  const rKey = regardBeatKey(band);
  if (!seen.includes(rKey)) {
    const line = data.regardBeats[band];
    if (line) return { key: rKey, line };
  }

  return null;
}

/** First write wins and duplicates are refused, so a double-call — a crash
 *  mid-append, a re-entrant world tick — cannot make him say it twice. */
export function recordArbiterBeat(prev: string[] | undefined, key: string): string[] {
  const list = prev ?? [];
  return list.includes(key) ? list : [...list, key];
}

// ── THE PAYOFF, AND THE PLACES HE IS ASKED DIRECTLY ──────────────────────

/** ⚠ THE NAME — the whole authored beat, not a bare string, because the beat
 *  is the point and a caller composing around it would be writing.
 *
 *  'named' stance is nine Cores; the name itself needs the regard too. The
 *  thirteen-line pool has promised "not yet to you" since OTA-236 and a promise
 *  kept for merely finishing the game is not the same promise — he said he had
 *  not used it EVEN TO HIMSELF. Null everywhere else, and callers must treat
 *  null as "he does not offer it", never as an error. */
export function arbiterNameBeat(
  p: (Parameters<typeof regardParts>[0] & Pick<PlayerCharacter, 'mainQuest'>) | null | undefined,
  wm: Parameters<typeof regardParts>[1],
): string | null {
  if (!p) return null;
  if (stanceOf(p) !== 'named') return null;
  const band = regardOf(p, wm);
  if (band !== 'warm' && band !== 'kin') return null;
  return data.nameBeat || null;
}

/** ⚠ Asking is a REAL ROUTE, not a hidden one. OTA-1064's audit found a whole
 *  phase of authored content that nothing in the game could reach; the fix
 *  there was to test reachability, and the rule here is the same. The player
 *  types "what is your name" — that is the door. This is the one matcher, so
 *  the store and the tests cannot drift apart about what counts as asking. */
export function isNameQuestion(raw: string): boolean {
  const t = raw.toLowerCase().trim();
  if (!/\bnames?\b/.test(t)) return false;
  // ⚠ It has to be about HIM. "name the factions" and "what is the name of
  // this place" are questions the world-knowledge and lore lookups answer
  // better, and stealing them here would be a regression dressed as a feature.
  if (!/\b(you|your|yours|his|her|their|arbiter'?s?)\b/.test(t)) return false;
  if (/\b(my|mine|dog|golem|place|city|town|faction|item|weapon)\b/.test(t)) return false;
  return /\b(what|whats|tell|say|who|have|had|got|give|call|called)\b/.test(t);
}

/** Always an answer, never silence. Three outcomes: the name, "not yet", or
 *  "not to you" — and the last two are authored rather than falling through to
 *  a lore-bank near-miss on the word "name". */
export function arbiterNameAnswer(
  p: (Parameters<typeof regardParts>[0] & Pick<PlayerCharacter, 'mainQuest'>) | null | undefined,
  wm: Parameters<typeof regardParts>[1],
): string {
  const beat = arbiterNameBeat(p, wm);
  if (beat) return beat;
  if (p && stanceOf(p) === 'named') return data.nameRefusals.withheld;
  return data.nameRefusals.early;
}

/** What he says about you at the end. One per band — the ending screen wants a
 *  verdict, not a tone sample. */
export function arbiterVerdict(
  p: (Parameters<typeof regardParts>[0] & Pick<PlayerCharacter, 'mainQuest'>) | null | undefined,
  wm: Parameters<typeof regardParts>[1],
): string | null {
  if (!p) return null;
  return data.verdicts[regardOf(p, wm)] ?? null;
}

/** ⚠ The clause appended to ARBITER_PERSONA_SYSTEM before a live generation.
 *
 *  This is the ONE place Phase 5 touches the model path, and it is additive:
 *  it tells the model where he stands and what he thinks, and nothing else
 *  changes. If generation fails the caller still falls back exactly as it did
 *  before — a personality that only exists when a 0.5B model happens to be
 *  warm is not a personality, so everything else in this file is authored. */
export function arbiterBrief(
  p: (Parameters<typeof regardParts>[0] & Pick<PlayerCharacter, 'mainQuest'>) | null | undefined,
  wm: Parameters<typeof regardParts>[1],
): string {
  if (!p) return '';
  const stance = stanceOf(p);
  const tone = toneFor(regardOf(p, wm));
  const s = data.briefs[`stance_${stance}`] ?? '';
  const t = data.briefs[`tone_${tone}`] ?? '';
  return [s, t].filter(Boolean).join(' ');
}

/** Character-sheet copy: where he stands, what he thinks, and the itemised
 *  why. Same contract as the Phase 4 pressure section — the player can always
 *  see what the game has decided about them.
 *
 *  ⚠⚠ OTA-1448 — AND NOW WHERE THAT SITS ON THE LADDER. Owner, reading his own
 *  sheet: *"I have no idea what the text in there means, and I don't think the
 *  player does either — maybe post all the outcomes that are possible and gray
 *  them all out except what level you are at so we can see progression."*
 *
 *  He is right, and the diagnosis is precise: the sheet printed two evocative
 *  sentences ("He watches your hands.") with nothing to say they were RUNGS.
 *  Two hidden ladders, no floor and no ceiling shown, so a line that changes
 *  between sessions reads as the writing wandering rather than as progress the
 *  player caused. The ids, the whole ordered ladders, the score and the Cores
 *  count now come back too, so the screen can draw both in full and light the
 *  rung you are on — the same treatment the difficulty section already gets. */
export function arbiterSheetLines(
  p: (Parameters<typeof regardParts>[0] & Pick<PlayerCharacter, 'mainQuest'>) | null | undefined,
  wm: Parameters<typeof regardParts>[1],
): {
  stance: string;
  regard: string;
  parts: RegardPart[];
  stanceId: ArbiterStance;
  bandId: RegardBand;
  /** The summed opinion, clamped exactly as the engine clamps it. */
  score: number;
  /** Cores recovered — what moves the stance ladder, and nothing else does. */
  cores: number;
} | null {
  if (!p) return null;
  const stance = stanceOf(p);
  const band = regardOf(p, wm);
  return {
    stance: STANCE_LABEL[stance],
    regard: REGARD_LABEL[band],
    parts: regardParts(p, wm),
    stanceId: stance,
    bandId: band,
    score: regardScore(p, wm),
    cores: p.mainQuest?.coresRecovered?.length ?? 0,
  };
}

export const STANCE_LABEL: Record<ArbiterStance, string> = {
  witness: 'He walks beside you and keeps his own counsel.',
  interested: 'He has started paying attention.',
  invested: 'He tells you things you did not ask for.',
  implicated: 'He is in this now, and he has stopped pretending otherwise.',
  named: 'There is nothing left he is holding back.',
};

export const REGARD_LABEL: Record<RegardBand, string> = {
  cold: 'He does not like what you have become.',
  wary: 'He watches your hands.',
  even: 'He takes you as he finds you.',
  warm: 'He would speak for you.',
  kin: 'He counts you as his own.',
};

// ── AUTHORING GUARD ──────────────────────────────────────────────────────

/** Run as a test rather than at load, same as forkAuthoringProblems. A missing
 *  pool here would show up in play as the Arbiter falling silent for one
 *  stance-and-tone combination, which is exactly the kind of hole that ships. */
export function arbiterPersonaProblems(): string[] {
  const bad: string[] = [];
  const tones: ArbiterTone[] = ['hard', 'plain', 'close'];
  for (const s of STANCE_ORDER) {
    if (!data.stanceBeats[s]) bad.push(`missing stance beat for ${s}`);
    for (const t of tones) {
      const pool = data.remarks[s]?.[t];
      if (!pool || pool.length < 2) bad.push(`remarks.${s}.${t} needs at least 2 lines`);
    }
  }
  for (const b of REGARD_ORDER) {
    if (!data.regardBeats[b]) bad.push(`missing regard beat for ${b}`);
    if (!data.verdicts[b]) bad.push(`missing verdict for ${b}`);
  }
  const kinds: MemoryKind[] = ['wronged', 'made_good', 'answered', 'cores', 'corruption', 'preserved'];
  for (const k of kinds) {
    for (const t of tones) {
      const pool = data.memory[k]?.[t];
      if (!pool || pool.length === 0) bad.push(`memory.${k}.${t} is empty`);
      for (const line of pool ?? []) {
        if (!line.includes('{it}')) bad.push(`memory.${k}.${t} line has no {it} slot: ${line.slice(0, 40)}`);
      }
    }
  }
  if (!data.nameBeat) bad.push('missing nameBeat');
  if (!data.nameRefusals?.early) bad.push('missing nameRefusals.early');
  if (!data.nameRefusals?.withheld) bad.push('missing nameRefusals.withheld');
  for (const key of Object.keys(data.briefs)) {
    if (!data.briefs[key]) bad.push(`empty brief ${key}`);
  }
  for (const key of Object.keys(data.forkRegard)) {
    if (!data.forkEcho[key]) bad.push(`forkRegard has ${key} with no forkEcho`);
  }
  for (const key of Object.keys(data.forkEcho)) {
    if (!(key in data.forkRegard)) bad.push(`forkEcho has ${key} with no forkRegard`);
  }
  return bad;
}
