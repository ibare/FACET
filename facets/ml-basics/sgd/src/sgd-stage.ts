/**
 * sgd 무대 — 두 에폭의 차례 띠 (에폭마다 한 줄, 점 번호 칸) 위에 묶음 칸막이, 갱신마다 그 묶음 위에 비낌 바늘.
 *
 * 운동:
 *  - 판 머리 (start) — 줄마다 칸막이 열다섯이 새 묶음 자리로 미끄러진다. 묶음 경계가 아닌 칸막이는 가장 가까운
 *    경계로 가서 겹친다 (B 1 은 서른둘 칸, B 16 은 두 칸)
 *  - 갱신 (step) — 지금 묶음을 두르는 틀이 그 묶음으로 미끄러지고, 그 위에 바늘이 기준(위 = 전체 내리막)에서
 *    |비낌| 만큼 돈다. 90° 를 넘으면 가로 점선 아래로 넘어간다 (거꾸로 간 갱신)
 *
 * 무대는 셈하지 않는다 — 각 · 손실 · (w, b) · 갱신 수 · 평균 |비낌| 은 payload 로 받고 찍기만 한다.
 */
import { fonts, fontSizes, getColors } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

export type SgdStartView = {
  batch: number;
  n: number;
  epochs: number;
  perEpoch: number;
  totalUpdates: number;
  boundaries: number[];
  w: number;
  b: number;
  loss: number;
};
export type SgdEpochView = { epoch: number; order: number[] };
export type SgdStepView = {
  epoch: number;
  batchIndex: number;
  start: number;
  size: number;
  absAngle: number;
  backward: boolean;
  w: number;
  b: number;
  loss: number;
  updates: number;
  backwardCount: number;
};
export type SgdEndView = {
  epochs: number;
  updates: number;
  backwardCount: number;
  meanAbsAngle: number;
  w: number;
  b: number;
  loss: number;
};

export type SgdStage = ViewInstance & {
  reset(): void;
  start(v: SgdStartView, ms: number): void;
  epoch(v: SgdEpochView, ms: number): void;
  step(v: SgdStepView, ms: number): void;
  end(v: SgdEndView): void;
};

const W = 760;
const H = 372;
/** 띠 칸 수 (점 열여섯) 와 줄 수 (두 에폭) — 무대가 잡는 자리. 데이터가 커지면 start 에서 던진다 */
const CELLS = 16;
const ROWS = 2;
const X0 = 96;
const CELL = 40;
const ROW0 = 34;
const ROW_H = 132;
const LANE = 80;
const CELL_H = 30;
const NEEDLE = 17;

const SVG = 'http://www.w3.org/2000/svg';

