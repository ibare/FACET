/**
 * select-min-each-pass-stage — 훑음과 옮김이 시간상 떨어져 있음을 보이는 무대.
 *
 * 화면은 세 켜다.
 *   위쪽 레일   훑는 눈길이 지나는 길. 한 번 견줄 때마다 그 자리에 자국이 남는다.
 *   가운데 칸   값이 든 자리. 훑는 동안에는 하나도 움직이지 않는다.
 *   아래 레일   기억의 길. "지금까지 가장 작았던 자리" 표식이 여기를 건너다닌다.
 *
 * 그래서 다 훑고 나면 위에는 자국이 셋, 아래에는 건너간 자국이 하나 남고,
 * 값이 실제로 옮겨지는 것은 그 뒤에 딱 한 번이다. 견줌은 많고 이동은 적다는
 * 것이 세 켜에 남은 자국 수로 드러난다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 — viewBox 는 러너가 canvas.height 로 한 번
 * 정하고 여기서 다시 재지 않는다 (S-view). 캡션은 두 줄 자리를 늘 비워 둔다.
 *
 * 타이머: 애니메이션 대기용 setTimeout 을 쓰며 스스로 다음 회차를 예약하는
 * 루프는 없다. destroy() 가 걸린 타이머를 모두 걷고 대기 중이던 약속을 즉시
 * 풀어 준다.
 */

import { PIECE_CANVAS_W, getColors } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;

/** 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). */
const CELL_MAX_W = 132;
const SIDE_MIN = 40;
const CELL_GAP = 24;

const SCAN_RAIL_Y = 26;
const EYE_TIP_Y = 52;
const CELL_TOP = 108;
const CELL_H = 64;
const CELL_BOT = CELL_TOP + CELL_H;
const CHIP_TOP = 186;
const CHIP_H = 30;
const CHIP_W = 104;
const MEM_RAIL_Y = CHIP_TOP + CHIP_H / 2;
const CAP_Y1 = 238;
const CAP_Y2 = 256;

/** 값이 들려 올라가는 높이. 훑는 장치가 물러난 자리를 지나간다. */
const LIFT_DY = -48;

const EYE_MS = 200;
const LINK_MS = 180;
const HOP_MS = 300;
const RETRACT_MS = 240;
const LIFT_MS = 170;
const CROSS_MS = 340;
const DROP_MS = 170;
/** 만들자마자 움직이면 첫 프레임이 잘리므로 한 숨 둔다. */
const SETTLE_MS = 24;

/** 도형에 새겨진 글자 — 번역 대상이 아니다 (C10 표식 판정 1·2). */
const MIN_MARK = 'min';

const CAP_LINE_MAX = 60;

type CellState = 'default' | 'comparing' | 'marked' | 'sorted' | 'empty';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
  return node;
}

