/**
 * ⚠⚠⚠ OTA-1812 — THE REPORT RECEIPT STOPS OPENING A NATIVE DOOR.
 *
 * Physical iOS Build 189 (2.4.1, HAL, OTA-1811) reproduced a post-report freeze
 * TWICE: once from Send Full Log, once from a character report whose whole
 * description was "Froze". Both times the UI reached the success receipt and
 * then stopped accepting touch — while the process stayed ALIVE and JS timers
 * kept firing. Both Sentry bundles arrived complete (mu00gi1et5oc 8/8,
 * mu00jlb219pe 7/7), so the report itself worked; what died was the hand.
 *
 * ⚠⚠ WHY THE PRESENTATION BOUNDARY IS THE ONE VARIABLE LEFT. Composition,
 * pending persistence, encoding, Sentry capture, bounded flush, pending-file
 * clearing and the composer's return all complete BEFORE the receipt is shown,
 * and nothing report-controlled remains scheduled after it. The first narrow
 * thing common to both reproductions after success is
 *   bugReportPopup -> BrandedModal -> React Native native <Modal>.
 *
 * ⚠⚠⚠ AND THIS SUITE PROVES A WIRING, NOT A CAUSE. Jest cannot present a native
 * iOS modal, so no assertion here can show that <Modal> froze anything. What it
 * can hold is that the receipt takes the in-tree path instead — which is the
 * single variable this OTA moves so the physical iPhone can answer the
 * question. The mechanism stays SOURCE-DERIVED until a device says otherwise.
 *
 * ⚠ NO NEW MATERIAL IS MINTED. `inline` is arb73's existing path, added because
 * iOS can present a native <Modal> INVISIBLY while its backdrop still eats
 * touches. §4 asserts the other consumers were NOT swept along with it.
 */
import React from 'react';
import { Modal } from 'react-native';
import fs from 'fs';
import path from 'path';
import { BrandedModal } from '../app/components/BrandedModal';

/** ⚠ SAME SHIM ota1799 USES — `react-test-renderer` ships no declarations, and
 *  inventing a second convention for it would put this suite on the tests
 *  typecheck ratchet for no behavioural gain. */
interface TestNode { props: Record<string, unknown>; }
interface Tree {
  unmount(): void;
  toJSON(): unknown;
  root: {
    findAll(fn: (n: TestNode) => boolean): TestNode[];
    findAllByType(t: unknown): TestNode[];
  };
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): Tree;
};

const ABOUT = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'AboutScreen.tsx'),
  'utf8',
);

const mounted: Tree[] = [];
const mount = (el: React.ReactElement): Tree => {
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(el); });
  mounted.push(tree);
  return tree;
};
afterEach(() => {
  while (mounted.length) {
    const t = mounted.pop()!;
    renderer.act(() => { t.unmount(); });
  }
});

/** ⚠ POSITION-INDEPENDENT LOCATOR. Slice the JSX element that owns
 *  `bugReportPopup?.title` — the receipt — from its `<BrandedModal` open to its
 *  self-closing end. Keying on the element rather than on a line number means a
 *  later edit above it cannot silently move this suite onto a different modal.
 *  Throws unless exactly one such element exists. */
function receiptElement(code: string): string {
  const opens = [...code.matchAll(/<BrandedModal\b/g)].map((m) => m.index!);
  const hits = opens
    .map((start) => {
      const end = code.indexOf('/>', start);
      return end === -1 ? null : code.slice(start, end + 2);
    })
    .filter((el): el is string => el !== null && el.includes('bugReportPopup?.title'));
  if (hits.length !== 1) {
    throw new Error(`expected exactly one bugReportPopup BrandedModal, found ${hits.length}`);
  }
  return hits[0]!;
}

const RECEIPT = receiptElement(ABOUT);

// ═══ 1. THE ONE VARIABLE THIS OTA MOVES ══════════════════════════════════════
describe('OTA-1812 — the report-result receipt asks for the in-tree path', () => {
  /* ⚠ THE LOAD-BEARING ASSERTION. Delete `inline` from that element and this is
   * the test that goes red. It is scoped to the receipt element itself, so
   * adding or removing `inline` anywhere else in AboutScreen cannot satisfy it
   * and cannot break it. */
  it('the receipt supplies BrandedModal`s existing `inline` prop', () => {
    expect(RECEIPT).toMatch(/\binline\b/);
  });

  it('it is still the report receipt it always was, not a new control', () => {
    // title/body from the popup state, one OK button, and a close handler.
    expect(RECEIPT).toContain('visible={bugReportPopup !== null}');
    expect(RECEIPT).toContain('bugReportPopup?.body');
    expect(RECEIPT).toContain("label: 'OK'");
  });

  /* ⚠⚠ THE DISMISSAL CONTRACT, BOTH DOORS. A receipt the player cannot close is
   * worse than the freeze it is meant to rule out, and the inline path routes
   * scrim taps through `onRequestClose` — so the outside tap and the OK button
   * must BOTH still clear the popup. Counted rather than matched once, because
   * one of the two disappearing is exactly the regression worth catching. */
  it('OK and the scrim both still clear the popup', () => {
    const clears = [...RECEIPT.matchAll(/setBugReportPopup\(null\)/g)];
    expect(clears.length).toBe(2);
    expect(RECEIPT).toMatch(/onPress:\s*\(\)\s*=>\s*setBugReportPopup\(null\)/);
    expect(RECEIPT).toMatch(/onRequestClose=\{\(\)\s*=>\s*setBugReportPopup\(null\)\}/);
  });
});

