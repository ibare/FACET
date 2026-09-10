/**
 * kmeans-stage — k-평균 전용 시각화.
 *
 * 한 폭의 SVG 를 둘로 나눈다.
 *   왼쪽  흩어진 점 열둘과 중심. 재는 살 · 붙은 무리 · 옮기는 중심이 여기서 논다.
 *   오른쪽 **장부.** 멎은 답이 한 줄씩 쌓인다. 손잡이를 옮겨도 앞서 본 답을 지우지
 *         않는 것이 이 완제품의 논증이라, 견줌은 이 장부 위에서만 일어난다.
 *
 * ── 가로세로 비를 지킨다
 *
 * 자료의 x 폭과 y 폭이 다른데 화면에 늘려 채우면 "가장 가까운 중심" 이 눈으로
 * 보기에 틀린 답이 된다. 그래서 두 축에 **같은 배율**을 쓰고 남는 쪽을 가운데에
 * 둔다. 거리를 말하는 그림이 거리를 왜곡하면 안 된다.
 *
 * ── 세로는 마운트 뒤 바뀌지 않는다 (S-view)
 *
 * 장부가 길어져도 캔버스를 늘리지 않는다. 줄 높이가 정해져 있고 열여섯 줄
 * (k 넷 × 시작 넷) 이 자리에 다 들어간다.
 *
 * ── 뒷일 없음
 *
 * 타이머도 프레임 루프도 관찰자도 두지 않는다. 그리는 일은 projector 가 부르는
 * 메서드 안에서만 일어나므로 `destroy()` 는 붙여 둔 노드를 떼는 것으로 끝난다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 720;
const CANVAS_H = 440;

/** 왼쪽 그림판. */
const PLOT = { x: 10, y: 32, w: 452, h: 340 };
/** 그림이 실제로 노는 안쪽 상자. */
const FIELD = { x0: 30, x1: 446, y0: 356, y1: 52 };
/** 오른쪽 장부. */
const BOOK = { x: 470, y: 32, w: 240, h: 340 };
const ROW_H = 16;
const ROW_TOP = 78;
const MAX_ROWS = 16;

/**
 * 무리 색은 언제나 다섯 자리에서 뽑는다.
 *
 * `categorical(k)` 로 뽑으면 k 를 옮길 때마다 색이 통째로 갈려, 같은 무리가
 * 다른 색이 되고 장부의 앞 줄과 지금 그림이 이어지지 않는다. 자리 수를 k 의
 * 최대값으로 고정하면 0 번 무리는 늘 같은 색이다 (S-view 결정 트리 3).
 */
