jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1251 — "WHY ARE WE DOING INVENTORY STUFF?"
//
// Owner, on the armor beat: *"it was supposed to highlight the fact you can select
// and equip the vest from the popup, not from inventory."*
//
// ⚠⚠ THE ★ HAS MEANT "PICKED AND EQUIPPED AT THE SAME TIME" SINCE HE FIRST ASKED
// ABOUT THE MARK. OTA-1237, in his words: *"why did the take items get a diamond, I
// thought that was for upgraded armor items that you picked and equipped at the
// same time."* I changed the GLYPH and never built the behaviour, so ★ has been a
// label the player had to go and act on somewhere else — and OTA-1248 then wrote a
// whole tutorial beat around that detour: take it here, equip it in the pack.
//
// ⚠⚠ AND OTA-1250's LOCK TURNED THE DETOUR INTO A DEAD END, WHICH IS HOW IT
// SURFACED. Once the vest was taken the picker had no live row left, so every tap
// refused — with a nudge telling him to do the thing he had just done. Measured
// from his log: **fourteen refusals in ninety seconds**, the last ten inside twenty
// seconds, all of them `"Not that — take the vest from TAKE / SALVAGE, then open
// your pack and equip it."` A lock is only as good as the action it permits.
//
// ⚠ THE TAIL TEXT IS PART OF THE FIX, NOT DECORATION. Every other row in this card
// names its own action — `→ pack`, `salvage`, `INVESTIGATE`. The upgrade row said
// `BETTER`, which describes the ITEM, and it is now the one row whose tap does
// something different from its neighbours. That is precisely the deduction the
// colour layout exists to delete.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};
import { GatherModal } from '../app/components/GatherModal';
import { isUpgradeOverEquipped, upgradeEquipSlot } from '../app/engine/gatherSort';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

function textOf(chips: { noun: string }[], player: unknown) {
  const tree = renderer.create(
    <GatherModal
      visible player={player as never} chips={chips} leadNouns={[]}
      onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
      onInvestigate={() => {}} onCancel={() => {}}
    />,
  );
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const node = n as { children?: unknown[] } | null;
    if (node && node.children) node.children.forEach(walk);
  };
  walk(tree.toJSON());
  tree.unmount();
  return out.join('|');
}

const BARE = { equipped: {}, inventory: [] };

describe('OTA-1251 — a ★ row goes somewhere', () => {
  it('⚠⚠ every noun the picker MARKS as an upgrade resolves to a real slot', () => {
    // ⚠ THE RULE, AND WHY IT IS ONE LOOKUP: a row that shows ★ and then has nowhere
    // to put the item would take-and-do-nothing, which reads as a broken tap. The
    // mark and the slot come from the same catalog lookups, so this cannot drift —
    // and this test would catch it if someone split them.
    for (const noun of ["Mud-Warden's Vest", 'Reclaimer\'s Cloak', 'Rough Hewn Mask']) {
      expect(isUpgradeOverEquipped(BARE as never, noun)).toBe(true);
      expect(upgradeEquipSlot(noun)).not.toBeNull();
    }
  });

  it('⚠⚠ it hands back the CATALOG name, not the noun that was tapped', () => {
    // ⚠ THE BUG THIS HEADS OFF: scene nouns match loosely, `takeAmbientNoun` grants
    // under the catalog name, and `equipItem` matches the pack by exact name. So
    // equipping by the tapped word would fail on every loose match — a refusal
    // ("I don't see a blade on you") for a take that had just succeeded.
    const vest = upgradeEquipSlot("mud-warden's vest");
    expect(vest).toEqual({ name: "Mud-Warden's Vest", slot: 'chest' });
  });

  it('⚠ a weapon upgrade goes to the main hand; scenery goes nowhere', () => {
    expect(upgradeEquipSlot('Bone Splitter Axe')?.slot).toBe('main');
    expect(upgradeEquipSlot('brick')).toBeNull();
    expect(upgradeEquipSlot('mud-glazed library archive console')).toBeNull();
  });
});

