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
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * **한 걸음에 두 곳이 움직인다.** 앞선 조각들은 걸음 하나에 흐를 것이 하나였는데,
 * 여기서는 `take` 하나에 통에서 하나가 나가고 우물에서 하나가 나가며 통에 남은
 * 것들이 함께 앞으로 미끄러진다. 그것들을 따로 돌리지 않고 **Move 목록 하나를
 * 시계 하나로** 흘린다 — 두 그릇이 lockstep 이라는 것이 이 조각의 주장이고,
 * 시계가 하나면 `render` 의 Promise 가 둘 다 선 뒤에 저절로 풀린다.
 *
 * `prev` 는 들추지 않는다. 꺼내기 전의 그릇은 "지금 그릇 + 꺼낸 것" 이라 출발
 * 자리를 `next` 만으로 되셈할 수 있다.
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
 *
 * 지연 발화를 막는 것은 **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant`
 * 와 `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다
 * (S-scene).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  QueueVsStackOrderCaption,
  QueueVsStackOrderLaneKey,
  QueueVsStackOrderScene,
  QueueVsStackOrderStep,
} from './scene.js';

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
type LaneKey = QueueVsStackOrderLaneKey;

/** 두 갈래를 늘 같은 차례로 훑는다. 나란히 돈다는 것이 이 조각의 주장이다. */
const LANES: readonly LaneKey[] = ['fifo', 'lifo'];

/** 그래프에서 역산한 자리들. 바탕이 같으면 다시 셈하지 않는다. */
type Layout = {
  key: string;
  nodePos: Map<number, Pt>;
  nodeR: number;
  chainPitch: number;
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

/** 바탕이 달라졌나 가리는 열쇠. 같으면 자리 셈을 다시 하지 않는다. */
function layoutKeyOf(scene: QueueVsStackOrderScene): string {
  return `${scene.vertices.join(',')}|${scene.edges.map((e) => e.join('-')).join(',')}|${scene.start}`;
}

/**
 * 그래프의 자리를 캔버스에서 역산한다.
 *
 * 출발점에서의 거리로 층을 정하고, 깊어지면 층 간격을 줄여 담는다. 높이는 늘리지
 * 않는다 (S-view). 좌표는 장면에 없다 — 구조에서 나오는 것이라 여기서 셈한다
 * (S-piece).
 */
function layoutOf(scene: QueueVsStackOrderScene): Layout {
  const adjacency = new Map<number, number[]>();
  for (const v of scene.vertices) adjacency.set(v, []);
  for (const edge of scene.edges) {
    const a = edge[0];
    const b = edge[1];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }

  // 닿지 않는 정점은 맨 아래 층에 붙인다.
  const depth = new Map<number, number>();
  depth.set(scene.start, 0);
  const frontier: number[] = [scene.start];
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
  for (const v of scene.vertices) {
    if (!depth.has(v)) depth.set(v, maxDepth + 1);
  }
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);

  const rows = new Map<number, number[]>();
  for (const v of [...scene.vertices].sort((a, b) => a - b)) {
    const d = depth.get(v) ?? 0;
    const row = rows.get(d);
    if (row) row.push(v);
    else rows.set(d, [v]);
  }

  const levelGap = Math.min(LEVEL_GAP_MAX, (GRAPH_BOTTOM_Y - GRAPH_TOP_Y) / Math.max(1, maxDepth));
  const widest = Math.max(1, ...[...rows.values()].map((row) => row.length));
  const pitch = (GRAPH_X1 - GRAPH_X0) / widest;
  const nodeR = Math.max(9, Math.min(NODE_R_MAX, pitch / 2 - 5, levelGap / 2 - 6));

  const nodePos = new Map<number, Pt>();
  for (const [d, row] of rows) {
    const rowPitch = (GRAPH_X1 - GRAPH_X0) / row.length;
    row.forEach((v, i) => {
      nodePos.set(v, { x: GRAPH_X0 + rowPitch * (i + 0.5), y: GRAPH_TOP_Y + levelGap * d });
    });
  }

  return {
    key: layoutKeyOf(scene),
    nodePos,
    nodeR,
    chainPitch: (CHAIN_X1 - CHAIN_X0) / Math.max(1, scene.vertices.length),
  };
}

