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
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`init()` · `enter()` · `leave()` · `openBothEnds()` ·
 * `rewind()`) 를 두지 않는다. 그 메서드들이 곧 되돌릴 수 없는 명령이었고, 통 안에
 * 무엇이 앉아 있는지도 어느 문에 불이 들어왔는지도 DOM 안에만 있었다. 대신
 * `render(next, prev, { animate })` 하나가 **그 장면의 화면 전체**를 세운다 — 어느
 * 걸음에서 어느 걸음으로 가든 같은 길이다 (S-scene · `scene.ts`).
 *
 * `drawScene` 은 통·자리·칩·값 칸을 **통째로 다시 짓는다.** 자리 넷에 칩 넷이라
 * 가볍고, 그렇게 하면 앞 걸음의 운동이 남긴 `transform` · `fill` · `opacity` 같은
 * 자취가 하나도 남지 않는다. 운동이 끝난 뒤에도 같은 함수를 한 번 더 부른다 —
 * 흐르며 선 화면과 곧바로 세운 화면이 속성 하나까지 같아진다.
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 흐르게 하고,
 * 거짓이면 타이머도 프레임도 걸지 않고 곧바로 끝 그림을 세운다 — 되짚기가 그 길로
 * 온다.
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
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { ALL_DOORS } from './scene.js';
import type {
  DequeBothEndsScene,
  DequeCaption,
  DequeSide,
  DequeStep,
  DoorKey,
  DoorKind,
} from './scene.js';

export type { DequeSide } from './scene.js';

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

const SIDES: readonly DequeSide[] = ['front', 'back'];

