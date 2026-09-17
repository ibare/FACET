/**
 * mark-visited-or-loop stage — 걷는 이가 자리에서 자리로 **옮겨 간다.**
 *
 * 이 조각의 동사는 "되밟는다 → 벗어난다" 이므로 화면의 주 운동은 위치 변화다.
 * 걷는 이는 두 자리를 잇는 선을 따라 실제로 미끄러지고, 밟은 선은 지날 때마다
 * 굵어져 **자국(rut)** 이 된다. 표시 없이 걷는 회차가 끝나면 왼쪽 고리 셋만
 * 굵고 오른쪽으로 난 길은 새것 그대로다 — 그 대비가 이 조각의 주장이다.
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * `prev` 는 들추지 않는다. 출발 자리도, 자국이 얼마나 깊었는지도 `next` 의
 * `trail` 에서 되셈할 수 있다 — 자취가 곧 그 장면의 과거다.
 *
 * ── 채움과 테두리를 가른다
 *
 *   **채움** = 값의 형편 — 지금 여기 서 있나 (`itemActive`) 아닌가 (`itemDefault`).
 *   **덧고리** = 짚음의 표식 — 표시가 남았다 (`accent`) · 끝내 닿지 못했다
 *   (`danger` 점선). 자리 원 바깥의 같은 자리에 서고 서로 배타적이다.
 *   **간선의 굵기·색** = 자국의 깊이 (`border` → `textMuted` → `text`).
 *   **간선 위의 ×** = 짚어 보고 건너뛴 이웃 (`danger`). 자국과 어휘가 갈라져 있어
 *   한 선에 함께 있어도 읽기가 뒤집히지 않는다.
 *
 *   **다녀간 자리를 채움으로 물들이지 않는다.** 표시 없는 회차의 주장은 걷는 이가
 *   지나온 자리를 기억하지 못한다는 것인데, 화면이 그것을 자리마다 칠해 두면
 *   화면이 걷는 이 대신 기억해 주는 꼴이 되어 주장이 무너진다. 그 회차에서 쌓이는
 *   것은 발이 낸 자국과 우리가 옆에 적는 자국 띠뿐이다.
 *
 * ── 배치
 *
 *   고리는 왼쪽, 고리 밖의 자리는 오른쪽. 좌표를 손으로 적지 않고 자료에서
 *   짓는다. 시작 자리에서 "이웃 목록의 첫 칸" 만 따라가면 반드시 어딘가에서
 *   되돌아오는데, 그 되돌아오는 마디가 곧 고리다. 고리에 들지 못한 자리는
 *   고리 위의 이웃과 같은 높이로 오른쪽 끝에 둔다. 그래서 "벗어난다" 가
 *   화면에서 가로로 길게 뻗은 한 줄이 된다.
 *
 *   폭은 캔버스에서 역산한다. 고리는 왼쪽 여백에, 바깥 자리는 오른쪽 여백에
 *   붙어 그 사이가 통째로 길이 되므로 남는 폭이 생기지 않는다 (S-piece).
 *
 * ── 세로
 *
 *   마운트 뒤 viewBox 를 다시 재지 않는다. 자리 수가 달라져도 고리 반지름과
 *   자국 띠의 칸 수만 바뀐다 (S-view).
 *
 * ── 뒷일
 *
 *   움직임은 rAF tween 하나로만 만든다. CSS transition 은 쓰지 않는다 — 되짚기는
 *   `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 한다.
 *   지연 발화를 막는 것은 **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant`
 *   와 `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다
 *   (S-scene).
 *
 * 색은 전부 design-tokens 경유다 (S-view 결정 트리).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  currentOf,
  edgeKeyOf,
  lastMoveOf,
  markedOf,
  missedOf,
  reachedOf,
  stepsOf,
  wearOf,
  type MarkVisitedOrLoopCaption,
  type MarkVisitedOrLoopGraph,
  type MarkVisitedOrLoopScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 312;

/** 좌우 여백. 고리와 바깥 자리가 이 안쪽 폭을 양끝에서 채운다. */
const SIDE = 46;
const NODE_R = 27;
/** 덧고리의 반지름 — 자리 원 바깥에 얹힌다. 표시와 "닿지 못함" 이 이 자리를 나눠 쓴다. */
const RING_R = NODE_R + 9;
const RING_R_MAX = 106;

