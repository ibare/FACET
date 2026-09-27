/**
 * determinant-area 무대.
 *
 * 위 — 좌표평면. 도형이 A 로 옮겨지며 꼭짓점이 제자리에서 새 자리로 실제로 움직이고,
 *      옮기기 전 모양은 점선으로 남는다.
 * 아래 왼쪽 — 도형마다 넓이 막대. 옮길 때 막대가 옮기기 전 길이에서 옮긴 뒤 길이로 불어나고,
 *      옮기기 전 길이마다 눈금이 새겨져 몇 벌인지(배수) 보인다.
 * 아래 오른쪽 — 행렬 A. 마지막 걸음에 네 칸의 수가 날아가 ad − bc 식의 자리에 앉고,
 *      셈한 값과 같은 배수 표가 같은 강조로 선다.
 *
 * 셈(옮긴 자리 · 넓이 · 배수 · 행렬식 · 같음 판정)은 모두 장면에 실려 온 값이다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatNum, type Pt } from './algorithm.js';
import type { Base, DeterminantAreaScene } from './scene.js';

const H = 380;
const PAD = 20;
const PLANE_TOP = 14;
const PLANE_MAX_H = 190;
const UNIT_MAX = 48;
const NAME_W = 100;
const BAR_MAX_W = 220;
const BAR_H = 16;
const ROW_GAP_MAX = 36;
const FORMULA_Y = H - 50;
const CAPTION_Y = H - 14;
const MOVE_MS = 900;
const FLY_MS = 900;
const FRAME_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

type BarHandle = { rect: SVGRectElement; ticks: { el: SVGLineElement; x: number }[]; labels: SVGElement[] };
type Flyer = { el: SVGTextElement; dx: number; dy: number };
type Handles = {
  polys: Map<string, SVGPolygonElement>;
  dots: Map<string, SVGCircleElement[]>;
  bars: Map<string, BarHandle>;
  flyers: Flyer[];
  result: SVGElement[];
};

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

export const determinantAreaStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const mdPx = parseFloat(fontSizes.md);
    const smPx = parseFloat(fontSizes.sm);
    const charW = mdPx * 0.6;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Attrs,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function nameOf(id: string): string {
      if (id === 'tri') return t('label.tri', 'Triangle');
      if (id === 'ell') return t('label.ell', 'L-shape');
      throw new Error(`determinant-area 무대: 이름이 없는 도형 ${id}`);
    }

    function numText(n: number): string {
      return formatNum(n);
    }

    function layout(base: Base) {
      const { minX, maxX, minY, maxY } = base.bounds;
      const xSpan = maxX - minX + 1;
      const ySpan = maxY - minY + 1;
      const U = Math.min((W - 2 * PAD) / xSpan, PLANE_MAX_H / ySpan, UNIT_MAX);
      const planeW = xSpan * U;
      const planeH = ySpan * U;
      const left = (W - planeW) / 2;
      const toPx = (p: Pt): [number, number] => [
        r2(left + (p[0] - minX + 0.5) * U),
        r2(PLANE_TOP + (maxY + 0.5 - p[1]) * U),
      ];
      const rowsTop = PLANE_TOP + planeH + 24;
      const rowsRoom = FORMULA_Y - 26 - rowsTop;
      const rowGap = Math.min(ROW_GAP_MAX, rowsRoom / base.shapes.length);
      if (!(base.maxArea > 0)) throw new Error('determinant-area 무대: maxArea 가 양수가 아니다');
      const unitLen = BAR_MAX_W / base.maxArea;
      const barX = PAD + NAME_W;
      const numX = barX + BAR_MAX_W + 12;
      const ratioX = numX + 64;
      // 행렬 자리 — 오른쪽 아래
      const bracketR = W - PAD - 4;
      const col1 = bracketR - 20;
      const col0 = col1 - 36;
      const bracketL = col0 - 20;
      const mRow0 = rowsTop + 20;
      const mRow1 = mRow0 + 26;
      return { U, left, planeW, planeH, toPx, rowsTop, rowGap, unitLen, barX, numX, ratioX, bracketL, bracketR, col0, col1, mRow0, mRow1 };
    }

    function ptsAttr(ps: Pt[], toPx: (p: Pt) => [number, number]): string {
      return ps.map((p) => toPx(p).join(',')).join(' ');
    }

    function drawStatic(scene: DeterminantAreaScene): Handles {
      svg.textContent = '';
      const handles: Handles = { polys: new Map(), dots: new Map(), bars: new Map(), flyers: [], result: [] };
      const base = scene.base;
      if (base === null) return handles;
      const L = layout(base);
      const palette = categorical(base.shapes.length, 'vivid');
      const colorOf = (i: number): string => {
        const c = palette[i];
        if (c === undefined) throw new Error(`determinant-area 무대: 도형 ${i} 의 색이 없다`);
        return c;
      };

      // ── 좌표평면: 축과 눈금만 (격자 칸을 두지 않는다)
      const plane = el('g', {}, svg);
      const { minX, maxX, minY, maxY } = base.bounds;
      const [ax0, ay] = L.toPx([minX - 0.5, 0]);
      const [ax1] = L.toPx([maxX + 0.5, 0]);
      el('line', { x1: ax0, y1: ay, x2: ax1, y2: ay, stroke: colors.border, 'stroke-width': 1 }, plane);
      const [bx, by0] = L.toPx([0, maxY + 0.5]);
      const [, by1] = L.toPx([0, minY - 0.5]);
      el('line', { x1: bx, y1: by0, x2: bx, y2: by1, stroke: colors.border, 'stroke-width': 1 }, plane);
      for (let x = minX; x <= maxX; x += 1) {
        if (x === 0) continue;
        const [px, py] = L.toPx([x, 0]);
        el('line', { x1: px, y1: py - 3, x2: px, y2: py + 3, stroke: colors.border }, plane);
      }
      for (let y = minY; y <= maxY; y += 1) {
        if (y === 0) continue;
        const [px, py] = L.toPx([0, y]);
        el('line', { x1: px - 3, y1: py, x2: px + 3, y2: py, stroke: colors.border }, plane);
      }

      // ── 도형: 옮기기 전은 점선으로 남고, 지금 모양이 채워진다
      base.shapes.forEach((s, i) => {
        const col = colorOf(i);
        const moved = scene.moved.find((m) => m.id === s.id);
        if (moved !== undefined) {
          el('polygon', {
            points: ptsAttr(s.pts, L.toPx),
            fill: 'none',
            stroke: col,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
            'stroke-opacity': 0.8,
          }, plane);
        }
        const now = moved === undefined ? s.pts : moved.result.to;
        const poly = el('polygon', {
          points: ptsAttr(now, L.toPx),
          fill: col,
          'fill-opacity': 0.3,
          stroke: col,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        }, plane);
        handles.polys.set(s.id, poly);
        const dots = now.map((p) => {
          const [px, py] = L.toPx(p);
          return el('circle', { cx: px, cy: py, r: 2.5, fill: col }, plane);
        });
        handles.dots.set(s.id, dots);
      });

      // ── 넓이 막대
      const rows = el('g', {}, svg);
      el('text', {
        x: L.barX,
        y: L.rowsTop,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      }, rows, t('head.area', 'Area'));
      base.shapes.forEach((s, i) => {
        const col = colorOf(i);
        const cy = r2(L.rowsTop + 18 + i * L.rowGap);
        const moved = scene.moved.find((m) => m.id === s.id);
        el('rect', { x: PAD, y: cy - 6, width: 12, height: 12, fill: col, 'fill-opacity': 0.3, stroke: col, 'stroke-width': 1.5 }, rows);
        el('text', {
          x: PAD + 18,
          y: cy,
          'dominant-baseline': 'central',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        }, rows, nameOf(s.id));
        const area = moved === undefined ? s.area : moved.result.after;
        const rect = el('rect', {
          x: L.barX,
          y: cy - BAR_H / 2,
          width: r2(area * L.unitLen),
          height: BAR_H,
          fill: col,
          'fill-opacity': 0.3,
          stroke: col,
          'stroke-width': 1.5,
        }, rows);
        const ticks: BarHandle['ticks'] = [];
        const labels: SVGElement[] = [];
        if (moved !== undefined) {
          // 옮기기 전 넓이 한 벌마다 눈금 — 몇 벌이 되었는가
          for (let k = 1; k < moved.result.ratio; k += 1) {
            const x = r2(L.barX + k * moved.result.before * L.unitLen);
            ticks.push({
              el: el('line', { x1: x, y1: cy - BAR_H / 2, x2: x, y2: cy + BAR_H / 2, stroke: col, 'stroke-width': 1.5 }, rows),
              x,
            });
          }
          labels.push(el('text', {
            x: L.numX,
            y: cy,
            'dominant-baseline': 'central',
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          }, rows, t('row.change', '{before} → {after}', {
            before: numText(moved.result.before),
            after: numText(moved.result.after),
          })));
          const hit = scene.det !== null && scene.det.matches.includes(s.id);
          const ratioText = t('row.ratio', '×{k}', { k: numText(moved.result.ratio) });
          const pillW = r2(ratioText.length * smPx * 0.62 + 12);
          const g = el('g', {}, rows);
          if (hit) {
            el('rect', { x: L.ratioX - 6, y: cy - 10, width: pillW, height: 20, rx: 10, fill: colors.accent }, g);
          }
          el('text', {
            x: L.ratioX,
            y: cy,
            'dominant-baseline': 'central',
            fill: hit ? colors.stateInk : colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
          }, g, ratioText);
          labels.push(g);
        } else {
          labels.push(el('text', {
            x: L.numX,
            y: cy,
            'dominant-baseline': 'central',
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          }, rows, numText(s.area)));
        }
        handles.bars.set(s.id, { rect, ticks, labels });
      });

      // ── 행렬 A
      const mat = el('g', {}, svg);
      const top = L.mRow0 - 14;
      const bottom = L.mRow1 + 14;
      el('text', {
        x: L.bracketL - 8,
        y: (L.mRow0 + L.mRow1) / 2,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      }, mat, t('matrix.name', 'A ='));
      el('path', {
        d: `M${L.bracketL + 5},${top} H${L.bracketL} V${bottom} H${L.bracketL + 5}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      }, mat);
      el('path', {
        d: `M${L.bracketR - 5},${top} H${L.bracketR} V${bottom} H${L.bracketR - 5}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      }, mat);
      const cellPos: Record<'a' | 'b' | 'c' | 'd', [number, number]> = {
        a: [L.col0, L.mRow0],
        b: [L.col1, L.mRow0],
        c: [L.col0, L.mRow1],
        d: [L.col1, L.mRow1],
      };
      for (const k of ['a', 'b', 'c', 'd'] as const) {
        const [x, y] = cellPos[k];
        el('text', {
          x,
          y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        }, mat, numText(base[k]));
      }

      // ── ad − bc: 네 칸의 수가 식의 자리에 앉는다
      if (scene.det !== null) {
        const f = el('g', {}, svg);
        const lhs = t('formula.lhs', 'ad − bc =');
        el('text', {
          x: PAD,
          y: FORMULA_Y,
          'dominant-baseline': 'central',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        }, f, lhs);
        type Tok = { text: string; gap: number; src?: 'a' | 'b' | 'c' | 'd'; result?: true };
        const numTok = (k: 'a' | 'b' | 'c' | 'd', gap: number): Tok[] => {
          const v = base[k];
          return v < 0
            ? [{ text: '(', gap }, { text: numText(v), gap: 0, src: k }, { text: ')', gap: 0 }]
            : [{ text: numText(v), gap, src: k }];
        };
        const toks: Tok[] = [
          ...numTok('a', 1),
          { text: '·', gap: 0 },
          ...numTok('d', 0),
          { text: '−', gap: 1 },
          ...numTok('b', 1),
          { text: '·', gap: 0 },
          ...numTok('c', 0),
          { text: '=', gap: 1 },
          { text: numText(scene.det.det), gap: 2, result: true },
        ];
        let col = lhs.length;
        for (const tok of toks) {
          col += tok.gap;
          const x = r2(PAD + col * charW);
          const w = tok.text.length * charW;
          if (tok.result === true) {
            const bg = el('rect', { x: x - 5, y: FORMULA_Y - 11, width: r2(w + 10), height: 22, rx: 11, fill: colors.accent }, f);
            const tx = el('text', {
              x,
              y: FORMULA_Y,
              'dominant-baseline': 'central',
              fill: colors.stateInk,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'font-weight': 700,
            }, f, tok.text);
            handles.result.push(bg, tx);
          } else {
            const tx = el('text', {
              x,
              y: FORMULA_Y,
              'dominant-baseline': 'central',
              fill: colors.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
            }, f, tok.text);
            if (tok.src !== undefined) {
              const [cx, cy] = cellPos[tok.src];
              handles.flyers.push({ el: tx, dx: r2(cx - (x + w / 2)), dy: r2(cy - FORMULA_Y) });
            }
          }
          col += tok.text.length;
        }
      }

      // ── 캡션: 지금 일어난 일
      el('text', {
        x: PAD,
        y: CAPTION_Y,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      }, svg, captionOf(scene, base));
      return handles;
    }

    function captionOf(scene: DeterminantAreaScene, base: Base): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Before moving — areas {areas}', {
          areas: base.shapes.map((s) => numText(s.area)).join(' · '),
        });
      }
      if (step.kind === 'move') {
        const m = scene.moved.find((x) => x.id === step.id);
        if (m === undefined) throw new Error(`determinant-area 무대: 옮긴 기록이 없는 도형 ${step.id}`);
        return t('caption.move', '{name}: area {before} → {after} · ×{k}', {
          name: nameOf(step.id),
          before: numText(m.result.before),
          after: numText(m.result.after),
          k: numText(m.result.ratio),
        });
      }
      if (scene.det === null) throw new Error('determinant-area 무대: det 걸음인데 셈한 값이 없다');
      return t('caption.det', 'Shapes whose multiple equals ad − bc: {same} / {n}', {
        same: scene.det.matches.length,
        n: base.shapes.length,
      });
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = Date.now();
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const k = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(k));
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateMove(h: Handles, scene: DeterminantAreaScene, id: string, mine: number): Promise<void> {
      const base = scene.base;
      if (base === null) throw new Error('determinant-area 무대: 바탕 없이 move');
      const shape = base.shapes.find((s) => s.id === id);
      const moved = scene.moved.find((m) => m.id === id);
      const poly = h.polys.get(id);
      const dots = h.dots.get(id);
      const bar = h.bars.get(id);
      if (shape === undefined || moved === undefined || poly === undefined || dots === undefined || bar === undefined) {
        throw new Error(`determinant-area 무대: 옮길 도형 ${id} 의 손잡이가 없다`);
      }
      const L = layout(base);
      const from = shape.pts;
      const to = moved.result.to;
      const w0 = moved.result.before * L.unitLen;
      const w1 = moved.result.after * L.unitLen;
      for (const lab of bar.labels) lab.setAttribute('visibility', 'hidden');
      await tween(MOVE_MS, mine, (k) => {
        const cur: Pt[] = from.map((p, i) => {
          const q = to[i];
          if (q === undefined) throw new Error(`determinant-area 무대: ${id} 의 꼭짓점 ${i} 가 옮긴 자리에 없다`);
          return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
        });
        poly.setAttribute('points', ptsAttr(cur, L.toPx));
        cur.forEach((p, i) => {
          const dot = dots[i];
          if (dot === undefined) throw new Error(`determinant-area 무대: ${id} 의 꼭짓점 점 ${i} 가 없다`);
          const [px, py] = L.toPx(p);
          dot.setAttribute('cx', String(px));
          dot.setAttribute('cy', String(py));
        });
        const w = w0 + (w1 - w0) * k;
        bar.rect.setAttribute('width', String(r2(w)));
        for (const tick of bar.ticks) {
          tick.el.setAttribute('visibility', tick.x <= L.barX + w + 0.01 ? 'visible' : 'hidden');
        }
      });
    }

    async function animateDet(h: Handles, mine: number): Promise<void> {
      for (const r of h.result) r.setAttribute('visibility', 'hidden');
      await tween(FLY_MS, mine, (k) => {
        for (const f of h.flyers) {
          f.el.setAttribute('transform', `translate(${r2(f.dx * (1 - k))},${r2(f.dy * (1 - k))})`);
        }
      });
    }

    return {
      async render(next: DeterminantAreaScene, _prev: DeterminantAreaScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'move') await animateMove(h, next, step.id, mine);
        else if (step.kind === 'det') await animateDet(h, mine);
        else return;
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
