/**
 * stack-of-sheets 의 그림.
 *
 * 윗줄: 층마다 제 장(투명한 종이)이 하나씩 놓이고, 칠하기 걸음에 그 장 위로 칠하기 동작이
 * 하나씩 찍힌다 (fillRect 는 상자가 모서리에서 펼쳐지고, drawText 는 글자가 왼쪽부터 그어진다).
 * 아랫줄: 합성 틀. 합성 걸음에 장이 제 자리에서 들려 올라와 틀 위로 옮겨 포개진다 — 늦게 얹힌
 * 장이 먼저 얹힌 장을 덮는다. 덮인 요소는 점선 윤곽으로 남는다 (지워진 것이 아니라 아래에 있다).
 *
 * 요소의 자리는 여기서 셈한다. 가장 아래 장의 fillRect 는 장 전체, 글자는 위에서부터 줄로.
 * 위 장의 상자는 겹침 데이터가 말하는 아래 요소들 위에 걸치도록 놓는다.
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
import type { SheetLayer } from './algorithm.js';
import type { StackOfSheetsScene } from './scene.js';

const H = 384;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const GAP = 16;
const MAX_SHEET_W = 200;
const SHEET_TOP = 26;
const OP_LINE = 15;
const FRAME_TOP = 222;

const PAINT_MS = 480;
const COMPOSE_MS = 500;

const TXT_PX = parseFloat(fontSizes.sm);
const OP_PX = parseFloat(fontSizes.xs);
const CAP_PX = parseFloat(fontSizes.md);
/** 고정폭 글꼴의 글자 폭 비 — 글자 상자를 셈할 때만 쓴다. */
const MONO_RATIO = 0.6;

type Rect = { x: number; y: number; w: number; h: number };
type Shape = Rect & { kind: 'box' | 'text'; el: string; layer: string; baseline: number };

