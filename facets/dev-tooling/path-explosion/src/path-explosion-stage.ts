/**
 * path-explosion 의 stage — 결정을 지날 때마다 길이 둘로 갈라져 부채꼴이 곱절로 불어난다.
 *
 * 왼쪽 뿌리에서 결정 띠 하나를 지날 때마다 앞의 길 끝 하나하나가 둘로 벌어진다.
 * 띠 위에는 그 뒤의 길 수가, 띠 아래에는 갈래 칸 두 개와 쌓인 갈래 수가 선다 —
 * 위 줄은 곱해지고 아래 줄은 더해진다. 갈래를 채우는 두 시험은 부채꼴의 위 · 아래
 * 가장자리를 긋는 굵은 선 둘로 남는다.
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
import { pathIndex } from './algorithm.js';
import type { PathExplosionScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 340;
/** 갈라짐 운동의 길이 */
const SPLIT_MS = 450;
const FRAME_MS = 16;

type Layout = {
  pad: number;
  rootX: number;
  captionY: number;
  labelY: number;
  pathsY: number;
  fanTop: number;
  fanBottom: number;
  cellY: number;
  cellH: number;
  branchesY: number;
};

function layout(): Layout {
  const W = PIECE_CANVAS_W;
  const pad = Math.round(W * 0.02);
  const labelW = Math.round(W * 0.14);
  const rootX = pad + labelW;
  return {
    pad,
    rootX,
    captionY: Math.round(H * 0.075),
    labelY: Math.round(H * 0.16),
    pathsY: Math.round(H * 0.225),
    fanTop: Math.round(H * 0.275),
    fanBottom: Math.round(H * 0.8),
    cellY: Math.round(H * 0.835),
    cellH: Math.round(H * 0.035),
    branchesY: Math.round(H * 0.93),
  };
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 글자 폭 짐작 — 넓은 글자(한글 · 한자권 · 가나)는 한 칸, 나머지는 반 칸 남짓 */
function estimateWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x2e80 ? px : px * 0.56;
  }
  return w;
}

