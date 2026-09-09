/**
 * separate-components-stage — 연결 요소 조각의 화면.
 *
 * ── 무엇이 화면에서 일어나는가
 *
 * 정점 여덟이 한 줄로 놓이고 간선이 그 사이를 잇는다. 잇지 않은 자리는 **비어
 * 있다** — 빛이 건너지 못하는 지점이 그 빈 자리다.
 *
 *   출발      출발선(아래 가로선)에서 불씨가 **떠올라** 정점에 닿는다. 출발선에는
 *             번호가 찍힌 도장이 남는다. 도장이 쌓이는 것이 곧 몇 번 출발했는지다.
 *   번짐      불빛이 간선을 **타고 이동한다**. 도착한 정점이 켜지고, 양 끝이 모두
 *             켜진 간선도 함께 켜진다 (밟지 않은 삼각형의 세 번째 변까지).
 *   끝        탐색 커서가 오므라들어 사라지고, **켜지지 않은 것들이 한 번
 *             출렁이고 제자리에 그대로 있는다.** 그리고 화면이 멈춘다.
 *
 * 운동은 전부 위치·크기 변화다. 색 전환은 "켜졌다/아니다" 가 곧 값인 자리에만 쓴다.
 *
 * ── 좌표
 *
 * 정점 반지름과 간격은 캔버스 폭에서 역산한다. 상수는 상한만 잡는다 (S-piece).
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view) — 정점 수가 달라져도 가로만 좁아진다.
 *
 * ── 뒷일
 *
 * 타이머는 requestAnimationFrame 뿐이고, destroy 에서 전부 취소한다.
 * setTimeout / setInterval / ResizeObserver 는 쓰지 않는다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  shiftLightness,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 캡션 한 줄 + 아치 + 정점 줄 + 출발선. */
const CANVAS_H = 232;
const CAPTION_Y = 26;
const NODE_Y = 132;
const GROUND_Y = 194;

/** 상한만 잡는 상수 — 실제 크기는 폭에서 역산한다. */
const NODE_R_MAX = 26;
const SIDE_MIN = 30;
const ARC_RISE_MAX = 52;

/** 걸음 하나의 애니메이션 길이. 걸음 간격(stepMs) 안에 들어가도록 짧게 잡는다. */
const SEED_MS = 300;
const SPREAD_MS = 260;
const POP_MS = 140;
const SETTLE_MS = 280;

/** 출렁임의 진폭. 남은 것들이 "그대로 있다" 고 말하는 몸짓이다. */
const BOB_PX = 7;

/**
 * 덩어리 식별 색 (색 결정 트리 3 — n 개 카테고리).
 *
 * 이 그래프의 덩어리는 셋이라 hue 를 셋으로 나눈다. 넷째가 생기면 색이 돌지만,
 * 그때도 연달아 발견되는 덩어리끼리는 hue 가 120도씩 벌어져 있어 구별된다.
 */
const COMPONENT_COLORS = categorical(3, 'vivid');

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type ComponentGraph = {
  nodes: string[];
  edges: { a: string; b: string }[];
};

export type SeedStep = { node: string; round: number; component: number };
export type SpreadStep = { from: string; to: string; component: number };

type NodeVisual = {
  id: string;
  x: number;
  /** 출렁임 오프셋. 간선도 이 값을 보고 끝점을 옮긴다. */
  dy: number;
  /** 아직 켜지지 않았으면 -1. */
  component: number;
  group: SVGGElement;
  disc: SVGCircleElement;
  label: SVGTextElement;
};

type EdgeVisual = {
  a: string;
  b: string;
  path: SVGPathElement;
  /** 이웃하지 않은 정점을 잇는 아치의 제어점. 이웃이면 null (곧은 선). */
  ctrl: { x: number; y: number } | null;
};

