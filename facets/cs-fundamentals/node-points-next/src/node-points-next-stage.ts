/**
 * node-points-next-stage — 조각 전용 stage view.
 *
 * 화면의 골격은 동사 "가리킨다" 에서 나왔다.
 *
 *   가로축은 **메모리 주소**다. 노드는 주소 순서대로 축 위에 놓이되 서로
 *   떨어져 있고, 사이의 빈 자리는 실제 바이트 간격의 비를 지킨다. 그래서
 *   "흩어져 있다" 는 배치 자체로 보인다.
 *
 *   노드 상자는 8바이트를 두 칸으로 나눈 것이다 — 왼쪽은 값, 오른쪽은 다음
 *   노드의 주소. 칸 폭도 바이트 수 비율로 나눈다.
 *
 *   가리키는 일은 **위치가 변하는 운동**으로 그린다. next 칸에 적힌 주소의
 *   복제본이 칸에서 떠올라 호를 그리며 날아가, 그 주소가 가리키는 상자의
 *   머리에 화살로 내려앉는다. 원본은 칸에 남는다. 두 번째 호는 오른쪽에서
 *   왼쪽으로 되돌아가므로, 메모리 순서와 논리 순서가 다르다는 것이 선의
 *   방향만으로 드러난다.
 *
 *   마지막 노드가 쥔 것은 null 이다. 그 칩은 옆 빈 자리로 나가려다 벽에
 *   막힌다 — 갈 곳이 없다는 것도 운동으로 말한다.
 *
 *   마지막 걸음에서 값들이 가리킨 차례대로 아래 순서 레인으로 내려간다.
 *   레인의 왼쪽부터 12 · 5 · 8 이 되는데, 메모리에 놓인 차례는 12 · 8 · 5 다.
 *   내려가는 경로가 서로 엇갈리는 것이 그 어긋남이다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`placeNodes()` · `attachHead()` · `followPointer()` …) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면
 * 처음부터 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가
 * **그 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은
 * 길이다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에
 * 서 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그 장면을
 * 다시 한 번 통째로 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도
 * 다르면 되짚기 판정이 어긋나기 때문이다.
 *
 * 색은 design-tokens 만 쓴다 (S-view). 주소 계열은 accent, 값과 구조는
 * structural, 끝(null) 은 textMuted. 문안은 `params.t` 로만 짓는다 (C10) — 이
 * 파일의 en 원본은 조회가 빗나갔을 때의 되받이이고, 칸 안의 숫자와 주소 표기는
 * 데이터 그대로다.
 */

