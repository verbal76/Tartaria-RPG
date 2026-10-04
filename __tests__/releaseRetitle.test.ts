/**
 * scripts/release-retitle.cjs — bring an existing release under the public naming
 * convention without touching its tag, commit or binary. The fixture is the real
 * golem-apk-478 release exactly as GitHub returned it before conversion.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { plan } = require('../scripts/release-retitle.cjs') as {
  plan: (r: unknown, kind: string, pv: unknown, sha: string) => { title: string; oldAsset: string; newAsset: string; body: string; alreadyDone: boolean; assetId: number };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('./fixtures-golem-apk-478.json') as { body: string; name: string; assets: Array<{ digest: string; name: string }> };
const pv = { product: 'Tartaria Realms', fileStem: 'Tartaria-Realms', version: 283 };
const SHA = '3d43bb82ca0c22e95b495010885cf3049983d496';

describe('retitling the newest release', () => {
  const p = plan(fixture, 'apk', pv, SHA);

  it('titles it "Tartaria Realms v283" and renames the file to match', () => {
    expect(p.title).toBe('Tartaria Realms v283');
    expect(p.oldAsset).toBe('tartaria-realms-golem-apk-478.apk');
    expect(p.newAsset).toBe('Tartaria-Realms-v283.apk');
    expect(p.alreadyDone).toBe(false);
  });

  it('the notes open with the install file, before anything technical', () => {
    expect(p.body.startsWith('# Tartaria Realms v283\n\nAndroid:\nTartaria-Realms-v283.apk\n')).toBe(true);
    expect(p.body.indexOf('Tartaria-Realms-v283.apk')).toBeLessThan(p.body.indexOf('Source commit'));
  });

  it('keeps every technical identifier: full SHA, versionCode, tag, line, package, old names, checksum', () => {
    for (const must of [
      `Source commit: ${SHA}`, 'Android versionCode / Build #: 478', 'Git tag: golem-apk-478', 'Product line: golem',
      'Package id: com.hotatticgames.tartarprim.golem', 'Previous title: Tartaria Realms v2.0.1-build.478',
      'Previous filename: tartaria-realms-golem-apk-478.apk', 'sha256'.length ? fixture.assets[0]!.digest.replace('sha256:', '') : '',
    ]) expect(p.body).toContain(must);
  });

  it('preserves the original notes VERBATIM', () => {
    expect(p.body).toContain(fixture.body);
  });

  it('is idempotent: a converted release is recognised and left alone', () => {
    const converted = { ...fixture, name: p.title, body: p.body, assets: [{ ...fixture.assets[0]!, name: p.newAsset }] };
    expect(plan(converted, 'apk', pv, SHA).alreadyDone).toBe(true);
  });

  it('a release without an attachment is refused', () => {
    expect(() => plan({ ...fixture, tag_name: 'apk-build-4', assets: [] }, 'apk', pv, SHA)).toThrow(/no attached file/);
  });

  it('an AAB resolves to the bare store package', () => {
    const aab = plan({ ...fixture, tag_name: 'aab-build-476', body: 'Branch: x (line: hal)', assets: [{ id: 1, name: 'tartaria-realms-aab-build-476.aab', digest: 'sha256:abc' }] }, 'aab', pv, SHA);
    expect(aab.newAsset).toBe('Tartaria-Realms-v283.aab');
    expect(aab.body).toContain('Package id: com.hotatticgames.tartarprim\n');
  });
});
