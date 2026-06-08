import { tickWeather } from '../app/engine/weatherEffects';

// OTA-355 — the "silent bolt singes your sleeve" (aether_lightning) tick reads
// like a near-miss but does real HP damage. The exploration handler now appends
// a "(−N HP)" tag so the hazard isn't a phantom. This confirms the bite is real
// (so the tag fires) and that the line is the silent-bolt flavor.

describe('weather hazard — aether_lightning bites', () => {
  it('procs real HP damage + the silent-bolt line (so the −HP tag shows)', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0); // force the proc + min roll
    const tick = tickWeather({ id: 'aether_lightning', name: 'Aether Lightning' } as never, {} as never);
    spy.mockRestore();
    expect(tick.hpDelta).toBeLessThan(0);
    expect(tick.line).toMatch(/silent bolt/i);
  });

  it('no weather → zero tick (no phantom damage)', () => {
    const tick = tickWeather(null, {} as never);
    expect(tick.hpDelta).toBe(0);
    expect(tick.line).toBeNull();
  });
});
