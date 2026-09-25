/**
 * ready-queue-pick stage — 준비 큐 한 줄과 CPU 자리 하나.
 *
 * 화면이 쥐는 것은 줄의 구성원이다. 시각의 축 · 대기 시간 · 평균은 그리지 않는다.
 * 도착한 것은 오른쪽(아직 오지 않은 것들)에서 줄 끝으로 걸어 들어오고, CPU 가 비는
 * 걸음에만 줄 맨 앞이 위로 빠져 CPU 자리에 오르며 나머지가 한 칸씩 당겨진다.
 * 끝난 것은 CPU 에서 오른쪽 위 끝난 자리로 옮겨 간다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ReadyQueueScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 24;
const CHIP_H = 40;
const CHIP_W_MAX = 72;
const LANE_PAD = 12;
const POOL_GAP = 8;
const LANE_POOL_GAP = 32;

const Y_TICK = 22;
const Y_CAP1 = 42;
/** 캡션 줄 간격. 캡션은 많아야 셋(끝 · 곧장 오름 · 줄 끝에 섬)이라 셋째 줄이 CPU 이름표 위에 들어간다 */
const CAP_STEP = 18;
const CAP_MAX = 3;
const Y_TOP_LABEL = 92;
const Y_TOP_BOX = 100;
const Y_LANE_LABEL = 196;
const Y_LANE = 204;
const BOX_H = CHIP_H + 2 * LANE_PAD;

/** 한 뜻의 운동 — 한 걸음 한 시계 */
const MOVE_MS = 600;
const PHASE_A_MS = 450;
const PHASE_B_MS = 550;
const FRAME_MS = 16;

type Pt = { x: number; y: number };
type Where = { queue: readonly string[]; cpu: string | null; done: readonly string[] };

