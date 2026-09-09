#!/usr/bin/env node
/**
 * OTA-1785 — THE STORE CEILING, AND THERE IS NOW EXACTLY ONE OF IT.
 *
 * Owner: *"Do not knowingly carry contradictory test authorities into Legacy
 * Hunt... Where multiple suites are protecting the SAME architectural claim,
 * they should consume one authority or otherwise have one unmistakable source
 * of truth."*
 *
 * ⚠⚠⚠ WHAT WAS ACTUALLY THERE, WHICH IS WORSE THAN REPORTED. I told the owner
 * there were four authorities. There were THIRTEEN — twelve suites asserting
 * `gameStore.ts` under 37,000 lines and one (`ota1717`) asserting under 36,999.
 * They did not agree, nothing reconciled them, and the tightest one silently
 * governed. A pass that fit under 37,000 could still be red, and the failure
 * named a dog-market OTA from weeks earlier rather than the rule it broke.
 *
 * ⚠⚠ AND THERE WAS NO GATE AT ALL. `check:lines` sounds like this and is not:
 * it is `verify-lines.mjs`, which proves the four PRODUCT lines (golem, hal,
 * steam, html) resolve distinct Expo configs. So the store ceiling was enforced
 * only by the full surface — a ~14 minute run — and was invisible to every
 * cheaper check. Three separate passes hit it that way in one session.
 *
 * ⚠ THE THIRTEEN SUITES ARE NOT DELETED, AND THAT IS DELIBERATE. Owner: *"If
 * two apparently duplicated ratchets actually protect different claims,
 * preserve both and document the distinction rather than forcing false
 * consolidation."* They are not the same claim. `ota1400` is the CAMPAIGN
 * ratchet — the record of 45,050 → 39,470 → here across nine extraction slices.
 * `ota1676`, `ota1678`, `ota1688` and the rest each say something narrower and
 * true: *this* OTA absorbed a feature, or moved a writer out, and did not give
 * the campaign's ground back. Thirteen different sentences that happened to
 * share one number. Now they share the number BY READING IT FROM HERE, and each
 * keeps its own sentence.
 *
 * ⚠ NO HEADROOM, the same discipline as `check:gold`'s baseline: the ceiling is
 * the measured count at consolidation. New store code must displace old store
 * code, or the responsibility belongs outside the file. Lower it when an
 * extraction lands; never raise it without an owner decision.
 *
 * ⚠⚠ WHAT THIS CANNOT SEE, said plainly: it counts LINES, which is a proxy for
 * responsibility and not a measure of it. A 400-line function moved into one
 * 400-line file changes nothing architecturally and the number cannot tell.
 * The number is a pressure valve that makes growth visible; the architecture
 * argument still has to be made by a person.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STORE = 'app/state/gameStore.ts';

/** ⚠ The measured count, with no headroom.
 *
 *    45050  OTA-1400 era  before the extraction campaign
 *    39470  OTA-1400      nine slices in
 *    36998  OTA-1785      the count when the thirteen authorities became one
 *    36963  OTA-1790      the four attack lines moved to engine/combatProse
 *
 * ⚠⚠ OTA-1790 IS THE FIRST TIME THIS NUMBER CAME DOWN AS A CONDITION OF WORK
 * RATHER THAN AS TIDYING. The transcript pass needed lines the store did not
 * have; the owner's ruling was *"EXTRACT, DO NOT JUST RAISE IT"*, so five pure
 * display functions went to the file already named for them and the pass gave
 * back more than it took. That is the intended pressure — the valve works by
 * making somebody find a boundary, not by making them ask for a bigger number. */
export const CEILING = 36963;

const n = fs.readFileSync(path.join(ROOT, STORE), 'utf8').split('\n').length;

if (n > CEILING) {
  console.error(`[check:storeceiling] FAIL — ${STORE} grew: ${n} > ceiling ${CEILING}.`);
  console.error('');
  console.error('The store is at its ceiling by design. New store code must displace old');
  console.error('store code, or the responsibility belongs in a module outside the file.');
  console.error('Lower the ceiling when an extraction lands; never raise it without a ruling.');
  process.exit(1);
}

console.log(`[check:storeceiling] OK — ${STORE} at ${n} lines, ceiling ${CEILING}`
  + (n < CEILING ? ` (${CEILING - n} below — lower the ceiling)` : ' (at ceiling)'));
console.log('  ⚠ counts LINES, a proxy for responsibility and not a measure of it.');
