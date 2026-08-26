// OTA-1502 — THE SWIPE IS THE SELECTOR, AND BOTH HANDS REPORT.
//
// ⚠⚠⚠ THE OWNER, 2026-08-25, on the multi-enemy APPROACH picker: *"does the
// approach button even need to select a person to approach or is it just an
// extra step that slows down the battle? … if it's so I can select a specific
// target then still that doesn't help because all I have to do is slide the
// enemy target portrait left or right and I'll be able to select that target
// anyways."*
//
// ⚠⚠ HE WAS RIGHT, AND THE CODE SAID SO. The multi-enemy branch of the advance
// handler did exactly ONE thing with the name you picked — `activeEnemyIdx =
// idx` — which is the same assignment `EnemyPanel.onSelectActive` already makes
// on a swipe, minus the pager's HP, power rating, intel and statuses. A modal
// that duplicates a gesture and carries LESS information is a tax on every
// multi-enemy fight. Combat now closes on whoever is up on the pager.
//
// ⚠⚠ AND THE SECOND HALF OF HIS LOADOUT WAS INVISIBLE. He carries melee in one
// hand and ranged in the other *specifically so range matters* — and the card
// only ever asked `playerWeaponReach(player, 'main')`. The slot argument has
// existed since OTA 027; the panel simply never asked the second question.
//
// ⚠ OUT OF COMBAT THE PICKER LIVES. Doors, vendors and scene features have no
// pager to swipe, so that is where it earns its keep — untouched here.

import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');
const PANEL = read('app', 'components', 'EnemyPanel.tsx');

describe('OTA-1502 — combat approach closes on the pager selection', () => {
  it('⚠⚠⚠ THE PICKER NEVER OPENS WITH AN ENEMY PRESENT — any count, not just one', () => {
    const i = EXPL.indexOf('onOpenApproach={() => {');
    expect(i).toBeGreaterThan(-1);
    const body = EXPL.slice(i, EXPL.indexOf('onOpenPickpocket', i));
    // The old shape: `enemies.length === 1` was the ONLY bypass.
    expect(body).not.toMatch(/enemies\.length === 1/);
    expect(body).toContain('const target = enemies[activeIdx] ?? enemies[0];');
    expect(body).toContain('submit(`approach ${target.name}`)');
  });

  it('⚠⚠⚠ THE TARGET IS THE ONE ON SCREEN — activeIdx, the pager\'s own index', () => {
    // activeIdx is what EnemyPanel renders as the visible card and what
    // onSelectActive writes on a swipe. Reading anything else here would let
    // the button close on a foe the player is not looking at.
    const panelIdx = EXPL.indexOf('activeIndex={activeIdx}');
    expect(panelIdx).toBeGreaterThan(-1);
    expect(EXPL).toContain('onSelectActive={setActiveEnemyIdx}');
    expect(EXPL).toContain('const activeIdx = Math.min(currentScene?.activeEnemyIdx ?? 0');
  });

  it('⚠⚠ THE PICKER STILL EXISTS FOR THE PEACEFUL SCENE — it was not deleted', () => {
    // With no enemies staged there is no pager, so the modal is the only way to
    // name a door / vendor / feature. Removing it outright would cost the
    // out-of-combat approach entirely.
    const i = EXPL.indexOf('onOpenApproach={() => {');
    const body = EXPL.slice(i, EXPL.indexOf('onOpenPickpocket', i));
    expect(body).toContain('setApproachOpen(true);');
    expect(EXPL).toContain('<ApproachModal');
  });
});

