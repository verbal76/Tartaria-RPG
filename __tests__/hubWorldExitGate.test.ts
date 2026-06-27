import { roomHasWorldExit, hubDefinesWorldExit } from '../app/engine/hub';

const room = (exits: Partial<Record<'north' | 'south' | 'east' | 'west', string | null>>) =>
  ({
    id: 'r', name: 'R', shortName: 'R', description: '', interactables: [],
    exits: { north: null, south: null, east: null, west: null, ...exits },
  } as unknown as Parameters<typeof roomHasWorldExit>[0]);

describe('hub EXIT gating (OTA-909)', () => {
  it('roomHasWorldExit detects the `world` exit sentinel in any direction', () => {
    expect(roomHasWorldExit(room({ west: 'world' }))).toBe(true);
    expect(roomHasWorldExit(room({ north: 'world', south: 'operations' }))).toBe(true);
    // a spoke room that only connects back to the hub is NOT an exit room
    expect(roomHasWorldExit(room({ south: 'operations' }))).toBe(false);
    expect(roomHasWorldExit(null)).toBe(false);
  });

  it('built-in hub does not use the world-exit convention, so EXIT stays available everywhere (legacy preserved)', () => {
    // No content pack loaded in tests → the built-in hub is active; it never
    // marks a `world` exit, so the gate falls back to showing EXIT in every room.
    expect(hubDefinesWorldExit(null)).toBe(false);
  });
});
