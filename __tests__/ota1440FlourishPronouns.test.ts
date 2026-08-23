/**
 * OTA-1440 — BRAN IS "HE" IN HIS OWN STAGE BUSINESS, AND THE MODEL STOPS
 * INVENTING SCENES.
 *
 * Owner, from his device log: Bran the Beastmaster — "he" in every authored
 * reply — was *"testing a coil of rope against THEIR knee"*, and the model
 * contributed *"Bran the Beastmaster, with his bow and axe, stands among the
 * ruins, preparing for the night."* — during a conversation at his stall,
 * indoors, holding a cup. Owner: *"go"* on the pronoun pass, *"yes"* on
 * tightening the prompt.
 */
import {
  flourishPool, flourishFor, resolveFlourishLine, vetModelFlourish,
  flourishPrompt, FLOURISH_SYSTEM, flourishKindFor,
  type FlourishLine, type FlourishKind,
} from '../app/engine/flourish';
import { npcGenderFor, genderedNpcIds } from '../app/engine/npcGender';
import type { NpcRegard } from '../app/engine/npcMemory';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RAW = require('../app/data/npcs/flourishes.json') as {
  byKind: Record<string, FlourishLine[]>;
  byRegard: Record<string, FlourishLine[]>;
  fallback: FlourishLine[];
};
const ALL_LINES: FlourishLine[] = [
  ...Object.values(RAW.byKind).flat(),
  ...Object.values(RAW.byRegard).flat(),
  ...RAW.fallback,
];
const VARIANTS = ALL_LINES.filter((l): l is { n: string; m: string; f: string } => typeof l !== 'string');
const PLAIN = ALL_LINES.filter((l): l is string => typeof l === 'string');

describe('OTA-1440 — the data: three voices, hand-written', () => {
  it('⚠⚠ exactly twenty lines carry variants — the two traps stayed plain', () => {
    // Twenty pronoun lines converted; the tally-slate line ("them" = the
    // chalked NAMES) and the books line ("they" = generic people) must NOT be
    // converted — a regex pass would have mangled both.
    expect(VARIANTS.length).toBe(20);
    expect(PLAIN.some((l) => l.includes('you cannot read them upside down'))).toBe(true);
    expect(PLAIN.some((l) => l.includes('a question they have already written down'))).toBe(true);
  });

  it('⚠⚠ every m/f variant is pronoun-CORRECT, not pronoun-swapped', () => {
    for (const v of VARIANTS) {
      // The male line speaks of he/his/him and never they/their.
      expect({ n: v.n, ok: /\b(he|his|him)\b/.test(v.m) }).toEqual({ n: v.n, ok: true });
      expect({ n: v.n, leak: /\b(they|their|them|themselves)\b/.test(v.m) }).toEqual({ n: v.n, leak: false });
      expect({ n: v.n, ok: /\b(she|her|hers)\b/.test(v.f) }).toEqual({ n: v.n, ok: true });
      expect({ n: v.n, leak: /\b(they|their|them|themselves)\b/.test(v.f) }).toEqual({ n: v.n, leak: false });
      // …and the neutral text still carries its pronoun, unchanged for old ears.
      expect({ n: v.n, ok: /\b(they|their|them)\b/.test(v.n) }).toEqual({ n: v.n, ok: true });
    }
  });

  it('⚠⚠ VERB AGREEMENT — the exact failure a blind swap produces cannot exist', () => {
    // "while they talk" swapped blind is "while he talk". Assert the bare-verb
    // forms are absent from every gendered variant, and the -s forms present
    // where the neutral line had the bare form.
    const BARE = /\b(he|she) (talk|speak|answer|notice|prefer|turn|keep|count|let|place|drop|test|look|glance|set|shift|move|adjust)\b/;
    for (const v of VARIANTS) {
      expect({ n: v.n, bad: BARE.test(v.m) }).toEqual({ n: v.n, bad: false });
      expect({ n: v.n, bad: BARE.test(v.f) }).toEqual({ n: v.n, bad: false });
    }
    // The reported line, by name, in all three voices.
    const rope = VARIANTS.find((v) => v.n.includes('coil of rope'))!;
    expect(rope.m).toContain('against his knee');
    expect(rope.f).toContain('against her knee');
    expect(rope.n).toContain('against their knee');
  });

  it('⚠ resolveFlourishLine: gender picks the voice, absence keeps the old text', () => {
    const v = VARIANTS[0]!;
    expect(resolveFlourishLine(v, 'male')).toBe(v.m);
    expect(resolveFlourishLine(v, 'female')).toBe(v.f);
    expect(resolveFlourishLine(v, null)).toBe(v.n);
    expect(resolveFlourishLine(v, undefined)).toBe(v.n);
    expect(resolveFlourishLine('plain {npc} line.', 'male')).toBe('plain {npc} line.');
  });
});

