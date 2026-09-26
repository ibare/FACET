/**
 * add-noise-then-remove 의 무대.
 *
 * 왼쪽 — 두 몫의 사분원. 가로가 원본의 몫 √ᾱ, 세로가 잡음의 몫 √(1 − ᾱ).
 *   제곱 합이 늘 1 이라 점은 원호 위를 미끄러져 가로축에서 세로축 쪽으로 기운다.
 *   가로축 위 굵은 막대(원본의 몫)가 줄고 세로축 위 막대(잡음의 몫)가 는다.
 * 오른쪽 — 칸 다섯. 칸마다 0 에서 원본의 몫만큼(원본 색) 쌓고 그 끝에서 잡음의 몫만큼
 *   (잡음 색) 이어 쌓은 끝이 x_t 점이다. 원본 자리 x₀ 와 잡음 자리 ε 는 눈금으로 남는다.
 * 되돌림 — 잡음 막대가 줄어 사라지고(덜어 냄), 원본 막대가 원본 자리까지 늘어난다(나눔).
 *   사분원의 점도 같은 두 마디를 걷는다 — 아래로 내려와 가로축에 닿고, 가로로 1 까지.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { AddNoiseThenRemoveScene, MixState } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MIX_MS = 450;
const REVERT_PHASE_MS = 400;
const FRAME_MS = 16;

/** 수식 기호 — 언어와 무관하다. */
const SYM_T = 't';
const SYM_ORIGIN = 'x₀';
const SYM_NOISE = 'ε';
const SYM_ALPHA_BAR = 'ᾱ';
const SYM_RECOVERED = 'x̂₀';

type Share = { a: number; b: number };

/** 한 순간의 그림. 정적 그리기와 운동이 같은 그리기 함수를 쓴다. */
type Frame = {
  point: Share;
  route: Share[];
  trailCount: number;
  signalParts: number[];
  noiseParts: number[];
};

