/**
 * extra-dimension-for-translate 의 무대.
 *
 * 왼쪽은 좌표 평면(y 가 위), 오른쪽 위는 옮김에서 만든 3×3 행렬, 오른쪽 아래는 점마다의 열.
 * 동사는 "붙어서 옮긴다" —
 *   lift     : 비어 있던 셋째 칸으로 1 이 올라와 붙는다
 *   multiply : 붙은 1 이 행렬의 셋째 열을 끌어온다. 셋째 열의 위 두 칸이 그 점의 x · y 칸으로 내려와
 *              더해지고, 평면의 점은 옮김만큼 미끄러진다. 처음 자리는 빈 고리로 남는다.
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
} from '@ffacet/core/runtime';
import type { Vec2, Vec3 } from './algorithm.js';
import type { ExtraDimensionForTranslateScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOTION_MS = 780;
const FLY_END = 0.45; // multiply: 셋째 열이 내려오는 몫, 나머지는 평면의 미끄러짐
const FRAME_MS = 16;

// 배치 상수는 상한 · 비율만 — 크기는 캔버스 폭에서 역산한다
const PAD = 16;
const CAPTION_Y = 26;
const SUB_Y = 48;
const CONTENT_TOP = 72;
const PLANE_SHARE = 0.52;
const UNIT_MAX = 52;

const CELL_W = 40;
const CELL_H = 28;

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  const v = Object.is(r, -0) ? 0 : r;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v < 0 ? `−${s.slice(1)}` : s;
}

type Pt = { x: number; y: number };

type Handles = {
  /** 셋째 칸의 1 (칸 무리) — 열 차례 */
  ones: SVGGElement[];
  /** 열마다 x · y 칸의 글자 */
  cellText: Map<string, [SVGTextElement, SVGTextElement]>;
  /** 평면의 점 · 이름 */
  dots: Map<string, { dot: SVGCircleElement; name: SVGTextElement; nameDx: number; nameDy: number }>;
  /** 이번 걸음의 옮김 자취 선 */
  trail: SVGLineElement | null;
  /** 행렬 칸 가운데 (행, 열) */
  matrixCell: (r: number, c: number) => Pt;
  /** 열 k 의 칸 가운데 */
  trayCell: (k: number, r: number) => Pt;
  /** 평면 좌표 → 화면 */
  toScreen: (v: Vec2) => Pt;
};

