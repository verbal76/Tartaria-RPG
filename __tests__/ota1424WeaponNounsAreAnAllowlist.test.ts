/**
 * OTA-1424 — "VALVE GEAR". WHAT IS THAT.
 *
 * Owner: *"we just made a weapon with a stupid name — it was Valve Gear. what
 * is that. we need to pick nouns that sound like weapons ... 'Spiral Mace',
 * 'Revenant Cudgel', that type of thing."*
 *
 * ⚠⚠ THIRD REPORT OF ONE DEFECT, AND THE FIRST TWO WERE ANSWERED THE SAME
 * LOSING WAY — by adding words to a list of banned ones:
 *
 *   · OTA-801 — "Aetheric Thread", "Resonant Veil" → banned thread/veil/wisp/…
 *   · OTA-814 — "Aether Core"                      → banned core/orb/heart/…
 *   · now     — "Valve Gear"                       → valve and gear were not on it
 *
 * Each was right about the instance and wrong about the shape. English has more
 * non-weapon nouns than anyone will enumerate, so a blocklist is a promise to be
 * surprised again; the next report was always going to be a word nobody thought
 * of. Inverted: a model-supplied weapon name is accepted only when it ends in a
 * noun this game already agrees is a weapon.
 *
 * ⚠ THE DETERMINISTIC NAMER WAS NEVER THE PROBLEM. "Quarry-Hewn Skewer",
 * "Rust-Eaten Cleaver", "Cairn Maul" — already the register asked for. Only the
 * Qwen namer, which overrides it, produced junk, and rejecting a name simply
 * lets the good one stand.
 */
import { fusedWeaponNameReadsSoft } from '../app/engine/itemFusion';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '..', 'app', 'engine', 'itemFusion.ts'), 'utf8');
const accepted = (n: string) => !fusedWeaponNameReadsSoft(n);

describe('OTA-1424 — the owner\'s row, and the two before it', () => {
  it('⚠⚠ "Valve Gear" is refused', () => {
    expect(accepted('Valve Gear')).toBe(false);
  });

  it('⚠⚠ …and so are the two that each cost their own OTA', () => {
    for (const n of ['Aetheric Thread', 'Resonant Veil', 'Humming Wisp', 'Aether Core', 'Sunken Heart', 'Mud Crystal']) {
      expect(accepted(n)).toBe(false);
    }
  });

  it('⚠⚠ the shapes he asked FOR are accepted', () => {
    expect(accepted('Spiral Mace')).toBe(true);
    expect(accepted('Revenant Cudgel')).toBe(true);
  });

  it('⚠⚠ and the words a blocklist would never have reached are refused too', () => {
    // The point of inverting: these were never banned and never will need to be.
    for (const n of [
      'Valve Gear', 'Brass Sprocket', 'Copper Bobbin', 'Rusted Flywheel',
      'Iron Bracket', 'Salvaged Gasket', 'Etched Ledger', 'Humming Kettle',
      'Cold Lantern', 'Bent Ladder', 'Quarry Trolley', 'Woven Basket',
    ]) expect(accepted(n)).toBe(false);
  });
});

