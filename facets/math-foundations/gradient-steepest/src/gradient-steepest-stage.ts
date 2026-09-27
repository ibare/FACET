/**
 * gradient-steepest 무대.
 *
 * 왼쪽은 점을 가운데 둔 원판이다. 재는 방향(바늘)이 30° 씩 돌고, 잰 방향마다
 * 그 방향으로 기울기 크기만큼 살이 뻗는다 — 오르막은 실선, 내리막은 점선.
 * 오른쪽은 같은 기울기를 방향 순으로 펼친 띠다. 바늘이 돌 때 띠의 막대가
 * 0 위로 솟았다가 아래로 내려가고 다시 올라온다. 한 바퀴 뒤 바늘이 ∇f 쪽으로
 * 더 돌아가 ∇f 화살표가 서고, 두 편미분이 그 화살표의 가로 · 세로 다리가 된다.
 * 살 · 막대 · 화살표는 한 축척(기울기 1 = 같은 픽셀)이다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { GradientSteepestScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 300;

/** 표시 도우미 — 반올림한 글자가 0 이면 부호를 떼고, 빼기는 U+2212 로 */
function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace('-', '−');
}

/** 1차 데이터의 수는 적힌 그대로 (빼기만 U+2212) */
function raw(v: number): string {
  return String(v).replace('-', '−');
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

type Geometry = {
  cx: number;
  cy: number;
  ring: number;
  /** 기울기 1 의 픽셀 */
  unit: number;
  x0: number;
  x1: number;
};

function geometry(range: number): Geometry {
  const W = PIECE_CANVAS_W;
  const top = 64;
  const cy = Math.round(top + (H - top) / 2) - 4;
  const ring = Math.min(Math.round(W * 0.2), Math.round((H - top) / 2 - 22));
  const cx = Math.round(W * 0.05) + ring + 4;
  const unit = (ring - 10) / range;
  const x0 = Math.round(W * 0.56);
  const x1 = W - 18;
  return { cx, cy, ring, unit, x0, x1 };
}

type Handles = {
  probe: { line: SVGLineElement; head: SVGPolygonElement } | null;
  cursor: SVGLineElement | null;
  spoke: { line: SVGLineElement; dot: SVGCircleElement; slope: number; angle: number } | null;
  bar: { line: SVGLineElement; dot: SVGCircleElement; slope: number } | null;
  grad: { line: SVGLineElement; head: SVGPolygonElement; length: number; angle: number } | null;
  /** 운동이 끝나야 서는 것 — 값 글자 · ∇f 의 다리 · 띠의 ∇f 표 */
  late: SVGElement[];
};

export const gradientSteepestStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement = svg,
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
      opts: { size?: string; color?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el('text', {
        x: x.toFixed(1),
        y: y.toFixed(1),
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.color ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    /** 원판 위 한 점 — 수학 각(시계 반대), 화면 y 는 아래로 */
    function polar(g: Geometry, r: number, deg: number): [number, number] {
      return [g.cx + r * Math.cos(rad(deg)), g.cy - r * Math.sin(rad(deg))];
    }

    function stripX(g: Geometry, deg: number): number {
      const a = ((deg % 360) + 360) % 360;
      return g.x0 + (a / 360) * (g.x1 - g.x0);
    }

    function setArrow(
      g: Geometry,
      line: SVGLineElement,
      head: SVGPolygonElement,
      r: number,
      deg: number,
      headLen: number,
    ): void {
      const [tx, ty] = polar(g, r, deg);
      const shaft = Math.max(r - headLen * 0.8, 0);
      const [sx, sy] = polar(g, shaft, deg);
      line.setAttribute('x1', g.cx.toFixed(1));
      line.setAttribute('y1', g.cy.toFixed(1));
      line.setAttribute('x2', sx.toFixed(1));
      line.setAttribute('y2', sy.toFixed(1));
      const back = Math.max(r - headLen, 0);
      const [bx, by] = polar(g, back, deg);
      const half = r < 1e-6 ? 0 : headLen * 0.45;
      const nx = Math.sin(rad(deg)) * half;
      const ny = Math.cos(rad(deg)) * half;
      head.setAttribute(
        'points',
        `${tx.toFixed(1)},${ty.toFixed(1)} ${(bx + nx).toFixed(1)},${(by + ny).toFixed(1)} ${(bx - nx).toFixed(1)},${(by - ny).toFixed(1)}`,
      );
    }

    function setSpoke(g: Geometry, line: SVGLineElement, dot: SVGCircleElement, r: number, deg: number): void {
      const [x, y] = polar(g, r, deg);
      line.setAttribute('x2', x.toFixed(1));
      line.setAttribute('y2', y.toFixed(1));
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
    }

    function setBar(g: Geometry, line: SVGLineElement, dot: SVGCircleElement, h: number): void {
      const y = g.cy - h;
      line.setAttribute('y2', y.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
    }

    function setCursor(g: Geometry, cursor: SVGLineElement, deg: number): void {
      const x = stripX(g, deg).toFixed(1);
      cursor.setAttribute('x1', x);
      cursor.setAttribute('x2', x);
    }

    function drawStatic(scene: GradientSteepestScene): Handles {
      svg.textContent = '';
      const handles: Handles = { probe: null, cursor: null, spoke: null, bar: null, grad: null, late: [] };
      const { base, marks, grad, step } = scene;
      const [px, py] = base.point;

      // 캡션 — 지금 일어나는 일만
      const capY1 = 22;
      const capY2 = 44;
      const capX = 12;
      const capSize = fontSizes.md;
      if (base.f === null) {
        // silent init 전 — 점만 세운다
        const g0 = geometry(1);
        el('circle', { cx: g0.cx, cy: g0.cy, r: 4.5, fill: colors.primary });
        return handles;
      }
      const f = base.f;
      if (base.range === null) {
        throw new Error('gradient-steepest stage: 함숫값은 있는데 range 가 없다');
      }
      const g = geometry(base.range);

      if (step.kind === 'start') {
        label(t('caption.start', 'At ({x}, {y}), f = {f}', { x: raw(px), y: raw(py), f: fmt(f, 2) }), capX, capY1, {
          size: capSize,
        });
      } else if (step.kind === 'measure') {
        const m = marks[step.index];
        if (m === undefined) throw new Error(`gradient-steepest stage: marks[${step.index}] 가 없다`);
        const vars = { angle: fmt(m.angle, 0), slope: fmt(m.slope, 2) };
        // 부호는 보이는 글자(소수 둘째)로 가른다 — 0.00 으로 보이면 평평함
        const shown = Math.round(m.slope * 100);
        const text =
          shown > 0
            ? t('caption.up', 'Direction {angle}°: uphill, slope {slope}', vars)
            : shown < 0
              ? t('caption.down', 'Direction {angle}°: downhill, slope {slope}', vars)
              : t('caption.flat', 'Direction {angle}°: level, slope {slope}', vars);
        label(text, capX, capY1, { size: capSize });
      } else {
        if (grad === null) throw new Error('gradient-steepest stage: gradient 걸음인데 ∇f 가 없다');
        label(
          t('caption.grad', '∇f = ({gx}, {gy}), direction {angle}°, length {length}', {
            gx: fmt(grad.gx, 2),
            gy: fmt(grad.gy, 2),
            angle: fmt(grad.angle, 1),
            length: fmt(grad.length, 2),
          }),
          capX,
          capY1,
          { size: capSize },
        );
        label(
          t('caption.compare', 'Slope toward ∇f: {slope}. Directions measured: {count}, largest {max} at {maxAngle}°', {
            slope: fmt(grad.slope, 2),
            count: grad.count,
            max: fmt(grad.maxSlope, 2),
            maxAngle: fmt(grad.maxAngle, 0),
          }),
          capX,
          capY2,
          { size: capSize, color: colors.textMuted },
        );
      }

      // ── 원판 ──
      el('circle', { cx: g.cx, cy: g.cy, r: g.ring, fill: 'none', stroke: colors.border, 'stroke-width': 1 });
      for (const deg of base.angles) {
        const [ax, ay] = polar(g, g.ring, deg);
        const [bx, by] = polar(g, g.ring - 6, deg);
        el('line', { x1: ax.toFixed(1), y1: ay.toFixed(1), x2: bx.toFixed(1), y2: by.toFixed(1), stroke: colors.border, 'stroke-width': 1 });
      }
      for (const deg of [0, 90, 180, 270]) {
        const [lx, ly] = polar(g, g.ring + 13, deg);
        const anchor = deg === 0 ? 'start' : deg === 180 ? 'end' : 'middle';
        label(`${deg}°`, deg === 0 ? lx - 4 : deg === 180 ? lx + 4 : lx, ly + smPx * 0.35, {
          size: fontSizes.xs,
          color: colors.textMuted,
          anchor,
        });
      }
      // 점과 함숫값 — 원판 왼쪽 위 모서리
      label(`(${raw(px)}, ${raw(py)})`, 10, g.cy - g.ring + 4, { size: fontSizes.md, weight: '600' });
      label(`f = ${fmt(f, 2)}`, 10, g.cy - g.ring + 4 + smPx * 1.6, { color: colors.textMuted });

      // 잰 살
      const current = step.kind === 'measure' ? step.index : -1;
      marks.forEach((m, i) => {
        const up = m.slope >= 0;
        const color = up ? colors.itemComparing : colors.textMuted;
        const r = Math.abs(m.slope) * g.unit;
        const [x, y] = polar(g, r, m.angle);
        const line = el('line', {
          x1: g.cx,
          y1: g.cy,
          x2: x.toFixed(1),
          y2: y.toFixed(1),
          stroke: color,
          'stroke-width': up ? 3 : 2,
          'stroke-linecap': 'round',
        });
        if (!up) line.setAttribute('stroke-dasharray', '5 4');
        const dot = el('circle', {
          cx: x.toFixed(1),
          cy: y.toFixed(1),
          r: 3.5,
          fill: up ? color : colors.bg,
          stroke: color,
          'stroke-width': 1.5,
        });
        if (i === current) handles.spoke = { line, dot, slope: m.slope, angle: m.angle };
      });

      // ∇f 의 다리와 화살표
      if (grad !== null) {
        const [gxPx, gyPx] = [grad.gx * g.unit, grad.gy * g.unit];
        const legs = el('g', {});
        el(
          'path',
          {
            d: `M${g.cx.toFixed(1)},${g.cy.toFixed(1)} H${(g.cx + gxPx).toFixed(1)} V${(g.cy - gyPx).toFixed(1)}`,
            fill: 'none',
            stroke: colors.primary,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 3',
          },
          legs,
        );
        // 아래쪽 살 끝을 비켜 한 줄 더 내린다
        const legLabelY = grad.gy >= 0 ? g.cy + smPx * 2.6 : g.cy - smPx * 1.8;
        legs.appendChild(
          label(`∂f/∂x = ${fmt(grad.gx, 2)}`, g.cx + gxPx / 2, legLabelY, { size: fontSizes.xs, anchor: 'middle' }),
        );
        legs.appendChild(
          label(`∂f/∂y = ${fmt(grad.gy, 2)}`, g.cx + gxPx + (grad.gx >= 0 ? 6 : -6), g.cy - gyPx / 2 + smPx * 0.35, {
            size: fontSizes.xs,
            anchor: grad.gx >= 0 ? 'start' : 'end',
          }),
        );
        // 각의 호
        const arcR = 26;
        const [ex, ey] = polar(g, arcR, grad.angle);
        el(
          'path',
          {
            d: `M${(g.cx + arcR).toFixed(1)},${g.cy.toFixed(1)} A${arcR},${arcR} 0 ${grad.angle > 180 ? 1 : 0} 0 ${ex.toFixed(1)},${ey.toFixed(1)}`,
            fill: 'none',
            stroke: colors.primary,
            'stroke-width': 1,
          },
          legs,
        );
        handles.late.push(legs);

        const line = el('line', {
          stroke: colors.primary,
          'stroke-width': 3.5,
          'stroke-linecap': 'round',
        });
        const head = el('polygon', { fill: colors.primary });
        setArrow(g, line, head, grad.length * g.unit, grad.angle, 12);
        const [nx, ny] = polar(g, grad.length * g.unit + 16, grad.angle);
        const name = label('∇f', nx, ny + smPx * 0.35, { size: fontSizes.lg, weight: '700', anchor: 'middle' });
        handles.late.push(name);
        handles.grad = { line, head, length: grad.length, angle: grad.angle };
      }

      // 바늘 — 지금 재는 방향
      let probeAngle: number | null = null;
      if (step.kind === 'measure') {
        const m = marks[step.index];
        if (m === undefined) throw new Error(`gradient-steepest stage: marks[${step.index}] 가 없다`);
        probeAngle = m.angle;
      } else if (step.kind === 'gradient') {
        if (grad === null) throw new Error('gradient-steepest stage: gradient 걸음인데 ∇f 가 없다');
        probeAngle = grad.angle;
      }
      if (probeAngle !== null) {
        const line = el('line', { stroke: colors.textMuted, 'stroke-width': 1.2 });
        const head = el('polygon', { fill: colors.textMuted });
        setArrow(g, line, head, g.ring, probeAngle, 9);
        handles.probe = { line, head };
      }
      el('circle', { cx: g.cx, cy: g.cy, r: 4.5, fill: colors.primary });

      // ── 띠: 방향 순으로 편 기울기 ──
      const top = g.cy - (g.ring - 10) - 2;
      const bottom = g.cy + (g.ring - 10) + 2;
      el('line', { x1: g.x0, y1: g.cy, x2: g.x1, y2: g.cy, stroke: colors.border, 'stroke-width': 1 });
      el('line', { x1: g.x0, y1: top, x2: g.x0, y2: bottom, stroke: colors.border, 'stroke-width': 1 });
      label('0', g.x0 - 6, g.cy + smPx * 0.35, { size: fontSizes.xs, color: colors.textMuted, anchor: 'end' });
      label(t('label.slope', 'slope'), g.x0 - 6, g.cy - smPx * 1.1, { size: fontSizes.xs, color: colors.textMuted, anchor: 'end' });
      for (const deg of [0, 90, 180, 270]) {
        label(`${deg}°`, stripX(g, deg), bottom + smPx * 1.4, {
          size: fontSizes.xs,
          color: colors.textMuted,
          anchor: 'middle',
        });
      }
      label(t('label.direction', 'direction'), g.x1, bottom + smPx * 1.4, {
        size: fontSizes.xs,
        color: colors.textMuted,
        anchor: 'end',
      });
      for (const deg of base.angles) {
        const x = stripX(g, deg);
        el('line', { x1: x.toFixed(1), y1: g.cy - 3, x2: x.toFixed(1), y2: g.cy + 3, stroke: colors.border, 'stroke-width': 1 });
      }

      if (probeAngle !== null) {
        const x = stripX(g, probeAngle).toFixed(1);
        handles.cursor = el('line', {
          x1: x,
          y1: top,
          x2: x,
          y2: bottom,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        });
      }

      const maxIndex = grad === null ? -1 : marks.findIndex((m) => m.angle === grad.maxAngle);
      if (grad !== null && maxIndex < 0) {
        throw new Error(`gradient-steepest stage: 가장 큰 방향 ${grad.maxAngle}° 가 잰 살에 없다`);
      }
      marks.forEach((m, i) => {
        const up = m.slope >= 0;
        const color = up ? colors.itemComparing : colors.textMuted;
        const x = stripX(g, m.angle);
        const h = m.slope * g.unit;
        const line = el('line', {
          x1: x.toFixed(1),
          y1: g.cy,
          x2: x.toFixed(1),
          y2: (g.cy - h).toFixed(1),
          stroke: color,
          'stroke-width': 3,
          'stroke-linecap': 'butt',
        });
        if (!up) line.setAttribute('stroke-dasharray', '4 3');
        const dot = el('circle', {
          cx: x.toFixed(1),
          cy: (g.cy - h).toFixed(1),
          r: 3.5,
          fill: up ? color : colors.bg,
          stroke: color,
          'stroke-width': 1.5,
        });
        if (i === current) {
          handles.bar = { line, dot, slope: m.slope };
          const value = label(fmt(m.slope, 2), x, up ? g.cy - h - 8 : g.cy - h + smPx + 4, {
            size: fontSizes.xs,
            anchor: 'middle',
            weight: '600',
          });
          handles.late.push(value);
        } else if (i === maxIndex) {
          label(fmt(m.slope, 2), x + 2, up ? g.cy - h - 8 : g.cy - h + smPx + 4, { size: fontSizes.xs, anchor: 'end', weight: '600' });
        }
      });

      if (grad !== null) {
        const mark = el('g', {});
        const x = stripX(g, grad.angle);
        const y = g.cy - grad.slope * g.unit;
        el('line', { x1: g.x0, y1: y.toFixed(1), x2: g.x1, y2: y.toFixed(1), stroke: colors.primary, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, mark);
        el('line', { x1: x.toFixed(1), y1: g.cy, x2: x.toFixed(1), y2: y.toFixed(1), stroke: colors.primary, 'stroke-width': 1.5 }, mark);
        const d = 5;
        el(
          'polygon',
          {
            points: `${x.toFixed(1)},${(y - d).toFixed(1)} ${(x + d).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + d).toFixed(1)} ${(x - d).toFixed(1)},${y.toFixed(1)}`,
            fill: colors.primary,
          },
          mark,
        );
        mark.appendChild(label(fmt(grad.slope, 2), g.x1, y - 6, { size: fontSizes.xs, anchor: 'end', weight: '700' }));
        mark.appendChild(label('∇f', x + 8, y - 6, { size: fontSizes.xs, weight: '700' }));
        handles.late.push(mark);
      }

      return handles;
    }

    function frame(): Promise<number> {
      return new Promise((resolve) => {
        const id = requestAnimationFrame((now) => {
          frames.delete(id);
          waiters.delete(wake);
          resolve(now);
        });
        frames.add(id);
        const wake = (): void => resolve(-1);
        waiters.add(wake);
      });
    }

    async function run(mine: number, apply: (u: number) => void): Promise<boolean> {
      apply(0);
      const start = await frame();
      if (start < 0 || mine !== gen || destroyed) return false;
      for (;;) {
        const now = await frame();
        if (now < 0 || mine !== gen || destroyed) return false;
        const u = Math.min((now - start) / MOVE_MS, 1);
        apply(ease(u));
        if (u >= 1) return true;
      }
    }

    function hide(nodes: SVGElement[], hidden: boolean): void {
      for (const n of nodes) {
        if (hidden) n.setAttribute('visibility', 'hidden');
        else n.removeAttribute('visibility');
      }
    }

    async function render(
      next: GradientSteepestScene,
      _prev: GradientSteepestScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || next.base.range === null) return;
      const g = geometry(next.base.range);
      const step = next.step;

      if (step.kind === 'measure') {
        const { probe, cursor, spoke, bar } = handles;
        if (probe === null || cursor === null || spoke === null || bar === null) {
          throw new Error('gradient-steepest stage: measure 걸음의 바늘 · 살 · 막대를 못 찾았다');
        }
        const from = step.fromAngle;
        const to = spoke.angle;
        hide(handles.late, true);
        const done = await run(mine, (u) => {
          const deg = from + (to - from) * u;
          setArrow(g, probe.line, probe.head, g.ring, deg, 9);
          setCursor(g, cursor, deg);
          setSpoke(g, spoke.line, spoke.dot, Math.abs(spoke.slope) * g.unit * u, to);
          setBar(g, bar.line, bar.dot, bar.slope * g.unit * u);
        });
        if (!done) return;
      } else if (step.kind === 'gradient') {
        const { probe, cursor, grad } = handles;
        if (probe === null || cursor === null || grad === null) {
          throw new Error('gradient-steepest stage: gradient 걸음의 바늘 · 화살표를 못 찾았다');
        }
        // 한 바퀴를 마친 바늘이 앞으로 이어 돌아 ∇f 쪽에 선다
        const from = step.fromAngle;
        let to = grad.angle;
        while (to <= from) to += 360;
        hide(handles.late, true);
        const turn = 0.6;
        const done = await run(mine, (u) => {
          const spin = Math.min(u / turn, 1);
          const deg = from + (to - from) * spin;
          setArrow(g, probe.line, probe.head, g.ring, deg, 9);
          setCursor(g, cursor, deg);
          const grow = Math.max((u - turn) / (1 - turn), 0);
          setArrow(g, grad.line, grad.head, grad.length * g.unit * grow, grad.angle, 12);
        });
        if (!done) return;
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
