/**
 * 벡터 덧셈 무대 — 왼쪽 평면에서 화살표가 꼬리를 앞 머리로 옮겨 붙고 이은 끝이 따라 옮겨 간다.
 * 오른쪽 셈 칸에는 성분이 세로로 쌓여, 이음에 든 줄만 짙어지고 누적 줄이 바뀐다.
 * 마지막 걸음에 원점에서 이은 끝까지 합 화살표가 자라고 성분 식이 선다.
 *
 * 격자는 두지 않는다 — 칸을 세는 조각이 아니라 이은 길과 지름길을 견주는 조각이다.
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
import { formatLength, formatNum, formatPoint, type Vec2 } from './algorithm.js';
import type { VectorAddTipToTailScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 평면 틀 — 캔버스 왼쪽. 셈 칸은 오른쪽 나머지. */
const PAD = 20;
const PANEL_W = 184;
const PLANE_TOP = 48;
const PLANE_BOTTOM_PAD = 16;
/** 범위 바깥에 두는 여유 (단위). */
const MARGIN_UNITS = 0.7;
/** 한 단위의 상한 (px). */
const UNIT_MAX = 60;

const MOVE_MS = 800;
/** 이음 걸음에서 화살표가 옮겨 가는 몫 — 나머지는 이은 끝이 옮겨 간다. */
const SLIDE_SHARE = 0.7;
const FRAME_MS = 16;

type Frame = {
  /** 움직이는 화살표의 지금 꼬리. */
  moving?: { index: number; tail: Vec2; head: Vec2 };
  /** 이은 끝의 지금 자리. */
  cumulative?: Vec2;
  /** 합 화살표가 자란 몫 (0..1). 없으면 다 자랐다. */
  sumGrow?: number;
};

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(p: Vec2, q: Vec2, k: number): Vec2 {
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
}

