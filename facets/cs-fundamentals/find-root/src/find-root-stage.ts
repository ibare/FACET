/**
 * 빌트인 `graph-layout` / `tree-layout` 을 쓰지 않은 이유: 가리킴을 거리에
 * 비례한 높이의 곡선으로 그리고 그 곡선 위를 표식이 실제로 타고 오르는 것이
 * 이 조각의 동사다. 두 view 모두 간선을 직선으로만 그리고 그 위를 따라가는
 * 운동이 없다 (원칙 6 의 예외 조건).
 *
 * find-root-stage — 자리 일곱을 한 줄에 늘어놓고, 가리킴을 활 모양 곡선으로
 * 위에 그린다. 질의가 시작되면 마커가 그 곡선을 실제로 타고 올라가 부모
 * 자리로 이동한다 (opacity 전환이 아니라 좌표가 바뀌는 이동). 자기 자신을
 * 가리키는 자리에 닿으면 멈추고, 그 자리와 출발 자리가 같은 색 테두리를
 * 얻는다 — 같은 색이 곧 같은 이름(무리)이다.
 *
 * View 는 algorithm 의 타입을 참조하지 않는다 (원칙 1) — 아래 타입은 동형으로
 * 이 파일 안에 독립 선언한다.
 */

import {
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
  getColors,
  categorical,
  fonts,
  fontSizes,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** stage.init() 이 받는 모양 — algorithm.ts::FindRootData 와 동형이지만 독립 선언. */
export type FindRootStageData = {
  parent: number[];
  queries: number[];
};

const NODE_R = 22;
const ARC_BASE_LIFT = 24;
const ARC_PER_UNIT = 32;
const CELL_MAX_W = 80;
const SIDE_MIN = 26;
const HOP_DURATION_MS = 460;
const POP_DURATION_MS = 200;
const PULSE_DURATION_MS = 420;

const CANVAS_H = 230;
const NODE_CY = 92;
const LABEL_Y = NODE_CY + NODE_R + 14;
const CAPTION_Y = LABEL_Y + 26;
const RESULTS_Y = CAPTION_Y + 30;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

function text(x: number, y: number, content: string, attrs?: Record<string, string | number>): SVGTextElement {
  const t = el('text', { x, y, ...attrs });
  t.textContent = content;
  return t;
}

/** 자리 개수로부터 x 좌표를 뽑는다 — 캔버스 폭을 채우고, 칸 폭은 상한만 둔다. */
function layoutX(count: number, w: number): number[] {
  const cellW = Math.min(CELL_MAX_W, Math.floor((w - SIDE_MIN * 2) / count));
  const originX = Math.round((w - count * cellW) / 2);
  const xs: number[] = [];
  for (let i = 0; i < count; i += 1) xs.push(originX + cellW * (i + 0.5));
  return xs;
}

function qPoint(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

export const findRootStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);

    const arcsG = el('g', { class: 'arcs' });
    const nodesG = el('g', { class: 'nodes' });
    const labelsG = el('g', { class: 'labels' });
    const resultsG = el('g', { class: 'results' });
    const markerG = el('g', { class: 'marker' });
    const captionEl = text(0, CAPTION_Y, '', {
      'text-anchor': 'middle',
      x: 620 / 2,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });

    svg.append(arcsG, nodesG, labelsG, captionEl, resultsG, markerG);

    // ── 활 모양 마커(오르는 것). 항상 존재, 걸음 사이엔 숨김.
    const marker = el('circle', { r: 8, fill: colors.risingMarker, opacity: 0 });
    markerG.appendChild(marker);

    type NodeEntry = { cx: number; cy: number; circle: SVGCircleElement; label: SVGTextElement };
    let nodeEls = new Map<number, NodeEntry>();
    let arcEls = new Map<string, { path: SVGPathElement; ctrl: { x: number; y: number } }>();
    let queryCount = 1;
    let W = 620;

    let currentWalkArcKeys: string[] = [];
    let resultChipCount = 0;
    let activeRafIds: number[] = [];
    let destroyed = false;

    function trackRaf(id: number): void {
      activeRafIds.push(id);
    }
    function clearRaf(): void {
      for (const id of activeRafIds) cancelAnimationFrame(id);
      activeRafIds = [];
    }

    function arcKey(child: number, parent: number): string {
      return `${child}->${parent}`;
    }

    function clearGroup(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function buildStatic(data: FindRootStageData): void {
      clearGroup(arcsG);
      clearGroup(nodesG);
      clearGroup(labelsG);
      nodeEls = new Map();
      arcEls = new Map();
      queryCount = Math.max(1, data.queries.length);
      W = 620;

      const xs = layoutX(data.parent.length, W);

      // 곡선(가리킴) — 노드보다 먼저 그려 아래 레이어로 둔다.
      for (let i = 0; i < data.parent.length; i += 1) {
        const p = data.parent[i];
        if (p === i) continue; // 자기 자신을 가리키는 자리(뿌리)는 곡선이 없다.
        const x0 = xs[i];
        const x1 = xs[p];
        const y0 = NODE_CY - NODE_R;
        const dist = Math.abs(i - p);
        const lift = ARC_BASE_LIFT + ARC_PER_UNIT * dist;
        const cx = (x0 + x1) / 2;
        const cy = y0 - lift;
        const path = el('path', {
          d: `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y0}`,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 2,
        });
        arcsG.appendChild(path);
        arcEls.set(arcKey(i, p), { path, ctrl: { x: cx, y: cy } });
      }

      // 노드 + 라벨.
      for (let i = 0; i < data.parent.length; i += 1) {
        const cx = xs[i];
        const circle = el('circle', {
          cx,
          cy: NODE_CY,
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 2,
        });
        const label = text(cx, NODE_CY + 5, String(i), {
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
        });
        nodesG.append(circle, label);
        nodeEls.set(i, { cx, cy: NODE_CY, circle, label });

        const ptr = text(cx, LABEL_Y, `→${data.parent[i]}`, {
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        labelsG.appendChild(ptr);
      }

      captionEl.setAttribute('x', String(W / 2));
    }

    function clearProgress(): void {
      clearGroup(resultsG);
      resultChipCount = 0;
      currentWalkArcKeys = [];
      captionEl.textContent = '';
      marker.setAttribute('opacity', '0');
      for (const { circle } of nodeEls.values()) {
        circle.setAttribute('stroke', colors.border);
        circle.setAttribute('stroke-width', '2');
      }
      for (const { path } of arcEls.values()) {
        path.setAttribute('stroke', colors.border);
        path.setAttribute('stroke-width', '2');
      }
    }

    function setCaption(msg: string): void {
      captionEl.textContent = msg;
    }

    async function popMarkerAt(node: number): Promise<void> {
      const entry = nodeEls.get(node);
      if (!entry) return;
      marker.setAttribute('cx', String(entry.cx));
      marker.setAttribute('cy', String(entry.cy - NODE_R - 6));
      marker.setAttribute('opacity', '1');
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          if (destroyed) return resolve();
          const t = Math.min(1, (now - start) / POP_DURATION_MS);
          const scale = 0.4 + 0.6 * t;
          marker.setAttribute('r', String(8 * scale));
          if (t < 1) {
            trackRaf(requestAnimationFrame(step));
          } else {
            marker.setAttribute('r', '8');
            resolve();
          }
        };
        trackRaf(requestAnimationFrame(step));
      });
    }

    async function animateHop(from: number, to: number): Promise<void> {
      const fromEntry = nodeEls.get(from);
      const toEntry = nodeEls.get(to);
      const key = arcKey(from, to);
      const arc = arcEls.get(key);
      if (!fromEntry || !toEntry || !arc) return;

      arc.path.setAttribute('stroke', colors.itemActive);
      arc.path.setAttribute('stroke-width', '3');
      currentWalkArcKeys.push(key);

      const x0 = fromEntry.cx;
      const y0 = fromEntry.cy - NODE_R;
      const x1 = toEntry.cx;
      const y1 = toEntry.cy - NODE_R;
      const { x: cx, y: cy } = arc.ctrl;

      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          if (destroyed) return resolve();
          const t = Math.min(1, (now - start) / HOP_DURATION_MS);
          const p = qPoint(t, x0, y0, cx, cy, x1, y1);
          marker.setAttribute('cx', String(p.x));
          marker.setAttribute('cy', String(p.y));
          if (t < 1) {
            trackRaf(requestAnimationFrame(step));
          } else {
            resolve();
          }
        };
        trackRaf(requestAnimationFrame(step));
      });
    }

    function colorizeGroup(nodes: number[], color: string): void {
      for (const n of nodes) {
        const entry = nodeEls.get(n);
        if (!entry) continue;
        entry.circle.setAttribute('stroke', color);
        entry.circle.setAttribute('stroke-width', '3.5');
      }
      for (const key of currentWalkArcKeys) {
        const arc = arcEls.get(key);
        if (!arc) continue;
        arc.path.setAttribute('stroke', color);
        arc.path.setAttribute('stroke-width', '2.5');
      }
    }

    function addResultChip(pathLabel: string, color: string): void {
      const slotW = W / queryCount;
      const cx = slotW * (resultChipCount + 0.5);
      const g = el('g');
      const dot = el('circle', { cx: cx - pathLabel.length * 2.6 - 8, cy: RESULTS_Y - 4, r: 4, fill: color });
      const t = text(cx, RESULTS_Y, pathLabel, {
        'text-anchor': 'middle',
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      g.append(dot, t);
      resultsG.appendChild(g);
      resultChipCount += 1;
    }

    async function pulseNode(node: number): Promise<void> {
      const entry = nodeEls.get(node);
      if (!entry) return;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          if (destroyed) return resolve();
          const t = Math.min(1, (now - start) / PULSE_DURATION_MS);
          const wobble = Math.sin(t * Math.PI);
          const r = NODE_R + wobble * 5;
          entry.circle.setAttribute('r', String(r));
          if (t < 1) {
            trackRaf(requestAnimationFrame(step));
          } else {
            entry.circle.setAttribute('r', String(NODE_R));
            resolve();
          }
        };
        trackRaf(requestAnimationFrame(step));
      });
    }

    let currentPath: number[] = [];

    return {
      init(data: FindRootStageData): void {
        buildStatic(data);
        clearProgress();
      },

      async walkStart(node: number, caption: string): Promise<void> {
        currentPath = [node];
        currentWalkArcKeys = [];
        setCaption(caption);
        await popMarkerAt(node);
      },

      async hop(from: number, to: number, caption: string): Promise<void> {
        setCaption(caption);
        await animateHop(from, to);
        currentPath.push(to);
      },

      async rootReached(start: number, root: number, groupIndex: number, groupCount: number, caption: string): Promise<void> {
        const palette = categorical(Math.max(2, groupCount), 'vivid');
        const color = palette[groupIndex % palette.length];
        colorizeGroup([start, root], color);
        setCaption(caption);
        addResultChip(currentPath.join('→'), color);
        marker.setAttribute('opacity', '0');
        await pulseNode(root);
      },

      async compare(a: number, b: number, caption: string): Promise<void> {
        setCaption(caption);
        await Promise.all([pulseNode(a), pulseNode(b)]);
      },

      rewind(): void {
        clearRaf();
        clearProgress();
      },

      destroy(): void {
        destroyed = true;
        clearRaf();
      },
    };
  },
};
