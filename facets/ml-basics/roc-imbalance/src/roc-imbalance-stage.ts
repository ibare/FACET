/**
 * roc-imbalance 무대 — 왼쪽은 점수 줄 위의 항목과 네 칸, 오른쪽은 ROC 평면과 두 눈금(정밀도 · 정확도).
 *
 * 운동
 *   - 걸음 0: 음성 더미가 배수만큼 겹쳐 **불어난다**(새 겹이 아래에서 올라와 쌓인다 · 줄면 빠져나간다).
 *     앞 판에서 칸에 들어가 있던 항목은 점수 줄의 제자리로 돌아온다
 *   - 걸음 1: 문턱 선이 앞 판의 자리에서 새 자리로 옮겨 서고, 항목이 네 칸으로 떨어진다
 *   - 걸음 2: 곡선이 그려지고 이 문턱의 점이 앞 판 점의 자리(옅은 고리)에서 새 자리로 내려앉는다
 *   - 걸음 3: 곡선 아래가 바닥에서부터 찬다
 *   - 걸음 4 · 5: 정밀도 · 정확도 표지가 앞 판의 자리(옅은 눈금)에서 새 값으로 미끄러진다
 *
 * 앞 판의 자리(옅은 고리 · 옅은 곡선 · 옅은 눈금)는 남기고, 값 글자 · 표지는 걸음 0 에서 걷는다.
 * 무대는 셈하지 않는다 — 칸 · 자리 번호 · 비율 · 곡선은 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { CellName, CurvePoint } from './algorithm.js';

const W = 820;
const H = 500;

// 점수 줄
const AX0 = 90;
const AX1 = 390;
const POS_Y = 58;
const NEG_Y0 = 82;
const NEG_PITCH = 7;
const AXIS_Y = 160;
const ENTER_DY = 26;

// 네 칸
const CELL_X = [90, 250];
const CELL_Y = [212, 307];
const CELL_W = 150;
const CELL_H = 85;
const CELL_COLS = 17;
const CELL_PITCH = 8;

// ROC 평면
const PX0 = 470;
const PX1 = 690;
const PY0 = 40;
const PY1 = 260;

// 눈금 둘
const GAUGE_X = { precision: 735, accuracy: 790 } as const;
const GAUGE_W = 10;

const SVG_NS = 'http://www.w3.org/2000/svg';

export type ItemsView = {
  multiplier: number;
  positives: { id: string; score: number }[];
  negatives: { id: string; score: number; layer: number }[];
};
export type CallView = {
  threshold: number;
  counts: Record<CellName, number>;
  placements: { id: string; cell: CellName; slot: number }[];
};
export type RatesView = { tprPercent: number; fprPercent: number; tpr: number; fpr: number; curve: CurvePoint[] };
export type GaugeName = 'precision' | 'accuracy';

export type RocImbalanceStage = ViewInstance & {
  reset(): void;
  showItems(v: ItemsView, ms: number): void;
  showCall(v: CallView, ms: number): void;
  showRates(v: RatesView, ms: number): void;
  showAuc(aucPercent: number, curve: CurvePoint[], ms: number): void;
  showGauge(name: GaugeName, percent: number, ms: number): void;
  setCaption(text: string): void;
};

type Item = { el: SVGCircleElement; x: number; y: number };
type Tween = { id: number; draw: (p: number) => void };

const scoreX = (s: number) => AX0 + (AX1 - AX0) * s;
const rocX = (fpr: number) => PX0 + (PX1 - PX0) * fpr;
const rocY = (tpr: number) => PY1 - (PY1 - PY0) * tpr;
const gaugeY = (percent: number) => PY1 - (PY1 - PY0) * (percent / 100);
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));

export const rocImbalanceStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): RocImbalanceStage {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [posColor, negColor] = categorical(2);
    const isInstant = params.isInstant ?? (() => false);
    let destroyed = false;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (
      x: number,
      y: number,
      body: string,
      opts: { size?: string; anchor?: string; fill?: string; weight?: number; mono?: boolean } = {},
      parent: Element = svg,
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          fill: opts.fill ?? c.text,
          'font-weight': opts.weight ?? 400,
          'xml:space': 'preserve',
        },
        parent,
      );
      node.textContent = body;
      return node;
    };
    const show = (node: Element, on: boolean) => node.setAttribute('visibility', on ? 'visible' : 'hidden');

    // ── 운동 ───────────────────────────────────────────────────────────────────────────────
    const active = new Set<Tween>();
    const tween = (ms: number, draw: (p: number) => void) => {
      if (destroyed) return;
      if (ms <= 0 || isInstant()) {
        draw(1);
        return;
      }
      const t0 = performance.now();
      const tw: Tween = { id: 0, draw };
      const tick = (now: number) => {
        const p = clamp01((now - t0) / ms);
        draw(p >= 1 ? 1 : ease(p));
        if (p < 1 && !destroyed) tw.id = requestAnimationFrame(tick);
        else active.delete(tw);
      };
      tw.id = requestAnimationFrame(tick);
      active.add(tw);
    };
    /** 돌던 운동을 끝 상태로 건너뛴다 (판 머리 · 되짚기). */
    const finishAll = () => {
      const list = [...active];
      active.clear();
      for (const tw of list) {
        cancelAnimationFrame(tw.id);
        tw.draw(1);
      }
    };
    /** 돌던 운동을 그리지 않고 끊는다 (reset · destroy). */
    const cancelAll = () => {
      for (const tw of active) cancelAnimationFrame(tw.id);
      active.clear();
    };
    params.onScrubStart?.(() => finishAll());

    // ── 바탕 ───────────────────────────────────────────────────────────────────────────────
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg });

    // 점수 줄
    text(20, POS_Y + 4, t('label.positives', 'Positives'), { fill: posColor, weight: 600 });
    const pileLabel = text(20, NEG_Y0 + 4, '', { fill: negColor, weight: 600 });
    el('line', { x1: AX0, y1: AXIS_Y, x2: AX1, y2: AXIS_Y, stroke: c.border, 'stroke-width': 1 });
    for (const s of [0, 0.5, 1]) {
      el('line', { x1: scoreX(s), y1: AXIS_Y, x2: scoreX(s), y2: AXIS_Y + 4, stroke: c.border });
      text(scoreX(s), AXIS_Y + 16, String(s), { size: fontSizes.xs, anchor: 'middle', fill: c.textMuted });
    }
    text(20, AXIS_Y + 4, t('label.score', 'Score'), { size: fontSizes.xs, fill: c.textMuted });

    // 문턱 선 (걸음 1 에 선다)
    const thGroup = el('g', { visibility: 'hidden' });
    const thShade = el('rect', { x: 0, y: POS_Y - 14, width: 0, height: AXIS_Y - POS_Y + 14, fill: c.bgSubtle }, thGroup);
    const thLine = el(
      'line',
      { x1: 0, y1: POS_Y - 18, x2: 0, y2: AXIS_Y, stroke: c.text, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
      thGroup,
    );
    const thText = text(0, POS_Y - 24, '', { size: fontSizes.xs, anchor: 'middle' }, thGroup);
    let thX: number | null = null;
    const placeThreshold = (x: number, label: string) => {
      thShade.setAttribute('x', String(x));
      thShade.setAttribute('width', String(Math.max(0, AX1 + 6 - x)));
      thLine.setAttribute('x1', String(x));
      thLine.setAttribute('x2', String(x));
      thText.setAttribute('x', String(x));
      thText.textContent = label;
    };

    // 네 칸
    const colHead = [t('label.calledPositive', 'Called positive'), t('label.calledNegative', 'Called negative')];
    const rowHead = [t('label.positives', 'Positives'), t('label.negatives', 'Negatives')];
    colHead.forEach((h, i) =>
      text(CELL_X[i] + CELL_W / 2, CELL_Y[0] - 8, h, { size: fontSizes.xs, anchor: 'middle', fill: c.textMuted }),
    );
    rowHead.forEach((h, i) =>
      text(20, CELL_Y[i] + CELL_H / 2 + 4, h, { size: fontSizes.xs, fill: i === 0 ? posColor : negColor, weight: 600 }),
    );
    const cellPos: Record<CellName, { x: number; y: number }> = {
      tp: { x: CELL_X[0], y: CELL_Y[0] },
      fn: { x: CELL_X[1], y: CELL_Y[0] },
      fp: { x: CELL_X[0], y: CELL_Y[1] },
      tn: { x: CELL_X[1], y: CELL_Y[1] },
    };
    const cellName: Record<CellName, string> = {
      tp: t('cell.tp', 'True positive'),
      fn: t('cell.fn', 'Missed'),
      fp: t('cell.fp', 'False alarm'),
      tn: t('cell.tn', 'True negative'),
    };
    const cellCode: Record<CellName, string> = {
      tp: t('code.tp', 'TP'),
      fn: t('code.fn', 'FN'),
      fp: t('code.fp', 'FP'),
      tn: t('code.tn', 'TN'),
    };
    const cellCount = {} as Record<CellName, SVGTextElement>;
    for (const k of ['tp', 'fn', 'fp', 'tn'] as const) {
      const { x, y } = cellPos[k];
      el('rect', { x, y, width: CELL_W, height: CELL_H, rx: 4, fill: 'none', stroke: c.border });
      text(x + 8, y + 16, `${cellCode[k]} ${cellName[k]}`, { size: fontSizes.xs, fill: c.textMuted });
      cellCount[k] = text(x + CELL_W - 8, y + 17, '', { size: fontSizes.lg, anchor: 'end', weight: 700 });
    }
    const slotXY = (cell: CellName, slot: number) => {
      const { x, y } = cellPos[cell];
      return { x: x + 12 + (slot % CELL_COLS) * CELL_PITCH, y: y + 32 + Math.floor(slot / CELL_COLS) * CELL_PITCH };
    };

    // ROC 평면
    el('rect', { x: PX0, y: PY0, width: PX1 - PX0, height: PY1 - PY0, fill: 'none', stroke: c.border });
    el('line', {
      x1: PX0,
      y1: PY1,
      x2: PX1,
      y2: PY0,
      stroke: c.border,
      'stroke-dasharray': '3 4',
    });
    text((PX0 + PX1) / 2, PY1 + 30, t('axis.fpr', 'FPR'), { size: fontSizes.xs, anchor: 'middle', fill: c.textMuted });
    text(PX0 - 10, (PY0 + PY1) / 2, t('axis.tpr', 'TPR'), { size: fontSizes.xs, anchor: 'end', fill: c.textMuted });
    for (const s of [0, 1]) {
      text(rocX(s), PY1 + 14, String(s), { size: fontSizes.xs, anchor: 'middle', fill: c.textMuted });
      text(PX0 - 6, rocY(s) + 4, String(s), { size: fontSizes.xs, anchor: 'end', fill: c.textMuted });
    }
    const aucFill = el('polygon', { points: '', fill: posColor, 'fill-opacity': 0.18, visibility: 'hidden' });
    const ghostCurve = el('polyline', {
      points: '',
      fill: 'none',
      stroke: c.ghostOutline,
      'stroke-width': 3,
      'stroke-opacity': 0.5,
      visibility: 'hidden',
    });
    const curveLine = el('polyline', { points: '', fill: 'none', stroke: c.text, 'stroke-width': 1.5, visibility: 'hidden' });
    const ghostPoint = el('circle', {
      cx: 0,
      cy: 0,
      r: 9,
      fill: 'none',
      stroke: c.ghostOutline,
      'stroke-width': 1.5,
      'stroke-dasharray': '3 2',
      visibility: 'hidden',
    });
    const point = el('circle', { cx: 0, cy: 0, r: 5.5, fill: c.accent, stroke: c.text, 'stroke-width': 1.5, visibility: 'hidden' });
    const ratesText = text(PX0, PY1 + 52, '', { size: fontSizes.md, mono: true });
    const aucText = text(PX0, PY1 + 74, '', { size: fontSizes.md, mono: true });

    // 눈금 둘
    type Gauge = {
      fill: SVGRectElement;
      marker: SVGPolygonElement;
      ghost: SVGLineElement;
      value: SVGTextElement;
      now: number | null;
      before: number | null;
    };
    const makeGauge = (gx: number, label: string, color: string): Gauge => {
      el('rect', { x: gx - GAUGE_W / 2, y: PY0, width: GAUGE_W, height: PY1 - PY0, fill: c.bgSubtle, stroke: c.border });
      const fill = el('rect', { x: gx - GAUGE_W / 2, y: PY1, width: GAUGE_W, height: 0, fill: color, visibility: 'hidden' });
      const ghost = el('line', {
        x1: gx - GAUGE_W,
        x2: gx + GAUGE_W,
        y1: PY1,
        y2: PY1,
        stroke: c.ghostOutline,
        'stroke-width': 2,
        'stroke-dasharray': '3 2',
        visibility: 'hidden',
      });
      const marker = el('polygon', { points: '', fill: c.text, visibility: 'hidden' });
      const value = text(gx - GAUGE_W - 2, PY1, '', { size: fontSizes.xs, anchor: 'end', weight: 700 });
      text(gx, PY1 + 30, label, { size: fontSizes.xs, anchor: 'middle', fill: c.textMuted });
      return { fill, marker, ghost, value, now: null, before: null };
    };
    const gauges: Record<GaugeName, Gauge> = {
      precision: makeGauge(GAUGE_X.precision, t('label.precision', 'Precision'), negColor),
      accuracy: makeGauge(GAUGE_X.accuracy, t('label.accuracy', 'Accuracy'), posColor),
    };
    const drawGauge = (name: GaugeName, percent: number) => {
      const g = gauges[name];
      const gx = GAUGE_X[name];
      const y = gaugeY(percent);
      g.fill.setAttribute('y', String(y));
      g.fill.setAttribute('height', String(PY1 - y));
      g.marker.setAttribute('points', `${gx + GAUGE_W / 2},${y} ${gx + GAUGE_W / 2 + 7},${y - 5} ${gx + GAUGE_W / 2 + 7},${y + 5}`);
      g.value.setAttribute('y', String(y + 4));
    };

    const caption = text(20, H - 18, '', { size: fontSizes.md });

    // ── 상태 ───────────────────────────────────────────────────────────────────────────────
    const items = new Map<string, Item>();
    const leaving = new Set<SVGCircleElement>();
    let curve: { x: number; y: number }[] = [];
    let pointAt: { x: number; y: number } | null = null;
    let ghostAt: { x: number; y: number } | null = null;
    const itemLayer = el('g', {});

    const polyPoints = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

    /** 값 글자 · 표지를 걷는다. 앞 판의 자리는 옅은 모양으로 남긴다. */
    const clearConclusions = () => {
      if (pointAt !== null) {
        ghostAt = pointAt;
        ghostPoint.setAttribute('cx', String(ghostAt.x));
        ghostPoint.setAttribute('cy', String(ghostAt.y));
        show(ghostPoint, true);
      }
      pointAt = null;
      if (curve.length > 0) {
        ghostCurve.setAttribute('points', polyPoints(curve));
        show(ghostCurve, true);
      }
      curve = [];
      show(point, false);
      show(curveLine, false);
      show(aucFill, false);
      show(thGroup, false);
      ratesText.textContent = '';
      aucText.textContent = '';
      for (const k of ['tp', 'fn', 'fp', 'tn'] as const) cellCount[k].textContent = '';
      for (const name of ['precision', 'accuracy'] as const) {
        const g = gauges[name];
        if (g.now !== null) {
          g.before = g.now;
          const y = gaugeY(g.before);
          g.ghost.setAttribute('y1', String(y));
          g.ghost.setAttribute('y2', String(y));
          show(g.ghost, true);
        }
        g.now = null;
        show(g.fill, false);
        show(g.marker, false);
        g.value.textContent = '';
      }
      caption.textContent = '';
    };

    const moveItems = (movers: { item: Item; x: number; y: number; fromOpacity: number }[], leavers: Item[], from: number, ms: number) => {
      const starts = movers.map((m) => ({ x: m.item.x, y: m.item.y }));
      const leaveStarts = leavers.map((it) => ({ x: it.x, y: it.y }));
      for (const m of movers) {
        m.item.x = m.x;
        m.item.y = m.y;
      }
      tween(ms, (p0) => {
        const p = from > 0 ? clamp01((p0 - from) / (1 - from)) : p0;
        movers.forEach((m, i) => {
          m.item.el.setAttribute('cx', String(lerp(starts[i].x, m.x, p)));
          m.item.el.setAttribute('cy', String(lerp(starts[i].y, m.y, p)));
          if (m.fromOpacity < 1) m.item.el.setAttribute('opacity', String(lerp(m.fromOpacity, 1, p)));
        });
        leavers.forEach((it, i) => {
          it.el.setAttribute('cy', String(leaveStarts[i].y + ENTER_DY * p));
          it.el.setAttribute('opacity', String(1 - p));
          if (p0 >= 1) {
            it.el.remove();
            leaving.delete(it.el);
          }
        });
      });
    };

    const instance: RocImbalanceStage = {
      reset() {
        cancelAll();
        for (const it of items.values()) it.el.remove();
        items.clear();
        for (const e of leaving) e.remove();
        leaving.clear();
        pointAt = null;
        ghostAt = null;
        curve = [];
        clearConclusions();
        show(ghostPoint, false);
        show(ghostCurve, false);
        ghostCurve.setAttribute('points', '');
        for (const name of ['precision', 'accuracy'] as const) {
          gauges[name].before = null;
          show(gauges[name].ghost, false);
        }
        pileLabel.textContent = '';
        thX = null;
      },

      showItems(v, ms) {
        finishAll();
        clearConclusions();
        pileLabel.textContent = t('label.pile', 'Negatives ×{m}', { m: v.multiplier });
        const want = new Map<string, { x: number; y: number; positive: boolean }>();
        for (const p of v.positives) want.set(p.id, { x: scoreX(p.score), y: POS_Y, positive: true });
        for (const q of v.negatives) want.set(q.id, { x: scoreX(q.score), y: NEG_Y0 + q.layer * NEG_PITCH, positive: false });
        const leavers: Item[] = [];
        for (const [id, it] of items) {
          if (!want.has(id)) {
            leavers.push(it);
            leaving.add(it.el);
            items.delete(id);
          }
        }
        const movers: { item: Item; x: number; y: number; fromOpacity: number }[] = [];
        for (const [id, w] of want) {
          let it = items.get(id);
          let fromOpacity = 1;
          if (it === undefined) {
            const circle = el(
              'circle',
              {
                cx: w.x,
                cy: w.y + ENTER_DY,
                r: w.positive ? 3.8 : 3.2,
                fill: w.positive ? posColor : negColor,
                stroke: c.bg,
                'stroke-width': 0.8,
                opacity: 0,
              },
              itemLayer,
            );
            it = { el: circle, x: w.x, y: w.y + ENTER_DY };
            items.set(id, it);
            fromOpacity = 0;
          }
          movers.push({ item: it, x: w.x, y: w.y, fromOpacity });
        }
        moveItems(movers, leavers, 0, ms);
      },

      showCall(v, ms) {
        finishAll();
        const target = scoreX(v.threshold);
        const start = thX ?? target;
        thX = target;
        const label = t('label.threshold', 'Threshold {th}', { th: v.threshold });
        show(thGroup, true);
        const SLIDE = 0.35;
        tween(ms, (p) => placeThreshold(lerp(start, target, clamp01(p / SLIDE)), label));
        const movers = v.placements.map((pl) => {
          const it = items.get(pl.id);
          if (it === undefined) throw new Error(`칸에 떨어질 항목이 없다: ${pl.id}`);
          const xy = slotXY(pl.cell, pl.slot);
          return { item: it, x: xy.x, y: xy.y, fromOpacity: 1 };
        });
        moveItems(movers, [], SLIDE, ms);
        for (const k of ['tp', 'fn', 'fp', 'tn'] as const) cellCount[k].textContent = String(v.counts[k]);
      },

      showRates(v, ms) {
        finishAll();
        curve = v.curve.map((q) => ({ x: rocX(q.fpr), y: rocY(q.tpr) }));
        if (curve.length < 2) throw new Error('곡선의 점이 모자라다');
        const target = { x: rocX(v.fpr), y: rocY(v.tpr) };
        const from = ghostAt ?? target;
        pointAt = target;
        show(curveLine, true);
        show(point, true);
        ratesText.textContent = t('value.rates', 'TPR {tpr} % · FPR {fpr} %', { tpr: v.tprPercent, fpr: v.fprPercent });
        const pts = curve;
        tween(ms, (p) => {
          const upto = p * (pts.length - 1);
          const whole = Math.floor(upto);
          const drawn = pts.slice(0, whole + 1);
          if (whole < pts.length - 1) {
            const a = pts[whole];
            const b = pts[whole + 1];
            drawn.push({ x: lerp(a.x, b.x, upto - whole), y: lerp(a.y, b.y, upto - whole) });
          }
          curveLine.setAttribute('points', polyPoints(drawn));
          // 점은 앞 판의 자리 위에서 떠올라 새 자리로 내려앉는다
          const lift = 28 * Math.sin(Math.PI * p);
          point.setAttribute('cx', String(lerp(from.x, target.x, p)));
          point.setAttribute('cy', String(lerp(from.y, target.y, p) - lift));
        });
      },

      showAuc(aucPercent, curvePts, ms) {
        finishAll();
        const pts = curvePts.map((q) => ({ x: rocX(q.fpr), y: rocY(q.tpr) }));
        if (pts.length < 2) throw new Error('곡선의 점이 모자라다');
        aucText.textContent = t('value.auc', 'AUC {auc} %', { auc: aucPercent });
        show(aucFill, true);
        tween(ms, (p) => {
          const risen = pts.map((q) => ({ x: q.x, y: lerp(PY1, q.y, p) }));
          risen.push({ x: pts[pts.length - 1].x, y: PY1 }, { x: pts[0].x, y: PY1 });
          aucFill.setAttribute('points', polyPoints(risen));
        });
      },

      showGauge(name, percent, ms) {
        finishAll();
        const g = gauges[name];
        const from = g.before ?? 0;
        g.now = percent;
        show(g.fill, true);
        show(g.marker, true);
        g.value.textContent = t('value.percent', '{v} %', { v: percent });
        tween(ms, (p) => drawGauge(name, lerp(from, percent, p)));
      },

      setCaption(body) {
        caption.textContent = body;
      },

      destroy() {
        destroyed = true;
        cancelAll();
      },
    };
    return instance;
  },
};