type Cell = { g: SVGGElement; rect: SVGRectElement };

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

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance & SceneRenderer<DequeBothEndsScene> {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
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

    /**
     * 기다리다 만 것을 깨우는 자리. 타이머·프레임을 거두는 것만으로는 모자란다 —
     * 취소된 tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 그것을
     * 기다리므로 `await ctx.emit` 이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();
    let disposed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 되짚기는 앞 걸음의 운동이 이어 도는 동안에도 화면을 새로 세운다. 값 칸은
     * `drawScene` 이 매번 새로 지으므로 살아남은 옛 운동이 쥔 것은 이미 떨어져 나간
     * 노드라 무해하지만, **운동 끝의 `drawScene(next)`** 은 재건 밖의 화면에 옛
     * 장면을 덮어쓴다. 그 자리를 막는 것이 이 빗장이다 (S-scene).
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !disposed && myGen === gen;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
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

    const animate = (ms: number, onFrame: (t: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (disposed || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let start: number | null = null;
        const tick = (now: number): void => {
          if (disposed) {
            onFrame(1);
            finish();
            return;
          }
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          onFrame(ease(p));
          if (p < 1) raf.add(requestAnimationFrame(tick));
          else finish();
        };
        raf.add(requestAnimationFrame(tick));
      });

    // ── 기하. 장면이 자리 수를 말하면 거기서 폭을 역산한다.
    let capacity = 1;
    let laneCount = 3;
    let cellW = CELL_MAX_W;
    let originX = 0;

    const layout = (cap: number): void => {
      capacity = Math.max(1, Math.floor(cap));
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

    // ── 문 칩. 칠(`lit`) 은 "쓰인 적 있다", 테(`ringed`) 는 "지금 쓰인다" 다.
    //    둘 다 장면이 말하므로 여기에는 기억할 것이 없다.
    const buildChip = (side: DequeSide, door: DoorKind, lit: boolean, ringed: boolean): void => {
      const color = door === 'in' ? inColor : outColor;
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

      sceneryG.appendChild(
        el('rect', {
          x: x0 - 3,
          y: y0 - 3,
          width: CHIP_W + 6,
          height: CHIP_H + 6,
          rx: 15,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
          opacity: ringed ? 1 : 0,
        }),
      );
      sceneryG.appendChild(
        el('rect', {
          x: x0,
          y: y0,
          width: CHIP_W,
          height: CHIP_H,
          rx: 12,
          fill: lit ? color : 'none',
          stroke: lit ? color : colors.border,
          'stroke-width': 1.5,
        }),
      );
      sceneryG.appendChild(el('path', { d, fill: lit ? colors.stateInk : colors.border }));
      const label = el('text', {
        x: pointsRight ? x0 + 22 : x0 + 36,
        y: cy + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        'letter-spacing': 0.8,
        fill: lit ? colors.stateInk : colors.textMuted,
      });
      label.textContent = door === 'in' ? MARK_IN : MARK_OUT;
      sceneryG.appendChild(label);
    };

    /** 통과 자리와 문 넷. 좌우 마개가 없고 끝이 밖으로 벌어진다 — 그게 "양끝이 열려 있다" 다. */
    const drawScenery = (s: DequeBothEndsScene): void => {
      clear(sceneryG);

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

      for (let i = 0; i < capacity; i += 1) {
        sceneryG.appendChild(
          el('rect', {
            x: slotX(i),
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

      for (const side of SIDES) {
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
        for (const door of ['in', 'out'] as const) {
          const key: DoorKey = `${side}:${door}`;
          buildChip(side, door, s.used.includes(key), s.ringed.includes(key));
        }
      }
    };

    // ── 값 칸.
    const placeAt = (cell: Cell, x: number): void => {
      cell.g.setAttribute('transform', `translate(${x}, ${CELL_Y})`);
    };

    const createCell = (value: number, x: number, fill: string, into: SVGGElement): Cell => {
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
      into.appendChild(g);
      const cell: Cell = { g, rect };
      placeAt(cell, x);
      return cell;
    };

    /** 자리 번호 → 지금 세워 둔 칸. `drawCells` 가 갈아 끼운다. */
    let cellBySlot = new Map<number, Cell>();

    const drawCells = (s: DequeBothEndsScene): void => {
      clear(cellsG);
      cellBySlot = new Map();
      s.values.forEach((value, i) => {
        const slot = s.frontSlot + i;
        cellBySlot.set(slot, createCell(value, slotX(slot), blockColor, cellsG));
      });
    };

    /** 한 걸음의 말. 장면은 무엇을 말할지만 주고 문자는 여기서 만든다 (C10). */
    const captionTextOf = (c: DequeCaption): string => {
      switch (c.kind) {
        case 'push':
          return c.side === 'front'
            ? tr('caption.pushFront', 'In through the front door')
            : tr('caption.pushBack', 'In through the back door');
        case 'pop':
          return c.side === 'front'
            ? tr('caption.popFront', 'Out through that same front door')
            : tr('caption.popBack', 'Out through that same back door');
        case 'bothEnds':
          return tr(
            'caption.bothEnds',
            'Two doors, four operations — each end both takes in and gives out',
          );
      }
    };

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 통째로 다시 짓는다 — 앞 걸음의 운동이 남긴 `transform` · `fill` · `opacity`
     * 자취가 하나도 남지 않으므로, 어느 걸음에서 오든 같은 화면이 된다.
     */
    const drawScene = (s: DequeBothEndsScene): void => {
      layout(s.capacity);
      drawScenery(s);
      drawCells(s);
      clear(fxG);
      captionText.textContent = s.caption === null ? '' : captionTextOf(s.caption);
    };

    // ── 걸음의 운동. 출발 그림은 전부 `step` 의 계기값에서 복원한다.

    const slide = (cell: Cell, fromX: number, toX: number, ms: number): Promise<void> =>
      animate(ms, (t) => {
        // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 — 부동소수 끝자리가 정적
        // 그리기와 갈리지 않게.
        const x = t >= 1 ? toX : fromX + (toX - fromX) * t;
        cell.g.setAttribute('transform', `translate(${x}, ${CELL_Y})`);
      });

    /** 밖에 섰다가 입을 지나 빈자리에 앉는다. */
    const runEnter = async (
      step: Extract<DequeStep, { kind: 'enter' }>,
      myGen: number,
    ): Promise<void> => {
      const cell = cellBySlot.get(step.slot);
      if (!cell) return;
      const fromX = stagingX(step.side);
      const toX = slotX(step.slot);
      // 아직 들어오기 전으로 되물린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
      // 여기서 되물리지 않으면 첫 프레임에 끝 자리가 번쩍인다. 그 사이에 타이머도
      // 프레임도 없어 페인트가 끼지 않는다.
      placeAt(cell, fromX);
      cell.rect.setAttribute('fill', colors.itemActive);
      await wait(HOLD_MS);
      if (!alive(myGen)) return;
      await slide(cell, fromX, toX, ENTER_MS);
      if (!alive(myGen)) return;
      cell.rect.setAttribute('fill', blockColor);
    };

    /**
     * 들어온 길을 그대로 되짚어 나간다.
     *
     * 나가는 칸은 이 장면의 `values` 에 이미 없다. 그래서 정적 그리기가 짓지 않고,
     * 운동만 쓰는 임시 칸을 `step` 의 값과 자리로 세워 흘려보낸다 — `fxG` 안이라
     * 다음 `drawScene` 이 통째로 거둔다.
     */
    const runLeave = async (
      step: Extract<DequeStep, { kind: 'leave' }>,
      myGen: number,
    ): Promise<void> => {
      const fromX = slotX(step.slot);
      const toX = stagingX(step.side);
      const cell = createCell(step.value, fromX, colors.itemActive, fxG);
      await slide(cell, fromX, toX, LEAVE_MS);
      if (!alive(myGen)) return;
      await wait(HOLD_MS);
      if (!alive(myGen)) return;
      await animate(FADE_MS, (t) => cell.g.setAttribute('opacity', String(1 - t)));
      cell.g.remove();
    };

    /** 네 문이 한꺼번에 열린다 — 양쪽에서 안팎으로 화살이 지나간다. */
    const sweep = (side: DequeSide, door: DoorKind): Promise<void> => {
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

    /**
     * 화살 넷을 나란히 흘린다.
     *
     * 하나도 `void` 로 던지지 않는다 — `render` 가 돌려주는 Promise 는 그 장면이 다
     * 선 뒤에 풀려야 하고, 그것이 바깥이 걸음의 끝을 아는 유일한 통로다 (S-scene).
     */
    const runOpen = (): Promise<void> =>
      Promise.all(
        ALL_DOORS.map((key) => {
          const [side, door] = key.split(':') as [DequeSide, DoorKind];
          return sweep(side, door);
        }),
      ).then(() => undefined);

    async function render(
      next: DequeBothEndsScene,
      /** 출발 그림을 `step` 에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: DequeBothEndsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      drawScene(next);

      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다.
      if (!opts.animate) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 온 길은 `animate` 가
      // 거짓이라 위에서 이미 돌아갔다.
      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'enter':
          await runEnter(step, myGen);
          break;
        case 'leave':
          await runLeave(step, myGen);
          break;
        case 'open':
          await runOpen();
          break;
      }

      // 운동이 끝나면 그 장면을 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운
      // 화면이 속성 하나까지 같아진다 (S-scene). 옛 세대면 손대지 않고 물러난다.
      if (!alive(myGen)) return;
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        disposed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of raf) cancelAnimationFrame(id);
        }
        raf.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        cellBySlot.clear();
        // remove() 는 이미 떨어져 나간 노드에도 안전하다 — 러너가 컨테이너를
        // 먼저 비운 뒤 destroy 를 부르는 경우가 있다.
        sceneryG.remove();
        cellsG.remove();
        fxG.remove();
        captionText.remove();
      },
    };
  },
};
