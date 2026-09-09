/**
 * queue-vs-stack-order stage — 하나의 출발에서 두 순서가 나란히 자란다.
 *
 * ── 화면이 하려는 말
 *
 * 왼쪽에 그래프가 하나 있다. 그것은 처음부터 끝까지 변하지 않는다 — 이 조각에서
 * 변하는 것은 그릇뿐이라는 말을 화면 구조 자체로 한다. 출발 정점에서 줄기 하나가
 * 오른쪽으로 뻗다가 **두 갈래로 갈린다.** 위 갈래는 앞뒤가 뚫린 통을 지나 곧장
 * 흐르고, 아래 갈래는 위만 뚫린 우물로 내려갔다가 같은 구멍으로 되돌아 나온다.
 * 두 줄기는 같은 자리에서 갈라져 같은 속도로 오른쪽으로 자라며, 방문 순서가
 * 어긋나는 칸에 갈림 표시가 선다.
 *
 * 그래서 운동은 색 전환이 아니라 **자리 이동**이다 (S-piece MUST NOT). 칩은
 * 그래프에서 떠올라 그릇으로 들어가고, 그릇에서 나와 순서 줄에 자리를 잡는다.
 * 통에서는 앞의 것이 빠지면 뒤의 것들이 앞으로 미끄러지고, 우물에서는 맨 위
 * 것만 올라오고 아래는 그대로 있다 — 두 그릇의 차이가 그 움직임에 있다.
 *
 * ── 세로
 *
 * 마운트 뒤 바뀌지 않는다 (S-view). 그래프가 깊어지면 층 간격을 줄여 담고
 * 높이를 늘리지 않는다. 가로는 러너가 PIECE_CANVAS_W 로 정한다.
 *
 * ── 뒷일
 *
 * rAF 루프 하나만 쓰고 destroy() 에서 세운다. 대기 중인 애니메이션 Promise 는
 * destroy 시 전부 즉시 결과를 낸다 — 걸린 채로 남으면 알고리즘이 멈춘 자리에서
 * 영영 깨어나지 못한다. setTimeout 은 rAF 가 없는 환경의 대체 경로로만 쓴다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ────────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 268;
const CAPTION_Y = 20;

// ── 그래프 (왼쪽. 변하지 않는 것) ──────────────────────────────────────────
const GRAPH_X0 = 30;
const GRAPH_X1 = 172;
const GRAPH_TOP_Y = 110;
const GRAPH_BOTTOM_Y = 228;
const NODE_R_MAX = 17;
const LEVEL_GAP_MAX = 64;

// ── 갈림 ──────────────────────────────────────────────────────────────────
const FORK_X = 184;
const CORNER = 8;

// ── 위 갈래: 앞뒤가 뚫린 통 ────────────────────────────────────────────────
const FIFO_Y = 62;
const TUBE_X0 = 200;
const TUBE_X1 = 310;
const TUBE_PAD = 6;

// ── 아래 갈래: 위만 뚫린 우물 ──────────────────────────────────────────────
const LIFO_Y = 150;
const WELL_CX = 255;
const WELL_HALF_W = 23;
const WELL_TOP_Y = 174;
const WELL_BOTTOM_Y = 244;
const WELL_PAD = 6;

// ── 방문 순서가 자라는 자리 ────────────────────────────────────────────────
const CHAIN_X0 = 326;
const CHAIN_X1 = W - 16;

// ── 칩 ────────────────────────────────────────────────────────────────────
const CHIP_W = 30;
const CHIP_H = 24;
const CHIP_GAP = 4;
const CHIP_RX = 6;
/** 우물에 쌓일 때의 세로 간격. 통보다 촘촘하다 — 쌓는 그릇이므로. */
const STACK_PITCH = CHIP_H + 1;

// ── 지속시간 ──────────────────────────────────────────────────────────────
const SEED_MS = 320;
const TAKE_MS = 380;
const OFFER_MS = 300;
/** 여럿이 들어갈 때 번호가 작은 것부터 출발한다. */
const LEAD_STEP = 0.22;

type Pt = { x: number; y: number };
type LaneKey = 'fifo' | 'lifo';

export type QueueVsStackOrderGraph = {
  vertices: number[];
  edges: number[][];
  start: number;
};

export type QueueVsStackOrderSeed = {
  vertex: number;
  fifoPending: number[];
  lifoPending: number[];
};