describe('OTA-1251 — RENDERED: the row says what the tap does', () => {
  it('⚠⚠ the upgrade tail names the ACTION, not the item', () => {
    const text = textOf([{ noun: "Mud-Warden's Vest" }], BARE);
    expect(text).toContain('★ → worn');
    // ⚠ `BETTER` described the item and left the tap to be guessed — the one row
    // in the card whose tail did not name its own verb.
    expect(text).not.toContain('BETTER');
  });

  it('⚠ a plain take still reads → pack, so the two are visibly different actions', () => {
    // The distinction only teaches if the non-upgrade row is unchanged.
    const text = textOf([{ noun: 'Aetheric Torch' }], BARE);
    expect(text).toContain('→ pack');
    expect(text).not.toContain('→ worn');
  });

  it('⚠ the screen reader is told the whole action, not half of it', () => {
    const tree = renderer.create(
      <GatherModal
        visible player={BARE as never} chips={[{ noun: "Mud-Warden's Vest" }]} leadNouns={[]}
        onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
        onInvestigate={() => {}} onCancel={() => {}}
      />,
    );
    const labels = (tree as unknown as { root: { findAll(f: (n: { props: Record<string, unknown> }) => boolean): Array<{ props: Record<string, unknown> }> } })
      .root.findAll((n) => typeof n.props?.accessibilityLabel === 'string')
      .map((n) => String(n.props.accessibilityLabel));
    expect(labels.some((l) => /Tap to take it and put it on/.test(l))).toBe(true);
    tree.unmount();
  });
});

describe('OTA-1251 — the tap takes AND wears', () => {
  it('⚠⚠ the picker equips in place — the ★ is not a label you act on elsewhere', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('const wear = isUpgradeOverEquipped(player, noun)');
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 900);
    expect(block).toContain('takeAmbientNoun(noun);');
    expect(block).toContain('equipItem(wear.name, wear.slot)');
  });

  it('⚠⚠ it only equips if the take actually LANDED', () => {
    // ⚠ Both refusal paths log rather than throw: a full pack, and a noun already
    // worked over ("You've already taken or worked over the X here"). Equipping
    // regardless would answer one refusal with a second — "I don't see it on you" —
    // at a player who did nothing wrong.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('const wear = isUpgradeOverEquipped(player, noun)');
    const block = screen.slice(i, i + 900);
    expect(block).toContain('player?.inventory ?? []');
    expect(block).toContain('i.quantity > 0');
  });

  it('⚠⚠ the armor beat completes on that ONE tap — no trip to the pack', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf("if (tutBeat === 'armor' && /vest|warden/i.test(noun)) {");
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 800);
    expect(block).toContain('setTakeOpen(false);');
    expect(block).toContain('submit(`take ${noun}`);');
    expect(block).toContain(`equipItem("Mud-Warden's Vest", 'chest')`);
    // ...and equipItem is still what advances the beat, from its own top, so a
    // player who equips from the pack instead is not punished for it.
    const store = src('app', 'state', 'gameStore.ts');
    const eq = store.indexOf('  equipItem(itemName, slot, itemId) {');
    expect(store.slice(eq, eq + 600)).toContain("maybeAdvanceTutorial('armor')");
  });
});

describe('OTA-1251 — the copy stopped sending him to inventory', () => {
  it('⚠⚠ no tutorial surface tells the player to open their pack for the vest', () => {
    // ⚠ THREE SURFACES SAID IT and all three had to change: the beat body, the
    // Arbiter line the take fires, and the stuck-player nudge. His log shows the
    // NUDGE was the one he actually read, fourteen times.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TUTORIAL_STEPS } = require('../app/components/tutorialSteps');
    const beat = TUTORIAL_STEPS.find((s: { id?: string }) => s.id === 'armor');
    expect(beat).toBeDefined();
    const copy = `${beat.body} ${beat.arbiter} ${beat.remind}`.toLowerCase();
    expect(copy).not.toContain('open your pack');
    expect(copy).not.toContain('open the pack');
    // It names the mark and the one tap.
    expect(beat.body).toContain('★');
    expect(copy).toContain('take / salvage');

    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const hint: Record<string, string> = {');
    const hints = store.slice(i, store.indexOf('};', i));
    expect(hints).toContain('armor:');
    expect(hints).not.toContain('open your pack and equip it');
  });

  it('⚠⚠ the take no longer narrates a chore the player does not have', () => {
    // "In your pack. It does you no good in there — open the pack and put it on."
    // fired on the same tap that now equips, so it described a step already done.
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).not.toContain('It does you no good in there');
    // And the already-have branch stopped pointing at the pack too.
    expect(store).not.toContain('"You have it already. Open your pack and put it on."');
  });
});