export const selectMinEachPassStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const palette = getColors(params.theme);
    const svg = params.canvas;

    let destroyed = false;
    const waiters = new Set<{ id: ReturnType<typeof setTimeout>; release: () => void }>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const entry = {
          id: setTimeout(() => {
            waiters.delete(entry);
            resolve();
          }, ms),
          release: resolve,
        };
        waiters.add(entry);
      });

    const glide = (node: SVGElement, transform: string, ms: number): Promise<void> => {
      node.style.transition = `transform ${ms}ms cubic-bezier(0.33, 0, 0.2, 1), opacity ${ms}ms linear`;
      node.style.transform = transform;
      return wait(ms);
    };

    const settle = (node: SVGElement, transform: string): void => {
      node.style.transition = 'none';
      node.style.transform = transform;
    };

    // ── 켜 나누기. 뒤에 붙은 것이 위에 그려진다.
    const railLayer = svgEl('g', {});
    const trailLayer = svgEl('g', {});
    const cellLayer = svgEl('g', {});
    const chipLayer = svgEl('g', {});
    const linkLayer = svgEl('g', {});
    const eyeLayer = svgEl('g', {});
    const flyLayer = svgEl('g', {});
    const capLayer = svgEl('g', {});
    for (const layer of [railLayer, trailLayer, cellLayer, chipLayer, linkLayer, eyeLayer, flyLayer, capLayer]) {
      svg.appendChild(layer);
    }

    const capLine1 = svgEl('text', {
      x: W / 2,
      y: CAP_Y1,
      'text-anchor': 'middle',
      'font-size': 14,
      fill: palette.textMuted,
    });
    const capLine2 = svgEl('text', {
      x: W / 2,
      y: CAP_Y2,
      'text-anchor': 'middle',
      'font-size': 14,
      fill: palette.textMuted,
    });
    capLayer.appendChild(capLine1);
    capLayer.appendChild(capLine2);

    let initialValues: number[] = [];
    let values: number[] = [];
    let cellW = CELL_MAX_W;
    let originX = SIDE_MIN;

    let cellRects: SVGRectElement[] = [];
    let cellTexts: SVGTextElement[] = [];

    let eye: SVGGElement | null = null;
    let chip: SVGGElement | null = null;
    let chipStem: SVGLineElement | null = null;
    let chipRect: SVGRectElement | null = null;
    let chipMark: SVGTextElement | null = null;
    let chipValue: SVGTextElement | null = null;
    let lastTrailDot: SVGCircleElement | null = null;

    const cellX = (i: number): number => originX + i * (cellW + CELL_GAP);
    const cellCX = (i: number): number => cellX(i) + cellW / 2;

    const fillOf = (state: CellState): string => {
      if (state === 'comparing') return palette.itemComparing;
      if (state === 'marked') return palette.itemPivot;
      if (state === 'sorted') return palette.itemSorted;
      if (state === 'empty') return 'none';
      return palette.itemDefault;
    };

    // 타일이 테마를 따라 뒤집으면 잉크도 뒤집고, 고정 타일 위는 고정 잉크다.
    const inkOf = (state: CellState): string => {
      if (state === 'comparing' || state === 'marked') return palette.stateInk;
      if (state === 'sorted') return palette.textInverse;
      return palette.text;
    };

    const paintCell = (i: number, state: CellState): void => {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (!rect || !text) return;
      rect.setAttribute('fill', fillOf(state));
      rect.setAttribute('stroke', state === 'default' || state === 'empty' ? palette.border : fillOf(state));
      rect.setAttribute('stroke-dasharray', state === 'empty' ? '5 5' : 'none');
      text.setAttribute('fill', inkOf(state));
      text.setAttribute('opacity', state === 'empty' ? '0' : '1');
    };

    const clearLayer = (layer: SVGGElement): void => {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };

    const build = (source: number[]): void => {
      values = [...source];
      const n = values.length;
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2 - CELL_GAP * (n - 1)) / n));
      const span = n * cellW + CELL_GAP * (n - 1);
      originX = Math.round((W - span) / 2);

      for (const layer of [railLayer, trailLayer, cellLayer, chipLayer, linkLayer, eyeLayer, flyLayer]) {
        clearLayer(layer);
      }
      eye = null;
      chip = null;
      chipStem = null;
      chipRect = null;
      chipMark = null;
      chipValue = null;
      lastTrailDot = null;
      cellRects = [];
      cellTexts = [];

      railLayer.appendChild(
        svgEl('line', {
          x1: cellCX(0),
          y1: SCAN_RAIL_Y,
          x2: cellCX(n - 1),
          y2: SCAN_RAIL_Y,
          stroke: palette.border,
          'stroke-width': 2,
        }),
      );
      railLayer.appendChild(
        svgEl('line', {
          x1: cellCX(0),
          y1: MEM_RAIL_Y,
          x2: cellCX(n - 1),
          y2: MEM_RAIL_Y,
          stroke: palette.border,
          'stroke-width': 2,
          'stroke-dasharray': '3 6',
        }),
      );

      for (let i = 0; i < n; i += 1) {
        const rect = svgEl('rect', {
          x: cellX(i),
          y: CELL_TOP,
          width: cellW,
          height: CELL_H,
          rx: 10,
          'stroke-width': 1.5,
        });
        const text = svgEl('text', {
          x: cellCX(i),
          y: CELL_TOP + CELL_H / 2 + 9,
          'text-anchor': 'middle',
          'font-size': 26,
          'font-weight': 600,
        });
        text.textContent = String(values[i]);
        cellLayer.appendChild(rect);
        cellLayer.appendChild(text);
        cellRects.push(rect);
        cellTexts.push(text);
        paintCell(i, 'default');
      }
    };

    const makeEye = (index: number): SVGGElement => {
      const group = svgEl('g', {});
      group.appendChild(
        svgEl('circle', { cx: 0, cy: SCAN_RAIL_Y, r: 5, fill: palette.text }),
      );
      group.appendChild(
        svgEl('line', {
          x1: 0,
          y1: SCAN_RAIL_Y + 5,
          x2: 0,
          y2: EYE_TIP_Y - 11,
          stroke: palette.text,
          'stroke-width': 2,
        }),
      );
      group.appendChild(
        svgEl('path', {
          d: `M -7 ${EYE_TIP_Y - 11} L 7 ${EYE_TIP_Y - 11} L 0 ${EYE_TIP_Y} Z`,
          fill: palette.text,
        }),
      );
      settle(group, `translate(${cellCX(index)}px, 0px)`);
      eyeLayer.appendChild(group);
      return group;
    };

    const makeChip = (index: number, value: number): void => {
      const group = svgEl('g', {});
      const stem = svgEl('line', {
        x1: 0,
        y1: CELL_BOT,
        x2: 0,
        y2: CHIP_TOP,
        stroke: palette.itemPivot,
        'stroke-width': 3,
      });
      const rect = svgEl('rect', {
        x: -CHIP_W / 2,
        y: CHIP_TOP,
        width: CHIP_W,
        height: CHIP_H,
        rx: CHIP_H / 2,
        fill: palette.itemPivot,
        stroke: palette.itemPivot,
        'stroke-width': 1.5,
      });
      const mark = svgEl('text', {
        x: -CHIP_W / 2 + 15,
        y: MEM_RAIL_Y + 4,
        'font-size': 12,
        'letter-spacing': 0.5,
        fill: palette.stateInk,
      });
      mark.textContent = MIN_MARK;
      const valueText = svgEl('text', {
        x: CHIP_W / 2 - 15,
        y: MEM_RAIL_Y + 6,
        'text-anchor': 'end',
        'font-size': 18,
        'font-weight': 600,
        fill: palette.stateInk,
      });
      valueText.textContent = String(value);
      group.appendChild(stem);
      group.appendChild(rect);
      group.appendChild(mark);
      group.appendChild(valueText);
      chipLayer.appendChild(group);
      chip = group;
      chipStem = stem;
      chipRect = rect;
      chipMark = mark;
      chipValue = valueText;
      settle(group, `translate(${cellCX(index)}px, 18px)`);
      group.style.opacity = '0';
    };

    const makeFlyTile = (index: number, value: number, state: CellState): SVGGElement => {
      const group = svgEl('g', {});
      group.appendChild(
        svgEl('rect', {
          x: cellX(index),
          y: CELL_TOP,
          width: cellW,
          height: CELL_H,
          rx: 10,
          fill: fillOf(state),
          stroke: state === 'default' ? palette.border : fillOf(state),
          'stroke-width': 1.5,
        }),
      );
      const text = svgEl('text', {
        x: cellCX(index),
        y: CELL_TOP + CELL_H / 2 + 9,
        'text-anchor': 'middle',
        'font-size': 26,
        'font-weight': 600,
        fill: inkOf(state),
      });
      text.textContent = String(value);
      group.appendChild(text);
      settle(group, 'translate(0px, 0px)');
      flyLayer.appendChild(group);
      return group;
    };

    const splitCaption = (text: string): [string, string] => {
      if (text.length <= CAP_LINE_MAX) return [text, ''];
      const words = text.split(' ');
      let head = '';
      let i = 0;
      while (i < words.length) {
        const next = head ? `${head} ${words[i]}` : String(words[i]);
        if (head && next.length > CAP_LINE_MAX) break;
        head = next;
        i += 1;
      }
      return [head, words.slice(i).join(' ')];
    };

    const api = {
      init(source: number[]): void {
        initialValues = [...source];
        build(initialValues);
        capLine1.textContent = '';
        capLine2.textContent = '';
      },

      reset(): void {
        build(initialValues);
        capLine1.textContent = '';
        capLine2.textContent = '';
      },

      setCaption(text: string): void {
        const [a, b] = splitCaption(text);
        capLine1.textContent = a;
        capLine2.textContent = b;
      },

      /** 후보 표식이 아래 레일에 올라오고, 눈길이 첫 자리에서 출발한다. */
      async placeMarker(p: { index: number; value: number }): Promise<void> {
        makeChip(p.index, p.value);
        eye = makeEye(p.index);
        paintCell(p.index, 'marked');
        await wait(SETTLE_MS);
        if (chip) {
          chip.style.opacity = '1';
          await glide(chip, `translate(${cellCX(p.index)}px, 0px)`, HOP_MS);
        }
      },

      /**
       * 눈길이 한 칸 건너가 표식이 쥔 값과 견준다.
       * 견줌은 표식에 닿을 뿐 값에는 닿지 않는다 — 잇는 선이 칸이 아니라
       * 표식으로 내려가는 것이 그 뜻이다.
       */
      async scan(p: { index: number; value: number; bestIndex: number; smaller: boolean }): Promise<void> {
        if (eye) await glide(eye, `translate(${cellCX(p.index)}px, 0px)`, EYE_MS);

        const dot = svgEl('circle', {
          cx: cellCX(p.index),
          cy: SCAN_RAIL_Y,
          r: 3.5,
          fill: palette.textMuted,
        });
        trailLayer.appendChild(dot);
        lastTrailDot = dot;

        paintCell(p.index, 'comparing');

        const from = cellCX(p.index);
        const to = cellCX(p.bestIndex);
        const link = svgEl('path', {
          d: `M ${from} ${CELL_BOT + 2} Q ${(from + to) / 2} ${CHIP_TOP + 24} ${to} ${CHIP_TOP - 3}`,
          fill: 'none',
          stroke: palette.itemComparing,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        // 실측 대신 현을 넉넉히 잡는다 — 넘치는 dashoffset 은 그냥 다 감춘 상태다.
        const reach = Math.round((Math.abs(from - to) + (CHIP_TOP - CELL_BOT)) * 1.8);
        link.style.strokeDashoffset = String(reach);
        link.style.strokeDasharray = `${reach} ${reach}`;
        linkLayer.appendChild(link);
        await wait(SETTLE_MS);
        link.style.transition = `stroke-dashoffset ${LINK_MS}ms linear`;
        link.style.strokeDashoffset = '0';
        await wait(LINK_MS);

        if (!p.smaller) {
          // 되돌아 걷힌다. 아무 자국도 남기지 않는다.
          link.style.transition = `stroke-dashoffset ${LINK_MS}ms linear`;
          link.style.strokeDashoffset = String(reach);
          await wait(LINK_MS);
          paintCell(p.index, 'default');
        }
        if (link.parentNode) link.parentNode.removeChild(link);
      },

      /** 표식이 떼어져 새 자리로 건너가 다시 붙는다. 값은 그대로다. */
      async hopMarker(p: { from: number; to: number; value: number }): Promise<void> {
        paintCell(p.from, 'default');
        if (lastTrailDot) {
          lastTrailDot.setAttribute('r', '5.5');
          lastTrailDot.setAttribute('fill', palette.itemPivot);
          lastTrailDot.setAttribute('stroke', palette.text);
          lastTrailDot.setAttribute('stroke-width', '1.5');
        }
        if (chipStem) chipStem.setAttribute('y1', String(CHIP_TOP));
        if (chip) await glide(chip, `translate(${cellCX(p.to)}px, 0px)`, HOP_MS);
        if (chipStem) chipStem.setAttribute('y1', String(CELL_BOT));
        if (chipValue) chipValue.textContent = String(p.value);
        paintCell(p.to, 'marked');
      },

      /** 훑는 장치가 물러난다. 값을 옮길 자리가 여기서 비워진다. */
      async endScan(): Promise<void> {
        if (!eye) return;
        const target = eye;
        eye = null;
        const retracting = glide(target, `${target.style.transform} translate(0px, -46px)`, RETRACT_MS);
        target.style.opacity = '0';
        await retracting;
        if (target.parentNode) target.parentNode.removeChild(target);
      },

      /**
       * 비로소 한 번. 표식이 가리킨 값이 들려 올라가 맨 앞으로 건너가고,
       * 앞에 있던 값은 빈 자리로 미끄러진다.
       */
      async moveValue(p: { from: number; to: number; values: number[] }): Promise<void> {
        // 기억은 답을 내놓았으므로 손을 뗀다. 어디서 나왔는지만 남긴다.
        if (chipStem) chipStem.setAttribute('y1', String(CHIP_TOP));
        if (chipRect) {
          chipRect.setAttribute('fill', palette.bgSubtle);
          chipRect.setAttribute('stroke', palette.border);
        }
        if (chipValue) chipValue.setAttribute('fill', palette.textMuted);
        if (chipMark) chipMark.setAttribute('fill', palette.textMuted);

        const carried = makeFlyTile(p.from, values[p.from], 'marked');
        const displaced = makeFlyTile(p.to, values[p.to], 'default');
        paintCell(p.from, 'empty');
        paintCell(p.to, 'empty');
        await wait(SETTLE_MS);

        const dx = cellCX(p.to) - cellCX(p.from);
        await glide(carried, `translate(0px, ${LIFT_DY}px)`, LIFT_MS);
        void glide(displaced, `translate(${-dx}px, 0px)`, CROSS_MS);
        await glide(carried, `translate(${dx}px, ${LIFT_DY}px)`, CROSS_MS);
        await glide(carried, `translate(${dx}px, 0px)`, DROP_MS);

        for (const tile of [carried, displaced]) {
          if (tile.parentNode) tile.parentNode.removeChild(tile);
        }

        values = [...p.values];
        for (let i = 0; i < cellTexts.length; i += 1) {
          const text = cellTexts[i];
          if (text) text.textContent = String(values[i]);
        }
        paintCell(p.to, 'sorted');
        paintCell(p.from, 'default');
      },

      destroy(): void {
        destroyed = true;
        for (const entry of [...waiters]) {
          clearTimeout(entry.id);
          entry.release();
        }
        waiters.clear();
        for (const layer of [railLayer, trailLayer, cellLayer, chipLayer, linkLayer, eyeLayer, flyLayer, capLayer]) {
          clearLayer(layer);
          if (layer.parentNode) layer.parentNode.removeChild(layer);
        }
      },
    };

    return api;
  },
};
