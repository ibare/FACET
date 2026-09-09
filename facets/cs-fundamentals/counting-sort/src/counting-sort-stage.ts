/**
 * counting-sort-stage — 카운팅 정렬 전용 화면.
 *
 * 세 줄을 한 표로 세워 두고 그 사이를 잇는다.
 *
 *   입력      arr[0..n-1]        훑고 있는 칸
 *   값 칸     0..k-1             개수 줄 + 시작 자리 줄
 *   출력      output[0..n-1]     자리마다 하나씩 채워진다
 *
 * 이 그림의 요점은 **주소 계산**이다. 값 하나가 자기 값 칸을 거쳐 자리 번호를
 * 받아 출력의 그 자리로 간다 — 그 경로를 꺾인 선 둘로 실제로 그린다. 견주는
 * 장면이 없다는 것이 선의 모양으로 드러난다.
 *
 * 조각 `countThenPlace` 가 이미 눈금이 쌓였다 굳는 그림을 그렸으므로 눈금을
 * 되풀이하지 않는다. 여기서 개수는 숫자와 길이 막대이고, 하나도 없는 값
 * (이 자료에서는 1 과 4) 은 점선 빈 칸으로 남는다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 폭·높이는 상수이고 칸 크기만 n·k 로
 * 나뉜다. 타이머를 쓰지 않으므로 `destroy()` 가 거둘 뒷일은 DOM 뿐이다.
 *
 * 화면 문자는 전부 `params.t` 로 조회한다 (C10). 숫자는 값이라 키를 두지 않는다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 680;
const CANVAS_H = 292;
const MARGIN = 24;
/** 왼쪽 줄 이름이 앉는 자리. 세 띠가 모두 이 오른쪽에서 시작해 세로로 맞는다. */
const GUTTER = 78;
const BAND_X = MARGIN + GUTTER;
const BAND_W = CANVAS_W - MARGIN - BAND_X;

const STEP_Y = 10;
const STEP_H = 22;

const INPUT_Y = 44;
const ROW_H = 40;

const BUCKET_Y = 100;
const HEAD_H = 22;
const COUNT_H = 34;
const START_H = 30;
const BUCKET_H = HEAD_H + COUNT_H + START_H;

const OUTPUT_Y = 202;
const CAPTION_Y = 268;

/** 입력 칸이 지나온 단계. */
export type CountingSortInputState = 'idle' | 'active' | 'counted' | 'consumed';

/** 왼쪽 위 걸음 표시. 세 걸음이 알고리즘의 세 루프와 하나씩 짝이다. */
export type CountingSortStep = 'count' | 'prefix' | 'place' | null;

type Link = { index: number; value: number; slot: number | null };

type Cell = { rect: SVGRectElement; text: SVGTextElement; tag: SVGTextElement | null };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

