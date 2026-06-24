// engine_Dev — the pre-export "Validate Game" pass: catches dangling references + duplicate ids
// that would otherwise bake into a broken release.

import { validateGame, summarizeValidation } from '../app/engine/validateGame';
import {
  setTableOverride, setMissionsOverride, setCustomBossesOverride, setCustomMainQuestOverride,
  setVendorsOverride, setStartingAreasOverride, clearAllOverrides,
} from '../app/engine/contentPack';

const errs = () => validateGame().filter((i) => i.severity === 'error');
const errText = () => errs().map((e) => e.message).join('\n');

afterEach(() => clearAllOverrides());

describe('validateGame — pre-export reference checks', () => {
  it('flags a recipe whose result + ingredient do not exist', () => {
    setTableOverride('recipes', [{ result: 'Ghost Sword', ingredients: [{ name: 'Phantom Dust', quantity: 1 }] }]);
    const t = errText();
    expect(t).toMatch(/Ghost Sword/);
    expect(t).toMatch(/Phantom Dust/);
  });

  it('passes a recipe whose result + ingredient DO exist', () => {
    setTableOverride('weapons', [{ name: 'Test Blade', rarity: 'Common', tags: [], damageDice: '1d6' }]);
    setTableOverride('materials', [{ name: 'Test Dust', rarity: 'Common', tags: [] }]);
    setTableOverride('recipes', [{ result: 'Test Blade', ingredients: [{ name: 'Test Dust', quantity: 1 }] }]);
    expect(errs().filter((e) => e.section === 'Crafting recipes')).toEqual([]);
  });

  it('flags a vendor selling an unknown item', () => {
    setVendorsOverride([{ id: 'v1', name: 'Shady Sam', offers: [{ itemName: 'Nonexistent Gizmo', price: 5 }] }]);
    expect(errText()).toMatch(/Nonexistent Gizmo/);
  });

  it('flags a faction quest posted for an undefined faction', () => {
    setMissionsOverride({ factionQuests: [{ id: 'q1', title: 'Do A Thing', factionId: 'ghost_clan', requirement: { rep: 0 }, reward: { tc: 10, rep: 1 } }] });
    expect(errText()).toMatch(/ghost_clan/);
  });

  it('flags a main-quest step whose boss is missing, and clears once the boss exists', () => {
    setCustomMainQuestOverride({ steps: [{ action: 'kill', bossId: 'the_warden' }] });
    expect(errText()).toMatch(/the_warden/);
    setCustomBossesOverride([{ id: 'the_warden', name: 'The Warden', hp: 30, attack: 5, damage: '1d8' }]);
    expect(errs().filter((e) => e.section === 'Main quest')).toEqual([]);
  });

  it('flags a duplicate id within a table', () => {
    setTableOverride('weapons', [
      { id: 'sword', name: 'Sword A', rarity: 'Common', tags: [] },
      { id: 'sword', name: 'Sword B', rarity: 'Common', tags: [] },
    ]);
    expect(errText()).toMatch(/Duplicate id\/name "sword"/);
  });

  it('flags a starting-area room exit that points at a nonexistent room', () => {
    setStartingAreasOverride([{
      factionId: 'reclaimers_guild', name: 'Camp', locationId: 'x',
      rooms: [{ id: 'entry', name: 'Entry', exits: { north: 'nowhere' } }],
    }] as never);
    expect(errText()).toMatch(/exit \(north\) to "nowhere"/);
  });

  it('a clean minimal game produces no errors', () => {
    setTableOverride('weapons', [{ name: 'Plain Sword', rarity: 'Common', tags: [], damageDice: '1d6' }]);
    setVendorsOverride([{ id: 'v', name: 'Trader', offers: [{ itemName: 'Plain Sword', price: 10 }] }]);
    expect(errs()).toEqual([]);
  });

  it('summarizeValidation counts + orders errors before warnings', () => {
    setTableOverride('recipes', [{ result: 'Bad', ingredients: [] }]);
    const s = summarizeValidation(validateGame());
    expect(s.errors).toBeGreaterThanOrEqual(1);
    expect(s.lines[0]).toMatch(/^✗/);
  });
});
