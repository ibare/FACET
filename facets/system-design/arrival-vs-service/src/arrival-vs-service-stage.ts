/**
 * arrival-vs-service 의 무대.
 *
 * 위: 줄 — 서버가 오른쪽에 있고 줄은 왼쪽으로 자란다. 새 요청은 왼쪽 끝에서 걸어 들어와
 *     줄 끝에 서고, 처리를 마친 요청은 서버 오른쪽 더미로 빠진다.
 * 아래: 누적 셈 — 들어온 수와 나간 수를 시각 축 위 계단으로 긋는다. 지금 시각의 두 계단
 *     사이를 괄호로 잇는다. 계단이 벌어지는 만큼이 줄 + 처리 중이다.
 *
 * 줄의 자리는 장면의 `waiting` 차례에서, 운동의 출발은 `step` 에서 나온다 (prev 는 흘릴지
 * 말지만 고른다).
 */
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';
import {
  CATEGORICAL_QUEUE_IN,
  CATEGORICAL_QUEUE_OUT,
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { ArrivalVsServiceScene } from './scene.js';

const H = 432;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 14;
const MOTION_MS = 450;
const FRAME_MS = 16;

// 위 칸 (시각 · 셈 · 이번 걸음)
const TIME_Y = 26;
const EVENT_Y = 50;
// 줄 칸
const ROW_Y = 106;
const BOX_H = 30;
const SERVER_W = 62;
const SERVER_H = 46;
const CHIP_W = 28;
const CHIP_H = 16;
const CHIP_GAP = 3;
const PILE_COLS = 3;
// 셈 칸
const PLOT_LEFT = 44;
const PLOT_RIGHT = W - 24;
const PLOT_TOP = 194;
const PLOT_BOTTOM = 390;

type Pt = { x: number; y: number };

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 시계 u(0..1) 에서 구간 [a,b] 안의 진행률 (구간 앞은 0, 뒤는 1). */
function seg(u: number, a: number, b: number): number {
  if (u <= a) return 0;
  if (u >= b) return 1;
  return ease((u - a) / (b - a));
}

function r2(v: number): string {
  const n = Math.round(v * 100) / 100;
  return String(Object.is(n, -0) ? 0 : n);
}

export const arrivalVsServiceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const queuePalette = categorical(6, 'vivid');
    const inColor = queuePalette[CATEGORICAL_QUEUE_IN];
    const outColor = queuePalette[CATEGORICAL_QUEUE_OUT];
    if (inColor === undefined || outColor === undefined) {
      throw new Error('arrival-vs-service stage: 큐 색을 찾지 못했다');
    }
    const fontXs = parseFloat(fontSizes.xs);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? r2(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size?: string; weight?: string; fill?: string; anchor?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? '400',
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      node.textContent = text;
      return node;
    }

    function drawStatic(scene: ArrivalVsServiceScene, u: number): void {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      const total = scene.requestIds.length;
      const step = scene.step;
      const last = scene.counts.length > 0 ? scene.counts[scene.counts.length - 1] : null;

      // ── 위 칸: 시각 · 두 셈 · 차
      if (step !== null && last !== null) {
        label(t('caption.time', 'Time: {sec} s', { sec: step.sec }), MARGIN, TIME_Y, {
          size: fontSizes.md,
          weight: '600',
        });
        const statX = [176, 300, 424];
        el('line', { x1: statX[0], y1: TIME_Y - 4, x2: statX[0] + 12, y2: TIME_Y - 4, stroke: inColor, 'stroke-width': 3 });
        label(t('label.in', 'In: {n}', { n: last.arrived }), statX[0] + 16, TIME_Y);
        el('line', { x1: statX[1], y1: TIME_Y - 4, x2: statX[1] + 12, y2: TIME_Y - 4, stroke: outColor, 'stroke-width': 3 });
        label(t('label.out', 'Out: {n}', { n: last.departed }), statX[1] + 16, TIME_Y);
        el('line', { x1: statX[2] + 6, y1: TIME_Y - 11, x2: statX[2] + 6, y2: TIME_Y + 2, stroke: colors.text, 'stroke-width': 2 });
        label(t('label.gap', 'In − Out: {n}', { n: last.arrived - last.departed }), statX[2] + 16, TIME_Y);

        // 이번 걸음 — 같은 시각의 차례대로 (떠남 → 섬 → 처리 시작)
        const colW = (W - 2 * MARGIN) / 3;
        let col = 0;
        if (step.left !== null) {
          label(t('caption.left', 'Done, left: {id}', { id: step.left }), MARGIN + col * colW, EVENT_Y, { fill: colors.textMuted });
          col += 1;
        }
        if (step.came.length > 0) {
          label(t('caption.came', 'Joined the tail: {id}', { id: step.came.join(', ') }), MARGIN + col * colW, EVENT_Y, {
            fill: colors.textMuted,
          });
          col += 1;
        }
        if (step.started !== null) {
          label(t('caption.started', 'Into service: {id}', { id: step.started }), MARGIN + col * colW, EVENT_Y, {
            fill: colors.textMuted,
          });
        }
      }

      // ── 줄 칸의 자리
      const pileSpan = PILE_COLS * CHIP_W + (PILE_COLS - 1) * CHIP_GAP;
      const pileRows = Math.ceil(total / PILE_COLS);
      const pileTop = ROW_Y - (pileRows * CHIP_H + (pileRows - 1) * CHIP_GAP) / 2;
      const pileLeft = W - MARGIN - pileSpan;
      const serverRight = pileLeft - 18;
      const serverLeft = serverRight - SERVER_W;
      const serverCx = serverLeft + SERVER_W / 2;
      const queueRight = serverLeft - 14;
      const slot = Math.min(46, (queueRight - MARGIN) / Math.max(1, total - 1));
      const boxW = slot - 6;
      const slotX = (i: number): number => queueRight - slot * (i + 0.5);
      const offLeft = -boxW;
      const chipX = (k: number): number => pileLeft + CHIP_W / 2 + (CHIP_W + CHIP_GAP) * (k % PILE_COLS);
      const chipY = (k: number): number => pileTop + CHIP_H / 2 + (CHIP_H + CHIP_GAP) * Math.floor(k / PILE_COLS);

      // 서버 틀
      el('rect', {
        x: serverLeft,
        y: ROW_Y - SERVER_H / 2,
        width: SERVER_W,
        height: SERVER_H,
        rx: 6,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      label(t('label.server', 'Server'), serverCx, ROW_Y - SERVER_H / 2 - 8, {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      label(t('label.done', 'Done'), pileLeft + pileSpan / 2, Math.min(pileTop, ROW_Y - SERVER_H / 2) - 8, {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });

      // 떠난 요청 더미 — 떠난 차례대로 칸을 채운다
      const justLeft = step !== null ? step.left : null;
      scene.gone.forEach((id, k) => {
        const isNew = id === justLeft;
        const cx = isNew ? lerp(serverCx, chipX(k), seg(u, 0, 0.45)) : chipX(k);
        const cy = isNew ? lerp(ROW_Y, chipY(k), seg(u, 0, 0.45)) : chipY(k);
        el('rect', {
          x: cx - CHIP_W / 2,
          y: cy - CHIP_H / 2,
          width: CHIP_W,
          height: CHIP_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: isNew ? outColor : colors.border,
          'stroke-width': isNew ? 2 : 1,
        });
        label(id, cx, cy + fontXs / 3, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle', mono: true });
      });

      // 기다리는 줄 — 머리가 서버 쪽, 끝이 왼쪽
      const came = step !== null ? step.came : [];
      const shifted = step !== null && step.started !== null;
      scene.waiting.forEach((id, i) => {
        const to = slotX(i);
        let x = to;
        const isNew = came.includes(id);
        if (isNew) x = lerp(offLeft, to, seg(u, 0.2, 0.7));
        else if (shifted) x = lerp(slotX(i + 1), to, seg(u, 0.45, 1));
        el('rect', {
          x: x - boxW / 2,
          y: ROW_Y - BOX_H / 2,
          width: boxW,
          height: BOX_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: isNew ? inColor : colors.border,
          'stroke-width': isNew ? 2 : 1,
        });
        label(id, x, ROW_Y + fontXs / 3, { size: fontSizes.xs, anchor: 'middle', mono: true });
      });

      // 처리 중
      if (scene.serving !== null) {
        const id = scene.serving;
        let x = serverCx;
        if (step !== null && step.started === id) {
          const from = came.includes(id) ? offLeft : slotX(0);
          x = lerp(from, serverCx, seg(u, came.includes(id) ? 0.2 : 0.45, 1));
        }
        el('rect', {
          x: x - boxW / 2,
          y: ROW_Y - BOX_H / 2,
          width: boxW,
          height: BOX_H,
          rx: 4,
          fill: colors.accent,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        label(id, x, ROW_Y + fontXs / 3, { size: fontSizes.xs, fill: colors.stateInk, anchor: 'middle', mono: true, weight: '600' });
      }

      // 줄 괄호 — 기다리는 요청의 길이만큼
      if (step !== null) {
        const n = scene.waiting.length;
        const by = ROW_Y + BOX_H / 2 + 8;
        if (n > 0) {
          const x1 = slotX(n - 1) - boxW / 2;
          const x2 = slotX(0) + boxW / 2;
          el('path', {
            d: `M${r2(x1)},${r2(by - 4)} V${r2(by)} H${r2(x2)} V${r2(by - 4)}`,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.2,
          });
          label(t('label.queue', 'Waiting: {n}', { n }), (x1 + x2) / 2, by + 16, {
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: 'middle',
          });
        } else {
          label(t('label.queue', 'Waiting: {n}', { n }), slotX(0), by + 16, {
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: 'middle',
          });
        }
      }

      drawPlot(scene, u);
    }

    function drawPlot(scene: ArrivalVsServiceScene, u: number): void {
      const total = scene.requestIds.length;
      const span = scene.lastSec + 1;
      const px = (sec: number): number => PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * sec) / span;
      const py = (n: number): number => PLOT_BOTTOM - ((PLOT_BOTTOM - PLOT_TOP) * n) / total;

      label(t('axis.count', 'Total count'), PLOT_LEFT, PLOT_TOP - 12, { size: fontSizes.xs, fill: colors.textMuted });
      label(t('axis.time', 'Time (s)'), PLOT_RIGHT, H - 6, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' });

      // 눈금
      const yTicks = [0, Math.round(total / 3), Math.round((2 * total) / 3), total];
      for (const n of yTicks) {
        el('line', { x1: PLOT_LEFT, y1: py(n), x2: PLOT_RIGHT, y2: py(n), stroke: colors.border, 'stroke-width': n === 0 ? 1.2 : 0.6 });
        label(String(n), PLOT_LEFT - 8, py(n) + fontXs / 3, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' });
      }
      for (let sec = 0; sec <= scene.lastSec; sec += 1) {
        el('line', { x1: px(sec), y1: PLOT_BOTTOM, x2: px(sec), y2: PLOT_BOTTOM + 4, stroke: colors.border, 'stroke-width': 1 });
        label(String(sec), px(sec), PLOT_BOTTOM + 16, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      }
      el('line', { x1: PLOT_LEFT, y1: PLOT_TOP, x2: PLOT_LEFT, y2: PLOT_BOTTOM, stroke: colors.border, 'stroke-width': 1.2 });

      if (scene.counts.length === 0) return;

      // 마지막 한 칸은 흐르는 중이면 아직 못 온 만큼 짧다
      const grow = seg(u, 0, 0.7);
      const jumped = u >= 0.7;
      const stair = (pick: (c: { arrived: number; departed: number }) => number): Pt[] => {
        const pts: Pt[] = [];
        scene.counts.forEach((c, i) => {
          const isLast = i === scene.counts.length - 1;
          const prevN = i === 0 ? 0 : pick(scene.counts[i - 1]);
          if (i === 0) {
            pts.push({ x: px(c.sec), y: py(0) });
            pts.push({ x: px(c.sec), y: py(pick(c)) });
            return;
          }
          if (isLast && u < 1) {
            pts.push({ x: lerp(px(c.sec - 1), px(c.sec), grow), y: py(prevN) });
            if (jumped) pts.push({ x: px(c.sec), y: py(pick(c)) });
            return;
          }
          pts.push({ x: px(c.sec), y: py(prevN) });
          pts.push({ x: px(c.sec), y: py(pick(c)) });
        });
        return pts;
      };
      const toPath = (pts: Pt[]): string =>
        pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r2(p.x)},${r2(p.y)}`).join(' ');

      const aPts = stair((c) => c.arrived);
      const dPts = stair((c) => c.departed);

      // 지금 시각의 틈 — 들어옴 계단과 나감 계단 사이
      const lastCount = scene.counts[scene.counts.length - 1];
      if (jumped) {
        const gx = px(lastCount.sec) + 7;
        el('path', {
          d: `M${r2(gx - 4)},${r2(py(lastCount.arrived))} H${r2(gx)} V${r2(py(lastCount.departed))} H${r2(gx - 4)}`,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2,
        });
      }

      el('path', { d: toPath(dPts), fill: 'none', stroke: outColor, 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
      el('path', { d: toPath(aPts), fill: 'none', stroke: inColor, 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
      const aEnd = aPts[aPts.length - 1];
      const dEnd = dPts[dPts.length - 1];
      if (aEnd === undefined || dEnd === undefined) throw new Error('arrival-vs-service stage: 계단 끝이 없다');
      el('circle', { cx: aEnd.x, cy: aEnd.y, r: 3.5, fill: inColor });
      el('circle', { cx: dEnd.x, cy: dEnd.y, r: 3.5, fill: outColor });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          timers.delete(timer);
          waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        timers.add(timer);
        waiters.add(done);
      });
    }

    async function render(
      next: ArrivalVsServiceScene,
      prev: ArrivalVsServiceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const flows =
        opts.animate &&
        prev !== null &&
        next.step !== null &&
        prev.step !== null &&
        prev.step.sec === next.step.sec - 1;
      if (!flows) {
        drawStatic(next, 1);
        return;
      }
      const start = Date.now();
      drawStatic(next, 0);
      for (;;) {
        if (mine !== gen || destroyed) return;
        const u = Math.min(1, (Date.now() - start) / MOTION_MS);
        drawStatic(next, u);
        if (u >= 1) break;
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next, 1);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
