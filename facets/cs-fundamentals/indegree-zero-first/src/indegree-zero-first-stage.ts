/**
 * indegree-zero-first stage — "떨어져 나온다" 를 그리는 캔버스.
 *
 * ── 왜 이 배치인가
 * 이 조각의 동사는 낙하다. 그래서 위에는 그래프를, 아래에는 나온 순서를 담는
 * 줄을 둔다. 정점이 이고 있는 화살의 수는 머리 위에 얹힌 배지로 보이고, 그것이
 * 0 이 되어야 정점이 아래 줄로 **떨어진다.** 화살이 사라질 때도 그냥 꺼지지 않고
 * 떨어져 나가며, 배지의 옛 숫자도 함께 떨어진다. 화면의 모든 소멸이 낙하다.
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * `prev` 는 들추지 않는다. 떨어지기 전의 자리는 그래프 자리이고, 줄기 전의 수는
 * "지금 수 + 이번에 떨어진 화살" 이라 출발 그림을 전부 `next` 에서 되셈한다.
 *
 * ── 진입 차수를 화면에서 도로 읽지 않는다
 * 배지의 글자는 **결과**이지 출처가 아니다. 그릴 때마다
 * `indegreeOf(edges, droppedFrom, id)` 가 바탕 간선에서 다시 센다. 옮기기 전에는
 * 그 수가 배지의 `textContent` 에만 있었고 다음 수는 payload 에서 왔다.
 *
 * ── 층의 경계가 아래 줄에 남는다
 * 같은 순간에 꺼낼 수 있게 된 것들이 한 무리다. 그 무리가 바뀌는 자리에 칸막이를
 * 세워, 완주 화면에서도 "이 둘은 함께 풀렸고 그 다음은 그 뒤에 풀렸다" 가 읽힌다.
 *
 * ── 채움과 테두리를 가른다
 * **채움은 값의 형편** — 막혀 있다 / 지금 꺼낼 수 있다 / 이미 나왔다.
 * **테두리는 이 걸음이 짚은 자리** — 이번에 이고 있던 수가 줄어든 정점.
 * 두 칠이 부딪히지 않아 맞바꿔도 읽기가 뒤집히지 않는다.
 *
 * ── 같은 층 안에서는 아래부터 알파벳 순으로 쌓는다
 * 층(가장 긴 경로 깊이) 이 열을 정하고, 같은 층 안의 세로 자리는 알파벳이
 * 앞선 것을 아래에 둔다. 먼저 떨어질 것이 아래에 있어야 낙하 경로가 비어 있다.
 *
 * ── 가로는 캔버스에서 역산한다
 * 순서 줄의 칸 폭을 정점 수로 나눠 얻고, 그 첫 칸과 끝 칸의 중심이 그래프
 * 열의 좌우 끝이 된다. 상수는 칸 폭의 **상한** 하나뿐이다 (S-piece).
 *
 * 세로는 마운트 뒤 바뀌지 않는다. 층이 많아지면 층 간격을 줄여 담는다 (S-view).
 *
 * ── 뒷일
 * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT) — 되짚기는 `animate:false`
 * 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 한다. rAF 보간 하나로
 * 산다. 기다리던 약속은 `destroy` 가 전부 푼다 (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  indegreeOf,
  layerOf,
  liveEdges,
  type IndegreeZeroFirstCaption,
  type IndegreeZeroFirstScene,
  type IndegreeZeroFirstSceneEdge,
  type IndegreeZeroFirstStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스
const W = PIECE_CANVAS_W;
const H = 300;
const CANVAS_PAD = 16;

// ── 순서 줄 (아래)
const SLOT_MAX_W = 88;
const SLOT_H = 48;
const TRACK_Y = 236;

// ── 그래프 (위)
const NODE_R = 21;
const GRAPH_MID_Y = 116;
const GRAPH_BAND_H = 100;
const ROW_GAP_MAX = 100;
const BADGE_W = 26;
const BADGE_H = 20;
/** 배지가 머리에 얹히는 높이 — 정점 위쪽 경계에서 이만큼 띄운다. */
const BADGE_LIFT = 3;
/** 층을 건너뛰는 간선이 가운데 정점 아래로 돌아가는 깊이. */
const BOW_DIP = 40;
const ARROW_LEN = 9;
const ARROW_HALF = 4.5;

const CAPTION_Y = 288;

