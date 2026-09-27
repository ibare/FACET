/**
 * 특이값 분해 세 걸음의 무대.
 *
 * 왼쪽 좌표평면에서 모양이 실제로 세 번 변한다 — 돌고(각을 나눠 점마다 호를 그리며),
 * 두 축을 따라 늘고, 다시 돈다. 마지막에 단위원이 A 를 한 번에 거쳐 곧장 가는 모양이
 * 점선으로 겹친다. 오른쪽은 A 와 그 세 인수 Vᵀ · Σ · U 를 곱하는 차례대로 세우고
 * 지금 곱하는 것을 밝힌다.
 */
import {
  type CanvasView,
  type SceneRenderer,
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import { motionAt, type Mat2, type Pt } from './algorithm.js';
import type { SvdScene } from './scene.js';

const H = 440;
const PAD = 12;
/** 캡션 두 줄의 자리 */
const CAPTION_H = 64;
/** 평면과 오른쪽 판 사이 */
const GUTTER = 20;
/** 동작 하나의 운동 */
const MOTION_MS = 1000;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 수를 보일 때만 자른다. 음수는 빼기 기호, −0 은 0 */
function fmt(n: number, digits: number): string {
  let s = n.toFixed(digits);
  if (Number(s) === 0) s = (0).toFixed(digits);
  return s.replace('-', '−');
}

function fmtInt(n: number): string {
  if (!Number.isInteger(n)) throw new Error(`행렬 칸 ${n} 이 정수가 아니다`);
  return String(n === 0 ? 0 : n).replace('-', '−');
}

function fmtDeg(n: number): string {
  return `${fmt(n, 2)}°`;
}

function fmtTurn(n: number): string {
  const s = fmtDeg(n);
  return n > 0 ? `+${s}` : s;
}

function angleDeg(p: Pt): number {
  const a = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

function ease(s: number): number {
  return s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s);
}

type Override = { shape?: Pt[]; v?: [Pt, Pt]; direct?: Pt[]; sweep?: number };

export const svdThreeStepsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const [v1Color, v2Color] = categorical(2, 'vivid');
    if (!v1Color || !v2Color) throw new Error('categorical(2) 가 색 둘을 주지 않았다');

    const W = PIECE_CANVAS_W;
    const plane = H - CAPTION_H - 2 * PAD;
    const cx = PAD + plane / 2;
    const cy = PAD + plane / 2;
    const panelX = PAD + plane + GUTTER;
    const panelW = W - panelX - PAD;
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

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

    function r2(n: number): number {
      const v = Math.round(n * 100) / 100;
      return v === 0 ? 0 : v;
    }

    function draw(scene: SvdScene, over: Override): void {
      svg.textContent = '';
      const base = scene.base;
      if (!base) return;

      // 한 칸 = 1. 가장 먼 점 σ₁ 에 여백 반 칸
      const extent = Math.ceil(base.sigma1) + 0.5;
      const unit = plane / 2 / extent;
      const X = (x: number): number => r2(cx + x * unit);
      const Y = (y: number): number => r2(cy - y * unit);
      const poly = (ps: Pt[]): string => ps.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ');

      // 격자와 축
      const gridG = el(svg, 'g', {});
      const lim = Math.floor(extent);
      for (let k = -lim; k <= lim; k += 1) {
        if (k === 0) continue;
        el(gridG, 'line', { x1: X(k), y1: Y(-extent), x2: X(k), y2: Y(extent), stroke: colors.border, 'stroke-width': 1 });
        el(gridG, 'line', { x1: X(-extent), y1: Y(k), x2: X(extent), y2: Y(k), stroke: colors.border, 'stroke-width': 1 });
      }
      el(gridG, 'line', { x1: X(-extent), y1: Y(0), x2: X(extent), y2: Y(0), stroke: colors.textMuted, 'stroke-width': 1 });
      el(gridG, 'line', { x1: X(0), y1: Y(-extent), x2: X(0), y2: Y(extent), stroke: colors.textMuted, 'stroke-width': 1 });

      // 처음 단위원 — 늘 제자리에 남는 잣대
      el(svg, 'polygon', {
        points: poly(base.circle),
        fill: 'none',
        stroke: colors.ghostOutline,
        'stroke-width': 1.2,
        'stroke-dasharray': '3 3',
      });

      // 지금 모양
      const shape = over.shape ?? scene.shape;
      el(svg, 'polygon', {
        points: poly(shape),
        fill: colors.primary,
        'fill-opacity': 0.08,
        stroke: colors.primary,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      });

      // 돈 각의 호 — 돌리는 걸음에서만
      const step = scene.step;
      if (step.kind === 'turn-in' || step.kind === 'turn-out') {
        if (step.motion.kind !== 'rotate') throw new Error('돌리는 걸음의 동작이 rotate 가 아니다');
        const sweep = over.sweep ?? step.motion.deg;
        drawArc(svg, X, Y, unit, step.arcFrom, sweep);
      }

      // v₁ · v₂
      const v = over.v ?? scene.v;
      if (!v) throw new Error('장면에 v 가 없다');
      drawArrow(svg, X, Y, v[0], v1Color, 'v₁');
      drawArrow(svg, X, Y, v[1], v2Color, 'v₂');

      // A 를 한 번에 곱한 모양
      const direct = over.direct ?? scene.direct;
      if (direct) {
        el(svg, 'polygon', {
          points: poly(direct),
          fill: 'none',
          stroke: colors.itemComparing,
          'stroke-width': 2.5,
          'stroke-dasharray': '7 5',
          'stroke-linejoin': 'round',
        });
      }

      drawPanel(scene, v);
      drawCaption(scene);
    }

    function drawArc(
      parent: Element,
      X: (x: number) => number,
      Y: (y: number) => number,
      unit: number,
      fromDeg: number,
      sweep: number,
    ): void {
      if (Math.abs(sweep) < 1e-6) return;
      const r = 1.6;
      const n = Math.max(2, Math.ceil(Math.abs(sweep) / 3));
      const ps: string[] = [];
      for (let i = 0; i <= n; i += 1) {
        const a = ((fromDeg + (sweep * i) / n) * Math.PI) / 180;
        ps.push(`${X(r * Math.cos(a))},${Y(r * Math.sin(a))}`);
      }
      el(parent, 'polyline', {
        points: ps.join(' '),
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      // 호 끝의 화살촉 — 도는 쪽을 가리킨다
      const endA = ((fromDeg + sweep) * Math.PI) / 180;
      const dir = sweep > 0 ? 1 : -1;
      const tip = { x: r * Math.cos(endA), y: r * Math.sin(endA) };
      const tan = { x: -Math.sin(endA) * dir, y: Math.cos(endA) * dir };
      const nrm = { x: Math.cos(endA), y: Math.sin(endA) };
      const hl = 7 / unit;
      const hw = 4 / unit;
      const b1 = { x: tip.x - tan.x * hl + nrm.x * hw, y: tip.y - tan.y * hl + nrm.y * hw };
      const b2 = { x: tip.x - tan.x * hl - nrm.x * hw, y: tip.y - tan.y * hl - nrm.y * hw };
      el(parent, 'polygon', {
        points: `${X(tip.x)},${Y(tip.y)} ${X(b1.x)},${Y(b1.y)} ${X(b2.x)},${Y(b2.y)}`,
        fill: colors.text,
      });
      // 호 가운데 바깥에 지금까지 돈 각
      const midA = ((fromDeg + sweep / 2) * Math.PI) / 180;
      const lr = r + 8 / unit;
      el(
        parent,
        'text',
        {
          x: X(lr * Math.cos(midA)),
          y: Y(lr * Math.sin(midA)),
          'text-anchor': Math.cos(midA) >= 0 ? 'start' : 'end',
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
          stroke: colors.bg,
          'stroke-width': 3,
          'paint-order': 'stroke',
        },
        fmtTurn(sweep),
      );
    }

    function drawArrow(
      parent: Element,
      X: (x: number) => number,
      Y: (y: number) => number,
      p: Pt,
      color: string,
      label: string,
    ): void {
      const x2 = X(p.x);
      const y2 = Y(p.y);
      const dx = x2 - X(0);
      const dy = y2 - Y(0);
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) throw new Error(`${label} 의 길이가 0 이다`);
      const ux = dx / len;
      const uy = dy / len;
      const head = Math.min(10, len * 0.45);
      const bx = x2 - ux * head;
      const by = y2 - uy * head;
      el(parent, 'line', {
        x1: X(0),
        y1: Y(0),
        x2: r2(bx),
        y2: r2(by),
        stroke: color,
        'stroke-width': 3,
      });
      el(parent, 'polygon', {
        points: `${r2(x2)},${r2(y2)} ${r2(bx - uy * 5)},${r2(by + ux * 5)} ${r2(bx + uy * 5)},${r2(by - ux * 5)}`,
        fill: color,
      });
      el(
        parent,
        'text',
        {
          x: r2(x2 + ux * 12),
          y: r2(y2 + uy * 12),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: color,
        },
        label,
      );
    }

    function drawMatrix(parent: Element, x: number, yTop: number, m: Mat2, ink: string): void {
      const colW = 30;
      const rowH = 24;
      const w = colW * 2 + 8;
      const h = rowH * 2 + 4;
      const b = 5;
      el(parent, 'path', {
        d: `M${x + b},${yTop} L${x},${yTop} L${x},${yTop + h} L${x + b},${yTop + h}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': 1.5,
      });
      el(parent, 'path', {
        d: `M${x + w - b},${yTop} L${x + w},${yTop} L${x + w},${yTop + h} L${x + w - b},${yTop + h}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': 1.5,
      });
      for (let i = 0; i < 2; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          el(
            parent,
            'text',
            {
              x: x + 4 + colW * j + colW / 2,
              y: yTop + 2 + rowH * i + rowH / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: ink,
            },
            fmtInt(m[i]![j]!),
          );
        }
      }
    }

    function box(parent: Element, y: number, h: number, state: 'now' | 'done' | 'wait'): void {
      el(parent, 'rect', {
        x: panelX,
        y,
        width: panelW,
        height: h,
        rx: 6,
        fill: state === 'now' ? colors.accent : colors.bg,
        stroke: state === 'wait' ? colors.border : state === 'now' ? colors.accent : colors.text,
        'stroke-width': state === 'done' ? 1.2 : 1,
        'stroke-dasharray': state === 'wait' ? '4 3' : 'none',
      });
    }

    function drawPanel(scene: SvdScene, v: [Pt, Pt]): void {
      const base = scene.base;
      if (!base) throw new Error('바탕 없이 판을 그릴 수 없다');
      const g = el(svg, 'g', {});
      const ink = (state: 'now' | 'done' | 'wait'): string =>
        state === 'now' ? colors.stateInk : state === 'wait' ? colors.textMuted : colors.text;

      // A 칸 — 마지막 걸음에서 밝힌다
      const aState = scene.stage === 4 ? 'now' : 'done';
      const aTop = PAD;
      const aH = 76;
      box(g, aTop, aH, aState);
      el(
        g,
        'text',
        {
          x: panelX + 20,
          y: aTop + aH / 2,
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: ink(aState),
        },
        'A',
      );
      drawMatrix(g, panelX + 44, aTop + (aH - 52) / 2, base.matrix, ink(aState));
      el(
        g,
        'text',
        {
          x: panelX + panelW - 12,
          y: aTop + aH / 2,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: ink(aState),
        },
        t('label.once', 'in one move'),
      );

      // = U · Σ · Vᵀ
      const eqY = aTop + aH + 22;
      el(
        g,
        'text',
        {
          x: panelX + panelW / 2,
          y: eqY,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          fill: colors.text,
        },
        '= U · Σ · Vᵀ',
      );

      // 세 인수 — 곱하는 차례대로 위에서 아래로
      const rows: { sym: string; idx: 1 | 2 | 3; word: string; value: string }[] = [
        { sym: 'Vᵀ', idx: 1, word: t('label.rotate', 'rotate'), value: fmtTurn(-base.thetaV) },
        {
          sym: 'Σ',
          idx: 2,
          word: t('label.stretch', 'stretch'),
          value: `×${fmt(base.sigma1, 3)} · ×${fmt(base.sigma2, 3)}`,
        },
        { sym: 'U', idx: 3, word: t('label.rotate', 'rotate'), value: fmtTurn(base.thetaU) },
      ];
      const rowTop = eqY + 20;
      const rowH = 50;
      const rowGap = 12;
      rows.forEach((row, i) => {
        const y = rowTop + i * (rowH + rowGap);
        const state = scene.stage === row.idx ? 'now' : scene.stage > row.idx ? 'done' : 'wait';
        box(g, y, rowH, state);
        el(
          g,
          'text',
          {
            x: panelX + 26,
            y: y + rowH / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xl,
            'font-weight': 700,
            fill: ink(state),
          },
          row.sym,
        );
        el(
          g,
          'text',
          {
            x: panelX + 54,
            y: y + rowH / 2 - smPx * 0.75,
            'dominant-baseline': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: ink(state),
          },
          row.word,
        );
        el(
          g,
          'text',
          {
            x: panelX + 54,
            y: y + rowH / 2 + mdPx * 0.65,
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: ink(state),
          },
          row.value,
        );
        if (i < rows.length - 1) {
          // 다음 인수로 넘어가는 작은 촉
          const ax = panelX + 26;
          const ay = y + rowH + rowGap / 2;
          el(g, 'polygon', {
            points: `${ax - 4},${ay - 3} ${ax + 4},${ay - 3} ${ax},${ay + 3}`,
            fill: colors.textMuted,
          });
        }
      });

      // v₁ · v₂ 의 지금 좌표
      const readTop = rowTop + 3 * rowH + 2 * rowGap + 22;
      const lines: [string, Pt, string][] = [
        ['v₁', v[0], v1Color],
        ['v₂', v[1], v2Color],
      ];
      lines.forEach(([name, p, color], i) => {
        el(
          g,
          'text',
          {
            x: panelX + 8,
            y: readTop + i * (mdPx + 8),
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: color,
            'font-weight': 700,
          },
          `${name} (${fmt(p.x, 3)}, ${fmt(p.y, 3)})`,
        );
      });
    }

    function drawCaption(scene: SvdScene): void {
      const base = scene.base;
      if (!base) throw new Error('바탕 없이 캡션을 만들 수 없다');
      const v = scene.v;
      if (!v) throw new Error('장면에 v 가 없다');
      const step = scene.step;
      let head: string;
      let sub: string;
      switch (step.kind) {
        case 'start':
          head = t('caption.start', 'Unit circle with marked vectors v₁ and v₂.');
          sub = t('value.angles', 'Angles: v₁ {a1} · v₂ {a2}', {
            a1: fmtDeg(angleDeg(v[0])),
            a2: fmtDeg(angleDeg(v[1])),
          });
          break;
        case 'turn-in': {
          if (step.motion.kind !== 'rotate') throw new Error('turn-in 의 동작이 rotate 가 아니다');
          head = t('caption.turnIn', 'Move 1 · Vᵀ rotates everything by {deg}.', { deg: fmtTurn(step.motion.deg) });
          sub = t('value.lengths', 'Lengths: v₁ {l1} · v₂ {l2}', {
            l1: fmt(Math.hypot(v[0].x, v[0].y), 3),
            l2: fmt(Math.hypot(v[1].x, v[1].y), 3),
          });
          break;
        }
        case 'stretch': {
          if (step.motion.kind !== 'stretch') throw new Error('stretch 의 동작이 stretch 가 아니다');
          head = t('caption.stretch', 'Move 2 · Σ stretches along the two axes.');
          sub = t('value.factors', 'Along x ×{sx} · along y ×{sy}', {
            sx: fmt(step.motion.sx, 3),
            sy: fmt(step.motion.sy, 3),
          });
          break;
        }
        case 'turn-out': {
          if (step.motion.kind !== 'rotate') throw new Error('turn-out 의 동작이 rotate 가 아니다');
          head = t('caption.turnOut', 'Move 3 · U rotates everything by {deg}.', { deg: fmtTurn(step.motion.deg) });
          sub = t('value.angles', 'Angles: v₁ {a1} · v₂ {a2}', {
            a1: fmtDeg(angleDeg(v[0])),
            a2: fmtDeg(angleDeg(v[1])),
          });
          break;
        }
        case 'direct': {
          head = step.same
            ? t('caption.directSame', 'A applied in one move lands on the same shape.')
            : t('caption.directDiffer', 'A applied in one move does not land on the same shape.');
          sub = t('value.gap', 'Largest gap: {gap} · Area ×{area} (det A = {det})', {
            gap: fmt(step.gap, 3),
            area: fmt(base.sigma1 * base.sigma2, 3),
            det: Number.isInteger(base.det) ? fmtInt(base.det) : fmt(base.det, 3),
          });
          break;
        }
      }
      const top = PAD + plane + 24;
      el(
        svg,
        'text',
        {
          x: PAD,
          y: top,
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        },
        head,
      );
      el(
        svg,
        'text',
        {
          x: PAD,
          y: top + mdPx + 10,
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        sub,
      );
    }

    function drawStatic(scene: SvdScene): void {
      draw(scene, {});
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 이번 걸음이 s 만큼 나아간 모양 */
    function frameOf(scene: SvdScene, s: number): Override {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return {};
        case 'turn-in':
        case 'turn-out':
        case 'stretch': {
          const m = step.motion;
          const over: Override = {
            shape: step.from.map((q) => motionAt(m, s, q)),
            v: [motionAt(m, s, step.fromV[0]), motionAt(m, s, step.fromV[1])],
          };
          if (m.kind === 'rotate') over.sweep = m.deg * s;
          return over;
        }
        case 'direct': {
          // 도착점은 걸음이 실어 온 A·p — 여기서 다시 곱하지 않고 처음 원에서 곧장 보간한다
          const to = scene.direct;
          if (!to || to.length !== step.from.length) throw new Error('direct: 도착 모양이 표본 수와 맞지 않는다');
          return {
            direct: step.from.map((q, i) => {
              const d = to[i];
              if (!d) throw new Error(`direct[${i}]: 도착점이 없다`);
              return { x: q.x + (d.x - q.x) * s, y: q.y + (d.y - q.y) * s };
            }),
          };
        }
      }
    }

    const renderer: SceneRenderer<SvdScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const moving = next.step.kind !== 'start' && prev !== null && prev.stage !== next.stage;
        if (!opts.animate || !moving || !next.base) {
          drawStatic(next);
          return;
        }
        const t0 = Date.now();
        draw(next, frameOf(next, 0));
        for (;;) {
          if (mine !== gen || destroyed) return;
          await wait(FRAME_MS);
          if (mine !== gen || destroyed) return;
          const s = Math.min(1, (Date.now() - t0) / MOTION_MS);
          if (s >= 1) break;
          draw(next, frameOf(next, ease(s)));
        }
        drawStatic(next);
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
    return renderer as unknown as ReturnType<CanvasView['mount']>;
  },
};
