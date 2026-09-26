/**
 * threshold-slides 무대.
 *
 * 왼쪽은 점수 자. 항목은 제 점수 높이에 서고, 처음엔 모두 "음성이라 부름" 줄에 있다.
 * 문턱 선이 한 칸 내려오면 그 점수의 항목이 옆 줄 "양성이라 부름" 으로 건너간다.
 * 오른쪽은 두 비율의 평면. 건너간 항목이 참 양성이면 점이 위로(맞춤률), 참 음성이면
 * 오른쪽으로(헛짚음률) 밀린다. 동률이면 두 쪽으로 한 번에 — 비스듬히 밀린다.
 * 자취는 남아서 두 비율이 한 번도 내려가지 않았음을 보인다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { thresholdCandidates } from './algorithm.js';
import type { RocPoint, ThresholdSlidesScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 396;
const PAD = 16;
/** 점수 1 · 맞춤률 1 의 높이, 점수 0 · 맞춤률 0 의 높이 — 두 판이 같은 세로를 쓴다 */
const PLOT_TOP = 104;
const PLOT_BOTTOM = 356;
/** 항목 토큰 반지름 상한 */
const TOKEN_R_MAX = 8;
/** 흐름 — 문턱이 내려오는 몫과 항목 · 점이 밀리는 몫을 한 시계로 */
const MOTION_MS = 480;
const FRAME_MS = 16;
const DROP_SHARE = 0.4;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size: string; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: string; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': opts.mono === true ? fonts.mono : fonts.body,
    'font-size': opts.size,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
  node.textContent = body;
  return node;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

function fmt(v: number): string {
  return v.toFixed(2);
}

