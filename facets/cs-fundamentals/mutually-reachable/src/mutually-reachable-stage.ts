/**
 * 서로 오갈 수 있는 무리 — stage view.
 *
 * ── 무엇이 어디에 있는가
 *
 *   위 (0..64)     왕복 검사기. 칸 둘이 두 방향을 하나씩 맡는다. 둘 다 통하면
 *                  칸 아래로 띠가 자라 둘을 묶고, 한쪽이 막히면 칸 사이가
 *                  금이 가며 서로 밀려난다.
 *   가운데 (68..250) 그래프. 처음에는 다섯이 한 줄로 늘어서 무리가 보이지 않는다.
 *   아래 (254..296) 캡션. 문안은 projector 가 준다 (C10).
 *
 * ── 두 답사는 서로 다른 일로 보인다
 *
 *   갈 수 있을 때   토큰 하나가 간선을 타고 **움직인다.** 지나온 간선이 켜지고,
 *                   왕복이 둘 다 켜지면 화면에 고리가 남는다.
 *   갈 길이 없을 때  토큰이 없다. 닿을 수 있는 곳으로 얼룩이 **번지고**, 다 번진
 *                   뒤 그 둘레에 점선 벽이 닫힌다. 바깥은 흐려진다.
 *
 * ── 갈린다
 *
 * 마지막에 정점들이 실제로 자리를 옮긴다. 오갈 수 있는 것끼리 한 덩이로 모이고
 * 덩이끼리는 캔버스 양 끝으로 밀려나, 둘을 잇던 간선 하나만 빈 사이를 건넌다.
 * 그 간선의 화살촉은 한쪽뿐이다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 정점 수가 달라져도 배치를 캔버스에서
 * 역산할 뿐 viewBox 를 다시 재지 않는다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  shiftLightness,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

export type StageEdge = { from: string; to: string };

type Pt = { x: number; y: number };

/** 이차 베지어 한 도막 — 시작 · 제어 · 끝. */
type Curve = { s: Pt; c: Pt; e: Pt };

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 296;

/** 정점 반지름. 라벨 한 글자가 편히 앉는 크기. */
const R = 22;
/** 캔버스 좌우 여백. 무리 둘레까지 이 안에 들어온다. */
const MARGIN_X = 34;
/** 무리 둘레와 정점 사이의 숨. */
const HULL_PAD = 12;
/** 막힌 영역을 두르는 벽과 정점 사이의 숨. */
const WALL_PAD = 17;

/** 늘어선 줄의 아래칸 / 윗칸 세로. 지그재그로 두어야 간선이 겹치지 않는다. */
const CHAIN_LOW_Y = 196;
const CHAIN_HIGH_Y = 120;
/** 갈린 뒤 무리 중심의 세로. */
const SPLIT_CY = 170;

/** 간선의 휨. 오가는 짝(두 방향)이 같은 자리에 겹치지 않게 하는 것이 첫 몫이다. */
const BOW = 22;

const STRIP_X = 28;
const CHIP_W = 270;
const CHIP_GAP = 24;
const CHIP_Y = 14;
const CHIP_H = 38;
const TIE_Y = CHIP_Y + CHIP_H + 6;
const TIE_H = 5;

const CAPTION_Y1 = 268;
const CAPTION_Y2 = 286;
/** 캡션 한 줄에 담기는 폭 — 한글 한 자를 2, 그 밖을 1로 센 값. */
const CAPTION_BUDGET = 72;

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
  for (const ch of s) n += /[\u1100-\u11FF\u3131-\u318E\uAC00-\uD7A3]/.test(ch) ? 2 : 1;
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

type ChipState = 'idle' | 'asking' | 'found' | 'blocked';

/** projector 가 부르는 계약. 문안은 전부 밖에서 온다. */
export type MutuallyReachableStageInstance = ViewInstance & {
  setGraph(nodes: string[], edges: StageEdge[]): void;
  setCaption(text: string): void;
  askPair(u: string, v: string): void;
  showReached(from: string, to: string, path: string[]): Promise<void>;
  showBlocked(from: string, to: string, region: string[]): Promise<void>;
  resolvePair(mutual: boolean): Promise<void>;
  settleGroup(group: number, members: string[]): Promise<void>;
  splitApart(groups: string[][], bridges: StageEdge[]): Promise<void>;
  finish(): void;
  resetAll(): void;
};

