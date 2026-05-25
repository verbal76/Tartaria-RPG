// OTA verification marker. Bumped manually on each JS-only push so the
// About screen can prove the OTA actually reached the device.
//
// Compare the value shown in About → "OTA build" against the latest
// bump in this file. If they match, the OTA pipeline delivered.
//
// Format: YYYY-MM-DD-NNN where NNN is a per-day counter.
//
// 2026-05-25 OTA-020 — diagnostic re-publish to flush the preview
// channel. User reports their device stuck on OTA-010 despite the
// "Last OTA applied: Yes" flag. The flag is binary-historical and
// only confirms ANY OTA was applied (010 at 07:45), not the latest.
// If this publish succeeds end-to-end (workflow green in GH Actions)
// and the device still shows 010 after cold-start, it's a fetch-
// cadence issue, not a publish issue.
export const OTA_BUILD_ID = '2026-05-25-028';
