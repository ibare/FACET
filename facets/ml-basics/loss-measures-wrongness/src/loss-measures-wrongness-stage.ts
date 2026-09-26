/**
 * loss-measures-wrongness 무대.
 *
 * 왼쪽 — 보기 다섯. 0 에서 1 까지의 줄 위에 답 y(고리)와 예측 p(점), 그 사이가 벌어진 폭이다.
 * 가운데 — 폭(가로)에 따른 값(세로). 곡선과 "값 = 폭" 인 곧은 점선을 함께 둔다.
 * 오른쪽 — 합 기둥. 가운데 칸과 세로 축척이 같아 값 막대가 그대로 옮겨 가 쌓인다.
 *
 * 걸음 하나: 줄 위의 폭이 가로축으로 옮겨 눕고 → 곡선 높이까지 솟아 값이 되고 →
 * 그 막대가 합 기둥 위로 옮겨 가 쌓인다. 끝 걸음: 쌓인 막대들이 보기 수만큼 눌려 평균 하나가 된다.
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
  type Translate,
} from '@ffacet/core/runtime';
import type { LossMeasured, LossScene } from './scene.js';

const H = 420;
const NS = 'http://www.w3.org/2000/svg';

/** 가로 자리 — 캔버스 폭에 대한 몫. */
const LAYOUT = {
  idX: 0.026,
  lineX0: 0.1,
  lineX1: 0.31,
  plotX0: 0.45,
  plotX1: 0.77,
  stackX: 0.85,
  stackW: 0.075,
} as const;

/** 세로 자리. */
const CAPTION_Y1 = 22;
const CAPTION_Y2 = 42;
const STACK_TOP = 84;
const BASE_Y = H - 44;

