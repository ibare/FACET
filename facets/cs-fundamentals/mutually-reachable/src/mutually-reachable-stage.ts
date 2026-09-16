/**
 * 서로 오갈 수 있는 무리 — stage view.
 *
 * ── 무엇이 어디에 있는가
 *
 *   위 (14..63)    왕복 검사기. 칸 둘이 두 방향을 하나씩 맡는다. 둘 다 통하면
 *                  칸 아래로 띠가 자라 둘을 묶고, 한쪽이 막히면 칸 사이가
 *                  금이 가며 서로 밀려난다.
 *   그 아래 (68..90) **짚어 본 짝의 기록.** 물어 본 짝마다 알약 하나가 앉고
 *                  끝까지 남는다. 두 방향의 답이 그대로 적혀 있어, 다 끝난
 *                  화면에서 "왜 저기서 갈렸나" 를 읽을 수 있다.
 *   가운데 (93..282) 그래프. 처음에는 다섯이 한 줄로 늘어서 무리가 보이지 않는다.
 *   아래 (294..340) 캡션. 문안은 `params.t` 로 만든다 (C10).
 *
 * ── 두 답사는 서로 다른 일로 보인다
 *
 *   갈 수 있을 때   토큰 하나가 간선을 타고 **움직인다.** 지나온 간선이 켜지고,
 *                   왕복이 둘 다 켜지면 화면에 고리가 남는다.
 *   갈 길이 없을 때  토큰이 없다. 닿을 수 있는 곳으로 얼룩이 **번지고**, 다 번진
 *                   뒤 그 둘레에 점선 벽이 닫힌다. 바깥은 흐려진다.
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 *   채움  값의 형편 — 아직 아무 무리도 아니다 / 지금 지나가는 길 위다 / 얼룩이
 *         들어 바깥으로 못 나간다 / 무리가 확정됐다.
 *   테두리 짚음의 표식 — 지금 짚은 두 끝에 링이 돌고, 막힌 덩이 둘레에 점선 벽이
 *         닫힌다. 짚어 본 짝의 기록도 테두리로 갈린다 (실선 = 오간다, 점선 = 막혔다).
 *
 * 둘이 한 칸에서 부딪히지 않으므로, 무리가 확정된 뒤 답사의 자취를 걷어도 판정은
 * 기록에 그대로 남는다.
 *
 * ── 갈린다
 *
 * 마지막에 정점들이 실제로 자리를 옮긴다. 오갈 수 있는 것끼리 한 덩이로 모이고
 * 덩이끼리는 캔버스 양 끝으로 밀려나, 둘을 잇던 간선 하나만 빈 사이를 건넌다.
 * 그 간선의 화살촉은 한쪽뿐이다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`askPair()` · `showReached()` · `settleGroup()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 (S-scene).
 *
 * `prev` 는 들추지 않는다. 이 조각의 운동은 전부 그 장면 자체가 말하는 자리에서
 * 출발한다 — 짚은 두 끝, 길, 번질 덩이, 처음 늘어선 줄.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 정점 수가 달라져도 배치를 캔버스에서
 * 역산할 뿐 캔버스를 다시 재지 않는다.
 *
 * ── 뒷일
 *
 * 걸어 둔 프레임과 기다리는 약속은 집합에 담아 `destroy` 가 일괄로 거둔다.
 * 취소된 프레임은 콜백이 아예 안 불리므로 기다리던 약속을 따로 깨워야 한다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  bridgesOf,
  groupIndexOf,
  oneWayCountOf,
  type MutuallyReachableCaption,
  type MutuallyReachableScene,
  type PairMark,
  type ReachGraph,
  type SceneEdge,
  type Trial,
} from './scene.js';

export type StageEdge = SceneEdge;

type Pt = { x: number; y: number };

/** 이차 베지어 한 도막 — 시작 · 제어 · 끝. */
type Curve = { s: Pt; c: Pt; e: Pt };

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 340;

/** 정점 반지름. 라벨 한 글자가 편히 앉는 크기. */
const R = 22;
/** 캔버스 좌우 여백. 무리 둘레까지 이 안에 들어온다. */
const MARGIN_X = 34;
/** 무리 둘레와 정점 사이의 숨. */
const HULL_PAD = 12;
/** 막힌 영역을 두르는 벽과 정점 사이의 숨. */
const WALL_PAD = 17;

/** 늘어선 줄의 아래칸 / 윗칸 세로. 지그재그로 두어야 간선이 겹치지 않는다. */
const CHAIN_LOW_Y = 208;
const CHAIN_HIGH_Y = 132;
/** 갈린 뒤 무리 중심의 세로. */
const SPLIT_CY = 190;

/** 간선의 휨. 오가는 짝(두 방향)이 같은 자리에 겹치지 않게 하는 것이 첫 몫이다. */
const BOW = 22;

const STRIP_X = 28;
const CHIP_W = 270;
const CHIP_GAP = 24;
const CHIP_Y = 14;
const CHIP_H = 38;
const TIE_Y = CHIP_Y + CHIP_H + 6;
const TIE_H = 5;

/** 짚어 본 짝의 기록이 앉는 줄. */
const LEDGER_Y = 68;
const LEDGER_H = 22;
const LEDGER_GAP = 10;
/** 알약의 좌우 여백과 글자 한 칸의 너비. 알약 폭을 글자 수에서 역산한다. */
const LEDGER_PAD = 11;
const LEDGER_CH = 7.2;