export const separateComponentsStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const W = PIECE_CANVAS_W;

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const ground = el('line', {
      x1: SIDE_MIN,
      y1: GROUND_Y,
      x2: W - SIDE_MIN,
      y2: GROUND_Y,
      stroke: colors.border,
      'stroke-width': 1.5,
    });
    const gEdges = el('g');
    const gNodes = el('g');
    const gMarks = el('g');
    const gMotion = el('g');
    svg.append(caption, ground, gEdges, gNodes, gMarks, gMotion);

    let destroyed = false;
    let animToken = 0;
    const pendingRafs = new Set<number>();

    let graph: ComponentGraph = { nodes: [], edges: [] };
    let nodeR = NODE_R_MAX;
    const nodes: NodeVisual[] = [];
    const byId = new Map<string, NodeVisual>();
    const edges: EdgeVisual[] = [];

    let cursor: SVGCircleElement | null = null;
    let cursorX = 0;
    let cursorR = 0;

    // ── 애니메이션 -------------------------------------------------------

    function animate(duration: number, onFrame: (t: number) => void): Promise<void> {
      const my = animToken;
      if (destroyed || typeof requestAnimationFrame !== 'function' || duration <= 0) {
        if (!destroyed) onFrame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const started = Date.now();
        let frameId = 0;
        const tick = (): void => {
          pendingRafs.delete(frameId);
          if (destroyed || my !== animToken) {
            resolve();
            return;
          }
          const t = Math.min(1, (Date.now() - started) / duration);
          onFrame(t);
          if (t < 1) {
            frameId = requestAnimationFrame(tick);
            pendingRafs.add(frameId);
          } else {
            resolve();
          }
        };
        frameId = requestAnimationFrame(tick);
        pendingRafs.add(frameId);
      });
    }

    function cancelAnimations(): void {
      animToken += 1;
      for (const id of pendingRafs) cancelAnimationFrame(id);
      pendingRafs.clear();
    }

    // ── 기하 -------------------------------------------------------------

    function componentColor(index: number): string {
      const size = COMPONENT_COLORS.length;
      return COMPONENT_COLORS[((index % size) + size) % size] ?? colors.itemDefault;
    }

    function nodeYOf(id: string): number {
      return NODE_Y + (byId.get(id)?.dy ?? 0);
    }

    function pathOf(edge: EdgeVisual): string {
      const ax = byId.get(edge.a)?.x ?? 0;
      const bx = byId.get(edge.b)?.x ?? 0;
      const ay = nodeYOf(edge.a);
      const by = nodeYOf(edge.b);
      if (!edge.ctrl) return `M ${ax} ${ay} L ${bx} ${by}`;
      return `M ${ax} ${ay} Q ${edge.ctrl.x} ${edge.ctrl.y} ${bx} ${by}`;
    }

    /** 간선 위 한 점. `fromId` 쪽에서 반대쪽으로 t 만큼 간 자리. */
    function pointOn(edge: EdgeVisual, fromId: string, t: number): { x: number; y: number } {
      const forward = edge.a === fromId;
      const p0 = {
        x: byId.get(forward ? edge.a : edge.b)?.x ?? 0,
        y: nodeYOf(forward ? edge.a : edge.b),
      };
      const p1 = {
        x: byId.get(forward ? edge.b : edge.a)?.x ?? 0,
        y: nodeYOf(forward ? edge.b : edge.a),
      };
      if (!edge.ctrl) {
        return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
      }
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * edge.ctrl.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * edge.ctrl.y + t * t * p1.y,
      };
    }

    function renderNodeTransform(nv: NodeVisual): void {
      nv.group.setAttribute('transform', `translate(${nv.x} ${NODE_Y + nv.dy})`);
    }

    function renderEdges(): void {
      for (const edge of edges) {
        edge.path.setAttribute('d', pathOf(edge));
        const a = byId.get(edge.a);
        const b = byId.get(edge.b);
        const bothLit = a !== undefined && b !== undefined && a.component >= 0 && b.component >= 0;
        edge.path.setAttribute('stroke', bothLit ? componentColor(a.component) : colors.border);
        edge.path.setAttribute('stroke-width', bothLit ? '3.5' : '2');
      }
    }

    function dressNode(nv: NodeVisual): void {
      if (nv.component < 0) {
        nv.disc.setAttribute('fill', colors.itemDefault);
        nv.disc.setAttribute('stroke', colors.border);
        nv.disc.setAttribute('stroke-dasharray', '5 4');
        nv.label.setAttribute('fill', colors.textMuted);
        return;
      }
      const color = componentColor(nv.component);
      nv.disc.setAttribute('fill', color);
      nv.disc.setAttribute('stroke', shiftLightness(color, -0.16));
      nv.disc.removeAttribute('stroke-dasharray');
      nv.label.setAttribute('fill', colors.stateInk);
    }

    // ── 뼈대 만들기 -------------------------------------------------------

    function build(next: ComponentGraph): void {
      cancelAnimations();
      graph = next;
      gEdges.textContent = '';
      gNodes.textContent = '';
      gMarks.textContent = '';
      gMotion.textContent = '';
      nodes.length = 0;
      edges.length = 0;
      byId.clear();
      cursor = null;
      cursorR = 0;

      const count = graph.nodes.length;
      if (count === 0) return;

      // 폭을 채운다 — 반지름과 간격을 캔버스에서 역산하고 상수는 상한으로만 쓴다.
      // 3.2 는 "정점 하나가 자기 지름의 1.6배를 차지한다" 는 뜻이다. 남는 만큼이
      // 간선이 되므로, 이 값이 커질수록 이어진 자리와 끊긴 자리가 또렷해진다.
      nodeR = Math.max(
        12,
        Math.min(NODE_R_MAX, Math.floor((W - SIDE_MIN * 2) / Math.max(1, count * 3.2))),
      );
      const pitch = count > 1 ? (W - (SIDE_MIN + nodeR) * 2) / (count - 1) : 0;
      const originX = count > 1 ? SIDE_MIN + nodeR : W / 2;

      graph.nodes.forEach((id, i) => {
        const group = el('g');
        const disc = el('circle', { cx: 0, cy: 0, r: nodeR, 'stroke-width': 2 });
        const label = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
        });
        label.textContent = id;
        group.append(disc, label);
        gNodes.append(group);
        const nv: NodeVisual = { id, x: originX + pitch * i, dy: 0, component: -1, group, disc, label };
        nodes.push(nv);
        byId.set(id, nv);
        renderNodeTransform(nv);
        dressNode(nv);
      });

      const indexOf = new Map<string, number>();
      graph.nodes.forEach((id, i) => indexOf.set(id, i));

      for (const raw of graph.edges) {
        if (!byId.has(raw.a) || !byId.has(raw.b)) continue;
        const distance = Math.abs((indexOf.get(raw.a) ?? 0) - (indexOf.get(raw.b) ?? 0));
        // 이웃끼리는 곧은 선, 건너뛴 사이는 위로 넘어가는 아치.
        const ctrl =
          distance <= 1
            ? null
            : {
                x: ((byId.get(raw.a)?.x ?? 0) + (byId.get(raw.b)?.x ?? 0)) / 2,
                y: NODE_Y - Math.min(ARC_RISE_MAX, 22 + 14 * distance) * 2,
              };
        const path = el('path', { fill: 'none', 'stroke-linecap': 'round' });
        gEdges.append(path);
        edges.push({ a: raw.a, b: raw.b, path, ctrl });
      }
      renderEdges();

      cursor = el('circle', {
        cx: originX,
        cy: NODE_Y,
        r: 0,
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': 2.5,
        'stroke-dasharray': '6 5',
      });
      cursorX = originX;
      gMarks.append(cursor);
    }

    function setCursor(x: number, r: number): void {
      cursorX = x;
      cursorR = r;
      cursor?.setAttribute('cx', String(x));
      cursor?.setAttribute('r', String(Math.max(0, r)));
    }

    /** 출발선에 남는 도장. 몇 번 출발했는지가 여기 쌓인다. */
    function stampMark(x: number, round: number, color: string): SVGGElement {
      const group = el('g', { transform: `translate(${x} ${GROUND_Y}) scale(0)` });
      const badge = el('circle', {
        cx: 0,
        cy: 0,
        r: 11,
        fill: color,
        stroke: shiftLightness(color, -0.16),
        'stroke-width': 2,
      });
      const text = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      text.textContent = String(round);
      group.append(badge, text);
      gMarks.append(group);
      return group;
    }

    async function popNode(nv: NodeVisual): Promise<void> {
      await animate(POP_MS, (t) => {
        const swell = Math.sin(Math.PI * t) * 0.16;
        nv.disc.setAttribute('r', String(nodeR * (1 + swell)));
      });
      nv.disc.setAttribute('r', String(nodeR));
    }

    // ── projector 가 부르는 표면 -------------------------------------------

    const instance: ViewInstance = {
      setGraph(next: ComponentGraph): void {
        build({ nodes: [...next.nodes], edges: next.edges.map((e) => ({ a: e.a, b: e.b })) });
      },

      reset(): void {
        build(graph);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      async seed(step: SeedStep): Promise<void> {
        const nv = byId.get(step.node);
        if (!nv) return;
        const color = componentColor(step.component);
        const mark = stampMark(nv.x, step.round, color);
        const spark = el('circle', { cx: nv.x, cy: GROUND_Y, r: 8, fill: color });
        gMotion.append(spark);

        // 불씨가 출발선에서 떠올라 정점에 닿는다.
        await animate(SEED_MS, (t) => {
          const e = easeOut(t);
          spark.setAttribute('cy', String(GROUND_Y + (NODE_Y - GROUND_Y) * e));
          const grown = Math.min(1, t * 2.2);
          mark.setAttribute('transform', `translate(${nv.x} ${GROUND_Y}) scale(${grown})`);
          setCursor(nv.x, (nodeR + 9) * e);
        });
        spark.remove();
        mark.setAttribute('transform', `translate(${nv.x} ${GROUND_Y}) scale(1)`);
        nv.component = step.component;
        dressNode(nv);
        renderEdges();
        setCursor(nv.x, nodeR + 9);
        await popNode(nv);
      },

      async spread(step: SpreadStep): Promise<void> {
        const from = byId.get(step.from);
        const to = byId.get(step.to);
        const edge = edges.find(
          (e) =>
            (e.a === step.from && e.b === step.to) || (e.a === step.to && e.b === step.from),
        );
        if (!from || !to || !edge) return;
        const color = componentColor(step.component);
        const dot = el('circle', { cx: from.x, cy: NODE_Y, r: 7, fill: color });
        gMotion.append(dot);
        const cursorStart = cursorX;

        // 불빛이 간선을 타고 건너간다. 커서도 같은 시간에 미끄러져 따라온다.
        await animate(SPREAD_MS, (t) => {
          const e = easeInOut(t);
          const p = pointOn(edge, step.from, e);
          dot.setAttribute('cx', String(p.x));
          dot.setAttribute('cy', String(p.y));
          setCursor(cursorStart + (from.x - cursorStart) * e, nodeR + 9);
        });
        dot.remove();
        to.component = step.component;
        dressNode(to);
        renderEdges();
        await popNode(to);
      },

      /**
       * 한 번의 탐색이 끝났다. 커서를 걷고, 켜지지 않은 것들이 한 번 출렁인다.
       * 출렁임이 끝나도 그것들은 꺼진 채 제자리에 그대로 있다 — 그게 요점이다.
       */
      async sweepEnd(): Promise<void> {
        const dark = nodes.filter((n) => n.component < 0);
        const startR = cursorR;
        await animate(SETTLE_MS, (t) => {
          setCursor(cursorX, startR * (1 - easeOut(t)));
          const offset = Math.sin(Math.PI * t) * BOB_PX;
          for (const nv of dark) {
            nv.dy = offset;
            renderNodeTransform(nv);
          }
          renderEdges();
        });
        setCursor(cursorX, 0);
        for (const nv of dark) {
          nv.dy = 0;
          renderNodeTransform(nv);
        }
        renderEdges();
      },

      destroy(): void {
        destroyed = true;
        cancelAnimations();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
