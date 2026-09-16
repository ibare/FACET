/**
 * one-way-edge-stage — 방향 간선 조각의 그림.
 *
 * ── 왜 이 배치인가
 *
 * 동사가 "끊긴다" 이므로 선 하나가 **두 개의 차선**으로 그려진다. 화살이 없을
 * 때는 두 차선이 서로 반대 방향으로 나란히 놓이고 (양쪽으로 통한다), 방향이
 * 붙으면 거스르는 차선이 바깥으로 밀려나 떨어져 나가고 남은 차선이 가운데로
 * 옮겨 온다. 색이 바뀌는 것이 아니라 선이 자리를 옮겨 사라진다.
 *
 * 정점은 고리 위에 놓는다 — 출발점을 왼쪽(180°)에 두고 배열 순서대로 시계
 * 방향. 왼쪽에서 오른쪽으로 읽는 방향이 답사가 나아가는 방향과 맞는다.
 * 닿지 못한 정점은 고리 **밖으로 밀려나며**, 그때도 그 정점에서 나가는 화살은
 * 늘어난 채 고리를 향해 남는다 — 나갈 수는 있고 들어올 수만 없다는 비대칭이
 * 그 한 장면에 다 들어간다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 밀려나는 자리는 캔버스 안으로
 * 물린다.
 *
 * ── 어휘를 갈라 둔다
 *
 * 한 화면에서 세 가지가 서로 다른 것을 말하므로 부딪히지 않게 갈라 둔다.
 *
 *   채움(정점)   값의 형편 — 출발점인가 · 닿았나 · 아직인가 · 밀려났나.
 *   테두리(정점) 밀려난 것에만 붙는 점선. "여기는 닿지 못한다" 는 표식.
 *   막음 표식    선 위에 가로로 서는 짧은 막대. **들어올 수 없다**는 표식이고
 *                정점의 칠과 어휘가 달라 겹쳐도 읽기가 뒤집히지 않는다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`setMode()` · `walk()` · `blocked()` · `pushOut()`) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면
 * 처음부터 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가
 * **그 장면의 화면 전체**를 세운다 (S-scene).
 *
 * 특히 **모드가 차선의 개수에 숨어 있던 것**이 사라졌다. 옛 코드에는 모드를
 * 말하는 변수가 없었고 `cutEdge` 가 배열에서 차선을 지우는 것이 곧 기록이었다.
 * 이제 `scene.mode` 가 말하고 차선은 매번 거기서 파생된다.
 *
 * **되튄 자리는 이제 남는다.** 옛 `probe()` 는 점과 막을 그렸다가 둘 다 지워,
 * 완주 화면에 *왜* 못 들어가는지를 말하는 표식이 하나도 없었다. 지금은 점만
 * 지나가고 막음 표식은 `scene.blocked` 가 쥐어 정적 그리기가 세운다.
 *
 * `prev` 는 들추지 않는다. 운동의 출발 자리는 전부 `next` 의 구조에서 되셈된다 —
 * 밀려나기 전의 자리는 고리 위 제자리이고, 끊기기 전의 배치는 무방향 배치다.
 *
 * ── 좌표
 *
 * 고리의 반지름과 밀려나는 거리는 캔버스에서 역산한다. 자리는 그리기 전에 한
 * 번에 셈해 둔다 (`positionsOf` → `lanesOf`) — 그리면서 재면 순회 순서가 곧
 * 숨은 상태가 된다.
 *
 * ── 뒷일
 *
 * 걸어 둔 프레임과 기다리는 약속은 집합에 담아 destroy 에서 일괄로 거둔다.
 * 풀지 않으면 알고리즘이 `emit` 에서 영영 멈춘다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
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
  keptLane,
  strandedOf,
  type OneWayEdgeCaption,
  type OneWayEdgeScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캡션 한 줄 + 고리 + 밀려난 정점이 들어갈 만큼. 마운트 뒤 바뀌지 않는다. */
const H = 316;

const SIDE = 30;
const NODE_R = 22;
/** 고리는 남는 폭을 좌우 여백으로 버리지 않고 캔버스를 가로로 채운다. */
const RX = W / 2 - SIDE - NODE_R;
const RY = 86;
const CX = W / 2;
const CY = 152;

