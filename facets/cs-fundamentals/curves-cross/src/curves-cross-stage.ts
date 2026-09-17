/**
 * curves-cross stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **뒤집힌다**)
 *
 *   1. 저울이 **돈다.** 두 비용이 접시에 떨어지면 저울대가 기울고, 일이 많은
 *      쪽이 내려앉는다. n 이 자라는 동안 왼쪽으로 기울었다가 수평이 되고
 *      오른쪽으로 넘어간다 — 그 넘어가는 순간이 이 조각이 말하려는 전부다.
 *   2. 기운 각이 **사다리에 자취로 남는다.** 저울이 돌면 그 기울기가 그대로
 *      칸 위의 짧은 빗금으로 내려앉는다. 여덟 개가 다 서면 왼쪽으로 기운 빗금이
 *      점점 평평해지다 한 칸에서 수평이 되고 오른쪽으로 넘어가는 것이 보인다 —
 *      **곡선이 갈리는 모양 자체가 완주 화면에 남는다.**
 *   3. 싼 쪽의 **표가 날아가 앉는다.** 판정이 칸마다 쌓이고, 여덟 칸이 다 차면
 *      색이 한 번만 바뀌는 것이 보인다. 그 경계에 선을 긋고 왼쪽 구간에 괄호를
 *      치면 실무의 규칙이 된다.
 *
 * 2 는 이행이 더한 것이다. 옛 stage 는 접시의 두 수를 걸음마다 갈아 끼워
 * **앞 견줌이 통째로 지워졌고**, 다 끝난 화면에는 마지막 n 의 두 수만 남아
 * "왜 하필 거기가 경계인가" 를 뒷받침할 자취가 없었다 (프로토콜 4 절 — 조각의
 * 주장이 마지막 화면에 안 남아 있는 수가 있다).
 *
 * ── 두 축을 갈라 둔다
 *
 * **채움(표의 색) = 그 칸에서 어느 쪽이 쌌나** (값의 형편),
 * **기울기(빗금) = 얼마나 벌어졌나** (견줌의 세기). 한 축에 둘을 실으면 동점 칸이
 * 어느 쪽으로도 읽히지 않는다 — 지금은 반반 색 + 수평 빗금으로 두 축이 함께
 * "여기서 만났다" 를 말한다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 저울이 지금 몇 도 기울었나는 `let tilt` 에 (다음 회전의 출발값이자 표가 날아
 * 오르는 접시 자리를 정하는 **화면의 거울**이었다), 사다리가 몇 칸인가는
 * `let slotW` 에, 몇 칸을 견줬고 경계를 그었나는 `chipLayer`·`noteLayer` 의
 * **자식 유무**에 있었다. 이제 장면의 `weighed` 가 그것을 전부 말하므로 정적
 * 그리기가 통째로 세운다 — 되짚어 그 걸음에 가도 기울기와 자취가 그대로 선다.
 *
 * 기울기는 **눈금이 아니라 비**다 — 값 자체는 접시 위의 수가 말한다. 이 전제를
 * 밝히는 자리는 화면이 아니라 `description.ts` 다 (S-piece).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는
 * 값이라 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  crossingIndexOf,
  currentRow,
  phaseOf,
  settledRows,
  type CurvesCrossScene,
} from './scene.js';
import type { CostLead, CostRow } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스. 가로는 러너가 주고(PIECE_CANVAS_W), 세로는 그림이 정한다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 340;
const SIDE = 12;

// ── 저울
const PIVOT_X = W / 2;
const PIVOT_Y = 104;
const ARM = 206;
const STAND_H = 62;
const STAND_HALF = 26;
const HANGER = 18;
const PAN_W = 184;
const PAN_H = 44;
/** 저울대가 넘어가는 최대 각. 이 값을 넘게 기울지 않는다. */
const TILT_MAX = 13;
/** 기울기에 다 담는 비의 폭 — |log₂(a/b)| 가 이 값이면 최대로 기운다. */
const TILT_SPAN = 1.5;

// ── 견줌의 자취. 칸 위에 그때의 기울기를 그대로 남긴다.
const TRACE_Y = 205;
const TRACE_MAX_HALF = 20;

