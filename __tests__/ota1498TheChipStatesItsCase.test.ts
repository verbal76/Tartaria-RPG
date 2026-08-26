// OTA-1498 — THE CHIP STATES ITS CASE, AND KEEPS A SECOND DOOR.
//
// ⚠⚠⚠ THE OWNER, 2026-08-25, with a "⬆ Take & wield Bone Javelin" chip up
// mid-fight: *"we need a green up arrow next to it or a red down arrow, this
// would compare its stats to your main hand weapon or off hand if it's ranged
// like the star does on take salvage, or there should be another block to put
// it in your pack. I don't know how it compares — why would I just grab it?"*
//
// ⚠⚠ WHAT WAS TRUE BUT INVISIBLE: the chip is ONLY offered when the engine's
// own comparator (`isUpgradeOverEquipped`, OTA-1252/1457) already ruled the
// item an upgrade over the slot it would fill — his javelin chip existed
// because his off hand was free. There is no red-arrow case: a downgrade never
// gets a chip. The defect was that the verdict never reached the button face,
// so a correct offer read as a blind grab.
//
// TWO ADDITIONS, BOTH SINGLE-DERIVATION:
//   1. `upgradeReasonClause` (gatherSort, beside the comparator, from the SAME
//      catalog lookups) puts the why on the face: "1d8 over your 1d6",
//      "your off hand is free", "AC +3 over your +1", "your chest slot is bare".
//   2. A quieter pack chip under the offer — the picker's own plain take
//      (`takeAmbientNoun`), nothing equipped, nothing displaced — for the
//      player who wants the item without the swap.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  pickFeedActionChip,
  feedActionChipLabel,
  feedActionChipA11yLabel,
  feedPackChipLabel,
  feedPackChipA11yLabel,
  type GatherChipRow,
} from '../app/engine/feedActionChip';
import { upgradeReasonClause } from '../app/engine/gatherSort';
import type { PlayerCharacter } from '../app/engine/types';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const FEED = read('app', 'components', 'AdventureFeed.tsx');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');
const SORT = read('app', 'engine', 'gatherSort.ts');

const bare = (): PlayerCharacter =>
  ({ name: 'Test', inventory: [], equipment: {}, stats: {} } as unknown as PlayerCharacter);

/** Rusted Blade is 1d6 in the weapons catalog; Cudgel is 1d8. */
const armed = (main: string, off?: string): PlayerCharacter =>
  ({
    name: 'Test',
    inventory: [
      { id: 'w1', name: main, kind: 'weapon', quantity: 1 },
      ...(off ? [{ id: 'w2', name: off, kind: 'weapon', quantity: 1 }] : []),
    ],
    equipped: { main, ...(off ? { off } : {}) },
    equipment: {},
    stats: {},
  } as unknown as PlayerCharacter);

const rows = (...r: Array<[string, boolean]>): GatherChipRow[] =>
  r.map(([noun, consumed]) => ({ noun, consumed }));