describe('OTA-1424 — every forgeable name still passes its own guard', () => {
  it('⚠⚠ every noun the deterministic namer can pick is accepted', () => {
    // The guard rejecting a name the forge itself produces would send the
    // migration into a loop, re-minting a name that is already correct.
    const pools = SRC.match(/const WEAPON_NOUNS_(?:MELEE|LONG|RANGED) = \[([\s\S]*?)\] as const;/g) ?? [];
    expect(pools.length).toBe(3);
    const nouns = pools.flatMap((p) => [...p.matchAll(/'([^']+)'/g)].map((m) => m[1]!));
    expect(nouns.length).toBeGreaterThan(30);
    for (const n of nouns) expect(accepted(`Rust-Eaten ${n}`)).toBe(true);
  });

  it('⚠ real fused names from play are accepted', () => {
    for (const n of ['Quarry-Hewn Skewer', 'Rust-Eaten Cleaver', 'Cairn Maul', 'Mud-Rend Blade', 'Serpent Fang Dagger']) {
      expect(accepted(n)).toBe(true);
    }
  });
});

describe('OTA-1424 — compounds pass, so the pool can be beaten', () => {
  it('⚠⚠ a hyphenated tail resolves on its last part', () => {
    // Without this every compound the model invents would be rejected and the
    // model could never do better than the twenty words in the pool.
    expect(accepted('Storm-Cleaver')).toBe(true);
    expect(accepted('Ash-Reaver')).toBe(true);
    expect(accepted('Bone-Splitter')).toBe(true);
  });

  it('⚠ …but a compound ending in junk is still refused', () => {
    expect(accepted('Storm-Gear')).toBe(false);
    expect(accepted('Iron-Sprocket')).toBe(false);
  });

  it('⚠ a hyphenated noun that IS in a pool passes whole', () => {
    expect(accepted('Salvaged Bolt-Rig')).toBe(true);
  });

  it('⚠ punctuation and an empty tail do not crash or leak through', () => {
    expect(accepted('Resonant Cleaver.')).toBe(true);
    expect(accepted('"Spiral Mace"')).toBe(true);
    expect(accepted('   ')).toBe(false);
    expect(accepted('')).toBe(false);
    expect(accepted('Rust-Eaten 1234')).toBe(false);
  });
});

describe('OTA-1424 — armor is untouched, which is deliberate', () => {
  it('⚠⚠ the guard is only ever asked about weapons', () => {
    // A "Veil" or "Shroud" is a good armor name. Narrowing armour was never
    // asked for, and both call sites gate on kind === 'weapon'.
    const calls = [...SRC.matchAll(/fusedWeaponNameReadsSoft\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // RETARGETED BY OTA-1426 — both sites now pass the damage type through, for
    // rule 7. The claim is unchanged: the guard is reached only for weapons.
    for (const kindGate of [
      "stats.kind === 'weapon' && fusedWeaponNameReadsSoft(name, stats.damageType)",
      "item.uniqueStats.kind === 'weapon' && fusedWeaponNameReadsSoft(item.name, item.uniqueStats.damageType)",
    ]) expect(SRC).toContain(kindGate);
  });
});

describe('OTA-1424 — one source, so the pools and the guard cannot drift', () => {
  it('⚠⚠ the deterministic pools ARE the allowlist seed, not a copy', () => {
    // Re-typing the nouns in two places is how the guard would end up rejecting
    // a name the forge produces. The suffix pool spreads the hoisted constant.
    expect(SRC).toContain('weapon: [...WEAPON_NOUNS_MELEE],');
    expect(SRC).toContain('long: [...WEAPON_NOUNS_LONG],');
    expect(SRC).toContain('ranged: [...WEAPON_NOUNS_RANGED],');
    expect(SRC).toContain('...WEAPON_NOUNS_MELEE,');
    // RETARGETED BY OTA-1426 — the hand-written extras became the owner's
    // anchor library, and agent is spread separately so rule 7 can gate it.
    for (const cat of ['blade', 'blunt', 'polearm', 'ranged', 'natural']) {
      expect(SRC).toContain(`...WEAPON_ANCHOR_NOUNS.${cat},`);
    }
    expect(SRC).toContain('WEAPON_ANCHOR_NOUNS.agent.map((n) => n.toLowerCase())');
  });

  it('⚠ the extra vocabulary is grouped by category, as asked', () => {
    for (const cat of ['  blade: [', '  blunt: [', '  polearm: [', '  ranged: [', '  natural: [', '  agent: [']) {
      expect(SRC).toContain(cat);
    }
  });

  it('⚠ the three prior reports are named where the rule lives', () => {
    expect(SRC).toContain('THE GUARD IS AN ALLOWLIST NOW, BECAUSE A BLOCKLIST CANNOT WIN');
    expect(SRC).toContain('Valve Gear');
    expect(SRC).toContain('a blocklist is a');
  });

  it('⚠⚠ the split-before-strip bug is pinned — it rejected EVERY legal name', () => {
    // The first draft stripped non-letters before splitting, eating the spaces:
    // "Resonant Cleaver" became one token and nothing passed. The OTA-801 suite
    // caught it, which is what it was written to do.
    expect(SRC).toContain('SPLIT FIRST, THEN STRIP');
    // RETARGETED BY OTA-1426 — the split now feeds the word-count rule as well,
    // so the tokens are kept rather than popped inline. Same claim: split on
    // whitespace FIRST, strip punctuation from the tail only.
    expect(SRC).toContain("const words = name.trim().toLowerCase().split(/\\s+/).filter(Boolean);");
    expect(SRC).toContain("const last = (words.pop() ?? '').replace(/[^a-z-]/g, '');");
  });
});

describe('OTA-1425 — the catalogue is the biggest source, and it caught a hole', () => {
  it('⚠⚠ AXE. Nine of them ship, and OTA-1424 would have rejected the word', () => {
    // The hole that proved a hand-written allowlist is the blocklist mistake
    // wearing the other coat: a curated set someone has to REMEMBER, against a
    // game that already ships 276 weapons saying what a weapon is called here.
    expect(accepted('Rust-Eaten Axe')).toBe(true);
  });

  it('⚠⚠ …and the rest of what was missing', () => {
    for (const n of [
      'Cairn Greatsword', 'Slag-Cast Buckler', 'Iron-Bound Shield', 'Voltaic Cannon',
      'Bog-Oak Longbow', 'Tempered Shortsword', 'Bog-Oak Kukri', 'Forge-Black Claymore',
      'Scrap-Welded Knuckles', 'Anvil-Struck Gauntlet', 'Voltaic Railgun', 'Salvaged Handgun',
    ]) expect(accepted(n)).toBe(true);
  });

  it('⚠⚠ every non-runecaster catalogue weapon name passes its own guard', () => {
    // The strongest form of the claim: no weapon the game ships could be
    // rejected if the namer proposed its noun.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WEAPONS } = require('../app/engine/crafting');
    const QUALIFIERS = new Set(['legendary', 'rare', 'uncommon', 'common', 'single', 'stealth', 'throw', 'throwing', 'ranged']);
    let checked = 0;
    for (const w of WEAPONS as Array<{ name: string; weaponKind?: string }>) {
      if (w.weaponKind === 'runecaster') continue;
      const tail = (w.name.trim().split(/\s+/).pop() ?? '').replace(/[()]/g, '').toLowerCase();
      if (!/^[a-z-]{2,}$/.test(tail) || QUALIFIERS.has(tail)) continue;
      checked++;
      expect(accepted(`Rust-Eaten ${tail}`)).toBe(true);
    }
    expect(checked).toBeGreaterThan(180);
  });

  it('⚠⚠ RUNECASTERS ARE EXCLUDED — their head nouns are effects, not arms', () => {
    // Blight, Rebirth, Verdict, Ripple, Torrent. Folding these in would re-admit
    // exactly the abstract-noun names OTA-814 removed.
    for (const n of ['Sunken Rebirth', 'Mud Verdict', 'Hollow Blight', 'Still Ripple']) {
      expect(accepted(n)).toBe(false);
    }
    expect(SRC).toContain("weaponKind !== 'runecaster'");
  });

  it('⚠ parenthetical qualifiers never become nouns', () => {
    // Catalogue names carry "(Legendary)", "(Throwing)", "(Single)". Those are
    // tags, and admitting them would accept "Rust-Eaten Legendary".
    for (const n of ['Rust-Eaten Legendary', 'Cairn Rare', 'Iron Throwing', 'Slag Single']) {
      expect(accepted(n)).toBe(false);
    }
  });

  it('⚠ it is DERIVED, so a new catalogue weapon teaches the namer for free', () => {
    expect(SRC).toContain('const CATALOG_WEAPON_TAILS: readonly string[] = WEAPONS');
    expect(SRC).toContain('.concat(CATALOG_WEAPON_TAILS)');
    expect(SRC).toContain('AND THE CATALOGUE ITSELF IS THE BIGGEST SOURCE');
  });
});

// ── OTA-1426 — the owner's 300-noun anchor library ──────────────────────────
import { readFileSync as rf } from 'fs';
const ANCHORS = (() => {
  const i = SRC.indexOf('const WEAPON_ANCHOR_NOUNS = {');
  const body = SRC.slice(i, SRC.indexOf('} as const;', i));
  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/^  (\w+): \[([\s\S]*?)\n  \],/gm)) {
    out[m[1]!] = [...m[2]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
  }
  return out;
})();

describe('OTA-1426 — the anchor library is in, whole', () => {
  it('⚠⚠ six categories, fifty anchors each, exactly as supplied', () => {
    expect(Object.keys(ANCHORS).sort()).toEqual(['agent', 'blade', 'blunt', 'natural', 'polearm', 'ranged']);
    for (const [cat, list] of Object.entries(ANCHORS)) {
      expect({ [cat]: list.length }).toEqual({ [cat]: 50 });
      expect(new Set(list).size).toBe(50); // no duplicates inside a category
    }
  });

  it('⚠⚠ his three worked examples all pass', () => {
    // "Rust-Marked Knife | Grave Iron Maul | Plasma Bolt-Caster"
    expect(accepted('Rust-Marked Knife')).toBe(true);
    expect(accepted('Grave Iron Maul')).toBe(true);
    expect(accepted('Plasma Bolt-Caster')).toBe(true);
  });

  it('⚠⚠ every non-agent anchor is accepted on any damage type', () => {
    for (const cat of ['blade', 'blunt', 'polearm', 'ranged', 'natural']) {
      for (const n of ANCHORS[cat]!) {
        expect(accepted(`Rust-Marked ${n}`)).toBe(true);
      }
    }
  });

  it('⚠ hyphenated anchors count as ONE anchor (his rule 6)', () => {
    for (const n of ['Bolt-Caster', 'Cross-Saber', 'Shield-Hammer', 'Magna-Cannon', 'Aether-Lance']) {
      expect(accepted(`Grave ${n}`)).toBe(true);
    }
  });
});

describe('OTA-1426 — rule 7: agent anchors need the weapon to BE the substance', () => {
  const soft = (n: string, d?: string) => fusedWeaponNameReadsSoft(n, d);

  it('⚠⚠ an agent name on a PAYLOAD weapon is accepted', () => {
    for (const d of ['poison', 'burn', 'electrical', 'aetheric']) {
      expect(soft('Resonant Miasma', d)).toBe(false);
      expect(soft('Grave Venom', d)).toBe(false);
    }
  });

  it('⚠⚠ …and refused on a weapon you simply hit things with', () => {
    for (const d of ['slashing', 'piercing', 'bludgeoning']) {
      expect(soft('Resonant Miasma', d)).toBe(true);
      expect(soft('Grave Venom', d)).toBe(true);
    }
  });

  it('⚠⚠ DUST and MIST — the two words that collided with OTA-801/814', () => {
    // Both are in his AGENT list; both were explicitly banned before for reading
    // as "anything but a weapon". Neither was dropped: they are admitted exactly
    // where they read correctly and refused exactly where they read as the old
    // defect. That is rule 7 doing the work a blanket decision could not.
    expect(soft('Aether Mist', 'aetheric')).toBe(false);
    expect(soft('Aether Mist', 'piercing')).toBe(true);
    expect(soft('Grave Dust', 'poison')).toBe(false);
    expect(soft('Grave Dust', 'bludgeoning')).toBe(true);
  });

  it('⚠ with no damage type known, an agent anchor is refused', () => {
    // The migration path calls this on stored items; absent data must fail
    // toward the deterministic name rather than toward the old complaint.
    expect(soft('Resonant Miasma')).toBe(true);
  });

  it('⚠ every agent anchor obeys the gate, all fifty of them', () => {
    for (const n of ANCHORS.agent!) {
      expect(soft(`Grave ${n}`, 'poison')).toBe(false);
      expect(soft(`Grave ${n}`, 'bludgeoning')).toBe(true);
    }
  });
});

describe('OTA-1426 — rule 5: short names, and the prompt aims at the target', () => {
  it('⚠⚠ five lexical units is refused', () => {
    expect(accepted('One Two Three Four Five Cleaver')).toBe(false);
  });

  it('⚠ four is tolerated — the ceiling is target-plus-one', () => {
    expect(accepted('Rust-Marked Ancient Aetheric Bolt-Caster')).toBe(true);
  });

  it('⚠⚠ …and the PROMPT asks for 2-3, so names aim at the target not the ceiling', () => {
    // Guard and prompt have to be set together. A guard at the target would
    // throw away names the prompt had just asked for; a prompt at the ceiling
    // makes every name drift to the longest thing that passes.
    expect(SRC).toContain('<2-3 word evocative name>');
    expect(SRC).toContain('Names are short (2-3 words)');
    expect(SRC).not.toContain('Names are short (2-4 words)');
    expect(SRC).toContain('const MAX_FORGED_NAME_WORDS = 4;');
  });
});
