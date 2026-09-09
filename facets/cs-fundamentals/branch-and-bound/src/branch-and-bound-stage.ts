/**
 * branch-and-bound-stage — 분기 한정 전용 stage view.
 *
 * 화면은 세 켜다.
 *
 *  1. **물건 띠** — 값/무게 순으로 늘어선 물건 넷, 한도 판, 최고 판.
 *     지금 갈림길에 놓인 물건 하나에 테를 두르고, 이미 정해진 앞쪽 물건은 흐린다.
 *  2. **한계 자** — 이 갈래에서 최선을 다했을 때의 값. 이미 담은 값 위에
 *     남은 물건을 통째로 얹고, 마지막 하나는 **빗금 친 조각**으로 얹는다.
 *     빗금이 곧 "쪼개서라도 한도를 채웠다" 는 표시다. 자 위의 선이 지금까지의
 *     최고이고, 자가 그 선을 못 넘으면 자른다.
 *  3. **나무** — 갈래가 실제로 뻗는다. 가로 자리는 **방문 순서**(id `n0`·`n1`…),
 *     세로 자리는 깊이(결정한 물건 수). 실선은 담은 갈래, 점선은 두고 간 갈래다.
 *     잘린 갈래와 무게가 넘친 갈래는 자식이 없는 채로 멈춰 있어, 보지 않은 부분이
 *     눈에 그대로 남는다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 나무 줄은 다섯으로 고정이고, 칸이
 * 모자라면 가로로만 좁혀 담는다.
 *
 * 타이머와 옵저버를 쓰지 않는다. `destroy()` 는 만든 노드만 거둔다.
 */