// ═══ 2. WHAT `inline` ACTUALLY RENDERS ═══════════════════════════════════════
// The prop above is only a request. These render the real component and ask
// what came out, so the suite cannot pass on a prop the component ignores.
describe('OTA-1812 — the inline path renders the receipt without a native Modal', () => {
  const receipt = (inline: boolean) => mount(
    <BrandedModal
      inline={inline}
      visible
      title="REPORT SENT"
      body="Report sent. Thank you — it arrived with your log attached."
      buttons={[{ label: 'OK', tone: 'primary', onPress: () => {} }]}
      onRequestClose={() => {}}
    />,
  );

  /* ⚠⚠⚠ THE ASSERTION THE WHOLE OTA EXISTS FOR: no native <Modal> in the tree.
   * Its twin below renders the SAME props WITHOUT inline and finds one — so
   * this is a measured difference between the two paths, not a claim that
   * BrandedModal never uses Modal. */
  it('inline renders ZERO native Modal hosts', () => {
    expect(receipt(true).root.findAllByType(Modal).length).toBe(0);
  });

  it('and the path it replaces renders exactly one — the difference is real', () => {
    expect(receipt(false).root.findAllByType(Modal).length).toBe(1);
  });

  /* The receipt has to still be a receipt: the outcome body the report handed
   * it must be on screen, not swallowed by the path change. */
  it('the exact outcome body supplied by the report is still rendered', () => {
    const texts: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') { texts.push(node); return; }
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const n = node as { children?: unknown } | null;
      if (n && typeof n === 'object' && 'children' in n) walk(n.children);
    };
    walk(receipt(true).toJSON());
    expect(texts.join(' ')).toContain(
      'Report sent. Thank you — it arrived with your log attached.',
    );
  });

  /* ⚠ A HIDDEN RECEIPT MUST DRAW NOTHING AT ALL on the inline path — it is an
   * absolute full-screen layer, so leaving it mounted while invisible would put
   * a scrim over the About screen forever. That is the failure mode this
   * repair must not introduce while chasing another one. */
  it('an invisible inline receipt renders nothing', () => {
    const tree = mount(
      <BrandedModal
        inline
        visible={false}
        title="REPORT SENT"
        body="…"
        buttons={[{ label: 'OK', tone: 'primary', onPress: () => {} }]}
        onRequestClose={() => {}}
      />,
    );
    expect(tree.toJSON()).toBeNull();
  });
});

// ═══ 3. THE OK BUTTON STILL FIRES ════════════════════════════════════════════
describe('OTA-1812 — the receipt can still be dismissed by hand', () => {
  it('pressing OK on the inline receipt calls its handler exactly once', () => {
    const onPress = jest.fn();
    const tree = mount(
      <BrandedModal
        inline
        visible
        title="REPORT SENT"
        body="Report sent."
        buttons={[{ label: 'OK', tone: 'primary', onPress }]}
        onRequestClose={() => {}}
      />,
    );
    const ok = tree.root.findAll(
      (n: TestNode) => typeof n.props?.onPress === 'function'
        && typeof n.props?.accessibilityLabel === 'string'
        && /^ok$/i.test(n.props.accessibilityLabel as string),
    );
    const target = ok.length
      ? ok[0]!
      : tree.root.findAll((n: TestNode) => typeof n.props?.onPress === 'function').slice(-1)[0]!;
    renderer.act(() => { (target.props.onPress as () => void)(); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// ═══ 4. SCOPE — NOTHING ELSE WAS SWEPT ALONG ═════════════════════════════════
describe('OTA-1812 — exactly one consumer changed', () => {
  /* ⚠⚠ THE BOUNDARY THIS OTA PROMISED. BrandedModal has other consumers, and
   * converting them would have been a different, unauthorised change with a
   * much larger blast radius. Only the receipt asks for `inline` in this file. */
  it('the receipt is the only BrandedModal in AboutScreen asking for inline', () => {
    const elements = [...ABOUT.matchAll(/<BrandedModal\b/g)]
      .map((m) => ABOUT.slice(m.index!, ABOUT.indexOf('/>', m.index!) + 2));
    const withInline = elements.filter((el) => /\binline\b/.test(el));
    expect(withInline.length).toBe(1);
    expect(withInline[0]!).toContain('bugReportPopup?.title');
  });

  /* BrandedModal itself is untouched material: the native path still exists for
   * everyone who did not ask for the other one. §2 proves it still renders. */
  it('the native path is still available to consumers that do not opt out', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'components', 'BrandedModal.tsx'),
      'utf8',
    );
    expect(src).toContain('if (inline)');
    expect(src).toMatch(/<Modal\b/);
  });
});

// ═══ 5. THE STAMP ════════════════════════════════════════════════════════════
describe('OTA-1812 — the build says which OTA it is', () => {
  it('OTA_BUILD_ID is at or past 1812', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'buildInfo.ts'),
      'utf8',
    );
    const m = /^export const OTA_BUILD_ID = '([^']+)'/m.exec(src);
    expect(m).not.toBeNull();
    const n = Number(/-(\d{3,4})-/.exec(m![1]!)?.[1]);
    expect(n).toBeGreaterThanOrEqual(1812);
  });
});
