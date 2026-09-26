/**
 * branch-coverage 무대.
 *
 * 왼쪽: 대상 코드 다섯 줄 · 실행 자리(줄에서 줄로 옮겨 간다) · 줄 3 곁의 갈래 두 칸 · 조건 둘의 지금 값과 짝.
 * 오른쪽: 시험 넷(도는 시험 틀이 옮겨 간다)과 변이 카드 다섯(잡히면 뒤집힌다).
 * 아래: 계기 넷의 막대(차오르고, 판 머리에서 내려앉는다). 가장 깊이 가득 찬 계기를 틀이 가리킨다.
 *
 * 무대는 셈하지 않는다 — 밟은 줄 · 결정 · 조건값 · 짝 · 잡힌 변이 · 계기 분수 · 가득 참은 모두 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 800;
const H = 470;

const CODE_Y = 36;
const CODE_ROW = 28;
const LEFT_X = 12;
const LEFT_W = 412;
const RIGHT_X = 440;
const RIGHT_W = 348;
const TEST_Y = 36;
const TEST_ROW = 26;
const MUT_Y = 176;
const MUT_ROW = 28;
const METER_Y = 340;
const METER_ROW = 30;
const TRACK_X = 150;
const TRACK_W = 470;

export type MeterView = { hit: number; total: number; full: boolean };
export type MetersView = { lines: MeterView; branches: MeterView; pairs: MeterView; mutants: MeterView };

export type RoundStartView = {
  testCount: number;
  motionMs: number;
  fnName: string;
  lines: { no: number; text: string }[];
  decisionLine: number;
  conditions: { id: string; text: string }[];
  tests: { id: string; args: (number | boolean)[]; expect: number; active: boolean }[];
  mutants: { id: string; line: number; text: string }[];
  meters: MetersView;
};

export type StepLineView = {
  test: string;
  testIndex: number;
  line: number;
  f: number;
  decision: boolean | null;
  conditionValues: { id: string; value: boolean }[] | null;
  meters: MetersView;
};

export type VerdictView = {
  test: string;
  testIndex: number;
  result: number;
  killed: string[];
  pairs: { condition: string; pair: [string, string] | null }[];
  meters: MetersView;
};

export type BranchCoverageStage = {
  roundStart(p: RoundStartView, ms: number): void;
  stepLine(p: StepLineView, ms: number): void;
  verdict(p: VerdictView, ms: number): void;
};

const METER_KEYS = ['lines', 'branches', 'pairs', 'mutants'] as const;
type MeterKey = (typeof METER_KEYS)[number];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function move(node: SVGElement, x: number, y: number, ms: number): void {
  node.style.transition = `transform ${ms}ms ease-in-out`;
  node.style.transform = `translate(${x}px, ${y}px)`;
}

export const branchCoverageStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const sm = fontSizes.sm;
    const xs = fontSizes.xs;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const root = el('g', {}, svg);

    type LineRow = { no: number; mark: SVGRectElement };
    type TestRow = { id: string; status: SVGTextElement; call: SVGTextElement; idText: SVGTextElement };
    type MutRow = {
      id: string;
      flip: SVGGElement;
      box: SVGRectElement;
      texts: SVGTextElement[];
      status: SVGTextElement;
      killed: boolean;
    };
    type MeterRow = { fill: SVGRectElement; frac: SVGTextElement };

    let built = false;
    let lineRows: LineRow[] = [];
    let testRows: TestRow[] = [];
    let mutRows: MutRow[] = [];
    const meterRows = new Map<MeterKey, MeterRow>();
    const condRows = new Map<string, { value: SVGTextElement; pair: SVGTextElement }>();
    let branchCells: { value: boolean; box: SVGRectElement; label: SVGTextElement }[] = [];
    let execMarker: SVGGElement | null = null;
    let testMarker: SVGRectElement | null = null;
    let frontier: SVGRectElement | null = null;
    let stateText: SVGTextElement | null = null;
    let currentTest: string | null = null;

    const lineY = (no: number): number => {
      const i = lineRows.findIndex((r) => r.no === no);
      if (i < 0) throw new Error(`[branch-coverage-stage] 없는 줄 ${no}`);
      return CODE_Y + i * CODE_ROW;
    };

    const build = (p: RoundStartView): void => {
      while (root.firstChild) root.removeChild(root.firstChild);
      lineRows = [];
      testRows = [];
      mutRows = [];
      meterRows.clear();
      condRows.clear();
      branchCells = [];

      // 코드
      el('rect', { x: LEFT_X, y: CODE_Y - 4, width: LEFT_W, height: p.lines.length * CODE_ROW + 8, rx: 6, fill: c.bgSubtle, stroke: c.border }, root);
      execMarker = el('g', { opacity: 0 }, root);
      el('rect', { x: LEFT_X + 4, y: 0, width: LEFT_W - 8, height: CODE_ROW - 4, rx: 4, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 }, execMarker);
      el('path', { d: `M ${LEFT_X + 8} 6 L ${LEFT_X + 15} ${(CODE_ROW - 4) / 2} L ${LEFT_X + 8} ${CODE_ROW - 10} Z`, fill: c.primary }, execMarker);
      p.lines.forEach((ln, i) => {
        const y = CODE_Y + i * CODE_ROW + (CODE_ROW - 4) / 2;
        const mark = el('rect', { x: LEFT_X + 20, y: y - 5, width: 10, height: 10, rx: 2, fill: c.primary, opacity: 0 }, root);
        const no = el('text', { x: LEFT_X + 52, y, 'text-anchor': 'end', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': xs, fill: c.textMuted }, root);
        no.textContent = String(ln.no);
        const code = el('text', { x: LEFT_X + 64, y, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, fill: c.text }, root);
        code.textContent = ln.text;
        code.setAttribute('xml:space', 'preserve');
        code.style.whiteSpace = 'pre';
        lineRows.push({ no: ln.no, mark });
      });
      // 결정 줄 곁의 갈래 두 칸
      const dy = lineY(p.decisionLine) + (CODE_ROW - 4) / 2;
      [true, false].forEach((value, i) => {
        const x = LEFT_X + LEFT_W - 124 + i * 60;
        const box = el('rect', { x, y: dy - 10, width: 54, height: 20, rx: 4, fill: c.bg, stroke: c.border }, root);
        const label = el('text', { x: x + 27, y: dy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': xs, fill: c.textMuted }, root);
        label.textContent = String(value);
        branchCells.push({ value, box, label });
      });
      // 지금 상태 (f)
      const codeBottom = CODE_Y + p.lines.length * CODE_ROW + 4;
      stateText = el('text', { x: LEFT_X + 64, y: codeBottom + 20, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, fill: c.text }, root);
      // 조건
      const condHead = el('text', { x: LEFT_X, y: codeBottom + 52, 'font-family': fonts.body, 'font-size': sm, 'font-weight': 600, fill: c.textMuted }, root);
      condHead.textContent = t('label.conditions', 'Conditions');
      p.conditions.forEach((cd, i) => {
        const y = codeBottom + 76 + i * 26;
        const id = el('text', { x: LEFT_X + 8, y, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, 'font-weight': 700, fill: c.text }, root);
        id.textContent = cd.id;
        const tx = el('text', { x: LEFT_X + 32, y, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, fill: c.text }, root);
        tx.textContent = cd.text;
        const value = el('text', { x: LEFT_X + 176, y, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, fill: c.primary }, root);
        const pair = el('text', { x: LEFT_X + 250, y, 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': sm, fill: c.text }, root);
        condRows.set(cd.id, { value, pair });
      });

      // 시험
      const testHead = el('text', { x: RIGHT_X, y: TEST_Y - 12, 'font-family': fonts.body, 'font-size': sm, 'font-weight': 600, fill: c.textMuted }, root);
      testHead.textContent = t('label.tests', 'Tests');
      testMarker = el('rect', { x: RIGHT_X, y: 0, width: RIGHT_W, height: TEST_ROW - 4, rx: 4, fill: 'none', stroke: c.primary, 'stroke-width': 1.5, opacity: 0 }, root);
      p.tests.forEach((tc, i) => {
        const y = TEST_Y + i * TEST_ROW + (TEST_ROW - 4) / 2;
        const idText = el('text', { x: RIGHT_X + 10, y, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, 'font-weight': 700, fill: c.text }, root);
        idText.textContent = tc.id;
        const call = el('text', { x: RIGHT_X + 40, y, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, fill: c.text }, root);
        call.textContent = `${p.fnName}(${tc.args.map((a) => String(a)).join(', ')}) == ${tc.expect}`;
        const status = el('text', { x: RIGHT_X + RIGHT_W - 8, y, 'text-anchor': 'end', 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': xs, fill: c.textMuted }, root);
        testRows.push({ id: tc.id, status, call, idText });
      });

      // 변이 카드
      const mutHead = el('text', { x: RIGHT_X, y: MUT_Y - 12, 'font-family': fonts.body, 'font-size': sm, 'font-weight': 600, fill: c.textMuted }, root);
      mutHead.textContent = t('label.mutants', 'Mutants');
      p.mutants.forEach((m, i) => {
        const y0 = MUT_Y + i * MUT_ROW;
        const flip = el('g', {}, root);
        flip.style.transformBox = 'fill-box';
        flip.style.transformOrigin = 'center';
        const box = el('rect', { x: RIGHT_X, y: y0, width: RIGHT_W, height: MUT_ROW - 4, rx: 4, fill: c.bg, stroke: c.border }, flip);
        const cy = y0 + (MUT_ROW - 4) / 2;
        const id = el('text', { x: RIGHT_X + 10, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, 'font-weight': 700, fill: c.text }, flip);
        id.textContent = m.id;
        const where = el('text', { x: RIGHT_X + 40, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': xs, fill: c.textMuted }, flip);
        where.textContent = t('label.line', 'line {n}', { n: m.line });
        const code = el('text', { x: RIGHT_X + 84, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': xs, fill: c.text }, flip);
        code.textContent = m.text;
        code.setAttribute('xml:space', 'preserve');
        code.style.whiteSpace = 'pre';
        const status = el('text', { x: RIGHT_X + RIGHT_W - 8, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': xs, fill: c.textMuted }, flip);
        mutRows.push({ id: m.id, flip, box, texts: [id, where, code], status, killed: false });
      });

      // 계기 막대
      frontier = el('rect', { x: LEFT_X, y: 0, width: W - 2 * LEFT_X, height: METER_ROW - 4, rx: 4, fill: 'none', stroke: c.primary, 'stroke-width': 1.5, opacity: 0 }, root);
      const names: Record<MeterKey, string> = {
        lines: t('label.lines', 'Lines'),
        branches: t('label.branches', 'Branches'),
        pairs: t('label.pairs', 'Condition pairs'),
        mutants: t('label.mutationScore', 'Mutation score'),
      };
      METER_KEYS.forEach((k, i) => {
        const cy = METER_Y + i * METER_ROW + (METER_ROW - 4) / 2;
        const name = el('text', { x: LEFT_X + 10, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': sm, fill: c.text }, root);
        name.textContent = names[k];
        el('rect', { x: TRACK_X, y: cy - 6, width: TRACK_W, height: 12, rx: 3, fill: c.bgSubtle, stroke: c.border }, root);
        const fill = el('rect', { x: TRACK_X, y: cy - 6, width: TRACK_W, height: 12, rx: 3, fill: c.textMuted }, root);
        fill.style.transformBox = 'fill-box';
        fill.style.transformOrigin = 'left center';
        fill.style.transform = 'scaleX(0)';
        const frac = el('text', { x: TRACK_X + TRACK_W + 14, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': sm, fill: c.text }, root);
        meterRows.set(k, { fill, frac });
      });
      built = true;
    };

    const meterRow = (k: MeterKey): MeterRow => {
      const r = meterRows.get(k);
      if (!r) throw new Error(`[branch-coverage-stage] 계기 ${k} 없음`);
      return r;
    };

    const showMeters = (m: MetersView, ms: number): void => {
      let deepest = -1;
      METER_KEYS.forEach((k, i) => {
        const v = m[k];
        if (v.total <= 0) throw new Error(`[branch-coverage-stage] 계기 ${k} 의 분모가 0`);
        const r = meterRow(k);
        r.fill.style.transition = `transform ${ms}ms ease-out, fill ${ms}ms`;
        r.fill.style.transform = `scaleX(${v.hit / v.total})`;
        r.fill.setAttribute('fill', v.full ? c.primary : c.textMuted);
        r.frac.textContent = `${v.hit}/${v.total}`;
        if (v.full) deepest = i;
      });
      if (!frontier) throw new Error('[branch-coverage-stage] 틀 없음');
      if (deepest < 0) {
        frontier.setAttribute('opacity', '0');
      } else {
        frontier.setAttribute('opacity', '1');
        move(frontier, 0, METER_Y + deepest * METER_ROW, ms);
      }
    };

    const testRow = (id: string): TestRow => {
      const r = testRows.find((x) => x.id === id);
      if (!r) throw new Error(`[branch-coverage-stage] 없는 시험 ${id}`);
      return r;
    };

    const paintCard = (r: MutRow, killedBy: string | null): void => {
      r.killed = killedBy !== null;
      if (killedBy === null) {
        r.box.setAttribute('fill', c.bg);
        r.box.setAttribute('stroke', c.border);
        for (const tx of r.texts) tx.setAttribute('fill', c.text);
        r.status.setAttribute('fill', c.textMuted);
        r.status.textContent = t('label.survived', 'survived');
      } else {
        r.box.setAttribute('fill', c.primary);
        r.box.setAttribute('stroke', c.primary);
        for (const tx of r.texts) tx.setAttribute('fill', c.textInverse);
        r.status.setAttribute('fill', c.textInverse);
        r.status.textContent = t('label.killed', 'killed ← {test}', { test: killedBy });
      }
    };

    /** 카드를 뒤집는다 — 반쯤 접힌 자리에서 앞면을 바꾼다. */
    const flipTo = (r: MutRow, killedBy: string | null, ms: number): void => {
      const half = Math.max(1, Math.round(ms / 2));
      r.killed = killedBy !== null;
      r.flip.style.transition = `transform ${half}ms ease-in`;
      r.flip.style.transform = 'scaleY(0)';
      later(() => {
        paintCard(r, killedBy);
        r.flip.style.transition = `transform ${half}ms ease-out`;
        r.flip.style.transform = 'scaleY(1)';
      }, half);
    };

    const api: BranchCoverageStage = {
      roundStart(p, ms) {
        if (!built) build(p);
        if (!execMarker || !testMarker || !stateText) throw new Error('[branch-coverage-stage] 무대가 서지 않았다');
        // 앞 판의 결론을 걷는다 — 자리는 남기고 표지는 지운다
        execMarker.setAttribute('opacity', '0');
        testMarker.setAttribute('opacity', '0');
        stateText.textContent = '';
        currentTest = null;
        for (const r of lineRows) r.mark.setAttribute('opacity', '0');
        for (const b of branchCells) {
          b.box.setAttribute('fill', c.bg);
          b.box.setAttribute('stroke', c.border);
          b.label.setAttribute('fill', c.textMuted);
        }
        for (const cr of condRows.values()) {
          cr.value.textContent = '';
          cr.pair.textContent = '';
        }
        p.tests.forEach((tc) => {
          const r = testRow(tc.id);
          const ink = tc.active ? c.text : c.textMuted;
          r.idText.setAttribute('fill', ink);
          r.call.setAttribute('fill', ink);
          r.call.setAttribute('opacity', tc.active ? '1' : '0.5');
          r.status.setAttribute('fill', c.textMuted);
          r.status.textContent = tc.active ? t('label.waiting', 'waiting') : t('label.unused', 'not used');
        });
        // 앞 판에서 도중이던 뒤집기를 멈추고, 잡혔던 카드는 다시 세운다
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const r of mutRows) {
          if (r.killed) flipTo(r, null, ms);
          else {
            r.flip.style.transform = 'scaleY(1)';
            paintCard(r, null);
          }
        }
        showMeters(p.meters, ms);
      },
      stepLine(p, ms) {
        if (!execMarker || !testMarker || !stateText) throw new Error('[branch-coverage-stage] 무대가 서지 않았다');
        const y = lineY(p.line);
        execMarker.setAttribute('opacity', '1');
        move(execMarker, 0, y, ms);
        testMarker.setAttribute('opacity', '1');
        move(testMarker, 0, TEST_Y + p.testIndex * TEST_ROW, ms);
        const row = lineRows.find((r) => r.no === p.line);
        if (!row) throw new Error(`[branch-coverage-stage] 없는 줄 ${p.line}`);
        row.mark.setAttribute('opacity', '1');
        const tr = testRow(p.test);
        if (currentTest !== p.test) {
          // 새 시험 — 앞 시험의 조건값을 걷는다 (짝은 누적이라 남는다)
          currentTest = p.test;
          for (const cr of condRows.values()) cr.value.textContent = '';
        }
        tr.status.setAttribute('fill', c.primary);
        tr.status.textContent = t('label.running', 'running');
        stateText.textContent = t('caption.state', 'f = {f}', { f: p.f });
        if (p.decision !== null) {
          const cell = branchCells.find((b) => b.value === p.decision);
          if (!cell) throw new Error('[branch-coverage-stage] 갈래 칸 없음');
          cell.box.setAttribute('fill', c.primary);
          cell.box.setAttribute('stroke', c.primary);
          cell.label.setAttribute('fill', c.textInverse);
        }
        if (p.conditionValues !== null) {
          for (const cv of p.conditionValues) {
            const cr = condRows.get(cv.id);
            if (!cr) throw new Error(`[branch-coverage-stage] 없는 조건 ${cv.id}`);
            cr.value.textContent = String(cv.value);
          }
        }
        showMeters(p.meters, ms);
      },
      verdict(p, ms) {
        const tr = testRow(p.test);
        tr.status.setAttribute('fill', c.text);
        tr.status.textContent = t('label.passed', 'pass: {result}', { result: p.result });
        for (const id of p.killed) {
          const r = mutRows.find((x) => x.id === id);
          if (!r) throw new Error(`[branch-coverage-stage] 없는 변이 ${id}`);
          flipTo(r, p.test, ms);
        }
        for (const pr of p.pairs) {
          const cr = condRows.get(pr.condition);
          if (!cr) throw new Error(`[branch-coverage-stage] 없는 조건 ${pr.condition}`);
          cr.pair.textContent =
            pr.pair === null ? t('label.noPair', 'no pair') : t('label.pair', 'pair {pair}', { pair: pr.pair.join('-') });
        }
        showMeters(p.meters, ms);
      },
    };

    return {
      ...api,
      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
  },
};
