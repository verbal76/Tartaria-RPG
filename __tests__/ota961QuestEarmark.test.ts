// OTA-961 — context-aware "Save for quest" earmark. Owner: the earmark exists
// for BULK fetch materials ("go get me 15 rusted metal") — specific objective
// items hard-lock automatically — "I would only like it to say save for quest
// when you actually have an active quest that needs them." The inventory modal
// now gates the button on activeFetchItemNames: the item names accepted fetch
// contracts still want. Already-flagged items always show the release button.
import { FACTION_QUESTS, activeFetchItemNames } from '../app/engine/factionQuests';

describe('OTA-961 — activeFetchItemNames drives the context-aware earmark', () => {
  const fetchDef = FACTION_QUESTS.find((q) => !!q.fetch);
  const stagedDef = FACTION_QUESTS.find((q) => !q.fetch && (q.stages?.length ?? 0) > 0);

  it('an accepted fetch contract surfaces its wanted item, lowercased', () => {
    expect(fetchDef).toBeTruthy(); // data sanity: the on-ramp fetch quests exist
    const names = activeFetchItemNames([{ id: fetchDef!.id }]);
    expect(names.has(fetchDef!.fetch!.itemName.toLowerCase())).toBe(true);
    expect(names.size).toBe(1);
  });

  it('no accepted contracts -> nothing wanted (the button stays hidden)', () => {
    expect(activeFetchItemNames([]).size).toBe(0);
    expect(activeFetchItemNames(undefined).size).toBe(0);
    expect(activeFetchItemNames(null).size).toBe(0);
  });

  it('a staged (non-fetch) contract wants no items', () => {
    expect(stagedDef).toBeTruthy();
    expect(activeFetchItemNames([{ id: stagedDef!.id }]).size).toBe(0);
  });

  it('an unknown quest id is ignored, not crashed on', () => {
    expect(activeFetchItemNames([{ id: 'no_such_quest_zzz' }]).size).toBe(0);
  });

  it('several accepted fetch contracts union their wants', () => {
    const twoFetch = FACTION_QUESTS.filter((q) => !!q.fetch).slice(0, 2);
    expect(twoFetch.length).toBe(2);
    const names = activeFetchItemNames(twoFetch.map((q) => ({ id: q.id })));
    for (const q of twoFetch) expect(names.has(q.fetch!.itemName.toLowerCase())).toBe(true);
  });
});
