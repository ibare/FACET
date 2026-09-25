/**
 * virtual-runtime 무대 — 가상 시간의 경주로.
 *
 * 동사 "뒤처진 쪽이 뽑혀 따라붙는다" 를 가로 경주로로 옮긴다. 가로가 가상 시간이고, 프로세스마다 한 줄을 달린다.
 * 틱마다 가장 왼쪽(가장 뒤처진) 주자가 뽑혀 앞으로 한 번 뛴다. 무거운 것은 짧게, 가벼운 것은 길게 뛴다.
 * 뛴 자리마다 발자국(토막)이 남아, 같은 거리를 몇 번에 나눠 뛰었는가 — 실제로 쓴 틱 — 가 보인다.
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
import type { VirtualRuntimeLane, VirtualRuntimeScene } from './scene';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 300;
const LIFT = 9;
const RUNNER_R = 14;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 좌표를 글자로 — 끝자리와 -0 을 걷는다. */
function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

/** 가상 시간 표시 — 정수는 그대로, 아니면 소수 둘째 자리. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v === 0 ? 0 : v) : v.toFixed(2);
}

function symbol(id: string): string {
  return id.toUpperCase();
}

type Layout = {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  laneH: number;
  xOf(v: number): number;
  yOf(i: number): number;
};

function layout(scene: VirtualRuntimeScene): Layout {
  const W = PIECE_CANVAS_W;
  const x0 = Math.round(W * 0.21);
  const x1 = W - Math.round(W * 0.15);
  const top = 90;
  const bottom = H - 34;
  const n = Math.max(1, scene.lanes.length);
  const laneH = (bottom - top) / n;
  const span = Math.max(1, Math.ceil(scene.max));
  return {
    x0,
    x1,
    top,
    bottom,
    laneH,
    xOf: (v) => r2(x0 + ((x1 - x0) * v) / span),
    yOf: (i) => r2(top + laneH * (i + 0.5)),
  };
}

type Handles = {
  runner: SVGGElement | null;
  trail: SVGRectElement | null;
};

export const virtualRuntimeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function laneName(lane: VirtualRuntimeLane): string {
      return symbol(lane.id);
    }

    function captions(scene: VirtualRuntimeScene): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') {
        return [t('caption.start', 'Every virtual time starts at {v}', { v: 0 }), ''];
      }
      if (step.kind === 'pick') {
        const lane = scene.lanes.find((l) => l.id === step.id);
        if (lane === undefined) throw new Error(`virtual-runtime 무대: 모르는 식별자 ${step.id}`);
        const name = laneName(lane);
        const names = step.tie.map(symbol).join(' · ');
        const first =
          step.by === 'oldest'
            ? t('caption.tie', 'Tick {tick} · tied: {names} · longest since it ran: {name}', {
                tick: step.tick,
                names,
                name,
              })
            : step.by === 'never'
              ? t('caption.tieNever', 'Tick {tick} · tied: {names} · first in the list not yet run: {name}', {
                  tick: step.tick,
                  names,
                  name,
                })
              : t('caption.pick', 'Tick {tick} · furthest behind: {name}', { tick: step.tick, name });
        const second = t('caption.advance', 'Virtual time {from} → {to} (+{inc}, weight {w})', {
          from: fmt(step.from),
          to: fmt(step.to),
          inc: fmt(step.to - step.from),
          w: fmt(lane.weight),
        });
        return [first, second];
      }
      const used = scene.lanes.map((l) => String(l.runs.length)).join(' : ');
      const weights = scene.lanes.map((l) => fmt(l.weight)).join(' : ');
      return [
        t('caption.done', 'Ticks run: {n}', { n: step.ticks }),
        t('caption.ratio', 'Ticks used {used} · weights {weights}', { used, weights }),
      ];
    }

    function drawStatic(scene: VirtualRuntimeScene): Handles {
      svg.textContent = '';
      const handles: Handles = { runner: null, trail: null };
      const L = layout(scene);
      const W = PIECE_CANVAS_W;
      const step = scene.step;
      const picked = step.kind === 'pick' ? step.id : null;
      const hues = categorical(Math.max(1, scene.lanes.length));

      const [c1, c2] = captions(scene);
      el(svg, 'text', { x: 16, y: 26, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: colors.text }, c1);
      el(svg, 'text', { x: 16, y: 47, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted }, c2);

      // 축 — 가상 시간의 눈금
      const axisY = 76;
      el(svg, 'text', { x: 16, y: axisY, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, t('label.axis', 'Virtual time'));
      el(svg, 'text', { x: W - 16, y: axisY, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, t('label.used', 'Ticks used'));
      const span = Math.max(1, Math.ceil(scene.max));
      for (let v = 0; v <= span; v += 1) {
        const x = L.xOf(v);
        el(svg, 'line', { x1: x, y1: axisY + 6, x2: x, y2: L.bottom, stroke: colors.border, 'stroke-width': 1 });
        el(svg, 'text', { x, y: axisY, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted }, String(v));
      }

      // 가장 뒤처진 자리 — 뽑힌 걸음이면 뽑히기 전의 자리, 아니면 지금 가장 작은 가상 시간
      const minV =
        step.kind === 'pick' ? step.from : scene.lanes.reduce((m, l) => Math.min(m, l.v), Infinity);
      if (Number.isFinite(minV)) {
        const mx = L.xOf(minV);
        el(svg, 'line', { x1: mx, y1: axisY + 6, x2: mx, y2: L.bottom, stroke: colors.itemActive, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' });
        const lx = Math.min(Math.max(mx, 80), W - 80);
        el(svg, 'text', { x: lx, y: H - 12, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.itemActive }, t('label.min', 'Smallest virtual time'));
      }

      scene.lanes.forEach((lane, i) => {
        const cy = L.yOf(i);
        const hue = hues[i % hues.length]!;
        const isPicked = lane.id === picked;
        if (isPicked) {
          el(svg, 'rect', { x: 8, y: r2(cy - L.laneH / 2 + 2), width: W - 16, height: r2(L.laneH - 4), rx: 6, fill: colors.bgSubtle });
        }
        // 왼쪽 — 이름 · 무게 · 마지막으로 돈 틱
        el(svg, 'text', { x: 16, y: r2(cy - 5), 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 700, fill: hue }, laneName(lane));
        el(svg, 'text', { x: 16, y: r2(cy + 10), 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, t('label.weight', 'Weight {w}', { w: fmt(lane.weight) }));
        el(svg, 'text', { x: 16, y: r2(cy + 23), 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
          lane.last === null ? t('label.never', 'Not run yet') : t('label.last', 'Last ran: tick {n}', { n: lane.last }));

        // 발자국 — 한 틱에 뛴 거리 하나
        const trailY = r2(cy + 13);
        lane.runs.forEach((run, k) => {
          const isLatest = isPicked && k === lane.runs.length - 1;
          const xa = L.xOf(run.from) + 1.5;
          const xb = L.xOf(run.to) - 1.5;
          const rect = el(svg, 'rect', {
            x: r2(xa), y: trailY, width: r2(Math.max(0, xb - xa)), height: 6, rx: 2,
            fill: hue, opacity: isLatest ? 1 : 0.45,
          });
          if (isLatest) handles.trail = rect;
        });

        // 쓴 틱
        el(svg, 'text', { x: W - 16, y: r2(cy + 5), 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: colors.text }, String(lane.runs.length));

        // 주자 — 가상 시간의 수를 품는다
        const g = el(svg, 'g', { transform: `translate(${L.xOf(lane.v)},${r2(cy - 6)})` });
        if (isPicked) {
          el(g, 'circle', { cx: 0, cy: 0, r: RUNNER_R + 5, fill: 'none', stroke: colors.itemActive, 'stroke-width': 2 });
        }
        el(g, 'circle', { cx: 0, cy: 0, r: RUNNER_R, fill: colors.bg, stroke: hue, 'stroke-width': 3 });
        el(g, 'text', { x: 0, y: 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: colors.text }, fmt(lane.v));
        if (isPicked) handles.runner = g;
      });
      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
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

    async function hop(next: VirtualRuntimeScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'pick') return;
      const idx = next.lanes.findIndex((l) => l.id === step.id);
      if (idx < 0) throw new Error(`virtual-runtime 무대: 모르는 식별자 ${step.id}`);
      const h = drawStatic(next);
      const L = layout(next);
      const cy = L.yOf(idx) - 6;
      const xa = L.xOf(step.from);
      const xb = L.xOf(step.to);
      const trailX = xa + 1.5;
      const place = (p: number): void => {
        const x = r2(xa + (xb - xa) * p);
        const y = r2(cy - LIFT * Math.sin(Math.PI * p));
        h.runner?.setAttribute('transform', `translate(${x},${y})`);
        h.trail?.setAttribute('width', String(r2(Math.max(0, x - 1.5 - trailX))));
      };
      place(0);
      const frames = 18;
      for (let f = 1; f <= frames; f += 1) {
        await wait(MOVE_MS / frames);
        if (mine !== gen || destroyed) return;
        const u = f / frames;
        place(u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      }
      drawStatic(next);
    }

    return {
      render(next: VirtualRuntimeScene, prev: VirtualRuntimeScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step.kind !== 'pick' || prev.step === next.step) {
          drawStatic(next);
          return;
        }
        return hop(next, mine);
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
