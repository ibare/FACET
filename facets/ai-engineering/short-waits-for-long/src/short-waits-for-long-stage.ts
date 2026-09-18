/**
 * short-waits-for-long 무대 — 네 줄이 한 묶음 틀 안에서 걸음마다 함께 한 칸씩 자란다.
 *
 * 새 칸은 앞 칸 밑에서 밀려 나와 제자리로 간다. 끝난 요청의 줄에도 같은 걸음에 점선 빈칸이
 * 밀려 나온다 — 묶음 틀의 오른쪽 끝이 넷을 함께 끌고 가서, 가장 긴 줄이 끝나기 전에는
 * 아무 줄도 틀 밖으로 나가지 못한다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
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
import {
  batchSteps,
  blankPercent,
  cellAt,
  tallyAt,
  type ShortWaitsForLongScene,
} from './scene.js';

const H = 270;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이. 걸음 하나 = 이것 + stepMs. */
const GROW_MS = 450;
const FRAME_MS = 16;

const PAD = 8;
const LABEL_W = 44;
const RIGHT_W = 88;
const COL_MAX = 76;
const ROW_TOP = 44;
const PITCH_MAX = 46;
const CAPTION_H = 46;

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

interface Handles {
  /** 이번 걸음의 칸들 — 줄마다 하나. */
  fresh: SVGGElement[];
  frame: SVGRectElement | null;
  frameW: number;
  colW: number;
}

