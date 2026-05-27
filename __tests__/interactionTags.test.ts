import {
  isClimbable,
  isSwimmable,
  isBreakable,
  isSearchable,
  isSalvageable,
  getInteractionTags,
} from '../app/engine/interactionTags';

describe('interaction tag classifier', () => {
  it('tags poles, ladders, walls, vines as climbable', () => {
    expect(isClimbable('pole')).toBe(true);
    expect(isClimbable('ladder')).toBe(true);
    expect(isClimbable('mud ladder')).toBe(true); // substring match
    expect(isClimbable('wall')).toBe(true);
    expect(isClimbable('hanging vine')).toBe(true);
    expect(isClimbable('stone stair')).toBe(true);
    expect(isClimbable('window')).toBe(true);
  });

  it('does NOT tag scene props as climbable', () => {
    expect(isClimbable('mud')).toBe(false);
    expect(isClimbable('lantern')).toBe(false);
    expect(isClimbable('rusted blade')).toBe(false);
    expect(isClimbable('skeleton')).toBe(false);
  });

  it('tags water, tunnels, currents as swimmable', () => {
    expect(isSwimmable('water')).toBe(true);
    expect(isSwimmable('flooded tunnel')).toBe(true);
    expect(isSwimmable('silt current')).toBe(true);
    expect(isSwimmable('cistern')).toBe(true);
    expect(isSwimmable('water basin')).toBe(true);
  });

  it('does NOT tag dry props as swimmable', () => {
    expect(isSwimmable('pillar')).toBe(false);
    expect(isSwimmable('wagon')).toBe(false);
    expect(isSwimmable('rusted blade')).toBe(false);
  });

  it('tags doors, barricades, locks as breakable', () => {
    expect(isBreakable('door')).toBe(true);
    expect(isBreakable('barricade')).toBe(true);
    expect(isBreakable('rusted lock')).toBe(true);
    expect(isBreakable('portcullis')).toBe(true);
  });

  it('tags walls, tablets, archives, journals as searchable', () => {
    expect(isSearchable('wall')).toBe(true);
    expect(isSearchable('stone tablet')).toBe(true);
    expect(isSearchable('archive shelf')).toBe(true);
    expect(isSearchable('experiment journal')).toBe(true);
    expect(isSearchable('blueprint')).toBe(true);
  });

  it('tags wagons, drones, sentinels, machinery as salvageable', () => {
    expect(isSalvageable('wagon')).toBe(true);
    expect(isSalvageable('rusted drone')).toBe(true);
    expect(isSalvageable('sentinel shell')).toBe(true);
    expect(isSalvageable('gear assembly')).toBe(true);
    expect(isSalvageable('rusted blade')).toBe(true);
    expect(isSalvageable('aether battery')).toBe(true);
  });

  it('supports multi-tag nouns — walls are climbable AND breakable AND searchable', () => {
    const tags = getInteractionTags('wall');
    expect(tags.has('climbable')).toBe(true);
    expect(tags.has('searchable')).toBe(true);
  });

  it('returns empty set for nonsense input', () => {
    expect(getInteractionTags('').size).toBe(0);
    expect(getInteractionTags('   ').size).toBe(0);
  });

  it('case-insensitive', () => {
    expect(isClimbable('POLE')).toBe(true);
    expect(isSwimmable('Water')).toBe(true);
  });
});