export const sgdStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const fsXs = parseFloat(fontSizes.xs);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K, attrs: Record<string, string | number>, parent: Element,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
      parent.appendChild(e);
      return e;
    };
    const text = (x: number, y: number, size: string, fill: string, anchor: string, parent: Element) =>
      el('text', { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor }, parent);

    // ── 운동 ─────────────────────────────────────────────
    type Anim = { frame: number | null; finish: () => void };
    const anims = new Set<Anim>();
    const tween = (ms: number, draw: (k: number) => void): void => {
      if (!(ms > 0) || isInstant()) { draw(1); return; }
      const t0 = performance.now();
      const a: Anim = {
        frame: null,
        finish: () => {
          if (a.frame !== null) cancelAnimationFrame(a.frame);
          anims.delete(a);
          draw(1);
        },
      };
      const tick = (now: number) => {
        if (isInstant()) { a.finish(); return; }
        const k = Math.min(1, Math.max(0, (now - t0) / ms));
        draw(1 - (1 - k) * (1 - k));
        if (k < 1) a.frame = requestAnimationFrame(tick);
        else { a.frame = null; anims.delete(a); }
      };
      anims.add(a);
      a.frame = requestAnimationFrame(tick);
    };
    const finishAll = (): void => { for (const a of [...anims]) a.finish(); };
    params.onScrubStart?.(finishAll);

    // ── 뼈대 (한 번만 짓는다) ─────────────────────────────
    const root = el('g', {}, svg);
    const legend = text(X0, 18, fontSizes.sm, c.textMuted, 'start', root);
    legend.textContent = t('legend.needle', 'Needle: up = full downhill direction · below the dashed line = against it (past 90°)');

    type Row = {
      top: number;
      label: SVGTextElement;
      cells: SVGRectElement[];
      nums: SVGTextElement[];
      dividers: SVGLineElement[];
      divPos: number[];
      cursor: SVGRectElement;
      cursorAt: { start: number; size: number } | null;
      needles: SVGGElement;
    };
    const rows: Row[] = [];
    for (let r = 0; r < ROWS; r++) {
      const top = ROW0 + r * ROW_H;
      const g = el('g', {}, root);
      const cellTop = top + LANE + 4;
      const label = text(X0 - 12, cellTop + CELL_H / 2 + fsXs / 2, fontSizes.sm, c.text, 'end', g);
      label.textContent = t('label.epoch', 'Epoch {e}', { e: r + 1 });
      const ninety = text(X0 - 12, top + 48 + fsXs / 2 - 1, fontSizes.xs, c.textMuted, 'end', g);
      ninety.textContent = '90°';
      el('line', {
        x1: X0, y1: top + 48, x2: X0 + CELLS * CELL, y2: top + 48,
        stroke: c.border, 'stroke-dasharray': '3 4', 'stroke-width': 1,
      }, g);
      const cells: SVGRectElement[] = [];
      const nums: SVGTextElement[] = [];
      for (let i = 0; i < CELLS; i++) {
        cells.push(el('rect', {
          x: X0 + i * CELL, y: cellTop, width: CELL, height: CELL_H, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 0.5,
        }, g));
        const nt = text(X0 + i * CELL + CELL / 2, cellTop + CELL_H / 2 + parseFloat(fontSizes.sm) / 2 - 1, fontSizes.sm, c.text, 'middle', g);
        nt.setAttribute('font-family', fonts.mono);
        nums.push(nt);
      }
      el('rect', {
        x: X0, y: top, width: CELLS * CELL, height: LANE + 4 + CELL_H, fill: 'none', stroke: c.textMuted, 'stroke-width': 1,
      }, g);
      const needles = el('g', {}, g);
      const dividers: SVGLineElement[] = [];
      const divPos: number[] = [];
      for (let j = 1; j < CELLS; j++) {
        dividers.push(el('line', {
          x1: X0 + j * CELL, y1: top, x2: X0 + j * CELL, y2: cellTop + CELL_H, stroke: c.text, 'stroke-width': 1.5,
        }, g));
        divPos.push(j);
      }
      const cursor = el('rect', {
        x: X0, y: cellTop - 2, width: CELL, height: CELL_H + 4, fill: 'none', stroke: c.primary, 'stroke-width': 2.5,
        rx: 3, visibility: 'hidden',
      }, g);
      rows.push({ top, label, cells, nums, dividers, divPos, cursor, cursorAt: null, needles });
    }

    const state = text(X0, 312, fontSizes.md, c.text, 'start', root);
    state.setAttribute('font-family', fonts.mono);
    const caption = text(X0, 340, fontSizes.md, c.text, 'start', root);

    const placeDivider = (row: Row, j: number, pos: number): void => {
      const line = row.dividers[j];
      if (!line) throw new Error('sgd stage: 칸막이 자리가 없다');
      const x = X0 + pos * CELL;
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      row.divPos[j] = pos;
    };
    const placeCursor = (row: Row, start: number, size: number): void => {
      row.cursor.setAttribute('x', String(X0 + start * CELL));
      row.cursor.setAttribute('width', String(size * CELL));
    };
    const showState = (w: number, b: number, loss: number): void => {
      state.textContent = t('readout.state', 'w = {w}, b = {b} · full loss {loss}', {
        w: w.toFixed(2), b: b.toFixed(2), loss: loss.toFixed(3),
      });
    };
    const rowOf = (epoch: number): Row => {
      const row = rows[epoch];
      if (!row) throw new Error(`sgd stage: 에폭 ${epoch + 1} 의 줄이 없다`);
      return row;
    };
    const dimNeedles = (): void => {
      for (const row of rows) {
        for (const g of Array.from(row.needles.querySelectorAll('line[data-needle]'))) g.setAttribute('stroke-width', '1.5');
      }
    };

    /** 결론을 걷는다 — 바늘 · 번호 · 틀 · 글자. 칸막이 자리는 남긴다 (옮겨 갈 자리) */
    const clear = (): void => {
      finishAll();
      for (const row of rows) {
        row.needles.replaceChildren();
        for (const nt of row.nums) nt.textContent = '';
        for (const cell of row.cells) cell.setAttribute('fill', c.bgSubtle);
        row.cursor.setAttribute('visibility', 'hidden');
        row.cursorAt = null;
      }
      state.textContent = '';
      caption.textContent = '';
    };

    const api: SgdStage = {
      reset() {
        clear();
      },
      start(v, ms) {
        clear();
        if (v.n !== CELLS || v.epochs !== ROWS) throw new Error('sgd stage: 띠 칸 · 줄 수가 무대와 다르다');
        const bounds = v.boundaries;
        if (bounds.length < 2 || bounds[0] !== 0 || bounds[bounds.length - 1] !== v.n) {
          throw new Error('sgd stage: 칸막이 자리가 0 에서 n 까지가 아니다');
        }
        // 칸막이 j 는 가장 가까운 묶음 경계로 (같으면 띠 가운데 쪽을 버리고 바깥쪽으로 — 왼 반은 왼쪽, 오른 반은 오른쪽)
        const targets: number[] = [];
        for (let j = 1; j < CELLS; j++) {
          let best = bounds[0]!;
          for (const p of bounds) {
            const d = Math.abs(p - j);
            const bd = Math.abs(best - j);
            if (d < bd || (d === bd && j >= CELLS / 2 && p > best)) best = p;
          }
          targets.push(best);
        }
        for (const row of rows) {
          const from = row.divPos.slice();
          tween(ms, (k) => {
            for (let j = 0; j < targets.length; j++) placeDivider(row, j, from[j]! + (targets[j]! - from[j]!) * k);
          });
        }
        showState(v.w, v.b, v.loss);
        caption.textContent = t('caption.start', 'Batch size {B}: each epoch splits into {k} batches · {u} updates to come over {E} epochs', {
          B: v.batch, k: v.perEpoch, u: v.totalUpdates, E: v.epochs,
        });
      },
      epoch(v, ms) {
        const row = rowOf(v.epoch);
        if (v.order.length !== CELLS) throw new Error('sgd stage: 차례 길이가 띠와 다르다');
        for (const other of rows) other.cursor.setAttribute('visibility', 'hidden');
        v.order.forEach((p, i) => {
          const nt = row.nums[i]!;
          nt.textContent = String(p + 1);
          row.cells[i]!.setAttribute('fill', c.bg);
        });
        const base = row.top + LANE + 4 + CELL_H / 2 + parseFloat(fontSizes.sm) / 2 - 1;
        tween(ms, (k) => {
          for (const nt of row.nums) nt.setAttribute('y', String(base - (1 - k) * 12));
        });
        caption.textContent = t('caption.epoch', 'Epoch {e}: this epoch’s shuffled order lights up its strip', { e: v.epoch + 1 });
      },
      step(v, ms) {
        const row = rowOf(v.epoch);
        dimNeedles();
        // 틀이 이 묶음으로 미끄러진다
        const prev = row.cursorAt;
        row.cursor.setAttribute('visibility', 'visible');
        row.cursorAt = { start: v.start, size: v.size };
        if (prev === null) placeCursor(row, v.start, v.size);
        else {
          tween(ms * 0.5, (k) => placeCursor(row, prev.start + (v.start - prev.start) * k, v.size));
        }
        // 바늘
        const cx = X0 + (v.start + v.size / 2) * CELL;
        const cy = row.top + 48;
        const g = el('g', { transform: `translate(${cx} ${cy})` }, row.needles);
        el('line', { x1: 0, y1: 0, x2: 0, y2: -NEEDLE, stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, g);
        const ink = v.backward ? c.danger : c.primary;
        const needle = el('line', {
          x1: 0, y1: 0, x2: 0, y2: -NEEDLE, stroke: ink, 'stroke-width': 3, 'stroke-linecap': 'round', 'data-needle': 1,
        }, g);
        const tip = el('circle', { cx: 0, cy: -NEEDLE, r: 2.5, fill: ink }, g);
        el('circle', { cx: 0, cy: 0, r: 2, fill: c.text }, g);
        const lab = text(cx, row.top + 14, fontSizes.xs, v.backward ? c.danger : c.textMuted, 'middle', row.needles);
        lab.textContent = `${v.absAngle.toFixed(0)}°`;
        if (v.backward) lab.setAttribute('font-weight', '700');
        const rad = (v.absAngle * Math.PI) / 180;
        tween(ms, (k) => {
          const a = rad * k;
          const x = NEEDLE * Math.sin(a);
          const y = -NEEDLE * Math.cos(a);
          needle.setAttribute('x2', String(x));
          needle.setAttribute('y2', String(y));
          tip.setAttribute('cx', String(x));
          tip.setAttribute('cy', String(y));
        });
        showState(v.w, v.b, v.loss);
        caption.textContent = v.backward
          ? t('caption.back', 'Update {u} (epoch {e}, batch {k}): skew {deg}° — past 90°, against the full downhill', {
            u: v.updates, e: v.epoch + 1, k: v.batchIndex + 1, deg: v.absAngle.toFixed(0),
          })
          : t('caption.step', 'Update {u} (epoch {e}, batch {k}): skew {deg}°', {
            u: v.updates, e: v.epoch + 1, k: v.batchIndex + 1, deg: v.absAngle.toFixed(0),
          });
      },
      end(v) {
        finishAll();
        dimNeedles();
        for (const row of rows) row.cursor.setAttribute('visibility', 'hidden');
        showState(v.w, v.b, v.loss);
        caption.textContent = t('caption.end', 'After {E} epochs: {u} updates · {back} against the downhill · mean |skew| {mean}°', {
          E: v.epochs, u: v.updates, back: v.backwardCount, mean: v.meanAbsAngle.toFixed(0),
        });
      },
      destroy() {
        finishAll();
        root.remove();
      },
    };
    return api;
  },
};
