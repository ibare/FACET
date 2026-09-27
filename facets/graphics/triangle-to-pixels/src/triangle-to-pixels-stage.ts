/**
 * triangle-to-pixels-stage — 격자 위의 삼각형이 행씩 칠해진다.
 *
 * 훑는 막대가 이번 행을 왼쪽에서 오른쪽으로 지나가고, 막대가 칸의 중심을 넘는 순간
 * 그 중심이 세 모서리 모두의 안쪽이면 칸이 중심에서부터 부풀어 찬다. 밖인 중심에는
 * 그 중심을 밖으로 가른 모서리의 색으로 고리가 선다. 오른쪽 셈 칸에 행마다 칠한 수가
 * 쌓이고, 그 합이 삼각형 넓이 옆에 선다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance } from '@ffacet/core/runtime';
import { EDGE_IDS, edgeEnds } from './algorithm.js';
import type { EdgeId } from './algorithm.js';
import type { RowOutcome, TriangleToPixelsScene } from './scene.js';

const H = 420;
const TOP = 24;
const LEFT = 28;
const TALLY_W = 92;
const BOTTOM_ROOM = 62;
const MAX_CELL = 48;
const SWEEP_MS = 480;
const FRAME_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);

interface Geometry {
  s: number;
  x0: number;
  y0: number;
  tallyX: number;
  bottom: number;
}

function geometry(scene: TriangleToPixelsScene): Geometry {
  const byWidth = (PIECE_CANVAS_W - LEFT - TALLY_W - 8) / scene.cols;
  const byHeight = (H - TOP - BOTTOM_ROOM) / scene.rows;
  const s = Math.min(MAX_CELL, byWidth, byHeight);
  const x0 = LEFT;
  const y0 = TOP;
  return { s, x0, y0, tallyX: x0 + scene.cols * s + 16, bottom: y0 + scene.rows * s };
}

function r2(v: number): string {
  const out = v.toFixed(2);
  return out === '-0.00' ? '0.00' : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function writeText(
  parent: Element,
  x: number,
  y: number,
  body: string,
  size: number,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
  mono: boolean,
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r2(x),
    y: r2(y),
    fill,
    'font-size': size,
    'font-family': mono ? fonts.mono : fonts.body,
    'text-anchor': anchor,
    'dominant-baseline': 'middle',
  });
  node.textContent = body;
  return node;
}

function edgeColors(): Record<EdgeId, string> {
  const hues = categorical(3, 'vivid');
  const pick = (i: number): string => {
    const c = hues[i];
    if (c === undefined) throw new Error(`triangle-to-pixels-stage: 모서리 색 ${i} 이 없다`);
    return c;
  };
  return { BC: pick(0), CA: pick(1), AB: pick(2) };
}

/** 이번 걸음에 흘릴 것 — 훑는 행 하나. 운동 도중 매 프레임 이 손잡이의 속성만 고친다. */
interface SweepHandles {
  cursor: SVGLineElement;
  cells: Array<{ node: SVGRectElement; cx: number; cy: number }>;
  rings: Array<{ node: SVGCircleElement; cx: number; r: number }>;
  count: SVGTextElement;
  /** 합 글자와, 운동 동안 보일 이번 행 앞의 누적 (장면의 자취에서 온다). */
  total: SVGTextElement;
  totalBefore: number;
}

