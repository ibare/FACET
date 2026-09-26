/**
 * local-minimum 무대 — 잦아들어 주저앉는다.
 *
 * 곡선 위의 w 가 오른쪽 벽에서 곡선을 따라 미끄러져 내려온다. 갱신마다 옮긴 거리(아래 축의 호)가 줄고,
 * 접선이 누워 기울기가 0 에 붙는다. 언덕 너머 가장 낮은 곳은 처음부터 고리로 서 있고, 지금 자리의 L 과
 * 그 바닥의 L 사이 틈(ΔL)이 끝까지 닫히지 않은 채 남는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Point, Spot } from './algorithm.js';
import type { LocalMinimumBase, LocalMinimumScene } from './scene.js';

const H = 350;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_X = 30;
const CAPTION_Y1 = 22;
const CAPTION_Y2 = 42;
const PLOT_TOP = 76;
const PLOT_BOTTOM = 246;
const AXIS_Y = 290;
const TICK_Y = 306;
const READOUT_Y = 336;

const MOVE_MS = 400;
const FRAME_MS = 16;
const MARKER_R = 8;
const TRAIL_R = 3;
const LOWEST_R = 8;
const TANGENT_HALF = 44;
const HOP_MAX_H = 18;

/** 수 표시 — 둘째 자리, 빼기는 수학 기호로. */
function fmt(v: number): string {
  const s = v.toFixed(2);
  if (s === '-0.00') throw new Error(`local-minimum 무대: ${v} 가 -0.00 으로 찍힌다`);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** 좌표 반올림 — 흘림과 곧바로의 글자가 끝자리로 갈리지 않게. */
function px(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

type Frame = {
  base: LocalMinimumBase;
  x(w: number): number;
  y(l: number): number;
  /** 화면에서 기울기 g 인 접선의 방향 각 (라디안) */
  angle(g: number): number;
};

function frameOf(base: LocalMinimumBase): Frame {
  const first = base.samples[0];
  const last = base.samples[base.samples.length - 1];
  if (first === undefined || last === undefined) throw new Error('local-minimum 무대: 곡선 표본이 비었다');
  const x0 = PAD_X;
  const x1 = PIECE_CANVAS_W - PAD_X;
  const sx = (x1 - x0) / (last.w - first.w);
  const sy = (PLOT_BOTTOM - PLOT_TOP) / (base.lHi - base.lLo);
  return {
    base,
    x: (w) => x0 + (w - first.w) * sx,
    y: (l) => PLOT_BOTTOM - (l - base.lLo) * sy,
    angle: (g) => Math.atan2(-g * sy, sx),
  };
}

/** 표본 사이를 곧게 이어 곡선 위의 L 을 읽는다 — 곡선 그림과 같은 선이다. */
function lossOnCurve(samples: Spot[], w: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  const a = samples[lo]!;
  const b = samples[hi]!;
  if (w < a.w || w > b.w) throw new Error(`local-minimum 무대: w ${w} 가 곡선 표본 밖이다`);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.w <= w) lo = mid;
    else hi = mid;
  }
  const p = samples[lo]!;
  const q = samples[hi]!;
  const u = (w - p.w) / (q.w - p.w);
  return p.l + (q.l - p.l) * u;
}

/** 운동 중인 지금 자리 — 없으면 장면의 끝 자리 그대로 */
type Live = { w: number; l: number; ang: number };

