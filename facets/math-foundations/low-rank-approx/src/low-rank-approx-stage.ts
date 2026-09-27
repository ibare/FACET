/**
 * 저랭크 근사의 무대.
 *
 * 왼쪽은 수의 표 — 칸마다 값을 글자로 적고 값의 크기만큼 칠한다. 오른쪽은 표를 이루는 겹들 —
 * 겹 하나하나가 같은 모양의 작은 표다. 한 걸음에 가장 작은 겹이 "남은 겹" 칸에서 "버린 겹" 칸으로
 * 미끄러져 나가고, 그동안 왼쪽 표의 칸 값이 버리기 전 값에서 버린 뒤 값으로 흐른다.
 * 반올림해 원래와 달라진 칸에는 테두리가 선다.
 *
 * 칠하는 법 — 채움의 짙기 = |값| / 잣대. 잣대는 알고리즘이 모든 걸음의 표와 모든 겹을 통틀어 잰
 * 가장 큰 |칸 값|(9.94)이라 9 를 넘는 칸도 잘리지 않는다. 음수 칸은 다른 색(itemComparing)으로
 * 같은 짙기 규칙을 따른다 — 0..9 밖 값을 잘라 내지 않고 색으로 가른다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LowRankScene } from './scene.js';

const H = 360;
const SVG = 'http://www.w3.org/2000/svg';
const PAD = 16;
const MOVE_MS = 600;
const SUB = '₀₁₂₃₄₅₆₇₈₉';

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function round3(x: number): number {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r;
}

/** 수를 자릿수대로 적는다. 빼기는 U+2212, −0 은 0 으로. */
function fmt(x: number, digits: number): string {
  const s = x.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace('-', '−');
}

/** 칸 값 — 정수면 소수점 없이, 아니면 소수 첫째 */
function fmtCell(x: number): string {
  return Number.isInteger(x) ? fmt(x, 0) : fmt(x, 1);
}

function subscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => {
      const ch = SUB[Number(d)];
      if (ch === undefined) throw new Error(`아래 첨자로 적을 수 없다: ${d}`);
      return ch;
    })
    .join('');
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

type CellHandle = { rect: SVGElement; text: SVGElement; size: number };

type Drawn = {
  cells: CellHandle[][];
  fresh: SVGElement[];
  moving: SVGElement | null;
  moveDx: number;
};

function paintCell(h: CellHandle, v: number, scale: number | null, colors: Palette): void {
  if (scale === null) {
    h.rect.setAttribute('fill', 'none');
  } else {
    h.rect.setAttribute('fill', v < 0 ? colors.itemComparing : colors.primary);
    h.rect.setAttribute('fill-opacity', String(round3(Math.abs(v) / scale)));
  }
  const dark = scale !== null && v >= 0 && Math.abs(v) / scale > 0.5;
  h.text.setAttribute('fill', dark ? colors.textInverse : colors.text);
  h.text.textContent = fmtCell(v);
}

