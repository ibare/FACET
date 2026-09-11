/**
 * trust-the-smallest stage — 세 줄에서 읽은 값이 가장 낮은 것으로 가라앉는 그림.
 *
 * ## 형태가 어디서 나왔는가
 *
 * 동사는 **가라앉는다**. 그래서 화면의 아래쪽 절반이 통째로 **자(meter)** 다.
 * 위에는 표가 있고, 키를 물으면 세 줄에서 읽은 값이 칸에서 떠올라 자의 꼭대기로
 * 간 다음 **제 높이까지 가라앉는다**. 큰 값은 덜 내려가고 작은 값은 더 내려간다.
 * 그 뒤 답 선이 가장 높은 값에서 출발해 **가장 낮은 값까지 내려앉는다.**
 *
 * 참값은 같은 자 위에 점선으로 깔려 있다. 견줄 값이 있으므로 잰 값을 자로 옮기는
 * 것이 정당하고, 견줌의 기준이 같은 계기 위에 있다 (S-piece PREFER).
 * 답 선이 점선 위에 내려앉거나 그보다 위에 멈추는 것 — 결코 아래로 내려가지
 * 않는 것 — 이 이 조각이 하는 말 전부다.
 *
 * 세로는 그림이 정하는 값이라 이 파일이 상수로 갖는다. 가로는 러너가 정한다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

type Cell = { row: number; col: number; value: number };

export type TrustTheSmallestScene = {
  depth: number;
  width: number;
  stream: Array<{ key: string; count: number }>;
};

// ── 세로. 표 띠와 자의 높이가 이 그림의 값이다.
const STAGE_W = PIECE_CANVAS_W;
const STAGE_H = 368;

const CHIP_Y = 16;
const CHIP_H = 24;
const CHIP_GAP = 8;
const CHIP_MAX_W = 108;

const COL_TAG_Y = 58;
const TABLE_Y = 64;
/** 표가 앉는 띠. 줄이 더 많아지면 높이를 늘리지 않고 줄 간격을 줄여 담는다 (S-view). */
const TABLE_BAND_H = 126;
const ROW_MAX_H = 42;

/** 자의 꼭대기 = 표에서 가장 큰 값. 바닥 = 0. */
const AXIS_TOP = 216;
const AXIS_BASE = 322;
const LANE_L = 92;
const LANE_R = 452;

const CAPTION_Y = 352;

/** 좌우 최소 여백 — 이름표가 앉는 자리. 칸 크기는 여기서 역산한다 (S-piece). */
const SIDE_MIN = 46;
const CELL_MAX_W = 112;

const TOKEN_W = 46;
const TOKEN_H = 20;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * `initialData` 를 좁힌다.
 *
 * 좁히개는 stage 가 내준다 — `mount` 가 그것을 받는 자리이고, projector 가 없어도
 * 반드시 불리는 유일한 경로다 (S-piece).
 */
export function readTrustScene(initialData: unknown): TrustTheSmallestScene {
  const d =
    typeof initialData === 'object' && initialData !== null
      ? (initialData as Record<string, unknown>)
      : {};
  const stream: Array<{ key: string; count: number }> = [];
  if (Array.isArray(d.stream)) {
    for (const raw of d.stream) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.key === 'string' && typeof item.count === 'number') {
        stream.push({ key: item.key, count: item.count });
      }
    }
  }
  return {
    depth: typeof d.depth === 'number' ? d.depth : 3,
    width: typeof d.width === 'number' ? d.width : 5,
    stream,
  };
}