/** 표시할 때만 자른다. −0 은 0 으로, 음수 부호는 빼기 기호(−)로. */
function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpList(a: number[], b: number[], u: number): number[] {
  return a.map((x, i) => lerp(x, b[i]!, u));
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function mixShare(m: MixState): Share {
  return { a: m.signal, b: m.noise };
}

function staticFrame(scene: AddNoiseThenRemoveScene): Frame | null {
  if (scene.now === null) return null;
  if (scene.now.kind === 'mix') {
    const m = scene.now.mix;
    return {
      point: mixShare(m),
      route: [],
      trailCount: scene.trail.length,
      signalParts: m.signalParts,
      noiseParts: m.noiseParts,
    };
  }
  const rv = scene.now.revert;
  const from = mixShare(rv.from);
  // 되돌린 칸의 몫 — 알고리즘이 셈해 실었다.
  const end: Share = { a: rv.after.signal, b: rv.after.noise };
  return {
    point: end,
    route: [from, { a: from.a, b: 0 }, end],
    trailCount: scene.trail.length,
    signalParts: rv.recovered,
    noiseParts: rv.recovered.map(() => 0),
  };
}

type Layout = {
  ox: number;
  oy: number;
  radius: number;
  colX: number[];
  colW: number;
  y: (v: number) => number;
  zeroY: number;
};

function layoutFor(scene: AddNoiseThenRemoveScene): Layout {
  const leftW = Math.min(260, W * 0.42);
  const ox = 58;
  const oy = H - 52;
  const radius = Math.min(leftW - ox - 12, oy - 104);
  const rightX0 = leftW + 36;
  const rightX1 = W - 16;
  const n = scene.origin.length;
  const colW = (rightX1 - rightX0) / n;
  const colX = scene.origin.map((_, i) => rightX0 + colW * (i + 0.5));
  // 칸 값은 √ᾱ·x₀ + √(1−ᾱ)·ε 라 √(x₀² + ε²) 를 넘지 않는다 — 그 안에 담는다.
  let bound = 1;
  scene.origin.forEach((x, i) => {
    bound = Math.max(bound, Math.hypot(x, scene.noise[i]!));
  });
  bound *= 1.05;
  const top = 78;
  const bottom = H - 52;
  const mid = (top + bottom) / 2;
  const half = (bottom - top) / 2;
  const y = (v: number): number => r2(mid - (v / bound) * half);
  return { ox, oy, radius, colX, colW, y, zeroY: y(0) };
}

export const addNoiseThenRemoveStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [cOrigin, cNoise] = categorical(2);
    if (cOrigin === undefined || cNoise === undefined) {
      throw new Error('add-noise-then-remove 무대: categorical(2) 가 색 둘을 내지 않았다');
    }

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

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { anchor?: string; size?: string; fill?: string; family?: string; weight?: string } = {},
    ): void {
      const node = el(parent, 'text', {
        x: r2(x),
        y: r2(y),
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
    }

    function drawShares(root: Element, scene: AddNoiseThenRemoveScene, lay: Layout, f: Frame): void {
      const { ox, oy, radius } = lay;
      const px = (s: Share): number => r2(ox + radius * s.a);
      const py = (s: Share): number => r2(oy - radius * s.b);

      // 축과 원호 — 제곱 합이 1 인 자리
      el(root, 'line', { x1: ox, y1: oy, x2: ox + radius + 10, y2: oy, stroke: colors.border, 'stroke-width': 1 });
      el(root, 'line', { x1: ox, y1: oy, x2: ox, y2: oy - radius - 10, stroke: colors.border, 'stroke-width': 1 });
      el(root, 'path', {
        d: `M ${ox + radius} ${oy} A ${radius} ${radius} 0 0 0 ${ox} ${oy - radius}`,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 4',
      });
      label(root, ox + radius + 16, oy + 4, '1', { fill: colors.textMuted, size: fontSizes.xs, anchor: 'start' });
      label(root, ox + radius / 2, oy + 36, t('axis.signal', 'original share'), { fill: cOrigin, weight: '600' });
      label(root, ox - 4, oy - radius - 20, t('axis.noise', 'noise share'), {
        fill: cNoise,
        weight: '600',
        anchor: 'start',
      });

      // 두 몫의 막대 — 가로축 위 원본의 몫, 세로축 위 잡음의 몫
      const p = f.point;
      if (p.a > 0) {
        el(root, 'line', { x1: ox, y1: oy, x2: px(p), y2: oy, stroke: cOrigin, 'stroke-width': 7 });
      }
      if (p.b > 0) {
        el(root, 'line', { x1: ox, y1: oy, x2: ox, y2: py(p), stroke: cNoise, 'stroke-width': 7 });
      }
      // 점에서 축으로 내린 안내선
      el(root, 'line', { x1: px(p), y1: py(p), x2: px(p), y2: oy, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 3' });
      el(root, 'line', { x1: px(p), y1: py(p), x2: ox, y2: py(p), stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 3' });

      // 지나온 t 의 점
      for (let i = 0; i < f.trailCount && i < scene.trail.length; i += 1) {
        const s = scene.trail[i]!;
        const sh = { a: s.signal, b: s.noise };
        el(root, 'circle', { cx: px(sh), cy: py(sh), r: 3, fill: colors.textMuted });
      }

      // 되돌림이 걸은 두 마디
      if (f.route.length > 1) {
        const pts = f.route.map((s) => `${px(s)},${py(s)}`).join(' ');
        el(root, 'polyline', {
          points: pts,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        });
      }

      el(root, 'circle', { cx: px(p), cy: py(p), r: 6.5, fill: colors.text, stroke: colors.bg, 'stroke-width': 2 });

      // 몫의 값
      label(root, px(p), oy + 18, fmt(p.a, 2), { fill: cOrigin, family: fonts.mono });
      label(root, ox - 8, py(p) + 4, fmt(p.b, 2), { fill: cNoise, family: fonts.mono, anchor: 'end' });
    }

    function drawCells(root: Element, scene: AddNoiseThenRemoveScene, lay: Layout, f: Frame, shown: number[]): void {
      const { colX, colW, y, zeroY } = lay;
      const x0 = colX[0]! - colW / 2;
      const x1 = colX[colX.length - 1]! + colW / 2;
      el(root, 'line', { x1: x0, y1: zeroY, x2: x1, y2: zeroY, stroke: colors.border, 'stroke-width': 1 });
      label(root, x0 - 4, zeroY + 4, '0', { fill: colors.textMuted, size: fontSizes.xs, anchor: 'end' });

      // 보기 — 원본 자리 · 잡음 자리
      const ly = 58;
      el(root, 'line', { x1: x0 + 4, y1: ly, x2: x0 + 20, y2: ly, stroke: cOrigin, 'stroke-width': 2.5 });
      label(root, x0 + 26, ly + 4, `${SYM_ORIGIN} ${t('legend.origin', 'original')}`, { anchor: 'start', fill: colors.textMuted });
      const mid = (x0 + x1) / 2 + 12;
      el(root, 'line', { x1: mid, y1: ly, x2: mid + 16, y2: ly, stroke: cNoise, 'stroke-width': 2.5, 'stroke-dasharray': '4 3' });
      label(root, mid + 22, ly + 4, `${SYM_NOISE} ${t('legend.noise', 'noise')}`, { anchor: 'start', fill: colors.textMuted });

      const tick = Math.min(16, colW * 0.28);
      const bar = Math.min(8, colW * 0.14);
      colX.forEach((cx, i) => {
        const sp = f.signalParts[i]!;
        const np = f.noiseParts[i]!;
        // 원본 자리 · 잡음 자리 눈금
        el(root, 'line', {
          x1: r2(cx - bar - tick),
          y1: y(scene.origin[i]!),
          x2: r2(cx - bar + 2),
          y2: y(scene.origin[i]!),
          stroke: cOrigin,
          'stroke-width': 2.5,
        });
        el(root, 'line', {
          x1: r2(cx + bar - 2),
          y1: y(scene.noise[i]!),
          x2: r2(cx + bar + tick),
          y2: y(scene.noise[i]!),
          stroke: cNoise,
          'stroke-width': 2.5,
          'stroke-dasharray': '4 3',
        });
        // 원본의 몫만큼, 이어서 잡음의 몫만큼
        el(root, 'line', {
          x1: r2(cx - bar / 2),
          y1: zeroY,
          x2: r2(cx - bar / 2),
          y2: y(sp),
          stroke: cOrigin,
          'stroke-width': bar,
        });
        el(root, 'line', {
          x1: r2(cx + bar / 2),
          y1: y(sp),
          x2: r2(cx + bar / 2),
          y2: y(sp + np),
          stroke: cNoise,
          'stroke-width': bar,
        });
        el(root, 'line', {
          x1: r2(cx - bar),
          y1: y(sp),
          x2: r2(cx + bar),
          y2: y(sp),
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
        el(root, 'circle', { cx: r2(cx), cy: y(sp + np), r: 5, fill: colors.text, stroke: colors.bg, 'stroke-width': 1.5 });
        label(root, cx, H - 24, fmt(shown[i]!, 2), { family: fonts.mono });
      });
    }

    function caption(root: Element, scene: AddNoiseThenRemoveScene, lay: Layout): void {
      if (scene.now === null) return;
      if (scene.now.kind === 'mix') {
        const m = scene.now.mix;
        label(root, lay.ox - 30, 60, `${SYM_T} ${m.tIndex}`, { anchor: 'start', size: fontSizes.lg, weight: '600', family: fonts.mono });
        label(
          root,
          lay.ox + lay.radius,
          60,
          `${fmt(m.signal, 2)}² + ${fmt(m.noise, 2)}² = ${fmt(m.sumSquares, 2)}`,
          { anchor: 'end', family: fonts.mono, fill: colors.textMuted },
        );
        label(
          root,
          W / 2,
          26,
          t('caption.mix', '{abar} = {abarValue} · original share {a} · noise share {b}', {
            abar: SYM_ALPHA_BAR,
            abarValue: fmt(m.alphaBar, 3),
            a: fmt(m.signal, 2),
            b: fmt(m.noise, 2),
          }),
          { size: fontSizes.md },
        );
        return;
      }
      const rv = scene.now.revert;
      label(root, lay.ox - 30, 60, SYM_RECOVERED, { anchor: 'start', size: fontSizes.lg, weight: '600', family: fonts.mono });
      label(
        root,
        W / 2,
        26,
        t('caption.revert', 'Remove noise {eps} × {b} · divide by {a} · largest gap from the original: {gap}', {
          eps: SYM_NOISE,
          b: fmt(rv.removed, 2),
          a: fmt(rv.divisor, 2),
          gap: rv.maxGap.toExponential(1),
        }),
        { size: fontSizes.md },
      );
    }

    function shownValues(scene: AddNoiseThenRemoveScene): number[] {
      if (scene.now === null) return [];
      return scene.now.kind === 'mix' ? scene.now.mix.values : scene.now.revert.recovered;
    }

    function drawFrame(scene: AddNoiseThenRemoveScene, f: Frame | null): void {
      svg.textContent = '';
      // 걸음 0 을 세우는 silent init 앞에는 그릴 것이 없다.
      if (f === null) return;
      const lay = layoutFor(scene);
      const root = el(svg, 'g', {});
      caption(root, scene, lay);
      drawShares(root, scene, lay, f);
      drawCells(root, scene, lay, f, shownValues(scene));
    }

    function drawStatic(scene: AddNoiseThenRemoveScene): void {
      drawFrame(scene, staticFrame(scene));
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 한 시계로 u 를 0 에서 1 까지 흘린다. 세대가 바뀌면 물러난다. */
    async function tween(mine: number, ms: number, paint: (u: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let k = 1; k <= frames; k += 1) {
        if (mine !== gen || destroyed) return false;
        paint(ease(k / frames));
        await wait(FRAME_MS);
      }
      return mine === gen && !destroyed;
    }

    async function animateMix(mine: number, next: AddNoiseThenRemoveScene, from: MixState): Promise<boolean> {
      if (next.now === null || next.now.kind !== 'mix') return true;
      const to = next.now.mix;
      const th0 = Math.atan2(from.noise, from.signal);
      const th1 = Math.atan2(to.noise, to.signal);
      return tween(mine, MIX_MS, (u) => {
        const th = lerp(th0, th1, u);
        drawFrame(next, {
          point: { a: Math.cos(th), b: Math.sin(th) },
          route: [],
          trailCount: next.trail.length - 1,
          signalParts: lerpList(from.signalParts, to.signalParts, u),
          noiseParts: lerpList(from.noiseParts, to.noiseParts, u),
        });
      });
    }

    async function animateRevert(mine: number, next: AddNoiseThenRemoveScene): Promise<boolean> {
      if (next.now === null || next.now.kind !== 'revert') return true;
      const rv = next.now.revert;
      const from = mixShare(rv.from);
      const corner: Share = { a: from.a, b: 0 };
      const end: Share = { a: rv.after.signal, b: rv.after.noise };
      const zeros = rv.from.noiseParts.map(() => 0);
      // 첫 마디 — 섞인 잡음을 덜어 낸다
      const first = await tween(mine, REVERT_PHASE_MS, (u) => {
        const pt: Share = { a: from.a, b: lerp(from.b, 0, u) };
        drawFrame(next, {
          point: pt,
          route: [from, pt],
          trailCount: next.trail.length,
          signalParts: lerpList(rv.from.signalParts, rv.afterRemove, u),
          noiseParts: lerpList(rv.from.noiseParts, zeros, u),
        });
      });
      if (!first) return false;
      // 둘째 마디 — 원본의 몫으로 나눈다
      return tween(mine, REVERT_PHASE_MS, (u) => {
        const pt: Share = { a: lerp(corner.a, end.a, u), b: 0 };
        drawFrame(next, {
          point: pt,
          route: [from, corner, pt],
          trailCount: next.trail.length,
          signalParts: lerpList(rv.afterRemove, rv.recovered, u),
          noiseParts: zeros,
        });
      });
    }

    return {
      async render(
        next: AddNoiseThenRemoveScene,
        _prev: AddNoiseThenRemoveScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step === null) {
          drawStatic(next);
          return;
        }
        const ok =
          step.kind === 'mix' ? await animateMix(mine, next, step.from) : await animateRevert(mine, next);
        if (!ok || mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
