/**
 * dbscan-stage — 한 폭의 SVG 에 네 가지를 함께 그린다.
 *
 *   1. 왼쪽 큰 자리: 평면 위의 점 열아홉. 무리마다 색이 다르고 잡음은 ×.
 *      번짐이 실제로 지나간 자리는 **선으로 남는다** — eps 를 올리면 그 선이
 *      떨어져 있던 덩이 사이를 건너가는 것이 곧 "eps 는 잇는다" 이다.
 *   2. 그 아래 띠: 스택. 배열 칸과 꼭대기 색인이다. 꼭대기 위의 칸은 지우지
 *      않고 흐리게 남긴다 — 배열로 편 스택이 실제로 그런 모양이기 때문이다.
 *   3. 오른쪽: 손잡이 조합의 대조표. 다녀온 칸에 (무리 수 / 잡음 수) 가
 *      **쌓인다**. 지우지 않으므로 손잡이를 옮겨 온 자취가 그대로 남고,
 *      그것이 없으면 "무리 수를 같게 만드는 조합이 여럿" 을 볼 길이 없다.
 *   4. 맨 아래 가로 띠: 범례 셋과 캡션 한 줄. 오른쪽 칸의 폭으로는 번역이
 *      넘치므로 긴 문안은 여기 눕힌다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 자료가 몇 점이든 자리는 배율로
 * 맞추고 칸은 폭을 줄여 담는다.
 *
 * 애니메이션 promise 를 돌려주는 메서드가 없다 — 걸음의 길이는 알고리즘의
 * `ctx.sleep` 이 정하고 stage 는 부르는 즉시 그린다. 그래서 `destroy` 가 풀어
 * 줘야 할 기다림도 없고 스스로 예약하는 타이머도 없다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 420;

/** 왼쪽 산점도가 쓸 수 있는 상자. */
const PLOT = { x0: 20, y0: 18, x1: 492, y1: 310 };
/** 스택 띠. 그 아래에 꼭대기 표시가 붙는다. */
const STRIP = { y0: 320, y1: 342, x0: 56, x1: 486 };
/** 오른쪽 대조표. */
const GRID = { labelX: 504, colX: 560, colW: 46, rowY: 72, rowH: 44 };
/**
 * 아래 가로 띠 — 범례와 캡션.
 *
 * 범례를 오른쪽 칸(폭 236)에 두었더니 영어 원문부터 넘쳤다. 문안은 언어마다
 * 길이가 달라지므로 긴 줄은 폭이 넓은 자리에 눕힌다.
 */
const FOOT = { legendY: 382, captionY: 406, slotW: 250 };

const NOISE = -1;
const UNSEEN = 0;

/** 무리 색은 넷을 돌려 쓴다 — 이 자료에서 무리는 많아야 넷이다. */
const CLUSTER_TONES = 4;

let clipSeq = 0;

type Point = { x: number; y: number };

function isPointArray(v: unknown): v is Point[] {
  return (
    Array.isArray(v) &&
    v.every((p) => {
      if (typeof p !== 'object' || p === null) return false;
      const r = p as Record<string, unknown>;
      return typeof r.x === 'number' && typeof r.y === 'number';
    })
  );
}

function numberArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

