/**
 * 무대 — 왼쪽 좌표평면에서 v 의 복제본이 돌며 늘어 Av 가 되고, 오른쪽 장부에 벡터마다
 * 돈 각이 부호 있는 막대로 쌓인다. 돌지 않은 벡터는 제 직선이 평면에 그어진다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Bounds, Probe, Vec2 } from './algorithm';
import type { EigenvectorDirectionScene } from './scene';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 330;
const PAD = 12;
/** 곱 하나의 운동 — 걸음 벽시계 = 이것 + stepMs */
const MOVE_MS = 480;
const FRAME_MS = 16;
/** 화살촉 */
const HEAD_LEN = 8;
const HEAD_HALF = 4.5;

type Attrs = Record<string, string | number>;

function r2(x: number): number {
  const y = Math.round(x * 100) / 100;
  return y === 0 ? 0 : y;
}

function minus(s: string): string {
  return s.replace(/-/g, '−');
}

/** 소수 첫째 — 각 */
function fmt1(x: number): string {
  const s = x.toFixed(1);
  return minus(s === '-0.0' ? '0.0' : s);
}

/** 소수 둘째 — 배수 */
function fmt2(x: number): string {
  const s = x.toFixed(2);
  return minus(s === '-0.00' ? '0.00' : s);
}

