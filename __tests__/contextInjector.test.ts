import {
  buildLlmContext,
  buildSystemPrompt,
  stringifyInventory,
  formatRecentHistory,
  formatActiveEntities,
  formatPlayerStats,
  type LlmContext,
  type ContextInputs,
  type SceneSlice,
} from '../app/engine/contextInjector';
import type {
  PlayerCharacter,
  InventoryItem,
  GameLogEntry,
  Location,
  Enemy,
  Hazard,
  WeatherEntry,
  StatusEffect,
} from '../app/engine/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeLocation(over: Partial<Location> = {}): Location {
  return {
    id: 'asgardar',
    name: 'Asgardar',
    type: 'buried_city',
    description: 'A skeletal capital lit by Aetheric residue.',
    danger: 4,
    tags: ['buried', 'aetheric', 'capital'],
    discoverable: true,
    ...over,
  };
}

function makeWeather(over: Partial<WeatherEntry> = {}): WeatherEntry {
  return {
    id: 'aetheric_storm',
    name: 'Aetheric Storm',
    description: 'Violet lightning sketches across the sky.',
    visibility: 1,
    travelPenalty: 1,
    corruptionChance: 0.1,
    tags: ['aether', 'storm'],
    ...over,
  };
}

function makeEnemy(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Mud Golem',
    type: 'Mud Creature',
    abilityPoint: 'STR',
    attack: 'slam',
    damage: '2d6',
    hp: 22,
    rarity: 'Uncommon',
    loot: [],
    ...over,
  };
}

function makeHazard(over: Partial<Hazard> = {}): Hazard {
  return {
    id: 'pulsing_mud',
    name: 'Pulsing Mud',
    description: 'A patch of mud pulses with trapped Aetheric charge.',
    severity: 2,
    effect: 'aetheric',
    tags: ['mud', 'aether'],
    ...over,
  };
}

function makePlayer(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Vex',
    raceId: 'mud_dweller',
    factionId: 'forgotten_order',
    stats: { strength: 12, dexterity: 14, intelligence: 10, wisdom: 11, charisma: 9 },
    hp: 18,
    hpMax: 22,
    stamina: 5,
    staminaMax: 8,
    ac: 13,
    tc: 40,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'asgardar',
    activeQuests: [],
    ...over,
  };
}

function makeLog(entries: { channel: GameLogEntry['channel']; text: string }[]): GameLogEntry[] {
  return entries.map((e, i) => ({
    id: `log-${i}`,
    ts: 1000 + i,
    channel: e.channel,
    text: e.text,
  }));
}

// ---------------------------------------------------------------------------
// buildLlmContext — top-level shape
// ---------------------------------------------------------------------------

