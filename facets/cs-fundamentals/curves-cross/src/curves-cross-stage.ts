/**
 * curves-cross stage — 저울 하나와 그 아래 가로줄.
 *
 * 질문의 동사가 **뒤집힌다**이므로 화면의 주 운동은 회전이다. 두 비용이 접시에
 * 떨어지면 저울대가 돌고, 가벼운 쪽(= 일이 적은 쪽)이 올라간다. n 이 자라는 동안
 * 저울은 왼쪽으로 기울었다가 수평이 되고 오른쪽으로 넘어간다 — 그 넘어가는 순간이
 * 이 조각이 말하려는 전부다.
 *
 * 아래 가로줄은 판정이 쌓이는 자리다. 걸음마다 싼 쪽의 표가 접시에서 제 칸으로
 * 날아가 앉고, 여덟 칸이 다 차면 색이 한 번만 바뀌는 것이 보인다. 그 경계에
 * 선을 긋고 왼쪽 구간에 괄호를 치면 실무의 규칙이 된다.
 *
 * 기울기는 **눈금이 아니라 비**다 — 값 자체는 접시 위의 수가 말한다. 이 전제를
 * 밝히는 자리는 화면이 아니라 `description.ts` 다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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

export type CurvesCrossLead = 'insertion' | 'merge' | 'tie';

export type CurvesCrossWeighRow = {
  index: number;
  n: number;
  insertion: number;
  merge: number;
  lead: CurvesCrossLead;
};

export type CurvesCrossStageInstance = ViewInstance & {
  setBoard(sizes: number[]): Promise<void>;
  weigh(row: CurvesCrossWeighRow): Promise<void>;
  markThreshold(n: number, index: number): Promise<void>;
  showRule(n: number, index: number): Promise<void>;
  rewind(): void;
};

/** 색 리터럴이 아니라 토큰이 준 hex 를 옅게 만드는 순수 변환 (S-view 예외). */
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
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

