/**
 * early-stopping 무대 — 에폭 축 위의 검증 곡선 하나와 멈춤 규칙.
 *
 * - 곡선: 에폭마다 한 점씩 그어진다 (새 마디가 앞 점에서 뻗어 나온다). 에폭 0 은 축 위로 벗어난 자리에 값 글자로.
 * - 가장 좋던 에폭 표식: 곡선 위의 노란 점 + 그 값 높이의 가로 점선. 나아진 에폭으로 미끄러져 옮겨 간다.
 * - 기다림 칸: 표식 다음 에폭부터 참을성만큼의 칸이 에폭 축 아래에 놓이고, 나아지지 않은 에폭마다 한 칸씩 찬다.
 *   표식이 옮겨 가면 칸 줄도 함께 옮겨 간다. 마지막 칸이 차는 에폭에서 곡선이 끊긴다.
 * - 쓰는 무게: 곡선 위의 커서와 무게 여덟의 막대. 되돌림에서 커서는 곡선을 거꾸로 따라 표식 자리로 가고,
 *   막대는 표식 에폭의 무게로 뛰어 돌아간다.
 *
 * 무대는 셈하지 않는다 — 축 범위 · 기다림 · 판정 · 무게는 모두 projector 가 넘긴 payload 의 값이다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type EsRunView = {
  patience: number;
  epochCount: number;
  featureCount: number;
  yMin: number;
  yMax: number;
  wAbs: number;
};

export type EsEpochView = {
  epoch: number;
  val: number;
  bestEpoch: number;
  bestVal: number;
  wait: number;
  patience: number;
  verdict: 'start' | 'improve' | 'wait' | 'stop';
  weights: number[];
};

export type EsRestoreView = {
  bestEpoch: number;
  bestVal: number;
  stopEpoch: number;
  weights: number[];
};

/** projector 가 부르는 무대의 표면. */
export type EarlyStoppingStage = ViewInstance & {
  beginRun(run: EsRunView, motionMs: number): void;
  showEpoch(step: EsEpochView, motionMs: number): void;
  showRestore(step: EsRestoreView, motionMs: number): void;
  reset(): void;
};

const W = 760;
const H = 520;
const PLOT_L = 78;
const PLOT_R = 738;
const PLOT_T = 84;
const PLOT_B = 272;
const OFF_Y = 58;
const BAND_Y = 296;
const BAND_H = 16;
const BARS_TOP = 356;
const BARS_MID = 410;
const BARS_HALF = 42;
const CAPTION_Y = 500;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Tween = { id: number; frame: (k: number) => void };

