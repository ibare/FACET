/**
 * diffusion 무대 — 평면 하나에 자료 둘(P · Q)과 표본 다섯.
 *
 * 운동
 *   - t 걸음: 예측 x̂₀ 표지(옅은 점)가 P–Q 선분 위에서 끌려가고, 이어 표본이 x_t → x_{t−1} 로 내려서며 자국 마디를 하나 남긴다
 *   - 판 머리: 앞 판의 끝점에서 x_T 로 되돌아간다 (자국 · 닿음 표지 · 결론 글자는 걷는다)
 *   - 끝 걸음: 닿은 표본에 고리가 조여 든다
 * 무대는 셈하지 않는다 — 자리 · 거리 · 닿음 여부 · 평면 범위는 모두 payload 로 받는다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 476;
const BOX = { left: 50, top: 44, width: 540, height: 360 };
const CHIP_Y = 432;
const DOT_R = 10;
const PRED_R = 5;
const RING_R = 12;
const FAN_R = 30;
const FAN_SPREAD_DEG = 52;

export type Pt = [number, number];
export type PlaneInit = {
  plane: { xMin: number; xMax: number; yMin: number; yMax: number };
  dataP: Pt;
  dataQ: Pt;
  sampleCount: number;
};
export type RoundStart = { steps: number; beta: number; xT: Pt[]; motionMs: number };
export type ReverseStep = { tIndex: number; tNext: number; x0Hat: Pt[]; xPrev: Pt[]; motionMs: number };
export type SettleRead = {
  distance: number[];
  nearest: ('P' | 'Q')[];
  reached: boolean[];
  reachedCount: number;
  motionMs: number;
};

export type DiffusionStage = ViewInstance & {
  init(p: PlaneInit): void;
  startRound(p: RoundStart): void;
  reverseStep(p: ReverseStep): void;
  settle(p: SettleRead): void;
  clear(): void;
};

/** 표시 — 셈값은 건드리지 않고 글자만 자른다. 음수는 U+2212, 0 이 되는 음수는 0.00. */
export function formatNumber(value: number, digits: number): string {
  const s = value.toFixed(digits);
  if (s.startsWith('-')) {
    const body = s.slice(1);
    return Number(body) === 0 ? body : `−${body}`;
  }
  return s;
}