export const pathExplosionStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const L = layout();
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);
    const xsPx = parseFloat(fontSizes.xs);
    const testColors = categorical(2, 'vivid');

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // 운동이 만지는 손잡이 — drawStatic 이 매번 새로 짓는다
    let bandPath: SVGPathElement | null = null;
    let testPaths: SVGPathElement[] = [];

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size: number; fill: string; anchor?: string; weight?: string; mono?: boolean },
      parent: Element,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': r2(opts.size),
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    // ── 기하 ──────────────────────────────────────────────
    function geom(n: number) {
      const right = W - L.pad - smPx;
      const dx = n > 0 ? (right - L.rootX) / n : 0;
      const colX = (depth: number): number => L.rootX + depth * dx;
      const span = L.fanBottom - L.fanTop;
      const nodeY = (depth: number, j: number): number =>
        L.fanTop + ((j + 0.5) * span) / 2 ** depth;
      return { dx, colX, nodeY, span };
    }

    /** k 번째 결정의 띠 — 앞 길 끝마다 둘로 벌어지는 선들. q 는 벌어진 정도 (0..1) */
    function bandD(n: number, k: number, q: number): string {
      const g = geom(n);
      const x0 = g.colX(k - 1);
      const x1 = x0 + (g.colX(k) - x0) * q;
      const parts: string[] = [];
      const parents = 2 ** (k - 1);
      for (let j = 0; j < parents; j += 1) {
        const py = g.nodeY(k - 1, j);
        for (const c of [2 * j, 2 * j + 1]) {
          const cy = py + (g.nodeY(k, c) - py) * q;
          parts.push(`M${r2(x0)} ${r2(py)}L${r2(x1)} ${r2(cy)}`);
        }
      }
      return parts.join('');
    }

    /** 시험 하나의 길 — 앞 결정들은 끝까지, 마지막 결정은 q 만큼 */
    function testD(n: number, test: readonly boolean[], q: number): string {
      const g = geom(n);
      let d = `M${r2(g.colX(0))} ${r2(g.nodeY(0, 0))}`;
      for (let depth = 1; depth <= test.length; depth += 1) {
        const px = g.colX(depth - 1);
        const py = g.nodeY(depth - 1, pathIndex(test.slice(0, depth - 1)));
        const cx = g.colX(depth);
        const cy = g.nodeY(depth, pathIndex(test.slice(0, depth)));
        const f = depth === test.length ? q : 1;
        d += `L${r2(px + (cx - px) * f)} ${r2(py + (cy - py) * f)}`;
      }
      return d;
    }

    function bandStroke(n: number, k: number): number {
      const gap = geom(n).span / 2 ** k;
      return r2(Math.min(1.6, Math.max(0.35, gap * 0.5)));
    }

    // ── 정적 그리기 (정본) ─────────────────────────────────
    function drawStatic(scene: PathExplosionScene): void {
      svg.textContent = '';
      bandPath = null;
      testPaths = [];
      const n = scene.decisions.length;
      if (n === 0) return;
      const g = geom(n);
      const current = scene.step.kind === 'pass' ? scene.step.k : 0;
      const passedCount = scene.passed.length;

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (scene.step.kind === 'start') {
        caption = t('caption.start', 'Start — Paths: {paths} · Branches: {branches} · Branch tests: {tests}', {
          paths: scene.paths,
          branches: scene.branches,
          tests: scene.tests.length,
        });
      } else if (scene.step.kind === 'pass') {
        const id = scene.decisions[scene.step.k - 1];
        if (id === undefined) throw new Error(`path-explosion stage: 결정 ${scene.step.k} 이 없다`);
        caption = t('caption.pass', 'Passed {id} — Paths: {paths} · Branches: {branches} · Branch tests: {tests}', {
          id,
          paths: scene.paths,
          branches: scene.branches,
          tests: scene.tests.length,
        });
      } else {
        caption = t('caption.done', 'Tests to cover every branch: {tests} · Tests to walk every path: {paths}', {
          tests: scene.step.tests,
          paths: scene.step.paths,
        });
      }
      const capMax = W - 2 * L.pad;
      const capSize = Math.min(mdPx, (mdPx * capMax) / Math.max(1, estimateWidth(caption, mdPx)));
      label(caption, W / 2, L.captionY, { size: capSize, fill: colors.text, weight: '600' }, svg);

      // 줄 이름 (왼쪽 칸)
      label(t('label.paths', 'Paths'), L.pad, L.pathsY, { size: smPx, fill: colors.textMuted, anchor: 'start' }, svg);
      label(t('label.branches', 'Branches'), L.pad, L.branchesY, { size: smPx, fill: colors.textMuted, anchor: 'start' }, svg);

      // 결정 띠 — 이름 · 길 수 · 갈래 칸 · 쌓인 갈래 수
      const cellW = Math.min(smPx * 1.1, g.dx * 0.3);
      const cellGap = Math.max(2, cellW * 0.25);
      for (let k = 1; k <= n; k += 1) {
        const cx = (g.colX(k - 1) + g.colX(k)) / 2;
        const passed = scene.passed[k - 1];
        const isCurrent = k === current;
        const id = scene.decisions[k - 1];
        if (id === undefined) throw new Error(`path-explosion stage: 결정 ${k} 이 없다`);
        label(
          id,
          cx,
          L.labelY,
          {
            size: smPx,
            fill: passed ? colors.text : colors.textMuted,
            weight: isCurrent ? '700' : 'normal',
            mono: true,
          },
          svg,
        );
        if (isCurrent) {
          const uw = estimateWidth(id, smPx) / 2 + 2;
          el(
            'line',
            {
              x1: r2(cx - uw),
              x2: r2(cx + uw),
              y1: r2(L.labelY + smPx * 0.8),
              y2: r2(L.labelY + smPx * 0.8),
              stroke: colors.accent,
              'stroke-width': 2,
            },
            svg,
          );
        }
        // 띠의 결정 자리 — 옅은 세로 금
        el(
          'line',
          {
            x1: r2(g.colX(k - 1)),
            x2: r2(g.colX(k - 1)),
            y1: L.fanTop,
            y2: L.fanBottom,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
          },
          svg,
        );

        // 갈래 칸 둘 — 참 · 거짓. 채운 시험의 색으로 찬다
        for (const [side, b] of [
          [0, true],
          [1, false],
        ] as const) {
          const x = side === 0 ? cx - cellGap / 2 - cellW : cx + cellGap / 2;
          const by = scene.tests.findIndex((test) => test.length >= k && test[k - 1] === b);
          const filled = passed !== undefined && by >= 0;
          el(
            'rect',
            {
              x: r2(x),
              y: L.cellY,
              width: r2(cellW),
              height: L.cellH,
              rx: 2,
              fill: filled ? (testColors[by % testColors.length] ?? colors.accent) : colors.bg,
              stroke: filled ? 'none' : colors.border,
              'stroke-width': 1,
            },
            svg,
          );
        }

        if (passed) {
          const weight = isCurrent ? '700' : 'normal';
          label(String(passed.paths), cx, L.pathsY, { size: smPx, fill: colors.text, weight, mono: true }, svg);
          label(String(passed.branches), cx, L.branchesY, { size: smPx, fill: colors.text, weight, mono: true }, svg);
        }
      }

      // 부채꼴 — 지난 결정마다 한 띠
      const fanColor = colors.textMuted;
      for (let k = 1; k <= passedCount; k += 1) {
        const path = el(
          'path',
          {
            d: bandD(n, k, 1),
            fill: 'none',
            stroke: fanColor,
            'stroke-width': bandStroke(n, k),
            'stroke-linecap': 'butt',
          },
          svg,
        );
        if (k === current) bandPath = path;
      }
      // 뿌리 — 결정 앞의 길 하나
      el('circle', { cx: r2(g.colX(0)), cy: r2(g.nodeY(0, 0)), r: 3.5, fill: colors.text }, svg);

      // 갈래를 채우는 시험 — 굵은 선
      scene.tests.forEach((test, i) => {
        const color = testColors[i % testColors.length] ?? colors.accent;
        testPaths.push(
          el(
            'path',
            {
              d: testD(n, test, 1),
              fill: 'none',
              stroke: color,
              'stroke-width': 3,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            },
            svg,
          ),
        );
      });

      // 시험 범례 (왼쪽 칸) — 모두 참 · 모두 거짓
      scene.tests.forEach((test, i) => {
        const allTrue = test.every((b) => b);
        const allFalse = test.every((b) => !b);
        if (!allTrue && !allFalse) return;
        const color = testColors[i % testColors.length] ?? colors.accent;
        const y = allTrue ? L.fanTop + xsPx : L.fanBottom - xsPx;
        el(
          'line',
          { x1: L.pad, x2: L.pad + smPx, y1: r2(y), y2: r2(y), stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round' },
          svg,
        );
        label(
          allTrue ? t('label.allTrue', 'all true') : t('label.allFalse', 'all false'),
          L.pad + smPx * 1.5,
          y,
          { size: xsPx, fill: colors.text, anchor: 'start' },
          svg,
        );
      });
    }

    // ── 운동 ──────────────────────────────────────────────
    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function split(scene: PathExplosionScene, k: number, mine: number): Promise<void> {
      const n = scene.decisions.length;
      const steps = Math.max(1, Math.round(SPLIT_MS / FRAME_MS));
      for (let i = 0; i <= steps; i += 1) {
        if (mine !== gen || destroyed) return;
        const q = i / steps;
        const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
        bandPath?.setAttribute('d', bandD(n, k, e));
        scene.tests.forEach((test, ti) => testPaths[ti]?.setAttribute('d', testD(n, test, e)));
        if (i < steps) await wait(FRAME_MS);
      }
    }

    return {
      async render(
        next: PathExplosionScene,
        _prev: PathExplosionScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'pass') return;
        await split(next, next.step.k, mine);
        if (mine !== gen || destroyed) return;
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
