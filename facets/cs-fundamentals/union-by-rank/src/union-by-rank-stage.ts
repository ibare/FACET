/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 진 쪽 뿌리가 서브트리를 통째로
 * 끌고 이긴 쪽 밑으로 옮겨 붙는 운동이 이 조각의 동사다. 그 view 에는 부분
 * 나무를 옮겨 붙이는 어휘가 없고, 무엇보다 여기서는 **세로 층이 곧 랭크**라
 * 좌표계를 이 조각이 정해야 한다 (원칙 6 의 예외 조건).
 *
 * union-by-rank 조각 전용 무대 — SVG 트리 다이어그램.
 *
 * "골라 붙인다": 두 뿌리를 견주고, 진 쪽의 서브트리 전체가 실제로 이긴 쪽
 * 뿌리 밑으로 이동해 붙는다(translate) — opacity 전환이 아니라 좌표가 바뀐다.
 * 나무의 세로 폭이 곧 랭크(키)이므로, 낮은 뿌리를 넣을 때는 세로가 늘지 않고
 * 뒤집어 넣을 때만 는다는 것이 그림 자체에서 드러난다. 뿌리마다 랭크 숫자를
 * 담은 배지를 얹어 눈에 보이는 키와 숫자가 같이 간다.
 */

import {
  getColors,
  PIECE_CANVAS_W,
  fontSizes,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const NODE_R = 18;
const LEVEL_Y = [92, 164, 236];
const CANVAS_H = LEVEL_Y[LEVEL_Y.length - 1]! + NODE_R + 26;
const CAPTION_Y = 20;
const BADGE_DY = -30;
const SIDE_MIN = 30;
const CELL_MAX_W = 120;
const MOVE_MS = 380;
const GROW_MS = 260;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el as SVGElementTagNameMap[K];
}

type NodeVisual = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  badgeGroup: SVGGElement;
  badgeText: SVGTextElement;
};

type NodeState = 'default' | 'compare' | 'loser' | 'winner';

/**
 * 지금의 가리킴 배열로 층 배치를 계산한다.
 * 잎은 왼쪽부터 슬롯을 받고, 내부 노드는 자식 슬롯의 평균(중앙)에 놓인다.
 * 슬롯 폭은 남은 잎 수에 맞춰 매번 다시 나눈다 — 가지가 줄수록 폭이 넓어진다.
 */
function computeLayout(n: number, parent: number[]): { x: number[]; y: number[] } {
  const children: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    if (parent[i] !== i) children[parent[i]!]!.push(i);
  }
  const depth = new Array<number>(n).fill(0);
  const roots: number[] = [];
  for (let i = 0; i < n; i++) if (parent[i] === i) roots.push(i);

  for (const r of roots) {
    depth[r] = 0;
    const stack = [r];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const c of children[cur]!) {
        depth[c] = depth[cur]! + 1;
        stack.push(c);
      }
    }
  }

  const leafSlot = new Array<number>(n).fill(0);
  let nextSlot = 0;
  const assign = (id: number): number => {
    const kids = children[id]!;
    if (kids.length === 0) {
      leafSlot[id] = nextSlot;
      nextSlot += 1;
      return leafSlot[id]!;
    }
    let sum = 0;
    for (const c of kids) sum += assign(c);
    const center = sum / kids.length;
    leafSlot[id] = center;
    return center;
  };
  for (const r of roots) assign(r);

  const totalSlots = Math.max(1, nextSlot);
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / totalSlots));
  const originX = Math.round((W - totalSlots * cellW) / 2);

  const x = new Array<number>(n);
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    x[i] = originX + (leafSlot[i]! + 0.5) * cellW;
    y[i] = LEVEL_Y[Math.min(depth[i]!, LEVEL_Y.length - 1)]!;
  }
  return { x, y };
}

