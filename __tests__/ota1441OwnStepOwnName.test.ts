/**
 * OTA-1441 — THE PICK GETS ITS OWN SCREEN, THE NAME IS SAID WHOLE, THE MARK
 * REACHES THE SHEET, AND THE TUTORIAL CLIMB PAYS.
 *
 * Owner, after trying OTA-1439 on device: *"the male or female choice should be
 * its own screen choice, not a header on race or faction, it will get missed,
 * have no preset choice, make the player select something. also when I did try
 * it, it didn't put the male or female symbol on the character image when I
 * selected the full character view from the character portrait."*
 *
 * And from the log he sent with it: the Arbiter greeted his tester "Great
 * Scott" with *"Welcome back, Great."* — a bare first-token split treating a
 * two-word NAME as a name plus baggage. Plus his typed note: *"when we are do
 * the climb part of the tutorial have it award something a climb with no
 * reward is a bad tutorial plot point."*
 */
import { spokenName, npcAddress } from '../app/engine/npcMemory';
import type { NpcRelation } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const CREATE = read('app', 'screens', 'CharacterCreationScreen.tsx');
const PORTRAIT = read('app', 'components', 'CharacterPortrait.tsx');
const SHEET = read('app', 'screens', 'CharacterScreen.tsx');
const STORE = read('app', 'state', 'gameStore.ts');
const NARRATION = read('app', 'ai', 'narration.ts');

describe('OTA-1441 — the pick is its OWN first step', () => {
  it('⚠⚠ sex is a step in the walk, and it comes FIRST', () => {
    // "it will get missed" — a header row shares a screen with the thing the
    // player is actually looking at. A step cannot be missed: the walk does
    // not continue around it.
    expect(CREATE).toContain("type Step = 'sex' | 'race' | 'faction' | 'motive' | 'pressure';");
    expect(CREATE).toContain("const STEP_ORDER: Step[] = ['sex', 'race', 'faction', 'motive', 'pressure'];");
    expect(CREATE).toContain("useState<Step>('sex')");
    expect(CREATE).toContain("{step === 'sex' && (");
  });

  it('⚠⚠ NO PRESET — the state starts null and stays null until a tap', () => {
    // "have no preset choice, make the player select something." A defaulted
    // value is a question the game answered for you.
    expect(CREATE).toContain("useState<'male' | 'female' | null>(null)");
    expect(CREATE).not.toContain("useState<'male' | 'female'>('male')");
  });

  it('⚠⚠ NEXT is a wall until something is picked — guard AND disabled AND dimmed', () => {
    // Three layers on purpose: the guard is the rule, `disabled` is the rule
    // reaching the touch system, the dim is the rule reaching the eye. Any one
    // alone leaves a button that looks alive and does nothing (or worse, one
    // that works anyway).
    expect(CREATE).toContain("if (!sex) return;");
    expect(CREATE).toContain("const nextDisabled = step === 'sex' && !sex;");
    expect(CREATE).toContain('disabled={nextDisabled}');
    expect(CREATE).toContain('nextBtnDisabled');
  });

  it('⚠ BACK from race returns to the pick, and BACK from the pick leaves', () => {
    // The step is a full citizen of the walk in both directions — skipping it
    // on the way back would make it a one-way gate, which reads as a glitch.
    expect(CREATE).toContain("setStep('sex');");
    const sexBack = CREATE.indexOf("if (step === 'sex') {");
    expect(sexBack).toBeGreaterThan(-1);
  });

  it('⚠ the pick still lands on the record, null-safe', () => {
    // `sex ?? undefined` — the guard makes null unreachable at NEXT, but the
    // type seam is honest anyway: PlayerCharacter.sex is optional, not
    // nullable.
    expect(CREATE).toContain('sex: sex ?? undefined,');
  });
});

describe('OTA-1441/1443 — the ♂/♀ mark reaches the character sheet, at rank', () => {
  it('⚠⚠ THE REPORTED GAP: the banner takes a sex prop and draws the sign', () => {
    // "it didn't put the male or female symbol on the character image" — the
    // pick landed on the record and stopped there (OTA-1441). Then the owner
    // sized it: *"it needs to sit on the right of the faction emblem and be
    // the same size as it is"* (OTA-1443) — so it renders as its own
    // emblem-sized glyph, not a caption prefix.
    expect(PORTRAIT).toContain("sex?: 'male' | 'female' | null;");
    expect(PORTRAIT).toContain("{sex === 'male' ? '♂' : '♀'}");
  });

  it('⚠⚠ EMBLEM-SIZED, DIRECTLY UNDER THE EMBLEM — not the overlookable caption mark', () => {
    // OTA-1443 put it on the crest's right; the owner looked at it and placed
    // it below instead (OTA-1446). Same box the crest gets, one gap under it;
    // falls back to the crest's own spot when there is no crest art.
    expect(PORTRAIT).toContain('{ top: crest ? 10 + CREST_SIZE + 6 : 10 }');
    expect(PORTRAIT.slice(PORTRAIT.indexOf('sexSign: {'))).toContain('left: 10,');
    const style = PORTRAIT.slice(PORTRAIT.indexOf('sexSign: {'));
    expect(style).toContain('width: CREST_SIZE,');
    expect(style).toContain('height: CREST_SIZE,');
    expect(style).toContain('fontSize: CREST_SIZE - 8,');
    // …and the caption no longer carries a glyph prefix.
    expect(PORTRAIT).not.toContain("'♂  '");
  });

  it('⚠⚠ …and the sheet actually passes it — a prop unpassed is the gap reborn', () => {
    expect(SHEET).toContain('sex={player.sex}');
  });

  it('⚠ a save from before the pick shows NO sign — the game never asked them', () => {
    // The whole element is behind `sex ?` — guessing a mark for a character
    // who was never asked would be wrong in exactly half of all cases.
    expect(PORTRAIT).toContain('{sex ? (');
  });
});

