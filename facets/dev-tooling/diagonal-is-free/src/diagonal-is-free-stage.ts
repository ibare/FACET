/**
 * diagonal-is-free 의 stage — 편집 그래프 위에서 끝점이 값을 치르고 미끄러진다.
 *
 * 가로 = A 의 줄 (오른쪽 한 칸 = 지움), 세로 = B 의 줄 (아래 한 칸 = 넣음).
 * 두 쪽 줄이 같은 칸에는 점선 대각선이 깔려 있다 — 공짜 길.
 * 한 걸음에 끝점 하나가 앞 끝점에서 주황 한 칸(값 1)을 치르고, 대각선을 따라 미끄러진다.
 * 오른쪽 장부가 끝점마다 치른 칸과 공짜 칸을 나란히 쌓는다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { isFree, type MyersReach } from './algorithm';
import type { DiagonalIsFreeScene } from './scene';

const H = 436;
const W = PIECE_CANVAS_W;
const PAD = 16;
/** 값 1 을 치르는 한 칸의 운동 */
const PAID_MS = 320;
/** 공짜 대각선 한 칸의 운동 */
const SLIDE_MS = 200;
/** A 줄 이름표를 눕히는 각 */
const TILT_DEG = 40;
const LEDGER_W = 176;
const CELL_MAX = 44;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function node<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  content?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    e.setAttribute(name, typeof value === 'number' ? String(round(value)) : value);
  }
  if (content !== undefined) e.textContent = content;
  parent.appendChild(e);
  return e;
}

/** 파일 줄은 앞 빈칸도 글자다 — 접히지 않게 둔다. */
function keepSpaces(e: SVGElement): void {
  e.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  e.setAttribute('style', 'white-space:pre');
}

type Layout = {
  cell: number;
  gridX: number;
  gridY: number;
  ledgerX: number;
  captionY: number;
};

function layout(a: readonly string[], b: readonly string[]): Layout {
  const xs = parseFloat(fontSizes.xs);
  const charW = xs * 0.6;
  const numW = xs * 1.6;
  const longest = (lines: readonly string[]): number => Math.max(...lines.map((l) => l.length));
  const rowLabelW = numW + longest(b) * charW + 10;
  const tilt = (TILT_DEG * Math.PI) / 180;
  const colLabelRise = (numW + longest(a) * charW) * Math.sin(tilt);
  const gridY = PAD + parseFloat(fontSizes.sm) + 10 + colLabelRise;
  const bottom = parseFloat(fontSizes.xs) + 12 + parseFloat(fontSizes.md) * 2 + 20 + PAD;
  const gridX = PAD + rowLabelW;
  const byW = (W - gridX - LEDGER_W - 40 - PAD) / a.length;
  const byH = (H - gridY - bottom) / b.length;
  const cell = Math.min(CELL_MAX, byW, byH);
  return {
    cell,
    gridX,
    gridY,
    ledgerX: gridX + cell * a.length + 40,
    captionY: gridY + cell * b.length + parseFloat(fontSizes.xs) + 34,
  };
}

/** 이번 걸음이 얼마나 왔나 — 운동 시간(ms) 기준. 없으면 다 왔다. */
function motionMs(r: MyersReach): number {
  return (r.move === 'start' ? 0 : PAID_MS) + r.slide * SLIDE_MS;
}

type Pose = {
  /** 값 1 칸이 얼마나 그려졌나 0..1 */
  paid: number;
  /** 미끄러진 칸 (소수 포함) */
  slid: number;
  done: boolean;
};

function poseAt(r: MyersReach, ms: number): Pose {
  const paidMs = r.move === 'start' ? 0 : PAID_MS;
  const paid = paidMs === 0 ? 1 : Math.min(1, Math.max(0, ms / paidMs));
  const slid = Math.min(r.slide, Math.max(0, (ms - paidMs) / SLIDE_MS));
  return { paid, slid, done: ms >= motionMs(r) };
}

const FULL: Pose = { paid: 1, slid: Infinity, done: true };

