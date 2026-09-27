/**
 * gradient-step-stage — 점에서 잰 오르막 화살표가 뒤집히고 줄어 걸음이 되고, 점이 옮겨 간다.
 *
 * 왼쪽은 입력 평면 (x, y) — 화살표와 점이 같은 축척에 선다. 그래서 ∇f 를 η 배로 줄인
 * 걸음이 곧 점이 옮겨 가는 거리다. 오른쪽은 높이 f 의 눈금 기둥 — 표지가 내려간다.
 *
 * 운동 (걸음마다 한 번, MOTION_MS):
 *   measure  화살표가 점에서 자라난다 (끝이 0 → ∇f)
 *   flip     화살표 끝이 점을 지나 반대편으로 넘어간다 (∇f → −∇f)
 *   scale    화살표 끝이 점 쪽으로 당겨진다 (−∇f → −η∇f)
 *   move     점이 걸음을 따라 미끄러지고, 걸음 화살표는 점에 먹힌다
 *   descend  높이 기둥의 표지가 f0 에서 새 f 로 내려간다
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { fmt2, fmtData, SYMBOLS, type Vec } from './algorithm.js';
import type { GradientStepScene } from './scene.js';

const H = 540;
const MOTION_MS = 600;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 평면이 가로에서 차지할 몫의 상한 — 나머지는 높이 기둥 */
const PLANE_SHARE = 0.64;

type Pose = {
  /** 지금 화살표 (꼬리에서 끝까지의 벡터). 주면 장면의 화살표 대신 이것을 그린다 */
  arrow?: Vec;
  arrowTail?: Vec;
  point?: Vec;
  fLevel?: number;
  moving?: boolean;
};

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

function ease(s: number): number {
  return s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
}