export const trustTheSmallestStageView: CanvasView = {
  canvas: { height: STAGE_H },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 부른다. 이 view 는 캔버스 안쪽만 쓴다.
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 러너가 붙여 준 캔버스를 떼면
    // DOM 에 없는 SVG 에 그리게 된다 (S-view).
    svg.textContent = '';

    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const scene = readTrustScene(params.initialData);

    const depth = Math.max(1, scene.depth);
    const width = Math.max(1, scene.width);
    const keyCount = Math.max(1, scene.stream.length);

    // ── 크기는 캔버스에서 역산한다. 상수는 상한일 뿐이다.
    const cellW = Math.min(CELL_MAX_W, Math.floor((STAGE_W - SIDE_MIN * 2) / width));
    const tableX = Math.round((STAGE_W - cellW * width) / 2);
    const rowH = Math.min(ROW_MAX_H, Math.floor(TABLE_BAND_H / depth));
    const gutterR = tableX - 8;

    const chipW = Math.min(
      CHIP_MAX_W,
      Math.floor((STAGE_W - SIDE_MIN * 2 - CHIP_GAP * (keyCount - 1)) / keyCount),
    );
    const chipRowW = chipW * keyCount + CHIP_GAP * (keyCount - 1);
    const chipX0 = Math.round((STAGE_W - chipRowW) / 2);

    const cellCx = (col: number): number => tableX + col * cellW + cellW / 2;
    const cellCy = (row: number): number => TABLE_Y + row * rowH + rowH / 2;
    const chipCx = (i: number): number => chipX0 + i * (chipW + CHIP_GAP) + chipW / 2;
    const slotX = (i: number): number => LANE_L + ((i + 1) * (LANE_R - LANE_L)) / (depth + 1);

    const textNode = (
      x: number,
      y: number,
      content: string,
      opts: { fill: string; size: string; anchor?: string; family?: string },
    ): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size,
      });
      node.textContent = content;
      return node;
    };

    // ── 켜
    const root = el('g', {});
    const tableLayer = el('g', {});
    const meterLayer = el('g', {});
    const chipLayer = el('g', {});
    const probeLayer = el('g', {});
    const flyLayer = el('g', {});
    root.append(tableLayer, meterLayer, chipLayer, probeLayer, flyLayer);
    svg.appendChild(root);

    // ── 왼쪽 이름표 (도식에 새긴 표식이라 번역하지 않는다 — C10)
    tableLayer.appendChild(
      textNode(gutterR, CHIP_Y + CHIP_H / 2 + 4, 'stream', {
        fill: c.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
      }),
    );
    tableLayer.appendChild(
      textNode(gutterR, COL_TAG_Y, 'sketch', {
        fill: c.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
      }),
    );

    // ── 표
    const cellRects: SVGRectElement[][] = [];
    const cellTexts: SVGTextElement[][] = [];
    for (let col = 0; col < width; col += 1) {
      tableLayer.appendChild(
        textNode(cellCx(col), COL_TAG_Y, `c${col}`, { fill: c.textMuted, size: fontSizes.xs }),
      );
    }
    for (let row = 0; row < depth; row += 1) {
      tableLayer.appendChild(
        textNode(gutterR, cellCy(row) + 4, `r${row}`, {
          fill: c.textMuted,
          size: fontSizes.xs,
          anchor: 'end',
        }),
      );
      const rects: SVGRectElement[] = [];
      const texts: SVGTextElement[] = [];
      for (let col = 0; col < width; col += 1) {
        const rect = el('rect', {
          x: tableX + col * cellW + 4,
          y: TABLE_Y + row * rowH + 4,
          width: cellW - 8,
          height: rowH - 8,
          rx: 3,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const value = textNode(cellCx(col), cellCy(row) + 4, '0', {
          fill: c.textMuted,
          size: fontSizes.sm,
          family: fonts.mono,
        });
        tableLayer.append(rect, value);
        rects.push(rect);
        texts.push(value);
      }
      cellRects.push(rects);
      cellTexts.push(texts);
    }

    // ── 자
    meterLayer.appendChild(
      el('line', {
        x1: LANE_L,
        y1: AXIS_BASE,
        x2: LANE_R,
        y2: AXIS_BASE,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    for (let i = 0; i < depth; i += 1) {
      meterLayer.appendChild(
        el('line', {
          x1: slotX(i),
          y1: AXIS_TOP,
          x2: slotX(i),
          y2: AXIS_BASE,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 5',
        }),
      );
      meterLayer.appendChild(
        textNode(slotX(i), AXIS_BASE + 14, `r${i}`, { fill: c.textMuted, size: fontSizes.xs }),
      );
    }

    // ── 칩 (키와 참값. 물어본 뒤에는 답도 함께 인다)
    const chipRects: SVGRectElement[] = [];
    const chipTexts: SVGTextElement[] = [];
    for (let i = 0; i < scene.stream.length; i += 1) {
      const rect = el('rect', {
        x: chipX0 + i * (chipW + CHIP_GAP),
        y: CHIP_Y,
        width: chipW,
        height: CHIP_H,
        rx: CHIP_H / 2,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      const value = textNode(chipCx(i), CHIP_Y + CHIP_H / 2 + 4, '', {
        fill: c.textMuted,
        size: fontSizes.xs,
        family: fonts.mono,
      });
      chipLayer.append(rect, value);
      chipRects.push(rect);
      chipTexts.push(value);
    }

    const captionNode = textNode(STAGE_W / 2, CAPTION_Y, '', {
      fill: c.text,
      size: fontSizes.sm,
    });
    root.appendChild(captionNode);

    // ── 기다림. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function tween(ms: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const schedule = (): void => {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            if (destroyed) return finish();
            const p = Math.min(1, (Date.now() - started) / ms);
            step(p);
            if (p >= 1) return finish();
            schedule();
          });
          frames.add(id);
        };
        step(0);
        schedule();
      });
    }

    // ── 상태
    /** 표에서 본 가장 큰 값. 자의 눈금이 여기서 나온다. */
    let scaleMax = 1;
    const results: Array<{ min: number; inflated: boolean } | null> = scene.stream.map(() => null);
    let sweepNode: SVGRectElement | null = null;

    const place = (node: SVGGElement, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${x}, ${y})`);
    };

    const chipLabel = (i: number): string => {
      const item = scene.stream[i];
      const done = results[i];
      const head = `${item.key} ×${item.count}`;
      return done === null ? head : `${head} → ${done.min}`;
    };

    const paintChip = (i: number, state: 'idle' | 'active' | 'query'): void => {
      const rect = chipRects[i];
      const node = chipTexts[i];
      const lit = state !== 'idle';
      rect.setAttribute('stroke', state === 'active' ? c.itemActive : lit ? c.itemPivot : c.border);
      rect.setAttribute('stroke-width', lit ? '2' : '1');
      const done = results[i];
      node.setAttribute(
        'fill',
        done?.inflated === true ? c.itemComparing : lit || done !== null ? c.text : c.textMuted,
      );
      node.textContent = chipLabel(i);
    };

    const resetChips = (): void => {
      for (let i = 0; i < chipRects.length; i += 1) paintChip(i, 'idle');
    };

    const paintCell = (row: number, col: number, mark: 'none' | 'touched' | 'read'): void => {
      const rect = cellRects[row][col];
      rect.setAttribute(
        'stroke',
        mark === 'touched' ? c.itemActive : mark === 'read' ? c.itemComparing : c.border,
      );
      rect.setAttribute('stroke-width', mark === 'none' ? '1' : '2');
    };

    const clearCellMarks = (): void => {
      for (let row = 0; row < depth; row += 1) {
        for (let col = 0; col < width; col += 1) paintCell(row, col, 'none');
      }
    };

    const setCellValue = (row: number, col: number, value: number): void => {
      const node = cellTexts[row][col];
      node.textContent = String(value);
      node.setAttribute('fill', value === 0 ? c.textMuted : c.text);
    };

    const clearProbe = (): void => {
      probeLayer.textContent = '';
    };

    const caption = (line: string): void => {
      captionNode.textContent = line;
    };

    resetChips();

    // ── 걸음

    /** 키 하나가 들어온다. 알갱이가 칩에서 칸으로 내려가 값을 올린다. */
    async function ingest(input: { key: string; count: number; cells: Cell[] }): Promise<void> {
      const idx = scene.stream.findIndex((s) => s.key === input.key);
      clearProbe();
      clearCellMarks();
      resetChips();
      if (idx >= 0) paintChip(idx, 'active');
      caption(
        t('caption.ingest', 'Key "{key}" arrives {count} times. One cell in every row goes up.', {
          key: input.key,
          count: input.count,
        }),
      );

      const fromX = idx >= 0 ? chipCx(idx) : STAGE_W / 2;
      const fromY = CHIP_Y + CHIP_H / 2;
      const pills = input.cells.map(() => {
        const g = el('g', {});
        g.appendChild(
          el('rect', {
            x: -20,
            y: -10,
            width: 40,
            height: 20,
            rx: 6,
            fill: c.itemActive,
            stroke: c.itemActive,
          }),
        );
        g.appendChild(
          textNode(0, 4, `+${input.count}`, {
            fill: c.textInverse,
            size: fontSizes.xs,
            family: fonts.mono,
          }),
        );
        place(g, fromX, fromY);
        flyLayer.appendChild(g);
        return g;
      });

      await tween(240, (p) => {
        const e = easeOut(p);
        input.cells.forEach((cell, i) => {
          const toX = cellCx(cell.col);
          const toY = cellCy(cell.row);
          place(pills[i], fromX + (toX - fromX) * e, fromY + (toY - fromY) * e);
        });
      });

      for (const pill of pills) pill.remove();
      for (const cell of input.cells) {
        setCellValue(cell.row, cell.col, cell.value);
        paintCell(cell.row, cell.col, 'touched');
        scaleMax = Math.max(scaleMax, cell.value);
      }
      await wait(60);
    }

    /** 키 하나를 묻는다. 세 값이 가라앉고, 답이 가장 낮은 것까지 내려앉는다. */
    async function probe(input: {
      key: string;
      truth: number;
      min: number;
      reads: Cell[];
    }): Promise<void> {
      const idx = scene.stream.findIndex((s) => s.key === input.key);
      clearProbe();
      clearCellMarks();
      resetChips();
      if (idx >= 0) paintChip(idx, 'query');

      const unit = (AXIS_BASE - AXIS_TOP) / Math.max(1, scaleMax);
      const levelOf = (value: number): number => AXIS_BASE - value * unit;
      const truthY = levelOf(input.truth);
      const minY = levelOf(input.min);

      const under = el('g', {});
      const over = el('g', {});
      probeLayer.append(under, over);

      // 1. 견줄 자리를 먼저 깐다 — 참값.
      under.appendChild(
        el('line', {
          x1: LANE_L,
          y1: truthY,
          x2: LANE_R,
          y2: truthY,
          stroke: c.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '6 4',
        }),
      );
      over.appendChild(
        textNode(LANE_L - 10, truthY + 4, t('label.truth', 'true {n}', { n: input.truth }), {
          fill: c.textMuted,
          size: fontSizes.xs,
          anchor: 'end',
        }),
      );
      for (const read of input.reads) paintCell(read.row, read.col, 'read');
      await wait(110);

      // 2. 읽은 값이 칸에서 떠올라 자의 꼭대기로 간다.
      const bars: SVGLineElement[] = [];
      const tokens = input.reads.map((read) => {
        const g = el('g', {});
        const rect = el('rect', {
          x: -TOKEN_W / 2,
          y: -TOKEN_H / 2,
          width: TOKEN_W,
          height: TOKEN_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: c.itemComparing,
          'stroke-width': 1.5,
        });
        const value = textNode(0, 4, String(read.value), {
          fill: c.text,
          size: fontSizes.sm,
          family: fonts.mono,
        });
        g.append(rect, value);
        place(g, cellCx(read.col), cellCy(read.row));
        over.appendChild(g);
        return { g, rect, y: levelOf(read.value) };
      });

      await tween(230, (p) => {
        const e = easeOut(p);
        input.reads.forEach((read, i) => {
          const fromX = cellCx(read.col);
          const fromY = cellCy(read.row);
          place(tokens[i].g, fromX + (slotX(i) - fromX) * e, fromY + (AXIS_TOP - fromY) * e);
        });
      });

      // 3. 제 높이까지 가라앉는다. 밑에 남는 길이가 곧 그 값이다.
      for (let i = 0; i < tokens.length; i += 1) {
        const bar = el('line', {
          x1: slotX(i),
          y1: AXIS_TOP,
          x2: slotX(i),
          y2: AXIS_BASE,
          stroke: c.itemComparing,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
        under.appendChild(bar);
        bars.push(bar);
      }
      await tween(230, (p) => {
        const e = easeInOut(p);
        tokens.forEach((token, i) => {
          const y = AXIS_TOP + (token.y - AXIS_TOP) * e;
          place(token.g, slotX(i), y);
          bars[i].setAttribute('y1', String(y));
        });
      });

      // 4. 답이 가장 높은 값에서 출발해 가장 낮은 값까지 내려앉는다.
      const maxValue = input.reads.reduce((acc, read) => Math.max(acc, read.value), 0);
      const startY = levelOf(maxValue);
      const answer = el('line', {
        x1: LANE_L,
        y1: startY,
        x2: LANE_R,
        y2: startY,
        stroke: c.text,
        'stroke-width': 2,
      });
      over.appendChild(answer);
      await tween(240, (p) => {
        const y = startY + (minY - startY) * easeInOut(p);
        answer.setAttribute('y1', String(y));
        answer.setAttribute('y2', String(y));
        tokens.forEach((token, i) => {
          if (y <= token.y + 0.5) return;
          // 지나친 값은 답이 아니다.
          token.rect.setAttribute('stroke', c.border);
          bars[i].setAttribute('stroke', c.border);
        });
      });

      tokens.forEach((token, i) => {
        if (token.y < minY - 0.5) return;
        token.rect.setAttribute('stroke', c.itemPivot);
        token.rect.setAttribute('stroke-width', '2');
        bars[i].setAttribute('stroke', c.itemPivot);
      });
      over.appendChild(
        textNode(LANE_R + 10, minY + 4, t('label.answer', 'min {n}', { n: input.min }), {
          fill: c.text,
          size: fontSizes.xs,
          anchor: 'start',
        }),
      );

      const inflated = input.min > input.truth;
      if (inflated) {
        // 참값과 답 사이가 부푼 만큼이다.
        under.insertBefore(
          el('rect', {
            x: LANE_L,
            y: minY,
            width: LANE_R - LANE_L,
            height: truthY - minY,
            fill: c.itemComparing,
            'fill-opacity': 0.14,
          }),
          under.firstChild,
        );
        caption(
          t(
            'caption.inflated',
            'Three rows read "{key}"; the answer sinks to {min}, yet the true count is {truth}. Shared cells puffed it up.',
            { key: input.key, min: input.min, truth: input.truth },
          ),
        );
      } else {
        caption(
          t(
            'caption.exact',
            'Three rows read "{key}"; the answer sinks to {min} — exactly the true count.',
            { key: input.key, min: input.min },
          ),
        );
      }

      if (idx >= 0) {
        results[idx] = { min: input.min, inflated };
        paintChip(idx, 'query');
      }
      await wait(70);
    }

    /** 다 물어본 뒤. 칩 줄을 한 번 훑어 다섯이 같은 말을 한다는 것을 보인다. */
    async function verdict(input: { keys: number }): Promise<void> {
      clearCellMarks();
      resetChips();
      caption(
        t(
          'caption.verdict',
          'Across all {n} keys, the smallest reading never fell below the true count.',
          { n: input.keys },
        ),
      );
      const sweep = el('rect', {
        x: chipX0,
        y: CHIP_Y - 5,
        width: 0,
        height: CHIP_H + 10,
        rx: (CHIP_H + 10) / 2,
        fill: c.accent,
        'fill-opacity': 0.2,
      });
      chipLayer.insertBefore(sweep, chipLayer.firstChild);
      sweepNode = sweep;
      await tween(260, (p) => {
        sweep.setAttribute('width', String(Math.round(chipRowW * easeOut(p))));
      });
      await wait(60);
    }

    /** 처음으로 되감는다. */
    function rewind(): void {
      clearProbe();
      clearCellMarks();
      if (sweepNode !== null) {
        sweepNode.remove();
        sweepNode = null;
      }
      flyLayer.textContent = '';
      scaleMax = 1;
      for (let i = 0; i < results.length; i += 1) results[i] = null;
      for (let row = 0; row < depth; row += 1) {
        for (let col = 0; col < width; col += 1) setCellValue(row, col, 0);
      }
      resetChips();
      caption('');
    }

    return {
      ingest,
      probe,
      verdict,
      rewind,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 취소된 tick 은 아예 불리지 않으므로, 기다리던 것을 여기서 깨운다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
