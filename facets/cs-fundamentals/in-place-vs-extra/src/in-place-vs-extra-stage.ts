/**
 * 제자리 vs 자리 빌리기 stage view.
 *
 * 화면의 주인공은 **차지한 넓이**다. 그래서 자리(슬롯)와 값(타일)을 갈라 그린다 —
 * 슬롯은 알고리즘이 차지한 넓이고, 타일은 그 위를 옮겨 다니는 값이다. 값이
 * 아무리 부산하게 움직여도 슬롯이 늘지 않으면 넓이는 그대로다.
 *
 * 두 띠가 위아래로 같은 x 에서 시작한다. 원본 몫은 둘 다 같은 폭이고, 그 오른쪽
 * 빈 자리에서 빌린 넓이가 자란다. 위쪽은 첫 라운드에 한 칸을 얻고 그 뒤로 다시
 * 늘지 않으며, 아래쪽은 라운드마다 한 칸씩 붙는다. 각 띠 아래의 게이지가 그
 * 넓이를 다시 재고 칸 수를 적는다.
 *
 * 움직임은 전부 위치·폭의 변화다 (S-piece). 색은 값의 상태만 말한다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로: 두 띠 모두 원본 N 칸 + 빌릴 수 있는 최대 N 칸. 폭은 캔버스에서 역산하고
//    상수는 상한만 둔다 (S-piece).
const SIDE_MIN = 26;
const GROUP_GAP = 30;
const CELL_MAX_W = 64;

// ── 세로: 마운트 뒤 바뀌지 않는다 (S-view).
const CELL_H = 44;
const GAUGE_H = 16;
const LANE_GAP = 110;
const TITLE_DY = 13;
const CELL_DY = 30;
const GAUGE_DY = 82;
const CAPTION_Y = 228;
const CANVAS_H = 242;

// ── 걸음 하나 안의 네 국면. 총 길이는 여기에 stepMs 가 더해진다.
const SPACE_MS = 280;
const CARRY_MS = 300;
const SHIFT_MS = 280;
const LIFT_ARC = 26;

/** 게이지 숫자를 막대 안에 넣을 수 있는 최소 폭. 좁으면 막대 오른쪽에 붙인다. */
const LABEL_INSIDE_MIN_W = 62;

export type InPlaceVsExtraStageInit = {
  values: number[];
};

export type InPlaceVsExtraStageRound = {
  round: number;
  liftFrom: number;
  shiftFrom: number;
  dropTo: number;
  takeFrom: number;
  takenValue: number;
  outSlot: number;
  inPlaceExtra: number;
  extraExtra: number;
  caption: string;
};

