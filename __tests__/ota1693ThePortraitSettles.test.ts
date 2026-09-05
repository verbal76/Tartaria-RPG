/**
 * OTA-1693 — THE PORTRAIT SETTLES. Owner: "The enemy portrait is stuck between
 * a left and right swipe and I did not swipe." OTA-1557's own notes named the
 * door: a drag the nested card scroller claims and hands back ends with no
 * momentum-end and no drag-end. The watchdog settles the pager from scroll
 * ticks alone — a quarter second of quiet, no finger down, off its page →
 * snap to the nearest page and the target follows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { settleOffset, pageIndexForOffset, PAGER_SETTLE_MS, PAGER_SETTLE_SLACK_PX } from '../app/components/EnemyPanel';

const PANEL = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'EnemyPanel.tsx'), 'utf8');

describe('OTA-1693 — the arithmetic', () => {
  it('names the nearest page, its offset, and how far off the pager sits', () => {
    const w = 300;
    expect(settleOffset(0, w, 3)).toEqual({ idx: 0, snap: 0, offBy: 0 });
    expect(settleOffset(300, w, 3)).toEqual({ idx: 1, snap: 300, offBy: 0 });
    // Parked between pages, as the owner saw it.
    expect(settleOffset(140, w, 3)).toEqual({ idx: 0, snap: 0, offBy: 140 });
    expect(settleOffset(160, w, 3)).toEqual({ idx: 1, snap: 300, offBy: 140 });
    expect(settleOffset(590, w, 3)).toEqual({ idx: 2, snap: 600, offBy: 10 });
    // Past the end and before the start clamp to the roster, like pageIndexForOffset.
    expect(settleOffset(900, w, 2)).toEqual({ idx: 1, snap: 300, offBy: 600 });
    expect(settleOffset(-40, w, 3)).toEqual({ idx: 0, snap: 0, offBy: 40 });
    // Garbage in, a safe page out — never NaN, never a throw.
    expect(settleOffset(NaN, w, 3)).toEqual({ idx: 0, snap: 0, offBy: 0 });
    expect(settleOffset(100, 0, 3)).toEqual({ idx: 0, snap: 0, offBy: 100 });
    expect(settleOffset(100, w, 0)).toEqual({ idx: 0, snap: 0, offBy: 100 });
    // The page it names is the page the drag readers would name.
    for (const x of [0, 120, 180, 290, 310, 450, 600]) expect(settleOffset(x, w, 3).idx).toBe(pageIndexForOffset(x, w, 3));
  });

  it('a quarter second of quiet and two pixels of slack', () => {
    expect(PAGER_SETTLE_MS).toBe(250);
    expect(PAGER_SETTLE_SLACK_PX).toBe(2);
  });
});

describe('OTA-1693 — the wiring', () => {
  it('every scroll tick re-arms the watchdog; a finger down holds it; the quiet settles it and the target follows', () => {
    expect(PANEL.includes('onScroll={onScrollTick}')).toBe(true);
    expect(PANEL.includes('scrollEventThrottle={64}')).toBe(true);
    expect(PANEL.includes('onScrollBeginDrag={onDragBegin}')).toBe(true);
    expect(PANEL.includes('onScrollEndDrag={onDragEndSettled}')).toBe(true);
    expect(PANEL.includes('if (settleTimer.current) clearTimeout(settleTimer.current);')).toBe(true);
    expect(PANEL.includes('if (dragging.current || cardWidth <= 0 || enemies.length < 2) return;')).toBe(true);
    expect(PANEL.includes('if (s.offBy <= PAGER_SETTLE_SLACK_PX) return;')).toBe(true);
    expect(PANEL.includes("listRef.current?.scrollToOffset({ offset: s.snap, animated: true });")).toBe(true);
    expect(PANEL.includes('if (s.idx !== activeIndex) onSelectActive(s.idx);')).toBe(true);
    // The timer dies with the component.
    expect(PANEL.includes('useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);')).toBe(true);
  });

  it('OTA-1557 stays whole: one snap authority, both drag endings still resolve, the pager still follows the target', () => {
    expect(PANEL.includes('snapToInterval={cardWidth}')).toBe(true);
    expect(PANEL.includes('onMomentumScrollEnd={onMomentumEnd}')).toBe(true);
    expect(PANEL.includes('dragging.current = false; onDragEnd(e);')).toBe(true);
    expect(PANEL.includes('listRef.current?.scrollToIndex({ index: idx, animated: false });')).toBe(true);
  });
});
