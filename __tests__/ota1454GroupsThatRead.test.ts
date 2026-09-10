/**
 * OTA-1454 — COLOUR THAT IS AMBIGUOUS IS WORSE THAN COLOUR THAT IS ABSENT.
 *
 * ⚠⚠ WHERE THIS CAME FROM, AND WHY IT IS NOT THE FIX THAT WAS ASKED FOR. An
 * outside UX review, given screenshots and no source, read the combat row as
 * *"11 identical flat buttons"* and asked for the verbs to be colour-coded into
 * attacks / tactical / utility. Checked against the code, they already were —
 * `defensive` carried a blue border, `ready` a green border and fill, and the
 * two range states their own ambers. The obvious conclusion is that the review
 * was wrong.
 *
 * ⚠⚠⚠ IT WAS NOT. It was right for a reason it could not see: TWO DIFFERENT
 * GROUPS HAD BEEN GIVEN THE SAME COLOUR.
 *      every attack within reach          → 'ready'  (green)
 *      golem / ability / loot / bandolier → 'ready'  (green)
 * So the turn-ending strikes were indistinguishable from the utility chips, and
 * `defensive` blue was the only group on the row that read as a group. A palette
 * that says the same thing about two different things is worse than a plain one,
 * because it looks deliberate — you trust it and it misleads you.
 *
 * ⚠ AND THE SECOND HALF IS THE SAME DEFECT IN THE NAVIGATION ROW. The review and
 * the owner independently reported that EXIT — the one control that leaves the
 * building — wears the identical chip as `↑ FIRST LANDING` and `→ ARSENAL`.
 * Marked, not moved: relocating the way out would break OTA-1430's "every room
 * is one tap away on this row", which exists so nobody can be stranded.
 *
 * ⚠ WHAT THIS SUITE PINS. Not "a colour exists" — that assertion passed
 * throughout the entire period the bug was live. It pins that the groups are
 * MUTUALLY DISTINCT, which is the only property that was ever in question.
 */
import { blockAt, between } from '../test-utils/srcBlock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const IB = read('app', 'components', 'InputBox.tsx');