export const curvesCrossStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    void container; // 러너가 붙여 준 캔버스에만 그린다 (S-view).
    const svg = params.canvas;
    svg.textContent = '';

    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    // 두 알고리즘은 서로 다른 두 정체성이다 — n 개 카테고리 식별 (S-view 결정 3).
    const tone = categorical(2, 'vivid');
    const INSERTION_COLOR = tone[0]!;
    const MERGE_COLOR = tone[1]!;

    // ── destroy 가 기다리던 것을 푼다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          resolve();
          return;
        }
        const start = Date.now();
        let id: ReturnType<typeof setTimeout> | null = null;
        const finish = (): void => {
          waiters.delete(finish);
          if (id !== null) {
            clearTimeout(id);
            timers.delete(id);
            id = null;
          }
          apply(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (id !== null) timers.delete(id);
          id = null;
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          if (p >= 1) {
            finish();
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

    // ── 층. 뒤에서 앞으로.
    const regionLayer = el('g');
    const railLayer = el('g');
    const chipLayer = el('g');
    const balanceLayer = el('g');
    const flightLayer = el('g');
    const noteLayer = el('g');
    const captionLayer = el('g');
    for (const layer of [regionLayer, railLayer, chipLayer, balanceLayer, flightLayer, noteLayer, captionLayer]) {
      svg.appendChild(layer);
    }

    // ── 두 편의 이름. 저울이 기울어도 여기는 움직이지 않는다.
    function sideLabel(cx: number, color: string, name: string, formula: string): void {
      const bar = el('rect', {
        x: cx - 15,
        y: 10,
        width: 30,
        height: 5,
        rx: 2.5,
        fill: color,
      });
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

    // ── 저울 부속
    const stand = el('polygon', {
      points: `${PIVOT_X - STAND_HALF},${PIVOT_Y + STAND_H} ${PIVOT_X + STAND_HALF},${PIVOT_Y + STAND_H} ${PIVOT_X},${PIVOT_Y}`,
      fill: c.bgSubtle,
      stroke: c.border,
      'stroke-width': 1,
    });
    const beam = el('line', {
      x1: PIVOT_X - ARM,
      y1: PIVOT_Y,
      x2: PIVOT_X + ARM,
      y2: PIVOT_Y,
      stroke: c.text,
      'stroke-width': 5,
      'stroke-linecap': 'round',
    });
    const hub = el('circle', { cx: PIVOT_X, cy: PIVOT_Y, r: 6, fill: c.text });

    const hangerL = el('line', { stroke: c.border, 'stroke-width': 1.5 });
    const hangerR = el('line', { stroke: c.border, 'stroke-width': 1.5 });

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

    const panL = makePan(INSERTION_COLOR);
    const panR = makePan(MERGE_COLOR);

    const nBadge = el('g');
    const nBadgeBox = el('rect', {
      x: PIVOT_X - 43,
      y: PIVOT_Y + 66,
      width: 86,
      height: 24,
      rx: 12,
      fill: c.bg,
      stroke: c.border,
      'stroke-width': 1,
    });
    const nBadgeText = el('text', {
      x: PIVOT_X,
      y: PIVOT_Y + 82,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    nBadge.appendChild(nBadgeBox);
    nBadge.appendChild(nBadgeText);

    sideLabel(PIVOT_X - ARM, INSERTION_COLOR, t('label.insertion', 'Insertion sort'), INSERTION_FORMULA);
    sideLabel(PIVOT_X + ARM, MERGE_COLOR, t('label.merge', 'Merge sort'), MERGE_FORMULA);
    balanceLayer.appendChild(stand);
    balanceLayer.appendChild(hangerL);
    balanceLayer.appendChild(hangerR);
    balanceLayer.appendChild(beam);
    balanceLayer.appendChild(hub);
    balanceLayer.appendChild(panL.group);
    balanceLayer.appendChild(panR.group);
    balanceLayer.appendChild(nBadge);

    // ── 아래 가로줄
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

    const captionL1 = el('text', {
      x: PIVOT_X,
      y: CAPTION_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const captionL2 = el('text', {
      x: PIVOT_X,
      y: CAPTION_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    captionLayer.appendChild(captionL1);
    captionLayer.appendChild(captionL2);

    // ── 상태
    let slotCount = 0;
    let slotW = 0;
    let tilt = 0;

    function slotCenter(index: number): number {
      return RAIL_LEFT + slotW * (index + 0.5);
    }

    function armEnd(theta: number, side: -1 | 1): { x: number; y: number } {
      const rad = (theta * Math.PI) / 180;
      return {
        x: PIVOT_X + side * ARM * Math.cos(rad),
        y: PIVOT_Y - side * ARM * Math.sin(rad),
      };
    }

    /** 두 값의 비를 기울기로 옮긴다. 눈금이 아니라 순서와 벌어짐을 뜻한다. */
    function tiltFor(insertion: number, merge: number): number {
      const ratio = Math.log2(insertion / merge) / TILT_SPAN;
      const clamped = Math.max(-1, Math.min(1, ratio));
      const sign = clamped < 0 ? -1 : 1;
      return TILT_MAX * sign * Math.sqrt(Math.abs(clamped));
    }

    function placeBalance(theta: number): void {
      const left = armEnd(theta, -1);
      const right = armEnd(theta, 1);
      beam.setAttribute('x1', String(left.x));
      beam.setAttribute('y1', String(left.y));
      beam.setAttribute('x2', String(right.x));
      beam.setAttribute('y2', String(right.y));
      hangerL.setAttribute('x1', String(left.x));
      hangerL.setAttribute('y1', String(left.y));
      hangerL.setAttribute('x2', String(left.x));
      hangerL.setAttribute('y2', String(left.y + HANGER));
      hangerR.setAttribute('x1', String(right.x));
      hangerR.setAttribute('y1', String(right.y));
      hangerR.setAttribute('x2', String(right.x));
      hangerR.setAttribute('y2', String(right.y + HANGER));
      panL.group.setAttribute('transform', `translate(${left.x}, ${left.y + HANGER})`);
      panR.group.setAttribute('transform', `translate(${right.x}, ${right.y + HANGER})`);
    }

    function panCenter(side: -1 | 1): { x: number; y: number } {
      const end = armEnd(tilt, side);
      return { x: end.x, y: end.y + HANGER + PAN_H / 2 };
    }

    function setPanValue(pan: { value: SVGGElement }, value: number, dy: number): void {
      pan.value.textContent = '';
      const label = el('text', {
        x: 0,
        y: PAN_H / 2 + 8,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': '600',
        fill: c.text,
      });
      label.textContent = String(value);
      pan.value.appendChild(label);
      pan.value.setAttribute('transform', `translate(0, ${dy})`);
    }

    function chipBody(n: number, lead: CurvesCrossLead, width: number): SVGGElement {
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

    function setCaption(text: string): void {
      const [first, second] = wrapTwo(text, CAPTION_EM);
      captionL1.textContent = first;
      captionL2.textContent = second;
    }

    function clearBoard(): void {
      chipLayer.textContent = '';
      flightLayer.textContent = '';
      regionLayer.textContent = '';
      noteLayer.textContent = '';
      panL.value.textContent = '';
      panR.value.textContent = '';
      nBadgeText.textContent = '';
      captionL1.textContent = '';
      captionL2.textContent = '';
      tilt = 0;
      placeBalance(0);
    }

    clearBoard();

    const instance: CurvesCrossStageInstance = {
      async setBoard(sizes: number[]): Promise<void> {
        clearBoard();
        slotCount = Math.max(1, sizes.length);
        slotW = (RAIL_RIGHT - RAIL_LEFT) / slotCount;

        // 사다리의 빈 칸을 가로줄 위에 세워 둔다 — 채워질 자리를 먼저 보인다.
        sizes.forEach((n, i) => {
          const g = el('g', { transform: `translate(${slotCenter(i)}, ${CHIP_TOP + CHIP_H / 2})` });
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
          label.textContent = String(n);
          g.appendChild(label);
          railLayer.appendChild(g);
        });

        setCaption(
          t('caption.board', 'Two sorts on one balance — the pan doing more work hangs lower.'),
        );

        // 저울이 위에서 내려와 선다. 판을 세우는 걸음에도 운동을 준다 (S-piece).
        await tween(BOARD_MS, (p) => {
          const e = easeOut(p);
          balanceLayer.setAttribute('transform', `translate(0, ${(1 - e) * -26})`);
          balanceLayer.setAttribute('opacity', String(e));
          rail.setAttribute('x2', String(RAIL_LEFT + (RAIL_RIGHT - RAIL_LEFT) * e));
        });
        balanceLayer.removeAttribute('transform');
        balanceLayer.setAttribute('opacity', '1');
      },

      async weigh(row: CurvesCrossWeighRow): Promise<void> {
        nBadgeText.textContent = `n = ${row.n}`;
        if (row.lead === 'insertion') {
          setCaption(
            t('caption.insertionCheaper', 'n = {n}: insertion {a}, merge {b}. The cheaper one is insertion.', {
              n: row.n,
              a: row.insertion,
              b: row.merge,
            }),
          );
        } else if (row.lead === 'merge') {
          setCaption(
            t('caption.mergeCheaper', 'n = {n}: insertion {a}, merge {b}. The cheaper one is merge.', {
              n: row.n,
              a: row.insertion,
              b: row.merge,
            }),
          );
        } else {
          setCaption(
            t('caption.tie', 'n = {n}: both sides weigh {a}. The beam is level.', {
              n: row.n,
              a: row.insertion,
              b: row.merge,
            }),
          );
        }

        // 1. 두 비용이 접시로 떨어진다.
        await tween(DROP_MS, (p) => {
          const dy = (1 - easeOut(p)) * -40;
          setPanValue(panL, row.insertion, dy);
          setPanValue(panR, row.merge, dy);
        });

        // 2. 저울대가 돈다. 일이 많은 쪽이 내려앉는다.
        const from = tilt;
        const to = tiltFor(row.insertion, row.merge);
        await tween(TILT_MS, (p) => {
          tilt = from + (to - from) * easeInOut(p);
          placeBalance(tilt);
        });
        tilt = to;
        placeBalance(tilt);

        // 3. 싼 쪽의 표가 제 칸으로 날아가 앉는다. 같으면 양쪽에서 반쪽씩 온다.
        const target = { x: slotCenter(row.index), y: CHIP_TOP + CHIP_H / 2 };
        const flights: Array<{ node: SVGGElement; from: { x: number; y: number } }> = [];
        if (row.lead === 'tie') {
          const half = CHIP_W / 2;
          const leftHalf = el('g');
          leftHalf.appendChild(
            el('rect', {
              x: -half / 2,
              y: -CHIP_H / 2,
              width: half,
              height: CHIP_H,
              rx: 4,
              fill: INSERTION_COLOR,
            }),
          );
          const rightHalf = el('g');
          rightHalf.appendChild(
            el('rect', {
              x: -half / 2,
              y: -CHIP_H / 2,
              width: half,
              height: CHIP_H,
              rx: 4,
              fill: MERGE_COLOR,
            }),
          );
          flights.push({ node: leftHalf, from: panCenter(-1) });
          flights.push({ node: rightHalf, from: panCenter(1) });
        } else {
          const side: -1 | 1 = row.lead === 'insertion' ? -1 : 1;
          flights.push({ node: chipBody(row.n, row.lead, CHIP_W), from: panCenter(side) });
        }
        for (const f of flights) {
          f.node.setAttribute('transform', `translate(${f.from.x}, ${f.from.y})`);
          flightLayer.appendChild(f.node);
        }
        await tween(FLY_MS, (p) => {
          const e = easeInOut(p);
          flights.forEach((f, i) => {
            const offset = row.lead === 'tie' ? (i === 0 ? -CHIP_W / 4 : CHIP_W / 4) * e : 0;
            const x = f.from.x + (target.x - f.from.x) * e + offset;
            const y = f.from.y + (target.y - f.from.y) * e;
            f.node.setAttribute('transform', `translate(${x}, ${y})`);
          });
        });
        flightLayer.textContent = '';

        const settled = chipBody(row.n, row.lead, CHIP_W);
        settled.setAttribute('transform', `translate(${target.x}, ${target.y})`);
        chipLayer.appendChild(settled);
      },

      async markThreshold(n: number, index: number): Promise<void> {
        setCaption(
          t('caption.threshold', 'The lead flips at exactly n = {n}: insertion owns the left, merge owns the right.', {
            n,
          }),
        );
        const x = slotCenter(index);

        const leftTint = el('rect', {
          x: RAIL_LEFT,
          y: REGION_TOP,
          width: 0,
          height: REGION_H,
          rx: 6,
          fill: hexToRgba(INSERTION_COLOR, 0.16),
        });
        const rightTint = el('rect', {
          x,
          y: REGION_TOP,
          width: 0,
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
          y2: REGION_TOP - 4,
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
          opacity: 0,
        });
        leftLabel.textContent = t('label.insertion', 'Insertion sort');
        const rightLabel = el('text', {
          x: (x + RAIL_RIGHT) / 2,
          y: REGION_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
          opacity: 0,
        });
        rightLabel.textContent = t('label.merge', 'Merge sort');
        noteLayer.appendChild(leftLabel);
        noteLayer.appendChild(rightLabel);

        // 선이 위에서 내려 그어지고, 그 자리를 기준으로 좌우가 갈라진다.
        await tween(SPLIT_MS, (p) => {
          const e = easeInOut(p);
          line.setAttribute('y2', String(REGION_TOP - 4 + (REGION_H + 12) * e));
          leftTint.setAttribute('width', String((x - RAIL_LEFT) * e));
          rightTint.setAttribute('width', String((RAIL_RIGHT - x) * e));
          const lift = (1 - e) * 8;
          leftLabel.setAttribute('transform', `translate(0, ${lift})`);
          rightLabel.setAttribute('transform', `translate(0, ${lift})`);
          leftLabel.setAttribute('opacity', String(e));
          rightLabel.setAttribute('opacity', String(e));
        });
      },

      async showRule(n: number, index: number): Promise<void> {
        void n;
        setCaption(
          t('caption.rule', 'This is why real sort libraries hand short runs to insertion sort.'),
        );
        const x = slotCenter(index);

        const bracket = el('path', {
          d: `M ${x} ${BRACKET_Y - 5} V ${BRACKET_Y} H ${x} V ${BRACKET_Y - 5}`,
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
          opacity: 0,
        });
        badge.textContent = t('label.library', 'libraries sort short runs here');
        noteLayer.appendChild(bracket);
        noteLayer.appendChild(badge);

        // 괄호가 교차점에서 왼쪽으로 뻗고, 문구가 그것을 따라 들어온다.
        await tween(RULE_MS, (p) => {
          const e = easeOut(p);
          const left = x - (x - RAIL_LEFT) * e;
          bracket.setAttribute(
            'd',
            `M ${left} ${BRACKET_Y - 5} V ${BRACKET_Y} H ${x} V ${BRACKET_Y - 5}`,
          );
          badge.setAttribute('transform', `translate(${(1 - e) * 24}, 0)`);
          badge.setAttribute('opacity', String(e));
        });
      },

      rewind(): void {
        clearBoard();
        railLayer.textContent = '';
        railLayer.appendChild(rail);
        rail.setAttribute('x2', String(RAIL_RIGHT));
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