type Layout = {
  chipW: number;
  slots: number;
  laneX: number;
  laneW: number;
  poolX: number;
  cpuX: number;
  cpuW: number;
  doneX: number;
  doneW: number;
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function makeLayout(count: number): Layout {
  const n = Math.max(1, count);
  // 화면에 서는 줄은 많아야 n-1 이다 (하나는 CPU 에 있다). 적어도 한 칸.
  const slots = Math.max(1, n - 1);
  const avail = PIECE_CANVAS_W - 2 * MARGIN;
  const fit = (avail - LANE_POOL_GAP - LANE_PAD * (slots + 1) - POOL_GAP * (n - 1)) / (slots + n);
  const chipW = Math.max(24, Math.min(CHIP_W_MAX, Math.floor(fit)));
  const laneW = slots * (chipW + LANE_PAD) + LANE_PAD;
  const poolW = n * (chipW + POOL_GAP) - POOL_GAP;
  const laneX = MARGIN;
  const poolX = PIECE_CANVAS_W - MARGIN - poolW;
  const cpuW = chipW + 2 * LANE_PAD;
  const doneW = n * (chipW + POOL_GAP) - POOL_GAP + 2 * LANE_PAD;
  return {
    chipW,
    slots,
    laneX,
    laneW,
    poolX,
    cpuX: laneX,
    cpuW,
    doneX: PIECE_CANVAS_W - MARGIN - doneW,
    doneW,
  };
}

/** 자리 셈 — 장면(또는 걸음 앞의 자리)에서 칩마다 왼쪽 위 점 */
function place(lay: Layout, procs: readonly string[], w: Where): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const chipY = Y_LANE + LANE_PAD;
  procs.forEach((id, i) => {
    out.set(id, { x: lay.poolX + i * (lay.chipW + POOL_GAP), y: chipY });
  });
  w.queue.forEach((id, i) => {
    out.set(id, { x: lay.laneX + LANE_PAD + i * (lay.chipW + LANE_PAD), y: chipY });
  });
  if (w.cpu !== null) out.set(w.cpu, { x: lay.cpuX + LANE_PAD, y: Y_TOP_BOX + LANE_PAD });
  w.done.forEach((id, i) => {
    out.set(id, { x: lay.doneX + LANE_PAD + i * (lay.chipW + POOL_GAP), y: Y_TOP_BOX + LANE_PAD });
  });
  return out;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function symbol(id: string): string {
  return id.toUpperCase();
}

type Stage = ViewInstance & {
  render(next: ReadyQueueScene, prev: ReadyQueueScene | null, opts: { animate: boolean }): Promise<void>;
  destroy(): void;
};

export const readyQueuePickStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): Stage {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let chips = new Map<string, SVGGElement>();

    function text(
      parent: SVGElement,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; weight?: number; fill?: string; anchor?: string; family?: string } = {},
    ): SVGTextElement {
      const node = el('text', {
        x: round(x),
        y: round(y),
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 400,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      node.textContent = body;
      parent.appendChild(node);
      return node;
    }

    function captionLines(scene: ReadyQueueScene): string[] {
      const step = scene.step;
      if (step === null) {
        return [t('caption.start', 'No one has arrived yet. The line and the CPU are empty.')];
      }
      const lines: string[] = [];
      const straight =
        step.picked !== null &&
        step.queueBefore.length === 0 &&
        step.arrived.length > 0 &&
        step.arrived[0] === step.picked;
      if (step.finished !== null) {
        const done = symbol(step.finished);
        if (step.picked !== null && !straight) {
          lines.push(
            t('caption.finishPick', 'Finished: {done}. The CPU is free — the front of the line goes up: {name}.', {
              done,
              name: symbol(step.picked),
            }),
          );
        } else if (scene.cpu === null) {
          lines.push(t('caption.finishIdle', 'Finished: {done}. The line is empty — the CPU stays idle.', { done }));
        } else {
          lines.push(t('caption.finishOnly', 'Finished: {done}. The CPU is free.', { done }));
        }
      } else if (step.picked !== null && !straight) {
        lines.push(
          t('caption.pick', 'The CPU is free — the front of the line goes up: {name}.', {
            name: symbol(step.picked),
          }),
        );
      }
      const joining = straight ? step.arrived.slice(1) : step.arrived;
      if (straight && step.picked !== null) {
        lines.push(
          t('caption.arriveStraight', 'Arrives: {name}. Nobody is waiting and the CPU is free — it goes straight up.', {
            name: symbol(step.picked),
          }),
        );
      }
      if (joining.length > 0) {
        lines.push(
          t('caption.arriveBusy', 'Arrives: {name}. The CPU is busy — joins the back of the line.', {
            name: joining.map(symbol).join(' · '),
          }),
        );
      }
      return lines;
    }

    function drawStatic(scene: ReadyQueueScene): void {
      svg.textContent = '';
      chips = new Map();
      const lay = makeLayout(scene.procs.length);
      const hues = categorical(Math.max(1, scene.procs.length));

      // 머리 — 틱과 지금 일어난 일
      if (scene.step !== null) {
        text(svg, MARGIN, Y_TICK, t('caption.tick', 'Tick {tick}', { tick: scene.step.tick }), {
          size: fontSizes.md,
          weight: 700,
        });
      }
      const lines = captionLines(scene);
      if (lines.length > CAP_MAX) {
        throw new Error(`ready-queue-pick stage: 캡션이 ${lines.length} 줄이다 — 많아야 ${CAP_MAX} 줄`);
      }
      const y0 = scene.step === null ? Y_TICK : Y_CAP1;
      lines.forEach((line, i) => {
        text(svg, MARGIN, y0 + i * CAP_STEP, line, { size: fontSizes.md });
      });

      // CPU 자리
      text(svg, lay.cpuX, Y_TOP_LABEL, t('label.cpu', 'CPU'), { weight: 700, fill: colors.textMuted });
      svg.appendChild(
        el('rect', {
          x: lay.cpuX,
          y: Y_TOP_BOX,
          width: lay.cpuW,
          height: BOX_H,
          rx: 10,
          fill: colors.bgSubtle,
          stroke: scene.cpu === null ? colors.border : colors.itemActive,
          'stroke-width': scene.cpu === null ? 1.5 : 2.5,
        }),
      );
      if (scene.cpu === null) {
        text(svg, lay.cpuX + lay.cpuW / 2, Y_TOP_BOX + BOX_H / 2 + 4, t('label.cpuIdle', 'idle'), {
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }

      // 줄 맨 앞에서 CPU 로 오르는 길
      const upX = round(lay.laneX + LANE_PAD + lay.chipW / 2);
      svg.appendChild(
        el('line', {
          x1: upX,
          y1: Y_LANE - 2,
          x2: upX,
          y2: Y_TOP_BOX + BOX_H + 2,
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        }),
      );
      svg.appendChild(
        el('path', {
          d: `M ${upX - 5} ${Y_TOP_BOX + BOX_H + 9} L ${upX} ${Y_TOP_BOX + BOX_H + 3} L ${upX + 5} ${Y_TOP_BOX + BOX_H + 9}`,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1.5,
        }),
      );

      // 끝난 자리
      text(svg, lay.doneX, Y_TOP_LABEL, t('label.done', 'Finished'), { weight: 700, fill: colors.textMuted });
      svg.appendChild(
        el('rect', {
          x: lay.doneX,
          y: Y_TOP_BOX,
          width: lay.doneW,
          height: BOX_H,
          rx: 10,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // 준비 큐
      text(svg, lay.laneX, Y_LANE_LABEL, t('label.queue', 'Ready queue'), { weight: 700, fill: colors.textMuted });
      svg.appendChild(
        el('rect', {
          x: lay.laneX,
          y: Y_LANE,
          width: lay.laneW,
          height: BOX_H,
          rx: 10,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        }),
      );
      for (let i = 0; i < lay.slots; i += 1) {
        svg.appendChild(
          el('rect', {
            x: lay.laneX + LANE_PAD + i * (lay.chipW + LANE_PAD),
            y: Y_LANE + LANE_PAD,
            width: lay.chipW,
            height: CHIP_H,
            rx: 8,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
      }
      text(svg, lay.laneX + LANE_PAD, Y_LANE + BOX_H + 16, t('label.front', 'front'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      text(svg, lay.laneX + lay.laneW - LANE_PAD, Y_LANE + BOX_H + 16, t('label.back', 'back'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });

      // 아직 오지 않은 것들
      text(svg, lay.poolX, Y_LANE_LABEL, t('label.outside', 'Not yet arrived'), {
        weight: 700,
        fill: colors.textMuted,
      });

      // 칩 — 장면이 정한 끝 자리에 선다
      const at = place(lay, scene.procs, scene);
      const layer = el('g', {});
      svg.appendChild(layer);
      scene.procs.forEach((id, i) => {
        const pos = at.get(id);
        if (pos === undefined) return;
        const inQueue = scene.queue.includes(id);
        const running = scene.cpu === id;
        const done = scene.done.includes(id);
        const outside = !inQueue && !running && !done;
        const g = el('g', { transform: `translate(${round(pos.x)} ${round(pos.y)})` });
        if (outside || done) g.setAttribute('opacity', outside ? '0.5' : '0.55');
        g.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width: lay.chipW,
            height: CHIP_H,
            rx: 8,
            fill: colors.bg,
            stroke: hues[i] ?? colors.text,
            'stroke-width': running ? 3.5 : 2.5,
            ...(outside ? { 'stroke-dasharray': '5 3' } : {}),
          }),
        );
        text(g, lay.chipW / 2, CHIP_H / 2 + 5, symbol(id), {
          size: fontSizes.lg,
          weight: 700,
          anchor: 'middle',
          family: fonts.mono,
        });
        layer.appendChild(g);
        chips.set(id, g);
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const wake = (): void => {
          timers.delete(timer);
          waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, ms);
        timers.add(timer);
        waiters.add(wake);
      });
    }

    /** 칩 몇을 출발에서 끝 자리로 한 시계에 흘린다 */
    async function tween(
      moves: { id: string; from: Pt; to: Pt }[],
      ms: number,
      mine: number,
    ): Promise<boolean> {
      if (moves.length === 0) return true;
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        const k = ease(p);
        for (const m of moves) {
          const g = chips.get(m.id);
          if (g === undefined) continue;
          const x = round(m.from.x + (m.to.x - m.from.x) * k);
          const y = round(m.from.y + (m.to.y - m.from.y) * k);
          g.setAttribute('transform', `translate(${x} ${y})`);
        }
        if (p >= 1) return true;
        await wait(FRAME_MS);
      }
    }

    async function move(scene: ReadyQueueScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const lay = makeLayout(scene.procs.length);
      const before = place(lay, scene.procs, {
        queue: step.queueBefore,
        cpu: step.cpuBefore,
        done: step.finished !== null ? scene.done.slice(0, -1) : scene.done,
      });
      const after = place(lay, scene.procs, scene);
      const phaseA: { id: string; from: Pt; to: Pt }[] = [];
      const phaseB: { id: string; from: Pt; to: Pt }[] = [];
      for (const id of scene.procs) {
        const from = before.get(id);
        const to = after.get(id);
        if (from === undefined || to === undefined) continue;
        if (from.x === to.x && from.y === to.y) continue;
        (id === step.finished ? phaseA : phaseB).push({ id, from, to });
      }
      // 아직 못 온 만큼 — 움직일 칩을 모두 출발 자리로 되돌려 둔다
      for (const m of [...phaseA, ...phaseB]) {
        chips.get(m.id)?.setAttribute('transform', `translate(${round(m.from.x)} ${round(m.from.y)})`);
      }
      if (phaseA.length > 0 && phaseB.length > 0) {
        if (!(await tween(phaseA, PHASE_A_MS, mine))) return;
        await tween(phaseB, PHASE_B_MS, mine);
      } else {
        await tween([...phaseA, ...phaseB], MOVE_MS, mine);
      }
    }

    return {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || prev === null || next.step === null) return;
        await move(next, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
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
