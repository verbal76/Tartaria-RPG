// OTA-1523 — THE ROW GREW AND NOBODY SAID SO.
//
// ⚠⚠⚠ AN AUDIT OF EVERY TUTORIAL BEAT AND FIRST-TIME CARD, at the owner's
// request: "confirm that the text and scope of our tutorial and all of our first
// time use pop ups are up to date and have all of the new features."
//
// The onboarding system is three layers and all three work — the 12-step diegetic
// tutorial, eleven FirstTimeHint sites, and three dedicated primers. What the
// audit found is drift: controls that shipped AFTER the card that would have
// taught them.
//
//   BLOCK        OTA-1510 — the owner's own request, "should have a block button
//                up here during combat"
//   SHIELD BASH  OTA-1510 — the same shield turned offensive
//   THROW SPEAR  OTA-1511 — hurl the spare long shaft
//
// CombatPrimerModal is OTA-1321. It predates all three and never mentions them.
//
// ⚠⚠⚠ AND THE PRIMER COULD NOT BE THE FIX, WHICH IS THE FINDING THAT SHAPED THIS
// WHOLE OTA. It is gated:
//
//     liveEnemyCount > 0 && !combatPrimerSeen && enemiesDefeatedEver === 0
//
// A character past their first kill can NEVER see it again, however much copy is
// added to it — so "extend the primer and bump a version" teaches nobody who is
// already playing. The buttons appear the moment a shield rides the off arm or a
// spare spear is in the pack, and for an existing character that is the only
// moment left. So the teaching goes where the control does: a hint on the
// condition the button itself lights by. The primer gets the RULE (the row grows
// with your kit) and nothing more, so two cards never land on one beat — the
// discipline OTA-1321 set when it retired `combat_first_fight`.
//
// ⚠⚠ TWO MORE GAPS, BOTH ABOUT READING THE SCREEN RATHER THAN PRESSING IT.
//
//   ELEVATION. The game narrates the half that helps — "Below, X circles the base
//   — it cannot reach you up here" — and never the half that hurts: from up there
//   most weapons cannot reach DOWN, so the button simply refuses. That gap cost
//   the OWNER a debugging session (the tuning-fork case behind OTA-1517, where the
//   strike button read green on a climb because reach-band and elevation were
//   answered by the same test). If it confused the person who wrote it, it will
//   confuse a player.
//
//   THE READOUT. `d20 → 18 + ATK 8 = 26 vs your AC 28 (needs nat 16+ — AC capped)
//   — HIT` is a hit on a total BELOW the player's armour, and nothing anywhere
//   explains why. Same for `[plate −2]`, `35% resisted`, `[edge of reach —
//   halved]`, and coating ticks.
//
// ⚠ WHAT THE AUDIT DELIBERATELY LEFT ALONE. Pickpocket, parley, gift, torch, the
// Fusing Crucible, golem naming and climb each already carry their own modal at
// the point of use. Adding hints there would be noise, and noise is what gets
// tips switched off globally.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXPLORE = readFileSync(join(ROOT, 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
const PRIMER = readFileSync(join(ROOT, 'app', 'components', 'CombatPrimerModal.tsx'), 'utf8');
const INPUT = readFileSync(join(ROOT, 'app', 'components', 'InputBox.tsx'), 'utf8');

// ⚠ OTA-1738 — the copy moved into the teaching registry (one body, replayable
// from Settings → GUIDANCE), and the screen renders ONE card at a time from a
// teaching slot. `hint` reads the registry; `candidate` reads the slot line the
// screen keys the card on. THROW SPEAR is v2: the old card said the spear is
// "spent on a hit" — settleThrowRestore spends it on every concluded throw.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TEACHINGS } = require('../app/components/teachingRegistry') as typeof import('../app/components/teachingRegistry');
function hint(id: keyof typeof TEACHINGS): string {
  return TEACHINGS[id].body;
}
function candidate(id: keyof typeof TEACHINGS): string {
  const at = EXPLORE.indexOf(`{ id: TEACH.${id}.id, when:`);
  expect(at).toBeGreaterThan(-1);
  return EXPLORE.slice(at, EXPLORE.indexOf('},', at) + 2);
}

