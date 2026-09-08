/**
 * bst-degenerate-stage — 편향 트리 조각(piece) 전용 캔버스.
 *
 * 빌트인 `tree-layout` view 는 나무 하나만 그린다. 이 조각은 같은 값 여섯 개로
 * 만든 두 나무를 **같은 세로 축척**으로 나란히 세워 "키가 다르다" 를 한 눈에
 * 비교해야 하므로 (S-piece: 형태는 질문이 정한다) 빌트인 어휘로 표현할 수
 * 없어 전용 stage 를 둔다 (S-facet).
 *
 * 열(가로)은 값의 오름차순 순위로 고정한다 — BST 의 중위 순회는 항상 오름차순
 * 이므로, 같은 값은 어느 나무에서도 같은 열에 선다. 행(세로)만 삽입 순서가
 * 만든 실제 깊이를 따른다. 그래서 "모양만 다르다" 가 좌표로 그대로 드러난다.
 *
 * 새 노드는 반지름 0→최종 크기로 자라며, 부모→자식 간선은 길이 0→최종
 * 길이로 자란다 — 실제 위치가 생기는 동작이다 (S-piece: opacity 전환만으로
 * "자란다"를 표현하지 않는다).
 */

import {
  getColors,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

type TreeId = 'a' | 'b';
type Side = 'left' | 'right';

const W = PIECE_CANVAS_W;
const PANEL_GAP = 24;
const PANEL_W = (W - PANEL_GAP) / 2;
const PANEL_X0: Record<TreeId, number> = { a: 0, b: PANEL_W + PANEL_GAP };

const CAPTION_H = 30;
const HEADER_H = 22;
const NODE_R = 15;
const ROW_GAP = 44;
const TREE_TOP_GAP = 14;
const TREE_BOTTOM_GAP = 14;
const RESULT_H = 26;
const CELL_MAX_W = 60;
const SIDE_MIN = 14;
const GROW_MS = 260;
const PULSE_MS = 300;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** t=0..1 프레임마다 onFrame 을 부르는 RAF 기반 트윈. */
function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function frame(now: number) {
      const raw = Math.min(1, (now - start) / durationMs);
      onFrame(easeOutCubic(raw));
      if (raw < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function readNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === 'number');
}

type NodeEntry = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  x: number;
  y: number;
  parentId: string | null;
};

type EdgeEntry = { line: SVGLineElement; x1: number; y1: number };

