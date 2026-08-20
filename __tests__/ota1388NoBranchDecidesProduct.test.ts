/**
 * OTA-1388 — no branch name decides a product any more. All of them, this time.
 *
 * OTA-1386 replaced the branch-name checks that chose which product to build. It
 * found two and missed a third, and the third was the quietest one:
 *
 *   if: steps.meta.outputs.profile == 'production' || github.ref_name == 'HaL2001'
 *
 * — the gate on Android RELEASE SIGNING. On the trunk `ref_name` is
 * `golem-line`, so a `line: hal` sideload APK would have skipped that step and
 * come out DEBUG-SIGNED. It builds. It installs. It runs. It is signed with a
 * throwaway key, so it cannot upgrade an existing HAL install and has no
 * relationship to the HaL upload key — and nothing in the run says so. You find
 * out when a tester's phone refuses the update.
 *
 * ⚠⚠ WHY THIS SUITE IS A SWEEP RATHER THAN A THIRD FIX. Finding these one at a
 * time is how there came to be three. The check below reads every workflow and
 * fails on ANY executable use of a retired product branch's name, so a fourth
 * cannot be missed the same way. Comments may still name them — explaining what
 * changed is the opposite of the problem.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '.github', 'workflows');
const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

/** Branches that used to mean "this product". None may steer a build now. */
const RETIRED_BRANCHES = ['HaL2001', 'steam_Dev', 'html_dev', 'linux_dev', 'mac_dev', 'Dev_engine_PC'];

/** Lines that are pure comments are prose, not behaviour. */
const executableLines = (src: string) =>
  src.split('\n')
    .map((l, i) => ({ n: i + 1, text: l }))
    .filter(({ text }) => text.trim() !== '' && !text.trim().startsWith('#'));

describe('OTA-1388 — a retired branch name cannot steer a build', () => {
  it.each(files)('%s names no retired product branch outside a comment', (f) => {
    const hits = executableLines(readFileSync(join(dir, f), 'utf8'))
      .filter(({ text }) => RETIRED_BRANCHES.some((b) => text.includes(b)))
      .map(({ n, text }) => `${f}:${n}  ${text.trim()}`);
    expect(hits).toEqual([]);
  });

  it('⚠⚠ …and the signing gate asks the LINE instead', () => {
    // The fix itself, pinned. `env.TARTARIA_LINE` is the same question the rest
    // of the pipeline asks; `github.ref_name` answers a different one that
    // stopped being about products at OTA-1384.
    const apk = readFileSync(join(dir, 'build-apk.yml'), 'utf8');
    expect(apk).toContain("if: steps.meta.outputs.profile == 'production' || env.TARTARIA_LINE == 'hal'");
  });

  it('⚠ no workflow reads github.ref_name to pick a product', () => {
    // ref_name still legitimately identifies the TRUNK (the OTA workflow refuses
    // to publish from anywhere else). What it must never do again is stand in
    // for "which of the four products is this".
    for (const f of files) {
      for (const { text } of executableLines(readFileSync(join(dir, f), 'utf8'))) {
        if (!text.includes('ref_name') && !text.includes('GITHUB_REF_NAME')) continue;
        // the only permitted comparison is against the trunk
        const compares = /(?:ref_name|GITHUB_REF_NAME)[^\n]*?==[^\n]*?['"]([^'"]+)['"]/.exec(text);
        if (compares) expect(compares[1]).toBe('golem-line');
      }
    }
  });

  it('⚠ the release note says which product an APK is, since the branch no longer does', () => {
    // One trunk, four products, one artifact name shape. Without the line in the
    // note a downloaded APK cannot be attributed to a product at all.
    const apk = readFileSync(join(dir, 'build-apk.yml'), 'utf8');
    expect(apk).toContain('BRANCH="${GITHUB_REF_NAME} (line: ${TARTARIA_LINE})"');
  });
});