export const queueVsStackOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<QueueVsStackOrderScene> {
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
    const frames = new Set<number>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await
     * ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가
     * 통째로 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 칩을 매번 새로 만들므로 살아남은 옛 운동이 쥔 칩은 이미
     * 떨어져 나간 노드다. 그래도 빗장을 둔다 — 깨어난 프레임이 `place` 를 돌려
     * 헛일을 하는 것을 여기서 끊고, 무엇이 유효한 세대인지가 코드에 적힌다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

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

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(duration: number, my: number, apply: (progress: number) => void): Promise<void> {
      const paint = (progress: number): void => {
        if (alive(my)) apply(progress);
      };
      paint(0);
      if (destroyed || duration <= 0) {
        paint(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const startedAt = nowMs();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const progress = Math.min(1, (nowMs() - startedAt) / duration);
          paint(progress);
          if (progress >= 1) {
            finish();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });
    }

    // ── 자리 계산 ────────────────────────────────────────────────────────
    function graphPos(layout: Layout, vertex: number): Pt {
      return layout.nodePos.get(vertex) ?? { x: GRAPH_X0, y: GRAPH_TOP_Y };
    }

    /** 그릇 안 i 번째 자리. fifo 는 0 번이 꺼내는 쪽(오른쪽 끝)이다. */
    function pendingPos(lane: LaneKey, i: number): Pt {
      if (lane === 'fifo') {
        return { x: TUBE_X1 - TUBE_PAD - CHIP_W / 2 - i * (CHIP_W + CHIP_GAP), y: FIFO_Y };
      }
      return { x: WELL_CX, y: WELL_BOTTOM_Y - WELL_PAD - CHIP_H / 2 - i * STACK_PITCH };
    }

    /** 방문 순서 줄의 i 번째 칸. */
    function orderPos(layout: Layout, lane: LaneKey, i: number): Pt {
      return {
        x: CHAIN_X0 + layout.chainPitch * (i + 0.5),
        y: lane === 'fifo' ? FIFO_Y : LIFO_Y,
      };
    }

    /** 그릇을 드나드는 목. fifo 는 통의 입구, lifo 는 우물의 아가리다. */
    function mouth(lane: LaneKey): Pt {
      return lane === 'fifo' ? { x: TUBE_X0 - 4, y: FIFO_Y } : { x: WELL_CX, y: LIFO_Y };
    }

    // ── 칩 ──────────────────────────────────────────────────────────────
    type Chip = { g: SVGGElement; at: Pt };
    /** 정적 그리기가 매번 새로 채운다. 어느 칩이 있는지는 장면이 정한다. */
    const chips = new Map<string, Chip>();
    const chipKey = (lane: LaneKey, vertex: number): string => `${lane}:${vertex}`;

    function place(chip: Chip, at: Pt): void {
      chip.at = at;
      chip.g.setAttribute('transform', `translate(${at.x} ${at.y})`);
    }

    /**
     * 칩 하나를 세운다.
     *
     * `visited` 는 그릇에서 이미 꺼낸 것 — 그 갈래의 색으로 채워진다. 대기 중인
     * 것과 방문한 것의 차이가 그 칠에 있고, **남는 표시**라 정적으로도 그린다.
     */
    function drawChip(lane: LaneKey, vertex: number, at: Pt, visited: boolean): void {
      const g = el('g', {});
      g.appendChild(
        el('rect', {
          x: -CHIP_W / 2,
          y: -CHIP_H / 2,
          width: CHIP_W,
          height: CHIP_H,
          rx: CHIP_RX,
          fill: visited ? laneColor[lane] : colors.bg,
          stroke: laneColor[lane],
          'stroke-width': 2,
        }),
      );
      const label = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: visited ? colors.stateInk : colors.text,
      });
      label.textContent = String(vertex);
      g.appendChild(label);
      gChip.appendChild(g);
      const chip: Chip = { g, at };
      place(chip, at);
      chips.set(chipKey(lane, vertex), chip);
    }

    // ── 정적 화면 ────────────────────────────────────────────────────────
    function drawGraph(scene: QueueVsStackOrderScene, layout: Layout): void {
      for (const edge of scene.edges) {
        const a = edge[0];
        const b = edge[1];
        if (typeof a !== 'number' || typeof b !== 'number') continue;
        const pa = graphPos(layout, a);
        const pb = graphPos(layout, b);
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
      for (const vertex of scene.vertices) {
        const at = graphPos(layout, vertex);
        gStatic.appendChild(
          el('circle', {
            cx: at.x,
            cy: at.y,
            r: layout.nodeR,
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
      const start = graphPos(layout, scene.start);
      gStatic.appendChild(
        el('line', {
          x1: start.x + layout.nodeR,
          y1: start.y,
          x2: FORK_X,
          y2: start.y,
          stroke: colors.border,
          'stroke-width': 2,
        }),
      );
      gStatic.appendChild(el('circle', { cx: FORK_X, cy: GRAPH_TOP_Y, r: 3, fill: colors.text }));
    }

    function drawLane(scene: QueueVsStackOrderScene, layout: Layout, lane: LaneKey): void {
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
      gStatic.appendChild(el('path', { d: branch, fill: 'none', stroke: color, 'stroke-width': 2 }));

      // 빈 칸 — 순서가 자랄 자리.
      for (let i = 0; i < scene.vertices.length; i += 1) {
        const at = orderPos(layout, lane, i);
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
    }

    /** 이웃을 내놓은 정점에 씌우는 고리. 다음 걸음에 벗겨진다. */
    function drawRings(scene: QueueVsStackOrderScene, layout: Layout): void {
      if (!scene.ringed) return;
      for (const lane of LANES) {
        const at = graphPos(layout, scene.ringed[lane]);
        gRing.appendChild(
          el('circle', {
            cx: at.x,
            cy: at.y,
            r: layout.nodeR + (lane === 'fifo' ? 4 : 8),
            fill: 'none',
            stroke: laneColor[lane],
            'stroke-width': 2,
          }),
        );
      }
    }

    /**
     * 두 순서가 어긋나기 시작하는 칸에 세우는 갈림 표시.
     *
     * 한 번 서면 끝까지 남는다 — 이 조각이 하려는 말이 그 자리에 있다. 정적
     * 그리기에 들어가야 되짚었을 때도 남는다 (S-scene PREFER).
     */
    function drawSplit(scene: QueueVsStackOrderScene, layout: Layout): void {
      if (scene.splitAt === null) return;
      const x = CHAIN_X0 + layout.chainPitch * scene.splitAt;
      gSplit.appendChild(
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
    }

    /** 문안은 여기서 만든다. 장면은 무엇을 말할지와 인자만 쥔다 (C10). */
    function captionText(said: QueueVsStackOrderCaption | null): string {
      if (!said) return '';
      switch (said.kind) {
        case 'ready':
          return tr('caption.ready', 'Same graph, same neighbour order — only the vessels differ.');
        case 'seed':
          return tr('caption.seed', 'The start, {vertex}, goes into both vessels.', {
            vertex: said.vertex,
          });
        case 'take':
          return tr('caption.take', 'Out — {fifo} from the front, {lifo} from the top.', {
            fifo: said.fifo,
            lifo: said.lifo,
          });
        case 'diverge':
          return tr(
            'caption.diverge',
            'Here the orders part — {fifo} from the front, {lifo} from the top.',
            { fifo: said.fifo, lifo: said.lifo },
          );
        case 'offer':
          return tr(
            'caption.offer',
            'The new neighbours go in, smallest number first — the same rule on both sides.',
          );
        case 'done':
          return tr('caption.done', 'Only the vessel differed, and the visiting order split.');
      }
    }

    /** 바탕이 그대로면 자리 셈을 다시 하지 않는다. */
    let layout: Layout | null = null;
    function layoutFor(scene: QueueVsStackOrderScene): Layout {
      const key = layoutKeyOf(scene);
      if (!layout || layout.key !== key) layout = layoutOf(scene);
      return layout;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 시작하므로 되돌릴 명령이 필요 없다. 칩도 매번 새로 만든다 —
     * "이 칩이 이미 있나" 로 갈리던 분기가 여기서 사라진다.
     */
    function drawScene(scene: QueueVsStackOrderScene): Layout {
      const at = layoutFor(scene);
      gStatic.textContent = '';
      gRing.textContent = '';
      gSplit.textContent = '';
      gChip.textContent = '';
      chips.clear();

      drawGraph(scene, at);
      for (const lane of LANES) drawLane(scene, at, lane);
      for (const lane of LANES) {
        const state = scene.lanes[lane];
        state.order.forEach((vertex, i) => drawChip(lane, vertex, orderPos(at, lane, i), true));
        state.pending.forEach((vertex, i) => drawChip(lane, vertex, pendingPos(lane, i), false));
      }
      drawRings(scene, at);
      drawSplit(scene, at);
      caption.textContent = captionText(scene.caption);
      return at;
    }

    // ── 운동 ────────────────────────────────────────────────────────────
    /**
     * 칩 하나가 갈 길. `to` 는 언제나 정적 그리기가 세워 둔 지금 자리다 —
     * 운동은 **아직 못 온 만큼을 뒤로 물리는** 꼴로 돈다.
     */
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

    function chipAt(lane: LaneKey, vertex: number): Chip | undefined {
      return chips.get(chipKey(lane, vertex));
    }

    /**
     * 이 걸음에 움직일 것들. **두 갈래를 한 목록에 담는다.**
     *
     * 출발 자리는 전부 `next` 에서 되셈한다 — 꺼내기 전의 그릇은 "지금 그릇 +
     * 꺼낸 것" 이고 그 둘이 다 장면에 있다. 그래서 `prev` 를 들출 일이 없다
     * (S-scene: `prev` 는 무엇을 흐르게 할지 고르는 데만).
     */
    function movesFor(
      scene: QueueVsStackOrderScene,
      step: QueueVsStackOrderStep,
      at: Layout,
    ): { moves: Move[]; duration: number } {
      const moves: Move[] = [];

      switch (step.kind) {
        // 출발 정점이 그래프에서 떠올라 두 그릇으로 동시에 들어간다.
        case 'seed': {
          for (const lane of LANES) {
            const chip = chipAt(lane, step.vertex);
            if (!chip) continue;
            moves.push({
              chip,
              from: graphPos(at, step.vertex),
              via: mouth(lane),
              to: chip.at,
              lead: 0,
            });
          }
          return { moves, duration: SEED_MS };
        }

        // 두 그릇이 각자 하나씩 내놓는다. 통은 뒤가 앞으로 미끄러지고 우물은
        // 맨 위 것만 아가리로 되돌아 나온다 — 두 그릇의 차이가 이 움직임에 있다.
        case 'take': {
          const taken: Record<LaneKey, number> = { fifo: step.fifo, lifo: step.lifo };
          for (const lane of LANES) {
            const state = scene.lanes[lane];
            const chip = chipAt(lane, taken[lane]);
            if (chip) {
              // 꺼내기 전 자리 — 통은 출구(0번), 우물은 남은 것들 바로 위.
              const wasAt = lane === 'fifo' ? 0 : state.pending.length;
              moves.push({
                chip,
                from: pendingPos(lane, wasAt),
                via: lane === 'lifo' ? mouth('lifo') : undefined,
                to: chip.at,
                lead: 0,
              });
            }
            // 우물에 남은 것들은 제자리에 있다. 통만 한 칸씩 당겨진다.
            if (lane !== 'fifo') continue;
            state.pending.forEach((vertex, i) => {
              const rest = chipAt('fifo', vertex);
              if (!rest) return;
              moves.push({ chip: rest, from: pendingPos('fifo', i + 1), to: rest.at, lead: 0 });
            });
          }
          return { moves, duration: TAKE_MS };
        }

        // 새 이웃이 그래프에서 떠올라 양쪽 그릇에 들어간다. 번호가 작은 것부터.
        case 'offer': {
          const added: Record<LaneKey, number[]> = {
            fifo: step.fifoAdded,
            lifo: step.lifoAdded,
          };
          for (const lane of LANES) {
            added[lane].forEach((vertex, i) => {
              const chip = chipAt(lane, vertex);
              if (!chip) return;
              moves.push({
                chip,
                from: graphPos(at, vertex),
                via: mouth(lane),
                to: chip.at,
                lead: Math.min(0.6, i * LEAD_STEP),
              });
            });
          }
          return { moves, duration: OFFER_MS };
        }

        // 끝. 두 순서가 다 자란 채로 나란히 남는다 — 흐를 것이 없다.
        case 'done':
          return { moves, duration: 0 };
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: QueueVsStackOrderScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: QueueVsStackOrderScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const at = drawScene(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      const { moves, duration } = movesFor(next, step, at);
      if (moves.length === 0 || duration <= 0) return;

      // 두 갈래를 시계 하나로 흘린다. 하나를 `void` 로 던지지 않으므로 이
      // Promise 가 풀릴 때 두 그릇이 다 서 있다 (S-scene).
      await animate(duration, my, (progress) => {
        for (const move of moves) place(move.chip, pointAt(move, progress));
      });

      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리를 거두고 그 장면을 통째로 다시 세운다. 속성을
      // 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도 프레임도 없어
      // 페인트가 끼지 않는다.
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다 (나머지 넷과 같은 본).
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이
        // 깨어나지 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        chips.clear();
        root.remove();
      },
    };
  },
};