const CAPTION_Y1 = 306;
const CAPTION_Y2 = 324;
/** 캡션 한 줄에 담기는 폭 — 한글 한 자를 2, 그 밖을 1로 센 값. */
const CAPTION_BUDGET = 72;

const ASK_MS = 260;
const HOP_MS = 200;
const ARRIVE_MS = 170;
const FLOOD_MS = 240;
const WALL_MS = 300;
const VERDICT_MS = 260;
const SETTLE_MS = 300;
const SPLIT_MS = 760;
const FLOW_MS = 640;

/**
 * 무리 색은 `categorical(6, 'vivid')` 에서 뽑되 시드의 앞자리를 쓰지 않는다.
 * 0번(hue 50)이 주황이라 답사에 쓰는 accent 노랑과 붙어 보이고, 이 화면에서는
 * "지금 지나가는 중" 과 "이미 확정된 무리" 가 서로 다른 말이어야 한다.
 * 그래서 청록(hue 170)과 보라(hue 290)부터 쓴다.
 *
 * 시드는 **상수**다. "지금까지 드러난 무리 수" 로 정하면 무리가 하나 더 드러날
 * 때마다 hue 간격이 통째로 갈려 **이미 칠한 무리의 색이 바뀐다.**
 */
const GROUP_SEED = 6;
const GROUP_HUE_ORDER = [2, 4, 0, 3, 5, 1];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 토큰 hex 를 알파와 함께 쓰기 위한 순수 변환. 색은 언제나 토큰에서 온다. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1] as string, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function towards(from: Pt, to: Pt, dist: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
}

function curveOf(p1: Pt, p2: Pt): Curve {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ctrl = {
    x: (p1.x + p2.x) / 2 + (-dy / len) * BOW,
    y: (p1.y + p2.y) / 2 + (dx / len) * BOW,
  };
  return { s: towards(p1, ctrl, R + 2), c: ctrl, e: towards(p2, ctrl, R + 12) };
}

function curveAt(g: Curve, t: number): Pt {
  const m = 1 - t;
  return {
    x: m * m * g.s.x + 2 * m * t * g.c.x + t * t * g.e.x,
    y: m * m * g.s.y + 2 * m * t * g.c.y + t * t * g.e.y,
  };
}

/**
 * 곡선 길이의 근사. `getTotalLength` 를 쓰지 않는 이유는 DOM 구현마다 있고
 * 없고가 갈리기 때문이다 — 표본 스무 도막이면 점선 길이로 쓰기에 충분하다.
 */
function curveLength(g: Curve): number {
  let len = 0;
  let prev = g.s;
  for (let i = 1; i <= 20; i += 1) {
    const p = curveAt(g, i / 20);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

function curvePath(g: Curve): string {
  return `M ${g.s.x.toFixed(2)} ${g.s.y.toFixed(2)} Q ${g.c.x.toFixed(2)} ${g.c.y.toFixed(2)} ${g.e.x.toFixed(2)} ${g.e.y.toFixed(2)}`;
}

function arrowPath(g: Curve, head: Pt): string {
  const tip = towards(head, g.c, R + 3);
  const dx = tip.x - g.e.x;
  const dy = tip.y - g.e.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 5.2;
  const py = (dx / len) * 5.2;
  return `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${(g.e.x + px).toFixed(2)} ${(g.e.y + py).toFixed(2)} L ${(g.e.x - px).toFixed(2)} ${(g.e.y - py).toFixed(2)} Z`;
}

/** 한 줄로 늘어선 처음 자리. 무리가 보이지 않는 배치다. */
function chainLayout(nodes: string[]): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const span = W - MARGIN_X * 2 - R * 2;
  const step = nodes.length > 1 ? span / (nodes.length - 1) : 0;
  nodes.forEach((id, i) => {
    out.set(id, {
      x: MARGIN_X + R + step * i,
      y: i % 2 === 0 ? CHAIN_LOW_Y : CHAIN_HIGH_Y,
    });
  });
  return out;
}

function clusterRadius(size: number): number {
  if (size <= 1) return 0;
  return size === 2 ? 42 : 58;
}

/**
 * 갈린 뒤의 자리. 무리마다 둥글게 모으고, 무리끼리는 캔버스 양 끝으로 민다.
 *
 * 둘짜리 무리만 시작 각을 눕혀 대각으로 세운다 — 세로로 세우면 폭을 쓰지 못하고
 * 둘레가 홀쭉한 기둥이 되어 옆 무리와 무게가 맞지 않는다.
 */
function splitLayout(groups: string[][]): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const outer = groups.map((g) => clusterRadius(g.length) + R + HULL_PAD);
  const k = groups.length;
  const centers: number[] = [];
  if (k === 1) {
    centers.push(W / 2);
  } else {
    const first = MARGIN_X + (outer[0] as number);
    const last = W - MARGIN_X - (outer[k - 1] as number);
    for (let i = 0; i < k; i += 1) centers.push(first + ((last - first) * i) / (k - 1));
  }

  groups.forEach((members, gi) => {
    const cx = centers[gi] as number;
    const size = members.length;
    const radius = clusterRadius(size);
    const base = size === 2 ? 150 : -90;
    members.forEach((id, i) => {
      const deg = base - (360 / size) * i;
      const rad = (deg * Math.PI) / 180;
      out.set(id, { x: cx + Math.cos(rad) * radius, y: SPLIT_CY + Math.sin(rad) * radius });
    });
  });
  return out;
}