// ── 낙하 거리
const FALL_ARROW = 54;
const FALL_BADGE = 46;
const FALL_GHOST = 40;
/** 배지가 머리에 내려앉기 전에 떠 있는 높이. */
const BADGE_RISE = 14;
/** 새 숫자가 배지 안에서 내려앉는 높이. */
const DIGIT_RISE = 10;
/** 헐거워진 정점이 한 번 주저앉는 깊이. */
const BOB_READY = 5;
/** 다 나온 뒤 왼쪽부터 훑을 때 들리는 높이. */
const BOB_FINISH = 6;

// ── 시간
const D_COUNT = 560;
/** 배지가 하나씩 늦게 출발하는 몫. */
const LEAD_COUNT = 0.1;
const D_READY = 260;
const D_TAKE = 480;
const D_DROP = 500;
/** `D_DROP` 중 화살이 물든 채 머무는 앞부분. */
const HOLD_DROP = 0.28;
const D_FINISH_STEP = 90;
const D_FINISH_TAIL = 170;

type Pt = { x: number; y: number };

/** 바탕에서 역산한 자리들. 바탕이 같으면 다시 셈하지 않는다. */
type Layout = {
  key: string;
  /** 그래프에서 정점이 서 있는 자리. */
  graphPos: Map<string, Pt>;
  /** 순서 줄 칸의 중심 x. */
  slotX: number[];
  slotW: number;
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 보간 끝자리가 문자열을 가르지 않게 소수 둘째 자리에서 끊는다. */
function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

/** 떨어지는 것은 점점 빨라진다. */
function easeFall(t: number): number {
  return t * t;
}

/** 내려앉는 것은 점점 느려진다. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** 갔다 돌아오는 한 번의 출렁임. */
function bob(t: number): number {
  return Math.sin(Math.PI * clamp01(t));
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function glyph(at: Pt, value: string, fill: string, size: string, weight: string): SVGTextElement {
  const t = svg('text', {
    x: n(at.x),
    y: n(at.y),
    fill,
    'font-family': fonts.mono,
    'font-size': size,
    'font-weight': weight,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  t.textContent = value;
  return t;
}

function shift(x: number, y: number): string {
  return `translate(${n(x)} ${n(y)})`;
}

/** 가장 긴 경로 깊이 = 열 번호. DAG 면 정점 수만큼 완화하면 수렴한다. */
function computeDepths(
  nodes: readonly string[],
  edges: readonly IndegreeZeroFirstSceneEdge[],
): Map<string, number> {
  const depth = new Map<string, number>();
  for (const id of nodes) depth.set(id, 0);
  for (let round = 0; round < nodes.length; round++) {
    let changed = false;
    for (const e of edges) {
      const cand = (depth.get(e.from) ?? 0) + 1;
      if (cand > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, cand);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * 바탕만으로 자리를 한 번에 셈한다.
 *
 * 그리면서 이웃의 "지금 좌표" 를 읽으면 순회 순서가 곧 숨은 상태가 되므로,
 * 자리를 먼저 다 정해 두고 그 다음에 그린다.
 */
function layoutOf(scene: IndegreeZeroFirstScene): Layout {
  const count = Math.max(1, scene.nodes.length);
  const slotW = Math.min(SLOT_MAX_W, Math.floor((W - CANVAS_PAD * 2) / count) - 8);
  const firstX = CANVAS_PAD + slotW / 2;
  const lastX = W - firstX;
  const spanX = (index: number, total: number): number =>
    total <= 1 ? W / 2 : firstX + (index * (lastX - firstX)) / (total - 1);

  const slotX: number[] = [];
  for (let i = 0; i < scene.nodes.length; i++) slotX.push(spanX(i, scene.nodes.length));

  const depth = computeDepths(scene.nodes, scene.edges);
  const columns = new Map<number, string[]>();
  for (const id of scene.nodes) {
    const d = depth.get(id) ?? 0;
    const bucket = columns.get(d);
    if (bucket) bucket.push(id);
    else columns.set(d, [id]);
  }
  const depths = [...columns.keys()].sort((a, b) => a - b);
  const tallest = Math.max(1, ...[...columns.values()].map((v) => v.length));
  const rowGap = tallest > 1 ? Math.min(ROW_GAP_MAX, Math.floor(GRAPH_BAND_H / (tallest - 1))) : 0;

  const graphPos = new Map<string, Pt>();
  depths.forEach((d, columnIndex) => {
    // 아래부터 알파벳 순 — 먼저 떨어질 것이 아래에 있어야 길이 비어 있다.
    const members = (columns.get(d) ?? []).slice().sort();
    const k = members.length;
    members.forEach((id, i) => {
      graphPos.set(id, {
        x: spanX(columnIndex, depths.length),
        y: GRAPH_MID_Y + ((k - 1) / 2 - i) * rowGap,
      });
    });
  });

  return {
    key: JSON.stringify([scene.nodes, scene.edges]),
    graphPos,
    slotX,
    slotW,
  };
}

function badgeAnchor(at: Pt): Pt {
  return { x: at.x, y: at.y - NODE_R - BADGE_LIFT - BADGE_H / 2 };
}

/** 화살 하나가 놓일 길. 바탕만으로 정해진다. */
type ArrowShape = { d: string; points: string };

function arrowShape(
  edge: IndegreeZeroFirstSceneEdge,
  at: Layout,
  depth: Map<string, number>,
): ArrowShape | null {
  const from = at.graphPos.get(edge.from);
  const to = at.graphPos.get(edge.to);
  if (!from || !to) return null;

  const skips = (depth.get(edge.to) ?? 0) - (depth.get(edge.from) ?? 0) >= 2;
  let d: string;
  let tip: Pt;
  let dir: Pt;

  if (skips) {
    // 가운데 열 아래로 돌아 내려갔다 올라온다. 곧게 그으면 사이에 있는
    // 정점의 배지를 가로지른다.
    const flatY = (from.y + to.y) / 2;
    const dip = Math.min(GRAPH_MID_Y + BOW_DIP, TRACK_Y - SLOT_H / 2 - 14);
    const ctrl = { x: (from.x + to.x) / 2, y: 2 * dip - flatY };
    const u0 = unit(from, ctrl);
    const u1 = unit(ctrl, to);
    const p0 = { x: from.x + u0.x * (NODE_R + 3), y: from.y + u0.y * (NODE_R + 3) };
    tip = { x: to.x - u1.x * (NODE_R + 6), y: to.y - u1.y * (NODE_R + 6) };
    dir = u1;
    d = `M ${n(p0.x)} ${n(p0.y)} Q ${n(ctrl.x)} ${n(ctrl.y)} ${n(tip.x)} ${n(tip.y)}`;
  } else {
    const u = unit(from, to);
    const p0 = { x: from.x + u.x * (NODE_R + 3), y: from.y + u.y * (NODE_R + 3) };
    tip = { x: to.x - u.x * (NODE_R + 6), y: to.y - u.y * (NODE_R + 6) };
    dir = u;
    d = `M ${n(p0.x)} ${n(p0.y)} L ${n(tip.x)} ${n(tip.y)}`;
  }

  const back = { x: tip.x - dir.x * ARROW_LEN, y: tip.y - dir.y * ARROW_LEN };
  const perp = { x: -dir.y, y: dir.x };
  const points = [
    `${n(tip.x)},${n(tip.y)}`,
    `${n(back.x + perp.x * ARROW_HALF)},${n(back.y + perp.y * ARROW_HALF)}`,
    `${n(back.x - perp.x * ARROW_HALF)},${n(back.y - perp.y * ARROW_HALF)}`,
  ].join(' ');

  return { d, points };
}

/** 화살 하나를 세운다. 걸려 있는 것과 떨어지는 것이 같은 모양을 쓴다. */
function arrowEl(shape: ArrowShape, color: string): SVGGElement {
  const g = svg('g');
  g.append(
    svg('path', {
      d: shape.d,
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
    svg('polygon', { points: shape.points, fill: color }),
  );
  return g;
}

export const indegreeZeroFirstStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<IndegreeZeroFirstScene> {
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const root = svg('g');
    const gTrack = svg('g');
    const gEdges = svg('g');
    const gNodes = svg('g');
    const gBadges = svg('g');
    const gFx = svg('g');
    const captionEl = glyph({ x: W / 2, y: CAPTION_Y }, '', c.text, fontSizes.md, '500');
    captionEl.setAttribute('font-family', fonts.body);
    root.append(gTrack, gEdges, gNodes, gBadges, gFx, captionEl);
    params.canvas.appendChild(root);

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
     * 정적 그리기가 요소를 매번 새로 만들므로 살아남은 옛 운동이 쥔 것은 이미
     * 떨어져 나간 노드다. 그래도 빗장을 둔다 — 깨어난 프레임이 헛일을 하는 것을
     * 여기서 끊고, 무엇이 유효한 세대인지가 코드에 적힌다.
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
    function animate(
      duration: number,
      my: number,
      apply: (progress: number) => void,
    ): Promise<void> {
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

    // ── 정적 그리기 ──────────────────────────────────────────────────────
    /** 이번 그림의 손잡이들. 매번 새로 만들어지므로 매번 갈아 끼운다. */
    const nodeEls = new Map<string, SVGGElement>();
    const badgeEls = new Map<string, SVGGElement>();
    const digitEls = new Map<string, SVGTextElement>();
    /** 그 정점이 지금 서 있는 자리. `order` 에서 파생된다. */
    const nodeAt = new Map<string, Pt>();

    let layout: Layout | null = null;
    function layoutFor(scene: IndegreeZeroFirstScene): Layout {
      const key = JSON.stringify([scene.nodes, scene.edges]);
      if (!layout || layout.key !== key) layout = layoutOf(scene);
      return layout;
    }

    /** 이번 걸음에 이고 있던 수가 줄어든 정점 — 테두리로 짚는다. */
    function markedByStep(scene: IndegreeZeroFirstScene): Set<string> {
      const marked = new Set<string>();
      if (scene.step?.kind !== 'drop') return marked;
      const from = scene.step.from;
      for (const edge of scene.edges) if (edge.from === from) marked.add(edge.to);
      return marked;
    }

    function drawTrack(scene: IndegreeZeroFirstScene, at: Layout): void {
      scene.nodes.forEach((_id, i) => {
        const cx = at.slotX[i];
        gTrack.appendChild(
          svg('rect', {
            x: n(cx - at.slotW / 2),
            y: n(TRACK_Y - SLOT_H / 2),
            width: n(at.slotW),
            height: SLOT_H,
            rx: 10,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
        gTrack.appendChild(
          glyph(
            { x: cx - at.slotW / 2 + 12, y: TRACK_Y - SLOT_H / 2 + 12 },
            String(i + 1),
            c.textMuted,
            fontSizes.xs,
            '500',
          ),
        );
      });
    }

    /**
     * 층이 바뀌는 자리에 세우는 칸막이.
     *
     * 같은 순간에 꺼낼 수 있게 된 것들이 한 무리다. **이 조각의 주장이 그 무리에
     * 있는데 옮기기 전에는 완주 화면에 자취가 없었다** — 노란 칠이 나중에 덮였다.
     * 정적 그리기에 들어가야 되짚었을 때도 남는다 (S-scene PREFER).
     */
    function drawLayerBreaks(scene: IndegreeZeroFirstScene, at: Layout): void {
      for (let i = 1; i < scene.order.length; i++) {
        const before = layerOf(scene.layers, scene.order[i - 1]);
        const here = layerOf(scene.layers, scene.order[i]);
        if (before === here) continue;
        const x = (at.slotX[i - 1] + at.slotX[i]) / 2;
        gTrack.appendChild(
          svg('line', {
            x1: n(x),
            y1: n(TRACK_Y - SLOT_H / 2 - 6),
            x2: n(x),
            y2: n(TRACK_Y + SLOT_H / 2 + 6),
            stroke: c.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
      }
    }

    /** 아직 걸려 있는 화살만 그린다. 떨어진 것은 짓지 않는다. */
    function drawEdges(scene: IndegreeZeroFirstScene, at: Layout): void {
      const depth = computeDepths(scene.nodes, scene.edges);
      for (const edge of liveEdges(scene)) {
        const shape = arrowShape(edge, at, depth);
        if (!shape) continue;
        gEdges.appendChild(arrowEl(shape, c.textMuted));
      }
    }

    function drawNodes(scene: IndegreeZeroFirstScene, at: Layout): void {
      const marked = markedByStep(scene);
      for (const id of scene.nodes) {
        const slot = scene.order.indexOf(id);
        const taken = slot >= 0;
        const home = at.graphPos.get(id) ?? { x: W / 2, y: GRAPH_MID_Y };
        const here: Pt = taken ? { x: at.slotX[slot] ?? home.x, y: TRACK_Y } : home;
        nodeAt.set(id, here);

        // 채움은 값의 형편 — 막힘 / 지금 꺼낼 수 있음 / 이미 나왔음.
        const ready = !taken && layerOf(scene.layers, id) !== null;
        const fill = taken ? c.itemSorted : ready ? c.itemPivot : c.itemDefault;
        const ink = taken ? c.textInverse : ready ? c.stateInk : c.text;
        // 테두리는 이 걸음이 짚은 자리 — 방금 수가 줄어든 정점.
        const stroke = marked.has(id) ? c.itemActive : taken ? c.itemSorted : ready ? c.stateInk : c.border;

        const g = svg('g', { transform: shift(here.x, here.y) });
        g.append(
          svg('circle', {
            cx: 0,
            cy: 0,
            r: NODE_R,
            fill,
            stroke,
            'stroke-width': marked.has(id) ? 3 : 2,
          }),
          glyph({ x: 0, y: 0 }, id, ink, fontSizes.md, '700'),
        );
        gNodes.appendChild(g);
        nodeEls.set(id, g);
      }
    }

    /**
     * 머리 위 배지. 수는 바탕 간선에서 다시 센다 — 글자를 도로 읽지 않는다.
     *
     * 이미 꺼내진 정점에는 배지가 없다. 이고 있는 것이 없어서 꺼내진 것이라
     * 배지가 함께 떨어져 나간 것이 화면의 말이다.
     */
    function drawBadges(scene: IndegreeZeroFirstScene, at: Layout): void {
      if (!scene.counted) return;
      const marked = markedByStep(scene);
      for (const id of scene.nodes) {
        if (scene.order.includes(id)) continue;
        const home = at.graphPos.get(id);
        if (!home) continue;
        const anchor = badgeAnchor(home);
        const ready = layerOf(scene.layers, id) !== null;

        const g = svg('g', { transform: shift(0, 0) });
        g.append(
          svg('rect', {
            x: n(anchor.x - BADGE_W / 2),
            y: n(anchor.y - BADGE_H / 2),
            width: BADGE_W,
            height: BADGE_H,
            rx: 6,
            fill: ready ? c.itemPivot : c.bg,
            stroke: marked.has(id) ? c.itemActive : ready ? c.stateInk : c.border,
            'stroke-width': marked.has(id) ? 2.5 : 1.5,
          }),
        );
        const digit = glyph(
          anchor,
          String(indegreeOf(scene.edges, scene.droppedFrom, id)),
          ready ? c.stateInk : c.text,
          fontSizes.sm,
          '700',
        );
        digit.setAttribute('transform', shift(0, 0));
        g.appendChild(digit);
        gBadges.appendChild(g);
        badgeEls.set(id, g);
        digitEls.set(id, digit);
      }
    }

    /** 문안은 여기서 만든다. 장면은 무엇을 말할지와 인자만 쥔다 (C10). */
    function captionText(scene: IndegreeZeroFirstScene): string {
      const said: IndegreeZeroFirstCaption | null = scene.caption;
      if (!said) return '';
      switch (said.kind) {
        case 'count':
          return t('caption.count', 'Count the arrows coming into each vertex.');
        case 'startReady':
          return t('caption.startReady', '{ids} carry nothing — only these can be taken now.', {
            ids: said.ids.join(', '),
          });
        case 'newReady':
          return t('caption.newReady', '{ids} just reached 0 — they fall next.', {
            ids: said.ids.join(', '),
          });
        case 'take':
          return t('caption.take', 'Take {id} — it carries 0.', { id: said.id });
        case 'drop': {
          // 줄기 전의 수는 "지금 수 + 이번에 떨어진 화살" 이다. 그림과 같은 출처다.
          const parts = droppedInto(scene, said.from).map(
            (hit) => `${hit.to} ${hit.was}→${hit.now}`,
          );
          return t('caption.drop', '{id} is gone, so the arrows it held fall off: {drops}', {
            id: said.from,
            drops: parts.join(', '),
          });
        }
        case 'done':
          return t('caption.done', 'Order: {order}', { order: scene.order.join(' → ') });
      }
    }

    /**
     * `from` 이 걸어 두었던 화살이 닿던 곳과, 그 화살이 떨어지며 준 수.
     *
     * `was` 를 장면에 싣지 않는 까닭 — 지금 수에 이번에 떨어진 화살을 도로 더하면
     * 나온다. 실어 보내면 같은 물음에 답이 둘이 된다.
     */
    function droppedInto(
      scene: IndegreeZeroFirstScene,
      from: string,
    ): { to: string; was: number; now: number }[] {
      const hits: { to: string; was: number; now: number }[] = [];
      for (const edge of scene.edges) {
        if (edge.from !== from) continue;
        const found = hits.find((h) => h.to === edge.to);
        if (found) {
          found.was += 1;
          continue;
        }
        const now = indegreeOf(scene.edges, scene.droppedFrom, edge.to);
        hits.push({ to: edge.to, was: now + 1, now });
      }
      return hits.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0));
    }

    /** 그 장면이 말하는 것을 전부 세운다. 늘 비우고 시작하므로 되돌릴 것이 없다. */
    function drawScene(scene: IndegreeZeroFirstScene): Layout {
      const at = layoutFor(scene);
      gTrack.textContent = '';
      gEdges.textContent = '';
      gNodes.textContent = '';
      gBadges.textContent = '';
      gFx.textContent = '';
      nodeEls.clear();
      badgeEls.clear();
      digitEls.clear();
      nodeAt.clear();

      drawTrack(scene, at);
      drawLayerBreaks(scene, at);
      drawEdges(scene, at);
      drawNodes(scene, at);
      drawBadges(scene, at);
      captionEl.textContent = captionText(scene);
      return at;
    }

    // ── 운동 ────────────────────────────────────────────────────────────
    /** 센 수가 머리 위로 내려앉는다. 하나씩 늦게 출발한다. */
    function runCount(scene: IndegreeZeroFirstScene, my: number): Promise<void> {
      const shown = scene.nodes.filter((id) => badgeEls.has(id));
      if (shown.length === 0) return Promise.resolve();
      return animate(D_COUNT, my, (progress) => {
        shown.forEach((id, i) => {
          const lead = Math.min(0.6, i * LEAD_COUNT);
          const e = easeOut(clamp01((progress - lead) / (1 - lead)));
          const g = badgeEls.get(id);
          if (!g) return;
          g.setAttribute('transform', shift(0, -BADGE_RISE * (1 - e)));
          g.setAttribute('opacity', n(e));
        });
      });
    }

    /** 0 이 된 것들이 헐거워진다 — 한 번 주저앉았다 돌아온다. */
    function runReady(
      step: Extract<IndegreeZeroFirstStep, { kind: 'ready' }>,
      my: number,
    ): Promise<void> {
      return animate(D_READY, my, (progress) => {
        const off = bob(progress) * BOB_READY;
        for (const id of step.nodes) {
          const here = nodeAt.get(id);
          const g = nodeEls.get(id);
          if (here && g) g.setAttribute('transform', shift(here.x, here.y + off));
          const badge = badgeEls.get(id);
          if (badge) badge.setAttribute('transform', shift(0, off));
        }
      });
    }

    /**
     * 이고 있는 것이 없으니 아래 줄로 떨어진다. 배지도 함께 떨어져 나간다.
     *
     * 정적 그리기가 이미 아래 줄에 세워 두었으므로, 운동은 **아직 못 온 만큼을
     * 뒤로 물리는** 꼴로 돈다. 배지는 정적 화면에 없으니 이 마디에서만 짓는다.
     */
    function runTake(
      scene: IndegreeZeroFirstScene,
      step: Extract<IndegreeZeroFirstStep, { kind: 'take' }>,
      at: Layout,
      my: number,
    ): Promise<void> {
      const g = nodeEls.get(step.id);
      const landing = nodeAt.get(step.id);
      const home = at.graphPos.get(step.id);
      if (!g || !landing || !home) return Promise.resolve();

      const anchor = badgeAnchor(home);
      const ghost = svg('g');
      ghost.append(
        svg('rect', {
          x: n(anchor.x - BADGE_W / 2),
          y: n(anchor.y - BADGE_H / 2),
          width: BADGE_W,
          height: BADGE_H,
          rx: 6,
          fill: c.itemPivot,
          stroke: c.stateInk,
          'stroke-width': 1.5,
        }),
        glyph(
          anchor,
          String(indegreeOf(scene.edges, scene.droppedFrom, step.id)),
          c.stateInk,
          fontSizes.sm,
          '700',
        ),
      );
      gFx.appendChild(ghost);

      return animate(D_TAKE, my, (progress) => {
        const e = easeFall(progress);
        g.setAttribute(
          'transform',
          shift(
            landing.x + (home.x - landing.x) * (1 - e),
            landing.y + (home.y - landing.y) * (1 - e),
          ),
        );
        ghost.setAttribute('transform', shift(0, FALL_BADGE * e));
        ghost.setAttribute('opacity', n(1 - e));
      });
    }

    /**
     * 빠진 정점이 걸어 두었던 화살이 떨어지고, 이고 있던 수가 준다.
     *
     * 화살도 옛 숫자도 정적 화면에는 없다 — 떨어져 나간 것이라 **숨기지 않고 짓지
     * 않는다.** 이 마디에서만 지어 떨군다. 시계는 하나다: 앞부분은 물든 채 머물고
     * 뒷부분에서 떨어진다. 한 뜻으로 묶인 운동이라 나누면 lockstep 이 우연이 된다.
     */
    function runDrop(
      scene: IndegreeZeroFirstScene,
      step: Extract<IndegreeZeroFirstStep, { kind: 'drop' }>,
      at: Layout,
      my: number,
    ): Promise<void> {
      const depth = computeDepths(scene.nodes, scene.edges);
      const arrows: SVGGElement[] = [];
      for (const edge of scene.edges) {
        if (edge.from !== step.from) continue;
        const shape = arrowShape(edge, at, depth);
        if (!shape) continue;
        const g = arrowEl(shape, c.itemActive);
        gFx.appendChild(g);
        arrows.push(g);
      }

      const ghosts: SVGTextElement[] = [];
      const digits: SVGTextElement[] = [];
      for (const hit of droppedInto(scene, step.from)) {
        const digit = digitEls.get(hit.to);
        if (!digit) continue;
        const home = at.graphPos.get(hit.to);
        if (!home) continue;
        const ghost = glyph(
          badgeAnchor(home),
          String(hit.was),
          c.textMuted,
          fontSizes.sm,
          '700',
        );
        gFx.appendChild(ghost);
        ghosts.push(ghost);
        digits.push(digit);
      }

      if (arrows.length === 0 && ghosts.length === 0) return Promise.resolve();

      return animate(D_DROP, my, (progress) => {
        const e =
          progress <= HOLD_DROP ? 0 : easeFall(clamp01((progress - HOLD_DROP) / (1 - HOLD_DROP)));
        for (const g of arrows) {
          g.setAttribute('transform', shift(0, FALL_ARROW * e));
          g.setAttribute('opacity', n(1 - e));
        }
        for (const g of ghosts) {
          g.setAttribute('transform', shift(0, FALL_GHOST * e));
          g.setAttribute('opacity', n(1 - e));
        }
        for (const digit of digits) {
          digit.setAttribute('transform', shift(0, -DIGIT_RISE * (1 - e)));
          digit.setAttribute('opacity', n(e));
        }
      });
    }

    /** 다 나왔다 — 왼쪽부터 한 번 훑는다. 시계 하나로 차례차례. */
    function runDone(scene: IndegreeZeroFirstScene, my: number): Promise<void> {
      const landed = scene.order.filter((id) => nodeEls.has(id));
      if (landed.length === 0) return Promise.resolve();
      const total = landed.length * D_FINISH_STEP + D_FINISH_TAIL;
      const span = D_FINISH_STEP * 2;
      return animate(total, my, (progress) => {
        const elapsed = progress * total;
        landed.forEach((id, i) => {
          const local = clamp01((elapsed - i * D_FINISH_STEP) / span);
          const here = nodeAt.get(id);
          const g = nodeEls.get(id);
          if (here && g) g.setAttribute('transform', shift(here.x, here.y - bob(local) * BOB_FINISH));
        });
      });
    }

    function runStep(
      scene: IndegreeZeroFirstScene,
      step: IndegreeZeroFirstStep,
      at: Layout,
      my: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'count':
          return runCount(scene, my);
        case 'ready':
          return runReady(step, my);
        case 'take':
          return runTake(scene, step, at, my);
        case 'drop':
          return runDrop(scene, step, at, my);
        case 'done':
          return runDone(scene, my);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: IndegreeZeroFirstScene,
      /** 출발 그림을 장면에서 되셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: IndegreeZeroFirstScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const at = drawScene(next);
      if (!opts.animate) return;
      if (!next.step) return;

      await runStep(next, next.step, at, my);

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간 끝자리를 거두고 그 장면을 통째로 다시 세운다.
      // 속성을 하나씩 되돌리면 반드시 하나를 빠뜨린다.
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이
        // 깨어나지 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        nodeEls.clear();
        badgeEls.clear();
        digitEls.clear();
        nodeAt.clear();
        root.remove();
      },
    };
  },
};
