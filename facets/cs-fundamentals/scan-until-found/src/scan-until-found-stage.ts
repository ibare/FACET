/**
 * scan-until-found-stage — 순차 탐색 조각(piece) 의 그림.
 *
 * ── 화면이 무엇으로 이루어져 있는가
 *
 *        ┌ 눈길 ─ 찾는 값을 들고 줄 위를 오른쪽으로 미끄러진다
 *        ▼
 *   [5][8][2][9][4]                ← 줄. 서 있지 않다. 한 벌뿐이고 두 번 훑린다
 *    ┆  ┆  ┆  ┆  ┆
 *                4
 *  (9)▓▓▓▓▓▓▓▓▓▓▌                  ← 첫 훑기의 자취. 찾은 자리에서 벽에 막혀 멎었다
 *                      5
 *  (6)▓▓▓▓▓▓▓▓▓▓▓▓▓▶︎               ← 둘째 훑기의 자취. 줄 끝을 지나 밖으로 나갔다
 *              ├─────┤             ← 두 자취의 길이 차이
 *
 * 줄은 한 벌만 그린다. 같은 눈길이 그 한 줄을 두 번 지나가고, 지나간 자취만
 * 아래에 한 줄씩 쌓인다. 두 자취가 나란히 놓이므로 길이를 눈으로 견줄 수 있다.
 *
 * ── 운동
 *
 * 눈길은 실제로 위치가 움직인다 (`transform: translateX`). 자취 토막은 왼쪽
 * 모서리를 축으로 `scaleX` 로 뻗어 나간다. 못 찾은 훑기의 꼬리는 줄 오른쪽
 * 끝을 지나 화살로 빠져나가고, 눈길도 화면 밖으로 사라진다. 색 전환은 칸의
 * 상태(들여다보는 중 / 이미 봄 / 찾음)에만 쓴다.
 *
 * ── 뒷일
 *
 * 스스로 다음 회차를 예약하는 루프는 없다. 애니메이션이 자리 잡을 동안
 * 기다리는 유한 타이머만 있고, `destroy()` 가 그것을 모두 거두면서 기다리던
 * 약속을 풀어 준다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로. 크기는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const W = PIECE_CANVAS_W;
/** 자취 왼쪽에 「찾는 값」 칩이 설 자리. */
const ROW_LEFT = 40;
/** 줄 오른쪽에 남겨 두는 자리. 여기가 「줄 밖」 이다 — 여백이 아니라 내용이다. */
const EXIT_MIN = 100;
const CELL_MAX_W = 96;
const CELL_GAP = 4;

// ── 세로.
const PROBE_Y = 12;
const PROBE_H = 28;
const PROBE_W = 46;
const POINTER_H = 9;
const ROW_Y = 50;
const ROW_H = 48;
const LANES_TOP = 126;
const LANE_H = 22;
const LANE_GAP = 24;
const CHIP = 22;
const CHIP_GAP = 8;

/**
 * 훑기 두 번 기준 세로 (126 + 2·22 + 24 + 16 + 24 + 12). 훑기 수가 다르면
 * mount 에서 한 번 다시 잰다 — 마운트 뒤로는 바꾸지 않는다 (S-view).
 */
const DEFAULT_H = 246;

// ── 지속시간. 걸음 간격(stepMs) 안에 다 끝나도록 잡는다 (S-piece).
const PROBE_ENTER_MS = 300;
const PROBE_MOVE_MS = 260;
const PROBE_EXIT_MS = 520;
const BLOCK_MS = 220;
const WALL_MS = 240;
const TAIL_MS = 460;
const MEASURE_MS = 400;
const CELL_FADE_MS = 170;
/**
 * 걸음 하나가 러너를 붙잡는 시간. 나머지 전환은 걸음 간격(stepMs) 안에서 마저
 * 논다 — 애니메이션 길이를 그대로 붙잡으면 열네 걸음이 두 배로 길어진다 (S-piece).
 */
const SETTLE_MS = 140;

