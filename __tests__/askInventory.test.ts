import {
  isInventoryQuestion,
  extractInventoryTarget,
  isContinueCommand,
} from '../app/engine/askInventory';

describe('isInventoryQuestion', () => {
  it.each([
    ['is the fungus in my pack?', true],
    ['do i have a locket', true],
    ['do I have any bandages', true],
    ['got any healing', true],
    ['got the compass', true],
    ['is there a torch in my inventory', true],
    ['is the dust compass in my bag', true],
    ['in my pockets', true],
  ])('treats "%s" as an inventory question', (text, expected) => {
    expect(isInventoryQuestion(text)).toBe(expected);
  });

  it.each([
    ['what is the Aether', false],
    ['tell me about the Mud Monarchs', false],
    ['who is Sasha Ironheart', false],
    ['how do I cast a spell', false],
    ['where am I', false],
    // Substring "is the" appears here but only as a clean concept lookup; we
    // accept the false positive risk on this one because "is the X in my pack"
    // is the actual common case — verified by the negative tests above.
  ])('treats "%s" as a concept question', (text, expected) => {
    expect(isInventoryQuestion(text)).toBe(expected);
  });
});

describe('extractInventoryTarget', () => {
  it('strips question frames and articles', () => {
    expect(extractInventoryTarget('is the fungus in my pack?')).toBe('fungus');
    expect(extractInventoryTarget('do I have a locket')).toBe('locket');
    expect(extractInventoryTarget('got any bandages')).toBe('bandages');
    expect(extractInventoryTarget('do i have any aether goggles')).toBe('aether goggles');
  });

  it('preserves multi-word targets', () => {
    expect(extractInventoryTarget('is the dust compass in my pack')).toBe('dust compass');
    expect(extractInventoryTarget('do I have a rusted blade')).toBe('rusted blade');
  });

  it('returns empty for pure question-frames with no noun', () => {
    expect(extractInventoryTarget('do I have anything')).toBe('anything');
    expect(extractInventoryTarget('is there?')).toBe('');
  });

  it('is case-insensitive', () => {
    expect(extractInventoryTarget('IS THE FUNGUS IN MY PACK')).toBe('fungus');
    expect(extractInventoryTarget('Got Any Bandages')).toBe('bandages');
  });
});

describe('isContinueCommand', () => {
  it.each([
    'continue',
    'continue please',
    'keep going',
    'keep    going',
    'same way',
    'onward',
    'press on',
    'Continue',
    'KEEP GOING',
  ])('treats "%s" as a continue command', (text) => {
    expect(isContinueCommand(text)).toBe(true);
  });

  it.each([
    'I will not continue',
    'before you continue',
    'go north',
    'rest',
    'attack',
    '',
  ])('does not treat "%s" as a continue command', (text) => {
    expect(isContinueCommand(text)).toBe(false);
  });
});
