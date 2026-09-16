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
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 한 자리만 흐르게 한다 (S-scene). 정적 그리기가 정본이라
 * 운동의 방향이 뒤집힌다 — 요소는 이미 끝 자리에 서 있고, 흐르게 할 때만 출발
 * 그림으로 되돌려 놓고 시작한다.
 *
 * 화면에 새겨진 글자 (`i` · `i × 4` · `addr(i)` · `0x100C`) 는 수식·기호 표기라
 * 표식으로 두고 (C10 판정 1·3), 문장이 되는 캡션은 장면이 말하려는 것과 인자만
 * 받아 여기서 `params.t` 로 만든다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  type Palette,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  AddressCaption,
  AddressCell,
  IndexAddressCalcScene,
  RailChip,
} from './scene.js';

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

/** 칩이 레일에 오를 때 왼쪽에서 밀려 들어오는 거리. */
const ENTER_DX = 44;
/** 칸이 내려앉는 높이. */
const LAY_DROP = 14;
/** 칸이 하나씩 늦게 내려앉는 몫. */
const LAY_STAGGER = 0.12;
/** 궤적의 길이를 재는 표본 수. */
const ARC_SAMPLES = 24;

const LEAP_CTRL_Y = 138;

const CAPTION_Y = 288;

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
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 — 저작자
    // 오버라이드가 얹힌 `params.t` 로만 조회한다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

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
    svg.appendChild(caption);

    // ── 장면이 정하는 것들. 매 render 마다 새로 세운다.
    let centers: number[] = [];
    let boxes: SVGRectElement[] = [];
    let valueTexts: SVGTextElement[] = [];
    let addrTexts: SVGTextElement[] = [];
    let indexTexts: SVGTextElement[] = [];
    let risers: SVGGElement[] = [];
    let scaleGate: SVGRectElement | null = null;
    let addGate: SVGRectElement | null = null;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 이 조각의 운동은 rAF 로 칩의 좌표를 프레임마다 고쳐 쓴다. 되짚기가 화면을
     * 새로 세운 뒤에도 앞 걸음의 운동이 살아 있으면 새 칩에 옛 좌표를 덮어쓴다 —
     * 되짚은 직후가 아니라 반 초쯤 뒤에 무너지므로 눈으로도 늦게야 잡힌다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 와 같은 모양).
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 이 조각의 운동은 관문 넷을 차례로 지나는 **사슬**이라 (미끄러짐 → 관문 → 다시
     * 미끄러짐) 중간에 되짚기가 끼어들면 남은 고리들이 즉시 모드로 곧장 끝값을 써
     * 버린다. 그 끝값은 이미 새로 선 화면을 덮는다. 고리마다 자기 번호가 아직
     * 유효한지 보고 멈춘다.
     */
    let epoch = 0;

    /**
     * 취소 가능한 시간 진행.
     *
     * 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧 덮어쓰기다.
     */
    function animate(ms: number, apply: (p: number) => void, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      if (destroyed || isInstant() || typeof requestAnimationFrame !== 'function') {
        apply(1);
        return Promise.resolve();
      }
      apply(0);
      return new Promise<void>((resolve) => {
        let origin = -1;
        let settled = false;
        let id = 0;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (settled) return;
          if (destroyed || !live()) {
            finish();
            return;
          }
          if (origin < 0) origin = now;
          const p = ms <= 0 ? 1 : Math.min(1, (now - origin) / ms);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    const hold = (ms: number, live: () => boolean): Promise<void> =>
      animate(ms, () => undefined, live);

    // ── 칩 ────────────────────────────────────────────────────────────────

    function placeChip(x: number, y: number): void {
      gChip.setAttribute('transform', `translate(${x}, ${y})`);
    }

    /** 보이는 칩에는 opacity 속성이 아예 없다 — 값으로 되돌리지 않고 거둔다. */
    function showChip(): void {
      gChip.removeAttribute('opacity');
    }

    function hideChip(): void {
      gChip.setAttribute('opacity', '0');
    }

    function chipLabel(chip: RailChip): string {
      switch (chip.stage) {
        case 'index':
          return String(chip.index);
        case 'offset':
          return String(chip.offset);
        case 'address':
          return hex(chip.addr);
      }
    }

    /** 관문의 차례가 곧 레일 위의 자리. 좌표는 장면이 아니라 여기가 안다. */
    function chipX(chip: RailChip): number {
      switch (chip.stage) {
        case 'index':
          return START_X;
        case 'offset':
          return MID_X;
        case 'address':
          return END_X;
      }
    }

    function glide(fromX: number, toX: number, live: () => boolean): Promise<void> {
      return animate(
        GLIDE_MS,
        (p) => placeChip(fromX + (toX - fromX) * easeInOut(p), RAIL_Y),
        live,
      );
    }

    // ── 칸과 궤적 ──────────────────────────────────────────────────────────

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

    function arcPath(cx: number): string {
      const ctrlX = (END_X + cx) / 2;
      return `M ${END_X} ${RAIL_Y} Q ${ctrlX} ${LEAP_CTRL_Y} ${cx} ${CELL_CY}`;
    }

    /** 곡선의 길이를 표본으로 잰다 — dash 로 그려 나가려면 총 길이가 있어야 한다. */
    function arcLength(cx: number): number {
      const ctrlX = (END_X + cx) / 2;
      let length = 0;
      let px = END_X;
      let py = RAIL_Y;
      for (let s = 1; s <= ARC_SAMPLES; s += 1) {
        const p = s / ARC_SAMPLES;
        const qx = quad(p, END_X, ctrlX, cx);
        const qy = quad(p, RAIL_Y, LEAP_CTRL_Y, CELL_CY);
        length += Math.hypot(qx - px, qy - py);
        px = qx;
        py = qy;
      }
      return length;
    }

    function showTrail(cx: number): void {
      trail.setAttribute('d', arcPath(cx));
      trail.setAttribute('opacity', '1');
      trail.setAttribute('stroke-dasharray', '5 5');
      // 지운다 — '0' 으로 되돌리지 않는다. 곧바로 세운 화면에는 이 속성이 아예
      // 없어, 남겨 두면 같은 걸음인데 화면이 갈린다 (S-scene).
      trail.removeAttribute('stroke-dashoffset');
    }

    function hideTrail(): void {
      trail.setAttribute('opacity', '0');
      trail.setAttribute('d', '');
      trail.setAttribute('stroke-dasharray', '5 5');
      trail.removeAttribute('stroke-dashoffset');
    }

    function markGate(gate: SVGRectElement | null, on: boolean): void {
      if (!gate) return;
      gate.setAttribute('stroke', on ? colors.itemActive : colors.border);
      gate.setAttribute('stroke-width', on ? '2.5' : '1.5');
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령을 따로 둘
    // 필요가 없고, 어느 걸음에서 어느 걸음으로 가든 같은 길이다.

    /** 늘 비우고 시작한다 (S-scene). */
    function rewind(): void {
      while (gCells.firstChild) gCells.removeChild(gCells.firstChild);
      while (gRail.firstChild) gRail.removeChild(gRail.firstChild);
      centers = [];
      boxes = [];
      valueTexts = [];
      addrTexts = [];
      indexTexts = [];
      risers = [];
      scaleGate = null;
      addGate = null;
      hideTrail();
      chipText.textContent = '';
      hideChip();
      placeChip(START_X, RAIL_Y);
      caption.textContent = '';
    }

    /** 칸을 늘어놓는다. 폭은 캔버스에서 역산하고 좌표는 번호가 정한다 (S-piece). */
    function drawCells(cells: AddressCell[]): void {
      const n = cells.length;
      if (n === 0) return;
      const cellW = (W - SIDE * 2 - CELL_GAP * (n - 1)) / n;

      cells.forEach((cell, i) => {
        const x = SIDE + i * (cellW + CELL_GAP);
        const cx = x + cellW / 2;
        centers.push(cx);

        const riser = el('g', {});
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
    }

    /** 레일 — 번호가 지나가는 길. 관문 라벨은 장면의 base · unit 에서 나온다. */
    function drawRail(base: number, unit: number): void {
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
    }

    function drawChip(chip: RailChip | null): void {
      if (chip === null) return;
      chipText.textContent = chipLabel(chip);
      showChip();
      placeChip(chipX(chip), RAIL_Y);
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: AddressCaption | null): void {
      if (cap === null) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'memory':
          caption.textContent = t(
            'caption.memory',
            'The array sits in memory: {unit} bytes per slot from {base}.',
            { unit: cap.unit, base: hex(cap.base) },
          );
          return;
        case 'ask':
          caption.textContent = t('caption.ask', 'Where is arr[{index}]?', { index: cap.index });
          return;
        case 'scale':
          caption.textContent = t(
            'caption.scale',
            'Index times element size: {index} × {unit} = {offset}.',
            { index: cap.index, unit: cap.unit, offset: cap.offset },
          );
          return;
        case 'add':
          caption.textContent = t('caption.add', 'Add the base address: {base} + {offset} = {addr}.', {
            base: hex(cap.base),
            offset: cap.offset,
            addr: hex(cap.addr),
          });
          return;
        case 'reach':
          caption.textContent = t(
            'caption.reach',
            'One multiply, one add: {addr} holds arr[{index}] = {value}.',
            { addr: hex(cap.addr), index: cap.index, value: cap.value },
          );
          return;
        case 'done':
          caption.textContent = t(
            'caption.done',
            'Any index, the same one calculation. Nothing in between is read.',
          );
          return;
      }
    }

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 버리지 않고 `live` 를 받게 고쳐 두 쓰임을 겸한다. 정적 그리기가 이미 끝
    // 자리에 세워 두었으므로, 여기서는 출발 그림으로 되돌려 놓고 시작한다.

    /** 칸이 왼쪽부터 차례로 자리에 내려앉는다. */
    async function layCells(live: () => boolean): Promise<void> {
      const n = risers.length;
      if (n === 0) return;
      const span = 1 + (n - 1) * LAY_STAGGER;
      const shown = risers.slice();
      await animate(
        LAY_MS,
        (p) => {
          shown.forEach((riser, i) => {
            const local = Math.min(1, Math.max(0, p * span - i * LAY_STAGGER));
            riser.setAttribute('opacity', String(local));
            riser.setAttribute('transform', `translate(0, ${(1 - easeInOut(local)) * LAY_DROP})`);
          });
        },
        live,
      );
      if (!live()) return;
      // 값으로 되돌리지 않고 거둔다 — 곧바로 세운 칸에는 이 속성들이 아예 없다.
      for (const riser of shown) {
        riser.removeAttribute('opacity');
        riser.removeAttribute('transform');
      }
    }

    /** 번호가 레일 왼쪽 끝으로 밀려 들어온다. */
    async function enterChip(live: () => boolean): Promise<void> {
      await animate(
        ENTER_MS,
        (p) => {
          const e = easeInOut(p);
          gChip.setAttribute('opacity', String(e));
          placeChip(START_X - ENTER_DX + ENTER_DX * e, RAIL_Y);
        },
        live,
      );
      if (!live()) return;
      showChip();
      placeChip(START_X, RAIL_Y);
    }

    /** 번호가 곱셈 관문을 지나 오프셋이 된다. */
    async function scaleChip(
      chip: Extract<RailChip, { stage: 'offset' }>,
      live: () => boolean,
    ): Promise<void> {
      chipText.textContent = String(chip.index);
      placeChip(START_X, RAIL_Y);
      await glide(START_X, SCALE_GATE_CX, live);
      if (!live()) return;
      markGate(scaleGate, true);
      chipText.textContent = String(chip.offset);
      await hold(GATE_HOLD_MS, live);
      if (!live()) return;
      markGate(scaleGate, false);
      await glide(SCALE_GATE_CX, MID_X, live);
    }

    /** 오프셋이 덧셈 관문을 지나 주소가 된다. */
    async function addBase(
      chip: Extract<RailChip, { stage: 'address' }>,
      live: () => boolean,
    ): Promise<void> {
      chipText.textContent = String(chip.offset);
      placeChip(MID_X, RAIL_Y);
      await glide(MID_X, ADD_GATE_CX, live);
      if (!live()) return;
      markGate(addGate, true);
      chipText.textContent = hex(chip.addr);
      await hold(GATE_HOLD_MS, live);
      if (!live()) return;
      markGate(addGate, false);
      await glide(ADD_GATE_CX, END_X, live);
    }

    /** 주소가 레일을 떠나 제 칸으로 곧장 날아간다. 사이의 칸은 지나지 않는다. */
    async function landOn(landed: AddressCell, live: () => boolean): Promise<void> {
      const cx = centers[landed.index];
      if (cx === undefined) return;

      // 출발 그림 — 칩은 아직 레일 끝에 서 있고 칸은 물들지 않았다.
      paintCell(landed.index, false);
      chipText.textContent = hex(landed.addr);
      showChip();
      placeChip(END_X, RAIL_Y);

      const ctrlX = (END_X + cx) / 2;
      const length = arcLength(cx);
      trail.setAttribute('d', arcPath(cx));
      trail.setAttribute('opacity', '1');
      // 궤적이 칩과 같이 자라도록 dash 하나로 덮었다가 걷어 낸다.
      trail.setAttribute('stroke-dasharray', String(length));

      await animate(
        LEAP_MS,
        (p) => {
          const e = easeInOut(p);
          placeChip(quad(e, END_X, ctrlX, cx), quad(e, RAIL_Y, LEAP_CTRL_Y, CELL_CY));
          trail.setAttribute('stroke-dashoffset', String(length * (1 - e)));
        },
        live,
      );
      if (!live()) return;

      showTrail(cx);
      paintCell(landed.index, true);

      await animate(FADE_MS, (p) => gChip.setAttribute('opacity', String(1 - p)), live);
      if (!live()) return;
      hideChip();
      placeChip(START_X, RAIL_Y);
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: IndexAddressCalcScene,
      prev: IndexAddressCalcScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (epoch += 1);
      const live = (): boolean => epoch === mine;

      rewind();
      if (next.cells.length > 0) {
        drawCells(next.cells);
        drawRail(next.base, next.unit);
      }
      if (next.landed) {
        const cx = centers[next.landed.index];
        if (cx !== undefined) {
          showTrail(cx);
          paintCell(next.landed.index, true);
        }
      }
      drawChip(next.chip);
      drawCaption(next.caption);

      if (!opts.animate) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 왔으면 `step` 이
      // 이어지지 않으므로 그 경우도 여기서 걸러진다.
      const step = next.step;
      if (step === null || step === prev?.step) return;

      switch (step) {
        case 'laid':
          await layCells(live);
          return;
        case 'ask':
          if (next.chip) await enterChip(live);
          return;
        case 'scale':
          if (next.chip?.stage === 'offset') await scaleChip(next.chip, live);
          return;
        case 'add':
          if (next.chip?.stage === 'address') await addBase(next.chip, live);
          return;
        case 'land':
          if (next.landed) await landOn(next.landed, live);
          return;
      }
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.replaceChildren();
      },
    };
  },
};
