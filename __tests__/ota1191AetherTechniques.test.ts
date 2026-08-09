// OTA-1191 — AETHER TECHNIQUES. The mage gap, filled with science.
//
// Owner: *"I would like to have players get aether powers based off of the spells… this
// fills the mage gap, but these are science not magic."* Then, on the three open calls:
// per-technique growth, scale the corruption by tier, and channelling costs your turn.
//
// ⚠ The framing is not decoration. `tartaria-hack-v2.5.txt`: *"Aetheric energy acts like
// radiation, emanating from materials left behind after the empire's fall."* A practitioner
// is running a procedure on a hazard and taking dose for it — so corruption is the cost,
// and corruption already bites (stat penalties from 11, worse prices, thicker encounters).

import {
  AETHER_TECHNIQUES,
  findTechnique,
  findTechniqueByName,
  proficiencyRank,
  proficiencyLabel,
  dcForRank,
  practiceCounts,
  dosageFor,
  knowsTechnique,
  usesOf,
  canAttempt,
  MAX_PROFICIENCY_RANK,
} from '../app/engine/aetherTechniques';
import type { PlayerCharacter } from '../app/engine/types';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const shield = findTechnique('aether_shield')!;
const cascade = findTechnique('resonance_cascade')!;
const p = (over: Partial<PlayerCharacter> = {}) => ({ ...over } as PlayerCharacter);

describe('⚠⚠ OTA-1191 — SCIENCE, NOT MAGIC. The vocabulary is the design.', () => {
  test('no technique, effect or line uses spell-caster language', () => {
    const src = SRC('app/engine/aetherTechniques.ts');
    // ⚠ Checked on the AUTHORED STRINGS, not the whole file — the header discusses why
    // these words are avoided, and matching its own explanation would be the OTA-1182 trap
    // (a pattern that fires on prose about the rule rather than on the rule).
    const authored = AETHER_TECHNIQUES.flatMap((t) => [t.name, t.effect, t.successLine]).join(' ');
    expect(authored).not.toMatch(/\b(spell|cast|casting|mana|magic|magical|wizard|incantation)\b/i);
    // and the module exports nothing named for magic either
    expect(src).not.toMatch(/export (const|function|type|interface) \w*[Ss]pell/);
  });

  test('the four are the ones with no shipped equivalent', () => {
    expect(AETHER_TECHNIQUES.map((t) => t.id).sort()).toEqual([
      'aether_shield', 'resonance_cascade', 'temporal_slip', 'veil_of_ether',
    ]);
  });

  test('⚠ the six that already exist were NOT rebuilt', () => {
    // shape/summon/mend are the live Aethercraft disciplines; bolt/lance/pulse are
    // runecasters — instruments you build and fire. Duplicating either would be the same
    // content twice under two rule sets.
    const ids = AETHER_TECHNIQUES.map((t) => t.id);
    for (const dup of [
      'shape_aetherstone', 'summon_mud_arm', 'mold_ether',
      'aether_bolt', 'aether_lance', 'etheric_pulse',
    ]) expect(ids).not.toContain(dup);
  });

  test('the INT gates match the original spell data', () => {
    const spells = Object.values(
      JSON.parse(SRC('app/data/spells/runecasters.json')) as Record<string, { id: string; intelligenceRequired: number }>,
    );
    for (const t of AETHER_TECHNIQUES) {
      const src = spells.find((s) => s.id === t.id);
      expect(src).toBeDefined();
      expect(t.intRequired).toBe(src!.intelligenceRequired);
    }
  });
});

describe('⚠⚠ OTA-1191 — the dose is SCALED by tier', () => {
  test('a heavy technique costs far more than a light one', () => {
    expect(dosageFor(cascade, { success: true })).toBeGreaterThan(dosageFor(shield, { success: true }) * 4);
  });

  test('dose rises monotonically with tier across the set', () => {
    const order = { Uncommon: 0, Rare: 1, Legendary: 2 } as const;
    const sorted = [...AETHER_TECHNIQUES].sort((a, b) => order[a.tier] - order[b.tier]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.baseDose).toBeGreaterThanOrEqual(sorted[i - 1]!.baseDose);
    }
  });

  test('⚠ a FAILED channel still doses — you were still standing in it', () => {
    expect(dosageFor(cascade, { success: false })).toBeGreaterThan(0);
    expect(dosageFor(cascade, { success: false })).toBeLessThan(dosageFor(cascade, { success: true }));
  });

  test('⚠ and it never rounds down to nothing', () => {
    expect(dosageFor(shield, { success: false })).toBeGreaterThanOrEqual(1);
    expect(dosageFor(shield, { success: false, raceId: 'aetherborn' })).toBeGreaterThanOrEqual(1);
  });

  test('Aetherborn take half — an established race trait, not a new exception', () => {
    // The mend discipline already charges Aetherborn HP instead of corruption because they
    // metabolise it differently. This follows that, it does not invent it.
    expect(dosageFor(cascade, { success: true, raceId: 'aetherborn' }))
      .toBeLessThan(dosageFor(cascade, { success: true, raceId: 'mud_dweller' }));
  });
});