export type QueueVsStackOrderTake = {
  fifoTaken: number;
  lifoTaken: number;
  fifoPending: number[];
  lifoPending: number[];
  diverged: boolean;
};

export type QueueVsStackOrderOffer = {
  fifoFrom: number;
  lifoFrom: number;
  fifoAdded: number[];
  lifoAdded: number[];
  fifoPending: number[];
  lifoPending: number[];
};

export type QueueVsStackOrderStageInstance = ViewInstance & {
  setGraph(graph: QueueVsStackOrderGraph): void;
  setCaption(text: string): void;
  seed(step: QueueVsStackOrderSeed): Promise<void>;
  take(step: QueueVsStackOrderTake): Promise<void>;
  offer(step: QueueVsStackOrderOffer): Promise<void>;
  reset(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** 화살촉 하나. 방향은 dx/dy 부호로 준다. */
function arrowPath(tip: Pt, dx: number, dy: number, size: number): string {
  const bx = tip.x - dx * size;
  const by = tip.y - dy * size;
  const px = -dy * size * 0.55;
  const py = dx * size * 0.55;
  return `M ${bx + px} ${by + py} L ${tip.x} ${tip.y} L ${bx - px} ${by - py}`;
}

export const queueVsStackOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): QueueVsStackOrderStageInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const laneColors = categorical(2, 'vivid');
    const laneColor: Record<LaneKey, string> = {
      fifo: laneColors[0] ?? colors.text,
      lifo: laneColors[1] ?? colors.text,
    };

    const root = el('g', {});
    const gStatic = el('g', {});
    const gRing = el('g', {});
    const gSplit = el('g', {});
    const gChip = el('g', {});
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.appendChild(gStatic);
    root.appendChild(gRing);
    root.appendChild(gSplit);
    root.appendChild(gChip);
    root.appendChild(caption);
    svg.appendChild(root);

    // ── 애니메이션 동력 ──────────────────────────────────────────────────
    let destroyed = false;
    let rafId: number | null = null;
    const settlers = new Set<() => void>();

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };
    const nowMs = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    function animate(duration: number, apply: (progress: number) => void): Promise<void> {
      apply(0);
      if (destroyed || duration <= 0) {
        apply(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const settle = (): void => {
          settlers.delete(settle);
          apply(1);
          resolve();
        };
        settlers.add(settle);
        const startedAt = nowMs();
        const tick = (): void => {
          rafId = null;
          if (destroyed || !settlers.has(settle)) return;
          const progress = Math.min(1, (nowMs() - startedAt) / duration);
          apply(progress);
          if (progress >= 1) {
            settle();
            return;
          }
          rafId = schedule(tick);
        };
        rafId = schedule(tick);
      });
    }

    // ── 그래프 배치 ──────────────────────────────────────────────────────
    let graph: QueueVsStackOrderGraph = { vertices: [], edges: [], start: 0 };
    let nodePos = new Map<number, Pt>();
    let nodeR = NODE_R_MAX;
    let chainPitch = (CHAIN_X1 - CHAIN_X0) / 6;

    function layoutGraph(): void {
      const adjacency = new Map<number, number[]>();
      for (const v of graph.vertices) adjacency.set(v, []);
      for (const edge of graph.edges) {
        const a = edge[0];
        const b = edge[1];
        if (typeof a !== 'number' || typeof b !== 'number') continue;
        if (!adjacency.has(a)) adjacency.set(a, []);
        if (!adjacency.has(b)) adjacency.set(b, []);
        adjacency.get(a)?.push(b);
        adjacency.get(b)?.push(a);
      }

      // 출발점에서의 거리로 층을 정한다. 닿지 않는 정점은 맨 아래 층에 붙인다.
      const depth = new Map<number, number>();
      depth.set(graph.start, 0);
      const frontier: number[] = [graph.start];
      let maxDepth = 0;
      for (let i = 0; i < frontier.length; i += 1) {
        const v = frontier[i];
        if (v === undefined) break;
        const d = depth.get(v) ?? 0;
        for (const n of adjacency.get(v) ?? []) {
          if (depth.has(n)) continue;
          depth.set(n, d + 1);
          maxDepth = Math.max(maxDepth, d + 1);
          frontier.push(n);
        }
      }
      for (const v of graph.vertices) {
        if (!depth.has(v)) depth.set(v, maxDepth + 1);
      }
      for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);

      const rows = new Map<number, number[]>();
      for (const v of [...graph.vertices].sort((a, b) => a - b)) {
        const d = depth.get(v) ?? 0;
        const row = rows.get(d);
        if (row) row.push(v);
        else rows.set(d, [v]);
      }

      // 깊어지면 층 간격을 줄여 담는다. 높이는 늘리지 않는다 (S-view).
      const levelGap = Math.min(
        LEVEL_GAP_MAX,
        (GRAPH_BOTTOM_Y - GRAPH_TOP_Y) / Math.max(1, maxDepth),
      );
      const widest = Math.max(1, ...[...rows.values()].map((row) => row.length));
      const pitch = (GRAPH_X1 - GRAPH_X0) / widest;
      nodeR = Math.max(9, Math.min(NODE_R_MAX, pitch / 2 - 5, levelGap / 2 - 6));

      nodePos = new Map();
      for (const [d, row] of rows) {
        const rowPitch = (GRAPH_X1 - GRAPH_X0) / row.length;
        row.forEach((v, i) => {
          nodePos.set(v, {
            x: GRAPH_X0 + rowPitch * (i + 0.5),
            y: GRAPH_TOP_Y + levelGap * d,
          });
        });
      }
      chainPitch = (CHAIN_X1 - CHAIN_X0) / Math.max(1, graph.vertices.length);
    }

    function graphPos(vertex: number): Pt {
      return nodePos.get(vertex) ?? { x: GRAPH_X0, y: GRAPH_TOP_Y };
    }

    // ── 자리 계산 ────────────────────────────────────────────────────────
    /** 그릇 안 i 번째 자리. fifo 는 0 번이 꺼내는 쪽(오른쪽 끝)이다. */
    function pendingPos(lane: LaneKey, i: number): Pt {
      if (lane === 'fifo') {
        return { x: TUBE_X1 - TUBE_PAD - CHIP_W / 2 - i * (CHIP_W + CHIP_GAP), y: FIFO_Y };
      }
      return { x: WELL_CX, y: WELL_BOTTOM_Y - WELL_PAD - CHIP_H / 2 - i * STACK_PITCH };
    }

    /** 방문 순서 줄의 i 번째 칸. */
    function orderPos(lane: LaneKey, i: number): Pt {
      return {
        x: CHAIN_X0 + chainPitch * (i + 0.5),
        y: lane === 'fifo' ? FIFO_Y : LIFO_Y,
      };
    }

    /** 그릇을 드나드는 목. fifo 는 통의 입구, lifo 는 우물의 아가리다. */
    function mouth(lane: LaneKey): Pt {
      return lane === 'fifo' ? { x: TUBE_X0 - 4, y: FIFO_Y } : { x: WELL_CX, y: LIFO_Y };
    }

    // ── 칩 ──────────────────────────────────────────────────────────────
    type Chip = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; at: Pt };
    const chips = new Map<string, Chip>();
    const chipKey = (lane: LaneKey, vertex: number): string => `${lane}:${vertex}`;

    function place(chip: Chip, at: Pt): void {
      chip.at = at;
      chip.g.setAttribute('transform', `translate(${at.x} ${at.y})`);
    }

    function createChip(lane: LaneKey, vertex: number, at: Pt): Chip {
      const g = el('g', {});
      const rect = el('rect', {
        x: -CHIP_W / 2,
        y: -CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: CHIP_RX,
        fill: colors.bg,
        stroke: laneColor[lane],
        'stroke-width': 2,
      });
      const label = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      });
      label.textContent = String(vertex);
      g.appendChild(rect);
      g.appendChild(label);
      gChip.appendChild(g);
      const chip: Chip = { g, rect, label, at };
      place(chip, at);
      chips.set(chipKey(lane, vertex), chip);
      return chip;
    }

    /** 꺼내진 칩은 그 갈래의 색으로 채워진다 — 대기 중인 것과 방문한 것의 차이. */
    function markVisited(chip: Chip, lane: LaneKey): void {
      chip.rect.setAttribute('fill', laneColor[lane]);
      chip.rect.setAttribute('stroke', laneColor[lane]);
      chip.label.setAttribute('fill', colors.stateInk);
    }

    // ── 이동 ────────────────────────────────────────────────────────────
    type Move = { chip: Chip; from: Pt; via?: Pt; to: Pt; lead: number };

    function pointAt(move: Move, progress: number): Pt {
      const raw = move.lead > 0 ? (progress - move.lead) / (1 - move.lead) : progress;
      const t = easeInOut(Math.max(0, Math.min(1, raw)));
      if (!move.via) return lerp(move.from, move.to, t);
      const first = distance(move.from, move.via);
      const second = distance(move.via, move.to);
      const total = first + second;
      if (total <= 0) return move.to;
      const cut = first / total;
      if (t <= cut) return lerp(move.from, move.via, cut <= 0 ? 1 : t / cut);
      return lerp(move.via, move.to, cut >= 1 ? 1 : (t - cut) / (1 - cut));
    }

    async function flow(moves: Move[], duration: number): Promise<void> {
      if (moves.length === 0) return;
      await animate(duration, (progress) => {
        for (const move of moves) place(move.chip, pointAt(move, progress));
      });
      for (const move of moves) place(move.chip, move.to);
    }

    /** 그릇에 남은 칩들을 제자리로. 통은 앞으로 미끄러지고 우물은 그대로 있다. */
    function settleMoves(lane: LaneKey, pending: number[], moves: Move[]): void {
      pending.forEach((vertex, i) => {
        const chip = chips.get(chipKey(lane, vertex));
        if (!chip) return;
        const to = pendingPos(lane, i);
        if (chip.at.x === to.x && chip.at.y === to.y) return;
        if (moves.some((m) => m.chip === chip)) return;
        moves.push({ chip, from: chip.at, to, lead: 0 });
      });
    }

    // ── 정적 화면 ────────────────────────────────────────────────────────
    const rings = new Map<LaneKey, SVGCircleElement>();

    function drawLane(lane: LaneKey): void {
      const y = lane === 'fifo' ? FIFO_Y : LIFO_Y;
      const color = laneColor[lane];

      // 갈래의 선 — 갈림 지점에서 순서 줄 끝까지 이어진다.
      gStatic.appendChild(
        el('line', {
          x1: FORK_X + CORNER,
          y1: y,
          x2: CHAIN_X1,
          y2: y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // 갈래가 갈라져 나오는 길.
      const branch =
        lane === 'fifo'
          ? `M ${FORK_X} ${GRAPH_TOP_Y} V ${y + CORNER} Q ${FORK_X} ${y} ${FORK_X + CORNER} ${y}`
          : `M ${FORK_X} ${GRAPH_TOP_Y} V ${y - CORNER} Q ${FORK_X} ${y} ${FORK_X + CORNER} ${y}`;
      gStatic.appendChild(
        el('path', { d: branch, fill: 'none', stroke: color, 'stroke-width': 2 }),
      );

      // 빈 칸 — 순서가 자랄 자리.
      for (let i = 0; i < graph.vertices.length; i += 1) {
        const at = orderPos(lane, i);
        gStatic.appendChild(
          el('rect', {
            x: at.x - CHIP_W / 2,
            y: at.y - CHIP_H / 2,
            width: CHIP_W,
            height: CHIP_H,
            rx: CHIP_RX,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
      }

      const labelText = el('text', {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });

      if (lane === 'fifo') {
        // 앞뒤가 뚫린 통 — 들어간 자리와 나오는 자리가 다르다.
        const top = FIFO_Y - CHIP_H / 2 - TUBE_PAD;
        const bottom = FIFO_Y + CHIP_H / 2 + TUBE_PAD;
        gStatic.appendChild(
          el('path', {
            d: `M ${TUBE_X0} ${top} H ${TUBE_X1} M ${TUBE_X0} ${bottom} H ${TUBE_X1}`,
            fill: 'none',
            stroke: color,
            'stroke-width': 2,
            'stroke-linecap': 'round',
          }),
        );
        gStatic.appendChild(
          el('path', {
            d:
              arrowPath({ x: TUBE_X0 - 3, y: FIFO_Y }, 1, 0, 7) +
              ' ' +
              arrowPath({ x: TUBE_X1 + 14, y: FIFO_Y }, 1, 0, 7),
            fill: 'none',
            stroke: color,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        );
        labelText.setAttribute('x', String((TUBE_X0 + TUBE_X1) / 2));
        labelText.setAttribute('y', String(bottom + 18));
        labelText.textContent = tr('label.fifo', 'first in, first out');
      } else {
        // 위만 뚫린 우물 — 들어간 자리로 되돌아 나온다.
        gStatic.appendChild(
          el('path', {
            d: `M ${WELL_CX - WELL_HALF_W} ${WELL_TOP_Y} V ${WELL_BOTTOM_Y - 10} Q ${WELL_CX - WELL_HALF_W} ${WELL_BOTTOM_Y} ${WELL_CX - WELL_HALF_W + 10} ${WELL_BOTTOM_Y} H ${WELL_CX + WELL_HALF_W - 10} Q ${WELL_CX + WELL_HALF_W} ${WELL_BOTTOM_Y} ${WELL_CX + WELL_HALF_W} ${WELL_BOTTOM_Y - 10} V ${WELL_TOP_Y}`,
            fill: 'none',
            stroke: color,
            'stroke-width': 2,
            'stroke-linecap': 'round',
          }),
        );
        gStatic.appendChild(
          el('line', {
            x1: WELL_CX,
            y1: LIFO_Y,
            x2: WELL_CX,
            y2: WELL_TOP_Y,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
        gStatic.appendChild(
          el('path', {
            d:
              arrowPath({ x: WELL_CX - 12, y: WELL_TOP_Y - 3 }, 0, 1, 7) +
              ' ' +
              arrowPath({ x: WELL_CX + 12, y: WELL_TOP_Y - 10 }, 0, -1, 7),
            fill: 'none',
            stroke: color,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        );
        labelText.setAttribute('x', String(WELL_CX));
        labelText.setAttribute('y', String(WELL_BOTTOM_Y + 16));
        labelText.textContent = tr('label.lifo', 'last in, first out');
      }
      gStatic.appendChild(labelText);

      const ring = el('circle', {
        cx: 0,
        cy: 0,
        r: nodeR + (lane === 'fifo' ? 4 : 8),
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        opacity: 0,
      });
      gRing.appendChild(ring);
      rings.set(lane, ring);
    }

    function drawStatic(): void {
      gStatic.textContent = '';
      gRing.textContent = '';
      rings.clear();

      // 그래프 — 이 조각에서 유일하게 변하지 않는 것.
      for (const edge of graph.edges) {
        const a = edge[0];
        const b = edge[1];
        if (typeof a !== 'number' || typeof b !== 'number') continue;
        const pa = graphPos(a);
        const pb = graphPos(b);
        gStatic.appendChild(
          el('line', {
            x1: pa.x,
            y1: pa.y,
            x2: pb.x,
            y2: pb.y,
            stroke: colors.border,
            'stroke-width': 2,
          }),
        );
      }
      for (const vertex of graph.vertices) {
        const at = graphPos(vertex);
        gStatic.appendChild(
          el('circle', {
            cx: at.x,
            cy: at.y,
            r: nodeR,
            fill: colors.bg,
            stroke: colors.text,
            'stroke-width': 1.5,
          }),
        );
        const text = el('text', {
          x: at.x,
          y: at.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.text,
        });
        text.textContent = String(vertex);
        gStatic.appendChild(text);
      }

      // 출발점에서 뻗는 줄기. 여기까지는 하나다.
      const start = graphPos(graph.start);
      gStatic.appendChild(
        el('line', {
          x1: start.x + nodeR,
          y1: start.y,
          x2: FORK_X,
          y2: start.y,
          stroke: colors.border,
          'stroke-width': 2,
        }),
      );
      gStatic.appendChild(
        el('circle', { cx: FORK_X, cy: GRAPH_TOP_Y, r: 3, fill: colors.text }),
      );

      drawLane('fifo');
      drawLane('lifo');
    }

    function showRing(lane: LaneKey, vertex: number): void {
      const ring = rings.get(lane);
      if (!ring) return;
      const at = graphPos(vertex);
      ring.setAttribute('cx', String(at.x));
      ring.setAttribute('cy', String(at.y));
      ring.setAttribute('r', String(nodeR + (lane === 'fifo' ? 4 : 8)));
      ring.setAttribute('opacity', '1');
    }

    function clearRings(): void {
      for (const ring of rings.values()) ring.setAttribute('opacity', '0');
    }

    /** 두 순서가 어긋나기 시작하는 칸에 세우는 갈림 표시. */
    function showSplit(index: number): void {
      gSplit.textContent = '';
      const x = CHAIN_X0 + chainPitch * index;
      const mark = el('g', {});
      mark.appendChild(
        el('line', {
          x1: x,
          y1: FIFO_Y + CHIP_H / 2 + 6,
          x2: x,
          y2: LIFO_Y - CHIP_H / 2 - 6,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        }),
      );
      gSplit.appendChild(mark);
    }

    // ── 상태 ────────────────────────────────────────────────────────────
    const lanes: Record<LaneKey, { pending: number[]; order: number[] }> = {
      fifo: { pending: [], order: [] },
      lifo: { pending: [], order: [] },
    };

    function clearChips(): void {
      gChip.textContent = '';
      chips.clear();
      lanes.fifo = { pending: [], order: [] };
      lanes.lifo = { pending: [], order: [] };
      gSplit.textContent = '';
      clearRings();
    }

    const instance: QueueVsStackOrderStageInstance = {
      setGraph(next: QueueVsStackOrderGraph): void {
        graph = {
          vertices: [...next.vertices],
          edges: next.edges.map((e) => [...e]),
          start: next.start,
        };
        layoutGraph();
        clearChips();
        drawStatic();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      async seed(step: QueueVsStackOrderSeed): Promise<void> {
        clearRings();
        const from = graphPos(step.vertex);
        lanes.fifo.pending = [...step.fifoPending];
        lanes.lifo.pending = [...step.lifoPending];
        const moves: Move[] = [];
        for (const lane of ['fifo', 'lifo'] as const) {
          const index = lanes[lane].pending.indexOf(step.vertex);
          if (index < 0) continue;
          const chip = createChip(lane, step.vertex, from);
          moves.push({
            chip,
            from,
            via: mouth(lane),
            to: pendingPos(lane, index),
            lead: 0,
          });
        }
        await flow(moves, SEED_MS);
      },

      async take(step: QueueVsStackOrderTake): Promise<void> {
        clearRings();
        const moves: Move[] = [];
        const taken: Record<LaneKey, number> = {
          fifo: step.fifoTaken,
          lifo: step.lifoTaken,
        };
        for (const lane of ['fifo', 'lifo'] as const) {
          const vertex = taken[lane];
          lanes[lane].order.push(vertex);
          lanes[lane].pending = [...(lane === 'fifo' ? step.fifoPending : step.lifoPending)];
          const chip = chips.get(chipKey(lane, vertex));
          if (!chip) continue;
          markVisited(chip, lane);
          moves.push({
            chip,
            from: chip.at,
            // 통은 그대로 지나가고, 우물은 들어온 구멍으로 되돌아 나온다.
            via: lane === 'lifo' ? mouth('lifo') : undefined,
            to: orderPos(lane, lanes[lane].order.length - 1),
            lead: 0,
          });
          settleMoves(lane, lanes[lane].pending, moves);
        }
        if (step.diverged) showSplit(lanes.fifo.order.length - 1);
        await flow(moves, TAKE_MS);
      },

      async offer(step: QueueVsStackOrderOffer): Promise<void> {
        showRing('fifo', step.fifoFrom);
        showRing('lifo', step.lifoFrom);
        lanes.fifo.pending = [...step.fifoPending];
        lanes.lifo.pending = [...step.lifoPending];
        const added: Record<LaneKey, number[]> = {
          fifo: step.fifoAdded,
          lifo: step.lifoAdded,
        };
        const moves: Move[] = [];
        for (const lane of ['fifo', 'lifo'] as const) {
          added[lane].forEach((vertex, i) => {
            const index = lanes[lane].pending.indexOf(vertex);
            if (index < 0) return;
            const from = graphPos(vertex);
            const chip = chips.get(chipKey(lane, vertex)) ?? createChip(lane, vertex, from);
            moves.push({
              chip,
              from,
              via: mouth(lane),
              to: pendingPos(lane, index),
              lead: Math.min(0.6, i * LEAD_STEP),
            });
          });
          settleMoves(lane, lanes[lane].pending, moves);
        }
        await flow(moves, OFFER_MS);
      },

      reset(): void {
        clearChips();
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        if (rafId !== null) {
          unschedule(rafId);
          rafId = null;
        }
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이
        // 깨어나지 못한 채로 멈춘다.
        for (const settle of [...settlers]) settle();
        settlers.clear();
        chips.clear();
        rings.clear();
        root.remove();
      },
    };

    return instance;
  },
};
