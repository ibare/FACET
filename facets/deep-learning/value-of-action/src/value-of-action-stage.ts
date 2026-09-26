/**
 * value-of-action 의 그림 — 복도 칸마다 선택 둘의 값 막대가 서고, 갱신 하나마다 소식의 알이
 * 다음 자리(끝 칸의 상 · 다음 자리의 가장 큰 값)에서 **거슬러** 방금 떠난 칸으로 돌아와
 * 목표값 높이에 내려앉는다. 막대는 그 목표 쪽으로 절반만 자란다.
 *
 * 세로 한 축이 값이다 — 끝 칸의 상 알도, 막대 끝도, 목표 눈금도 같은 축 위에 있다.
 * 알이 떠나는 높이와 내려앉는 높이의 차는 식 r + γ·m 이 정한다. 끝 칸에서 오면(m = 0) 상
 * 높이 그대로 내려앉고, 끝 칸이 아닌 다음 자리에서 오면(r = 0) γ 를 한 번 곱한 만큼 0 쪽으로
 * 가까워진다 — 떠나는 값이 0 이면 0 에서 0 으로 간다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ValueOfActionScene } from './scene.js';

const H = 336;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE = 14;
const GAP = 8;
const CELL_MAX_W = 132;
const CELL_TOP = 100;
const CELL_BOTTOM = 306;
const NAME_Y = 118;
const GLYPH_Y = 134;
const BAND_TOP = 152;
const BAND_BOTTOM = 260;
const NUM_Y = 278;
const LARGER_Y = 298;
const ARC_PEAK = 70;
const CAPTION_Y = [20, 40, 60] as const;
const FINAL_Y = 326;
const COL_PAD = 6;
const BAR_MAX_W = 28;

/** 운동 — 알이 거슬러 오는 몫과 막대가 자라는 몫을 한 시계로 */
const MOVE_MS = 400;
const TRAVEL_SHARE = 0.6;
const FRAME_MS = 16;

/** 소수 둘째 자리. 음수 부호는 빼기 표로, -0 은 0 으로 */
function fx(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s.replace('-', '−');
}

/** 상은 정수, 부호를 붙인다 */
function fr(v: number): string {
  const s = String(Math.round(v));
  if (v > 0) return `+${s}`;
  return s.replace('-', '−');
}

/** 상을 식 안에 둘 때 — 정수, 부호는 음수만 */
function fi(v: number): string {
  return String(Math.round(v)).replace('-', '\u2212');
}

function r1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

type Geometry = {
  cellW: number;
  x0: number;
  colW: number;
  zeroY: number;
  perUnit: number;
};

type Handles = {
  pellet: SVGCircleElement | null;
  bar: SVGRectElement | null;
  from: { x: number; y: number } | null;
  to: { x: number; y: number } | null;
};

