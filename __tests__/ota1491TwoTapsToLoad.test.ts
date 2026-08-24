// OTA-1491 — TWO TAPS TO LOAD: THE SLOT LIST BREATHES.
//
// ⚠⚠ Owner: *"shrink the character blocks on the character selection screen to
// a block that just has the name and the status line which is the bottom line
// of the block now. when they tap on it it opens to the full size block and
// they can then select that player."*
//
// The claims that hold the shape:
//   · a COLLAPSED card carries the name row and ONE status line — the resume
//     objective, or the HP line when a save predates objectives;
//   · the collapsed card's tap EXPANDS (sets expandedSlotId) and must never
//     call onSlotTap — a single tap can no longer load, resurrect, or open
//     the fallen sheet by accident;
//   · the EXPANDED card's tap is the load (onSlotTap), unchanged;
//   · swipe-to-delete wraps BOTH states, so a compact row still deletes.

import { readFileSync } from 'fs';
import { join } from 'path';
import { between } from '../test-utils/srcBlock';

const TITLE = readFileSync(join(__dirname, '..', 'app', 'screens', 'TitleScreen.tsx'), 'utf8');
// The whole two-branch renderItem, from its head to the return statement of
// the screen component that follows it.
const RENDER = between(TITLE, 'const renderItem = ({ item }: { item: SlotSummary })', '\n  return (');
const COMPACT = between(RENDER, "if (expandedSlotId !== item.slotId) {", 'return (\n    <SwipeableRow');
const EXPANDED = RENDER.slice(COMPACT.length);

describe('OTA-1491 — the collapsed card', () => {
  it('⚠⚠ its tap EXPANDS and can never load — onSlotTap is absent from the branch', () => {
    expect(COMPACT).toContain('onPress={() => setExpandedSlotId(item.slotId)}');
    expect(COMPACT).not.toContain('onSlotTap');
  });

  it('⚠ it shows the name row and exactly one status line', () => {
    expect(COMPACT).toContain('{item.playerName}');
    expect(COMPACT).toContain('resumeObjectiveLine(');
    // The fallback for saves that predate objectives is the HP line.
    expect(COMPACT).toContain('HP {item.hp}/{item.hpMax}');
    // And none of the full card's middle rows leak in.
    expect(COMPACT).not.toContain('raceLabel(');
    expect(COMPACT).not.toContain('dogName');
    expect(COMPACT).not.toContain('deadActions');
  });

  it('⚠ the DEAD badge and the timestamp survive the shrink — identity stays honest', () => {
    expect(COMPACT).toContain('deadBadge');
    expect(COMPACT).toContain('timeAgo(item.savedAt)');
  });

  it('⚠ swipe-to-delete wraps the compact card too', () => {
    expect(COMPACT).toContain('<SwipeableRow onDelete={() => confirmDelete(item)}>');
  });
});

describe('OTA-1491 — the expanded card', () => {
  it('⚠⚠ its tap is the LOAD — onSlotTap, exactly as before', () => {
    expect(EXPANDED).toContain('onPress={() => onSlotTap(item)}');
  });

  it('⚠ expansion is stated to the screen reader in both directions', () => {
    expect(COMPACT).toContain('expanded: false');
    expect(EXPANDED).toContain('expanded: true');
  });
});

describe('OTA-1491 — the list re-renders on expansion', () => {
  it('⚠⚠ expandedSlotId rides FlatList extraData — without it a tap changes nothing visible', () => {
    expect(TITLE).toContain('extraData={expandedSlotId}');
  });

  it('⚠ one card at a time: expansion is a single id, not a set', () => {
    expect(TITLE).toContain('const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);');
  });
});