import {
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 갈래 하나가 화면에서 가지는 상태. */
export type BranchNodeState =
  | 'open'
  | 'current'
  | 'best'
  | 'overflow'
  | 'cut'
  | 'closed';

export type BranchNode = {
  id: string;
  parentId: string | null;
  depth: number;
  /** true 담은 갈래 · false 두고 간 갈래 · null 뿌리 */
  taken: boolean | null;
  w: number;
  v: number;
};

/** 한계 자에 쌓이는 한 조각. */
type BoundPart = { kind: 'full' | 'frac'; amount: number };

// ── 기하 (색은 토큰에서만 온다) ────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 372;

const LABEL_R = 80;

const ITEM_TOP = 12;
const ITEM_H = 46;
const ITEM_X0 = 88;
const ITEM_W = 60;
const ITEM_GAP = 8;

const CAP_X = 364;
const CAP_W = 110;
const BEST_X = 486;
const BEST_W = 116;

const BAR_TOP = 74;
const BAR_H = 22;
const BAR_X0 = 88;
const BAR_X1 = 552;
const BOUND_TEXT_X = 602;

const TREE_TOP = 122;
/** 흔한 깊이(물건 넷 = 다섯 줄)의 층 간격. 더 깊어지면 이 값을 줄여 담는다. */
const ROW_H = 40;
/** 뿌리 줄부터 마지막 줄까지의 세로 폭. 세로는 마운트 뒤 바뀌지 않는다 (S-view). */
const TREE_SPAN = ROW_H * 4;
const NODE_W = 44;
const NODE_H = 24;
/** 층 간격이 좁아져도 상자 사이에 남겨 둘 틈. */
const ROW_GAP_MIN = 14;
const TREE_L = 16;
const TREE_R = 604;
const MIN_COLS = 10;

const CAPTION_Y = 356;

let patternSeq = 0;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function textEl(
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = svgEl('text', { x, y, ...attrs });
  node.textContent = content;
  return node;
}

/** 정수면 정수로, 아니면 소수 한 자리로. 화면의 수는 표식이다 (C10). */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export const branchAndBoundStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  // 컨테이너는 쓰지 않는다 — 러너가 붙여 준 캔버스 안에만 그린다. 컨테이너를
  // 비우면 그 캔버스가 떨어져 나간다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    const hatchId = `bnb-hatch-${++patternSeq}`;

    // ── 자료 ────────────────────────────────────────────────────────────
    let values: number[] = [];
    let weights: number[] = [];
    let labels: number[] = [];
    let capacity = 0;
    let scale = 1;

    let best: number | null = null;
    let bestNodeId: string | null = null;
    let focusItem: number | null = null;

    const nodes: BranchNode[] = [];
    const nodeIndex = new Map<string, number>();
    const nodeState = new Map<string, BranchNodeState>();

    let boundBase = 0;
    let boundParts: BoundPart[] = [];
    let boundValue: number | null = null;
    let boundVerdict: 'keep' | 'cut' | null = null;
    let boundActive = false;

    // ── 뼈대 ────────────────────────────────────────────────────────────
    const defs = svgEl('defs', {});
    const pattern = svgEl('pattern', {
      id: hatchId,
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    });
    pattern.appendChild(
      svgEl('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 6,
        stroke: colors.bg,
        'stroke-width': 2.4,
      }),
    );
    defs.appendChild(pattern);
    canvas.appendChild(defs);

    const gItems = svgEl('g', {});
    const gBar = svgEl('g', {});
    const gTree = svgEl('g', {});
    const gCaption = svgEl('g', {});
    canvas.appendChild(gItems);
    canvas.appendChild(gBar);
    canvas.appendChild(gTree);
    canvas.appendChild(gCaption);

    const caption = textEl(W / 2, CAPTION_Y, '', {
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': 12,
      fill: colors.textMuted,
    });
    gCaption.appendChild(caption);

    const clear = (g: SVGGElement): void => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    // ── 물건 띠 ──────────────────────────────────────────────────────────
    function renderItems(): void {
      clear(gItems);
      if (values.length === 0) return;

      gItems.appendChild(
        textEl(LABEL_R, ITEM_TOP + 29, tr('label.value', 'value'), {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': 10,
          fill: colors.textMuted,
        }),
      );
      gItems.appendChild(
        textEl(LABEL_R, ITEM_TOP + 42, tr('label.weight', 'weight'), {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': 10,
          fill: colors.textMuted,
        }),
      );

      values.forEach((value, k) => {
        const x = ITEM_X0 + k * (ITEM_W + ITEM_GAP);
        const focused = focusItem === k;
        const card = svgEl('g', { opacity: focused ? 1 : focusItem !== null && k < focusItem ? 0.4 : 0.85 });
        card.appendChild(
          svgEl('rect', {
            x,
            y: ITEM_TOP,
            width: ITEM_W,
            height: ITEM_H,
            rx: 5,
            fill: focused ? colors.bgSubtle : colors.bg,
            stroke: focused ? colors.accent : colors.border,
            'stroke-width': focused ? 2 : 1,
          }),
        );
        card.appendChild(
          textEl(x + 6, ITEM_TOP + 12, `#${labels[k] ?? k + 1}`, {
            'font-family': fonts.mono,
            'font-size': 9,
            fill: colors.textMuted,
          }),
        );
        card.appendChild(
          textEl(x + ITEM_W / 2, ITEM_TOP + 29, String(value), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': 16,
            'font-weight': '600',
            fill: colors.text,
          }),
        );
        card.appendChild(
          textEl(x + ITEM_W / 2, ITEM_TOP + 42, String(weights[k] ?? 0), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': 11,
            fill: colors.textMuted,
          }),
        );
        gItems.appendChild(card);
      });

      const plate = (
        x: number,
        width: number,
        label: string,
        value: string,
        emphasis: boolean,
      ): void => {
        gItems.appendChild(
          svgEl('rect', {
            x,
            y: ITEM_TOP,
            width,
            height: ITEM_H,
            rx: 5,
            fill: colors.bgSubtle,
            stroke: emphasis ? colors.accent : colors.border,
            'stroke-width': emphasis ? 2 : 1,
          }),
        );
        gItems.appendChild(
          textEl(x + width / 2, ITEM_TOP + 17, label, {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': 10,
            fill: colors.textMuted,
          }),
        );
        gItems.appendChild(
          textEl(x + width / 2, ITEM_TOP + 37, value, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': 17,
            'font-weight': '600',
            fill: colors.text,
          }),
        );
      };

      plate(CAP_X, CAP_W, tr('label.capacity', 'limit'), String(capacity), false);
      plate(
        BEST_X,
        BEST_W,
        tr('label.best', 'best'),
        best === null ? '-' : String(best),
        best !== null,
      );
    }

    // ── 한계 자 ──────────────────────────────────────────────────────────
    const xOf = (value: number): number =>
      BAR_X0 + Math.max(0, Math.min(1, value / scale)) * (BAR_X1 - BAR_X0);

    function renderBar(): void {
      clear(gBar);
      if (values.length === 0) return;

      gBar.appendChild(
        textEl(LABEL_R, BAR_TOP + 15, tr('label.bound', 'bound'), {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': 10,
          fill: colors.textMuted,
        }),
      );

      gBar.appendChild(
        svgEl('rect', {
          x: BAR_X0,
          y: BAR_TOP,
          width: BAR_X1 - BAR_X0,
          height: BAR_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: boundVerdict === 'cut' ? colors.danger : colors.border,
          'stroke-width': boundVerdict === 'cut' ? 2 : 1,
        }),
      );

      if (boundActive) {
        let acc = boundBase;
        if (boundBase > 0) {
          gBar.appendChild(
            svgEl('rect', {
              x: xOf(0),
              y: BAR_TOP + 1,
              width: Math.max(0, xOf(boundBase) - xOf(0)),
              height: BAR_H - 2,
              fill: colors.itemSorted,
            }),
          );
        }
        for (const part of boundParts) {
          const from = xOf(acc);
          acc += part.amount;
          const to = xOf(acc);
          gBar.appendChild(
            svgEl('rect', {
              x: from,
              y: BAR_TOP + 1,
              width: Math.max(0, to - from),
              height: BAR_H - 2,
              fill: colors.itemComparing,
            }),
          );
          if (part.kind === 'frac') {
            gBar.appendChild(
              svgEl('rect', {
                x: from,
                y: BAR_TOP + 1,
                width: Math.max(0, to - from),
                height: BAR_H - 2,
                fill: `url(#${hatchId})`,
              }),
            );
          }
          // 물건 하나가 어디서 끝나는지 — 이음매를 그어 두지 않으면 한 덩어리로 읽힌다.
          if (from > xOf(0)) {
            gBar.appendChild(
              svgEl('line', {
                x1: from,
                y1: BAR_TOP + 1,
                x2: from,
                y2: BAR_TOP + BAR_H - 1,
                stroke: colors.bg,
                'stroke-width': 1,
              }),
            );
          }
        }
      }

      if (best !== null && best > 0) {
        const bx = xOf(best);
        gBar.appendChild(
          svgEl('line', {
            x1: bx,
            y1: BAR_TOP - 6,
            x2: bx,
            y2: BAR_TOP + BAR_H + 6,
            stroke: colors.accent,
            'stroke-width': 2,
          }),
        );
        gBar.appendChild(
          svgEl('polygon', {
            points: `${bx - 4},${BAR_TOP - 6} ${bx + 4},${BAR_TOP - 6} ${bx},${BAR_TOP - 1}`,
            fill: colors.accent,
          }),
        );
      }

      gBar.appendChild(
        textEl(BOUND_TEXT_X, BAR_TOP + 16, boundValue === null ? '-' : fmt(boundValue), {
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': 13,
          'font-weight': '600',
          fill: boundVerdict === 'cut' ? colors.danger : colors.text,
        }),
      );
    }

    // ── 나무 ────────────────────────────────────────────────────────────
    const slotW = (): number => (TREE_R - TREE_L) / Math.max(MIN_COLS, nodes.length);
    const cxOf = (col: number): number => TREE_L + slotW() * (col + 0.5);
    /**
     * 층 간격. 물건이 넷을 넘으면 줄이 늘어나므로 **간격을 줄여** 같은 세로 폭에
     * 담는다. 높이를 늘리면 글 안에 박힌 그림의 아래 문단이 밀린다 (S-view).
     */
    const rowH = (): number => Math.min(ROW_H, TREE_SPAN / Math.max(4, values.length));
    const nodeH = (): number => Math.min(NODE_H, Math.max(12, rowH() - ROW_GAP_MIN));
    const cyOf = (depth: number): number => TREE_TOP + 22 + depth * rowH();

    // 테마를 타지 않는 색(itemActive · itemPivot · danger) 위의 글자는 stateInk 를
    // 쓴다. textInverse 는 테마를 따라 뒤집혀서, 어두운 테마에서 빨강 위에 검정이
    // 얹히는 조합이 나온다.
    function fillFor(state: BranchNodeState): { fill: string; stroke: string; ink: string } {
      switch (state) {
        case 'current':
          return { fill: colors.itemActive, stroke: colors.itemActive, ink: colors.stateInk };
        case 'best':
          return { fill: colors.itemPivot, stroke: colors.itemPivot, ink: colors.stateInk };
        case 'overflow':
          return { fill: colors.danger, stroke: colors.danger, ink: colors.stateInk };
        case 'cut':
          return { fill: colors.itemSorted, stroke: colors.itemSorted, ink: colors.textInverse };
        case 'closed':
          return { fill: colors.bgSubtle, stroke: colors.border, ink: colors.text };
        case 'open':
        default:
          return { fill: colors.itemDefault, stroke: colors.border, ink: colors.text };
      }
    }

    function renderTree(): void {
      clear(gTree);
      const boxW = Math.min(NODE_W, Math.max(20, slotW() - 6));
      const boxH = nodeH();

      for (const node of nodes) {
        if (node.parentId === null) continue;
        const pIdx = nodeIndex.get(node.parentId);
        const cIdx = nodeIndex.get(node.id);
        if (pIdx === undefined || cIdx === undefined) continue;
        const parent = nodes[pIdx];
        const px = cxOf(pIdx);
        const py = cyOf(parent.depth) + boxH / 2;
        const cx = cxOf(cIdx);
        const cy = cyOf(node.depth) - boxH / 2;
        const gy = py + (cy - py) / 2;
        gTree.appendChild(
          svgEl('path', {
            d: `M ${px} ${py} L ${px} ${gy} L ${cx} ${gy} L ${cx} ${cy}`,
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-width': 1.5,
            'stroke-dasharray': node.taken === false ? '4 3' : 'none',
          }),
        );
      }

      nodes.forEach((node, col) => {
        const state = nodeState.get(node.id) ?? 'open';
        const paint = fillFor(state);
        const cx = cxOf(col);
        const cy = cyOf(node.depth);
        gTree.appendChild(
          svgEl('rect', {
            x: cx - boxW / 2,
            y: cy - boxH / 2,
            width: boxW,
            height: boxH,
            rx: 4,
            fill: paint.fill,
            stroke: paint.stroke,
            'stroke-width': state === 'current' ? 2 : 1,
          }),
        );
        gTree.appendChild(
          textEl(cx, cy + 4, String(node.v), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': 12,
            'font-weight': '600',
            fill: paint.ink,
          }),
        );
        // 무게는 상자 아래 왼쪽 귀퉁이에 붙인다. 가운데에 두면 자식으로 내려가는
        // 선이 글자를 관통한다.
        gTree.appendChild(
          textEl(cx - boxW / 2 + 2, cy + boxH / 2 + 9, String(node.w), {
            'font-family': fonts.mono,
            'font-size': 9,
            fill: state === 'overflow' ? colors.danger : colors.textMuted,
          }),
        );
      });
    }

    function renderAll(): void {
      renderItems();
      renderBar();
      renderTree();
    }

    renderAll();

    return {
      destroy(): void {
        for (const g of [defs, gItems, gBar, gTree, gCaption]) {
          if (g.parentNode) g.parentNode.removeChild(g);
        }
      },

      setItems(nextValues: number[], nextWeights: number[], nextLabels: number[], cap: number) {
        values = [...nextValues];
        weights = [...nextWeights];
        labels = [...nextLabels];
        capacity = cap;
        scale = Math.max(1, values.reduce((a, b) => a + b, 0));
        renderAll();
      },

      setCaption(text: string) {
        caption.textContent = text;
      },

      setFocusItem(index: number | null) {
        focusItem = index !== null && index >= 0 && index < values.length ? index : null;
        renderItems();
      },

      setBest(value: number, nodeId: string | null) {
        best = value;
        if (nodeId !== null) {
          if (bestNodeId !== null && bestNodeId !== nodeId && nodeState.get(bestNodeId) === 'best') {
            nodeState.set(bestNodeId, 'closed');
          }
          bestNodeId = nodeId;
          nodeState.set(nodeId, 'best');
        }
        renderItems();
        renderBar();
        renderTree();
      },

      addNode(node: BranchNode) {
        if (nodeIndex.has(node.id)) return;
        nodeIndex.set(node.id, nodes.length);
        nodes.push({ ...node });
        nodeState.set(node.id, 'current');
        for (const other of nodes) {
          if (other.id !== node.id && nodeState.get(other.id) === 'current') {
            nodeState.set(other.id, 'open');
          }
        }
        renderTree();
      },

      setNodeState(id: string, state: BranchNodeState) {
        if (!nodeIndex.has(id)) return;
        if (state !== 'best' && nodeState.get(id) === 'best') return;
        nodeState.set(id, state);
        renderTree();
      },

      beginBound(base: number) {
        boundActive = true;
        boundBase = base;
        boundParts = [];
        boundValue = base;
        boundVerdict = null;
        renderBar();
      },

      addBoundPart(kind: 'full' | 'frac', amount: number, total: number) {
        boundParts.push({ kind, amount });
        boundValue = total;
        renderBar();
      },

      endBound(value: number) {
        boundValue = value;
        renderBar();
      },

      setVerdict(verdict: 'keep' | 'cut' | null) {
        boundVerdict = verdict;
        renderBar();
      },

      clearBound() {
        boundActive = false;
        boundBase = 0;
        boundParts = [];
        boundValue = null;
        boundVerdict = null;
        renderBar();
      },

      reset() {
        nodes.length = 0;
        nodeIndex.clear();
        nodeState.clear();
        best = null;
        bestNodeId = null;
        focusItem = null;
        boundActive = false;
        boundBase = 0;
        boundParts = [];
        boundValue = null;
        boundVerdict = null;
        caption.textContent = '';
        renderAll();
      },
    };
  },
};
