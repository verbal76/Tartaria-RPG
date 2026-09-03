#!/usr/bin/env node
/**
 * OTA-1641 — A WEAPON IS NAMED LIKE A WEAPON, AND THIS IS THE GATE THAT KEEPS IT.
 *
 * ⚠⚠⚠ THE OWNER, READING HIS OWN INVENTORY: *"look at the names of the weapons
 * and the armor. they should actually be semi descriptive weapon names. like why
 * do I have a weapon called a minor repair? that's stupid"* — and then, the
 * rule, verbatim: *"let's get a rule in place where the weapon names actually
 * need to sound like weapon names."*
 *
 * Measured before writing it: 284 rows in weapons.json, 57 of them named after
 * what they DO and not what they ARE — every rune-caster ("Minor Repair", "Force
 * Wave", "Slick Mud", "Vine Grasp", "Mud Army") and the Crown of Verdict. A
 * player reads "Weapons (42)" and finds a "Minor Repair" in it.
 *
 * THE RULE: every name in weapons.json must carry a WEAPON NOUN — a word that
 * names an object a hand can hold or throw (blade, spear, wand, stave, buckler,
 * railgun …). The noun may be a whole word ("Bone Knife") or the tail of a
 * compound ("Oathspear", "Thornblade", "Rune-Caster"). Nothing else is checked:
 * a name can be as strange as the world wants, as long as it is a thing.
 *
 * ⚠ RENAMES ARE MIGRATIONS. A catalog rename must land in
 * app/engine/itemMigrations.ts LEGACY_ITEM_RENAMES in the same OTA (HANDOFF
 * §3a), or every save holding the old name degrades to an inferred Common. The
 * ota1641 suite pins that every retired rune-caster name maps to its new one.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Words that name a thing you fight with. Whole word, or the tail of a compound
 *  ("Oathspear", "Greatblade", "Bolt-Caster"). Keep this list honest: adding a
 *  word here to make a name pass is the same lie the gate exists to stop. */
export const WEAPON_NOUNS = [
  // blades
  'blade', 'sword', 'greatsword', 'greatblade', 'longsword', 'shortsword', 'broadsword', 'claymore',
  'dagger', 'knife', 'shiv', 'dirk', 'stiletto', 'kris', 'kukri', 'khopesh', 'scimitar', 'saber', 'sabre',
  'katana', 'machete', 'cleaver', 'cutlass', 'rapier', 'falchion', 'razor', 'edge', 'cutter', 'letter-opener',
  // hafted / blunt
  'axe', 'greataxe', 'hatchet', 'tomahawk', 'club', 'cudgel', 'mace', 'maul', 'mauler', 'hammer', 'warhammer',
  'sledge', 'mallet', 'flail', 'morningstar', 'bludgeon', 'baton', 'truncheon', 'bat', 'stick', 'staff',
  'stave', 'quarterstaff', 'cane', 'crook', 'pick', 'sickle', 'scythe', 'trowel', 'shovel', 'spade', 'hook',
  'wraps', 'fist', 'fists', 'knuckles', 'gauntlet', 'gauntlets',
  // pole / thrust
  'spear', 'greatspear', 'oathspear', 'pike', 'lance', 'glaive', 'halberd', 'trident', 'javelin', 'harpoon',
  'poleaxe', 'bardiche', 'prod', 'goad',
  // ranged
  'bow', 'longbow', 'shortbow', 'crossbow', 'arbalest', 'sling', 'slingshot', 'dart', 'darts', 'shuriken',
  'chakram', 'boomerang', 'bolas', 'net', 'whip', 'lash', 'launcher', 'thrower', 'caster', 'bolt-caster',
  'rune-caster', 'runecaster', 'gun', 'handgun', 'pistol', 'revolver', 'rifle', 'carbine', 'musket',
  'blunderbuss', 'repeater', 'railgun', 'cannon', 'mortar', 'blaster', 'destroyer', 'disk', 'disc', 'discus',
  'star',
  // rune-caster forms (OTA-1641 — the rune's object: wand / rod / stave / scepter)
  'wand', 'rod', 'scepter', 'sceptre',
  // shields and off-hand implements sit in weapons.json too
  'shield', 'buckler', 'targe', 'aegis', 'pavise', 'brand', 'chain', 'needle', 'spike', 'claw', 'talon', 'fang', 'tooth', 'teeth',
  'horn', 'tusk', 'quill', 'beak', 'saw', 'drill', 'piston', 'ram',
];

