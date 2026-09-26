// OTA-1885 — the read-only save probe.
//
// Born from a save-preservation incident: a Golem title screen showed no
// characters with the slot index (tartaria.slots.index.v2) empty, and the
// owner's permanent rule is that an existing save is never discarded to make
// anything work. Before any repair is even proposed, the narrower question —
// does a slot BLOB still exist behind an empty/corrupt index? — has to be
// answerable without risking the very evidence being examined.
//
// Two things must both be true for this diagnostic to be safe to ship:
//   1. STATIC — the probe module's own source cannot contain a call to any
//      AsyncStorage write method, nor an import of saveSystem.ts (whose
//      loadSlot() can itself WRITE the live key from .bak as a self-heal).
//   2. BEHAVIORAL — running the probe against every classification scenario
//      it's meant to detect leaves AsyncStorage's keys and values completely
//      unchanged, and correctly classifies each scenario without guessing.

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildSaveSlotProbeReport, formatSaveSlotProbeReport } from '../app/diagnostics/saveSlotProbe';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const probeSourceFull: string = fs.readFileSync(
  path.join(__dirname, '../app/diagnostics/saveSlotProbe.ts'), 'utf8');

/** Comment lines are allowed to SAY a forbidden name while explaining why the
 *  code avoids it (this file's own header does exactly that). Only
 *  executable lines are the ones that must never contain one — same
 *  convention as ota1118HungerCarcass's codeLines(). */
function codeLines(src: string): string[] {
  return src.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}

const probeCode = codeLines(probeSourceFull).join('\n');