export const gradientStepStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const fsXs = parseFloat(fontSizes.xs);
    const fsSm = parseFloat(fontSizes.sm);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function write(x: number, y: number, str: string, attrs: Record<string, string | number> = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
        ...attrs,
      });
      node.textContent = str;
      return node;
    }

    function pointLabel(p: Vec, atStart: boolean): string {
      const fx = atStart ? fmtData : fmt2;
      return t('label.point', '({x}, {y})', { x: fx(p[0]), y: fx(p[1]) });
    }

    function caption(s: GradientStepScene): string {
      const f0 = s.f0;
      if (f0 === null) throw new Error('gradient-step-stage: f0 없는 장면에 캡션을 달 수 없다');
      switch (s.step.kind) {
        case 'start':
          return t('caption.start', 'Start at ({x}, {y}) · {f} = {fv}', {
            x: fmtData(s.start[0]),
            y: fmtData(s.start[1]),
            f: SYMBOLS.f,
            fv: fmt2(f0),
          });
        case 'measure': {
          if (!s.grad) throw new Error('gradient-step-stage: measure 장면에 ∇f 가 없다');
          return t('caption.measure', 'Uphill here: {grad} = ({gx}, {gy}) · length {len}', {
            grad: SYMBOLS.grad,
            gx: fmt2(s.grad.v[0]),
            gy: fmt2(s.grad.v[1]),
            len: fmt2(s.grad.len),
          });
        }
        case 'flip': {
          if (!s.neg) throw new Error('gradient-step-stage: flip 장면에 −∇f 가 없다');
          return t('caption.flip', 'Turn it around: {neg} = ({vx}, {vy})', {
            neg: SYMBOLS.neg,
            vx: fmt2(s.neg[0]),
            vy: fmt2(s.neg[1]),
          });
        }
        case 'scale': {
          if (!s.stepVec) throw new Error('gradient-step-stage: scale 장면에 걸음이 없다');
          return t('caption.scale', 'Shrink by learning rate {eta} = {rate}: step ({vx}, {vy}) · length {len}', {
            eta: SYMBOLS.eta,
            rate: fmtData(s.rate),
            vx: fmt2(s.stepVec.v[0]),
            vy: fmt2(s.stepVec.v[1]),
            len: fmt2(s.stepVec.len),
          });
        }
        case 'move':
          return t('caption.move', 'Take the step: ({x0}, {y0}) → ({x}, {y})', {
            x0: fmtData(s.step.from[0]),
            y0: fmtData(s.step.from[1]),
            x: fmt2(s.point[0]),
            y: fmt2(s.point[1]),
          });
        case 'descend': {
          if (!s.f1) throw new Error('gradient-step-stage: descend 장면에 새 f 가 없다');
          return t('caption.descend', '{f}: {from} → {to} · down by {drop}', {
            f: SYMBOLS.f,
            from: fmt2(s.step.from),
            to: fmt2(s.f1.value),
            drop: fmt2(s.f1.drop),
          });
        }
      }
    }

    /** 그 장면의 화면 전체를 세운다. pose 는 운동 중 아직 못 온 자리를 덮는다. */
    function drawStatic(s: GradientStepScene, pose: Pose = {}): void {
      svg.textContent = '';
      if (s.bounds === null || s.f0 === null) return; // init 이 오기 전 — 그릴 바탕이 아직 없다
      const b = s.bounds;
      const f0 = s.f0;

      // ── 캡션
      write(W / 2, 30, caption(s), { 'text-anchor': 'middle', 'font-size': fontSizes.md });

      // ── 평면 틀: 캔버스에서 역산
      const pad = 0.5;
      const spanX = b.xMax - b.xMin + 2 * pad;
      const spanY = b.yMax - b.yMin + 2 * pad;
      const regionL = 20;
      const regionR = W * PLANE_SHARE;
      const regionT = 56;
      const regionB = H - 16;
      const sc = Math.min((regionR - regionL) / spanX, (regionB - regionT) / spanY);
      const ox = regionL + (regionR - regionL - spanX * sc) / 2;
      const oy = regionT + (regionB - regionT - spanY * sc) / 2;
      const X = (x: number): number => ox + (x - (b.xMin - pad)) * sc;
      const Y = (y: number): number => oy + (b.yMax + pad - y) * sc;

      const grid = el('g', {});
      for (let gx = b.xMin; gx <= b.xMax; gx += 1) {
        el('line', { x1: X(gx), y1: Y(b.yMax + pad), x2: X(gx), y2: Y(b.yMin - pad), stroke: colors.border, 'stroke-width': gx === 0 ? 1.4 : 0.5, opacity: gx === 0 ? 1 : 0.6 }, grid);
      }
      for (let gy = b.yMin; gy <= b.yMax; gy += 1) {
        el('line', { x1: X(b.xMin - pad), y1: Y(gy), x2: X(b.xMax + pad), y2: Y(gy), stroke: colors.border, 'stroke-width': gy === 0 ? 1.4 : 0.5, opacity: gy === 0 ? 1 : 0.6 }, grid);
      }
      for (let gx = b.xMin; gx <= b.xMax; gx += 1) {
        if (gx === 0 || gx % 2 !== 0) continue;
        write(X(gx), Y(0) + fsXs + 3, fmtData(gx), { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: colors.textMuted });
      }
      for (let gy = b.yMin; gy <= b.yMax; gy += 1) {
        if (gy === 0 || gy % 2 !== 0) continue;
        write(X(0) - 4, Y(gy) + fsXs / 3, fmtData(gy), { 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: colors.textMuted });
      }
      write(X(b.xMax + pad) - 2, Y(0) - 5, SYMBOLS.x, { 'text-anchor': 'end', 'font-style': 'italic', fill: colors.textMuted });
      write(X(0) + 6, Y(b.yMax + pad) + fsSm, SYMBOLS.y, { 'font-style': 'italic', fill: colors.textMuted });

      // ── 화살표 그리기
      function arrow(
        tail: Vec,
        v: Vec,
        color: string,
        opts: { dashed?: boolean; sym?: string; width?: number; symBeside?: boolean },
      ): void {
        const x1 = X(tail[0]);
        const y1 = Y(tail[1]);
        const x2 = X(tail[0] + v[0]);
        const y2 = Y(tail[1] + v[1]);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.5) return; // 길이 0 인 화살표는 그릴 것이 없다 (뒤집히며 점을 지나는 순간)
        const g = el('g', {});
        const dx = (x2 - x1) / len;
        const dy = (y2 - y1) / len;
        const head = Math.min(11, len * 0.5);
        const half = head * 0.5;
        const bx = x2 - dx * head;
        const by = y2 - dy * head;
        const w = opts.width ?? 2.5;
        el('line', {
          x1,
          y1,
          x2: x2 - dx * head * 0.7,
          y2: y2 - dy * head * 0.7,
          stroke: color,
          'stroke-width': w,
          ...(opts.dashed ? { 'stroke-dasharray': '5 4' } : {}),
        }, g);
        el('polygon', {
          points: `${r2(x2)},${r2(y2)} ${r2(bx - dy * half)},${r2(by + dx * half)} ${r2(bx + dy * half)},${r2(by - dx * half)}`,
          fill: opts.dashed ? 'none' : color,
          stroke: color,
          'stroke-width': opts.dashed ? 1.2 : 0,
        }, g);
        if (opts.sym !== undefined) {
          // 짧은 화살표는 끝 너머가 붐빈다 — 몸통 옆(화면에서 진행 방향의 오른손 쪽)에 단다
          const lx = opts.symBeside ? (x1 + x2) / 2 - dy * 22 : x2 + dx * 16;
          const ly = opts.symBeside ? (y1 + y2) / 2 + dx * 22 : y2 + dy * 16;
          write(lx, ly + fsSm / 3, opts.sym, {
            'text-anchor': 'middle',
            'font-style': 'italic',
            fill: color,
          });
        }
      }

      // 지나간 화살표는 점선으로 남는다 — 뒤집힌 뒤의 ∇f, 줄어든 뒤의 −∇f
      if (s.neg && s.grad) arrow(s.start, s.grad.v, colors.textMuted, { dashed: true, sym: SYMBOLS.grad, width: 1.4 });
      if (s.stepVec && s.neg) arrow(s.start, s.neg, colors.textMuted, { dashed: true, sym: SYMBOLS.neg, width: 1.4 });

      // 지금 화살표
      if (pose.arrow) {
        arrow(pose.arrowTail ?? s.start, pose.arrow, colors.itemActive, {});
      } else if (!s.moved) {
        if (s.stepVec) arrow(s.start, s.stepVec.v, colors.itemActive, { sym: SYMBOLS.step, symBeside: true });
        else if (s.neg) arrow(s.start, s.neg, colors.itemActive, { sym: SYMBOLS.neg });
        else if (s.grad) arrow(s.start, s.grad.v, colors.itemActive, { sym: SYMBOLS.grad });
      }

      // ── 점: 옮겨 갔으면 출발 자리와 지나온 길이 남는다
      const at = pose.point ?? s.point;
      if (s.moved) {
        el('line', { x1: X(s.start[0]), y1: Y(s.start[1]), x2: X(at[0]), y2: Y(at[1]), stroke: colors.itemActive, 'stroke-width': 1.6 });
        el('circle', { cx: X(s.start[0]), cy: Y(s.start[1]), r: 4.5, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.4 });
      }
      el('circle', { cx: X(at[0]), cy: Y(at[1]), r: 5.5, fill: colors.text, stroke: colors.bg, 'stroke-width': 1.5 });
      if (!pose.moving) {
        write(X(at[0]) + 12, Y(at[1]) + fsSm / 3, pointLabel(at, !s.moved), { fill: colors.text });
      }

      // ── 높이 기둥
      const planeR = ox + spanX * sc;
      const colX = planeR + (W - planeR) * 0.4;
      const colW = 26;
      const colT = 96;
      const colB = H - 40;
      const top = Math.ceil(f0) + 1;
      const FY = (v: number): number => colB - (v / top) * (colB - colT);
      write(colX, colT - 22, t('label.height', 'Height {f}', { f: SYMBOLS.f }), { 'text-anchor': 'middle', fill: colors.textMuted });
      el('rect', { x: colX - colW / 2, y: colT, width: colW, height: colB - colT, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 });
      for (let v = 0; v <= top; v += 1) {
        el('line', { x1: colX - colW / 2 - 4, y1: FY(v), x2: colX - colW / 2, y2: FY(v), stroke: colors.border, 'stroke-width': 1 });
        if (v % 2 === 0) {
          write(colX - colW / 2 - 7, FY(v) + fsXs / 3, fmtData(v), { 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: colors.textMuted });
        }
      }

      const level = pose.fLevel ?? (s.f1 ? s.f1.value : f0);
      const settled = pose.fLevel === undefined;
      const right = colX + colW / 2;
      if (s.f1) {
        // 떠난 높이는 점선으로 남는다
        el('line', { x1: colX - colW / 2, y1: FY(f0), x2: right + 8, y2: FY(f0), stroke: colors.textMuted, 'stroke-width': 1.4, 'stroke-dasharray': '4 3' });
        write(right + 12, FY(f0) + fsSm / 3, fmt2(f0), { fill: colors.textMuted });
      }
      el('rect', { x: colX - colW / 2, y: FY(level), width: colW, height: colB - FY(level), fill: colors.itemActive, opacity: 0.25 });
      el('line', { x1: colX - colW / 2 - 2, y1: FY(level), x2: right + 8, y2: FY(level), stroke: colors.itemActive, 'stroke-width': 3 });
      if (settled) {
        write(right + 12, FY(level) + fsSm / 3, fmt2(level), { fill: colors.text, 'font-weight': 600 });
      }
      if (s.f1 && settled) {
        // 내려간 몫 — 두 높이 사이의 꺾쇠
        const bx = right + 58;
        el('path', {
          d: `M${r2(bx - 5)},${r2(FY(f0))} H${r2(bx)} V${r2(FY(s.f1.value))} H${r2(bx - 5)}`,
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 1.6,
        });
        write(bx + 6, (FY(f0) + FY(s.f1.value)) / 2 + fsSm / 3, fmt2(s.f1.drop), { fill: colors.itemActive, 'font-weight': 600 });
      }
    }

    function tween(ms: number, mine: number, frame: (s: number) => void): Promise<void> {
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
          const s = Math.min(1, (Date.now() - began) / ms);
          frame(ease(s));
          if (s >= 1) {
            wake();
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

    function lerp(a: Vec, b: Vec, s: number): Vec {
      return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    }

    async function render(next: GradientStepScene, _prev: GradientStepScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!opts.animate || next.bounds === null) {
        drawStatic(next);
        return;
      }
      const step = next.step;
      switch (step.kind) {
        case 'start':
          drawStatic(next);
          return;
        case 'measure': {
          const g = next.grad;
          if (!g) throw new Error('gradient-step-stage: measure 장면에 ∇f 가 없다');
          await tween(MOTION_MS, mine, (s) => drawStatic(next, { arrow: [g.v[0] * s, g.v[1] * s] }));
          break;
        }
        case 'flip': {
          const from = step.from;
          await tween(MOTION_MS, mine, (s) => drawStatic(next, { arrow: [from[0] * (1 - 2 * s), from[1] * (1 - 2 * s)] }));
          break;
        }
        case 'scale': {
          const sv = next.stepVec;
          if (!sv) throw new Error('gradient-step-stage: scale 장면에 걸음이 없다');
          const from = step.from;
          await tween(MOTION_MS, mine, (s) => drawStatic(next, { arrow: lerp(from, sv.v, s) }));
          break;
        }
        case 'move': {
          const from = step.from;
          const to = next.point;
          await tween(MOTION_MS, mine, (s) => {
            const p = lerp(from, to, s);
            drawStatic(next, { point: p, arrowTail: p, arrow: [to[0] - p[0], to[1] - p[1]], moving: true });
          });
          break;
        }
        case 'descend': {
          const f1 = next.f1;
          if (!f1) throw new Error('gradient-step-stage: descend 장면에 새 f 가 없다');
          const from = step.from;
          await tween(MOTION_MS, mine, (s) => drawStatic(next, { fLevel: from + (f1.value - from) * s }));
          break;
        }
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
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