describe('OTA-1498 — the reason clause, from the comparator\'s own lookups', () => {
  it('⚠⚠⚠ THE OWNER\'S EXACT CASE: the ranged javelin goes to the OFF hand and says so', () => {
    // ⚠⚠ This clause has now been right twice for two different rules, which is
    // the point of deriving it from the verdict rather than restating one.
    // Under OTA-1277 the javelin displaced into MAIN by band coverage, so it
    // read "covers a range your hands lack". Under OTA-1512 the owner named the
    // hands outright — "always melee in main and ranged in off" — so a ranged
    // piece belongs in the off hand, that hand is bare, and the honest clause is
    // the bare-slot one. The rule changed; the clause followed it without being
    // told, because it reads the destination the tap actually fills.
    const clause = upgradeReasonClause(armed('Cudgel'), 'Bone Javelin');
    expect(clause).toBe('your off hand is free');
  });

  it('⚠⚠ a straight damage upgrade states both dice', () => {
    // Both hands full so the dice comparison is the deciding rule.
    const clause = upgradeReasonClause(armed('Rusted Blade', 'Rusted Blade'), 'Cudgel');
    expect(clause).toBe('1d8 over your 1d6');
  });

  it('⚠⚠ bare armor slot says bare — the comparator\'s empty-slot rule, spoken', () => {
    expect(upgradeReasonClause(bare(), "Mud-Warden's Vest")).toMatch(/chest slot is bare/);
  });

  it('⚠⚠⚠ NO CLAUSE FOR A NON-UPGRADE — the clause never contradicts the mark', () => {
    // Bone Javelin (1d6) into two full 1d8 hands is not an upgrade; the clause
    // must refuse exactly where the comparator refuses, or the face could
    // claim an upgrade the ★ pass never marked.
    expect(upgradeReasonClause(armed('Cudgel', 'Cudgel'), 'Bone Javelin')).toBeNull();
    expect(upgradeReasonClause(null, 'Cudgel')).toBeNull();
    expect(upgradeReasonClause(bare(), 'rubble')).toBeNull();
  });

  it('⚠ one derivation: the clause reads the VERDICT and speaks about its slot', () => {
    // OTA-1500 — rewritten onto equipVerdict after the consistency test caught
    // the clause promising one slot while the tap filled another. The dice
    // compare picks the WORDING (damage line vs coverage line); the verdict
    // itself is not re-decided here.
    const fn = SORT.slice(SORT.indexOf('export function upgradeReasonClause'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('equipVerdict(player, noun)');
    expect(body).toContain('resolveEquippedItem(player, v.slot)');
  });
});

describe('OTA-1498 — the chip carries the verdict', () => {
  it('⚠⚠⚠ the face says why: item, then the clause', () => {
    const chip = pickFeedActionChip(armed('Cudgel'), rows(['Bone Javelin', false]));
    expect(chip).not.toBeNull();
    // OTA-1512 — the ranged piece goes to the OFF hand by the owner's hand rule.
    // That hand is bare, so the mark is the bare-slot ★ and the clause says so.
    expect(chip!.reason).toBe('your off hand is free');
    const label = feedActionChipLabel(chip!);
    expect(label).toMatch(/^★ Take & wield Bone Javelin — your off hand is free/);
  });

  it('⚠⚠ the screen-reader sentence carries the same reasoning', () => {
    const chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]));
    expect(chip).not.toBeNull();
    expect(feedActionChipA11yLabel(chip!)).toMatch(/It is offered because/);
  });

  it('⚠ a chip whose clause cannot be stated still renders — face without the dash', () => {
    const chip = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]))!;
    const stripped = { ...chip, reason: null };
    expect(feedActionChipLabel(stripped)).toBe(`★ Take & wear ${chip.itemName}`);
  });
});

describe('OTA-1498 — the second door goes to the pack', () => {
  it('⚠⚠ the pack chip promises no equip, in face and in speech', () => {
    const chip = pickFeedActionChip(armed('Cudgel'), rows(['Bone Javelin', false]))!;
    expect(feedPackChipLabel(chip)).toMatch(/to your pack/);
    expect(feedPackChipA11yLabel(chip)).toMatch(/without equipping/);
  });

  it('⚠⚠⚠ the pack chip renders ONLY beside the offer — never alone', () => {
    // A lone pack chip would be a new route to `take`, violating the OTA-1457
    // accelerator-not-route rule the main chip was built on.
    expect(FEED).toContain('{actionChipLabel && packChipLabel ? (');
    expect(FEED).toContain('testID="feed-pack-chip"');
  });

  it('⚠⚠⚠ its tap is the picker\'s own plain take — logged first, nothing equipped', () => {
    const span = EXPL.slice(
      EXPL.indexOf("onPackChipPress={feedChip && tutBeat !== 'screen_pick' ? () => {"),
      EXPL.indexOf('} : undefined}', EXPL.indexOf('onPackChipPress=')),
    );
    // Same tap-ledger-first rule as the main chip (OTA-1485).
    expect(span).toContain('logUiTap(feedPackChipLabel(feedChip));');
    expect(span).toContain('takeAmbientNoun(feedChip.noun);');
    expect(span).not.toContain('takeAndWear');
    expect(span).not.toContain('equipItem');
  });

  it('⚠ the pack chip is styled quieter than the offer above it', () => {
    // The equip offer stays primary; the pack door must not compete with it.
    expect(FEED).toMatch(/packChip: \{\s*\n\s*borderColor: '#3a342c'/);
    expect(FEED).toMatch(/packChipText: \{ color: '#cdbf99', fontSize: 12/);
  });
});
