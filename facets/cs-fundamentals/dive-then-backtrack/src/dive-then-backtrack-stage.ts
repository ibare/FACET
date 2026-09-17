/**
 * 되짚어 나오기 무대 — 장면(Scene) 하나를 받아 화면 **전체**를 세운다.
 *
 * ## 동사가 둘이고, 화면에서 서로 다른 일로 보여야 한다
 *
 *   파고든다 — 자국(trail)이 부모에서 자식으로 **자라나고**, 표식이 간선을 따라
 *              곧게 내려가며, 깊이 바늘이 아래로 내려간다. 갈매기는 아래를 가리킨다.
 *   물러난다 — 자국이 자식 쪽에서부터 **줄어들고**, 표식은 간선을 벗어나 바깥으로
 *              부푼 호를 그리며 올라오고, 바늘이 위로 올라간다. 갈매기는 위를 본다.
 *
 * 두 걸음이 같은 선 위를 반대로 미끄러지기만 하면 "다음 자리로 넘어가는 것" 과
 * 구별되지 않는다. 그래서 물러남만 간선을 벗어나 호를 그린다.
 *
 * ## 화면이 지고 있는 네 어휘 — 갈라 두었으므로 부딪히지 않는다
 *
 * - **마디의 채움** = *값의 형편*. 아직 안 밟음 / 지금 여기 / 길 위 / 소진.
 * - **간선의 선** = *길의 형편*. 아직 안 감(가는 테) / 지금 스택에 들어 있음(굵은
 *   자국) / 다 지나 닫힘(점선 유령).
 * - **간선 곁의 작은 갈매기 둘** = *실제로 걸은 걸음*. ▸ 내려갔다, ◂ 되짚어 나왔다.
 *   재생 내내 지워지지 않아 **완주 화면에 간선마다 한 쌍이 남는다** — 설명글의
 *   "간선 하나하나를 내려갈 때 한 번, 올라올 때 한 번 지난다" 가 그대로 보인다.
 *   자국과 같은 모양으로 그리면 "자국이 안 지워졌다" 로 읽혀 정반대가 되므로,
 *   선이 아니라 **선 곁의 작은 표식**이라는 다른 어휘로 갈랐다.
 * - **깊이 축의 굵은 구간** = *가장 깊이 내려간 깊이*. 물러나도 줄지 않는다. 필요한
 *   기억 공간이 그래프 크기가 아니라 이 깊이를 따른다는 것이 조각의 둘째 주장인데,
 *   옮기기 전에는 그 수가 화면 어디에도 없었다.
 *
 * ## 어떻게 그리나
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 되돌릴 명령이 없고, 어느
 * 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 자국은 이미 다 자라 있고,
 * 파고드는 걸음은 **아직 못 자란 만큼을 물려** 놓고 출발한다. 물러나는 걸음은
 * 반대로, 화면에 이미 없는 것(걷어낸 자국 · 거둔 막힘 표시)을 임시로 지어 흐르게
 * 하고 끝에서 `drawStatic` 이 통째로 다시 세워 그 임시물을 지운다.
 *
 * **CSS transition 을 쓰지 않는다.** 되짚기는 `animate:false` 로 오는데 transition
 * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다. 시계는 rAF 트윈 하나뿐이다.
 *
 * 세로는 선언(`canvas.height`)이 정하고 마운트 뒤 다시 재지 않는다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  depthNow,
  descendedEdges,
  edgeKeyOf,
  livePathEdges,
  nodeStateOf,
  standingAt,
  type DiveThenBacktrackCaption,
  type DiveThenBacktrackNodeState,
  type DiveThenBacktrackScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 깊이 눈금 축의 세로선 x. */
const AXIS_X = 30;
/** 나무가 놓일 수 있는 좌우 경계 — 축 오른쪽부터 캔버스 오른쪽 여백까지. */
const FIELD_L = 60;
const FIELD_R = 596;
/** 뿌리의 y. */
const TOP_Y = 56;
/** 가장 깊은 층이 넘어설 수 없는 y. 넘치면 층 간격을 줄여 담는다 (S-view). */
const BOTTOM_LIMIT = 228;
const LEVEL_GAP_MAX = 86;
/**
 * 잎 한 칸의 **상한**. 폭을 다 나눠 가지면 간선이 눕고, 눕는 순간 "아래로
 * 파고든다" 가 "옆으로 간다" 로 읽힌다. 이 조각은 세로가 본질이라 남는 폭은
 * 버리는 것이 아니라 고르는 것이다 (S-piece).
 */