describe('OTA-1441 — the spoken-name rule ("Welcome back, Great.")', () => {
  it('⚠⚠ THE LOGGED LINE: "Great Scott" is said whole', () => {
    expect(spokenName('Great Scott')).toBe('Great Scott');
  });

  it('⚠⚠ a long styled name is clipped to its first word — the old behaviour kept', () => {
    expect(spokenName('Verbal of the Tartarian Giants')).toBe('Verbal');
    // Two tokens but past the length bar: a mouthful is still a mouthful.
    expect(spokenName('Bartholomew Constantine')).toBe('Bartholomew');
  });

  it('⚠ one word, empty, and absent all behave', () => {
    expect(spokenName('Verbal')).toBe('Verbal');
    expect(spokenName('  Verbal  ')).toBe('Verbal');
    expect(spokenName('')).toBeUndefined();
    expect(spokenName('   ')).toBeUndefined();
    expect(spokenName(null)).toBeUndefined();
    expect(spokenName(undefined)).toBeUndefined();
  });

  it('⚠⚠ all three speakers use the ONE rule — no private splits left', () => {
    // The defect was three call sites each doing its own first-token split.
    // The rule lives in npcMemory; the Arbiter and the welcome-back line both
    // import it. A fourth splitter appearing is the many-doors mistake again.
    expect(NARRATION).toContain('return spokenName(player.name) ?? fallback;');
    expect(STORE).toContain("const name = spokenName(player?.name) ?? 'friend';");
    // …and nobody outside npcMemory splits a player name on whitespace for
    // address any more.
    expect(NARRATION).not.toContain(".split(' ')[0]");
  });

  it('⚠ NPCs who know the name say it under the same rule', () => {
    const regular: NpcRelation = {
      id: 'vendor:x', name: 'Halem', role: 'vendor', firstMetAt: 1, lastSeenAt: 1,
      lastSeenHours: 0, meetings: 5, trades: 4, tcTraded: 0,
      contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
    } as NpcRelation;
    expect(npcAddress(regular, 'Great Scott', 'male')).toBe('Great Scott');
    expect(npcAddress(regular, 'Verbal of the Tartarian Giants', 'male')).toBe('Verbal');
  });
});

describe('OTA-1441 — the interior marker rides ABOVE the room name', () => {
  const MAP = read('app', 'screens', 'MapScreen.tsx');

  it('⚠⚠ THE REPORT: both interior branches lift the ring off the painted name', () => {
    // Owner: "it places the you are here icon directly on the name of the
    // room, I need it directly above it but not obscuring any of it." The
    // interior mark points are sighted onto the NAMES, so a centred ring sat
    // on the text. Both interiors — outpost and painted buildings — now anchor
    // the ring's bottom edge a lift above the point, from ONE constant.
    expect(MAP).toContain('const INTERIOR_MARKER_LIFT = 24;');
    expect((MAP.match(/Math\.max\(7, INTERIOR_MARKER_LIFT \* labelScale\)/g) ?? []).length).toBe(2);
    expect((MAP.match(/- size - lift,/g) ?? []).length).toBe(2);
  });

  it('⚠ the WORLD atlas marker stays centred — it stands on silhouettes, not text', () => {
    // The overland marker's placement was approved on device (OTA-1344/1347);
    // the lift is an interiors-only rule.
    expect(MAP).toContain('top: offsetY + renderedH * f.fy - size / 2,');
  });
});

describe('OTA-1441 — the tutorial climb pays', () => {
  it('⚠⚠ topping out during the climb beat grants coins, guaranteed', () => {
    // Owner: "a climb with no reward is a bad tutorial plot point." Every
    // other beat hands the player something; the climb paid only through
    // rollClimbTopLoot's dice, which can roll nothing on the one climb the
    // game ASKS you to make.
    const guard = STORE.indexOf("TUTORIAL_STEPS[get().tutorialStep ?? -1]?.id === 'climb'");
    expect(guard).toBeGreaterThan(-1);
    const grant = STORE.indexOf('tc: s.player.tc + 15', guard);
    expect(grant).toBeGreaterThan(guard);
    expect(STORE).toContain('A small pouch, tucked where only a climber would look');
  });

  it('⚠⚠ it sits INSIDE the top-out branch — a bail-out halfway up earns nothing', () => {
    const isTop = STORE.indexOf('if (isTop) {');
    const guard = STORE.indexOf("TUTORIAL_STEPS[get().tutorialStep ?? -1]?.id === 'climb'");
    // Between entering the isTop branch and the branch's great-climb fork —
    // i.e. on the top-out path, before any RNG loot.
    const greatClimbFork = STORE.indexOf('if (greatClimb) {', isTop);
    expect(guard).toBeGreaterThan(isTop);
    expect(guard).toBeLessThan(greatClimbFork);
  });

  it('⚠ once by construction — the beat advances on climb-down, before any re-climb', () => {
    // The grant is guarded by the LIVE beat id; maybeAdvanceTutorial('climb')
    // fires on the way down (both descent paths), so a second top-out cannot
    // happen while the beat is still 'climb'.
    expect((STORE.match(/maybeAdvanceTutorial\('climb'\)/g) ?? []).length).toBe(2);
  });
});