export const unionByRankStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';
    const palette = getColors(params.theme);

    const captionText = svgEl('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: palette.text,
    });
    svg.appendChild(captionText);

    const edgesLayer = svgEl('g');
    const nodesLayer = svgEl('g');
    svg.appendChild(edgesLayer);
    svg.appendChild(nodesLayer);

    let n = 0;
    let parent: number[] = [];
    let rank: number[] = [];
    const nodes = new Map<number, NodeVisual>();
    const edges = new Map<number, SVGLineElement>(); // key = 자식(진 쪽) id

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function fillFor(state: NodeState): string {
      switch (state) {
        case 'compare':
          return palette.itemComparing;
        case 'loser':
          return palette.itemSwapping;
        case 'winner':
          return palette.itemActive;
        default:
          return palette.itemDefault;
      }
    }

    function inkFor(state: NodeState): string {
      return state === 'default' ? palette.text : palette.stateInk;
    }

    function setNodeState(id: number, state: NodeState): void {
      const nv = nodes.get(id);
      if (!nv) return;
      nv.circle.setAttribute('fill', fillFor(state));
      nv.circle.setAttribute('stroke', state === 'default' ? palette.border : palette.stateInk);
      nv.label.setAttribute('fill', inkFor(state));
    }

    function resetAllStates(): void {
      for (let i = 0; i < n; i++) setNodeState(i, 'default');
    }

    function updateBadge(id: number): void {
      const nv = nodes.get(id);
      if (!nv) return;
      const isRoot = parent[id] === id;
      nv.badgeGroup.style.display = isRoot ? '' : 'none';
      nv.badgeText.textContent = String(rank[id]);
    }

    function updateAllBadges(): void {
      for (let i = 0; i < n; i++) updateBadge(i);
    }

    function layoutAndPlace(animate: boolean): Promise<void> {
      const { x, y } = computeLayout(n, parent);

      const activeEdgeChildren = new Set<number>();
      for (let i = 0; i < n; i++) if (parent[i] !== i) activeEdgeChildren.add(i);
      for (const [child, line] of edges) {
        if (!activeEdgeChildren.has(child)) {
          line.remove();
          edges.delete(child);
        }
      }

      const waits: Promise<void>[] = [];
      for (let i = 0; i < n; i++) {
        const nv = nodes.get(i);
        if (!nv) continue;
        nv.group.style.transition = animate ? `transform ${MOVE_MS}ms ease` : 'none';
        nv.group.setAttribute('transform', `translate(${x[i]}, ${y[i]})`);
        if (animate) {
          waits.push(new Promise((resolve) => setTimeout(resolve, MOVE_MS)));
        }
      }

      for (let i = 0; i < n; i++) {
        if (parent[i] === i) continue;
        const p = parent[i]!;
        let line = edges.get(i);
        if (!line) {
          line = svgEl('line', { stroke: palette.border, 'stroke-width': 2 });
          edgesLayer.appendChild(line);
          edges.set(i, line);
        }
        line.setAttribute('x1', String(x[p]));
        line.setAttribute('y1', String(y[p]! + NODE_R));
        line.setAttribute('x2', String(x[i]));
        line.setAttribute('y2', String(y[i]! - NODE_R));
      }

      updateAllBadges();
      return animate ? Promise.all(waits).then(() => undefined) : Promise.resolve();
    }

    function createNode(id: number): NodeVisual {
      const group = svgEl('g');
      const circle = svgEl('circle', {
        r: NODE_R,
        fill: palette.itemDefault,
        stroke: palette.border,
        'stroke-width': 2,
      });
      const label = svgEl('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': fontSizes.md,
        fill: palette.text,
      });
      label.textContent = String(id);

      const badgeGroup = svgEl('g', { transform: `translate(0, ${BADGE_DY})` });
      const badgeRect = svgEl('rect', {
        x: -14,
        y: -10,
        width: 28,
        height: 18,
        rx: 4,
        fill: palette.bgSubtle,
        stroke: palette.border,
      });
      const badgeText = svgEl('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        y: 0,
        'font-size': fontSizes.xs,
        fill: palette.text,
      });
      badgeGroup.appendChild(badgeRect);
      badgeGroup.appendChild(badgeText);

      group.appendChild(circle);
      group.appendChild(badgeGroup);
      group.appendChild(label);
      nodesLayer.appendChild(group);
      return { group, circle, label, badgeGroup, badgeText };
    }

    function buildNodes(): void {
      for (const nv of nodes.values()) nv.group.remove();
      nodes.clear();
      for (let i = 0; i < n; i++) nodes.set(i, createNode(i));
    }

    function init(count: number): void {
      n = count;
      parent = Array.from({ length: n }, (_, i) => i);
      rank = new Array(n).fill(0);
      for (const line of edges.values()) line.remove();
      edges.clear();
      buildNodes();
      resetAllStates();
      void layoutAndPlace(false);
      setCaption('');
    }

    function compareRoots(rootA: number, rootB: number, _rankA: number, _rankB: number, caption: string): void {
      resetAllStates();
      setNodeState(rootA, 'compare');
      setNodeState(rootB, 'compare');
      setCaption(caption);
    }

    async function attach(loser: number, winner: number, _tie: boolean, caption: string): Promise<void> {
      parent[loser] = winner;
      setNodeState(loser, 'loser');
      setNodeState(winner, 'winner');
      setCaption(caption);
      await layoutAndPlace(true);
    }

    async function growRank(root: number, newRank: number, caption: string): Promise<void> {
      rank[root] = newRank;
      setCaption(caption);
      const nv = nodes.get(root);
      if (nv) {
        const base = `translate(0, ${BADGE_DY})`;
        nv.badgeGroup.style.transition = `transform ${GROW_MS}ms ease`;
        nv.badgeGroup.setAttribute('transform', `${base} scale(1.35)`);
        updateBadge(root);
        await new Promise<void>((resolve) => setTimeout(resolve, GROW_MS));
        nv.badgeGroup.setAttribute('transform', base);
      } else {
        updateBadge(root);
      }
    }

    async function rewind(caption: string): Promise<void> {
      parent = Array.from({ length: n }, (_, i) => i);
      rank = new Array(n).fill(0);
      resetAllStates();
      setCaption(caption);
      await layoutAndPlace(true);
    }

    function markDone(caption: string): void {
      resetAllStates();
      setCaption(caption);
    }

    return {
      init,
      compareRoots,
      attach,
      growRank,
      rewind,
      markDone,
      destroy(): void {
        svg.textContent = '';
      },
    };
  },
};