describe('buildLlmContext', () => {
  it('returns a complete fact sheet with all required fields', () => {
    const player = makePlayer();
    const scene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: makeHazard(),
      enemies: [makeEnemy()],
      enemyHps: [10],
      vendor: null,
    };
    const log = makeLog([
      { channel: 'player', text: 'go north' },
      { channel: 'world', text: 'You step into the rubble.' },
    ]);

    const ctx = buildLlmContext({ player, scene, gameLog: log });
    expect(ctx).toMatchObject<Partial<LlmContext>>({
      current_biome: expect.any(String),
      room_name: 'Asgardar',
    });
    expect(ctx.environmental_description).toContain('skeletal capital');
    expect(ctx.environmental_description).toContain('Aetheric Storm');
    expect(ctx.environmental_description).toContain('Pulsing Mud');
    expect(ctx.active_entities).toContain('Mud Golem');
    expect(ctx.active_entities).toContain('10/22 HP'); // wounded
    expect(ctx.available_exits).toMatch(/north|east|south|west/);
    expect(ctx.player_stats).toContain('HP 18/22');
    expect(ctx.recent_history).toContain('go north');
  });

  it('degrades gracefully when player and scene are null', () => {
    const ctx = buildLlmContext({ player: null, scene: null, gameLog: [] });
    expect(ctx.player_stats).toBe('Unknown.');
    expect(ctx.full_inventory).toContain('Empty pack');
    expect(ctx.active_entities).toBe('None.');
    expect(ctx.recent_history).toMatch(/just arrived/i);
    // biome / room have sensible defaults
    expect(ctx.current_biome.length).toBeGreaterThan(0);
    expect(ctx.room_name.length).toBeGreaterThan(0);
  });

  it('only injects HP fragment when the enemy is wounded', () => {
    const fullHpScene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [makeEnemy({ hp: 22 })],
      enemyHps: [22],
      vendor: null,
    };
    const ctx = buildLlmContext({ player: makePlayer(), scene: fullHpScene, gameLog: [] });
    expect(ctx.active_entities).toBe('Mud Golem');
  });

  it('sets in_combat true when any enemy is in the scene', () => {
    const scene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [makeEnemy()],
      enemyHps: [10],
      vendor: null,
    };
    const ctx = buildLlmContext({ player: makePlayer(), scene, gameLog: [] });
    expect(ctx.in_combat).toBe(true);
  });

  it('sets in_combat false when the scene is peaceful', () => {
    const peaceful: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [],
      enemyHps: [],
      vendor: null,
    };
    const ctx = buildLlmContext({ player: makePlayer(), scene: peaceful, gameLog: [] });
    expect(ctx.in_combat).toBe(false);
  });

  it('sets in_combat false when only a vendor is present (no enemies)', () => {
    const vendorScene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [],
      enemyHps: [],
      vendor: { name: 'Thalan', affiliation: 'Reclaimers' },
    };
    const ctx = buildLlmContext({ player: makePlayer(), scene: vendorScene, gameLog: [] });
    expect(ctx.in_combat).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stringifyInventory
// ---------------------------------------------------------------------------

describe('stringifyInventory', () => {
  function item(name: string, quantity = 1): InventoryItem {
    return { id: name.toLowerCase().replace(/\s+/g, '-'), name, kind: 'misc', quantity, tags: [] };
  }

  it('says Empty pack on no items and zero TC', () => {
    expect(stringifyInventory([], undefined, 0)).toBe('Empty pack');
  });

  it('emits TC even when the pack is empty', () => {
    expect(stringifyInventory([], undefined, 12)).toContain('12 TC');
  });

  it('marks quantity > 1 with x suffix', () => {
    const inv = [item('Rusted Pipe'), item('Bandage', 4)];
    const s = stringifyInventory(inv, undefined, 0);
    expect(s).toContain('Rusted Pipe');
    expect(s).toContain('Bandage (x4)');
  });

  it('emits a Wearing: trailer for equipped gear', () => {
    const inv = [item('Aether-Core')];
    const equipped = { main: 'Iron Maul', head: 'Mud-glass Helm' };
    const s = stringifyInventory(inv, equipped, 40);
    expect(s).toMatch(/Aether-Core.*40 TC.*\|.*Wearing:/);
    expect(s).toContain('main hand Iron Maul');
    expect(s).toContain('head Mud-glass Helm');
  });

  it('only includes filled slots in the wearing trailer', () => {
    const s = stringifyInventory([], { main: 'Knife' }, 0);
    expect(s).toContain('Wearing: main hand Knife');
    expect(s).not.toContain('off hand');
    expect(s).not.toContain('head ');
  });
});

// ---------------------------------------------------------------------------
// formatRecentHistory
// ---------------------------------------------------------------------------

describe('formatRecentHistory', () => {
  it('returns a placeholder when the player has done nothing yet', () => {
    expect(formatRecentHistory([])).toMatch(/just arrived/i);
    const noPlayer = makeLog([
      { channel: 'world', text: 'Scene description' },
      { channel: 'arbiter', text: 'Atmospheric remark' },
    ]);
    expect(formatRecentHistory(noPlayer)).toMatch(/just arrived/i);
  });

  it('joins the last three player lines newest-first with separators', () => {
    const log = makeLog([
      { channel: 'player', text: 'look around' },
      { channel: 'player', text: 'search the rubble' },
      { channel: 'player', text: 'go north' },
      { channel: 'world', text: 'Mud underfoot.' },
      { channel: 'player', text: 'attack' },
    ]);
    const out = formatRecentHistory(log);
    expect(out).toBe('attack ← go north ← search the rubble');
  });

  it('ignores non-player channels', () => {
    const log = makeLog([
      { channel: 'arbiter', text: 'The Arbiter watches.' },
      { channel: 'player', text: 'rest' },
      { channel: 'combat', text: 'Hit for 4.' },
    ]);
    expect(formatRecentHistory(log)).toBe('rest');
  });
});

// ---------------------------------------------------------------------------
// formatPlayerStats
// ---------------------------------------------------------------------------

describe('formatPlayerStats', () => {
  it('formats baseline HP/Stamina/AC', () => {
    const out = formatPlayerStats(makePlayer());
    expect(out).toBe('HP 18/22, Stamina 5/8, AC 13');
  });

  it('appends corruption when > 0', () => {
    const out = formatPlayerStats(makePlayer({ corruption: 7 }));
    expect(out).toContain('Corruption 7');
  });

  it('appends active status effects', () => {
    const effects: StatusEffect[] = [
      { kind: 'bleed', remainingRounds: 2 },
      { kind: 'stun', remainingRounds: 1 },
    ];
    const out = formatPlayerStats(makePlayer({ statusEffects: effects }));
    expect(out).toContain('Bleeding & Stunned active');
  });
});

// ---------------------------------------------------------------------------
// formatActiveEntities
// ---------------------------------------------------------------------------

describe('formatActiveEntities', () => {
  it('reports None. for a peaceful scene', () => {
    const scene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [],
      enemyHps: [],
      vendor: null,
    };
    expect(formatActiveEntities(scene)).toBe('None.');
  });

  it('lists multiple enemies comma-separated', () => {
    const scene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [makeEnemy({ name: 'Mud Golem' }), makeEnemy({ name: 'Reclaimer Scout', hp: 12 })],
      enemyHps: [22, 6],
      vendor: null,
    };
    const out = formatActiveEntities(scene);
    expect(out).toMatch(/Mud Golem.*Reclaimer Scout/);
    expect(out).toContain('6/12 HP'); // wounded scout
  });

  it('includes the vendor when present with affiliation', () => {
    const scene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather(),
      hazard: null,
      enemies: [],
      enemyHps: [],
      vendor: { name: 'Thalan', affiliation: 'Reclaimers Guild' },
    };
    expect(formatActiveEntities(scene)).toContain('Thalan of the Reclaimers Guild (vendor)');
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('returns a system+user pair with the Arbiter persona', () => {
    const ctx: LlmContext = {
      current_biome: 'Buried',
      room_name: 'Asgardar',
      environmental_description: 'A skeletal capital.',
      available_exits: 'north, east, south, west',
      active_entities: 'None.',
      player_stats: 'HP 22/22',
      full_inventory: 'Knife | Wearing: main hand Knife',
      recent_history: 'go north',
      in_combat: false,
    };
    const messages = buildSystemPrompt(ctx);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    const system = messages[0]!.content;
    expect(system).toContain('You are the Arbiter');
    expect(system).toContain('DO NOT INVENT');
    expect(system).toContain('Asgardar');
    expect(system).toContain('go north');
    // Voice guardrails apply to every prompt — second-person, no fabrication,
    // complete sentences.
    expect(system).toContain("SECOND PERSON ONLY");
    expect(system).toMatch(/do not invent.*events/i);
    // Peaceful instruction sets the length cap (arb162 — one ~20-word line).
    expect(system).toMatch(/20 words/);
  });

  it('switches to the combat instruction when in_combat is true', () => {
    const ctx: LlmContext = {
      current_biome: 'Aetherstone Deep',
      room_name: 'Crystal Pylon Chamber',
      environmental_description: 'A cathedral-sized vault.',
      available_exits: 'out, up, down',
      active_entities: 'Scrap Drone (4/15 HP)',
      player_stats: 'HP 18/22',
      full_inventory: 'Rusted Pipe',
      recent_history: 'eat trail rations',
      in_combat: true,
    };
    const system = buildSystemPrompt(ctx)[0]!.content;
    // Loudest line is the combat instruction.
    expect(system).toContain('ACTIVE COMBAT');
    expect(system).toContain('DO NOT describe the room');
    expect(system).toMatch(/20 words/);
    // The peaceful instruction must NOT be present — that's the bug the
    // toggle exists to fix (the model was writing tour-guide prose mid-
    // combat because both instructions were in scope).
    expect(system).not.toMatch(/describe what is around the player/i);
    expect(system).not.toMatch(/35 words/);
    // Voice guardrails apply in combat too.
    expect(system).toContain("SECOND PERSON ONLY");
  });

  it('stays on the peaceful instruction when in_combat is false', () => {
    const ctx: LlmContext = {
      current_biome: 'Borderlands',
      room_name: 'Triage Tent',
      environmental_description: 'A canvas surgery.',
      available_exits: 'back to the bazaar',
      active_entities: 'None.',
      player_stats: 'HP 22/22',
      full_inventory: 'Bandage',
      recent_history: 'look around',
      in_combat: false,
    };
    const system = buildSystemPrompt(ctx)[0]!.content;
    expect(system).toContain('atmospheric tone');
    // arb162 — peaceful narration is capped at ONE short ~20-word line so Qwen
    // frees the shared voice lock fast (see contextInjector PEACEFUL_INSTRUCTION).
    expect(system).toMatch(/20 words/);
    expect(system).toMatch(/ONE short sentence/);
    expect(system).not.toContain('ACTIVE COMBAT');
  });

  it('emits the same prompt for the same context (deterministic)', () => {
    const ctx: LlmContext = {
      current_biome: 'A',
      room_name: 'B',
      environmental_description: 'C',
      available_exits: 'D',
      active_entities: 'E',
      player_stats: 'F',
      full_inventory: 'G',
      recent_history: 'H',
      in_combat: false,
    };
    const a = buildSystemPrompt(ctx);
    const b = buildSystemPrompt(ctx);
    expect(a[0]!.content).toBe(b[0]!.content);
    expect(a[1]!.content).toBe(b[1]!.content);
  });
});

