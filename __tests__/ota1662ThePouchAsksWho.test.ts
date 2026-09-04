// OTA-1662 — THE POUCH ASKS WHO.
//
// Owner, playing the healing pouch: *"the heals bandolier works. I can tap on a
// button and it heals but it automatically applies it to me. I want them to act
// like they act when you tap on the inventory so you tap on it and it asks if
// you want to heal you or your dog."*
//
// ⚠⚠⚠ I HARD-CODED `'self'` IN OTA-1658 AND DID NOT NOTICE WHAT I HAD DROPPED.
// That OTA was fixing a dead button — the tap went through `useInventoryItem`
// and died on `submitPlayerAction`'s `pendingRolls` guard — and the fix,
// `useHealBatch(it.name, 'self', 1)`, was right about the ROUTE and silently
// wrong about the TARGET. The pack has offered a dog since OTA-184 ("let's use
// the dogs name instead of just dog"); the pouch was explicitly asked to behave
// "like they act when you tap on the inventory", and it answered a question the
// player never got to be asked.
//
// ⚠ A TAP NOW ASKS — BUT ONLY WHEN THERE IS SOMETHING TO ASK. With no dog
// walking beside you there is exactly one possible answer, and a confirmation
// step with one option is a worse experience than the bug it replaces. So the
// chooser appears only when a dog is actually present, by the same three-part
// test the inventory's own Feed button uses (exists, not abandoned, not dead).
//
// ⚠⚠ AND BOTH BRANCHES CALL THE STORE DIRECTLY, which is the OTA-1658 rule —
// the one this file learned the hard way. Wiring this up is how I found that
// the INVENTORY's single "Feed <dog>" button never learned it: it still routed
// through `submitPlayerAction('feed dog …')`, eleven lines above a
// `useHealBatch` call that already knew better, so feeding the dog from the
// pack mid-fight did nothing at all. Same defect, same file, still live. Fixed
// here and pinned below.

const readRepo = (...parts: string[]): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', ...parts), 'utf8',
  ) as string;

const inputBox = (): string => readRepo('app', 'components', 'InputBox.tsx');
const inventory = (): string => readRepo('app', 'screens', 'InventoryScreen.tsx');

describe('OTA-1662 — the pouch asks who the heal is for', () => {
  it('⚠ the hard-coded self-heal is gone', () => {
    expect(inputBox()).not.toContain("useHealBatch(it.name, 'self', 1); }}");
  });

  it('⚠⚠ a tap with a dog present opens the chooser instead of healing', () => {
    const src = inputBox();
    expect(src).toContain('if (medkitDog) { setMedkitPick(it.id); return; }');
    // The heal must sit AFTER that guard, or the question is decoration.
    const guard = src.indexOf('if (medkitDog) { setMedkitPick(it.id); return; }');
    const heal = src.indexOf("useHealBatch(it.name, 'self', 1)", guard);
    expect(heal).toBeGreaterThan(guard);
  });

  it('and the chooser offers both targets, naming the dog', () => {
    const src = inputBox();
    expect(src).toContain("heal('self')");
    expect(src).toContain("heal('dog')");
    expect(src).toContain('medkitDog!.name.toUpperCase()');
    // The dog's HP rides on the button, like the inventory's Feed label does,
    // so you can see whether they even need it before spending a kit.
    expect(src).toContain('{medkitDog!.hp}/{medkitDog!.hpMax}');
  });

  it('⚠ with NO dog it just heals — a question with one answer is not a question', () => {
    const src = inputBox();
    const dogTest = src.slice(src.indexOf('const medkitDog = useGameStore'));
    expect(dogTest.slice(0, 400)).toContain("d.status !== 'abandoned' && d.status !== 'dead'");
  });

  it('there is a way back out of the question', () => {
    expect(inputBox()).toContain('onPress={() => setMedkitPick(null)}');
  });

  it('⚠ and closing the pouch forgets the half-made choice', () => {
    // Otherwise reopening lands mid-question about an item you may no longer
    // have, which is the ghost-stack class of bug this rack keeps meeting.
    expect(inputBox()).toContain('setMedkitPick(null); setMedkitOpen((v) => !v);');
  });

  it('a stack that empties between the two taps does not heal a ghost', () => {
    expect(inputBox()).toContain('if (!it) { setMedkitPick(null); return null; }');
  });
});

describe('OTA-1662 — ⚠⚠⚠ the inventory Feed button was the SAME defect, still live', () => {
  it('it no longer routes the dog feed through the parser', () => {
    // `submitPlayerAction` returns on its first line while pendingRolls is set,
    // and combat IS pendingRolls — so this did nothing at all in a fight.
    expect(inventory()).not.toContain("submitPlayerAction(`feed dog ${pending.item.name}`)");
  });

  it('it calls the same direct action its own "Feed Max" button already used', () => {
    const src = inventory();
    expect(src).toContain("useHealBatch(pending.item.name, 'dog', 1);");
    expect(src).toContain("useHealBatch(pending.item.name, 'dog', n);");
  });

  it('⚠ and the rule is restated where it was broken', () => {
    expect(inventory()).toContain('OTA-1662');
    expect(inventory()).toMatch(/combat IS pendingRolls/);
  });
});
