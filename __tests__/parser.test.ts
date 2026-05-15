import { parseInput } from '../app/engine/parser';

describe('parseInput', () => {
  it('detects attack intent', () => {
    expect(parseInput('attack the mud golem').intent).toBe('attack');
  });
  it('detects stealth intent', () => {
    expect(parseInput('sneak through the tunnel').intent).toBe('stealth');
  });
  it('detects diplomacy intent', () => {
    expect(parseInput('persuade the Rust Monk to step aside').intent).toBe('diplomacy');
  });
  it('detects escape intent', () => {
    expect(parseInput('flee from the sentinel').intent).toBe('escape');
  });
  it('detects investigate intent', () => {
    expect(parseInput('examine the obelisk').intent).toBe('investigate');
  });
  it('falls back to unknown for nonsense', () => {
    expect(parseInput('asdfghjkl').intent).toBe('unknown');
  });
});
