/**
 * bound-and-cut-stage — 자를 대어 재는 판.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 되돌릴 명령이 필요 없고,
 * 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * ── 무엇이 보이나
 *
 * 화면의 중심은 **재는 장면**이다. 갈래마다 자리 하나가 서고, 그 자리에 막대가
 * 두 토막으로 선다 — 아래는 이미 담기로 한 값(찬 것), 위는 남은 것을 쪼개서라도
 * 채웠을 때의 몫(내다본 것, 점선). 두 토막의 끝이 그 갈래의 **한계**다.
 *
 * 판 전체를 가로지르는 노란 줄이 지금까지의 **최고**이고, 오른쪽 칸에 값이
 * 상주한다. 새 최고가 나오면 줄과 칸이 함께 **올라간다** — 자르는 기준이 재생
 * 도중에 올라간다는 것이 이 화면의 시계다.
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 막대 끝의 숫자도, 최고 칸의 숫자도, 캡션의 "한계 24, 최고 27" 도 전부
 * `scene.ts` 의 `boundOf` · `loadOf` · `bestOf` 를 지난다. 걸음이 실어 오는 수는
 * 하나도 없다. 명령형 stage 는 같은 수를 `let best` 와 칸의 `textContent` 와
 * payload 세 곳에서 꺼내 쓰고 있었다.
 *
 * ── 잘린 갈래가 다 끝난 화면에 남는다
 *
 * 이 조각의 주장은 "한계를 재어 안 볼 가지를 자른다" 이므로, 자른 자리를 지우면
 * 무엇을 아꼈는지가 화면에서 사라진다. 그래서 잘린 갈래는 **잰 기록**(점선 윤곽과
 * 찬 것/내다본 것의 경계, 한계 숫자)과 **자른 근거**(한계에서 최고까지 못 미친
 * 만큼을 긋는 붉은 점선)와 `×` 를 정지 화면까지 달고 서 있는다. 셋 다 장면에서
 * 파생되므로 어느 걸음으로 되짚어도 다시 선다.
 *
 * ── 세로
 *
 * 그림이 정하는 값이라 이 파일이 상수로 갖는다 (S-view). 자료에 따라 달라지지
 * 않으므로 재생 중 다시 재지 않는다.
 *
 * 색은 전부 design-tokens 경유 (S-view). 문자는 params.t 경유 (C10).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  answerOrderOf,
  bestBefore,
  bestOf,
  boundOf,
  isComplete,
  isCut,
  loadOf,
  type BoundAndCutScene,
  type Decision,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_H = 282;
const SIDE_MIN = 24;

/** 물건 띠 */
const STRIP_Y = 8;
const STRIP_H = 30;
const CAP_PILL_W = 116;
const STRIP_GAP = 10;

/** 자 (눈금판) */
const AXIS_LABEL_X = 28;
const BOARD_X = 36;
const BOARD_W = 504;
const BOARD_TOP = 54;
const BASE_Y = 204;
const BOARD_H = BASE_Y - BOARD_TOP;
const TICK_STEP = 10;

/** 최고가 상주하는 칸 */
const BEST_BOX_X = BOARD_X + BOARD_W + 8;
const BEST_BOX_W = PIECE_CANVAS_W - 6 - BEST_BOX_X;
const BEST_BOX_H = 30;

/** 갈래 자리 */
const COL_MAX_W = 96;
const BAR_MAX_W = 48;
const CHIP_Y = BASE_Y + 8;
const CHIP_H = 17;
const CHIP_MAX_W = 22;
const CHIP_GAP = 3;
const MARK_Y = CHIP_Y + CHIP_H + 14;
const CAPTION_Y = 268;

/** 결정 딱지가 아래에서 올라오는 거리. */
const CHIP_RISE = 9;
/** 답을 두르는 테가 밖에서 조여드는 거리. */
const RING_GROW = 11;
/** 잘린 갈래의 결정이 남는 흐릿함 — 지워지지는 않는다. */
const CUT_CHIP_OPACITY = 0.45;
const GHOST_OPACITY = 0.5;
const REASON_OPACITY = 0.55;