export const bstDegenerateStageView: CanvasView = {
  canvas: { height: 356 },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const theme: Theme | undefined = params.theme;
    const colors = getColors(theme);

    const initial = params.initialData as { orderA?: unknown; orderB?: unknown } | undefined;
    const orderA = readNumberArray(initial?.orderA);
    const orderB = readNumberArray(initial?.orderB);
    const allValues = Array.from(new Set([...orderA, ...orderB])).sort((x, y) => x - y);
    const N = Math.max(1, allValues.length);
    const colOf = new Map(allValues.map((v, i) => [v, i]));

    const H = CAPTION_H + HEADER_H + TREE_TOP_GAP + (N - 1) * ROW_GAP + NODE_R * 2 + TREE_BOTTOM_GAP + RESULT_H;
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', String(H));

    const colW = Math.min(CELL_MAX_W, Math.floor((PANEL_W - SIDE_MIN * 2) / N));
    const colInset = Math.round((PANEL_W - N * colW) / 2);

    function colX(tree: TreeId, value: number): number {
      const col = colOf.get(value) ?? 0;
      return PANEL_X0[tree] + colInset + colW * col + colW / 2;
    }
    function rowY(depth: number): number {
      return CAPTION_H + HEADER_H + TREE_TOP_GAP + NODE_R + depth * ROW_GAP;
    }
    const resultY = CAPTION_H + HEADER_H + TREE_TOP_GAP + (N - 1) * ROW_GAP + NODE_R * 2 + TREE_BOTTOM_GAP + RESULT_H / 2;

    const captionText = svgEl('text', {
      x: W / 2,
      y: CAPTION_H / 2 + 5,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(captionText);

    const treeG: Record<TreeId, SVGGElement> = { a: svgEl('g'), b: svgEl('g') };
    const edgesG: Record<TreeId, SVGGElement> = { a: svgEl('g'), b: svgEl('g') };
    const nodesG: Record<TreeId, SVGGElement> = { a: svgEl('g'), b: svgEl('g') };
    const resultText: Record<TreeId, SVGTextElement> = {
      a: svgEl('text', { x: PANEL_X0.a + PANEL_W / 2, y: resultY + 4, 'text-anchor': 'middle' }),
      b: svgEl('text', { x: PANEL_X0.b + PANEL_W / 2, y: resultY + 4, 'text-anchor': 'middle' }),
    };

    for (const tree of ['a', 'b'] as const) {
      const header = svgEl('text', {
        x: PANEL_X0[tree] + PANEL_W / 2,
        y: CAPTION_H + HEADER_H / 2 + 4,
        'text-anchor': 'middle',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      const order = tree === 'a' ? orderA : orderB;
      header.textContent = order.join(' → ');

      resultText[tree].setAttribute('fill', colors.textMuted);
      resultText[tree].setAttribute('font-family', fonts.mono);
      resultText[tree].setAttribute('font-size', fontSizes.xs);

      treeG[tree].append(edgesG[tree], nodesG[tree]);
      svg.append(header, treeG[tree], resultText[tree]);
    }

    const nodes = new Map<string, NodeEntry>();
    const edges = new Map<string, EdgeEntry>();

    async function insertNode(
      tree: TreeId,
      id: string,
      value: number,
      parentId: string | null,
      _side: Side | null,
      depth: number,
    ): Promise<void> {
      const x = colX(tree, value);
      const y = rowY(depth);
      const parent = parentId ? nodes.get(parentId) : undefined;

      const group = svgEl('g');
      const circle = svgEl('circle', {
        cx: x,
        cy: y,
        r: 0,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 2,
      });
      const label = svgEl('text', {
        x,
        y: y + 4,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        opacity: 0,
      });
      label.textContent = String(value);
      group.append(circle, label);
      nodesG[tree].appendChild(group);
      nodes.set(id, { group, circle, label, x, y, parentId });

      let line: SVGLineElement | null = null;
      if (parent) {
        line = svgEl('line', {
          x1: parent.x,
          y1: parent.y,
          x2: parent.x,
          y2: parent.y,
          stroke: colors.border,
          'stroke-width': 2,
        });
        edgesG[tree].appendChild(line);
        edges.set(id, { line, x1: parent.x, y1: parent.y });
      }

      const finalLine = line;
      await tween(GROW_MS, (t) => {
        circle.setAttribute('r', String(NODE_R * t));
        label.setAttribute('opacity', String(t));
        if (finalLine) {
          finalLine.setAttribute('x2', String(parent!.x + (x - parent!.x) * t));
          finalLine.setAttribute('y2', String(parent!.y + (y - parent!.y) * t));
        }
      });
    }

    async function pulse(entry: NodeEntry, fill: string, ink: string, persist: boolean): Promise<void> {
      entry.circle.setAttribute('fill', fill);
      entry.label.setAttribute('fill', ink);
      if (persist) return;
      await sleep(PULSE_MS);
      entry.circle.setAttribute('fill', colors.itemDefault);
      entry.label.setAttribute('fill', colors.text);
    }

    async function compareNode(_tree: TreeId, nodeId: string, _direction: Side): Promise<void> {
      const entry = nodes.get(nodeId);
      if (!entry) return;
      await pulse(entry, colors.itemComparing, colors.stateInk, false);
    }

    async function searchCompareNode(_tree: TreeId, nodeId: string, direction: Side | 'match'): Promise<void> {
      const entry = nodes.get(nodeId);
      if (!entry) return;
      if (direction === 'match') {
        await pulse(entry, colors.itemPivot, colors.stateInk, true);
        return;
      }
      await pulse(entry, colors.itemComparing, colors.stateInk, false);
    }

    async function showResult(tree: TreeId, text: string): Promise<void> {
      const el = resultText[tree];
      el.textContent = text;
      await tween(220, (t) => {
        el.setAttribute('opacity', String(t));
      });
    }

    async function conclude(): Promise<void> {
      for (const tree of ['a', 'b'] as const) {
        const el = resultText[tree];
        el.setAttribute('fill', colors.accent);
      }
      await sleep(PULSE_MS);
      for (const tree of ['a', 'b'] as const) {
        resultText[tree].setAttribute('fill', colors.textMuted);
      }
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function rewind(): void {
      nodesG.a.textContent = '';
      nodesG.b.textContent = '';
      edgesG.a.textContent = '';
      edgesG.b.textContent = '';
      nodes.clear();
      edges.clear();
      for (const tree of ['a', 'b'] as const) {
        resultText[tree].textContent = '';
        resultText[tree].setAttribute('opacity', '0');
        resultText[tree].setAttribute('fill', colors.textMuted);
      }
    }

    return {
      destroy() {
        container.textContent = '';
      },
      insertNode,
      compareNode,
      searchCompareNode,
      showResult,
      conclude,
      setCaption,
      rewind,
    };
  },
};