function r2(n: number): string {
  const v = Math.round(n * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
}

export const vectorAddTipToTailStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const tone = params.theme === 'dark' ? 'vivid' : 'deep';
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? r2(v) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function vectorColor(i: number, count: number): string {
      const c = categorical(count, tone)[i];
      if (c === undefined) throw new Error(`vector-add-tip-to-tail-stage: ${i} 번째 화살표의 색이 없다`);
      return c;
    }

    function arrow(
      g: Element,
      tail: { x: number; y: number },
      head: { x: number; y: number },
      color: string,
      width: number,
      dashed: boolean,
    ): void {
      const dx = head.x - tail.x;
      const dy = head.y - tail.y;
      const len = Math.hypot(dx, dy);
      // 아직 자라지 않은 화살표는 그릴 것이 없다 — 길이 0 선에 촉을 달면 점이 된다.
      if (len < 1) return;
      const ux = dx / len;
      const uy = dy / len;
      const tipLen = Math.min(6 + width * 2.4, len);
      const half = 2 + width * 1.2;
      const baseX = head.x - ux * tipLen;
      const baseY = head.y - uy * tipLen;
      const line: Record<string, string | number> = {
        x1: tail.x,
        y1: tail.y,
        x2: baseX,
        y2: baseY,
        stroke: color,
        'stroke-width': width,
        'stroke-linecap': 'butt',
      };
      if (dashed) line['stroke-dasharray'] = '5 4';
      el(g, 'line', line);
      const pts = [
        { x: head.x, y: head.y },
        { x: baseX - uy * half, y: baseY + ux * half },
        { x: baseX + uy * half, y: baseY - ux * half },
      ]
        .map((q) => `${r2(q.x)},${r2(q.y)}`)
        .join(' ');
      el(g, 'polygon', { points: pts, fill: color, 'fill-opacity': dashed ? 0.45 : 1 });
    }

    /** 선분 가운데에서 한쪽 옆으로 비킨 글자 자리 (px). side 1 = 진행 방향의 오른쪽. */
    function sideLabel(
      tail: { x: number; y: number },
      head: { x: number; y: number },
      side: 1 | -1,
      gap: number,
    ): { x: number; y: number } {
      const dx = head.x - tail.x;
      const dy = head.y - tail.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) return { x: tail.x, y: tail.y };
      // 화면 좌표(y 아래)에서 진행 방향의 오른쪽 = (−dy, dx)
      return {
        x: (tail.x + head.x) / 2 + (-dy / len) * gap * side,
        y: (tail.y + head.y) / 2 + (dx / len) * gap * side + smPx * 0.35,
      };
    }

    function draw(scene: VectorAddTipToTailScene, frame: Frame): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return; // init 전 — 걸음 0 은 silent init 이 곧바로 갈아 끼운다
      const { vectors, bounds } = base;
      const count = vectors.length;
      const cumulative = scene.cumulative;
      if (cumulative === null) throw new Error('vector-add-tip-to-tail-stage: 바탕이 있는데 누적이 없다');

      // 평면 틀 — 범위에서 역산한다.
      const planeW = PIECE_CANVAS_W - PAD * 2 - PANEL_W;
      const planeH = H - PLANE_TOP - PLANE_BOTTOM_PAD;
      const spanX = bounds.maxX - bounds.minX + MARGIN_UNITS * 2;
      const spanY = bounds.maxY - bounds.minY + MARGIN_UNITS * 2;
      const unit = Math.min(planeW / spanX, planeH / spanY, UNIT_MAX);
      const left = PAD + (planeW - spanX * unit) / 2;
      const top = PLANE_TOP + (planeH - spanY * unit) / 2;
      const ox = left + (MARGIN_UNITS - bounds.minX) * unit;
      const oy = top + (MARGIN_UNITS + bounds.maxY) * unit;
      const px = (p: Vec2): { x: number; y: number } => ({ x: ox + p.x * unit, y: oy - p.y * unit });

      // 캡션 — 지금 일어나는 일만.
      const step = scene.step;
      if (step === null) throw new Error('vector-add-tip-to-tail-stage: 바탕이 있는데 걸음이 없다');
      let caption: string;
      if (step.kind === 'init') {
        const first = vectors[0];
        if (first === undefined) throw new Error('vector-add-tip-to-tail-stage: 화살표가 없다');
        caption = t('caption.start', 'Every arrow starts at the origin. First link: {name}', { name: first.name });
      } else if (step.kind === 'attach') {
        const v = vectors[step.index];
        const tail = scene.tails[step.index];
        if (v === undefined || tail === undefined) {
          throw new Error(`vector-add-tip-to-tail-stage: 이음 자리 ${step.index} 가 바탕 밖이다`);
        }
        caption = t('caption.attach', 'Tail of {name} moves onto the previous head. Tail {tail} · end {end}', {
          name: v.name,
          tail: formatPoint(tail),
          end: formatPoint(cumulative),
        });
      } else {
        if (scene.sum === null) throw new Error('vector-add-tip-to-tail-stage: 합 걸음에 합이 없다');
        caption = t('caption.sum', 'One arrow from the first tail to the last head: {name} = {end}', {
          name: scene.sum.label,
          end: formatPoint(scene.sum.head),
        });
      }
      el(svg, 'text', {
        x: PAD,
        y: 26,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      }, caption);

      // 축 — 원점을 지나는 두 줄. 칸 눈금은 두지 않는다.
      const axes = el(svg, 'g', { stroke: colors.border, 'stroke-width': 1 });
      el(axes, 'line', { x1: left, y1: oy, x2: left + spanX * unit, y2: oy });
      el(axes, 'line', { x1: ox, y1: top, x2: ox, y2: top + spanY * unit });
      el(svg, 'circle', { cx: ox, cy: oy, r: 3, fill: colors.textMuted });

      // 화살표 — 이음을 기다리는 것은 점선으로 원점에, 이음에 든 것은 실선으로.
      const arrows = el(svg, 'g', {});
      const labels = el(svg, 'g', {
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-style': 'italic',
        'font-weight': 700,
        'text-anchor': 'middle',
      });
      const order = vectors.map((_, i) => i).sort((i, j) => Number(i < scene.linked) - Number(j < scene.linked));
      for (const i of order) {
        const v = vectors[i];
        const storedTail = scene.tails[i];
        const storedHead = scene.heads[i];
        if (v === undefined || storedTail === undefined || storedHead === undefined) {
          throw new Error(`vector-add-tip-to-tail-stage: 화살표 ${i} 의 꼬리나 머리가 없다`);
        }
        const moving = frame.moving !== undefined && frame.moving.index === i ? frame.moving : null;
        const tail = px(moving === null ? storedTail : moving.tail);
        const head = px(moving === null ? storedHead : moving.head);
        const color = vectorColor(i, count);
        const linked = i < scene.linked;
        arrow(arrows, tail, head, color, linked ? 2.6 : 1.8, !linked);
        const at = sideLabel(tail, head, 1, 14);
        el(labels, 'text', { x: at.x, y: at.y, fill: color, 'fill-opacity': linked ? 1 : 0.6 }, v.name);
      }

      // 합 화살표 — 원점에서 이은 끝까지.
      const sum = scene.sum;
      if (sum !== null) {
        const grow = frame.sumGrow ?? 1;
        const o = px({ x: 0, y: 0 });
        const end = px(lerp({ x: 0, y: 0 }, sum.head, grow));
        arrow(arrows, o, end, colors.text, 3.4, false);
        if (grow >= 1) {
          const at = sideLabel(o, end, -1, 16);
          el(labels, 'text', { x: at.x, y: at.y, fill: colors.text, 'text-anchor': 'end' }, sum.label);
        }
      }

      // 이은 끝 — 고리 하나와 그 자리.
      const endVec = frame.cumulative ?? cumulative;
      const endPx = px(endVec);
      el(svg, 'circle', {
        cx: endPx.x,
        cy: endPx.y,
        r: 7,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });
      if (frame.cumulative === undefined) {
        el(svg, 'text', {
          x: endPx.x + 11,
          y: endPx.y - 9,
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        }, formatPoint(endVec));
      }

      // 셈 칸 — 성분을 세로로 쌓는다.
      const panelX = PIECE_CANVAS_W - PAD - PANEL_W + 16;
      const colXEnd = panelX + 118;
      const colYEnd = panelX + PANEL_W - 22;
      const rowH = Math.min(24, (H - PLANE_TOP - 150) / (count + 1));
      const panel = el(svg, 'g', { 'font-family': fonts.mono, 'font-size': fontSizes.md });
      let y = PLANE_TOP + 14;
      el(panel, 'text', { x: colXEnd, y, fill: colors.textMuted, 'text-anchor': 'end', 'font-style': 'italic' }, 'x');
      el(panel, 'text', { x: colYEnd, y, fill: colors.textMuted, 'text-anchor': 'end', 'font-style': 'italic' }, 'y');
      vectors.forEach((v, i) => {
        y += rowH;
        const linked = i < scene.linked;
        const ink = linked ? colors.text : colors.textMuted;
        el(panel, 'text', {
          x: panelX,
          y,
          fill: vectorColor(i, count),
          'fill-opacity': linked ? 1 : 0.6,
          'font-family': fonts.body,
          'font-style': 'italic',
          'font-weight': 700,
        }, v.name);
        el(panel, 'text', { x: colXEnd, y, fill: ink, 'text-anchor': 'end' }, formatNum(v.x));
        el(panel, 'text', { x: colYEnd, y, fill: ink, 'text-anchor': 'end' }, formatNum(v.y));
      });
      y += 10;
      el(panel, 'line', { x1: panelX, y1: y, x2: colYEnd + 4, y2: y, stroke: colors.text, 'stroke-width': 1 });
      y += rowH;
      el(panel, 'text', {
        x: panelX,
        y,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      }, t('label.running', 'Running total'));
      el(panel, 'text', { x: colXEnd, y, fill: colors.text, 'text-anchor': 'end', 'font-weight': 700 }, formatNum(cumulative.x));
      el(panel, 'text', { x: colYEnd, y, fill: colors.text, 'text-anchor': 'end', 'font-weight': 700 }, formatNum(cumulative.y));

      if (sum !== null && frame.sumGrow === undefined) {
        const sumRows = el(svg, 'g', { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text });
        y += 34;
        el(sumRows, 'text', { x: panelX, y, 'font-style': 'italic', fill: colors.textMuted }, 'x');
        el(sumRows, 'text', { x: panelX + 16, y }, sum.exprX);
        y += smPx + 8;
        el(sumRows, 'text', { x: panelX, y, 'font-style': 'italic', fill: colors.textMuted }, 'y');
        el(sumRows, 'text', { x: panelX + 16, y }, sum.exprY);
        const lens = el(svg, 'g', { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted });
        y += smPx + 20;
        el(lens, 'text', { x: panelX, y }, t('label.path', 'Joined path: {n}', { n: formatLength(sum.pathLength) }));
        y += smPx + 8;
        el(lens, 'text', { x: panelX, y, fill: colors.text }, t('label.direct', 'Sum arrow: {n}', { n: formatLength(sum.sumLength) }));
      }
    }

    function drawStatic(scene: VectorAddTipToTailScene): void {
      draw(scene, {});
    }

    /** 한 시계 — 프레임 수로 나눠 p 를 0..1 로 흘린다. 세대가 바뀌거나 거두면 곧 푼다. */
    function tween(mine: number, ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
        let i = 0;
        let handle: ReturnType<typeof setTimeout> | null = null;
        const finish = (): void => {
          if (handle !== null) {
            clearTimeout(handle);
            timers.delete(handle);
            handle = null;
          }
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (handle !== null) timers.delete(handle);
          handle = null;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          i += 1;
          onFrame(Math.min(1, i / frames));
          if (i >= frames) {
            finish();
            return;
          }
          handle = setTimeout(tick, FRAME_MS);
          timers.add(handle);
        };
        handle = setTimeout(tick, FRAME_MS);
        timers.add(handle);
      });
    }

    async function render(
      next: VectorAddTipToTailScene,
      _prev: VectorAddTipToTailScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null || next.base === null) return;

      if (step.kind === 'attach') {
        const target = next.tails[step.index];
        const targetHead = next.heads[step.index];
        const endTo = next.cumulative;
        if (target === undefined || targetHead === undefined || endTo === null) {
          throw new Error(`vector-add-tip-to-tail-stage: 이음 ${step.index} 의 끝자리가 장면에 없다`);
        }
        // 화살표가 먼저 앞 머리로 옮겨 가고, 붙은 뒤 이은 끝이 새 머리로 옮겨 간다.
        await tween(mine, MOVE_MS, (p) => {
          const slide = ease(Math.min(1, p / SLIDE_SHARE));
          const hop = ease(Math.max(0, (p - SLIDE_SHARE) / (1 - SLIDE_SHARE)));
          draw(next, {
            moving: {
              index: step.index,
              tail: lerp(step.fromTail, target, slide),
              head: lerp(step.fromHead, targetHead, slide),
            },
            cumulative: lerp(step.fromCumulative, endTo, hop),
          });
        });
      } else if (step.kind === 'sum') {
        await tween(mine, MOVE_MS, (p) => draw(next, { sumGrow: ease(p) }));
      } else {
        return;
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const h of timers) clearTimeout(h);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
