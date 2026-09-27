/**
 * rotate-turns 의 그림.
 *
 * 왼쪽은 원점을 가운데 둔 좌표 평면(y 가 위)이다. 꼭짓점마다 원점까지의 거리를 반지름으로 한 궤도가
 * 점선으로 깔리고, 걸음마다 세 꼭짓점이 제 궤도의 호를 따라 같은 각만큼 간다. 지나온 호가 자취로 남아
 * 먼 꼭짓점이 같은 걸음에 더 긴 호를 간 것이 길이로 보인다. 무게중심도 원점 둘레로 제 호를 그린다.
 * 오른쪽은 그 걸음의 새 좌표에서 잰 수(자리 · 원점까지 거리 · 변 · 꼭짓점 각)다.
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
import { readRotateTurnsData, rotatePoint } from './algorithm.js';
import type { RotateTurnsScene } from './scene.js';

const H = 360;
const PAD = 14;
const TOP = 38;
/** 호 운동의 길이 (ms) */
const MOVE_MS = 900;
const FRAME_MS = 16;
/** 축척 여유 — 가장 먼 꼭짓점이 평면 끝에 붙지 않게 */
const MARGIN = 1.14;
/** 호를 꺾은선으로 그릴 때 한 마디의 각 (도) */
const ARC_SEG_DEG = 3;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 표시할 때만 반올림한다. −0.00 은 0.00 으로, 음수 부호는 빼기표로. */
function fmt(n: number, digits: number): string {
  const s = n.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

function round(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

type Frame = {
  /** 그리는 순간의 누적 각 (운동 중에는 from 과 to 사이) */
  phi: number;
};

export const rotateTurnsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    // 식별자 → 표시 이름 (리터럴 키 표)
    const vertexName: Record<string, string> = {
      a: t('label.a', 'A'),
      b: t('label.b', 'B'),
      c: t('label.c', 'C'),
    };
    const hue = categorical(3, 'vivid');

    const side = H - TOP - PAD;
    const planeX = PAD;
    const cx = planeX + side / 2;
    const cy = TOP + side / 2;
    const panelX = planeX + side + 26;
    const panelR = W - PAD;
    const panelW = panelR - panelX;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function nameOf(id: string): string {
      const n = vertexName[id];
      if (n === undefined) throw new Error(`rotate-turns-stage: 꼭짓점 ${id} 의 표시 이름이 없다`);
      return n;
    }

    function colorAt(i: number): string {
      const c = hue[i];
      if (c === undefined) throw new Error(`rotate-turns-stage: 꼭짓점 ${i} 의 색이 없다`);
      return c;
    }

    function arcPath(p: { x: number; y: number }, deg: number, a0: number, a1: number, scale: number): string {
      const span = a1 - a0;
      const n = Math.max(1, Math.ceil(Math.abs(span) / ARC_SEG_DEG));
      const parts: string[] = [];
      for (let i = 0; i <= n; i += 1) {
        const q = rotatePoint(p, a0 + (span * i) / n - deg);
        parts.push(`${i === 0 ? 'M' : 'L'}${round(cx + q.x * scale)},${round(cy - q.y * scale)}`);
      }
      return parts.join(' ');
    }

    function draw(scene: RotateTurnsScene, frame: Frame): void {
      svg.textContent = '';
      const m = scene.measure;
      const reach = scene.reach;
      if (m === null || reach === null) return;
      const scale = side / 2 / (reach * MARGIN);
      const X = (x: number): number => round(cx + x * scale);
      const Y = (y: number): number => round(cy - y * scale);
      const { phi } = frame;
      const step = scene.step;

      // 캡션 — 지금 일어나는 일만
      const caption =
        step === null
          ? t('caption.start', 'Starting triangle. Total angle: {deg}°', { deg: fmt(m.deg, 1) })
          : t('caption.turn', 'Turn around the origin: +{by}°. Total angle: {deg}°', {
              by: fmt(step.by, 1),
              deg: fmt(m.deg, 1),
            });
      el(svg, 'text', { x: PAD, y: 22, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, caption);

      // 평면 — 축과 눈금
      const plane = el(svg, 'g', {});
      const half = side / 2;
      el(plane, 'rect', { x: planeX, y: TOP, width: side, height: side, fill: colors.bgSubtle, stroke: colors.border, rx: 4 });
      el(plane, 'line', { x1: planeX, y1: cy, x2: planeX + side, y2: cy, stroke: colors.border, 'stroke-width': 1 });
      el(plane, 'line', { x1: cx, y1: TOP, x2: cx, y2: TOP + side, stroke: colors.border, 'stroke-width': 1 });
      const ticks = Math.floor(half / scale);
      for (let k = -ticks; k <= ticks; k += 1) {
        if (k === 0) continue;
        el(plane, 'line', { x1: X(k), y1: cy - 3, x2: X(k), y2: cy + 3, stroke: colors.border });
        el(plane, 'line', { x1: cx - 3, y1: Y(k), x2: cx + 3, y2: Y(k), stroke: colors.border });
      }
      el(plane, 'text', { x: planeX + side - 6, y: cy - 6, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, t('label.x', 'x'));
      el(plane, 'text', { x: cx - 6, y: TOP + 12, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, t('label.y', 'y'));

      // 궤도 — 꼭짓점마다 원점까지 거리를 반지름으로
      m.points.forEach((p, i) => {
        el(plane, 'circle', {
          cx,
          cy,
          r: round(p.r * scale),
          fill: 'none',
          stroke: colorAt(i),
          'stroke-opacity': 0.4,
          'stroke-dasharray': '3 4',
        });
      });

      // 처음 자리 — 돌기 시작한 뒤에만
      if (phi !== 0) {
        const ghost = scene.vertices.map((v) => `${X(v.x)},${Y(v.y)}`).join(' ');
        el(plane, 'polygon', { points: ghost, fill: 'none', stroke: colors.textMuted, 'stroke-dasharray': '4 3', 'stroke-width': 1 });
      }

      // 지나온 호 — 앞 걸음까지는 가늘게, 이번 걸음은 굵게
      const from = step === null ? phi : step.from;
      m.points.forEach((p, i) => {
        if (from !== 0) {
          el(plane, 'path', { d: arcPath(p, m.deg, 0, from, scale), fill: 'none', stroke: colorAt(i), 'stroke-width': 2, 'stroke-opacity': 0.45 });
        }
        if (phi !== from) {
          el(plane, 'path', { d: arcPath(p, m.deg, from, phi, scale), fill: 'none', stroke: colorAt(i), 'stroke-width': 3.5, 'stroke-linecap': 'round' });
        }
      });
      if (phi !== 0) {
        el(plane, 'path', { d: arcPath(m.centroid, m.deg, 0, phi, scale), fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '2 3' });
      }

      // 지금 자리 — phi 만큼 돈 삼각형
      const now = m.points.map((p) => rotatePoint(p, phi - m.deg));
      now.forEach((q, i) => {
        el(plane, 'line', { x1: cx, y1: cy, x2: X(q.x), y2: Y(q.y), stroke: colorAt(i), 'stroke-width': 1.2, 'stroke-opacity': 0.75 });
      });
      el(plane, 'polygon', {
        points: now.map((q) => `${X(q.x)},${Y(q.y)}`).join(' '),
        fill: colors.primary,
        'fill-opacity': 0.14,
        stroke: colors.text,
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
      });
      now.forEach((q, i) => {
        const p = m.points[i];
        if (p === undefined) throw new Error(`rotate-turns-stage: 꼭짓점 ${i} 이 없다`);
        el(plane, 'circle', { cx: X(q.x), cy: Y(q.y), r: 4.5, fill: colorAt(i), stroke: colors.bg, 'stroke-width': 1.5 });
        const len = Math.hypot(q.x, q.y);
        if (len === 0) throw new Error(`rotate-turns-stage: 꼭짓점 ${p.id} 이 원점에 있어 이름표를 둘 쪽이 없다`);
        el(
          plane,
          'text',
          {
            x: round(X(q.x) + (q.x / len) * 13),
            y: round(Y(q.y) - (q.y / len) * 13 + smPx * 0.35),
            'text-anchor': 'middle',
            fill: colors.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
          },
          nameOf(p.id),
        );
      });
      const g = rotatePoint(m.centroid, phi - m.deg);
      el(plane, 'circle', { cx: X(g.x), cy: Y(g.y), r: 3.5, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 });

      // 원점 — 도는 중심
      el(plane, 'circle', { cx, cy, r: 5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
      // 도는 동안 도형이 들르지 않는 넷째 사분면 쪽에 둔다
      el(plane, 'text', { x: cx + 7, y: cy + 15, 'text-anchor': 'start', fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.xs }, t('label.origin', 'origin'));

      // 잰 수 — 그 걸음의 새 좌표에서
      const panel = el(svg, 'g', {});
      const colPos = panelX + 26;
      const head = { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs };
      const mono = { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm };
      el(panel, 'text', { x: colPos, y: TOP + 12, ...head }, t('head.position', 'Position (x, y)'));
      el(panel, 'text', { x: panelR, y: TOP + 12, 'text-anchor': 'end', ...head }, t('head.toOrigin', 'To origin'));
      m.points.forEach((p, i) => {
        const y = TOP + 36 + i * 22;
        el(panel, 'circle', { cx: panelX + 5, cy: y - smPx * 0.35, r: 4.5, fill: colorAt(i) });
        el(panel, 'text', { x: panelX + 14, y, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, nameOf(p.id));
        el(panel, 'text', { x: colPos, y, ...mono }, t('value.point', '({x}, {y})', { x: fmt(p.x, 2), y: fmt(p.y, 2) }));
        el(panel, 'text', { x: panelR, y, 'text-anchor': 'end', ...mono }, fmt(p.r, 2));
      });

      const gy = TOP + 36 + m.points.length * 22 + 10;
      el(panel, 'text', { x: panelX, y: gy, ...head }, t('head.centroid', 'Centroid'));
      el(panel, 'circle', { cx: panelX + 5, cy: gy + 22 - smPx * 0.35, r: 3.5, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 });
      el(panel, 'text', { x: colPos, y: gy + 22, ...mono }, t('value.point', '({x}, {y})', { x: fmt(m.centroid.x, 2), y: fmt(m.centroid.y, 2) }));
      el(panel, 'text', { x: panelR, y: gy + 22, 'text-anchor': 'end', ...mono }, fmt(m.centroid.r, 2));

      const sy = gy + 56;
      el(panel, 'text', { x: panelX, y: sy, ...head }, t('head.sides', 'Side lengths'));
      const cell = panelW / Math.max(1, m.sides.length);
      m.sides.forEach((s, i) => {
        const x = panelX + i * cell;
        el(panel, 'text', { x, y: sy + 22, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, t('value.side', '{p}{q}', { p: nameOf(s.from), q: nameOf(s.to) }));
        el(panel, 'text', { x: x + 24, y: sy + 22, ...mono }, fmt(s.len, 2));
      });

      const ay = sy + 56;
      el(panel, 'text', { x: panelX, y: ay, ...head }, t('head.corners', 'Interior angles'));
      const cellA = panelW / Math.max(1, m.corners.length);
      m.corners.forEach((c, i) => {
        const x = panelX + i * cellA;
        const at = m.points.findIndex((p) => p.id === c.id);
        if (at < 0) throw new Error(`rotate-turns-stage: 각의 꼭짓점 ${c.id} 이 없다`);
        el(panel, 'circle', { cx: x + 5, cy: ay + 22 - smPx * 0.35, r: 4.5, fill: colorAt(at) });
        el(panel, 'text', { x: x + 14, y: ay + 22, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, nameOf(c.id));
        el(panel, 'text', { x: x + 28, y: ay + 22, ...mono }, t('value.deg', '{v}°', { v: fmt(c.deg, 1) }));
      });
    }

    function drawStatic(scene: RotateTurnsScene): void {
      if (scene.measure === null) {
        svg.textContent = '';
        return;
      }
      draw(scene, { phi: scene.measure.deg });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
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

    async function sweep(scene: RotateTurnsScene, mine: number): Promise<void> {
      const step = scene.step;
      const m = scene.measure;
      if (step === null || m === null) throw new Error('rotate-turns-stage: 돌 걸음이 없는 장면에서 호 운동을 불렀다');
      const start = Date.now();
      draw(scene, { phi: step.from });
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const u = Math.min(1, (Date.now() - start) / MOVE_MS);
        if (u >= 1) break;
        draw(scene, { phi: step.from + step.by * ease(u) });
      }
    }

    // 좁히기만 한다 — initialData 가 없으면 빈 캔버스로 둔다 (장면이 오면 그린다)
    if (params.initialData !== undefined) readRotateTurnsData(params.initialData);

    const instance: ViewInstance & {
      render(next: RotateTurnsScene, prev: RotateTurnsScene | null, opts: { animate: boolean }): Promise<void>;
    } = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null || next.measure === null) {
          drawStatic(next);
          return;
        }
        await sweep(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
