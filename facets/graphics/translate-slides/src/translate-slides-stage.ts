/**
 * translate-slides 무대 — 좌표 평면 위에서 삼각형이 미끄러지고, 꼭짓점마다 옮김 화살이 나란히 선다.
 *
 * 왼쪽: 평면(y 위). 지나온 자리는 점선 윤곽으로 남고, 지난 옮김은 가는 화살로 꼬리를 잇는다.
 *       이번 옮김은 세 꼭짓점에서 굵은 화살이 함께 자란다. 끝 걸음에는 처음 자리부터의 점선 화살이 더해진다.
 * 오른쪽: 꼭짓점마다 잰 이번 옮김. 끝 걸음에는 처음 자리부터 잰 옮김을 따로 된 칸에 둔다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
} from '@ffacet/core/runtime';
import type { Corner, CornerShift } from './algorithm.js';
import type { TranslateSlidesScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 700;
const FRAME_MS = 16;
const MAX_UNIT = 60;

type Attrs = Record<string, string | number>;
type XY = { x: number; y: number };

/** 표시할 때만 소수 둘째 자리로. −0 은 0 으로, 음수 기호는 빼기 기호로. */
function fmt2(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (r === 0) return '0.00';
  return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2);
}

function pair(a: number, b: number): string {
  return `(${fmt2(a)}, ${fmt2(b)})`;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const translateSlidesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    const names: Record<string, string> = {
      a: t('label.a', 'A'),
      b: t('label.b', 'B'),
      c: t('label.c', 'C'),
    };
    const axisX = t('label.x', 'x');
    const axisY = t('label.y', 'y');

    function nameOf(id: string): string {
      const n = names[id];
      if (n === undefined) throw new Error(`translate-slides-stage: 꼭짓점 '${id}' 의 표시 이름이 없다`);
      return n;
    }

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function put(parent: Element, x: number, y: number, s: string, attrs: Attrs = {}): void {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
          ...attrs,
        },
        parent,
      );
      node.textContent = s;
    }

    /** 꼬리에서 머리로 가는 화살. 길이가 거의 0 이면 그리지 않는다 (운동의 첫 프레임). */
    function arrow(parent: Element, p: XY, q: XY, stroke: string, width: number, dash?: string): void {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      const ux = dx / len;
      const uy = dy / len;
      const head = Math.min(9, len * 0.6);
      const bx = q.x - ux * head;
      const by = q.y - uy * head;
      const line: Attrs = {
        x1: p.x,
        y1: p.y,
        x2: bx,
        y2: by,
        stroke,
        'stroke-width': width,
      };
      if (dash) line['stroke-dasharray'] = dash;
      el('line', line, parent);
      const half = head * 0.5;
      el(
        'polygon',
        {
          points: `${q.x},${q.y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`,
          fill: stroke,
        },
        parent,
      );
    }

    function draw(scene: TranslateSlidesScene, progress: number): void {
      svg.textContent = '';
      const frame = scene.frame;
      if (frame === null) return; // init 이 오기 전 — 무대의 범위가 아직 없다

      const step = scene.step;
      const last = scene.places[scene.places.length - 1];
      if (!last) throw new Error('translate-slides-stage: 자취가 비었다');

      if (scene.slideCount === null) throw new Error('translate-slides-stage: frame 은 있는데 slideCount 가 없다');
      const slideCount = scene.slideCount;

      // 캡션
      const caption =
        step === null
          ? t('caption.start', 'Before any slide: the triangle at its starting place.')
          : t('caption.slide', 'Slide: {n} / {total}', {
              n: step.index,
              total: slideCount,
            });
      put(svg, 16, 28, caption, { 'font-size': fontSizes.md, 'font-weight': 600 });

      // 평면의 자리 — 캔버스에서 역산한다
      const planeLeft = 16;
      const planeRight = Math.round(W * 0.64);
      const planeTop = 48;
      const planeBottom = H - 16;
      const x0 = Math.floor(frame.minX) - 1;
      const x1 = Math.ceil(frame.maxX) + 1;
      const y0 = Math.floor(frame.minY) - 1;
      const y1 = Math.ceil(frame.maxY) + 1;
      const unit = Math.min(
        (planeRight - planeLeft) / (x1 - x0),
        (planeBottom - planeTop) / (y1 - y0),
        MAX_UNIT,
      );
      const offX = planeLeft + ((planeRight - planeLeft) - unit * (x1 - x0)) / 2;
      const offY = planeTop + ((planeBottom - planeTop) - unit * (y1 - y0)) / 2;
      const sx = (x: number): number => offX + (x - x0) * unit;
      const sy = (y: number): number => offY + (y1 - y) * unit; // y 위 → 화면 아래로 뒤집는다
      const at = (p: XY): XY => ({ x: sx(p.x), y: sy(p.y) });

      const plane = el('g', {}, svg);
      for (let gx = x0; gx <= x1; gx += 1) {
        el('line', { x1: sx(gx), y1: sy(y0), x2: sx(gx), y2: sy(y1), stroke: colors.border, 'stroke-width': 1 }, plane);
      }
      for (let gy = y0; gy <= y1; gy += 1) {
        el('line', { x1: sx(x0), y1: sy(gy), x2: sx(x1), y2: sy(gy), stroke: colors.border, 'stroke-width': 1 }, plane);
      }
      if (x0 <= 0 && 0 <= x1) {
        el('line', { x1: sx(0), y1: sy(y0), x2: sx(0), y2: sy(y1), stroke: colors.textMuted, 'stroke-width': 1.2 }, plane);
        put(plane, sx(0) + 5, sy(y1) + xsPx + 2, axisY, { 'font-size': fontSizes.xs, fill: colors.textMuted, 'font-style': 'italic' });
      }
      if (y0 <= 0 && 0 <= y1) {
        el('line', { x1: sx(x0), y1: sy(0), x2: sx(x1), y2: sy(0), stroke: colors.textMuted, 'stroke-width': 1.2 }, plane);
        put(plane, sx(x1) - 4, sy(0) - 5, axisX, {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'font-style': 'italic',
          'text-anchor': 'end',
        });
      }
      for (let gx = x0 + 1; gx < x1; gx += 1) {
        if (gx === 0) continue;
        put(plane, sx(gx), sy(Math.max(y0, Math.min(0, y1))) + xsPx + 3, String(gx).replace('-', '−'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        });
      }
      for (let gy = y0 + 1; gy < y1; gy += 1) {
        if (gy === 0) continue;
        put(plane, sx(Math.max(x0, Math.min(0, x1))) - 4, sy(gy) + xsPx / 3, String(gy).replace('-', '−'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'end',
        });
      }

      // 지금 선 자리 — 운동 중이면 이번 출발 자리에서 도착 자리로 아직 못 온 만큼
      const moving = step !== null && progress < 1;
      const now: Corner[] =
        step !== null && moving
          ? step.from.map((p, i) => {
              const q = step.at[i];
              if (!q) throw new Error(`translate-slides-stage: step.at[${i}] 가 없다`);
              return { id: p.id, x: p.x + (q.x - p.x) * progress, y: p.y + (q.y - p.y) * progress };
            })
          : last.map((p) => ({ ...p }));

      const polygon = (ps: Corner[]): string => ps.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');

      // 지나온 자리 — 점선 윤곽
      const trail = el('g', {}, svg);
      for (let k = 0; k < scene.places.length - 1; k += 1) {
        el(
          'polygon',
          {
            points: polygon(scene.places[k]!),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '4 3',
          },
          trail,
        );
      }
      // 지난 옮김 — 꼬리를 잇는 가는 화살
      const lastDone = step === null ? scene.places.length - 1 : scene.places.length - 2;
      for (let k = 1; k <= lastDone; k += 1) {
        const before = scene.places[k - 1]!;
        const after = scene.places[k]!;
        after.forEach((q, i) => {
          const p = before[i];
          if (!p) throw new Error(`translate-slides-stage: places[${k - 1}][${i}] 가 없다`);
          arrow(trail, at(p), at(q), colors.textMuted, 1.2);
        });
      }

      // 끝 걸음 — 처음 자리부터 지금 자리까지 점선 화살
      const isLast = step !== null && step.index === slideCount;
      const start = scene.places[0]!;
      if (isLast) {
        now.forEach((q, i) => {
          const p = start[i];
          if (!p) throw new Error(`translate-slides-stage: places[0][${i}] 가 없다`);
          arrow(svg, at(p), at(q), colors.primary, 1.6, '6 4');
        });
      }

      // 삼각형
      el(
        'polygon',
        {
          points: polygon(now),
          fill: colors.accent,
          'fill-opacity': 0.45,
          stroke: colors.text,
          'stroke-width': 1.6,
          'stroke-linejoin': 'round',
        },
        svg,
      );

      // 이번 옮김 — 세 꼭짓점에서 함께 자라는 화살
      if (step !== null) {
        now.forEach((q, i) => {
          const p = step.from[i];
          if (!p) throw new Error(`translate-slides-stage: step.from[${i}] 가 없다`);
          arrow(svg, at(p), at(q), colors.itemActive, 2.6);
        });
      }

      // 꼭짓점 — 무게중심 반대쪽으로 이름표를 둔다
      const cx = now.reduce((s, p) => s + p.x, 0) / now.length;
      const cy = now.reduce((s, p) => s + p.y, 0) / now.length;
      for (const p of now) {
        const q = at(p);
        el('circle', { cx: q.x, cy: q.y, r: 3.5, fill: colors.text }, svg);
        const ox = p.x - cx;
        const oy = p.y - cy;
        const ol = Math.hypot(ox, oy);
        if (ol === 0) throw new Error(`translate-slides-stage: 꼭짓점 '${p.id}' 가 무게중심과 겹친다`);
        const ux = ox / ol;
        const uy = -oy / ol; // 화면 아래가 + 라 뒤집는다
        const lx = q.x + ux * 12;
        const ly = q.y + uy * 12 + smPx / 3;
        const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
        put(svg, lx, ly, nameOf(p.id), {
          'text-anchor': anchor,
          'font-weight': 600,
          stroke: colors.bg,
          'stroke-width': 3,
          'paint-order': 'stroke',
        });
      }

      // 오른쪽 칸 — 꼭짓점 자리, 그리고 꼭짓점마다 잰 옮김
      const panelX = planeRight + 24;
      const rowH = smPx + 12;
      let y = planeTop + 20;
      put(svg, panelX, y, t('label.place', 'Corners at'), { fill: colors.textMuted });
      y += rowH;
      for (const p of now) {
        el('circle', { cx: panelX + 8, cy: y - smPx / 3, r: 3.5, fill: colors.text }, svg);
        put(svg, panelX + 24, y, nameOf(p.id), { 'font-weight': 600 });
        // 미끄러지는 동안에는 자리의 수를 비운다 — 도착해서 선 자리만 수로 읽는다
        if (!moving) put(svg, panelX + 44, y, pair(p.x, p.y), { 'font-family': fonts.mono });
        y += rowH;
      }
      if (step === null) return;
      y += rowH * 0.6;
      const rows = (shifts: CornerShift[], mark: string, dash?: string): void => {
        for (const s of shifts) {
          const line: Attrs = { x1: panelX, y1: y - smPx / 3, x2: panelX + 16, y2: y - smPx / 3, stroke: mark, 'stroke-width': 2.4 };
          if (dash) line['stroke-dasharray'] = dash;
          el('line', line, svg);
          put(svg, panelX + 24, y, nameOf(s.id), { 'font-weight': 600 });
          put(svg, panelX + 44, y, pair(s.dx, s.dy), { 'font-family': fonts.mono });
          y += rowH;
        }
      };
      put(svg, panelX, y, t('label.thisSlide', 'This slide'), { fill: colors.textMuted });
      y += rowH;
      rows(step.moved, colors.itemActive);
      if (isLast) {
        y += rowH * 0.6;
        put(svg, panelX, y, t('label.fromStart', 'From the start'), { fill: colors.textMuted });
        y += rowH;
        rows(step.fromStart, colors.primary, '4 3');
      }
    }

    function tween(mine: number, ms: number, onFrame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const k = Math.min(1, (Date.now() - began) / ms);
          onFrame(easeInOut(k));
          if (k >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const renderer: SceneRenderer<TranslateSlidesScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        const fresh = next.step !== null && (prev === null || prev.places.length !== next.places.length);
        if (!opts.animate || !fresh) {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        await tween(mine, MOTION_MS, (k) => draw(next, k));
        if (destroyed || mine !== gen) return;
        draw(next, 1);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
