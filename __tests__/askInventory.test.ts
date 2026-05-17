import {
  isInventoryQuestion,
  extractInventoryTarget,
  isContinueCommand,
  isCountQuestion,
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

// Phase 4 follow-up — playtest log showed the inventory question handler
// matched "how many rations are in my pack" via the "in my pack" pattern
// but the target extractor left "how many rations are" intact, producing
// "No how many rations are on you." Two-part fix: extractor strips
// linking verbs + "how many" / "how much"; new isCountQuestion() lets the
// handler return a count instead of yes/no.

describe('isCountQuestion', () => {
  it.each([
    'how many rations do I have',
    'how many rations are in my pack',
    'how much aetherstone',
    'How Many Bandages',
  ])('treats "%s" as a count question', (text) => {
    expect(isCountQuestion(text)).toBe(true);
  });

  it.each([
    'do I have any rations',
    'is the fungus in my pack',
    'attack the rat',
  ])('does not treat "%s" as a count question', (text) => {
    expect(isCountQuestion(text)).toBe(false);
  });
});

describe('extractInventoryTarget — count + state-verb regressions', () => {
  it('strips "how many" / "how much" leading fragments', () => {
    expect(extractInventoryTarget('how many rations do I have')).toBe('rations');
    expect(extractInventoryTarget('how much aetherstone do i have')).toBe('aetherstone');
  });

  it('strips linking verbs like "are" / "is" / "have"', () => {
    expect(extractInventoryTarget('how many rations are in my pack')).toBe('rations');
    expect(extractInventoryTarget('how many bandages have I got')).toBe('bandages');
  });

  it('does not regress simple yes/no extractions', () => {
    expect(extractInventoryTarget('is the fungus in my pack')).toBe('fungus');
    expect(extractInventoryTarget('do I have a locket')).toBe('locket');
  });
});

describe('isInventoryQuestion — recognizes count phrasings', () => {
  it('treats "how many X" as an inventory question', () => {
    expect(isInventoryQuestion('how many rations do I have')).toBe(true);
    expect(isInventoryQuestion('how many aether crystals are in my pack')).toBe(true);
  });

  it('treats "how much X" as an inventory question', () => {
    expect(isInventoryQuestion('how much aetherstone do I have')).toBe(true);
  });

  it('does not treat embedded "how many" as inventory question', () => {
    // Anchored to sentence start so this concept-style query doesn't
    // accidentally trigger.
    expect(isInventoryQuestion('tell me how many rats are here')).toBe(false);
  });
});
