/**
 * fewer-hops-not-shorter-stage — 두 길을 같은 출발선에서 나란히 눕히고, **화면의
 * 가로 길이가 곧 재고 있는 값**이 되게 하는 무대.
 *
 * 처음에는 간선 하나가 모두 같은 길이다 (간선 수 축척). 그래서 간선을 둘만 밟는
 * 길이 먼저 끝나고, 판정선(세로 점선)이 그 도착점에 선다. 무게를 재기 시작하면
 * 간선이 제 무게만큼 늘거나 줄고, 뒤따르는 정점이 통째로 밀려 도착점이 자리를
 * 바꾼다. 판정선은 "지금 가장 짧다고 주장되는 길" 의 도착점에 붙어 있으므로,
 * 그것이 차선을 옮겨 가는 것이 곧 역전이다.
 *
 * 출발 정점을 원이 아니라 **출발선(세로 막대)** 으로 그린 것은 두 차선이 정확히
 * 같은 x 에서 시작해야 길이 비교가 거짓이 되지 않기 때문이다. 도착 정점은 길마다
 * 다른 자리에서 끝나므로 원 둘로 그린다 — 같은 정점을 두 번 그린 것이며, 그
 * 전제는 글(description)이 밝힌다.
 *
 * 세로는 mount 시 고정이고 재생 중 바뀌지 않는다 (S-view).
 */

import { PIECE_CANVAS_W, fontSizes, fonts, getColors } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 262;

/** 출발선 자리. 두 차선은 정확히 여기서 함께 출발한다. */
const START_X = 24;
const START_BAR_W = 9;
const TRACK_X0 = START_X + START_BAR_W + 8;
/** 도착점 오른쪽 — 간선 수 · 무게 읽음값이 앉는 자리. */
const RIGHT_GUTTER = 92;
/** 가장 긴 길이 쓸 수 있는 폭. 축척은 여기서 역산한다. */
const MAX_SPAN = W - RIGHT_GUTTER - TRACK_X0;

const LANE_TOP = 84;
const LANE_BOTTOM = 172;
const NODE_R = 13;

/** 축척 상한 — 길이 짧을 때 화면이 텅 비지 않게 하는 값이지 못박은 크기가 아니다. */
const HOP_UNIT_MAX = 118;
const WEIGHT_UNIT_MAX = 30;

const REVEAL_MS = 520;
const STRETCH_MS = 340;
const VERDICT_MS = 360;
const BADGE_MS = 220;

const CAPTION_Y = 244;

export type StageRouteInput = {
  id: string;
  nodes: string[];
  edgeIds: string[];
  hops: number;
};

type Seg = {
  id: string;
  /** 간선 수 축척에서의 길이. */
  hopLen: number;
  /** 지금 그려지는 길이. */
  len: number;
  weighed: boolean;
  line: SVGLineElement;
  label: SVGTextElement;
};

