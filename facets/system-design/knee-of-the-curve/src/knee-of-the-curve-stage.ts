/**
 * knee-of-the-curve stage — 위에는 서버의 처리율 칸(μ 칸 가운데 λ 칸이 찬다), 아래에는
 * 도착률마다의 평균 머묾 기둥. 한 걸음에 칸 하나가 여유 자리로 내려앉고, 그 걸음의 기둥이
 * 앞 걸음의 높이에서 새 높이로 솟는다. 솟은 몫은 강조색으로 남는다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { KneePoint, KneeScene } from './scene.js';

const H = 372;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 위 띠 — 서버와 처리율 칸
const SERVER_X = 16;
const SERVER_W = 100;
const STRIP_X0 = 132;
const STRIP_X1 = PIECE_CANVAS_W - 16;
const STRIP_Y = 30;
const STRIP_H = 32;
const CELL_GAP = 3;
const DROP = 26; // 새 칸이 내려앉기 전 떠 있는 높이

// 아래 그래프 — 도착률마다 평균 머묾
const AXIS_X = 76;
const CHART_X1 = PIECE_CANVAS_W - 12;
const CHART_TOP = 128;
const CHART_BASE = 300;

const SETTLE_MS = 280;
const RISE_MS = 380;

const round2 = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};
const fmtMs = (v: number): string => v.toFixed(1);
const fmtNum = (v: number): string => String(round2(v));
const ease = (p: number): number => 1 - (1 - p) * (1 - p);

type Motion = {
  newCells: SVGRectElement[];
  spareLine: SVGLineElement;
  column: {
    inc: SVGRectElement;
    dot: SVGCircleElement;
    wLabel: SVGTextElement;
    chip: { rect: SVGRectElement; text: SVGTextElement; width: number } | null;
    curve: SVGPolylineElement;
    curvePoints: Array<[number, number]>;
    x: number;
    barW: number;
  } | null;
};

export const kneeOfTheCurveStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function writeText(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: number } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: round2(x),
        y: round2(y),
        'font-family': fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = body;
      return node;
    }

    const cellW = (mu: number): number => (STRIP_X1 - STRIP_X0) / mu;
    const cellX = (mu: number, i: number): number => STRIP_X0 + cellW(mu) * i + CELL_GAP / 2;
    const slotW = (n: number): number => (CHART_X1 - AXIS_X) / n;
    const colX = (n: number, i: number): number => AXIS_X + slotW(n) * (i + 0.5);
    const yOf = (ms: number, wMax: number): number =>
      round2(CHART_BASE - (ms / wMax) * (CHART_BASE - CHART_TOP));

    function drawStatic(scene: KneeScene): Motion {
      svg.textContent = '';
      const { mu, lambdas, axis, points, step } = scene;
      const current = points[points.length - 1];
      const lambda = current === undefined ? 0 : current.lambda;
      const spare = mu - lambda;

      // --- 서버와 처리율 칸 ---
      el(svg, 'rect', {
        x: SERVER_X,
        y: STRIP_Y,
        width: SERVER_W,
        height: STRIP_H,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      writeText(svg, SERVER_X + SERVER_W / 2, STRIP_Y + STRIP_H / 2 + 5, t('label.server', 'Server'), {
        anchor: 'middle',
        size: fontSizes.md,
        weight: 600,
      });
      writeText(svg, SERVER_X + SERVER_W / 2, STRIP_Y + STRIP_H + 16, t('label.capacity', 'Capacity: {mu}/s', { mu }), {
        anchor: 'middle',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      const cw = cellW(mu);
      const newCells: SVGRectElement[] = [];
      const fromLambda = step?.kind === 'load' ? step.fromLambda : lambda;
      for (let i = 0; i < mu; i += 1) {
        if (i < lambda) {
          const cell = el(svg, 'rect', {
            x: round2(cellX(mu, i)),
            y: STRIP_Y,
            width: round2(cw - CELL_GAP),
            height: STRIP_H,
            rx: 3,
            fill: colors.itemComparing,
          });
          if (i >= fromLambda) newCells.push(cell);
        } else {
          el(svg, 'rect', {
            x: round2(cellX(mu, i)),
            y: STRIP_Y,
            width: round2(cw - CELL_GAP),
            height: STRIP_H,
            rx: 3,
            fill: colors.bg,
            stroke: colors.border,
            'stroke-dasharray': '4 3',
          });
        }
      }
      // 새로 찬 칸은 빈 칸 위에 그려야 내려앉는 동안 가려지지 않는다
      for (const cell of newCells) svg.appendChild(cell);

      // 여유 괄호 — 남은 칸 위에 걸친다
      const spareX0 = round2(STRIP_X0 + cw * lambda);
      const spareLine = el(svg, 'line', {
        x1: spareX0,
        y1: STRIP_Y - 6,
        x2: STRIP_X1,
        y2: STRIP_Y - 6,
        stroke: colors.textMuted,
        'stroke-width': 1.5,
      });
      writeText(svg, STRIP_X1, STRIP_Y - 11, t('label.spare', 'Spare: {n}/s', { n: spare }), {
        anchor: 'end',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      if (current !== undefined) {
        writeText(svg, STRIP_X0, STRIP_Y - 11, t('label.arrivals', 'Arrivals: {n}/s', { n: lambda }), {
          size: fontSizes.xs,
        });
        writeText(
          svg,
          STRIP_X0,
          STRIP_Y + STRIP_H + 16,
          t('label.utilization', 'Utilization: {v}', { v: fmtNum(current.utilization) }),
          { size: fontSizes.xs, fill: colors.textMuted },
        );
      }

      let column: Motion['column'] = null;

      // --- 머묾 그래프 ---
      if (axis !== null) {
        const n = lambdas.length;
        const { wMaxMs, serviceMs } = axis;
        writeText(svg, SERVER_X, CHART_TOP - 16, t('axis.y', 'Mean time in system W (ms)'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
        for (const tick of [0, wMaxMs / 2, wMaxMs]) {
          const y = yOf(tick, wMaxMs);
          el(svg, 'line', {
            x1: AXIS_X,
            y1: y,
            x2: CHART_X1,
            y2: y,
            stroke: colors.border,
            'stroke-width': tick === 0 ? 1.5 : 0.75,
          });
          writeText(svg, AXIS_X - 6, y + 4, t('axis.ms', '{v} ms', { v: fmtNum(tick) }), {
            anchor: 'end',
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
        }
        el(svg, 'line', { x1: AXIS_X, y1: CHART_TOP, x2: AXIS_X, y2: CHART_BASE, stroke: colors.border });

        // 처리 시간 점선 — 기둥에서 이 선 위가 줄에서 기다린 몫이다
        const serviceY = yOf(serviceMs, wMaxMs);
        el(svg, 'line', {
          x1: AXIS_X,
          y1: serviceY,
          x2: CHART_X1,
          y2: serviceY,
          stroke: colors.textMuted,
          'stroke-dasharray': '5 4',
        });
        el(svg, 'line', {
          x1: AXIS_X + 16,
          y1: CHART_TOP + 12,
          x2: AXIS_X + 40,
          y2: CHART_TOP + 12,
          stroke: colors.textMuted,
          'stroke-dasharray': '5 4',
        });
        writeText(svg, AXIS_X + 46, CHART_TOP + 16, t('label.service', 'Service time alone: {v} ms', { v: fmtNum(serviceMs) }), {
          size: fontSizes.xs,
          fill: colors.textMuted,
        });

        const barW = Math.min(24, slotW(n) * 0.45);
        lambdas.forEach((l, i) => {
          writeText(svg, colX(n, i), CHART_BASE + 16, String(l), {
            anchor: 'middle',
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
        });
        writeText(svg, CHART_X1, CHART_BASE + 34, t('axis.x', 'Arrival rate λ (per second)'), {
          anchor: 'end',
          size: fontSizes.xs,
          fill: colors.textMuted,
        });

        const curvePoints: Array<[number, number]> = points.map((pt, i) => [round2(colX(n, i)), yOf(pt.wMs, wMaxMs)]);
        const bars = el(svg, 'g', {});
        const curve = el(svg, 'polyline', {
          points: curvePoints.map(([x, y]) => `${x},${y}`).join(' '),
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        });
        const marks = el(svg, 'g', {});

        points.forEach((pt: KneePoint, i: number) => {
          const x = round2(colX(n, i));
          const topY = yOf(pt.wMs, wMaxMs);
          const isCurrent = i === points.length - 1 && step?.kind === 'load';
          el(bars, 'rect', {
            x: round2(x - barW / 2),
            y: topY,
            width: round2(barW),
            height: round2(CHART_BASE - topY),
            fill: colors.border,
          });
          if (isCurrent && step.kind === 'load') {
            const fromY = step.fromMs === null ? CHART_BASE : yOf(step.fromMs, wMaxMs);
            const inc = el(bars, 'rect', {
              x: round2(x - barW / 2),
              y: topY,
              width: round2(barW),
              height: round2(fromY - topY),
              fill: colors.accent,
              stroke: colors.text,
              'stroke-width': 1,
            });
            const dot = el(marks, 'circle', { cx: x, cy: topY, r: 3.5, fill: colors.text });
            const wLabel = writeText(marks, x, topY - 7, fmtMs(pt.wMs), {
              anchor: 'middle',
              size: fontSizes.xs,
              weight: 700,
            });
            // 늘어난 몫 — 첫 칸은 견줄 앞 걸음이 없어 달지 않는다
            let chip: NonNullable<Motion['column']>['chip'] = null;
            if (pt.deltaMs !== null) {
              const chipBody = t('label.delta', '+{v} ms', { v: fmtMs(pt.deltaMs) });
              const width = round2(chipBody.length * parseFloat(fontSizes.xs) * 0.58 + 10);
              const rect = el(marks, 'rect', {
                x: round2(x - width / 2),
                y: round2(topY - 36),
                width,
                height: 15,
                rx: 3,
                fill: colors.accent,
              });
              const text = writeText(marks, x, topY - 25, chipBody, {
                anchor: 'middle',
                size: fontSizes.xs,
                fill: colors.stateInk,
                weight: 600,
              });
              chip = { rect, text, width };
            }
            column = { inc, dot, wLabel, chip, curve, curvePoints, x, barW };
          } else {
            el(marks, 'circle', { cx: x, cy: topY, r: 3, fill: colors.textMuted });
            writeText(marks, x, topY - 7, fmtMs(pt.wMs), {
              anchor: 'middle',
              size: fontSizes.xs,
              fill: colors.textMuted,
            });
          }
        });
      }

      // --- 캡션 — 이번 걸음에 일어난 일 ---
      const captionY = H - 12;
      const captionOpts = { size: fontSizes.md };
      if (step === null || step.kind === 'idle') {
        writeText(svg, SERVER_X, captionY, t('caption.idle', 'Capacity: {mu} per second. No arrivals yet.', { mu }), captionOpts);
      } else if (current === undefined) {
        throw new Error('knee-of-the-curve stage: load 걸음인데 자취가 비었다');
      } else if (step.fromMs === null) {
        writeText(
          svg,
          SERVER_X,
          captionY,
          t('caption.first', 'Arrivals: {rate}/s · spare: {spare}/s · time in system W: {w} ms', {
            rate: lambda,
            spare,
            w: fmtMs(current.wMs),
          }),
          captionOpts,
        );
      } else if (step.last) {
        writeText(
          svg,
          SERVER_X,
          captionY,
          t('caption.last', 'Arrivals: {rate}/s · spare: {spare}/s · W: {from} → {to} ms · {ratio}× the first', {
            rate: lambda,
            spare,
            from: fmtMs(step.fromMs),
            to: fmtMs(step.toMs),
            ratio: fmtMs(step.ratioToFirst),
          }),
          captionOpts,
        );
      } else {
        writeText(
          svg,
          SERVER_X,
          captionY,
          t('caption.rise', 'Arrivals: {rate}/s · spare: {spare}/s · W: {from} → {to} ms', {
            rate: lambda,
            spare,
            from: fmtMs(step.fromMs),
            to: fmtMs(step.toMs),
          }),
          captionOpts,
        );
      }

      return { newCells, spareLine, column };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateLoad(next: KneeScene, motion: Motion, mine: number): Promise<void> {
      const step = next.step;
      if (step === null || step.kind !== 'load') throw new Error('knee-of-the-curve stage: load 걸음이 아니다');
      const axis = next.axis;
      if (axis === null) throw new Error('knee-of-the-curve stage: 축 없이 load 걸음을 흘릴 수 없다');
      const column = motion.column;
      if (column === null) throw new Error('knee-of-the-curve stage: 솟을 기둥을 찾지 못했다');
      if (motion.newCells.length === 0) throw new Error('knee-of-the-curve stage: 내려앉을 칸을 찾지 못했다');

      const cw = cellW(next.mu);
      const spareFrom = STRIP_X0 + cw * step.fromLambda;
      const current = next.points[next.points.length - 1];
      if (current === undefined) throw new Error('knee-of-the-curve stage: 자취가 비었다');
      const spareTo = STRIP_X0 + cw * current.lambda;
      // 첫 칸의 기둥은 바닥(0 ms)에서 솟는다 — 그림의 출발점일 뿐 셈한 값이 아니다
      const fromMs = step.fromMs === null ? 0 : step.fromMs;
      const { wMaxMs } = axis;
      const chip = column.chip;

      const settle = (p: number): void => {
        for (const cell of motion.newCells) cell.setAttribute('y', String(round2(STRIP_Y - DROP * (1 - p))));
        motion.spareLine.setAttribute('x1', String(round2(spareFrom + (spareTo - spareFrom) * p)));
      };
      const rise = (p: number): void => {
        const ms = fromMs + (step.toMs - fromMs) * p;
        const topY = yOf(ms, wMaxMs);
        const fromY = step.fromMs === null ? CHART_BASE : yOf(step.fromMs, wMaxMs);
        column.inc.setAttribute('y', String(topY));
        column.inc.setAttribute('height', String(round2(Math.max(0, fromY - topY))));
        column.dot.setAttribute('cy', String(topY));
        column.wLabel.setAttribute('y', String(round2(topY - 7)));
        column.wLabel.textContent = fmtMs(ms);
        if (chip !== null) {
          chip.rect.setAttribute('y', String(round2(topY - 36)));
          chip.text.setAttribute('y', String(round2(topY - 25)));
        }
        const pts = column.curvePoints.map(([x, y], i) =>
          i === column.curvePoints.length - 1 ? `${x},${topY}` : `${x},${y}`,
        );
        column.curve.setAttribute('points', pts.join(' '));
      };

      // 끝 자리에 서 있는 요소를 아직 못 온 자리로 돌려놓고 시작한다
      settle(0);
      rise(0);
      chip?.rect.setAttribute('opacity', '0');
      chip?.text.setAttribute('opacity', '0');
      await tween(SETTLE_MS, mine, settle);
      if (destroyed || mine !== gen) return;
      chip?.rect.removeAttribute('opacity');
      chip?.text.removeAttribute('opacity');
      await tween(RISE_MS, mine, rise);
    }

    return {
      render(next: KneeScene, prev: KneeScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const motion = drawStatic(next);
        const flows =
          opts.animate &&
          prev !== null &&
          next.step?.kind === 'load' &&
          prev.points.length === next.points.length - 1;
        if (!flows) return;
        return animateLoad(next, motion, mine).then(() => {
          if (destroyed || mine !== gen) return;
          drawStatic(next);
        });
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