describe('⚠⚠ OTA-1191 — growth is PER-TECHNIQUE, and it buys reliability', () => {
  test('rank climbs with practice and caps', () => {
    expect(proficiencyRank(0)).toBe(0);
    expect(proficiencyRank(3)).toBe(1);
    expect(proficiencyRank(999)).toBe(MAX_PROFICIENCY_RANK);
  });

  test('every rank has a name', () => {
    for (let r = 0; r <= MAX_PROFICIENCY_RANK; r++) {
      expect(proficiencyLabel(r).length).toBeGreaterThan(3);
    }
  });

  test('⚠ practice shaves the DC — it does NOT raise the output', () => {
    // Scaling damage or duration on a technique that already costs corruption would push a
    // practised operator toward using the heavy ones constantly, which is the opposite of
    // what the dose is for. Reliability is the reward: fail less, waste less, dose less.
    expect(dcForRank(shield.baseDc, 0)).toBe(shield.baseDc);
    expect(dcForRank(shield.baseDc, MAX_PROFICIENCY_RANK)).toBeLessThan(shield.baseDc);
    for (const t of AETHER_TECHNIQUES) {
      expect(dcForRank(t.baseDc, MAX_PROFICIENCY_RANK)).toBeGreaterThanOrEqual(5);
    }
  });

  test('proficiency is tracked per technique, not as one skill', () => {
    const pl = p({ techniqueProficiency: { aether_shield: 9, veil_of_ether: 1 } });
    expect(usesOf(pl, 'aether_shield')).toBe(9);
    expect(usesOf(pl, 'veil_of_ether')).toBe(1);
    expect(usesOf(pl, 'temporal_slip')).toBe(0);
    expect(proficiencyRank(usesOf(pl, 'aether_shield')))
      .toBeGreaterThan(proficiencyRank(usesOf(pl, 'veil_of_ether')));
  });
});

describe('⚠⚠ OTA-1191 — THE ANTI-FARM GUARD. Growth-through-use is farmable by construction.', () => {
  test('a success under pressure counts', () => {
    expect(practiceCounts({ success: true, underPressure: true })).toBe(true);
  });

  test('⚠ channelling at a wall in an empty room teaches nothing', () => {
    // Legal, costs fuel and dose, and advances no rank. This session has already closed two
    // loops that paid out on repetition; a third would be careless.
    expect(practiceCounts({ success: true, underPressure: false })).toBe(false);
  });

  test('⚠ and failure teaches nothing either', () => {
    expect(practiceCounts({ success: false, underPressure: true })).toBe(false);
    expect(practiceCounts({ success: false, underPressure: false })).toBe(false);
  });
});

describe('OTA-1191 — knowing and attempting', () => {
  test('techniques are acquired, never granted at creation', () => {
    expect(knowsTechnique(p(), 'aether_shield')).toBe(false);
    expect(knowsTechnique(null, 'aether_shield')).toBe(false);
  });

  test('an unknown technique cannot be attempted, whatever your INT', () => {
    const r = canAttempt(p(), shield, 99);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('unknown');
  });

  test('⚠ knowing it is not enough — the INT gate still applies', () => {
    const pl = p({ knownTechniques: ['resonance_cascade'] });
    const r = canAttempt(pl, cascade, 12);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('int');
    expect(r.ok === false && r.needed).toBe(cascade.intRequired);
  });

  test('known plus enough INT passes', () => {
    const pl = p({ knownTechniques: ['resonance_cascade'] });
    expect(canAttempt(pl, cascade, 18).ok).toBe(true);
  });
});

describe('OTA-1191 — name lookup refuses to guess', () => {
  test('an exact name resolves', () => {
    expect(findTechniqueByName('Aether Shield')).toBe(shield);
    expect(findTechniqueByName('veil of ether')?.id).toBe('veil_of_ether');
  });

  test('⚠ an ambiguous fragment resolves to NOTHING, per P12', () => {
    // ⚠ The first version used "aether" and FAILED — "Veil of Ether" is Ether, not Aether,
    // so only one technique matched and the guard was never exercised. "ether" is the
    // genuinely ambiguous one: it sits inside both "A-ether Shield" and "Veil of Ether".
    // Picking either would be the exact defect P12 records in the contract finders.
    expect(findTechniqueByName('ether')).toBeNull();
  });

  test('⚠ but a fragment that fits only ONE still resolves', () => {
    // The guard must refuse ambiguity without becoming useless: "aether" fits Aether
    // Shield alone, and a player who typed it meant that.
    expect(findTechniqueByName('aether')).toBe(shield);
    expect(findTechniqueByName('cascade')).toBe(cascade);
  });

  test('an empty or unknown name is safe', () => {
    expect(findTechniqueByName('')).toBeNull();
    expect(findTechniqueByName('fireball')).toBeNull();
    expect(findTechnique(null)).toBeNull();
  });
});