// ── 아래 가로줄
const RAIL_LEFT = SIDE;
const RAIL_RIGHT = W - SIDE;
const RAIL_Y = 248;
const CHIP_W = 58;
const CHIP_H = 26;
const CHIP_TOP = 218;
const REGION_TOP = 212;
const REGION_H = 40;
const REGION_LABEL_Y = 266;
const BRACKET_Y = 280;
const BADGE_Y = 294;

// ── 캡션. 두 줄을 늘 비워 둔다 — 길이에 따라 그림이 밀리지 않게.
const CAPTION_Y1 = 316;
const CAPTION_Y2 = 332;
const CAPTION_EM = 40;

// ── 걸음마다의 운동 (ms). 이 합이 stepMs 위에 얹혀 걸음 벽시계가 된다.
const DROP_MS = 180;
const TILT_MS = 300;
const FLY_MS = 220;
const BOARD_MS = 300;
const SPLIT_MS = 260;
const RULE_MS = 240;
const FRAME_MS = 16;

/**
 * 접시 위에 새겨지는 비용 식.
 *
 * 수식 표기는 **표식**이라 상수로 둔다 — 열 언어로 옮겨 적어도 글자가 달라지지
 * 않으므로 키를 만들지 않는다 (C10 판정 3). 정렬의 **이름**은 언어마다 다르니
 * 그쪽만 `messages` 에 있다.
 */
const INSERTION_FORMULA = 'n²/4';
const MERGE_FORMULA = 'n log₂n';

/** 색 리터럴이 아니라 토큰이 준 hex 를 옅게 만드는 순수 변환 (S-view 예외). */
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((ch) => ch + ch).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

/** 한 글자가 차지하는 폭(em 단위 근사). 한글·가나·한자는 한 칸을 다 쓴다. */
function emWidth(s: string): number {
  let sum = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      (c >= 0x1100 && c <= 0x11ff) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xff60);
    sum += wide ? 1 : 0.52;
  }
  return sum;
}

/** 낱말 경계로 두 줄까지 접는다. 띄어쓰기가 없는 글은 글자로 끊는다. */
function wrapTwo(text: string, budget: number): [string, string] {
  if (emWidth(text) <= budget) return [text, ''];
  const words = text.split(' ');
  if (words.length > 1) {
    let head = '';
    let rest = '';
    for (const word of words) {
      const next = head === '' ? word : `${head} ${word}`;
      if (rest === '' && emWidth(next) <= budget) head = next;
      else rest = rest === '' ? word : `${rest} ${word}`;
    }
    if (head !== '') return [head, rest];
  }
  let head = '';
  let rest = '';
  for (const ch of text) {
    if (rest === '' && emWidth(head + ch) <= budget) head += ch;
    else rest += ch;
  }
  return [head, rest];
}

/** 저울 하나. 정적 그리기가 매번 새로 짓고 걸음 운동이 각도를 덮어쓴다. */
type DrawnBalance = {
  beam: SVGLineElement;
  hangerL: SVGLineElement;
  hangerR: SVGLineElement;
  panL: SVGGElement;
  panR: SVGGElement;
  panLValue: SVGGElement;
  panRValue: SVGGElement;
};

/** 경계 그리기 한 벌. */
type DrawnRegion = {
  leftTint: SVGRectElement;
  rightTint: SVGRectElement;
  line: SVGLineElement;
  leftLabel: SVGTextElement;
  rightLabel: SVGTextElement;
  x: number;
};

/** 실무 규칙 한 벌. */
type DrawnRule = { bracket: SVGPathElement; badge: SVGTextElement; x: number };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  rail: SVGLineElement | null;
  balance: DrawnBalance | null;
  chips: SVGGElement[];
  traces: SVGLineElement[];
  region: DrawnRegion | null;
  rule: DrawnRule | null;
  /** 칸의 가운데 x. 사다리 길이가 정하므로 그릴 때 한 번만 셈한다. */
  center: (i: number) => number;
  /** 빗금의 반폭. 칸 폭에서 역산한 값이라 저울과 같은 각을 써도 넘치지 않는다. */
  traceHalf: number;
};