describe('OTA-1502 — both hands report against the enemy on screen', () => {
  it('⚠⚠⚠ THE OFF HAND IS ASKED TOO — the half of his loadout that was mute', () => {
    // ⚠ OTA-1506 — the hands resolve ONCE (handReaches) and each card asks its
    // own enemy's band; the claim is unchanged: both slots are consulted.
    const i = EXPL.indexOf('const handReaches:');
    expect(i).toBeGreaterThan(-1);
    const body = EXPL.slice(i, EXPL.indexOf('return currentScene.enemies.map', i));
    expect(body).toContain("for (const slot of ['main', 'off'] as const)");
    expect(body).toContain('playerWeaponReach(player, slot)');
  });

  it('⚠⚠ reach comes from the resolver the attack gate rolls with, not a local copy', () => {
    // OTA-1006 settled this for the main hand: a second derivation drifts, and
    // the drift shows up as a weapon glowing green while every swing bounces.
    const i = EXPL.indexOf('const handReaches:');
    const body = EXPL.slice(i, EXPL.indexOf('return currentScene.enemies.map', i));
    expect(body).not.toMatch(/reachClassFor|findWeaponByName|RANGE_ORDER/);
    // ⚠ OTA-1506 — the membership test moved into the per-enemy map, judged at
    // that enemy's own band, still from the resolver's bands and nothing local.
    expect(EXPL).toContain('inRange: band !== null && h.bands.includes(band),');
  });

  it('⚠⚠ empty hands still answer — bare hands reach at close', () => {
    const i = EXPL.indexOf('const handReaches:');
    const body = EXPL.slice(i, EXPL.indexOf('return currentScene.enemies.map', i));
    expect(body).toContain("label: 'Bare hands'");
    expect(body).toContain("reachBandsFor('barehanded')");
  });

  it('⚠⚠ the memo re-runs when the OFF hand changes — a stale card is a lie', () => {
    // The dependency list carried main/weaponName only, so swapping the off
    // hand mid-fight would have left the row reporting the old weapon.
    const i = EXPL.indexOf('const enemyViews: EnemyView[] = useMemo(');
    const deps = EXPL.slice(EXPL.indexOf('}, [', i), EXPL.indexOf(']);', EXPL.indexOf('}, [', i)));
    expect(deps).toContain('player?.equipped?.off');
    expect(deps).toContain('player?.equipped?.main');
  });
});

describe('OTA-1502 — the card speaks the marks without stealing a taught one', () => {
  it('⚠⚠⚠ NOT ▲/▼ — those were taught in the tutorial as BETTER/WORSE gear', () => {
    // OTA-1499/1500 spent a whole tutorial beat teaching ▲ = beats what you
    // carry and ▼ = loses to it. Reusing them for "this hand reaches" would
    // overload a glyph the player was explicitly taught to read another way.
    const i = PANEL.indexOf('{!!view.hands?.length && (');
    expect(i).toBeGreaterThan(-1);
    const body = PANEL.slice(i, PANEL.indexOf('OTA-897', i));
    expect(body).toContain("h.inRange ? '●' : '○'");
    // Comments stripped first — same rule as OTA-1497's same-tick scan. The
    // source comment NAMES ▲/▼ to explain why they are not used here, and a
    // scan that cannot tell documentation from code would forbid saying so.
    const code = body.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/[▲▼]/);
  });

  it('⚠⚠ green means reachable, and it is the SAME green the pickers use', () => {
    expect(PANEL).toMatch(/handIn: \{ color: '#9ec96a' \}/);
    // The unreachable hand is muted, not alarm-red: it is information, not a
    // warning — the red on this screen belongs to threat.
    expect(PANEL).toMatch(/handOut: \{ color: '#7a7263' \}/);
  });

  it('⚠ the screen reader is told which hand and whether it reaches', () => {
    const i = PANEL.indexOf('{!!view.hands?.length && (');
    const body = PANEL.slice(i, PANEL.indexOf('OTA-897', i));
    expect(body).toMatch(/accessibilityLabel=\{`\$\{h\.slot === 'main' \? 'Main hand' : 'Off hand'\}/);
    expect(body).toContain("h.inRange ? 'in range' : 'out of range'");
  });

  it('⚠ the view model carries the hands per enemy, ready for per-enemy range', () => {
    // Phase 2 gives each enemy its own band; this field is already shaped for
    // it — the row is built per view, not once for the scene.
    expect(PANEL).toContain("hands?: Array<{ slot: 'main' | 'off'; label: string; inRange: boolean }>;");
  });
});