const CAPTION_Y = 22;
const GRAPH_TOP = 34;
const TRAIL_TOP = 274;
const TRAIL_H = 28;

/**
 * 한 걸음이 미끄러지는 시간. 거리에 비례하되 상·하한을 둔다 — 걷는 이의 속도가
 * 한결같아야 고리 안의 짧은 걸음과 바깥으로 뻗는 긴 걸음이 같은 걸음으로 읽힌다.
 */
const MOVE_MS_BASE = 95;
const MOVE_MS_PER_PX = 0.36;
const MOVE_MS_MIN = 120;
const MOVE_MS_MAX = 190;

/**
 * 운동이 없어 벽시계가 `stepMs` 뿐이던 걸음에 얹는 얇은 운동들 (S-piece 800ms).
 *
 * 세기가 아니라 **그 걸음이 하는 말과 같은 동사**로 골랐다 — 회차를 여는 걸음은
 * 출발 자리가 한 번 부풀고, 표시가 남는 걸음은 고리가 자리 바깥으로 자라고,
 * 맺는 걸음은 닿지 못한 자리를 고리가 조여들며 가리키거나 벗어난 길이 그어진다.
 */
const BEGIN_MS = 260;
const MARK_MS = 200;
const SKIP_MS = 220;
const MISS_MS = 260;
const ESCAPE_MS = 280;

function moveDuration(dist: number): number {
  return Math.min(MOVE_MS_MAX, Math.max(MOVE_MS_MIN, MOVE_MS_BASE + dist * MOVE_MS_PER_PX));
}

type Pt = { x: number; y: number };

type Edge = { a: string; b: string };

/** 그래프에서 역산한 자리들. 바탕이 같으면 다시 셈하지 않는다. */
type Layout = {
  key: string;
  pos: Map<string, Pt>;
  edges: Edge[];
  slots: number;
  slotW: number;
  slotX0: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  }
  return node;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 시작 자리에서 "이웃 목록의 첫 칸" 만 따라간 자취 가운데 되돌아오는 마디.
 * 표시 없는 걸음이 갇히는 바로 그 고리다.
 */
function ringOf(graph: MarkVisitedOrLoopGraph): string[] {
  const seen: string[] = [];
  let cur = graph.start;
  const limit = graph.nodes.length;
  while (cur !== '' && !seen.includes(cur) && seen.length < limit) {
    seen.push(cur);
    const list = graph.adjacency[cur] ?? [];
    const first = list[0];
    if (first === undefined) return seen;
    cur = first;
  }
  const at = seen.indexOf(cur);
  return at >= 0 ? seen.slice(at) : seen;
}

/** 무방향 간선 목록 — 이웃 목록에서 중복을 걷어 낸다. */
function undirectedEdges(graph: MarkVisitedOrLoopGraph): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const from of graph.nodes) {
    for (const to of graph.adjacency[from] ?? []) {
      const key = edgeKeyOf(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: from, b: to });
    }
  }
  return out;
}

/** 바탕이 달라졌나 가리는 열쇠. 같으면 자리 셈을 다시 하지 않는다. */
function layoutKeyOf(graph: MarkVisitedOrLoopGraph): string {
  const adjacency = graph.nodes.map((n) => `${n}>${(graph.adjacency[n] ?? []).join('')}`).join('|');
  return `${graph.nodes.join(',')}#${adjacency}#${graph.start}#${graph.maxSteps}`;
}