export const lowRankApproxStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: LowRankScene): Drawn {
      svg.textContent = '';
      const original = scene.original;
      const rows = original.length;
      const first = original[0];
      if (first === undefined) throw new Error('원래 표가 비었다');
      const cols = first.length;
      const base = scene.base;
      const scale = base === null ? null : base.scale;

      const gridTop = 36;
      const captionTop = H - 50;
      const cell = Math.floor(Math.min(44, (captionTop - 14 - gridTop) / rows, (W * 0.55 - PAD) / cols));
      const gridX = PAD;
      const gridW = cell * cols;
      const gridH = cell * rows;
      const cellFont = parseFloat(fontSizes.sm);

      if (base !== null) {
        const k = base.sigmas.length - scene.dropped.length;
        const head = el('text', {
          x: gridX,
          y: gridTop - 12,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        head.textContent = t('label.approx', 'Sum of the first {k} layers', { k });
        svg.appendChild(head);
      }

      const cells: CellHandle[][] = [];
      const fresh: SVGElement[] = [];
      const gridG = el('g', {});
      svg.appendChild(gridG);
      for (let r = 0; r < rows; r += 1) {
        const line: CellHandle[] = [];
        for (let c = 0; c < cols; c += 1) {
          const v = scene.table[r]?.[c];
          if (v === undefined) throw new Error(`표 칸 [${r}][${c}] 이 없다`);
          const x = gridX + c * cell;
          const y = gridTop + r * cell;
          const rect = el('rect', { x, y, width: cell, height: cell, stroke: colors.border, 'stroke-width': 1 });
          const text = el('text', {
            x: x + cell / 2,
            y: y + cell / 2 + cellFont * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          const h: CellHandle = { rect, text, size: cell };
          paintCell(h, v, scale, colors);
          gridG.appendChild(rect);
          gridG.appendChild(text);
          line.push(h);
        }
        cells.push(line);
      }
      if (scene.changed !== null) {
        const step = scene.step;
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const now = scene.changed[r]?.[c];
            if (now === undefined) throw new Error(`달라진 칸 [${r}][${c}] 이 없다`);
            if (!now) continue;
            const mark = el('rect', {
              x: gridX + c * cell + 2,
              y: gridTop + r * cell + 2,
              width: cell - 4,
              height: cell - 4,
              fill: 'none',
              stroke: colors.danger,
              'stroke-width': 2.5,
            });
            gridG.appendChild(mark);
            if (step.kind === 'drop') {
              const was = step.fromChanged[r]?.[c];
              if (was === undefined) throw new Error(`앞 걸음의 달라진 칸 [${r}][${c}] 이 없다`);
              if (!was) fresh.push(mark);
            }
          }
        }
      }

      let moving: SVGElement | null = null;
      let moveDx = 0;
      if (base !== null) {
        const px0 = gridX + gridW + 28;
        const colW = (W - PAD - px0) / 2;
        const n = base.sigmas.length;
        const rowH = gridH / n;
        const mini = Math.floor(Math.min(6, (rowH - 8) / rows, (colW * 0.4) / cols));
        const miniH = mini * rows;
        moveDx = colW;

        const keptHead = el('text', {
          x: px0,
          y: gridTop - 12,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        keptHead.textContent = t('label.kept', 'Kept layers');
        svg.appendChild(keptHead);
        const dropHead = el('text', {
          x: px0 + colW,
          y: gridTop - 12,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        dropHead.textContent = t('label.dropped', 'Dropped layers');
        svg.appendChild(dropHead);
        svg.appendChild(
          el('line', {
            x1: px0 + colW - 8,
            y1: gridTop - 4,
            x2: px0 + colW - 8,
            y2: gridTop + gridH,
            stroke: colors.border,
            'stroke-dasharray': '3 3',
          }),
        );

        for (let i = 0; i < n; i += 1) {
          const layer = base.layers[i];
          const sigma = base.sigmas[i];
          if (layer === undefined || sigma === undefined) throw new Error(`겹 ${i} 이 없다`);
          const gone = scene.dropped.includes(i);
          const x = px0 + (gone ? colW : 0);
          const y = gridTop + i * rowH + (rowH - miniH) / 2;
          const g = el('g', gone ? { opacity: 0.45 } : {});
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const v = layer[r]?.[c];
              if (v === undefined) throw new Error(`겹 ${i} 의 칸 [${r}][${c}] 이 없다`);
              g.appendChild(
                el('rect', {
                  x: x + c * mini,
                  y: y + r * mini,
                  width: mini,
                  height: mini,
                  fill: v < 0 ? colors.itemComparing : colors.primary,
                  'fill-opacity': round3(Math.abs(v) / base.scale),
                }),
              );
            }
          }
          g.appendChild(
            el('rect', {
              x,
              y,
              width: mini * cols,
              height: miniH,
              fill: 'none',
              stroke: colors.border,
            }),
          );
          const label = el('text', {
            x: x + mini * cols + 8,
            y: y + miniH / 2 + parseFloat(fontSizes.sm) * 0.35,
            fill: gone ? colors.textMuted : colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          if (gone) label.setAttribute('text-decoration', 'line-through');
          label.textContent = `σ${subscript(i + 1)} ${fmt(sigma, 3)}`;
          g.appendChild(label);
          svg.appendChild(g);
          if (scene.step.kind === 'drop' && scene.step.index === i) moving = g;
        }
      }

      const line1 = el('text', {
        x: PAD,
        y: captionTop + 16,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      const step = scene.step;
      if (step.kind === 'drop') {
        line1.textContent = t('caption.drop', 'Dropped the smallest layer left: σ{i} = {sigma}', {
          i: subscript(step.index + 1),
          sigma: fmt(step.sigma, 3),
        });
      } else if (base !== null) {
        line1.textContent = t('caption.start', 'The table is the sum of its layers, largest σ first. Layers: {n}', {
          n: base.sigmas.length,
        });
      }
      svg.appendChild(line1);
      if (base !== null && scene.errorPct !== null && scene.same !== null) {
        const line2 = el('text', {
          x: PAD,
          y: captionTop + 38,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        line2.textContent = t('caption.stats', 'Layers left: {k} · Error: {err}% · Same after rounding: {same}/{total}', {
          k: base.sigmas.length - scene.dropped.length,
          err: fmt(scene.errorPct, 1),
          same: scene.same,
          total: rows * cols,
        });
        svg.appendChild(line2);
      }
      return { cells, fresh, moving, moveDx };
    }

    function frameTimer(mine: number, onFrame: (p: number) => void): Promise<void> {
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
          const p = Math.min(1, (Date.now() - began) / MOVE_MS);
          onFrame(p);
          if (p >= 1) {
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

    async function render(next: LowRankScene, _prev: LowRankScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step.kind !== 'drop' || next.base === null) return;
      const scale = next.base.scale;
      const moving = drawn.moving;
      if (moving === null) throw new Error(`버린 겹 ${step.index} 의 그림이 없다`);
      await frameTimer(mine, (p) => {
        const e = ease(p);
        drawn.cells.forEach((line, r) =>
          line.forEach((h, c) => {
            const a = step.from[r]?.[c];
            const b = next.table[r]?.[c];
            if (a === undefined || b === undefined) throw new Error(`흘릴 칸 [${r}][${c}] 이 없다`);
            paintCell(h, p >= 1 ? b : a + (b - a) * e, scale, colors);
          }),
        );
        moving.setAttribute('transform', `translate(${round3(-(1 - e) * drawn.moveDx)},0)`);
        moving.setAttribute('opacity', String(round3(1 - 0.55 * e)));
        for (const m of drawn.fresh) m.setAttribute('opacity', String(round3(e)));
      });
      if (destroyed || mine !== gen) return;
      drawStatic(next);
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