export const extraDimensionForTranslateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      fill: string,
      size: string,
      anchor: 'start' | 'middle' | 'end' = 'middle',
      weight: number = 400,
      family: string = fonts.body,
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        fill,
        'font-size': size,
        'font-family': family,
        'font-weight': weight,
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
      });
      node.textContent = content;
      return node;
    }

    function bracket(parent: Element, x: number, top: number, bottom: number, side: 'l' | 'r', stroke: string, width = 1.5): void {
      const d = side === 'l' ? 6 : -6;
      el(parent, 'path', {
        d: `M${x + d},${top} L${x},${top} L${x},${bottom} L${x + d},${bottom}`,
        fill: 'none',
        stroke,
        'stroke-width': width,
      });
    }

    function drawStatic(scene: ExtraDimensionForTranslateScene): Handles {
      svg.textContent = '';
      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      const step = scene.step;
      const activeId = step?.kind === 'multiply' ? step.id : null;
      const activeK = activeId === null ? -1 : scene.points.findIndex((p) => p.id === activeId);
      if (activeId !== null && activeK < 0) throw new Error(`stage: 바탕에 없는 점 '${activeId}'`);

      // ── 캡션 ──
      if (step === null) {
        label(svg, PAD, CAPTION_Y, t('caption.start', 'Shift ({dx}, {dy}) → third column of a 3×3 matrix', {
          dx: fmt(scene.offset[0]),
          dy: fmt(scene.offset[1]),
        }), colors.text, fontSizes.md, 'start', 600);
      } else if (step.kind === 'lift') {
        label(svg, PAD, CAPTION_Y, t('caption.lift', 'Attach a third entry 1 to every point: (x, y) → (x, y, 1)'),
          colors.text, fontSizes.md, 'start', 600);
      } else {
        label(svg, PAD, CAPTION_Y, t('caption.multiply', '{name}: ({x}, {y}, {w}) → ({nx}, {ny}, {nw})', {
          name: pointName(step.id),
          x: fmt(step.from[0]),
          y: fmt(step.from[1]),
          w: fmt(step.from[2]),
          nx: fmt(step.to[0]),
          ny: fmt(step.to[1]),
          nw: fmt(step.to[2]),
        }), colors.text, fontSizes.md, 'start', 600);
        label(svg, PAD, SUB_Y, t('caption.added', 'Third column × {w} = ({cx}, {cy}), added to x and y', {
          w: fmt(step.from[2]),
          cx: fmt(step.added[0]),
          cy: fmt(step.added[1]),
        }), colors.textMuted, fontSizes.sm, 'start');
      }

      // ── 평면 ──
      const planeLeft = PAD;
      const planeRight = Math.round(W * PLANE_SHARE);
      const planeW = planeRight - planeLeft;
      const planeH = H - PAD - CONTENT_TOP;
      const dots = new Map<string, { dot: SVGCircleElement; name: SVGTextElement; nameDx: number; nameDy: number }>();
      let trail: SVGLineElement | null = null;
      let toScreen: (v: Vec2) => Pt = () => {
        throw new Error('stage: 평면 범위가 아직 없다 (init 전)');
      };

      const b = scene.bounds;
      if (b !== null) {
        const unit = Math.min(UNIT_MAX, planeW / (b.maxX - b.minX), planeH / (b.maxY - b.minY));
        const gw = unit * (b.maxX - b.minX);
        const gh = unit * (b.maxY - b.minY);
        const ox = planeLeft + (planeW - gw) / 2;
        const oy = CONTENT_TOP + (planeH - gh) / 2;
        toScreen = (v) => ({ x: ox + (v[0] - b.minX) * unit, y: oy + (b.maxY - v[1]) * unit });

        const grid = el(svg, 'g', {});
        for (let gx = b.minX; gx <= b.maxX; gx += 1) {
          const a = toScreen([gx, b.minY]);
          const z = toScreen([gx, b.maxY]);
          el(grid, 'line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: colors.border, 'stroke-width': gx === 0 ? 1.5 : 0.6 });
        }
        for (let gy = b.minY; gy <= b.maxY; gy += 1) {
          const a = toScreen([b.minX, gy]);
          const z = toScreen([b.maxX, gy]);
          el(grid, 'line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: colors.border, 'stroke-width': gy === 0 ? 1.5 : 0.6 });
        }
        const xEnd = toScreen([b.maxX, 0]);
        const yEnd = toScreen([0, b.maxY]);
        label(svg, xEnd.x - 6, xEnd.y - 10, t('label.x', 'x'), colors.textMuted, fontSizes.sm, 'middle', 400, fonts.mono);
        label(svg, yEnd.x + 10, yEnd.y + 8, t('label.y', 'y'), colors.textMuted, fontSizes.sm, 'middle', 400, fonts.mono);
        const origin = toScreen([0, 0]);
        label(svg, origin.x - 8, origin.y + 12, '0', colors.textMuted, fontSizes.xs, 'middle', 400, fonts.mono);

        // 옮긴 점의 처음 자리와 자취
        scene.points.forEach((p, k) => {
          const to = scene.moved[k];
          if (to === null || to === undefined) return;
          const a = toScreen(p.at);
          const z = toScreen([to[0], to[1]]);
          const line = el(svg, 'line', {
            x1: a.x,
            y1: a.y,
            x2: z.x,
            y2: z.y,
            stroke: k === activeK ? colors.itemActive : colors.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          if (k === activeK) trail = line;
          el(svg, 'circle', { cx: a.x, cy: a.y, r: 5, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.2 });
        });

        scene.points.forEach((p, k) => {
          const to = scene.moved[k];
          const at: Vec2 = to === null || to === undefined ? p.at : [to[0], to[1]];
          const s = toScreen(at);
          const dot = el(svg, 'circle', {
            cx: s.x,
            cy: s.y,
            r: 6,
            fill: k === activeK ? colors.itemActive : colors.text,
            stroke: colors.bg,
            'stroke-width': 1.5,
          });
          const nameDx = -10;
          const nameDy = -12;
          const name = label(svg, s.x + nameDx, s.y + nameDy, pointName(p.id), colors.text, fontSizes.md, 'middle', 600, fonts.mono);
          dots.set(p.id, { dot, name, nameDx, nameDy });
        });
      }

      // ── 오른쪽: 행렬과 점의 열 ──
      const rightLeft = planeRight + PAD * 2;
      const rightW = W - PAD - rightLeft;
      const rightMid = rightLeft + rightW / 2;

      const mLeft = rightMid - (CELL_W * 3) / 2;
      const mTop = CONTENT_TOP + 4;
      const matrixCell = (r: number, c: number): Pt => ({ x: mLeft + CELL_W * (c + 0.5), y: mTop + CELL_H * (r + 0.5) });

      const n = scene.points.length;
      const colGap = Math.min(CELL_W * 2, rightW / n);
      const trayTop = mTop + CELL_H * 3 + 64;
      const trayCell = (k: number, r: number): Pt => ({
        x: rightMid + (k - (n - 1) / 2) * colGap,
        y: trayTop + CELL_H * (r + 0.5),
      });

      const m = scene.matrix;
      if (m !== null) {
        // 셋째 열의 띠 — 붙은 1 이 끌어오는 자리
        el(svg, 'rect', {
          x: mLeft + CELL_W * 2 + 2,
          y: mTop + 1,
          width: CELL_W - 4,
          height: CELL_H * 3 - 2,
          rx: 4,
          fill: activeK >= 0 ? colors.accent : colors.bgSubtle,
        });
        bracket(svg, mLeft - 2, mTop, mTop + CELL_H * 3, 'l', colors.text);
        bracket(svg, mLeft + CELL_W * 3 + 2, mTop, mTop + CELL_H * 3, 'r', colors.text);
        for (let r = 0; r < 3; r += 1) {
          const row = m[r] as Vec3;
          for (let c = 0; c < 3; c += 1) {
            const pc = matrixCell(r, c);
            const onBand = c === 2 && activeK >= 0;
            label(svg, pc.x, pc.y, fmt(row[c] as number), onBand ? colors.stateInk : colors.text, fontSizes.md,
              'middle', c === 2 ? 700 : 400, fonts.mono);
          }
        }
      }

      const ones: SVGGElement[] = [];
      const cellText = new Map<string, [SVGTextElement, SVGTextElement]>();
      scene.points.forEach((p, k) => {
        const top = trayCell(k, 0).y - CELL_H / 2;
        const cx = trayCell(k, 0).x;
        const active = k === activeK;
        const ink = active ? colors.itemActive : colors.text;
        label(svg, cx, top - 14, pointName(p.id), ink, fontSizes.md, 'middle', 600, fonts.mono);
        bracket(svg, cx - CELL_W / 2, top, top + CELL_H * 3, 'l', ink, active ? 2 : 1.5);
        bracket(svg, cx + CELL_W / 2, top, top + CELL_H * 3, 'r', ink, active ? 2 : 1.5);

        const to = scene.moved[k];
        const vx = to === null || to === undefined ? p.at[0] : to[0];
        const vy = to === null || to === undefined ? p.at[1] : to[1];
        const tx = label(svg, cx, trayCell(k, 0).y, fmt(vx), colors.text, fontSizes.md, 'middle', 400, fonts.mono);
        const ty = label(svg, cx, trayCell(k, 1).y, fmt(vy), colors.text, fontSizes.md, 'middle', 400, fonts.mono);
        cellText.set(p.id, [tx, ty]);

        const third = trayCell(k, 2);
        if (!scene.lifted) {
          el(svg, 'rect', {
            x: third.x - CELL_W / 2 + 5,
            y: third.y - CELL_H / 2 + 3,
            width: CELL_W - 10,
            height: CELL_H - 6,
            rx: 3,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-dasharray': '3 3',
          });
        } else {
          const g = el(svg, 'g', {});
          el(g, 'rect', {
            x: third.x - CELL_W / 2 + 5,
            y: third.y - CELL_H / 2 + 3,
            width: CELL_W - 10,
            height: CELL_H - 6,
            rx: 3,
            fill: colors.accent,
          });
          const w = to === null || to === undefined ? 1 : to[2];
          label(g, third.x, third.y, fmt(w), colors.stateInk, fontSizes.md, 'middle', 700, fonts.mono);
          ones.push(g);
        }
      });

      // 이번 걸음: 붙은 1 과 셋째 열을 잇는 끈
      if (activeK >= 0 && m !== null) {
        const one = trayCell(activeK, 2);
        const bandBottom: Pt = { x: matrixCell(2, 2).x, y: mTop + CELL_H * 3 };
        const sideX = one.x + CELL_W / 2 + 10;
        el(svg, 'path', {
          d: `M${one.x + CELL_W / 2 - 4},${one.y} L${sideX},${one.y} L${sideX},${bandBottom.y + 14} L${bandBottom.x},${bandBottom.y + 14} L${bandBottom.x},${bandBottom.y}`,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
          'stroke-dasharray': '5 3',
        });
      }

      return { ones, cellText, dots, trail, matrixCell, trayCell, toScreen };
    }

    function pointName(id: string): string {
      switch (id) {
        case 'o':
          return t('label.o', 'o');
        case 'p':
          return t('label.p', 'p');
        case 'q':
          return t('label.q', 'q');
        default:
          throw new Error(`stage: 이름 문안이 없는 점 '${id}'`);
      }
    }

    function frames(mine: number, draw: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let i = 0;
        const total = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          i += 1;
          const u = Math.min(1, i / total);
          draw(u);
          if (u >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

    async function animateLift(h: Handles, mine: number): Promise<void> {
      if (h.ones.length === 0) throw new Error('stage: 붙일 셋째 칸이 없다');
      const rise = CELL_H * 1.6;
      const place = (u: number): void => {
        const e = ease(u);
        for (const g of h.ones) {
          g.setAttribute('transform', `translate(0 ${fmt2((1 - e) * rise)})`);
          g.setAttribute('opacity', fmt2(Math.min(1, u * 2)));
        }
      };
      place(0);
      await frames(mine, place);
    }

    async function animateMultiply(
      h: Handles,
      step: { id: string; from: Vec3; to: Vec3; added: Vec2 },
      k: number,
      mine: number,
    ): Promise<void> {
      const cells = h.cellText.get(step.id);
      const dot = h.dots.get(step.id);
      if (cells === undefined) throw new Error(`stage: 열 '${step.id}' 의 칸이 없다`);
      if (dot === undefined) throw new Error(`stage: 평면의 점 '${step.id}' 가 없다`);
      if (h.trail === null) throw new Error(`stage: 점 '${step.id}' 의 자취 선이 없다`);
      const trail = h.trail;

      const flyers: { node: SVGTextElement; from: Pt; to: Pt }[] = [0, 1].map((r) => {
        const from = h.matrixCell(r, 2);
        const to = h.trayCell(k, r);
        const node = label(svg, from.x, from.y, fmt(step.added[r] as number), colors.itemActive, fontSizes.md,
          'middle', 700, fonts.mono);
        return { node, from, to };
      });

      const a = h.toScreen([step.from[0], step.from[1]]);
      const z = h.toScreen([step.to[0], step.to[1]]);

      const draw = (u: number): void => {
        const fu = ease(Math.min(1, u / FLY_END));
        const landed = u >= FLY_END;
        for (const f of flyers) {
          f.node.setAttribute('x', fmt2(f.from.x + (f.to.x - f.from.x) * fu));
          f.node.setAttribute('y', fmt2(f.from.y + (f.to.y - f.from.y) * fu - Math.sin(Math.PI * fu) * 18));
          f.node.setAttribute('opacity', landed ? '0' : '1');
        }
        cells[0].textContent = fmt(landed ? step.to[0] : step.from[0]);
        cells[1].textContent = fmt(landed ? step.to[1] : step.from[1]);

        const su = landed ? ease((u - FLY_END) / (1 - FLY_END)) : 0;
        const px = a.x + (z.x - a.x) * su;
        const py = a.y + (z.y - a.y) * su;
        dot.dot.setAttribute('cx', fmt2(px));
        dot.dot.setAttribute('cy', fmt2(py));
        dot.name.setAttribute('x', fmt2(px + dot.nameDx));
        dot.name.setAttribute('y', fmt2(py + dot.nameDy));
        trail.setAttribute('x2', fmt2(px));
        trail.setAttribute('y2', fmt2(py));
      };
      draw(0);
      await frames(mine, draw);
    }

    function fmt2(n: number): string {
      const r = Math.round(n * 100) / 100;
      return String(Object.is(r, -0) ? 0 : r);
    }

    async function render(
      next: ExtraDimensionForTranslateScene,
      prev: ExtraDimensionForTranslateScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const handles = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null || prev === next) return;

      if (step.kind === 'lift') {
        await animateLift(handles, mine);
      } else {
        const k = next.points.findIndex((p) => p.id === step.id);
        if (k < 0) throw new Error(`stage: 바탕에 없는 점 '${step.id}'`);
        await animateMultiply(handles, step, k, mine);
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
