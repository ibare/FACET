import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import type { ReadIsSubscribeScene, ReadIsSubscribeSceneView } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 460;

const VALUE_X = 100;
const VALUE_W = 140;
const VALUE_H = 46;
const VALUE_Y = [86, 172, 258, 344];

const VIEW_X = 520;
const VIEW_W = 190;
const VIEW_H = 74;
const VIEW_Y = [120, 240, 360];

const DURATION_MS = 460;

type Point = { x: number; y: number };
type Curve = { p0: Point; p1: Point; p2: Point; p3: Point };
type Motion = { prev: ReadIsSubscribeScene; progress: number };

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function textEl(x: number, y: number, body: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = svgEl('text', { x, y, ...attrs });
  el.textContent = body;
  return el;
}

function edgeCurve(fromIdx: number, toIdx: number): Curve {
  const y1 = VALUE_Y[fromIdx];
  const y2 = VIEW_Y[toIdx];
  if (y1 === undefined || y2 === undefined) throw new Error(`알 수 없는 자리: value ${fromIdx} · view ${toIdx}`);
  const x0 = VALUE_X + VALUE_W / 2;
  const x3 = VIEW_X - VIEW_W / 2;
  const midX = (x0 + x3) / 2;
  return { p0: { x: x0, y: y1 }, p1: { x: midX, y: y1 }, p2: { x: midX, y: y2 }, p3: { x: x3, y: y2 } };
}

function curvePath(c: Curve): string {
  return `M${c.p0.x},${c.p0.y} C${c.p1.x},${c.p1.y} ${c.p2.x},${c.p2.y} ${c.p3.x},${c.p3.y}`;
}

function bezierPoint(c: Curve, t: number): Point {
  const mt = 1 - t;
  const x = mt ** 3 * c.p0.x + 3 * mt ** 2 * t * c.p1.x + 3 * mt * t ** 2 * c.p2.x + t ** 3 * c.p3.x;
  const y = mt ** 3 * c.p0.y + 3 * mt ** 2 * t * c.p1.y + 3 * mt * t ** 2 * c.p2.y + t ** 3 * c.p3.y;
  return { x, y };
}

function valueIndex(scene: ReadIsSubscribeScene, name: string): number {
  const i = scene.values.findIndex((v) => v.name === name);
  if (i < 0) throw new Error(`알 수 없는 값 이름: ${name}`);
  return i;
}

function viewIndex(scene: ReadIsSubscribeScene, name: string): number {
  const i = scene.views.findIndex((v) => v.name === name);
  if (i < 0) throw new Error(`알 수 없는 뷰 이름: ${name}`);
  return i;
}

function findView(views: ReadIsSubscribeSceneView[], name: string): ReadIsSubscribeSceneView {
  const found = views.find((v) => v.name === name);
  if (!found) throw new Error(`알 수 없는 뷰 이름: ${name}`);
  return found;
}

function outputText(output: number | string | null): string {
  return output === null ? '—' : String(output);
}

function mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
  const svg = params.canvas;
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const palette: Palette = getColors(params.theme);
  const valueColors = categorical(4, 'vivid');

  let destroyed = false;
  let gen = 0;
  const frames = new Set<number>();
  const waiters = new Set<() => void>();

  function drawEdge(g: SVGElement, fromIdx: number, toIdx: number, color: string, dashOffset: number): void {
    const c = edgeCurve(fromIdx, toIdx);
    g.appendChild(
      svgEl('path', {
        d: curvePath(c),
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        pathLength: 1,
        'stroke-dasharray': 1,
        'stroke-dashoffset': dashOffset,
      }),
    );
  }

  function drawValueBox(g: SVGElement, i: number, name: string, value: number | string): void {
    const color = valueColors[i] ?? palette.border;
    const y = VALUE_Y[i];
    if (y === undefined) throw new Error(`알 수 없는 값 자리: ${i}`);
    const x = VALUE_X - VALUE_W / 2;
    g.appendChild(
      svgEl('rect', {
        x,
        y: y - VALUE_H / 2,
        width: VALUE_W,
        height: VALUE_H,
        rx: 8,
        fill: palette.bg,
        stroke: color,
        'stroke-width': 2,
      }),
    );
    g.appendChild(
      textEl(VALUE_X, y - 6, name, {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: palette.textMuted,
      }),
    );
    g.appendChild(
      textEl(VALUE_X, y + 16, String(value), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: color,
      }),
    );
  }

  function drawViewBox(g: SVGElement, j: number, view: ReadIsSubscribeSceneView): void {
    const y = VIEW_Y[j];
    if (y === undefined) throw new Error(`알 수 없는 뷰 자리: ${j}`);
    const x = VIEW_X - VIEW_W / 2;
    const top = y - VIEW_H / 2;
    g.appendChild(
      svgEl('rect', {
        x,
        y: top,
        width: VIEW_W,
        height: VIEW_H,
        rx: 8,
        fill: palette.bgSubtle,
        stroke: palette.border,
        'stroke-width': 2,
      }),
    );
    const line0 = view.code[0] ?? '';
    const line1 = view.code[1] ?? '';
    g.appendChild(
      textEl(x + 12, top + 20, line0, {
        'text-anchor': 'start',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: palette.text,
      }),
    );
    g.appendChild(
      textEl(x + 12, top + 36, line1, {
        'text-anchor': 'start',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: palette.text,
      }),
    );
    g.appendChild(
      textEl(x + 12, top + 60, `→ ${outputText(view.output)}`, {
        'text-anchor': 'start',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: palette.primary,
      }),
    );
  }

  function drawWriteChip(g: SVGElement, i: number, name: string, value: number | string, done: boolean): void {
    const chipW = 170;
    const gap = (W - 40 - chipW * 3) / 2;
    const x = 20 + i * (chipW + gap);
    const yc = 432;
    const chipH = 26;
    g.appendChild(
      svgEl('rect', {
        x,
        y: yc - chipH / 2,
        width: chipW,
        height: chipH,
        rx: 6,
        fill: palette.bg,
        stroke: done ? palette.border : palette.text,
        'stroke-width': 1.5,
        opacity: done ? 0.5 : 1,
      }),
    );
    g.appendChild(
      textEl(x + chipW / 2, yc + 5, `${name} = ${value}`, {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: done ? palette.textMuted : palette.text,
        opacity: done ? 0.6 : 1,
      }),
    );
  }

  function drawCaption(g: SVGElement, scene: ReadIsSubscribeScene): void {
    const step = scene.step;
    if (step === null) {
      g.appendChild(
        textEl(W / 2, 20, t('caption.init', 'Nothing has run yet — no lines.'), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: palette.text,
        }),
      );
      return;
    }
    if (step.kind === 'read') {
      g.appendChild(
        textEl(
          W / 2,
          20,
          t('caption.read', 'Read: {name} → {view}', { name: step.name, view: step.view }),
          { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: palette.text },
        ),
      );
      return;
    }
    g.appendChild(
      textEl(W / 2, 18, t('caption.write', 'Write: {name} = {value}', { name: step.name, value: step.value }), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.text,
      }),
    );
    g.appendChild(
      textEl(W / 2, 36, t('caption.redraw', 'Redraw: {n}', { n: step.targets.length }), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.textMuted,
      }),
    );
  }

  function drawScene(scene: ReadIsSubscribeScene, motion: Motion | null): void {
    svg.replaceChildren();
    const g = svgEl('g');
    svg.appendChild(g);

    drawCaption(g, scene);

    g.appendChild(
      textEl(VALUE_X - VALUE_W / 2, 58, t('label.values', 'Values'), {
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      }),
    );
    g.appendChild(
      textEl(VIEW_X - VIEW_W / 2, 58, t('label.views', 'Views'), {
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      }),
    );
    g.appendChild(
      textEl(20, 413, t('label.writes', 'Writes'), {
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      }),
    );

    // 줄 — 기존은 완전히, 이번 걸음에 새로 생긴 것은(motion 이 있으면) 자라는 중.
    const baseEdges = motion ? motion.prev.edges : scene.edges;
    for (const e of baseEdges) {
      drawEdge(g, valueIndex(scene, e.from), viewIndex(scene, e.to), valueColors[valueIndex(scene, e.from)] ?? palette.border, 0);
    }
    if (motion) {
      const growing = scene.edges.slice(motion.prev.edges.length);
      for (const e of growing) {
        const fromIdx = valueIndex(scene, e.from);
        drawEdge(g, fromIdx, viewIndex(scene, e.to), valueColors[fromIdx] ?? palette.border, 1 - motion.progress);
      }
    }

    // 값 상자 — 쓰기는 곧바로 반영되므로 늘 이번 장면(next) 기준.
    scene.values.forEach((v, i) => drawValueBox(g, i, v.name, v.value));

    // 뷰 상자 — 흐르는 중에는 줄이 닿기 전까지 이전 출력을 보인다.
    const viewSource = motion ? motion.prev.views : scene.views;
    scene.views.forEach((v, j) => drawViewBox(g, j, findView(viewSource, v.name)));

    // 쓰기가 줄을 따라가는 것 · 아무도 없으면 값 자리에서 사그라드는 고리.
    if (motion && scene.step !== null && scene.step.kind === 'write') {
      const fromIdx = valueIndex(scene, scene.step.name);
      if (scene.step.targets.length === 0) {
        const c = edgeCurve(fromIdx, 0);
        const r = 6 + 12 * motion.progress;
        g.appendChild(
          svgEl('circle', {
            cx: c.p0.x,
            cy: c.p0.y,
            r,
            fill: 'none',
            stroke: palette.textMuted,
            'stroke-width': 2,
            opacity: 1 - motion.progress,
          }),
        );
      } else {
        for (const target of scene.step.targets) {
          const toIdx = viewIndex(scene, target);
          const c = edgeCurve(fromIdx, toIdx);
          const p = bezierPoint(c, motion.progress);
          g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 5, fill: palette.itemActive }));
        }
      }
    }

    // 쓰기 목록 — 처리된 것은 바래고, 남은 것은 그대로.
    scene.writes.forEach((w, i) => drawWriteChip(g, i, w.name, w.value, i <= scene.writeIndex));
  }

  function drawStatic(scene: ReadIsSubscribeScene): void {
    drawScene(scene, null);
  }

  function animate(next: ReadIsSubscribeScene, prev: ReadIsSubscribeScene, mine: number): Promise<void> {
    return new Promise((resolve) => {
      waiters.add(resolve);
      const start = performance.now();

      function finish(): void {
        waiters.delete(resolve);
        if (!destroyed) drawStatic(next);
        resolve();
      }

      function frame(now: number): void {
        if (destroyed || mine !== gen) return;
        const progress = (now - start) / DURATION_MS;
        if (progress >= 1) {
          finish();
          return;
        }
        drawScene(next, { prev, progress });
        const id = requestAnimationFrame(frame);
        frames.add(id);
      }

      const id = requestAnimationFrame(frame);
      frames.add(id);
    });
  }

  function render(
    next: ReadIsSubscribeScene,
    prev: ReadIsSubscribeScene | null,
    opts: { animate: boolean },
  ): void | Promise<void> {
    gen += 1;
    const mine = gen;
    if (!opts.animate || prev === null || destroyed) {
      drawStatic(next);
      return;
    }
    return animate(next, prev, mine);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    svg.replaceChildren();
  }

  return { render, destroy };
}

export const readIsSubscribeStageView: CanvasView = {
  canvas: { height: H },
  mount,
};