export const earlyStoppingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; anchor?: string; fill?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          fill: opts.fill ?? c.text,
          'font-weight': opts.weight ?? 'normal',
          'xml:space': 'preserve',
        },
        parent,
      );
      node.textContent = body;
      return node;
    };

    // ── 운동 ─────────────────────────────────────────────────────────────
    const tweens = new Set<Tween>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const animate = (ms: number, frame: (k: number) => void): void => {
      if (!hasRaf || ms <= 0 || isInstant()) {
        frame(1);
        return;
      }
      const start = performance.now();
      const tw: Tween = { id: 0, frame };
      const tick = (now: number): void => {
        const k = Math.min(1, (now - start) / ms);
        const eased = 1 - (1 - k) * (1 - k);
        frame(eased);
        if (k < 1) tw.id = requestAnimationFrame(tick);
        else tweens.delete(tw);
      };
      tweens.add(tw);
      tw.id = requestAnimationFrame(tick);
    };
    /** 돌던 운동을 끝 모습으로 건너뛴다 (되짚기). */
    const flush = (): void => {
      for (const tw of [...tweens]) {
        cancelAnimationFrame(tw.id);
        tw.frame(1);
      }
      tweens.clear();
    };
    /** 돌던 운동을 끊기만 한다 (판 머리 · 비우기) — 끝 모습을 앞 판 위에 다시 쓰지 않는다. */
    const kill = (): void => {
      for (const tw of tweens) if (hasRaf) cancelAnimationFrame(tw.id);
      tweens.clear();
    };
    params.onScrubStart?.(flush);

    // ── 판 상태 (payload 의 값만 쥔다) ───────────────────────────────────
    let run: EsRunView | null = null;
    let points: { epoch: number; val: number }[] = [];
    let cursorEpoch = 0;
    let markPos: { x: number; y: number } | null = null;
    let bandShift: number | null = null;
    let barValues: number[] = [];

    let root: SVGGElement = el('g', {}, svg);

    const needRun = (): EsRunView => {
      if (run === null) throw new Error('early-stopping stage: es-run 앞에 걸음이 왔다');
      return run;
    };
    const ex = (epoch: number): number => {
      const r = needRun();
      return PLOT_L + (epoch * (PLOT_R - PLOT_L)) / r.epochCount;
    };
    const lo = (): number => {
      const r = needRun();
      return r.yMin - (r.yMax - r.yMin) * 0.2;
    };
    const hi = (): number => {
      const r = needRun();
      return r.yMax + (r.yMax - r.yMin) * 0.08;
    };
    const vy = (val: number): number => {
      if (val > hi()) return OFF_Y;
      return PLOT_B - ((val - lo()) / (hi() - lo())) * (PLOT_B - PLOT_T);
    };
    const pointXY = (epoch: number): { x: number; y: number } => {
      const p = points.find((q) => q.epoch === epoch);
      if (p === undefined) throw new Error(`early-stopping stage: 에폭 ${epoch} 의 점이 아직 없다`);
      return { x: ex(epoch), y: vy(p.val) };
    };
    const barY = (w: number): number => {
      const r = needRun();
      return BARS_MID - (w / r.wAbs) * BARS_HALF;
    };
    const cellW = (): number => (PLOT_R - PLOT_L) / needRun().epochCount - 4;

    // 판마다 새로 짓는 요소들
    let readEpoch: SVGTextElement;
    let readVal: SVGTextElement;
    let readBest: SVGTextElement;
    let readPatience: SVGTextElement;
    let curveLayer: SVGGElement;
    let bestLine: SVGLineElement;
    let bestDot: SVGCircleElement;
    let bestLabel: SVGTextElement;
    let band: SVGGElement;
    let cells: SVGRectElement[] = [];
    let cut: SVGGElement;
    let cursor: SVGPathElement;
    let weightsTitle: SVGTextElement;
    let bars: SVGRectElement[] = [];
    let barTexts: SVGTextElement[] = [];
    let caption: SVGTextElement;

    /** 판을 새로 짓는다. 멱등 — 들어오면 비우고 다시 짓는다. */
    const build = (): void => {
      kill();
      root.remove();
      root = el('g', {}, svg);
      points = [];
      cursorEpoch = 0;
      markPos = null;
      bandShift = null;
      cells = [];
      bars = [];
      barTexts = [];

      readEpoch = text(root, PLOT_L, 28, '', { size: fontSizes.md, weight: '600' });
      readVal = text(root, PLOT_L + 110, 28, '', { size: fontSizes.md });
      readBest = text(root, PLOT_L + 330, 28, '', { size: fontSizes.md });
      readPatience = text(root, PLOT_R, 28, '', { size: fontSizes.md, anchor: 'end' });

      if (run === null) {
        caption = text(root, W / 2, CAPTION_Y, '', { anchor: 'middle', fill: c.textMuted });
        curveLayer = el('g', {}, root);
        return;
      }
      const r = run;

      // 축
      el('line', { x1: PLOT_L, y1: PLOT_B, x2: PLOT_R, y2: PLOT_B, stroke: c.border }, root);
      el('line', { x1: PLOT_L, y1: PLOT_T - 6, x2: PLOT_L, y2: PLOT_B, stroke: c.border }, root);
      for (const val of [r.yMin, r.yMax]) {
        const y = vy(val);
        el('line', { x1: PLOT_L, y1: y, x2: PLOT_R, y2: y, stroke: c.border, 'stroke-dasharray': '2 4' }, root);
        text(root, PLOT_L - 6, y + smPx / 3, val.toFixed(3), { anchor: 'end', fill: c.textMuted, mono: true, size: fontSizes.xs });
      }
      // 축 위로 벗어난 자리 — 꺾인 틈
      el('path', { d: `M ${PLOT_L - 5} ${PLOT_T - 14} l 10 -4 M ${PLOT_L - 5} ${PLOT_T - 9} l 10 -4`, stroke: c.textMuted, fill: 'none' }, root);
      text(root, PLOT_L - 6, PLOT_T - 26, t('stage.axisVal', 'validation loss'), { anchor: 'end', fill: c.textMuted, size: fontSizes.xs });
      for (let e = 0; e <= r.epochCount; e += 1) {
        el('line', { x1: ex(e), y1: PLOT_B, x2: ex(e), y2: PLOT_B + 3, stroke: c.border }, root);
        if (e % 2 === 0) text(root, ex(e), PLOT_B + 14, String(e), { anchor: 'middle', fill: c.textMuted, size: fontSizes.xs, mono: true });
      }
      text(root, PLOT_R, PLOT_B + 44, t('stage.axisEpoch', 'epoch'), { anchor: 'end', fill: c.textMuted, size: fontSizes.xs });

      // 가장 좋던 값의 가로 점선 (곡선이 이 아래로 내려와야 나아진다)
      bestLine = el('line', { x1: PLOT_L, x2: PLOT_R, y1: 0, y2: 0, stroke: c.itemPivot, 'stroke-width': 1.5, 'stroke-dasharray': '6 4', visibility: 'hidden' }, root);

      curveLayer = el('g', {}, root);

      // 끊김 표지
      cut = el('g', { visibility: 'hidden' }, root);

      // 기다림 칸
      text(root, PLOT_L - 6, BAND_Y + BAND_H - 4, t('stage.wait', 'waiting'), { anchor: 'end', fill: c.textMuted, size: fontSizes.xs });
      band = el('g', {}, root);
      for (let k = 1; k <= r.patience; k += 1) {
        cells.push(
          el('rect', { x: 0, y: BAND_Y, width: cellW(), height: BAND_H, rx: 2, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 1.2, visibility: 'hidden' }, band),
        );
      }

      // 가장 좋던 에폭 표식
      bestDot = el('circle', { cx: 0, cy: 0, r: 7, fill: c.itemPivot, stroke: c.text, 'stroke-width': 1.5, visibility: 'hidden' }, root);
      bestLabel = text(root, 0, 0, t('stage.bestMark', 'best'), { anchor: 'middle', size: fontSizes.xs, weight: '600' });
      bestLabel.setAttribute('visibility', 'hidden');

      // 쓰는 무게의 커서 (곡선 위 마름모)
      cursor = el('path', { d: 'M 0 -6 L 6 0 L 0 6 L -6 0 Z', fill: c.primary, visibility: 'hidden' }, root);

      // 무게 여덟
      weightsTitle = text(root, PLOT_L, BARS_TOP - 14, '', { fill: c.textMuted });
      const colW = (PLOT_R - PLOT_L) / r.featureCount;
      el('line', { x1: PLOT_L, y1: BARS_MID, x2: PLOT_R, y2: BARS_MID, stroke: c.border }, root);
      for (let j = 0; j < r.featureCount; j += 1) {
        const cx = PLOT_L + colW * (j + 0.5);
        text(root, cx, BARS_MID + BARS_HALF + 30, `w${j + 1}`, { anchor: 'middle', mono: true, fill: c.textMuted });
        bars.push(el('rect', { x: cx - colW * 0.22, y: BARS_MID, width: colW * 0.44, height: 0, fill: c.primary, rx: 2 }, root));
        barTexts.push(text(root, cx, BARS_MID + BARS_HALF + 16, '', { anchor: 'middle', mono: true, size: fontSizes.xs }));
      }
      barValues = new Array<number>(r.featureCount).fill(0);

      caption = text(root, W / 2, CAPTION_Y, '', { anchor: 'middle', fill: c.textMuted });
    };

    const setBars = (target: number[], ms: number): void => {
      if (target.length !== bars.length) throw new Error('early-stopping stage: 무게 수가 막대 수와 다르다');
      const from = [...barValues];
      barValues = [...target];
      target.forEach((w, j) => {
        const bt = barTexts[j]!;
        bt.textContent = w.toFixed(2);
      });
      animate(ms, (k) => {
        target.forEach((w, j) => {
          const now = from[j]! + (w - from[j]!) * k;
          const y = barY(now);
          const bar = bars[j]!;
          bar.setAttribute('y', String(Math.min(y, BARS_MID)));
          bar.setAttribute('height', String(Math.abs(y - BARS_MID)));
        });
      });
    };

    const placeCursor = (x: number, y: number): void => {
      cursor.setAttribute('transform', `translate(${x} ${y + 14})`);
      cursor.setAttribute('visibility', 'visible');
    };

    const moveMark = (epoch: number, val: number, ms: number): void => {
      const to = { x: ex(epoch), y: vy(val) };
      const from = markPos ?? to;
      markPos = to;
      bestDot.setAttribute('visibility', 'visible');
      bestLabel.setAttribute('visibility', 'visible');
      bestLine.setAttribute('visibility', 'visible');
      animate(ms, (k) => {
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k;
        bestDot.setAttribute('cx', String(x));
        bestDot.setAttribute('cy', String(y));
        bestLabel.setAttribute('x', String(x));
        bestLabel.setAttribute('y', String(y - 12));
        const ly = y === OFF_Y ? PLOT_T - 6 : y;
        bestLine.setAttribute('y1', String(ly));
        bestLine.setAttribute('y2', String(ly));
      });
    };

    const moveBand = (bestEpoch: number, wait: number, stopped: boolean, ms: number): void => {
      const to = ex(bestEpoch);
      const from = bandShift ?? to;
      bandShift = to;
      cells.forEach((cell, i) => {
        cell.setAttribute('visibility', 'visible');
        const filled = i < wait;
        const last = stopped && i === wait - 1;
        cell.setAttribute('fill', filled ? (last ? c.danger : c.itemComparing) : c.bg);
        cell.setAttribute('stroke', last ? c.danger : c.itemComparing);
      });
      const step = (PLOT_R - PLOT_L) / needRun().epochCount;
      animate(ms, (k) => {
        const base = from + (to - from) * k;
        cells.forEach((cell, i) => {
          cell.setAttribute('x', String(base + step * (i + 1) - cellW() / 2));
        });
      });
    };

    const addPoint = (epoch: number, val: number, verdict: EsEpochView['verdict'], ms: number): void => {
      const prev = points.length > 0 ? points[points.length - 1]! : null;
      points.push({ epoch, val });
      const to = pointXY(epoch);
      const dot = el(
        'circle',
        {
          cx: to.x,
          cy: to.y,
          r: 3.5,
          fill: verdict === 'improve' || verdict === 'start' ? c.text : c.bg,
          stroke: verdict === 'stop' ? c.danger : c.text,
          'stroke-width': 1.5,
        },
        curveLayer,
      );
      if (to.y === OFF_Y) {
        text(curveLayer, to.x + 10, to.y + 4, val.toFixed(3), { mono: true, size: fontSizes.xs, fill: c.textMuted });
      }
      if (prev === null) return;
      const from = pointXY(prev.epoch);
      const seg = el(
        'line',
        { x1: from.x, y1: from.y, x2: from.x, y2: from.y, stroke: c.text, 'stroke-width': 1.8, 'stroke-dasharray': from.y === OFF_Y ? '3 3' : 'none' },
        curveLayer,
      );
      curveLayer.insertBefore(seg, curveLayer.firstChild);
      dot.setAttribute('opacity', '0');
      animate(ms, (k) => {
        seg.setAttribute('x2', String(from.x + (to.x - from.x) * k));
        seg.setAttribute('y2', String(from.y + (to.y - from.y) * k));
        placeCursor(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
        if (k >= 1) dot.setAttribute('opacity', '1');
      });
    };

    build();

    const inst: EarlyStoppingStage = {
      beginRun(next, _ms) {
        if (next.epochCount < 1 || next.featureCount < 1 || !(next.yMax > next.yMin) || !(next.wAbs > 0)) {
          throw new Error('early-stopping stage: 축을 세울 수 없는 판');
        }
        run = { ...next };
        build();
        readPatience.textContent = t('stage.patience', 'Patience: {p}', { p: next.patience });
      },
      showEpoch(s, ms) {
        needRun();
        readEpoch.textContent = t('stage.epoch', 'Epoch {e}', { e: s.epoch });
        readVal.textContent = t('stage.val', 'Validation loss: {v}', { v: s.val.toFixed(3) });
        readBest.textContent = t('stage.best', 'Best epoch: {b} · {v}', { b: s.bestEpoch, v: s.bestVal.toFixed(3) });
        readPatience.textContent = t('stage.patience', 'Patience: {p}', { p: s.patience });
        addPoint(s.epoch, s.val, s.verdict, ms);
        cursorEpoch = s.epoch;
        if (s.epoch === 0) placeCursor(ex(0), vy(s.val));
        moveMark(s.bestEpoch, s.bestVal, ms);
        moveBand(s.bestEpoch, s.wait, s.verdict === 'stop', ms);
        weightsTitle.textContent = t('stage.weightsAt', 'Weights in use: epoch {e}', { e: s.epoch });
        setBars(s.weights, ms);
        if (s.verdict === 'stop') {
          const x = ex(s.epoch);
          el('line', { x1: x, y1: PLOT_T - 10, x2: x, y2: PLOT_B + 20, stroke: c.danger, 'stroke-width': 2 }, cut);
          text(cut, x + 6, PLOT_T - 2, t('stage.stopMark', 'stop'), { fill: c.danger, weight: '600', size: fontSizes.xs });
          cut.setAttribute('visibility', 'visible');
        }
        switch (s.verdict) {
          case 'start':
            caption.textContent = t('caption.start', 'Epoch 0: every weight is 0. The first validation loss is the best so far.');
            break;
          case 'improve':
            caption.textContent = t('caption.improve', 'Validation loss is strictly below the best so far: the mark moves here and waiting goes back to 0.');
            break;
          case 'wait':
            caption.textContent = t('caption.wait', 'Validation loss is not below the best so far: one more waiting cell fills.');
            break;
          case 'stop':
            caption.textContent = t('caption.stop', 'Waiting has reached the patience: training stops at this epoch.');
            break;
        }
      },
      showRestore(s, ms) {
        needRun();
        if (cursorEpoch !== s.stopEpoch) throw new Error('early-stopping stage: 되돌림이 멈춘 에폭이 아닌 자리에서 왔다');
        // 곡선을 거꾸로 따라 멈춘 에폭 → 가장 좋던 에폭
        const path = points
          .filter((p) => p.epoch >= s.bestEpoch && p.epoch <= s.stopEpoch)
          .sort((a, b) => b.epoch - a.epoch)
          .map((p) => pointXY(p.epoch));
        if (path.length === 0) throw new Error('early-stopping stage: 되돌아갈 곡선이 없다');
        cursorEpoch = s.bestEpoch;
        const segs = path.length - 1;
        animate(ms, (k) => {
          if (segs === 0) {
            placeCursor(path[0]!.x, path[0]!.y);
            return;
          }
          const pos = k * segs;
          const i = Math.min(segs - 1, Math.floor(pos));
          const f = pos - i;
          const a = path[i]!;
          const b = path[i + 1]!;
          placeCursor(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
        });
        readEpoch.textContent = t('stage.epoch', 'Epoch {e}', { e: s.bestEpoch });
        readVal.textContent = t('stage.val', 'Validation loss: {v}', { v: s.bestVal.toFixed(3) });
        readBest.textContent = t('stage.best', 'Best epoch: {b} · {v}', { b: s.bestEpoch, v: s.bestVal.toFixed(3) });
        weightsTitle.textContent = t('stage.weightsRestored', 'Weights in use: epoch {e} (restored)', { e: s.bestEpoch });
        setBars(s.weights, ms);
        caption.textContent = t('caption.restore', 'The weights in use go back to those of the best epoch.');
      },
      reset() {
        run = null;
        build();
      },
      destroy() {
        kill();
        root.remove();
      },
    };
    return inst;
  },
};
