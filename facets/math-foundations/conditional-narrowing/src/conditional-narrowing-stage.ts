/**
 * conditional-narrowing 무대.
 *
 * 왼쪽은 결과의 세상 — 가로가 첫 눈 a, 세로가 둘째 눈 b (위가 큰 눈). 굵은 테두리가 지금의 세상이다.
 * B 를 알게 되면 테두리의 왼쪽 벽이 B 의 첫 열까지 밀려오고, 그 밖의 결과가 차례대로 떨어져 나간다.
 * 떠난 자리엔 점선 자국만 남는다 (A 였던 자국은 강조색).
 * 오른쪽은 몫 — 분수와, 분모만큼 쪼갠 띠. 세상이 줄면 두 번째 띠의 칸 수가 하나씩 줄어든다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ConditionalNarrowingScene, Share } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

const TOP = 26;
const BOTTOM_CAPTION = 56;
const TICK_ROW = 18;
const AXIS_ROW = 16;
const GRID_LEFT = 46;
const CELL_MAX = 40;
const PANEL_GAP = 30;
const RIGHT_PAD = 16;

const MARK_MS = 600;
const LEAVE_MS = 1400;
const RECOUNT_MS = 600;
const ANSWER_MS = 500;
const TICK_MS = 16;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function make<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = parent.ownerDocument.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function word(parent: Element, x: number, y: number, s: string, attrs: Attrs): SVGTextElement {
  const node = make(parent, 'text', { x, y, ...attrs });
  node.textContent = s;
  return node;
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

type Geometry = {
  cell: number;
  gridTop: number;
  gridBottom: number;
  panelX: number;
  panelRight: number;
};

function geometry(faces: number): Geometry {
  const avail = H - TOP - TICK_ROW - AXIS_ROW - BOTTOM_CAPTION;
  const cell = Math.min(CELL_MAX, Math.floor(avail / faces));
  const gridTop = TOP;
  const gridBottom = gridTop + cell * faces;
  const panelX = GRID_LEFT + cell * faces + PANEL_GAP;
  return { cell, gridTop, gridBottom, panelX, panelRight: PIECE_CANVAS_W - RIGHT_PAD };
}

/** 결과 (a, b) 칸의 왼쪽 위. 위가 큰 b. */
function cellXY(g: Geometry, faces: number, a: number, b: number): { x: number; y: number } {
  return { x: GRID_LEFT + (a - 1) * g.cell, y: g.gridTop + (faces - b) * g.cell };
}

type Handles = {
  cells: Map<number, SVGGElement>;
  cellRects: Map<number, SVGRectElement>;
  cellWords: Map<number, SVGTextElement>;
  badges: Map<number, SVGGElement>;
  ghosts: Map<number, SVGRectElement>;
  frame: SVGRectElement | null;
  worldLabel: SVGTextElement | null;
  motion: SVGGElement | null;
  rows: Map<1 | 2, RowHandles>;
};

type RowHandles = {
  numer: SVGTextElement;
  numerSlot: SVGRectElement;
  denom: SVGTextElement;
  pct: SVGTextElement | null;
  track: SVGGElement;
  x: number;
  width: number;
  y: number;
};

