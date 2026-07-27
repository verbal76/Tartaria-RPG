// OTA-986 — CHARISMA IS NOT A TO-HIT STAT. From the device log:
//   attack with the off-hand mud executioner's blade
//   You — d20 -> 8 + CHA 9 ... vs AC 10
// A sword swinging on the social stat. Not a stray row: the catalog assigned the
// attack stat BY GRIP and gave the whole single_handed bucket charisma —
// 37/37 melee and 5/5 ranged, 42 weapons, 7 of them Legendary. For a STR-14 /
// CHA-9 character that is a silent -5 to hit on every one-handed weapon, so the
// best one-handed gear in the game was quietly the worst.
//
// The earlier fix for this symptom patched a CODE path (attackStatFor, which
// cannot even return charisma). The code was never the problem — `equipped.stat`
// wins whenever a weapon is held, and that field was never touched, so the bug
// walked straight back. This suite locks the CATEGORY at the data, so a
// regenerated table or a newly authored weapon cannot reintroduce it.
import * as fs from 'fs';
import * as path from 'path';
import { isValidAttackStat } from '../app/engine/combatRules';

const WEAPONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', 'weapons.json'), 'utf8'),
).weapons as Array<{
  name: string; stat?: string; weaponKind?: string; tags?: string[]; throwable?: boolean;
}>;

const gripOf = (w: { tags?: string[] }) =>
  (w.tags ?? []).find((t) => ['single_handed', 'dual_wield', 'two_handed'].includes(t)) ?? '-';
const has = (w: { tags?: string[] }, t: string) => (w.tags ?? []).includes(t);

describe('OTA-986 — no weapon rolls Charisma to hit', () => {
  it('THE CATEGORY LOCK: not one weapon in the catalog uses charisma', () => {
    const offenders = WEAPONS.filter((w) => w.stat === 'charisma').map((w) => w.name);
    expect(offenders).toEqual([]);
    // Sanity: the audit is actually reading a full catalog, not an empty file.
    expect(WEAPONS.length).toBeGreaterThan(200);
  });

  it('every weapon names a stat you can actually fight with', () => {
    for (const w of WEAPONS) {
      expect(isValidAttackStat(w.stat)).toBe(true);
    }
  });

  it("THE OWNER'S WEAPON: the Mud Executioner's Blade swings on STRENGTH", () => {
    const blade = WEAPONS.find((w) => w.name === "Mud Executioner's Blade")!;
    expect(blade.stat).toBe('strength');
  });

  it('heavy one-handers match the two-handed rows of their own family', () => {
    const heavy = WEAPONS.filter(
      (w) => w.weaponKind === 'melee' && gripOf(w) === 'single_handed'
        && !w.throwable && !has(w, 'throwable') && !has(w, 'throw')
        && ['blade', 'axe', 'hammer', 'spear'].some((f) => has(w, f))
        && !has(w, 'knife'),
    );
    expect(heavy.length).toBeGreaterThan(20); // the bulk of the retarget
    for (const w of heavy) expect(w.stat).toBe('strength');
  });

  it('knives stay finesse whichever hand they are in', () => {
    const knives = WEAPONS.filter((w) => w.weaponKind === 'melee' && has(w, 'knife'));
    expect(knives.length).toBeGreaterThan(10);
    for (const w of knives) {
      // The Order Letter-Opener is a deliberate authored exception — a scholar's
      // tool that cuts on INT. It was never charisma, so it is not this OTA's to
      // touch; named here so the exception is documented rather than silently
      // widening the rule.
      if (w.name === 'Order Letter-Opener') { expect(w.stat).toBe('intelligence'); continue; }
      // dual_wield knives were always DEX; single_handed ones now agree.
      if (gripOf(w) !== 'two_handed') expect(w.stat).toBe('dexterity');
    }
  });

  it('the SIBLING PAIRS that proved the bug now agree with each other', () => {
    // Same weapon, two grips. Only the single_handed row was charisma — that
    // mismatch is what showed the intent. STR for the heavy pair, DEX for the
    // finesse/ranged ones.
    const stat = (n: string) => WEAPONS.find((w) => w.name === n)?.stat;
    expect(stat('Giant Bone Spear')).toBe('strength');
    expect(stat('Giant Bone Spear (Single)')).toBe('strength');
    expect(stat('Plasma Pistol')).toBe('dexterity');
    expect(stat('Plasma Pistol (Single)')).toBe('dexterity');
    expect(stat('Tartarian Hand Axe')).toBe('dexterity');
    expect(stat('Tartarian Hand Axe (Throw)')).toBe('dexterity'); // thrown = finesse
    expect(stat('Energy Blade (Legendary)')).toBe('dexterity');
    expect(stat('Energy Blade')).toBe('strength');               // one-handed blade
  });

  it('the Legendaries that were secretly the worst gear are fixed', () => {
    const LEGENDARY_ONE_HANDERS = [
      "Mud Emperor's Saber", 'Energy Hammer', 'Aetheric Sword of Storms',
      "Plasma Executioner's Axe", 'Tartarian Crown Sword', 'Aetheric Deathblade',
      'Mud Royal Blade',
    ];
    for (const n of LEGENDARY_ONE_HANDERS) {
      const w = WEAPONS.find((x) => x.name === n);
      expect(w).toBeTruthy();
      expect(w!.stat).toBe('strength');
    }
  });

  it('the runtime backstop rejects charisma even if a bad row slips in', () => {
    expect(isValidAttackStat('charisma')).toBe(false);
    expect(isValidAttackStat(undefined)).toBe(false);
    for (const ok of ['strength', 'dexterity', 'intelligence', 'wisdom']) {
      expect(isValidAttackStat(ok)).toBe(true);
    }
    // ...and the attack site actually consults it, so a bad row falls back to
    // the weapon-class default instead of being obeyed.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'engine', 'combatRules.ts'), 'utf8',
    );
    expect(src).toContain('equipped && isValidAttackStat(equipped.stat)');
  });

  it('the untouched grips kept the stats they always had', () => {
    // Proof this was a surgical retarget of one bucket, not a table-wide rewrite.
    const twoHandMelee = WEAPONS.filter((w) => w.weaponKind === 'melee' && gripOf(w) === 'two_handed');
    for (const w of twoHandMelee) {
      // The Golem Aether-Lance channels rather than swings — a single authored
      // INT exception that predates this OTA and was never charisma (the other
      // nine golem weapons are STR). Named, not glossed over.
      if (w.name === 'Golem Aether-Lance') { expect(w.stat).toBe('intelligence'); continue; }
      expect(w.stat).toBe('strength');
    }
    const dualMelee = WEAPONS.filter((w) => w.weaponKind === 'melee' && gripOf(w) === 'dual_wield');
    for (const w of dualMelee) expect(w.stat).toBe('dexterity');
  });
});