/** 걸음 안의 시간. stepMs 위에 얹히므로 짧게 유지한다 (S-piece). */
const FILL_MS = 160;
const RISE_MS = 260;
const BEST_MS = 300;
/** 못 미친 만큼을 긋는 시간 — 자르는 근거를 눈이 따라갈 만큼. */
const REASON_MS = 200;
const BLADE_MS = 150;
const FALL_MS = 220;
/** 답을 두르는 테가 조여드는 시간. 얹기 전에는 흐를 것이 없는 걸음이었다. */
const RING_MS = 300;

/** 도형에 새긴 표식 — 잘렸다. 번역 대상이 아니다 (C10). */
const CUT_MARK = '×';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function label(content: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function stamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 한계는 쪼갠 값이라 소수 한 자리, 실제로 담은 값은 정수로 적는다. */
const fmtBound = (n: number): string => n.toFixed(1);
const fmtValue = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * 자와 자리의 치수. 장면은 좌표를 모르므로 여기서 캔버스에 역산한다 (S-piece).
 *
 * **그리기 전에 한 번에 셈한다.** 그리면서 이웃의 지금 좌표를 되읽으면 순회 순서가
 * 곧 숨은 상태가 된다 (프로토콜 4절).
 */
type Board = {
  readonly scaleMax: number;
  readonly colW: number;
  readonly barW: number;
  readonly chipW: number;
  readonly originX: number;
  readonly chipSpan: number;
  yOf(value: number): number;
  leftOf(order: number): number;
  barXOf(order: number): number;
  centerXOf(order: number): number;
};

function boardOf(scene: BoundAndCutScene): Board {
  const scaleMax = Math.max(TICK_STEP, scene.scaleMax);
  const count = Math.max(1, scene.columns);
  const colW = Math.min(COL_MAX_W, Math.floor(BOARD_W / count));
  const barW = Math.min(BAR_MAX_W, Math.round(colW * 0.58));
  const slots = Math.max(1, scene.items.length);
  const chipW = Math.min(
    CHIP_MAX_W,
    Math.max(12, Math.floor((colW - 10 - CHIP_GAP * 2) / slots)),
  );
  const originX = BOARD_X + Math.round((BOARD_W - count * colW) / 2);
  const leftOf = (order: number): number => originX + order * colW;
  const barXOf = (order: number): number => leftOf(order) + Math.round((colW - barW) / 2);
  return {
    scaleMax,
    colW,
    barW,
    chipW,
    originX,
    chipSpan: slots * chipW + (slots - 1) * CHIP_GAP,
    yOf: (value: number): number => BASE_Y - (value / scaleMax) * BOARD_H,
    leftOf,
    barXOf,
    centerXOf: (order: number): number => barXOf(order) + barW / 2,
  };
}

/** 한 갈래 자리의 손잡이. 정적 그리기가 매번 새로 채운다. */
type ColumnEls = {
  readonly solid: SVGRectElement | null;
  readonly spec: SVGRectElement | null;
  readonly cap: SVGLineElement;
  readonly boundLabel: SVGTextElement;
  readonly chips: SVGGElement;
  readonly splitLabel: SVGTextElement | null;
};

export const boundAndCutStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BoundAndCutScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    svg.appendChild(root);

    // 뒤에 붙는 것이 위에 온다. 자리 바탕은 눈금 아래, 한계 숫자는 최고 줄 위 —
    // 한계가 최고에 가까울수록 둘이 겹치는데 하필 그때가 읽어야 할 순간이다.
    const stripLayer = el('g', {});
    const slotLayer = el('g', {});
    const boardLayer = el('g', {});
    const columnLayer = el('g', {});
    const bestLayer = el('g', {});
    const numberLayer = el('g', {});
    const captionLayer = el('g', {});
    root.append(stripLayer, slotLayer, boardLayer, columnLayer, bestLayer, numberLayer, captionLayer);

    // ── 걸어 둔 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;
    const hasRaf = typeof requestAnimationFrame === 'function';

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 걸음이 `await` 를 여럿 지나므로 (재고 · 긋고 · 자르고) 되짚기가 가운데
     * 끼어들면 남은 마디들이 깨어나 이미 새로 선 화면을 덮는다. 자기 세대가
     * 아니면 화면에 손대지 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0 || !hasRaf) {
          onFrame(1);
          done();
          return;
        }
        // destroy 가 프레임을 거두면 tick 이 아예 안 불리므로, 기다리는 쪽을
        // 따로 쥐고 있다가 깨운다 (S-piece).
        pending.add(done);

        const begun = stamp();
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          const raw = Math.min(1, (stamp() - begun) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    /** 갈래 자리마다의 그릇. 몸통은 판 위에, 한계 숫자는 최고 줄 위에 산다. */
    let holders = new Map<number, { body: SVGGElement; label: SVGGElement }>();
    let cols = new Map<number, ColumnEls>();
    let bestEls: {
      line: SVGLineElement;
      box: SVGRectElement;
      caption: SVGTextElement;
      value: SVGTextElement;
    } | null = null;
    let ringEl: SVGRectElement | null = null;

    function drawStrip(scene: BoundAndCutScene): void {
      clear(stripLayer);
      if (scene.items.length === 0) return;

      const usable = PIECE_CANVAS_W - SIDE_MIN * 2;
      const cardW = Math.floor(
        (usable - CAP_PILL_W - STRIP_GAP * scene.items.length) / scene.items.length,
      );

      stripLayer.appendChild(
        el('rect', {
          x: SIDE_MIN,
          y: STRIP_Y,
          width: CAP_PILL_W,
          height: STRIP_H,
          rx: 15,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      stripLayer.appendChild(
        label(t('label.capacity', 'Capacity {c}', { c: scene.capacity }), {
          x: SIDE_MIN + CAP_PILL_W / 2,
          y: STRIP_Y + 20,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        }),
      );

      scene.items.forEach((it, i) => {
        const x = SIDE_MIN + CAP_PILL_W + STRIP_GAP + i * (cardW + STRIP_GAP);
        stripLayer.appendChild(
          el('rect', {
            x,
            y: STRIP_Y,
            width: cardW,
            height: STRIP_H,
            rx: 5,
            fill: c.bgSubtle,
            stroke: c.border,
          }),
        );
        stripLayer.appendChild(
          label(it.id, {
            x: x + 13,
            y: STRIP_Y + 21,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': '700',
            fill: c.text,
          }),
        );
        stripLayer.appendChild(
          label(t('label.itemSpec', 'w {w} · v {v}', { w: it.weight, v: it.value }), {
            x: x + 28,
            y: STRIP_Y + 20,
            'text-anchor': 'start',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }),
        );
      });
    }

    function drawBoard(board: Board): void {
      clear(boardLayer);
      for (let v = 0; v <= board.scaleMax; v += TICK_STEP) {
        const y = board.yOf(v);
        boardLayer.appendChild(
          el('line', {
            x1: BOARD_X,
            y1: y,
            x2: BOARD_X + BOARD_W,
            y2: y,
            stroke: c.border,
            'stroke-width': v === 0 ? 1.5 : 1,
          }),
        );
        boardLayer.appendChild(
          label(String(v), {
            x: AXIS_LABEL_X,
            y: y + 4,
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }),
        );
      }
    }

    /**
     * 지금 이야기하고 있는 갈래의 바탕.
     *
     * 명령형 stage 는 "재는 중" 을 점선 색으로만 잠깐 보이고 걸음이 끝나면
     * 되돌렸다 — 그 걸음으로 되짚으면 어느 갈래 이야기인지 화면에 남지 않았다.
     * 이제 그 걸음 내내 머문다.
     */
    function drawSlot(scene: BoundAndCutScene, board: Board): void {
      clear(slotLayer);
      const mark = scene.mark;
      if (!mark || mark.kind === 'done') return;
      slotLayer.appendChild(
        el('rect', {
          x: board.leftOf(mark.order),
          y: BOARD_TOP - 6,
          width: board.colW,
          height: MARK_Y - BOARD_TOP + 6,
          rx: 6,
          fill: c.bgSubtle,
        }),
      );
    }

    function chipsFor(scene: BoundAndCutScene, board: Board, order: number): SVGGElement {
      const g = el('g', {});
      const branch = scene.branches[order];
      if (!branch) return g;
      const startX = board.leftOf(order) + Math.round((board.colW - board.chipSpan) / 2);
      branch.decisions.forEach((d: Decision, i: number) => {
        const x = startX + i * (board.chipW + CHIP_GAP);
        const id = scene.items[i]?.id ?? '';
        g.appendChild(
          el('rect', {
            x,
            y: CHIP_Y,
            width: board.chipW,
            height: CHIP_H,
            rx: 3,
            fill: d === 'in' ? c.itemSorted : 'none',
            stroke: d === 'in' ? c.itemSorted : c.border,
            'stroke-dasharray': d === 'open' ? '2 2' : 'none',
          }),
        );
        g.appendChild(
          label(id, {
            x: x + board.chipW / 2,
            y: CHIP_Y + 12,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': d === 'in' ? '700' : '400',
            fill: d === 'in' ? c.textInverse : c.textMuted,
            opacity: d === 'open' ? 0.5 : 1,
          }),
        );
        if (d === 'out') {
          // 대각선으로 그으면 22px 칸에서 글자를 덮는다. 가로로 긋는다.
          g.appendChild(
            el('line', {
              x1: x + 3,
              y1: CHIP_Y + CHIP_H / 2,
              x2: x + board.chipW - 3,
              y2: CHIP_Y + CHIP_H / 2,
              stroke: c.textMuted,
              'stroke-width': 1.2,
            }),
          );
        }
      });
      return g;
    }

    /**
     * 갈래 자리 하나를 세운다.
     *
     * `over.cut` 을 덮어쓸 수 있는 것은 자르는 걸음이 **출발 모습으로 되돌려
     * 놓기** 위해서다 (아직 잘리지 않은 갈래). 장면을 고치는 것이 아니라 그
     * 순간의 그림만 바꾸며, 운동이 끝나면 정적 그리기가 통째로 다시 세운다.
     */
    function paintColumn(
      scene: BoundAndCutScene,
      board: Board,
      order: number,
      over?: { cut?: boolean },
    ): ColumnEls | null {
      const holder = holders.get(order);
      if (!holder) return null;
      clear(holder.body);
      clear(holder.label);

      const cut = over?.cut ?? isCut(scene, order);
      const active = scene.mark !== null && scene.mark.kind !== 'done' && scene.mark.order === order;
      const complete = isComplete(scene, order);
      const { value } = loadOf(scene, order);
      const rel = boundOf(scene, order);

      const barX = board.barXOf(order);
      const centerX = board.centerXOf(order);
      const yValue = board.yOf(value);
      const yBound = board.yOf(rel.bound);
      const specH = Math.max(0, yValue - yBound);

      let solid: SVGRectElement | null = null;
      let spec: SVGRectElement | null = null;
      let splitLabel: SVGTextElement | null = null;

      if (cut) {
        // 잰 기록은 자리에 남는다 — 무엇을 아꼈는지가 화면에서 사라지지 않게.
        holder.body.appendChild(
          el('rect', {
            x: barX + 0.5,
            y: yBound,
            width: board.barW - 1,
            height: Math.max(0, BASE_Y - yBound),
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
            opacity: GHOST_OPACITY,
          }),
        );
        // 잘린 자리에도 찬 것과 내다본 몫의 경계는 남긴다.
        if (value > 0) {
          holder.body.appendChild(
            el('line', {
              x1: barX + 0.5,
              y1: yValue,
              x2: barX + board.barW - 0.5,
              y2: yValue,
              stroke: c.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 3',
              opacity: GHOST_OPACITY,
            }),
          );
        }
        // 자른 근거 — 이 갈래의 한계가 지금 최고에 못 미친다. 두 수를 나란히
        // 놓고 견주는 자리라 둘 다 장면의 같은 함수에서 나온다.
        holder.body.appendChild(
          el('line', {
            x1: centerX,
            y1: yBound,
            x2: centerX,
            y2: board.yOf(bestOf(scene)),
            stroke: c.danger,
            'stroke-width': 1.5,
            'stroke-dasharray': '3 3',
            opacity: REASON_OPACITY,
          }),
        );
      } else {
        // 아직 없는 것은 숨기지 말고 짓지 않는다 — 숨겨 두면 앞 걸음의 수치가
        // 함께 남아 되짚기 판정이 어긋난다 (S-scene).
        if (value > 0) {
          solid = el('rect', {
            x: barX,
            y: yValue,
            width: board.barW,
            height: BASE_Y - yValue,
            fill: c.itemSorted,
          });
          holder.body.appendChild(solid);
        }
        if (specH > 0) {
          spec = el('rect', {
            x: barX + 0.5,
            y: yBound,
            width: board.barW - 1,
            height: specH,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          holder.body.appendChild(spec);
        }
      }

      const cap = el('line', {
        x1: barX - 7,
        y1: yBound,
        x2: barX + board.barW + 7,
        y2: yBound,
        stroke: cut ? c.textMuted : complete ? c.itemSorted : c.text,
        'stroke-width': active ? 4 : 2.5,
        'stroke-linecap': 'round',
        'stroke-dasharray': cut ? '3 2' : 'none',
      });
      holder.body.appendChild(cap);

      if (rel.splitItem !== null && specH >= 20) {
        splitLabel = label(`${rel.splitItem} ${rel.splitNum}/${rel.splitDen}`, {
          x: centerX,
          y: yBound + specH / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        holder.body.appendChild(splitLabel);
      }

      const chips = chipsFor(scene, board, order);
      if (cut) chips.setAttribute('opacity', String(CUT_CHIP_OPACITY));
      holder.body.appendChild(chips);

      if (cut) {
        holder.body.appendChild(
          label(CUT_MARK, {
            x: centerX,
            y: MARK_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': '700',
            fill: c.danger,
          }),
        );
      }

      const boundLabel = label(fmtBound(rel.bound), {
        x: centerX,
        y: Math.max(BOARD_TOP - 4, yBound - 9),
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': '700',
        fill: cut ? c.textMuted : c.text,
        // 최고 줄 위에 얹혀도 읽히도록 바탕색으로 테를 두른다.
        stroke: c.bg,
        'stroke-width': 3.5,
        'paint-order': 'stroke',
      });
      holder.label.appendChild(boundLabel);

      const els: ColumnEls = { solid, spec, cap, boundLabel, chips, splitLabel };
      cols.set(order, els);
      return els;
    }

    function drawBest(scene: BoundAndCutScene, board: Board): void {
      clear(bestLayer);
      const y = board.yOf(bestOf(scene));
      const line = el('line', {
        x1: BOARD_X,
        y1: y,
        x2: BEST_BOX_X,
        y2: y,
        stroke: c.accent,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });
      const box = el('rect', {
        x: BEST_BOX_X,
        y: y - BEST_BOX_H / 2,
        width: BEST_BOX_W,
        height: BEST_BOX_H,
        rx: 4,
        fill: c.accent,
      });
      const caption = label(t('label.best', 'Best'), {
        x: BEST_BOX_X + BEST_BOX_W / 2,
        y: y - BEST_BOX_H / 2 + 11,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.stateInk,
      });
      const value = label(fmtValue(bestOf(scene)), {
        x: BEST_BOX_X + BEST_BOX_W / 2,
        y: y - BEST_BOX_H / 2 + 25,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': '700',
        fill: c.stateInk,
      });
      bestLayer.append(line, box, caption, value);
      bestEls = { line, box, caption, value };
    }

    function placeBest(y: number): void {
      if (!bestEls) return;
      bestEls.line.setAttribute('y1', String(y));
      bestEls.line.setAttribute('y2', String(y));
      bestEls.box.setAttribute('y', String(y - BEST_BOX_H / 2));
      bestEls.caption.setAttribute('y', String(y - BEST_BOX_H / 2 + 11));
      bestEls.value.setAttribute('y', String(y - BEST_BOX_H / 2 + 25));
    }

    /** 답을 든 갈래의 결정에 두르는 테. 자르고도 답을 놓치지 않았다는 결론이다. */
    function ringBox(board: Board, order: number): {
      x: number;
      y: number;
      width: number;
      height: number;
    } {
      return {
        x: board.centerXOf(order) - board.chipSpan / 2 - 4,
        y: CHIP_Y - 4,
        width: board.chipSpan + 8,
        height: CHIP_H + 8,
      };
    }

    function drawRing(scene: BoundAndCutScene, board: Board): void {
      ringEl = null;
      if (!scene.concluded) return;
      const order = answerOrderOf(scene);
      if (order < 0 || !holders.has(order)) return;
      ringEl = el('rect', {
        ...ringBox(board, order),
        rx: 5,
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 2.5,
      });
      holders.get(order)?.body.appendChild(ringEl);
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 opacity ·
     * transform · 보간 끝자리도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: BoundAndCutScene): Board {
      const board = boardOf(scene);
      clear(columnLayer);
      clear(numberLayer);
      holders = new Map();
      cols = new Map();
      ringEl = null;

      drawStrip(scene);
      drawSlot(scene, board);
      drawBoard(board);

      for (let order = 0; order < scene.branches.length; order += 1) {
        const body = el('g', {});
        const labelG = el('g', {});
        columnLayer.appendChild(body);
        numberLayer.appendChild(labelG);
        holders.set(order, { body, label: labelG });
      }
      for (let order = 0; order < scene.branches.length; order += 1) {
        paintColumn(scene, board, order);
      }

      drawBest(scene, board);
      drawRing(scene, board);
      return board;
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 수와 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: BoundAndCutScene): string {
      const cap = scene.caption;
      if (!cap) return '';
      const order = scene.mark !== null && scene.mark.kind !== 'done' ? scene.mark.order : -1;
      switch (cap.kind) {
        case 'root':
          return t('caption.root', 'If items could be split, at most {bound}', {
            bound: fmtBound(boundOf(scene, order).bound),
          });
        case 'measure':
          return t('caption.measure', 'This branch tops out at {bound}', {
            bound: fmtBound(boundOf(scene, order).bound),
          });
        case 'settled':
          return t('caption.settled', 'Every item is decided — value {value}', {
            value: fmtValue(loadOf(scene, order).value),
          });
        case 'newBest':
          return t('caption.newBest', 'New best: {best}', { best: fmtValue(bestOf(scene)) });
        case 'cut':
          // 한계도 최고도 막대와 칸이 쓰는 그 함수에서 나온다.
          return t('caption.cut', '{bound} cannot beat {best} — cut this branch', {
            bound: fmtBound(boundOf(scene, order).bound),
            best: fmtValue(bestOf(scene)),
          });
        case 'done':
          // 자른 횟수는 화면의 × 와 같은 배열을 센다.
          return t('caption.done', 'Cut {cuts} branches and the best is still {best}', {
            cuts: scene.cutOrders.length,
            best: fmtValue(bestOf(scene)),
          });
      }
    }

    function drawCaption(scene: BoundAndCutScene): void {
      clear(captionLayer);
      const text = captionTextOf(scene);
      if (text === '') return;
      captionLayer.appendChild(
        label(text, {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        }),
      );
    }

    // ── 운동 ────────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 자리는 이미 끝 모습으로 서 있고, 걸음은 **아직 못 온
    // 만큼 뒤로 물려** 놓고 출발한다. 정적으로 세운 직후라 그 사이에 타이머도
    // 프레임도 없어 페인트가 끼지 않는다 (S-scene).

    /** 자를 대어 잰다 — 찬 것이 먼저 서고, 내다본 몫이 그 위로 자라 오른다. */
    async function flowMeasure(
      scene: BoundAndCutScene,
      board: Board,
      order: number,
      mine: number,
    ): Promise<void> {
      const els = cols.get(order);
      if (!els) return;
      const { value } = loadOf(scene, order);
      const { bound } = boundOf(scene, order);
      const ySolid = board.yOf(value);

      const setTop = (top: number): void => {
        const y = board.yOf(top);
        els.cap.setAttribute('y1', String(y));
        els.cap.setAttribute('y2', String(y));
        els.boundLabel.setAttribute('y', String(Math.max(BOARD_TOP - 4, y - 9)));
        els.boundLabel.textContent = fmtBound(top);
      };

      // 2) 쪼개서라도 채웠을 때의 몫이 찬 것 위로 자라 오른다 — 재는 동작이다.
      const rise = (p: number): void => {
        const top = value + (bound - value) * p;
        const y = board.yOf(top);
        if (els.spec) {
          els.spec.setAttribute('y', String(y));
          els.spec.setAttribute('height', String(Math.max(0, ySolid - y)));
          els.spec.setAttribute('stroke', c.itemComparing);
        }
        els.splitLabel?.setAttribute('opacity', String(p));
        setTop(top);
      };

      // 1) 결정이 아래에서 올라서고, 이미 담기로 한 값이 찬다.
      const fill = (p: number): void => {
        const v = value * p;
        const y = board.yOf(v);
        if (els.solid) {
          els.solid.setAttribute('y', String(y));
          els.solid.setAttribute('height', String(Math.max(0, BASE_Y - y)));
        }
        els.chips.setAttribute('opacity', String(p));
        els.chips.setAttribute('transform', `translate(0 ${(1 - p) * CHIP_RISE})`);
        setTop(v);
      };

      rise(0);
      fill(0);
      await tween(FILL_MS, (p) => {
        if (!alive(mine)) return;
        fill(easeOut(p));
      });
      if (!alive(mine) || bound <= value) return;
      await tween(RISE_MS, (p) => {
        if (!alive(mine)) return;
        rise(easeOut(p));
      });
    }

    /** 새 최고가 나왔다 — 자르는 기준이 올라간다. */
    async function flowBest(
      scene: BoundAndCutScene,
      board: Board,
      order: number,
      mine: number,
    ): Promise<void> {
      // 출발값을 `prev` 에서 꺼내지 않는다. 그 갈래 앞쪽만 보고 다시 셈한다 (S-scene).
      const from = bestBefore(scene, order);
      const to = bestOf(scene);
      placeBest(board.yOf(from));
      await tween(BEST_MS, (p) => {
        if (!alive(mine)) return;
        placeBest(board.yOf(from + (to - from) * easeOut(p)));
      });
    }

    /** 한계가 최고에 못 미친다 — 근거를 긋고, 밑동을 자르고, 갈래가 주저앉는다. */
    async function flowCut(
      scene: BoundAndCutScene,
      board: Board,
      order: number,
      mine: number,
    ): Promise<void> {
      const holder = holders.get(order);
      // 아직 잘리지 않은 모습으로 되돌려 놓고 출발한다.
      const els = paintColumn(scene, board, order, { cut: false });
      if (!holder || !els) return;

      const { value } = loadOf(scene, order);
      const { bound } = boundOf(scene, order);
      const centerX = board.centerXOf(order);
      const barX = board.barXOf(order);
      const yBound = board.yOf(bound);
      const yBest = board.yOf(bestOf(scene));

      // 1) 못 미친 만큼이 먼저 자라 오른다 — 이것이 자르는 이유다.
      const reason = el('line', {
        x1: centerX,
        y1: yBound,
        x2: centerX,
        y2: yBound,
        stroke: c.danger,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 3',
        opacity: REASON_OPACITY,
      });
      holder.body.appendChild(reason);
      await tween(REASON_MS, (p) => {
        if (!alive(mine)) return;
        reason.setAttribute('y2', String(yBound + (yBest - yBound) * easeOut(p)));
      });
      if (!alive(mine)) return;

      // 2) 칼이 밑동을 지난다.
      const bladeW = board.barW + 20;
      const blade = el('line', {
        x1: barX - 10,
        y1: BASE_Y,
        x2: barX + board.barW + 10,
        y2: BASE_Y,
        stroke: c.danger,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-dasharray': `${bladeW} ${bladeW}`,
        'stroke-dashoffset': bladeW,
      });
      holder.body.appendChild(blade);
      await tween(BLADE_MS, (p) => {
        if (!alive(mine)) return;
        blade.setAttribute('stroke-dashoffset', String(bladeW * (1 - p)));
      });
      if (!alive(mine)) return;

      // 3) 막대가 주저앉고 잰 기록만 남는다.
      const yValue = board.yOf(value);
      const ghost = el('rect', {
        x: barX + 0.5,
        y: yBound,
        width: board.barW - 1,
        height: Math.max(0, BASE_Y - yBound),
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '2 3',
        opacity: 0,
      });
      holder.body.insertBefore(ghost, holder.body.firstChild);
      const ghostSplit =
        value > 0
          ? el('line', {
              x1: barX + 0.5,
              y1: yValue,
              x2: barX + board.barW - 0.5,
              y2: yValue,
              stroke: c.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 3',
              opacity: 0,
            })
          : null;
      if (ghostSplit) holder.body.insertBefore(ghostSplit, holder.body.firstChild);

      const solidH = BASE_Y - yValue;
      const specH = Math.max(0, yValue - yBound);
      await tween(FALL_MS, (p) => {
        if (!alive(mine)) return;
        const e = easeOut(p);
        const shrink = 1 - e;
        ghost.setAttribute('opacity', String(GHOST_OPACITY * e));
        ghostSplit?.setAttribute('opacity', String(GHOST_OPACITY * e));
        if (els.solid) {
          els.solid.setAttribute('y', String(BASE_Y - solidH * shrink));
          els.solid.setAttribute('height', String(solidH * shrink));
          els.solid.setAttribute('opacity', String(shrink));
        }
        if (els.spec) {
          els.spec.setAttribute('y', String(BASE_Y - (specH + solidH) * shrink));
          els.spec.setAttribute('height', String(specH * shrink));
          els.spec.setAttribute('opacity', String(shrink));
        }
        els.chips.setAttribute('opacity', String(1 - (1 - CUT_CHIP_OPACITY) * e));
        blade.setAttribute('opacity', String(shrink));
      });
    }

    /**
     * 자르고도 답을 놓치지 않았다 — 테가 답을 든 갈래로 조여든다.
     *
     * 얹기 전에는 흐를 것이 없어 이 걸음만 벽시계가 0 이었다. `stepMs` 를 올리는
     * 대신 이 걸음의 운동을 두텁게 한다 (프로토콜 4절 "얇은 걸음").
     */
    async function flowDone(
      scene: BoundAndCutScene,
      board: Board,
      mine: number,
    ): Promise<void> {
      const ring = ringEl;
      if (!ring) return;
      const order = answerOrderOf(scene);
      if (order < 0) return;
      const box = ringBox(board, order);
      const draw = (e: number): void => {
        const out = RING_GROW * (1 - e);
        ring.setAttribute('x', String(box.x - out));
        ring.setAttribute('y', String(box.y - out));
        ring.setAttribute('width', String(box.width + out * 2));
        ring.setAttribute('height', String(box.height + out * 2));
        ring.setAttribute('opacity', String(e));
      };
      draw(0);
      await tween(RING_MS, (p) => {
        if (!alive(mine)) return;
        draw(easeOut(p));
      });
    }

    async function render(
      next: BoundAndCutScene,
      /** 출발 모습을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: BoundAndCutScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const board = drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const mark = next.mark;
      if (!mark) return;

      switch (mark.kind) {
        case 'measure':
          await flowMeasure(next, board, mark.order, mine);
          break;
        case 'best':
          await flowBest(next, board, mark.order, mine);
          break;
        case 'cut':
          await flowCut(next, board, mark.order, mine);
          break;
        case 'done':
          await flowDone(next, board, mine);
          break;
      }

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리 · opacity · 임시 노드를 통째로 거둔다. 되돌릴
      // 목록을 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
      drawCaption(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        }
        frames.clear();
        // 걸어 둔 것을 거두면 tick 이 안 불리므로 기다리던 것을 깨운다 (S-piece).
        for (const wake of [...pending]) wake();
        pending.clear();
        root.remove();
      },
    };
  },
};