export type InPlaceVsExtraStageDone = {
  inPlaceExtra: number;
  extraExtra: number;
  caption: string;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 값 타일 — 슬롯 위를 옮겨 다니는 것. */
type Chip = {
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  x: number;
  y: number;
};

type ChipState = 'idle' | 'active' | 'settled' | 'spent';

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export const inPlaceVsExtraStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const rx = Number.parseFloat(radii.sm);

    let destroyed = false;
    const rafs = new Set<number>();

    const schedule = (fn: () => void): void => {
      if (destroyed || typeof requestAnimationFrame !== 'function') return;
      const id = requestAnimationFrame(() => {
        rafs.delete(id);
        fn();
      });
      rafs.add(id);
    };

    /**
     * 시간에 따라 값을 바꾼다. `destroy()` 뒤에는 예약이 끊기고 마지막 상태로
     * 즉시 마무리한다 — 스스로 다음 회차를 예약하는 루프를 남기지 않는다 (S-view).
     */
    const tween = (ms: number, onFrame: (p: number) => void): Promise<void> => {
      onFrame(0);
      if (destroyed || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        onFrame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const t0 = nowMs();
        const tick = (): void => {
          if (destroyed) {
            onFrame(1);
            resolve();
            return;
          }
          const raw = Math.min(1, (nowMs() - t0) / ms);
          onFrame(easeInOut(raw));
          if (raw >= 1) {
            resolve();
            return;
          }
          schedule(tick);
        };
        schedule(tick);
      });
    };

    // ── 기하 (내용이 정한다)
    let values: number[] = [];
    let n = 0;
    let cellW = CELL_MAX_W;
    let originX = SIDE_MIN;
    let borrowX = SIDE_MIN;

    const laneTop = (lane: 0 | 1): number => lane * LANE_GAP;
    const slotX = (i: number): number => originX + i * cellW;
    const borrowSlotX = (k: number): number => borrowX + k * cellW;
    const slotCenterY = (lane: 0 | 1): number => laneTop(lane) + CELL_DY + CELL_H / 2;

    // ── 화면 요소
    let caption: SVGTextElement | null = null;
    let tempSlot: SVGRectElement | null = null;
    let tempClaimed = false;

    type Lane = {
      root: SVGGElement;
      /** 자리(슬롯) 층. 값 타일보다 아래에 깔린다 — 나중에 얻은 자리가 값을 가리면 안 된다. */
      slotLayer: SVGGElement;
      /** 값 타일 층. */
      chipLayer: SVGGElement;
      gaugeBar: SVGRectElement;
      gaugeLabel: SVGTextElement;
      borrowedCells: number;
    };
    const lanes: Lane[] = [];

    /** 위쪽 띠 — 원본 칸에 놓인 타일과, 잠깐 들고 있는 타일. */
    let inPlaceSlots: (Chip | null)[] = [];
    let heldChip: Chip | null = null;
    /** 아래쪽 띠 — 원본 칸의 타일과, 빌린 칸에 옮겨 적힌 타일. */
    let sourceChips: (Chip | null)[] = [];
    const copiedChips: Chip[] = [];

    const paintChip = (chip: Chip, state: ChipState): void => {
      const fill =
        state === 'active' ? c.itemActive : state === 'settled' ? c.itemSorted : c.itemDefault;
      const ink =
        state === 'active'
          ? c.stateInk
          : state === 'settled'
            ? c.textInverse
            : state === 'spent'
              ? c.textMuted
              : c.text;
      chip.box.setAttribute('fill', fill);
      chip.box.setAttribute('stroke', state === 'spent' ? c.border : c.text);
      chip.label.setAttribute('fill', ink);
    };

    const placeChip = (chip: Chip, x: number, y: number): void => {
      chip.x = x;
      chip.y = y;
      chip.g.setAttribute('transform', `translate(${x} ${y})`);
    };

    const makeChip = (parent: SVGGElement, value: number, x: number, y: number): Chip => {
      const g = el('g');
      const box = el('rect', {
        x: -(cellW - 12) / 2,
        y: -(CELL_H - 12) / 2,
        width: cellW - 12,
        height: CELL_H - 12,
        rx,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 600,
      });
      label.textContent = String(value);
      g.appendChild(box);
      g.appendChild(label);
      parent.appendChild(g);
      const chip: Chip = { g, box, label, x, y };
      placeChip(chip, x, y);
      paintChip(chip, 'idle');
      return chip;
    };

    /** 값 타일을 다른 자리로 옮긴다. lift 를 주면 들어 올렸다 내려놓는 호를 그린다. */
    const moveChip = (chip: Chip, toX: number, toY: number, ms: number, lift = 0): Promise<void> => {
      const fromX = chip.x;
      const fromY = chip.y;
      return tween(ms, (p) => {
        const x = fromX + (toX - fromX) * p;
        const y = fromY + (toY - fromY) * p - lift * Math.sin(Math.PI * p);
        chip.x = x;
        chip.y = y;
        chip.g.setAttribute('transform', `translate(${x} ${y})`);
      }).then(() => {
        placeChip(chip, toX, toY);
      });
    };

    const paintGauge = (lane: Lane, cells: number): void => {
      const barW = cells * cellW;
      lane.gaugeBar.setAttribute('width', String(Math.max(0, barW)));
      const inside = barW >= LABEL_INSIDE_MIN_W;
      lane.gaugeLabel.setAttribute('x', String(borrowX + barW + (inside ? -8 : 8)));
      lane.gaugeLabel.setAttribute('text-anchor', inside ? 'end' : 'start');
      lane.gaugeLabel.setAttribute('fill', inside ? c.stateInk : c.textMuted);
      lane.gaugeLabel.textContent = t('label.extraCells', '{n} extra', {
        n: Math.round(cells),
      });
    };

    /** 게이지를 새 넓이까지 늘린다. 이 조각에서 유일하게 "얼마나" 를 말하는 자리. */
    const growGauge = (lane: Lane, cells: number, ms: number): Promise<void> => {
      const from = lane.borrowedCells;
      lane.borrowedCells = cells;
      if (from === cells) {
        paintGauge(lane, cells);
        return Promise.resolve();
      }
      return tween(ms, (p) => paintGauge(lane, from + (cells - from) * p));
    };

    const setCaption = (text: string): void => {
      if (caption) caption.textContent = text;
    };

    /** 슬롯 하나 — 알고리즘이 차지한 자리. 값이 아니라 넓이를 뜻한다. */
    const makeSlot = (parent: SVGGElement, x: number, y: number, borrowed: boolean): SVGRectElement => {
      const rect = el('rect', {
        x,
        y,
        width: borrowed ? 0 : cellW,
        height: CELL_H,
        rx,
        fill: c.bgSubtle,
        stroke: borrowed ? c.accent : c.border,
        'stroke-width': borrowed ? 2 : 1,
      });
      parent.appendChild(rect);
      return rect;
    };

    const buildLane = (lane: 0 | 1, titleKey: string, titleEn: string): Lane => {
      const root = el('g');
      svg.appendChild(root);
      const top = laneTop(lane);

      const title = el('text', {
        x: originX,
        y: top + TITLE_DY,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      title.textContent = t(titleKey, titleEn);
      root.appendChild(title);

      const slotLayer = el('g');
      const chipLayer = el('g');
      root.appendChild(slotLayer);
      root.appendChild(chipLayer);
      for (let i = 0; i < n; i++) makeSlot(slotLayer, slotX(i), top + CELL_DY, false);

      // 원본 몫의 넓이 — 처음 받은 만큼이고 끝까지 그대로다.
      root.appendChild(
        el('rect', {
          x: originX,
          y: top + GAUGE_DY,
          width: n * cellW,
          height: GAUGE_H,
          rx,
          fill: c.border,
        }),
      );
      // 빌린 몫의 넓이 — 이 조각이 재는 것.
      const gaugeBar = el('rect', {
        x: borrowX,
        y: top + GAUGE_DY,
        width: 0,
        height: GAUGE_H,
        rx,
        fill: c.accent,
      });
      root.appendChild(gaugeBar);
      const gaugeLabel = el('text', {
        x: borrowX + 8,
        y: top + GAUGE_DY + 11,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 600,
        fill: c.textMuted,
      });
      root.appendChild(gaugeLabel);

      return { root, slotLayer, chipLayer, gaugeBar, gaugeLabel, borrowedCells: 0 };
    };

    /** 처음 상태를 짓는다. 되감기도 이 함수를 다시 부르는 것이 전부다. */
    const build = (init: InPlaceVsExtraStageInit): void => {
      values = init.values.slice();
      n = values.length;
      if (n === 0) return;

      const slots = n * 2;
      cellW = Math.min(
        CELL_MAX_W,
        Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2 - GROUP_GAP) / slots),
      );
      originX = Math.round((PIECE_CANVAS_W - (slots * cellW + GROUP_GAP)) / 2);
      borrowX = originX + n * cellW + GROUP_GAP;

      // 캔버스는 러너가 붙여 준 것이다. 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
      svg.textContent = '';
      lanes.length = 0;
      copiedChips.length = 0;
      tempSlot = null;
      tempClaimed = false;
      heldChip = null;

      lanes.push(buildLane(0, 'label.laneInPlace', 'sorting in place'));
      lanes.push(buildLane(1, 'label.laneCopy', 'copying into new space'));

      inPlaceSlots = values.map((v, i) =>
        makeChip(lanes[0].chipLayer, v, slotX(i) + cellW / 2, slotCenterY(0)),
      );
      sourceChips = values.map((v, i) =>
        makeChip(lanes[1].chipLayer, v, slotX(i) + cellW / 2, slotCenterY(1)),
      );

      paintGauge(lanes[0], 0);
      paintGauge(lanes[1], 0);

      caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      svg.appendChild(caption);
    };

    // ── 한 라운드의 네 국면

    /** 제자리 쪽이 자리를 얻는 순간. 첫 라운드에 한 번뿐이고, 그 뒤로는 다시 쓴다. */
    const claimHeldSlot = (round: InPlaceVsExtraStageRound): Promise<void> => {
      if (tempClaimed || lanes.length === 0) return Promise.resolve();
      tempClaimed = true;
      tempSlot = makeSlot(lanes[0].slotLayer, borrowSlotX(0), laneTop(0) + CELL_DY, true);
      const slot = tempSlot;
      return Promise.all([
        tween(SPACE_MS, (p) => slot.setAttribute('width', String(cellW * p))),
        growGauge(lanes[0], round.inPlaceExtra, SPACE_MS),
      ]).then(() => undefined);
    };

    /** 빌리는 쪽이 자리를 얻는 순간. 옮겨 적을 때마다 한 칸씩 늘어난다. */
    const openOutSlot = (round: InPlaceVsExtraStageRound): Promise<void> => {
      if (lanes.length === 0) return Promise.resolve();
      const slot = makeSlot(
        lanes[1].slotLayer,
        borrowSlotX(round.outSlot),
        laneTop(1) + CELL_DY,
        true,
      );
      return Promise.all([
        tween(SPACE_MS, (p) => slot.setAttribute('width', String(cellW * p))),
        growGauge(lanes[1], round.extraExtra, SPACE_MS),
      ]).then(() => undefined);
    };

    const liftToHeld = (round: InPlaceVsExtraStageRound): Promise<void> => {
      const chip = inPlaceSlots[round.liftFrom] ?? null;
      if (!chip) return Promise.resolve();
      inPlaceSlots[round.liftFrom] = null;
      heldChip = chip;
      paintChip(chip, 'active');
      return moveChip(chip, borrowSlotX(0) + cellW / 2, slotCenterY(0), CARRY_MS, LIFT_ARC);
    };

    const copyOut = (round: InPlaceVsExtraStageRound): Promise<void> => {
      if (lanes.length === 0) return Promise.resolve();
      const source = sourceChips[round.takeFrom] ?? null;
      const fromX = source ? source.x : slotX(round.takeFrom) + cellW / 2;
      const copy = makeChip(lanes[1].chipLayer, round.takenValue, fromX, slotCenterY(1));
      paintChip(copy, 'active');
      copiedChips.push(copy);
      if (source) paintChip(source, 'spent');
      return moveChip(
        copy,
        borrowSlotX(round.outSlot) + cellW / 2,
        slotCenterY(1),
        CARRY_MS,
        LIFT_ARC,
      ).then(() => {
        paintChip(copy, 'idle');
      });
    };

    /** 값들이 서로 건너뛴다 — 자리를 늘리는 대신 옆으로 밀어낸다. */
    const shiftRight = (round: InPlaceVsExtraStageRound): Promise<void> => {
      const moves: Promise<void>[] = [];
      for (let i = round.liftFrom - 1; i >= round.shiftFrom; i--) {
        const chip = inPlaceSlots[i] ?? null;
        if (!chip) continue;
        inPlaceSlots[i] = null;
        inPlaceSlots[i + 1] = chip;
        moves.push(moveChip(chip, slotX(i + 1) + cellW / 2, slotCenterY(0), SHIFT_MS));
      }
      if (moves.length === 0) return Promise.resolve();
      return Promise.all(moves).then(() => undefined);
    };

    const dropFromHeld = (round: InPlaceVsExtraStageRound): Promise<void> => {
      const chip = heldChip;
      if (!chip) return Promise.resolve();
      heldChip = null;
      inPlaceSlots[round.dropTo] = chip;
      return moveChip(
        chip,
        slotX(round.dropTo) + cellW / 2,
        slotCenterY(0),
        CARRY_MS,
        LIFT_ARC,
      ).then(() => {
        paintChip(chip, 'idle');
      });
    };

    const instance: ViewInstance = {
      init(data: InPlaceVsExtraStageInit): void {
        build(data);
      },

      showBegin(text: string): void {
        setCaption(text);
      },

      async playRound(round: InPlaceVsExtraStageRound): Promise<void> {
        if (lanes.length === 0) return;
        setCaption(round.caption);
        // 1) 자리 — 넓이가 늘어나는(또는 늘어나지 않는) 순간을 두 띠가 함께 맞는다.
        await Promise.all([claimHeldSlot(round), openOutSlot(round)]);
        // 2) 값 — 한쪽은 들어 올리고, 한쪽은 옮겨 적는다.
        await Promise.all([liftToHeld(round), copyOut(round)]);
        // 3) 건너뛰기 — 자리를 늘리지 않는 대가.
        await shiftRight(round);
        // 4) 내려놓기 — 빌린 자리는 다시 빈다.
        await dropFromHeld(round);
      },

      showDone(data: InPlaceVsExtraStageDone): void {
        setCaption(data.caption);
        for (const chip of inPlaceSlots) if (chip) paintChip(chip, 'settled');
        for (const chip of copiedChips) paintChip(chip, 'settled');
      },

      rewind(): void {
        build({ values });
      },

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafs) cancelAnimationFrame(id);
        }
        rafs.clear();
        svg.textContent = '';
        caption = null;
        tempSlot = null;
      },
    };

    const seed: unknown = params.initialData?.values;
    if (Array.isArray(seed)) build({ values: (seed as unknown[]).map((v) => Number(v)) });

    return instance;
  },
};
