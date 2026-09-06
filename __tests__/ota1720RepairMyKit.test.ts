/**
 * OTA-1720 — REPAIR MY KIT.
 *
 * Owner, on the repair tab: *"when you say repair all ready that also repairs
 * stuff that I've scavenged off and killed enemies. I'm not going to use the
 * seven cudgels that I'm going to repair by accident. what I'm really concerned
 * about is everything that I'm going to wear into combat — all my gear, weapons
 * and armor and shields and everything like that that is equipped on my body.
 * that's the quick fix right? that's the 'hey everything I need for this next
 * fight, I need fix now.' get on it. I need that button."*
 *
 * ⚠⚠⚠ THE DATA WAS ALREADY THERE. `wornInstanceIds` has stamped `worn` on every
 * repair row since OTA-1094, and the tab's default sort axis already floats worn
 * gear to the top. The one thing never built was the ACTION on that set — so the
 * screen could show you your kit and then only offer to mend the whole pile.
 * This is one filter and one button, not a new system.
 *
 * ⚠⚠ AND THE BADGE WAS COUNTING THE PILE. `REPAIR (9)` was every affordable row,
 * so seven scavenged cudgels made the tab shout while nothing he fights in
 * needed a thing. A number that is mostly junk is a number you learn to ignore,
 * which is the same way a warning stops working. It counts the kit now.
 *
 * ⚠ AND THE THIRD THING, which he also named: *"if you can't repair it cuz you
 * don't have enough pieces then it shouldn't be highlighted."* Rows already mute
 * when unaffordable — but the BUTTON simply vanished, rendering `null`, which is
 * the silent-absence defect OTA-1719 closed on the report screen and OTA-1715
 * closed on the dog. It now says what you are short of.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SCREEN = readFileSync(join(__dirname, '..', 'app', 'screens', 'CraftingScreen.tsx'), 'utf8');

describe('OTA-1720 — ⚠⚠⚠ the button', () => {
  it('REPAIR MY KIT exists, and it acts on WORN and available rows only', () => {
    expect(SCREEN.includes('⚒ REPAIR MY KIT (')).toBe(true);
    expect(SCREEN.includes('.filter((r) => r.worn && r.available).map((r) => r.item.id)')).toBe(true);
    expect(SCREEN.includes('const repairKitNow = () => {')).toBe(true);
  });

  it('⚠⚠ it goes through the SAME repair call as every other path', () => {
    // Not a second code path that could disagree with the single-row one about
    // cost, substitutions or eligibility — the lesson OTA-1098 wrote down when
    // it built REPAIR ALL the same way.
    const fn = SCREEN.slice(SCREEN.indexOf('const repairKitNow'), SCREEN.indexOf('const repairKitNow') + 120);
    expect(fn.includes('repairInventoryItems(repairEquippedInView)')).toBe(true);
  });

  it('it reads off the VIEW, so order and search still carry through', () => {
    // On the default EQUIPPED axis the gear you are standing in is mended first,
    // which is what matters when materials run out partway down the list.
    expect(SCREEN.includes('repairEquippedInView = useMemo(\n    () => repairableView.filter')).toBe(true);
  });

  it('⚠ the sweep survives, ranked below it and honestly labelled', () => {
    // Filtering by search and sweeping is still the right tool for a pack full
    // of loot. It is just not the thing you reach for between fights.
    expect(SCREEN.includes('⚒ repair everything listed (')).toBe(true);
    expect(SCREEN.includes('you are not wearing')).toBe(true);
    expect(SCREEN.includes('repairSweepBtn')).toBe(true);
  });

  it('⚠⚠ and the sweep is not offered when it would do nothing extra', () => {
    // Two buttons that do the same thing is a choice the player has to think
    // about for no reason.
    expect(SCREEN.includes('repairReadyInView.length > repairEquippedInView.length && (')).toBe(true);
  });
});

describe('OTA-1720 — ⚠⚠ the badge counts the kit, not the cudgels', () => {
  it('the tab number is the equipped-ready count', () => {
    expect(SCREEN.includes('REPAIR {repairEquippedReady > 0 ? `(${repairEquippedReady})` : \'\'}')).toBe(true);
    expect(SCREEN.includes('REPAIR {repairReady > 0 ?')).toBe(false);
  });

  it('and the all-ready count still exists for the sweep that needs it', () => {
    // Removing it would have been the tidier-looking edit and the wrong one: the
    // sweep's own label is built from it.
    expect(SCREEN.includes('const repairReady = useMemo(() => repairable.filter((r) => r.available).length')).toBe(true);
  });
});

describe('OTA-1720 — ⚠ nothing ready says why', () => {
  it('the null render is gone', () => {
    // `) : null}` was the whole else arm: short on materials, no control, no
    // explanation. Third time this session that exact shape has cost a report.
    expect(SCREEN.includes('⚒ REPAIR ALL READY ({repairReadyInView.length})')).toBe(false);
    expect(SCREEN.includes('Nothing can be mended yet — your equipped gear is short')).toBe(true);
  });

  it('⚠⚠ and it names the materials, summed across the kit', () => {
    // "you are short 3× Patched Cloth" is a shopping list. "Nothing is ready" is
    // a shrug.
    expect(SCREEN.includes('const equippedShortOf = useMemo(')).toBe(true);
    expect(SCREEN.includes('short.set(m.name, (short.get(m.name) ?? 0) + m.short)')).toBe(true);
    expect(SCREEN.includes('`${qty}× ${name}`')).toBe(true);
  });

  it('it only counts what is WORN — a cudgel you will never swing is not a shortfall', () => {
    const block = SCREEN.slice(SCREEN.indexOf('const equippedShortOf'), SCREEN.indexOf('const equippedShortOf') + 420);
    expect(block.includes('if (!r.worn || r.available) continue;')).toBe(true);
  });
});
