/**
 * union-find-stage — 자리들이 이룬 나무 무리를 그린다.
 *
 * 빌트인 `graph-layout` 을 쓰지 않은 이유: 여기서 보아야 하는 것은 그래프가
 * 아니라 **깊이**다. 경로 압축이 하는 일이 나무를 납작하게 만드는 것이라,
 * 자리가 뿌리에서 몇 칸인지가 세로 좌표로 바로 읽혀야 한다. 그 view 는 힘
 * 기반으로 정점을 흩뿌려 깊이를 좌표로 주지 못한다 (원칙 6 의 예외 조건).
 *
 * 무리마다 색을 갈라 준다 — 무리가 같은지를 뿌리 이름으로 견주지 않고 눈으로
 * 알 수 있어야, "무리를 정하는 것은 자리가 아니라 이름" 이라는 말이 그림으로
 * 선다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Theme,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const SIDE = 24;
const TOP = 34;
const LEVEL_GAP = 60;
const NODE_R = 16;
const CAPTION_PAD = 30;
const MOVE_MS = 240;

/**
 * 미리 자리를 잡아 두는 깊이.
 *
 * 학습자가 계속 합치면 줄이 자리 수만큼(size−1) 길어질 수 있다. 그 최악에
 * 맞춰 잡으면 화면 대부분이 늘 비어 있으므로, 흔한 깊이만큼만 잡고 넘치면
 * 층 간격을 줄여 담는다. **높이는 어떤 경우에도 바뀌지 않는다** — 재생 중에
 * viewBox 를 다시 재면 글 안에 박혔을 때 위아래 문단이 밀린다 (S-view).
 */
const RESERVE_DEPTH = 5;
const STAGE_H = TOP + RESERVE_DEPTH * LEVEL_GAP + NODE_R + CAPTION_PAD;

