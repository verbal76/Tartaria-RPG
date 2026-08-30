/**
 * OTA-1549 — THE BUTTON YOU CAN SEE, AND THE ROAD YOU CAN TAKE FROM INSIDE.
 *
 * Owner, on the OTA-1547 conversation bar: *"in the yulka what she said button
 * I didn't even see that thing. maybe if that button is active and can be used
 * we make it a different color, or we make it filled in like we do the weapons
 * that can be used during combat. And from that talking screen, we should be
 * able to Auto route and accept from that instead of typing … that button
 * should be highlighted inside the talk screen. same as the auto route button
 * should be highlighted inside that talk screen."*
 *
 * ⚠⚠⚠ AN OUTLINED ROW IS CHROME. OTA-1547 shipped the bar gold-on-soot with a
 * one-pixel border — the same treatment the screen's furniture wears — so the
 * one control standing between the player and a person waiting on an answer
 * read as decoration and went unseen. The game already has a vocabulary for
 * A THING YOU CAN USE RIGHT NOW: the filled plate on an in-reach weapon. The
 * waiting state now wears it — solid gold ground, dark ink, a ▸ — and drops
 * back to the quiet outline once the decision is made and the bar is only a
 * re-read handle.
 *
 * ⚠⚠ AND THE COURSE IS SET FROM INSIDE THE CONVERSATION. Accepting a fetch
 * used to leave the player to close the sheet, open Contracts, find the
 * whisper and press SET COURSE there — or type. The sheet now carries the same
 * route control, filled in the house SET-COURSE blue, driven by the SAME
 * whisperRouteTarget the Contracts panel uses, so the two can never send you
 * to different dirt. It is stage-aware for free: while you stand at the fire
 * it hides (you are already there), and the instant you ACCEPT — which keeps
 * the sheet open, per OTA-1547 — the very same button re-aims at the mark.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const SHEET = codeOnly(src('app', 'components', 'WhisperTalkSheet.tsx'));
const CONTRACTS = src('app', 'screens', 'ContractsScreen.tsx');

describe('OTA-1549 — the waiting bar is FILLED, like a weapon you can swing', () => {
  it('⚠⚠⚠ deciding paints a solid ground with dark ink — not an outline on soot', () => {
    // The 1547 shipping value was backgroundColor '#2a1f12' (near-black) with
    // gold text: an outline. The owner could not see it.
    expect(SHEET).toContain("barDeciding: { backgroundColor: '#f0c96a', borderColor: '#f7dc9a' },");
    expect(SHEET).toContain("barTextDeciding: { color: '#241a09' },");
    expect(SHEET).not.toContain("barDeciding: { backgroundColor: '#2a1f12'");
  });

  it('⚠⚠⚠ …and the decided state stays QUIET — a re-read handle is not a demand', () => {
    expect(SHEET).toContain("barQuiet: { backgroundColor: '#17150f', borderColor: '#3a342c' },");
    expect(SHEET).toContain("barTextQuiet: { color: '#a2977b' },");
  });

  it('⚠⚠ the hint rides on the filled plate in dark ink — pale grey on gold is unreadable', () => {
    expect(SHEET).toContain('barHintDeciding');
    expect(SHEET).toContain("barHintDeciding: { color: '#4a3714'");
    expect(SHEET).toContain('<Text style={styles.barHintDeciding}>{waitingWord}</Text>');
  });

  it('⚠ the active label carries the same ▸ every other live control uses', () => {
    expect(SHEET).toContain('`▸ SPEAK TO ${c.npcName.toUpperCase()}`');
  });
});

describe('OTA-1549 — SET COURSE lives inside the talk box', () => {
  it('⚠⚠⚠ the sheet routes through the SAME resolver the Contracts panel walks', () => {
    // Two spellings of "where is this whisper pointing" is how the panel and
    // the sheet would come to disagree. There is one.
    expect(SHEET).toContain('const route = whisperRouteTarget(w);');
    expect(SHEET).toContain('setWhisperCourse(route.gridX, route.gridY, route.label);');
    expect(CONTRACTS).toContain('setWhisperCourse(route.gridX, route.gridY, route.label);');
  });

  it('⚠⚠⚠ it hides when you are STANDING on the objective, and the check is subscribed', () => {
    // A getState() snapshot would leave the button offering a walk to ground
    // the player is already on, because the course moves them a tile at a time
    // underneath this component.
    expect(SHEET).toContain('const here = !!route && cell != null && cell.x === route.gridX && cell.y === route.gridY;');
    expect(SHEET).toContain('const player = useGameStore((s) => s.player);');
    expect(SHEET).toContain('const cell = useMemo(() => (player ? playerGridCell(player) : null), [player]);');
    // ⚠ And never a fresh-object selector — that hands zustand a new snapshot
    // every render and spins.
    expect(SHEET).not.toContain('useGameStore((s) => (s.player ? playerGridCell(s.player) : null))');
  });

  it('⚠⚠ the button renders above the decisions and survives every stage', () => {
    expect(SHEET).toContain('{route && !here && (');
    expect(SHEET).toContain('▸ SET COURSE TO {route.label.toUpperCase()}');
    // Not nested inside the `deciding` branch — after ACCEPT (which keeps the
    // sheet open) it must still be there, re-aimed at the mark.
    const routeAt = SHEET.indexOf('{route && !here && (');
    const decidingAt = SHEET.indexOf('{deciding ? (');
    expect(routeAt).toBeGreaterThan(-1);
    expect(decidingAt).toBeGreaterThan(routeAt);
  });

  it('⚠⚠ taking the course closes the sheet and puts the player back on the world screen', () => {
    expect(SHEET).toContain('setOpen(false);');
    expect(SHEET).toContain("setScreen('exploration');");
  });

  it('⚠ it is filled in the house SET-COURSE blue, matching the Contracts control it mirrors', () => {
    expect(SHEET).toContain("borderColor: '#6f93c4',");
    expect(CONTRACTS).toContain("borderColor: '#6f93c4',");
    expect(SHEET).toContain("backgroundColor: '#22364e',");
  });
});