type CellState = 'idle' | 'looking' | 'seen' | 'found';

type Lane = {
  laneY: number;
  chip: SVGGElement;
  chipText: SVGTextElement;
  marks: SVGGElement;
  count: SVGTextElement;
};

export type ScanUntilFoundStageInit = {
  values: number[];
  queries: number[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 전환을 걸기 전에 지금 값을 확정시킨다. 이것을 빼면 브라우저가 두 값을 합쳐 버린다. */
function settle(node: SVGElement): void {
  node.getBoundingClientRect();
}

function setOrigin(node: SVGElement, origin: string): void {
  node.style.setProperty('transform-box', 'fill-box');
  node.style.setProperty('transform-origin', origin);
}

export const scanUntilFoundStageView: CanvasView = {
  canvas: { height: DEFAULT_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);

    // ── 초기 데이터. 줄과 훑기 횟수가 여기서 나온다.
    const init = params.initialData as Partial<ScanUntilFoundStageInit> | undefined;
    const values: number[] = Array.isArray(init?.values)
      ? init.values.filter((v): v is number => typeof v === 'number')
      : [];
    const queryCount = Array.isArray(init?.queries) ? init.queries.length : 0;
    const n = Math.max(1, values.length);
    const passCount = Math.max(1, queryCount);

    // ── 폭을 캔버스에서 역산한다. 상수는 상한만 (S-piece).
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - ROW_LEFT - EXIT_MIN) / n));
    const cellBoxW = cellW - CELL_GAP;
    const rowEnd = ROW_LEFT + n * cellW;
    const tipX = W - 16;

    const lanesBottom = LANES_TOP + passCount * LANE_H + (passCount - 1) * LANE_GAP;
    const measureY = lanesBottom + 16;
    const captionY = measureY + 24;
    const height = captionY + 12;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

    const laneTop = (pass: number): number => LANES_TOP + pass * (LANE_H + LANE_GAP);
    const cellCenter = (i: number): number => ROW_LEFT + i * cellW + cellBoxW / 2;

    // ── 유한 타이머만 쓴다. destroy 가 모두 거두고 기다리던 약속을 풀어 준다.
    let destroyed = false;
    const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const id = setTimeout(() => {
          pending.delete(id);
          resolve();
        }, ms);
        pending.set(id, resolve);
      });

    const root = el('g', {});
    svg.appendChild(root);

    // ── 칸 경계를 자취까지 내려 긋는 눈금. 자취 한 토막 = 칸 하나임을 잇는다.
    const gGrid = el('g', {});
    root.appendChild(gGrid);
    for (let i = 0; i <= n; i++) {
      const x = ROW_LEFT + i * cellW - CELL_GAP / 2;
      gGrid.appendChild(
        el('line', {
          x1: x,
          y1: ROW_Y + ROW_H + 8,
          x2: x,
          y2: lanesBottom,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 6',
        }),
      );
    }

    // ── 줄. 한 벌만 그린다.
    const gRow = el('g', {});
    root.appendChild(gRow);
    const cellRects: SVGRectElement[] = [];
    const cellTexts: SVGTextElement[] = [];
    for (let i = 0; i < n; i++) {
      const rect = el('rect', {
        x: ROW_LEFT + i * cellW,
        y: ROW_Y,
        width: cellBoxW,
        height: ROW_H,
        rx: 5,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      rect.style.transition = `fill ${CELL_FADE_MS}ms linear, stroke ${CELL_FADE_MS}ms linear`;
      const text = el('text', {
        x: cellCenter(i),
        y: ROW_Y + ROW_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: c.text,
      });
      text.textContent = String(values[i] ?? '');
      text.style.transition = `fill ${CELL_FADE_MS}ms linear`;
      gRow.appendChild(rect);
      gRow.appendChild(text);
      cellRects.push(rect);
      cellTexts.push(text);
    }

    const paintCell = (i: number, state: CellState): void => {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (!rect || !text) return;
      if (state === 'looking') {
        rect.setAttribute('fill', c.itemComparing);
        rect.setAttribute('stroke', c.itemComparing);
        text.setAttribute('fill', c.stateInk);
      } else if (state === 'found') {
        rect.setAttribute('fill', c.itemPivot);
        rect.setAttribute('stroke', c.itemPivot);
        text.setAttribute('fill', c.stateInk);
      } else if (state === 'seen') {
        rect.setAttribute('fill', c.bgSubtle);
        rect.setAttribute('stroke', c.border);
        text.setAttribute('fill', c.textMuted);
      } else {
        rect.setAttribute('fill', c.itemDefault);
        rect.setAttribute('stroke', c.border);
        text.setAttribute('fill', c.text);
      }
    };

    /**
     * @param seenCount 이번 훑기에서 이미 지나온 칸 수
     * @param lookingAt 지금 들여다보는 칸. 없으면 -1
     * @param foundAt   찾은 칸. 없으면 -1
     */
    const paintRow = (seenCount: number, lookingAt: number, foundAt: number): void => {
      for (let i = 0; i < n; i++) {
        if (i === foundAt) paintCell(i, 'found');
        else if (i === lookingAt) paintCell(i, 'looking');
        else if (i < seenCount) paintCell(i, 'seen');
        else paintCell(i, 'idle');
      }
    };

    // ── 자취 줄. 훑기마다 한 줄씩 아래로 쌓인다.
    const gLanes = el('g', {});
    root.appendChild(gLanes);
    const lanes: Lane[] = [];
    for (let p = 0; p < passCount; p++) {
      const y = laneTop(p);
      const chip = el('g', { opacity: 0 });
      chip.appendChild(
        el('rect', {
          x: ROW_LEFT - CHIP_GAP - CHIP,
          y,
          width: CHIP,
          height: CHIP,
          rx: 5,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );
      const chipText = el('text', {
        x: ROW_LEFT - CHIP_GAP - CHIP / 2,
        y: y + CHIP / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      chip.appendChild(chipText);

      const marks = el('g', {});
      const count = el('text', {
        x: ROW_LEFT,
        y: y - 5,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
        opacity: 0,
      });

      gLanes.appendChild(chip);
      gLanes.appendChild(marks);
      gLanes.appendChild(count);
      lanes.push({ laneY: y, chip, chipText, marks, count });
    }

    // ── 길이 차이를 재는 자. 두 자취의 오른쪽 끝 사이를 잰다.
    const gMeasure = el('g', { opacity: 0 });
    root.appendChild(gMeasure);
    const dropLine = el('line', {
      x1: 0,
      y1: LANES_TOP - 12,
      x2: 0,
      y2: measureY + 6,
      stroke: c.textMuted,
      'stroke-width': 1,
      'stroke-dasharray': '3 4',
    });
    const measureBar = el('g', {});
    const measureLine = el('line', {
      x1: 0,
      y1: measureY,
      x2: 0,
      y2: measureY,
      stroke: c.text,
      'stroke-width': 2,
    });
    const tickL = el('line', {
      x1: 0,
      y1: measureY - 5,
      x2: 0,
      y2: measureY + 5,
      stroke: c.text,
      'stroke-width': 2,
    });
    const tickR = el('line', {
      x1: 0,
      y1: measureY - 5,
      x2: 0,
      y2: measureY + 5,
      stroke: c.text,
      'stroke-width': 2,
    });
    measureBar.appendChild(measureLine);
    measureBar.appendChild(tickL);
    measureBar.appendChild(tickR);
    gMeasure.appendChild(dropLine);
    gMeasure.appendChild(measureBar);
    setOrigin(measureBar, 'left center');

    // ── 눈길. 찾는 값을 들고 줄 위를 미끄러진다.
    const OFF_LEFT = -PROBE_W;
    const READY_X = ROW_LEFT - 14;
    const OFF_RIGHT = W + PROBE_W;
    const gProbe = el('g', { opacity: 0, transform: `translate(${OFF_LEFT} 0)` });
    root.appendChild(gProbe);
    gProbe.appendChild(
      el('rect', {
        x: -PROBE_W / 2,
        y: PROBE_Y,
        width: PROBE_W,
        height: PROBE_H,
        rx: 6,
        fill: c.primary,
      }),
    );
    gProbe.appendChild(
      el('path', {
        d: `M -7 ${PROBE_Y + PROBE_H} L 7 ${PROBE_Y + PROBE_H} L 0 ${PROBE_Y + PROBE_H + POINTER_H} Z`,
        fill: c.primary,
      }),
    );
    const probeText = el('text', {
      x: 0,
      y: PROBE_Y + PROBE_H / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
      fill: c.textInverse,
    });
    gProbe.appendChild(probeText);

    const glideProbe = (x: number, ms: number, easing: string): void => {
      gProbe.style.transition = `transform ${ms}ms ${easing}, opacity ${Math.round(ms / 2)}ms linear`;
      gProbe.setAttribute('transform', `translate(${x} 0)`);
      gProbe.setAttribute('opacity', '1');
    };

    const parkProbe = (x: number): void => {
      gProbe.style.transition = '';
      gProbe.setAttribute('transform', `translate(${x} 0)`);
      gProbe.setAttribute('opacity', '0');
      settle(gProbe);
    };

    // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다.
    const caption = el('text', {
      x: W / 2,
      y: captionY,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    root.appendChild(caption);

    /** 자취가 닿은 가장 오른쪽. 길이 차이를 잴 때 쓴다. */
    let farEndX = 0;

    const clearLane = (lane: Lane): void => {
      while (lane.marks.firstChild) lane.marks.removeChild(lane.marks.firstChild);
      lane.chip.setAttribute('opacity', '0');
      lane.chipText.textContent = '';
      lane.count.setAttribute('opacity', '0');
      lane.count.textContent = '';
    };

    const resetAll = (): void => {
      paintRow(0, -1, -1);
      for (const lane of lanes) clearLane(lane);
      gMeasure.setAttribute('opacity', '0');
      measureBar.style.transition = '';
      measureBar.setAttribute('transform', 'scale(0 1)');
      farEndX = 0;
      parkProbe(OFF_LEFT);
      caption.textContent = '';
    };

    resetAll();

    return {
      destroy(): void {
        destroyed = true;
        for (const [id, resolve] of pending) {
          clearTimeout(id);
          resolve();
        }
        pending.clear();
        root.remove();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      rewind(): void {
        resetAll();
      },

      /** 새 훑기가 시작된다. 칸 표시가 지워지고 눈길이 줄 앞으로 들어온다. */
      async beginPass(p: { pass: number; target: number }): Promise<void> {
        paintRow(0, -1, -1);
        const lane = lanes[p.pass];
        if (lane) {
          clearLane(lane);
          lane.chipText.textContent = String(p.target);
          lane.chip.setAttribute('opacity', '1');
        }
        probeText.textContent = String(p.target);
        parkProbe(OFF_LEFT);
        glideProbe(READY_X, PROBE_ENTER_MS, 'cubic-bezier(0.2, 0.7, 0.3, 1)');
        await wait(SETTLE_MS);
      },

      /** 눈길이 한 칸으로 옮겨 가 들여다보고, 자취가 그만큼 뻗는다. */
      async look(p: { pass: number; index: number; seen: number }): Promise<void> {
        paintRow(p.seen - 1, p.index, -1);
        glideProbe(cellCenter(p.index), PROBE_MOVE_MS, 'cubic-bezier(0.35, 0, 0.25, 1)');

        const lane = lanes[p.pass];
        if (lane) {
          const block = el('rect', {
            x: ROW_LEFT + p.index * cellW + 1,
            y: lane.laneY,
            width: cellW - 2,
            height: LANE_H,
            rx: 3,
            fill: c.itemComparing,
          });
          setOrigin(block, 'left center');
          block.setAttribute('transform', 'scale(0 1)');
          lane.marks.appendChild(block);
          settle(block);
          block.style.transition = `transform ${BLOCK_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`;
          block.setAttribute('transform', 'scale(1 1)');

          lane.count.textContent = String(p.seen);
          lane.count.setAttribute('x', String(ROW_LEFT + p.seen * cellW - CELL_GAP / 2));
          lane.count.setAttribute('opacity', '1');
        }
        farEndX = Math.max(farEndX, ROW_LEFT + p.seen * cellW);
        await wait(SETTLE_MS);
      },

      /** 찾았다. 자취 끝에 벽이 서고 눈길이 그 자리에서 멎는다. */
      async hit(p: { pass: number; index: number; seen: number }): Promise<void> {
        paintRow(p.seen - 1, -1, p.index);

        const lane = lanes[p.pass];
        if (lane) {
          const wall = el('rect', {
            x: ROW_LEFT + p.seen * cellW - 6,
            y: lane.laneY - 5,
            width: 6,
            height: LANE_H + 10,
            rx: 2,
            fill: c.itemPivot,
          });
          setOrigin(wall, 'center center');
          wall.setAttribute('transform', 'scale(1 0)');
          lane.marks.appendChild(wall);
          settle(wall);
          wall.style.transition = `transform ${WALL_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
          wall.setAttribute('transform', 'scale(1 1)');
        }
        await wait(SETTLE_MS);
      },

      /** 못 찾았다. 자취가 줄 끝을 지나 화살로 빠져나가고 눈길도 밖으로 사라진다. */
      async overrun(p: { pass: number; seen: number }): Promise<void> {
        paintRow(p.seen, -1, -1);

        const lane = lanes[p.pass];
        if (lane) {
          const y = lane.laneY;
          const head = tipX - 18;
          const tail = el('path', {
            d:
              `M ${rowEnd} ${y + 6} L ${head} ${y + 6} L ${head} ${y - 3} ` +
              `L ${tipX} ${y + LANE_H / 2} L ${head} ${y + LANE_H + 3} L ${head} ${y + LANE_H - 6} ` +
              `L ${rowEnd} ${y + LANE_H - 6} Z`,
            fill: c.danger,
          });
          setOrigin(tail, 'left center');
          tail.setAttribute('transform', 'scale(0 1)');
          lane.marks.appendChild(tail);
          settle(tail);
          tail.style.transition = `transform ${TAIL_MS}ms cubic-bezier(0.3, 0, 0.4, 1)`;
          tail.setAttribute('transform', 'scale(1 1)');
        }
        farEndX = Math.max(farEndX, tipX);
        glideProbe(OFF_RIGHT, PROBE_EXIT_MS, 'cubic-bezier(0.5, 0, 0.9, 0.6)');
        await wait(SETTLE_MS);
      },

      /** 두 자취의 길이 차이를 잰다. 이 조각이 하려던 말이 여기서 다 나온다. */
      async conclude(p: { stopped: number; exhausted: number }): Promise<void> {
        const stopX = ROW_LEFT + p.stopped * cellW;
        const endX = Math.max(farEndX, ROW_LEFT + p.exhausted * cellW);

        dropLine.setAttribute('x1', String(stopX));
        dropLine.setAttribute('x2', String(stopX));
        measureLine.setAttribute('x1', String(stopX));
        measureLine.setAttribute('x2', String(endX));
        tickL.setAttribute('x1', String(stopX));
        tickL.setAttribute('x2', String(stopX));
        tickR.setAttribute('x1', String(endX));
        tickR.setAttribute('x2', String(endX));

        measureBar.style.transition = '';
        measureBar.setAttribute('transform', 'scale(0 1)');
        gMeasure.setAttribute('opacity', '1');
        settle(measureBar);
        measureBar.style.transition = `transform ${MEASURE_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`;
        measureBar.setAttribute('transform', 'scale(1 1)');
        await wait(SETTLE_MS);
      },
    };
  },
};
