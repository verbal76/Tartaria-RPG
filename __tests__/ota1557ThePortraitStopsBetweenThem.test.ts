/**
 * OTA-1557 — THE PORTRAIT STOPS BETWEEN THEM.
 *
 * ⚠⚠⚠ THE OWNER, ON A STACKED FIGHT: *"in a stacked enemy I fought I killed one
 * and the enemy portrait hung between enemies. this has been ongoing."* His
 * screenshot is unambiguous — the tail of one card at the left edge of the
 * panel, the next card shoved right and clipped off the screen. The pager is
 * parked at an offset that is not a multiple of cardWidth.
 *
 * ⚠⚠⚠ THREE FAULTS AT ONCE, WHICH IS WHY IT SURVIVED EARLIER PASSES. OTA-929
 * fixed the BLANK card after a kill by remounting the pager on a roster change;
 * that was a different symptom — wrong CONTENT — and it is still correct and
 * still there. Nothing owned the OFFSET:
 *
 *   1. TWO SNAP AUTHORITIES. `pagingEnabled` snaps to the scroll view's own
 *      width; `snapToInterval` snaps to cardWidth. They agree only while those
 *      two numbers are identical, and in the frames after a kill — roster
 *      remount on one tick, panel measurement on another — they are not. Two
 *      mechanisms that must agree, with nothing making them agree.
 *
 *   2. NO RESOLUTION WITHOUT MOMENTUM. Every cell is a vertical ScrollView
 *      (OTA-1514, and it has to stay one). On Android an inner scroller can
 *      claim a horizontal drag and hand it back, and a drag released that way
 *      fires NO momentum event — so `onMomentumScrollEnd`, the only reader the
 *      pager had, never ran. The half-scrolled offset was not merely
 *      uncorrected, it was never noticed.
 *
 *   3. NOTHING PUT IT BACK. There was no path at all from "activeEnemyIdx
 *      changed" to "scroll there". The pager learned its position from the
 *      finger and from nowhere else, while a kill re-points the target in the
 *      store (sweepDeadEnemies) — so the card you were looking at and the enemy
 *      your buttons were aimed at could be two different creatures.
 *
 * ⚠⚠ ALL THREE ARE CLOSED, because any one left open reopens the bug: one snap
 * authority, both drag endings resolve to a page, and an effect drives the pager
 * from the target whenever the target or the roster moves.
 *
 * ⚠ AND THE SAME REPORT CARRIED TWO SMALLER ASKS, both about the game naming
 * things it already knew: *"a boltcaster is a crossbow style weapon, it needs
 * something like that in the stats line so players know what class of ranged"*
 * and *"coatings are applied to the bolts not the weapon, but the weapon carries
 * the tag."*
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { pageIndexForOffset } from '../app/components/EnemyPanel';
import { rangedClassLabel, firesAmmunition } from '../app/engine/combatRules';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const PANEL = src('app/components/EnemyPanel.tsx');
const codeOnly = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('OTA-1557 — the page arithmetic', () => {
  it('⚠⚠⚠ a HALF-SCROLLED offset resolves to a whole page — never to nothing', () => {
    // The owner's exact state: parked between card 1 and card 2. Whichever way
    // it rounds, it must land ON a card, because "between" is not a page and
    // was never a legal resting place.
    const w = 220;
    expect(pageIndexForOffset(w * 1.5, w, 3)).toBe(2);
    expect(pageIndexForOffset(w * 1.4, w, 3)).toBe(1);
    expect(pageIndexForOffset(w * 0.6, w, 3)).toBe(1);
    expect(pageIndexForOffset(w * 0.4, w, 3)).toBe(0);
  });

  it('⚠⚠⚠ THE KILL CASE: an offset measured against the OLD roster clamps into the new one', () => {
    // A kill splices the roster mid-gesture. Three enemies became two, and the
    // finger was over what used to be card index 2. Without the clamp that
    // resolves to a page that no longer exists — and the pager scrolls to a
    // corpse's slot, which is precisely "hung between enemies".
    const w = 220;
    expect(pageIndexForOffset(w * 2, w, 2)).toBe(1);
    expect(pageIndexForOffset(w * 9, w, 2)).toBe(1);
    expect(pageIndexForOffset(w * 2, w, 1)).toBe(0);
  });

  it('⚠⚠ a negative offset (Android overscroll) resolves to the first card, not below it', () => {
    expect(pageIndexForOffset(-40, 220, 3)).toBe(0);
    expect(pageIndexForOffset(-4000, 220, 3)).toBe(0);
  });

  it('⚠⚠ a degenerate measurement can never crash or return a bad index', () => {
    // cardWidth is 0 until the panel has been laid out, and a division by it
    // would put NaN into scrollToIndex — which throws, inside a combat panel.
    for (const w of [0, -1, NaN, Infinity]) {
      expect(pageIndexForOffset(100, w, 3)).toBe(0);
    }
    expect(pageIndexForOffset(NaN, 220, 3)).toBe(0);
    expect(pageIndexForOffset(100, 220, 0)).toBe(0);
    expect(pageIndexForOffset(100, 220, -2)).toBe(0);
  });

  it('⚠ an exact page offset is left exactly where it is', () => {
    const w = 220;
    for (let i = 0; i < 4; i += 1) expect(pageIndexForOffset(w * i, w, 4)).toBe(i);
  });
});

describe('OTA-1557 — all three faults are closed', () => {
  it('⚠⚠⚠ ONE snap authority — pagingEnabled is gone, snapToInterval remains', () => {
    // Two mechanisms measuring different things, with nothing making them
    // agree, is the defect. snapToInterval survives because it is expressed in
    // the same unit as getItemLayout and the page math above.
    expect(codeOnly(PANEL)).not.toContain('pagingEnabled');
    expect(PANEL).toContain('snapToInterval={cardWidth}');
    expect(PANEL).toContain('snapToAlignment="start"');
    expect(PANEL).toContain('getItemLayout={(_, index) => ({ length: cardWidth, offset: cardWidth * index, index })}');
  });

  it('⚠⚠⚠ BOTH drag endings resolve to a page — the missing door has a reader', () => {
    // A flick ends in momentum; a drag released without a flick ends only in
    // onScrollEndDrag, and that is also what an inner vertical ScrollView hands
    // back when it returns a horizontal gesture. It had no reader at all.
    expect(PANEL).toContain('onMomentumScrollEnd={onMomentumEnd}');
    // OTA-1693 — the drag end also releases the settle watchdog's finger flag, then resolves as before.
    expect(PANEL).toContain('onScrollEndDrag={onDragEndSettled}');
    expect(PANEL).toContain('dragging.current = false; onDragEnd(e);');
    // …and both go through the SAME resolver, so they cannot disagree.
    expect(PANEL).toContain('const onMomentumEnd = resolvePage;');
    expect(PANEL).toContain('const onDragEnd = resolvePage;');
  });

  it('⚠⚠⚠ the pager FOLLOWS THE TARGET — the path that never existed', () => {
    // A kill re-points activeEnemyIdx in the store. Without this the card on
    // screen and the enemy the buttons are aimed at are two different creatures.
    expect(PANEL).toContain('listRef.current?.scrollToIndex({ index: idx, animated: false });');
    expect(PANEL).toContain('const rosterKey = enemies.map((v) => v.enemy.name).join(\'|\');');
    expect(PANEL).toContain('}, [activeIndex, rosterKey, cardWidth, enemies.length]);');
    expect(PANEL).toContain('ref={listRef}');
  });

  it('⚠⚠ the correction is NOT animated — a card that slides on its own reads as drift', () => {
    expect(PANEL).toContain('animated: false');
    expect(PANEL).not.toContain('scrollToIndex({ index: idx, animated: true })');
  });

  it('⚠⚠ scrollToIndex THROWS before layout, and that must not take the panel down', () => {
    // A fresh remount is exactly the moment the cell is not laid out yet, which
    // is exactly when a kill happens. An uncaught throw here would kill the
    // combat panel mid-fight. getItemLayout makes the fallback offset exact, so
    // it is not an approximation.
    expect(PANEL).toContain('listRef.current?.scrollToOffset({ offset: idx * cardWidth, animated: false });');
    expect(PANEL).toMatch(/try \{[\s\S]{0,200}scrollToIndex[\s\S]{0,200}\} catch \{/);
  });

  it('⚠⚠ the index is clamped before it is scrolled to, not only after', () => {
    expect(PANEL).toContain('const idx = Math.max(0, Math.min(activeIndex, enemies.length - 1));');
  });

  it('⚠ OTA-929 survives underneath — the roster remount that fixed the BLANK card', () => {
    // Different symptom, same area. Removing it while fixing the offset would
    // trade one bug for the older one.
    expect(PANEL).toContain("key={enemies.map((v) => v.enemy.name).join('|')}");
  });

  it('⚠ OTA-1514 survives too — the cell is still a vertical ScrollView', () => {
    // It is half the CAUSE of fault 2, and it is still correct: without it the
    // card cannot be scrolled to read what the corner cuts off. The fix is to
    // handle the gesture it hands back, not to delete it.
    expect(PANEL).toContain('const scrollWrap = (card: React.ReactNode, onPress: () => void) => (');
    expect(PANEL).toContain('nestedScrollEnabled');
  });
});

describe('OTA-1557 — the game names what it already knew', () => {
  it('⚠⚠ RANGED CLASS: bolt-caster outranks crossbow, because it is the more specific claim', () => {
    // A Bone Crossbow carries BOTH tags. Precedence decides what the player is
    // told, and the owner uses "bolt-caster" himself.
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['weapon', 'ranged', 'crossbow', 'bolt-caster'] })).toBe('Bolt-Caster');
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['weapon', 'ranged', 'crossbow'] })).toBe('Crossbow');
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['weapon', 'ranged', 'bow', 'stealth'] })).toBe('Bow');
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['weapon', 'ranged', 'firearm'] })).toBe('Firearm');
  });

  it('⚠⚠ THROWN outranks the frame word — how it is used beats what it looks like', () => {
    // A Mud Spear (Throwing) is a thrown weapon shaped like a spear. Calling it
    // a spear would describe the object and hide the verb.
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['throwable', 'weapon', 'ranged', 'thrown', 'spear'] })).toBe('Thrown');
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['throwable', 'weapon', 'ranged', 'knife', 'thrown'] })).toBe('Thrown');
  });

  it('⚠⚠ melee and rune-casters get NO ranged class — the line is omitted, not blanked', () => {
    expect(rangedClassLabel({ weaponKind: 'melee', tags: ['weapon', 'club', 'melee'] })).toBeNull();
    expect(rangedClassLabel({ weaponKind: 'runecaster', tags: ['weapon', 'runecaster'] })).toBeNull();
    expect(rangedClassLabel({ weaponKind: 'ranged', tags: ['weapon', 'ranged'] })).toBeNull();
  });

  it('⚠⚠ every ranged class in the catalog resolves — no weapon is left unlabelled by accident', () => {
    const weapons = JSON.parse(src('app/data/items/weapons.json')) as unknown;
    const rows = (Array.isArray(weapons) ? weapons : (weapons as { weapons?: unknown[] }).weapons ?? []) as Array<Record<string, unknown>>;
    const ranged = rows.filter((w) => w.weaponKind === 'ranged');
    expect(ranged.length).toBeGreaterThan(50);
    const unlabelled = ranged
      .filter((w) => rangedClassLabel({ weaponKind: 'ranged', name: String(w.name), tags: w.tags as string[] }) === null)
      .map((w) => String(w.name));
    expect(unlabelled).toEqual([]);
  });

  it('⚠⚠ AMMUNITION: a bow/crossbow/bolt-caster/firearm carries the coat on its shot; a thrown weapon does not', () => {
    // "coatings are applied to the bolts not the weapon, but the weapon carries
    // the tag." A thrown knife IS the projectile, so the distinction is real.
    expect(firesAmmunition({ weaponKind: 'ranged', tags: ['ranged', 'bolt-caster'] })).toBe(true);
    expect(firesAmmunition({ weaponKind: 'ranged', tags: ['ranged', 'bow'] })).toBe(true);
    expect(firesAmmunition({ weaponKind: 'ranged', tags: ['ranged', 'thrown'] })).toBe(false);
    expect(firesAmmunition({ weaponKind: 'melee', tags: ['melee'] })).toBe(false);
  });

  it('⚠⚠ the stat line carries the class, and the coating modal says where the coat rides', () => {
    expect(src('app/components/itemPreview.ts')).toContain('if (rangedClass) stats.push(`Class: ${rangedClass}`);');
    expect(src('app/screens/InventoryScreen.tsx')).toContain('the coating rides the ammunition — the weapon carries it and every shot delivers it.');
  });

  it('⚠ a rune-caster states its own rule on the item, not only in a refusal you trip over', () => {
    // Owner: "a runecaster is a power weapon so it can only use the power it can
    // generate, so you cannot apply coatings." He learned that rule by hitting
    // the wall twice; the item should have said so.
    expect(src('app/components/itemPreview.ts')).toContain("stats.push('Power weapon — takes no coating')");
  });
});