export const localMinimumStageView: CanvasView = {
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
      attrs: Record<string, string>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, opts: {
      anchor?: 'start' | 'middle' | 'end';
      size?: string;
      fill?: string;
      weight?: string;
      family?: string;
    } = {}): SVGTextElement {
      const node = el(parent, 'text', {
        x: px(x),
        y: px(y),
        'text-anchor': opts.anchor ?? 'start',
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    function hopPath(x0: number, x1: number): string {
      const h = Math.min(Math.abs(x1 - x0) / 2, HOP_MAX_H);
      const mx = (x0 + x1) / 2;
      return `M ${px(x0)} ${px(AXIS_Y)} Q ${px(mx)} ${px(AXIS_Y - 2 * h)} ${px(x1)} ${px(AXIS_Y)}`;
    }

    function captions(scene: LocalMinimumScene, base: LocalMinimumBase, now: Point): void {
      const step = scene.step;
      if (step === null) throw new Error('local-minimum 무대: 바탕이 섰는데 걸음이 없다');
      let line1: string;
      let line2 = '';
      if (step.kind === 'start') {
        line1 = t('caption.start', 'Start: w {w}, slope g {g}.', { w: fmt(now.w), g: fmt(now.g) });
      } else if (!step.stopped) {
        line1 = t('caption.update', 'Update {k}: moved {m}, now |g| {g}.', {
          k: step.k,
          m: fmt(step.moved),
          g: fmt(Math.abs(now.g)),
        });
      } else {
        const hill = scene.hill;
        if (hill === null) throw new Error('local-minimum 무대: 멈춘 걸음에 언덕이 없다');
        line1 = t('caption.stop', 'Update {k}: |g| {g} < {s}, so the updates stop.', {
          k: step.k,
          g: fmt(Math.abs(now.g)),
          s: String(base.stopBelow),
        });
        line2 = t('caption.beyond', 'Beyond the hill (L {h}), the lowest point: L {l}, gap {v}.', {
          h: fmt(hill.l),
          l: fmt(base.lowest.l),
          v: fmt(now.gap),
        });
      }
      label(svg, PAD_X, CAPTION_Y1, line1, { size: fontSizes.md, weight: '600' });
      if (line2 !== '') label(svg, PAD_X, CAPTION_Y2, line2, { size: fontSizes.md, fill: colors.text });
    }

    function drawStatic(scene: LocalMinimumScene, live: Live | null): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return;
      const now = scene.path[scene.path.length - 1];
      if (now === undefined) throw new Error('local-minimum 무대: 바탕이 섰는데 지나온 자리가 없다');
      const f = frameOf(base);

      captions(scene, base, now);

      // 곡선
      const d = base.samples
        .map((s, i) => `${i === 0 ? 'M' : 'L'} ${px(f.x(s.w))} ${px(f.y(s.l))}`)
        .join(' ');
      el(svg, 'path', { d, fill: 'none', stroke: colors.textMuted, 'stroke-width': '2', 'stroke-linejoin': 'round' });

      // w 축과 눈금
      el(svg, 'line', {
        x1: px(PAD_X), y1: px(AXIS_Y), x2: px(PIECE_CANVAS_W - PAD_X), y2: px(AXIS_Y),
        stroke: colors.border, 'stroke-width': '1',
      });
      const wFirst = base.samples[0]!.w;
      const wLast = base.samples[base.samples.length - 1]!.w;
      for (let v = Math.ceil(wFirst); v <= Math.floor(wLast); v += 1) {
        el(svg, 'line', { x1: px(f.x(v)), y1: px(AXIS_Y), x2: px(f.x(v)), y2: px(AXIS_Y + 4), stroke: colors.border, 'stroke-width': '1' });
        label(svg, f.x(v), TICK_Y, fmtTick(v), { anchor: 'middle', size: fontSizes.xs, fill: colors.textMuted });
      }
      label(svg, PIECE_CANVAS_W - PAD_X, TICK_Y, 'w', { anchor: 'end', size: fontSizes.sm, fill: colors.textMuted, family: fonts.mono });

      const curW = live ? live.w : now.w;
      const curL = live ? live.l : now.l;
      const curAng = live ? live.ang : f.angle(now.g);

      // 가장 낮은 곳 — 처음부터 끝까지 그 자리에 있다
      const lx = f.x(base.lowest.w);
      const ly = f.y(base.lowest.l);
      el(svg, 'circle', {
        cx: px(lx), cy: px(ly), r: String(LOWEST_R),
        fill: colors.bg, stroke: colors.text, 'stroke-width': '2', 'stroke-dasharray': '3 2',
      });
      label(svg, lx, ly + LOWEST_R + 16, t('label.lowest', 'lowest point'), { anchor: 'middle', size: fontSizes.sm, fill: colors.text });

      // 틈 — 지금 자리의 L 높이에서 가장 낮은 곳까지
      const cy = f.y(curL);
      el(svg, 'line', {
        x1: px(lx), y1: px(cy), x2: px(f.x(curW)), y2: px(cy),
        stroke: colors.accent, 'stroke-width': '1.5', 'stroke-dasharray': '5 4',
      });
      el(svg, 'line', {
        x1: px(lx), y1: px(cy), x2: px(lx), y2: px(ly - LOWEST_R),
        stroke: colors.accent, 'stroke-width': '3',
      });
      const gapText = t('label.gap', 'ΔL {v}', { v: fmt(now.gap) });
      const pillW = gapText.length * parseFloat(fontSizes.sm) * 0.62 + 14;
      const pillH = parseFloat(fontSizes.sm) + 10;
      const midY = (cy + ly - LOWEST_R) / 2;
      el(svg, 'rect', {
        x: px(lx - 10 - pillW), y: px(midY - pillH / 2), width: px(pillW), height: px(pillH), rx: '4',
        fill: colors.accent,
      });
      label(svg, lx - 10 - pillW / 2, midY + parseFloat(fontSizes.sm) * 0.35, gapText, {
        anchor: 'middle', size: fontSizes.sm, fill: colors.stateInk, weight: '600',
      });

      // 언덕 — 멈춘 뒤에만 (멈춘 자리가 정해져야 두 바닥 사이가 정해진다)
      if (scene.hill !== null) {
        const hx = f.x(scene.hill.w);
        const hy = f.y(scene.hill.l);
        el(svg, 'path', {
          d: `M ${px(hx)} ${px(hy - 6)} l -6 -10 l 12 0 Z`,
          fill: colors.textMuted,
        });
        label(svg, hx, hy - 22, t('label.hill', 'hill'), { anchor: 'middle', size: fontSizes.sm, fill: colors.textMuted });
      }

      // 옮긴 거리 — 축 위의 호. 갱신마다 짧아진다
      const hops = scene.path.length - 1;
      for (let i = 1; i <= hops; i += 1) {
        const a = scene.path[i - 1]!;
        const b = scene.path[i]!;
        const endW = live && i === hops ? live.w : b.w;
        el(svg, 'path', { d: hopPath(f.x(a.w), f.x(endW)), fill: 'none', stroke: colors.itemActive, 'stroke-width': '1.5' });
      }
      for (let i = 0; i < scene.path.length; i += 1) {
        const p = scene.path[i]!;
        if (i === scene.path.length - 1) continue;
        el(svg, 'line', { x1: px(f.x(p.w)), y1: px(AXIS_Y - 3), x2: px(f.x(p.w)), y2: px(AXIS_Y + 3), stroke: colors.itemActive, 'stroke-width': '1.5' });
        // 지나온 자리 — 곡선 위의 작은 점
        el(svg, 'circle', { cx: px(f.x(p.w)), cy: px(f.y(p.l)), r: String(TRAIL_R), fill: colors.itemActive, 'fill-opacity': '0.45' });
      }
      el(svg, 'line', {
        x1: px(f.x(curW)), y1: px(AXIS_Y - 5), x2: px(f.x(curW)), y2: px(AXIS_Y + 5), stroke: colors.itemActive, 'stroke-width': '2',
      });

      // 접선 — 누울수록 기울기가 0 에 가깝다
      const cx = f.x(curW);
      const dx = Math.cos(curAng) * TANGENT_HALF;
      const dy = Math.sin(curAng) * TANGENT_HALF;
      el(svg, 'line', {
        x1: px(cx - dx), y1: px(cy - dy), x2: px(cx + dx), y2: px(cy + dy),
        stroke: colors.text, 'stroke-width': '2', 'stroke-linecap': 'round',
      });

      // 지금 자리
      el(svg, 'circle', {
        cx: px(cx), cy: px(cy), r: String(MARKER_R), fill: colors.itemActive, stroke: colors.bg, 'stroke-width': '2',
      });

      // 계기 — 캡션이 말하는 그 걸음의 값
      label(svg, PAD_X, READOUT_Y, t('readout.now', 'w {w} · L {l} · g {g}', { w: fmt(now.w), l: fmt(now.l), g: fmt(now.g) }), {
        size: fontSizes.md, family: fonts.mono, fill: colors.text,
      });
    }

    function fmtTick(v: number): string {
      return v < 0 ? `−${String(-v)}` : String(v);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function slide(scene: LocalMinimumScene, mine: number): Promise<void> {
      const base = scene.base;
      const step = scene.step;
      if (base === null || step === null || step.kind !== 'update') throw new Error('local-minimum 무대: 미끄러질 갱신이 없다');
      const to = scene.path[scene.path.length - 1];
      if (to === undefined) throw new Error('local-minimum 무대: 갱신 뒤 자리가 없다');
      const f = frameOf(base);
      const a0 = f.angle(step.from.g);
      const a1 = f.angle(to.g);
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const u = Math.min(1, (Date.now() - t0) / MOVE_MS);
        const e = 1 - (1 - u) ** 3;
        const w = step.from.w + (to.w - step.from.w) * e;
        drawStatic(scene, { w, l: lossOnCurve(base.samples, w), ang: a0 + (a1 - a0) * e });
        if (u >= 1) return;
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: LocalMinimumScene, _prev: LocalMinimumScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next, null);
        if (!opts.animate || next.step === null || next.step.kind !== 'update') return;
        await slide(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next, null);
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