const SLOT_MAX_W = 152;
const NODE_R_MAX = 28;
/** 현재 자리를 감싸는 고리가 마디 밖으로 나오는 만큼. */
const RING_PAD = 6;
/** 막힘 표시(벽)가 마디 밖으로 나오는 만큼. 고리보다 바깥이어야 겹치지 않는다. */
const WALL_PAD = 13;
const CAPTION_Y = 288;
/** 걸음 표식(갈매기)이 간선에서 안쪽으로 비켜서는 만큼. */
const MARK_OFF = 13;
/** 한 간선의 두 표식이 가운데에서 갈라서는 만큼. */
const MARK_GAP = 7;

const DIVE_MS = 300;
const RETREAT_MS = 420;
const ENTER_MS = 260;
const WALL_MS = 180;
/**
 * 끝맺는 걸음에만 얹는 얇은 운동.
 *
 * 흐를 것이 없는 걸음이라 `stepMs` 700 만으로는 읽을 틈(800ms)에 못 미친다.
 * `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로 이 걸음에만 짧게 얹는다.
 * 동사를 캡션과 맞췄다 — "그중 몇 번은 되짚어 나온 걸음이다" 를 말하는 자리라
 * 되짚음의 표식들이 한 번 부풀었다 돌아온다.
 */
const DONE_MS = 280;
/** 물러날 때 표식이 간선 밖으로 부푸는 정도. */
const BOW = 38;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 소수 끝자리가 화면을 가르지 않게 두 자리로 자른다. `-0` 도 여기서 `0` 이 된다. */
function fx(v: number): string {
  return String(Number(v.toFixed(2)));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 전체 진행 `p` 안에서 `[a,b]` 구간만 잘라 0..1 로 편다. */
function phase(p: number, a: number, b: number): number {
  return clamp01((p - a) / (b - a));
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Point = { x: number; y: number };

/**
 * 자리 셈. 장면은 구조만 말하고 좌표는 여기서 캔버스로부터 역산한다 (S-piece).
 *
 * 그리면서 재지 않고 **먼저 한 번에 셈하고 그 다음에 그린다** — 그리며 이웃의
 * 지금 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다.
 */
type TreeLayout = {
  /** 뿌리(출발점). 물러남의 호가 어느 쪽으로 부풀지 정할 때 쓴다. */
  root: string;
  pos: Map<string, Point>;
  depth: Map<string, number>;
  levelY: number[];
  nodeR: number;
  maxDepth: number;
};

/** 무방향 간선에서 오름차순 인접 목록. */
function adjacencyOf(scene: DiveThenBacktrackScene): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const v of scene.vertices) adj.set(v, []);
  for (const [a, b] of scene.edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  for (const list of adj.values()) list.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return adj;
}

/**
 * 출발점을 뿌리로 삼아 자리를 잡는다.
 *
 * 잎을 왼쪽부터 한 칸씩 놓고, 부모는 자식들의 한가운데에 둔다. 깊이가 y 를
 * 정하므로 "몇 칸 아래" 가 화면에서 그대로 높이 차이가 된다.
 */
function layoutOf(scene: DiveThenBacktrackScene): TreeLayout {
  const adj = adjacencyOf(scene);
  const depth = new Map<string, number>();
  const children = new Map<string, string[]>();
  const preorder: string[] = [];

  const start = scene.start;
  if (adj.has(start)) {
    const seen = new Set<string>([start]);
    depth.set(start, 0);
    const stack: string[] = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      preorder.push(cur);
      const kids: string[] = [];
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        depth.set(n, (depth.get(cur) ?? 0) + 1);
        kids.push(n);
      }
      children.set(cur, kids);
      for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i] ?? '');
    }
  }

  let maxDepth = 0;
  for (const d of depth.values()) if (d > maxDepth) maxDepth = d;

  const leaves = preorder.filter((n) => (children.get(n) ?? []).length === 0);
  const leafCount = Math.max(1, leaves.length);
  const fieldW = FIELD_R - FIELD_L;
  const slotW = Math.min(SLOT_MAX_W, fieldW / leafCount);
  const originX = FIELD_L + (fieldW - slotW * leafCount) / 2;

  const levelGap =
    maxDepth > 0 ? Math.min(LEVEL_GAP_MAX, (BOTTOM_LIMIT - TOP_Y) / maxDepth) : LEVEL_GAP_MAX;
  const nodeR = Math.min(NODE_R_MAX, slotW * 0.3, levelGap * 0.34);
  const levelY: number[] = [];
  for (let d = 0; d <= maxDepth; d += 1) levelY.push(TOP_Y + levelGap * d);

  const x = new Map<string, number>();
  leaves.forEach((leaf, i) => x.set(leaf, originX + slotW * (i + 0.5)));
  for (let i = preorder.length - 1; i >= 0; i -= 1) {
    const name = preorder[i] ?? '';
    const kids = children.get(name) ?? [];
    if (kids.length === 0) continue;
    const first = x.get(kids[0] ?? '') ?? originX;
    const last = x.get(kids[kids.length - 1] ?? '') ?? originX;
    x.set(name, (first + last) / 2);
  }

  const pos = new Map<string, Point>();
  for (const name of preorder) {
    pos.set(name, { x: x.get(name) ?? originX, y: levelY[depth.get(name) ?? 0] ?? TOP_Y });
  }

  return { root: start, pos, depth, levelY, nodeR, maxDepth };
}