export const mutuallyReachableStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): MutuallyReachableStageInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const seed = categorical(GROUP_SEED, 'vivid');
    const groupColor = (gi: number): string =>
      seed[GROUP_HUE_ORDER[gi % GROUP_HUE_ORDER.length] as number] as string;

    // ── 레이어. 순서가 곧 겹침 순서다.
    const layerHull = el('g', {});
    const layerWall = el('g', {});
    const layerEdge = el('g', {});
    const layerNode = el('g', {});
    const layerToken = el('g', {});
    const layerStrip = el('g', {});
    const layerCaption = el('g', {});
    for (const l of [layerHull, layerWall, layerEdge, layerNode, layerToken, layerStrip, layerCaption]) {
      svg.appendChild(l);
    }

    // ── 상태
    let nodes: string[] = [];
    let edges: StageEdge[] = [];
    let pos = new Map<string, Pt>();

    const groupOfNode = new Map<string, number>();
    let settled: string[][] = [];
    let bridgeKeys = new Set<string>();

    let endpoints: [string, string] | null = null;
    const litEdges = new Set<string>();
    const drawT = new Map<string, number>();
    const onPath = new Set<string>();
    const flooded = new Set<string>();
    let outsideDim = false;
    let wallBox: { x: number; y: number; w: number; h: number } | null = null;
    let wallT = 0;
    let token: Pt | null = null;
    let arriveAt: { at: Pt; t: number } | null = null;
    let flowT = -1;

    const chipState: ChipState[] = ['idle', 'idle'];
    const chipNote: string[] = ['', ''];
    const chipRoute: string[] = ['', ''];
    let chipShift = 0;
    let tieT = 0;
    let crackT = 0;
    let stripDim = false;
    let caption = '';

    // ── 상시 요소
    const chipRect: SVGRectElement[] = [];
    const chipNoteText: SVGTextElement[] = [];
    const chipRouteText: SVGTextElement[] = [];
    for (let i = 0; i < 2; i += 1) {
      const rect = el('rect', { x: 0, y: CHIP_Y, width: CHIP_W, height: CHIP_H, rx: 11 });
      const note = el('text', {
        y: CHIP_Y + 24,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'text-anchor': 'start',
      });
      const route = el('text', {
        y: CHIP_Y + 24,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'text-anchor': 'end',
      });
      layerStrip.append(rect, note, route);
      chipRect.push(rect);
      chipNoteText.push(note);
      chipRouteText.push(route);
    }
    const tieBar = el('rect', { y: TIE_Y, height: TIE_H, rx: TIE_H / 2, opacity: 0 });
    const crack = el('path', { fill: 'none', 'stroke-width': 2.6, opacity: 0 });
    layerStrip.append(tieBar, crack);

    const wallRect = el('rect', {
      fill: 'none',
      'stroke-width': 2,
      'stroke-dasharray': '7 6',
      rx: 22,
      opacity: 0,
    });
    layerWall.appendChild(wallRect);

    const tokenRing = el('circle', { r: R + 4, fill: 'none', 'stroke-width': 3, opacity: 0 });
    const tokenDot = el('circle', { r: 9, 'stroke-width': 1.2, opacity: 0 });
    layerToken.append(tokenRing, tokenDot);

    const captionLine1 = el('text', {
      x: W / 2,
      y: CAPTION_Y1,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'text-anchor': 'middle',
      fill: c.text,
    });
    const captionLine2 = el('text', {
      x: W / 2,
      y: CAPTION_Y2,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'text-anchor': 'middle',
      fill: c.text,
    });
    layerCaption.append(captionLine1, captionLine2);

    const hullRects = new Map<number, SVGRectElement>();
    const nodeCircle = new Map<string, SVGCircleElement>();
    const nodeRing = new Map<string, SVGCircleElement>();
    const nodeLabel = new Map<string, SVGTextElement>();
    const edgePath = new Map<string, SVGPathElement>();
    const edgeHead = new Map<string, SVGPathElement>();

    // ── 애니메이션. destroy 하면 예약된 프레임을 전부 거둔다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임·타이머를 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지
     * 않으므로 `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면
     * `await ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과
     * projector 와 SVG 트리가 통째로 붙들린다 (S-view).
     */
    const waiters = new Set<() => void>();

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

    function animate(ms: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          onFrame(raw);
          render();
          if (raw >= 1) {
            finish();
            return;
          }
          later(tick);
        };
        later(tick);
      });
    }

    const key = (e: StageEdge): string => `${e.from}>${e.to}`;

    function hasEdge(from: string, to: string): boolean {
      return edges.some((e) => e.from === from && e.to === to);
    }

    // ── 그리기
    function render(): void {
      // 무리 둘레
      for (const [gi, rect] of hullRects) {
        const members = settled[gi];
        if (!members || members.length === 0) {
          rect.setAttribute('opacity', '0');
          continue;
        }
        const box = boxOf(
          members.map((m) => pos.get(m) ?? { x: W / 2, y: SPLIT_CY }),
          HULL_PAD,
        );
        rect.setAttribute('x', String(box.x));
        rect.setAttribute('y', String(box.y));
        rect.setAttribute('width', String(box.w));
        rect.setAttribute('height', String(box.h));
      }

      // 벽
      if (wallBox && wallT > 0) {
        const grow = 1 - wallT;
        wallRect.setAttribute('x', String(wallBox.x + wallBox.w * 0.06 * grow));
        wallRect.setAttribute('y', String(wallBox.y + wallBox.h * 0.06 * grow));
        wallRect.setAttribute('width', String(wallBox.w * (1 - 0.12 * grow)));
        wallRect.setAttribute('height', String(wallBox.h * (1 - 0.12 * grow)));
        wallRect.setAttribute('stroke', c.danger);
        wallRect.setAttribute('opacity', String(wallT));
      } else {
        wallRect.setAttribute('opacity', '0');
      }

      // 간선
      for (const e of edges) {
        const k = key(e);
        const path = edgePath.get(k);
        const head = edgeHead.get(k);
        if (!path || !head) continue;
        const p1 = pos.get(e.from);
        const p2 = pos.get(e.to);
        if (!p1 || !p2) continue;
        const g = curveOf(p1, p2);
        path.setAttribute('d', curvePath(g));
        head.setAttribute('d', arrowPath(g, p2));

        const lit = litEdges.has(k);
        const flood = flooded.has(e.from) && flooded.has(e.to);
        const bridge = bridgeKeys.has(k);
        let stroke = c.textMuted;
        let width = 1.6;
        if (lit) {
          stroke = c.accent;
          width = 3.4;
        } else if (flood) {
          stroke = c.danger;
          width = 2.4;
        } else if (bridge) {
          stroke = c.text;
          width = 2.8;
        }
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', String(width));
        head.setAttribute('fill', stroke);

        const t = drawT.get(k) ?? 1;
        const len = curveLength(g);
        path.setAttribute('stroke-dasharray', bridge && flowT >= 0 ? '10 8' : `${len.toFixed(1)} ${len.toFixed(1)}`);
        path.setAttribute(
          'stroke-dashoffset',
          bridge && flowT >= 0 ? String(-flowT * 36) : String((len * (1 - t)).toFixed(1)),
        );

        // 지나온 길은 흐리지 않는다 — "갈 수는 있었다" 와 "돌아올 수 없다" 가 한 화면에
        // 함께 남아야 반쪽만 되는 사이가 무슨 뜻인지 보인다.
        const outside = outsideDim && !lit && !flood;
        const alpha = outside ? 0.22 : 1;
        path.setAttribute('opacity', String(alpha));
        head.setAttribute('opacity', String(t > 0.92 ? alpha : 0));
      }

      // 정점
      for (const id of nodes) {
        const circle = nodeCircle.get(id);
        const ring = nodeRing.get(id);
        const label = nodeLabel.get(id);
        const p = pos.get(id);
        if (!circle || !ring || !label || !p) continue;

        circle.setAttribute('cx', String(p.x));
        circle.setAttribute('cy', String(p.y));
        ring.setAttribute('cx', String(p.x));
        ring.setAttribute('cy', String(p.y));
        label.setAttribute('x', String(p.x));
        label.setAttribute('y', String(p.y + 6));

        const gi = groupOfNode.get(id);
        let fill = c.itemDefault;
        let stroke = c.textMuted;
        let strokeWidth = 2;
        let ink = c.text;
        if (flooded.has(id)) {
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
        circle.setAttribute('fill', fill);
        circle.setAttribute('stroke', stroke);
        circle.setAttribute('stroke-width', String(strokeWidth));
        label.setAttribute('fill', ink);

        const isEnd = endpoints !== null && (endpoints[0] === id || endpoints[1] === id);
        ring.setAttribute('stroke', c.accent);
        ring.setAttribute('opacity', isEnd ? '0.85' : '0');

        const dim = outsideDim && !flooded.has(id) && !onPath.has(id);
        const alpha = dim ? 0.24 : 1;
        circle.setAttribute('opacity', String(alpha));
        label.setAttribute('opacity', String(alpha));
      }

      // 토큰
      if (token) {
        tokenDot.setAttribute('cx', String(token.x));
        tokenDot.setAttribute('cy', String(token.y));
        tokenDot.setAttribute('fill', c.accent);
        tokenDot.setAttribute('stroke', c.stateInk);
        tokenDot.setAttribute('opacity', '1');
      } else {
        tokenDot.setAttribute('opacity', '0');
      }
      if (arriveAt) {
        tokenRing.setAttribute('cx', String(arriveAt.at.x));
        tokenRing.setAttribute('cy', String(arriveAt.at.y));
        tokenRing.setAttribute('r', String(R + 4 + arriveAt.t * 12));
        tokenRing.setAttribute('stroke', c.accent);
        tokenRing.setAttribute('opacity', String(1 - arriveAt.t));
      } else {
        tokenRing.setAttribute('opacity', '0');
      }

      // 왕복 검사기
      for (let i = 0; i < 2; i += 1) {
        const baseX = STRIP_X + i * (CHIP_W + CHIP_GAP);
        const shift = i === 0 ? -chipShift : chipShift;
        const rect = chipRect[i] as SVGRectElement;
        const note = chipNoteText[i] as SVGTextElement;
        const route = chipRouteText[i] as SVGTextElement;
        rect.setAttribute('x', String(baseX + shift));
        note.setAttribute('x', String(baseX + shift + 16));
        route.setAttribute('x', String(baseX + shift + CHIP_W - 16));

        const state = chipState[i] as ChipState;
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
        rect.setAttribute('fill', fill);
        rect.setAttribute('stroke', stroke);
        rect.setAttribute('stroke-width', String(width));
        note.setAttribute('fill', ink);
        route.setAttribute('fill', ink);
        note.textContent = chipNote[i] ?? '';
        route.textContent = chipRoute[i] ?? '';
      }
      layerStrip.setAttribute('opacity', stripDim ? '0.55' : '1');

      const tieFull = CHIP_W * 2 + CHIP_GAP;
      tieBar.setAttribute('x', String(STRIP_X + (tieFull * (1 - tieT)) / 2));
      tieBar.setAttribute('width', String(tieFull * tieT));
      tieBar.setAttribute('fill', c.accent);
      tieBar.setAttribute('opacity', String(tieT > 0 ? 1 : 0));

      const cx = STRIP_X + CHIP_W + CHIP_GAP / 2;
      const top = CHIP_Y - 6;
      const bottom = CHIP_Y + CHIP_H + 12;
      const steps = 5;
      let d = `M ${cx} ${top}`;
      for (let i = 1; i <= steps; i += 1) {
        const y = top + ((bottom - top) * i) / steps;
        d += ` L ${cx + (i % 2 === 0 ? 5 : -5)} ${y}`;
      }
      crack.setAttribute('d', d);
      crack.setAttribute('stroke', c.danger);
      crack.setAttribute('opacity', String(crackT));

      // 캡션
      const [line1, line2] = wrapTwoLines(caption, CAPTION_BUDGET);
      captionLine1.textContent = line1;
      captionLine2.textContent = line2;
      captionLine1.setAttribute('fill', c.text);
      captionLine2.setAttribute('fill', c.text);
    }

    function clearProbeMarks(): void {
      litEdges.clear();
      drawT.clear();
      onPath.clear();
      flooded.clear();
      outsideDim = false;
      wallBox = null;
      wallT = 0;
      token = null;
      arriveAt = null;
    }

    function buildGraph(nextNodes: string[], nextEdges: StageEdge[]): void {
      layerHull.textContent = '';
      layerEdge.textContent = '';
      layerNode.textContent = '';
      hullRects.clear();
      nodeCircle.clear();
      nodeRing.clear();
      nodeLabel.clear();
      edgePath.clear();
      edgeHead.clear();

      nodes = [...nextNodes];
      edges = nextEdges.map((e) => ({ from: e.from, to: e.to }));
      pos = chainLayout(nodes);

      groupOfNode.clear();
      settled = [];
      bridgeKeys = new Set();
      endpoints = null;
      clearProbeMarks();
      flowT = -1;
      chipState[0] = 'idle';
      chipState[1] = 'idle';
      chipNote[0] = '';
      chipNote[1] = '';
      chipRoute[0] = '';
      chipRoute[1] = '';
      chipShift = 0;
      tieT = 0;
      crackT = 0;
      stripDim = false;

      for (const e of edges) {
        const path = el('path', { fill: 'none', 'stroke-linecap': 'round' });
        const head = el('path', { stroke: 'none' });
        layerEdge.append(path, head);
        edgePath.set(key(e), path);
        edgeHead.set(key(e), head);
      }
      for (const id of nodes) {
        const circle = el('circle', { r: R });
        const ring = el('circle', { r: R + 6, fill: 'none', 'stroke-width': 2.4, opacity: 0 });
        const label = el('text', {
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          'text-anchor': 'middle',
        });
        label.textContent = id;
        layerNode.append(circle, ring, label);
        nodeCircle.set(id, circle);
        nodeRing.set(id, ring);
        nodeLabel.set(id, label);
      }
      render();
    }

    const instance: MutuallyReachableStageInstance = {
      setGraph(nextNodes, nextEdges) {
        buildGraph(nextNodes, nextEdges);
      },

      setCaption(text) {
        caption = text;
        render();
      },

      askPair(u, v) {
        clearProbeMarks();
        endpoints = [u, v];
        chipState[0] = 'asking';
        chipState[1] = 'idle';
        chipNote[0] = `${u} → ${v}`;
        chipNote[1] = `${v} → ${u}`;
        chipRoute[0] = '';
        chipRoute[1] = '';
        chipShift = 0;
        tieT = 0;
        crackT = 0;
        render();
      },

      async showReached(from, to, path) {
        const lane = endpoints !== null && endpoints[0] === from ? 0 : 1;
        const other = 1 - lane;
        chipState[lane] = 'found';
        if (chipState[other] === 'idle') chipState[other] = 'asking';
        chipRoute[lane] = path.join(' → ');
        for (const id of path) onPath.add(id);

        for (let i = 0; i + 1 < path.length; i += 1) {
          const k = `${path[i]}>${path[i + 1]}`;
          litEdges.add(k);
          drawT.set(k, 0);
          const p1 = pos.get(path[i] as string);
          const p2 = pos.get(path[i + 1] as string);
          if (!p1 || !p2) continue;
          const g = curveOf(p1, p2);
          await animate(HOP_MS, (t) => {
            drawT.set(k, t);
            token = curveAt(g, t);
          });
          drawT.set(k, 1);
        }
        const end = pos.get(to);
        if (end) {
          token = end;
          await animate(ARRIVE_MS, (t) => {
            arriveAt = { at: end, t: easeInOut(t) };
          });
        }
        arriveAt = null;
        token = null;
        render();
      },

      async showBlocked(from, _to, region) {
        const lane = endpoints !== null && endpoints[0] === from ? 0 : 1;
        const other = 1 - lane;
        chipState[lane] = 'blocked';
        if (chipState[other] === 'idle') chipState[other] = 'asking';
        chipRoute[lane] = `${region.join(' · ')} ⊣`;

        flooded.add(from);
        render();
        for (let i = 1; i < region.length; i += 1) {
          const next = region[i] as string;
          const parent = region.slice(0, i).find((prev) => hasEdge(prev, next));
          if (parent !== undefined) {
            const k = `${parent}>${next}`;
            drawT.set(k, 0);
            await animate(FLOOD_MS, (t) => {
              drawT.set(k, t);
              if (t > 0.55) flooded.add(next);
            });
            drawT.set(k, 1);
          }
          flooded.add(next);
        }
        wallBox = boxOf(
          region.map((id) => pos.get(id) ?? { x: W / 2, y: SPLIT_CY }),
          WALL_PAD,
        );
        outsideDim = true;
        await animate(WALL_MS, (t) => {
          wallT = easeInOut(t);
        });
        wallT = 1;
        render();
      },

      async resolvePair(mutual) {
        if (mutual) {
          await animate(VERDICT_MS, (t) => {
            const e = easeInOut(t);
            tieT = e;
            chipShift = -4 * e;
          });
          tieT = 1;
          chipShift = -4;
        } else {
          await animate(VERDICT_MS, (t) => {
            const e = easeInOut(t);
            crackT = e;
            chipShift = 6 * e;
          });
          crackT = 1;
          chipShift = 6;
        }
      },

      async settleGroup(group, members) {
        settled[group] = [...members];
        for (const m of members) groupOfNode.set(m, group);
        clearProbeMarks();
        endpoints = null;

        let rect = hullRects.get(group);
        if (!rect) {
          rect = el('rect', { rx: 24, 'stroke-width': 2, 'stroke-dasharray': '2 5' });
          layerHull.appendChild(rect);
          hullRects.set(group, rect);
        }
        rect.setAttribute('fill', withAlpha(groupColor(group), 0.13));
        rect.setAttribute('stroke', withAlpha(groupColor(group), 0.55));

        const hull = rect;
        await animate(SETTLE_MS, (t) => {
          hull.setAttribute('opacity', String(easeInOut(t)));
        });
        hull.setAttribute('opacity', '1');
      },

      async splitApart(groups, bridges) {
        settled = groups.map((g) => [...g]);
        groups.forEach((members, gi) => {
          for (const m of members) groupOfNode.set(m, gi);
        });
        bridgeKeys = new Set(bridges.map((e) => key(e)));
        clearProbeMarks();
        endpoints = null;

        const from = new Map(pos);
        const to = splitLayout(groups);
        await animate(SPLIT_MS, (t) => {
          const e = easeInOut(t);
          for (const id of nodes) {
            const a = from.get(id);
            const b = to.get(id);
            if (!a || !b) continue;
            pos.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
          }
        });
        pos = new Map(to);

        // 남은 한 줄기가 어느 쪽으로 흐르는지 점선으로 한 번 흘려보낸다.
        await animate(FLOW_MS, (t) => {
          flowT = t;
        });
        flowT = -1;
        render();
      },

      finish() {
        stripDim = true;
        render();
      },

      resetAll() {
        buildGraph(nodes, edges);
        caption = '';
        render();
      },

      destroy() {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    // 마운트 직후에 이미 그림이 서 있게 한다. projector 의 onInit 이 곰 뒤따라 같은 것을
    // 다시 주지만, 러너 밖에서 mount 하는 경우에도 빈 캔버스가 남지 않아야 한다.
    const initial: Record<string, unknown> = params.initialData ?? {};
    const rawNodes: unknown = initial.nodes;
    const rawEdges: unknown = initial.edges;
    const initialNodes = Array.isArray(rawNodes)
      ? rawNodes.filter((n): n is string => typeof n === 'string')
      : [];
    const initialEdges = Array.isArray(rawEdges)
      ? rawEdges.flatMap((e): StageEdge[] => {
          const row = e as { from?: unknown; to?: unknown } | null;
          return row !== null && typeof row.from === 'string' && typeof row.to === 'string'
            ? [{ from: row.from, to: row.to }]
            : [];
        })
      : [];
    buildGraph(initialNodes, initialEdges);

    return instance;
  },
};