const CAPTION_Y = 28;
/** 차선이 중심선에서 벗어나는 거리. 두 차선이 이만큼씩 반대쪽으로 놓인다. */
const LANE = 5;
/** 끊긴 차선이 밀려나며 떨어지는 거리. */
const CUT_SHIFT = 20;
/** 정점 테두리와 선 끝 사이의 숨. */
const GAP = 7;
const HEAD_L = 10;
const HEAD_W = 8;
/** 닿지 못한 정점이 고리 밖으로 밀려나는 거리. */
const PUSH = 68;
const EDGE_MARGIN = 8;

/** 막음 표식이 목적지 앞에 서는 거리와 그 길이의 절반. */
const WALL_BACK = 24;
const WALL_HALF = 12;
/** 되튀는 점이 막음 표식 앞에서 멎는 여유. */
const BOUNCE_GAP = 11;

const CUT_MS = 420;
const CUT_STAGGER = 70;
const POP_MS = 170;
const PROBE_OUT_MS = 320;
const PROBE_HOLD_MS = 120;
const PROBE_BACK_MS = 260;
const PUSH_MS = 560;

type Point = { x: number; y: number };

/**
 * 이번 그림에서 살아 있는 차선 하나. **DOM 손잡이를 담지 않는다** — 옛 `Lane` 은
 * 손잡이와 뜻을 한 객체에 묶어 두어 배열에서 지우는 것이 곧 모드의 기록이었다.
 */
type LaneGeo = {
  from: string;
  to: string;
  /** 중심선에서 벗어난 거리. 화살이 붙으면 남는 차선은 0 으로 온다. */
  off: number;
  opacity: number;
  /** 끊겨 떨어져 나가는 중인가. 그동안만 danger 로 그린다. */
  cut: boolean;
};

/**
 * 한 번 그릴 때의 **지나가는 것**. 장면이 말하지 않는 몸짓만 담는다.
 *
 * 멎어 있을 때는 전부 비어 있고(`REST`), 운동 중에는 프레임마다 새로 만들어진다.
 * 어느 쪽이든 그리는 길은 `paint` 하나다.
 */
type Motion = {
  /** 화살이 붙는 중인 진행도(0..1). null 이면 `scene.mode` 그대로 멎어 있다. */
  cutting: number | null;
  /** 부풀어 있는 정점과 부푼 양(px). */
  pop: { id: string; swell: number } | null;
  /** 차선 위를 건너는 점. `t` 는 그 차선 위의 진행도다. */
  pulse: { from: string; to: string; t: number } | null;
  /** 되튀는 점과 막음 표식의 진하기. `node` 로 들어가려는 모든 자리가 함께 돈다. */
  probe: { node: string; reach: number; wall: number } | null;
  /** 밀려나는 중인 정점과 그 진행도. */
  pushing: { node: string; t: number } | null;
};