function boxOf(points: Pt[], pad: number): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - R - pad;
  const y = Math.min(...ys) - R - pad;
  return {
    x,
    y,
    w: Math.max(...xs) + R + pad - x,
    h: Math.max(...ys) + R + pad - y,
  };
}

/** 한글은 두 칸, 그 밖은 한 칸으로 센다. 줄바꿈 자리를 고르는 데만 쓴다. */
function textUnits(s: string): number {
  let n = 0;
  for (const ch of s) n += /[ᄀ-ᇿㄱ-ㆎ가-힣]/.test(ch) ? 2 : 1;
  return n;
}

function wrapTwoLines(text: string, budget: number): [string, string] {
  if (textUnits(text) <= budget) return [text, ''];
  const words = text.split(' ');
  let head = '';
  let tail = '';
  for (const word of words) {
    const candidate = head === '' ? word : `${head} ${word}`;
    if (tail === '' && textUnits(candidate) <= budget) head = candidate;
    else tail = tail === '' ? word : `${tail} ${word}`;
  }
  return [head, tail];
}

/** 검사기 한 칸의 형편. 장면의 `Trial` 에서 파생된다 — 어디에도 저장하지 않는다. */
type ChipState = 'idle' | 'asking' | 'found' | 'blocked';

/** 간선의 이름. 방향이 있으므로 두 방향이 서로 다른 이름을 갖는다. */
function keyOf(e: SceneEdge): string {
  return `${e.from}>${e.to}`;
}

/**
 * 장면이 말하는 구조에서 역산한 자리와 파생. 그리기 전에 한 번에 셈한다 —
 * 그리면서 재면 순회 순서가 곧 숨은 상태가 된다.
 */
type Geo = {
  chain: Map<string, Pt>;
  cluster: Map<string, Pt>;
  groupAt: Map<string, number>;
  bridges: Set<string>;
};

function geometryOf(scene: MutuallyReachableScene): Geo {
  const chain = chainLayout(scene.graph.nodes);
  const cluster = scene.groups.length > 0 ? splitLayout(scene.groups) : new Map<string, Pt>();
  return {
    chain,
    cluster,
    groupAt: groupIndexOf(scene.groups),
    bridges: new Set(bridgesOf(scene.graph, scene.groups).map(keyOf)),
  };
}

/** 지금 프레임의 자리. 갈라서는 동안에는 두 배치 사이를 흐른다. */
function placeOf(scene: MutuallyReachableScene, geo: Geo, posT: number): Map<string, Pt> {
  if (!scene.split) return geo.chain;
  const out = new Map<string, Pt>();
  for (const id of scene.graph.nodes) {
    const a = geo.chain.get(id);
    const b = geo.cluster.get(id) ?? a;
    if (!a || !b) continue;
    out.set(id, { x: a.x + (b.x - a.x) * posT, y: a.y + (b.y - a.y) * posT });
  }
  return out;
}

/** 지금 검사기에 걸린 두 갈래. 자취를 걷은 뒤에도 검사기에는 남는다. */
function trialOf(scene: MutuallyReachableScene, lane: 0 | 1): Trial | null {
  const probe = scene.probe;
  if (probe === null) return null;
  return lane === 0 ? probe.forward : probe.backward;
}

/** 그래프에 아직 보이는 답사. 무리가 확정되면 걷힌다. */
function liveTrials(scene: MutuallyReachableScene): Trial[] {
  const probe = scene.probe;
  if (probe === null || !probe.trail) return [];
  const out: Trial[] = [];
  if (probe.forward !== null) out.push(probe.forward);
  if (probe.backward !== null) out.push(probe.backward);
  return out;
}

/** 켜진 간선 — 길이 있다고 답한 답사가 지나온 도막들. */
function litKeysOf(scene: MutuallyReachableScene): Set<string> {
  const out = new Set<string>();
  for (const trial of liveTrials(scene)) {
    if (trial.kind !== 'found') continue;
    for (let i = 0; i + 1 < trial.path.length; i += 1) {
      out.add(`${trial.path[i]}>${trial.path[i + 1]}`);
    }
  }
  return out;
}

/** 길 위에 선 정점들. */
function pathNodesOf(scene: MutuallyReachableScene): Set<string> {
  const out = new Set<string>();
  for (const trial of liveTrials(scene)) {
    if (trial.kind !== 'found') continue;
    for (const id of trial.path) out.add(id);
  }
  return out;
}

/** 막힌 답사가 그려 보인 덩이. 한 짝에 많아야 하나다. */
function blockedRegionOf(scene: MutuallyReachableScene): string[] | null {
  for (const trial of liveTrials(scene)) {
    if (trial.kind === 'blocked') return trial.region;
  }
  return null;
}

/**
 * 한 번 그릴 때의 화면 형편. 장면이 말하지 않는 **지나가는 것**만 담는다.
 *
 * 멎어 있을 때는 `restBoard` 가 장면에서 곧바로 만들고, 운동 중에는 프레임마다
 * 새로 만들어진다. 어느 쪽이든 그리는 길은 `paint` 하나다.
 */
