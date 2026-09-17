/**
 * count-then-place stage — 눈금이 쌓였다가 자리로 바뀌는 화면.
 *
 * 세로로 읽는다.
 *
 * ```
 *          ▼                                  읽는 자리 (커서)
 *   [2][0][1][2][0][2]                        입력
 *          ▏  ▏  ▏                            눈금이 값의 열로 떨어져 쌓인다
 *      ═   ═   ═
 *      0   1   2                              값의 종류
 *    ┌ 0 ┐   ┌ 2 ┐ ┌ 3 ┐                      굳은 시작 자리 (칩)
 *   ══════ ══ ════════                        눈금이 누워 구역이 된다
 *   [ ][ ][ ][ ][ ][ ]                        결과
 *    0  1  2  3  4  5                          자리 번호
 * ```
 *
 * 눈금 하나의 가로 폭은 결과 칸의 폭과 같다. 눈금 하나가 자리 하나라는 것이
 * 크기로 드러나야, 세로로 쌓인 더미가 가로로 누워 구역이 되는 장면이 셈이 아니라
 * 같은 것의 방향만 바뀐 것으로 읽힌다.
 *
 * 화면 어디에도 두 값을 나란히 놓고 견주는 장면이 없다. 그것이 이 조각의 주장이다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`countTick()` · `settleBucket()` · `placeValue()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면 **전체**를 세우고,
 * 방금 달라진 것만 흐르게 한다 (S-scene).
 *
 * 정적 그리기가 정본이므로 운동의 방향이 뒤집힌다 — 요소는 이미 끝 자리에 서 있고,
 * 흐르게 할 때만 출발 그림으로 되돌려 놓고 시작한다. 출발 그림은 `prev` 를 들추지
 * 않고 장면이 실어 온 계기값(`step.from`)과 `reckon` 의 셈에서 복원한다.
 *
 * **쌓인 눈금은 남는 자취다.** 정적 그리기가 매번 다시 세우므로 어느 걸음으로
 * 되짚어도 그때까지 센 만큼이 그대로 선다 — 몇 개를 세었나가 곧 이 조각의 주장이다.
 *
 * ## 채움과 테두리를 가른다
 *
 * **채움은 값의 형편** — 타일도 눈금도 칩도 제 값의 색으로 칠한다. 같은 값이 입력
 * 줄에서 눈금으로, 눈금에서 결과 구역으로 이어지는 것이 이 그림의 뼈대다.
 * **테두리는 짚음의 표식** — 지금 읽고 있는 칸 하나만 강조 테를 두른다. 고른 쪽을
 * 채움으로 칠하면 값이 자리를 옮긴 뒤 그 자리에 다른 값이 앉아 읽기가 뒤집힌다.
 *
 * ## 타이머
 *
 * 이동은 rAF 보간이고, 걸어 둔 프레임과 기다리는 것을 `frames` · `waiters` 에 모아
 * `destroy()` 에서 전부 거둔다 — 취소된 프레임은 아예 불리지 않아 promise 를 풀 길이
 * 사라지고, 그러면 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  reckon,
  type CountThenPlaceCaption,
  type CountThenPlaceReckoning,
  type CountThenPlaceScene,
  type CountThenPlaceStep,
  type CountTick,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

// ── 세로 좌표. 그림이 정하는 값이라 그림 곁에 둔다 (S-view).
const CURSOR_Y = 12;
const CURSOR_W = 14;
const CURSOR_H = 11;
const INPUT_Y = 26;
const CELL_H = 38;
const TICK_BIRTH_Y = 68;
const TALLY_TOP = 76;
const TALLY_BASE = 156;
const KIND_LABEL_Y = 174;
const CHIP_Y = 186;
const CHIP_H = 20;
const CHIP_W = 30;
const BAND_Y = 212;
const RESULT_Y = 228;
const SLOT_LABEL_Y = 281;
const CAPTION_Y = 305;
const STAGE_H = 320;

// ── 가로. 폭은 러너가 정하고 (PIECE_CANVAS_W) 상수는 상한만 둔다 (S-piece).
const W = PIECE_CANVAS_W;
const CELL_MAX_W = 84;
const SIDE_MIN = 30;
const CELL_INSET = 2;

// ── 걸음별 운동 길이 (ms). stepMs 의 쉼과 겹치지 않게 짧게 잡는다.
const MS_COUNT = 320;
const MS_SETTLE = 380;
const MS_PLACE = 520;
/**
 * 마지막 걸음.
 *
 * 옮기기 전에는 여기에 운동이 없었다 — 커서를 한 번 흐리고 끝이라 걸음의 벽시계가
 * 0ms 였고, 자취 띠에 폭 없는 눈금이 섰다. `stepMs` 를 올리면 이미 긴 걸음이 함께
 * 길어지므로, 이 걸음에만 운동을 얹는다 (프로토콜 4 절 "얇은 걸음").
 */
