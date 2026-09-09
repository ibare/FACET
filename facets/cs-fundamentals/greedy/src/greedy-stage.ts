/**
 * greedy-stage — 시간 축 위의 막대로 활동 선택을 그린다.
 *
 * 소재를 시간 축으로 잡은 이유는 하나다. **겹침이 눈에 보여야** 하기 때문이다.
 * 고른 회의가 서로 닿지 않고, 건너뛴 회의가 왜 겹치는지가 그림 자체로 드러나야
 * 그리디의 판단이 설명 없이 읽힌다.
 *
 * 화면은 세 층이다.
 *   1. 시간 눈금 — 위쪽 가로 축.
 *   2. 회의 목록 — 끝나는 시간 순으로 줄 세운 막대 여덟. 건너뛴 막대는 앞
 *      회의와 겹치는 구간이 빨갛게 남는다.
 *   3. 회의실 — 맨 아래 한 줄. 고른 회의만 여기 놓이며 서로 닿지 않는다.
 *
 * 세로 굵은 선 하나가 `last_end` 다. 그리디가 끌고 다니는 상태의 전부이며,
 * 고를 때마다 오른쪽으로 옮겨 간다.
 *
 * 세로 크기는 mount 에서 회의 수를 보고 한 번 정하고 그 뒤 바뀌지 않는다
 * (S-view). 색은 모두 design-tokens 경유이고 문안은 `params.t` 로 조회한다 (C10).
 * 타이머도 애니메이션 루프도 없다 — `destroy()` 는 그린 노드만 거둔다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  radii,
} from '@ffacet/core/runtime';

/** 막대 하나가 가질 수 있는 판정 상태. */
export type GreedyBarState = 'idle' | 'visiting' | 'picked' | 'skipped';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로 배치
const CANVAS_W = PIECE_CANVAS_W;
const GUTTER_W = 78; // 왼쪽 라벨 자리
const TRACK_X0 = GUTTER_W;
const TRACK_X1 = CANVAS_W - 16;

// ── 세로 배치. 위쪽 띠는 캡션(15) · 눈금 숫자(34) · last_end 칩(40~54) · 축(58)
//    순으로 층을 나눠 겹치지 않게 둔다. 세로선은 칩 바로 아래에서 시작하므로
//    눈금 숫자를 가로지르지 않는다.
const CAPTION_BASE_Y = 15;
const TICK_LABEL_Y = 34;
const AXIS_Y = 58;
const ROWS_Y0 = 66;
const ROW_H = 26;
const BAR_H = 16;
const BAR_DY = (ROW_H - BAR_H) / 2;
const FOOTER_GAP = 12;
const ROOM_TITLE_DY = 16;
const ROOM_TRACK_DY = 22;
const ROOM_H = 20;
const BOTTOM_PAD = 10;

const DEFAULT_ROWS = 8;
const DEFAULT_T_MAX = 12;

/** SVG `rx` 는 숫자를 받는다. 토큰의 '3px' 에서 수치만 뽑아 쓴다. */
const RX = parseFloat(radii.sm);

const OVERLAP_OPACITY = '0.8';
const IDLE_BAR_OPACITY = '0.9';

function stageHeight(rows: number): number {
  return (
    ROWS_Y0 + rows * ROW_H + FOOTER_GAP + ROOM_TRACK_DY + ROOM_H + BOTTOM_PAD
  );
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function numArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is number => typeof x === 'number');
}