/**
 * 자리를 **한 번에 전부 셈한 뒤** 돌려준다.
 *
 * 그리면서 이웃의 지금 좌표를 되읽으면 순회 순서가 곧 숨은 상태가 된다 — 바깥
 * 자리는 고리 위의 이웃 높이에 맞추므로 특히 그렇다. 고리를 먼저 다 놓고 그
 * 다음에 바깥을 놓는다.
 */
function layoutOf(graph: MarkVisitedOrLoopGraph): Layout {
  const pos = new Map<string, Pt>();
  const ring = ringOf(graph);
  const outside = graph.nodes.filter((n) => !ring.includes(n));

  const ringR = Math.min(RING_R_MAX, Math.max(48, Math.floor((W - SIDE * 2) / 4) - NODE_R));
  const ringCx = SIDE + NODE_R + ringR;
  const ringCy = GRAPH_TOP + ringR + RING_R;
  const outsideX = W - SIDE - NODE_R;

  // 고리는 시작 자리를 꼭대기에 두고 시계 반대 방향으로 돈다. 그러면 고리로
  // 되돌아오기 직전의 자리가 오른쪽에 서고, 바깥으로 난 길이 가로로 뻗는다.
  const turn = (Math.PI * 2) / Math.max(1, ring.length);
  ring.forEach((name, i) => {
    const theta = -Math.PI / 2 - i * turn;
    pos.set(name, {
      x: ringCx + ringR * Math.cos(theta),
      y: ringCy + ringR * Math.sin(theta),
    });
  });
  outside.forEach((name, i) => {
    const anchor = (graph.adjacency[name] ?? []).find((a) => pos.has(a));
    const anchorPos = anchor === undefined ? undefined : pos.get(anchor);
    pos.set(name, { x: outsideX, y: (anchorPos?.y ?? ringCy) + i * (NODE_R * 2 + 14) });
  });

  // 자국 띠 — 빈 칸까지 미리 그려 두는 것은 "열두 걸음이 얼마나 긴가" 가 첫
  // 화면부터 보여야 하기 때문이다.
  const slots = Math.max(1, graph.maxSteps + 1);
  const slotW = Math.max(14, Math.floor((W - SIDE * 2) / slots));

  return {
    key: layoutKeyOf(graph),
    pos,
    edges: undirectedEdges(graph),
    slots,
    slotW,
    slotX0: Math.round((W - slotW * slots) / 2),
  };
}

