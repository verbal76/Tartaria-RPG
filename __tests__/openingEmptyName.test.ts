import { buildOpeningNarrative } from '../app/engine/narrativeGenerator';

// OTA-353 — the in-game-name flow (Tungsten Spire tutorial) narrates the opening
// BEFORE the player types their name, so playerName is "". The framing paragraph
// must not render the stray "Your name is . " / "You are  of the …" artifact.

function open(playerName: string): string {
  const [p1] = buildOpeningNarrative({
    playerName,
    raceName: 'Mud Golems',
    factionName: 'True Tartarians',
    weather: { name: 'Clear' } as never,
    weatherDescriptor: '',
    location: { name: 'The Buried Cities', description: 'Silt and stone.' } as never,
    hubRoomName: null,
    hubRoomDescription: null,
    hubName: null,
  });
  return p1;
}

describe('opening narration — empty name', () => {
  it('renders no bare-name artifact when the name is not set yet', () => {
    const p1 = open('');
    expect(p1).not.toMatch(/Your name is \./);
    expect(p1).not.toMatch(/You are\s+of the/);
    expect(p1).not.toMatch(/^,\s/); // ", of the …"
    // Still names the race + faction.
    expect(p1).toContain('Mud Golems');
    expect(p1).toContain('True Tartarians');
  });

  it('uses the name when one IS set', () => {
    const p1 = open('Verbal');
    expect(p1).toContain('Verbal');
  });
});
