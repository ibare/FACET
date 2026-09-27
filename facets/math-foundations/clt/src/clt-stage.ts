/**
 * clt-stage — 위에 모집단 막대 여섯(눈 1..6, 높이 = 무게), 아래에 평균 칸 열하나(1.0 … 6.0).
 *
 * 두 줄은 가로 자가 같다 — 위의 눈 k 와 아래의 칸 가운데 k 가 같은 x 에 선다. 그래서 위의 μ 선 · ±σ 틀과
 * 아래의 평균들의 평균 · ±폭이 한 자로 견줘진다.
 *
 * 운동 (길이는 projector 가 그때그때 `motionMs / 속도` 로 넘긴다):
 * - setPopulation — 위 막대 여섯이 새 무게로 모양을 바꾸고 μ 선 · ±σ 틀이 새 자리로 미끄러진다.
 *   아래 칸은 앞 판의 막대를 흐린 자리로 남긴다 (글자 · 표지는 걷는다)
 * - showOneMean — 첫 평균의 눈 n 개가 위 막대에서 나와 한 줄로 서고, 그 평균 점 하나가 제 칸 자리로 간다
 * - showCounts — 흐린 칸 막대 열하나가 새 높이로 옮겨 가며 진해진다
 * - showMean — μ 자리에서 내려온 표지가 아래 축의 평균들의 평균 자리로 미끄러진다
 * - showSpread — 위의 ±σ 틀의 사본이 아래로 내려와 ±폭 자리로 옮겨 간다
 *
 * 무대는 셈하지 않는다 — 높이 · 평균 · 폭 · 축척은 payload 로 받고 그 사이를 보간할 뿐이다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 640;
const H = 500;
const PAD = 40;
/** 가로 자 — 0.5 … 6.5 를 캔버스 폭에 편다. */
const X_MIN = 0.5;
const X_MAX = 6.5;
const UNIT = (W - 2 * PAD) / (X_MAX - X_MIN);

const HEADER_Y = 18;
const TOP_BASE = 150;
const TOP_H = 96;
const FACE_LABEL_Y = 166;
const SIGMA_Y = 184;
const ROW_Y = 206;
const ROW_GAP = 22;
const CHIPS_PER_ROW = 15;
const CHIP_W = 16;
const CHIP_H = 18;
const CHIP_STEP = 20;
const CAPTION_Y = 258;
const BIN_BASE = 410;
const BIN_H = 124;
const AXIS_LABEL_Y = 426;
const MARK_Y = 440;
const SPREAD_Y = 452;
const MEAN_TEXT_Y = 474;
const SPREAD_TEXT_Y = 494;
const FADED = 0.22;
const FACES = 6;
const BINS = 11;

const xOf = (value: number): number => PAD + (value - X_MIN) * UNIT;

export type CltPopulationView = {
  popId: string;
  weights: number[];
  mu: number;
  sigma: number;
  n: number;
  weightMax: number;
  countMax: number;
  durMs: number;
};
export type CltOneMeanView = { faces: number[]; sum: number; n: number; oneMean: number; binCenter: number; durMs: number };
export type CltCountsView = { counts: number[]; means: number; peaks: number; tallest: number; durMs: number };
export type CltMeanView = { mean: number; mu: number; durMs: number };
export type CltSpreadView = { spread: number; sigma: number; n: number; theory: number; mean: number; durMs: number };