/** 마디 테두리에서 테두리까지 잘라 낸 간선. `from` 쪽이 시작점이다. */
type Segment = { x1: number; y1: number; x2: number; y2: number; len: number };

function segmentOf(L: TreeLayout, from: string, to: string): Segment {
  const pa = L.pos.get(from) ?? { x: W / 2, y: TOP_Y };
  const pb = L.pos.get(to) ?? { x: W / 2, y: TOP_Y };
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  return {
    x1: pa.x + ux * L.nodeR,
    y1: pa.y + uy * L.nodeR,
    x2: pb.x - ux * L.nodeR,
    y2: pb.y - uy * L.nodeR,
    len: Math.max(1, d - 2 * L.nodeR),
  };
}

/** 간선의 두 끝 가운데 얕은 쪽이 부모다. 자국이 어느 끝에서 자랄지가 여기서 갈린다. */
function orientEdge(L: TreeLayout, a: string, b: string): { parent: string; child: string } {
  const da = L.depth.get(a) ?? 0;
  const db = L.depth.get(b) ?? 0;
  return da <= db ? { parent: a, child: b } : { parent: b, child: a };
}

export const diveThenBacktrackStageView: CanvasView = {
  canvas: { height: H },

  // 컨테이너는 쓰지 않는다 — 러너가 만든 캔버스 안에만 그린다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DiveThenBacktrackScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**만 비운다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 레이어의 차례가 곧 겹치는 차례다. 레이어 자체는 다시 짓지 않고 속성도 걸지
    // 않는다 — 안에 든 것만 매번 새로 짓는다.
    const axisLayer = el('g');
    const edgeLayer = el('g');
    const trailLayer = el('g');
    const markLayer = el('g');
    const nodeLayer = el('g');
    const tokenLayer = el('g');
    const captionLayer = el('g');
    svg.append(axisLayer, edgeLayer, trailLayer, markLayer, nodeLayer, tokenLayer, captionLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const rafIds = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 요소를 매번 새로 짓지만 그 손잡이를 담는 아래 Map 들은
     * **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이 그것을 읽으면 새
     * 손잡이를 타고 살아 있는 화면에 쓴다. 걸음 함수가 `await` 를 지나므로 둔다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const startedAt = Date.now();
        let id = 0;
        const frame = (): void => {
          rafIds.delete(id);
          const raw = clamp01((Date.now() - startedAt) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          rafIds.add(id);
        };
        id = requestAnimationFrame(frame);
        rafIds.add(id);
      });
    }

    // ── 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다.
    let nodeEls = new Map<string, { g: SVGGElement; circle: SVGCircleElement; label: SVGTextElement }>();
    let baseEls = new Map<string, SVGLineElement>();
    let trailEls = new Map<string, SVGLineElement>();
    let upMarkEls = new Map<string, { node: SVGPathElement; base: string }>();
    let downMarkEls = new Map<string, SVGPathElement>();
    let wallEl: SVGPathElement | null = null;
    let tokenG: SVGGElement | null = null;
    let tokenRing: SVGCircleElement | null = null;
    let needleEl: SVGPathElement | null = null;

    function fillOf(state: DiveThenBacktrackNodeState): string {
      return state === 'current'
        ? c.itemActive
        : state === 'onPath'
          ? c.itemPivot
          : state === 'exhausted'
            ? c.itemSorted
            : c.itemDefault;
    }

    function paintNode(name: string, state: DiveThenBacktrackNodeState): void {
      const v = nodeEls.get(name);
      if (!v) return;
      const fill = fillOf(state);
      const ink =
        state === 'untouched' ? c.text : state === 'exhausted' ? c.textInverse : c.stateInk;
      v.circle.setAttribute('fill', fill);
      v.circle.setAttribute('stroke', state === 'untouched' ? c.border : fill);
      v.label.setAttribute('fill', ink);
    }

    function moveToken(x: number, y: number): void {
      tokenG?.setAttribute('transform', `translate(${fx(x)} ${fx(y)})`);
    }

    function moveNeedle(y: number): void {
      needleEl?.setAttribute('transform', `translate(${AXIS_X + 4} ${fx(y)})`);
    }

    function levelYOf(L: TreeLayout, depth: number): number {
      const i = Math.max(0, Math.min(L.levelY.length - 1, depth));
      return L.levelY[i] ?? TOP_Y;
    }

    /** 막힘 표시(벽) 하나. 마디 아래쪽을 가로막는 붉은 호다. */
    function makeWall(L: TreeLayout, name: string): { node: SVGPathElement; arc: number } {
      const R = L.nodeR + WALL_PAD;
      const a0 = (50 * Math.PI) / 180;
      const a1 = (130 * Math.PI) / 180;
      const arc = R * (a1 - a0);
      const p = L.pos.get(name) ?? { x: W / 2, y: TOP_Y };
      const node = el('path', {
        d: `M ${fx(R * Math.cos(a0))} ${fx(R * Math.sin(a0))} A ${fx(R)} ${fx(R)} 0 0 1 ${fx(R * Math.cos(a1))} ${fx(R * Math.sin(a1))}`,
        fill: 'none',
        stroke: c.danger,
        'stroke-width': 4,
        'stroke-linecap': 'round',
        transform: `translate(${fx(p.x)} ${fx(p.y)})`,
      });
      return { node, arc };
    }

    /** 지금 길 위의 자국 하나. 부모에서 자식으로 그어 자라는 쪽을 정한다. */
    function makeTrail(seg: Segment): SVGLineElement {
      return el('line', {
        x1: fx(seg.x1),
        y1: fx(seg.y1),
        x2: fx(seg.x2),
        y2: fx(seg.y2),
        stroke: c.accent,
        'stroke-width': 6,
        'stroke-linecap': 'round',
      });
    }

    /**
     * 걸음 표식의 자리. 간선 가운데에서 **안쪽**(뿌리 쪽)으로 비켜선다 —
     * 바깥쪽은 물러남의 호가 지나는 자리다.
     */
    function markBaseTransform(L: TreeLayout, parent: string, child: string): string {
      const seg = segmentOf(L, parent, child);
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      let nx = -(seg.y2 - seg.y1);
      let ny = seg.x2 - seg.x1;
      const nlen = Math.hypot(nx, ny) || 1;
      nx /= nlen;
      ny /= nlen;
      const rootX = L.pos.get(L.root)?.x ?? W / 2;
      const outward = Math.sign(mx - rootX) || 1;
      if (nx * outward < 0) {
        nx = -nx;
        ny = -ny;
      }
      const angle = (Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI;
      return `translate(${fx(mx - nx * MARK_OFF)} ${fx(my - ny * MARK_OFF)}) rotate(${fx(angle)})`;
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 dasharray ·
     * opacity · 보간 끝자리도 함께 사라진다 (S-scene). **아직 없는 것은 숨기지
     * 말고 짓지 않는다** — 길이 0 짜리 선은 둥근 마감 탓에 점으로 남고, 0 으로
     * 눌러 둔 요소는 앞 걸음의 값을 함께 끌고 다닌다.
     */
    function drawStatic(scene: DiveThenBacktrackScene): void {
      const L = layoutOf(scene);
      for (const layer of [
        axisLayer,
        edgeLayer,
        trailLayer,
        markLayer,
        nodeLayer,
        tokenLayer,
        captionLayer,
      ]) {
        layer.textContent = '';
      }
      nodeEls = new Map();
      baseEls = new Map();
      trailEls = new Map();
      upMarkEls = new Map();
      downMarkEls = new Map();
      wallEl = null;
      tokenG = null;
      tokenRing = null;
      needleEl = null;

      drawAxis(L, scene);
      drawEdges(L, scene);
      drawMarks(L, scene);
      drawNodes(L, scene);
      drawToken(L, scene);
      drawCaption(captionOf(scene));
    }

    /** 깊이 축 · 눈금 · 가장 깊이 내려간 구간 · 지금 깊이 바늘. */
    function drawAxis(L: TreeLayout, scene: DiveThenBacktrackScene): void {
      const top = TOP_Y - L.nodeR - 14;
      const bottom = levelYOf(L, L.maxDepth) + L.nodeR + 14;
      axisLayer.appendChild(
        el('line', {
          x1: AXIS_X,
          y1: fx(top),
          x2: AXIS_X,
          y2: fx(bottom),
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );

      L.levelY.forEach((y, d) => {
        const deepestHere = scene.deepest > 0 && d === scene.deepest;
        axisLayer.appendChild(
          el('line', {
            x1: AXIS_X - 5,
            y1: fx(y),
            x2: AXIS_X + 5,
            y2: fx(y),
            stroke: deepestHere ? c.primary : c.border,
            'stroke-width': deepestHere ? 3 : 1.5,
          }),
        );
        axisLayer.appendChild(
          el('line', {
            x1: AXIS_X + 22,
            y1: fx(y),
            x2: W - 16,
            y2: fx(y),
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '1 8',
          }),
        );
        // 깊이 숫자는 눈금 표기다 — 번역 대상이 아니다 (C10 표식 판정 3).
        const tick = el('text', {
          x: AXIS_X - 11,
          y: fx(y + 4),
          'text-anchor': 'end',
          fill: deepestHere ? c.primary : c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        tick.textContent = String(d);
        axisLayer.appendChild(tick);
      });

      // 가장 깊이 내려간 구간. 물러나도 줄지 않는다 — 들고 있어야 했던 길의 길이다.
      // 깊이 0 이면 길이 0 이라 **짓지 않는다** (둥근 마감이 점을 남긴다).
      if (scene.deepest > 0) {
        axisLayer.appendChild(
          el('line', {
            x1: AXIS_X,
            y1: fx(levelYOf(L, 0)),
            x2: AXIS_X,
            y2: fx(levelYOf(L, scene.deepest)),
            stroke: c.primary,
            'stroke-width': 3.5,
            'stroke-linecap': 'round',
          }),
        );
      }

      const now = depthNow(scene);
      if (now !== null) {
        needleEl = el('path', {
          d: 'M 0 -6 L 0 6 L 11 0 Z',
          fill: c.itemActive,
          transform: `translate(${AXIS_X + 4} ${fx(levelYOf(L, now))})`,
        });
        axisLayer.appendChild(needleEl);
      }
    }

    /** 간선의 선 — 길의 형편을 말한다. */
    function drawEdges(L: TreeLayout, scene: DiveThenBacktrackScene): void {
      const live = livePathEdges(scene);
      for (const [a, b] of scene.edges) {
        const key = edgeKeyOf(a, b);
        const { parent, child } = orientEdge(L, a, b);
        const seg = segmentOf(L, parent, child);
        const closed = scene.retreated.includes(key);
        const base = el('line', {
          x1: fx(seg.x1),
          y1: fx(seg.y1),
          x2: fx(seg.x2),
          y2: fx(seg.y2),
          // 되짚어 나온 간선은 점선 유령으로 남는다 — 지나왔고 이제 닫힌 길이다.
          stroke: closed ? c.ghostOutline : c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
          ...(closed ? { 'stroke-dasharray': '3 6' } : {}),
        });
        edgeLayer.appendChild(base);
        baseEls.set(key, base);

        if (live.includes(key)) {
          const trail = makeTrail(seg);
          trailLayer.appendChild(trail);
          trailEls.set(key, trail);
        }
      }
    }

    /**
     * 걸음 표식 — 그 간선에서 실제로 걸은 걸음을 하나씩 남긴다.
     *
     * 내려간 표식은 지금 길 위이거나 이미 되짚어 나온 간선에 선다. 되짚은 표식은
     * 되짚어 나온 간선에만 선다. 그래서 완주 화면에서 간선마다 한 쌍이 되고,
     * 그 쌍의 수가 곧 "내려간 걸음 = 되짚은 걸음" 이다.
     */
    function drawMarks(L: TreeLayout, scene: DiveThenBacktrackScene): void {
      const down = descendedEdges(scene);
      for (const [a, b] of scene.edges) {
        const key = edgeKeyOf(a, b);
        const hasDown = down.includes(key);
        const hasUp = scene.retreated.includes(key);
        if (!hasDown && !hasUp) continue;
        const { parent, child } = orientEdge(L, a, b);
        const base = markBaseTransform(L, parent, child);
        const g = el('g', { transform: base });
        if (hasDown) {
          const node = el('path', {
            d: 'M -3 -4.5 L 2.5 0 L -3 4.5',
            fill: 'none',
            stroke: c.textMuted,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            transform: `translate(${-MARK_GAP} 0)`,
          });
          g.appendChild(node);
          downMarkEls.set(key, node);
        }
        if (hasUp) {
          const node = el('path', {
            d: 'M 3 -4.5 L -2.5 0 L 3 4.5',
            fill: 'none',
            stroke: c.textMuted,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            transform: `translate(${MARK_GAP} 0)`,
          });
          g.appendChild(node);
          upMarkEls.set(key, { node, base: `translate(${MARK_GAP} 0)` });
        }
        markLayer.appendChild(g);
      }
    }

    function drawNodes(L: TreeLayout, scene: DiveThenBacktrackScene): void {
      const r = L.nodeR;
      for (const name of scene.vertices) {
        const p = L.pos.get(name);
        if (!p) continue;
        const g = el('g', { transform: `translate(${fx(p.x)} ${fx(p.y)})` });
        const circle = el('circle', { cx: 0, cy: 0, r: fx(r), 'stroke-width': 2 });
        const label = el('text', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
        });
        label.textContent = name;
        g.appendChild(circle);
        g.appendChild(label);
        nodeLayer.appendChild(g);
        nodeEls.set(name, { g, circle, label });
        paintNode(name, nodeStateOf(scene, name));
      }

      if (scene.blocked !== null && L.pos.has(scene.blocked)) {
        const wall = makeWall(L, scene.blocked);
        nodeLayer.appendChild(wall.node);
        wallEl = wall.node;
      }
    }

    /** 지금 서 있는 자리의 고리. 갈매기는 운동 중에만 달린다. */
    function drawToken(L: TreeLayout, scene: DiveThenBacktrackScene): void {
      const here = standingAt(scene);
      if (here === null) return;
      const p = L.pos.get(here);
      if (!p) return;
      tokenG = el('g', { transform: `translate(${fx(p.x)} ${fx(p.y)})` });
      tokenRing = el('circle', {
        cx: 0,
        cy: 0,
        r: fx(L.nodeR + RING_PAD),
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 3,
      });
      tokenG.appendChild(tokenRing);
      tokenLayer.appendChild(tokenG);
    }

    function captionText(cap: DiveThenBacktrackCaption | null): string {
      if (cap === null) return '';
      switch (cap.kind) {
        case 'start':
          return tr('caption.start', 'Start at {node} and take one branch as far as it goes.', {
            node: cap.node,
          });
        case 'dive':
          return tr('caption.dive', 'Dig one step deeper into {node}.', { node: cap.node });
        case 'deadEnd':
          return tr('caption.deadEnd', 'Nowhere left to go from {node}.', { node: cap.node });
        case 'retreat':
          return tr('caption.retreat', 'Back out to {node} along the way we came.', {
            node: cap.node,
          });
        case 'done':
          return tr(
            'caption.done',
            'All {visited} reached — and {backtracks} of the moves were retreats back up.',
            { visited: cap.visited, backtracks: cap.backtracks },
          );
      }
    }

    function drawCaption(cap: DiveThenBacktrackCaption | null): void {
      const text = captionText(cap);
      if (text === '') return;
      const node = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      node.textContent = text;
      captionLayer.appendChild(node);
    }

    // ── 걸음 하나를 흐르게 한다 ─────────────────────────────────────────────

    /** 표식에 갈매기를 임시로 단다. 끝에서 `drawStatic` 이 통째로 거둔다. */
    function attachChevron(L: TreeLayout, dir: 'down' | 'up'): void {
      if (!tokenG) return;
      const r = L.nodeR + RING_PAD;
      tokenG.appendChild(
        el('path', {
          d: 'M -9 -6 L 0 5 L 9 -6',
          fill: 'none',
          stroke: c.itemActive,
          'stroke-width': 3.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          transform: dir === 'down' ? `translate(0 ${fx(r)})` : `translate(0 ${fx(-r)}) rotate(180)`,
        }),
      );
    }

    /** 출발점에 선다 — 고리가 밖에서 조여들며 자리를 잡는다. */
    function flowEnter(L: TreeLayout, mine: number): Promise<void> {
      const ring = tokenRing;
      if (!ring) return Promise.resolve();
      const r = L.nodeR + RING_PAD;
      return tween(ENTER_MS, (t) => {
        if (!alive(mine)) return;
        ring.setAttribute('r', fx(r + (1 - ease(t)) * 16));
      });
    }

    /** 한 칸 파고든다 — 자국이 자라고 표식이 곧게 내려간다. */
    function flowDescend(
      L: TreeLayout,
      scene: DiveThenBacktrackScene,
      mine: number,
    ): Promise<void> {
      const to = scene.path[scene.path.length - 1];
      const from = scene.path[scene.path.length - 2];
      if (to === undefined || from === undefined) return Promise.resolve();
      const key = edgeKeyOf(from, to);
      const trail = trailEls.get(key);
      const mark = downMarkEls.get(key);
      const target = nodeEls.get(to);
      const seg = segmentOf(L, from, to);
      const a = L.pos.get(from) ?? { x: W / 2, y: TOP_Y };
      const b = L.pos.get(to) ?? { x: W / 2, y: TOP_Y };
      const depth = scene.path.length - 1;
      const y0 = levelYOf(L, depth - 1);
      const y1 = levelYOf(L, depth);

      // 정적 그리기가 정본이라 자국은 이미 다 자라 있다. 아직 못 자란 만큼 물린다.
      trail?.setAttribute('stroke-dasharray', `${fx(seg.len)} ${fx(seg.len)}`);
      trail?.setAttribute('stroke-dashoffset', fx(seg.len));
      mark?.setAttribute('opacity', '0');
      paintNode(to, 'untouched');
      attachChevron(L, 'down');

      return tween(DIVE_MS, (t) => {
        if (!alive(mine)) return;
        const p = ease(t);
        trail?.setAttribute('stroke-dashoffset', fx(seg.len * (1 - p)));
        moveToken(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
        moveNeedle(y0 + (y1 - y0) * p);
        paintNode(to, p >= 0.62 ? 'current' : 'untouched');
        mark?.setAttribute('opacity', fx(phase(p, 0.62, 1)));
        const pop = p < 0.62 ? 1 : 1 + 0.16 * Math.sin(((p - 0.62) / 0.38) * Math.PI);
        target?.g.setAttribute(
          'transform',
          `translate(${fx(b.x)} ${fx(b.y)}) scale(${fx(pop)})`,
        );
      });
    }

    /** 더 갈 곳이 없음이 드러난다 — 마디 아래로 벽이 그어진다. */
    function flowDeadEnd(L: TreeLayout, mine: number): Promise<void> {
      const wall = wallEl;
      if (!wall) return Promise.resolve();
      const R = L.nodeR + WALL_PAD;
      const arc = R * ((130 - 50) * Math.PI) / 180;
      wall.setAttribute('stroke-dasharray', `${fx(arc)} ${fx(arc)}`);
      wall.setAttribute('stroke-dashoffset', fx(arc));
      return tween(WALL_MS, (t) => {
        if (!alive(mine)) return;
        wall.setAttribute('stroke-dashoffset', fx(arc * (1 - ease(t))));
      });
    }

    /**
     * 왔던 길을 되짚어 한 칸 물러난다.
     *
     * 자국이 자식 쪽에서부터 줄고, 표식은 간선을 벗어나 바깥으로 부푼 호를 그리며
     * 올라온다. 끝난 화면에 이미 없는 것 — 걷어낸 자국과 거둔 막힘 표시 — 을
     * 임시로 지어 흐르게 하고, 마지막 `drawStatic` 이 통째로 다시 세워 지운다.
     *
     * 떠나온 마디는 `step.from` 이 말한다. 이미 길에서 빠져 `next` 만으로는 어느
     * 자식에서 나왔는지 가릴 수 없다 — 그래서 계기값으로 싣는다 (S-scene).
     */
    function flowRetreat(
      L: TreeLayout,
      scene: DiveThenBacktrackScene,
      from: string,
      mine: number,
    ): Promise<void> {
      const to = scene.path[scene.path.length - 1];
      if (to === undefined) return Promise.resolve();
      const key = edgeKeyOf(from, to);
      const seg = segmentOf(L, to, from);
      const a = L.pos.get(from) ?? { x: W / 2, y: TOP_Y };
      const b = L.pos.get(to) ?? { x: W / 2, y: TOP_Y };

      // 물러나기 전의 그림으로 되돌린다.
      const base = baseEls.get(key);
      base?.setAttribute('stroke', c.border);
      base?.removeAttribute('stroke-dasharray');
      const trail = makeTrail(seg);
      trailLayer.appendChild(trail);
      trail.setAttribute('stroke-dasharray', `${fx(seg.len)} ${fx(seg.len)}`);
      const mark = upMarkEls.get(key);
      mark?.node.setAttribute('opacity', '0');
      const wall = makeWall(L, from);
      nodeLayer.appendChild(wall.node);
      paintNode(to, 'onPath');
      attachChevron(L, 'up');

      // 간선을 벗어나 바깥으로 부푼 호. 같은 선 위를 되미끄러지면 "옆으로 간다" 가
      // 되어 파고드는 걸음과 구별되지 않는다.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const nlen = Math.hypot(nx, ny) || 1;
      nx /= nlen;
      ny /= nlen;
      const rootX = L.pos.get(L.root)?.x ?? W / 2;
      const outward = Math.sign(mx - rootX) || 1;
      if (nx * outward < 0) {
        nx = -nx;
        ny = -ny;
      }
      const cx = mx + nx * BOW;
      const cy = my + ny * BOW;

      const depth = scene.path.length - 1;
      const y0 = levelYOf(L, depth + 1);
      const y1 = levelYOf(L, depth);

      return tween(RETREAT_MS, (t) => {
        if (!alive(mine)) return;
        const p = ease(t);
        // 자국은 자식 쪽에서부터 줄어든다 — 스택이 줄어드는 것이 물러남이다.
        trail.setAttribute('stroke-dashoffset', fx(seg.len * p));
        const q = 1 - p;
        moveToken(q * q * a.x + 2 * q * p * cx + p * p * b.x, q * q * a.y + 2 * q * p * cy + p * p * b.y);
        moveNeedle(y0 + (y1 - y0) * p);
        wall.node.setAttribute('opacity', fx(1 - phase(p, 0, 0.45)));
        mark?.node.setAttribute('opacity', fx(phase(p, 0.55, 1)));
        paintNode(to, p >= 1 ? 'current' : 'onPath');
      });
    }

    /**
     * 답사가 끝난다 — 되짚은 표식들이 한 번 부풀었다 돌아온다.
     *
     * 흐를 것이 없는 걸음이라 그냥 두면 `stepMs` 만으로 읽을 틈에 못 미친다.
     * 캡션이 "그중 몇 번은 되짚어 나온 걸음이다" 를 말하는 자리이므로 **그 문장이
     * 가리키는 것 자체**를 짚는다. 짚을 자리는 걸음이 아니라 장면에서 찾았다.
     */
    function flowDone(mine: number): Promise<void> {
      const marks = [...upMarkEls.values()];
      if (marks.length === 0) return Promise.resolve();
      return tween(DONE_MS, (t) => {
        if (!alive(mine)) return;
        const s = 1 + 0.55 * Math.sin(ease(t) * Math.PI);
        for (const m of marks) m.node.setAttribute('transform', `${m.base} scale(${fx(s)})`);
      });
    }

    function flow(L: TreeLayout, scene: DiveThenBacktrackScene, mine: number): Promise<void> {
      switch (scene.step?.kind) {
        case 'enter':
          return flowEnter(L, mine);
        case 'descend':
          return flowDescend(L, scene, mine);
        case 'dead-end':
          return flowDeadEnd(L, mine);
        case 'retreat':
          return flowRetreat(L, scene, scene.step.from, mine);
        case 'done':
          return flowDone(mine);
        default:
          return Promise.resolve();
      }
    }

    async function render(
      next: DiveThenBacktrackScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: DiveThenBacktrackScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      await flow(layoutOf(next), next, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 dasharray · opacity · 보간 끝자리 · 임시 노드를 통째로 거둔다.
      // 되돌릴 목록을 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafIds) cancelAnimationFrame(id);
        }
        rafIds.clear();
        // 걸어 둔 프레임을 거두면 그 tick 은 아예 불리지 않으므로, 기다리던
        // promise 를 여기서 직접 깨운다 (S-piece).
        for (const done of [...pending]) done();
        pending.clear();
        nodeEls.clear();
        baseEls.clear();
        trailEls.clear();
        upMarkEls.clear();
        downMarkEls.clear();
        wallEl = null;
        tokenG = null;
        tokenRing = null;
        needleEl = null;
        svg.textContent = '';
      },
    };
  },
};