/** 정수로 떨어지면 소수점 없이, 아니면 소수 둘째 */
function fmtNum(x: number): string {
  if (Number.isInteger(x)) return minus(String(x === 0 ? 0 : x));
  return fmt2(x);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

type Frame = {
  /** 원점의 픽셀 자리 */
  ox: number;
  oy: number;
  /** 한 단위의 픽셀 */
  unit: number;
  /** 평면에 보이는 수학 좌표 범위 (틀 + 여백 한 칸) */
  view: Bounds;
};

type Live = {
  probe: Probe;
  avLine: SVGLineElement;
  avHead: SVGPolygonElement;
  avLabel: SVGTextElement;
  arc: SVGPathElement;
  arcHead: SVGPolygonElement;
  rowAngle: SVGTextElement;
  bar: SVGRectElement | null;
  zeroX: number;
  barScale: number;
  eigenLine: SVGLineElement | null;
  frame: Frame;
};

export const eigenvectorDirectionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);
    const xsPx = parseFloat(fontSizes.xs);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let live: Live | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Attrs,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, text: string, attrs: Attrs): SVGTextElement {
      const node = el('text', { x: r2(x), y: r2(y), ...attrs });
      node.textContent = text;
      return node;
    }

    // ── 배치 — 캔버스에서 역산한다
    const planeBoxW = Math.round(W * 0.56) - PAD;
    const planeBoxH = H - 44 - PAD;
    const panelX = PAD + planeBoxW + 24;
    const panelR = W - PAD;
    const captionY = H - 16;

    function frameOf(b: Bounds): Frame {
      const view: Bounds = { minX: b.minX - 1, maxX: b.maxX + 1, minY: b.minY - 1, maxY: b.maxY + 1 };
      const spanX = view.maxX - view.minX;
      const spanY = view.maxY - view.minY;
      const unit = Math.min(planeBoxW / spanX, planeBoxH / spanY);
      const left = PAD + (planeBoxW - spanX * unit) / 2;
      const top = PAD + (planeBoxH - spanY * unit) / 2;
      return { ox: left - view.minX * unit, oy: top + view.maxY * unit, unit, view };
    }

    function px(f: Frame, x: number, y: number): [number, number] {
      return [r2(f.ox + x * f.unit), r2(f.oy - y * f.unit)];
    }

    /** 각(도)과 길이(단위)로 정한 화살표의 끝 */
    function tipAt(f: Frame, deg: number, len: number): [number, number] {
      return px(f, len * Math.cos(rad(deg)), len * Math.sin(rad(deg)));
    }

    function placeArrow(
      f: Frame,
      line: SVGLineElement,
      head: SVGPolygonElement,
      deg: number,
      len: number,
    ): void {
      const [tx, ty] = tipAt(f, deg, len);
      const lenPx = len * f.unit;
      if (lenPx <= HEAD_LEN) {
        throw new Error(`eigenvector-direction-stage: 화살표가 촉보다 짧다 (${lenPx}px)`);
      }
      const ux = Math.cos(rad(deg));
      const uy = -Math.sin(rad(deg));
      const bx = tx - ux * HEAD_LEN;
      const by = ty - uy * HEAD_LEN;
      line.setAttribute('x1', String(r2(f.ox)));
      line.setAttribute('y1', String(r2(f.oy)));
      line.setAttribute('x2', String(r2(bx)));
      line.setAttribute('y2', String(r2(by)));
      const nx = -uy * HEAD_HALF;
      const ny = ux * HEAD_HALF;
      head.setAttribute(
        'points',
        `${r2(tx)},${r2(ty)} ${r2(bx + nx)},${r2(by + ny)} ${r2(bx - nx)},${r2(by - ny)}`,
      );
    }

    function arrow(f: Frame, deg: number, len: number, color: string, width: number): {
      line: SVGLineElement;
      head: SVGPolygonElement;
    } {
      const line = el('line', { stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' });
      const head = el('polygon', { fill: color });
      placeArrow(f, line, head, deg, len);
      return { line, head };
    }

    const ARC_R = 30;

    function arcPath(f: Frame, fromDeg: number, sweepDeg: number): string {
      const [sx, sy] = [r2(f.ox + ARC_R * Math.cos(rad(fromDeg))), r2(f.oy - ARC_R * Math.sin(rad(fromDeg)))];
      if (Math.abs(sweepDeg) < 0.05) return `M ${sx} ${sy}`;
      const to = fromDeg + sweepDeg;
      const ex = r2(f.ox + ARC_R * Math.cos(rad(to)));
      const ey = r2(f.oy - ARC_R * Math.sin(rad(to)));
      // 화면은 y 가 아래로 자라 수학의 반시계가 sweep 0 이다
      const sweep = sweepDeg > 0 ? 0 : 1;
      return `M ${sx} ${sy} A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${ex} ${ey}`;
    }

    /** 호 끝의 촉 — 도는 쪽을 가리킨다. 호가 거의 없으면 비운다 */
    function arcHeadPoints(f: Frame, fromDeg: number, sweepDeg: number): string {
      if (Math.abs(sweepDeg) < 0.05) return '';
      const end = fromDeg + sweepDeg;
      const ex = f.ox + ARC_R * Math.cos(rad(end));
      const ey = f.oy - ARC_R * Math.sin(rad(end));
      // 접선 — 반시계면 +90°, 시계면 −90°
      const dir = rad(end + (sweepDeg > 0 ? 90 : -90));
      const ux = Math.cos(dir);
      const uy = -Math.sin(dir);
      const bx = ex - ux * 6;
      const by = ey - uy * 6;
      const nx = -uy * 3.5;
      const ny = ux * 3.5;
      return `${r2(ex)},${r2(ey)} ${r2(bx + nx)},${r2(by + ny)} ${r2(bx - nx)},${r2(by - ny)}`;
    }

    function avLabelAt(f: Frame, deg: number, len: number): [number, number] {
      const [tx, ty] = tipAt(f, deg, len);
      return [tx + 12 * Math.cos(rad(deg)), ty - 12 * Math.sin(rad(deg)) + smPx * 0.35];
    }

    /** 원점을 지나는 직선을 평면 틀 안으로 자른다 */
    function lineThrough(f: Frame, deg: number): [number, number, number, number] {
      const dx = Math.cos(rad(deg));
      const dy = Math.sin(rad(deg));
      let lo = -Infinity;
      let hi = Infinity;
      const slab = (d: number, min: number, max: number): void => {
        if (Math.abs(d) < 1e-12) {
          if (min > 0 || max < 0) throw new Error('eigenvector-direction-stage: 원점이 틀 밖이다');
          return;
        }
        const a = min / d;
        const b = max / d;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      };
      slab(dx, f.view.minX, f.view.maxX);
      slab(dy, f.view.minY, f.view.maxY);
      if (!(lo < hi)) throw new Error('eigenvector-direction-stage: 고유 직선이 틀과 만나지 않는다');
      const [x1, y1] = px(f, lo * dx, lo * dy);
      const [x2, y2] = px(f, hi * dx, hi * dy);
      return [x1, y1, x2, y2];
    }

    function drawPlane(f: Frame): void {
      const v = f.view;
      for (let x = Math.ceil(v.minX); x <= Math.floor(v.maxX); x += 1) {
        const [gx, gy1] = px(f, x, v.minY);
        const [, gy2] = px(f, x, v.maxY);
        el('line', { x1: gx, y1: gy1, x2: gx, y2: gy2, stroke: colors.border, 'stroke-width': 1 });
      }
      for (let y = Math.ceil(v.minY); y <= Math.floor(v.maxY); y += 1) {
        const [gx1, gy] = px(f, v.minX, y);
        const [gx2] = px(f, v.maxX, y);
        el('line', { x1: gx1, y1: gy, x2: gx2, y2: gy, stroke: colors.border, 'stroke-width': 1 });
      }
      const [ax1, ay] = px(f, v.minX, 0);
      const [ax2] = px(f, v.maxX, 0);
      el('line', { x1: ax1, y1: ay, x2: ax2, y2: ay, stroke: colors.textMuted, 'stroke-width': 1.2 });
      const [bx, by1] = px(f, 0, v.minY);
      const [, by2] = px(f, 0, v.maxY);
      el('line', { x1: bx, y1: by1, x2: bx, y2: by2, stroke: colors.textMuted, 'stroke-width': 1.2 });
      const tick = { fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs };
      for (let x = Math.ceil(v.minX); x <= Math.floor(v.maxX); x += 1) {
        if (x === 0 || x % 5 !== 0) continue;
        const [tx, ty] = px(f, x, 0);
        label(tx, ty + xsPx + 3, fmtNum(x), { ...tick, 'text-anchor': 'middle' });
      }
      for (let y = Math.ceil(v.minY); y <= Math.floor(v.maxY); y += 1) {
        if (y === 0 || y % 5 !== 0) continue;
        const [tx, ty] = px(f, 0, y);
        label(tx - 4, ty + xsPx * 0.35, fmtNum(y), { ...tick, 'text-anchor': 'end' });
      }
    }

    function drawMatrix(s: EigenvectorDirectionScene): void {
      const m = s.matrix;
      const mono = { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.md };
      const row0 = PAD + mdPx + 4;
      const row1 = row0 + mdPx + 6;
      label(panelX, (row0 + row1) / 2 + 1, t('label.matrix', 'A ='), { ...mono, 'text-anchor': 'start' });
      const c0 = panelX + 64;
      const c1 = panelX + 100;
      for (const [ri, y] of [row0, row1].entries()) {
        const row = m[ri];
        if (row === undefined) throw new Error('eigenvector-direction-stage: 행렬 행이 없다');
        label(c0, y, fmtNum(row[0]), { ...mono, 'text-anchor': 'end' });
        label(c1, y, fmtNum(row[1]), { ...mono, 'text-anchor': 'end' });
      }
      const top = row0 - mdPx;
      const bottom = row1 + 5;
      const lx = panelX + 34;
      const rx = c1 + 6;
      const br = { fill: 'none', stroke: colors.text, 'stroke-width': 1.3 };
      el('path', { d: `M ${lx + 4} ${top} L ${lx} ${top} L ${lx} ${bottom} L ${lx + 4} ${bottom}`, ...br });
      el('path', { d: `M ${rx - 4} ${top} L ${rx} ${top} L ${rx} ${bottom} L ${rx - 4} ${bottom}`, ...br });
    }

    function drawStatic(s: EigenvectorDirectionScene): void {
      svg.textContent = '';
      live = null;
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      drawMatrix(s);

      const current = s.step === null ? null : s.results[s.step.index];
      if (s.step !== null && current === undefined) {
        throw new Error(`eigenvector-direction-stage: 이번 걸음 ${s.step.index} 의 결과가 자취에 없다`);
      }

      // ── 장부
      const n = s.vectors.length;
      const rowsTop = 108;
      const rowH = Math.min(30, (H - 44 - rowsTop) / n);
      const barL = panelX + 62;
      const barW = 76;
      const angleEnd = barL + barW + 46;
      const muted = { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs };
      label(barL + barW / 2, rowsTop - 6, t('head.turn', 'Turned'), { ...muted, 'text-anchor': 'middle' });
      label(panelR, rowsTop - 6, t('head.length', 'Length'), { ...muted, 'text-anchor': 'end' });

      let zeroX = 0;
      let barScale = 0;
      if (s.spinMin !== null && s.spinMax !== null) {
        const span = s.spinMax - s.spinMin;
        if (!(span > 0)) throw new Error('eigenvector-direction-stage: 돈 각의 폭이 없다');
        barScale = barW / span;
        zeroX = r2(barL - s.spinMin * barScale);
        el('line', {
          x1: zeroX,
          y1: rowsTop,
          x2: zeroX,
          y2: r2(rowsTop + rowH * n),
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
      }

      let turned = 0;
      let kept = 0;
      let rowAngleLive: SVGTextElement | null = null;
      let barLive: SVGRectElement | null = null;
      const mono = { 'font-family': fonts.mono, 'font-size': fontSizes.sm };
      for (let i = 0; i < n; i += 1) {
        const vec: Vec2 | undefined = s.vectors[i];
        if (vec === undefined) throw new Error(`eigenvector-direction-stage: vectors[${i}] 가 없다`);
        const cy = rowsTop + rowH * (i + 0.5);
        const ty = cy + smPx * 0.35;
        const res = s.results[i];
        const isCurrent = current !== null && current !== undefined && current.index === i;
        if (isCurrent) {
          el('rect', {
            x: panelX - 6,
            y: r2(cy - rowH / 2 + 1),
            width: panelR - panelX + 10,
            height: r2(rowH - 2),
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
          });
        }
        label(panelX, ty, t('label.vec', '({x}, {y})', { x: fmtNum(vec[0]), y: fmtNum(vec[1]) }), {
          ...mono,
          fill: res === undefined ? colors.textMuted : colors.text,
          'text-anchor': 'start',
        });
        if (res === undefined) continue;
        if (res.onLine) kept += 1;
        else turned += 1;
        if (res.onLine) {
          const d = 5;
          el('path', {
            d: `M ${zeroX} ${r2(cy - d)} L ${r2(zeroX + d)} ${r2(cy)} L ${zeroX} ${r2(cy + d)} L ${r2(zeroX - d)} ${r2(cy)} Z`,
            fill: colors.accent,
            stroke: colors.text,
            'stroke-width': 1,
          });
        } else {
          const w = res.spinDeg * barScale;
          const bar = el('rect', {
            x: r2(Math.min(zeroX, zeroX + w)),
            y: r2(cy - 4),
            width: r2(Math.abs(w)),
            height: 8,
            fill: colors.itemComparing,
          });
          if (isCurrent) barLive = bar;
        }
        const angleText = label(angleEnd, ty, t('label.deg', '{deg}°', { deg: fmt1(res.spinDeg) }), {
          ...mono,
          fill: colors.text,
          'text-anchor': 'end',
        });
        if (isCurrent) rowAngleLive = angleText;
        if (res.lambda !== null) {
          const text = t('label.eigen', 'λ = {ev}', { ev: fmtNum(res.lambda) });
          const w = text.length * smPx * 0.62 + 10;
          el('rect', {
            x: r2(panelR - w),
            y: r2(cy - smPx * 0.75),
            width: r2(w),
            height: r2(smPx * 1.5),
            rx: 3,
            fill: colors.accent,
          });
          label(panelR - w / 2, ty, text, { ...mono, fill: colors.stateInk, 'text-anchor': 'middle' });
        } else {
          label(panelR, ty, t('label.factor', '×{k}', { k: fmt2(res.factor) }), {
            ...mono,
            fill: colors.text,
            'text-anchor': 'end',
          });
        }
      }

      if (s.results.length > 0) {
        label(panelX, 84, t('tally', 'Turned: {turned} · On its own line: {kept}', { turned, kept }), {
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'text-anchor': 'start',
        });
      }

      // ── 캡션 — 지금 일어나는 일만
      const cap = { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md };
      if (current === null || current === undefined) {
        label(PAD, captionY, t('caption.start', 'Multiply each vector by A once · vectors: {n}', { n }), cap);
      } else {
        const vars = {
          vx: fmtNum(current.v[0]),
          vy: fmtNum(current.v[1]),
          ax: fmtNum(current.av[0]),
          ay: fmtNum(current.av[1]),
          deg: fmt1(current.spinDeg),
        };
        if (current.lambda !== null) {
          label(
            PAD,
            captionY,
            t('caption.onLine', 'v ({vx}, {vy}) → Av ({ax}, {ay}) · turned: {deg}° · v × Av = {cross} · λ = {ev}', {
              ...vars,
              cross: fmtNum(current.cross),
              ev: fmtNum(current.lambda),
            }),
            cap,
          );
        } else {
          label(
            PAD,
            captionY,
            t('caption.turned', 'v ({vx}, {vy}) → Av ({ax}, {ay}) · turned: {deg}° · length: ×{k}', {
              ...vars,
              k: fmt2(current.factor),
            }),
            cap,
          );
        }
      }

      // ── 평면
      if (s.bounds === null) return;
      const f = frameOf(s.bounds);
      drawPlane(f);

      // 제 직선 — 찾은 것만. 답을 미리 긋지 않는다
      let eigenLive: SVGLineElement | null = null;
      for (const res of s.results) {
        if (!res.onLine) continue;
        const [x1, y1, x2, y2] = lineThrough(f, res.vDeg);
        const line = el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: colors.accent,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        if (current !== null && current !== undefined && res.index === current.index) eigenLive = line;
      }

      // 지나간 곱 — 옅은 자취
      for (const res of s.results) {
        if (current !== null && current !== undefined && res.index === current.index) continue;
        const a = arrow(f, res.avDeg, Math.hypot(res.av[0], res.av[1]), colors.textMuted, 1.2);
        a.line.setAttribute('opacity', '0.6');
        a.head.setAttribute('opacity', '0.6');
      }

      if (current === null || current === undefined) return;

      // 이번 곱 — 원본 v 는 남고, 복제본이 돌며 늘어 Av 가 된다
      const avLen = Math.hypot(current.av[0], current.av[1]);
      const vLen = Math.hypot(current.v[0], current.v[1]);
      const avArrow = arrow(f, current.avDeg, avLen, colors.itemComparing, 2.5);
      const [alx, aly] = avLabelAt(f, current.avDeg, avLen);
      const avLabel = label(alx, aly, t('label.av', 'Av'), {
        fill: colors.itemComparing,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      arrow(f, current.vDeg, vLen, colors.text, 2);
      const [vtx, vty] = tipAt(f, current.vDeg, vLen);
      const perp = rad(current.vDeg - 90);
      label(vtx + 10 * Math.cos(perp), vty - 10 * Math.sin(perp) + smPx * 0.35, t('label.v', 'v'), {
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      const arc = el('path', {
        d: arcPath(f, current.vDeg, current.spinDeg),
        fill: 'none',
        stroke: colors.itemComparing,
        'stroke-width': 1.5,
      });
      const arcHead = el('polygon', {
        points: arcHeadPoints(f, current.vDeg, current.spinDeg),
        fill: colors.itemComparing,
      });
      if (rowAngleLive === null) {
        throw new Error('eigenvector-direction-stage: 이번 걸음의 장부 줄이 없다');
      }
      if (!current.onLine && barLive === null) {
        throw new Error('eigenvector-direction-stage: 이번 걸음의 막대가 없다');
      }
      if (current.onLine && eigenLive === null) {
        throw new Error('eigenvector-direction-stage: 이번 걸음의 제 직선이 없다');
      }
      live = {
        probe: current,
        avLine: avArrow.line,
        avHead: avArrow.head,
        avLabel,
        arc,
        arcHead,
        rowAngle: rowAngleLive,
        bar: barLive,
        zeroX,
        barScale,
        eigenLine: eigenLive,
        frame: f,
      };
    }

    /** 운동의 한 순간 — 복제본이 v 의 자리에서 p 만큼 돌고 늘었다 */
    function pose(l: Live, p: number): void {
      const pr = l.probe;
      const spin = pr.spinDeg * p;
      const deg = pr.vDeg + spin;
      const vLen = Math.hypot(pr.v[0], pr.v[1]);
      const len = vLen * (1 + (pr.factor - 1) * p);
      placeArrow(l.frame, l.avLine, l.avHead, deg, len);
      const [alx, aly] = avLabelAt(l.frame, deg, len);
      l.avLabel.setAttribute('x', String(r2(alx)));
      l.avLabel.setAttribute('y', String(r2(aly)));
      l.arc.setAttribute('d', arcPath(l.frame, pr.vDeg, spin));
      l.arcHead.setAttribute('points', arcHeadPoints(l.frame, pr.vDeg, spin));
      l.rowAngle.textContent = t('label.deg', '{deg}°', { deg: fmt1(spin) });
      if (l.bar !== null) {
        const w = spin * l.barScale;
        l.bar.setAttribute('x', String(r2(Math.min(l.zeroX, l.zeroX + w))));
        l.bar.setAttribute('width', String(r2(Math.abs(w))));
      }
      if (l.eigenLine !== null) l.eigenLine.setAttribute('opacity', String(r2(p)));
    }

    function tick(): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function move(mine: number): Promise<void> {
      const l = live;
      if (l === null) throw new Error('eigenvector-direction-stage: 움직일 복제본이 없다');
      const start = performance.now();
      pose(l, 0);
      for (;;) {
        if (mine !== gen || destroyed) return;
        await tick();
        if (mine !== gen || destroyed) return;
        const raw = Math.min(1, (performance.now() - start) / MOVE_MS);
        pose(l, ease(raw));
        if (raw >= 1) return;
      }
    }

    return {
      async render(
        next: EigenvectorDirectionScene,
        prev: EigenvectorDirectionScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step === null) return;
        if (prev !== null && prev.step !== null && prev.step.index === step.index) return;
        await move(mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