/** projector 가 부르는 무대의 구조적 표면 (C9). */
export type CltStage = {
  setPopulation(p: CltPopulationView): void;
  showOneMean(p: CltOneMeanView): void;
  showCounts(p: CltCountsView): void;
  showMean(p: CltMeanView): void;
  showSpread(p: CltSpreadView): void;
  reset(): void;
  destroy(): void;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const fmt2 = (x: number): string => x.toFixed(2);

function popName(t: Translate, id: string): string {
  switch (id) {
    case 'uniform':
      return t('label.pop.uniform', 'Fair die');
    case 'maxOfTwo':
      return t('label.pop.maxOfTwo', 'Larger of two');
    case 'skewed':
      return t('label.pop.skewed', 'Skewed');
    case 'twoPeaks':
      return t('label.pop.twoPeaks', 'Both ends');
    default:
      throw new Error(`clt-stage: 모르는 모집단 ${id}`);
  }
}

function requireCounts(xs: number[], len: number, what: string): void {
  if (xs.length !== len || !xs.every((x) => Number.isFinite(x) && x >= 0)) throw new Error(`clt-stage: ${what} 모양이 어긋났다`);
}

export const cltStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const root = el('g', {}, svg);

    const text = (x: number, y: number, anchor: 'start' | 'middle' | 'end', size: string, fill: string, parent: Element = root) =>
      el('text', { x, y, 'text-anchor': anchor, 'font-family': fonts.body, 'font-size': size, fill }, parent);

    // ── 고정 요소 (마운트에서 한 번 — 첫 그림을 몇 번 먹여도 요소 수가 같다) ─────────
    const headerLeft = text(PAD, HEADER_Y, 'start', fontSizes.md, pal.text);
    const headerRight = text(W - PAD, HEADER_Y, 'end', fontSizes.md, pal.text);
    const weightAxis = text(8, 40, 'start', fontSizes.xs, pal.textMuted);
    weightAxis.textContent = t('label.weightAxis', 'weight / 36');
    const meansAxis = text(8, BIN_BASE - BIN_H - 12, 'start', fontSizes.xs, pal.textMuted);
    meansAxis.textContent = t('label.meansAxis', 'means per bin');

    el('line', { x1: PAD, y1: TOP_BASE, x2: W - PAD, y2: TOP_BASE, stroke: pal.border }, root);
    const topBars: SVGRectElement[] = [];
    const topLabels: SVGTextElement[] = [];
    const barW = UNIT * 0.62;
    for (let k = 1; k <= FACES; k++) {
      topBars.push(el('rect', { x: xOf(k) - barW / 2, y: TOP_BASE, width: barW, height: 0, fill: pal.textMuted, rx: 2 }, root));
      topLabels.push(text(xOf(k), TOP_BASE - 4, 'middle', fontSizes.xs, pal.text));
      text(xOf(k), FACE_LABEL_Y, 'middle', fontSizes.sm, pal.textMuted).textContent = String(k);
    }
    const muLine = el('line', { x1: 0, y1: 44, x2: 0, y2: SIGMA_Y, stroke: pal.accent, 'stroke-width': 2.5, 'stroke-dasharray': '5 3', visibility: 'hidden' }, root);
    const sigmaBand = el('g', { visibility: 'hidden' }, root);
    const sigmaLine = el('line', { x1: 0, y1: SIGMA_Y, x2: 0, y2: SIGMA_Y, stroke: pal.itemComparing, 'stroke-width': 3 }, sigmaBand);
    const sigmaTickL = el('line', { x1: 0, y1: SIGMA_Y - 6, x2: 0, y2: SIGMA_Y + 6, stroke: pal.itemComparing, 'stroke-width': 2 }, sigmaBand);
    const sigmaTickR = el('line', { x1: 0, y1: SIGMA_Y - 6, x2: 0, y2: SIGMA_Y + 6, stroke: pal.itemComparing, 'stroke-width': 2 }, sigmaBand);
    const sigmaLabel = text(0, SIGMA_Y + 4, 'start', fontSizes.xs, pal.itemComparing, sigmaBand);
    sigmaLabel.textContent = t('label.sigmaBand', 'μ ± σ');

    const chipLayer = el('g', {}, root);
    const caption = text(W / 2, CAPTION_Y, 'middle', fontSizes.sm, pal.text);

    // 평균 표지는 칸 막대 · 개수 글자보다 먼저 만들어 뒤에 깐다 — 선이 글자를 가로지르지 않게
    const markLine = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: pal.accent, 'stroke-width': 2.5, visibility: 'hidden' }, root);
    const markHead = el('path', { d: '', fill: pal.accent, stroke: pal.text, 'stroke-width': 1, visibility: 'hidden' }, root);

    const binW = UNIT * 0.5 - 6;
    const bins: SVGRectElement[] = [];
    const binLabels: SVGTextElement[] = [];
    for (let j = 0; j < BINS; j++) {
      const cx = xOf(1 + 0.5 * j);
      bins.push(el('rect', { x: cx - binW / 2, y: BIN_BASE, width: binW, height: 0, fill: pal.primary, opacity: FADED }, root));
      binLabels.push(text(cx, BIN_BASE - 4, 'middle', fontSizes.xs, pal.text));
      el('line', { x1: cx, y1: BIN_BASE, x2: cx, y2: BIN_BASE + (j % 2 === 0 ? 6 : 3), stroke: pal.textMuted }, root);
      if (j % 2 === 0) text(cx, AXIS_LABEL_Y, 'middle', fontSizes.xs, pal.textMuted).textContent = (1 + 0.5 * j).toFixed(1);
    }
    el('line', { x1: PAD, y1: BIN_BASE, x2: W - PAD, y2: BIN_BASE, stroke: pal.textMuted }, root);

    const dot = el('circle', { cx: 0, cy: 0, r: 6, fill: pal.itemComparing, stroke: pal.bg, 'stroke-width': 1.5, visibility: 'hidden' }, root);


    const spreadBand = el('g', { visibility: 'hidden' }, root);
    const spreadLine = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: pal.itemComparing, 'stroke-width': 3 }, spreadBand);
    const spreadTickL = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: pal.itemComparing, 'stroke-width': 2 }, spreadBand);
    const spreadTickR = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: pal.itemComparing, 'stroke-width': 2 }, spreadBand);
    const spreadLabel = text(0, 0, 'start', fontSizes.xs, pal.itemComparing, spreadBand);
    spreadLabel.textContent = t('label.spreadBand', '± spread');

    const meanText = text(W / 2, MEAN_TEXT_Y, 'middle', fontSizes.sm, pal.text);
    const spreadText = text(W / 2, SPREAD_TEXT_Y, 'middle', fontSizes.sm, pal.text);

    // ── 운동의 기억 (자리 · 높이) ────────────────────────────────────────
    const topH = new Array<number>(FACES).fill(0);
    const binH = new Array<number>(BINS).fill(0);
    let binOpacity = FADED;
    let mu: number | null = null;
    let sigma = 0;

    // ── 운동 도구 ───────────────────────────────────────────────────────
    type Frame = { id: number; finish: () => void };
    const frames = new Map<string, Frame>();
    const stop = (key: string): void => {
      const f = frames.get(key);
      if (!f) return;
      cancelAnimationFrame(f.id);
      frames.delete(key);
    };
    const stopAll = (finish: boolean): void => {
      for (const f of frames.values()) {
        cancelAnimationFrame(f.id);
        if (finish) f.finish();
      }
      frames.clear();
    };
    const tween = (key: string, durMs: number, draw: (p: number) => void): void => {
      stop(key);
      if (!(durMs > 0) || isInstant()) {
        draw(1);
        return;
      }
      const start = performance.now();
      const frame: Frame = { id: 0, finish: () => draw(1) };
      const tick = (now: number): void => {
        const raw = Math.min(1, (now - start) / durMs);
        draw(ease(raw));
        if (raw < 1) frame.id = requestAnimationFrame(tick);
        else frames.delete(key);
      };
      frame.id = requestAnimationFrame(tick);
      frames.set(key, frame);
    };
    params.onScrubStart?.(() => stopAll(true));

    // ── 그리기 ──────────────────────────────────────────────────────────
    const drawTop = (weights: readonly number[] | null): void => {
      for (let k = 0; k < FACES; k++) {
        const h = topH[k]!;
        topBars[k]!.setAttribute('y', String(TOP_BASE - h));
        topBars[k]!.setAttribute('height', String(h));
        topLabels[k]!.setAttribute('y', String(TOP_BASE - h - 4));
        topLabels[k]!.textContent = weights ? String(weights[k]) : '';
      }
    };
    const drawBand = (m: number, s: number): void => {
      const x = xOf(m);
      muLine.setAttribute('x1', String(x));
      muLine.setAttribute('x2', String(x));
      const a = xOf(m - s);
      const b = xOf(m + s);
      sigmaLine.setAttribute('x1', String(a));
      sigmaLine.setAttribute('x2', String(b));
      sigmaTickL.setAttribute('x1', String(a));
      sigmaTickL.setAttribute('x2', String(a));
      sigmaTickR.setAttribute('x1', String(b));
      sigmaTickR.setAttribute('x2', String(b));
      sigmaLabel.setAttribute('x', String(b + 6));
    };
    const drawBins = (): void => {
      for (let j = 0; j < BINS; j++) {
        const h = binH[j]!;
        bins[j]!.setAttribute('y', String(BIN_BASE - h));
        bins[j]!.setAttribute('height', String(h));
        bins[j]!.setAttribute('opacity', String(binOpacity));
        binLabels[j]!.setAttribute('y', String(BIN_BASE - h - 4));
      }
    };
    const drawSpread = (y: number, m: number, s: number): void => {
      const a = xOf(m - s);
      const b = xOf(m + s);
      for (const ln of [spreadLine]) {
        ln.setAttribute('x1', String(a));
        ln.setAttribute('x2', String(b));
        ln.setAttribute('y1', String(y));
        ln.setAttribute('y2', String(y));
      }
      for (const [tick, x] of [
        [spreadTickL, a],
        [spreadTickR, b],
      ] as const) {
        tick.setAttribute('x1', String(x));
        tick.setAttribute('x2', String(x));
        tick.setAttribute('y1', String(y - 6));
        tick.setAttribute('y2', String(y + 6));
      }
      spreadLabel.setAttribute('x', String(b + 6));
      spreadLabel.setAttribute('y', String(y + 4));
    };
    const drawMark = (x: number, y1: number, y2: number): void => {
      markLine.setAttribute('x1', String(x));
      markLine.setAttribute('x2', String(x));
      markLine.setAttribute('y1', String(y1));
      markLine.setAttribute('y2', String(y2));
      const hy = y2 + 4;
      markHead.setAttribute('d', `M ${x} ${hy} L ${x - 6} ${hy + 10} L ${x + 6} ${hy + 10} Z`);
    };

    /** 판의 결론(글자 · 표지 · 눈 · 점)을 걷는다. 옮겨 갈 자리(칸 높이 · 위 막대)는 남긴다. */
    const clearConclusions = (): void => {
      while (chipLayer.firstChild) chipLayer.removeChild(chipLayer.firstChild);
      dot.setAttribute('visibility', 'hidden');
      markLine.setAttribute('visibility', 'hidden');
      markHead.setAttribute('visibility', 'hidden');
      spreadBand.setAttribute('visibility', 'hidden');
      caption.textContent = '';
      meanText.textContent = '';
      spreadText.textContent = '';
      for (const lb of binLabels) lb.textContent = '';
    };

    let countMaxNow = 0;

    const stage: CltStage = {
      setPopulation(p) {
        requireCounts(p.weights, FACES, '무게');
        if (!(p.weightMax > 0) || !(p.countMax > 0)) throw new Error('clt-stage: 축척이 비었다');
        stopAll(false);
        clearConclusions();
        countMaxNow = p.countMax;
        // 아래 칸 — 앞 판의 막대를 흐린 자리로
        binOpacity = FADED;
        drawBins();

        headerLeft.textContent = t('stage.header', '{pop} · n = {n}', { pop: popName(t, p.popId), n: p.n });
        headerRight.textContent = t('stage.popStats', 'μ {mu} · σ {sigma}', { mu: fmt2(p.mu), sigma: fmt2(p.sigma) });

        const fromH = [...topH];
        const toH = p.weights.map((w) => (w / p.weightMax) * TOP_H);
        const fromMu = mu === null ? p.mu : mu;
        const fromSigma = mu === null ? p.sigma : sigma;
        muLine.setAttribute('visibility', 'visible');
        sigmaBand.setAttribute('visibility', 'visible');
        const weights = [...p.weights];
        tween('top', p.durMs, (e) => {
          for (let k = 0; k < FACES; k++) topH[k] = lerp(fromH[k]!, toH[k]!, e);
          mu = lerp(fromMu, p.mu, e);
          sigma = lerp(fromSigma, p.sigma, e);
          drawTop(weights);
          drawBand(mu, sigma);
        });
      },

      showOneMean(p) {
        if (p.faces.length !== p.n || !p.faces.every((f) => Number.isInteger(f) && f >= 1 && f <= FACES)) {
          throw new Error('clt-stage: 눈 목록이 어긋났다');
        }
        while (chipLayer.firstChild) chipLayer.removeChild(chipLayer.firstChild);
        const rows = p.n > CHIPS_PER_ROW ? 2 : 1;
        const perRow = Math.ceil(p.n / rows);
        const chips = p.faces.map((face, i) => {
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          const inRow = row === rows - 1 ? p.n - perRow * (rows - 1) : perRow;
          const tx = W / 2 - ((inRow - 1) * CHIP_STEP) / 2 + col * CHIP_STEP;
          const ty = ROW_Y + row * ROW_GAP;
          const g = el('g', {}, chipLayer);
          el('rect', { x: -CHIP_W / 2, y: -CHIP_H / 2, width: CHIP_W, height: CHIP_H, rx: 3, fill: pal.bgSubtle, stroke: pal.textMuted }, g);
          const tt = text(0, 4, 'middle', fontSizes.xs, pal.text, g);
          tt.textContent = String(face);
          const sx = xOf(face);
          const sy = TOP_BASE - topH[face - 1]! + CHIP_H / 2;
          return { g, sx, sy, tx, ty };
        });
        caption.textContent = t('caption.oneMean', 'sum {sum} · {sum}/{n} = {mean}', { sum: p.sum, n: p.n, mean: fmt2(p.oneMean) });
        const dotFromY = ROW_Y + (rows - 1) * ROW_GAP + CHIP_H;
        const dotToX = xOf(p.binCenter);
        const dotToY = BIN_BASE - 7;
        dot.setAttribute('visibility', 'hidden');
        tween('one', p.durMs, (e) => {
          const a = Math.min(1, e / 0.6);
          for (const c of chips) c.g.setAttribute('transform', `translate(${lerp(c.sx, c.tx, a)} ${lerp(c.sy, c.ty, a)})`);
          if (e >= 0.6) {
            const b = (e - 0.6) / 0.4;
            dot.setAttribute('visibility', 'visible');
            dot.setAttribute('cx', String(lerp(W / 2, dotToX, b)));
            dot.setAttribute('cy', String(lerp(dotFromY, dotToY, b)));
          }
        });
      },

      showCounts(p) {
        requireCounts(p.counts, BINS, '칸 개수');
        if (!(countMaxNow > 0)) throw new Error('clt-stage: 판 머리 없이 칸이 왔다');
        caption.textContent = t('caption.counts', '{means} means · peaks {peaks} · tallest bin {tallest}', {
          means: p.means,
          peaks: p.peaks,
          tallest: p.tallest,
        });
        p.counts.forEach((c, j) => {
          binLabels[j]!.textContent = c > 0 ? String(c) : '';
        });
        const fromH = [...binH];
        const toH = p.counts.map((c) => (c / countMaxNow) * BIN_H);
        const fromO = binOpacity;
        tween('bins', p.durMs, (e) => {
          for (let j = 0; j < BINS; j++) binH[j] = lerp(fromH[j]!, toH[j]!, e);
          binOpacity = lerp(fromO, 1, e);
          drawBins();
        });
      },

      showMean(p) {
        if (!Number.isFinite(p.mean) || !Number.isFinite(p.mu)) throw new Error('clt-stage: 평균이 비었다');
        meanText.textContent = t('caption.mean', 'mean of means {mean} · μ {mu}', { mean: fmt2(p.mean), mu: fmt2(p.mu) });
        markLine.setAttribute('visibility', 'visible');
        markHead.setAttribute('visibility', 'visible');
        const fromX = xOf(p.mu);
        const toX = xOf(p.mean);
        tween('mark', p.durMs, (e) => {
          drawMark(lerp(fromX, toX, e), lerp(44, BIN_BASE - BIN_H, e), lerp(TOP_BASE, MARK_Y - 14, e));
        });
      },

      showSpread(p) {
        if (!Number.isFinite(p.spread) || !Number.isFinite(p.theory)) throw new Error('clt-stage: 폭이 비었다');
        spreadText.textContent = t('caption.spread', 'spread {spread} · σ/√n = {sigma}/√{n} = {theory}', {
          spread: fmt2(p.spread),
          sigma: fmt2(p.sigma),
          n: p.n,
          theory: fmt2(p.theory),
        });
        if (mu === null) throw new Error('clt-stage: 판 머리 없이 폭이 왔다');
        const fromMu = mu;
        const fromSigma = sigma;
        spreadBand.setAttribute('visibility', 'visible');
        tween('spread', p.durMs, (e) => {
          drawSpread(lerp(SIGMA_Y, SPREAD_Y, e), lerp(fromMu, p.mean, e), lerp(fromSigma, p.spread, e));
        });
      },

      reset() {
        stopAll(false);
        clearConclusions();
        topH.fill(0);
        binH.fill(0);
        binOpacity = FADED;
        mu = null;
        sigma = 0;
        countMaxNow = 0;
        drawTop(null);
        drawBins();
        muLine.setAttribute('visibility', 'hidden');
        sigmaBand.setAttribute('visibility', 'hidden');
        headerLeft.textContent = '';
        headerRight.textContent = '';
      },

      destroy() {
        stopAll(false);
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return stage;
  },
};
