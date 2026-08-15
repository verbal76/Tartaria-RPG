// OTA-995 — the Fallen roll marks the still-walking (owner: "push the marker").
// Un-avenged = eligible to rise as a Hollowed; the memorial now says so
// instead of leaving those entries blank.
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');

describe('OTA-995 — the Fallen roll marks the still-walking', () => {
  it('an un-avenged entry carries the STILL WALKING line (the avenged branch keeps its rest line)', () => {
    expect(SRC).toContain('— STILL WALKING. Something in warrior');
    expect(SRC).toContain('— put to rest by {h.avengedBy}');
    // The un-avenged branch is no longer a silent null.
    expect(SRC).not.toContain(') : null}\n                </View>');
  });
  it('the header counts the walking dead', () => {
    expect(SRC).toContain('still walking');
    expect(SRC).toContain('fallen.filter((h) => !h.avengedBy).length');
  });
  it('the marker has its own style, distinct from the memorial meta line', () => {
    expect(SRC).toContain('styles.fallenWalking');
    expect(SRC).toMatch(/fallenWalking: \{ color: '#d9a441'/);
  });
});
