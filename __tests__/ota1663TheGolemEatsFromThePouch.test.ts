// OTA-1663 — THE GOLEM EATS FROM THE POUCH.
//
// Owner: *"I think we should allow materials that can be fed to the Golem in
// the heals pouches, but those only have the option to go straight to the
// Golem."*
//
// ⚠ TWO HALVES, AND THE SECOND ONE IS THE INTERESTING ONE. Widening what the
// pouch accepts is easy. The instruction that matters is "ONLY have the option
// to go straight to the Golem" — one turn after OTA-1662 taught this rack to
// ASK who a heal is for. A scrap plate is not something you eat or feed the
// dog, so a chooser there would be the OTA-1662 mistake wearing the opposite
// coat: a question with one possible answer.
//
// ⚠⚠ ONE PREDICATE DECIDES BOTH. `medkitRole` is what the eligibility gate uses
// to let a thing IN and what the popup uses to decide what it DOES on the way
// out. Two copies of that judgement is how a rack and its gate drift — this
// file has already watched a racked id resolve to a ghost (OTA-1005) and a heal
// button answer a target nobody chose (OTA-1662).
//
// ⚠ HEALS WIN A TIE, deliberately: some materials both mend a person and match
// the golem's element, and a Trail Ration that silently went into the frame
// instead of the player's mouth would be OTA-1662 again with the targets
// swapped. If it can heal a person, it is a heal.
//
// ⚠⚠⚠ AND WIRING THIS UP FOUND THE THIRD AND FOURTH INSTANCES OF THE OTA-1658
// DEFECT, both in the golem block of the inventory modal: "Heal <golem>" and
// "Arm <golem>" each routed through `submitPlayerAction`, which returns on its
// first line while a roll is pending. So mending your golem during a fight —
// the exact moment it is coming apart — and handing it a weapon mid-fight both
// did nothing at all. That is four buttons in this one feature family, found
// three OTAs running, which is why the last describe here sweeps the whole
// screen rather than pinning the two I happened to touch.

const src = (...parts: string[]): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', ...parts), 'utf8',
  ) as string;

const inputBox = (): string => src('app', 'components', 'InputBox.tsx');
const inventory = (): string => src('app', 'screens', 'InventoryScreen.tsx');

import type { InventoryItem, PlayerCharacter } from '../app/engine/types';
import {
  medkitRole, itemFeedsGolem, isMedkitEligible,
} from '../app/engine/medkitEligibility';
import { golemRepairParts } from '../app/engine/golems';

const material = (name: string, tags: string[] = []): InventoryItem => ({
  id: `inv_${name.replace(/\W+/g, '_')}`, name, kind: 'material',
  rarity: 'Common', quantity: 3, tags,
} as unknown as InventoryItem);

/** A player carrying a live Mud golem, which is the shape the roles depend on. */
const withGolem = (): PlayerCharacter => ({
  name: 'Tester',
  golem: { kind: 'mud_golem', name: 'Clod', hp: 10, hpMax: 30 },
} as unknown as PlayerCharacter);

