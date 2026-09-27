// QOL #220 — ENEMY APPLIED-EFFECT VISIBILITY.
//
// Owner report: an applied effect (his example — acid) "works mechanically in
// narration but enemy card lacks persistent visual indication." Traced before
// touching anything, per the package rule ("investigate the ACTUAL effect/
// status data model first"): `EnemyStatusView`'s `kind` union already spans
// all eight coating/DOT/infection families the engine can apply, EnemyPanel's
// `statusCol` already renders one badge per active status (label + turns
// left + damage/turn) generalized off `STATUS_META`, and ExplorationScreen
// already wires `currentScene.enemyStatuses[i]` straight into that prop with
// no filtering to any one kind. The owner's acid example already renders
// exactly as reported missing — this locks the existing, correct behaviour
// with the regression coverage it never had, rather than changing code that
// isn't broken.
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const PANEL = read('app', 'components', 'EnemyPanel.tsx');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');

const STATUS_KINDS = [
  'infected', 'poison_coat', 'acid_coat', 'corruption_coat',
  'electrical_coat', 'burn_coat', 'cold_coat', 'typed_dot',
] as const;

describe('QOL #220 — the status model already covers every applied effect, not just acid', () => {
  it('EnemyStatusView is a closed union of all eight effect families', () => {
    const i = PANEL.indexOf('export interface EnemyStatusView {');
    expect(i).toBeGreaterThan(-1);
    const body = PANEL.slice(i, PANEL.indexOf('}', i));
    for (const kind of STATUS_KINDS) {
      expect(body).toContain(`'${kind}'`);
    }
    expect(body).toContain('turnsRemaining: number');
    expect(body).toContain('dmgPerTurn: number');
  });

  it('STATUS_META names a distinct label + accent color for every kind — none hard-coded to acid alone', () => {
    const i = PANEL.indexOf('const STATUS_META:');
    expect(i).toBeGreaterThan(-1);
    const body = PANEL.slice(i, PANEL.indexOf('};', i) + 1);
    for (const kind of STATUS_KINDS) {
      expect(body).toContain(`${kind}:`);
    }
    expect(body).toContain("acid_coat: { label: 'ACID'");
  });
});

// ⚠⚠ QOL #220 CORRECTION (physical acceptance) — this describe block's claim
// narrowed on 2026-09-27. The owner's physical screenshot showed the AC-
// adjacent glyph AND this lower chip printing the SAME acid effect at once;
// the fix retires this chip for any status the glyph vocabulary already
// covers (coatingGlyphForStatus non-null), so `statusCol` is no longer EVERY
// active status — it is every status the AC glyph does NOT already speak
// for. The union coverage and persistence claims below still hold; only
// "every status" narrowed to "every non-coating status", which is exactly
// what qol220AcAdjacentEffectIndicator.test.tsx's cases D/G prove is not an
// information-loss regression (infected/typed_dot are still shown here).
describe('QOL #220 — the card renders every NON-COATING active status persistently, not only in narration', () => {
  it('statusCol renders one badge per non-qualifying status with label, turns-left and damage/turn — generalized, not switched on kind', () => {
    const i = PANEL.indexOf('nonCoatingStatuses.length > 0');
    expect(i).toBeGreaterThan(-1);
    const body = PANEL.slice(i, PANEL.indexOf(')}', PANEL.indexOf('</View>', i)));
    expect(body).toContain('nonCoatingStatuses.map((st, i) =>');
    // Looked up by st.kind, not written per-kind — the badge is generic over
    // the whole EnemyStatusView union, so a new coating family needs no new
    // branch here.
    expect(body).toContain('STATUS_META[st.kind]');
    expect(body).toContain('st.turnsRemaining');
    expect(body).toContain('st.dmgPerTurn');
    expect(body).not.toMatch(/st\.kind === 'acid_coat'/);
  });

  it('the badge column persists across renders (conditional on data present, not on any one-shot flag)', () => {
    // No "just fired" / "seen" gate — as long as the model still lists a
    // non-qualifying status, the card keeps showing it, which is the
    // "persistent" the owner asked for as opposed to a narration line that
    // scrolls away.
    expect(PANEL).toContain('{nonCoatingStatuses.length > 0 && (');
    expect(PANEL).not.toMatch(/statusCol[\s\S]{0,120}useState/);
  });

  it('a qualifying coating (already covered by the developed-glyph unit) is excluded from this row by construction, not a name list', () => {
    // ⚠⚠⚠ QOL #220 FINAL renamed the partition function — it now resolves a
    // real artwork asset (`glyphArt`), not a Unicode character, so
    // `coatingGlyphForStatus` became `coatingKindForStatus`. The claim under
    // test — that the lower row's exclusion is CONSTRUCTED (suffix-strip),
    // not a hand-written name list — is unchanged.
    const i = PANEL.indexOf('const nonCoatingStatuses =');
    expect(i).toBeGreaterThan(-1);
    const line = PANEL.slice(i, PANEL.indexOf('\n', i));
    expect(line).toContain('coatingKindForStatus(st.kind) === null');
  });
});

describe('QOL #220 — the card reads the same model the engine ticks, not a narration echo', () => {
  it('ExplorationScreen wires the panel straight from currentScene.enemyStatuses, per enemy index, unfiltered by kind', () => {
    const i = EXPL.indexOf('statuses: currentScene.enemyStatuses?.[i]');
    expect(i).toBeGreaterThan(-1);
    expect(EXPL.slice(i, i + 60)).toContain('currentScene.enemyStatuses?.[i] ?? []');
    // The memo that builds this view list is invalidated when enemyStatuses
    // changes, so a status that ticks off (tickEnemyDotsAndMaybeEndFight)
    // disappears from the card on the very next render — not just the log.
    const memoDeps = EXPL.slice(EXPL.indexOf(']);', i) - 400, EXPL.indexOf(']);', i) + 3);
    expect(memoDeps).toContain('currentScene?.enemyStatuses');
  });
});
