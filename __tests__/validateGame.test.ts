// engine_Dev — the pre-export "Validate Game" pass: catches dangling references + duplicate ids
// that would otherwise bake into a broken release.

import { validateGame, runValidation, summarizeValidation } from '../app/engine/validateGame';
import {
  setTableOverride, setMissionsOverride, setCustomBossesOverride, setCustomMainQuestOverride,
  setVendorsOverride, setStartingAreasOverride, setHooksOverride, setSummonsOverride,
  setWastelandOverride, setDogScenariosOverride, setCustomTitlesOverride,
  setDamageTypesOverride, setDamageResistancesOverride, setCollectablesOverride, clearAllOverrides,
} from '../app/engine/contentPack';

const errs = () => validateGame().filter((i) => i.severity === 'error');
const errText = () => errs().map((e) => e.message).join('\n');
const warnText = () => validateGame().filter((i) => i.severity === 'warning').map((e) => e.message).join('\n');

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

  it('flags a hook with an unknown effect verb and a missing granted item', () => {
    setHooksOverride({
      plants: { h1: [{ line: 'x', nouns: ['x'] }] },
      chains: { h1: [{ line: 'y', effects: [{ type: 'teleport_player' }, { type: 'grant_item', name: 'Phantom Widget' }], done: true }] },
    });
    const t = errText();
    expect(t).toMatch(/unknown effect "teleport_player"/);
    expect(t).toMatch(/Phantom Widget/);
  });

  it('flags a summoned sidekick whose fuel item does not exist', () => {
    setSummonsOverride({ defs: [{ kind: 'wisp', name: 'Wisp', fuel: [{ name: 'Imaginary Crystal', quantity: 1 }] }] });
    expect(errText()).toMatch(/Imaginary Crystal/);
  });

  it('flags a wasteland encounter referencing an enemy not in the table', () => {
    setWastelandOverride({ ambush: { type: 'skirmish', weight: 5, enemyPool: ['Nonexistent Beast'] } });
    expect(errText()).toMatch(/Nonexistent Beast/);
  });

  it('flags armor with a slot the engine cannot equip (e.g. "accessory")', () => {
    setTableOverride('armor', [{ name: 'Lucky Pin', slot: 'accessory', rarity: 'Common', tags: [] }]);
    expect(errText()).toMatch(/Lucky Pin.*slot "accessory".*never be worn/s);
    // a real slot passes
    setTableOverride('armor', [{ name: 'Iron Cap', slot: 'head', rarity: 'Common', tags: [] }]);
    expect(errs().filter((e) => e.section === 'Armor')).toEqual([]);
  });

  it('flags a boss spawnCondition the engine never acts on (e.g. "always")', () => {
    setCustomBossesOverride([{ id: 'b1', name: 'World Boss', hp: 99, attack: 5, damage: '2d8', spawnCondition: 'always' }]);
    expect(errText()).toMatch(/World Boss.*spawnCondition "always".*never spawn/s);
    setCustomBossesOverride([{ id: 'b1', name: 'World Boss', hp: 99, attack: 5, damage: '2d8', spawnCondition: 'location', spawnLocationId: 'x' }]);
    expect(errs().filter((e) => e.section === 'Bosses')).toEqual([]);
  });

  it('flags a faction-quest stage advanceOn that can never fire (e.g. "stealth")', () => {
    setTableOverride('factions', [{ id: 'spies', name: 'Spies' }]);
    setMissionsOverride({ factionQuests: [{ id: 'q', title: 'Tap the Wire', factionId: 'spies', requirement: { rep: 0 }, reward: { tc: 1, rep: 1 }, stages: [{ narration: 'x', advanceOn: 'stealth' }] }] });
    expect(errText()).toMatch(/Tap the Wire.*advanceOn "stealth".*never complete/s);
  });

  it('flags a dog scenario captor faction that is not a real faction id', () => {
    setTableOverride('factions', [{ id: 'soviet_smersh', name: 'SMERSH' }]);
    setDogScenariosOverride([
      { id: 'bad', hookNouns: ['x'], captorFactionId: 'SMERSH', captorName: 'Handler' },
      { id: 'ok', hookNouns: ['y'], captorFactionId: 'soviet_smersh', captorName: 'Real' },
      { id: 'fallback', hookNouns: ['z'], captorFactionId: null, captorName: 'Poacher' },
    ]);
    const t = errText();
    expect(t).toMatch(/Dog scenario "bad".*captorFactionId "SMERSH"/s);
    expect(t).not.toMatch(/scenario "ok"/);
    expect(t).not.toMatch(/scenario "fallback"/);
  });

  it('warns on a stat name the engine does not track (e.g. constitution / perception)', () => {
    setTableOverride('armor', [{ name: 'Con Vest', slot: 'chest', rarity: 'Common', tags: [], statBonus: { stat: 'constitution', amount: 2 } }]);
    setCustomTitlesOverride([{ id: 't', name: 'Eagle Eye', track: 'kills', threshold: 5, perk: { stat: 'perception', amount: 1 } }]);
    const w = warnText();
    expect(w).toMatch(/constitution/);
    expect(w).toMatch(/perception/);
    // hp / staminaMax gear bonuses are valid and must NOT warn
    setTableOverride('armor', [{ name: 'Tough Vest', slot: 'chest', rarity: 'Common', tags: [], statBonuses: [{ stat: 'hp', amount: 5 }, { stat: 'strength', amount: 1 }] }]);
    setCustomTitlesOverride([]);
    expect(warnText()).not.toMatch(/stat "hp"|stat "strength"/);
  });

  it('warns on undefined damage types in weapons and resistances (frost/shock/explosive)', () => {
    setTableOverride('weapons', [{ name: 'Boomstick', rarity: 'Common', tags: [], damageType: 'explosive', damageDice: '3d6' }]);
    setDamageResistancesOverride({ 'Ice Wraith': { resist: ['frost'], weak: ['burn'] } } as never);
    const w = warnText();
    expect(w).toMatch(/Boomstick.*"explosive"/s);
    expect(w).toMatch(/Ice Wraith.*resist "frost"/s);
    expect(w).not.toMatch(/weak "burn"/); // burn is a built-in type
    // defining the type clears the weapon warning
    setDamageTypesOverride([{ name: 'explosive', keywords: ['boom'] }] as never);
    expect(warnText()).not.toMatch(/Boomstick/);
  });

  it('flags a power coat that is not a real DOT kind (e.g. radiation_coat)', () => {
    setTableOverride('powers', [{ name: 'Fog Purge', discipline: 'shape', effect: { kind: 'coat_enemies', coating: 'radiation_coat', dmgPerTurn: 4, turns: 3 } }]);
    expect(errText()).toMatch(/Fog Purge.*radiation_coat.*never ticks/s);
    setTableOverride('powers', [{ name: 'Fog Purge', discipline: 'shape', effect: { kind: 'coat_enemies', coating: 'corruption_coat', dmgPerTurn: 4, turns: 3 } }]);
    expect(errs().filter((e) => e.section === 'Powers')).toEqual([]);
  });

  it('warns on a collectable fragment whose biomeTags match no location', () => {
    setTableOverride('locations', [{ id: 'town', name: 'Town', tags: ['urban', 'safe'] }]);
    setCollectablesOverride([{ id: 's', fragments: [
      { id: 'reachable', biomeTags: ['urban'] },
      { id: 'stranded', biomeTags: ['conspiracy', 'anomalous'] },
    ] }]);
    const w = warnText();
    expect(w).toMatch(/fragment "stranded".*can never drop/s);
    expect(w).not.toMatch(/"reachable"/);
  });

  it('runValidation returns a structured report (ok=false with errors, counts add up)', () => {
    setTableOverride('recipes', [{ result: 'Missing Thing', ingredients: [] }]);
    const r = runValidation();
    expect(r.ok).toBe(false);
    expect(r.errorCount).toBeGreaterThanOrEqual(1);
    expect(r.errors.length + r.warnings.length + r.info.length).toBe(validateGame().length);
    expect(r.errors[0]!.code).toBeTruthy();
  });
});