/** Pull a StyleSheet entry's body, e.g. `quickStrike: { … }`. */
const styleOf = (name: string): string => {
  const at = IB.indexOf(`  ${name}: {`);
  expect({ name, found: at > -1 }).toEqual({ name, found: true });
  return IB.slice(at, IB.indexOf('},', at) + 2);
};
const colorsIn = (s: string): string[] => (s.match(/#[0-9a-fA-F]{6}/g) ?? []).map((c) => c.toLowerCase());

describe('OTA-1454 — the combat groups are mutually distinct', () => {
  /** The four tones a player is meant to tell apart at a glance, and the state
   *  tones that must not be confused with any of them. */
  const GROUPS = ['quickStrike', 'quickDefensive', 'quickReady'] as const;
  const STATES = ['quickNeedsApproach', 'quickUnavailable'] as const;

  /** border + fill for a chip style. */
  const skin = (n: string) => {
    const b = styleOf(n);
    return {
      border: /borderColor:\s*'(#[0-9a-fA-F]{6})'/.exec(b)?.[1]?.toLowerCase(),
      fill: /backgroundColor:\s*'(#[0-9a-fA-F]{6})'/.exec(b)?.[1]?.toLowerCase(),
    };
  };

  /* ⚠⚠⚠ SUPERSEDED IN PART BY OTA-1800, AND THE PART MATTERS. The owner, from
   * a physical build: *"The large equipped weapon control in Combat looks
   * substantially better with the DARK / BLACK fill than with the bright green
   * fill... The weapon artwork already provides strong saturated colour."* So
   * the weapon is no longer a FILLED chip, and the two assertions below that
   * said so — `strike.fill === strike.border`, and dark lettering inverted
   * against a light fill — described a treatment that has been ruled out.
   *
   * ⚠ WHAT SURVIVES UNCHANGED IS THE AXIS ITSELF: one hue, told apart by
   * WEIGHT rather than by spending a second colour on rank. Strike still shares
   * ready's border hue and still differs from it by fill — it simply sits at
   * the OTHER end of the weight scale now (the chip's own neutral ground)
   * instead of at the filled end. The `NO GROUP WEARS A STATE'S COLOUR` test
   * below still counts three distinguishable groups, which is the claim this
   * pair was really protecting. */
  it('⚠⚠⚠ STRIKE AND READY SHARE THE HUE AND DIFFER BY FILL — the whole design', () => {
    // ⚠⚠ REBUILT MID-OTA, AND THE REBUILD IS THE INTERESTING PART. This first
    // asserted that no two groups share a border colour, because my first fix
    // gave strikes a NEW hue. The reviewer's counter-proposal was better and the
    // owner took it: in a restricted palette you do not spend a colour on rank,
    // you spend WEIGHT. Green keeps meaning "available"; solid means decisive,
    // outlined means modifier. So the old assertion — different colours — would
    // now FORBID the better design, which is how a test outlives its own claim.
    const strike = skin('quickStrike');
    const ready = skin('quickReady');
    expect(strike.border).toBe(ready.border);          // one hue…
    expect(strike.fill).not.toBe(ready.fill);          // …two weights
    // ⚠ OTA-1800 — NEITHER group is filled with its own hue any more. The
    // equipped weapon reads as the object you carry, not as a decisive action,
    // so it wears the chassis ground; ready keeps its green-tinted dark. What
    // this line now forbids is the thing the owner ruled out: a saturated block.
    expect(strike.fill).not.toBe(strike.border);
    expect(ready.fill).not.toBe(ready.border);
  });

  it('⚠⚠ OTA-1800 — the weapon NAME carries readiness, and it is the only thing that moves', () => {
    /* ⚠⚠⚠ THIS TEST REVERSED, and the reversal is the owner's ruling rather
     * than a drift. It used to require DARK lettering inverted against a light
     * fill, because the chip was a solid green block. The block is gone:
     *     dark body   = this is my equipped weapon
     *     green name  = I can use it right now
     *     neutral name= equipped, but not currently a valid action
     * so the lettering is now the sage itself, ON the dark — the exact
     * green-on-green the old assertion forbade, because the thing it was
     * protecting against (a solid block reading as a slightly odd outlined
     * chip) cannot happen to a chip that is no longer solid. */
    const strikeText = /quickStrikeText:\s*\{\s*color:\s*'(#[0-9a-fA-F]{6})'/.exec(IB)?.[1]?.toLowerCase();
    expect(strikeText).toBeDefined();
    // The NAME is the readiness signal, so it carries the group's hue.
    expect(strikeText).toBe(skin('quickStrike').border);
    // …and it is LIGHT, because it sits on a dark body now.
    const lum = parseInt(strikeText!.slice(1, 3), 16) + parseInt(strikeText!.slice(3, 5), 16) + parseInt(strikeText!.slice(5, 7), 16);
    expect(lum).toBeGreaterThan(200);
    // ⚠ The body it sits on is genuinely dark — the owner's "DARK / BLACK fill".
    const fill = skin('quickStrike').fill!;
    const fillLum = parseInt(fill.slice(1, 3), 16) + parseInt(fill.slice(3, 5), 16) + parseInt(fill.slice(5, 7), 16);
    expect(fillLum).toBeLessThan(120);
  });

  it('⚠⚠⚠ EVERY chip fill is OPAQUE — arb86, and the reviewer could not have known', () => {
    // The "ghost" variant is taught everywhere as a TRANSPARENT dark background.
    // Here that is a known defect: chips once used a ~6% alpha fill, and once the
    // background became player-tunable a bright hue flooded through them. Any
    // 8-digit hex (alpha) or `transparent` in a chip fill reinstates it.
    for (const n of [...GROUPS, ...STATES, 'quick', 'quickDisabled']) {
      const body = styleOf(n);
      expect({ n, alpha: /backgroundColor:\s*'#[0-9a-fA-F]{8}'/.test(body) }).toEqual({ n, alpha: false });
      expect({ n, transparent: /backgroundColor:\s*'transparent'/.test(body) }).toEqual({ n, transparent: false });
    }
  });

  it('⚠⚠ NO GROUP WEARS A STATE\'S COLOUR — OTA-930\'s rule, stated as itself', () => {
    // ⚠ REBUILT. This asserted that all five borders are UNIQUE, which was a proxy
    // for the claim and stopped being true the moment strike and ready
    // deliberately shared a hue. Uniqueness was never the point: a control that
    // cannot act must not look like one that can, so what actually matters is
    // that no GROUP borrows a STATE's colour. Groups may share with each other —
    // that is the fill-vs-outline design — but never across that line.
    const groupColours = new Set(GROUPS.map((n) => skin(n).border));
    for (const st of STATES) {
      const c = skin(st).border;
      expect({ state: st, borrowedByAGroup: groupColours.has(c) }).toEqual({ state: st, borrowedByAGroup: false });
    }
    // …and the two states do not collide with each other either.
    expect(new Set(STATES.map((n) => skin(n).border)).size).toBe(STATES.length);
    // ⚠ The groups are still told apart — by fill where the hue is shared.
    const skins = GROUPS.map((n) => `${skin(n).border}|${skin(n).fill}`);
    expect(new Set(skins).size).toBe(GROUPS.length);
  });

  it('⚠⚠ AN IN-REACH ATTACK RESOLVES TO `strike`, NOT `ready` — one function, four buttons', () => {
    // punch / kick / main-hand / off-hand all read their tone from weaponTone, so
    // the group lives in ONE place and cannot be half-applied.
    const fn = blockAt(IB, 'export function weaponTone(', { mode: 'opener' });
    /* ⚠ OTA-1800 — THE CLAIM IS UNCHANGED; ONLY WHERE THE ANSWER COMES FROM
     * MOVED. This used to pin `bands.includes(range) ? 'strike' : ...` — the
     * button computing its own eligibility. It now asks `weaponSwingRefusal`,
     * which is the store's own three gates (reach, elevation, and OTA-1564's
     * jammed weapon) in the store's order, because composing the answer here
     * had missed a gate three times running. In-reach STILL resolves to
     * `strike` and never to `ready`; that is what these two lines say. */
    expect(fn).toContain("weaponSwingRefusal(");
    expect(fn).toContain("refusal ? 'needs-approach' : 'strike'");
    expect(fn).not.toContain("? 'ready'");
    // …and every attack button actually goes through it.
    // ⚠ OTA-1517 added the elevation fact as a fourth argument; OTA-1800 added
    // the swung weapon's NAME as a fifth, so the jam lock can be asked about the
    // weapon actually in that hand. What this pins — ONE function behind every
    // attack button — is exactly unchanged by either.
    for (const call of ['weaponTone(reachPlayer, null, range, groundedFoesBelow, null)', "weaponTone(reachPlayer, 'main', range, groundedFoesBelow, equippedMain)", "weaponTone(reachPlayer, 'off', range, groundedFoesBelow, equippedOff)"]) {
      expect(IB).toContain(call);
    }
  });

  it('⚠⚠ THE UTILITY CHIPS KEEP `ready` — the point was to SEPARATE them, not to move them', () => {
    // If these had been retoned too, the collision would simply have moved.
    for (const util of ['golem (', '✦ ability', 'loot', '✦ bandolier']) {
      const at = IB.indexOf(`label={\`${util}`) >= 0 ? IB.indexOf(`label={\`${util}`) : IB.indexOf(`label="${util}"`);
      expect({ util, found: at > -1 }).toEqual({ util, found: true });
      expect(IB.slice(at, IB.indexOf('/>', at))).toContain("tone=\"ready\"");
    }
  });

  it('⚠ the out-of-reach amber is UNTOUCHED — it is a state, not a group', () => {
    // A player who cannot reach still needs to be told so, in the colour that has
    // always meant it.
    expect(styleOf('quickNeedsApproach')).toContain("#c9a86a");
    expect(IB).toContain("outOfRange={mainT === 'needs-approach'}");
  });

  it('⚠ `strike` introduces NO new hue at all — it reuses the ready green', () => {
    // ⚠ REBUILT alongside the test above. This used to assert strike avoided the
    // green; under the better design it IS the green, and the claim it was
    // written for — "do not spend a colour on this" — is now satisfied more
    // strictly than before, because the count of hues went DOWN.
    const strike = colorsIn(styleOf('quickStrike'));
    for (const other of ['#c9a86a', '#e07a5f', '#6a9bbf']) expect(strike).not.toContain(other);
    expect(strike).toContain('#9ec96a');
    // …and it no longer wears the base chip's dim grey, which was the original sin.
    expect(colorsIn(styleOf('quick'))).toContain('#3a342c');
    expect(strike).not.toContain('#3a342c');
  });
});

describe('OTA-1454 — the way out stops looking like a door', () => {
  it('⚠⚠ BOTH EXIT buttons are marked — the building one AND the outpost one', () => {
    // Many doors, literally. Marking one would have left the other reading as a
    // room chip, and they are in different render branches.
    const exits = [...IB.matchAll(/<TravelBtn label="🚪 EXIT"/g)];
    expect(exits.length).toBe(2);
    expect(IB).toContain('a11yLabel="Exit, leave this building"');
    expect(IB).toContain('a11yLabel="Exit, leave the outpost for the wilds"');
    // Both carry the variant, not just the glyph.
    for (const m of exits) {
      expect(IB.slice(m.index!, IB.indexOf('/>', m.index!))).toContain('wayOut');
    }
  });

  it('⚠⚠ IT IS MARKED, NOT MOVED — still on the travel row with the rooms', () => {
    // OTA-1430 relies on every room being one tap away on this row so nobody can
    // be stranded behind an exit rule. Relocating the way out would also put it
    // where the player is not looking at the moment they want to leave.
    const row = between(IB, 'hubExitChips.slice(0, 4)', 'sceneBuilding ? (');
    expect(row).toContain('🚪 EXIT');
  });

  it('⚠⚠ its chip is VISUALLY distinct from the room chips beside it', () => {
    const wayOut = /borderColor:\s*'(#[0-9a-fA-F]{6})'/.exec(styleOf('travelBtnWayOut'))![1]!.toLowerCase();
    const room = /borderColor:\s*'(#[0-9a-fA-F]{6})'/.exec(styleOf('travelBtn'))![1]!.toLowerCase();
    const here = /borderColor:\s*'(#[0-9a-fA-F]{6})'/.exec(styleOf('travelBtnActive'))![1]!.toLowerCase();
    expect(wayOut).not.toBe(room);
    expect(wayOut).not.toBe(here);   // nor the you-are-here room
  });

  it('⚠⚠ the glyph MATCHES THE MAP — one symbol for one meaning, on both surfaces', () => {
    // OTA-1451 put 🚪 on the exit rooms of both maps. A different glyph on the
    // button would have made them two facts instead of one.
    expect(read('app', 'screens', 'MapScreen.tsx')).toContain('🚪');
    expect(read('app', 'components', 'MiniMap.tsx')).toContain('🚪');
  });

  it('⚠ the tutorial lock on the outpost EXIT still applies', () => {
    // arb108 — room hops are locked during the beats; EXIT unlocks only at the
    // stay/leave choice. Restyling must not have loosened the gate.
    const at = IB.indexOf('a11yLabel="Exit, leave the outpost for the wilds"');
    expect(IB.slice(at, IB.indexOf('/>', at))).toContain("blocked={tutLock && currentBeatId !== 'explore_or_leave'}");
  });
});