describe('OTA-1885 — the probe has no reachable mutation path (static proof)', () => {
  const forbidden = [
    'setItem', 'removeItem', 'multiRemove', 'mergeItem', 'multiMerge', 'clear(',
    'saveSlot', 'loadSlot', 'deleteSlot', 'mutateSlot', 'writeIndex',
    'upsertIndexEntry', 'setActiveSlot',
  ];
  it.each(forbidden)('never references %s in executable code', (name) => {
    expect(probeCode).not.toContain(name);
  });

  it('never imports from saveSystem.ts', () => {
    expect(probeCode).not.toMatch(/from ['"].*saveSystem['"]/);
  });

  it('only calls AsyncStorage.getAllKeys and AsyncStorage.getItem', () => {
    const calls = probeCode.match(/AsyncStorage\.\w+/g) ?? [];
    const distinct = new Set(calls);
    expect(distinct.size).toBeGreaterThan(0);
    for (const call of distinct) {
      expect(['AsyncStorage.getAllKeys', 'AsyncStorage.getItem']).toContain(call);
    }
  });

  it('the header explains the read-only guarantee, so the next reader does not have to re-derive it', () => {
    expect(probeSourceFull).toContain('READ-ONLY');
    expect(probeSourceFull).toContain('self-heal');
  });
});

/** Snapshot every key+value in the mock store, for a before/after diff. */
async function snapshotStorage(): Promise<Record<string, string | null>> {
  const keys = await AsyncStorage.getAllKeys();
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = await AsyncStorage.getItem(k);
  return out;
}

describe('OTA-1885 — running the probe never changes storage (behavioral proof)', () => {
  afterEach(async () => { await AsyncStorage.clear(); });

  it('orphaned save: index is an empty array, slot blob + backup both exist and parse', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ['tartaria.slots.index.v2', '[]'],
      ['tartaria.slot.slot_old_1.v2', JSON.stringify({ player: { name: 'Aldric', raceId: 'mud_dweller' }, savedAt: 1000 })],
      ['tartaria.slot.slot_old_1.v2.bak', JSON.stringify({ player: { name: 'Aldric', raceId: 'mud_dweller' }, savedAt: 900 })],
    ]);
    const before = await snapshotStorage();

    const report = await buildSaveSlotProbeReport();

    const after = await snapshotStorage();
    expect(after).toEqual(before);

    expect(report.indexPresent).toBe(true);
    expect(report.indexParses).toBe(true);
    expect(report.indexSlotIds).toEqual([]);
    expect(report.slots).toHaveLength(1);
    expect(report.slots[0]!.slotId).toBe('slot_old_1');
    expect(report.slots[0]!.livePresent).toBe(true);
    expect(report.slots[0]!.liveParses).toBe(true);
    expect(report.slots[0]!.bakPresent).toBe(true);
    expect(report.slots[0]!.bakParses).toBe(true);
    expect(report.slots[0]!.name).toBe('Aldric');
    expect(report.overallClassification).toContain('ORPHANED SAVE EXISTS');
  });

  it('index absent, no slot blobs anywhere: NO SAVE BLOB FOUND', async () => {
    await AsyncStorage.clear();
    const before = await snapshotStorage();

    const report = await buildSaveSlotProbeReport();

    const after = await snapshotStorage();
    expect(after).toEqual(before);
    expect(report.indexPresent).toBe(false);
    expect(report.slots).toHaveLength(0);
    expect(report.overallClassification).toBe('NO SAVE BLOB FOUND BY THIS STORAGE ENUMERATION.');
  });

  it('index present but corrupt JSON, slot blob exists: INDEX FAILURE WITH PRESERVED SAVE', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ['tartaria.slots.index.v2', '{not valid json::'],
      ['tartaria.slot.slot_x.v2', JSON.stringify({ player: { name: 'Verbal', raceId: 'ashborn' }, savedAt: 500 })],
    ]);
    const before = await snapshotStorage();

    const report = await buildSaveSlotProbeReport();

    const after = await snapshotStorage();
    expect(after).toEqual(before);
    expect(report.indexPresent).toBe(true);
    expect(report.indexParses).toBe(false);
    expect(report.overallClassification).toContain('INDEX FAILURE WITH PRESERVED SAVE');
  });

  it('live blob corrupt, backup parses cleanly: BACKUP RECOVERY CANDIDATE — DO NOT RESTORE YET', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ['tartaria.slots.index.v2', '[]'],
      ['tartaria.slot.slot_y.v2', '{truncated-not-json'],
      ['tartaria.slot.slot_y.v2.bak', JSON.stringify({ player: { name: 'Rocky', raceId: 'ironclad' }, savedAt: 200 })],
    ]);
    const before = await snapshotStorage();

    const report = await buildSaveSlotProbeReport();

    const after = await snapshotStorage();
    expect(after).toEqual(before);
    const slot = report.slots.find((s) => s.slotId === 'slot_y')!;
    expect(slot.livePresent).toBe(true);
    expect(slot.liveParses).toBe(false);
    expect(slot.bakParses).toBe(true);
    expect(slot.name).toBe('Rocky'); // identity read from whichever copy parsed
    expect(slot.classification).toContain('BACKUP RECOVERY CANDIDATE');
    expect(slot.classification).toContain('DO NOT RESTORE YET');
  });

  it('live and backup both parse: SAVE DATA PRESERVED — discovery/index failure', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ['tartaria.slots.index.v2', '[]'],
      ['tartaria.slot.slot_z.v2', JSON.stringify({ player: { name: 'Mara', raceId: 'aetherkin' }, savedAt: 700 })],
      ['tartaria.slot.slot_z.v2.bak', JSON.stringify({ player: { name: 'Mara', raceId: 'aetherkin' }, savedAt: 600 })],
    ]);

    const report = await buildSaveSlotProbeReport();

    const slot = report.slots.find((s) => s.slotId === 'slot_z')!;
    expect(slot.classification).toBe('SAVE DATA PRESERVED — discovery/index failure.');
  });

  it('index has real entries and slots exist: not misreported as an orphan/failure case', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ['tartaria.slots.index.v2', JSON.stringify([{ slotId: 'slot_ok', playerName: 'Present' }])],
      ['tartaria.slot.slot_ok.v2', JSON.stringify({ player: { name: 'Present', raceId: 'mud_dweller' }, savedAt: 42 })],
    ]);

    const report = await buildSaveSlotProbeReport();

    expect(report.indexParses).toBe(true);
    expect(report.indexSlotIds).toEqual(['slot_ok']);
    expect(report.overallClassification).toBe('SEE PER-SLOT CLASSIFICATIONS.');
  });

  it('never dumps full save contents — only identity fields reach the formatted report', async () => {
    await AsyncStorage.clear();
    const secretMarker = 'SECRET_INVENTORY_MARKER_DO_NOT_LEAK';
    await AsyncStorage.multiSet([
      ['tartaria.slots.index.v2', '[]'],
      ['tartaria.slot.slot_priv.v2', JSON.stringify({
        player: {
          name: 'Privacy',
          raceId: 'mud_dweller',
          inventory: [{ id: 'x', name: secretMarker }],
          mainQuest: { phase: 'cores', coresRecovered: [] },
        },
        savedAt: 10,
        worldMemory: { discovered: [secretMarker] },
      })],
    ]);

    const report = await buildSaveSlotProbeReport();
    const formatted = formatSaveSlotProbeReport(report);

    expect(formatted).toContain('Privacy'); // identity: fine to show
    expect(formatted).not.toContain(secretMarker); // raw save contents: must not leak
  });

  it('active-slot pointer is read raw and reported, never written', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('tartaria.activeSlot.v2', 'slot_pointer_value');
    const before = await snapshotStorage();

    const report = await buildSaveSlotProbeReport();

    const after = await snapshotStorage();
    expect(after).toEqual(before);
    expect(report.activeSlotPresent).toBe(true);
    expect(report.activeSlotValue).toBe('slot_pointer_value');
  });
});