export const countingSortStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const initial = params.initialData as { values?: number[]; range?: number } | undefined;
    let values: number[] = Array.isArray(initial?.values) ? [...initial.values] : [];
    let range = typeof initial?.range === 'number' ? initial.range : maxPlusOne(values);

    function maxPlusOne(list: number[]): number {
      let out = 1;
      for (const v of list) out = Math.max(out, v + 1);
      return out;
    }

    // ── 상태. 그림은 이 상태에서만 나온다.
    let inputStates: CountingSortInputState[] = [];
    let counts: number[] = [];
    let starts: number[] = [];
    let startsKnown: boolean[] = [];
    let output: (number | null)[] = [];
    let cursor: number | null = null;
    let activeBucket: number | null = null;
    let link: Link | null = null;
    let step: CountingSortStep = null;
    let caption = '';

    function resetState(): void {
      inputStates = values.map(() => 'idle');
      counts = new Array<number>(range).fill(0);
      starts = new Array<number>(range).fill(0);
      startsKnown = new Array<boolean>(range).fill(false);
      output = values.map(() => null);
      cursor = null;
      activeBucket = null;
      link = null;
      step = null;
    }
    resetState();

    // ── 기하. n 과 k 로 칸 너비만 나뉘고 띠의 위치는 상수다.
    function slotGeom(count: number): { x0: number; w: number; gap: number } {
      const n = Math.max(1, count);
      const gap = n > 10 ? 4 : 8;
      const w = Math.max(18, Math.floor((BAND_W - gap * (n - 1)) / n));
      const used = w * n + gap * (n - 1);
      return { x0: BAND_X + (BAND_W - used) / 2, w, gap };
    }

    let rowGeom = slotGeom(values.length);
    let bucketGeom = slotGeom(range);

    const cellX = (i: number): number => rowGeom.x0 + i * (rowGeom.w + rowGeom.gap);
    const bucketX = (v: number): number => bucketGeom.x0 + v * (bucketGeom.w + bucketGeom.gap);
    const cellCx = (i: number): number => cellX(i) + rowGeom.w / 2;
    const bucketCx = (v: number): number => bucketX(v) + bucketGeom.w / 2;

    // ── 고정 레이어. 줄 이름과 걸음 표시는 한 번만 만든다.
    const linkLayer = el('g', {});
    const inputLayer = el('g', {});
    const bucketLayer = el('g', {});
    const outputLayer = el('g', {});
    const chromeLayer = el('g', {});
    svg.appendChild(linkLayer);
    svg.appendChild(inputLayer);
    svg.appendChild(bucketLayer);
    svg.appendChild(outputLayer);
    svg.appendChild(chromeLayer);

    function rowLabel(text: string, cy: number): void {
      const node = el('text', {
        x: BAND_X - 12,
        y: cy,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      node.textContent = text;
      chromeLayer.appendChild(node);
    }

    rowLabel(tr('label.input', 'input'), INPUT_Y + ROW_H / 2);
    rowLabel(tr('label.value', 'value'), BUCKET_Y + HEAD_H / 2);
    rowLabel(tr('label.count', 'count'), BUCKET_Y + HEAD_H + COUNT_H / 2);
    rowLabel(tr('label.start', 'start'), BUCKET_Y + HEAD_H + COUNT_H + START_H / 2);
    rowLabel(tr('label.output', 'output'), OUTPUT_Y + ROW_H / 2);

    // ── 걸음 표시 셋. 알고리즘의 세 루프와 하나씩 짝이다.
    const STEPS: { id: Exclude<CountingSortStep, null>; text: string }[] = [
      { id: 'count', text: tr('step.count', '1. count') },
      { id: 'prefix', text: tr('step.prefix', '2. add up') },
      { id: 'place', text: tr('step.place', '3. place') },
    ];
    const stepPills = STEPS.map((s, i) => {
      const w = 108;
      const x = BAND_X + i * (w + 8);
      const rect = el('rect', {
        x,
        y: STEP_Y,
        width: w,
        height: STEP_H,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const text = el('text', {
        x: x + w / 2,
        y: STEP_Y + STEP_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      text.textContent = s.text;
      chromeLayer.appendChild(rect);
      chromeLayer.appendChild(text);
      return { id: s.id, rect, text };
    });

    const captionNode = el('text', {
      x: CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    chromeLayer.appendChild(captionNode);

    // ── 그리기. 상태를 통째로 다시 그린다 — 칸이 스물 남짓이라 값싸다.

    function drawCell(
      layer: SVGGElement,
      x: number,
      y: number,
      w: number,
      h: number,
      opts: {
        fill: string;
        stroke: string;
        dashed?: boolean;
        label?: string;
        labelFill?: string;
        tag?: string;
      },
    ): Cell {
      const rect = el('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: 4,
        fill: opts.fill,
        stroke: opts.stroke,
        'stroke-width': 1.5,
      });
      if (opts.dashed === true) rect.setAttribute('stroke-dasharray', '4 3');
      layer.appendChild(rect);

      const text = el('text', {
        x: x + w / 2,
        y: y + h / 2 + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: opts.labelFill ?? colors.text,
      });
      text.textContent = opts.label ?? '';
      layer.appendChild(text);

      let tag: SVGTextElement | null = null;
      if (opts.tag !== undefined) {
        tag = el('text', {
          x: x + 5,
          y: y + 11,
          'text-anchor': 'start',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        tag.textContent = opts.tag;
        layer.appendChild(tag);
      }
      return { rect, text, tag };
    }

    function inputFill(state: CountingSortInputState): { fill: string; ink: string } {
      // 타일이 테마를 따라 뒤집으면 잉크도 뒤집고, 고정 타일이면 잉크도 고정한다.
      if (state === 'active') return { fill: colors.itemActive, ink: colors.stateInk };
      if (state === 'consumed') return { fill: colors.itemSorted, ink: colors.textInverse };
      if (state === 'counted') return { fill: colors.bgSubtle, ink: colors.text };
      return { fill: colors.itemDefault, ink: colors.text };
    }

    function renderInput(): void {
      inputLayer.textContent = '';
      for (let i = 0; i < values.length; i++) {
        const { fill, ink } = inputFill(inputStates[i] ?? 'idle');
        drawCell(inputLayer, cellX(i), INPUT_Y, rowGeom.w, ROW_H, {
          fill,
          stroke: cursor === i ? colors.accent : colors.border,
          label: String(values[i]),
          labelFill: ink,
          tag: String(i),
        });
      }
    }

    function renderBuckets(): void {
      bucketLayer.textContent = '';
      let maxCount = 1;
      for (const c of counts) maxCount = Math.max(maxCount, c);

      for (let v = 0; v < range; v++) {
        const x = bucketX(v);
        const w = bucketGeom.w;
        const empty = counts[v] === 0;
        const active = activeBucket === v;

        // 값 머리. 이 열이 어떤 값의 자리인지.
        drawCell(bucketLayer, x, BUCKET_Y, w, HEAD_H, {
          fill: active ? colors.accent : colors.bgSubtle,
          stroke: active ? colors.accent : colors.border,
          label: String(v),
          labelFill: active ? colors.stateInk : colors.textMuted,
        });

        // 개수. 하나도 없는 값은 점선 빈 칸으로 남는다.
        const countCell = drawCell(bucketLayer, x, BUCKET_Y + HEAD_H, w, COUNT_H, {
          fill: colors.itemDefault,
          stroke: colors.border,
          dashed: empty,
          label: String(counts[v] ?? 0),
          labelFill: empty ? colors.textMuted : colors.text,
        });
        countCell.text.setAttribute('y', String(BUCKET_Y + HEAD_H + COUNT_H / 2 - 4));

        // 개수 막대. 길이가 개수에 비례하고, 0 이면 아무것도 없다.
        const barMax = w - 16;
        const barW = Math.round((barMax * (counts[v] ?? 0)) / maxCount);
        if (barW > 0) {
          bucketLayer.appendChild(
            el('rect', {
              x: x + 8,
              y: BUCKET_Y + HEAD_H + COUNT_H - 9,
              width: barW,
              height: 5,
              rx: 2,
              fill: colors.itemSorted,
            }),
          );
        }

        // 시작 자리. 누적합을 지나기 전에는 아직 모르는 값이다.
        const known = startsKnown[v] === true;
        drawCell(bucketLayer, x, BUCKET_Y + HEAD_H + COUNT_H, w, START_H, {
          fill: active ? colors.accent : colors.itemDefault,
          stroke: active ? colors.accent : colors.border,
          dashed: !known,
          label: known ? String(starts[v]) : '',
          labelFill: active ? colors.stateInk : colors.text,
        });
      }
    }

    function renderOutput(): void {
      outputLayer.textContent = '';
      for (let p = 0; p < output.length; p++) {
        const filled = output[p] !== null;
        const justPlaced = link?.slot === p;
        drawCell(outputLayer, cellX(p), OUTPUT_Y, rowGeom.w, ROW_H, {
          fill: filled ? colors.itemSorted : colors.itemDefault,
          stroke: justPlaced ? colors.accent : colors.border,
          dashed: !filled,
          label: filled ? String(output[p]) : '',
          // 타일이 갈리면 잉크도 갈린다 — itemSorted 위는 textInverse, 빈 칸
          // (itemDefault) 위는 text 다 (S-view 잉크 대응표).
          labelFill: filled ? colors.textInverse : colors.text,
          tag: String(p),
        });
      }
    }

    /** 값 하나가 자기 값 칸을 거쳐 자리로 가는 길. 꺾인 선 둘. */
    function renderLink(): void {
      linkLayer.textContent = '';
      if (link === null) return;
      const stroke = colors.accent;

      const fromX = cellCx(link.index);
      const toX = bucketCx(link.value);
      const midUp = INPUT_Y + ROW_H + 8;
      linkLayer.appendChild(
        el('polyline', {
          points: `${fromX},${INPUT_Y + ROW_H} ${fromX},${midUp} ${toX},${midUp} ${toX},${BUCKET_Y}`,
          fill: 'none',
          stroke,
          'stroke-width': 2,
        }),
      );

      if (link.slot === null) return;
      const seatX = cellCx(link.slot);
      const bottom = BUCKET_Y + BUCKET_H;
      const midDown = bottom + 8;
      linkLayer.appendChild(
        el('polyline', {
          points: `${toX},${bottom} ${toX},${midDown} ${seatX},${midDown} ${seatX},${OUTPUT_Y}`,
          fill: 'none',
          stroke,
          'stroke-width': 2,
        }),
      );
    }

    function renderSteps(): void {
      for (const pill of stepPills) {
        const on = pill.id === step;
        pill.rect.setAttribute('fill', on ? colors.primary : colors.bgSubtle);
        pill.rect.setAttribute('stroke', on ? colors.primary : colors.border);
        pill.text.setAttribute('fill', on ? colors.textInverse : colors.textMuted);
      }
    }

    function render(): void {
      renderSteps();
      renderInput();
      renderBuckets();
      renderOutput();
      renderLink();
      captionNode.textContent = caption;
    }

    render();

    return {
      destroy(): void {
        // 타이머도 관찰자도 걸지 않았다. 캔버스는 러너가 붙인 것이라 안쪽만 비운다.
        svg.textContent = '';
      },

      setData(nextValues: number[], nextRange?: number): void {
        values = [...nextValues];
        range = typeof nextRange === 'number' ? Math.max(1, nextRange) : maxPlusOne(values);
        rowGeom = slotGeom(values.length);
        bucketGeom = slotGeom(range);
        resetState();
        render();
      },

      setCaption(text: string): void {
        caption = text;
        captionNode.textContent = caption;
      },

      setStep(next: CountingSortStep): void {
        step = next;
        renderSteps();
      },

      setCursor(index: number | null): void {
        for (let i = 0; i < inputStates.length; i++) {
          if (inputStates[i] === 'active') inputStates[i] = 'counted';
        }
        cursor = index;
        if (index !== null && index >= 0 && index < inputStates.length) {
          if (inputStates[index] !== 'consumed') inputStates[index] = 'active';
        }
        renderInput();
      },

      setInputState(index: number, state: CountingSortInputState): void {
        if (index < 0 || index >= inputStates.length) return;
        inputStates[index] = state;
        renderInput();
      },

      setActiveBucket(value: number | null): void {
        activeBucket = value;
        renderBuckets();
      },

      setCount(value: number, count: number): void {
        if (value < 0 || value >= range) return;
        counts[value] = count;
        renderBuckets();
      },

      setStart(value: number, start: number): void {
        if (value < 0 || value >= range) return;
        starts[value] = start;
        startsKnown[value] = true;
        renderBuckets();
      },

      placeInto(slot: number, value: number): void {
        if (slot < 0 || slot >= output.length) return;
        output[slot] = value;
        renderOutput();
      },

      setLink(index: number | null, value: number | null, slot: number | null): void {
        link =
          index === null || value === null ? null : { index, value, slot };
        renderLink();
        renderOutput();
      },

      clearLink(): void {
        link = null;
        renderLink();
        renderOutput();
      },

      finish(): void {
        cursor = null;
        activeBucket = null;
        link = null;
        step = null;
        render();
      },

      reset(): void {
        resetState();
        caption = '';
        render();
      },
    };
  },
};