function r(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function make<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((q) => q.x));
  const y0 = Math.min(...rects.map((q) => q.y));
  const x1 = Math.max(...rects.map((q) => q.x + q.w));
  const y1 = Math.max(...rects.map((q) => q.y + q.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function textRect(el: string, x: number, baseline: number): Rect {
  return { x, y: baseline - TXT_PX * 0.85, w: el.length * TXT_PX * MONO_RATIO, h: TXT_PX };
}

/** 장 안의 요소 자리 (장 왼쪽 위가 원점). 아래 장부터 셈해야 위 장이 걸칠 자리를 안다. */
function layout(scene: StackOfSheetsScene, sw: number, sh: number): Map<string, Shape> {
  const shapes = new Map<string, Shape>();
  const byZ = [...scene.layers].sort((a, b) => a.z - b.z);
  byZ.forEach((layer, k) => {
    let box: Rect | null = null;
    for (const item of layer.ops) {
      if (item.op !== 'fillRect') continue;
      let rect: Rect;
      if (k === 0) {
        rect = { x: 0, y: 0, w: sw, h: sh };
      } else {
        const w = sw * 0.5;
        const h = sh * 0.4;
        const under = scene.covers
          .filter((c) => c.top === item.el)
          .flatMap((c) => c.under)
          .map((u) => shapes.get(u))
          .filter((q): q is Shape => q !== undefined);
        const u = union(under);
        const x = u ? u.x + u.w * 0.45 : (sw - w) / 2;
        const y = u ? u.y + u.h * 0.5 : (sh - h) / 2;
        rect = { x: Math.min(x, sw - w - 4), y: Math.min(y, sh - h - 4), w, h };
      }
      box ??= rect;
      shapes.set(item.el, { ...rect, kind: 'box', el: item.el, layer: layer.id, baseline: 0 });
    }
    let line = 0;
    for (const item of layer.ops) {
      if (item.op !== 'drawText') continue;
      const x = box && k > 0 ? box.x + 8 : 10;
      const baseline = box && k > 0 ? box.y + box.h / 2 + 4 + line * (TXT_PX + 4) : 22 + line * 22;
      shapes.set(item.el, { ...textRect(item.el, x, baseline), kind: 'text', el: item.el, layer: layer.id, baseline });
      line += 1;
    }
  });
  return shapes;
}

export const stackOfSheetsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 마지막 정적 그리기가 남긴 손잡이 — 같은 render 안에서만 쓴다. */
    let painted = new Map<string, { node: SVGElement; shape: Shape; mark: SVGElement; label: SVGElement }>();
    let framed = new Map<
      string,
      { group: SVGGElement; inner: SVGGElement; w: number; h: number; dx: number; dy: number; cx: number; cy: number }
    >();
    let fresh: SVGElement[] = [];

    function geometry(scene: StackOfSheetsScene) {
      const n = Math.max(1, scene.layers.length);
      const sw = Math.min(MAX_SHEET_W, (PIECE_CANVAS_W - 2 * PAD - (n - 1) * GAP) / n);
      const sh = Math.round(sw * 0.62);
      const rowW = n * sw + (n - 1) * GAP;
      const rowX = (PIECE_CANVAS_W - rowW) / 2;
      const fx = (PIECE_CANVAS_W - sw) / 2;
      return { n, sw, sh, rowX, fx, fy: FRAME_TOP };
    }

    function drawShape(g: Element, shape: Shape, i: number, n: number): SVGElement {
      const pastel = categorical(n, 'pastel')[i] ?? colors.bgSubtle;
      const vivid = categorical(n, 'vivid')[i] ?? colors.border;
      const deep = categorical(n, 'deep')[i] ?? colors.text;
      if (shape.kind === 'box') {
        return make(g, 'rect', {
          x: shape.x, y: shape.y, width: shape.w, height: shape.h, rx: 3,
          fill: pastel, stroke: vivid, 'stroke-width': 1.5,
        });
      }
      return make(g, 'text', {
        x: shape.x, y: shape.baseline, fill: deep,
        'font-family': fonts.mono, 'font-size': fontSizes.sm,
      }, shape.el);
    }

    function drawSheet(g: Element, layer: SheetLayer, i: number, n: number, shapes: Map<string, Shape>): SVGElement[] {
      const out: SVGElement[] = [];
      for (const item of layer.ops) {
        const shape = shapes.get(item.el);
        if (shape) out.push(drawShape(g, shape, i, n));
      }
      return out;
    }

    function drawStatic(scene: StackOfSheetsScene): void {
      svg.textContent = '';
      painted = new Map();
      framed = new Map();
      fresh = [];
      const { n, sw, sh, rowX, fx, fy } = geometry(scene);
      const shapes = layout(scene, sw, sh);
      const vivid = categorical(n, 'vivid');

      // 윗줄 — 층마다 제 장
      scene.layers.forEach((layer, i) => {
        const sx = rowX + i * (sw + GAP);
        make(svg, 'text', {
          x: sx, y: SHEET_TOP - 8, fill: colors.textMuted,
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
        }, `${layer.id} · z${layer.z}`);
        const isPainted = scene.painted.includes(layer.id);
        const lifted = scene.stack.includes(layer.id);
        const sheet = make(svg, 'g', { transform: `translate(${r(sx)},${SHEET_TOP})` });
        make(sheet, 'rect', {
          x: 0, y: 0, width: sw, height: sh, rx: 2, fill: 'none',
          stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 3',
        });
        let nodes: SVGElement[] = [];
        if (isPainted && !lifted) nodes = drawSheet(sheet, layer, i, n, shapes);

        // 칠하기 동작 목록 — 칠한 층은 찍힌 동작이 채워진다
        layer.ops.forEach((item, j) => {
          const y = SHEET_TOP + sh + 18 + j * OP_LINE;
          const mark = make(svg, 'circle', {
            cx: sx + 4, cy: y - OP_PX * 0.35, r: 3.5,
            fill: isPainted ? (vivid[i] ?? colors.primary) : 'none',
            stroke: isPainted ? (vivid[i] ?? colors.primary) : colors.border, 'stroke-width': 1,
          });
          const label = make(svg, 'text', {
            x: sx + 13, y, fill: isPainted ? colors.text : colors.textMuted,
            'font-family': fonts.mono, 'font-size': fontSizes.xs,
          }, `${item.op}(${item.el})`);
          const node = nodes[j];
          const shape = shapes.get(item.el);
          if (node && shape) painted.set(item.el, { node, shape, mark, label });
        });
      });

      // 아랫줄 — 합성 틀
      make(svg, 'text', {
        x: fx, y: fy - 8, fill: colors.textMuted,
        'font-family': fonts.body, 'font-size': fontSizes.sm,
      }, t('label.composite', 'Composite'));
      make(svg, 'rect', {
        x: fx, y: fy, width: sw, height: sh, rx: 2,
        fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1,
      });
      for (const id of scene.stack) {
        const i = scene.layers.findIndex((l) => l.id === id);
        const layer = scene.layers[i];
        if (!layer) continue;
        const outer = make(svg, 'g', {});
        const g = make(outer, 'g', { transform: `translate(${r(fx)},${fy})` });
        drawSheet(g, layer, i, n, shapes);
        const sx = rowX + i * (sw + GAP);
        framed.set(id, { group: outer, inner: g, w: sw, h: sh, dx: sx - fx, dy: SHEET_TOP - fy, cx: fx + sw / 2, cy: fy + sh / 2 });
      }
      // 덮인 요소 — 지워지지 않고 아래에 있다
      const newly = scene.step.kind === 'compose' ? scene.step.covered : [];
      for (const el of scene.covered) {
        const shape = shapes.get(el);
        if (!shape) continue;
        const hot = newly.includes(el);
        const node = make(svg, 'rect', {
          x: fx + shape.x - 2, y: fy + shape.y - 2, width: shape.w + 4, height: shape.h + 4, rx: 2,
          fill: 'none', stroke: hot ? colors.itemComparing : colors.textMuted,
          'stroke-width': hot ? 1.5 : 1, 'stroke-dasharray': '3 2',
        });
        if (hot) fresh.push(node);
      }

      // 틀 오른쪽 — 포개진 차례 (위가 먼저)
      const tx = fx + sw + 16;
      make(svg, 'text', {
        x: tx, y: fy + 10, fill: colors.textMuted,
        'font-family': fonts.body, 'font-size': fontSizes.xs,
      }, t('label.top', 'Top'));
      [...scene.stack].reverse().forEach((id, k) => {
        const i = scene.layers.findIndex((l) => l.id === id);
        const layer = scene.layers[i];
        if (!layer) return;
        const y = fy + 28 + k * 18;
        make(svg, 'rect', { x: tx, y: y - 9, width: 10, height: 10, rx: 2, fill: vivid[i] ?? colors.primary });
        make(svg, 'text', {
          x: tx + 16, y, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        }, `${layer.id} · z${layer.z}`);
      });

      // 틀 왼쪽 — 셈
      const stepOps = scene.step.kind === 'paint' ? scene.step.ops : 0;
      const counts = [
        t('label.total', 'Paint operations: {n}', { n: scene.total }),
        t('label.thisStep', 'Painted this step: {n}', { n: stepOps }),
        t('label.covered', 'Partly covered: {n}', { n: scene.covered.length }),
      ];
      counts.forEach((line, k) => {
        make(svg, 'text', {
          x: PAD, y: fy + 14 + k * 20, fill: k === 1 && scene.step.kind === 'compose' ? colors.itemComparing : colors.text,
          'font-family': fonts.body, 'font-size': fontSizes.sm,
        }, line);
      });

      // 캡션 — 지금 일어나는 일
      captionLines(caption(scene)).forEach((line, k, all) => {
        make(svg, 'text', {
          x: PAD, y: H - 12 - (all.length - 1 - k) * 18, fill: colors.text,
          'font-family': fonts.body, 'font-size': fontSizes.md,
        }, line);
      });
    }

    /** 캔버스 폭을 넘으면 문장 경계에서 두 줄로 나눈다. */
    function captionLines(text: string): string[] {
      const width = (s: string): number =>
        [...s].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e80 ? CAP_PX : CAP_PX * 0.56), 0);
      if (width(text) <= PIECE_CANVAS_W - 2 * PAD) return [text];
      const cuts: number[] = [];
      for (let i = 0; i < text.length - 1; i += 1) {
        if ('.。।'.includes(text.charAt(i)) && text.charAt(i + 1) === ' ') cuts.push(i + 1);
        else if (text.charAt(i) === '。') cuts.push(i + 1);
      }
      if (cuts.length === 0) return [text];
      const mid = text.length / 2;
      const cut = cuts.reduce((best, c) => (Math.abs(c - mid) < Math.abs(best - mid) ? c : best));
      return [text.slice(0, cut).trim(), text.slice(cut).trim()];
    }

    function caption(scene: StackOfSheetsScene): string {
      const step = scene.step;
      if (step.kind === 'paint') {
        return t('caption.paint', 'Layer {layer} is painted on its own sheet. Operations: {n}', {
          layer: step.layer, n: step.ops,
        });
      }
      if (step.kind === 'compose') {
        const covered = step.covered.length > 0 ? step.covered.join(' · ') : t('label.none', 'none');
        if (scene.stack.length === 1) {
          return t('caption.composeFirst', 'Composite: sheet {layer} goes down first. Partly covered: {covered}', {
            layer: step.layer, covered,
          });
        }
        return t('caption.compose', 'Composite: sheet {layer} goes on top. Partly covered below: {covered}', {
          layer: step.layer, covered,
        });
      }
      const elements = scene.layers.reduce((sum, l) => sum + l.ops.length, 0);
      return t('caption.start', 'Elements: {elements} · Layers: {layers} · Sheets painted: {painted}', {
        elements, layers: scene.layers.length, painted: scene.painted.length,
      });
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
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

    const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
    const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

    /** 칠하기 — 그 층의 동작이 차례로 장 위에 찍힌다. */
    function paintMotion(scene: StackOfSheetsScene, layerId: string, mine: number): Promise<void> {
      const layer = scene.layers.find((l) => l.id === layerId);
      if (!layer) return Promise.resolve();
      const items = layer.ops
        .map((o) => painted.get(o.el))
        .filter((v): v is NonNullable<typeof v> => v !== undefined);
      const m = items.length;
      if (m === 0) return Promise.resolve();
      const seg = 1 / m;
      const place = (p: number): void => {
        items.forEach((item, j) => {
          const q = Math.max(0, Math.min(1, (p - j * seg) / seg));
          const s = easeOut(q);
          const { x, y } = item.shape;
          if (item.shape.kind === 'box') {
            item.node.setAttribute('transform', `translate(${r(x)},${r(y)}) scale(${r(s * 100) / 100}) translate(${r(-x)},${r(-y)})`);
          } else {
            item.node.setAttribute('transform', `translate(${r(x)},0) scale(${r(s * 100) / 100},1) translate(${r(-x)},0)`);
          }
          item.mark.setAttribute('visibility', q > 0 ? 'visible' : 'hidden');
          item.label.setAttribute('fill', q > 0 ? colors.text : colors.textMuted);
        });
      };
      place(0);
      return tween(PAINT_MS, mine, place);
    }

    /** 합성 — 장이 제 자리에서 들려 올라와 틀 위로 옮겨 얹힌다. */
    function composeMotion(layerId: string, mine: number): Promise<void> {
      const item = framed.get(layerId);
      if (!item) return Promise.resolve();
      for (const node of fresh) node.setAttribute('visibility', 'hidden');
      // 옮기는 동안만 장의 가장자리를 보인다 — 틀에 앉으면 정적 그리기가 걷어 낸다
      const edge = make(item.inner, 'rect', {
        x: 0, y: 0, width: item.w, height: item.h, rx: 2, fill: 'none',
        stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 3',
      });
      item.inner.insertBefore(edge, item.inner.firstChild);
      const place = (p: number): void => {
        const e = easeInOut(p);
        const lift = 1 + 0.08 * Math.sin(Math.PI * p);
        const tx = item.dx * (1 - e);
        const ty = item.dy * (1 - e);
        const { cx, cy } = item;
        item.group.setAttribute(
          'transform',
          `translate(${r(tx + cx)},${r(ty + cy)}) scale(${r(lift * 1000) / 1000}) translate(${r(-cx)},${r(-cy)})`,
        );
      };
      place(0);
      return tween(COMPOSE_MS, mine, place);
    }

    async function render(
      next: StackOfSheetsScene,
      prev: StackOfSheetsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate || prev === null) return;
      const step = next.step;
      if (step.kind === 'paint' && prev.painted.length === next.painted.length - 1) {
        await paintMotion(next, step.layer, mine);
      } else if (step.kind === 'compose' && prev.stack.length === next.stack.length - 1) {
        await composeMotion(step.layer, mine);
      } else {
        return;
      }
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