function make(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function text(
  content: string,
  attrs: Record<string, string | number>,
): SVGElement {
  const node = make('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = content;
  return node;
}

export const dbscanStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**을 비운다. 컨테이너를 비우면 러너가
    // 먼저 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const tone = categorical(CLUSTER_TONES, 'vivid');

    const initial = (params.initialData ?? {}) as Record<string, unknown>;
    let points: Point[] = isPointArray(initial.points) ? initial.points : [];
    const epsOptions = numberArray(initial.epsOptions);
    const minPtsOptions = numberArray(initial.minPtsOptions);

    const title = make('title', {});
    title.textContent = tr(
      'label.aria',
      'DBSCAN — points on a plane, the spreading stack, and a tally of every eps and minPts tried',
    );
    svg.appendChild(title);

    // ── 정적 뼈대 ───────────────────────────────────────────────────────────
    const clipId = `dbscan-plot-${(clipSeq += 1)}`;
    const defs = make('defs', {});
    const clip = make('clipPath', { id: clipId });
    clip.appendChild(
      make('rect', {
        x: PLOT.x0,
        y: PLOT.y0,
        width: PLOT.x1 - PLOT.x0,
        height: PLOT.y1 - PLOT.y0,
      }),
    );
    defs.appendChild(clip);
    svg.appendChild(defs);

    const gPlotBg = make('g', {});
    const gLinks = make('g', { 'clip-path': `url(#${clipId})` });
    const gProbe = make('g', { 'clip-path': `url(#${clipId})` });
    const gPoints = make('g', {});
    const gStack = make('g', {});
    const gGrid = make('g', {});
    const gLegend = make('g', {});
    const gCaption = make('g', {});
    for (const g of [gPlotBg, gLinks, gProbe, gPoints, gStack, gGrid, gLegend, gCaption]) {
      svg.appendChild(g);
    }

    gPlotBg.appendChild(
      make('rect', {
        x: PLOT.x0,
        y: PLOT.y0,
        width: PLOT.x1 - PLOT.x0,
        height: PLOT.y1 - PLOT.y0,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // ── 상태 ────────────────────────────────────────────────────────────────
    let eps = epsOptions[0] ?? 1;
    let minPts = minPtsOptions[0] ?? 3;
    let epsIndex = -1;
    let minPtsIndex = -1;
    let labels: number[] = [];
    let cores: boolean[] = [];
    let links: Array<[number, number]> = [];
    let probe: { index: number; count: number; core: boolean } | null = null;
    let stackCells: number[] = [];
    let stackTop = 0;
    let caption = '';
    /** 다녀온 손잡이 조합. `<epsIndex>:<minPtsIndex>` → 무리 수와 잡음 수. */
    const tally = new Map<string, { clusters: number; noise: number }>();

    // ── 좌표 ────────────────────────────────────────────────────────────────
    let scale = 1;
    let originX = PLOT.x0;
    let originY = PLOT.y1;

    function recomputeScale(): void {
      if (points.length === 0) {
        scale = 1;
        originX = PLOT.x0;
        originY = PLOT.y1;
        return;
      }
      let minX = points[0].x;
      let maxX = points[0].x;
      let minY = points[0].y;
      let maxY = points[0].y;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = 0.4;
      const dataW = maxX - minX + pad * 2;
      const dataH = maxY - minY + pad * 2;
      const boxW = PLOT.x1 - PLOT.x0;
      const boxH = PLOT.y1 - PLOT.y0;
      // 가로세로 배율이 같아야 eps 가 동그라미로 보인다.
      scale = Math.min(boxW / Math.max(dataW, 1e-6), boxH / Math.max(dataH, 1e-6));
      originX = PLOT.x0 + (boxW - dataW * scale) / 2 - (minX - pad) * scale;
      originY = PLOT.y0 + (boxH - dataH * scale) / 2 + (maxY + pad) * scale;
    }

    const sx = (x: number): number => originX + x * scale;
    const sy = (y: number): number => originY - y * scale;

    function clusterColor(label: number): string {
      return tone[(label - 1) % CLUSTER_TONES];
    }

    // ── 그리기 ──────────────────────────────────────────────────────────────
    function clear(g: SVGElement): void {
      g.textContent = '';
    }

    function renderPlot(): void {
      clear(gLinks);
      clear(gProbe);
      clear(gPoints);

      for (const [from, to] of links) {
        const a = points[from];
        const b = points[to];
        if (!a || !b) continue;
        const label = labels[to] ?? UNSEEN;
        gLinks.appendChild(
          make('line', {
            x1: sx(a.x),
            y1: sy(a.y),
            x2: sx(b.x),
            y2: sy(b.y),
            stroke: label > 0 ? clusterColor(label) : colors.border,
            'stroke-width': 1.6,
            'stroke-opacity': 0.55,
          }),
        );
      }

      if (probe !== null && points[probe.index]) {
        const p = points[probe.index];
        gProbe.appendChild(
          make('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: Math.max(2, eps * scale),
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 1.4,
            'stroke-dasharray': '4 3',
          }),
        );
      }

      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        const cx = sx(p.x);
        const cy = sy(p.y);
        const label = labels[i] ?? UNSEEN;
        if (label === NOISE) {
          const d = 4;
          gPoints.appendChild(
            make('path', {
              d: `M ${cx - d} ${cy - d} L ${cx + d} ${cy + d} M ${cx + d} ${cy - d} L ${cx - d} ${cy + d}`,
              stroke: colors.textMuted,
              'stroke-width': 1.6,
              'stroke-linecap': 'round',
            }),
          );
        } else if (label === UNSEEN) {
          gPoints.appendChild(
            make('circle', {
              cx,
              cy,
              r: 4,
              fill: colors.bg,
              stroke: colors.border,
              'stroke-width': 1.4,
            }),
          );
        } else if (cores[i] === true) {
          gPoints.appendChild(
            make('circle', {
              cx,
              cy,
              r: 6,
              fill: clusterColor(label),
              stroke: colors.bg,
              'stroke-width': 1.5,
            }),
          );
        } else {
          gPoints.appendChild(
            make('circle', {
              cx,
              cy,
              r: 5,
              fill: colors.bg,
              stroke: clusterColor(label),
              'stroke-width': 2.2,
            }),
          );
        }
      }

      if (probe !== null && points[probe.index]) {
        const p = points[probe.index];
        gPoints.appendChild(
          make('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: 9,
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 2,
          }),
        );
        gPoints.appendChild(
          text(String(probe.count), {
            x: sx(p.x),
            y: sy(p.y) - 13,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': '600',
            fill: colors.itemActive,
          }),
        );
      }
    }

    function renderStack(): void {
      clear(gStack);
      gStack.appendChild(
        text('stack', {
          x: 14,
          y: (STRIP.y0 + STRIP.y1) / 2 + 4,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      const n = Math.max(points.length, 1);
      const cw = Math.min(22, (STRIP.x1 - STRIP.x0) / n);
      for (let i = 0; i < points.length; i += 1) {
        const cx = STRIP.x0 + i * cw;
        const inside = i < stackTop;
        gStack.appendChild(
          make('rect', {
            x: cx,
            y: STRIP.y0,
            width: Math.max(1, cw - 2),
            height: STRIP.y1 - STRIP.y0,
            rx: 3,
            fill: inside ? colors.bgSubtle : colors.bg,
            stroke: inside ? colors.text : colors.border,
            'stroke-width': inside ? 1.4 : 1,
          }),
        );
        // 꼭대기 위 칸도 지우지 않고 흐리게 남긴다 — 배열로 편 스택이 그렇다.
        const value = stackCells[i];
        if (typeof value === 'number') {
          gStack.appendChild(
            text(String(value), {
              x: cx + (cw - 2) / 2,
              y: (STRIP.y0 + STRIP.y1) / 2 + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: inside ? colors.text : colors.border,
            }),
          );
        }
      }

      const caretAt = Math.min(stackTop, Math.max(points.length - 1, 0));
      const caretX = STRIP.x0 + caretAt * cw + (cw - 2) / 2;
      gStack.appendChild(
        make('path', {
          d: `M ${caretX - 5} ${STRIP.y1 + 8} L ${caretX + 5} ${STRIP.y1 + 8} L ${caretX} ${STRIP.y1 + 1} Z`,
          fill: colors.accent,
          stroke: colors.text,
          'stroke-width': 0.8,
        }),
      );
      gStack.appendChild(
        text('top', {
          x: caretX,
          y: STRIP.y1 + 20,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
    }

    function renderGrid(): void {
      clear(gGrid);
      gGrid.appendChild(
        text(tr('label.tally', 'groups / noise'), {
          x: GRID.labelX,
          y: 30,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      const gridW = GRID.colW * Math.max(minPtsOptions.length, 1);
      gGrid.appendChild(
        text('minPts', {
          x: GRID.colX + gridW / 2,
          y: 50,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gGrid.appendChild(
        text('eps', {
          x: GRID.labelX,
          y: 66,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      for (let c = 0; c < minPtsOptions.length; c += 1) {
        gGrid.appendChild(
          text(String(minPtsOptions[c]), {
            x: GRID.colX + c * GRID.colW + GRID.colW / 2,
            y: 66,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c === minPtsIndex ? colors.text : colors.textMuted,
            'font-weight': c === minPtsIndex ? '700' : '400',
          }),
        );
      }

      for (let r = 0; r < epsOptions.length; r += 1) {
        const y = GRID.rowY + r * GRID.rowH;
        gGrid.appendChild(
          text(epsOptions[r].toFixed(1), {
            x: GRID.colX - 8,
            y: y + GRID.rowH / 2 + 4,
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: r === epsIndex ? colors.text : colors.textMuted,
            'font-weight': r === epsIndex ? '700' : '400',
          }),
        );
        for (let c = 0; c < minPtsOptions.length; c += 1) {
          const x = GRID.colX + c * GRID.colW;
          const seen = tally.get(`${r}:${c}`);
          const here = r === epsIndex && c === minPtsIndex;
          gGrid.appendChild(
            make('rect', {
              x,
              y,
              width: GRID.colW - 2,
              height: GRID.rowH - 2,
              rx: 4,
              fill: here ? colors.accent : seen ? colors.bgSubtle : colors.bg,
              stroke: here ? colors.text : colors.border,
              'stroke-width': here ? 1.6 : 1,
            }),
          );
          if (seen) {
            gGrid.appendChild(
              text(`${seen.clusters} / ${seen.noise}`, {
                x: x + (GRID.colW - 2) / 2,
                y: y + GRID.rowH / 2 + 4,
                'text-anchor': 'middle',
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                fill: here ? colors.stateInk : colors.text,
                'font-weight': here ? '700' : '400',
              }),
            );
          }
        }
      }

      gGrid.appendChild(
        text(tr('label.now', 'now: eps {eps}, minPts {minPts}', { eps, minPts }), {
          x: GRID.labelX,
          y: GRID.rowY + epsOptions.length * GRID.rowH + 24,
          'font-size': fontSizes.xs,
          fill: colors.text,
        }),
      );
    }

    /** 범례는 아래 가로 띠에 눕힌다 — 오른쪽 칸의 폭으로는 번역이 넘친다. */
    function renderLegend(): void {
      clear(gLegend);
      const y = FOOT.legendY;
      const slots: Array<[string, SVGElement]> = [
        [
          tr('legend.core', 'core — spreading goes on'),
          make('circle', { cx: 21, cy: y - 4, r: 6, fill: tone[0] }),
        ],
        [
          tr('legend.border', 'border — spreading stops'),
          make('circle', {
            cx: 21 + FOOT.slotW,
            cy: y - 4,
            r: 5,
            fill: colors.bg,
            stroke: tone[0],
            'stroke-width': 2.2,
          }),
        ],
        [
          tr('legend.noise', 'noise — no group reached'),
          make('path', {
            d: `M ${17 + FOOT.slotW * 2} ${y - 8} L ${25 + FOOT.slotW * 2} ${y} M ${25 + FOOT.slotW * 2} ${y - 8} L ${17 + FOOT.slotW * 2} ${y}`,
            stroke: colors.textMuted,
            'stroke-width': 1.6,
            'stroke-linecap': 'round',
          }),
        ],
      ];
      for (let i = 0; i < slots.length; i += 1) {
        const [label, glyph] = slots[i];
        gLegend.appendChild(glyph);
        gLegend.appendChild(
          text(label, {
            x: 34 + FOOT.slotW * i,
            y,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }
    }

    function renderCaption(): void {
      clear(gCaption);
      gCaption.appendChild(
        text(caption, {
          x: 14,
          y: FOOT.captionY,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }),
      );
    }

    function renderAll(): void {
      renderPlot();
      renderStack();
      renderGrid();
      renderLegend();
      renderCaption();
    }

    recomputeScale();
    renderAll();

    return {
      destroy() {
        // 스스로 예약하는 타이머도 관찰자도 없다. 캔버스는 러너의 것이라
        // 안쪽만 비운다.
        svg.textContent = '';
      },

      setScene(next: Point[]) {
        points = Array.isArray(next) ? next : [];
        labels = new Array<number>(points.length).fill(UNSEEN);
        cores = new Array<boolean>(points.length).fill(false);
        links = [];
        probe = null;
        stackCells = [];
        stackTop = 0;
        recomputeScale();
        renderAll();
      },

      setParams(nextEps: number, nextMinPts: number, ei: number, mi: number) {
        eps = nextEps;
        minPts = nextMinPts;
        epsIndex = ei;
        minPtsIndex = mi;
        renderGrid();
        renderPlot();
      },

      setProbe(index: number, count: number, core: boolean) {
        probe = { index, count, core };
        cores[index] = core;
        renderPlot();
      },

      markNoise(index: number) {
        labels[index] = NOISE;
        renderPlot();
      },

      openCluster(index: number, cluster: number) {
        labels[index] = cluster;
        cores[index] = true;
        renderPlot();
      },

      joinCluster(index: number, cluster: number, from: number, border: boolean) {
        labels[index] = cluster;
        if (border) cores[index] = false;
        links.push([from, index]);
        renderPlot();
      },

      setStack(cells: number[], top: number) {
        stackCells = Array.isArray(cells) ? [...cells] : [];
        stackTop = top;
        renderStack();
      },

      setResult(
        nextLabels: number[],
        nextCores: boolean[],
        nextLinks: Array<[number, number]>,
        _clusters: number,
        _noise: number,
      ) {
        labels = [...nextLabels];
        cores = [...nextCores];
        links = [...nextLinks];
        probe = null;
        stackCells = [];
        stackTop = 0;
        renderPlot();
        renderStack();
      },

      recordTally(ei: number, mi: number, clusters: number, noise: number) {
        tally.set(`${ei}:${mi}`, { clusters, noise });
        renderGrid();
      },

      setCaption(next: string) {
        caption = next;
        renderCaption();
      },

      reset() {
        labels = new Array<number>(points.length).fill(UNSEEN);
        cores = new Array<boolean>(points.length).fill(false);
        links = [];
        probe = null;
        stackCells = [];
        stackTop = 0;
        epsIndex = -1;
        minPtsIndex = -1;
        // 되감기는 처음 자리로 돌아가는 것이라 자취도 함께 비운다.
        tally.clear();
        caption = '';
        renderAll();
      },
    };
  },
};
