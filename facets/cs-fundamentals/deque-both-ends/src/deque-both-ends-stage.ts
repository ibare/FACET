/**
 * deque-both-ends-stage — 양끝이 열린 통 하나.
 *
 * 이 그림이 말하는 것은 하나다: **문은 둘인데 그 둘이 저마다 넣기와 빼기를 겸한다.**
 * 그래서 통에는 좌우 마개가 없고 (벽은 위아래 둘뿐, 끝에서 밖으로 벌어진다),
 * 각 입마다 IN 칩이 위에 OUT 칩이 아래에 붙는다 — 칩 넷이 곧 조작 넷이다.
 *
 * 운동은 전부 가로 이동이다. 값은 통 밖 대기 자리에서 입을 지나 자리에 앉고,
 * 나갈 때는 들어온 그 입으로 되돌아 나간다. 자리(slot)는 고정이라 한쪽 끝에
 * 넣거나 빼도 이미 앉은 값은 한 픽셀도 움직이지 않는다 — 양끝 조작이 나머지를
 * 건드리지 않는다는 것도 이 배치가 함께 말한다.
 *
 * 가로 자리는 캔버스 폭에서 역산한다. 상수는 상한만 준다 (S-piece).
 */

import {
  CATEGORICAL_QUEUE_BLOCK,
  CATEGORICAL_QUEUE_IN,
  CATEGORICAL_QUEUE_OUT,
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const CANVAS_H = 214;

// 세로 — 위에서부터 문 이름 · IN 칩 · 통 · OUT 칩 · 캡션.
const GATE_LABEL_Y = 24;
const IN_CHIP_Y = 32;
const TUBE_TOP = 70;
const TUBE_BOTTOM = 140;
const OUT_CHIP_Y = 154;
const CAPTION_Y = 198;
const BAND_CENTER = (TUBE_TOP + TUBE_BOTTOM) / 2;

const CHIP_W = 58;
const CHIP_H = 24;
const CELL_H = 52;
const CELL_Y = TUBE_TOP + (TUBE_BOTTOM - TUBE_TOP - CELL_H) / 2;
const TUBE_PAD = 6;
const MOUTH_FLARE = 14;

// 가로 상한. 실제 칸 폭은 캔버스에서 역산한다.
const CELL_MAX_W = 84;
const LANE_GAP = 8;
const SIDE_MIN = 24;

const ENTER_MS = 420;
const LEAVE_MS = 420;
const HOLD_MS = 140;
const FADE_MS = 160;
const SWEEP_MS = 700;

// 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 표식 판정 1·2).
const MARK_IN = 'IN';
const MARK_OUT = 'OUT';
const MARK_FRONT = 'front';
const MARK_BACK = 'back';

export type DequeSide = 'front' | 'back';
type Door = 'in' | 'out';

type Cell = { value: number; g: SVGGElement; rect: SVGRectElement; x: number };
type Chip = {
  box: SVGRectElement;
  ring: SVGRectElement;
  label: SVGTextElement;
  arrow: SVGPathElement;
  color: string;
  used: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function clear(node: SVGElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 들고 나는 느낌이 붙도록 시작과 끝을 눅인다. */
function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 겹화살표. sign 이 +1 이면 오른쪽, -1 이면 왼쪽을 가리킨다. */
function chevron(sign: number): string {
  const a = -6 * sign;
  const b = 2 * sign;
  const c = 10 * sign;
  return `M ${a} -8 L ${b} 0 L ${a} 8 M ${b} -8 L ${c} 0 L ${b} 8`;
}

export const dequeBothEndsStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const seed = categorical(6, 'vivid');
    const blockColor = seed[CATEGORICAL_QUEUE_BLOCK];
    const inColor = seed[CATEGORICAL_QUEUE_IN];
    const outColor = seed[CATEGORICAL_QUEUE_OUT];

    const svg = params.canvas;
    const sceneryG = el('g', {});
    const cellsG = el('g', {});
    const fxG = el('g', {});
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(sceneryG);
    svg.appendChild(cellsG);
    svg.appendChild(fxG);
    svg.appendChild(captionText);

    // ── 시간 자원. destroy 에서 모두 거둔다 (S-view).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const raf = new Set<number>();
    let disposed = false;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    const animate = (ms: number, onFrame: (t: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (disposed || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          resolve();
          return;
        }
        let start: number | null = null;
        const tick = (now: number): void => {
          if (disposed) {
            onFrame(1);
            resolve();
            return;
          }
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          onFrame(ease(p));
          if (p < 1) raf.add(requestAnimationFrame(tick));
          else resolve();
        };
        raf.add(requestAnimationFrame(tick));
      });

    // ── 기하. capacity 가 정해져야 폭이 나오므로 init 에서 다시 잡는다.
    let capacity = 4;
    let laneCount = capacity + 2;
    let cellW = CELL_MAX_W;
    let originX = 0;

    const layout = (): void => {
      laneCount = capacity + 2; // 통 안 자리 + 양 바깥 대기 자리 하나씩
      const room = W - SIDE_MIN * 2 - LANE_GAP * (laneCount - 1);
      cellW = Math.min(CELL_MAX_W, Math.floor(room / laneCount));
      const spanW = laneCount * cellW + LANE_GAP * (laneCount - 1);
      originX = Math.round((W - spanW) / 2);
    };

    const laneX = (lane: number): number => originX + lane * (cellW + LANE_GAP);
    const slotX = (slot: number): number => laneX(slot + 1);
    const stagingX = (side: DequeSide): number => (side === 'front' ? laneX(0) : laneX(laneCount - 1));
    const tubeL = (): number => slotX(0) - TUBE_PAD;
    const tubeR = (): number => slotX(capacity - 1) + cellW + TUBE_PAD;
    const gateX = (side: DequeSide): number => (side === 'front' ? tubeL() : tubeR());

    // ── 문 칩 넷. 조작이 넷인 것이 곧 칩이 넷인 것이다.
    const chips = new Map<string, Chip>();
    const chipKey = (side: DequeSide, door: Door): string => `${side}:${door}`;

    const paintChip = (chip: Chip, active: boolean): void => {
      chip.box.setAttribute('fill', chip.used ? chip.color : 'none');
      chip.box.setAttribute('stroke', chip.used ? chip.color : colors.border);
      chip.label.setAttribute('fill', chip.used ? colors.stateInk : colors.textMuted);
      chip.arrow.setAttribute('fill', chip.used ? colors.stateInk : colors.border);
      chip.ring.setAttribute('opacity', active ? '1' : '0');
    };

    const buildChip = (side: DequeSide, door: Door): void => {
      const cx = gateX(side);
      const cy = (door === 'in' ? IN_CHIP_Y : OUT_CHIP_Y) + CHIP_H / 2;
      const x0 = cx - CHIP_W / 2;
      const y0 = cy - CHIP_H / 2;
      // 화살표는 그 문이 하는 일의 방향을 가리킨다 — in 은 통 안쪽, out 은 바깥쪽.
      const pointsRight = side === 'front' ? door === 'in' : door === 'out';
      const ax = pointsRight ? x0 + 41 : x0 + 6;
      const d = pointsRight
        ? `M ${ax} ${cy - 5} L ${ax + 11} ${cy} L ${ax} ${cy + 5} Z`
        : `M ${ax + 11} ${cy - 5} L ${ax} ${cy} L ${ax + 11} ${cy + 5} Z`;

      const ring = el('rect', {
        x: x0 - 3,
        y: y0 - 3,
        width: CHIP_W + 6,
        height: CHIP_H + 6,
        rx: 15,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
        opacity: 0,
      });
      const box = el('rect', {
        x: x0,
        y: y0,
        width: CHIP_W,
        height: CHIP_H,
        rx: 12,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: pointsRight ? x0 + 22 : x0 + 36,
        y: cy + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        'letter-spacing': 0.8,
        fill: colors.textMuted,
      });
      label.textContent = door === 'in' ? MARK_IN : MARK_OUT;
      const arrow = el('path', { d, fill: colors.border });

      sceneryG.appendChild(ring);
      sceneryG.appendChild(box);
      sceneryG.appendChild(arrow);
      sceneryG.appendChild(label);
      chips.set(chipKey(side, door), { box, ring, label, arrow, color: door === 'in' ? inColor : outColor, used: false });
    };

    let activeChip: Chip | null = null;

    const lightDoor = (side: DequeSide, door: Door): void => {
      if (activeChip) paintChip(activeChip, false);
      const chip = chips.get(chipKey(side, door));
      if (!chip) return;
      chip.used = true;
      paintChip(chip, true);
      activeChip = chip;
    };

    const dimDoors = (): void => {
      activeChip = null;
      for (const chip of chips.values()) {
        chip.used = false;
        paintChip(chip, false);
      }
    };

    // ── 통. 좌우 마개가 없고 끝이 밖으로 벌어진다 — 그게 "양끝이 열려 있다" 다.
    const buildScenery = (): void => {
      clear(sceneryG);
      chips.clear();
      activeChip = null;

      const l = tubeL();
      const r = tubeR();
      sceneryG.appendChild(
        el('rect', { x: l, y: TUBE_TOP, width: r - l, height: TUBE_BOTTOM - TUBE_TOP, fill: colors.bgSubtle }),
      );
      const wall = {
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      };
      sceneryG.appendChild(
        el('path', {
          d: `M ${l - MOUTH_FLARE} ${TUBE_TOP - 10} L ${l} ${TUBE_TOP} L ${r} ${TUBE_TOP} L ${r + MOUTH_FLARE} ${TUBE_TOP - 10}`,
          ...wall,
        }),
      );
      sceneryG.appendChild(
        el('path', {
          d: `M ${l - MOUTH_FLARE} ${TUBE_BOTTOM + 10} L ${l} ${TUBE_BOTTOM} L ${r} ${TUBE_BOTTOM} L ${r + MOUTH_FLARE} ${TUBE_BOTTOM + 10}`,
          ...wall,
        }),
      );

      for (let s = 0; s < capacity; s += 1) {
        sceneryG.appendChild(
          el('rect', {
            x: slotX(s),
            y: CELL_Y,
            width: cellW,
            height: CELL_H,
            rx: 10,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          }),
        );
      }

      for (const side of ['front', 'back'] as const) {
        const name = el('text', {
          x: gateX(side),
          y: GATE_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        name.textContent = side === 'front' ? MARK_FRONT : MARK_BACK;
        sceneryG.appendChild(name);
        buildChip(side, 'in');
        buildChip(side, 'out');
      }
    };

    // ── 값 칸.
    let cells: Cell[] = [];
    let frontSlot = 0;
    let seedValues: number[] = [];

    const placeAt = (cell: Cell, x: number): void => {
      cell.x = x;
      cell.g.setAttribute('transform', `translate(${x}, ${CELL_Y})`);
    };

    const createCell = (value: number, x: number, fill: string): Cell => {
      const g = el('g', {});
      const rect = el('rect', { x: 0, y: 0, width: cellW, height: CELL_H, rx: 10, fill });
      const label = el('text', {
        x: cellW / 2,
        y: CELL_H / 2 + 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      label.textContent = String(value);
      g.appendChild(rect);
      g.appendChild(label);
      cellsG.appendChild(g);
      const cell: Cell = { value, g, rect, x };
      placeAt(cell, x);
      return cell;
    };

    const slide = async (cell: Cell, toX: number, ms: number): Promise<void> => {
      const fromX = cell.x;
      await animate(ms, (t) => {
        cell.g.setAttribute('transform', `translate(${fromX + (toX - fromX) * t}, ${CELL_Y})`);
      });
      placeAt(cell, toX);
    };

    const placeSeed = (): void => {
      clear(cellsG);
      cells = [];
      frontSlot = Math.max(0, Math.floor((capacity - seedValues.length) / 2));
      seedValues.forEach((value, i) => {
        cells.push(createCell(value, slotX(frontSlot + i), blockColor));
      });
    };

    // ── 마무리. 네 문이 한꺼번에 켜지고 양쪽에서 안팎으로 화살이 지나간다.
    const sweep = (side: DequeSide, door: Door): Promise<void> => {
      const outerX = stagingX(side) + cellW / 2;
      const innerX = (side === 'front' ? slotX(0) : slotX(capacity - 1)) + cellW / 2;
      const inward = door === 'in';
      const fromX = inward ? outerX : innerX;
      const toX = inward ? innerX : outerX;
      const y = BAND_CENTER + (inward ? -14 : 14);
      const path = el('path', {
        d: chevron(toX > fromX ? 1 : -1),
        fill: 'none',
        stroke: inward ? inColor : outColor,
        'stroke-width': 3,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: 0,
      });
      fxG.appendChild(path);
      return animate(SWEEP_MS, (t) => {
        path.setAttribute('transform', `translate(${fromX + (toX - fromX) * t}, ${y})`);
        const fade = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
        path.setAttribute('opacity', String(fade));
      }).then(() => {
        path.remove();
      });
    };

    layout();
    buildScenery();

    const stage: ViewInstance = {
      /** 처음 상태를 세운다. capacity 가 정해져야 폭이 나온다. */
      init(p: { values: number[]; capacity: number }): void {
        capacity = Math.max(1, Math.floor(p.capacity));
        seedValues = p.values.slice();
        layout();
        buildScenery();
        clear(fxG);
        placeSeed();
        captionText.textContent = '';
      },

      /** 그 문으로 값 하나가 들어온다. 밖에 섰다가 입을 지나 빈자리에 앉는다. */
      async enter(p: { side: DequeSide; value: number }): Promise<void> {
        const slot = p.side === 'front' ? frontSlot - 1 : frontSlot + cells.length;
        if (slot < 0 || slot >= capacity) return;
        lightDoor(p.side, 'in');
        const cell = createCell(p.value, stagingX(p.side), colors.itemActive);
        await wait(HOLD_MS);
        await slide(cell, slotX(slot), ENTER_MS);
        cell.rect.setAttribute('fill', blockColor);
        if (p.side === 'front') {
          cells.unshift(cell);
          frontSlot = slot;
        } else {
          cells.push(cell);
        }
      },

      /** 그 문으로 끝의 값이 나간다. 들어온 길을 그대로 되짚는다. */
      async leave(p: { side: DequeSide }): Promise<void> {
        const cell = p.side === 'front' ? cells[0] : cells[cells.length - 1];
        if (!cell) return;
        if (p.side === 'front') {
          cells.shift();
          frontSlot += 1;
        } else {
          cells.pop();
        }
        lightDoor(p.side, 'out');
        cell.rect.setAttribute('fill', colors.itemActive);
        await slide(cell, stagingX(p.side), LEAVE_MS);
        await wait(HOLD_MS);
        await animate(FADE_MS, (t) => cell.g.setAttribute('opacity', String(1 - t)));
        cell.g.remove();
      },

      /** 네 문이 한꺼번에 열린다 — 두 끝이 저마다 안팎 양쪽으로 통한다. */
      async openBothEnds(): Promise<void> {
        activeChip = null;
        for (const chip of chips.values()) {
          chip.used = true;
          paintChip(chip, true);
        }
        await Promise.all([sweep('front', 'in'), sweep('front', 'out'), sweep('back', 'in'), sweep('back', 'out')]);
      },

      /** 처음으로 되감는다. 한 걸음씩 짚어 보기의 출발점. */
      rewind(): void {
        clear(cellsG);
        clear(fxG);
        dimDoors();
        placeSeed();
        captionText.textContent = '';
      },

      setCaption(text: string): void {
        captionText.textContent = text;
      },

      destroy(): void {
        disposed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of raf) cancelAnimationFrame(id);
        }
        raf.clear();
        // remove() 는 이미 떨어져 나간 노드에도 안전하다 — 러너가 컨테이너를
        // 먼저 비운 뒤 destroy 를 부르는 경우가 있다.
        sceneryG.remove();
        cellsG.remove();
        fxG.remove();
        captionText.remove();
      },
    };

    return stage;
  },
};