export const shortWaitsForLongStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<ShortWaitsForLongScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: ShortWaitsForLongScene): Handles {
      svg.textContent = '';
      const empty: Handles = { fresh: [], frame: null, frameW: 0, colW: 0 };
      const reqs = scene.requests;
      const n = reqs.length;
      const cols = batchSteps(reqs);
      if (n === 0 || cols === 0) return empty;

      const gridX0 = PAD + LABEL_W;
      const gridX1 = PIECE_CANVAS_W - RIGHT_W - PAD;
      const colW = Math.min(COL_MAX, (gridX1 - gridX0) / cols);
      const cellW = colW - 4;
      const pitch = Math.min(PITCH_MAX, (H - ROW_TOP - CAPTION_H) / n);
      const cellH = pitch - 10;
      // 가장 긴 낱말이 칸에 들어가도록 글자 크기를 칸 폭에서 역산한다
      let longest = 1;
      for (const r of reqs) for (const w of r.words) if (w.length > longest) longest = w.length;
      const fs = Math.max(9, Math.min(12, Math.round((cellW * 0.92) / (longest * 0.52))));
      const pastel = categorical(n, 'pastel');
      const vivid = categorical(n, 'vivid');
      const now = scene.t;
      const tally = tallyAt(reqs, now);
      const done = now >= cols;

      // 걸음 눈금
      const ruler = el('g', {}, svg);
      el('text', {
        x: gridX0 - 12,
        y: ROW_TOP - 16,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }, ruler).textContent = t('label.step', 'step');
      for (let k = 1; k <= cols; k += 1) {
        const num = el('text', {
          x: r2(gridX0 + (k - 0.5) * colW),
          y: ROW_TOP - 16,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: k === now ? c.text : k < now ? c.textMuted : c.border,
        }, ruler);
        if (k === now) num.setAttribute('font-weight', '700');
        num.textContent = String(k);
      }

      // 범례 — 빈칸
      const lx = gridX1 + 12;
      el('rect', {
        x: lx,
        y: ROW_TOP - 26,
        width: 16,
        height: 12,
        rx: 2,
        fill: c.bgSubtle,
        stroke: c.itemComparing,
        'stroke-dasharray': '3 2',
      }, svg);
      el('text', {
        x: lx + 22,
        y: ROW_TOP - 16,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }, svg).textContent = t('label.blank', 'blank');

      // 칸 — 뒤 걸음이 앞 걸음 밑에 깔리도록 거꾸로 그린다
      const cellsLayer = el('g', {}, svg);
      const fresh: SVGGElement[] = [];
      for (let i = 0; i < n; i += 1) {
        const r = reqs[i]!;
        const y = ROW_TOP + i * pitch;
        for (let k = now; k >= 1; k -= 1) {
          const x = gridX0 + (k - 1) * colW + 2;
          const g = el('g', {}, cellsLayer);
          const word = cellAt(r, k);
          if (word === null) {
            el('rect', {
              x: r2(x),
              y: r2(y),
              width: r2(cellW),
              height: r2(cellH),
              rx: 3,
              fill: c.bgSubtle,
              stroke: c.itemComparing,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            }, g);
          } else {
            el('rect', {
              x: r2(x),
              y: r2(y),
              width: r2(cellW),
              height: r2(cellH),
              rx: 3,
              fill: pastel[i]!,
              stroke: vivid[i]!,
              'stroke-width': 1.5,
            }, g);
            el('text', {
              x: r2(x + cellW / 2),
              y: r2(y + cellH / 2 + fs * 0.35),
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fs,
              fill: c.stateInk,
            }, g).textContent = word;
          }
          if (k === now) fresh.push(g);
        }
        // 끝 표시 — 마지막 토큰 칸 오른쪽에 선 하나. 이번 걸음에 끝났으면 그 칸과 함께 움직인다
        if (now >= r.words.length) {
          const host = now === r.words.length ? (fresh[i] ?? cellsLayer) : cellsLayer;
          const ex = r2(gridX0 + r.words.length * colW);
          el('line', {
            x1: ex,
            y1: r2(y - 3),
            x2: ex,
            y2: r2(y + cellH + 3),
            stroke: c.text,
            'stroke-width': 2,
          }, host);
        }
      }

      // 이름 칸 — 밀려 나오는 첫 칸을 가린다
      el('rect', { x: 0, y: ROW_TOP - 6, width: gridX0 - 5, height: n * pitch + 2, fill: c.bg }, svg);
      for (let i = 0; i < n; i += 1) {
        const y = ROW_TOP + i * pitch;
        el('text', {
          x: gridX0 - 12,
          y: r2(y + cellH / 2 + 5),
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '700',
          fill: vivid[i]!,
        }, svg).textContent = reqs[i]!.id;
        const w = tally.waited[i];
        if (w !== null && w !== undefined) {
          el('text', {
            x: gridX1 + 12,
            y: r2(y + cellH / 2 + 4),
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: w > 0 ? c.itemComparing : c.textMuted,
          }, svg).textContent = t('label.waited', 'waited {n}', { n: w });
        }
      }

      // 묶음 틀 — 오른쪽 끝이 걸음마다 넷을 함께 끌고 간다
      const frameW = now * colW + 6;
      const frame = el('rect', {
        x: gridX0 - 3,
        y: ROW_TOP - 5,
        width: r2(frameW),
        height: r2(n * pitch),
        rx: 5,
        fill: 'none',
        stroke: done ? c.text : c.textMuted,
        'stroke-width': done ? 2 : 1.5,
      }, svg);

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (now === 0) {
        caption = t('caption.start', '{n} requests start together in one batch.', { n });
      } else if (done) {
        caption = t('caption.end', 'The batch ends at step {t}: {blank} of {total} cells are blanks ({pct}%).', {
          t: now,
          blank: tally.blanks,
          total: tally.cells,
          pct: blankPercent(tally),
        });
      } else {
        caption = t('caption.step', 'Step {t}: {tokens} tokens and {blanks} blanks.', {
          t: now,
          tokens: tally.tokensNow,
          blanks: tally.blanksNow,
        });
      }
      el('text', {
        x: PIECE_CANVAS_W / 2,
        y: H - 18,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      }, svg).textContent = caption;

      return { fresh, frame, frameW, colW };
    }

    function tween(mine: number, ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let settled = false;
        let frame = 0;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (frame * FRAME_MS) / ms);
          onFrame(easeOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          frame += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: ShortWaitsForLongScene,
      prev: ShortWaitsForLongScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      const grows =
        opts.animate &&
        prev !== null &&
        step !== null &&
        step.kind === 'grow' &&
        step.to === step.from + 1 &&
        h.frame !== null;
      if (!grows) return;

      const frame = h.frame!;
      const back = h.colW;
      await tween(mine, GROW_MS, (p) => {
        const off = r2(-back * (1 - p));
        for (const g of h.fresh) g.setAttribute('transform', `translate(${off} 0)`);
        frame.setAttribute('width', String(r2(h.frameW + off)));
      });
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
  },
};
