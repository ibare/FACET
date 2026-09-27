/**
 * inverse-undoes 무대.
 *
 * 왼쪽은 좌표평면. 점마다 처음 자리에 빈 고리가 박혀 있고, 점이 떠나면 고리와 점 사이에
 * 줄이 당겨진다. A⁻¹ 가 걸리면 점이 그 줄을 되감으며 고리 안으로 들어가 줄이 사라진다.
 * 오른쪽은 행렬 칸. A⁻¹ 를 셈하는 걸음에서는 A 의 칸이 날아와 자리를 바꾸고(a ↔ d)
 * 부호를 뒤집어(b · c) 앉는다. 마지막 걸음에서는 A⁻¹ 와 A 가 한 자리로 모여 한 행렬이 된다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatNum, formatPt, type M, type Pt } from './algorithm.js';
import { inverseUndoesScene, type InverseUndoesScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 평면이 담는 좌표의 절댓값 상한. 이 밖의 점은 던진다 (자르지 않는다). */
const EXTENT = 6;
const MOVE_MS = 400;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
}

export const inverseUndoesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const dotColors = categorical(3, params.theme === 'dark' ? 'vivid' : 'deep');

    // 평면 — 캔버스에서 역산한다
    const TOP = 48;
    const planeSize = Math.min(H - TOP - 12, Math.round(PIECE_CANVAS_W * 0.56));
    const planeX = 16;
    const planeY = TOP;
    const unit = planeSize / (2 * EXTENT);
    const ox = planeX + planeSize / 2;
    const oy = planeY + planeSize / 2;
    const sx = (x: number): number => r2(ox + x * unit);
    const sy = (y: number): number => r2(oy - y * unit);

    // 행렬 칸 — 평면 오른쪽 남은 폭
    const panelX = planeX + planeSize + 24;
    const panelW = PIECE_CANVAS_W - panelX - 12;
    const fs = parseFloat(fontSizes.md);
    const fsSm = parseFloat(fontSizes.sm);
    const rowH = fs + 8;
    const narrowCell = Math.round(Math.min(30, panelW / 8));
    const wideCell = Math.round(Math.min(38, panelW / 6));
    const rowAY = TOP + 40;
    const rowInvY = TOP + 150;
    const rowProdY = TOP + 280;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function color(i: number): string {
      const c = dotColors[i];
      if (c === undefined) throw new Error(`inverse-undoes 무대: 점 ${i} 의 색이 없다 (점은 셋이다)`);
      return c;
    }

    function checkInside(p: Pt): void {
      if (Math.abs(p[0]) > EXTENT || Math.abs(p[1]) > EXTENT) {
        throw new Error(`inverse-undoes 무대: 점 ${formatPt(p)} 이 평면 밖이다 (상한 ${EXTENT})`);
      }
    }

    /** 칸 넷을 대괄호 안에 그린다. 칸의 가운데 자리를 돌려준다. */
    function drawMatrix(
      parent: Element,
      x: number,
      cy: number,
      cells: readonly string[],
      cellW: number,
      ink: string,
    ): { width: number; centers: Array<[number, number]> } {
      const h = rowH * 2;
      const top = cy - h / 2;
      const w = cellW * 2 + 12;
      const bracket = (bx: number, dir: 1 | -1): void => {
        el(parent, 'path', {
          d: `M ${r2(bx + 5 * dir)} ${r2(top)} L ${r2(bx)} ${r2(top)} L ${r2(bx)} ${r2(top + h)} L ${r2(bx + 5 * dir)} ${r2(top + h)}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        });
      };
      bracket(x + 1, 1);
      bracket(x + w - 1, -1);
      const centers: Array<[number, number]> = [];
      cells.forEach((c, k) => {
        const cx = r2(x + 6 + cellW * (k % 2) + cellW / 2);
        const cyy = r2(top + rowH * Math.floor(k / 2) + rowH / 2);
        centers.push([cx, cyy]);
        el(
          parent,
          'text',
          {
            x: cx,
            y: cyy,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fs,
            fill: ink,
          },
          c,
        );
      });
      return { width: w, centers };
    }

    function label(parent: Element, x: number, y: number, s: string, anchor = 'start'): SVGTextElement {
      return el(
        parent,
        'text',
        {
          x: r2(x),
          y: r2(y),
          'text-anchor': anchor,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fs,
          fill: colors.text,
        },
        s,
      );
    }

    /** 고정폭 글꼴의 글자 폭 — 글자 수에서 셈한다 (화면 글자를 도로 재지 않는다). */
    const monoW = (s: string): number => r2(fs * 0.6 * [...s].length);

    const cellsOf = (m: M): string[] => m.map((v) => formatNum(v));

    function captionOf(s: InverseUndoesScene): string {
      const total = s.homes.length;
      switch (s.step.kind) {
        case 'start':
          return t('caption.start', 'Start — points at their place: {n}', { n: total });
        case 'leave': {
          if (s.away === null) throw new Error('inverse-undoes 무대: leave 걸음에 away 가 없다');
          return t('caption.leave', 'After A — points that left their place: {n} / {total}', {
            n: s.away,
            total,
          });
        }
        case 'invert': {
          if (s.inverse === null) throw new Error('inverse-undoes 무대: invert 걸음에 역행렬이 없다');
          return t('caption.invert', 'Computing A⁻¹ — det A = ad − bc = {det}', {
            det: formatNum(s.inverse.det),
          });
        }
        case 'return': {
          if (s.back === null) throw new Error('inverse-undoes 무대: return 걸음에 결과가 없다');
          return t(
            'caption.return',
            'After A⁻¹ — points back at their place: {n} / {total} · distance left: {d}',
            { n: s.back.home, total, d: formatNum(s.back.residual) },
          );
        }
        case 'compose': {
          if (s.product === null) throw new Error('inverse-undoes 무대: compose 걸음에 곱이 없다');
          return t('caption.compose', 'A⁻¹A as one matrix — points it moves: {n} / {total}', {
            n: s.product.moved,
            total,
          });
        }
      }
    }

    type Handles = {
      dots: SVGCircleElement[];
      tethers: SVGLineElement[];
      coordLabels: SVGTextElement[];
      invGroup: SVGGElement;
      adjCenters: Array<[number, number]>;
      adjCellsLayer: SVGGElement;
      aCenters: Array<[number, number]>;
      invCenters: Array<[number, number]>;
      prodGroup: SVGGElement;
      prodCenters: Array<[number, number]>;
    };

    function drawStatic(s: InverseUndoesScene): Handles {
      svg.textContent = '';
      el(svg, 'rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg });

      el(
        svg,
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: 24,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fs,
          fill: colors.text,
        },
        captionOf(s),
      );

      // 격자와 축
      const plane = el(svg, 'g', {});
      for (let k = -EXTENT; k <= EXTENT; k += 1) {
        const axis = k === 0;
        const stroke = axis ? colors.textMuted : colors.border;
        const sw = axis ? 1.2 : 0.6;
        el(plane, 'line', { x1: sx(k), y1: sy(-EXTENT), x2: sx(k), y2: sy(EXTENT), stroke, 'stroke-width': sw });
        el(plane, 'line', { x1: sx(-EXTENT), y1: sy(k), x2: sx(EXTENT), y2: sy(k), stroke, 'stroke-width': sw });
      }

      // 처음 자리의 고리 · 줄 · 점
      const tethers: SVGLineElement[] = [];
      const dots: SVGCircleElement[] = [];
      const coordLabels: SVGTextElement[] = [];
      s.homes.forEach((h, i) => {
        checkInside(h);
        const p = s.pos[i];
        if (p === undefined) throw new Error(`inverse-undoes 무대: 점 ${i} 의 지금 자리가 없다`);
        checkInside(p);
        const c = color(i);
        // 돌아왔는지는 장면(알고리즘의 판정)만 읽는다. 떠나기 전(away 가 없음)에는 줄이 없다.
        const back = s.back === null ? false : s.back.homeFlags[i];
        if (back === undefined) throw new Error(`inverse-undoes 무대: 점 ${i} 의 homeFlags 가 없다`);
        const tetherHidden = s.away === null || back;
        if (back) {
          el(plane, 'circle', {
            cx: sx(h[0]),
            cy: sy(h[1]),
            r: 12,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 3,
          });
        }
        el(plane, 'circle', {
          cx: sx(h[0]),
          cy: sy(h[1]),
          r: 8,
          fill: colors.bg,
          stroke: c,
          'stroke-width': 2,
        });
        const line = el(plane, 'line', {
          x1: sx(h[0]),
          y1: sy(h[1]),
          x2: sx(p[0]),
          y2: sy(p[1]),
          stroke: c,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
        if (tetherHidden) line.setAttribute('visibility', 'hidden');
        tethers.push(line);
        dots.push(el(plane, 'circle', { cx: sx(p[0]), cy: sy(p[1]), r: 5, fill: c }));
        coordLabels.push(
          el(
            plane,
            'text',
            {
              // 아래 반평면의 점은 글자를 밑에, 나머지는 위에 — 줄 · 고리와 겹치지 않게
              x: sx(p[0]),
              y: r2(sy(p[1]) + (p[1] < 0 ? 24 : -21)),
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fsSm,
              fill: c,
            },
            formatPt(p),
          ),
        );
      });

      // 행렬 칸
      const panel = el(svg, 'g', {});
      label(panel, panelX, rowAY, 'A =');
      const aX = panelX + monoW('A =') + 10;
      const aMat = drawMatrix(panel, aX, rowAY, cellsOf(s.matrix), narrowCell, colors.text);

      const invGroup = el(svg, 'g', {});
      let adjCenters: Array<[number, number]> = [];
      let invCenters: Array<[number, number]> = [];
      const adjCellsLayer = el(invGroup, 'g', {});
      if (s.inverse !== null) {
        const inv = s.inverse;
        label(invGroup, panelX, rowInvY - rowH * 1.6, 'A⁻¹ =');
        const frac = `1/${formatNum(inv.det)} ·`;
        label(invGroup, panelX, rowInvY, frac);
        const adjX = panelX + monoW(frac) + 8;
        const adj = drawMatrix(adjCellsLayer, adjX, rowInvY, cellsOf(inv.adj), narrowCell, colors.text);
        adjCenters = adj.centers;
        const eqX = adjX + adj.width + 10;
        label(invGroup, eqX, rowInvY, '=');
        const invM = drawMatrix(invGroup, eqX + fs, rowInvY, cellsOf(inv.inv), wideCell, colors.text);
        invCenters = invM.centers;
      }

      const prodGroup = el(svg, 'g', {});
      let prodCenters: Array<[number, number]> = [];
      if (s.product !== null) {
        label(prodGroup, panelX, rowProdY, 'A⁻¹A =');
        const px = panelX + monoW('A⁻¹A =') + 10;
        prodCenters = drawMatrix(prodGroup, px, rowProdY, cellsOf(s.product.m), narrowCell, colors.text).centers;
      }

      return {
        dots,
        tethers,
        coordLabels,
        invGroup,
        adjCenters,
        adjCellsLayer,
        aCenters: aMat.centers,
        invCenters,
        prodGroup,
        prodCenters,
      };
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

    /** 한 시계로 u 를 0 → 1 로 흘린다. 도중에 세대가 바뀌면 멈춘다. */
    async function run(mine: number, frame: (u: number) => void): Promise<boolean> {
      const steps = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
      for (let k = 1; k <= steps; k += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return false;
        frame(ease(k / steps));
      }
      return true;
    }

    function floating(x: number, y: number, s: string): SVGTextElement {
      return el(
        svg,
        'text',
        {
          x: r2(x),
          y: r2(y),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fs,
          fill: colors.text,
        },
        s,
      );
    }

    async function moveDots(mine: number, hd: Handles, from: Pt[], to: Pt[]): Promise<boolean> {
      const place = (u: number): void => {
        from.forEach((f, i) => {
          const g = to[i];
          const dot = hd.dots[i];
          const line = hd.tethers[i];
          if (g === undefined || dot === undefined || line === undefined) {
            throw new Error(`inverse-undoes 무대: 점 ${i} 의 손잡이가 없다`);
          }
          const x = f[0] + (g[0] - f[0]) * u;
          const y = f[1] + (g[1] - f[1]) * u;
          dot.setAttribute('cx', String(sx(x)));
          dot.setAttribute('cy', String(sy(y)));
          line.setAttribute('x2', String(sx(x)));
          line.setAttribute('y2', String(sy(y)));
          line.removeAttribute('visibility');
        });
      };
      for (const lbl of hd.coordLabels) lbl.setAttribute('visibility', 'hidden');
      place(0);
      return run(mine, place);
    }

    async function flyCells(
      mine: number,
      starts: Array<[number, number]>,
      ends: Array<[number, number]>,
      texts: string[],
    ): Promise<boolean> {
      if (starts.length !== ends.length || starts.length !== texts.length) {
        throw new Error('inverse-undoes 무대: 날아갈 칸의 수가 맞지 않는다');
      }
      const nodes = texts.map((s, k) => floating(starts[k]![0], starts[k]![1], s));
      return run(mine, (u) => {
        nodes.forEach((n, k) => {
          const a = starts[k]!;
          const b = ends[k]!;
          n.setAttribute('x', String(r2(a[0] + (b[0] - a[0]) * u)));
          n.setAttribute('y', String(r2(a[1] + (b[1] - a[1]) * u)));
        });
      });
    }

    async function render(
      next: InverseUndoesScene,
      _prev: InverseUndoesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const hd = drawStatic(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;
      let done = true;
      if (step.kind === 'leave' || step.kind === 'return') {
        done = await moveDots(mine, hd, step.from, next.pos);
      } else if (step.kind === 'invert') {
        // A 의 칸이 날아와 딸림 행렬의 자리에 앉는다: a → 오른쪽 아래, d → 왼쪽 위, b · c 는 제자리.
        const inv = next.inverse;
        if (inv === null) throw new Error('inverse-undoes 무대: invert 걸음에 역행렬이 없다');
        const order = [3, 1, 2, 0]; // adj 칸 k 는 A 의 칸 order[k] 에서 온다
        const starts = order.map((j) => hd.aCenters[j]!);
        const texts = order.map((j) => formatNum(next.matrix[j]!));
        hd.invGroup.setAttribute('visibility', 'hidden');
        done = await flyCells(mine, starts, hd.adjCenters, texts);
      } else if (step.kind === 'compose') {
        // A⁻¹ 와 A 의 칸이 한 자리로 모여 한 행렬이 된다.
        const inv = next.inverse;
        const prod = next.product;
        if (inv === null || prod === null) throw new Error('inverse-undoes 무대: compose 걸음에 행렬이 없다');
        hd.prodGroup.setAttribute('visibility', 'hidden');
        const starts = [...hd.invCenters, ...hd.aCenters];
        const ends = [...hd.prodCenters, ...hd.prodCenters];
        const texts = [...cellsOf(inv.inv), ...cellsOf(next.matrix)];
        done = await flyCells(mine, starts, ends, texts);
      }
      if (!done || mine !== gen || destroyed) return;
      drawStatic(next);
    }

    // 자료가 없으면(전수 검사의 빈 마운트) 빈 캔버스로 둔다.
    if (params.initialData !== undefined) {
      drawStatic(inverseUndoesScene.initial(params.initialData));
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