export const greedyStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: stageHeight(DEFAULT_ROWS), fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽** 만 비운다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // ── 마운트 시점의 자료로 크기를 한 번 정한다. 이후 바뀌지 않는다.
    const seed = params.initialData as { starts?: unknown; ends?: unknown } | undefined;
    let starts = numArray(seed?.starts);
    let ends = numArray(seed?.ends);
    const rows = Math.max(1, Math.min(starts.length, ends.length) || DEFAULT_ROWS);
    const maxEnd = ends.length > 0 ? Math.max(...ends) : DEFAULT_T_MAX - 1;
    const tMax = Math.max(1, maxEnd + 1);
    const height = stageHeight(rows);
    svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${height}`);

    const unit = (TRACK_X1 - TRACK_X0) / tMax;
    const X = (t: number): number => TRACK_X0 + t * unit;
    const rowY = (i: number): number => ROWS_Y0 + i * ROW_H;
    const rowMid = (i: number): number => rowY(i) + ROW_H / 2;

    const root = el('g', {});
    svg.appendChild(root);

    // ── 캡션
    const caption = el('text', {
      x: 12,
      y: CAPTION_BASE_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(caption);

    // ── 시간 눈금
    const axis = el('g', {});
    root.appendChild(axis);
    axis.appendChild(
      el('line', {
        x1: TRACK_X0,
        y1: AXIS_Y,
        x2: TRACK_X1,
        y2: AXIS_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    for (let t = 0; t <= tMax; t++) {
      const x = X(t);
      axis.appendChild(
        el('line', {
          x1: x,
          y1: AXIS_Y - 4,
          x2: x,
          y2: AXIS_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      // 눈금 숫자는 표식이다 — 키를 만들지 않는다 (C10).
      const label = el('text', {
        x,
        y: TICK_LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = String(t);
      axis.appendChild(label);
      // 세로 안내선 — 막대 뒤로 옅게 내린다.
      axis.appendChild(
        el('line', {
          x1: x,
          y1: AXIS_Y,
          x2: x,
          y2: ROWS_Y0 + rows * ROW_H,
          stroke: colors.border,
          'stroke-width': 1,
          opacity: '0.45',
        }),
      );
    }

    // ── 회의 줄
    type Row = {
      label: SVGTextElement;
      bar: SVGRectElement;
      overlap: SVGRectElement;
      probe: SVGGElement;
      probeLine: SVGLineElement;
      probeCapA: SVGLineElement;
      probeCapB: SVGLineElement;
      state: GreedyBarState;
    };

    const rowsG = el('g', {});
    root.appendChild(rowsG);
    const rowNodes: Row[] = [];

    for (let i = 0; i < rows; i++) {
      const g = el('g', {});
      rowsG.appendChild(g);

      const label = el('text', {
        x: GUTTER_W - 10,
        y: rowMid(i) + 4,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      g.appendChild(label);

      const bar = el('rect', {
        x: TRACK_X0,
        y: rowY(i) + BAR_DY,
        width: 0,
        height: BAR_H,
        rx: RX,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
        opacity: IDLE_BAR_OPACITY,
      });
      g.appendChild(bar);

      const overlap = el('rect', {
        x: TRACK_X0,
        y: rowY(i) + BAR_DY,
        width: 0,
        height: BAR_H,
        rx: RX,
        fill: colors.danger,
        opacity: OVERLAP_OPACITY,
        visibility: 'hidden',
      });
      g.appendChild(overlap);

      const probe = el('g', { visibility: 'hidden' });
      const probeLine = el('line', {
        x1: 0,
        y1: rowMid(i),
        x2: 0,
        y2: rowMid(i),
        stroke: colors.success,
        'stroke-width': 2,
        'stroke-dasharray': '3 2',
      });
      const probeCapA = el('line', {
        x1: 0,
        y1: rowMid(i) - 6,
        x2: 0,
        y2: rowMid(i) + 6,
        stroke: colors.success,
        'stroke-width': 2,
      });
      const probeCapB = el('line', {
        x1: 0,
        y1: rowMid(i) - 6,
        x2: 0,
        y2: rowMid(i) + 6,
        stroke: colors.success,
        'stroke-width': 2,
      });
      probe.appendChild(probeLine);
      probe.appendChild(probeCapA);
      probe.appendChild(probeCapB);
      g.appendChild(probe);

      rowNodes.push({ label, bar, overlap, probe, probeLine, probeCapA, probeCapB, state: 'idle' });
    }

    // ── last_end 세로선. 그리디가 끌고 다니는 상태의 전부다.
    const boundaryG = el('g', { visibility: 'hidden' });
    root.appendChild(boundaryG);
    const boundaryLine = el('line', {
      x1: TRACK_X0,
      y1: AXIS_Y - 4,
      x2: TRACK_X0,
      y2: ROWS_Y0 + rows * ROW_H + 4,
      stroke: colors.accent,
      'stroke-width': 2,
    });
    boundaryG.appendChild(boundaryLine);
    const boundaryChip = el('rect', {
      x: TRACK_X0 - 13,
      y: AXIS_Y - 18,
      width: 26,
      height: 14,
      rx: RX,
      fill: colors.accent,
    });
    boundaryG.appendChild(boundaryChip);
    const boundaryText = el('text', {
      x: TRACK_X0,
      y: AXIS_Y - 7,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: colors.stateInk,
    });
    boundaryG.appendChild(boundaryText);

    // ── 회의실 한 줄. 고른 회의만 여기 놓인다.
    const footY = ROWS_Y0 + rows * ROW_H + FOOTER_GAP;
    root.appendChild(
      el('line', {
        x1: 12,
        y1: footY,
        x2: CANVAS_W - 12,
        y2: footY,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    const roomTitle = el('text', {
      x: 12,
      y: footY + ROOM_TITLE_DY,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    roomTitle.textContent = tr('label.room', 'Meeting room');
    root.appendChild(roomTitle);

    const summary = el('text', {
      x: CANVAS_W - 12,
      y: footY + ROOM_TITLE_DY,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(summary);

    const roomTrackY = footY + ROOM_TRACK_DY;
    root.appendChild(
      el('rect', {
        x: TRACK_X0,
        y: roomTrackY,
        width: TRACK_X1 - TRACK_X0,
        height: ROOM_H,
        rx: RX,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    const roomG = el('g', {});
    root.appendChild(roomG);

    // ── 상태
    let boundary = -1;
    let picked = 0;

    function spanLabel(i: number): string {
      // `[1, 4]` 는 기호 표기지만 대괄호와 쉼표의 자리를 저작자가 정할 수 있게
      // 키로 둔다 (quick-sort 의 `label.rangeSpan` 과 같은 판단).
      return tr('label.span', '[{start}, {end}]', { start: starts[i], end: ends[i] });
    }

    function paintRow(i: number): void {
      const r = rowNodes[i];
      const x0 = X(starts[i]);
      const x1 = X(ends[i]);
      r.bar.setAttribute('x', String(x0));
      r.bar.setAttribute('width', String(Math.max(2, x1 - x0)));
      r.label.textContent = spanLabel(i);

      switch (r.state) {
        case 'visiting':
          r.bar.setAttribute('fill', colors.itemComparing);
          r.bar.setAttribute('stroke', colors.itemComparing);
          r.bar.setAttribute('opacity', '1');
          r.label.setAttribute('fill', colors.text);
          break;
        case 'picked':
          r.bar.setAttribute('fill', colors.itemSorted);
          r.bar.setAttribute('stroke', colors.itemSorted);
          r.bar.setAttribute('opacity', '1');
          r.label.setAttribute('fill', colors.text);
          break;
        case 'skipped':
          r.bar.setAttribute('fill', colors.bgSubtle);
          r.bar.setAttribute('stroke', colors.border);
          r.bar.setAttribute('opacity', '1');
          r.label.setAttribute('fill', colors.textMuted);
          break;
        default:
          r.bar.setAttribute('fill', colors.itemDefault);
          r.bar.setAttribute('stroke', colors.border);
          r.bar.setAttribute('opacity', IDLE_BAR_OPACITY);
          r.label.setAttribute('fill', colors.textMuted);
      }
    }

    function paintAll(): void {
      for (let i = 0; i < rows; i++) paintRow(i);
    }

    function hideProbes(): void {
      for (const r of rowNodes) r.probe.setAttribute('visibility', 'hidden');
    }

    function drawBoundary(): void {
      if (boundary < 0) {
        boundaryG.setAttribute('visibility', 'hidden');
        return;
      }
      const x = X(boundary);
      boundaryG.setAttribute('visibility', 'visible');
      boundaryLine.setAttribute('x1', String(x));
      boundaryLine.setAttribute('x2', String(x));
      boundaryChip.setAttribute('x', String(x - 13));
      boundaryText.setAttribute('x', String(x));
      boundaryText.textContent = String(boundary);
    }

    function drawSummary(): void {
      summary.textContent = tr('label.summary', 'Chosen {picked} of {total}', {
        picked,
        total: rows,
      });
    }

    drawSummary();

    return {
      destroy(): void {
        root.remove();
      },

      setData(nextStarts: number[], nextEnds: number[]): void {
        starts = [...nextStarts];
        ends = [...nextEnds];
        paintAll();
      },

      /** 정렬 결과를 화면 순서에 반영한다. 항등 순열이면 아무것도 움직이지 않는다. */
      applyOrder(order: number[]): void {
        if (order.length !== rows) return;
        starts = order.map((k) => starts[k]);
        ends = order.map((k) => ends[k]);
        paintAll();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      setBoundary(lastEnd: number): void {
        boundary = lastEnd;
        drawBoundary();
      },

      setVisiting(index: number | null): void {
        hideProbes();
        for (let i = 0; i < rows; i++) {
          if (rowNodes[i].state === 'visiting') {
            rowNodes[i].state = 'idle';
            paintRow(i);
          }
        }
        if (index === null || index < 0 || index >= rows) return;
        if (rowNodes[index].state === 'idle') {
          rowNodes[index].state = 'visiting';
          paintRow(index);
        }
      },

      /** 견줌 한 번을 그린다 — 기준선과 이 회의의 시작 사이를 잰다. */
      setProbe(index: number | null, lastEnd: number, accepted: boolean): void {
        hideProbes();
        if (index === null || index < 0 || index >= rows) return;
        if (lastEnd < 0) return; // 첫 회의는 견줄 상대가 없다
        const r = rowNodes[index];
        const a = X(Math.min(lastEnd, starts[index]));
        const b = X(Math.max(lastEnd, starts[index]));
        const tone = accepted ? colors.success : colors.danger;
        for (const node of [r.probeLine, r.probeCapA, r.probeCapB]) {
          node.setAttribute('stroke', tone);
        }
        r.probeLine.setAttribute('x1', String(a));
        r.probeLine.setAttribute('x2', String(b));
        r.probeCapA.setAttribute('x1', String(a));
        r.probeCapA.setAttribute('x2', String(a));
        r.probeCapB.setAttribute('x1', String(b));
        r.probeCapB.setAttribute('x2', String(b));
        r.probe.setAttribute('visibility', 'visible');
      },

      /** 판정을 굳힌다. 건너뛴 회의는 겹치는 구간이 남아 이유가 보인다. */
      setDecision(index: number, state: 'picked' | 'skipped'): void {
        if (index < 0 || index >= rows) return;
        const r = rowNodes[index];
        r.state = state;
        paintRow(index);
        if (state === 'skipped' && boundary > starts[index]) {
          const a = X(starts[index]);
          const b = X(Math.min(ends[index], boundary));
          r.overlap.setAttribute('x', String(a));
          r.overlap.setAttribute('width', String(Math.max(2, b - a)));
          r.overlap.setAttribute('visibility', 'visible');
        } else {
          r.overlap.setAttribute('visibility', 'hidden');
        }
      },

      /** 고른 회의를 회의실 한 줄에 놓는다. 서로 닿지 않는 것이 눈에 보인다. */
      addToRoom(index: number): void {
        if (index < 0 || index >= rows) return;
        const x0 = X(starts[index]);
        const x1 = X(ends[index]);
        const block = el('rect', {
          x: x0,
          y: roomTrackY + 3,
          width: Math.max(2, x1 - x0),
          height: ROOM_H - 6,
          rx: RX,
          fill: colors.itemSorted,
        });
        roomG.appendChild(block);
        const text = el('text', {
          x: (x0 + x1) / 2,
          y: roomTrackY + ROOM_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textInverse,
        });
        text.textContent = spanLabel(index);
        roomG.appendChild(text);
        picked++;
        drawSummary();
      },

      reset(): void {
        boundary = -1;
        picked = 0;
        hideProbes();
        roomG.textContent = '';
        for (let i = 0; i < rows; i++) {
          rowNodes[i].state = 'idle';
          rowNodes[i].overlap.setAttribute('visibility', 'hidden');
        }
        paintAll();
        drawBoundary();
        drawSummary();
        caption.textContent = '';
      },
    };
  },
};
