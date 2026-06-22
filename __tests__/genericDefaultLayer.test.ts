// engine_Dev — the GENERIC DEFAULT PACK layer. A complete generic game sits between
// the author's overrides and the built-in (Tartaria) data: resolvers return
// override → generic default → Tartaria builtin. This is what makes a skipped/RESET
// section fall back to generic instead of Tartaria. Crucially the layer is a NO-OP
// until installGenericDefaults() runs, so the Tartaria-based test harness is unaffected.

import {
  resolveTable,
  resolveMissions,
  resolveFlavor,
  installGenericDefaults,
  clearGenericDefaults,
  hasGenericDefaults,
  setTableOverride,
  clearAllOverrides,
} from '../app/engine/contentPack';

const BUILTIN = [{ id: 'tartaria_row' }];
const GENERIC = [{ id: 'generic_row' }];
const AUTHOR = [{ id: 'author_row' }];

describe('generic default pack — override > generic > builtin', () => {
  beforeEach(() => { clearAllOverrides(); clearGenericDefaults(); });
  afterEach(() => { clearAllOverrides(); clearGenericDefaults(); });

  test('NO-OP until installed: resolvers return the Tartaria builtin', () => {
    expect(hasGenericDefaults()).toBe(false);
    expect(resolveTable('weapons', BUILTIN)).toBe(BUILTIN);
    expect(resolveMissions('hunts', BUILTIN)).toBe(BUILTIN);
    expect(resolveFlavor('opening', 'tartaria-line')).toBe('tartaria-line');
  });

  test('installed: a section with no override falls to GENERIC, not the builtin', () => {
    installGenericDefaults({
      tables: { weapons: GENERIC },
      missions: { hunts: GENERIC },
      flavor: { opening: ['generic-line'] },
    });
    expect(hasGenericDefaults()).toBe(true);
    expect(resolveTable('weapons', BUILTIN)).toBe(GENERIC);
    expect(resolveMissions('hunts', BUILTIN)).toBe(GENERIC);
    expect(resolveFlavor('opening', 'tartaria-line')).toEqual(['generic-line']);
    // a table the generic pack DOESN'T cover still falls through to the builtin
    expect(resolveTable('armor', BUILTIN)).toBe(BUILTIN);
  });

  test("the author's upload still wins over the generic default", () => {
    installGenericDefaults({ tables: { weapons: GENERIC }, missions: {} });
    setTableOverride('weapons', AUTHOR);
    expect(resolveTable('weapons', BUILTIN)).toBe(AUTHOR);
  });

  test('clearGenericDefaults restores the pure Tartaria fallback', () => {
    installGenericDefaults({ tables: { weapons: GENERIC }, missions: {} });
    clearGenericDefaults();
    expect(hasGenericDefaults()).toBe(false);
    expect(resolveTable('weapons', BUILTIN)).toBe(BUILTIN);
  });
});