const NOUN_RE = new RegExp(`(?:^|[\\s\\-'])(?:[a-z]+-)?(?:[a-z]*?)(${WEAPON_NOUNS.map((n) => n.replace(/[-]/g, '\\-')).join('|')})(?:s|es)?(?=$|[\\s\\-'()])`, 'i');

export function soundsLikeAWeapon(name) {
  return NOUN_RE.test(String(name ?? ''));
}

// ⚠⚠⚠ SELF-TEST FIRST, ALWAYS (the OTA-1458 rule): a matcher that quietly stops
// matching prints OK forever, and OK from a broken instrument is worse than none.
const SELF_TEST = [
  ['Minor Repair', false],
  ['Force Wave', false],
  ['Slick Mud', false],
  ['Crown of Verdict', false],
  ['Mud Army', false],
  ['Minor Repair Wand', true],
  ['Force Wave Wand', true],
  ['Scepter of Verdict', true],
  ['Bone Knife', true],
  ['Dynasty Oathspear', true],
  ['Mud Thornblade', true],
  ['Choir-Bound Launcher', true],
  // OTA-1647 — the craftable shield line's own nouns. A targe, a pavise and an
  // aegis are all shields; the gate simply had not been told.
  ['Scrap Targe', true],
  ['Splinter Pavise', true],
  ["Warden's Aegis", true],
  ['Aegis of the Deep Cold', true],
  ['Aetheric Railgun', true],
  ["Mud Emperor's Buckler", true],
  ['Order Letter-Opener', true],
  ['Aetheric Throwing Disk', true],
  ['Mud Spear (Runecaster)', true],
  ['Litany Maul', true],
  ['Mud-fist Wraps', true],
  ['Sentinel Core Plate', false],
];
for (const [name, expected] of SELF_TEST) {
  if (soundsLikeAWeapon(name) !== expected) {
    console.error(`✗ check:weaponnames — SELF-TEST FAILED. Matcher is broken; real scan not run.\n    expected ${expected ? 'WEAPON' : 'not a weapon'}: ${name}`);
    process.exit(1);
  }
}

const file = path.join(ROOT, 'app', 'data', 'items', 'weapons.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = Array.isArray(raw) ? raw : Object.values(raw).find((v) => Array.isArray(v));
if (!rows || rows.length === 0) {
  console.error('✗ check:weaponnames — read ZERO weapon rows. The reader is broken.');
  process.exit(1);
}
const bad = rows.filter((r) => !soundsLikeAWeapon(r.name));
if (bad.length) {
  console.error(`✗ check:weaponnames — ${bad.length} weapon name(s) that do not sound like a weapon:`);
  for (const r of bad) console.error(`    "${r.name}" (${r.rarity ?? '?'}${(r.tags ?? []).includes('runecaster') ? ', runecaster' : ''})`);
  console.error('');
  console.error('  A weapon is named for what it IS, not what it does. Give it a noun a hand can');
  console.error('  hold — a rune-caster is a Wand / Rod / Stave / Scepter by rarity — and land the');
  console.error('  rename in app/engine/itemMigrations.ts LEGACY_ITEM_RENAMES in the same OTA.');
  process.exit(1);
}
console.log(`[check:weaponnames] OK — ${rows.length} weapons, every one named like a weapon.`);