type Board = {
  /** 갈라선 자리로 흘러간 정도. */
  posT: number;
  /** 짚는 링이 닫힌 정도. 0 이면 아직 바깥에 크게 벌어져 있다. */
  askT: number;
  /** 간선이 그어진 정도. 목록에 없으면 다 그어져 있다. */
  draw: Map<string, number>;
  /** 지금 얼룩이 든 정점. */
  stained: Set<string>;
  /** 얼룩 바깥을 흐리는가. 벽이 닫히는 순간부터다. */
  dim: boolean;
  /** 벽이 닫힌 정도. 0 이면 아직 짓지 않는다. */
  wallT: number;
  token: Pt | null;
  arrive: { at: Pt; t: number } | null;
  tieT: number;
  crackT: number;
  /** 검사기 두 칸이 당겨지거나 밀린 정도(px). */
  chipShift: number;
  /** 다리 위 점선이 흐른 정도. 0 미만이면 흐르지 않는다. */
  flowT: number;
  /** 맨 나중 무리 둘레가 떠오른 정도. */
  hullGrow: number;
  /** 맨 나중 짚음 기록이 앉은 정도. */
  markGrow: number;
};

export const mutuallyReachableStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MutuallyReachableScene> {
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const seed = categorical(GROUP_SEED, 'vivid');
    const groupColor = (gi: number): string =>
      seed[GROUP_HUE_ORDER[gi % GROUP_HUE_ORDER.length] as number] as string;

    // ── 레이어. 순서가 곧 겹침 순서다. 레이어 자신에는 속성을 걸지 않는다 —
    //    걸면 자식을 비워도 그 속성이 남아 되짚기 판정에서 어긋난다.
    const layerHull = el('g', {});
    const layerWall = el('g', {});
    const layerEdge = el('g', {});
    const layerNode = el('g', {});
    const layerToken = el('g', {});
    const layerStrip = el('g', {});
    const layerLedger = el('g', {});
    const layerCaption = el('g', {});
    const layers = [
      layerHull,
      layerWall,
      layerEdge,
      layerNode,
      layerToken,
      layerStrip,
      layerLedger,
      layerCaption,
    ];
    for (const l of layers) svg.appendChild(l);

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
     * 빗장이고, 이것이 두 번째다. 걸음 함수가 `await` 를 지나므로 그 사이에 새
     * `render` 가 오면 살아남은 프레임이 이미 새로 선 화면을 덮는다.
     */
    let gen = 0;

    // ── 문안. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10).
    //    수는 전부 그 장면의 구조에서 셈한다 — 장면이 실어 온 수를 쓰지 않는다.
    function captionText(cap: MutuallyReachableCaption, scene: MutuallyReachableScene): string {
      const probe = scene.probe;
      switch (cap.kind) {
        case 'intro':
          return tr('caption.intro', 'Pick two vertices and ask: can each one reach the other?');
        case 'ask':
          if (probe === null) return '';
          return tr('caption.ask', 'Take {u} and {v}.', { u: probe.u, v: probe.v });
        case 'reached': {
          const trial = trialOf(scene, cap.lane);
          if (probe === null || trial === null || trial.kind !== 'found') return '';
          return tr('caption.reached', '{from} to {to}: there is a way, and this is it.', {
            from: trial.path[0] ?? '',
            to: trial.path[trial.path.length - 1] ?? '',
          });
        }
        case 'blocked': {
          const trial = trialOf(scene, cap.lane);
          if (probe === null || trial === null || trial.kind !== 'blocked') return '';
          const from = trial.region[0] ?? '';
          return tr(
            'caption.blocked',
            'No way from {from} to {to}. From {from} you only ever reach {region}.',
            {
              from,
              to: from === probe.u ? probe.v : probe.u,
              region: trial.region.join(', '),
            },
          );
        }
        case 'verdict': {
          if (probe === null || probe.verdict === null) return '';
          return probe.verdict
            ? tr('caption.mutual', 'Both ways work, so {u} and {v} belong together.', {
                u: probe.u,
                v: probe.v,
              })
            : tr('caption.oneWay', 'Only one way, so {u} and {v} are not one group.', {
                u: probe.u,
                v: probe.v,
              });
        }
        case 'settled': {
          const members = scene.groups[scene.groups.length - 1];
          if (members === undefined) return '';
          return tr('caption.settled', '{members} form one group of {count}.', {
            members: members.join(', '),
            count: members.length,
          });
        }
        case 'split': {
          // 세 수가 전부 같은 자료에서 나온다 — 무리와 바탕의 간선.
          const bridges = bridgesOf(scene.graph, scene.groups);
          return tr(
            'caption.split',
            '{groupCount} groups. Links between them: {bridgeCount}, one way only: {oneWayCount}. Cross and there is no way back.',
            {
              groupCount: scene.groups.length,
              bridgeCount: bridges.length,
              oneWayCount: oneWayCountOf(bridges),
            },
          );
        }
      }
    }

    // ── 검사기와 기록의 표기. 문안이 아니라 기호라 여기서 만든다.

    function chipStateOf(scene: MutuallyReachableScene, lane: 0 | 1): ChipState {
      const probe = scene.probe;
      if (probe === null) return 'idle';
      const trial = lane === 0 ? probe.forward : probe.backward;
      if (trial !== null) return trial.kind;
      // 0 번 칸은 짚는 순간 이미 묻고 있고, 1 번 칸은 앞 답이 나온 뒤에 묻는다.
      return lane === 0 || probe.forward !== null ? 'asking' : 'idle';
    }

    function chipRouteOf(scene: MutuallyReachableScene, lane: 0 | 1): string {
      const trial = trialOf(scene, lane);
      if (trial === null) return '';
      return trial.kind === 'found'
        ? trial.path.join(' → ')
        : `${trial.region.join(' · ')} ⊣`;
    }

    /**
     * 짚어 본 짝 하나의 표기. 물어 본 방향마다 화살 하나이고, 막힌 방향은 화살 대신
     * 멈춤 표(`⊣`)가 선다 — 갈린 까닭이 그 한 글자에 있다.
     */
    function markText(m: PairMark): string {
      const f = m.forward === null ? '' : `${m.u}${m.forward === 'found' ? '→' : '⊣'}${m.v}`;
      const b = m.backward === null ? '' : `${m.v}${m.backward === 'found' ? '→' : '⊣'}${m.u}`;
      if (f === '') return b;
      return b === '' ? f : `${f} · ${b}`;
    }

    /** 알약의 폭. 정수로 맞춰 자리 셈이 부동소수 끝자리를 끌고 다니지 않게 한다. */
    function markWidth(m: PairMark): number {
      return Math.round(LEDGER_PAD * 2 + [...markText(m)].length * LEDGER_CH);
    }

    // ── 그리기 -------------------------------------------------------------

    function restBoard(scene: MutuallyReachableScene): Board {
      const region = blockedRegionOf(scene);
      const verdict = scene.probe?.verdict ?? null;
      return {
        posT: 1,
        askT: 1,
        draw: new Map(),
        stained: new Set(region ?? []),
        dim: region !== null,
        wallT: region === null ? 0 : 1,
        token: null,
        arrive: null,
        tieT: verdict === true ? 1 : 0,
        crackT: verdict === false ? 1 : 0,
        chipShift: verdict === null ? 0 : verdict ? -4 : 6,
        flowT: -1,
        hullGrow: 1,
        markGrow: 1,
      };
    }

    /**
     * 그 장면의 화면을 통째로 세운다. 되돌릴 명령이 없으므로 늘 비우고 시작한다.
     *
     * 아직 없는 것은 숨기지 않고 **짓지 않는다** — 투명도 0 으로 숨기면 좌표가 앞
     * 걸음 값으로 남아 되짚기 판정에서 어긋난다.
     */
    function paint(scene: MutuallyReachableScene, geo: Geo, board: Board): void {
      for (const l of layers) l.textContent = '';

      const pos = placeOf(scene, geo, board.posT);
      const lit = litKeysOf(scene);
      const onPath = pathNodesOf(scene);
      const probe = scene.probe;

      // ── 무리 둘레. 확정된 무리마다 하나이고 맨 나중 것만 떠오르는 중일 수 있다.
      scene.groups.forEach((members, gi) => {
        const points = members.map((m) => pos.get(m)).filter((p): p is Pt => p !== undefined);
        if (points.length === 0) return;
        const box = boxOf(points, HULL_PAD);
        const grow = gi === scene.groups.length - 1 ? board.hullGrow : 1;
        const rect = el('rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 24,
          'stroke-width': 2,
          'stroke-dasharray': '2 5',
          fill: withAlpha(groupColor(gi), 0.13),
          stroke: withAlpha(groupColor(gi), 0.55),
        });
        if (grow < 1) rect.setAttribute('opacity', String(grow));
        layerHull.appendChild(rect);
      });

      // ── 벽. 막힌 덩이를 두르고 닫힌다.
      if (board.wallT > 0) {
        const region = blockedRegionOf(scene) ?? [];
        const points = region.map((id) => pos.get(id)).filter((p): p is Pt => p !== undefined);
        if (points.length > 0) {
          const box = boxOf(points, WALL_PAD);
          const grow = 1 - board.wallT;
          layerWall.appendChild(
            el('rect', {
              x: box.x + box.w * 0.06 * grow,
              y: box.y + box.h * 0.06 * grow,
              width: box.w * (1 - 0.12 * grow),
              height: box.h * (1 - 0.12 * grow),
              rx: 22,
              fill: 'none',
              'stroke-width': 2,
              'stroke-dasharray': '7 6',
              stroke: c.danger,
              opacity: board.wallT,
            }),
          );
        }
      }

      // ── 간선
      for (const e of scene.graph.edges) {
        const k = keyOf(e);
        const p1 = pos.get(e.from);
        const p2 = pos.get(e.to);
        if (!p1 || !p2) continue;
        const g = curveOf(p1, p2);

        const isLit = lit.has(k);
        const flood = board.stained.has(e.from) && board.stained.has(e.to);
        const bridge = scene.split && geo.bridges.has(k);
        let stroke = c.textMuted;
        let width = 1.6;
        if (isLit) {
          stroke = c.accent;
          width = 3.4;
        } else if (flood) {
          stroke = c.danger;
          width = 2.4;
        } else if (bridge) {
          stroke = c.text;
          width = 2.8;
        }

        const t = board.draw.get(k) ?? 1;
        const len = curveLength(g);
        const flowing = bridge && board.flowT >= 0;
        // 지나온 길은 흐리지 않는다 — "갈 수는 있었다" 와 "돌아올 수 없다" 가 한 화면에
        // 함께 남아야 반쪽만 되는 사이가 무슨 뜻인지 보인다.
        const alpha = board.dim && !isLit && !flood ? 0.22 : 1;

        layerEdge.appendChild(
          el('path', {
            d: curvePath(g),
            fill: 'none',
            'stroke-linecap': 'round',
            stroke,
            'stroke-width': width,
            'stroke-dasharray': flowing ? '10 8' : `${len.toFixed(1)} ${len.toFixed(1)}`,
            'stroke-dashoffset': flowing ? -board.flowT * 36 : (len * (1 - t)).toFixed(1),
            opacity: alpha,
          }),
        );
        layerEdge.appendChild(
          el('path', {
            d: arrowPath(g, p2),
            stroke: 'none',
            fill: stroke,
            opacity: t > 0.92 ? alpha : 0,
          }),
        );
      }

      // ── 정점
      for (const id of scene.graph.nodes) {
        const p = pos.get(id);
        if (!p) continue;
        const gi = geo.groupAt.get(id);
        let fill = c.itemDefault;
        let stroke = c.textMuted;
        let strokeWidth = 2;
        let ink = c.text;
        if (board.stained.has(id)) {
          fill = withAlpha(c.danger, 0.16);
          stroke = c.danger;
          strokeWidth = 2.4;
        } else if (gi !== undefined) {
          fill = groupColor(gi);
          stroke = shiftLightness(groupColor(gi), -0.18);
          strokeWidth = 2.4;
          ink = c.stateInk;
        } else if (onPath.has(id)) {
          fill = withAlpha(c.accent, 0.3);
          stroke = c.accent;
          strokeWidth = 2.6;
        }
        const alpha = board.dim && !board.stained.has(id) && !onPath.has(id) ? 0.24 : 1;

        layerNode.appendChild(
          el('circle', {
            cx: p.x,
            cy: p.y,
            r: R,
            fill,
            stroke,
            'stroke-width': strokeWidth,
            opacity: alpha,
          }),
        );

        // 짚은 두 끝의 링. 짚는 걸음에서 바깥에서 오므라들어 닫힌다.
        if (probe !== null && probe.trail && (probe.u === id || probe.v === id)) {
          layerNode.appendChild(
            el('circle', {
              cx: p.x,
              cy: p.y,
              r: R + 6 + (1 - board.askT) * 14,
              fill: 'none',
              'stroke-width': 2.4,
              stroke: c.accent,
              opacity: 0.85 * board.askT,
            }),
          );
        }

        const label = el('text', {
          x: p.x,
          y: p.y + 6,
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          'text-anchor': 'middle',
          fill: ink,
          opacity: alpha,
        });
        label.textContent = id;
        layerNode.appendChild(label);
      }

      // ── 토큰. 길을 타고 움직이는 동안에만 있다.
      if (board.token !== null) {
        layerToken.appendChild(
          el('circle', {
            cx: board.token.x,
            cy: board.token.y,
            r: 9,
            'stroke-width': 1.2,
            fill: c.accent,
            stroke: c.stateInk,
          }),
        );
      }
      if (board.arrive !== null) {
        layerToken.appendChild(
          el('circle', {
            cx: board.arrive.at.x,
            cy: board.arrive.at.y,
            r: R + 4 + board.arrive.t * 12,
            fill: 'none',
            'stroke-width': 3,
            stroke: c.accent,
            opacity: 1 - board.arrive.t,
          }),
        );
      }

      // ── 왕복 검사기. 흐리는 것은 레이어가 아니라 이 안의 무리에 건다.
      const strip = el('g', scene.finished ? { opacity: 0.55 } : {});
      layerStrip.appendChild(strip);
      for (let i = 0; i < 2; i += 1) {
        const lane = i as 0 | 1;
        const baseX = STRIP_X + i * (CHIP_W + CHIP_GAP);
        const x = baseX + (i === 0 ? -board.chipShift : board.chipShift);
        const state = chipStateOf(scene, lane);
        let fill = c.bgSubtle;
        let stroke = c.border;
        let width = 1.4;
        let ink = c.textMuted;
        if (state === 'asking') {
          stroke = c.accent;
          width = 2;
          ink = c.text;
        } else if (state === 'found') {
          fill = withAlpha(c.accent, 0.18);
          stroke = c.accent;
          width = 2;
          ink = c.text;
        } else if (state === 'blocked') {
          fill = withAlpha(c.danger, 0.12);
          stroke = c.danger;
          width = 2;
          ink = c.danger;
        }
        strip.appendChild(
          el('rect', {
            x,
            y: CHIP_Y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 11,
            fill,
            stroke,
            'stroke-width': width,
          }),
        );
        const note = el('text', {
          x: x + 16,
          y: CHIP_Y + 24,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'start',
          fill: ink,
        });
        note.textContent = probe === null ? '' : lane === 0 ? `${probe.u} → ${probe.v}` : `${probe.v} → ${probe.u}`;
        strip.appendChild(note);
        const route = el('text', {
          x: x + CHIP_W - 16,
          y: CHIP_Y + 24,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'end',
          fill: ink,
        });
        route.textContent = chipRouteOf(scene, lane);
        strip.appendChild(route);
      }

      // 둘 다 통하면 아래로 띠가 자라 둘을 묶는다.
      if (board.tieT > 0) {
        const full = CHIP_W * 2 + CHIP_GAP;
        strip.appendChild(
          el('rect', {
            x: STRIP_X + (full * (1 - board.tieT)) / 2,
            y: TIE_Y,
            width: full * board.tieT,
            height: TIE_H,
            rx: TIE_H / 2,
            fill: c.accent,
          }),
        );
      }
      // 한쪽이 막히면 칸 사이에 금이 간다.
      if (board.crackT > 0) {
        const cx = STRIP_X + CHIP_W + CHIP_GAP / 2;
        const top = CHIP_Y - 6;
        const bottom = CHIP_Y + CHIP_H + 12;
        const steps = 5;
        let d = `M ${cx} ${top}`;
        for (let i = 1; i <= steps; i += 1) {
          const y = top + ((bottom - top) * i) / steps;
          d += ` L ${cx + (i % 2 === 0 ? 5 : -5)} ${y}`;
        }
        strip.appendChild(
          el('path', {
            d,
            fill: 'none',
            'stroke-width': 2.6,
            stroke: c.danger,
            opacity: board.crackT,
          }),
        );
      }

      // ── 짚어 본 짝의 기록. 여기가 조각의 결론이 남는 자리다.
      let cursor = STRIP_X;
      scene.marks.forEach((m, i) => {
        const w = markWidth(m);
        const grow = i === scene.marks.length - 1 ? board.markGrow : 1;
        const pill = el('g', {});
        if (grow < 1) {
          pill.setAttribute('transform', `translate(0 ${(-(1 - grow) * 7).toFixed(2)})`);
          pill.setAttribute('opacity', String(grow));
        }
        const rect = el('rect', {
          x: cursor,
          y: LEDGER_Y,
          width: w,
          height: LEDGER_H,
          rx: LEDGER_H / 2,
          'stroke-width': 1.6,
          fill: m.mutual ? withAlpha(c.accent, 0.18) : withAlpha(c.danger, 0.12),
          stroke: m.mutual ? c.accent : c.danger,
        });
        // 테두리가 판정을 말한다 — 실선은 오간다, 점선은 한쪽에서 막혔다.
        if (!m.mutual) rect.setAttribute('stroke-dasharray', '4 3');
        pill.appendChild(rect);
        const text = el('text', {
          x: cursor + w / 2,
          y: LEDGER_Y + 15,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: m.mutual ? c.text : c.danger,
        });
        text.textContent = markText(m);
        pill.appendChild(text);
        layerLedger.appendChild(pill);
        cursor += w + LEDGER_GAP;
      });

      // ── 캡션
      const [line1, line2] = wrapTwoLines(
        scene.caption === null ? '' : captionText(scene.caption, scene),
        CAPTION_BUDGET,
      );
      for (const [text, y] of [
        [line1, CAPTION_Y1],
        [line2, CAPTION_Y2],
      ] as [string, number][]) {
        if (text === '') continue;
        const node = el('text', {
          x: W / 2,
          y,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
          fill: c.text,
        });
        node.textContent = text;
        layerCaption.appendChild(node);
      }
    }

    // ── 시간 ---------------------------------------------------------------

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function later(fn: () => void): void {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          fn();
        });
        frames.add(id);
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, 16);
      timers.add(id);
    }

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 약속을 깨우는 `finish` 를 `waiters` 에 담아 둔다. 프레임을 취소하면 콜백이
     * 아예 안 불리므로, `destroy` 가 그 자리에서 직접 깨우지 않으면 약속이 영영
     * 안 풀린다 (S-piece).
     */
    function animate(ms: number, mine: number, draw: (t: number) => void): Promise<void> {
      if (destroyed || mine !== gen || ms <= 0) {
        if (!destroyed && mine === gen) draw(1);
        return Promise.resolve();
      }
      const t0 = now();
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
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
          later(tick);
        };
        draw(0);
        later(tick);
      });
    }

    function hasEdge(graph: ReachGraph, from: string, to: string): boolean {
      return graph.edges.some((e) => e.from === from && e.to === to);
    }

    /**
     * 얼룩이 번지는 차례. 덩이는 발견 순서로 오므로, 각 정점은 앞선 것 중 자기에게
     * 간선을 대는 첫 정점에서 번져 온다.
     */
    function spreadsOf(graph: ReachGraph, region: string[]): { key: string | null; node: string }[] {
      const out: { key: string | null; node: string }[] = [];
      for (let i = 1; i < region.length; i += 1) {
        const node = region[i] as string;
        const parent = region.slice(0, i).find((prev) => hasEdge(graph, prev, node));
        out.push({ key: parent === undefined ? null : `${parent}>${node}`, node });
      }
      return out;
    }

    /** 이번 걸음에 달라진 것만 흐르게 한다. */
    async function flow(scene: MutuallyReachableScene, geo: Geo, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const rest = restBoard(scene);

      // 두 정점을 짚는다 — 링이 바깥에서 오므라들어 닫힌다.
      if (step.kind === 'ask') {
        await animate(ASK_MS, mine, (t) => {
          paint(scene, geo, { ...rest, askT: easeOut(t) });
        });
        return;
      }

      // 길이 있다 — 토큰이 도막을 차례로 타고 가 도착점에서 파문 하나를 남긴다.
      // 한 뜻으로 묶인 운동이라 시계를 나누지 않고 한 `animate` 로 흘린다.
      if (step.kind === 'walk') {
        const trial = trialOf(scene, step.lane);
        if (trial === null || trial.kind !== 'found') return;
        const path = trial.path;
        const hops = path.length - 1;
        if (hops <= 0) return;
        const pos = placeOf(scene, geo, 1);
        const legs: { key: string; curve: Curve }[] = [];
        for (let i = 0; i < hops; i += 1) {
          const p1 = pos.get(path[i] as string);
          const p2 = pos.get(path[i + 1] as string);
          if (!p1 || !p2) return;
          legs.push({ key: `${path[i]}>${path[i + 1]}`, curve: curveOf(p1, p2) });
        }
        const end = pos.get(path[hops] as string) ?? null;
        const walkMs = hops * HOP_MS;
        const total = walkMs + ARRIVE_MS;

        await animate(total, mine, (t) => {
          const ms = t * total;
          const draw = new Map<string, number>();
          if (ms < walkMs) {
            const i = Math.min(hops - 1, Math.floor(ms / HOP_MS));
            const local = (ms - i * HOP_MS) / HOP_MS;
            for (let j = 0; j < i; j += 1) draw.set((legs[j] as { key: string }).key, 1);
            draw.set((legs[i] as { key: string }).key, local);
            paint(scene, geo, {
              ...rest,
              draw,
              token: curveAt((legs[i] as { curve: Curve }).curve, local),
            });
            return;
          }
          const local = Math.min(1, (ms - walkMs) / ARRIVE_MS);
          paint(scene, geo, {
            ...rest,
            token: end,
            arrive: end === null ? null : { at: end, t: easeInOut(local) },
          });
        });
        return;
      }

      // 길이 없다 — 얼룩이 닿는 곳으로 번지고, 다 번진 뒤 그 둘레에 벽이 닫힌다.
      if (step.kind === 'flood') {
        const trial = trialOf(scene, step.lane);
        if (trial === null || trial.kind !== 'blocked') return;
        const region = trial.region;
        const spreads = spreadsOf(scene.graph, region);
        const floodMs = spreads.length * FLOOD_MS;
        const total = floodMs + WALL_MS;

        await animate(total, mine, (t) => {
          const ms = t * total;
          const stained = new Set<string>([region[0] as string]);
          const draw = new Map<string, number>();
          if (ms < floodMs) {
            const i = Math.min(spreads.length - 1, Math.floor(ms / FLOOD_MS));
            const local = (ms - i * FLOOD_MS) / FLOOD_MS;
            for (let j = 0; j < i; j += 1) {
              const s = spreads[j] as { key: string | null; node: string };
              stained.add(s.node);
              if (s.key !== null) draw.set(s.key, 1);
            }
            const cur = spreads[i] as { key: string | null; node: string };
            if (cur.key !== null) draw.set(cur.key, local);
            // 얼룩은 도막의 중간을 지나야 건너간다.
            if (local > 0.55) stained.add(cur.node);
            paint(scene, geo, { ...rest, draw, stained, dim: false, wallT: 0 });
            return;
          }
          for (const s of spreads) stained.add(s.node);
          const local = Math.min(1, (ms - floodMs) / WALL_MS);
          paint(scene, geo, { ...rest, stained, wallT: easeInOut(local) });
        });
        return;
      }

      // 판정 — 띠가 자라 둘을 묶거나 금이 가며 서로 밀린다. 기록도 같은 시계에 앉는다.
      if (step.kind === 'verdict') {
        const mutual = scene.probe?.verdict === true;
        await animate(VERDICT_MS, mine, (t) => {
          const e = easeInOut(t);
          paint(scene, geo, {
            ...rest,
            tieT: mutual ? e : 0,
            crackT: mutual ? 0 : e,
            chipShift: mutual ? -4 * e : 6 * e,
            markGrow: e,
          });
        });
        return;
      }

      // 무리가 확정된다 — 둘레가 떠오른다.
      if (step.kind === 'settle') {
        await animate(SETTLE_MS, mine, (t) => {
          paint(scene, geo, { ...rest, hullGrow: easeInOut(t) });
        });
        return;
      }

      // 갈라선다 — 자리를 옮기고, 남은 한 줄기가 어느 쪽으로 흐르는지 점선이 말한다.
      const total = SPLIT_MS + FLOW_MS;
      await animate(total, mine, (t) => {
        const ms = t * total;
        if (ms < SPLIT_MS) {
          paint(scene, geo, { ...rest, posT: easeInOut(ms / SPLIT_MS) });
          return;
        }
        paint(scene, geo, { ...rest, flowT: Math.min(1, (ms - SPLIT_MS) / FLOW_MS) });
      });
    }

    async function render(
      next: MutuallyReachableScene,
      /** 이 조각은 출발 자리를 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: MutuallyReachableScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const geo = geometryOf(next);
      paint(next, geo, restBoard(next));

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, geo, mine);
      if (mine !== gen || destroyed) return;

      // 운동이 끝나면 장면을 통째로 다시 세운다. 보간의 끝자리가 목표값과 문자열로
      // 어긋나는 일이 없어진다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      paint(next, geo, restBoard(next));
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 취소된 프레임은 콜백이 안 불린다 — 기다리던 약속을 여기서 직접 깨운다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
