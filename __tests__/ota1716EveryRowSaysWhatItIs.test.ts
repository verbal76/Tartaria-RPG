/**
 * OTA-1716 — EVERY ROW IN "WHAT MOVED IT" SAYS WHAT IT IS.
 *
 * Owner, on the expanded character sheet: *"in the 'what moved it' section of
 * the expanded character screen, everything listed in it should be able to be
 * tapped on to see what it is. as of now, only wrongs and gifts do."*
 *
 * ⚠⚠⚠ WHY THOSE TWO AND NOTHING ELSE, which is the part worth fixing rather
 * than patching. Neither was tappable because somebody decided that row deserved
 * a drill-down. They were tappable because each happened to own a LEDGER —
 * `npcRelations[].gifts` for one (OTA-1161) and `wrongsLedger` for the other
 * (OTA-1683) — and each got its own `useState` boolean and its own branch in the
 * renderer when the owner tapped it and found it flat. Under that shape, making a
 * row tappable is a bespoke job, so it only ever happened in response to a
 * report. Twelve kinds of row, two of them answering.
 *
 * ⚠⚠ SO THE FIX IS WHERE THE NUMBER IS MADE, not in the screen. `regardParts`
 * now returns a `detail` alongside every value it pushes, built at the same site
 * from the same variables — the corruption row's explanation is written in the
 * branch that reads `corruption`, using `corruption`. A help screen written
 * separately from the arithmetic is a second copy of the rules, and this project
 * has paid for copied thresholds before (OTA-1156, OTA-1158, OTA-1448). The
 * screen loses its two bespoke booleans for one open-set keyed by row index, so
 * a row is tappable because it EXISTS.
 *
 * ⚠ AND THE DETAILS EARN THEIR TAP. "someone down here vouches for you" now
 * names the faction and its standing; "your answer: Sell the bundle to a
 * Tomekeeper" now quotes the QUESTION he asked, the hint the option carried, and
 * the sentence it bought on the ending screen. A drill-down that only restates
 * the row is the tap the owner already had.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { regardParts, type RegardPart } from '../app/engine/arbiterPersona';

const ROOT = join(__dirname, '..');
const PERSONA = readFileSync(join(ROOT, 'app', 'engine', 'arbiterPersona.ts'), 'utf8');
const SHEET = readFileSync(join(ROOT, 'app', 'screens', 'CharacterScreen.tsx'), 'utf8');

/** A character who has done one of everything, so every branch of regardParts
 *  fires at once and the whole section can be read in a single call. */
const MAXIMAL = {
  corruption: 72,
  menace: 34,
  factionStanding: [
    { factionId: 'reclaimers_guild', standing: 61 },
    { factionId: 'mud_monarchs', standing: -58 },
  ],
  titleProgress: { loreRead: 9, relicsPreserved: 2, relicsTraded: 5 },
  storyChoices: { missing_letters: 'sell_them', debt_collector: 'pay_partial' },
  pressure: 'bury_me',
} as never;

const RELATIONS = {
  skiv: { id: 'skiv', name: 'Skiv', role: 'trader', wrongs: 3, amendsCleared: 1, gifts: [{ item: 'Tin Whistle', day: 3 }] },
  hallow: { id: 'hallow', name: 'Hallow', role: 'scribe', wrongs: 1, amendsCleared: 1, gifts: [] },
} as never;

const parts = (): RegardPart[] => regardParts(MAXIMAL, { npcRelations: RELATIONS } as never);

