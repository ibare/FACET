/**
 * backprop 무대 — 망 도식 · 두 곱셈 막대 · 무게마다 두 기울기(역전파 눈금 + 밀어 본 표지).
 *
 * 운동
 *   - 폭을 돌리면 은닉 단위가 자라 나오거나 줄어 사라진다. 이미 있던 단위는 제자리이고, 입력 · 출력 마디가
 *     쓰이는 단위들의 가운데로 옮겨 간다.
 *   - 두 곱셈 막대가 걸음을 따라 따로 자란다 (눈금은 사다리 전체로 고정 — 알고리즘이 싣는다).
 *   - 밀어 본 기울기의 표지(▲)는 앞 판의 자리에서 이 판의 자리로 미끄러진다 — ε 를 줄이면 역전파 눈금 쪽으로 다가간다.
 *
 * 무대는 셈하지 않는다 — 켜짐 · 기울기 · 표지의 자리(n − g) · 가장 큰 어긋남과 그 자리 · 배 · 눈금은 모두 payload 로 받는다.
 * 요소는 마운트 때 단위 스물넷 · 무게 일흔둘 자리만큼 한 번 짓고, 걸음은 속성만 바꾼다 (되짚어도 늘지 않는다).
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { WeightKind } from './algorithm.js';

// ── projector 와 맞추는 표면 ────────────────────────────────────────────────

export type StageUnit = { id: string };
export type NetView = {
  width: number;
  nudge: number;
  weightCount: number;
  x1: number;
  x2: number;
  y: number;
  barMax: number;
  gapScale: number;
  units: StageUnit[];
};
export type ForwardView = { on: boolean[]; yHat: number; loss: number; backpropMults: number };
export type BackwardView = { d: number; grads: Record<WeightKind, number>[]; backpropMults: number };
export type NudgeView = { weight: WeightKind; offsets: number[]; nudgeMults: number };
export type CompareView = {
  maxGap: number;
  gapDigits: number;
  maxUnit: number;
  maxWeight: WeightKind;
  ratio: number;
};

export type BackpropStage = ViewInstance & {
  showNet(p: NetView, durMs: number): void;
  showForward(p: ForwardView, durMs: number): void;
  showBackward(p: BackwardView, durMs: number): void;
  showNudge(p: NudgeView, durMs: number): void;
  showCompare(p: CompareView, durMs: number): void;
  reset(): void;
};

// ── 자리 ──────────────────────────────────────────────────────────────────

const W = 780;
const H = 668;
const SVG_NS = 'http://www.w3.org/2000/svg';

const BAR_X0 = 112;
const BAR_W = 560;
const BAR_Y = [30, 52];
const BAR_H = 14;

const ROW_Y0 = 142;
const ROW_DY = 18;
const rowY = (j: number): number => ROW_Y0 + j * ROW_DY;

const IN_X = 44;
const UNIT_X = 150;
const OUT_X = 236;
const IO_R = 11;
const UNIT_R = 6;
const IN_GAP = 22;

const ROW_LABEL_X = 268;
const GROUP_X = [300, 458, 616];
const GAUGE_LEN = 90;
const COLS: readonly WeightKind[] = ['wa', 'wb', 'w2'];
const originX = (col: number): number => GROUP_X[col]! + 60;

const STATS_Y = [584, 606];
const LEGEND_Y = 630;
const CAPTION_Y = 656;

type Attrs = Record<string, string | number>;

export const backpropStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const xs = parseFloat(fontSizes.xs);
    const sm = parseFloat(fontSizes.sm);

    const init = params.initialData;
    const slots = init && Array.isArray(init['w2']) ? (init['w2'] as unknown[]).length : 0;

    const el = (tag: string, attrs: Attrs, parent: Element): SVGElement => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
      parent.appendChild(e);
      return e;
    };
    const text = (attrs: Attrs, parent: Element, size = xs, family: string = fonts.body): SVGElement =>
      el('text', { 'font-family': family, 'font-size': size, fill: c.text, 'xml:space': 'preserve', ...attrs }, parent);

    const root = el('g', {}, svg);

    // ── 운동 — 이름마다 하나씩, 새 운동이 오면 앞 것을 끝낸다
    let destroyed = false;
    const tweens = new Map<string, { raf: number; finish: () => void }>();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    const animate = (key: string, durMs: number, draw: (k: number) => void, after?: () => void): void => {
      tweens.get(key)?.finish();
      if (destroyed || isInstant() || durMs <= 0 || raf === null) {
        draw(1);
        after?.();
        return;
      }
      const start = performance.now();
      const rec = { raf: 0, finish: () => {} };
      rec.finish = () => {
        cancelAnimationFrame(rec.raf);
        tweens.delete(key);
        draw(1);
        after?.();
      };
      const tick = (now: number): void => {
        const k = Math.min(1, (now - start) / durMs);
        if (k >= 1) {
          rec.finish();
          return;
        }
        draw(ease(k));
        rec.raf = raf(tick);
      };
      tweens.set(key, rec);
      rec.raf = raf(tick);
    };
    const finishAll = (): void => {
      for (const rec of [...tweens.values()]) rec.finish();
    };
    params.onScrubStart?.(finishAll);

    // ── 곱셈 막대
    const multsTitle = text({ x: 16, y: 20, fill: c.textMuted }, root);
    multsTitle.textContent = t('label.mults', 'Multiplications so far');
    const weightCountText = text({ x: W - 16, y: 20, 'text-anchor': 'end', fill: c.textMuted }, root);
    const barLabels = [text({ x: 16, y: BAR_Y[0]! + BAR_H - 3 }, root), text({ x: 16, y: BAR_Y[1]! + BAR_H - 3 }, root)];
    barLabels[0]!.textContent = t('label.backpropBar', 'Backprop');
    barLabels[1]!.textContent = t('label.nudgeBar', 'Nudging');
    for (const y of BAR_Y) el('rect', { x: BAR_X0, y, width: BAR_W, height: BAR_H, fill: c.bgSubtle, stroke: c.border }, root);
    const bars = [
      el('rect', { x: BAR_X0, y: BAR_Y[0]!, width: 0, height: BAR_H, fill: c.primary }, root),
      el('rect', { x: BAR_X0, y: BAR_Y[1]!, width: 0, height: BAR_H, fill: c.itemComparing }, root),
    ];
    const barTexts = [
      text({ x: BAR_X0 + 6, y: BAR_Y[0]! + BAR_H - 3 }, root, xs, fonts.mono),
      text({ x: BAR_X0 + 6, y: BAR_Y[1]! + BAR_H - 3 }, root, xs, fonts.mono),
    ];
    el('line', { x1: BAR_X0, y1: 72, x2: BAR_X0 + BAR_W, y2: 72, stroke: c.border }, root);
    el('line', { x1: BAR_X0, y1: 68, x2: BAR_X0, y2: 76, stroke: c.textMuted }, root);
    el('line', { x1: BAR_X0 + BAR_W, y1: 68, x2: BAR_X0 + BAR_W, y2: 76, stroke: c.textMuted }, root);
    const barTick0 = text({ x: BAR_X0, y: 88, 'text-anchor': 'middle', fill: c.textMuted }, root, xs, fonts.mono);
    const barTickMax = text({ x: BAR_X0 + BAR_W, y: 88, 'text-anchor': 'middle', fill: c.textMuted }, root, xs, fonts.mono);
    const barNow = [0, 0];
    let barMax = 0;
    const barWidth = (v: number): number => {
      if (!(barMax > 0)) throw new Error('backprop-stage: 막대 눈금이 아직 없다');
      return (v / barMax) * BAR_W;
    };
    const setBar = (i: number, value: number, durMs: number): void => {
      const from = barNow[i]!;
      barTexts[i]!.textContent = String(value);
      animate(`bar${i}`, durMs, (k) => {
        const v = from + (value - from) * k;
        const w = barWidth(v);
        bars[i]!.setAttribute('width', String(w));
        barTexts[i]!.setAttribute('x', String(BAR_X0 + w + 6));
        barNow[i] = v;
      });
    };

    // ── 기울기 칸 머리
    COLS.forEach((k, col) => {
      const h = text({ x: GROUP_X[col]! + 75, y: 108, 'text-anchor': 'middle' }, root, sm, fonts.mono);
      if (k === 'wa') h.textContent = t('label.gradWa', '∂L/∂wa');
      else if (k === 'wb') h.textContent = t('label.gradWb', '∂L/∂wb');
      else h.textContent = t('label.gradW2', '∂L/∂w2');
    });
    const gaugeTicks = COLS.map((_, col) => ({
      zero: text({ x: originX(col), y: 125, 'text-anchor': 'middle', fill: c.textMuted }, root, xs, fonts.mono),
      end: text({ x: originX(col) + GAUGE_LEN, y: 125, 'text-anchor': 'middle', fill: c.textMuted }, root, xs, fonts.mono),
    }));

    // ── 망
    const netLayer = el('g', {}, root);
    const inEdges: SVGElement[][] = [];
    const outEdges: SVGElement[] = [];
    const unitDots: SVGElement[] = [];
    for (let j = 0; j < slots; j++) {
      inEdges.push([
        el('line', { stroke: c.border, 'stroke-width': 1 }, netLayer),
        el('line', { stroke: c.border, 'stroke-width': 1 }, netLayer),
      ]);
      outEdges.push(el('line', { stroke: c.border, 'stroke-width': 1 }, netLayer));
    }
    for (let j = 0; j < slots; j++) {
      unitDots.push(el('circle', { cx: UNIT_X, cy: rowY(j), r: 0, fill: c.primary, stroke: c.primary, 'stroke-width': 1.2 }, netLayer));
    }
    const inDots = [
      el('circle', { cx: IN_X, r: IO_R, fill: c.bg, stroke: c.text, 'stroke-width': 1.4 }, netLayer),
      el('circle', { cx: IN_X, r: IO_R, fill: c.bg, stroke: c.text, 'stroke-width': 1.4 }, netLayer),
    ];
    const inLabels = [text({ x: IN_X, 'text-anchor': 'middle' }, netLayer, xs, fonts.mono), text({ x: IN_X, 'text-anchor': 'middle' }, netLayer, xs, fonts.mono)];
    const outDot = el('circle', { cx: OUT_X, r: IO_R, fill: c.bg, stroke: c.text, 'stroke-width': 1.4 }, netLayer);
    const outSym = text({ x: OUT_X, 'text-anchor': 'middle' }, netLayer, sm, fonts.mono);
    outSym.textContent = t('label.output', 'ŷ');
    const targetText = text({ x: OUT_X, 'text-anchor': 'middle', fill: c.textMuted }, netLayer, xs, fonts.mono);

    const grow = new Array<number>(slots).fill(0);
    let cy = rowY(0);
    let ioShown = false;
    const drawNet = (): void => {
      const vis = ioShown ? 'visible' : 'hidden';
      const inY = [cy - IN_GAP, cy + IN_GAP];
      for (let i = 0; i < 2; i++) {
        inDots[i]!.setAttribute('cy', String(inY[i]));
        inDots[i]!.setAttribute('visibility', vis);
        inLabels[i]!.setAttribute('visibility', vis);
      }
      inLabels[0]!.setAttribute('y', String(inY[0]! - IO_R - 5));
      inLabels[1]!.setAttribute('y', String(inY[1]! + IO_R + 13));
      outDot.setAttribute('cy', String(cy));
      outDot.setAttribute('visibility', vis);
      outSym.setAttribute('y', String(cy + 4));
      outSym.setAttribute('visibility', vis);
      targetText.setAttribute('y', String(cy + IO_R + 14));
      targetText.setAttribute('visibility', vis);
      for (let j = 0; j < slots; j++) {
        const g = grow[j]!;
        const uy = rowY(j);
        const show = g > 0.001 ? 'visible' : 'hidden';
        for (let i = 0; i < 2; i++) {
          const e = inEdges[j]![i]!;
          e.setAttribute('x1', String(IN_X));
          e.setAttribute('y1', String(inY[i]));
          e.setAttribute('x2', String(IN_X + (UNIT_X - IN_X) * g));
          e.setAttribute('y2', String(inY[i]! + (uy - inY[i]!) * g));
          e.setAttribute('visibility', show);
        }
        const o = outEdges[j]!;
        o.setAttribute('x1', String(UNIT_X));
        o.setAttribute('y1', String(uy));
        o.setAttribute('x2', String(UNIT_X + (OUT_X - UNIT_X) * g));
        o.setAttribute('y2', String(uy + (cy - uy) * g));
        o.setAttribute('visibility', show);
        unitDots[j]!.setAttribute('r', String(UNIT_R * g));
        unitDots[j]!.setAttribute('visibility', show);
        rows[j]!.g.setAttribute('opacity', String(g));
        rows[j]!.g.setAttribute('visibility', show);
      }
    };

    // ── 무게 칸 (단위마다 셋)
    type Cell = { value: SVGElement; marker: SVGElement };
    const rows: { g: SVGElement; label: SVGElement; cells: Record<WeightKind, Cell> }[] = [];
    for (let j = 0; j < slots; j++) {
      const g = el('g', { visibility: 'hidden' }, root);
      const y = rowY(j);
      const label = text({ x: ROW_LABEL_X, y: y + 4 }, g, xs, fonts.mono);
      const cells = {} as Record<WeightKind, Cell>;
      COLS.forEach((k, col) => {
        const ox = originX(col);
        el('line', { x1: ox - 6, y1: y + 3, x2: ox + GAUGE_LEN, y2: y + 3, stroke: c.border }, g);
        el('line', { x1: ox, y1: y - 5, x2: ox, y2: y + 6, stroke: c.text, 'stroke-width': 1.6 }, g);
        const value = text({ x: GROUP_X[col]! + 52, y: y + 4, 'text-anchor': 'end' }, g, xs, fonts.mono);
        const marker = el('path', { d: 'M0,-5 L4.5,3 L-4.5,3 Z', fill: c.itemComparing, visibility: 'hidden' }, g);
        cells[k] = { value, marker };
      });
      rows.push({ g, label, cells });
    }
    const ring = el('circle', { r: 0, fill: 'none', stroke: c.danger, 'stroke-width': 1.8, visibility: 'hidden' }, root);

    // ── 수 · 범례 · 캡션
    const stat = (x: number, y: number): SVGElement => text({ x, y }, root, sm, fonts.mono);
    const yHatText = stat(16, STATS_Y[0]!);
    const lossText = stat(210, STATS_Y[0]!);
    const dText = stat(440, STATS_Y[0]!);
    const maxGapText = stat(16, STATS_Y[1]!);
    const maxAtText = stat(210, STATS_Y[1]!);
    const ratioText = stat(440, STATS_Y[1]!);

    el('line', { x1: 16, y1: LEGEND_Y - 8, x2: 16, y2: LEGEND_Y + 3, stroke: c.text, 'stroke-width': 1.6 }, root);
    const lgBack = text({ x: 24, y: LEGEND_Y, fill: c.textMuted }, root);
    lgBack.textContent = t('label.legendBackprop', 'Backprop value');
    el('path', { d: 'M0,-5 L4.5,3 L-4.5,3 Z', transform: `translate(214, ${LEGEND_Y - 3})`, fill: c.itemComparing }, root);
    const lgNudge = text({ x: 224, y: LEGEND_Y, fill: c.textMuted }, root);
    el('circle', { cx: 436, cy: LEGEND_Y - 4, r: 4.5, fill: c.bg, stroke: c.textMuted, 'stroke-dasharray': '2 2' }, root);
    const lgOff = text({ x: 446, y: LEGEND_Y, fill: c.textMuted }, root);
    lgOff.textContent = t('label.legendOff', 'Off unit (z ≤ 0)');
    const lgAxis = text({ x: 616, y: LEGEND_Y, fill: c.textMuted }, root);
    lgAxis.textContent = t('label.gapAxis', '▲ minus backprop');
    const caption = text({ x: 16, y: CAPTION_Y }, root, sm);

    // ── 판의 상태
    let width = 0;
    let gapScale = 0;
    let unitIds: string[] = [];
    /** 표지의 앞 자리 (n − g) — 판을 건너 남는다. 운동의 출발점일 뿐 화면에 결론으로 남기지 않는다 */
    const memory: Record<WeightKind, (number | undefined)[]> = { wa: [], wb: [], w2: [] };
    const markerNow: Record<WeightKind, number[]> = { wa: [], wb: [], w2: [] };

    const markerX = (col: number, off: number): number => {
      if (!(gapScale > 0)) throw new Error('backprop-stage: 어긋남 눈금이 아직 없다');
      return originX(col) + (off / gapScale) * GAUGE_LEN;
    };
    const needWidth = (n: number, what: string): void => {
      if (n !== width) throw new Error(`backprop-stage: ${what} 의 길이 ${n} 가 폭 ${width} 와 다르다`);
    };

    const clearConclusions = (): void => {
      for (let j = 0; j < slots; j++) {
        const r = rows[j]!;
        r.label.setAttribute('fill', c.text);
        for (const k of COLS) {
          r.cells[k].value.textContent = '';
          r.cells[k].marker.setAttribute('visibility', 'hidden');
          r.cells[k].marker.setAttribute('fill', c.itemComparing);
        }
        unitDots[j]!.setAttribute('fill', c.primary);
        unitDots[j]!.setAttribute('stroke', c.primary);
        unitDots[j]!.removeAttribute('stroke-dasharray');
        for (const e of [...inEdges[j]!, outEdges[j]!]) {
          e.removeAttribute('stroke-dasharray');
          e.setAttribute('stroke', c.border);
        }
      }
      ring.setAttribute('visibility', 'hidden');
      for (const e of [yHatText, lossText, dText, maxGapText, maxAtText, ratioText]) e.textContent = '';
    };

    const reset = (): void => {
      finishAll();
      clearConclusions();
      grow.fill(0);
      cy = rowY(0);
      ioShown = false;
      drawNet();
      barNow[0] = 0;
      barNow[1] = 0;
      for (let i = 0; i < 2; i++) {
        bars[i]!.setAttribute('width', '0');
        barTexts[i]!.textContent = '';
        barTexts[i]!.setAttribute('x', String(BAR_X0 + 6));
      }
      for (const k of COLS) {
        memory[k] = [];
        markerNow[k] = [];
      }
      width = 0;
      gapScale = 0;
      barMax = 0;
      unitIds = [];
      weightCountText.textContent = '';
      barTick0.textContent = '';
      barTickMax.textContent = '';
      for (const g of gaugeTicks) {
        g.zero.textContent = '';
        g.end.textContent = '';
      }
      lgNudge.textContent = '';
      caption.textContent = '';
    };
    reset();

    const stage: BackpropStage = {
      showNet(p, durMs) {
        if (p.width > slots || p.units.length !== p.width) {
          throw new Error(`backprop-stage: 폭 ${p.width} 가 자리 ${slots} 를 넘거나 단위 수와 다르다`);
        }
        finishAll();
        clearConclusions();
        width = p.width;
        gapScale = p.gapScale;
        barMax = p.barMax;
        unitIds = p.units.map((u) => u.id);
        for (let j = 0; j < width; j++) rows[j]!.label.textContent = unitIds[j]!;

        weightCountText.textContent = t('label.weightCount', 'Weights: {n}', { n: p.weightCount });
        barTick0.textContent = '0';
        barTickMax.textContent = String(p.barMax);
        for (const g of gaugeTicks) {
          g.zero.textContent = '0';
          g.end.textContent = String(Number(p.gapScale.toPrecision(3)));
        }
        inLabels[0]!.textContent = t('label.input1', 'x₁ = {v}', { v: p.x1.toFixed(1) });
        inLabels[1]!.textContent = t('label.input2', 'x₂ = {v}', { v: p.x2.toFixed(1) });
        targetText.textContent = t('label.target', 'y = {v}', { v: p.y.toFixed(1) });
        lgNudge.textContent = t('label.legendNudge', 'Nudged value (ε = {eps})', { eps: String(p.nudge) });
        caption.textContent = t('caption.net', 'The net before any pass. Every weight needs its own gradient ∂L/∂w.');

        // 곱셈 막대는 이 판의 0 으로
        setBar(0, 0, durMs);
        setBar(1, 0, durMs);

        // 단위가 자라 나오거나 줄어 사라진다 · 입력과 출력은 가운데로 옮겨 간다
        const fromGrow = [...grow];
        const toGrow = grow.map((_, j) => (j < width ? 1 : 0));
        const fromCy = ioShown ? cy : (rowY(0) + rowY(width - 1)) / 2;
        const toCy = (rowY(0) + rowY(width - 1)) / 2;
        ioShown = true;
        animate('net', durMs, (k) => {
          for (let j = 0; j < slots; j++) grow[j] = fromGrow[j]! + (toGrow[j]! - fromGrow[j]!) * k;
          cy = fromCy + (toCy - fromCy) * k;
          drawNet();
        });
      },

      showForward(p, durMs) {
        needWidth(p.on.length, '켜짐');
        for (let j = 0; j < width; j++) {
          if (p.on[j]) continue;
          unitDots[j]!.setAttribute('fill', c.bg);
          unitDots[j]!.setAttribute('stroke', c.textMuted);
          unitDots[j]!.setAttribute('stroke-dasharray', '2 2');
          rows[j]!.label.setAttribute('fill', c.textMuted);
          for (const e of [...inEdges[j]!, outEdges[j]!]) e.setAttribute('stroke-dasharray', '3 3');
        }
        yHatText.textContent = t('label.yHat', 'ŷ = Σ w2·h = {v}', { v: p.yHat.toFixed(3) });
        lossText.textContent = t('label.loss', 'L = ½(ŷ − y)² = {v}', { v: p.loss.toFixed(4) });
        caption.textContent = t('caption.forward', 'One forward pass: each unit computes z and h, then ŷ and L. Off units pass nothing on.');
        setBar(0, p.backpropMults, durMs);
      },

      showBackward(p, durMs) {
        needWidth(p.grads.length, '기울기');
        for (let j = 0; j < width; j++) {
          const g = p.grads[j]!;
          for (const k of COLS) {
            const cell = rows[j]!.cells[k];
            cell.value.textContent = g[k].toFixed(3);
            cell.value.setAttribute('fill', g[k] === 0 ? c.textMuted : c.text);
          }
        }
        dText.textContent = t('label.d', 'd = ŷ − y = {v}', { v: p.d.toFixed(3) });
        caption.textContent = t('caption.backward', 'One backward pass from d = ŷ − y gives every weight its gradient at once. Backprop is done.');
        setBar(0, p.backpropMults, durMs);
      },

      showNudge(p, durMs) {
        needWidth(p.offsets.length, '표지');
        const col = COLS.indexOf(p.weight);
        if (col < 0) throw new Error(`backprop-stage: 모르는 무게 ${String(p.weight)}`);
        const k = p.weight;
        if (k === 'w2') caption.textContent = t('caption.nudgeW2', 'Nudging: one base forward pass, then one more for each w2 pushed by ε.');
        else if (k === 'wa') caption.textContent = t('caption.nudgeWa', 'Again for each wa: push it by ε, run the whole net, put it back.');
        else caption.textContent = t('caption.nudgeWb', 'And for each wb. Nudging is done: one forward pass per weight, plus the base.');
        setBar(1, p.nudgeMults, durMs);

        const y = (j: number): number => rowY(j) - 2;
        const from = p.offsets.map((off, j) => memory[k][j] ?? off);
        const fresh = p.offsets.map((_, j) => memory[k][j] === undefined);
        for (let j = 0; j < width; j++) {
          memory[k][j] = p.offsets[j]!;
          rows[j]!.cells[k].marker.setAttribute('visibility', 'visible');
        }
        animate(`marker-${k}`, durMs, (e) => {
          for (let j = 0; j < width; j++) {
            const off = from[j]! + (p.offsets[j]! - from[j]!) * e;
            markerNow[k][j] = off;
            const s = fresh[j] ? e : 1;
            rows[j]!.cells[k].marker.setAttribute('transform', `translate(${markerX(col, off)}, ${y(j)}) scale(${s})`);
          }
        });
      },

      showCompare(p, durMs) {
        if (p.maxUnit < 0 || p.maxUnit >= width) throw new Error(`backprop-stage: 가장 큰 어긋남의 단위 ${p.maxUnit} 가 폭 밖이다`);
        const col = COLS.indexOf(p.maxWeight);
        if (col < 0) throw new Error(`backprop-stage: 모르는 무게 ${String(p.maxWeight)}`);
        const off = memory[p.maxWeight][p.maxUnit];
        if (off === undefined) throw new Error('backprop-stage: 밀어 보기 전에 견줌이 왔다');
        finishAll();
        maxGapText.textContent = t('label.maxGap', 'Largest gap: {g}', { g: p.maxGap.toFixed(p.gapDigits) });
        maxAtText.textContent = t('label.maxAt', 'At: {unit} · {weight}', { unit: unitIds[p.maxUnit]!, weight: p.maxWeight });
        ratioText.textContent = t('label.ratio', 'Cost ratio: ×{r}', { r: p.ratio.toFixed(1) });
        caption.textContent = t('caption.compare', 'Compare: the gap is how far each ▲ sits from its backprop tick.');
        rows[p.maxUnit]!.cells[p.maxWeight].marker.setAttribute('fill', c.danger);
        const cx = markerX(col, off);
        const ry = rowY(p.maxUnit) - 1;
        ring.setAttribute('cx', String(cx));
        ring.setAttribute('cy', String(ry));
        ring.setAttribute('visibility', 'visible');
        animate('ring', durMs, (k) => ring.setAttribute('r', String(26 - 18 * k)));
      },

      reset,

      destroy() {
        destroyed = true;
        for (const rec of tweens.values()) cancelAnimationFrame(rec.raf);
        tweens.clear();
        root.remove();
      },
    };
    return stage;
  },
};