type SampleEls = {
  color: string;
  trail: SVGPolylineElement;
  nodes: SVGGElement;
  link: SVGLineElement;
  pred: SVGCircleElement;
  dot: SVGGElement;
  ring: SVGCircleElement;
  chipText: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const easeInOut = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

type Tween = { finish(): void; cancel(): void };

function runTween(durationMs: number, tick: (p: number) => void): Tween {
  const raf =
    typeof globalThis.requestAnimationFrame === 'function'
      ? (cb: (now: number) => void) => globalThis.requestAnimationFrame(cb)
      : (cb: (now: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  const caf =
    typeof globalThis.cancelAnimationFrame === 'function'
      ? (id: number) => globalThis.cancelAnimationFrame(id)
      : (id: number) => clearTimeout(id);
  let done = false;
  let handle = 0;
  let start: number | null = null;
  const frame = (now: number): void => {
    if (done) return;
    if (start === null) start = now;
    const p = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
    tick(p);
    if (p >= 1) {
      done = true;
      return;
    }
    handle = raf(frame);
  };
  tick(0);
  handle = raf(frame);
  return {
    finish() {
      if (done) return;
      done = true;
      caf(handle);
      tick(1);
    },
    cancel() {
      done = true;
      caf(handle);
    },
  };
}

export const diffusionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }): DiffusionStage {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, root);
    const planeLayer = el('g', {}, root);
    const trailLayer = el('g', {}, root);
    const predLayer = el('g', {}, root);
    const dotLayer = el('g', {}, root);

    const captionLeft = el(
      'text',
      { x: BOX.left, y: 26, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md },
      root,
    );
    const captionRight = el(
      'text',
      {
        x: BOX.left + BOX.width,
        y: 26,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        'text-anchor': 'end',
      },
      root,
    );
    const chipLayer = el('g', {}, root);

    let plane: PlaneInit['plane'] | null = null;
    let samples: SampleEls[] = [];
    let pos: Pt[] = [];
    /** 화면 픽셀 어긋남 — 같은 자료에 닿은 표본끼리 겹치지 않게 끝 걸음에서 부챗살로 벌린다. 셈값(pos)은 그대로. */
    let fan: Pt[] = [];
    let predPos: (Pt | null)[] = [];
    let trails: Pt[][] = [];
    let tween: Tween | null = null;

    const sx = (x: number): number => {
      if (!plane) throw new Error('diffusion-stage: 평면이 아직 없다');
      return BOX.left + ((x - plane.xMin) / (plane.xMax - plane.xMin)) * BOX.width;
    };
    const sy = (y: number): number => {
      if (!plane) throw new Error('diffusion-stage: 평면이 아직 없다');
      return BOX.top + ((plane.yMax - y) / (plane.yMax - plane.yMin)) * BOX.height;
    };
    const lerp = (a: Pt, b: Pt, p: number): Pt => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];

    const settleTween = (): void => {
      if (tween) tween.finish();
      tween = null;
    };

    const placeDot = (i: number, p: Pt): void => {
      const s = samples[i];
      if (!s) throw new Error(`diffusion-stage: 표본 ${i + 1} 이 없다`);
      const off = fan[i];
      if (!off) throw new Error(`diffusion-stage: 표본 ${i + 1} 의 자리 어긋남이 없다`);
      const px = sx(p[0]) + off[0];
      const py = sy(p[1]) + off[1];
      s.dot.setAttribute('transform', `translate(${px},${py})`);
      s.ring.setAttribute('cx', String(px));
      s.ring.setAttribute('cy', String(py));
    };
    const drawTrail = (i: number, pts: Pt[]): void => {
      const s = samples[i];
      if (!s) throw new Error(`diffusion-stage: 표본 ${i + 1} 이 없다`);
      s.trail.setAttribute('points', pts.map((q) => `${sx(q[0])},${sy(q[1])}`).join(' '));
    };
    const drawPred = (i: number, p: Pt | null, from: Pt): void => {
      const s = samples[i];
      if (!s) throw new Error(`diffusion-stage: 표본 ${i + 1} 이 없다`);
      if (p === null) {
        s.pred.setAttribute('visibility', 'hidden');
        s.link.setAttribute('visibility', 'hidden');
        return;
      }
      s.pred.setAttribute('visibility', 'visible');
      s.link.setAttribute('visibility', 'visible');
      s.pred.setAttribute('cx', String(sx(p[0])));
      s.pred.setAttribute('cy', String(sy(p[1])));
      s.link.setAttribute('x1', String(sx(from[0])));
      s.link.setAttribute('y1', String(sy(from[1])));
      s.link.setAttribute('x2', String(sx(p[0])));
      s.link.setAttribute('y2', String(sy(p[1])));
    };
    const checkCount = (n: number, what: string): void => {
      if (n !== samples.length) throw new Error(`diffusion-stage: ${what} 의 표본 수 ${n} 가 ${samples.length} 와 다르다`);
    };

    const clearConclusions = (): void => {
      captionRight.textContent = '';
      for (const s of samples) {
        s.ring.setAttribute('visibility', 'hidden');
        s.chipText.textContent = '';
        while (s.nodes.firstChild) s.nodes.removeChild(s.nodes.firstChild);
        s.trail.setAttribute('points', '');
        s.pred.setAttribute('visibility', 'hidden');
        s.link.setAttribute('visibility', 'hidden');
      }
    };

    const addNode = (i: number, p: Pt, color: string): void => {
      const s = samples[i];
      if (!s) throw new Error(`diffusion-stage: 표본 ${i + 1} 이 없다`);
      el('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 2.5, fill: color }, s.nodes);
    };

    const api: DiffusionStage = {
      init(p) {
        settleTween();
        plane = { ...p.plane };
        for (const layer of [planeLayer, trailLayer, predLayer, dotLayer, chipLayer]) {
          while (layer.firstChild) layer.removeChild(layer.firstChild);
        }
        captionLeft.textContent = '';
        captionRight.textContent = '';
        // 평면 틀과 축
        el(
          'rect',
          { x: BOX.left, y: BOX.top, width: BOX.width, height: BOX.height, fill: colors.bgSubtle, stroke: colors.border },
          planeLayer,
        );
        if (plane.xMin < 0 && plane.xMax > 0) {
          el('line', { x1: sx(0), y1: BOX.top, x2: sx(0), y2: BOX.top + BOX.height, stroke: colors.border }, planeLayer);
        }
        if (plane.yMin < 0 && plane.yMax > 0) {
          el('line', { x1: BOX.left, y1: sy(0), x2: BOX.left + BOX.width, y2: sy(0), stroke: colors.border }, planeLayer);
        }
        // P–Q 선분 — 예측 x̂₀ 가 놓이는 자리
        el(
          'line',
          {
            x1: sx(p.dataP[0]),
            y1: sy(p.dataP[1]),
            x2: sx(p.dataQ[0]),
            y2: sy(p.dataQ[1]),
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          },
          planeLayer,
        );
        const dataMark = (pt: Pt, label: string, dx: number, dy: number): void => {
          const g = el('g', { transform: `translate(${sx(pt[0])},${sy(pt[1])})` }, planeLayer);
          el('rect', { x: -9, y: -9, width: 18, height: 18, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 }, g);
          el('circle', { cx: 0, cy: 0, r: 2.5, fill: colors.text }, g);
          const tx = el(
            'text',
            {
              x: dx,
              y: dy,
              fill: colors.text,
              'font-family': fonts.body,
              'font-size': fontSizes.lg,
              'font-weight': 700,
              'text-anchor': 'middle',
            },
            g,
          );
          tx.textContent = label;
        };
        // 이름표는 옆으로 — 위아래는 닿은 표본이 벌어설 자리다
        dataMark(p.dataP, t('label.dataP', 'P'), -22, smPx * 0.4);
        dataMark(p.dataQ, t('label.dataQ', 'Q'), 22, smPx * 0.4);

        const palette = categorical(p.sampleCount, 'vivid');
        samples = [];
        pos = [];
        fan = [];
        predPos = [];
        trails = [];
        const chipGap = BOX.width / p.sampleCount;
        for (let i = 0; i < p.sampleCount; i += 1) {
          const color = palette[i];
          if (color === undefined) throw new Error('diffusion-stage: 표본 색이 모자란다');
          const trail = el(
            'polyline',
            { points: '', fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-opacity': 0.75 },
            trailLayer,
          );
          const nodes = el('g', {}, trailLayer);
          const link = el(
            'line',
            { stroke: color, 'stroke-width': 1, 'stroke-dasharray': '2 3', 'stroke-opacity': 0.7, visibility: 'hidden' },
            predLayer,
          );
          const pred = el(
            'circle',
            { r: PRED_R, fill: color, 'fill-opacity': 0.4, stroke: color, 'stroke-width': 1.2, visibility: 'hidden' },
            predLayer,
          );
          const ring = el(
            'circle',
            { r: RING_R, fill: 'none', stroke: colors.text, 'stroke-width': 2.5, visibility: 'hidden' },
            dotLayer,
          );
          const dot = el('g', {}, dotLayer);
          el('circle', { r: DOT_R, fill: color, stroke: colors.bg, 'stroke-width': 1.5 }, dot);
          const num = el(
            'text',
            {
              y: smPx * 0.36,
              fill: colors.textInverse,
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              'font-weight': 700,
              'text-anchor': 'middle',
            },
            dot,
          );
          num.textContent = String(i + 1);
          dot.setAttribute('visibility', 'hidden');
          // 번호 칩 — 판을 거듭해도 같은 번호가 같은 자리
          const cx = BOX.left + chipGap * i + 14;
          el('circle', { cx, cy: CHIP_Y, r: 9, fill: color }, chipLayer);
          const chipNum = el(
            'text',
            {
              x: cx,
              y: CHIP_Y + smPx * 0.36,
              fill: colors.textInverse,
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              'font-weight': 700,
              'text-anchor': 'middle',
            },
            chipLayer,
          );
          chipNum.textContent = String(i + 1);
          const chipText = el(
            'text',
            {
              x: cx + 16,
              y: CHIP_Y + smPx * 0.36,
              fill: colors.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
            },
            chipLayer,
          );
          samples.push({ color, trail, nodes, link, pred, dot, ring, chipText });
          pos.push([0, 0]);
          fan.push([0, 0]);
          predPos.push(null);
          trails.push([]);
        }
        const legend = el(
          'text',
          {
            x: BOX.left,
            y: CHIP_Y + 30,
            fill: colors.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          },
          chipLayer,
        );
        legend.textContent = t('label.legend', 'Pale dot = prediction x̂₀ · line = path so far · ring = reached a datum');
      },

      startRound(p) {
        if (!plane) throw new Error('diffusion-stage: init 전에 startRound');
        checkCount(p.xT.length, 'xT');
        settleTween();
        clearConclusions();
        captionLeft.textContent = t('caption.round', 'T = {steps} passes · β = {beta}', {
          steps: p.steps,
          beta: formatNumber(p.beta, 3),
        });
        captionRight.textContent = t('caption.start', 'Start: noise x_T');
        const from = pos.map((q): Pt => [q[0], q[1]]);
        const fanFrom = fan.map((q): Pt => [q[0], q[1]]);
        const first = samples.every((s) => s.dot.getAttribute('visibility') === 'hidden');
        for (let i = 0; i < samples.length; i += 1) {
          predPos[i] = null;
          const target = p.xT[i];
          if (!target) throw new Error('diffusion-stage: xT 가 비었다');
          trails[i] = [[target[0], target[1]]];
          samples[i]!.dot.setAttribute('visibility', 'visible');
        }
        const targets = p.xT;
        // 앞 판의 끝점에서 x_T 로 되돌아간다
        tween = runTween(first ? 0 : p.motionMs, (raw) => {
          const e = easeInOut(raw);
          for (let i = 0; i < samples.length; i += 1) {
            const q = lerp(from[i]!, targets[i]!, e);
            pos[i] = q;
            fan[i] = lerp(fanFrom[i]!, [0, 0], e);
            placeDot(i, q);
          }
          if (raw >= 1) {
            for (let i = 0; i < samples.length; i += 1) {
              addNode(i, targets[i]!, samples[i]!.color);
            }
          }
        });
      },

      reverseStep(p) {
        if (!plane) throw new Error('diffusion-stage: init 전에 reverseStep');
        checkCount(p.x0Hat.length, 'x0Hat');
        checkCount(p.xPrev.length, 'xPrev');
        settleTween();
        captionRight.textContent = t('caption.reverse', 'Remove noise: t {from} → {to}', {
          from: p.tIndex,
          to: p.tNext,
        });
        const from = pos.map((q): Pt => [q[0], q[1]]);
        const predFrom = predPos.map((q, i): Pt => (q ? [q[0], q[1]] : [from[i]![0], from[i]![1]]));
        const { x0Hat, xPrev } = p;
        const PULL = 0.4;
        tween = runTween(p.motionMs, (raw) => {
          // 앞 40 % — 예측 x̂₀ 가 선분 위로 끌려간다
          const a = easeInOut(Math.min(1, raw / PULL));
          // 뒤 60 % — 표본이 내려선다
          const b = easeInOut(Math.max(0, (raw - PULL) / (1 - PULL)));
          for (let i = 0; i < samples.length; i += 1) {
            const pr = lerp(predFrom[i]!, x0Hat[i]!, a);
            predPos[i] = pr;
            const q = lerp(from[i]!, xPrev[i]!, b);
            pos[i] = q;
            placeDot(i, q);
            drawPred(i, pr, q);
            drawTrail(i, [...trails[i]!, q]);
          }
          if (raw >= 1) {
            for (let i = 0; i < samples.length; i += 1) {
              const end = xPrev[i]!;
              trails[i]!.push([end[0], end[1]]);
              drawTrail(i, trails[i]!);
              addNode(i, end, samples[i]!.color);
            }
          }
        });
      },

      settle(p) {
        if (!plane) throw new Error('diffusion-stage: init 전에 settle');
        checkCount(p.distance.length, 'distance');
        checkCount(p.reached.length, 'reached');
        checkCount(p.nearest.length, 'nearest');
        settleTween();
        captionRight.textContent = t('caption.settle', 'Reached a datum: {n}/{total}', {
          n: p.reachedCount,
          total: samples.length,
        });
        for (let i = 0; i < samples.length; i += 1) {
          const s = samples[i]!;
          const side = p.nearest[i]!;
          const sideLabel = side === 'P' ? t('label.dataP', 'P') : t('label.dataQ', 'Q');
          s.chipText.textContent = t('label.distance', '{side} {distance}', {
            side: sideLabel,
            distance: formatNumber(p.distance[i]!, 2),
          });
          s.chipText.setAttribute('font-weight', p.reached[i] ? '700' : '400');
          s.pred.setAttribute('visibility', 'hidden');
          s.link.setAttribute('visibility', 'hidden');
        }
        // 같은 자료에 닿은 표본끼리 부챗살로 벌어서고(P 는 위, Q 는 아래), 고리가 조여 든다
        const fanTo: Pt[] = samples.map((): Pt => [0, 0]);
        for (const side of ['P', 'Q'] as const) {
          const group: number[] = [];
          for (let i = 0; i < samples.length; i += 1) {
            if (p.reached[i] && p.nearest[i] === side) group.push(i);
          }
          const center = side === 'P' ? -90 : 90;
          group.forEach((i, j) => {
            const deg = center + FAN_SPREAD_DEG * (j - (group.length - 1) / 2);
            const rad = (deg * Math.PI) / 180;
            fanTo[i] = [FAN_R * Math.cos(rad), FAN_R * Math.sin(rad)];
          });
        }
        const fanFrom = fan.map((q): Pt => [q[0], q[1]]);
        tween = runTween(p.motionMs, (raw) => {
          const e = easeInOut(raw);
          for (let i = 0; i < samples.length; i += 1) {
            const s = samples[i]!;
            fan[i] = lerp(fanFrom[i]!, fanTo[i]!, e);
            placeDot(i, pos[i]!);
            if (p.reached[i]) {
              s.ring.setAttribute('visibility', 'visible');
              s.ring.setAttribute('r', String(RING_R + 18 * (1 - e)));
            }
          }
        });
      },

      clear() {
        settleTween();
        plane = null;
        for (const layer of [planeLayer, trailLayer, predLayer, dotLayer, chipLayer]) {
          while (layer.firstChild) layer.removeChild(layer.firstChild);
        }
        captionLeft.textContent = '';
        captionRight.textContent = '';
        samples = [];
        pos = [];
        fan = [];
        predPos = [];
        trails = [];
      },

      destroy() {
        if (tween) tween.cancel();
        tween = null;
        root.remove();
      },
    };
    return api;
  },
};