type Lane = {
  id: string;
  y: number;
  segs: Seg[];
  circles: SVGCircleElement[];
  nodeTexts: SVGTextElement[];
  hopBadge: SVGTextElement;
  weightBadge: SVGTextElement;
  /** 읽음값이 도착점에서 미끄러져 들어오는 거리. */
  badgeDx: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export const fewerHopsNotShorterStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);

    const root = el('g', {});
    svg.appendChild(root);

    let gStart = el('g', {});
    let gTracks = el('g', {});
    let gVerdict = el('g', {});
    let gNodes = el('g', {});
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });

    let lanes: Lane[] = [];
    let hopUnit = 0;
    let weightUnit = 0;

    /** 판정선이 가리키는 차선. 옮겨 가는 동안 prev 와 blend 로 사이를 잇는다. */
    let verdictLane = -1;
    let verdictPrev = -1;
    let verdictBlend = 1;
    let verdictLine: SVGLineElement | null = null;

    let destroyed = false;
    const frames = new Set<number>();

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const started = performance.now();
        const schedule = (): void => {
          const id = requestAnimationFrame((now) => {
            frames.delete(id);
            frame(now);
          });
          frames.add(id);
        };
        const frame = (now: number): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const raw = Math.min(1, (now - started) / ms);
          apply(easeInOut(raw));
          if (raw < 1) schedule();
          else resolve();
        };
        schedule();
      });
    }

    function laneY(index: number, count: number): number {
      if (count <= 1) return (LANE_TOP + LANE_BOTTOM) / 2;
      return LANE_TOP + ((LANE_BOTTOM - LANE_TOP) * index) / (count - 1);
    }

    function laneEnd(lane: Lane): number {
      let x = TRACK_X0;
      for (const s of lane.segs) x += s.len;
      return x;
    }

    function findLane(routeId: string): Lane | undefined {
      return lanes.find((l) => l.id === routeId);
    }

    function render(): void {
      for (const lane of lanes) {
        let x = TRACK_X0;
        lane.segs.forEach((s, k) => {
          const x2 = x + s.len;
          const leftInset = k === 0 ? 0 : NODE_R;
          const visible = x2 - NODE_R > x + leftInset;
          s.line.setAttribute('x1', String(x + leftInset));
          s.line.setAttribute('x2', String(Math.max(x + leftInset, x2 - NODE_R)));
          s.line.setAttribute('y1', String(lane.y));
          s.line.setAttribute('y2', String(lane.y));
          s.line.setAttribute('opacity', visible ? '1' : '0');
          s.label.setAttribute('x', String((x + x2) / 2));
          s.label.setAttribute('y', String(lane.y - 15));

          const circle = lane.circles[k];
          circle.setAttribute('cx', String(x2));
          circle.setAttribute('cy', String(lane.y));
          const text = lane.nodeTexts[k];
          text.setAttribute('x', String(x2));
          text.setAttribute('y', String(lane.y + 4));
          x = x2;
        });

        const badgeX = x + NODE_R + 8 + lane.badgeDx;
        lane.hopBadge.setAttribute('x', String(badgeX));
        lane.hopBadge.setAttribute('y', String(lane.y - 3));
        lane.weightBadge.setAttribute('x', String(badgeX));
        lane.weightBadge.setAttribute('y', String(lane.y + 15));
      }

      renderVerdict();
    }

    /** 도착 정점의 강조 — 판정선이 가리키는 쪽이 accent 로 채워진다. */
    function paintFinish(lane: Lane, filled: boolean, grow: number): void {
      const last = lane.circles.length - 1;
      const finish = lane.circles[last];
      if (!finish) return;
      finish.setAttribute('r', String(NODE_R + 2 * grow));
      finish.setAttribute('fill', filled ? c.accent : c.itemDefault);
      lane.nodeTexts[last]?.setAttribute('fill', filled ? c.stateInk : c.text);
    }

    function renderVerdict(): void {
      if (!verdictLine || lanes.length === 0) return;
      const cur = lanes[verdictLane];
      if (!cur) return;
      const prev = verdictPrev >= 0 ? lanes[verdictPrev] : undefined;
      const t = verdictBlend;
      const x = prev ? laneEnd(prev) + (laneEnd(cur) - laneEnd(prev)) * t : laneEnd(cur);
      verdictLine.setAttribute('x1', String(x));
      verdictLine.setAttribute('x2', String(x));
      verdictLine.setAttribute('y1', String(lanes[0].y - 40));
      verdictLine.setAttribute('y2', String(lanes[lanes.length - 1].y + 34));

      for (const lane of lanes) paintFinish(lane, false, 0);
      if (prev) paintFinish(prev, t < 0.5, 1 - t);
      paintFinish(cur, t >= 0.5, t);
    }

    function clearLayer(layer: SVGGElement): SVGGElement {
      layer.remove();
      return el('g', {});
    }

    function clearAll(): void {
      gStart = clearLayer(gStart);
      gTracks = clearLayer(gTracks);
      gVerdict = clearLayer(gVerdict);
      gNodes = clearLayer(gNodes);
      root.appendChild(gStart);
      root.appendChild(gTracks);
      root.appendChild(gVerdict);
      root.appendChild(gNodes);
      root.appendChild(caption);
      lanes = [];
      verdictLane = -1;
      verdictPrev = -1;
      verdictBlend = 1;
      verdictLine = null;
    }

    function buildStartGate(sourceLabel: string, count: number): void {
      const top = laneY(0, count) - 22;
      const bottom = laneY(count - 1, count) + 22;
      gStart.appendChild(
        el('rect', {
          x: START_X,
          y: top,
          width: START_BAR_W,
          height: bottom - top,
          rx: 4,
          fill: c.primary,
        }),
      );
      const label = el('text', {
        x: START_X + START_BAR_W / 2,
        y: top - 9,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': '700',
      });
      label.textContent = sourceLabel;
      gStart.appendChild(label);
    }

    function buildLane(route: StageRouteInput, y: number): Lane {
      const segs: Seg[] = [];
      const circles: SVGCircleElement[] = [];
      const nodeTexts: SVGTextElement[] = [];

      route.edgeIds.forEach((id, k) => {
        const line = el('line', {
          x1: TRACK_X0,
          x2: TRACK_X0,
          y1: y,
          y2: y,
          stroke: c.textMuted,
          'stroke-width': 3,
          'stroke-linecap': 'round',
          'stroke-dasharray': '5 5',
        });
        gTracks.appendChild(line);
        const label = el('text', {
          x: TRACK_X0,
          y: y - 15,
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': '700',
          opacity: 0,
        });
        gTracks.appendChild(label);
        segs.push({ id, hopLen: hopUnit, len: 0, weighed: false, line, label });

        const circle = el('circle', {
          cx: TRACK_X0,
          cy: y,
          r: NODE_R,
          fill: c.itemDefault,
          stroke: c.text,
          'stroke-width': 1.6,
        });
        gNodes.appendChild(circle);
        const nodeText = el('text', {
          x: TRACK_X0,
          y: y + 4,
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': '600',
        });
        nodeText.textContent = route.nodes[k + 1] ?? '';
        gNodes.appendChild(nodeText);
        circles.push(circle);
        nodeTexts.push(nodeText);
      });

      const hopBadge = el('text', {
        x: TRACK_X0,
        y,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        opacity: 0,
      });
      const weightBadge = el('text', {
        x: TRACK_X0,
        y,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': '700',
        opacity: 0,
      });
      gNodes.appendChild(hopBadge);
      gNodes.appendChild(weightBadge);

      return { id: route.id, y, segs, circles, nodeTexts, hopBadge, weightBadge, badgeDx: 0 };
    }

    async function showRoutes(input: {
      routes: StageRouteInput[];
      maxHops: number;
      maxTotalWeight: number;
    }): Promise<void> {
      clearAll();
      const count = input.routes.length;
      if (count === 0) return;

      hopUnit = Math.min(HOP_UNIT_MAX, MAX_SPAN / Math.max(1, input.maxHops));
      weightUnit = Math.min(WEIGHT_UNIT_MAX, MAX_SPAN / Math.max(1, input.maxTotalWeight));

      buildStartGate(input.routes[0].nodes[0] ?? '', count);
      lanes = input.routes.map((r, i) => buildLane(r, laneY(i, count)));

      verdictLine = el('line', {
        x1: TRACK_X0,
        x2: TRACK_X0,
        y1: LANE_TOP,
        y2: LANE_BOTTOM,
        stroke: c.accent,
        'stroke-width': 2.5,
        'stroke-dasharray': '4 6',
        opacity: 0,
      });
      gVerdict.appendChild(verdictLine);

      // 길이 출발선에서 뻗어 나온다 — 간선 하나가 모두 같은 길이인 축척으로.
      await tween(REVEAL_MS, (t) => {
        for (const lane of lanes) {
          for (const s of lane.segs) s.len = s.hopLen * t;
        }
        render();
      });
    }

    async function showHops(input: { routeId: string; label: string }): Promise<void> {
      const lane = findLane(input.routeId);
      if (!lane) return;
      lane.hopBadge.textContent = input.label;
      await tween(BADGE_MS, (t) => {
        lane.badgeDx = -10 * (1 - t);
        lane.hopBadge.setAttribute('opacity', String(t));
        render();
      });
      lane.badgeDx = 0;
      render();
    }

    /** 판정선을 그 길의 도착점으로 옮긴다. 차선을 건너가면 그것이 역전이다. */
    async function setVerdict(routeId: string): Promise<void> {
      const next = lanes.findIndex((l) => l.id === routeId);
      if (next < 0 || !verdictLine) return;
      if (verdictLane === next) return;
      verdictPrev = verdictLane;
      verdictLane = next;
      if (verdictPrev < 0) {
        verdictBlend = 1;
        await tween(VERDICT_MS, (t) => {
          verdictLine?.setAttribute('opacity', String(t));
          renderVerdict();
        });
        return;
      }
      await tween(VERDICT_MS, (t) => {
        verdictBlend = t;
        renderVerdict();
      });
      verdictPrev = -1;
      verdictBlend = 1;
      renderVerdict();
    }

    /** 간선 하나가 제 무게만큼 늘거나 줄고, 뒤따르는 정점이 통째로 밀린다. */
    async function weighEdge(input: {
      routeId: string;
      edgeId: string;
      weight: number;
      totalLabel: string;
    }): Promise<void> {
      const lane = findLane(input.routeId);
      if (!lane) return;
      const seg = lane.segs.find((s) => s.id === input.edgeId && !s.weighed);
      if (!seg) return;

      seg.weighed = true;
      seg.line.setAttribute('stroke', c.text);
      seg.line.setAttribute('stroke-width', '4');
      seg.line.removeAttribute('stroke-dasharray');
      seg.label.textContent = String(input.weight);
      lane.weightBadge.textContent = input.totalLabel;

      const from = seg.len;
      const to = input.weight * weightUnit;
      await tween(STRETCH_MS, (t) => {
        seg.len = from + (to - from) * t;
        seg.label.setAttribute('opacity', String(t));
        lane.weightBadge.setAttribute('opacity', String(t));
        render();
      });
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    function reset(): void {
      clearAll();
      caption.textContent = '';
    }

    clearAll();

    return {
      showRoutes,
      showHops,
      weighEdge,
      setVerdict,
      setCaption,
      reset,
      destroy(): void {
        // 스스로 다음 회차를 예약하는 tween 루프를 여기서 끊는다. 남는 타이머 없음.
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        root.remove();
      },
    };
  },
};
