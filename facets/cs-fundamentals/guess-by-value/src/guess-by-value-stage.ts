/**
 * guess-by-value-stage — 두 줄이 같은 배열을 훑는 그림.
 *
 * 위 줄은 늘 가운데를 짚는다. 남은 구간을 덮는 막대가 있고, 커서가 그 가운데로
 * 뛰며, 짚을 때마다 절반이 떨어져 나간다 — 움직이는 것은 커서와 구간의 경계다.
 * **떨어져 나간 구간은 자국으로 남는다.** 다 끝난 화면에서 그 자국들이 "가운데만
 * 짚으면 이만큼씩 잘라 가며 세 번을 짚는다" 를 말한다.
 *
 * 아래 줄은 값으로 겨눈다. 양 끝 칸에서 위로 두 줄기가 솟아 **자**를 세우고,
 * 찾는 값을 담은 조각이 그 자를 따라 미끄러져 제 비율 자리에 멈춘다. 거기서
 * 아래로 선이 떨어져 칸 하나를 짚는다. 미끄러짐과 떨어짐, 두 움직임이 이 조각의
 * 동사다 — 비율이 자리 번호로 옮겨지는 순간.
 *
 * 자의 두 끝을 첫 칸과 끝 칸의 **한가운데**에 맞춰 두었으므로, 값이 고르게
 * 퍼져 있으면 비율 자리와 칸 한가운데가 정확히 겹쳐 선이 곧게 떨어진다.
 * 고르지 않으면 선이 꺾여 가까운 칸으로 옮겨 붙는다 — 화면은 그 사실을 숨기지
 * 않고 그대로 그린다. 왜 고른 배열에서만 잘 맞는지는 글이 밝힌다 (S-piece).
 *
 * ── 걸음마다 부르는 메서드를 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 되돌릴 명령이 없으므로 되짚기가 앞으로 가기와 같은 길을
 * 탄다. 운동이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며
 * 얹힌 임시 속성이 한꺼번에 사라진다.
 *
 * 운동의 방향이 뒤집혀 있다. 정적 그리기가 정본이라 막대도 자도 조각도 이미 끝
 * 자리에 서 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다.
 * 그 출발 자리는 전부 장면의 셈에서 파생된다 — `prev` 는 쓰지 않는다 (S-scene).
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * 옛 그림은 `paintCell(cell, state)` 하나가 채움과 테두리를 함께 정해, "값이 아직
 * 살아 있나" 와 "이 칸을 짚어 보았나" 두 뜻이 한 갈래에 겹쳐 있었다. 그래서 다음
 * 걸음이 칸을 다시 칠할 때마다 짚은 자국이 지워졌다.
 *   - **채움은 값의 형편** — 아직 구간 안이냐, 빠졌느냐, 여기서 찾았느냐.
 *   - **테두리는 짚음의 표식** — 짚어 보았다 / 방금 짚었다. 누적으로 남는다.
 *
 * ── 화면에 나란히 뜨는 수
 *
 * 눈금표의 수와 점, 자의 두 끝 값, 수식의 항, 떨어진 자리 번호, 마지막 캡션의
 * 두 수가 전부 `scene.ts` 의 파생 함수를 지난다. 겨누는 자리는 나눗셈에서 나오므로
 * 두 곳에서 셈하면 끝자리에서 갈린다 (프로토콜 4 절).
 *
 * 세로는 canvas 선언으로 정해지고 그 뒤 바뀌지 않는다 (S-view). View 는 algorithm
 * 의 흐름을 모른다 — 장면 타입과 그 파생 함수만 안다. 화면 문자는 전부 `params.t`
 * 로 만든다 (C10). 칸에 적힌 값 · 자리 번호 · 수식은 도식에 새겨진 숫자 표식이라
 * 문안이 아니다.
 */