describe('OTA-1523 — every control that exists has somewhere that teaches it', () => {
  it('⚠⚠⚠ THE THREE UNTAUGHT BUTTONS NOW HAVE HINTS', () => {
    for (const id of ['combat_shield_block', 'combat_throw_spear_v2'] as const) {
      candidate(id);
    }
    // Both name the controls by the labels InputBox actually renders.
    expect(hint('combat_shield_block')).toMatch(/BLOCK/);
    expect(hint('combat_shield_block')).toMatch(/SHIELD BASH/);
    expect(hint('combat_throw_spear_v2')).toMatch(/THROW SPEAR/);
  });

  it('⚠⚠⚠ AND THOSE LABELS ARE READ OFF InputBox, NOT OFF MEMORY', () => {
    // OTA-1321's rule for this card family: "every line names a control that
    // exists". A hint teaching a button by the wrong name is worse than silence.
    expect(INPUT).toContain('<QuickBtn label="block"');
    expect(INPUT).toContain('label="shield bash"');
    expect(INPUT).toContain('label="throw spear"');
    expect(PRIMER).toContain('>block</Text>');
    expect(PRIMER).toContain('>shield bash</Text>');
    expect(PRIMER).toContain('>throw spear</Text>');
  });

  it('⚠⚠⚠ THE SHIELD HINT FIRES ON THE SAME CONDITION THE BUTTON DOES', () => {
    // InputBox lights BLOCK / SHIELD BASH off `itemIsShield` on the equipped
    // off-hand. The hint asks the identical question, so it cannot teach a
    // button the player has not been shown.
    expect(INPUT).toContain('itemIsShield(inst)');
    expect(EXPLORE).toContain('itemIsShield(offInst)');
    expect(candidate('combat_shield_block')).toContain('shieldOnArm');
    // ⚠ OTA-1738 — and THROW SPEAR keys on the very function InputBox lights by.
    expect(candidate('combat_throw_spear_v2')).toContain('spareSpearInPack');
    expect(EXPLORE).toContain('spareThrowingSpear(player.inventory ?? [], player.equipped)');
    expect(INPUT).toContain('spareThrowingSpear(reachPlayer?.inventory ?? [], reachPlayer?.equipped)');
  });

  it('⚠⚠ the BLOCK copy states the COST, not just the benefit', () => {
    // The engine applies `shield_block` for one round and the player holds
    // position — everything in reach gets a swing. A card that sold only the
    // upside would teach players to stand still surrounded.
    const b = hint('combat_shield_block');
    expect(b).toMatch(/first blow/i);
    expect(b).toMatch(/hold position|holds position/i);
    expect(b).toMatch(/DODGE is the read/);
  });

  it('⚠⚠ the SPEAR copy states that the throw SPENDS the spear', () => {
    // ⚠ OTA-1738 — spent on every concluded throw, hit OR miss (settleThrowRestore
    // 'resolved' decrements one unit whichever way the roll fell). The old card said
    // "spent on a hit", which a missed throw contradicted.
    expect(hint('combat_throw_spear_v2')).toMatch(/spent on every throw, hit or miss/i);
    expect(hint('combat_throw_spear_v2')).not.toMatch(/spent on a hit/i);
  });
});

describe('OTA-1523 — elevation is taught in BOTH directions', () => {
  it('⚠⚠⚠ THE HINT SAYS WHAT CANNOT REACH DOWN, WHICH NOTHING EVER DID', () => {
    const b = hint('elevation_first_fight');
    expect(b).toMatch(/cannot reach DOWN|cannot reach down/);
    expect(b).toMatch(/refuse/i);          // the button's real behaviour: it just refuses
    expect(b).toMatch(/golem/i);           // it waits at the base and cannot climb
  });

  it('⚠⚠ and it fires only when the player is actually up with foes below', () => {
    // The same three scene facts the engine's own elevation gate reads, so the
    // card cannot appear on a climb with nothing at the bottom.
    const guard = candidate('elevation_first_fight');
    expect(guard).toContain('elevatedOn');
    expect(guard).toContain('enemiesAtBase');
    expect(guard).toContain('inFightNow');
  });
});

describe('OTA-1523 — the combat readout is decoded', () => {
  it('⚠⚠⚠ THE AC CAP IS EXPLAINED — a hit under your armour is not a bug', () => {
    const b = hint('combat_readout');
    expect(b).toMatch(/nat 16\+|AC capped/);
    expect(b).toMatch(/no armour makes you untouchable|untouchable/i);
  });

  it('⚠⚠ and the damage annotations the log actually prints', () => {
    const b = hint('combat_readout');
    for (const token of ['plate', 'resisted', 'edge of reach']) {
      expect(b).toContain(token);
    }
    expect(b).toMatch(/burn|acid/i); // coatings tick on their own line
  });
});

describe('OTA-1523 — the primer teaches the rule, not the mechanics', () => {
  it('⚠⚠⚠ IT SAYS THE ROW GROWS, AND LEAVES THE DETAIL TO THE HINTS', () => {
    // ⚠ PINNED AS THE RENDERED ELEMENT, NOT AS BARE WORDS. check:quotedpins
    // ratchets prose-shaped literals so a new one must displace an old one, and
    // it is right to: this form is both exempt (code-shaped) and a stronger
    // claim — it asserts the line is an actual term row in the card, not merely
    // that three words appear somewhere in the file.
    expect(PRIMER).toContain('<Text style={styles.term}>THE ROW GROWS — </Text>');
    // It names the three controls so the player knows to look…
    expect(PRIMER).toMatch(/shield on your off arm/i);
    expect(PRIMER).toMatch(/spare spear/i);
    // …and explicitly defers, which is what keeps two cards off one beat.
    expect(PRIMER).toMatch(/explained the\s*\n?\s*first time it appears/);
  });

  it('⚠⚠⚠ AND THE HINTS FIRE FOR A VETERAN, WHICH THE PRIMER CANNOT', () => {
    // ⚠ STATED AS A CLAIM, NOT AS A QUOTE OF THE COMMENT THAT EXPLAINS IT — the
    // first draft of this test pinned the prose above the hint, which
    // check:quotedpins bans outright and rightly: a comment pin fails on a
    // reword and passes when the behaviour it describes is deleted.
    //
    // ⚠ OTA-1738 — the primer's kill-count gate is GONE (once per install, like
    // every card), so the three control hints no longer need to dodge it; they
    // still must not key on the kill counter, because a control is taught when
    // it lights, not when a milestone says so.
    expect(EXPLORE).not.toContain('enemiesDefeatedEver === 0');
    for (const id of ['combat_shield_block', 'combat_throw_spear_v2', 'elevation_first_fight'] as const) {
      expect(candidate(id)).not.toContain('enemiesDefeatedEver');
      expect(candidate(id)).not.toContain('combatPrimerSeen');
    }
    // Owner decision 2: the READOUT is the exception by design — Power is taught
    // in the primer, and the readout waits for the fight after the first, once
    // the primer has been seen on this install.
    expect(candidate('combat_readout')).toContain('combatPrimerSeen && enemiesDefeatedEver >= 1');
  });
});