export const thresholdSlidesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [posColor, negColor] = categorical(2);
    if (posColor === undefined || negColor === undefined) throw new Error('threshold-slides-stage: 부류 색이 없다');

    const W = PIECE_CANVAS_W;
    const span = PLOT_BOTTOM - PLOT_TOP;
    // 왼쪽 판 — 점수 자와 두 줄
    const rulerX = PAD + 36;
    const laneW = Math.min(104, (W * 0.44 - rulerX) / 2);
    const negLaneX = rulerX + 8 + laneW / 2;
    const posLaneX = negLaneX + laneW + 8;
    const leftEnd = posLaneX + laneW / 2;
    // 오른쪽 판 — 두 비율의 평면. 세로는 점수 자와 같다
    const rocX0 = leftEnd + 64;
    const rocSize = Math.min(span, W - PAD - 8 - rocX0);
    const rocX1 = rocX0 + rocSize;
    const startLineY = PLOT_TOP - 8;

    const yOfScore = (s: number): number => PLOT_BOTTOM - s * span;
    const rocX = (fpr: number): number => rocX0 + fpr * rocSize;
    const rocY = (tpr: number): number => PLOT_BOTTOM - tpr * rocSize;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 흐르는 동안만 손대는 층
    let thresholdLayer: SVGGElement | null = null;
    let movingTokens: { g: SVGGElement; x: number; y: number }[] = [];
    let segmentLayer: SVGGElement | null = null;
    let markerLayer: SVGGElement | null = null;

    function tokenR(scene: ThresholdSlidesScene): number {
      // 가장 가까운 두 점수의 간격이 토큰 지름을 넘지 않게
      const taus = thresholdCandidates(scene.items);
      let gap = Infinity;
      taus.forEach((s, i) => {
        if (i > 0) gap = Math.min(gap, ((taus[i - 1] ?? s) - s) * span);
      });
      return Math.max(4, Math.min(TOKEN_R_MAX, (gap - 2) / 2));
    }

    function drawToken(parent: Element, id: string, positive: boolean, r: number, current: boolean): void {
      const fill = positive ? posColor : negColor;
      const ring = current ? colors.accent : colors.text;
      const ringW = current ? 2.5 : 1;
      if (positive) el(parent, 'circle', { cx: 0, cy: 0, r, fill, stroke: ring, 'stroke-width': ringW });
      else el(parent, 'rect', { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: 2, fill, stroke: ring, 'stroke-width': ringW });
      label(parent, 0, 0.5, id, { size: fontSizes.xs, fill: colors.stateInk, anchor: 'middle', weight: '600' });
    }

    function drawThreshold(parent: Element, y: number): SVGGElement {
      const g = el(parent, 'g', {});
      el(g, 'line', { x1: rulerX - 6, y1: y, x2: leftEnd + 6, y2: y, stroke: colors.accent, 'stroke-width': 3, 'stroke-linecap': 'round' });
      el(g, 'path', {
        d: `M ${round(rulerX - 6)} ${round(y)} l -8 -6 l 0 12 z`,
        fill: colors.accent,
        stroke: colors.text,
        'stroke-width': 1,
      });
      return g;
    }

    /** 점은 (fpr, tpr) 자리에, 뱃지 · 셈은 shown 의 값으로 — 흐르는 동안 수는 앞 점의 것이다 */
    function drawMarker(parent: Element, scene: ThresholdSlidesScene, fpr: number, tpr: number, shown: RocPoint): void {
      if (scene.totals === null) throw new Error('threshold-slides-stage: 비율의 분모가 없다');
      const x = rocX(fpr);
      const y = rocY(tpr);
      el(parent, 'line', { x1: rocX0, y1: y, x2: x, y2: y, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      el(parent, 'line', { x1: x, y1: PLOT_BOTTOM, x2: x, y2: y, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      // 축 위의 두 뱃지 — 비율이 축을 따라 밀려 오른다
      el(parent, 'rect', { x: rocX0 - 44, y: y - 9, width: 38, height: 18, rx: 3, fill: colors.accent });
      label(parent, rocX0 - 25, y + 0.5, fmt(shown.tpr), { size: fontSizes.xs, fill: colors.stateInk, anchor: 'middle', weight: '600', mono: true });
      el(parent, 'rect', { x: x - 19, y: PLOT_BOTTOM + 5, width: 38, height: 18, rx: 3, fill: colors.accent });
      label(parent, x, PLOT_BOTTOM + 14.5, fmt(shown.fpr), { size: fontSizes.xs, fill: colors.stateInk, anchor: 'middle', weight: '600', mono: true });
      // 셈 — 개수와 비율을 식으로 가른다. ROC 가 잘 지나지 않는 오른쪽 아래에 판을 깔아 안내선을 가린다
      const monoW = parseFloat(fontSizes.sm) * 0.62;
      const panelW = Math.min(rocSize - 12, monoW * 30 + 16);
      el(parent, 'rect', { x: rocX1 - 4 - panelW, y: PLOT_BOTTOM - 44, width: panelW, height: 40, rx: 4, fill: colors.bg, stroke: colors.border });
      label(parent, rocX1 - 12, PLOT_BOTTOM - 33, t('readout.tpr', 'TPR = TP / P = {tp} / {p} = {v}', { tp: shown.tp, p: scene.totals.pos, v: fmt(shown.tpr) }), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'end',
        mono: true,
      });
      label(parent, rocX1 - 12, PLOT_BOTTOM - 15, t('readout.fpr', 'FPR = FP / N = {fp} / {n} = {v}', { fp: shown.fp, n: scene.totals.neg, v: fmt(shown.fpr) }), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'end',
        mono: true,
      });
      el(parent, 'circle', { cx: x, cy: y, r: 6, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 });
    }

    function segmentColor(a: RocPoint, b: RocPoint): string {
      const up = b.tp > a.tp;
      const right = b.fp > a.fp;
      if (up && right) return colors.text;
      return up ? posColor : negColor;
    }

    function drawSegment(parent: Element, a: RocPoint, b: RocPoint, bx: number, by: number, current: boolean): void {
      const x1 = rocX(a.fpr);
      const y1 = rocY(a.tpr);
      el(parent, 'line', { x1, y1, x2: bx, y2: by, stroke: segmentColor(a, b), 'stroke-width': current ? 4 : 3, 'stroke-linecap': 'round' });
      // 이 마디를 민 항목
      const up = b.tp > a.tp;
      const right = b.fp > a.fp;
      const mx = (x1 + rocX(b.fpr)) / 2;
      const my = (y1 + rocY(b.tpr)) / 2;
      const lx = up && !right ? mx - 10 : up && right ? mx - 10 : mx;
      const ly = right && !up ? my + 11 : up && right ? my - 8 : my;
      label(parent, lx, ly, b.ids.join(' · '), {
        size: fontSizes.xs,
        fill: current ? colors.text : colors.textMuted,
        anchor: up ? 'end' : 'middle',
        weight: current ? '600' : '400',
      });
    }

    function drawStatic(scene: ThresholdSlidesScene): void {
      svg.textContent = '';
      movingTokens = [];
      thresholdLayer = null;
      segmentLayer = null;
      markerLayer = null;
      const r = tokenR(scene);
      const step = scene.step;
      const currentIds = new Set(step?.ids ?? []);

      // ── 문안
      if (scene.threshold === null) {
        label(svg, PAD, 22, t('caption.start.head', 'Threshold: above every score'), { size: fontSizes.md, fill: colors.text, weight: '600' });
        label(svg, PAD, 42, t('caption.start.body', 'Nothing is called positive yet.'), { size: fontSizes.sm, fill: colors.textMuted });
      } else {
        if (step === null) throw new Error('threshold-slides-stage: 문턱은 있는데 이번 걸음이 없다');
        const last = scene.path[scene.path.length - 1];
        if (last === undefined) throw new Error('threshold-slides-stage: ROC 자취가 비었다');
        label(svg, PAD, 22, t('caption.head', 'Threshold: {tau} · Crossed: {ids}', { tau: fmt(step.threshold), ids: step.ids.join(' · ') }), {
          size: fontSizes.md,
          fill: colors.text,
          weight: '600',
        });
        const up = last.tp > step.from.tp;
        const right = last.fp > step.from.fp;
        const body =
          up && right
            ? t('caption.both', 'They share a score and cross together: TPR and FPR rise in one step.')
            : up
              ? t('caption.tp', 'Only true positives crossed: TPR rises, FPR stays.')
              : t('caption.fp', 'Only true negatives crossed: FPR rises, TPR stays.');
        label(svg, PAD, 42, body, { size: fontSizes.sm, fill: colors.textMuted });
        if (step.last) {
          label(svg, PAD, 60, t('caption.last', 'The threshold is at the lowest score: every item is called positive.'), {
            size: fontSizes.sm,
            fill: colors.textMuted,
          });
        }
      }

      // ── 왼쪽 판: 두 줄
      const laneTop = PLOT_TOP - 16;
      const laneBottom = PLOT_BOTTOM + 10;
      el(svg, 'rect', { x: negLaneX - laneW / 2, y: laneTop, width: laneW, height: laneBottom - laneTop, rx: 6, fill: colors.bgSubtle, stroke: colors.border });
      el(svg, 'rect', { x: posLaneX - laneW / 2, y: laneTop, width: laneW, height: laneBottom - laneTop, rx: 6, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 });
      label(svg, negLaneX, laneTop - 10, t('lane.negative', 'Called negative'), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      label(svg, posLaneX, laneTop - 10, t('lane.positive', 'Called positive'), { size: fontSizes.xs, fill: colors.text, anchor: 'middle', weight: '600' });

      // 점수 자
      el(svg, 'line', { x1: rulerX, y1: PLOT_TOP, x2: rulerX, y2: PLOT_BOTTOM, stroke: colors.border, 'stroke-width': 1 });
      label(svg, rulerX, laneTop - 10, t('axis.score', 'Score'), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' });
      for (const s of thresholdCandidates(scene.items)) {
        const y = yOfScore(s);
        const here = scene.threshold === s;
        el(svg, 'line', { x1: rulerX - 3, y1: y, x2: rulerX + 3, y2: y, stroke: colors.textMuted, 'stroke-width': 1 });
        if (here) el(svg, 'rect', { x: rulerX - 44, y: y - 8, width: 32, height: 16, rx: 3, fill: colors.accent });
        label(svg, rulerX - 14, y + 0.5, fmt(s), {
          size: fontSizes.xs,
          fill: here ? colors.stateInk : colors.textMuted,
          anchor: 'end',
          mono: true,
          weight: here ? '600' : '400',
        });
      }

      // 문턱 선
      thresholdLayer = drawThreshold(svg, scene.threshold === null ? startLineY : yOfScore(scene.threshold));

      // 항목 — 같은 점수는 한 줄 안에서 나란히
      const crossed = new Set(scene.crossed);
      const byScore = new Map<number, string[]>();
      for (const it of scene.items) byScore.set(it.score, [...(byScore.get(it.score) ?? []), it.id]);
      for (const it of scene.items) {
        const peers = byScore.get(it.score);
        if (peers === undefined) throw new Error(`threshold-slides-stage: 점수 자리가 없다 (${it.id})`);
        const j = peers.indexOf(it.id);
        const dx = (j - (peers.length - 1) / 2) * (2 * r + 4);
        const x = (crossed.has(it.id) ? posLaneX : negLaneX) + dx;
        const y = yOfScore(it.score);
        const g = el(svg, 'g', { transform: `translate(${round(x)} ${round(y)})` });
        drawToken(g, it.id, it.label === 1, r, currentIds.has(it.id));
        if (currentIds.has(it.id)) movingTokens.push({ g, x, y });
      }

      // 범례 — 모양과 색이 참 부류다. 줄 이름과 섞여 읽히지 않게 두 줄 밖 아래 행에 한데 모은다
      const legendY = PLOT_BOTTOM + 34;
      const xs = parseFloat(fontSizes.xs);
      const textW = (s: string): number => [...s].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? xs : xs * 0.6), 0);
      const legendTitle = t('legend.title', 'True class:');
      label(svg, PAD, legendY, legendTitle, { size: fontSizes.xs, fill: colors.textMuted });
      let lx = PAD + textW(legendTitle) + 12;
      const legendPos = t('legend.positive', 'Truly positive');
      const lp = el(svg, 'g', { transform: `translate(${round(lx)} ${legendY})` });
      drawToken(lp, '', true, 5, false);
      label(svg, lx + 9, legendY, legendPos, { size: fontSizes.xs, fill: colors.text });
      lx += 9 + textW(legendPos) + 16;
      const ln = el(svg, 'g', { transform: `translate(${round(lx)} ${legendY})` });
      drawToken(ln, '', false, 5, false);
      label(svg, lx + 9, legendY, t('legend.negative', 'Truly negative'), { size: fontSizes.xs, fill: colors.text });

      // ── 오른쪽 판: 두 비율의 평면
      el(svg, 'rect', { x: rocX0, y: PLOT_BOTTOM - rocSize, width: rocSize, height: rocSize, fill: 'none', stroke: colors.border });
      label(svg, rocX0, PLOT_BOTTOM - rocSize - 14, t('axis.tpr', 'True positive rate (TPR) ↑'), { size: fontSizes.xs, fill: colors.text, anchor: 'start' });
      label(svg, rocX1, PLOT_BOTTOM + 34, t('axis.fpr', 'False positive rate (FPR) →'), { size: fontSizes.xs, fill: colors.text, anchor: 'end' });
      if (scene.totals !== null) {
        const { pos, neg } = scene.totals;
        for (let k = 0; k <= neg; k += 1) {
          const x = rocX(k / neg);
          if (k > 0 && k < neg) el(svg, 'line', { x1: x, y1: PLOT_BOTTOM - rocSize, x2: x, y2: PLOT_BOTTOM, stroke: colors.border, 'stroke-width': 0.75 });
          label(svg, x, PLOT_BOTTOM + 14.5, fmt(k / neg), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle', mono: true });
        }
        for (let k = 0; k <= pos; k += 1) {
          const y = rocY(k / pos);
          if (k > 0 && k < pos) el(svg, 'line', { x1: rocX0, y1: y, x2: rocX1, y2: y, stroke: colors.border, 'stroke-width': 0.75 });
          label(svg, rocX0 - 8, y + 0.5, fmt(k / pos), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end', mono: true });
        }
      }

      // 자취 — 지나간 마디는 남는다
      const trail = el(svg, 'g', {});
      const settled = scene.path.length - (step === null ? 0 : 1);
      scene.path.forEach((b, i) => {
        const a = scene.path[i - 1];
        if (i === 0 || i >= settled) return;
        if (a === undefined) throw new Error(`threshold-slides-stage: ROC 자취 ${i - 1} 이 없다`);
        drawSegment(trail, a, b, rocX(b.fpr), rocY(b.tpr), false);
      });
      const tip = scene.path[scene.path.length - 1];
      segmentLayer = el(svg, 'g', {});
      if (step !== null) {
        if (tip === undefined) throw new Error('threshold-slides-stage: ROC 자취가 비었다');
        drawSegment(segmentLayer, step.from, tip, rocX(tip.fpr), rocY(tip.tpr), true);
      }
      markerLayer = el(svg, 'g', {});
      if (tip !== undefined) drawMarker(markerLayer, scene, tip.fpr, tip.tpr, tip);
    }

    function wait(mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(!destroyed && mine === gen);
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function flow(next: ThresholdSlidesScene, mine: number): Promise<void> {
      const step = next.step;
      const tip = next.path[next.path.length - 1];
      if (step === null || tip === undefined) throw new Error('threshold-slides-stage: 흐를 걸음이 없다');
      const threshold = thresholdLayer;
      const seg = segmentLayer;
      const marker = markerLayer;
      if (threshold === null || seg === null || marker === null) throw new Error('threshold-slides-stage: 흐를 층이 없다');
      if (movingTokens.length !== step.ids.length) throw new Error('threshold-slides-stage: 넘은 항목의 토큰을 다 찾지 못했다');
      const tokens = movingTokens;
      const fromY = step.fromThreshold === null ? startLineY : yOfScore(step.fromThreshold);
      const toY = yOfScore(step.threshold);
      const from = step.from;
      const laneGap = posLaneX - negLaneX;

      const frame = (u: number): void => {
        const drop = ease(Math.min(1, u / DROP_SHARE));
        const push = ease(Math.max(0, (u - DROP_SHARE) / (1 - DROP_SHARE)));
        // 문턱은 앞 자리에서 아직 못 내려온 만큼 위에
        threshold.setAttribute('transform', `translate(0 ${round((fromY - toY) * (1 - drop))})`);
        // 넘은 항목은 음성 줄에서 아직 못 건너온 만큼 왼쪽에
        for (const tk of tokens) tk.g.setAttribute('transform', `translate(${round(tk.x - laneGap * (1 - push))} ${round(tk.y)})`);
        // 점은 앞 점에서 밀려 간 만큼
        const fpr = from.fpr + (tip.fpr - from.fpr) * push;
        const tpr = from.tpr + (tip.tpr - from.tpr) * push;
        seg.textContent = '';
        if (push > 0) drawSegment(seg, from, tip, rocX(fpr), rocY(tpr), true);
        marker.textContent = '';
        drawMarker(marker, next, fpr, tpr, push < 1 ? from : tip);
      };

      const frames = Math.ceil(MOTION_MS / FRAME_MS);
      frame(0);
      for (let i = 1; i <= frames; i += 1) {
        if (!(await wait(mine))) return;
        frame(i / frames);
      }
    }

    return {
      async render(next: ThresholdSlidesScene, _prev: ThresholdSlidesScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await flow(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