const CLUSTER_SEATS = 5;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function text(content: string, attrs: Attrs): SVGTextElement {
  const node = el('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = content;
  return node;
}

type LedgerRow = {
  k: number;
  seedIndex: number;
  sizes: number[];
  spread: number;
  isReader: boolean;
};

export const kmeansStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const tr = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const seat = categorical(CLUSTER_SEATS, 'vivid');
    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
    canvas.setAttribute(
      'aria-label',
      tr(
        'label.aria',
        'k-means: twelve points, moving centres, and a ledger of the answers that stopped',
      ),
    );

    const root = el('g', {});
    canvas.appendChild(root);

    const frames = el('g', {});
    const gSpokes = el('g', {});
    const gPoints = el('g', {});
    const gCentres = el('g', {});
    const gBook = el('g', {});
    const gCaption = el('g', {});
    for (const layer of [frames, gSpokes, gPoints, gCentres, gBook, gCaption]) {
      root.appendChild(layer);
    }

    frames.appendChild(
      el('rect', {
        x: PLOT.x,
        y: PLOT.y,
        width: PLOT.w,
        height: PLOT.h,
        rx: 6,
        fill: colors.bg,
        stroke: colors.border,
      }),
    );
    frames.appendChild(
      el('rect', {
        x: BOOK.x,
        y: BOOK.y,
        width: BOOK.w,
        height: BOOK.h,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
      }),
    );

    // ── 상태. projector 가 메서드로 갈아 끼운다.
    let points: number[][] = [];
    let seedLabels: string[] = [];
    let k = 0;
    let seedIndex = 0;
    let seedIndices: number[] = [];
    let centers: number[][] = [];
    let cameFrom: number[][] | null = null;
    let assign: number[] | null = null;
    let picks: number[] | null = null;
    let spokes: number[][] | null = null;
    let tallies: number[] | null = null;
    let round: number | null = null;
    let settled = false;
    let captionMain = '';
    let captionNote = '';
    const book: LedgerRow[] = [];

    // ── 좌표 변환. 두 축에 같은 배율을 써서 거리를 왜곡하지 않는다.
    let scale = 1;
    let originX = FIELD.x0;
    let originY = FIELD.y0;
    let minX = 0;
    let minY = 0;

    function fitField(): void {
      if (points.length === 0) return;
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const pad = 0.6;
      minX = Math.min(...xs) - pad;
      minY = Math.min(...ys) - pad;
      const spanX = Math.max(...xs) + pad - minX;
      const spanY = Math.max(...ys) + pad - minY;
      const boxW = FIELD.x1 - FIELD.x0;
      const boxH = FIELD.y0 - FIELD.y1;
      scale = Math.min(boxW / spanX, boxH / spanY);
      originX = FIELD.x0 + (boxW - spanX * scale) / 2;
      originY = FIELD.y0 - (boxH - spanY * scale) / 2;
    }

    const sx = (x: number): number => originX + (x - minX) * scale;
    const sy = (y: number): number => originY - (y - minY) * scale;
    const hue = (cluster: number): string => seat[cluster % CLUSTER_SEATS];

    function clear(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function drawSpokes(): void {
      clear(gSpokes);
      if (centers.length === 0) return;
      if (picks !== null) {
        // 고른 뒤에는 이긴 살만 남는다.
        for (let i = 0; i < points.length; i += 1) {
          const j = picks[i];
          if (j === undefined || centers[j] === undefined) continue;
          gSpokes.appendChild(
            el('line', {
              x1: sx(points[i][0]),
              y1: sy(points[i][1]),
              x2: sx(centers[j][0]),
              y2: sy(centers[j][1]),
              stroke: hue(j),
              'stroke-width': 1.4,
              'stroke-opacity': 0.7,
            }),
          );
        }
        return;
      }
      if (spokes === null) return;
      for (let i = 0; i < points.length; i += 1) {
        const row = spokes[i];
        if (row === undefined) continue;
        const far = Math.max(...row, 1e-9);
        for (let j = 0; j < row.length; j += 1) {
          if (centers[j] === undefined) continue;
          // 잰 값을 그대로 쓴다 — 가까울수록 살이 진하다.
          const near = 1 - row[j] / far;
          gSpokes.appendChild(
            el('line', {
              x1: sx(points[i][0]),
              y1: sy(points[i][1]),
              x2: sx(centers[j][0]),
              y2: sy(centers[j][1]),
              stroke: colors.textMuted,
              'stroke-width': 0.8,
              'stroke-opacity': (0.12 + 0.4 * near).toFixed(3),
            }),
          );
        }
      }
    }

    function drawPoints(): void {
      clear(gPoints);
      for (let i = 0; i < points.length; i += 1) {
        const cx = sx(points[i][0]);
        const cy = sy(points[i][1]);
        const cluster = assign === null ? -1 : (assign[i] ?? -1);
        if (seedIndices.includes(i)) {
          gPoints.appendChild(
            el('circle', {
              cx,
              cy,
              r: 9.5,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
            }),
          );
        }
        gPoints.appendChild(
          el('circle', {
            cx,
            cy,
            r: 5.5,
            fill: cluster < 0 ? colors.itemDefault : hue(cluster),
            stroke: cluster < 0 ? colors.border : colors.stateInk,
            'stroke-width': 1,
          }),
        );
        gPoints.appendChild(
          text(String(i), {
            x: cx + 8,
            y: cy - 7,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }
    }

    function drawCentres(): void {
      clear(gCentres);
      for (let j = 0; j < centers.length; j += 1) {
        const cx = sx(centers[j][0]);
        const cy = sy(centers[j][1]);
        if (cameFrom !== null && cameFrom[j] !== undefined) {
          const fx = sx(cameFrom[j][0]);
          const fy = sy(cameFrom[j][1]);
          if (Math.abs(fx - cx) + Math.abs(fy - cy) > 0.5) {
            gCentres.appendChild(
              el('line', {
                x1: fx,
                y1: fy,
                x2: cx,
                y2: cy,
                stroke: hue(j),
                'stroke-width': 2,
                'stroke-dasharray': '3 2',
              }),
            );
            gCentres.appendChild(
              el('circle', { cx: fx, cy: fy, r: 3, fill: 'none', stroke: hue(j) }),
            );
          }
        }
        // 중심은 마름모다 — 점(원)과 한눈에 갈린다.
        gCentres.appendChild(
          el('rect', {
            x: cx - 7,
            y: cy - 7,
            width: 14,
            height: 14,
            transform: `rotate(45 ${cx} ${cy})`,
            fill: hue(j),
            stroke: colors.stateInk,
            'stroke-width': 1.5,
          }),
        );
        if (tallies !== null && tallies[j] !== undefined) {
          gCentres.appendChild(
            text(String(tallies[j]), {
              x: cx,
              y: cy + 4,
              'font-size': fontSizes.xs,
              'font-weight': '700',
              'text-anchor': 'middle',
              fill: colors.stateInk,
            }),
          );
        }
      }
      if (settled) {
        const pillW = 74;
        gCentres.appendChild(
          el('rect', {
            x: PLOT.x + PLOT.w - pillW - 10,
            y: PLOT.y + 10,
            width: pillW,
            height: 20,
            rx: 3,
            fill: colors.accent,
          }),
        );
        gCentres.appendChild(
          text(tr('label.settled', 'nothing moved'), {
            x: PLOT.x + PLOT.w - pillW / 2 - 10,
            y: PLOT.y + 24,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: colors.stateInk,
          }),
        );
      }
    }

    function drawBook(): void {
      clear(gBook);
      gBook.appendChild(
        text(tr('label.ledger', 'answers that stopped'), {
          x: BOOK.x + 10,
          y: BOOK.y + 20,
          'font-size': fontSizes.sm,
          'font-weight': '600',
          fill: colors.text,
        }),
      );
      gBook.appendChild(
        text(tr('label.colRun', 'k · start'), {
          x: BOOK.x + 10,
          y: BOOK.y + 38,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gBook.appendChild(
        text(tr('label.colSizes', 'sizes'), {
          x: BOOK.x + 60,
          y: BOOK.y + 38,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gBook.appendChild(
        text(tr('label.colScatter', 'scatter'), {
          x: BOOK.x + 216,
          y: BOOK.y + 38,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
          fill: colors.textMuted,
        }),
      );

      if (book.length === 0) {
        gBook.appendChild(
          text(tr('label.ledgerEmpty', 'nothing has stopped yet'), {
            x: BOOK.x + 10,
            y: ROW_TOP + 12,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }

      // 가장 촘촘한 답은 **같은 k 안에서** 고른다. k 가 다르면 견줄 수 없다.
      const tightestAt = new Map<number, number>();
      for (const row of book) {
        const best = tightestAt.get(row.k);
        if (best === undefined || row.spread < best) tightestAt.set(row.k, row.spread);
      }

      const shown = book.slice(0, MAX_ROWS);
      for (let i = 0; i < shown.length; i += 1) {
        const row = shown[i];
        const top = ROW_TOP + i * ROW_H;
        const base = top + 11;
        const isTightest = tightestAt.get(row.k) === row.spread;
        if (isTightest) {
          gBook.appendChild(
            el('rect', {
              x: BOOK.x + 4,
              y: top + 1,
              width: 3,
              height: ROW_H - 3,
              fill: colors.accent,
            }),
          );
        }
        if (row.isReader) {
          gBook.appendChild(
            el('circle', {
              cx: BOOK.x + 230,
              cy: base - 4,
              r: 4,
              fill: 'none',
              stroke: colors.text,
              'stroke-width': 1.2,
            }),
          );
        }
        gBook.appendChild(
          text(String(row.k), {
            x: BOOK.x + 10,
            y: base,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
        gBook.appendChild(
          text(seedLabels[row.seedIndex] ?? String(row.seedIndex), {
            x: BOOK.x + 26,
            y: base,
            'font-size': fontSizes.xs,
            'font-weight': '600',
            fill: colors.text,
          }),
        );
        gBook.appendChild(
          text(row.sizes.join('/'), {
            x: BOOK.x + 60,
            y: base,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
            fill: colors.text,
          }),
        );
        gBook.appendChild(
          text(row.spread.toFixed(2), {
            x: BOOK.x + 216,
            y: base,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
            'font-weight': isTightest ? '700' : '400',
            'text-anchor': 'end',
            fill: colors.text,
          }),
        );
      }

      // 두 표식이 무엇인지 한 줄로 적어 둔다.
      const legendY = BOOK.y + BOOK.h - 12;
      gBook.appendChild(
        el('rect', { x: BOOK.x + 10, y: legendY - 8, width: 3, height: 10, fill: colors.accent }),
      );
      gBook.appendChild(
        text(tr('label.markTightest', 'tightest'), {
          x: BOOK.x + 18,
          y: legendY,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gBook.appendChild(
        el('circle', {
          cx: BOOK.x + 112,
          cy: legendY - 4,
          r: 4,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.2,
        }),
      );
      gBook.appendChild(
        text(tr('label.markReader', 'what a reader sees'), {
          x: BOOK.x + 122,
          y: legendY,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
    }

    function drawCaption(): void {
      clear(gCaption);
      gCaption.appendChild(
        text(
          tr('label.head', 'k = {k} · start {seed}', {
            k,
            seed: seedLabels[seedIndex] ?? String(seedIndex),
          }),
          { x: 14, y: 22, 'font-size': fontSizes.sm, 'font-weight': '600', fill: colors.text },
        ),
      );
      if (round !== null) {
        gCaption.appendChild(
          text(tr('label.round', 'round {round}', { round }), {
            x: PLOT.x + PLOT.w,
            y: 22,
            'font-size': fontSizes.sm,
            'text-anchor': 'end',
            fill: colors.textMuted,
          }),
        );
      }
      gCaption.appendChild(
        text(captionMain, { x: 14, y: 394, 'font-size': fontSizes.sm, fill: colors.text }),
      );
      gCaption.appendChild(
        text(captionNote, { x: 14, y: 414, 'font-size': fontSizes.xs, fill: colors.textMuted }),
      );
    }

    function redrawField(): void {
      drawSpokes();
      drawPoints();
      drawCentres();
    }

    function redrawAll(): void {
      redrawField();
      drawBook();
      drawCaption();
    }

    redrawAll();

    return {
      destroy() {
        root.remove();
      },

      setPoints(next: number[][], labels: string[]) {
        points = next.map((p) => [p[0], p[1]]);
        seedLabels = [...labels];
        fitField();
        redrawAll();
      },

      beginRun(info: {
        k: number;
        seedIndex: number;
        seedIndices: number[];
        centers: number[][];
      }) {
        k = info.k;
        seedIndex = info.seedIndex;
        seedIndices = [...info.seedIndices];
        centers = info.centers.map((c) => [c[0], c[1]]);
        cameFrom = null;
        assign = null;
        picks = null;
        spokes = null;
        tallies = null;
        round = null;
        settled = false;
        redrawAll();
      },

      setRound(next: number | null) {
        round = next;
        settled = false;
        redrawField();
        drawCaption();
      },

      setSpokes(next: number[][] | null) {
        spokes = next === null ? null : next.map((r) => [...r]);
        if (next !== null) picks = null;
        drawSpokes();
      },

      setPicks(next: number[] | null) {
        picks = next === null ? null : [...next];
        drawSpokes();
      },

      setAssign(next: number[] | null) {
        assign = next === null ? null : [...next];
        drawPoints();
      },

      setTallies(next: number[] | null) {
        tallies = next === null ? null : [...next];
        drawCentres();
      },

      setCenters(next: number[][], from: number[][] | null) {
        centers = next.map((c) => [c[0], c[1]]);
        cameFrom = from === null ? null : from.map((c) => [c[0], c[1]]);
        spokes = null;
        picks = null;
        redrawField();
      },

      setSettled(next: boolean) {
        settled = next;
        drawCentres();
      },

      addLedgerRow(row: LedgerRow) {
        const at = book.findIndex((e) => e.k === row.k && e.seedIndex === row.seedIndex);
        const entry: LedgerRow = { ...row, sizes: [...row.sizes] };
        if (at >= 0) book[at] = entry;
        else book.push(entry);
        drawBook();
      },

      setCaption(main: string, note: string) {
        captionMain = main;
        captionNote = note;
        drawCaption();
      },

      reset() {
        k = 0;
        seedIndex = 0;
        seedIndices = [];
        centers = [];
        cameFrom = null;
        assign = null;
        picks = null;
        spokes = null;
        tallies = null;
        round = null;
        settled = false;
        captionMain = '';
        captionNote = '';
        book.length = 0;
        redrawAll();
      },
    };
  },
};