// ---------------------------------------------------------------------------
// integration: full pipeline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ladder override — when a Micro-Micro chunk is supplied, its fields win
// ---------------------------------------------------------------------------

describe('buildLlmContext with ladder override', () => {
  it('uses the macro name as the biome and the micro-micro as the room', () => {
    const ladder = {
      macro: {
        id: 'silt_wastes',
        name: 'The Silt Wastes',
        subtitle: 'The Endless Mud',
        ambient: '',
        tags: [],
        microLocations: [],
      },
      micro: {
        id: 'sunken_metropolis',
        name: 'The Sunken Metropolis',
        description: '',
        microMicroLocations: [],
      },
      microMicro: {
        id: 'buried_skyscraper_upper',
        name: 'Buried Skyscraper — Upper Floors',
        environmental_description: 'Wind moans through a glass-toothed atrium.',
        exits: ['down the stairwell', 'out the window'],
        possibleEncounters: ['Aetherbat'],
        lootTable: ['Scrap Metal'],
      },
    };
    const scene: SceneSlice = {
      location: makeLocation({ name: 'Old Asgardar Outskirts' }),
      weather: makeWeather(),
      hazard: null,
      enemies: [],
      enemyHps: [],
      vendor: null,
    };
    const ctx = buildLlmContext({
      player: makePlayer(),
      scene,
      gameLog: [],
      ladder,
    });
    expect(ctx.current_biome).toBe('The Silt Wastes');
    expect(ctx.room_name).toBe('Buried Skyscraper — Upper Floors');
    expect(ctx.environmental_description).toContain('Wind moans through a glass-toothed atrium');
    expect(ctx.environmental_description).toContain('Aetheric Storm'); // weather still folded in
    expect(ctx.available_exits).toBe('down the stairwell, out the window');
  });

  it('still folds hazard + weather into the ladder environment', () => {
    const ladder = {
      macro: { id: 'm', name: 'M', subtitle: '', ambient: '', tags: [], microLocations: [] },
      micro: { id: 'mi', name: 'Mi', description: '', microMicroLocations: [] },
      microMicro: {
        id: 'mm',
        name: 'MM',
        environmental_description: 'Stone walls.',
        exits: ['out'],
        possibleEncounters: [],
        lootTable: [],
      },
    };
    const scene: SceneSlice = {
      location: makeLocation(),
      weather: makeWeather({ name: 'Glass Hail' }),
      hazard: makeHazard({ name: 'Pulsing Mud' }),
      enemies: [],
      enemyHps: [],
      vendor: null,
    };
    const ctx = buildLlmContext({ player: makePlayer(), scene, gameLog: [], ladder });
    expect(ctx.environmental_description).toContain('Stone walls');
    expect(ctx.environmental_description).toContain('Glass Hail');
    expect(ctx.environmental_description).toContain('Pulsing Mud');
  });
});

describe('buildLlmContext + buildSystemPrompt (integration)', () => {
  it('produces a system prompt that includes every fact from a real scene', () => {
    const player = makePlayer({
      inventory: [{ id: 'pipe', name: 'Rusted Pipe', kind: 'weapon', quantity: 1, tags: [] }],
      equipped: { main: 'Rusted Pipe' },
    });
    const scene: SceneSlice = {
      location: makeLocation({ name: 'Sunken Lobby' }),
      weather: makeWeather(),
      hazard: null,
      enemies: [makeEnemy()],
      enemyHps: [22],
      vendor: null,
    };
    const log = makeLog([{ channel: 'player', text: 'enter the building' }]);

    const input: ContextInputs = { player, scene, gameLog: log };
    const messages = buildSystemPrompt(buildLlmContext(input));
    const text = messages[0]!.content;
    expect(text).toContain('Sunken Lobby');
    expect(text).toContain('Mud Golem');
    expect(text).toContain('Rusted Pipe');
    expect(text).toContain('enter the building');
    expect(text).toContain('HP 18/22');
  });
});