import {
  PIECE_CANVAS_W,
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
  aimFoundSlotOf,
  aimProbeCountOf,
  aimProbedSlotsOf,
  caretSlotBefore,
  caretSlotOf,
  chipFractionOf,
  currentShotOf,
  discardedSpansOf,
  landedShotsOf,
  lastDropOf,
  lastMidStepOf,
  midFoundSlotOf,
  midProbedSlotsOf,
  midRangeBeforeCut,
  midRangeOf,
  scaleSpanOf,
  scaleValuesOf,
  type GuessByValueCaption,
  type GuessByValueScene,
  type GuessByValueSpan,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

// ── 캔버스. 세로는 두 줄과 그 사이에 세운 자가 정한다 (S-view).
const STAGE_H = 300;

// ── 칸. 크기는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const CELL_MAX_W = 96;
const SIDE_MIN = 26;
const CELL_H = 42;

// ── 세로 자리.
const LANE_A_TITLE_Y = 16;
const BRACKET_Y = 28;
const BRACKET_H = 6;
const CARET_H = 9;
const CELL_A_Y = 50;
const LANE_B_TITLE_Y = 120;
const FORMULA_Y = 148;
const RULER_Y = 180;
const CHIP_HALF_H = 12;
const CELL_B_Y = 224;
const CAPTION_Y = 286;

// ── 눈금표 (짚은 횟수).
const TALLY_X = 494;
const TALLY_GAP = 15;
const TALLY_R = 4;
const TALLY_COUNT_X = W - 30;

// ── 걸음 안에서 일어나는 움직임의 길이. stepMs 위에 이것이 더해진다 (S-piece).
const GROW_MS = 380;
const CARET_MS = 300;
const SHRINK_MS = 360;
const RISE_MS = 260;
const RULER_MS = 340;
const SLIDE_MS = 480;
const DROP_MS = 380;
const PULSE_MS = 380;
const FADE_MS = 240;

// ── 테두리 — 기본 / 짚어 본 적 있다 / 방금 짚었다.
const STROKE_PLAIN = 1.5;
const STROKE_PROBED = 2;
const STROKE_FRESH = 3.5;

/** 짚는 순간 칸이 부푸는 폭. */
const PULSE_SWELL = 0.18;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 0..1 을 부드럽게. 시작과 끝을 눌러 준다. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 그리기의 부산물인 DOM 손잡이. 장면 상태가 아니다. */
type BracketEls = {
  g: SVGGElement;
  bar: SVGRectElement;
};

type RulerEls = {
  riserLo: SVGLineElement;
  riserHi: SVGLineElement;
  bar: SVGLineElement;
};

type DropEls = {
  line: SVGPolylineElement;
  tip: SVGPathElement;
};

export const guessByValueStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<GuessByValueScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 통째로 다시 짓는다 —
    // 그래서 "정적 경로가 매번 명시로 쓰는가" 를 따로 살필 재건 밖 요소가 없다.
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 모든 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미
    // 새로 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고,
    // 운동은 `await` 뒤에 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    // `isInstant` 와 `onScrubStart` 는 러너가 장면 조각에서 부르지 않으므로 빗장이
    // 되지 못한다 — 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const canAnimate = typeof requestAnimationFrame === 'function';
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 걸음을 한 시계로 흐르게 한다.
     *
     * 기다리던 promise 는 `destroy` 가 반드시 푼다 — 취소된 프레임은 아예 불리지
     * 않아 `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다 (S-piece).
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine) || !canAnimate || ms <= 0) {
          if (alive(mine)) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 기하. 장면의 값 개수가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    let cellCount = 1;
    let cellW = CELL_MAX_W;
    let originX = 0;

    function layout(scene: GuessByValueScene): void {
      cellCount = Math.max(1, scene.values.length);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cellCount));
      originX = Math.round((W - cellCount * cellW) / 2);
    }

    function centerX(index: number): number {
      return originX + index * cellW + cellW / 2;
    }

    /** 구간 하나가 덮는 가로. 막대와 자국이 같은 자를 쓴다. */
    function spanBox(span: GuessByValueSpan): { x: number; w: number } {
      return {
        x: originX + span.lo * cellW + 1,
        w: Math.max(0, (span.hi - span.lo + 1) * cellW - 2),
      };
    }

    // ── 이번 장면이 세운 DOM 손잡이.
    let groupsA: SVGGElement[] = [];
    let groupsB: SVGGElement[] = [];
    let tallyGroupA: SVGGElement | null = null;
    let tallyGroupB: SVGGElement | null = null;
    let bracketEls: BracketEls | null = null;
    let ghostEls: SVGRectElement[] = [];
    let caretEl: SVGPathElement | null = null;
    let rulerEls: RulerEls | null = null;
    let chipEl: SVGGElement | null = null;
    let formulaEl: SVGTextElement | null = null;
    let dropEls: DropEls[] = [];
    let captionEl: SVGTextElement | null = null;

    // ── 장면이 정하는 칠.

    /** 채움은 **값의 형편**이다. 구간 안이냐, 빠졌느냐, 여기서 찾았느냐. */
    function fillFor(
      scene: GuessByValueScene,
      lane: 'mid' | 'aim',
      i: number,
    ): { cell: string; ink: string; slot: string } {
      const found = lane === 'mid' ? midFoundSlotOf(scene) : aimFoundSlotOf(scene);
      if (i === found) return { cell: c.itemPivot, ink: c.stateInk, slot: c.stateInk };
      const range =
        lane === 'mid'
          ? scene.midLane === 'idle'
            ? null
            : midRangeOf(scene)
          : scaleSpanOf(scene);
      if (range !== null && (i < range.lo || i > range.hi)) {
        return { cell: c.bgSubtle, ink: c.textMuted, slot: c.textMuted };
      }
      return { cell: c.itemDefault, ink: c.text, slot: c.textMuted };
    }

    /**
     * 테두리는 **짚음의 표식**이다. 방금 짚은 칸이 가장 굵고, 전에 짚은 칸도 남는다.
     *
     * 자리에 붙는 말이라 값이 무엇이든 참이고, 채움과 뜻이 겹치지 않는다.
     */
    function strokeFor(
      scene: GuessByValueScene,
      lane: 'mid' | 'aim',
      i: number,
    ): { color: string; width: number } {
      const probed = lane === 'mid' ? midProbedSlotsOf(scene) : aimProbedSlotsOf(scene);
      if (probed.length > 0 && probed[probed.length - 1] === i) {
        return { color: c.itemComparing, width: STROKE_FRESH };
      }
      if (probed.includes(i)) return { color: c.itemComparing, width: STROKE_PROBED };
      return { color: c.border, width: STROKE_PLAIN };
    }

    // ── 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene).
    function clear(): void {
      root.replaceChildren();
      groupsA = [];
      groupsB = [];
      tallyGroupA = null;
      tallyGroupB = null;
      bracketEls = null;
      ghostEls = [];
      caretEl = null;
      rulerEls = null;
      chipEl = null;
      formulaEl = null;
      dropEls = [];
      captionEl = null;
    }

    function laneTitle(parent: SVGGElement, y: number, text: string): void {
      const node = el('text', {
        x: originX,
        y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: c.text,
      });
      node.textContent = text;
      parent.appendChild(node);
    }

    /** 눈금표 — 점 하나에 짚기 한 번. 수와 점이 같은 셈에서 나온다. */
    function drawTally(parent: SVGGElement, titleY: number, count: number): SVGGElement {
      const g = el('g');
      for (let i = 0; i < count; i += 1) {
        g.appendChild(
          el('circle', {
            cx: TALLY_X + i * TALLY_GAP,
            cy: titleY - 5,
            r: TALLY_R,
            fill: c.text,
          }),
        );
      }
      const label = el('text', {
        x: TALLY_COUNT_X,
        y: titleY,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '700',
        fill: c.text,
      });
      // 짚은 횟수는 숫자 표식이다 — 키를 만들지 않는다 (C10).
      label.textContent = String(count);
      g.appendChild(label);
      parent.appendChild(g);
      return g;
    }

    /** 한 줄의 칸들. 자리 번호와 값은 도식에 새겨진 숫자다 (C10). */
    function drawCells(
      parent: SVGGElement,
      scene: GuessByValueScene,
      lane: 'mid' | 'aim',
      y: number,
    ): SVGGElement[] {
      const out: SVGGElement[] = [];
      for (let i = 0; i < cellCount; i += 1) {
        const paint = fillFor(scene, lane, i);
        const stroke = strokeFor(scene, lane, i);
        const g = el('g');
        g.appendChild(
          el('rect', {
            x: originX + i * cellW + 1,
            y,
            width: cellW - 2,
            height: CELL_H,
            rx: 4,
            fill: paint.cell,
            stroke: stroke.color,
            'stroke-width': stroke.width,
          }),
        );
        const slot = el('text', {
          x: originX + i * cellW + 7,
          y: y + 14,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: paint.slot,
        });
        slot.textContent = String(i);
        const value = el('text', {
          x: centerX(i),
          y: y + 31,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: paint.ink,
        });
        const v = scene.values[i];
        value.textContent = typeof v === 'number' ? String(v) : '';
        g.append(slot, value);
        parent.appendChild(g);
        out.push(g);
      }
      return out;
    }

    /** 남은 구간 막대 하나. 자리는 부르는 쪽이 정한다. */
    function makeBracket(parent: SVGGElement, fill: string): BracketEls {
      const g = el('g');
      const bar = el('rect', {
        x: originX,
        y: BRACKET_Y,
        width: 0,
        height: BRACKET_H,
        rx: BRACKET_H / 2,
        fill,
      });
      g.appendChild(bar);
      parent.appendChild(g);
      return { g, bar };
    }

    function placeBracket(b: BracketEls, box: { x: number; w: number }): void {
      b.bar.setAttribute('x', String(box.x));
      b.bar.setAttribute('width', String(box.w));
    }

    /** 커서 하나. 위 줄에서 지금 짚는 자리를 가리킨다. */
    function makeCaret(parent: SVGGElement, slot: number): SVGPathElement {
      const node = el('path', {
        d: `M -8 ${CELL_A_Y - CARET_H} L 8 ${CELL_A_Y - CARET_H} L 0 ${CELL_A_Y - 1} Z`,
        fill: c.itemComparing,
        transform: `translate(${centerX(slot)} 0)`,
      });
      parent.appendChild(node);
      return node;
    }

    /** 자 — 두 끝 칸에서 솟은 줄기와 그 사이를 잇는 막대. */
    function makeRuler(parent: SVGGElement, span: GuessByValueSpan): RulerEls {
      const x0 = centerX(span.lo);
      const x1 = centerX(span.hi);
      const riser = (x: number): SVGLineElement =>
        el('line', {
          x1: x,
          y1: CELL_B_Y,
          x2: x,
          y2: RULER_Y,
          stroke: c.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
      const riserLo = riser(x0);
      const riserHi = riser(x1);
      const bar = el('line', {
        x1: x0,
        y1: RULER_Y,
        x2: x1,
        y2: RULER_Y,
        stroke: c.text,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      parent.append(riserLo, riserHi, bar);
      return { riserLo, riserHi, bar };
    }

    /** 찾는 값을 담은 조각. 자 위를 미끄러진다. */
    function makeChip(parent: SVGGElement, scene: GuessByValueScene, x: number): SVGGElement {
      const chipW = 26 + String(scene.target).length * 10;
      const g = el('g', { transform: `translate(${x} ${RULER_Y})` });
      const box = el('rect', {
        x: -chipW / 2,
        y: -CHIP_HALF_H,
        width: chipW,
        height: CHIP_HALF_H * 2,
        rx: 6,
        fill: c.itemPivot,
        stroke: c.itemPivot,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': '700',
        fill: c.stateInk,
      });
      label.textContent = String(scene.target);
      g.append(box, label);
      parent.appendChild(g);
      return g;
    }

    /** 비율 자리에서 칸으로 떨어지는 선의 마디. 한 번에 셈해 두고 그린다. */
    function dropSeg(sx: number, tx: number): [number, number][] {
      const startY = RULER_Y + CHIP_HALF_H;
      const midY = (startY + CELL_B_Y) / 2;
      return [
        [sx, startY],
        [sx, midY],
        [tx, midY],
        [tx, CELL_B_Y],
      ];
    }

    /** 마디를 `p` 만큼만 따라간 점들. `p === 1` 이면 온전한 길이다. */
    function dropPoints(seg: [number, number][], p: number): string {
      const lens = [
        Math.abs(seg[1][1] - seg[0][1]),
        Math.abs(seg[2][0] - seg[1][0]),
        Math.abs(seg[3][1] - seg[2][1]),
      ];
      const total = lens[0] + lens[1] + lens[2];
      let left = total * p;
      const pts: string[] = [`${seg[0][0]},${seg[0][1]}`];
      for (let i = 0; i < 3; i += 1) {
        const take = Math.min(left, lens[i]);
        const r = lens[i] === 0 ? 1 : take / lens[i];
        pts.push(
          `${seg[i][0] + (seg[i + 1][0] - seg[i][0]) * r},` +
            `${seg[i][1] + (seg[i + 1][1] - seg[i][1]) * r}`,
        );
        left -= take;
        if (left <= 0) break;
      }
      return pts.join(' ');
    }

    function makeDrop(parent: SVGGElement, sx: number, tx: number, fresh: boolean): DropEls {
      const ink = fresh ? c.text : c.textMuted;
      const line = el('polyline', {
        points: dropPoints(dropSeg(sx, tx), 1),
        fill: 'none',
        stroke: ink,
        'stroke-width': fresh ? 2.5 : 1.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      const tip = el('path', {
        d: `M ${tx - 6} ${CELL_B_Y - 9} L ${tx + 6} ${CELL_B_Y - 9} L ${tx} ${CELL_B_Y - 1} Z`,
        fill: ink,
      });
      parent.append(line, tip);
      return { line, tip };
    }

    /** 수식 표기는 표식이다 — 값만 장면에서 채우고 키를 만들지 않는다 (C10). */
    function formulaText(scene: GuessByValueScene): string | null {
      const shot = currentShotOf(scene);
      const ends = scaleValuesOf(scene);
      if (shot === null || ends === null) return null;
      const head = shot.lo > 0 ? `${shot.lo} + ` : '';
      const body =
        `${head}(${scene.target} − ${ends.lo}) / (${ends.hi} − ${ends.lo}) × ${shot.hi - shot.lo}`;
      return scene.aimStage === 'measure' ? body : `${body} = ${shot.index}`;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 남는 표식(버린 구간의 자국 · 짚어 본 테두리 · 떨어진 선 · 찾아낸 칸)을 여기
     * 넣어야 되짚었을 때 남는다. **아직 없는 것은 숨기지 않고 짓지 않는다** — 숨기기만
     * 하면 앞 걸음의 속성이 남아 되짚기 판정에서 어긋난다 (프로토콜 4 절).
     */
    function drawStatic(scene: GuessByValueScene): void {
      layout(scene);

      const bandLayer = el('g');
      const laneALayer = el('g');
      const caretLayer = el('g');
      const laneBLayer = el('g');
      const rulerLayer = el('g');
      const dropLayer = el('g');
      const cellBLayer = el('g');
      const chipLayer = el('g');
      root.append(
        bandLayer,
        laneALayer,
        caretLayer,
        laneBLayer,
        rulerLayer,
        dropLayer,
        cellBLayer,
        chipLayer,
      );

      // ── 위 줄.
      laneTitle(laneALayer, LANE_A_TITLE_Y, tr('label.laneMiddle', 'Always the middle'));
      tallyGroupA = drawTally(laneALayer, LANE_A_TITLE_Y, scene.midProbes);

      // 떨어져 나간 구간의 자국. **누적이 곧 주장이라 끝까지 남는다.**
      for (const span of discardedSpansOf(scene)) {
        const box = spanBox(span);
        const ghost = el('rect', {
          x: box.x,
          y: BRACKET_Y,
          width: box.w,
          height: BRACKET_H,
          rx: BRACKET_H / 2,
          fill: c.border,
        });
        bandLayer.appendChild(ghost);
        ghostEls.push(ghost);
      }
      if (scene.midLane === 'live') {
        bracketEls = makeBracket(bandLayer, c.textMuted);
        placeBracket(bracketEls, spanBox(midRangeOf(scene)));
        caretEl = makeCaret(caretLayer, caretSlotOf(scene));
      }
      groupsA = drawCells(laneALayer, scene, 'mid', CELL_A_Y);

      // ── 아래 줄.
      laneTitle(laneBLayer, LANE_B_TITLE_Y, tr('label.laneAim', 'Aim by value'));
      tallyGroupB = drawTally(laneBLayer, LANE_B_TITLE_Y, aimProbeCountOf(scene));

      const formula = formulaText(scene);
      if (formula !== null) {
        formulaEl = el('text', {
          x: originX,
          y: FORMULA_Y,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        formulaEl.textContent = formula;
        laneBLayer.appendChild(formulaEl);
      }

      const scale = scaleSpanOf(scene);
      if (scale !== null) rulerEls = makeRuler(rulerLayer, scale);

      // 떨어진 선들. 지금 겨눔의 것이 도드라지고 앞의 것은 자국으로 남는다.
      const landed = landedShotsOf(scene);
      for (let i = 0; i < landed.length; i += 1) {
        const shot = landed[i];
        const x0 = centerX(shot.lo);
        const x1 = centerX(shot.hi);
        dropEls.push(
          makeDrop(
            dropLayer,
            x0 + (x1 - x0) * shot.fraction,
            centerX(shot.index),
            i === landed.length - 1,
          ),
        );
      }

      groupsB = drawCells(cellBLayer, scene, 'aim', CELL_B_Y);

      const fraction = chipFractionOf(scene);
      if (fraction !== null && scale !== null) {
        const x0 = centerX(scale.lo);
        const x1 = centerX(scale.hi);
        chipEl = makeChip(chipLayer, scene, x0 + (x1 - x0) * fraction);
      }

      captionEl = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      root.appendChild(captionEl);
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 수와 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: GuessByValueScene): void {
      if (captionEl === null) return;
      const kind: GuessByValueCaption | null = scene.caption;
      if (kind === null) {
        captionEl.textContent = '';
        return;
      }
      captionEl.textContent = captionText(scene, kind) ?? '';
    }

    function captionText(scene: GuessByValueScene, kind: GuessByValueCaption): string | null {
      switch (kind) {
        case 'begin':
          return tr('caption.begin', 'Looking for {target} in an evenly spread array.', {
            target: scene.target,
          });

        case 'midProbe': {
          const step = lastMidStepOf(scene);
          if (step === null) return null;
          if (step.drop === null) {
            return tr('caption.midHit', 'The middle lands on {target}.', { target: scene.target });
          }
          return tr('caption.midProbe', 'The middle of what is left holds {value}.', {
            value: scene.values[step.mid] ?? 0,
          });
        }

        case 'midDrop': {
          const drop = lastDropOf(scene);
          const step = scene.midPlan[scene.midCuts - 1];
          if (drop === null || step === undefined) return null;
          const value = scene.values[step.mid] ?? 0;
          return drop === 'right'
            ? tr('caption.midDropRight', '{value} is above {target} — the right half is out.', {
                value,
                target: scene.target,
              })
            : tr('caption.midDropLeft', '{value} is below {target} — the left half is out.', {
                value,
                target: scene.target,
              });
        }

        case 'scaleSet': {
          const ends = scaleValuesOf(scene);
          if (ends === null) return null;
          return tr('caption.scaleSet', 'Read the two ends as a scale — {loValue} to {hiValue}.', {
            loValue: ends.lo,
            hiValue: ends.hi,
          });
        }

        case 'aimMeasure':
          return tr('caption.aimMeasure', 'Where does {target} sit on that scale?', {
            target: scene.target,
          });

        case 'aimLand': {
          const shot = currentShotOf(scene);
          if (shot === null) return null;
          return tr('caption.aimLand', 'The same fraction of the slots — slot {index}.', {
            index: shot.index,
          });
        }

        case 'aimProbe': {
          const shot = currentShotOf(scene);
          if (shot === null) return null;
          return shot.hit
            ? tr('caption.aimHit', 'Slot {index} holds {target}. Straight there.', {
                index: shot.index,
                target: scene.target,
              })
            : tr(
                'caption.aimMiss',
                'Slot {index} holds {value}. Narrow the scale and aim again.',
                { index: shot.index, value: scene.values[shot.index] ?? 0 },
              );
        }

        case 'verdict':
          return tr('caption.verdict', '{aim} against {mid}. The value itself said where to look.', {
            aim: aimProbeCountOf(scene),
            mid: scene.midProbes,
          });
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 전부 장면의 셈에서 파생된다 —
    //    `prev` 에서 꺼내지 않는다 (S-scene).

    /** 칸 하나를 부풀렸다 되돌리는 몫을 한 프레임에 쓴다. */
    function swellAt(group: SVGGElement, slot: number, laneY: number, r: number): void {
      const cx = centerX(slot);
      const cy = laneY + CELL_H / 2;
      const s = 1 + PULSE_SWELL * Math.sin(Math.PI * r);
      group.setAttribute('transform', `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`);
    }

    /** 구간 막대가 온 폭으로 자라며 커서가 떠오른다. */
    function openRange(scene: GuessByValueScene, mine: number): Promise<void> {
      const b = bracketEls;
      const caret = caretEl;
      if (b === null) return Promise.resolve();
      const box = spanBox(midRangeOf(scene));
      return animate(GROW_MS, mine, (p) => {
        placeBracket(b, { x: box.x, w: box.w * p });
        caret?.setAttribute('opacity', String(p));
      });
    }

    /**
     * 커서가 새 가운데로 뛰어가 그 칸을 짚는다.
     *
     * 뛰는 것과 짚는 것이 한 뜻이라 **한 시계**로 이어 돌린다 — 나눠 돌리면 맞물림이
     * 우연이 되고 하나를 `void` 로 흘릴 여지가 생긴다 (프로토콜 4 절).
     */
    function jumpAndProbe(scene: GuessByValueScene, mine: number): Promise<void> {
      const caret = caretEl;
      const slot = caretSlotOf(scene);
      const group = groupsA[slot];
      const fromX = centerX(caretSlotBefore(scene));
      const toX = centerX(slot);
      const total = CARET_MS + PULSE_MS;
      const cut = CARET_MS / total;
      return animate(total, mine, (p) => {
        const q = clamp01(p / cut);
        caret?.setAttribute('transform', `translate(${fromX + (toX - fromX) * q} 0)`);
        if (group === undefined) return;
        swellAt(group, slot, CELL_A_Y, clamp01((p - cut) / (1 - cut)));
      });
    }

    /**
     * 막대의 한쪽 경계가 미끄러지고, 빠진 구간이 그 자리에 자국으로 남는다.
     *
     * 둘이 한 뜻이라 한 목록·한 시계로 돌린다.
     */
    function shrinkRange(scene: GuessByValueScene, mine: number): Promise<void> {
      const b = bracketEls;
      if (b === null) return Promise.resolve();
      const before = spanBox(midRangeBeforeCut(scene));
      const after = spanBox(midRangeOf(scene));
      // 자국의 온전한 자리는 장면에서 셈한다 — 화면을 도로 읽으면 되짚은 직후
      // 값이 아직 옛 화면의 것이다 (프로토콜 3-1 의 ④).
      const spans = discardedSpansOf(scene);
      const lastSpan = spans[spans.length - 1];
      const full = lastSpan === undefined ? null : spanBox(lastSpan);
      const ghost = ghostEls[ghostEls.length - 1];
      // 왼쪽이 빠지면 자국이 왼 끝에 붙어 오른쪽으로 자라고, 오른쪽이 빠지면 반대다.
      const fromLeft = lastDropOf(scene) === 'left';
      return animate(SHRINK_MS, mine, (p) => {
        placeBracket(b, {
          x: before.x + (after.x - before.x) * p,
          w: before.w + (after.w - before.w) * p,
        });
        if (ghost === undefined || full === null) return;
        const w = full.w * p;
        ghost.setAttribute('x', String(fromLeft ? full.x : full.x + full.w - w));
        ghost.setAttribute('width', String(w));
      });
    }

    /**
     * 위 줄이 닫힌다 — 막대가 가운데로 오므라들며 커서와 함께 걷힌다.
     *
     * 정적 그리기는 닫힌 화면에 그 둘을 두지 않으므로 여기서 임시로 세운다. 운동의
     * 방향이 뒤집힌 자리다.
     */
    function closeRange(scene: GuessByValueScene, mine: number): Promise<void> {
      const box = spanBox(midRangeOf(scene));
      const b = makeBracket(root, c.textMuted);
      placeBracket(b, box);
      const caret = makeCaret(root, caretSlotOf(scene));
      const mid = box.x + box.w / 2;
      return animate(FADE_MS, mine, (p) => {
        placeBracket(b, { x: box.x + (mid - box.x) * p, w: box.w * (1 - p) });
        b.g.setAttribute('opacity', String(1 - p));
        caret.setAttribute('opacity', String(1 - p));
      }).then(() => {
        b.g.remove();
        caret.remove();
      });
    }

    /**
     * 두 끝 칸에서 자가 솟고, 그 사이가 이어지고, 찾는 값이 왼 끝에 선다.
     *
     * 셋이 "자를 세운다" 하나라 시계 하나를 세 마디로 나눠 쓴다.
     */
    function raiseRuler(scene: GuessByValueScene, mine: number): Promise<void> {
      const r = rulerEls;
      const scale = scaleSpanOf(scene);
      if (r === null || scale === null) return Promise.resolve();
      const x0 = centerX(scale.lo);
      const x1 = centerX(scale.hi);
      const total = RISE_MS + RULER_MS + FADE_MS;
      const c1 = RISE_MS / total;
      const c2 = (RISE_MS + RULER_MS) / total;
      const chip = chipEl;
      return animate(total, mine, (p) => {
        const a = clamp01(p / c1);
        const y = CELL_B_Y + (RULER_Y - CELL_B_Y) * a;
        r.riserLo.setAttribute('y2', String(y));
        r.riserHi.setAttribute('y2', String(y));
        const b = clamp01((p - c1) / (c2 - c1));
        r.bar.setAttribute('x2', String(x0 + (x1 - x0) * b));
        // 길이 0 인 막대가 둥근 끝을 만나면 점이 된다 — 아직 없는 것은 그리지 않는다.
        r.bar.setAttribute('opacity', b > 0 ? '1' : '0');
        chip?.setAttribute('opacity', String(clamp01((p - c2) / (1 - c2))));
      });
    }

    /** 찾는 값이 자 위를 미끄러져 제 비율 자리에 선다 — 이 미끄러짐이 「겨눔」이다. */
    function slideChip(scene: GuessByValueScene, mine: number): Promise<void> {
      const chip = chipEl;
      const scale = scaleSpanOf(scene);
      const fraction = chipFractionOf(scene);
      if (chip === null || scale === null || fraction === null) return Promise.resolve();
      const x0 = centerX(scale.lo);
      const x1 = centerX(scale.hi);
      const toX = x0 + (x1 - x0) * fraction;
      const formula = formulaEl;
      return animate(SLIDE_MS, mine, (p) => {
        chip.setAttribute('transform', `translate(${x0 + (toX - x0) * p} ${RULER_Y})`);
        formula?.setAttribute('opacity', String(p));
      });
    }

    /** 비율 자리에서 선이 떨어져 칸 하나를 가리킨다. 선과 화살촉이 한 시계다. */
    function dropLine(scene: GuessByValueScene, mine: number): Promise<void> {
      const drop = dropEls[dropEls.length - 1];
      const shot = currentShotOf(scene);
      if (drop === undefined || shot === null) return Promise.resolve();
      const x0 = centerX(shot.lo);
      const x1 = centerX(shot.hi);
      const seg = dropSeg(x0 + (x1 - x0) * shot.fraction, centerX(shot.index));
      const total = DROP_MS + FADE_MS;
      const cut = DROP_MS / total;
      return animate(total, mine, (p) => {
        drop.line.setAttribute('points', dropPoints(seg, clamp01(p / cut)));
        drop.tip.setAttribute('opacity', String(clamp01((p - cut) / (1 - cut))));
      });
    }

    /** 가리킨 칸이 부푼다. */
    function probeAim(scene: GuessByValueScene, mine: number): Promise<void> {
      const shot = currentShotOf(scene);
      if (shot === null) return Promise.resolve();
      const group = groupsB[shot.index];
      if (group === undefined) return Promise.resolve();
      return animate(PULSE_MS, mine, (p) => {
        swellAt(group, shot.index, CELL_B_Y, p);
      });
    }

    /** 눈금표 둘이 함께 부푼다 — 견줄 것은 그 두 수다. 한 목록·한 시계. */
    function weigh(mine: number): Promise<void> {
      const cx = (TALLY_X + TALLY_COUNT_X) / 2;
      const marks: { node: SVGGElement; cy: number }[] = [];
      if (tallyGroupA !== null) marks.push({ node: tallyGroupA, cy: LANE_A_TITLE_Y - 5 });
      if (tallyGroupB !== null) marks.push({ node: tallyGroupB, cy: LANE_B_TITLE_Y - 5 });
      if (marks.length === 0) return Promise.resolve();
      return animate(PULSE_MS, mine, (p) => {
        const s = 1 + PULSE_SWELL * Math.sin(Math.PI * p);
        for (const m of marks) {
          m.node.setAttribute(
            'transform',
            `translate(${cx} ${m.cy}) scale(${s}) translate(${-cx} ${-m.cy})`,
          );
        }
      });
    }

    function flow(scene: GuessByValueScene, mine: number): Promise<void> {
      switch (scene.step) {
        case 'range':
          return openRange(scene, mine);
        case 'midProbe':
          return jumpAndProbe(scene, mine);
        case 'midCut':
          return shrinkRange(scene, mine);
        case 'midSettle':
          return closeRange(scene, mine);
        case 'scale':
          return raiseRuler(scene, mine);
        case 'measure':
          return slideChip(scene, mine);
        case 'land':
          return dropLine(scene, mine);
        case 'aimProbe':
          return probeAim(scene, mine);
        case 'done':
          return weigh(mine);
        // 아래 줄이 닫힐 때는 자와 떨어진 선을 그대로 남기므로 흐를 것이 없다.
        case 'aimSettle':
        case null:
          return Promise.resolve();
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성이 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     */
    async function render(
      next: GuessByValueScene,
      _prev: GuessByValueScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      clear();
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      clear();
      drawStatic(next);
      drawCaption(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        // 걸린 프레임을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지
        // 않으므로 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        clear();
        root.remove();
      },
    };
  },
};
