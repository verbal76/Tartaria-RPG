// engine_Dev — summon-noun leak sweep. The player-facing word "golem" was
// hardcoded in two engine spots that NO content pack could override: the combat
// QuickBtn (tapped every turn an active sidekick is out) and the salvage core an
// item that drops when a trained sidekick crumbles. A reskin (e.g. a WWII pack
// whose summons noun is "mechanoid") therefore leaked "golem" regardless of its
// pack. These now read the live summon noun / the sidekick's own name. This guards
// against the literal "golem" creeping back into those player-facing strings.

import { readFileSync } from 'fs';
import { join } from 'path';
import { getSummonNoun } from '../app/engine/sidekicks';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the combat sidekick button no longer hardcodes "golem"', () => {
  const src = read('app/components/InputBox.tsx');
  it('labels the button with the sidekick\'s own name, not the word "golem"', () => {
    // The dog button uses dog.name.toLowerCase(); the sidekick button now mirrors it.
    expect(src).toContain('`${golem.name.toLowerCase()} (${golem.hp}/${golem.hpMax})`');
    expect(src).not.toContain('label={`golem (');
  });
  it('still accepts the legacy "use golem" command token (backward-compat input)', () => {
    expect(src).toContain("onSubmit('use golem')");
  });
});

describe('the inert salvage core is named from the active summon noun', () => {
  const src = read('app/state/gameStore.ts');
  it('no longer hardcodes the proper-noun "Inert Golem Core"', () => {
    expect(src).not.toContain("'Inert Golem Core'");
    expect(src).not.toContain('Inert Golem Core recovered');
    expect(src).not.toContain('seat the Inert Golem Core');
  });
  it('builds the core name from the title-cased summon noun', () => {
    expect(src).toContain('`Inert ${summonNounCap()} Core`');
  });
});

describe('summon noun resolves to the pack value (default when no pack)', () => {
  it('defaults to "sidekick" with no summons pack loaded', () => {
    // A WWII pack that sets noun:"mechanoid" makes every routed line read
    // "mechanoid"; with no pack the lore-agnostic default is "sidekick".
    expect(getSummonNoun()).toBe('sidekick');
  });
});