import { PIECE_CANVAS_W, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type {
  Palette,
  CanvasView,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import type { NodePointsNextCaption, NodePointsNextScene } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

// ── 좌표계 ────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 318;
const LANE_X0 = 44;
const LANE_X1 = 596;
const NODE_W = 132;
const NODE_H = 52;
const NODE_Y = 116;
const RULER_Y = 186;
const ADDR_Y = 201;
const SLOT_W = 46;
const SLOT_H = 30;
const SLOT_GAP = 18;
const SLOT_Y = 222;
const HEAD_Y = 30;
const SEAL_Y = 262;
const CAPTION_Y = 282;
const ARROW_TIP_Y = NODE_Y - 2;
const ARROW_BASE_Y = NODE_Y - 12;
const CELL_MID_Y = NODE_Y + 26;

/** 상자가 내려앉기 전 떠 있는 높이. 정적으로는 이 몫이 0 이다. */
const DROP_DY = 46;
/** head 칩이 미끄러져 들어오기 전 서 있는 자리 — 화면 왼쪽 밖. */
const HEAD_FROM_X = -70;

// 호의 마루 높이. 앞으로 가는 호는 높이, 되돌아가는 호는 낮게 건다 — 둘이
// 같은 높이로 걸리면 겹쳐서 어느 쪽이 어디로 가는지 읽히지 않는다.
const ARC_APEX_FORWARD = 10;
const ARC_APEX_BACKWARD = 62;

// ── 걸음별 운동 시간 (ms) ─────────────────────────────────────────────
const PLACE_MS = 620;
const HEAD_SLIDE_MS = 440;
const HEAD_DROP_MS = 220;
const FLY_MS = 680;
const NULL_SLIDE_MS = 400;
const COLLECT_MS = 540;
const SEAL_MS = 360;

/**
 * 도형에 각인된 표식 — 번역하지 않는다 (C10 표식 판정 1·2·3).
 * `head` / `null` 은 이 분야에서 원어 그대로 쓰는 말이고, `value` / `next` 는
 * 상자에 새겨진 칸 이름이며, `B` 는 단위 기호다.
 */
const MARK_HEAD = 'head';
const MARK_VALUE = 'value';
const MARK_NEXT = 'next';
const MARK_NULL = 'null';
const MARK_BYTE = 'B';
const MARK_FLOW = '→';

/**
 * 배치가 정해진 노드 하나. 자리는 장면이 아니라 여기서 셈한 것이다.
 *
 * 값과 next 는 상자 안에 이미 그려져 있으므로 들고 있지 않는다 — 걸음이 필요로
 * 하는 것은 주소로 찾는 길과 그 자리뿐이다.
 */
type Placed = { addr: string; x: number; group: SVGGElement };

/** '0x0100' 을 수로. 16진 접두가 없어도 16진으로 읽는다. */
function addrNum(addr: string): number {
  const n = Number.parseInt(addr.replace(/^0x/i, ''), 16);
  return Number.isNaN(n) ? 0 : n;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

type Pt = { x: number; y: number };

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadAt(p0: Pt, cp: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  };
}

/** 제어점을 출발·도착 바로 위에 두는 3차 곡선. 칸에서 수직으로 떠서 수직으로 내린다. */
type Arc = { p0: Pt; c1: Pt; c2: Pt; p1: Pt };

function arcOf(p0: Pt, p1: Pt, apexY: number): Arc {
  return { p0, c1: { x: p0.x, y: apexY }, c2: { x: p1.x, y: apexY }, p1 };
}

/**
 * de Casteljau — 0..t 구간만 잘라낸 부분 곡선의 제어점들.
 *
 * `t === 1` 이면 원래 곡선 그대로가 나오므로 정적 그리기도 이 함수를 쓴다. 그래야
 * 흐르며 선 선과 곧바로 세운 선의 `d` 문자열이 한 글자도 갈리지 않는다.
 */
function arcSplit(a: Arc, t: number): { d: string; end: Pt } {
  const l1 = lerp(a.p0, a.c1, t);
  const l2 = lerp(a.c1, a.c2, t);
  const l3 = lerp(a.c2, a.p1, t);
  const m1 = lerp(l1, l2, t);
  const m2 = lerp(l2, l3, t);
  const end = lerp(m1, m2, t);
  const n = (v: number): string => v.toFixed(2);
  return {
    d: `M ${n(a.p0.x)} ${n(a.p0.y)} C ${n(l1.x)} ${n(l1.y)} ${n(m1.x)} ${n(m1.y)} ${n(end.x)} ${n(end.y)}`,
    end,
  };
}

/** 바탕이 달라졌나 — 달라졌을 때만 배치를 다시 짓는다. */
function baseKey(s: NodePointsNextScene): string {
  return JSON.stringify([s.nodes, s.head, s.nodeBytes, s.valueBytes, s.addressBytes]);
}

function linkKey(from: string, to: string): string {
  return `${from}>${to}`;
}

export const nodePointsNextStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const svg = params.canvas;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 이 조각의 운동은 rAF 로 프레임마다 좌표를 제자리에서 고쳐 쓰는 짜임이라,
     * 되짚기가 화면을 새로 세운 뒤에도 앞 걸음의 프레임이 살아 있으면 새 자리에
     * 옛 좌표를 덮어쓴다 — 되짚은 직후가 아니라 반 초쯤 뒤에 무너지므로 눈으로도
     * 늦게야 잡힌다. 걸음 함수는 깨어날 때마다 자기 세대가 아직 유효한지 보고,
     * 아니면 **화면에 손대지 않고** 물러난다.
     */
    let gen = 0;

    /** 내 세대가 아직 유효한가. */
    function alive(myGen: number): boolean {
      return !destroyed && myGen === gen;
    }

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * scene 경로에서는 러너가 이것을 부르지 않을 수도 있으므로 지연 발화를 막는
     * 빗장으로 믿지 않는다 — 실효 있는 것은 `opts.animate` 검사와 위의 세대
     * 빗장이다. 여기 두는 것은 무해하고 한 겹 더 거를 뿐이다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    type Ink = {
      anchor?: 'start' | 'middle' | 'end';
      size?: string;
      fill?: string;
      mono?: boolean;
    };

    function put(
      parent: Element,
      content: string,
      x: number,
      y: number,
      ink: Ink = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'text-anchor': ink.anchor ?? 'middle',
        'font-family': ink.mono ? fonts.mono : fonts.body,
        'font-size': ink.size ?? fontSizes.sm,
        fill: ink.fill ?? c.text,
      });
      node.textContent = content;
      return node;
    }

    function clear(g: Element): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     * 세대가 지났거나 되짚는 중이면 아무것도 그리지 않고 물러난다 — 끝 자리는
     * 정적 그리기가 이미 세웠거나 새 세대가 곧 세운다.
     */
    function animate(myGen: number, ms: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || isInstant() || typeof requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (!alive(myGen)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        draw(0);
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    // ── 레이어. 뒤에 붙는 것이 위에 그려진다. ──────────────────────────
    const gAxis = el(svg, 'g', {});
    const gLane = el(svg, 'g', {});
    const gMarks = el(svg, 'g', {});
    const gNodes = el(svg, 'g', {});
    const gArcs = el(svg, 'g', {});
    const gFly = el(svg, 'g', {});
    const gWords = el(svg, 'g', {});

    const captionText = put(gWords, '', W / 2, CAPTION_Y, { size: fontSizes.md });

    // ── 배치 밑감. 바탕이 바뀔 때만 다시 짓는다. ───────────────────────
    let builtKey: string | null = null;
    let boxes: Placed[] = [];
    let slots: SVGRectElement[] = [];
    let slotCount = 0;
    let valueW = NODE_W / 2;

    // ── 지금 세워 둔 지나가지 않는 표식들. 걸음 함수가 물렸다 되돌린다. ──
    let headParts: { chip: Chip; stem: SVGLineElement; arrow: SVGPathElement } | null = null;
    const linkParts = new Map<string, { path: SVGPathElement; arrow: SVGPathElement; arc: Arc }>();
    let nullParts: { chip: Chip; wall: SVGLineElement; fromX: number; restX: number } | null = null;
    const slotMarks = new Map<number, SVGTextElement>();
    let sealLine: SVGLineElement | null = null;

    function boxAt(addr: string): Placed | undefined {
      return boxes.find((n) => n.addr === addr);
    }

    function slotCenterX(index: number): number {
      const total = slotCount * SLOT_W + (slotCount - 1) * SLOT_GAP;
      return W / 2 - total / 2 + index * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
    }

    /** 주소가 가리키는 곳 — 노드의 첫 바이트, 곧 값 칸의 머리다. */
    function landingX(node: Placed): number {
      return node.x + valueW / 2;
    }

    /**
     * 주소가 칸에서 떠오르는 자리. 칸 한가운데로 잡으면 솟는 선이 `next` 라벨을
     * 관통하므로 칸 안에서 오른쪽으로 치우쳐 세운다.
     */
    function liftX(node: Placed): number {
      return node.x + valueW + (NODE_W - valueW) * 0.78;
    }

    /** 화살촉 하나 — 아래를 향해 상자 머리에 꽂힌다. */
    function arrowHead(parent: Element, x: number, fill: string): SVGPathElement {
      return el(parent, 'path', {
        d: `M ${x - 6} ${ARROW_BASE_Y} L ${x + 6} ${ARROW_BASE_Y} L ${x} ${ARROW_TIP_Y} Z`,
        fill,
      });
    }

    /** 떠다니는 주소·값 칩. 중심 좌표로 옮긴다. */
    type Chip = { g: SVGGElement; moveTo: (p: Pt) => void };

    function chip(
      parent: Element,
      label: string,
      width: number,
      stroke: string,
      fill: string,
    ): Chip {
      const g = el(parent, 'g', {});
      el(g, 'rect', {
        x: -width / 2,
        y: -13,
        width,
        height: 26,
        rx: 7,
        fill,
        stroke,
        'stroke-width': 1.6,
      });
      put(g, label, 0, 5, { mono: true, size: fontSizes.sm });
      return {
        g,
        moveTo: (p) => g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`),
      };
    }

    // ── 문안 ──────────────────────────────────────────────────────────
    //
    // en 원본은 호출부 리터럴로 남아야 추출기가 본다 (C10). 그래서 키를 그대로
    // 넘기지 않고 갈래마다 한 줄씩 편다.
    function captionOf(caption: NodePointsNextCaption | null): string {
      if (!caption) return '';
      switch (caption.kind) {
        case 'scattered':
          return tr(
            'caption.scattered',
            'Three nodes lie apart in memory. Their places say nothing about which comes first.',
          );
        case 'holdsAddress':
          return tr(
            'caption.holdsAddress',
            'Beside its value every node holds one more thing — the address of the next node.',
          );
        case 'orderExists':
          return tr(
            'caption.orderExists',
            'Follow the held addresses and an order appears: 12, 5, 8 — not the order they lie in.',
          );
      }
    }

    // ── 배치 세우기. 바탕만으로 정해지는 것들. ─────────────────────────
    function build(s: NodePointsNextScene): void {
      clear(gAxis);
      clear(gLane);
      clear(gMarks);
      clear(gNodes);
      clear(gArcs);
      clear(gFly);
      boxes = [];
      slots = [];
      slotCount = s.nodes.length;
      valueW = s.nodeBytes > 0 ? (NODE_W * s.valueBytes) / s.nodeBytes : NODE_W / 2;

      const order = [...s.nodes].sort((a, b) => addrNum(a.addr) - addrNum(b.addr));
      const gaps: number[] = [];
      for (let i = 0; i < order.length - 1; i += 1) {
        const here = order[i];
        const there = order[i + 1];
        if (!here || !there) continue;
        gaps.push(Math.max(0, addrNum(there.addr) - (addrNum(here.addr) + s.nodeBytes)));
      }
      const gapSum = gaps.reduce((a, b) => a + b, 0);
      const freeW = Math.max(0, LANE_X1 - LANE_X0 - order.length * NODE_W);

      // 주소 축. 칸은 실제 비율보다 크게 그리지만, 칸 사이 빈 자리는 실제
      // 바이트 간격의 비를 지킨다 — 각주가 이 전제를 말한다.
      el(gAxis, 'line', {
        x1: LANE_X0 - 22,
        y1: RULER_Y,
        x2: LANE_X1 + 14,
        y2: RULER_Y,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      el(gAxis, 'path', {
        d: `M ${LANE_X1 + 14} ${RULER_Y - 4} L ${LANE_X1 + 22} ${RULER_Y} L ${LANE_X1 + 14} ${RULER_Y + 4} Z`,
        fill: c.border,
      });

      let cursor = LANE_X0;
      order.forEach((n, i) => {
        const x = cursor;
        const gapBytes = gaps[i] ?? 0;
        cursor +=
          NODE_W +
          (gapSum > 0 ? (freeW * gapBytes) / gapSum : freeW / Math.max(1, order.length - 1));

        // 축 위의 자리 표시.
        el(gAxis, 'line', {
          x1: x,
          y1: RULER_Y - 5,
          x2: x,
          y2: RULER_Y + 5,
          stroke: c.textMuted,
          'stroke-width': 1.5,
        });
        el(gAxis, 'line', {
          x1: x,
          y1: NODE_Y + NODE_H,
          x2: x,
          y2: RULER_Y - 5,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        put(gAxis, n.addr, x, ADDR_Y, {
          anchor: 'start',
          mono: true,
          size: fontSizes.xs,
          fill: c.textMuted,
        });

        if (i < order.length - 1) {
          const gapMid = (x + NODE_W + cursor) / 2;
          put(gAxis, `${gapBytes} ${MARK_BYTE}`, gapMid, ADDR_Y, {
            mono: true,
            size: fontSizes.xs,
            fill: c.textMuted,
          });
        }

        // 노드 상자 — 8바이트를 값 칸과 주소 칸으로 나눈 것.
        const g = el(gNodes, 'g', { transform: `translate(${x} ${NODE_Y})`, opacity: 0 });
        el(g, 'rect', { x: 0, y: 0, width: valueW, height: NODE_H, rx: 6, fill: c.bgSubtle });
        el(g, 'rect', {
          x: valueW,
          y: 0,
          width: NODE_W - valueW,
          height: NODE_H,
          rx: 6,
          fill: c.bg,
        });
        el(g, 'rect', {
          x: 0,
          y: 0,
          width: NODE_W,
          height: NODE_H,
          rx: 6,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.5,
        });
        el(g, 'line', {
          x1: valueW,
          y1: 0,
          x2: valueW,
          y2: NODE_H,
          stroke: c.border,
          'stroke-width': 1,
        });
        put(g, MARK_VALUE, valueW / 2, 16, { size: fontSizes.xs, fill: c.textMuted });
        put(g, MARK_NEXT, (valueW + NODE_W) / 2, 16, { size: fontSizes.xs, fill: c.textMuted });
        put(g, String(n.value), valueW / 2, 41, { mono: true, size: fontSizes.lg });
        put(g, n.next ?? MARK_NULL, (valueW + NODE_W) / 2, 41, {
          mono: true,
          size: fontSizes.md,
          fill: n.next ? c.text : c.textMuted,
        });
        if (n.next) {
          // 쥐고 있는 것이 주소라는 표시 — 밑줄 하나로 족하다.
          el(g, 'line', {
            x1: valueW + 12,
            y1: 47,
            x2: NODE_W - 12,
            y2: 47,
            stroke: c.accent,
            'stroke-width': 2.5,
          });
        }

        boxes.push({ addr: n.addr, x, group: g });
      });

      // 순서 레인 — 가리킨 차례대로 값이 내려앉는 자리.
      put(gLane, tr('label.order', 'order'), slotCenterX(0) - SLOT_W / 2 - 14, SLOT_Y + 21, {
        anchor: 'end',
        size: fontSizes.sm,
        fill: c.textMuted,
      });
      for (let i = 0; i < order.length; i += 1) {
        const cx = slotCenterX(i);
        slots.push(
          el(gLane, 'rect', {
            x: cx - SLOT_W / 2,
            y: SLOT_Y,
            width: SLOT_W,
            height: SLOT_H,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
        if (i < order.length - 1) {
          put(gLane, MARK_FLOW, cx + SLOT_W / 2 + SLOT_GAP / 2, SLOT_Y + 21, {
            size: fontSizes.sm,
            fill: c.textMuted,
          });
        }
      }

      builtKey = baseKey(s);
    }

    /** 빈 칸의 모습. 채워진 칸과 속성을 하나씩 짝지어 되돌린다. */
    function emptySlot(rect: SVGRectElement): void {
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', c.border);
      rect.setAttribute('stroke-dasharray', '4 4');
    }

    /** 값이 앉은 칸의 모습. */
    function filledSlot(rect: SVGRectElement): void {
      rect.setAttribute('fill', c.bgSubtle);
      rect.setAttribute('stroke', c.accent);
      rect.setAttribute('stroke-dasharray', '');
    }

    /**
     * 장면 하나를 통째로 세운다 — 상자도 화살표도 칩도 캡션도.
     *
     * 지나가지 않는 표식들은 매번 지우고 새로 만든다. 그래야 흐르며 남은 속성
     * 하나가 곧바로 세운 화면과의 차이가 되는 일이 없다 (프로토콜 4절).
     */
    function settle(s: NodePointsNextScene): void {
      if (builtKey !== baseKey(s)) build(s);

      clear(gArcs);
      clear(gFly);
      clear(gMarks);
      headParts = null;
      linkParts.clear();
      nullParts = null;
      slotMarks.clear();
      sealLine = null;

      // 상자 — 내려앉았으면 제자리에, 아니면 떠 있는 채 보이지 않는다.
      for (const box of boxes) {
        box.group.setAttribute('opacity', s.placed ? '1' : '0');
        box.group.setAttribute(
          'transform',
          `translate(${box.x} ${s.placed ? NODE_Y : NODE_Y - DROP_DY})`,
        );
      }

      // head 가 쥔 주소와 그것이 꽂힌 화살.
      if (s.headAt !== null) {
        const target = boxAt(s.headAt);
        if (target) {
          const cx = landingX(target);
          const g = el(gArcs, 'g', {});
          el(g, 'rect', {
            x: -44,
            y: -18,
            width: 88,
            height: 36,
            rx: 8,
            fill: c.bg,
            stroke: c.text,
            'stroke-width': 1.5,
          });
          put(g, MARK_HEAD, 0, -3, { size: fontSizes.xs, fill: c.textMuted });
          put(g, s.headAt, 0, 12, { mono: true, size: fontSizes.sm });
          const headChip: Chip = {
            g,
            moveTo: (p) =>
              g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`),
          };
          headChip.moveTo({ x: cx, y: HEAD_Y });
          const stem = el(gArcs, 'line', {
            x1: cx,
            y1: HEAD_Y + 18,
            x2: cx,
            y2: ARROW_BASE_Y,
            stroke: c.accent,
            'stroke-width': 2.5,
          });
          headParts = { chip: headChip, stem, arrow: arrowHead(gArcs, cx, c.accent) };
        }
      }

      // 그어진 호들. 남는 강조라 정적으로도 그린다.
      for (const link of s.links) {
        const src = boxAt(link.from);
        const dst = boxAt(link.to);
        if (!src || !dst) continue;
        const p0 = { x: liftX(src), y: CELL_MID_Y };
        const p1 = { x: landingX(dst), y: ARROW_BASE_Y };
        const arc = arcOf(p0, p1, p1.x > p0.x ? ARC_APEX_FORWARD : ARC_APEX_BACKWARD);
        const path = el(gArcs, 'path', {
          d: arcSplit(arc, 1).d,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
        linkParts.set(linkKey(link.from, link.to), {
          path,
          arrow: arrowHead(gArcs, p1.x, c.accent),
          arc,
        });
      }

      // 갈 곳이 없다는 것 — 벽 앞에 멎은 null 칩. 이것도 남는다.
      if (s.nullAt !== null) {
        const src = boxAt(s.nullAt);
        if (src) {
          const fromX = liftX(src);
          // 위로 띄우면 다른 호와 겹친다. 옆 빈 자리로 나가려다 벽에 막히는 쪽이
          // 뜻도 맞다 — 갈 곳이 없다.
          const neighbour = boxes.find((n) => n.x > src.x);
          const limit = (neighbour ? neighbour.x : W) - 44;
          const restX = Math.min(src.x + NODE_W + 28, limit);
          const wall = el(gArcs, 'line', {
            x1: restX + 28,
            y1: CELL_MID_Y - 16,
            x2: restX + 28,
            y2: CELL_MID_Y + 16,
            stroke: c.textMuted,
            'stroke-width': 3,
            'stroke-linecap': 'round',
            opacity: 1,
          });
          const leaving = chip(gArcs, MARK_NULL, 44, c.textMuted, c.bg);
          leaving.moveTo({ x: restX, y: CELL_MID_Y });
          nullParts = { chip: leaving, wall, fromX, restX };
        }
      }

      // 순서 레인 — 앉은 값과 빈 칸.
      const filled = new Map(s.collected.map((c2) => [c2.slot, c2] as const));
      slots.forEach((rect, i) => {
        const hit = filled.get(i);
        if (!hit) {
          emptySlot(rect);
          return;
        }
        filledSlot(rect);
        slotMarks.set(
          i,
          put(gMarks, String(hit.value), slotCenterX(i), SLOT_Y + SLOT_H / 2 + 6, {
            mono: true,
            size: fontSizes.md,
          }),
        );
      });

      // 순서가 다 드러났다는 밑줄.
      if (s.sealed && slots.length > 0) {
        const x1 = slotCenterX(slotCount - 1) + SLOT_W / 2;
        sealLine = el(gMarks, 'line', {
          x1: slotCenterX(0) - SLOT_W / 2,
          y1: SEAL_Y,
          x2: x1,
          y2: SEAL_Y,
          stroke: c.accent,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
      }

      captionText.textContent = captionOf(s.caption);
    }

    // ── 운동 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 그러니 운동은 출발
    // 자리로 **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `settle` 직후 아직
    // 어떤 기다림도 지나지 않은 동안 하므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /** 상자들이 차례로 떠서 내려앉는다. */
    async function runPlace(myGen: number): Promise<void> {
      const n = boxes.length;
      if (n === 0) return;
      const span = 1 - 0.16 * Math.max(0, n - 1);
      await animate(myGen, PLACE_MS, (p) => {
        boxes.forEach((box, i) => {
          const local = easeOut(clamp01((p - 0.16 * i) / span));
          box.group.setAttribute('opacity', String(local));
          box.group.setAttribute(
            'transform',
            `translate(${box.x} ${(NODE_Y - DROP_DY * (1 - local)).toFixed(2)})`,
          );
        });
      });
    }

    /** head 가 쥔 주소가 미끄러져 와 상자 머리에 화살을 내린다. */
    async function runHead(myGen: number, addr: string): Promise<void> {
      const parts = headParts;
      const target = boxAt(addr);
      if (!parts || !target) return;
      const cx = landingX(target);

      // 화살은 줄기가 다 내려온 뒤에 꽂힌다. 끝에서 `settle` 이 다시 세운다.
      parts.arrow.remove();
      parts.stem.setAttribute('y2', String(HEAD_Y + 18));
      parts.chip.moveTo({ x: HEAD_FROM_X, y: HEAD_Y });

      await animate(myGen, HEAD_SLIDE_MS, (p) => {
        parts.chip.moveTo({ x: HEAD_FROM_X + (cx - HEAD_FROM_X) * easeOut(p), y: HEAD_Y });
      });
      if (!alive(myGen)) return;
      await animate(myGen, HEAD_DROP_MS, (p) => {
        parts.stem.setAttribute(
          'y2',
          (HEAD_Y + 18 + (ARROW_BASE_Y - HEAD_Y - 18) * easeOut(p)).toFixed(2),
        );
      });
    }

    /** next 칸의 주소가 복제되어 날아가 다음 상자를 가리킨다. */
    async function runLink(myGen: number, from: string, to: string): Promise<void> {
      const parts = linkParts.get(linkKey(from, to));
      if (!parts) return;

      parts.arrow.remove();
      parts.path.setAttribute('d', '');
      const flying = chip(gFly, to, 68, c.accent, c.bg);
      flying.moveTo(parts.arc.p0);

      await animate(myGen, FLY_MS, (p) => {
        const cut = arcSplit(parts.arc, easeOut(p));
        parts.path.setAttribute('d', cut.d);
        flying.moveTo(cut.end);
      });
      flying.g.remove();
    }

    /** null 칩이 옆으로 나가려다 벽에 막힌다. */
    async function runNull(myGen: number): Promise<void> {
      const parts = nullParts;
      if (!parts) return;
      const { fromX, restX } = parts;

      parts.wall.setAttribute('opacity', '0');
      parts.chip.moveTo({ x: fromX, y: CELL_MID_Y });

      await animate(myGen, NULL_SLIDE_MS, (p) => {
        const t = easeOut(p);
        parts.chip.moveTo({ x: fromX + (restX - fromX) * t, y: CELL_MID_Y });
        parts.wall.setAttribute('opacity', String(clamp01((t - 0.45) / 0.55)));
      });
    }

    /** 값이 상자에서 순서 레인의 제 칸으로 내려간다. */
    async function runCollect(
      myGen: number,
      addr: string,
      slot: number,
      value: number,
    ): Promise<void> {
      const src = boxAt(addr);
      const rect = slots[slot];
      if (!src || !rect) return;

      // 앉은 값을 잠시 거둔다 — 칩이 날아와 앉는 것이 이번 걸음이기 때문이다.
      slotMarks.get(slot)?.remove();
      emptySlot(rect);

      const p0 = { x: src.x + valueW / 2, y: CELL_MID_Y };
      const p1 = { x: slotCenterX(slot), y: SLOT_Y + SLOT_H / 2 };
      const cp = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 + 26 };

      const moving = chip(gFly, String(value), SLOT_W, c.accent, c.bg);
      moving.moveTo(p0);
      await animate(myGen, COLLECT_MS, (p) => {
        moving.moveTo(quadAt(p0, cp, p1, easeOut(p)));
      });
      moving.g.remove();
    }

    /** 순서 레인 밑에 밑줄이 그어진다. */
    async function runSeal(myGen: number): Promise<void> {
      const line = sealLine;
      if (!line || slots.length === 0) return;
      const x0 = slotCenterX(0) - SLOT_W / 2;
      const x1 = slotCenterX(slotCount - 1) + SLOT_W / 2;

      line.setAttribute('x2', x0.toFixed(2));
      await animate(myGen, SEAL_MS, (p) => {
        line.setAttribute('x2', (x0 + (x1 - x0) * easeOut(p)).toFixed(2));
      });
    }

    /** 방금 밟은 걸음 하나만 흐르게 한다. */
    async function flow(s: NodePointsNextScene, myGen: number): Promise<void> {
      const step = s.step;
      if (!step) return;
      switch (step.kind) {
        case 'place':
          await runPlace(myGen);
          return;
        case 'head':
          await runHead(myGen, step.addr);
          return;
        case 'link':
          await runLink(myGen, step.from, step.to);
          return;
        case 'null':
          await runNull(myGen);
          return;
        case 'collect':
          await runCollect(myGen, step.addr, step.slot, step.value);
          return;
        case 'seal':
          await runSeal(myGen);
          return;
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 좌표
     * 문자열 하나(`116.00` 과 `116`)가 곧바로 세운 화면과의 차이가 되어 되짚기
     * 판정을 어긋나게 하기 때문이다. 사이에 타이머도 프레임도 없어 같은 그림이
     * 다시 그려질 뿐이다.
     *
     * 돌려주는 Promise 는 장면이 다 선 뒤에 풀린다 — 이것이 바깥이 걸음의 끝을
     * 아는 유일한 통로다 (S-scene).
     */
    async function render(
      next: NodePointsNextScene,
      /** 이 조각은 출발 그림을 장면과 배치에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: NodePointsNextScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      await flow(next, myGen);
      if (alive(myGen)) settle(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  },
};