type Node = {
  g: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  rankBadge: SVGTextElement;
  x: number;
  y: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 뿌리에서 몇 칸인가. 고리가 있어도 멈춘다. */
function depthOf(parent: number[], i: number): number {
  let d = 0;
  let cur = i;
  while (parent[cur] !== cur && d <= parent.length) {
    cur = parent[cur]!;
    d += 1;
  }
  return d;
}

function rootOf(parent: number[], i: number): number {
  let cur = i;
  let guard = 0;
  while (parent[cur] !== cur && guard <= parent.length) {
    cur = parent[cur]!;
    guard += 1;
  }
  return cur;
}

export const unionFindStageView: CanvasView = {
  // 세로는 고정이다. 재생 중에 바꾸지 않는다 (S-view).
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 붙인 이 캔버스가 떨어져
    // 나간다 (S-view).
    svg.textContent = '';

    const theme: Theme = params.theme ?? 'light';
    const colors: Palette = getColors(theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const captionText = el('text', {
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    svg.append(edgeLayer, nodeLayer, captionText);

    const nodes = new Map<number, Node>();
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    /**
     * 구조를 통째로 다시 그린다.
     *
     * 무리마다 가로 띠를 나눠 주고, 그 안에서 깊이별로 층을 쌓는다. 자리의
     * 세로가 곧 뿌리까지의 칸 수라, 압축이 일어나면 층이 실제로 접힌다.
     */
    function render(parent: number[], rank: number[]): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      nodes.clear();

      const n = parent.length;
      if (n === 0) return;

      const roots: number[] = [];
      for (let i = 0; i < n; i += 1) if (parent[i] === i) roots.push(i);
      const rootIndex = new Map(roots.map((r, k) => [r, k]));
      // 무리 수만큼 색을 한 번에 뽑는다 — categorical 은 개수를 받아 배열을 준다.
      const hues = categorical(Math.max(1, roots.length), 'vivid');

      // 무리마다 몇 칸을 쓰는지 세어 띠 폭을 그 비율로 나눈다 — 큰 무리가
      // 좁은 띠에 눌리면 깊이를 읽을 수 없다.
      const members = new Map<number, number[]>();
      for (let i = 0; i < n; i += 1) {
        const r = rootOf(parent, i);
        const list = members.get(r) ?? [];
        list.push(i);
        members.set(r, list);
      }

      const usable = W - SIDE * 2;
      let cursorX = SIDE;
      const pos = new Map<number, { x: number; y: number }>();
      let maxDepth = 0;

      // 먼저 가장 깊은 자리를 알아야 층 간격을 정할 수 있다.
      const depths = new Map<number, number>();
      for (let i = 0; i < n; i += 1) {
        const d = depthOf(parent, i);
        depths.set(i, d);
        if (d > maxDepth) maxDepth = d;
      }
      // 잡아 둔 깊이를 넘으면 간격을 줄여 담는다. 높이는 늘리지 않는다.
      const levelGap =
        maxDepth > RESERVE_DEPTH ? (RESERVE_DEPTH * LEVEL_GAP) / maxDepth : LEVEL_GAP;

      for (const r of roots) {
        const list = members.get(r) ?? [r];
        const band = (usable * list.length) / n;
        // 무리 안에서 깊이별로 줄을 세운다.
        const byDepth = new Map<number, number[]>();
        for (const m of list) {
          const row = byDepth.get(depths.get(m) ?? 0) ?? [];
          row.push(m);
          byDepth.set(depths.get(m) ?? 0, row);
        }
        for (const [d, row] of byDepth) {
          row.forEach((m, k) => {
            pos.set(m, {
              x: cursorX + (band * (k + 0.5)) / row.length,
              y: TOP + d * levelGap,
            });
          });
        }
        cursorX += band;
      }

      captionText.setAttribute('x', String(W / 2));
      captionText.setAttribute('y', String(STAGE_H - 10));

      // 간선 먼저 — 노드 아래에 깔린다.
      for (let i = 0; i < n; i += 1) {
        const p = parent[i]!;
        if (p === i) continue;
        const from = pos.get(i);
        const to = pos.get(p);
        if (!from || !to) continue;
        const line = el('line', {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        line.style.transition = `x1 ${MOVE_MS}ms ease, y1 ${MOVE_MS}ms ease, x2 ${MOVE_MS}ms ease, y2 ${MOVE_MS}ms ease`;
        edgeLayer.appendChild(line);
      }

      for (let i = 0; i < n; i += 1) {
        const p = pos.get(i);
        if (!p) continue;
        const r = rootOf(parent, i);
        const hue = hues[(rootIndex.get(r) ?? 0) % hues.length] ?? colors.border;

        const g = el('g');
        const circle = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: hue,
          'stroke-width': parent[i] === i ? 3 : 1.5,
        });
        const label = el('text', {
          x: p.x,
          y: p.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        label.textContent = String(i);

        // 랭크는 뿌리에만 뜻이 있다 — 그 밑에 들어간 자리의 랭크는 쓰이지 않는다.
        const rankBadge = el('text', {
          x: p.x + NODE_R + 3,
          y: p.y - NODE_R + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        rankBadge.textContent = parent[i] === i ? String(rank[i] ?? 0) : '';

        g.append(circle, label, rankBadge);
        g.style.transition = `opacity ${MOVE_MS}ms ease`;
        nodeLayer.appendChild(g);
        nodes.set(i, { g, circle, label, rankBadge, x: p.x, y: p.y });
      }
    }

    function flash(i: number, tile: string, ink: string, ms: number): void {
      const node = nodes.get(i);
      if (!node) return;
      node.circle.setAttribute('fill', tile);
      node.label.setAttribute('fill', ink);
      later(() => {
        node.circle.setAttribute('fill', colors.itemDefault);
        node.label.setAttribute('fill', colors.text);
      }, ms);
    }

    return {
      setStructure(parent: number[], rank: number[]): void {
        if (destroyed) return;
        render(parent, rank);
      },

      /** 한 칸 올랐다. 고정 타일 위라 잉크는 stateInk (design-tokens 결정표). */
      hop(to: number, caption: string): void {
        if (destroyed) return;
        flash(to, colors.itemComparing, colors.stateInk, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      rootFound(root: number, caption: string): void {
        if (destroyed) return;
        flash(root, colors.itemPivot, colors.stateInk, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      attach(loser: number, winner: number, caption: string): void {
        if (destroyed) return;
        flash(loser, colors.itemSwapping, colors.stateInk, MOVE_MS * 2);
        flash(winner, colors.itemPivot, colors.stateInk, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      compressed(list: number[], caption: string): void {
        if (destroyed) return;
        for (const i of list) flash(i, colors.itemSorted, colors.textInverse, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      caption(text: string): void {
        if (destroyed) return;
        captionText.textContent = text;
      },

      empty(): void {
        if (destroyed) return;
        captionText.textContent = t('caption.empty', 'Nothing here yet.');
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    } satisfies ViewInstance & Record<string, unknown>;
  },
};

/** projector 가 부르는 메서드 묶음. */
export type UnionFindStage = {
  setStructure(parent: number[], rank: number[]): void;
  hop(to: number, caption: string): void;
  rootFound(root: number, caption: string): void;
  attach(loser: number, winner: number, caption: string): void;
  compressed(list: number[], caption: string): void;
  caption(text: string): void;
};