export const valueOfActionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smallPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(x: number, y: number, s: string, attrs: Record<string, string | number> = {}): SVGTextElement {
      const node = el('text', {
        x: r1(x),
        y: r1(y),
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
        ...attrs,
      });
      node.textContent = s;
      return node;
    }

    function cellName(id: string): string {
      if (id === 'pit') return t('label.pit', 'Pit');
      if (id === 'goal') return t('label.goal', 'Goal');
      return id;
    }

    function actionName(id: string): string {
      if (id === 'left') return t('label.left', 'left');
      if (id === 'right') return t('label.right', 'right');
      return id;
    }

    function geometry(scene: ValueOfActionScene): Geometry {
      const n = scene.cells.length;
      const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE * 2 - GAP * (n - 1)) / n));
      const x0 = Math.round((W - (n * cellW + GAP * (n - 1))) / 2);
      const colW = (cellW - COL_PAD * 2) / Math.max(1, scene.actions.length);
      const vmax = Math.max(1, ...scene.terminalRewards.map((r) => Math.abs(r)));
      const zeroY = (BAND_TOP + BAND_BOTTOM) / 2;
      return { cellW, x0, colW, zeroY, perUnit: (BAND_BOTTOM - BAND_TOP) / 2 / vmax };
    }

    const cellX = (g: Geometry, i: number): number => g.x0 + i * (g.cellW + GAP);
    const colX = (g: Geometry, cell: number, a: number): number => cellX(g, cell) + COL_PAD + g.colW * (a + 0.5);
    const yOf = (g: Geometry, v: number): number => g.zeroY - v * g.perUnit;

    function barAttrs(g: Geometry, x: number, v: number): Record<string, string | number> {
      const w = Math.min(BAR_MAX_W, g.colW - 10);
      const y = yOf(g, v);
      return {
        x: r1(x - w / 2),
        y: r1(Math.min(y, g.zeroY)),
        width: r1(w),
        height: r1(Math.abs(y - g.zeroY)),
        fill: v < 0 ? c.danger : c.primary,
      };
    }

    function arrowGlyph(x: number, y: number, dir: number, color: string): void {
      const L = 9;
      const d = [
        `M ${r1(x - dir * L)} ${y} L ${r1(x + dir * L)} ${y}`,
        `M ${r1(x + dir * (L - 4))} ${y - 4} L ${r1(x + dir * L)} ${y} L ${r1(x + dir * (L - 4))} ${y + 4}`,
      ].join(' ');
      el('path', { d, stroke: color, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    }

    function drawStatic(scene: ValueOfActionScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const u = scene.step;
      const handles: Handles = { pellet: null, bar: null, from: null, to: null };
      const final = u !== null && u.index === u.total;

      // 캡션 — 지금 일어나는 갱신만
      if (u === null) {
        const all = scene.q.flat();
        const v0 = all[0];
        if (v0 === undefined || all.some((v) => v !== v0)) {
          throw new Error('value-of-action 그림: 처음 표의 값이 하나로 모이지 않는다');
        }
        write(W / 2, CAPTION_Y[0], t('caption.start', 'Start · every value: {v}', { v: fx(v0) }), {
          'font-size': fontSizes.md,
        });
      } else {
        write(
          W / 2,
          CAPTION_Y[0],
          t('caption.step', 'Round {ep} · {from} → {to} · Chosen action: {action} · Reward: {r}', {
            ep: u.episode,
            from: cellName(u.state),
            to: cellName(u.next),
            action: actionName(u.action),
            r: fr(u.reward),
          }),
          { 'font-size': fontSizes.md },
        );
        write(
          W / 2,
          CAPTION_Y[1],
          t('caption.target', 'Target = reward + γ × best next value: {r} + {g} × {m} = {y}', {
            r: fi(u.reward),
            g: fx(scene.gamma),
            m: fx(u.nextMax),
            y: fx(u.target),
          }),
          { fill: c.textMuted },
        );
        write(
          W / 2,
          CAPTION_Y[2],
          t('caption.value', 'Value ({s}, {action}): {before} + {a} × ({y} − {before}) = {after}', {
            s: cellName(u.state),
            action: actionName(u.action),
            before: fx(u.before),
            a: fx(scene.alpha),
            y: fx(u.target),
            after: fx(u.after),
          }),
          { 'font-weight': 600 },
        );
      }

      // 칸
      scene.cells.forEach((id, i) => {
        const x = cellX(g, i);
        const isEnd = scene.terminal.includes(id);
        el('rect', {
          x: r1(x),
          y: CELL_TOP,
          width: g.cellW,
          height: CELL_BOTTOM - CELL_TOP,
          rx: 6,
          fill: isEnd ? c.bg : c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        });
        write(x + g.cellW / 2, NAME_Y, cellName(id), {
          'font-weight': 600,
          fill: isEnd ? c.textMuted : c.text,
        });
      });

      // 이번 걸음 — 떠난 칸에서 다음 칸으로 간 한 걸음 (앞으로), 값은 그 반대로 돌아온다
      if (u !== null) {
        const fi = scene.cells.indexOf(u.state);
        const ti = scene.cells.indexOf(u.next);
        const x1 = cellX(g, fi) + g.cellW / 2;
        const x2 = cellX(g, ti) + g.cellW / 2;
        const yb = CELL_TOP - 4;
        el('path', {
          d: `M ${r1(x1)} ${yb} Q ${r1((x1 + x2) / 2)} ${ARC_PEAK} ${r1(x2)} ${yb}`,
          stroke: c.textMuted,
          'stroke-width': 1.4,
          fill: 'none',
        });
        // 화살촉 — 곡선 끝의 접선(조절점 → 끝점) 방향으로 두 날개
        const mx = (x1 + x2) / 2;
        const dx = x2 - mx;
        const dy = yb - ARC_PEAK;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const wing = (sign: number): string =>
          `${r1(x2 - ux * 8 - sign * uy * 5)} ${r1(yb - uy * 8 + sign * ux * 5)}`;
        el('path', {
          d: `M ${wing(1)} L ${r1(x2)} ${yb} L ${wing(-1)}`,
          stroke: c.textMuted,
          'stroke-width': 1.4,
          fill: 'none',
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        });
      }

      // 값이 붙는 칸 — 선택마다 한 줄
      scene.states.forEach((sid, si) => {
        const ci = scene.cells.indexOf(sid);
        const x = cellX(g, ci);
        el('line', {
          x1: r1(x + COL_PAD),
          x2: r1(x + g.cellW - COL_PAD),
          y1: r1(g.zeroY),
          y2: r1(g.zeroY),
          stroke: c.border,
          'stroke-width': 1,
        });
        scene.actions.forEach((aid, ai) => {
          const cx = colX(g, ci, ai);
          const v = scene.q[si]![ai]!;
          const current = u !== null && u.state === sid && u.action === aid;
          const source = u !== null && !u.terminal && u.next === sid && u.nextBest === aid;
          if (current) {
            el('rect', {
              x: r1(cx - g.colW / 2 + 1),
              y: GLYPH_Y - 10,
              width: r1(g.colW - 2),
              height: NUM_Y + 6 - (GLYPH_Y - 10),
              rx: 4,
              fill: c.accent,
              'fill-opacity': 0.3,
            });
          }
          if (source) {
            el('rect', {
              x: r1(cx - g.colW / 2 + 1),
              y: GLYPH_Y - 10,
              width: r1(g.colW - 2),
              height: NUM_Y + 6 - (GLYPH_Y - 10),
              rx: 4,
              fill: 'none',
              stroke: c.itemComparing,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            });
          }
          arrowGlyph(cx, GLYPH_Y, aid === 'left' ? -1 : aid === 'right' ? 1 : 0, current ? c.text : c.textMuted);
          const bar = el('rect', barAttrs(g, cx, v));
          if (current) handles.bar = bar;
          const larger = final && u !== null && u.best[si] === aid;
          write(cx, NUM_Y, fx(v), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': current || larger ? 700 : 400,
            fill: current || larger ? c.text : c.textMuted,
          });
          if (larger) {
            el('rect', {
              x: r1(cx - g.colW / 2 + 3),
              y: NUM_Y - smallPx,
              width: r1(g.colW - 6),
              height: smallPx + 6,
              rx: 3,
              fill: 'none',
              stroke: c.text,
              'stroke-width': 1.2,
            });
            write(cx, LARGER_Y, t('label.larger', 'larger'), { 'font-size': fontSizes.xs, fill: c.text });
          }
        });
      });

      // 끝 칸의 상 — 값 축 위의 그 높이에 알로
      scene.terminal.forEach((id, k) => {
        const ci = scene.cells.indexOf(id);
        if (ci < 0) return;
        const r = scene.terminalRewards[k]!;
        const cx = cellX(g, ci) + g.cellW / 2;
        const cy = yOf(g, r);
        const src = u !== null && u.terminal && u.next === id;
        el('circle', {
          cx: r1(cx),
          cy: r1(cy),
          r: 14,
          fill: r < 0 ? c.danger : c.primary,
          stroke: src ? c.itemComparing : 'none',
          'stroke-width': src ? 3 : 0,
        });
        write(cx, cy + 4, fr(r), { fill: c.textInverse, 'font-weight': 700 });
      });

      // 목표 눈금과 내려앉은 알
      if (u !== null) {
        const ci = scene.cells.indexOf(u.state);
        const ai = scene.actions.indexOf(u.action);
        const tx = colX(g, ci, ai);
        const ty = yOf(g, u.target);
        el('line', {
          x1: r1(tx - g.colW / 2 + 4),
          x2: r1(tx + g.colW / 2 - 4),
          y1: r1(ty),
          y2: r1(ty),
          stroke: c.text,
          'stroke-width': 1.4,
          'stroke-dasharray': '3 2',
        });
        let from: { x: number; y: number };
        if (u.terminal) {
          const ni = scene.cells.indexOf(u.next);
          from = { x: cellX(g, ni) + g.cellW / 2, y: yOf(g, u.reward) };
        } else {
          const ni = scene.cells.indexOf(u.next);
          const bi = u.nextBest === null ? 0 : Math.max(0, scene.actions.indexOf(u.nextBest));
          from = { x: colX(g, ni, bi), y: yOf(g, u.nextMax) };
        }
        handles.from = from;
        handles.to = { x: tx, y: ty };
        handles.pellet = el('circle', {
          cx: r1(tx),
          cy: r1(ty),
          r: 6,
          fill: c.accent,
          stroke: c.stateInk,
          'stroke-width': 1.5,
        });
      }

      if (final && u !== null) {
        write(W / 2, FINAL_Y, t('caption.final', 'Updates: {n} · Updates that changed a value: {c}', {
          n: u.total,
          c: u.changed,
        }), { fill: c.textMuted });
      }
      return handles;
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const start = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const k = Math.min(1, (performance.now() - start) / ms);
          frame(k);
          if (k >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

    return {
      async render(next: ValueOfActionScene, prev: ValueOfActionScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        const u = next.step;
        const fresh = u !== null && (prev?.step?.index ?? 0) !== u.index;
        if (!opts.animate || !fresh || u === null || !h.pellet || !h.bar || !h.from || !h.to) return;
        const g = geometry(next);
        const { pellet, bar, from, to } = h;
        const cx = to.x;
        await tween(MOVE_MS, mine, (k) => {
          const a = ease(Math.min(1, k / TRAVEL_SHARE));
          pellet.setAttribute('cx', String(r1(from.x + (to.x - from.x) * a)));
          pellet.setAttribute('cy', String(r1(from.y + (to.y - from.y) * a)));
          const b = k <= TRAVEL_SHARE ? 0 : ease((k - TRAVEL_SHARE) / (1 - TRAVEL_SHARE));
          const v = u.before + (u.after - u.before) * b;
          for (const [name, val] of Object.entries(barAttrs(g, cx, v))) bar.setAttribute(name, String(val));
        });
        if (destroyed || mine !== gen) return;
        drawStatic(next);
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