export const markVisitedOrLoopStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MarkVisitedOrLoopScene> {
    const svg = params.canvas;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const c = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback. 러너가 주는 조회기에는 저작자 오버라이드가
    // 이미 얹혀 있다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 뒷일 관리 ────────────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();

    /**
     * 기다리다 만 것을 깨우는 자리. 타이머·프레임을 거두는 것만으로는 모자란다 —
     * 취소된 tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 그것을
     * 기다리므로 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 요소를 매번 새로 만들지만 **손잡이 Map 은 재할당된다** — 옛
     * 세대의 프레임이 `await` 뒤에 깨어나 새 손잡이를 타고 살아 있는 화면에 쓸 수
     * 있다. 그래서 빗장을 둔다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    const schedule = (fn: (now: number) => void): void => {
      const id = requestAnimationFrame((now) => {
        frames.delete(id);
        fn(now);
      });
      frames.add(id);
    };

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(ms: number, mine: number, paint: (p: number) => void): Promise<void> {
      const draw = (p: number): void => {
        if (alive(mine)) paint(p);
      };
      draw(0);
      if (destroyed || ms <= 0) {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = performance.now();
        const run = (now: number): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = Math.min(1, (now - t0) / ms);
          draw(p);
          if (p < 1) schedule(run);
          else finish();
        };
        schedule(run);
      });
    }

    // ── 층. 아래에서 위로: 선 → 벗어난 길 → 건너뜀 × → 덧고리 → 걷는 이 → 자리 → 자국 띠
    const root = el('g');
    const gEdges = el('g');
    const gEscape = el('g');
    const gStrike = el('g');
    const gRings = el('g');
    const gWalker = el('g');
    const gNodes = el('g');
    const gTrail = el('g');
    root.append(gEdges, gEscape, gStrike, gRings, gWalker, gNodes, gTrail);

    /**
     * 캡션은 재건 밖에 있다 — 정적 그리기가 다시 짓지 않고 계속 쓴다. 그래서
     * 글자를 **매번 명시로** 쓴다. 자기 글자를 도로 읽어 덧붙이지 않는다.
     */
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);
    svg.appendChild(root);

    // ── 정적 그리기가 매번 다시 채우는 손잡이들 ──────────────────────────
    const nodeEls = new Map<string, { circle: SVGCircleElement; label: SVGTextElement }>();
    const edgeEls = new Map<string, SVGLineElement>();
    const markEls = new Map<string, SVGCircleElement>();
    const missEls = new Map<string, SVGCircleElement>();
    const crossEls = new Map<string, SVGGElement>();
    let escapeEl: SVGLineElement | null = null;

    let layout: Layout | null = null;
    function layoutFor(graph: MarkVisitedOrLoopGraph): Layout {
      const key = layoutKeyOf(graph);
      if (!layout || layout.key !== key) layout = layoutOf(graph);
      return layout;
    }

    function at(lay: Layout, node: string): Pt {
      return lay.pos.get(node) ?? { x: SIDE, y: GRAPH_TOP };
    }

    /** 자국의 깊이. 네 번을 넘으면 더 파이지 않는다 — 읽을 수 있는 굵기에 상한이 있다. */
    function edgeLook(count: number): { width: number; color: string } {
      if (count <= 0) return { width: 2, color: c.border };
      return { width: 2 + Math.min(count, 4) * 1.7, color: count >= 3 ? c.text : c.textMuted };
    }

    function clear(group: SVGGElement): void {
      while (group.firstChild) group.removeChild(group.firstChild);
    }

    /** 자리 하나의 칠. 채움은 값의 형편만 말한다. */
    function paintNode(node: string, here: boolean): void {
      const parts = nodeEls.get(node);
      if (!parts) return;
      parts.circle.setAttribute('fill', here ? c.itemActive : c.itemDefault);
      parts.circle.setAttribute('stroke', here ? c.itemActive : c.border);
      parts.label.setAttribute('fill', here ? c.stateInk : c.text);
    }

    /** 건너뜀 표 하나 — 간선 한가운데 서는 ×. */
    function makeCross(mid: Pt): SVGGElement {
      const cross = el('g', { transform: `translate(${mid.x} ${mid.y})` });
      for (const [x1, y1, x2, y2] of [
        [-8, -8, 8, 8],
        [-8, 8, 8, -8],
      ]) {
        cross.appendChild(
          el('line', {
            x1,
            y1,
            x2,
            y2,
            stroke: c.danger,
            'stroke-width': 3.5,
            'stroke-linecap': 'round',
          }),
        );
      }
      return cross;
    }

    // ── 정적 화면 ────────────────────────────────────────────────────────

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 시작하므로 되돌릴 명령이 필요 없다. 걷는 이는 여기서 짓지 않는다 —
     * 정지 화면에는 걷는 중인 사람이 없고, 아직 없는 것은 숨기지 말고 짓지 않는다.
     */
    function drawStatic(scene: MarkVisitedOrLoopScene): Layout {
      const lay = layoutFor(scene.graph);
      for (const g of [gEdges, gEscape, gStrike, gRings, gWalker, gNodes, gTrail]) clear(g);
      nodeEls.clear();
      edgeEls.clear();
      markEls.clear();
      missEls.clear();
      crossEls.clear();
      escapeEl = null;

      const wear = wearOf(scene);
      const current = currentOf(scene);
      const marked = markedOf(scene);
      // 닿지 못한 자리는 **결말이 난 뒤에만** 뜻이 있다 — 걷는 중에는 아직 닿을 수 있다.
      const missed = scene.ending === null ? [] : missedOf(scene);

      // 간선 — 굵기와 색이 자국의 깊이만 말한다.
      for (const edge of lay.edges) {
        const pa = at(lay, edge.a);
        const pb = at(lay, edge.b);
        const key = edgeKeyOf(edge.a, edge.b);
        const look = edgeLook(wear.get(key) ?? 0);
        const line = el('line', {
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          stroke: look.color,
          'stroke-width': look.width,
          'stroke-linecap': 'round',
        });
        edgeEls.set(key, line);
        gEdges.appendChild(line);
      }

      // 벗어난 길 — 고리 밖으로 나간 마지막 마디. 자국 위에 따로 얹어 두 어휘가
      // 한 속성을 나눠 쓰지 않게 한다.
      const lastMove = lastMoveOf(scene);
      if (scene.ending === 'escaped' && lastMove) {
        const pa = at(lay, lastMove.from);
        const pb = at(lay, lastMove.to);
        escapeEl = el('line', {
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          stroke: c.accent,
          'stroke-width': 5,
          'stroke-linecap': 'round',
        });
        gEscape.appendChild(escapeEl);
      }

      // 짚어 보고 건너뛴 이웃 — 회차가 끝날 때까지 쌓인다.
      for (const skip of scene.skipped) {
        const key = edgeKeyOf(skip.from, skip.to);
        if (crossEls.has(key)) continue;
        const pa = at(lay, skip.from);
        const pb = at(lay, skip.to);
        const cross = makeCross({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
        crossEls.set(key, cross);
        gStrike.appendChild(cross);
      }

      // 덧고리 — 표시가 남았다 / 끝내 닿지 못했다. 한 자리를 배타적으로 나눠 쓴다.
      for (const node of marked) {
        const p = at(lay, node);
        const ring = el('circle', {
          cx: p.x,
          cy: p.y,
          r: RING_R,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 3,
        });
        markEls.set(node, ring);
        gRings.appendChild(ring);
      }
      for (const node of missed) {
        const p = at(lay, node);
        const ring = el('circle', {
          cx: p.x,
          cy: p.y,
          r: RING_R,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 2.5,
          'stroke-dasharray': '5 4',
        });
        missEls.set(node, ring);
        gRings.appendChild(ring);
      }

      // 자리.
      for (const node of scene.graph.nodes) {
        const p = at(lay, node);
        const circle = el('circle', { cx: p.x, cy: p.y, r: NODE_R, 'stroke-width': 2 });
        const label = el('text', {
          x: p.x,
          y: p.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
        });
        label.textContent = node;
        gNodes.append(circle, label);
        nodeEls.set(node, { circle, label });
        paintNode(node, node === current);
      }

      // 자국 띠 — 밟은 자리를 밟은 차례대로 적는다.
      for (let i = 0; i < lay.slots; i += 1) {
        const boxW = Math.max(8, lay.slotW - 6);
        const x = lay.slotX0 + i * lay.slotW + 3;
        const filled = i < scene.trail.length;
        const latest = filled && i === scene.trail.length - 1;
        const box = el('rect', {
          x,
          y: TRAIL_TOP,
          width: boxW,
          height: TRAIL_H,
          rx: 5,
          fill: latest ? c.itemActive : filled ? c.bgSubtle : 'none',
          stroke: latest ? c.itemActive : c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': filled ? 'none' : '3 3',
        });
        const label = el('text', {
          x: x + boxW / 2,
          y: TRAIL_TOP + TRAIL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: latest ? c.stateInk : c.text,
        });
        label.textContent = filled ? (scene.trail[i] ?? '') : '';
        gTrail.append(box, label);
      }

      caption.textContent = captionText(scene);
      return lay;
    }

    /**
     * 문안은 여기서 만든다. 장면은 무엇을 말할지만 쥐고, **수는 장면에서 센다**
     * (C10 · 두 자리에서 세지 않기).
     */
    function captionText(scene: MarkVisitedOrLoopScene): string {
      const said: MarkVisitedOrLoopCaption | null = scene.caption;
      if (!said) return '';
      switch (said.kind) {
        case 'noMarks':
          return t('caption.noMarks', 'No marks. From each place, take the first neighbor.');
        case 'marksOn':
          return t('caption.marksOn', 'Now every place visited leaves a mark.');
        case 'alreadyMarked':
          return t('caption.alreadyMarked', '{to} already carries a mark — skip it.', {
            to: said.to,
          });
        case 'stillInside':
          return t(
            'caption.stillInside',
            '{steps} steps, only {reached} places. {missed} was never reached.',
            {
              steps: stepsOf(scene),
              reached: reachedOf(scene).length,
              missed: missedOf(scene).join(', '),
            },
          );
        case 'wentOut':
          return t('caption.wentOut', '{steps} steps, all {reached} places. The walk went outside.', {
            steps: stepsOf(scene),
            reached: reachedOf(scene).length,
          });
      }
    }

    // ── 운동 ─────────────────────────────────────────────────────────────

    /** 표시 고리가 자리 바깥으로 자란다. 정적은 이미 다 자란 것을 세워 두었다. */
    function growMark(node: string, e: number): void {
      const ring = markEls.get(node);
      if (!ring) return;
      if (e >= 1) {
        ring.setAttribute('r', String(RING_R));
        ring.removeAttribute('opacity');
        return;
      }
      ring.setAttribute('r', String(NODE_R + 2 + (RING_R - NODE_R - 2) * e));
      ring.setAttribute('opacity', String(e));
    }

    /**
     * 이 걸음에 흐르게 할 것.
     *
     * 걸음마다 **시계 하나**로 돌린다. 옮기는 것과 표시가 남는 것은 한 뜻으로 묶인
     * 운동이라 나누면 `render` 의 Promise 가 둘 다 선 뒤에 풀린다고 말할 수 없다.
     */
    async function flow(scene: MarkVisitedOrLoopScene, lay: Layout, mine: number): Promise<void> {
      switch (scene.step) {
        // 회차가 열린다 — 출발 자리가 한 번 부풀고, 표시를 읽는 회차면 고리가 자란다.
        case 'begin': {
          const start = currentOf(scene);
          if (start === null) return;
          const circle = nodeEls.get(start)?.circle;
          await animate(BEGIN_MS, mine, (p) => {
            if (circle) {
              circle.setAttribute('r', p >= 1 ? String(NODE_R) : String(NODE_R + 5 * Math.sin(Math.PI * p)));
            }
            if (scene.marks) growMark(start, easeInOut(p));
          });
          return;
        }

        // 한 자리 옮긴다 — 걷는 이가 미끄러지고 밟은 길이 그만큼 더 파인다.
        case 'move': {
          const move = lastMoveOf(scene);
          if (!move) return;
          const from = at(lay, move.from);
          const to = at(lay, move.to);
          const key = edgeKeyOf(move.from, move.to);
          const count = wearOf(scene).get(key) ?? 1;
          const before = edgeLook(count - 1);
          const after = edgeLook(count);
          const line = edgeEls.get(key);

          // 표시는 **처음 밟는 자리**에만 새로 남는다. 장면에서 가린다.
          const fresh =
            scene.marks && !scene.trail.slice(0, -1).includes(move.to) ? move.to : null;

          const moveMs = moveDuration(Math.hypot(to.x - from.x, to.y - from.y));
          const total = moveMs + (fresh === null ? 0 : MARK_MS);
          const share = moveMs / total;

          // 자리를 뜨는 동안에는 어느 자리도 "지금" 이 아니다. 끝에서 정적 그리기가
          // 도착 자리를 다시 물들인다.
          paintNode(move.to, false);
          const walker = el('circle', {
            r: 10,
            cx: from.x,
            cy: from.y,
            fill: c.itemActive,
            stroke: c.bg,
            'stroke-width': 2.5,
          });
          gWalker.appendChild(walker);
          if (fresh !== null) growMark(fresh, 0);

          await animate(total, mine, (p) => {
            const e = easeInOut(clamp01(p / share));
            walker.setAttribute('cx', String(from.x + (to.x - from.x) * e));
            walker.setAttribute('cy', String(from.y + (to.y - from.y) * e));
            if (line) {
              line.setAttribute('stroke', after.color);
              line.setAttribute(
                'stroke-width',
                e >= 1 ? String(after.width) : String(before.width + (after.width - before.width) * e),
              );
            }
            // 표시는 걷는 이가 닿은 **뒤에** 남는다 — 한 시계 안에서 뒤쪽 몫을 쓴다.
            if (fresh !== null) growMark(fresh, clamp01((p - share) / (1 - share)));
          });
          return;
        }

        // 이미 표시가 있는 이웃을 짚어 본다 — 그 자리에 × 가 선다.
        case 'skip': {
          const last = scene.skipped[scene.skipped.length - 1];
          if (!last) return;
          const cross = crossEls.get(edgeKeyOf(last.from, last.to));
          if (!cross) return;
          const pa = at(lay, last.from);
          const pb = at(lay, last.to);
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          await animate(SKIP_MS, mine, (p) => {
            if (p >= 1) {
              cross.setAttribute('transform', `translate(${mx} ${my})`);
              cross.removeAttribute('opacity');
              return;
            }
            const e = easeInOut(p);
            cross.setAttribute('transform', `translate(${mx} ${my}) scale(${0.4 + 0.6 * e})`);
            cross.setAttribute('opacity', String(e));
          });
          return;
        }

        // 고리에 갇힌 채 끝났다 — 닿지 못한 자리를 고리가 바깥에서 조여들며 가리킨다.
        case 'stalled': {
          const rings = [...missEls.values()];
          if (rings.length === 0) return;
          await animate(MISS_MS, mine, (p) => {
            const e = easeInOut(p);
            for (const ring of rings) {
              if (p >= 1) {
                ring.setAttribute('r', String(RING_R));
                ring.removeAttribute('opacity');
                continue;
              }
              ring.setAttribute('r', String(RING_R + 16 * (1 - e)));
              ring.setAttribute('opacity', String(e));
            }
          });
          return;
        }

        // 고리 바깥으로 나갔다 — 그 길이 고리 쪽에서 바깥으로 그어진다.
        case 'escaped': {
          const line = escapeEl;
          const move = lastMoveOf(scene);
          if (!line || !move) return;
          const pa = at(lay, move.from);
          const pb = at(lay, move.to);
          const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
          await animate(ESCAPE_MS, mine, (p) => {
            if (p >= 1) {
              line.removeAttribute('stroke-dasharray');
              line.removeAttribute('stroke-dashoffset');
              return;
            }
            const e = easeInOut(p);
            line.setAttribute('stroke-dasharray', `${len} ${len}`);
            line.setAttribute('stroke-dashoffset', String(len * (1 - e)));
          });
          return;
        }

        default:
          return;
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤 `animate` 일 때만 방금 달라진 것을 흐르게 하고, 끝나면
     * **다시 통째로 세운다** — 운동이 남긴 속성과 보간 끝자리가 그 한 번에 전부
     * 사라진다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
     */
    async function render(
      next: MarkVisitedOrLoopScene,
      /** 출발 자리도 자국의 깊이도 `next` 의 자취에서 되셈한다 (S-scene). */
      _prev: MarkVisitedOrLoopScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const lay = drawStatic(next);
      if (!opts.animate || next.step === null) return;
      await flow(next, lay, mine);
      if (!alive(mine)) return;
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸려 있는 운동은 여기서 전부 결과를 낸다 — 남기면 알고리즘이 멈춘 자리에서
        // 영영 깨어나지 못한다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        nodeEls.clear();
        edgeEls.clear();
        markEls.clear();
        missEls.clear();
        crossEls.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
