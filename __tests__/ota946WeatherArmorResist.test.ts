// OTA-946 — a matching armour coating resist cancels that element's weather bite,
// generalising the OTA-934 cold rule. Electrical coating vs Aether-lightning, etc.
import { tickWeather } from '../app/engine/weatherEffects';
import type { WeatherEntry, PlayerCharacter } from '../app/engine/types';

const lightning = { id: 'aether_lightning', name: 'Aether Lightning', description: '', tags: ['aetheric', 'lightning'] } as unknown as WeatherEntry;
const blizzard = { id: 'silent_blizzard', name: 'Silent Blizzard', description: '', tags: ['cold', 'silence'] } as unknown as WeatherEntry;
const hail = { id: 'glass_hail', name: 'Glass Hail', description: '', tags: ['hail', 'physical_damage'] } as unknown as WeatherEntry;
const player = {} as PlayerCharacter;

describe('OTA-946 — armour elemental resist cancels matching weather', () => {
  it('electrical resist cancels the Aether-lightning bite', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0); // would force the proc + damage
    try {
      expect(tickWeather(lightning, player, ['electrical']).hpDelta).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it('cold resist still cancels the blizzard (OTA-934 preserved)', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(tickWeather(blizzard, player, ['cold']).hpDelta).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it('a NON-matching resist does not cancel — lightning still bites the wrong coating', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(tickWeather(lightning, player, ['cold', 'poison']).hpDelta).toBeLessThan(0);
    } finally { spy.mockRestore(); }
  });

  it('physical hail has no coatable element — never cancelled by a coating', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(tickWeather(hail, player, ['electrical', 'cold', 'acid']).hpDelta).toBeLessThan(0);
    } finally { spy.mockRestore(); }
  });

  it('no resist list = weather bites (baseline, back-compat)', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(tickWeather(lightning, player).hpDelta).toBeLessThan(0);
    } finally { spy.mockRestore(); }
  });
});
