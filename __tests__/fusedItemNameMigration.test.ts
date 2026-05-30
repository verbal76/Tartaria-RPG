// OTA-225 — verifies the save-load migration that rewrites broken
// fused-item names ("Resonant undefined" → "Resonant Cleaver" /
// etc.) into proper names using the item's id as a deterministic
// seed.

// Inline copy of the migration logic from backfillPlayer's inventory
// loop. Production code uses the same suffix pools as the OTA-221
// deterministic synth.
function migrateFusedName(item: { id: string; name: string; uniqueStats?: { kind: string } }): string {
  if (!item.uniqueStats || !/ undefined\b/i.test(item.name)) return item.name;
  const suffixPool: Record<string, string[]> = {
    weapon: ['Cleaver', 'Edge', 'Spike', 'Lash', 'Maul'],
    armor: ['Brace', 'Vigil', 'Mantle', 'Shroud', 'Bulwark'],
    dog_armor: ['Vigil', 'Wrap', 'Pattern', 'Stride'],
  };
  const pool = suffixPool[item.uniqueStats.kind] ?? suffixPool.weapon!;
  let hash = 5381;
  for (let i = 0; i < item.id.length; i++) {
    hash = ((hash << 5) + hash + item.id.charCodeAt(i)) >>> 0;
  }
  const suffix = pool[hash % pool.length]!;
  return item.name.replace(/\s*undefined\b/gi, ` ${suffix}`).trim();
}

describe('OTA-225 — fused-item name migration', () => {
  it('rewrites "Resonant undefined" with a real weapon suffix', () => {
    const item = {
      id: 'fused_1748568834567_823',
      name: 'Resonant undefined',
      uniqueStats: { kind: 'weapon' },
    };
    const newName = migrateFusedName(item);
    expect(newName).not.toMatch(/undefined/i);
    expect(newName.split(' ')).toHaveLength(2); // "<Theme> <Suffix>"
    expect(['Cleaver', 'Edge', 'Spike', 'Lash', 'Maul']).toContain(newName.split(' ')[1]);
  });

  it('deterministic — same id → same suffix every load', () => {
    const item = {
      id: 'fused_1748568834567_823',
      name: 'Resonant undefined',
      uniqueStats: { kind: 'weapon' },
    };
    const a = migrateFusedName(item);
    const b = migrateFusedName(item);
    expect(a).toBe(b);
  });

  it('different ids produce different suffixes (deterministic but varied)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `fused_${1000000 + i * 7919}_${i}`);
    const names = new Set<string>();
    for (const id of ids) {
      names.add(migrateFusedName({ id, name: 'Resonant undefined', uniqueStats: { kind: 'weapon' } }));
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it('armor kind uses the armor suffix pool', () => {
    const item = {
      id: 'fused_armor_1',
      name: 'Cinderhalt undefined',
      uniqueStats: { kind: 'armor' },
    };
    const newName = migrateFusedName(item);
    expect(['Brace', 'Vigil', 'Mantle', 'Shroud', 'Bulwark']).toContain(newName.split(' ')[1]);
  });

  it('dog_armor kind uses the dog_armor suffix pool', () => {
    const item = {
      id: 'fused_vest_1',
      name: 'Reclaimer undefined',
      uniqueStats: { kind: 'dog_armor' },
    };
    const newName = migrateFusedName(item);
    expect(['Vigil', 'Wrap', 'Pattern', 'Stride']).toContain(newName.split(' ')[1]);
  });

  it('items without uniqueStats pass through unchanged', () => {
    const item = { id: 'x', name: 'undefined undefined' };
    expect(migrateFusedName(item)).toBe('undefined undefined');
  });

  it('items without the " undefined" pattern pass through unchanged', () => {
    const item = { id: 'x', name: 'Cinderhalt Brace', uniqueStats: { kind: 'armor' } };
    expect(migrateFusedName(item)).toBe('Cinderhalt Brace');
  });
});
