/**
 * OTA-1439 — THE ♂/♀ PICK, AND WHAT STRANGERS CALL YOU.
 *
 * Owner: *"should we have the player select their sex either male or female in
 * the character creation ... we could do the male and female signs over the
 * player image in the beginning"* → *"add the sex pick, sir/miss flavor, keep
 * familiar at 4 visits."*
 *
 * ⚠⚠ THE DESIGN IS ONE LINE: SIR/MISS IS WHAT STRANGERS CALL YOU. The game
 * already never genders the player — prose is second person, and npcAddress
 * falls back to 'traveler' for an NPC who has not earned your name. The
 * honorific slots into exactly that rung: a shopkeeper says "sir" until they
 * can say "Verbal", and the switch from one to the other is the relationship
 * becoming audible. No authored line changes — every {name} slot inherits it.
 */
import { npcAddress, npcRegard, npcGreeting } from '../app/engine/npcMemory';
import { createCharacter } from '../app/engine/character';
import type { NpcRelation } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const CREATE = read('app', 'screens', 'CharacterCreationScreen.tsx');
const STORE = read('app', 'state', 'gameStore.ts');

const relOf = (over: Partial<NpcRelation>): NpcRelation => ({
  id: 'vendor:x', name: 'Halem', role: 'vendor', firstMetAt: 1, lastSeenAt: 1,
  lastSeenHours: 0, meetings: 1, trades: 0, tcTraded: 0,
  contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
  ...over,
} as NpcRelation);

describe('OTA-1439 — the honorific lives on the stranger rung', () => {
  it('⚠⚠ an NPC who has not earned your name says sir / miss / traveler', () => {
    const stranger = relOf({});
    expect(npcAddress(stranger, 'Verbal', 'male')).toBe('sir');
    expect(npcAddress(stranger, 'Verbal', 'female')).toBe('miss');
    // Unset sex keeps the word every save has always heard.
    expect(npcAddress(stranger, 'Verbal')).toBe('traveler');
    expect(npcAddress(stranger, 'Verbal', null)).toBe('traveler');
  });

  it('⚠⚠ once they know your NAME, the name wins — sex is irrelevant', () => {
    // The whole point: the honorific is a rung of the relationship, not a
    // permanent mode. Hearing "Verbal" instead of "sir" is the promotion.
    const regular = relOf({ trades: 4, meetings: 5 });
    expect(npcAddress(regular, 'Verbal of the Giants', 'male')).toBe('Verbal');
    expect(npcAddress(regular, 'Verbal of the Giants', 'female')).toBe('Verbal');
  });

  it("⚠⚠ 'wronged' stays the cold bare 'you' — civility is what they withdrew", () => {
    const wronged = relOf({ wrongs: 1, meetings: 2, trades: 0 });
    // wrongs>=1 also grants name knowledge; force the nameless case too by
    // checking the regard first.
    expect(npcRegard(wronged)).toBe('wronged');
    expect(npcAddress(relOf({ wrongs: 1 }), '', 'male')).toBe('you');
  });

  it('⚠ greetings thread the sex through to the {name} slot — all three lines', () => {
    // ⚠ REWRITTEN BY THE TEST AUDIT. The first version wrapped its assertion in
    // an `if`, so a greeting that said "traveler" anyway would have PASSED —
    // a test that can never fail is documentation wearing a green tick. The
    // greeting is deterministic (indexed off `meetings`), so walk every line
    // in the 'known' pool and assert each one outright.
    for (let meetings = 0; meetings < 3; meetings++) {
      const known = relOf({ contractsTaken: 1, meetings });
      const line = npcGreeting(known, 'Halem', 'Verbal', 'female');
      // contractsTaken grants 'known' regard AND name knowledge (OTA-1050), so
      // these lines address you by NAME — and never by the fallback word.
      expect({ meetings, line, ok: !line.includes('traveler') })
        .toEqual({ meetings, line, ok: true });
    }
    // The nameless case, driven through the greeting rather than npcAddress:
    // a stranger-tier line never names anyone, so the honorific's greeting
    // surface is the address function itself — covered above — while the
    // greeting formatter must simply never leak 'traveler' for a sexed player.
    const stranger = relOf({});
    const line = npcGreeting(stranger, 'Halem', 'Verbal', 'male');
    expect(line).not.toContain('traveler');
  });
});

describe('OTA-1439 — the pick itself', () => {
  it('⚠⚠ the ♂/♀ signs sit on the race step, over the paired portraits', () => {
    const race = CREATE.indexOf("{step === 'race' && (");
    expect(race).toBeGreaterThan(-1);
    expect(CREATE).toContain("'\\u2642'");
    expect(CREATE).toContain("'\\u2640'");
    expect(CREATE).toContain('styles.sexRow');
    expect(CREATE.indexOf('styles.sexRow')).toBeLessThan(CREATE.indexOf('races.map((r) =>'));
  });

  it('⚠⚠ the pick reaches the player record — not silently dropped', () => {
    // Screen → startNewGame → createCharacter → player.sex. A picked value
    // that never lands is the "game knows and does not say" shape in reverse.
    expect(CREATE).toContain('name: \'\', raceId, factionId, motiveId, pressure, sex,');
    const p = createCharacter({ name: 'T', raceId: 'reclaimer', factionId: 'reclaimers_guild', sex: 'female' });
    expect(p.sex).toBe('female');
    const q = createCharacter({ name: 'T', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    expect(q.sex).toBeUndefined();
  });

  it('⚠ every greeting call site passes the player\'s sex', () => {
    // Two vendor greetings, one wanderer, two absence lines — a site that
    // forgets the argument silently reverts its NPC to 'traveler'.
    expect((STORE.match(/npcGreeting\([^)]*\.sex\)/g) ?? []).length).toBe(2);
    expect((STORE.match(/npcAbsenceLine\([^)]*\.sex\)/g) ?? []).length).toBe(2);
  });

  it('⚠⚠ familiar is FOUR visits now, by the same decision', () => {
    expect(npcRegard(relOf({ trades: 3, meetings: 4 }))).not.toBe('familiar');
    expect(npcRegard(relOf({ trades: 4, meetings: 5 }))).toBe('familiar');
  });
});