export const triangleToPixelsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const edgeInk = edgeColors();

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 격자의 점 · 칸 위에서도 글자가 읽히게 바탕색 테를 두른다. */
    function halo(node: SVGTextElement): void {
      node.setAttribute('stroke', colors.bg);
      node.setAttribute('stroke-width', '3');
      node.setAttribute('paint-order', 'stroke');
      node.setAttribute('font-weight', '600');
    }

    function drawStatic(scene: TriangleToPixelsScene): SweepHandles | null {
      svg.textContent = '';
      const g = geometry(scene);
      const { s, x0, y0 } = g;
      const px = (x: number): number => x0 + x * s;
      const py = (y: number): number => y0 + y * s;
      const current = scene.step.kind === 'row' ? scene.step.row : null;
      const byRow = new Map<number, RowOutcome>();
      for (const r of scene.scanned) byRow.set(r.row, r);

      // 이번 행의 띠
      if (current !== null) {
        el(svg, 'rect', {
          x: r2(x0 - 4),
          y: r2(py(current)),
          width: r2(scene.cols * s + 8),
          height: r2(s),
          fill: colors.bgSubtle,
        });
      }

      // 열 · 행 번호
      for (let c = 0; c < scene.cols; c += 1) {
        writeText(svg, px(c + 0.5), y0 - 11, String(c), XS, colors.textMuted, 'middle', true);
      }
      for (let r = 0; r < scene.rows; r += 1) {
        writeText(svg, x0 - 10, py(r + 0.5), String(r), XS, r === current ? colors.text : colors.textMuted, 'end', true);
      }

      // 칸 — 칠한 칸은 중심을 축으로 부풀 수 있게 따로 둔다
      const handles: SweepHandles['cells'] = [];
      for (let r = 0; r < scene.rows; r += 1) {
        const outcome = byRow.get(r);
        for (let c = 0; c < scene.cols; c += 1) {
          el(svg, 'rect', {
            x: r2(px(c)),
            y: r2(py(r)),
            width: r2(s),
            height: r2(s),
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
          });
          const cell = outcome?.cells[c];
          if (outcome !== undefined && cell === undefined) {
            throw new Error(`triangle-to-pixels-stage: 행 ${r} 에 열 ${c} 의 결과가 없다`);
          }
          if (cell !== undefined && cell.inside) {
            const node = el(svg, 'rect', {
              x: r2(px(c) + 1),
              y: r2(py(r) + 1),
              width: r2(s - 2),
              height: r2(s - 2),
              fill: colors.accent,
            });
            if (r === current) handles.push({ node, cx: px(c + 0.5), cy: py(r + 0.5) });
          }
        }
      }

      // 삼각형 — 모서리마다 제 색
      const verts = scene.vertices;
      const gx = verts.reduce((a, v) => a + v.x, 0) / verts.length;
      const gy = verts.reduce((a, v) => a + v.y, 0) / verts.length;
      for (const edge of EDGE_IDS) {
        const [a, b] = edgeEnds(verts, edge);
        el(svg, 'line', {
          x1: r2(px(a.x)),
          y1: r2(py(a.y)),
          x2: r2(px(b.x)),
          y2: r2(py(b.y)),
          stroke: edgeInk[edge],
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
        // 이름은 모서리 가운데에서 모서리에 수직으로, 무게중심 반대쪽으로 비켜 선다
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len === 0) throw new Error(`triangle-to-pixels-stage: 모서리 ${edge} 의 길이가 0 이다`);
        let nx = -(b.y - a.y) / len;
        let ny = (b.x - a.x) / len;
        if (nx * (mx - gx) + ny * (my - gy) < 0) {
          nx = -nx;
          ny = -ny;
        }
        const off = 0.5;
        halo(writeText(svg, px(mx + nx * off), py(my + ny * off), edge, SM, edgeInk[edge], 'middle', true));
      }
      for (const v of verts) {
        el(svg, 'circle', { cx: r2(px(v.x)), cy: r2(py(v.y)), r: 3.5, fill: colors.text });
        const dx = v.x - gx;
        const dy = v.y - gy;
        const len = Math.hypot(dx, dy);
        if (len === 0) throw new Error(`triangle-to-pixels-stage: 꼭짓점 ${v.id} 가 무게중심과 겹친다`);
        const off = 0.42;
        halo(writeText(svg, px(v.x + (dx / len) * off), py(v.y + (dy / len) * off), v.id, SM, colors.text, 'middle', false));
      }

      // 중심 — 훑은 행은 가른 결과대로, 밖이면 이번 행에서만 가른 모서리의 고리
      const rings: SweepHandles['rings'] = [];
      for (let r = 0; r < scene.rows; r += 1) {
        const outcome = byRow.get(r);
        for (let c = 0; c < scene.cols; c += 1) {
          const cx = px(c + 0.5);
          const cy = py(r + 0.5);
          const cell = outcome?.cells[c];
          if (cell === undefined) {
            el(svg, 'circle', { cx: r2(cx), cy: r2(cy), r: 1.6, fill: colors.textMuted });
            continue;
          }
          if (cell.inside) {
            el(svg, 'circle', { cx: r2(cx), cy: r2(cy), r: 2.4, fill: colors.stateInk });
            continue;
          }
          el(svg, 'circle', { cx: r2(cx), cy: r2(cy), r: 1.8, fill: colors.textMuted });
          if (r !== current) continue;
          cell.fails.forEach((edge, i) => {
            const radius = 5.5 + i * 3;
            const node = el(svg, 'circle', {
              cx: r2(cx),
              cy: r2(cy),
              r: radius,
              fill: 'none',
              stroke: edgeInk[edge],
              'stroke-width': 1.6,
            });
            rings.push({ node, cx, r: radius });
          });
        }
      }

      // 셈 칸 — 행마다 칠한 수, 그 합과 넓이
      const tallyRight = g.tallyX + TALLY_W - 20;
      writeText(svg, tallyRight, y0 - 11, t('label.filled', 'Filled'), XS, colors.textMuted, 'end', false);
      let countNode: SVGTextElement | null = null;
      for (const r of scene.scanned) {
        const node = writeText(
          svg,
          tallyRight,
          py(r.row + 0.5),
          String(r.count),
          SM,
          r.row === current ? colors.text : colors.textMuted,
          'end',
          true,
        );
        if (r.row === current) countNode = node;
      }
      const last = scene.scanned.length > 0 ? scene.scanned[scene.scanned.length - 1] : undefined;
      el(svg, 'line', {
        x1: r2(g.tallyX),
        y1: r2(g.bottom + 4),
        x2: r2(tallyRight),
        y2: r2(g.bottom + 4),
        stroke: colors.border,
        'stroke-width': 1,
      });
      writeText(svg, g.tallyX, g.bottom + 18, t('label.total', 'Total'), XS, colors.textMuted, 'start', false);
      let totalNode: SVGTextElement | null = null;
      if (last !== undefined) {
        totalNode = writeText(svg, tallyRight, g.bottom + 18, String(last.total), SM, colors.text, 'end', true);
      }
      if (scene.area2 !== null) {
        writeText(svg, g.tallyX, g.bottom + 36, t('label.area', 'Area'), XS, colors.textMuted, 'start', false);
        writeText(svg, tallyRight, g.bottom + 36, r2(scene.area2 / 2), SM, colors.text, 'end', true);
      }

      // 캡션 — 지금 일어난 일만
      const capY = g.bottom + 20;
      const lines: string[] = [];
      const step = scene.step;
      if (step.kind === 'start') {
        lines.push(
          t('caption.start', 'Triangle ABC on a {cols} × {rows} pixel grid. Each pixel is judged by one point, its center.', {
            cols: scene.cols,
            rows: scene.rows,
          }),
        );
      } else {
        const r = byRow.get(step.row);
        if (r === undefined) throw new Error(`triangle-to-pixels-stage: 이번 행 ${step.row} 의 결과가 없다`);
        if (r.from === null || r.to === null) {
          lines.push(t('caption.rowEmpty', 'Row {row}: no center lies inside all three edges. Filled: 0.', { row: r.row }));
        } else if (r.from === r.to) {
          lines.push(
            t('caption.rowOne', 'Row {row}: the only center inside all three edges is at column {col}. Filled: 1.', {
              row: r.row,
              col: r.from,
            }),
          );
        } else {
          lines.push(
            t('caption.row', 'Row {row}: centers inside all three edges at columns {from}..{to}. Filled: {count}.', {
              row: r.row,
              from: r.from,
              to: r.to,
              count: r.count,
            }),
          );
        }
        if (r.row === scene.rows - 1) {
          if (scene.area2 === null) throw new Error('triangle-to-pixels-stage: 넓이 없이 끝 행에 왔다');
          lines.push(
            t('caption.end', 'Rows scanned: {rows}. Filled: {total} · Triangle area: {area}', {
              rows: scene.rows,
              total: r.total,
              area: r2(scene.area2 / 2),
            }),
          );
        } else {
          lines.push(
            t('caption.rejected', 'Centers outside: {out}. Each ring takes the colour of an edge that center falls outside.', {
              out: scene.cols - r.count,
            }),
          );
        }
      }
      lines.forEach((line, i) => {
        writeText(svg, x0, capY + i * (SM + 6), line, i === 0 ? SM : XS, i === 0 ? colors.text : colors.textMuted, 'start', false);
      });

      if (current === null) return null;
      const cursor = el(svg, 'line', {
        x1: r2(x0),
        y1: r2(py(current) - 3),
        x2: r2(x0),
        y2: r2(py(current + 1) + 3),
        stroke: colors.itemActive,
        'stroke-width': 2,
        visibility: 'hidden',
      });
      if (countNode === null) throw new Error(`triangle-to-pixels-stage: 행 ${current} 의 셈 글자가 없다`);
      if (totalNode === null) throw new Error(`triangle-to-pixels-stage: 행 ${current} 의 합 글자가 없다`);
      const earlier = scene.scanned.filter((r) => r.row < current);
      const totalBefore = earlier.length > 0 ? earlier[earlier.length - 1].total : 0;
      return { cursor, cells: handles, rings, count: countNode, total: totalNode, totalBefore };
    }

    /** 막대가 x 까지 왔을 때의 모습 — 아직 못 온 만큼 줄여 그린다. */
    function frame(h: SweepHandles, x: number, s: number): void {
      h.cursor.setAttribute('x1', r2(x));
      h.cursor.setAttribute('x2', r2(x));
      h.cursor.removeAttribute('visibility');
      for (const c of h.cells) {
        const k = Math.max(0, Math.min(1, (x - c.cx) / (s * 0.5)));
        c.node.setAttribute(
          'transform',
          `translate(${r2(c.cx)} ${r2(c.cy)}) scale(${k.toFixed(3)}) translate(${r2(-c.cx)} ${r2(-c.cy)})`,
        );
      }
      for (const ring of h.rings) {
        const k = Math.max(0, Math.min(1, (x - ring.cx) / (s * 0.5)));
        ring.node.setAttribute('r', r2(ring.r * k));
      }
      h.count.setAttribute('visibility', 'hidden');
      h.total.textContent = String(h.totalBefore);
    }

    async function sweep(scene: TriangleToPixelsScene, h: SweepHandles, mine: number): Promise<void> {
      const g = geometry(scene);
      const start = g.x0;
      const end = g.x0 + scene.cols * g.s;
      const frames = Math.max(1, Math.round(SWEEP_MS / FRAME_MS));
      frame(h, start, g.s);
      for (let i = 1; i <= frames; i += 1) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        frame(h, start + ((end - start) * i) / frames, g.s);
      }
    }

    return {
      async render(next: TriangleToPixelsScene, prev: TriangleToPixelsScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        const advanced = prev !== null && next.scanned.length === prev.scanned.length + 1;
        if (!opts.animate || handles === null || !advanced) return;
        await sweep(next, handles, mine);
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
  },
};