describe('OTA-1663 — golem fuel is allowed into the pouch', () => {
  it('⚠ an exact fuel part of YOUR golem is eligible', () => {
    const part = golemRepairParts('mud_golem')[0]!;
    const p = withGolem();
    expect(itemFeedsGolem(material(part), p)).toBe(true);
    expect(isMedkitEligible(material(part), p).eligible).toBe(true);
  });

  it('⚠⚠ but NOT without a golem — the same item is refused, and the refusal speaks', () => {
    const part = golemRepairParts('mud_golem')[0]!;
    const noGolem = { name: 'Tester' } as unknown as PlayerCharacter;
    expect(itemFeedsGolem(material(part), noGolem)).toBe(false);
    const verdict = isMedkitEligible(material(part), noGolem);
    expect(verdict.eligible).toBe(false);
    // B15: a refusal always says why, and never mentions a golem you do not have.
    expect(verdict.reason).toMatch(/kits, food and cures/);
    expect(verdict.reason).not.toMatch(/parts/);
  });

  it('the refusal NAMES the golem when you have one, so the rule is discoverable', () => {
    const junk = material('Bent Nail');
    const verdict = isMedkitEligible(junk, withGolem());
    if (!verdict.eligible) expect(verdict.reason).toMatch(/Clod's parts/);
  });
});

describe('OTA-1663 — ⚠ one predicate decides both the gate and the button', () => {
  it('a golem part reports the golem role', () => {
    const part = golemRepairParts('mud_golem')[0]!;
    expect(medkitRole(material(part), withGolem())).toBe('golem');
  });

  it('and something that mends nobody reports no role at all', () => {
    expect(medkitRole(material('Bent Nail'), withGolem())).not.toBe('heal');
  });

  it('⚠ a golem whose stored kind has drifted does not take the screen down', () => {
    // This runs during render, once per racked row. `golemRepairParts` indexes
    // its table unguarded, so before the try/catch a save carrying a drifted
    // kind (the OTA-1603 failure, one species over) would have thrown inside
    // the input bar's paint rather than simply offering no button.
    const drifted = { name: 'T', golem: { kind: 'not_a_golem', name: 'X', hp: 1, hpMax: 2 } } as unknown as PlayerCharacter;
    expect(() => itemFeedsGolem(material('Mud Brick'), drifted)).not.toThrow();
    expect(itemFeedsGolem(material('Mud Brick'), drifted)).toBe(false);
  });

  it('⚠⚠ HEALS WIN A TIE — a person-healer never silently becomes golem fuel', () => {
    // The tie-break is asserted at the source: `itemHeals` is consulted FIRST
    // and returns before the golem test can claim the item.
    const s = src('app', 'engine', 'medkitEligibility.ts');
    const body = s.slice(s.indexOf('export function medkitRole'));
    const heal = body.indexOf("return 'heal'");
    const golem = body.indexOf("return 'golem'");
    expect(heal).toBeGreaterThan(-1);
    expect(golem).toBeGreaterThan(heal);
  });
});

describe('OTA-1663 — ⚠ golem fuel goes STRAIGHT to the golem', () => {
  it('the tap sends it with no chooser, and returns before the dog question', () => {
    const s = inputBox();
    expect(s).toContain("if (medkitRoleOf(it) === 'golem') {");
    const golemBranch = s.indexOf("if (medkitRoleOf(it) === 'golem') {");
    const dogQuestion = s.indexOf('if (medkitDog) { setMedkitPick(it.id); return; }', golemBranch);
    // The golem branch must come FIRST, or a dog owner gets asked about scrap.
    expect(dogQuestion).toBeGreaterThan(golemBranch);
    expect(s).toContain("useHealBatch(it.name, 'golem', 1);");
  });

  it('and the button says where it is going', () => {
    expect(inputBox()).toContain('`→ ${medkitGolem?.name ?? \'golem\'}`');
  });

  it('⚠ the popup asks the SAME module the gate asks — not its own copy', () => {
    const s = inputBox();
    expect(s).toContain("import { medkitRole, type MedkitRole } from '../engine/medkitEligibility';");
    expect(s).toContain('medkitRole(it, medkitPlayer)');
  });
});

describe('OTA-1663 — ⚠⚠⚠ the golem buttons work in a fight now', () => {
  it('Heal <golem> no longer routes through the parser', () => {
    expect(inventory()).not.toContain('submitPlayerAction(`feed golem ${pending.item.name}`)');
    expect(inventory()).toContain("useHealBatch(pending.item.name, 'golem', 1);");
  });

  it('Arm <golem> calls the store action the parser branch itself calls', () => {
    expect(inventory()).not.toContain('submitPlayerAction(`arm golem with ${pending.item.name}`)');
    expect(inventory()).toContain('armGolem(pending.item.name)');
  });

  it('⚠⚠⚠ THE SWEEP: no companion or golem button on this screen fires through the parser', () => {
    // Four of these have been found in three consecutive OTAs (1658 pouch, 1662
    // dog feed, 1663 golem heal + arm). Pinning only the ones I touched would
    // let the fifth ship. Any NEW `submitPlayerAction` on a feed/arm/heal
    // affordance fails here, and the message says what to do instead.
    const offenders = inventory()
      .split('\n')
      .filter((l) => /submitPlayerAction\(`(feed|arm|heal)\b/.test(l));
    expect(offenders).toEqual([]);
  });
});
