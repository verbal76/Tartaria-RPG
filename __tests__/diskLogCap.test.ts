import { capDiskLog, MAX_DISK_LOG_CHARS } from '../app/engine/diskLogCap';

// OTA-398 — the on-disk COPY-LOG cap that fixes the REAL save-loss cause: the
// unbounded slot log filled AsyncStorage, so even a tiny save couldn't land.

describe('capDiskLog', () => {
  it('leaves a small log untouched', () => {
    const log = 'line one\nline two\n';
    expect(capDiskLog(log)).toBe(log);
  });

  it('trims an oversized log to the cap, keeping the most-recent lines', () => {
    const line = 'x'.repeat(99) + '\n'; // 100 chars/line
    const big = line.repeat(10_000);    // ~1,000,000 chars
    const out = capDiskLog(big, 50_000);
    expect(out.length).toBeLessThanOrEqual(50_000);
    // Keeps the tail (most-recent), not the head.
    expect(out.endsWith(line)).toBe(true);
  });

  it('always starts on a clean line boundary (drops the partial leading line)', () => {
    // Cap lands mid-line; the result must not begin with a fragment.
    const content = 'aaaa\nbbbb\ncccc\ndddd\n';
    const out = capDiskLog(content, 11); // forces a mid-line cut
    expect(out.startsWith('a')).toBe(false);
    expect(out.split('\n').filter(Boolean).every((l) => /^[a-d]+$/.test(l))).toBe(true);
  });

  it('uses a sane default cap well under AsyncStorage limits', () => {
    expect(MAX_DISK_LOG_CHARS).toBeGreaterThan(50_000);
    expect(MAX_DISK_LOG_CHARS).toBeLessThan(2_000_000);
  });
});