describe('OTA-1716 — ⚠⚠⚠ not one row is flat', () => {
  it('THE INSTRUMENT: every row a maximal character produces can be opened', () => {
    const rows = parts();
    // The fixture has to actually reach the whole section, or this passes on an
    // empty list forever — the self-check the faction probes needed after one of
    // them measured the wrong store field.
    expect(rows.length).toBeGreaterThanOrEqual(11);
    const flat = rows
      .filter((r) => !r.kind && (r.detail ?? []).length === 0)
      .map((r) => r.label);
    // Before this OTA every row except the gifts and wrongs rows was in here.
    expect(flat).toEqual([]);
  });

  it('⚠⚠ AND THE SOURCE INSTRUMENT, so row thirteen cannot arrive flat', () => {
    // The behavioural check above only sees rows this fixture happens to
    // trigger. This one reads every `parts.push` in the file and requires each
    // to carry a `kind` (it owns a ledger) or a `detail` (it explains itself),
    // so a row added later fails here even if no test fixture reaches it.
    const body = PERSONA.slice(PERSONA.indexOf('export function regardParts'), PERSONA.indexOf('export function regardScore'));
    // Paren-matched rather than line-shaped: three of these rows are written on
    // one line and a line-shaped regex silently skipped all three, which would
    // have made this instrument agree with itself while measuring two thirds of
    // the file.
    const pushes: string[] = [];
    for (let at = body.indexOf('parts.push('); at !== -1; at = body.indexOf('parts.push(', at + 1)) {
      let depth = 0;
      let end = at;
      for (let i = body.indexOf('(', at); i < body.length; i++) {
        if (body[i] === '(') depth++;
        else if (body[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      pushes.push(body.slice(at, end + 1));
    }
    expect(pushes.length).toBe(14);
    const missing = pushes
      .filter((b) => !b.includes('kind:') && !b.includes('detail:'))
      .map((b) => b.slice(0, 70).replace(/\s+/g, ' '));
    expect(missing).toEqual([]);
  });

  it('every detail line is real text, not an empty slot', () => {
    for (const r of parts()) {
      for (const line of r.detail ?? []) {
        expect({ label: r.label, ok: typeof line === 'string' && line.trim().length > 3 })
          .toEqual({ label: r.label, ok: true });
      }
    }
  });
});

describe('OTA-1716 — ⚠ the details say something the row did not', () => {
  const find = (needle: string): RegardPart => {
    const r = parts().find((x) => x.label.includes(needle));
    expect({ needle, found: !!r }).toEqual({ needle, found: true });
    return r!;
  };

  it('"someone down here" finally names them, both directions', () => {
    const vouch = find('vouches for you');
    expect(vouch.detail!.join(' ')).toContain('+61');
    // The roster's own name, never the id.
    expect(vouch.detail![0]).not.toContain('reclaimers_guild');
    const dead = find('wants you dead');
    expect(dead.detail!.join(' ')).toContain('58');
    expect(dead.detail![0]).not.toContain('mud_monarchs');
  });

  it('the corruption row shows the number AND where the count starts', () => {
    const c = find('the Aether is in you');
    expect(c.detail!.join(' ')).toContain('72');
    // 40 is the threshold in the branch directly above it — the drill states
    // the same rule the clamp applies, from the same variable.
    expect(c.detail!.join(' ')).toContain('40');
    expect(c.value).toBe(-3);
  });

  it('⚠⚠ an answer row quotes the QUESTION, not just the option', () => {
    // "your answer: Sell the letters on  -5" is unreadable months later if the
    // sheet cannot say what was being asked. This is the row OTA-1085 itemised
    // and the one that most needed a drill.
    const a = parts().find((x) => x.label.startsWith('your answer:'))!;
    expect(a).toBeTruthy();
    const text = a.detail!.join('\n');
    expect(text).toContain('You chose:');
    expect(text).toContain('On your ending screen:');
    // It quotes the fork's own question text, so it cannot say the wrong thing
    // about a fork whose writing changed.
    expect(text.split('\n')[0]!.length).toBeGreaterThan(20);
  });

  it('the debts row names who each debt was cleared with', () => {
    const d = find('made good');
    expect(d.detail!.join(' ')).toContain('Skiv');
    expect(d.detail!.join(' ')).toContain('Hallow');
  });

  it('the two ledger rows keep their ledgers rather than growing a second copy', () => {
    expect(find('still standing').kind).toBe('wrongs');
    expect(find('gift').kind).toBe('gifts');
  });
});

describe('OTA-1716 — the screen makes every row a control', () => {
  it('⚠⚠ THE FLAT PATH IS GONE', () => {
    // This exact line was the "no kind, no drill" fall-through, and it is the
    // one thing that has to be absent for the owner's report to be answered.
    expect(SHEET.includes('if (part.kind !== \'gifts\') return <View key={i}>{row}</View>;')).toBe(false);
    expect(SHEET.includes('const open = openParts[i] ?? false;')).toBe(true);
  });

  it('one open-set replaced the two bespoke booleans', () => {
    expect(SHEET.includes('const [openParts, setOpenParts] = useState<Record<number, boolean>>({});')).toBe(true);
    expect(SHEET.includes('setGiftsOpen')).toBe(false);
    expect(SHEET.includes('setWrongsOpen')).toBe(false);
    // All three branches (wrongs ledger, gifts ledger, plain detail) go through
    // the same toggle, so they cannot drift apart again.
    expect(SHEET.split('onPress={() => togglePart(i)}').length - 1).toBe(3);
  });

  it('a row with nothing to add still opens and says so', () => {
    // Silence on tap is the defect. If a future row somehow reaches the screen
    // with no detail, it answers rather than doing nothing.
    expect(SHEET.includes('He has not said more than this.')).toBe(true);
  });

  it('the affordance is on every row, in this screen\'s own vocabulary', () => {
    // OTA-1456 settled on ▸ closed / ▾ open across this screen. The marker used
    // to be conditional on the row being tappable; every row is now.
    expect(SHEET.includes("<Text style={styles.tapHint}>{open ? '  ▾' : '  ▸'}</Text>")).toBe(true);
  });

  it('and a screen reader is told the row is worth tapping', () => {
    expect(SHEET.includes('Tap to see what it is.')).toBe(true);
  });
});
