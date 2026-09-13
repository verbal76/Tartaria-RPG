// ⚠⚠⚠ A3-1 — AN ANDROID RELEASE TAG MUST NAME THE SOURCE THAT BUILT IT.
//
// `gh release create` without `--target` creates the tag at the REPOSITORY'S
// DEFAULT BRANCH head, not at the commit the run compiled. That is how
// golem-apk-327/328/329/330, aab-build-318 and Hal2001-317 all came to resolve
// to b21a331d — a `main` doc commit that is not an ancestor of golem-line —
// while golem-apk-330's own release body named `Commit: 6de648e`. The note was
// right; the tag was not, and nothing went red either way.
//
// ⚠ THE INVARIANT THIS SUITE HOLDS IS A PAIR, not a flag:
//   1. the release is created with `--target "$GITHUB_SHA"`, and
//   2. the checkout it builds from takes no `ref:` override,
// because (2) is the only thing that makes (1) the BUILT source rather than an
// arbitrary commit. A future `ref:` on that checkout would silently decouple the
// two and restore the defect with the flag still present, so both halves are
// pinned here together.
//
// ⚠ EVERY ASSERTION READS EXECUTABLE TEXT. The step's `run` block is parsed out
// of the YAML and its `#` comment lines are stripped before anything is matched,
// so the long explanatory comment beside the fix — which necessarily mentions
// `--target` — can never be what makes this suite pass.
//
// ⚠ Not an OTA — a workflow cannot reach a phone — so this suite deliberately
// carries no OTA number and the build stamp does not move.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// js-yaml ships no types here; the parser is the one the repo already carries.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml') as { load: (src: string) => unknown };

const WORKFLOW = join(__dirname, '..', '.github', 'workflows', 'build-apk.yml');
const raw = readFileSync(WORKFLOW, 'utf8');

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; if?: string };
// ⚠ `jobs` is declared with the ONE job this workflow has rather than as a
// Record, so every read below is a typed field instead of an index that has to
// be asserted non-undefined. The suite fails loudly if `build` ever disappears.
type Job = { if: string; steps: Step[] };
type Doc = { jobs: { build: Job } };

const job: Job = (load(raw) as Doc).jobs.build;
const steps: Step[] = job.steps;

/** Executable shell only: `#` comment lines removed, so no assertion below can
 *  be satisfied by prose. */
function executable(run: string): string {
  return run
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

const releaseSteps = steps.filter((s) => typeof s.run === 'string' && executable(s.run).includes('gh release create'));

describe('A3-1 — the Android release tag targets the exact built SHA', () => {
  it('⚠⚠ there is exactly ONE executable release-creation path in this workflow', () => {
    expect(releaseSteps).toHaveLength(1);
    expect(releaseSteps[0]!.name).toBe('Create Tartaria Realms GitHub Release');
  });

  it('⚠⚠⚠ and it passes --target "$GITHUB_SHA" — without it GitHub tags the default branch', () => {
    const sh = executable(releaseSteps[0]!.run!);
    expect(sh).toContain('--target "$GITHUB_SHA"');
    // One target, one release: a second --target would make which one wins a
    // question about argument order rather than about identity.
    expect(sh.split('--target').length - 1).toBe(1);
    expect(sh.split('gh release create').length - 1).toBe(1);
  });

  it('⚠⚠ the checkout takes NO ref: override, which is what makes $GITHUB_SHA the BUILT source', () => {
    const checkouts = steps.filter((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout@'));
    expect(checkouts).toHaveLength(1);
    // No `with:` at all today; if one is ever added it must not carry `ref`.
    expect(checkouts[0]!.with?.ref).toBeUndefined();
  });

  it('⚠ the tag and the release note now name the same commit by construction', () => {
    const sh = executable(releaseSteps[0]!.run!);
    // The body's SHORT_SHA was already derived from $GITHUB_SHA — it was the
    // half that was right. The tag now comes from the same variable.
    expect(sh).toContain('SHORT_SHA="${GITHUB_SHA::7}"');
    expect(sh).toContain('Commit: ${SHORT_SHA}');
  });
});

describe('A3-1 — scope controls: the repair changed identity and nothing else', () => {
  const sh = executable(releaseSteps[0]!.run!);

  it('⚠ release NAMING is untouched — all four tag spellings and both titles', () => {
    const meta = executable(steps.find((s) => s.name === 'Determine build profile and tag')!.run!);
    expect(meta).toContain('TAG="${GITHUB_REF#refs/tags/}"');
    expect(meta).toContain('TAG="aab-build-${{ github.run_number }}"');
    expect(meta).toContain('TAG="Hal2001-${{ github.run_number }}"');
    expect(meta).toContain('TAG="${TARTARIA_LINE}-apk-${{ github.run_number }}"');
    expect(sh).toContain('TITLE="Tartaria Realms ${TAG}"');
    expect(sh).toContain('TITLE="Tartaria Realms v${VERSION}-build.${{ github.run_number }}"');
  });

  it('⚠ ARTIFACT SELECTION is untouched — the release still uploads the staged artifact', () => {
    expect(sh).toContain('"${{ steps.artifact.outputs.path }}"');
    expect(sh).toContain('--latest');
    const stage = executable(steps.find((s) => s.name === 'Stage Tartaria Realms artifact')!.run!);
    expect(stage).toContain('android/app/build/outputs/bundle/release/app-release.aab');
    expect(stage).toContain('android/app/build/outputs/apk/release/app-release.apk');
  });

  it('⚠ versionCode behaviour is untouched — still the GitHub run_number, injected pre-prebuild', () => {
    const inject = steps.find((s) => s.name === 'Inject Android versionCode = GitHub run_number')!;
    expect(executable(inject.run!)).toContain('app.expo.android.versionCode = ${{ github.run_number }};');
    // …and it still runs BEFORE the native project is generated, or it lands in
    // no manifest at all.
    const order = steps.map((s) => s.name);
    expect(order.indexOf('Inject Android versionCode = GitHub run_number'))
      .toBeLessThan(order.indexOf('Generate native Android project'));
  });

  it('⚠ SIGNING behaviour is untouched — same gate, same release-signed AAB assertion', () => {
    const signing = steps.find((s) => s.name === 'Configure release signing (production AAB + HAL sideload APK)')!;
    expect(signing.if).toBe("steps.meta.outputs.profile == 'production' || env.TARTARIA_LINE == 'hal'");
    const verify = steps.find((s) => s.name === 'Verify AAB is release-signed (production only)')!;
    expect(executable(verify.run!)).toContain('Tartaria Realms Debug');
  });

  it('⚠ the job gate is untouched — a trunk push still builds only when asked', () => {
    const gate = job.if;
    for (const marker of ['[build-apk]', '[build-aab]', '[golem-apk]']) {
      expect(gate).toContain(`contains(github.event.head_commit.message, '${marker}')`);
    }
    expect(gate).toContain("github.ref != 'refs/heads/golem-line'");
  });
});
