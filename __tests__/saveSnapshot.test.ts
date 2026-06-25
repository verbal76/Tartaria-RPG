import { buildSaveSnapshot, stampSaveExport } from '../app/diagnostics/saveSnapshot';

// OTA-341 — COPY SAVE export. The snapshot must (1) surface the brick-suspect
// fields, (2) embed a JSON block that round-trips back to the exact state so a
// pasted save can be reproduced via loadSlotIntoGame, and (3) never throw on a
// null/odd player.

function mkPlayer(over: Record<string, unknown> = {}) {
  return {
    name: 'Verbal', raceId: 'mud_dweller', factionId: 'forgotten_order',
    hp: 30, hpMax: 30, dead: false, hoursElapsed: 216, currentLocationId: 'builders_survey_camp',
    inventory: [{ id: 'a', name: 'Trail Rations', kind: 'consumable', quantity: 3, tags: ['food'], rarity: 'Common' }],
    statusEffects: [], sidekick: null,
    mainQuest: { phase: 'cores', guardiansDefeated: [] },
    dog: {
      id: 'd', name: 'Rocky', status: 'dead', hp: 0, hpMax: 12, loyalty: 0,
      downedAtHour: 200, bleedWarned: true, loyaltyBeatFloor: 15, lastFedAtHour: 100,
    },
    ...over,
  } as never;
}

describe('saveSnapshot — COPY SAVE export', () => {
  it('surfaces the brick-suspect fields in HIGHLIGHTS', () => {
    const wm = { puppyVendorOwed: true, puppyVendorQueued: true, puppyVendorUsed: false };
    const snap = buildSaveSnapshot(mkPlayer(), wm);
    expect(snap).toMatch(/dog: Rocky · status dead/);
    expect(snap).toMatch(/downedAtHour 200 · bleedWarned true · loyaltyBeatFloor 15/);
    expect(snap).toMatch(/puppyVendor: owed true · queued true · used false/);
  });

  it('embeds a JSON block that round-trips to the exact state', () => {
    const wm = { puppyVendorOwed: true, foo: 'bar' };
    const player = mkPlayer();
    const snap = buildSaveSnapshot(player, wm);
    // Pull the JSON line (the last non-empty line) and parse it back.
    const jsonLine = snap.split('\n').filter((l) => l.trim().startsWith('{')).pop()!;
    const parsed = JSON.parse(jsonLine);
    expect(parsed.worldMemory).toEqual(wm);
    expect(parsed.player.dog.status).toBe('dead');
    expect(parsed.player.name).toBe('Verbal');
  });

  it('handles a null player without throwing', () => {
    expect(() => buildSaveSnapshot(null, {})).not.toThrow();
    expect(buildSaveSnapshot(null, {})).toMatch(/No active character/);
  });

  it('stampSaveExport wraps in a greppable BEGIN/END envelope with char count', () => {
    const stamped = stampSaveExport('BODY', 'DEVICE', 'Verbal');
    expect(stamped).toMatch(/=== TARTARIA SAVE · 4 CHARS · BEGIN ===/);
    expect(stamped).toMatch(/=== END SAVE · 4 CHARS ===/);
    expect(stamped).toMatch(/Tartaria Realms · Verbal/);
    expect(stamped).toContain('DEVICE');
  });
});
