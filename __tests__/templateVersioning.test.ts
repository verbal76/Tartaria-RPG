// engine_Dev — stale-upload detection. An author's upload is "stale" when it was built
// against an OLDER version of that section's template than the engine now ships. These
// lock the pure reconcile/stale logic (the store wires it onto every upload).

import {
  reconcileStamps,
  staleKeys,
  hashContent,
  templateVersionFor,
  allTemplateKeys,
  type TemplateStamps,
} from '../app/engine/templateVersioning';

describe('templateVersioning — stamps + staleness', () => {
  it('a fresh upload stamps the current template version (not stale)', () => {
    const stamps = reconcileStamps({}, { titles: [{ id: 'a' }] });
    expect(stamps.titles).toBeTruthy();
    expect(stamps.titles!.tmpl).toBe(templateVersionFor('titles'));
    expect(staleKeys(stamps).has('titles')).toBe(false);
  });

  it('flags stale when the recorded template version no longer matches the current one', () => {
    const stamps: TemplateStamps = {
      titles: { content: hashContent([{ id: 'a' }]), tmpl: 'OLD_VERSION' },
    };
    expect(staleKeys(stamps).has('titles')).toBe(true);
  });

  it('a re-upload (changed content) refreshes the stamp and clears stale', () => {
    const old: TemplateStamps = {
      titles: { content: hashContent([{ id: 'a' }]), tmpl: 'OLD_VERSION' },
    };
    // same content → keeps the OLD recorded version (still stale)
    const same = reconcileStamps(old, { titles: [{ id: 'a' }] });
    expect(same.titles!.tmpl).toBe('OLD_VERSION');
    expect(staleKeys(same).has('titles')).toBe(true);
    // changed content (a real re-upload) → restamps to current (no longer stale)
    const fresh = reconcileStamps(old, { titles: [{ id: 'a' }, { id: 'b' }] });
    expect(fresh.titles!.tmpl).toBe(templateVersionFor('titles'));
    expect(staleKeys(fresh).has('titles')).toBe(false);
  });

  it('drops the stamp for a section that is no longer overridden', () => {
    const old = reconcileStamps({}, { titles: [{ id: 'a' }] });
    const next = reconcileStamps(old, {});
    expect(next.titles).toBeUndefined();
  });

  it('returns the SAME reference when nothing changed (lets callers skip a write)', () => {
    const old = reconcileStamps({}, { titles: [{ id: 'a' }] });
    const again = reconcileStamps(old, { titles: [{ id: 'a' }] });
    expect(again).toBe(old);
  });

  it('every section key resolves to a non-empty template version', () => {
    for (const key of allTemplateKeys()) {
      expect(templateVersionFor(key).length).toBeGreaterThan(0);
    }
  });

  it('unknown keys have no template version and are never stale', () => {
    expect(templateVersionFor('does-not-exist')).toBe('');
    const stamps: TemplateStamps = { 'does-not-exist': { content: 'x', tmpl: 'whatever' } };
    expect(staleKeys(stamps).size).toBe(0);
  });
});