const MS_DONE = 560;

/** 커서가 물러나며 올라가는 거리. */
const CURSOR_LIFT = 16;
/** 결과 줄을 훑을 때 타일이 들썩이는 높이. */
const DONE_BOB = 8;
/** 굳는 걸음에서 그 열이 들썩이는 높이. */
const COLUMN_LIFT = 5;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** i 번째 요소가 조금씩 늦게 출발하도록 전체 진행도를 개별 진행도로 나눈다. */
function staggered(t: number, i: number, count: number): number {
  const lead = count > 1 ? Math.min(0.45, 0.09 * (count - 1)) : 0;
  const start = count > 1 ? (lead * i) / (count - 1) : 0;
  return clamp01((t - start) / (1 - lead));
}

type Point = { readonly x: number; readonly y: number };

/**
 * 자리 셈.
 *
 * 상수는 상한이고 실제 크기는 캔버스에서 역산한다 — 요소 크기를 못박고 남는 폭을
 * 좌우 여백으로 버리지 않는다 (S-piece).
 */
type Layout = {
  readonly tileW: number;
  /** 입력·결과 칸 i 의 왼쪽 모서리. */
  cellX(index: number): number;
  cellCenter(index: number): number;
  /** 값 v 의 열 중심. 종류를 캔버스에 고르게 편다. */
  kindCenter(value: number): number;
  kindX(value: number): number;
  /** 그 값의 열에서 h 번째 (0-based) 눈금의 위 모서리. */
  tickY(height: number): number;
  readonly tickH: number;
};

function layoutFor(n: number, range: number): Layout {
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, n)));
  const tileW = cellW - CELL_INSET * 2;
  const originX = Math.round((W - cellW * n) / 2);
  // 한 값에 전부 몰려도 더미가 위로 넘치지 않게 간격을 역산한다.
  const tickPitch = Math.min(16, Math.floor((TALLY_BASE - TALLY_TOP) / Math.max(1, n)));
  const tickH = Math.max(6, tickPitch - 3);
  const kinds = Math.max(1, range);
  return {
    tileW,
    tickH,
    cellX: (index) => originX + index * cellW + CELL_INSET,
    cellCenter: (index) => originX + index * cellW + cellW / 2,
    kindCenter: (value) => Math.round((W * (2 * value + 1)) / (2 * kinds)),
    kindX: (value) => Math.round((W * (2 * value + 1)) / (2 * kinds) - tileW / 2),
    tickY: (height) => TALLY_BASE - tickH - height * tickPitch,
  };
}