const REST: Motion = { cutting: null, pop: null, pulse: null, probe: null, pushing: null };

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** 한 축에서 `v` 가 `dir` 방향으로 경계에 닿기까지 갈 수 있는 거리. */
function travel(v: number, dir: number, lo: number, hi: number): number {
  if (Math.abs(dir) < 1e-6) return Number.POSITIVE_INFINITY;
  return dir > 0 ? (hi - v) / dir : (lo - v) / dir;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 출발점을 왼쪽에 두고 배열 순서대로 시계 방향. */
function ringPos(index: number, count: number, sourceIndex: number): Point {
  const a = Math.PI + ((index - sourceIndex) * 2 * Math.PI) / count;
  return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
}

/**
 * 이번 그림에서 정점이 설 자리. **그리기 전에 한 번에 셈한다** — 그리면서 재면
 * 순회 순서가 곧 숨은 상태가 된다.
 */
function positionsOf(scene: OneWayEdgeScene, motion: Motion): Map<string, Point> {
  const out = new Map<string, Point>();
  const count = scene.nodes.length;
  if (count === 0) return out;
  const sourceIndex = Math.max(0, scene.nodes.indexOf(scene.source));

  scene.nodes.forEach((id, i) => {
    const home = ringPos(i, count, sourceIndex);
    const going = motion.pushing !== null && motion.pushing.node === id;
    const out0 = going ? easeOut(motion.pushing?.t ?? 0) : scene.pushed.includes(id) ? 1 : 0;
    if (out0 === 0) {
      out.set(id, home);
      return;
    }
    const len = Math.hypot(home.x - CX, home.y - CY) || 1;
    const dx = (home.x - CX) / len;
    const dy = (home.y - CY) / len;
    // 캔버스 밖으로 나가지 않을 만큼만 민다. x·y 를 따로 자르면 방향이 휘므로
    // 갈 수 있는 거리를 먼저 재고 그만큼만 간다.
    const room = Math.min(
      travel(home.x, dx, NODE_R + EDGE_MARGIN, W - NODE_R - EDGE_MARGIN),
      travel(home.y, dy, NODE_R + EDGE_MARGIN, H - NODE_R - EDGE_MARGIN),
    );
    const dist = Math.max(0, Math.min(PUSH, room)) * out0;
    out.set(id, { x: home.x + dx * dist, y: home.y + dy * dist });
  });
  return out;
}

/**
 * 이번 그림에서 살아 있는 차선들. **`scene.mode` 하나가 개수를 정한다.**
 *
 * 화살이 없으면 선마다 두 차선이 반대쪽으로 눕고, 붙으면 남는 차선 하나만
 * 가운데에 선다. 붙는 중이면 선마다 조금씩 늦게 시작해 물결처럼 끊긴다.
 */
function lanesOf(scene: OneWayEdgeScene, motion: Motion): LaneGeo[] {
  const out: LaneGeo[] = [];
  const total = Math.max(1, CUT_STAGGER * Math.max(0, scene.edges.length - 1) + CUT_MS);

  scene.edges.forEach((line, i) => {
    const kept = keptLane(line);
    if (motion.cutting === null) {
      if (scene.mode === 'undirected') {
        out.push({ from: line.u, to: line.v, off: LANE, opacity: 1, cut: false });
        out.push({ from: line.v, to: line.u, off: LANE, opacity: 1, cut: false });
        return;
      }
      out.push({ from: kept.from, to: kept.to, off: 0, opacity: 1, cut: false });
      return;
    }
    const e = easeInOut(clamp01((motion.cutting * total - i * CUT_STAGGER) / CUT_MS));
    out.push({ from: kept.from, to: kept.to, off: LANE * (1 - e), opacity: 1, cut: false });
    // 다 밀려난 차선은 그리지 않는다. 숨기기만 하면 앞 걸음의 값이 함께 남는다.
    if (e < 1) {
      out.push({
        from: kept.to,
        to: kept.from,
        off: LANE + CUT_SHIFT * e,
        opacity: 1 - e,
        cut: true,
      });
    }
  });
  return out;
}

/** 두 정점 사이의 방향 벡터와 법선. */
type Axis = { a: Point; b: Point; ux: number; uy: number; nx: number; ny: number };

function axisOf(pos: Map<string, Point>, from: string, to: string): Axis | null {
  const a = pos.get(from);
  const b = pos.get(to);
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return { a, b, ux, uy, nx: -uy, ny: ux };
}

/** 정점 테두리에서 테두리까지, 차선의 벗어남까지 반영한 두 끝. */
function laneEnds(ax: Axis, off: number): { sx: number; sy: number; ex: number; ey: number } {
  return {
    sx: ax.a.x + ax.ux * (NODE_R + GAP) + ax.nx * off,
    sy: ax.a.y + ax.uy * (NODE_R + GAP) + ax.ny * off,
    ex: ax.b.x - ax.ux * (NODE_R + GAP) + ax.nx * off,
    ey: ax.b.y - ax.uy * (NODE_R + GAP) + ax.ny * off,
  };
}

export const oneWayEdgeStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<OneWayEdgeScene> {
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const gEdges = el('g');
    const gWalls = el('g');
    const gNodes = el('g');
    const gMotion = el('g');
    const caption = el('text', {
      x: CX,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.append(gEdges, gWalls, gNodes, gMotion, caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장. `render` 가 불릴 때마다 오르고, 깨어난 걸음 함수는 자기 세대를
     * 확인한 뒤에만 그린다.
     *
     * 되짚기는 `opts.animate` 가 거짓으로 오므로 프레임을 아예 안 거는 것이 첫
     * 빗장이고, 이것이 두 번째다. 이 조각의 걸음은 `await` 를 둘 이상 지난다
     * (건너감 뒤에 부풀림이 따라오고, 되튐은 세 마디다) — 그 사이에 새 `render`
     * 가 오면 살아남은 뒷마디가 이미 새로 선 화면을 덮는다.
     */
    let gen = 0;

    // ── 문안. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10).
    //    수는 전부 그 장면의 구조에서 센다 — 장면이 실어 온 수를 쓰지 않는다.
    function captionText(cap: OneWayEdgeCaption, scene: OneWayEdgeScene): string {
      switch (cap.kind) {
        case 'undirected':
          return tr('caption.undirected', 'No arrows yet — every line runs both ways.');
        case 'openReach':
          return tr(
            'caption.openReach',
            'From {source}, every one of the {total} vertices is reachable.',
            { source: scene.source, total: scene.nodes.length },
          );
        case 'directed':
          return tr(
            'caption.directed',
            'The same {lines} lines take arrows. Each keeps one way only.',
            { lines: scene.edges.length },
          );
        case 'blocked':
          return tr('caption.blocked', 'Every line at {node} points away — nothing arrives.', {
            node: cap.node,
          });
        case 'stranded':
          return tr('caption.stranded', 'From {source}: {reached} of {total}. {nodes} is out of reach.', {
            source: scene.source,
            reached: scene.reached.length,
            total: scene.nodes.length,
            nodes: strandedOf(scene).join(', '),
          });
      }
    }

    // ── 그리기 -------------------------------------------------------------

    function nodeFill(s: 'default' | 'source' | 'reached' | 'stranded'): string {
      if (s === 'source') return c.accent;
      if (s === 'reached') return c.itemSorted;
      if (s === 'stranded') return c.bg;
      return c.itemDefault;
    }

    function nodeStroke(s: 'default' | 'source' | 'reached' | 'stranded'): string {
      if (s === 'source') return c.accent;
      if (s === 'reached') return c.itemSorted;
      if (s === 'stranded') return c.danger;
      return c.textMuted;
    }

    function nodeInk(s: 'default' | 'source' | 'reached' | 'stranded'): string {
      if (s === 'source') return c.stateInk;
      if (s === 'reached') return c.textInverse;
      if (s === 'stranded') return c.danger;
      return c.text;
    }

    /**
     * 정점 하나의 형편. **채움이 말하는 것은 값의 형편뿐**이다 — 표식은 막음
     * 표식과 점선 테두리가 따로 맡는다.
     */
    function stateOf(
      scene: OneWayEdgeScene,
      id: string,
    ): 'default' | 'source' | 'reached' | 'stranded' {
      if (scene.pushed.includes(id)) return 'stranded';
      if (scene.reached.length > 0 && scene.reached[0] === id) return 'source';
      if (scene.reached.includes(id)) return 'reached';
      return 'default';
    }

    /**
     * 막음 표식이 설 자리. 목적지 문 바로 앞이다.
     *
     * `reach` 는 되튀는 점이 멎는 진행도 — 표식보다 조금 앞이라 점이 표식에
     * 부딪혀 되튀는 것으로 읽힌다. 정점이 밀려나 축이 길어져도 표식은 문 앞에
     * 그대로 붙어 있다.
     */
    function wallAt(ax: Axis): { x: number; y: number; reach: number; sx: number; sy: number; ex: number; ey: number } {
      const { sx, sy, ex, ey } = laneEnds(ax, 0);
      const len = Math.hypot(ex - sx, ey - sy) || 1;
      const back = Math.min(WALL_BACK, len * 0.45);
      const wt = (len - back) / len;
      return {
        x: sx + (ex - sx) * wt,
        y: sy + (ey - sy) * wt,
        reach: Math.max(0, wt - BOUNCE_GAP / len),
        sx,
        sy,
        ex,
        ey,
      };
    }

    /**
     * 그 장면의 화면을 통째로 세운다. 되돌릴 명령이 없으므로 늘 비우고 시작한다.
     *
     * 고정 자리의 캡션만 재건 밖에 있고, 그것도 **매번 명시로 쓴다** — 비워야 할
     * 때 빈 문자열을 쓴다. 나머지는 이 함수가 매번 새로 짓는다.
     */
    function paint(scene: OneWayEdgeScene, motion: Motion): void {
      gEdges.textContent = '';
      gWalls.textContent = '';
      gNodes.textContent = '';
      gMotion.textContent = '';

      const pos = positionsOf(scene, motion);
      const lanes = lanesOf(scene, motion);

      // ── 차선. 화살까지 한 벌이다.
      for (const lane of lanes) {
        const ax = axisOf(pos, lane.from, lane.to);
        if (ax === null) continue;
        const { sx, sy, ex, ey } = laneEnds(ax, lane.off);
        const bx = ex - ax.ux * HEAD_L;
        const by = ey - ax.uy * HEAD_L;
        const stroke = lane.cut ? c.danger : c.text;
        gEdges.append(
          el('line', {
            x1: sx,
            y1: sy,
            x2: bx,
            y2: by,
            stroke,
            'stroke-width': 1.9,
            'stroke-linecap': 'round',
            opacity: lane.opacity,
          }),
          el('polygon', {
            points: `${ex},${ey} ${bx + ax.nx * (HEAD_W / 2)},${by + ax.ny * (HEAD_W / 2)} ${bx - ax.nx * (HEAD_W / 2)},${by - ax.ny * (HEAD_W / 2)}`,
            fill: stroke,
            opacity: lane.opacity,
          }),
        );
      }

      // ── 막음 표식. **되튄 자리가 여기서부터 남는다** — 이 조각의 주장이다.
      for (const block of scene.blocked) {
        const live = motion.probe !== null && motion.probe.node === block.node;
        const alpha = live ? (motion.probe?.wall ?? 0) : 1;
        if (alpha <= 0) continue;
        for (const from of block.from) {
          const ax = axisOf(pos, from, block.node);
          if (ax === null) continue;
          const w = wallAt(ax);
          gWalls.append(
            el('line', {
              x1: w.x + ax.nx * WALL_HALF,
              y1: w.y + ax.ny * WALL_HALF,
              x2: w.x - ax.nx * WALL_HALF,
              y2: w.y - ax.ny * WALL_HALF,
              stroke: c.danger,
              'stroke-width': 3,
              'stroke-linecap': 'round',
              ...(alpha < 1 ? { opacity: alpha } : {}),
            }),
          );
        }
      }

      // ── 정점.
      for (const id of scene.nodes) {
        const p = pos.get(id);
        if (p === undefined) continue;
        const s = stateOf(scene, id);
        const swell = motion.pop !== null && motion.pop.id === id ? motion.pop.swell : 0;
        const group = el('g', { transform: `translate(${p.x} ${p.y})` });
        const circle = el('circle', {
          r: NODE_R + swell,
          fill: nodeFill(s),
          stroke: nodeStroke(s),
          'stroke-width': s === 'default' ? 1.8 : 2,
        });
        if (s === 'stranded') circle.setAttribute('stroke-dasharray', '5 4');
        const label = el('text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: nodeInk(s),
        });
        label.textContent = id;
        group.append(circle, label);
        gNodes.append(group);
      }

      // ── 지나가는 점. 건너가는 것과 되튀는 것.
      if (motion.pulse !== null) {
        const lane = lanes.find(
          (l) => l.from === motion.pulse?.from && l.to === motion.pulse?.to && !l.cut,
        );
        const ax = lane ? axisOf(pos, lane.from, lane.to) : null;
        if (lane && ax !== null) {
          const { sx, sy, ex, ey } = laneEnds(ax, lane.off);
          const e = easeInOut(motion.pulse.t);
          gMotion.append(
            el('circle', {
              cx: sx + (ex - sx) * e,
              cy: sy + (ey - sy) * e,
              r: 6,
              fill: c.itemActive,
            }),
          );
        }
      }

      if (motion.probe !== null) {
        const block = scene.blocked.find((b) => b.node === motion.probe?.node);
        for (const from of block?.from ?? []) {
          const ax = axisOf(pos, from, motion.probe.node);
          if (ax === null) continue;
          const w = wallAt(ax);
          const e = motion.probe.reach * w.reach;
          gMotion.append(
            el('circle', {
              cx: w.sx + (w.ex - w.sx) * e,
              cy: w.sy + (w.ey - w.sy) * e,
              r: 6,
              fill: c.danger,
            }),
          );
        }
      }

      caption.textContent = scene.caption === null ? '' : captionText(scene.caption, scene);
    }

    // ── 시간 ---------------------------------------------------------------

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     *
     * `resolve` 는 `waiters` 에도 담는다 — `destroy` 가 프레임을 취소하면 콜백이
     * 아예 안 불려 약속이 영영 안 풀리기 때문이다 (S-piece).
     */
    function animate(ms: number, draw: (t: number) => void): Promise<void> {
      const mine = gen;
      if (destroyed || typeof requestAnimationFrame !== 'function' || ms <= 0) {
        if (!destroyed) draw(1);
        return Promise.resolve();
      }
      const t0 = now();
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const t = Math.min(1, (now() - t0) / ms);
          draw(t);
          if (t >= 1) {
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

    /** 잠깐 멎는다. 되튄 점이 막음 표식 앞에서 머무는 틈. */
    function wait(ms: number): Promise<void> {
      if (destroyed || ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
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
    }

    /** 정점 하나를 잠깐 부풀렸다 되돌린다 — 여기가 지금 자리라는 표시. */
    function popNode(scene: OneWayEdgeScene, id: string): Promise<void> {
      return animate(POP_MS, (t) => {
        paint(scene, { ...REST, pop: { id, swell: Math.sin(Math.PI * t) * 6 } });
      });
    }

    /** 이번 걸음에 달라진 것만 흐르게 한다. */
    async function flow(scene: OneWayEdgeScene, live: () => boolean): Promise<void> {
      const step = scene.step;
      if (step === null) return;

      if (step.kind === 'mode') {
        // 화살이 없을 때는 출발점 하나가 뛴다. 붙을 때는 다섯 선이 잇달아
        // 한 방향을 잃는다 — 한 뜻의 운동이라 **한 시계**로 흘린다.
        if (step.mode === 'undirected') {
          await popNode(scene, scene.source);
          return;
        }
        const total = CUT_STAGGER * Math.max(0, scene.edges.length - 1) + CUT_MS;
        await animate(total, (t) => {
          paint(scene, { ...REST, cutting: t });
        });
        return;
      }

      if (step.kind === 'walk') {
        const pos = positionsOf(scene, REST);
        const a = pos.get(step.from);
        const b = pos.get(step.to);
        const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
        const ms = Math.min(420, 180 + len * 0.6);
        await animate(ms, (t) => {
          paint(scene, { ...REST, pulse: { from: step.from, to: step.to, t } });
        });
        if (!live()) return;
        await popNode(scene, step.to);
        return;
      }

      if (step.kind === 'blocked') {
        // 들어가려던 점이 문 앞까지 갔다가 되돌아온다. 문은 그대로 남는다.
        await animate(PROBE_OUT_MS, (t) => {
          paint(scene, {
            ...REST,
            probe: {
              node: step.node,
              reach: easeOut(t),
              wall: clamp01(t * 1.4 - 0.4),
            },
          });
        });
        if (!live()) return;
        await wait(PROBE_HOLD_MS);
        if (!live()) return;
        await animate(PROBE_BACK_MS, (t) => {
          paint(scene, {
            ...REST,
            probe: { node: step.node, reach: 1 - easeInOut(t), wall: 1 },
          });
        });
        return;
      }

      // 닿지 못한 정점이 고리 밖으로 미끄러진다. 나가는 화살과 막음 표식이
      // 함께 늘어나 따라간다 — 한 뜻의 운동이라 한 시계로 흘린다.
      await animate(PUSH_MS, (t) => {
        paint(scene, { ...REST, pushing: { node: step.node, t } });
      });
    }

    async function render(
      next: OneWayEdgeScene,
      /** 이 조각은 출발 자리를 `next` 의 구조에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: OneWayEdgeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      paint(next, REST);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, live);
      if (!live()) return;

      // 운동이 끝나면 장면을 통째로 다시 세운다. 보간의 끝자리가 목표값과 문자열로
      // 어긋나는 일이 없어진다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      paint(next, REST);
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
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