describe('OTA-1440 — the picker, end to end', () => {
  /** Drain every line flourishFor can produce for one request shape. */
  const drain = (npcId: string, role: string, gender: 'male' | 'female' | null): string[] => {
    const used: string[] = [];
    for (;;) {
      const line = flourishFor({
        npcId, npcName: 'Bran the Beastmaster', role,
        regard: 'familiar' as NpcRegard, topicId: 't1', used, gender,
      });
      if (!line) return used;
      used.push(line);
    }
  };

  it('⚠⚠ THE REPORTED LINE: Bran\'s whole pool speaks of "he", never "they"', () => {
    const lines = drain('bran_the_beastmaster', 'Wilderness Outfitter', 'male');
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) {
      expect({ l, leak: /\b(they|their|themselves)\b/.test(l) }).toEqual({ l, leak: false });
    }
    expect(lines.some((l) => l.includes('against his knee'))).toBe(true);
  });

  it('⚠⚠ a female vendor\'s pool speaks of "she"', () => {
    const lines = drain('irma_ironhand', 'Heavy Armorer', 'female');
    for (const l of lines) {
      expect({ l, leak: /\b(they|their|themselves)\b/.test(l) }).toEqual({ l, leak: false });
    }
  });

  it('⚠ no gender recorded → the exact lines every player has always seen', () => {
    const neutral = drain('wanderer:traveler:someone', 'trader', null);
    expect(neutral.some((l) => /\bthey\b/.test(l) || /\btheir\b/.test(l))).toBe(true);
  });
});

describe('OTA-1440 — who is he and who is she', () => {
  it('⚠⚠ the lookup reads the field the data always carried', () => {
    expect(npcGenderFor('bran_the_beastmaster')).toBe('male');
    expect(npcGenderFor('halem_trader')).toBe('male');
    expect(npcGenderFor('irma_ironhand')).toBe('female');
    expect(npcGenderFor('felra_swiftfoot')).toBe('female');
  });

  it('⚠⚠ null is an answer — minted ids, constructs, and nobody guess', () => {
    // Authored 'neutral' vendors must resolve null, not male-by-default.
    expect(npcGenderFor('roadside:someone')).toBeNull();
    expect(npcGenderFor('wanderer:traveler:tam')).toBeNull();
    expect(npcGenderFor(null)).toBeNull();
    expect(npcGenderFor('')).toBeNull();
  });

  it('⚠ every gendered id is a real vendors.json id, and none is neutral', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../app/data/npcs/vendors.json');
    const rows: { id: string; gender?: string }[] = Array.isArray(raw) ? raw : raw.vendors;
    const byId = new Map(rows.map((r) => [r.id, r.gender]));
    for (const id of genderedNpcIds()) {
      expect({ id, g: byId.get(id) }).toEqual({ id, g: npcGenderFor(id) });
    }
  });
});

describe('OTA-1440 — the model stops inventing scenes', () => {
  it('⚠⚠ THE LOGGED LINE, VERBATIM, IS REJECTED', () => {
    expect(vetModelFlourish(
      'Bran the Beastmaster, with his bow and axe, stands among the ruins, preparing for the night.',
      'Bran the Beastmaster',
    )).toBeNull();
  });

  it('⚠⚠ each of its three sins is rejected alone', () => {
    const N = 'Bran the Beastmaster';
    expect(vetModelFlourish(`${N} sets his axe against the counter and listens.`, N)).toBeNull();      // weapon
    expect(vetModelFlourish(`${N} glances out at the ruins beyond the fence line.`, N)).toBeNull();     // scenery
    expect(vetModelFlourish(`${N} keeps talking while preparing for the long night ahead.`, N)).toBeNull(); // future
  });

  it('⚠ hands-and-eyes business still passes, forge tools included', () => {
    const N = 'Irma Ironhand';
    expect(vetModelFlourish(`${N} sets her hammer down on the bench and wipes both hands.`, N))
      .toBe(`${N} sets her hammer down on the bench and wipes both hands.`);
    expect(vetModelFlourish(`${N} keeps one eye on the scales while she answers.`, N))
      .toBe(`${N} keeps one eye on the scales while she answers.`);
  });

  it('⚠⚠ the system prompt forbids what the judge rejects — no drift between them', () => {
    expect(FLOURISH_SYSTEM).toContain('MID-CONVERSATION');
    expect(FLOURISH_SYSTEM).toContain('No weapons');
    expect(FLOURISH_SYSTEM).toContain('no time of day');
    expect(FLOURISH_SYSTEM).toContain('no preparing for anything');
  });

  it('⚠ the user prompt names the gender the data records, and only then', () => {
    const kind: FlourishKind | null = flourishKindFor('bran_the_beastmaster', 'Wilderness Outfitter');
    expect(flourishPrompt('Bran the Beastmaster', 'Wilderness Outfitter', kind, 'male'))
      .toBe('Bran the Beastmaster is a man, a Wilderness Outfitter. Write the one line.');
    expect(flourishPrompt('Irma Ironhand', 'Heavy Armorer', kind, 'female'))
      .toBe('Irma Ironhand is a woman, a Heavy Armorer. Write the one line.');
    expect(flourishPrompt('Someone', 'trader', kind, null))
      .toBe('Someone is a trader. Write the one line.');
  });
});
