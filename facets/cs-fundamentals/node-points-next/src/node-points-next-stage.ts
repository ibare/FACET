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
 * 색은 design-tokens 만 쓴다 (S-view). 주소 계열은 accent, 값과 구조는
 * structural, 끝(null) 은 textMuted.
 */

import { PIECE_CANVAS_W, fonts, fontSizes, getColors } from '@ffacet/core/runtime';
import type { Palette, View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

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

export type NodePointsNextStageNode = {
  addr: string;
  value: number;
  next: string | null;
};

export type NodePointsNextStageInit = {
  /** 논리 순서 (head 부터) 로 적힌 노드들. 화면 배치는 주소 순으로 다시 세운다. */
  nodes: NodePointsNextStageNode[];
  head: string;
  nodeBytes: number;
  valueBytes: number;
  addressBytes: number;
  /**
   * 화면에 쓸 문안. 키 조회는 projector 가 `runtime.t` 로 끝내고 (C10) 이
   * stage 는 해석된 문자열만 받는다.
   *
   * View 가 `params.t` 로 직접 조회하지 않는 이유는 하나다 — 러너는 조회기를
   * 넘기지만 `layout-builder.ts::mountBlocks` 가 mountParams 를 다시 조립하며
   * `t` 를 떨어뜨린다. 그래서 view 안에서는 `makeTranslator(locale)` 로 떨어져
   * `FacetJson.messages` 의 저작자 문안을 보지 못한다. 캡션과 각주가 서로 다른
   * 경로로 들어오면 한 화면에 두 언어가 섞이므로, 문안 출처를 projector 하나로
   * 모았다. 러너 쪽이 고쳐지면 이 필드들은 지워도 된다.
   */
  orderLabel: string;
};

type Placed = NodePointsNextStageNode & { x: number; group: SVGGElement };

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

/** de Casteljau — 0..t 구간만 잘라낸 부분 곡선의 제어점들. */
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

export const nodePointsNextStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    const frames = new Set<number>();

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.display = 'block';
    svg.style.maxWidth = `${W}px`;
    svg.style.margin = '0 auto';
    container.appendChild(svg);

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

    function put(parent: Element, content: string, x: number, y: number, ink: Ink = {}): SVGTextElement {
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

    function animate(duration: number, tick: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (!destroyed) tick(1);
          resolve();
          return;
        }
        let start = -1;
        const frame = (now: number): void => {
          if (destroyed) {
            resolve();
            return;
          }
          if (start < 0) start = now;
          const p = clamp01((now - start) / duration);
          tick(p);
          if (p < 1) {
            const id = requestAnimationFrame(frame);
            frames.add(id);
          } else {
            resolve();
          }
        };
        const id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    // ── 레이어. 뒤에 붙는 것이 위에 그려진다. ──────────────────────────
    const gAxis = el(svg, 'g', {});
    const gOrder = el(svg, 'g', {});
    const gNodes = el(svg, 'g', {});
    const gArcs = el(svg, 'g', {});
    const gFly = el(svg, 'g', {});
    const gWords = el(svg, 'g', {});

    const captionText = put(gWords, '', W / 2, CAPTION_Y, { size: fontSizes.md });

    let spec: NodePointsNextStageInit | null = null;
    let placed: Placed[] = [];
    let slots: SVGRectElement[] = [];
    let slotCount = 0;

    function nodeAt(addr: string): Placed | undefined {
      return placed.find((n) => n.addr === addr);
    }

    function slotCenterX(index: number): number {
      const total = slotCount * SLOT_W + (slotCount - 1) * SLOT_GAP;
      return W / 2 - total / 2 + index * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
    }

    /** 값 칸의 폭. 바이트 수 비율 그대로 나눈다. */
    function valueWidth(): number {
      return spec && spec.nodeBytes > 0 ? (NODE_W * spec.valueBytes) / spec.nodeBytes : NODE_W / 2;
    }

    /** 주소가 가리키는 곳 — 노드의 첫 바이트, 곧 값 칸의 머리다. */
    function landingX(node: Placed): number {
      return node.x + valueWidth() / 2;
    }

    /**
     * 주소가 칸에서 떠오르는 자리. 칸 한가운데로 잡으면 솟는 선이 `next` 라벨을
     * 관통하므로 칸 안에서 오른쪽으로 치우쳐 세운다.
     */
    function liftX(node: Placed): number {
      const valueW = valueWidth();
      return node.x + valueW + (NODE_W - valueW) * 0.78;
    }

    /** 화살촉 하나 — 아래를 향해 상자 머리에 꽂힌다. */
    function arrowHead(parent: Element, x: number, fill: string): void {
      el(parent, 'path', {
        d: `M ${x - 6} ${ARROW_BASE_Y} L ${x + 6} ${ARROW_BASE_Y} L ${x} ${ARROW_TIP_Y} Z`,
        fill,
      });
    }

    /** 떠다니는 주소·값 칩. 중심 좌표로 옮긴다. */
    function chip(
      parent: Element,
      label: string,
      width: number,
      stroke: string,
      fill: string,
    ): { g: SVGGElement; moveTo: (p: Pt) => void } {
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

    // ── 무대 세우기 ────────────────────────────────────────────────────
    function build(init: NodePointsNextStageInit): void {
      spec = init;
      clear(gAxis);
      clear(gOrder);
      clear(gNodes);
      clear(gArcs);
      clear(gFly);
      captionText.textContent = '';
      placed = [];
      slots = [];
      slotCount = init.nodes.length;

      const order = [...init.nodes].sort((a, b) => addrNum(a.addr) - addrNum(b.addr));
      const gaps: number[] = [];
      for (let i = 0; i < order.length - 1; i += 1) {
        const here = order[i];
        const there = order[i + 1];
        if (!here || !there) continue;
        gaps.push(Math.max(0, addrNum(there.addr) - (addrNum(here.addr) + init.nodeBytes)));
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
        cursor += NODE_W + (gapSum > 0 ? (freeW * gapBytes) / gapSum : freeW / Math.max(1, order.length - 1));

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
        const valueW = init.nodeBytes > 0 ? (NODE_W * init.valueBytes) / init.nodeBytes : NODE_W / 2;
        el(g, 'rect', {
          x: 0,
          y: 0,
          width: valueW,
          height: NODE_H,
          rx: 6,
          fill: c.bgSubtle,
        });
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

        placed.push({ ...n, x, group: g });
      });

      // 순서 레인 — 가리킨 차례대로 값이 내려앉는 자리.
      put(gOrder, init.orderLabel, slotCenterX(0) - SLOT_W / 2 - 14, SLOT_Y + 21, {
        anchor: 'end',
        size: fontSizes.sm,
        fill: c.textMuted,
      });
      for (let i = 0; i < order.length; i += 1) {
        const cx = slotCenterX(i);
        const rect = el(gOrder, 'rect', {
          x: cx - SLOT_W / 2,
          y: SLOT_Y,
          width: SLOT_W,
          height: SLOT_H,
          rx: 6,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        });
        slots.push(rect);
        if (i < order.length - 1) {
          put(gOrder, MARK_FLOW, cx + SLOT_W / 2 + SLOT_GAP / 2, SLOT_Y + 21, {
            size: fontSizes.sm,
            fill: c.textMuted,
          });
        }
      }

    }

    // ── 걸음 ──────────────────────────────────────────────────────────
    async function placeNodes(): Promise<void> {
      const n = placed.length;
      const span = 1 - 0.16 * Math.max(0, n - 1);
      await animate(PLACE_MS, (p) => {
        placed.forEach((node, i) => {
          const local = easeOut(clamp01((p - 0.16 * i) / span));
          node.group.setAttribute('opacity', String(local));
          node.group.setAttribute(
            'transform',
            `translate(${node.x} ${(NODE_Y - 46 * (1 - local)).toFixed(2)})`,
          );
        });
      });
    }

    async function attachHead(addr: string): Promise<void> {
      const target = nodeAt(addr);
      if (!target) return;
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
      put(g, addr, 0, 12, { mono: true, size: fontSizes.sm });

      const from = -70;
      await animate(HEAD_SLIDE_MS, (p) => {
        const x = from + (cx - from) * easeOut(p);
        g.setAttribute('transform', `translate(${x.toFixed(2)} ${HEAD_Y})`);
      });

      const stem = el(gArcs, 'line', {
        x1: cx,
        y1: HEAD_Y + 18,
        x2: cx,
        y2: HEAD_Y + 18,
        stroke: c.accent,
        'stroke-width': 2.5,
      });
      await animate(HEAD_DROP_MS, (p) => {
        const y = HEAD_Y + 18 + (ARROW_BASE_Y - HEAD_Y - 18) * easeOut(p);
        stem.setAttribute('y2', y.toFixed(2));
      });
      arrowHead(gArcs, cx, c.accent);
    }

    async function followPointer(from: string, to: string): Promise<void> {
      const src = nodeAt(from);
      const dst = nodeAt(to);
      if (!src || !dst) return;

      const p0 = { x: liftX(src), y: CELL_MID_Y };
      const p1 = { x: landingX(dst), y: ARROW_BASE_Y };
      const arc = arcOf(p0, p1, p1.x > p0.x ? ARC_APEX_FORWARD : ARC_APEX_BACKWARD);

      const path = el(gArcs, 'path', {
        d: '',
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      });
      const flying = chip(gFly, dst.addr, 68, c.accent, c.bg);
      flying.moveTo(p0);

      await animate(FLY_MS, (p) => {
        const cut = arcSplit(arc, easeOut(p));
        path.setAttribute('d', cut.d);
        flying.moveTo(cut.end);
      });
      gFly.removeChild(flying.g);
      arrowHead(gArcs, p1.x, c.accent);
    }

    async function endWithNull(addr: string): Promise<void> {
      const src = nodeAt(addr);
      if (!src) return;
      const startX = liftX(src);
      // 위로 띄우면 다른 호와 겹친다. 옆 빈 자리로 나가려다 벽에 막히는 쪽이
      // 뜻도 맞다 — 갈 곳이 없다.
      const neighbour = placed.find((n) => n.x > src.x);
      const limit = (neighbour ? neighbour.x : W) - 44;
      const restX = Math.min(src.x + NODE_W + 28, limit);
      const wallX = restX + 28;

      const wall = el(gArcs, 'line', {
        x1: wallX,
        y1: CELL_MID_Y - 16,
        x2: wallX,
        y2: CELL_MID_Y + 16,
        stroke: c.textMuted,
        'stroke-width': 3,
        'stroke-linecap': 'round',
        opacity: 0,
      });
      const leaving = chip(gFly, MARK_NULL, 44, c.textMuted, c.bg);
      leaving.moveTo({ x: startX, y: CELL_MID_Y });

      await animate(NULL_SLIDE_MS, (p) => {
        const t = easeOut(p);
        leaving.moveTo({ x: startX + (restX - startX) * t, y: CELL_MID_Y });
        wall.setAttribute('opacity', String(clamp01((t - 0.45) / 0.55)));
      });
    }

    async function collectValue(addr: string, slot: number, value: number): Promise<void> {
      const src = nodeAt(addr);
      const target = slots[slot];
      if (!src || !target) return;
      const p0 = { x: src.x + valueWidth() / 2, y: CELL_MID_Y };
      const p1 = { x: slotCenterX(slot), y: SLOT_Y + SLOT_H / 2 };
      const cp = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 + 26 };

      const moving = chip(gFly, String(value), SLOT_W, c.accent, c.bg);
      moving.moveTo(p0);
      await animate(COLLECT_MS, (p) => {
        moving.moveTo(quadAt(p0, cp, p1, easeOut(p)));
      });
      gFly.removeChild(moving.g);

      target.setAttribute('stroke', c.accent);
      target.setAttribute('stroke-dasharray', '');
      target.setAttribute('fill', c.bgSubtle);
      put(gOrder, String(value), p1.x, p1.y + 6, { mono: true, size: fontSizes.md });
    }

    async function seal(): Promise<void> {
      if (slots.length === 0) return;
      const x0 = slotCenterX(0) - SLOT_W / 2;
      const x1 = slotCenterX(slotCount - 1) + SLOT_W / 2;
      const line = el(gOrder, 'line', {
        x1: x0,
        y1: SEAL_Y,
        x2: x0,
        y2: SEAL_Y,
        stroke: c.accent,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      });
      await animate(SEAL_MS, (p) => {
        line.setAttribute('x2', (x0 + (x1 - x0) * easeOut(p)).toFixed(2));
      });
    }

    return {
      init(data: NodePointsNextStageInit): void {
        build(data);
      },
      rewind(): void {
        if (spec) build(spec);
      },
      setCaption(textContent: string): void {
        captionText.textContent = textContent;
      },
      placeNodes,
      attachHead,
      followPointer,
      endWithNull,
      collectValue,
      seal,
      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  },
};
