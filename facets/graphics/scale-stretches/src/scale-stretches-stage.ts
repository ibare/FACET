/**
 * scale-stretches 무대 — 왼쪽은 좌표 평면의 마름모, 오른쪽은 위 꼭짓점 각을 크게 편 부채.
 *
 * 동사는 "벌어진다". 걸음마다 네 꼭짓점이 처음 도형에 새 배율을 곱한 자리로 실제로 미끄러지고,
 * 오른쪽 부채의 두 날이 앞 각에서 새 각으로 벌어진다. 지나간 각은 부채 안에 가는 날로 남아
 * 벌어진 차례가 보인다. y 축 위 꼭짓점은 제자리일 때 고정 표지를 달고, 움직였을 때 간 거리를 단다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { StretchVertex } from './algorithm.js';
import type { ScaleStretchesScene } from './scene.js';

const H = 300;
/** 운동 한 번의 프레임 수와 프레임 간격 — 40 × 17ms = 680ms (사양: 700 이내) */
const FRAMES = 40;
const FRAME_MS = 17;
/** 좌표 한 칸의 상한 (px) — 범위가 좁아도 포스터가 되지 않게 */
const UNIT_MAX = 80;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function put(parent: Element, tag: string, attrs: Attrs, text?: string): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** 표시할 때만 반올림한다. −0 은 0 으로. */
function shown(x: number, digits: number): string {
  const s = x.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

function r2(v: number): number {
  const q = Math.round(v * 100) / 100;
  return q === 0 ? 0 : q;
}

function smooth(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const scaleStretchesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<ScaleStretchesScene> {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tick(): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, FRAME_MS);
        timers.add(id);
        waiters.add(done);
      });
    }

    function captionOf(scene: ScaleStretchesScene, sx: string, sy: string): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'Starting shape. Scale x: {sx}, y: {sy}', { sx, sy });
      if (step.axis === 'x' && step.grow) {
        return t('caption.stretchX', 'Stretch across. Scale x: {sx}, y: {sy}', { sx, sy });
      }
      if (step.axis === 'x') return t('caption.squashX', 'Squeeze across. Scale x: {sx}, y: {sy}', { sx, sy });
      if (step.axis === 'y' && step.grow) {
        return t('caption.stretchY', 'Stretch upward. Scale x: {sx}, y: {sy}', { sx, sy });
      }
      if (step.axis === 'y') return t('caption.squashY', 'Squash down. Scale x: {sx}, y: {sy}', { sx, sy });
      return t('caption.both', 'Rescale both axes. Scale x: {sx}, y: {sy}', { sx, sy });
    }

    /** 장면 하나를 k (0 = 앞 자리, 1 = 끝 자리) 에서 통째로 세운다. */
    function drawAt(scene: ScaleStretchesScene, k: number): void {
      svg.textContent = '';
      const frame = scene.frame;
      const now = scene.now;
      if (frame === null || now === null) return;
      const step = scene.step;

      put(
        svg,
        'text',
        { x: 16, y: 26, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 },
        captionOf(scene, String(now.sx), String(now.sy)),
      );

      // ── 좌표 평면 ─────────────────────────────
      const left = 16;
      const right = Math.round(W * 0.64);
      const top = 44;
      const bottom = H - 16;
      const spanX = 2 * (frame.xMax + 0.6);
      const spanY = frame.yMax - frame.yMin + 1;
      const unit = Math.min((right - left) / spanX, (bottom - top) / spanY, UNIT_MAX);
      const ox = (left + right) / 2;
      const oy = (top + bottom) / 2 + ((frame.yMax + frame.yMin) / 2) * unit;
      const px = (x: number): number => r2(ox + x * unit);
      const py = (y: number): number => r2(oy - y * unit);

      const axisEnd = frame.xMax + 0.5;
      put(svg, 'line', { x1: px(-axisEnd), y1: py(0), x2: px(axisEnd), y2: py(0), stroke: colors.border, 'stroke-width': 1 });
      put(svg, 'line', {
        x1: px(0),
        y1: py(frame.yMin - 0.4),
        x2: px(0),
        y2: py(frame.yMax + 0.4),
        stroke: colors.border,
        'stroke-width': 1,
      });
      for (let n = -Math.floor(axisEnd); n <= Math.floor(axisEnd); n += 1) {
        if (n === 0) continue;
        put(svg, 'line', { x1: px(n), y1: py(0) - 3, x2: px(n), y2: py(0) + 3, stroke: colors.border });
      }
      for (let n = Math.ceil(frame.yMin); n <= Math.floor(frame.yMax); n += 1) {
        if (n === 0) continue;
        put(svg, 'line', { x1: px(0) - 3, y1: py(n), x2: px(0) + 3, y2: py(n), stroke: colors.border });
      }
      const axisFont = { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm };
      put(svg, 'text', { ...axisFont, x: px(axisEnd) + 4, y: py(0) + smPx / 3 }, t('label.axisX', 'x'));
      put(
        svg,
        'text',
        { ...axisFont, x: px(0) - 6, y: py(frame.yMax + 0.4) + smPx / 3, 'text-anchor': 'end' },
        t('label.axisY', 'y'),
      );
      put(svg, 'circle', { cx: px(0), cy: py(0), r: 3.5, fill: colors.text });
      put(
        svg,
        'text',
        { ...axisFont, x: px(0) - 7, y: py(0) + smPx + 4, 'text-anchor': 'end' },
        t('label.origin', 'Origin'),
      );

      // 이번 걸음의 앞 자리 → 지금 자리 (k 만큼)
      const at: StretchVertex[] = now.points.map((p, i) => {
        if (step === null) return p;
        const b = step.before[i]!;
        return { id: p.id, x: b.x + (p.x - b.x) * k, y: b.y + (p.y - b.y) * k };
      });
      const ring = (pts: StretchVertex[]): string => pts.map((p) => `${px(p.x)},${py(p.y)}`).join(' ');

      if (step !== null) {
        put(svg, 'polygon', {
          points: ring(step.before),
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        });
        step.before.forEach((b, i) => {
          const p = at[i]!;
          if (step.moved[i]!.dist === 0) return;
          put(svg, 'line', {
            x1: px(b.x),
            y1: py(b.y),
            x2: px(p.x),
            y2: py(p.y),
            stroke: colors.itemActive,
            'stroke-width': 2,
          });
        });
      }

      put(svg, 'polygon', {
        points: ring(at),
        fill: colors.primary,
        'fill-opacity': 0.08,
        stroke: colors.primary,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      });

      // 위 꼭짓점의 각 — 두 변 사이를 채운 부채꼴
      const n = at.length;
      const ki = at.findIndex((p) => p.id === scene.angleAt);
      if (ki < 0) throw new Error(`scale-stretches-stage: 각을 잴 꼭짓점 ${scene.angleAt} 이 없다`);
      const apex = at[ki]!;
      const nbA = at[(ki - 1 + n) % n]!;
      const nbB = at[(ki + 1) % n]!;
      const cx = px(apex.x);
      const cy = py(apex.y);
      const dirOf = (q: StretchVertex): number => Math.atan2(py(q.y) - cy, px(q.x) - cx);
      const a1 = dirOf(nbA);
      const a2 = dirOf(nbB);
      let sweep = a2 - a1;
      while (sweep <= -Math.PI) sweep += 2 * Math.PI;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      const cornerR = 22;
      put(svg, 'path', {
        d:
          `M ${cx} ${cy} L ${r2(cx + cornerR * Math.cos(a1))} ${r2(cy + cornerR * Math.sin(a1))} ` +
          `A ${cornerR} ${cornerR} 0 0 ${sweep > 0 ? 1 : 0} ${r2(cx + cornerR * Math.cos(a1 + sweep))} ` +
          `${r2(cy + cornerR * Math.sin(a1 + sweep))} Z`,
        fill: colors.accent,
        'fill-opacity': 0.55,
        stroke: colors.accent,
        'stroke-width': 1.5,
      });

      for (const p of at) {
        put(svg, 'circle', { cx: px(p.x), cy: py(p.y), r: 4, fill: colors.bg, stroke: colors.primary, 'stroke-width': 2 });
      }

      // y 축 위 꼭짓점 — 이번 걸음에 간 거리
      if (step !== null) {
        for (const id of frame.onAxis) {
          const i = at.findIndex((p) => p.id === id);
          if (i < 0) throw new Error(`scale-stretches-stage: y 축 꼭짓점 ${id} 이 없다`);
          const p = at[i]!;
          const dist = step.moved[i]!.dist;
          const vx = px(p.x);
          const vy = py(p.y);
          if (dist === 0) {
            put(svg, 'rect', {
              x: vx - 8,
              y: vy - 8,
              width: 16,
              height: 16,
              fill: 'none',
              stroke: colors.text,
              'stroke-width': 1.5,
            });
          }
          const above = p.y >= (frame.yMax + frame.yMin) / 2;
          put(
            svg,
            'text',
            {
              x: vx + 12,
              y: above ? vy - 10 : vy + smPx + 8,
              fill: dist === 0 ? colors.text : colors.itemActive,
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              'font-weight': 600,
            },
            t('label.moved', 'Moved: {d}', { d: shown(dist, 2) }),
          );
        }
      }

      // ── 오른쪽: 위 꼭짓점 각을 편 부채 ──────────────
      const gLeft = Math.round(W * 0.68);
      const gRight = W - 16;
      const gx = (gLeft + gRight) / 2;
      const gy = 70;
      const reach = Math.min((gRight - gLeft) / 2 - 4, 92);
      const rayAt = (deg: number, side: 1 | -1, len: number): { x: number; y: number } => {
        const half = ((deg / 2) * Math.PI) / 180;
        return { x: r2(gx + side * len * Math.sin(half)), y: r2(gy + len * Math.cos(half)) };
      };
      const earlier = scene.angles.slice(0, -1);
      for (const deg of earlier) {
        for (const side of [-1, 1] as const) {
          const e = rayAt(deg, side, reach);
          put(svg, 'line', { x1: gx, y1: gy, x2: e.x, y2: e.y, stroke: colors.textMuted, 'stroke-width': 1 });
        }
      }
      const deg = step === null ? now.angle : step.fromAngle + (now.angle - step.fromAngle) * k;
      const fanR = reach * 0.62;
      const fl = rayAt(deg, -1, fanR);
      const fr = rayAt(deg, 1, fanR);
      put(svg, 'path', {
        d: `M ${gx} ${gy} L ${fl.x} ${fl.y} A ${r2(fanR)} ${r2(fanR)} 0 0 0 ${fr.x} ${fr.y} Z`,
        fill: colors.accent,
        'fill-opacity': 0.55,
        stroke: colors.accent,
        'stroke-width': 1.5,
      });
      for (const side of [-1, 1] as const) {
        const e = rayAt(deg, side, reach);
        put(svg, 'line', {
          x1: gx,
          y1: gy,
          x2: e.x,
          y2: e.y,
          stroke: colors.primary,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
      }
      put(svg, 'circle', { cx: gx, cy: gy, r: 4, fill: colors.primary });

      const readY = gy + reach + 34;
      put(
        svg,
        'text',
        {
          x: gx,
          y: readY,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
        },
        t('readout.angle', 'Top angle: {deg}°', { deg: shown(now.angle, 1) }),
      );
      put(
        svg,
        'text',
        {
          x: gx,
          y: readY + mdPx + 10,
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
        },
        t('readout.side', 'Side: {len}', { len: shown(now.edge, 2) }),
      );
    }

    async function render(
      next: ScaleStretchesScene,
      prev: ScaleStretchesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const forward =
        opts.animate && next.step !== null && prev !== null && prev.angles.length === next.angles.length - 1;
      if (!forward) {
        drawAt(next, 1);
        return;
      }
      drawAt(next, 0);
      for (let f = 1; f <= FRAMES; f += 1) {
        if (mine !== gen || destroyed) return;
        await tick();
        if (mine !== gen || destroyed) return;
        drawAt(next, smooth(f / FRAMES));
      }
      drawAt(next, 1);
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
