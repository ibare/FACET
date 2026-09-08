/**
 * address-calc-stage — "번호가 곱셈을 거쳐 주소가 된다" 를 그리는 stage view.
 *
 * 화면은 두 층이다.
 *   위  메모리 — 기준 주소부터 원소 크기만큼 띄워 늘어선 칸.
 *   아래 계산 레일 — 번호가 왼쪽에서 들어와 곱셈 관문과 덧셈 관문을 지나며
 *        오프셋으로, 다시 주소로 바뀌어 오른쪽 끝에 선다.
 *
 * 마지막 걸음에서 주소는 레일을 떠나 제 칸으로 곧장 날아간다. 사이의 칸을
 * 지나지 않는 궤적 자체가 "훑지 않는다" 는 말이다 — 그래서 이 조각의 운동은
 * opacity 가 아니라 위치다.
 *
 * 화면에 새겨진 글자 (`i` · `i × 4` · `addr(i)` · `0x100C`) 는 수식·기호 표기라
 * 표식으로 두고 (C10 판정 1·3), 문장이 되는 캡션과 각주는 projector 가 번역해
 * 넘긴다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type Palette,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

type CellSpec = { index: number; addr: number; value: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표. 캔버스 폭만 토큰이고 (S-piece), 세로는 이 그림의 내용이 정한다.
const W = PIECE_CANVAS_W;
const H = 320;

const SIDE = 38;
const CELL_GAP = 8;
const CELL_Y = 42;
const CELL_H = 54;
const CELL_CY = CELL_Y + CELL_H / 2;
const ADDR_Y = 30;
const INDEX_Y = 112;

const PLATE_Y = 158;
const RAIL_Y = 214;
const GATE_Y = 172;
const GATE_H = 68;
const GATE_LABEL_Y = 192;
const SUB_Y = 258;

const SCALE_GATE_CX = 216;
const SCALE_GATE_W = 96;
const ADD_GATE_CX = 428;
const ADD_GATE_W = 152;

const START_X = 92;
const MID_X = 316;
const END_X = 552;
const CHIP_W = 66;
const CHIP_H = 34;

const LEAP_CTRL_Y = 138;

const CAPTION_Y = 288;
const NOTE_Y = 308;

// ── 시간. 걸음 사이의 읽을 시간은 algorithm 이 정하고 (initialData.stepMs),
//    한 걸음 안의 운동 길이는 그림의 사정이므로 여기 둔다.
const ENTER_MS = 260;
const GLIDE_MS = 240;
const GATE_HOLD_MS = 140;
const LEAP_MS = 520;
const FADE_MS = 180;
const LAY_MS = 420;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function label(
  x: number,
  y: number,
  content: string,
  size: string,
  fill: string,
  family: string,
): SVGTextElement {
  const node = el('text', {
    x,
    y,
    'text-anchor': 'middle',
    'font-family': family,
    'font-size': size,
    fill,
  });
  node.textContent = content;
  return node;
}

/** 0x100C 처럼 읽히도록. 주소 표기는 문안이 아니라 표식이다 (C10 판정 3). */
function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function quad(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export const addressCalcStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors: Palette = getColors(params.theme);

    const svg = params.canvas;

    const gCells = el('g', {});
    const gRail = el('g', {});
    const trail = el('path', {
      d: '',
      fill: 'none',
      stroke: colors.itemActive,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-dasharray': '5 5',
      opacity: 0,
    });
    const gChip = el('g', { opacity: 0, transform: `translate(${START_X}, ${RAIL_Y})` });
    svg.appendChild(gCells);
    svg.appendChild(gRail);
    svg.appendChild(trail);
    svg.appendChild(gChip);

    const chipBox = el('rect', {
      x: -CHIP_W / 2,
      y: -CHIP_H / 2,
      width: CHIP_W,
      height: CHIP_H,
      rx: 6,
      fill: colors.bg,
      stroke: colors.text,
      'stroke-width': 2,
    });
    const chipText = label(0, 5, '', fontSizes.md, colors.text, fonts.mono);
    gChip.appendChild(chipBox);
    gChip.appendChild(chipText);

    const caption = label(W / 2, CAPTION_Y, '', fontSizes.md, colors.text, fonts.body);
    const note = label(W / 2, NOTE_Y, '', fontSizes.xs, colors.textMuted, fonts.body);
    svg.appendChild(caption);
    svg.appendChild(note);

    // ── 데이터가 정하는 것들. showMemory 가 채운다.
    let centers: number[] = [];
    let boxes: SVGRectElement[] = [];
    let valueTexts: SVGTextElement[] = [];
    let addrTexts: SVGTextElement[] = [];
    let indexTexts: SVGTextElement[] = [];
    let scaleGate: SVGRectElement | null = null;
    let addGate: SVGRectElement | null = null;
    let activeCell = -1;

    // ── 취소 가능한 시간 진행. destroy 시 남은 운동을 전부 끝으로 밀어 정리한다.
    const pending = new Set<{ cancel(): void }>();

    function animate(ms: number, apply: (p: number) => void): Promise<void> {
      apply(0);
      if (typeof requestAnimationFrame !== 'function') {
        apply(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let frame = 0;
        let origin = -1;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          pending.delete(handle);
          apply(1);
          resolve();
        };
        const handle = {
          cancel: (): void => {
            if (frame) cancelAnimationFrame(frame);
            finish();
          },
        };
        const tick = (now: number): void => {
          if (settled) return;
          if (origin < 0) origin = now;
          const p = ms <= 0 ? 1 : Math.min(1, (now - origin) / ms);
          apply(p);
          if (p < 1) frame = requestAnimationFrame(tick);
          else finish();
        };
        pending.add(handle);
        frame = requestAnimationFrame(tick);
      });
    }

    const hold = (ms: number): Promise<void> => animate(ms, () => undefined);

    function placeChip(x: number, y: number): void {
      gChip.setAttribute('transform', `translate(${x}, ${y})`);
    }

    function glide(fromX: number, toX: number, ms: number): Promise<void> {
      return animate(ms, (p) => {
        const e = easeInOut(p);
        placeChip(fromX + (toX - fromX) * e, RAIL_Y);
      });
    }

    function paintCell(i: number, active: boolean): void {
      const box = boxes[i];
      const value = valueTexts[i];
      const addr = addrTexts[i];
      const idx = indexTexts[i];
      if (!box || !value || !addr || !idx) return;
      box.setAttribute('fill', active ? colors.itemActive : colors.bg);
      box.setAttribute('stroke', active ? colors.itemActive : colors.border);
      value.setAttribute('fill', active ? colors.textInverse : colors.text);
      addr.setAttribute('fill', active ? colors.text : colors.textMuted);
      idx.setAttribute('fill', active ? colors.text : colors.textMuted);
    }

    function clearActive(): void {
      if (activeCell >= 0) paintCell(activeCell, false);
      activeCell = -1;
      trail.setAttribute('opacity', '0');
      trail.setAttribute('d', '');
    }

    function markGate(gate: SVGRectElement | null, on: boolean): void {
      if (!gate) return;
      gate.setAttribute('stroke', on ? colors.itemActive : colors.border);
      gate.setAttribute('stroke-width', on ? '2.5' : '1.5');
    }

    function showMemory(cells: CellSpec[], base: number, unit: number): Promise<void> {
      while (gCells.firstChild) gCells.removeChild(gCells.firstChild);
      while (gRail.firstChild) gRail.removeChild(gRail.firstChild);
      centers = [];
      boxes = [];
      valueTexts = [];
      addrTexts = [];
      indexTexts = [];
      activeCell = -1;
      trail.setAttribute('opacity', '0');
      gChip.setAttribute('opacity', '0');
      placeChip(START_X, RAIL_Y);

      const n = cells.length;
      if (n === 0) return Promise.resolve();
      const cellW = (W - SIDE * 2 - CELL_GAP * (n - 1)) / n;
      const risers: SVGGElement[] = [];

      cells.forEach((cell, i) => {
        const x = SIDE + i * (cellW + CELL_GAP);
        const cx = x + cellW / 2;
        centers.push(cx);

        const riser = el('g', { opacity: 0 });
        const box = el('rect', {
          x,
          y: CELL_Y,
          width: cellW,
          height: CELL_H,
          rx: 5,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        const value = label(cx, CELL_CY + 6, String(cell.value), fontSizes.lg, colors.text, fonts.mono);
        const addr = label(cx, ADDR_Y, hex(cell.addr), fontSizes.xs, colors.textMuted, fonts.mono);
        const idx = label(cx, INDEX_Y, `arr[${cell.index}]`, fontSizes.xs, colors.textMuted, fonts.mono);
        riser.appendChild(box);
        riser.appendChild(value);
        riser.appendChild(addr);
        riser.appendChild(idx);
        gCells.appendChild(riser);

        risers.push(riser);
        boxes.push(box);
        valueTexts.push(value);
        addrTexts.push(addr);
        indexTexts.push(idx);
      });

      // 레일 — 번호가 지나가는 길. 관문 라벨은 데이터에서 나온다.
      gRail.appendChild(
        el('line', {
          x1: SIDE + 8,
          y1: RAIL_Y,
          x2: W - SIDE - 8,
          y2: RAIL_Y,
          stroke: colors.border,
          'stroke-width': 1.5,
        }),
      );
      scaleGate = el('rect', {
        x: SCALE_GATE_CX - SCALE_GATE_W / 2,
        y: GATE_Y,
        width: SCALE_GATE_W,
        height: GATE_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      addGate = el('rect', {
        x: ADD_GATE_CX - ADD_GATE_W / 2,
        y: GATE_Y,
        width: ADD_GATE_W,
        height: GATE_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      gRail.appendChild(scaleGate);
      gRail.appendChild(addGate);
      gRail.appendChild(
        label(SCALE_GATE_CX, GATE_LABEL_Y, `× ${unit}`, fontSizes.sm, colors.text, fonts.mono),
      );
      gRail.appendChild(
        label(ADD_GATE_CX, GATE_LABEL_Y, `+ ${hex(base)}`, fontSizes.sm, colors.text, fonts.mono),
      );
      gRail.appendChild(label(START_X, SUB_Y, 'i', fontSizes.xs, colors.textMuted, fonts.mono));
      gRail.appendChild(
        label(MID_X, SUB_Y, `i × ${unit}`, fontSizes.xs, colors.textMuted, fonts.mono),
      );
      gRail.appendChild(label(END_X, SUB_Y, 'addr(i)', fontSizes.xs, colors.textMuted, fonts.mono));
      gRail.appendChild(
        label(
          W / 2,
          PLATE_Y,
          `addr(i) = ${hex(base)} + i × ${unit}`,
          fontSizes.sm,
          colors.textMuted,
          fonts.mono,
        ),
      );

      // 칸이 왼쪽부터 차례로 자리에 내려앉는다.
      const stagger = 0.12;
      const span = 1 + (n - 1) * stagger;
      return animate(LAY_MS, (p) => {
        risers.forEach((riser, i) => {
          const local = Math.min(1, Math.max(0, p * span - i * stagger));
          riser.setAttribute('opacity', String(local));
          riser.setAttribute('transform', `translate(0, ${(1 - easeInOut(local)) * 14})`);
        });
      });
    }

    async function askIndex(index: number): Promise<void> {
      clearActive();
      chipText.textContent = String(index);
      await animate(ENTER_MS, (p) => {
        const e = easeInOut(p);
        gChip.setAttribute('opacity', String(e));
        placeChip(START_X - 44 + 44 * e, RAIL_Y);
      });
    }

    async function scaleToOffset(offset: number): Promise<void> {
      await glide(START_X, SCALE_GATE_CX, GLIDE_MS);
      markGate(scaleGate, true);
      chipText.textContent = String(offset);
      await hold(GATE_HOLD_MS);
      markGate(scaleGate, false);
      await glide(SCALE_GATE_CX, MID_X, GLIDE_MS);
    }

    async function addBase(addr: number): Promise<void> {
      await glide(MID_X, ADD_GATE_CX, GLIDE_MS);
      markGate(addGate, true);
      chipText.textContent = hex(addr);
      await hold(GATE_HOLD_MS);
      markGate(addGate, false);
      await glide(ADD_GATE_CX, END_X, GLIDE_MS);
    }

    async function landOn(index: number): Promise<void> {
      const cx = centers[index];
      if (cx === undefined) return;
      const ctrlX = (END_X + cx) / 2;
      trail.setAttribute('d', `M ${END_X} ${RAIL_Y} Q ${ctrlX} ${LEAP_CTRL_Y} ${cx} ${CELL_CY}`);
      trail.setAttribute('opacity', '1');

      // 길이를 표본으로 재서 dash 로 그려 나간다 — 궤적이 칩과 같이 자란다.
      let length = 0;
      let px = END_X;
      let py = RAIL_Y;
      for (let s = 1; s <= 24; s++) {
        const t = s / 24;
        const qx = quad(t, END_X, ctrlX, cx);
        const qy = quad(t, RAIL_Y, LEAP_CTRL_Y, CELL_CY);
        length += Math.hypot(qx - px, qy - py);
        px = qx;
        py = qy;
      }
      trail.setAttribute('stroke-dasharray', `${length}`);

      await animate(LEAP_MS, (p) => {
        const e = easeInOut(p);
        placeChip(quad(e, END_X, ctrlX, cx), quad(e, RAIL_Y, LEAP_CTRL_Y, CELL_CY));
        trail.setAttribute('stroke-dashoffset', String(length * (1 - e)));
      });
      trail.setAttribute('stroke-dasharray', '5 5');
      trail.setAttribute('stroke-dashoffset', '0');

      activeCell = index;
      paintCell(index, true);
      await animate(FADE_MS, (p) => gChip.setAttribute('opacity', String(1 - p)));
      placeChip(START_X, RAIL_Y);
    }

    function rewind(): void {
      clearActive();
      chipText.textContent = '';
      gChip.setAttribute('opacity', '0');
      placeChip(START_X, RAIL_Y);
      markGate(scaleGate, false);
      markGate(addGate, false);
    }

    return {
      showMemory,
      askIndex,
      scaleToOffset,
      addBase,
      landOn,
      rewind,
      setCaption(text: string) {
        caption.textContent = text;
      },
      setNote(text: string) {
        note.textContent = text;
      },
      destroy() {
        for (const handle of [...pending]) handle.cancel();
        pending.clear();
        svg.replaceChildren();
      },
    };
  },
};