export const diagonalIsFreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const cancels = new Set<() => void>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function draw(scene: DiagonalIsFreeScene, pose: Pose): void {
      svg.textContent = '';
      const { a, b } = scene;
      const L = layout(a, b);
      const px = (x: number): number => L.gridX + x * L.cell;
      const py = (y: number): number => L.gridY + y * L.cell;
      const xs = parseFloat(fontSizes.xs);
      const now = scene.step === null ? null : scene.step.index;
      const current = now === null ? undefined : scene.reached[now];
      const showEnd = scene.path !== null && pose.done;

      // 이번 걸음이 짚는 줄 — 값을 치른 줄과 공짜로 지난 줄
      const paidA = new Set<number>();
      const paidB = new Set<number>();
      const slidA = new Set<number>();
      const slidB = new Set<number>();
      if (current !== undefined) {
        if (current.move === 'right' && pose.paid >= 1) paidA.add(current.from[0]);
        if (current.move === 'down' && pose.paid >= 1) paidB.add(current.from[1]);
        const n = Math.floor(Math.min(pose.slid, current.slide));
        for (let s = 0; s < n; s += 1) {
          slidA.add(current.mid[0] + s);
          slidB.add(current.mid[1] + s);
        }
      }

      // 축 이름
      node(svg, 'text', {
        x: PAD,
        y: PAD + parseFloat(fontSizes.sm),
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      }, t('label.axisA', 'A → right: delete one line'));
      node(svg, 'text', {
        x: PAD,
        y: PAD + parseFloat(fontSizes.sm) * 2 + 6,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      }, t('label.axisB', 'B ↓ down: insert one line'));

      // A 의 줄 — 칸 위에 눕혀 둔다
      a.forEach((line, i) => {
        const ax = px(i + 0.5);
        const ay = L.gridY - 6;
        const label = node(svg, 'text', {
          x: ax,
          y: ay,
          transform: `rotate(${-TILT_DEG} ${round(ax)} ${round(ay)})`,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: paidA.has(i) ? c.itemComparing : c.text,
          'font-weight': paidA.has(i) || slidA.has(i) ? 'bold' : 'normal',
        });
        keepSpaces(label);
        node(label, 'tspan', { fill: c.textMuted, 'font-weight': 'normal' }, String(i + 1));
        node(label, 'tspan', { dx: xs * 0.6 }, line);
      });

      // B 의 줄 — 칸 왼쪽에
      b.forEach((line, j) => {
        const by = py(j + 0.5) + xs * 0.35;
        node(svg, 'text', {
          x: PAD,
          y: by,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }, String(j + 1));
        const label = node(svg, 'text', {
          x: PAD + xs * 1.6,
          y: by,
          fill: paidB.has(j) ? c.itemComparing : c.text,
          'font-weight': paidB.has(j) || slidB.has(j) ? 'bold' : 'normal',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }, line);
        keepSpaces(label);
      });

      // 판 — 격자와 공짜 대각선
      for (let x = 0; x <= a.length; x += 1) {
        node(svg, 'line', { x1: px(x), y1: py(0), x2: px(x), y2: py(b.length), stroke: c.border, 'stroke-width': 1 });
        node(svg, 'text', {
          x: px(x),
          y: py(b.length) + xs + 4,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }, String(x));
      }
      for (let y = 0; y <= b.length; y += 1) {
        node(svg, 'line', { x1: px(0), y1: py(y), x2: px(a.length), y2: py(y), stroke: c.border, 'stroke-width': 1 });
        node(svg, 'text', {
          x: px(a.length) + 6,
          y: py(y) + xs * 0.35,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }, String(y));
      }
      for (let x = 0; x < a.length; x += 1) {
        for (let y = 0; y < b.length; y += 1) {
          if (!isFree(a, b, x, y)) continue;
          node(svg, 'line', {
            x1: px(x),
            y1: py(y),
            x2: px(x + 1),
            y2: py(y + 1),
            stroke: c.textMuted,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 3',
          });
        }
      }

      // 끝에 닿은 경로 — 되짚은 끝점들의 칸 아래에 노랑 띠
      const onPath = new Set(showEnd && scene.path !== null ? scene.path : []);
      for (const i of onPath) {
        const r = scene.reached[i];
        if (r === undefined) throw new Error(`diagonal-is-free: 경로의 끝점 ${i} 이 장면에 없다`);
        node(svg, 'polyline', {
          points: [r.from, r.mid, r.to].map(([x, y]) => `${round(px(x))},${round(py(y))}`).join(' '),
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 11,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
      }

      // 끝점마다 간 칸 — 값 1 칸(주황)과 공짜 칸(먹)
      scene.reached.forEach((r, i) => {
        const isNow = i === now;
        const p = isNow ? pose : FULL;
        const faded = !isNow && !onPath.has(i);
        const g = node(svg, 'g', faded ? { opacity: 0.45 } : {});
        if (r.move !== 'start' && p.paid > 0) {
          const ex = r.from[0] + (r.mid[0] - r.from[0]) * p.paid;
          const ey = r.from[1] + (r.mid[1] - r.from[1]) * p.paid;
          node(g, 'line', {
            x1: px(r.from[0]),
            y1: py(r.from[1]),
            x2: px(ex),
            y2: py(ey),
            stroke: c.itemComparing,
            'stroke-width': 4,
            'stroke-linecap': 'round',
          });
          if (isNow && p.paid >= 1) {
            const right = r.move === 'right';
            node(svg, 'text', {
              x: px((r.from[0] + r.mid[0]) / 2) + (right ? 0 : -8),
              y: py((r.from[1] + r.mid[1]) / 2) + (right ? -7 : 4),
              'text-anchor': right ? 'middle' : 'end',
              fill: c.itemComparing,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': 'bold',
            }, '+1');
          }
        }
        const s = Math.min(p.slid, r.slide);
        if (s > 0) {
          node(g, 'line', {
            x1: px(r.mid[0]),
            y1: py(r.mid[1]),
            x2: px(r.mid[0] + s),
            y2: py(r.mid[1] + s),
            stroke: c.primary,
            'stroke-width': 3,
            'stroke-linecap': 'round',
          });
        }
      });

      // 출발점
      node(svg, 'circle', { cx: px(0), cy: py(0), r: 4, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 });

      // 끝점 — 안에 치른 값 D
      scene.reached.forEach((r, i) => {
        const isNow = i === now;
        const p = isNow ? pose : FULL;
        let x: number;
        let y: number;
        if (p.paid < 1) {
          x = r.from[0] + (r.mid[0] - r.from[0]) * p.paid;
          y = r.from[1] + (r.mid[1] - r.from[1]) * p.paid;
        } else {
          const s = Math.min(p.slid, r.slide);
          x = r.mid[0] + s;
          y = r.mid[1] + s;
        }
        node(svg, 'circle', {
          cx: px(x),
          cy: py(y),
          r: 8,
          fill: isNow ? c.accent : c.bg,
          stroke: isNow ? c.stateInk : c.text,
          'stroke-width': 1.5,
        });
        node(svg, 'text', {
          x: px(x),
          y: py(y) + xs * 0.35,
          'text-anchor': 'middle',
          fill: isNow ? c.stateInk : c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 'bold',
        }, String(r.d));
      });

      // 장부 — 끝점마다 치른 칸과 공짜 칸
      const box = 12;
      const rowH = Math.min(30, (L.captionY - L.gridY - 60) / Math.max(1, scene.reached.length));
      const legendY = L.gridY + 4;
      node(svg, 'rect', { x: L.ledgerX, y: legendY - box + 2, width: box, height: box, fill: c.itemComparing });
      node(svg, 'text', {
        x: L.ledgerX + box + 6,
        y: legendY,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      }, t('label.paid', 'paid step: cost 1'));
      const freeY = legendY + 20;
      node(svg, 'rect', { x: L.ledgerX, y: freeY - box + 2, width: box, height: box, fill: 'none', stroke: c.primary, 'stroke-width': 1.2 });
      node(svg, 'line', { x1: L.ledgerX, y1: freeY - box + 2, x2: L.ledgerX + box, y2: freeY + 2, stroke: c.primary, 'stroke-width': 1.2 });
      node(svg, 'text', {
        x: L.ledgerX + box + 6,
        y: freeY,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      }, t('label.free', 'free slide: cost 0'));
      node(svg, 'line', {
        x1: L.ledgerX,
        y1: freeY + 12,
        x2: W - PAD,
        y2: freeY + 12,
        stroke: c.border,
        'stroke-width': 1,
      });

      const boxX = L.ledgerX + 62;
      scene.reached.forEach((r, i) => {
        const isNow = i === now;
        const p = isNow ? pose : FULL;
        const ry = freeY + 34 + i * rowH;
        if (onPath.has(i)) {
          node(svg, 'rect', {
            x: L.ledgerX - 4,
            y: ry - rowH / 2 - 4,
            width: W - PAD - L.ledgerX + 4,
            height: rowH - 4,
            rx: 3,
            fill: c.accent,
            opacity: 0.35,
          });
        }
        node(svg, 'text', {
          x: L.ledgerX,
          y: ry,
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': isNow ? 'bold' : 'normal',
        }, t('label.cost', 'Cost {d}', { d: r.d }));
        let bx = boxX;
        if (r.move !== 'start' && p.paid >= 1) {
          node(svg, 'rect', { x: bx, y: ry - box + 2, width: box, height: box, fill: c.itemComparing });
        }
        if (r.move !== 'start') bx += box + 4;
        const full = Math.floor(Math.min(p.slid, r.slide));
        for (let s = 0; s < full; s += 1) {
          node(svg, 'rect', { x: bx, y: ry - box + 2, width: box, height: box, fill: 'none', stroke: c.primary, 'stroke-width': 1.2 });
          node(svg, 'line', { x1: bx, y1: ry - box + 2, x2: bx + box, y2: ry + 2, stroke: c.primary, 'stroke-width': 1.2 });
          bx += box + 4;
        }
        if (p.done) {
          node(svg, 'text', {
            x: W - PAD,
            y: ry,
            'text-anchor': 'end',
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }, t('label.point', '({x}, {y})', { x: r.to[0], y: r.to[1] }));
        }
      });

      // 캡션 — 지금 일어나는 일
      const cap = (y: number, text: string, weight: string): void => {
        node(svg, 'text', {
          x: PAD,
          y,
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': weight,
        }, text);
      };
      const line1 = L.captionY;
      const line2 = L.captionY + parseFloat(fontSizes.md) + 8;
      if (current === undefined) {
        cap(line1, t('caption.start', 'Start at (0, 0): no line passed yet.'), 'normal');
      } else if (current.move === 'start') {
        cap(line1, t('caption.free', 'Cost {d}: nothing paid — cells slid for free: {n}', { d: current.d, n: current.slide }), 'normal');
      } else if (current.move === 'down') {
        cap(line1, t('caption.down', 'Cost {d}: paid 1 to insert B{row}, then cells slid for free: {n}', {
          d: current.d,
          row: current.from[1] + 1,
          n: current.slide,
        }), 'normal');
      } else {
        cap(line1, t('caption.right', 'Cost {d}: paid 1 to delete A{row}, then cells slid for free: {n}', {
          d: current.d,
          row: current.from[0] + 1,
          n: current.slide,
        }), 'normal');
      }
      if (showEnd && current !== undefined && scene.path !== null) {
        let free = 0;
        for (const i of scene.path) {
          const r = scene.reached[i];
          if (r === undefined) throw new Error(`diagonal-is-free: 경로의 끝점 ${i} 이 장면에 없다`);
          free += r.slide;
        }
        cap(line2, t('caption.end', 'Reached ({x}, {y}). Path cost: {d} · free cells: {f}', {
          x: current.to[0],
          y: current.to[1],
          d: current.d,
          f: free,
        }), 'bold');
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          cancels.delete(cancel);
          resolve();
        };
        const id = setTimeout(done, ms);
        const cancel = (): void => clearTimeout(id);
        cancels.add(cancel);
        waiters.add(done);
      });
    }

    const renderer: SceneRenderer<DiagonalIsFreeScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const current = next.step === null ? undefined : next.reached[next.step.index];
        const grew = prev === null || prev.reached.length < next.reached.length;
        if (!opts.animate || current === undefined || !grew) {
          draw(next, FULL);
          return;
        }
        const total = motionMs(current);
        const began = Date.now();
        draw(next, poseAt(current, 0));
        for (;;) {
          await wait(16);
          if (mine !== gen || destroyed) return;
          const ms = Date.now() - began;
          if (ms >= total) break;
          draw(next, poseAt(current, ms));
        }
        draw(next, FULL);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const cancel of cancels) cancel();
        cancels.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer as ViewInstance & SceneRenderer<DiagonalIsFreeScene>;
  },
};