export const countThenPlaceStageView: CanvasView = {
  canvas: { height: STAGE_H },

  // 러너가 붙여 준 캔버스는 컨테이너에 이미 달려 있다. 컨테이너를 비우지 않는다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CountThenPlaceScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${STAGE_H}`);

    const cellLayer = el('g');
    const columnLayer = el('g');
    const tickLayer = el('g');
    const chipLayer = el('g');
    const tileLayer = el('g');
    const cursorLayer = el('g');
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    const root = el('g');
    root.append(cellLayer, columnLayer, tickLayer, chipLayer, tileLayer, cursorLayer, caption);
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 걸음 함수가 `await` 를 지나므로, 되짚기가 가운데 끼어들면 남은 프레임이 이미
     * 새로 선 화면을 덮는다. 정적 그리기가 노드를 매번 새로 만들기는 하지만 살아
     * 남은 운동이 쥔 것은 **손잡이 변수가 아니라 노드**이고, 캡션처럼 다시 만들지
     * 않고 계속 쓰는 요소도 있다. 마디마다 자기 번호가 유효한지 보고 아니면 화면에
     * 손대지 않고 물러난다 (S-scene).
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 취소 가능한 시간 진행.
     *
     * 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧 덮어쓰기다.
     */
    function animate(ms: number, onFrame: (p: number) => void, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        onFrame(1);
        return Promise.resolve();
      }
      onFrame(0);
      return new Promise<void>((resolve) => {
        let id = 0;
        let origin = -1;
        let settled = false;
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
          const p = ms <= 0 ? 1 : clamp01((now - origin) / ms);
          onFrame(p);
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

    // ── 장면이 정하는 것들. 매 render 마다 새로 세운다.
    let geo: Layout | null = null;
    let reck: CountThenPlaceReckoning | null = null;
    let tints: readonly string[] = [];
    let inks: readonly string[] = [];
    let tickNodes: SVGRectElement[] = [];
    let tileNodes: (SVGGElement | null)[] = [];
    let chipNodes: (SVGGElement | null)[] = [];
    let chipLabels: (SVGTextElement | null)[] = [];
    let columnBars: (SVGRectElement | null)[] = [];
    let columnLabels: (SVGTextElement | null)[] = [];
    let cursorNode: SVGPolygonElement | null = null;

    const putAt = (node: SVGGraphicsElement, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${x}, ${y})`);
    };

    /** 그 눈금이 지금 어디 있나 — 굳은 열이면 누워 있고, 아니면 쌓여 있다. */
    function tickSpot(
      scene: CountThenPlaceScene,
      r: CountThenPlaceReckoning,
      g: Layout,
      tick: CountTick,
    ): Point {
      if (tick.value < scene.settled) {
        return { x: g.cellX(r.starts[tick.value] + tick.height), y: BAND_Y };
      }
      return { x: g.kindX(tick.value), y: g.tickY(tick.height) };
    }

    /** 굳는 순간에 열에서 태어나 구역 앞에 서는 칩. */
    function buildChip(value: number, slot: number, g: Layout): {
      g: SVGGElement;
      label: SVGTextElement;
    } {
      const node = el('g');
      node.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: CHIP_W,
          height: CHIP_H,
          rx: 6,
          fill: inks[value] ?? c.text,
        }),
      );
      const label = el('text', {
        x: CHIP_W / 2,
        y: CHIP_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.stateInk,
      });
      label.textContent = String(slot);
      node.appendChild(label);
      putAt(node, Math.round(g.cellCenter(slot) - CHIP_W / 2), CHIP_Y);
      chipLayer.appendChild(node);
      return { g: node, label };
    }

    function buildCursor(x: number): SVGPolygonElement {
      const node = el('polygon', {
        points: `0,0 ${CURSOR_W},0 ${CURSOR_W / 2},${CURSOR_H}`,
        fill: c.text,
      });
      putAt(node, x, CURSOR_Y);
      cursorLayer.appendChild(node);
      return node;
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령을 따로 둘
    // 필요가 없고, 어느 걸음에서 어느 걸음으로 가든 같은 길이다.

    /** 늘 비우고 시작한다 (S-scene). */
    function clear(): void {
      cellLayer.textContent = '';
      columnLayer.textContent = '';
      tickLayer.textContent = '';
      chipLayer.textContent = '';
      tileLayer.textContent = '';
      cursorLayer.textContent = '';
      geo = null;
      reck = null;
      tickNodes = [];
      tileNodes = [];
      chipNodes = [];
      chipLabels = [];
      columnBars = [];
      columnLabels = [];
      cursorNode = null;
    }

    /** 결과 칸 — 아직 비어 있는 자리와 그 번호. */
    function drawCells(n: number, g: Layout): void {
      for (let i = 0; i < n; i += 1) {
        cellLayer.appendChild(
          el('rect', {
            x: g.cellX(i),
            y: RESULT_Y,
            width: g.tileW,
            height: CELL_H,
            rx: 5,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
        const label = el('text', {
          x: g.cellCenter(i),
          y: SLOT_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = String(i);
        cellLayer.appendChild(label);
      }
    }

    /** 값의 종류 — 눈금이 쌓일 열. */
    function drawColumns(range: number, g: Layout): void {
      for (let v = 0; v < range; v += 1) {
        const bar = el('rect', {
          x: g.kindX(v),
          y: TALLY_BASE,
          width: g.tileW,
          height: 2,
          fill: c.border,
        });
        const label = el('text', {
          x: g.kindCenter(v),
          y: KIND_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        label.textContent = String(v);
        columnLayer.append(bar, label);
        columnBars.push(bar);
        columnLabels.push(label);
      }
    }

    /** 쌓이거나 누운 눈금들 — 되짚어도 남아야 하는 자취다. */
    function drawTicks(scene: CountThenPlaceScene, r: CountThenPlaceReckoning, g: Layout): void {
      for (const tick of r.ticks) {
        const node = el('rect', {
          x: 0,
          y: 0,
          width: g.tileW,
          height: g.tickH,
          rx: 3,
          fill: inks[tick.value] ?? c.text,
        });
        const spot = tickSpot(scene, r, g, tick);
        putAt(node, spot.x, spot.y);
        tickLayer.appendChild(node);
        tickNodes.push(node);
      }
    }

    /**
     * 시작 자리 칩 — 굳은 열마다 하나씩, 다음에 앉을 자리를 가리킨다.
     *
     * 한 번도 안 나온 값은 구역이 없고, 구역을 다 쓴 값은 더 가리킬 자리가 없다.
     * 둘 다 `nextSlot` 이 `null` 이므로 **짓지 않는다** — 숨기기만 하면 앞 걸음의
     * 자리가 속성에 남아 되짚기 판정이 어긋난다.
     */
    function drawChips(scene: CountThenPlaceScene, r: CountThenPlaceReckoning, g: Layout): void {
      for (let v = 0; v < scene.range; v += 1) {
        const slot = v < scene.settled ? r.nextSlot[v] : null;
        if (slot === null || slot === undefined) {
          chipNodes.push(null);
          chipLabels.push(null);
          continue;
        }
        const built = buildChip(v, slot, g);
        chipNodes.push(built.g);
        chipLabels.push(built.label);
      }
    }

    /**
     * 입력 타일 — 놓인 것은 제 결과 자리에, 아직인 것은 입력 줄에.
     *
     * 채움은 그 값이 무엇인가(값의 형편), 테두리는 지금 읽고 있는가(짚음의 표식).
     */
    function drawTiles(scene: CountThenPlaceScene, r: CountThenPlaceReckoning, g: Layout): void {
      const seatOf = new Map<number, number>();
      for (const seat of r.seats) seatOf.set(seat.index, seat.slot);

      for (let i = 0; i < scene.values.length; i += 1) {
        const value = scene.values[i];
        const slot = seatOf.get(i);
        const reading = scene.cursor === i;
        const node = el('g');
        node.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width: g.tileW,
            height: CELL_H,
            rx: 5,
            fill: tints[value] ?? c.bgSubtle,
            stroke: reading ? c.accent : c.border,
            'stroke-width': reading ? 2.5 : 1,
          }),
        );
        const text = el('text', {
          x: g.tileW / 2,
          y: CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: c.stateInk,
        });
        text.textContent = String(value);
        node.appendChild(text);
        putAt(node, slot === undefined ? g.cellX(i) : g.cellX(slot), slot === undefined ? INPUT_Y : RESULT_Y);
        tileLayer.appendChild(node);
        tileNodes.push(node);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(kind: CountThenPlaceCaption): void {
      switch (kind) {
        case 'count':
          caption.textContent = t('caption.count', 'Tally how many of each value there are');
          return;
        case 'settle':
          caption.textContent = t('caption.settle', 'The tallies harden into starting slot numbers');
          return;
        case 'place':
          caption.textContent = t('caption.place', 'Each value goes straight to its own number');
          return;
        case 'done':
          caption.textContent = t('caption.done', 'Sorted without comparing a single pair');
          return;
      }
    }

    function drawStatic(scene: CountThenPlaceScene): void {
      clear();
      drawCaption(scene.caption);

      const n = scene.values.length;
      if (n === 0) return;

      // 색판의 씨앗은 선언이 정한 종류 수다. "지금까지 드러난 수" 로 정하면 값이
      // 하나 더 드러날 때마다 이미 칠한 색이 통째로 갈린다.
      const kinds = Math.max(1, scene.range);
      tints = categorical(kinds, 'pastel');
      inks = categorical(kinds, 'vivid');

      // 자리를 먼저 한 번에 셈하고 그 다음에 그린다. 그리면서 이웃의 지금 좌표를
      // 재면 순회 순서가 곧 숨은 상태가 된다.
      const g = layoutFor(n, scene.range);
      const r = reckon(scene);
      geo = g;
      reck = r;

      drawCells(n, g);
      drawColumns(scene.range, g);
      drawTicks(scene, r, g);
      drawChips(scene, r, g);
      drawTiles(scene, r, g);
      if (scene.cursor !== null) {
        cursorNode = buildCursor(Math.round(g.cellCenter(scene.cursor) - CURSOR_W / 2));
      }
    }

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 출발 그림으로
    // 되돌려 놓고 시작한다. 출발 그림은 장면이 실어 온 계기값과 `reckon` 의 셈에서
    // 얻는다 — `prev` 는 무엇을 흐르게 할지 고르는 데만 쓴다 (S-scene).

    /** 값을 하나 읽고, 그 값의 열에 눈금이 떨어져 쌓인다. */
    async function flowCount(
      step: Extract<CountThenPlaceStep, { kind: 'count' }>,
      scene: CountThenPlaceScene,
      r: CountThenPlaceReckoning,
      g: Layout,
      live: () => boolean,
    ): Promise<void> {
      const at = r.ticks.findIndex((tick) => tick.index === step.at);
      const tick = r.ticks[at];
      const node = tickNodes[at];
      if (!tick || !node) return;

      const end = tickSpot(scene, r, g, tick);
      const x0 = g.cellX(step.at);
      const cursor = cursorNode;
      const from = Math.round(g.cellCenter(step.from) - CURSOR_W / 2);
      const to = Math.round(g.cellCenter(step.at) - CURSOR_W / 2);

      await animate(
        MS_COUNT,
        (p) => {
          const e = easeOut(p);
          node.setAttribute(
            'transform',
            `translate(${x0 + (end.x - x0) * e}, ${TICK_BIRTH_Y + (end.y - TICK_BIRTH_Y) * e})`,
          );
          node.setAttribute('opacity', String(clamp01(p * 2)));
          if (cursor) {
            const ce = easeInOut(clamp01(p * 1.6));
            cursor.setAttribute('transform', `translate(${from + (to - from) * ce}, ${CURSOR_Y})`);
          }
        },
        live,
      );
    }

    /**
     * 쌓인 더미가 눕는다. 눈금 하나가 자리 하나가 되고, 맨 앞이 시작 번호다.
     *
     * 눕는 눈금과 서는 칩이 한 뜻이므로 **한 목록 · 한 시계**로 흘린다. 시계를
     * 둘로 나누면 lockstep 이 우연히 맞는 꼴이 되고 하나를 흘려보낼 여지가 생긴다.
     * 눈금이 하나도 없는 열에서도 그 열이 들썩여 걸음이 비지 않는다.
     */
    async function flowSettle(
      step: Extract<CountThenPlaceStep, { kind: 'settle' }>,
      r: CountThenPlaceReckoning,
      g: Layout,
      live: () => boolean,
    ): Promise<void> {
      const v = step.value;
      const moving: { from: Point; to: Point; node: SVGRectElement }[] = [];
      r.ticks.forEach((tick, i) => {
        if (tick.value !== v) return;
        const node = tickNodes[i];
        if (!node) return;
        moving.push({
          from: { x: g.kindX(v), y: g.tickY(tick.height) },
          to: { x: g.cellX(r.starts[v] + tick.height), y: BAND_Y },
          node,
        });
      });

      const chip = chipNodes[v] ?? null;
      const chipTo = r.nextSlot[v];
      const chipFrom = Math.round(g.kindCenter(v) - CHIP_W / 2);
      const chipEnd =
        chipTo === null || chipTo === undefined
          ? chipFrom
          : Math.round(g.cellCenter(chipTo) - CHIP_W / 2);
      const bar = columnBars[v] ?? null;
      const label = columnLabels[v] ?? null;

      await animate(
        MS_SETTLE,
        (p) => {
          moving.forEach((m, i) => {
            const e = easeInOut(staggered(p, i, moving.length));
            m.node.setAttribute(
              'transform',
              `translate(${m.from.x + (m.to.x - m.from.x) * e}, ${m.from.y + (m.to.y - m.from.y) * e})`,
            );
          });
          const lift = Math.sin(Math.PI * clamp01(p)) * -COLUMN_LIFT;
          bar?.setAttribute('transform', `translate(0, ${lift})`);
          label?.setAttribute('transform', `translate(0, ${lift})`);
          if (chip) {
            const e = easeOut(clamp01((p - 0.25) / 0.75));
            chip.setAttribute('transform', `translate(${chipFrom + (chipEnd - chipFrom) * e}, ${CHIP_Y})`);
            chip.setAttribute('opacity', String(e));
          }
        },
        live,
      );
    }

    /**
     * 값이 제 번호로 곧장 날아가 앉는다. 앉으면 그 구역의 번호가 하나 오르고,
     * 구역을 다 쓴 칩은 제 구역 안으로 잦아든다.
     */
    async function flowPlace(
      step: Extract<CountThenPlaceStep, { kind: 'place' }>,
      r: CountThenPlaceReckoning,
      g: Layout,
      live: () => boolean,
    ): Promise<void> {
      const seat = r.seats.find((s) => s.index === step.at);
      const tile = tileNodes[step.at] ?? null;
      if (!seat || !tile) return;

      const x0 = g.cellX(step.at);
      const x1 = g.cellX(seat.slot);
      const cursor = cursorNode;
      const from = Math.round(g.cellCenter(step.from) - CURSOR_W / 2);
      const to = Math.round(g.cellCenter(step.at) - CURSOR_W / 2);

      // 놓고 난 뒤 그 구역이 가리킬 자리. `null` 이면 다 썼다는 뜻이고, 정적
      // 그리기는 이미 칩을 거두었다 — 잦아드는 것을 보이려면 잠깐 되세운다.
      const after = r.nextSlot[seat.value] ?? null;
      const exiting = after === null;
      const chip = exiting
        ? buildChip(seat.value, seat.slot, g).g
        : (chipNodes[seat.value] ?? null);
      const chipLabel = exiting ? null : (chipLabels[seat.value] ?? null);
      const chipFrom = Math.round(g.cellCenter(seat.slot) - CHIP_W / 2);
      const chipTo = after === null ? chipFrom : Math.round(g.cellCenter(after) - CHIP_W / 2);
      // 출발 그림의 번호 — 이 걸음이 앉힌 자리다. 끝 번호는 정적 그리기의 것이다.
      if (chipLabel) chipLabel.textContent = String(seat.slot);

      await animate(
        MS_PLACE,
        (p) => {
          const e = easeInOut(clamp01(p / 0.66));
          tile.setAttribute(
            'transform',
            `translate(${x0 + (x1 - x0) * e}, ${INPUT_Y + (RESULT_Y - INPUT_Y) * e})`,
          );
          if (cursor) {
            const ce = easeInOut(clamp01(p / 0.5));
            cursor.setAttribute('transform', `translate(${from + (to - from) * ce}, ${CURSOR_Y})`);
          }
          const cp = clamp01((p - 0.6) / 0.4);
          if (!chip) return;
          if (exiting) {
            const q = easeIn(cp);
            chip.setAttribute('transform', `translate(${chipFrom}, ${CHIP_Y + (RESULT_Y + 8 - CHIP_Y) * q})`);
            chip.setAttribute('opacity', String(1 - cp));
            return;
          }
          const q = easeOut(cp);
          chip.setAttribute('transform', `translate(${chipFrom + (chipTo - chipFrom) * q}, ${CHIP_Y})`);
          if (chipLabel && cp >= 0.5 && after !== null) chipLabel.textContent = String(after);
        },
        live,
      );
    }

    /**
     * 다 놓았다. 커서가 물러나고 결과 줄이 왼쪽부터 차례로 들썩인다 — 견주지
     * 않고도 왼쪽부터 읽으면 차례대로라는 것이 이 걸음이 하는 말이다.
     */
    async function flowDone(
      step: Extract<CountThenPlaceStep, { kind: 'done' }>,
      r: CountThenPlaceReckoning,
      g: Layout,
      live: () => boolean,
    ): Promise<void> {
      // 커서는 정적 그리기가 이미 거두었다. 물러나는 몸짓을 보이려면 되세운다.
      const cursor =
        step.from === null ? null : buildCursor(Math.round(g.cellCenter(step.from) - CURSOR_W / 2));

      const sweep = [...r.seats]
        .sort((a, b) => a.slot - b.slot)
        .map((seat) => ({ slot: seat.slot, node: tileNodes[seat.index] ?? null }));

      if (sweep.length === 0 && cursor === null) return;

      await animate(
        MS_DONE,
        (p) => {
          sweep.forEach((m, i) => {
            if (!m.node) return;
            const bob = Math.sin(Math.PI * staggered(p, i, sweep.length)) * -DONE_BOB;
            m.node.setAttribute('transform', `translate(${g.cellX(m.slot)}, ${RESULT_Y + bob})`);
          });
          if (cursor) {
            const e = easeIn(p);
            cursor.setAttribute('opacity', String(1 - e));
            cursor.setAttribute(
              'transform',
              `translate(${Math.round(g.cellCenter(step.from ?? 0) - CURSOR_W / 2)}, ${CURSOR_Y - CURSOR_LIFT * e})`,
            );
          }
        },
        live,
      );
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: CountThenPlaceScene,
      _prev: CountThenPlaceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => alive(mine);

      drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      const g = geo;
      const r = reck;
      if (step === null || g === null || r === null) return;

      switch (step.kind) {
        case 'count':
          await flowCount(step, next, r, g, live);
          break;
        case 'settle':
          await flowSettle(step, r, g, live);
          break;
        case 'place':
          await flowPlace(step, r, g, live);
          break;
        case 'done':
          await flowDone(step, r, g, live);
          break;
      }

      if (!live()) return;
      // 흐르며 남은 opacity·임시 노드·보간의 끝자리가 통째로 사라진다. 정적 경로가
      // 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다. 취소된 프레임은 아예 불리지 않아 이 길이 없으면
        // `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