export const curvesCrossStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CurvesCrossScene> {
    void container; // 러너가 붙여 준 캔버스에만 그린다 (S-view).
    const svg = params.canvas;
    svg.textContent = '';

    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    // 두 알고리즘은 서로 다른 두 정체성이다 — n 개 카테고리 식별 (S-view 결정 3).
    const tone = categorical(2, 'vivid');
    const INSERTION_COLOR = tone[0]!;
    const MERGE_COLOR = tone[1]!;

    // ── 층. 뒤에서 앞으로. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const regionLayer = el('g');
    const railLayer = el('g');
    const traceLayer = el('g');
    const chipLayer = el('g');
    const balanceLayer = el('g');
    const flightLayer = el('g');
    const noteLayer = el('g');
    const captionLayer = el('g');
    const layers = [
      regionLayer,
      railLayer,
      traceLayer,
      chipLayer,
      balanceLayer,
      flightLayer,
      noteLayer,
      captionLayer,
    ];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 마디를 셋까지 잇고, 정적 그리기가 손잡이를 매번 재할당한다.
     * 가운데에 되짚기나 `destroy` 가 끼어들면 남은 마디가 **새로 선 화면**에
     * 쓰므로, 마디마다 자기 번호가 아직 유효한지 보고 물러난다. `isInstant` 는
     * 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 벽시계 보간. rAF 가 아니라 타이머로 도는 것은 happy-dom 위의 검사에서도
     * 실제로 흘러야 "흘려 세운 화면" 과 "곧바로 세운 화면" 의 대조에 이빨이
     * 생기기 때문이다. 상시 도는 루프는 두지 않는다 (S-scene MUST NOT).
     */
    function tween(ms: number, mine: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const start = Date.now();
        let id: ReturnType<typeof setTimeout> | null = null;
        const finish = (settle: boolean): void => {
          waiters.delete(wake);
          if (id !== null) {
            clearTimeout(id);
            timers.delete(id);
            id = null;
          }
          // 세대가 지났으면 화면에 손대지 않고 물러난다.
          if (settle) apply(1);
          resolve();
        };
        // destroy 가 타이머를 끊어도 이 약속은 풀려야 한다 (S-piece MUST).
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (id !== null) timers.delete(id);
          id = null;
          if (!alive(mine)) {
            finish(false);
            return;
          }
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - start) / ms);
          if (p >= 1) {
            finish(true);
            return;
          }
          apply(p);
          id = setTimeout(tick, FRAME_MS);
          timers.add(id);
        };
        id = setTimeout(tick, FRAME_MS);
        timers.add(id);
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function armEnd(theta: number, side: -1 | 1): { x: number; y: number } {
      const rad = (theta * Math.PI) / 180;
      return {
        x: PIVOT_X + side * ARM * Math.cos(rad),
        y: PIVOT_Y - side * ARM * Math.sin(rad),
      };
    }

    /**
     * 두 값의 비를 기울기로 옮긴다. 눈금이 아니라 순서와 벌어짐을 뜻한다.
     *
     * 저울대도 칸 위의 빗금도 **이 한 함수**를 쓴다 — 축을 두 군데서 정하면
     * 저울이 말하는 것과 자취가 말하는 것이 갈린다 (프로토콜 4 절).
     */
    function tiltFor(row: CostRow): number {
      const ratio = Math.log2(row.insertion / row.merge) / TILT_SPAN;
      const clamped = Math.max(-1, Math.min(1, ratio));
      const sign = clamped < 0 ? -1 : 1;
      return TILT_MAX * sign * Math.sqrt(Math.abs(clamped));
    }

    /** k 번째 견줌(0-based) 의 기울기. 아직 아무것도 안 올랐으면 수평이다. */
    function tiltAt(scene: CurvesCrossScene, k: number): number {
      const row = k >= 0 ? scene.rows[k] : undefined;
      return row === undefined ? 0 : tiltFor(row);
    }

    function placeBalance(b: DrawnBalance, theta: number): void {
      const left = armEnd(theta, -1);
      const right = armEnd(theta, 1);
      b.beam.setAttribute('x1', String(left.x));
      b.beam.setAttribute('y1', String(left.y));
      b.beam.setAttribute('x2', String(right.x));
      b.beam.setAttribute('y2', String(right.y));
      b.hangerL.setAttribute('x1', String(left.x));
      b.hangerL.setAttribute('y1', String(left.y));
      b.hangerL.setAttribute('x2', String(left.x));
      b.hangerL.setAttribute('y2', String(left.y + HANGER));
      b.hangerR.setAttribute('x1', String(right.x));
      b.hangerR.setAttribute('y1', String(right.y));
      b.hangerR.setAttribute('x2', String(right.x));
      b.hangerR.setAttribute('y2', String(right.y + HANGER));
      b.panL.setAttribute('transform', `translate(${left.x}, ${left.y + HANGER})`);
      b.panR.setAttribute('transform', `translate(${right.x}, ${right.y + HANGER})`);
    }

    function panCenter(theta: number, side: -1 | 1): { x: number; y: number } {
      const end = armEnd(theta, side);
      return { x: end.x, y: end.y + HANGER + PAN_H / 2 };
    }

    /** 칸 위의 빗금. 저울과 같은 각도 규칙을 쓴다 — 무거운 쪽이 내려앉는다. */
    function placeTrace(line: SVGLineElement, cx: number, theta: number, half: number): void {
      const rad = (theta * Math.PI) / 180;
      const dx = half * Math.cos(rad);
      const dy = half * Math.sin(rad);
      line.setAttribute('x1', String(cx - dx));
      line.setAttribute('y1', String(TRACE_Y + dy));
      line.setAttribute('x2', String(cx + dx));
      line.setAttribute('y2', String(TRACE_Y - dy));
    }

    // ── 부품 ──────────────────────────────────────────────────────────────

    /** 두 편의 이름. 저울이 기울어도 여기는 움직이지 않는다. */
    function sideLabel(cx: number, color: string, name: string, formula: string): void {
      const bar = el('rect', { x: cx - 15, y: 10, width: 30, height: 5, rx: 2.5, fill: color });
      const label = el('text', {
        x: cx,
        y: 29,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = name;
      // 비용 식은 표식이라 상수다 (C10 판정 3). 이름 아래 한 줄로 새긴다.
      const cost = el('text', {
        x: cx,
        y: 43,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.text,
      });
      cost.textContent = formula;
      balanceLayer.appendChild(bar);
      balanceLayer.appendChild(label);
      balanceLayer.appendChild(cost);
    }

    function makePan(color: string): { group: SVGGElement; value: SVGGElement } {
      const group = el('g');
      const plate = el('rect', {
        x: -PAN_W / 2,
        y: 0,
        width: PAN_W,
        height: PAN_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      const edge = el('rect', {
        x: -PAN_W / 2,
        y: 0,
        width: PAN_W,
        height: 3,
        rx: 1.5,
        fill: color,
      });
      const value = el('g');
      group.appendChild(plate);
      group.appendChild(edge);
      group.appendChild(value);
      return { group, value };
    }

    function fillPanValue(value: SVGGElement, amount: number): void {
      const label = el('text', {
        x: 0,
        y: PAN_H / 2 + 8,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': '600',
        fill: c.text,
      });
      label.textContent = String(amount);
      value.appendChild(label);
    }

    function chipBody(n: number, lead: CostLead, width: number): SVGGElement {
      const g = el('g');
      if (lead === 'tie') {
        // 같은 값이면 칸 하나를 둘이 나눠 갖는다 — 경계가 이 칸을 지난다.
        g.appendChild(
          el('path', {
            d: `M ${-width / 2 + 6} ${-CHIP_H / 2} H 0 V ${CHIP_H / 2} H ${-width / 2 + 6} A 6 6 0 0 1 ${-width / 2} ${CHIP_H / 2 - 6} V ${-CHIP_H / 2 + 6} A 6 6 0 0 1 ${-width / 2 + 6} ${-CHIP_H / 2} Z`,
            fill: INSERTION_COLOR,
          }),
        );
        g.appendChild(
          el('path', {
            d: `M 0 ${-CHIP_H / 2} H ${width / 2 - 6} A 6 6 0 0 1 ${width / 2} ${-CHIP_H / 2 + 6} V ${CHIP_H / 2 - 6} A 6 6 0 0 1 ${width / 2 - 6} ${CHIP_H / 2} H 0 Z`,
            fill: MERGE_COLOR,
          }),
        );
      } else {
        g.appendChild(
          el('rect', {
            x: -width / 2,
            y: -CHIP_H / 2,
            width,
            height: CHIP_H,
            rx: 6,
            fill: lead === 'insertion' ? INSERTION_COLOR : MERGE_COLOR,
          }),
        );
      }
      const label = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': '600',
        // 고정 타일 위의 잉크는 테마를 따라 뒤집지 않는다 (design-tokens).
        fill: c.stateInk,
      });
      label.textContent = String(n);
      g.appendChild(label);
      return g;
    }

    // ── 문안 ──────────────────────────────────────────────────────────────

    /**
     * 이 장면이 할 말. 수는 전부 장면의 표에서 나오므로 접시·표와 갈릴 자리가 없다.
     */
    function captionFor(scene: CurvesCrossScene): string {
      const row = currentRow(scene);
      switch (phaseOf(scene)) {
        case 'board':
          return t('caption.board', 'Two sorts on one balance — the pan doing more work hangs lower.');
        case 'weigh': {
          if (row === null) return '';
          const args = { n: row.n, a: row.insertion, b: row.merge };
          if (row.lead === 'insertion') {
            return t(
              'caption.insertionCheaper',
              'n = {n}: insertion {a}, merge {b}. The cheaper one is insertion.',
              args,
            );
          }
          if (row.lead === 'merge') {
            return t(
              'caption.mergeCheaper',
              'n = {n}: insertion {a}, merge {b}. The cheaper one is merge.',
              args,
            );
          }
          return t('caption.tie', 'n = {n}: both sides weigh {a}. The beam is level.', args);
        }
        case 'threshold': {
          const at = crossingIndexOf(scene);
          const cross = at === null ? undefined : scene.rows[at];
          if (cross === undefined) return '';
          return t(
            'caption.threshold',
            'The lead flips at exactly n = {n}: insertion owns the left, merge owns the right.',
            { n: cross.n },
          );
        }
        case 'rule':
          return t('caption.rule', 'This is why real sort libraries hand short runs to insertion sort.');
        default:
          return '';
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /**
     * 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene).
     *
     * 자식만 비우면 층 **자신**의 `transform`·`opacity` 가 앞 걸음 값으로 남는다 —
     * 판 세우기 운동이 `balanceLayer` 에 그 둘을 거는 자리다. 함께 거둔다.
     */
    function rewind(): void {
      for (const layer of layers) {
        layer.textContent = '';
        layer.removeAttribute('transform');
        layer.removeAttribute('opacity');
      }
    }

    function drawCaption(text: string): void {
      const [first, second] = wrapTwo(text, CAPTION_EM);
      [
        [CAPTION_Y1, first],
        [CAPTION_Y2, second],
      ].forEach(([y, line]) => {
        const node = el('text', {
          x: PIVOT_X,
          y: y as number,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        node.textContent = line as string;
        captionLayer.appendChild(node);
      });
    }

    function drawBalance(scene: CurvesCrossScene, theta: number): DrawnBalance {
      sideLabel(PIVOT_X - ARM, INSERTION_COLOR, t('label.insertion', 'Insertion sort'), INSERTION_FORMULA);
      sideLabel(PIVOT_X + ARM, MERGE_COLOR, t('label.merge', 'Merge sort'), MERGE_FORMULA);

      const stand = el('polygon', {
        points: `${PIVOT_X - STAND_HALF},${PIVOT_Y + STAND_H} ${PIVOT_X + STAND_HALF},${PIVOT_Y + STAND_H} ${PIVOT_X},${PIVOT_Y}`,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      const beam = el('line', {
        stroke: c.text,
        'stroke-width': 5,
        'stroke-linecap': 'round',
      });
      const hub = el('circle', { cx: PIVOT_X, cy: PIVOT_Y, r: 6, fill: c.text });
      const hangerL = el('line', { stroke: c.border, 'stroke-width': 1.5 });
      const hangerR = el('line', { stroke: c.border, 'stroke-width': 1.5 });
      const left = makePan(INSERTION_COLOR);
      const right = makePan(MERGE_COLOR);

      balanceLayer.appendChild(stand);
      balanceLayer.appendChild(hangerL);
      balanceLayer.appendChild(hangerR);
      balanceLayer.appendChild(beam);
      balanceLayer.appendChild(hub);
      balanceLayer.appendChild(left.group);
      balanceLayer.appendChild(right.group);

      const row = currentRow(scene);
      if (row !== null) {
        fillPanValue(left.value, row.insertion);
        fillPanValue(right.value, row.merge);

        // 지금 저울에 오른 n. 아직 아무것도 안 올랐으면 짓지 않는다 — 빈 딱지를
        // 걸어 두면 앞 걸음의 글자가 남을 자리가 생긴다 (프로토콜 4 절).
        const badge = el('g');
        badge.appendChild(
          el('rect', {
            x: PIVOT_X - 43,
            y: PIVOT_Y + 66,
            width: 86,
            height: 24,
            rx: 12,
            fill: c.bg,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        const badgeText = el('text', {
          x: PIVOT_X,
          y: PIVOT_Y + 82,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        badgeText.textContent = `n = ${row.n}`;
        badge.appendChild(badgeText);
        balanceLayer.appendChild(badge);
      }

      const drawn: DrawnBalance = {
        beam,
        hangerL,
        hangerR,
        panL: left.group,
        panR: right.group,
        panLValue: left.value,
        panRValue: right.value,
      };
      placeBalance(drawn, theta);
      return drawn;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: CurvesCrossScene): Drawn {
      rewind();

      const count = Math.max(1, scene.rows.length);
      const slotW = (RAIL_RIGHT - RAIL_LEFT) / count;
      const center = (i: number): number => RAIL_LEFT + slotW * (i + 0.5);
      const traceHalf = Math.max(9, Math.min(TRACE_MAX_HALF, slotW / 2 - 9));

      drawCaption(captionFor(scene));

      if (phaseOf(scene) === 'blank') {
        // 아직 아무것도 없는 화면. 숨기는 것이 아니라 짓지 않는다 (프로토콜 4 절).
        return { rail: null, balance: null, chips: [], traces: [], region: null, rule: null, center, traceHalf };
      }

      // ── 아래 가로줄과 사다리의 빈 칸. 채워질 자리를 먼저 보인다.
      const rail = el('line', {
        x1: RAIL_LEFT,
        y1: RAIL_Y,
        x2: RAIL_RIGHT,
        y2: RAIL_Y,
        stroke: c.border,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      railLayer.appendChild(rail);
      scene.rows.forEach((row, i) => {
        const g = el('g', { transform: `translate(${center(i)}, ${CHIP_TOP + CHIP_H / 2})` });
        g.appendChild(
          el('rect', {
            x: -CHIP_W / 2,
            y: -CHIP_H / 2,
            width: CHIP_W,
            height: CHIP_H,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
        const label = el('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        label.textContent = String(row.n);
        g.appendChild(label);
        railLayer.appendChild(g);
      });

      const settled = settledRows(scene);

      // ── 견줌의 자취. 저울이 그때 얼마나 기울었나가 칸 위에 남는다.
      const traces = settled.map((row, i) => {
        traceLayer.appendChild(el('circle', { cx: center(i), cy: TRACE_Y, r: 1.4, fill: c.textMuted }));
        const line = el('line', {
          stroke: c.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        placeTrace(line, center(i), tiltFor(row), traceHalf);
        traceLayer.appendChild(line);
        return line;
      });

      // ── 앉은 표. 채움이 그 칸에서 어느 쪽이 쌌나를 말한다.
      const chips = settled.map((row, i) => {
        const chip = chipBody(row.n, row.lead, CHIP_W);
        chip.setAttribute('transform', `translate(${center(i)}, ${CHIP_TOP + CHIP_H / 2})`);
        chipLayer.appendChild(chip);
        return chip;
      });

      const balance = drawBalance(scene, tiltAt(scene, scene.weighed - 1));

      // ── 경계. 머무는 표식이므로 정적 그리기가 세운다 (S-scene).
      let region: DrawnRegion | null = null;
      const at = crossingIndexOf(scene);
      if (scene.threshold && at !== null) {
        const x = center(at);
        const leftTint = el('rect', {
          x: RAIL_LEFT,
          y: REGION_TOP,
          width: x - RAIL_LEFT,
          height: REGION_H,
          rx: 6,
          fill: hexToRgba(INSERTION_COLOR, 0.16),
        });
        const rightTint = el('rect', {
          x,
          y: REGION_TOP,
          width: RAIL_RIGHT - x,
          height: REGION_H,
          rx: 6,
          fill: hexToRgba(MERGE_COLOR, 0.16),
        });
        regionLayer.appendChild(leftTint);
        regionLayer.appendChild(rightTint);

        const line = el('line', {
          x1: x,
          y1: REGION_TOP - 4,
          x2: x,
          y2: REGION_TOP - 4 + REGION_H + 12,
          stroke: c.text,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
        noteLayer.appendChild(line);

        const leftLabel = el('text', {
          x: (RAIL_LEFT + x) / 2,
          y: REGION_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        leftLabel.textContent = t('label.insertion', 'Insertion sort');
        const rightLabel = el('text', {
          x: (x + RAIL_RIGHT) / 2,
          y: REGION_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        rightLabel.textContent = t('label.merge', 'Merge sort');
        noteLayer.appendChild(leftLabel);
        noteLayer.appendChild(rightLabel);

        region = { leftTint, rightTint, line, leftLabel, rightLabel, x };
      }

      // ── 실무 규칙. 이것도 머무는 표식이다.
      let rule: DrawnRule | null = null;
      if (scene.rule && at !== null) {
        const x = center(at);
        const bracket = el('path', {
          d: `M ${RAIL_LEFT} ${BRACKET_Y - 5} V ${BRACKET_Y} H ${x} V ${BRACKET_Y - 5}`,
          fill: 'none',
          stroke: INSERTION_COLOR,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        const badge = el('text', {
          x: (RAIL_LEFT + x) / 2,
          y: BADGE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        badge.textContent = t('label.library', 'libraries sort short runs here');
        noteLayer.appendChild(bracket);
        noteLayer.appendChild(badge);
        rule = { bracket, badge, x };
      }

      return { rail, balance, chips, traces, region, rule, center, traceHalf };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이 된다. 물리는 것은 `await` 앞에서 하므로 그 사이에
    // 페인트가 끼지 않는다.

    /** 저울이 위에서 내려와 서고 가로줄이 그어진다. */
    function flowBoard(drawn: Drawn, mine: number): Promise<void> {
      const rail = drawn.rail;
      balanceLayer.setAttribute('transform', 'translate(0, -26)');
      balanceLayer.setAttribute('opacity', '0');
      rail?.setAttribute('x2', String(RAIL_LEFT));
      return tween(BOARD_MS, mine, (p) => {
        const e = easeOut(p);
        balanceLayer.setAttribute('transform', `translate(0, ${(1 - e) * -26})`);
        balanceLayer.setAttribute('opacity', String(e));
        rail?.setAttribute('x2', String(RAIL_LEFT + (RAIL_RIGHT - RAIL_LEFT) * e));
      });
    }

    /**
     * 두 비용이 접시로 떨어지고, 저울이 돌며 그 기울기가 자취로 내려앉고, 싼 쪽의
     * 표가 제 칸으로 날아간다.
     *
     * 회전의 **출발값은 `prev` 가 아니라 장면이 말한다** — 앞 칸의 기울기는
     * `rows[weighed - 2]` 에서 셈해지므로 걸음을 건너뛰어 와도 같다 (S-scene).
     */
    async function flowWeigh(scene: CurvesCrossScene, drawn: Drawn, mine: number): Promise<void> {
      const b = drawn.balance;
      const k = scene.weighed;
      const row = scene.rows[k - 1];
      if (b === null || row === undefined) return;

      const from = tiltAt(scene, k - 2);
      const to = tiltFor(row);
      const cx = drawn.center(k - 1);
      const trace = drawn.traces[k - 1];
      const chip = drawn.chips[k - 1];

      // 뒤로 물린다 — 값은 아직 접시 위에 떠 있고, 저울과 자취는 앞 칸의 각이다.
      b.panLValue.setAttribute('transform', 'translate(0, -40)');
      b.panRValue.setAttribute('transform', 'translate(0, -40)');
      placeBalance(b, from);
      if (trace) placeTrace(trace, cx, from, drawn.traceHalf);

      // 1. 두 비용이 접시로 떨어진다.
      await tween(DROP_MS, mine, (p) => {
        const dy = (1 - easeOut(p)) * -40;
        b.panLValue.setAttribute('transform', `translate(0, ${dy})`);
        b.panRValue.setAttribute('transform', `translate(0, ${dy})`);
      });
      if (!alive(mine)) return;

      // 2. 저울대가 돌고, 그 각이 그대로 칸 위의 자취가 된다. 한 뜻의 운동이므로
      //    시계를 둘로 나누지 않는다 (프로토콜 4 절).
      await tween(TILT_MS, mine, (p) => {
        const theta = from + (to - from) * easeInOut(p);
        placeBalance(b, theta);
        if (trace) placeTrace(trace, cx, theta, drawn.traceHalf);
      });
      if (!alive(mine)) return;

      // 3. 싼 쪽의 표가 접시에서 제 칸으로 날아간다. 같으면 양쪽에서 반쪽씩 온다.
      //    정적으로 이미 앉아 있으므로 걷어 내고 날린 뒤 다시 세우게 둔다.
      chip?.remove();
      const target = { x: cx, y: CHIP_TOP + CHIP_H / 2 };
      const flights: Array<{ node: SVGGElement; from: { x: number; y: number } }> = [];
      if (row.lead === 'tie') {
        const half = CHIP_W / 2;
        const makeHalf = (fill: string): SVGGElement => {
          const g = el('g');
          g.appendChild(
            el('rect', { x: -half / 2, y: -CHIP_H / 2, width: half, height: CHIP_H, rx: 4, fill }),
          );
          return g;
        };
        flights.push({ node: makeHalf(INSERTION_COLOR), from: panCenter(to, -1) });
        flights.push({ node: makeHalf(MERGE_COLOR), from: panCenter(to, 1) });
      } else {
        const side: -1 | 1 = row.lead === 'insertion' ? -1 : 1;
        flights.push({ node: chipBody(row.n, row.lead, CHIP_W), from: panCenter(to, side) });
      }
      for (const f of flights) {
        f.node.setAttribute('transform', `translate(${f.from.x}, ${f.from.y})`);
        flightLayer.appendChild(f.node);
      }
      await tween(FLY_MS, mine, (p) => {
        const e = easeInOut(p);
        flights.forEach((f, i) => {
          const offset = row.lead === 'tie' ? (i === 0 ? -CHIP_W / 4 : CHIP_W / 4) * e : 0;
          const x = f.from.x + (target.x - f.from.x) * e + offset;
          const y = f.from.y + (target.y - f.from.y) * e;
          f.node.setAttribute('transform', `translate(${x}, ${y})`);
        });
      });
    }

    /** 선이 위에서 내려 그어지고, 그 자리를 기준으로 좌우가 갈라진다. */
    function flowThreshold(drawn: Drawn, mine: number): Promise<void> {
      const r = drawn.region;
      if (r === null) return Promise.resolve();

      r.leftTint.setAttribute('width', '0');
      r.rightTint.setAttribute('width', '0');
      r.line.setAttribute('y2', String(REGION_TOP - 4));
      for (const label of [r.leftLabel, r.rightLabel]) {
        label.setAttribute('transform', 'translate(0, 8)');
        label.setAttribute('opacity', '0');
      }

      return tween(SPLIT_MS, mine, (p) => {
        const e = easeInOut(p);
        r.line.setAttribute('y2', String(REGION_TOP - 4 + (REGION_H + 12) * e));
        r.leftTint.setAttribute('width', String((r.x - RAIL_LEFT) * e));
        r.rightTint.setAttribute('width', String((RAIL_RIGHT - r.x) * e));
        const lift = (1 - e) * 8;
        for (const label of [r.leftLabel, r.rightLabel]) {
          label.setAttribute('transform', `translate(0, ${lift})`);
          label.setAttribute('opacity', String(e));
        }
      });
    }

    /** 괄호가 교차점에서 왼쪽으로 뻗고, 문구가 그것을 따라 들어온다. */
    function flowRule(drawn: Drawn, mine: number): Promise<void> {
      const r = drawn.rule;
      if (r === null) return Promise.resolve();

      const draw = (e: number): void => {
        const left = r.x - (r.x - RAIL_LEFT) * e;
        r.bracket.setAttribute(
          'd',
          `M ${left} ${BRACKET_Y - 5} V ${BRACKET_Y} H ${r.x} V ${BRACKET_Y - 5}`,
        );
        r.badge.setAttribute('transform', `translate(${(1 - e) * 24}, 0)`);
        r.badge.setAttribute('opacity', String(e));
      };
      draw(0);
      return tween(RULE_MS, mine, (p) => draw(easeOut(p)));
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: CurvesCrossScene,
      _prev: CurvesCrossScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      // `prev` 는 보지 않는다 — 흐름의 출발값도 장면에서 셈해진다 (S-scene).
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      switch (phaseOf(next)) {
        case 'board':
          await flowBoard(drawn, mine);
          break;
        case 'weigh':
          await flowWeigh(next, drawn, mine);
          break;
        case 'threshold':
          await flowThreshold(drawn, mine);
          break;
        case 'rule':
          await flowRule(drawn, mine);
          break;
        default:
          return;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 층의 transform·opacity 가 통째로 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