/** 운동 시간 (ms). 합이 600 이하. */
const MS_LIE = 220;
const MS_RISE = 160;
const MS_STACK = 220;
const MS_SQUASH = 600;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function fmt(v: number, d: number): string {
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export const lossMeasuresWrongnessStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const fsXs = parseFloat(fontSizes.xs);
    const fsSm = parseFloat(fontSizes.sm);
    const fsMd = parseFloat(fontSizes.md);

    const lineX0 = W * LAYOUT.lineX0;
    const lineX1 = W * LAYOUT.lineX1;
    const plotX0 = W * LAYOUT.plotX0;
    const plotX1 = W * LAYOUT.plotX1;
    const stackX = W * LAYOUT.stackX;
    const stackW = W * LAYOUT.stackW;
    const stackMid = stackX + stackW / 2;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element): SVGElement {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: number; anchor?: string; fill?: string; weight?: string; mono?: boolean } = {},
    ): SVGElement {
      const node = el(
        'text',
        {
          x: fmt(x, 2),
          y: fmt(y, 2),
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fsSm,
          'text-anchor': opts.anchor ?? 'start',
          fill: opts.fill ?? colors.text,
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = str;
      return node;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** ms 동안 k(0→1, 부드럽게)로 frame 을 부른다. 세대가 바뀌면 멈춘다. */
    async function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return false;
        frame(ease(f / frames));
      }
      return true;
    }

    function colorOf(scene: LossScene, index: number): string {
      const c = categorical(scene.examples.length, 'vivid')[index];
      if (c === undefined) throw new Error(`loss-measures-wrongness-stage: 보기 ${index} 의 색이 없다`);
      return c;
    }

    function rowY(scene: LossScene, index: number): number {
      const n = scene.examples.length;
      const top = STACK_TOP + 22;
      const bottom = BASE_Y - 8;
      return n === 1 ? top : top + ((bottom - top) * index) / (n - 1);
    }

    function scaleOf(scene: LossScene): number {
      if (scene.basis === null) throw new Error('loss-measures-wrongness-stage: 바탕 없이 축척을 셈하려 했다');
      return (BASE_Y - STACK_TOP) / scene.basis.stackTop;
    }

    /** 줄 위의 폭 — 답 쪽 끝과 예측 쪽 끝. */
    function rowGapEnds(scene: LossScene, index: number): { answerX: number; predX: number; y: number } {
      const ex = scene.examples[index];
      if (ex === undefined) throw new Error(`loss-measures-wrongness-stage: 보기 ${index} 가 없다`);
      const len = lineX1 - lineX0;
      return { answerX: lineX0 + ex.y * len, predX: lineX0 + ex.p * len, y: rowY(scene, index) };
    }

    function measuredAt(scene: LossScene, index: number): LossMeasured {
      const m = scene.measured[index];
      if (m === undefined) throw new Error(`loss-measures-wrongness-stage: 셈한 보기 ${index} 가 없다`);
      return m;
    }

    type Hold = { measure?: number; average?: boolean };

    /** 장면의 화면 전체를 세운다. hold 는 운동이 아직 데려오지 않은 것을 비워 둔다. */
    function drawStatic(scene: LossScene, hold: Hold = {}): void {
      svg.textContent = '';
      const holdIdx = hold.measure;
      const shownCount = holdIdx === undefined ? scene.measured.length : holdIdx;

      // 캡션
      const step = scene.step;
      if (step.kind === 'start') {
        write(svg, W / 2, CAPTION_Y1, t('caption.start', 'Examples: {n}', { n: scene.examples.length }), {
          size: fsMd,
          anchor: 'middle',
          weight: '600',
        });
        write(svg, W / 2, CAPTION_Y2, t('caption.startNote', 'Ring: answer y · Dot: prediction p'), {
          anchor: 'middle',
          fill: colors.textMuted,
        });
      } else if (step.kind === 'measure') {
        const m = measuredAt(scene, step.index);
        write(
          svg,
          W / 2,
          CAPTION_Y1,
          t('caption.measure', '{id} — gap: {gap} → value: {value}', {
            id: m.id,
            gap: fmt(m.gap, 2),
            value: fmt(m.value, 3),
          }),
          { size: fsMd, anchor: 'middle', weight: '600' },
        );
        write(
          svg,
          W / 2,
          CAPTION_Y2,
          t('caption.measureNote', 'Value per unit of gap: {ratio} · Sum: {sum}', {
            ratio: fmt(m.ratio, 2),
            sum: fmt(m.sum, 3),
          }),
          { anchor: 'middle', fill: colors.textMuted },
        );
      } else {
        if (scene.mean === null) throw new Error('loss-measures-wrongness-stage: 나누기 걸음에 평균이 없다');
        write(svg, W / 2, CAPTION_Y1, t('caption.average', 'Loss: {mean}', { mean: fmt(scene.mean.mean, 3) }), {
          size: fsMd,
          anchor: 'middle',
          weight: '600',
        });
        write(
          svg,
          W / 2,
          CAPTION_Y2,
          t('caption.averageNote', 'Sum: {sum} · Examples: {n}', {
            sum: fmt(scene.mean.sum, 3),
            n: scene.mean.count,
          }),
          { anchor: 'middle', fill: colors.textMuted },
        );
      }

      // 왼쪽 — 보기 줄
      const rows = el('g', {}, svg);
      const headY = rowY(scene, 0) - 30;
      write(rows, lineX0, headY, '0', { size: fsXs, anchor: 'middle', fill: colors.textMuted });
      write(rows, lineX1, headY, '1', { size: fsXs, anchor: 'middle', fill: colors.textMuted });
      scene.examples.forEach((ex, i) => {
        const { answerX, predX, y } = rowGapEnds(scene, i);
        const done = i < shownCount || i === holdIdx;
        const current = step.kind === 'measure' && step.index === i;
        el('line', { x1: lineX0, y1: y, x2: lineX1, y2: y, stroke: colors.border, 'stroke-width': 1 }, rows);
        el(
          'line',
          {
            x1: fmt(Math.min(answerX, predX), 2),
            y1: y,
            x2: fmt(Math.max(answerX, predX), 2),
            y2: y,
            stroke: done ? colorOf(scene, i) : colors.textMuted,
            'stroke-width': done ? 5 : 2,
            'stroke-opacity': done ? 1 : 0.5,
          },
          rows,
        );
        el('circle', { cx: fmt(answerX, 2), cy: y, r: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, rows);
        el('circle', { cx: fmt(predX, 2), cy: y, r: 3.5, fill: colors.text }, rows);
        write(rows, W * LAYOUT.idX, y + 4, ex.id, { weight: current ? '700' : '600', mono: true });
        write(rows, lineX0, y - 12, t('label.row', 'y = {y} · p = {p}', { y: ex.y, p: fmt(ex.p, 2) }), {
          size: fsXs,
          fill: colors.textMuted,
        });
        if (i < shownCount) {
          const m = measuredAt(scene, i);
          write(rows, lineX1 + 12, y + 4, fmt(m.value, 3), {
            mono: true,
            weight: current ? '700' : 'normal',
            fill: colorOf(scene, i),
          });
        }
      });

      if (scene.basis === null) return;
      const s = scaleOf(scene);
      const GX = plotX1 - plotX0;
      const plotTop = BASE_Y - scene.basis.valueTop * s;

      // 가운데 — 폭에 따른 값
      const plot = el('g', {}, svg);
      el('line', { x1: plotX0, y1: BASE_Y, x2: plotX1, y2: BASE_Y, stroke: colors.border, 'stroke-width': 1 }, plot);
      el('line', { x1: plotX0, y1: BASE_Y, x2: plotX0, y2: fmt(plotTop, 2), stroke: colors.border, 'stroke-width': 1 }, plot);
      for (const g of [0, 0.5, 1]) {
        write(plot, plotX0 + g * GX, BASE_Y + 14, fmt(g, 1), { size: fsXs, anchor: 'middle', fill: colors.textMuted });
      }
      for (let v = 1; v <= scene.basis.valueTop; v += 1) {
        const y = BASE_Y - v * s;
        el('line', { x1: plotX0 - 3, y1: fmt(y, 2), x2: plotX0, y2: fmt(y, 2), stroke: colors.border }, plot);
        write(plot, plotX0 - 6, y + 4, String(v), { size: fsXs, anchor: 'end', fill: colors.textMuted });
      }
      write(plot, plotX1, BASE_Y + 30, t('label.gapAxis', 'gap'), { size: fsXs, anchor: 'end', fill: colors.textMuted });
      write(plot, plotX0, plotTop - 8, t('label.valueAxis', 'value'), {
        size: fsXs,
        anchor: 'middle',
        fill: colors.textMuted,
      });
      // 값 = 폭 인 곧은 점선
      el(
        'line',
        {
          x1: plotX0,
          y1: BASE_Y,
          x2: plotX1,
          y2: fmt(BASE_Y - s, 2),
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        },
        plot,
      );
      write(plot, plotX1, BASE_Y - s + 16, t('label.even', 'value = gap'), {
        size: fsXs,
        anchor: 'end',
        fill: colors.textMuted,
      });
      const d = scene.basis.curve
        .map(([g, v], i) => `${i === 0 ? 'M' : 'L'}${fmt(plotX0 + g * GX, 2)} ${fmt(BASE_Y - v * s, 2)}`)
        .join(' ');
      el('path', { d, fill: 'none', stroke: colors.text, 'stroke-width': 1.5 }, plot);

      for (let i = 0; i < shownCount; i += 1) {
        const m = measuredAt(scene, i);
        const gx = plotX0 + m.gap * GX;
        const gy = BASE_Y - m.value * s;
        const c = colorOf(scene, i);
        el('line', { x1: fmt(gx, 2), y1: BASE_Y, x2: fmt(gx, 2), y2: fmt(gy, 2), stroke: c, 'stroke-width': 2 }, plot);
        el('circle', { cx: fmt(gx, 2), cy: fmt(gy, 2), r: 4, fill: c }, plot);
      }
      if (step.kind === 'measure') {
        const m = measuredAt(scene, step.index);
        const c = colorOf(scene, step.index);
        if (holdIdx === undefined) {
          el(
            'line',
            { x1: plotX0, y1: BASE_Y, x2: fmt(plotX0 + m.gap * GX, 2), y2: BASE_Y, stroke: c, 'stroke-width': 5 },
            plot,
          );
        }
        write(
          plot,
          (plotX0 + plotX1) / 2,
          plotTop - 30,
          t('label.formula', '−ln({given}) = {value}', { given: fmt(m.given, 2), value: fmt(m.value, 3) }),
          { anchor: 'middle', mono: true, weight: '600' },
        );
      }
      if (step.kind === 'average' && scene.mean !== null) {
        write(
          plot,
          (plotX0 + plotX1) / 2,
          plotTop - 30,
          t('label.divide', '{sum} ÷ {n} = {mean}', {
            sum: fmt(scene.mean.sum, 3),
            n: scene.mean.count,
            mean: fmt(scene.mean.mean, 3),
          }),
          { anchor: 'middle', mono: true, weight: '600' },
        );
      }

      // 오른쪽 — 합 기둥
      const stack = el('g', {}, svg);
      el(
        'line',
        { x1: stackX - 8, y1: BASE_Y, x2: stackX + stackW + 8, y2: BASE_Y, stroke: colors.border, 'stroke-width': 1 },
        stack,
      );
      const averaged = scene.mean !== null && hold.average !== true;
      if (averaged && scene.mean !== null) {
        const count = scene.mean.count;
        const ghostTop = BASE_Y - scene.mean.sum * s;
        el(
          'rect',
          {
            x: fmt(stackX, 2),
            y: fmt(ghostTop, 2),
            width: fmt(stackW, 2),
            height: fmt(scene.mean.sum * s, 2),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-dasharray': '3 3',
          },
          stack,
        );
        for (let k = 1; k < count; k += 1) {
          const y = BASE_Y - (scene.mean.sum * s * k) / count;
          el(
            'line',
            {
              x1: fmt(stackX, 2),
              y1: fmt(y, 2),
              x2: fmt(stackX + stackW, 2),
              y2: fmt(y, 2),
              stroke: colors.textMuted,
              'stroke-dasharray': '3 3',
            },
            stack,
          );
        }
        write(stack, stackMid, ghostTop - 8, t('label.sum', 'Sum: {sum}', { sum: fmt(scene.mean.sum, 3) }), {
          size: fsXs,
          anchor: 'middle',
          fill: colors.textMuted,
        });
        scene.measured.forEach((m, i) => {
          el(
            'rect',
            {
              x: fmt(stackX, 2),
              y: fmt(BASE_Y - (m.sum * s) / count, 2),
              width: fmt(stackW, 2),
              height: fmt((m.value * s) / count, 2),
              fill: colorOf(scene, i),
            },
            stack,
          );
        });
        write(stack, stackMid, BASE_Y - scene.mean.mean * s - 8, t('label.mean', 'Mean: {mean}', {
          mean: fmt(scene.mean.mean, 3),
        }), { anchor: 'middle', weight: '700' });
      } else if (hold.average !== true) {
        for (let i = 0; i < shownCount; i += 1) {
          const m = measuredAt(scene, i);
          el(
            'rect',
            {
              x: fmt(stackX, 2),
              y: fmt(BASE_Y - m.sum * s, 2),
              width: fmt(stackW, 2),
              height: fmt(m.value * s, 2),
              fill: colorOf(scene, i),
              stroke: colors.bg,
              'stroke-width': 1,
            },
            stack,
          );
        }
        if (shownCount > 0) {
          const top = measuredAt(scene, shownCount - 1).sum;
          write(stack, stackMid, BASE_Y - top * s - 8, t('label.sum', 'Sum: {sum}', { sum: fmt(top, 3) }), {
            anchor: 'middle',
            weight: '600',
          });
        }
      }
    }

    async function animateMeasure(scene: LossScene, index: number, mine: number): Promise<void> {
      const m = measuredAt(scene, index);
      const s = scaleOf(scene);
      const GX = plotX1 - plotX0;
      const c = colorOf(scene, index);
      const { answerX, predX, y } = rowGapEnds(scene, index);
      const gx = plotX0 + m.gap * GX;
      const gy = BASE_Y - m.value * s;
      drawStatic(scene, { measure: index });
      const layer = el('g', {}, svg);

      // 1. 줄 위의 폭이 가로축으로 옮겨 눕는다 (답 쪽 끝이 0 으로)
      const seg = el(
        'line',
        { x1: fmt(answerX, 2), y1: y, x2: fmt(predX, 2), y2: y, stroke: c, 'stroke-width': 5 },
        layer,
      );
      if (
        !(await tween(MS_LIE, mine, (k) => {
          seg.setAttribute('x1', fmt(lerp(answerX, plotX0, k), 2));
          seg.setAttribute('x2', fmt(lerp(predX, gx, k), 2));
          seg.setAttribute('y1', fmt(lerp(y, BASE_Y, k), 2));
          seg.setAttribute('y2', fmt(lerp(y, BASE_Y, k), 2));
        }))
      )
        return;

      // 2. 폭 끝에서 곡선 높이까지 솟는다
      const stem = el(
        'rect',
        { x: fmt(gx - 2, 2), y: BASE_Y, width: 4, height: 0, fill: c },
        layer,
      );
      if (
        !(await tween(MS_RISE, mine, (k) => {
          const h = m.value * s * k;
          stem.setAttribute('y', fmt(BASE_Y - h, 2));
          stem.setAttribute('height', fmt(h, 2));
        }))
      )
        return;
      el('circle', { cx: fmt(gx, 2), cy: fmt(gy, 2), r: 4, fill: c }, layer);
      el('line', { x1: fmt(gx, 2), y1: BASE_Y, x2: fmt(gx, 2), y2: fmt(gy, 2), stroke: c, 'stroke-width': 2 }, layer);

      // 3. 값 막대가 합 기둥 위로 옮겨 가 쌓인다
      const blockTop = BASE_Y - m.sum * s;
      if (
        !(await tween(MS_STACK, mine, (k) => {
          stem.setAttribute('x', fmt(lerp(gx - 2, stackX, k), 2));
          stem.setAttribute('width', fmt(lerp(4, stackW, k), 2));
          stem.setAttribute('y', fmt(lerp(gy, blockTop, k), 2));
        }))
      )
        return;
      drawStatic(scene);
    }

    async function animateAverage(scene: LossScene, mine: number): Promise<void> {
      if (scene.mean === null) throw new Error('loss-measures-wrongness-stage: 나누기 걸음에 평균이 없다');
      const s = scaleOf(scene);
      const count = scene.mean.count;
      drawStatic(scene, { average: true });
      const layer = el('g', {}, svg);
      // 정적 그리기의 쌓인 막대 대신 움직일 막대를 따로 세운다
      const bars = scene.measured.map((m, i) => {
        const rect = el(
          'rect',
          {
            x: fmt(stackX, 2),
            y: fmt(BASE_Y - m.sum * s, 2),
            width: fmt(stackW, 2),
            height: fmt(m.value * s, 2),
            fill: colorOf(scene, i),
            stroke: colors.bg,
            'stroke-width': 1,
          },
          layer,
        );
        return { rect, m };
      });
      if (
        !(await tween(MS_SQUASH, mine, (k) => {
          const f = lerp(1, 1 / count, k);
          for (const { rect, m } of bars) {
            rect.setAttribute('y', fmt(BASE_Y - m.sum * s * f, 2));
            rect.setAttribute('height', fmt(m.value * s * f, 2));
          }
        }))
      )
        return;
      drawStatic(scene);
    }

    return {
      async render(next: LossScene, _prev: LossScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.basis === null) return;
        if (next.step.kind === 'measure') {
          await animateMeasure(next, next.step.index, mine);
        } else if (next.step.kind === 'average') {
          await animateAverage(next, mine);
        }
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