export const conditionalNarrowingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    let h: Handles = emptyHandles();

    function emptyHandles(): Handles {
      return {
        cells: new Map(),
        cellRects: new Map(),
        cellWords: new Map(),
        badges: new Map(),
        ghosts: new Map(),
        frame: null,
        worldLabel: null,
        motion: null,
        rows: new Map(),
      };
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 한 시계로 흘린다. frame(경과 ms) 을 부르고, 세대가 바뀌면 멈춘다. */
    async function flow(duration: number, mine: number, frame: (ms: number) => void): Promise<boolean> {
      let elapsed = 0;
      frame(0);
      while (elapsed < duration) {
        await wait(TICK_MS);
        if (mine !== gen || destroyed) return false;
        elapsed = Math.min(duration, elapsed + TICK_MS);
        frame(elapsed);
      }
      return true;
    }

    function badge(parent: Element, x: number, y: number, n: number): SVGGElement {
      const g = make(parent, 'g', { transform: `translate(${r2(x)},${r2(y)})` });
      make(g, 'circle', { cx: 0, cy: 0, r: 7, fill: colors.text });
      word(g, 0, 3.5, String(n), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: colors.textInverse,
      });
      return g;
    }

    function drawSegments(row: RowHandles, den: number, filled: number): void {
      row.track.textContent = '';
      if (den <= 0) throw new Error('conditional-narrowing stage: 띠의 분모가 0 이하다');
      const gap = den > 24 ? 1 : 2;
      const w = (row.width - gap * (den - 1)) / den;
      for (let k = 0; k < den; k += 1) {
        const on = k < filled;
        make(row.track, 'rect', {
          x: row.x + k * (w + gap),
          y: row.y,
          width: w,
          height: 12,
          rx: 1.5,
          fill: on ? colors.accent : colors.bgSubtle,
          stroke: on ? colors.accent : colors.border,
          'stroke-width': 1,
        });
      }
    }

    function drawRow(
      which: 1 | 2,
      y: number,
      g: Geometry,
      label: string,
      numer: number | null,
      den: number,
      pct: number | null,
      emphasizeDen: boolean,
    ): RowHandles {
      const layer = make(svg, 'g', {});
      const x0 = g.panelX;
      word(layer, x0, y + 5, label, {
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        fill: colors.text,
      });
      const fx = x0 + 112;
      word(layer, fx - 22, y + 5, '=', {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        fill: colors.textMuted,
      });
      const numerSlot = make(layer, 'rect', {
        x: fx - 12,
        y: y - 24,
        width: 24,
        height: 18,
        rx: 3,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-dasharray': '3 3',
        visibility: numer === null ? 'visible' : 'hidden',
      });
      const numerNode = word(layer, fx, y - 9, numer === null ? '' : String(numer), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        fill: colors.text,
      });
      make(layer, 'line', { x1: fx - 16, x2: fx + 16, y1: y, y2: y, stroke: colors.text, 'stroke-width': 1.5 });
      if (emphasizeDen) {
        make(layer, 'rect', { x: fx - 16, y: y + 4, width: 32, height: 20, rx: 3, fill: colors.accent });
      }
      const denom = word(layer, fx, y + 19, String(den), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        fill: emphasizeDen ? colors.stateInk : colors.text,
      });
      const pctNode =
        pct === null
          ? null
          : word(layer, fx + 26, y + 5, t('fmt.pct', '= {p}%', { p: pct.toFixed(1) }), {
              'font-family': fonts.body,
              'font-size': fontSizes.lg,
              fill: colors.text,
            });
      const track = make(layer, 'g', {});
      const row: RowHandles = {
        numer: numerNode,
        numerSlot,
        denom,
        pct: pctNode,
        track,
        x: x0,
        width: g.panelRight - x0,
        y: y + 34,
      };
      drawSegments(row, den, numer ?? 0);
      h.rows.set(which, row);
      return row;
    }

    function pairText(s: ConditionalNarrowingScene, i: number): string {
      const o = s.outcomes[i];
      if (o === undefined) throw new Error(`conditional-narrowing stage: 결과 번호 ${i} 가 없다`);
      return t('fmt.pair', '({a}, {b})', { a: o.a, b: o.b });
    }

    function drawStatic(s: ConditionalNarrowingScene): void {
      svg.textContent = '';
      h = emptyHandles();
      const g = geometry(s.faces);
      const departed = new Set(s.departed ?? []);
      const departedA = new Set(s.departedA ?? []);
      const marked = new Set(s.markedA ?? []);

      // 축
      for (let a = 1; a <= s.faces; a += 1) {
        word(svg, GRID_LEFT + (a - 0.5) * g.cell, g.gridBottom + 14, String(a), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }
      for (let b = 1; b <= s.faces; b += 1) {
        word(svg, GRID_LEFT - 8, g.gridTop + (s.faces - b + 0.5) * g.cell + 4, String(b), {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }
      word(svg, GRID_LEFT + (s.faces * g.cell) / 2, g.gridBottom + TICK_ROW + 12, t('axis.first', 'first roll a'), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      const midY = (g.gridTop + g.gridBottom) / 2;
      word(svg, 0, 0, t('axis.second', 'second roll b'), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        transform: `translate(14,${r2(midY)}) rotate(-90)`,
      });

      // 떠난 자국
      for (const i of departed) {
        const o = s.outcomes[i];
        if (o === undefined) throw new Error(`conditional-narrowing stage: departed 의 번호 ${i} 가 없다`);
        const p = cellXY(g, s.faces, o.a, o.b);
        const ghost = make(svg, 'rect', {
          x: p.x + 3,
          y: p.y + 3,
          width: g.cell - 6,
          height: g.cell - 6,
          rx: 3,
          fill: 'none',
          stroke: departedA.has(i) ? colors.accent : colors.border,
          'stroke-width': departedA.has(i) ? 1.5 : 1,
          'stroke-dasharray': '3 3',
        });
        h.ghosts.set(i, ghost);
      }

      // 남은 결과
      const badgeOrder = s.recounted ?? (s.departed === null ? s.markedA : null);
      const badgeIndex = new Map<number, number>();
      (badgeOrder ?? []).forEach((i, k) => badgeIndex.set(i, k + 1));
      s.outcomes.forEach((o, i) => {
        if (departed.has(i)) return;
        const p = cellXY(g, s.faces, o.a, o.b);
        const cg = make(svg, 'g', { transform: 'translate(0,0)' });
        const isA = marked.has(i);
        const rect = make(cg, 'rect', {
          x: p.x + 2,
          y: p.y + 2,
          width: g.cell - 4,
          height: g.cell - 4,
          rx: 4,
          fill: isA ? colors.accent : colors.bgSubtle,
          stroke: isA ? colors.accent : colors.border,
          'stroke-width': 1,
        });
        const w = word(cg, p.x + g.cell / 2, p.y + g.cell / 2 + xsPx * 0.35, t('fmt.cell', '{a},{b}', { a: o.a, b: o.b }), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: isA ? colors.stateInk : colors.textMuted,
        });
        h.cells.set(i, cg);
        h.cellRects.set(i, rect);
        h.cellWords.set(i, w);
        const n = badgeIndex.get(i);
        if (n !== undefined) h.badges.set(i, badge(cg, p.x + g.cell - 5, p.y + 5, n));
      });

      // 세상의 테두리
      const kept = s.outcomes.filter((_, i) => !departed.has(i));
      const minA = Math.min(...kept.map((o) => o.a));
      const left = GRID_LEFT + (minA - 1) * g.cell;
      const right = GRID_LEFT + s.faces * g.cell;
      h.frame = make(svg, 'rect', {
        x: left,
        y: g.gridTop,
        width: right - left,
        height: g.gridBottom - g.gridTop,
        rx: 5,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2.5,
      });
      h.worldLabel = word(svg, right, g.gridTop - 8, t('label.world', 'World: {n}', { n: s.world }), {
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.text,
      });

      // 사건 이름
      const lx = g.panelX;
      make(svg, 'rect', { x: lx, y: TOP - 2, width: 12, height: 12, rx: 2, fill: colors.accent });
      word(svg, lx + 18, TOP + 8, t('label.sumAtLeast', '{sym}: the two rolls sum to at least {n}', { sym: s.symbolA, n: s.sumAtLeast }), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      make(svg, 'rect', {
        x: lx + 1,
        y: TOP + 21,
        width: 10,
        height: 10,
        rx: 2,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });
      word(svg, lx + 18, TOP + 30, t('label.firstAtLeast', '{sym}: the first roll is at least {n}', { sym: s.symbolB, n: s.firstAtLeast }), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: s.departed === null ? colors.textMuted : colors.text,
      });

      // 몫
      const answered = s.shareGiven !== null;
      if (s.shareA !== null) {
        drawRow(1, 106, g, t('label.pA', 'P({a})', { a: s.symbolA }), s.shareA.num, s.shareA.den, s.shareA.pct, answered);
      }
      if (s.departed !== null) {
        const given: Share | null = s.shareGiven;
        drawRow(
          2,
          190,
          g,
          t('label.pGiven', 'P({a} | {b})', { a: s.symbolA, b: s.symbolB }),
          s.recounted === null ? null : s.recounted.length,
          s.world,
          given === null ? null : given.pct,
          answered,
        );
      }

      // 캡션
      const cy = H - 34;
      const cap = (line: string, y: number, strong: boolean): void => {
        word(svg, PIECE_CANVAS_W / 2, y, line, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': strong ? fontSizes.md : fontSizes.sm,
          'font-weight': strong ? 600 : 400,
          fill: strong ? colors.text : colors.textMuted,
        });
      };
      const step = s.step;
      switch (step.kind) {
        case 'world':
          cap(t('caption.world', 'Two rolls of one die. Outcomes: {n}', { n: s.outcomes.length }), cy, true);
          break;
        case 'markA':
          cap(t('caption.markA', 'Mark {a}. Outcomes in it: {n}', { a: s.symbolA, n: step.members.length }), cy, true);
          break;
        case 'leave': {
          cap(t('caption.leave', 'Now {b} is known. Outcomes outside {b} leave: {n}', { b: s.symbolB, n: step.leaving.length }), cy, true);
          if (step.leavingA.length > 0) {
            const pairs = step.leavingA.map((i) => pairText(s, i)).join(' ');
            cap(t('caption.leaveA', 'Leaving from {a} as well: {pairs}', { a: s.symbolA, pairs }), cy + 20, false);
          }
          break;
        }
        case 'recount':
          cap(t('caption.recount', 'Count {a} again inside the remaining world: {n}', { a: s.symbolA, n: step.members.length }), cy, true);
          break;
        case 'answer': {
          if (s.shareA === null || s.shareGiven === null) throw new Error('conditional-narrowing stage: answer 인데 몫이 없다');
          cap(t('caption.answer', 'The denominator changed: {from} → {to}', { from: s.shareA.den, to: s.shareGiven.den }), cy, true);
          break;
        }
      }

      h.motion = make(svg, 'g', {});
    }

    function mustRow(which: 1 | 2): RowHandles {
      const row = h.rows.get(which);
      if (row === undefined) throw new Error(`conditional-narrowing stage: 몫 줄 ${which} 가 없다`);
      return row;
    }

    async function moveMarkA(s: ConditionalNarrowingScene, members: number[], mine: number): Promise<void> {
      const row = mustRow(1);
      const each = 260;
      const lag = members.length > 1 ? (MARK_MS - each) / (members.length - 1) : 0;
      const den = s.shareA === null ? s.world : s.shareA.den;
      await flow(MARK_MS, mine, (ms) => {
        let counted = 0;
        members.forEach((i, k) => {
          const cg = h.cells.get(i);
          const rect = h.cellRects.get(i);
          const w = h.cellWords.get(i);
          const b = h.badges.get(i);
          if (!cg || !rect || !w || !b) throw new Error(`conditional-narrowing stage: A 칸 ${i} 의 손잡이가 없다`);
          const u = (ms - k * lag) / each;
          const on = u >= 0;
          if (on) counted += 1;
          rect.setAttribute('fill', on ? colors.accent : colors.bgSubtle);
          rect.setAttribute('stroke', on ? colors.accent : colors.border);
          w.setAttribute('fill', on ? colors.stateInk : colors.textMuted);
          const lift = on && u < 1 ? -6 * Math.sin(Math.PI * u) : 0;
          cg.setAttribute('transform', `translate(0,${r2(lift)})`);
          b.setAttribute('visibility', on ? 'visible' : 'hidden');
        });
        row.numer.textContent = String(counted);
        drawSegments(row, den, counted);
      });
    }

    async function moveLeave(
      s: ConditionalNarrowingScene,
      leaving: number[],
      from: number,
      mine: number,
    ): Promise<void> {
      const g = geometry(s.faces);
      const layer = h.motion;
      const frame = h.frame;
      const label = h.worldLabel;
      if (!layer || !frame || !label) throw new Error('conditional-narrowing stage: 떠남의 손잡이가 없다');
      const row = mustRow(2);
      const marked = new Set(s.markedA ?? []);
      const each = 440;
      const lag = leaving.length > 1 ? (LEAVE_MS - each) / (leaving.length - 1) : 0;
      const copies = leaving.map((i) => {
        const o = s.outcomes[i];
        if (o === undefined) throw new Error(`conditional-narrowing stage: 떠나는 번호 ${i} 가 없다`);
        const p = cellXY(g, s.faces, o.a, o.b);
        const cg = make(layer, 'g', {});
        const isA = marked.has(i);
        make(cg, 'rect', {
          x: p.x + 2,
          y: p.y + 2,
          width: g.cell - 4,
          height: g.cell - 4,
          rx: 4,
          fill: isA ? colors.accent : colors.bgSubtle,
          stroke: isA ? colors.accent : colors.border,
          'stroke-width': 1,
        });
        word(cg, p.x + g.cell / 2, p.y + g.cell / 2 + xsPx * 0.35, t('fmt.cell', '{a},{b}', { a: o.a, b: o.b }), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: isA ? colors.stateInk : colors.textMuted,
        });
        const ghost = h.ghosts.get(i);
        if (!ghost) throw new Error(`conditional-narrowing stage: 떠난 자국 ${i} 가 없다`);
        return { cg, ghost };
      });
      const kept = s.outcomes.filter((_, i) => !leaving.includes(i));
      const endLeft = GRID_LEFT + (Math.min(...kept.map((o) => o.a)) - 1) * g.cell;
      const right = GRID_LEFT + s.faces * g.cell;
      await flow(LEAVE_MS, mine, (ms) => {
        let gone = 0;
        copies.forEach(({ cg, ghost }, k) => {
          const u = (ms - k * lag) / each;
          if (u >= 0) gone += 1;
          const e = ease(u);
          cg.setAttribute('transform', `translate(0,${r2(44 * e)})`);
          cg.setAttribute('opacity', String(r2(1 - e)));
          ghost.setAttribute('visibility', u >= 0 ? 'visible' : 'hidden');
        });
        const left = GRID_LEFT + (endLeft - GRID_LEFT) * ease(ms / LEAVE_MS);
        frame.setAttribute('x', String(r2(left)));
        frame.setAttribute('width', String(r2(right - left)));
        const now = from - gone;
        label.textContent = t('label.world', 'World: {n}', { n: now });
        row.denom.textContent = String(now);
        drawSegments(row, now, 0);
      });
    }

    async function moveRecount(s: ConditionalNarrowingScene, members: number[], mine: number): Promise<void> {
      const row = mustRow(2);
      const den = s.world;
      const each = 220;
      const lag = members.length > 1 ? (RECOUNT_MS - each) / (members.length - 1) : 0;
      await flow(RECOUNT_MS, mine, (ms) => {
        let counted = 0;
        members.forEach((i, k) => {
          const b = h.badges.get(i);
          if (!b) throw new Error(`conditional-narrowing stage: 다시 센 칸 ${i} 의 표가 없다`);
          const u = (ms - k * lag) / each;
          if (u >= 0) counted += 1;
          const e = ease(u);
          b.setAttribute('visibility', u >= 0 ? 'visible' : 'hidden');
          b.setAttribute('opacity', String(r2(e)));
        });
        row.numer.textContent = counted === 0 ? '' : String(counted);
        row.numerSlot.setAttribute('visibility', counted === 0 ? 'visible' : 'hidden');
        drawSegments(row, den, counted);
      });
    }

    async function moveAnswer(mine: number): Promise<void> {
      const rows = [mustRow(1), mustRow(2)];
      await flow(ANSWER_MS, mine, (ms) => {
        const e = ease(ms / ANSWER_MS);
        for (const row of rows) {
          if (!row.pct) throw new Error('conditional-narrowing stage: 몫의 백분율 글자가 없다');
          row.pct.setAttribute('transform', `translate(${r2(-18 * (1 - e))},0)`);
          row.pct.setAttribute('opacity', String(r2(e)));
        }
      });
    }

    return {
      async render(
        next: ConditionalNarrowingScene,
        prev: ConditionalNarrowingScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || prev === null) return;
        const step = next.step;
        switch (step.kind) {
          case 'world':
            return;
          case 'markA':
            await moveMarkA(next, step.members, mine);
            break;
          case 'leave':
            await moveLeave(next, step.leaving, step.from, mine);
            break;
          case 'recount':
            await moveRecount(next, step.members, mine);
            break;
          case 'answer':
            await moveAnswer(mine);
            break;
        }
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
