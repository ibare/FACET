/**
 * avl-tree-stage — 이진 트리와 자리마다의 균형 인수를 함께 그린다.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 회전은 **두 자리가 맞물려 도는**
 * 운동인데 그 view 는 구조가 바뀌면 다시 그릴 뿐 이동을 보여 주지 못한다.
 * 게다가 여기서는 자리마다 높이와 균형 인수가 배지로 붙어야 한다 — 어느
 * 자리가 왜 깨졌는지가 그 수에서 나오기 때문이다 (원칙 6 의 예외 조건).
 *
 * 조각 `heightBalanceCheck` 의 어휘를 맞춘다 — 자리 위에 `h · Δ` 배지, 범위를
 * 벗어난 자리만 다른 색. 코드를 공유하지 않고 어휘만 맞춘다 (S-piece PREFER).
 *
 * **가로는 값의 순서로 고정한다.** 회전은 세로만 바꾸므로, 가로가 안 움직이는
 * 것 자체가 "중위 순회 결과는 그대로" 라는 주장의 증거가 된다. 조각
 * `rotateToBalance` 가 세운 어휘다.
 *
 * 세로는 고정이다 — 재생 중에 viewBox 를 다시 재면 글 안에 박혔을 때 위아래
 * 문단이 밀린다 (S-view).
 */

import {
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
const SIDE = 26;
const TOP = 34;
const LEVEL_GAP = 66;
const NODE_R = 16;
const CAPTION_PAD = 28;
const MOVE_MS = 260;

/** 미리 잡아 두는 층. 넘치면 간격을 줄여 담고 높이는 그대로 둔다. */
const RESERVE_LEVELS = 4;
const STAGE_H = TOP + RESERVE_LEVELS * LEVEL_GAP + NODE_R + CAPTION_PAD;

/** stage 가 받는 자리 모양. algorithm 의 타입을 참조하지 않는다 (원칙 1). */
export type StageNode = {
  id: string;
  key: number;
  left: string | null;
  right: string | null;
  height: number;
};

type Placed = {
  g: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  badge: SVGTextElement;
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

export const avlTreeStageView: CanvasView = {
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
      x: W / 2,
      y: STAGE_H - 9,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    svg.append(edgeLayer, nodeLayer, captionText);

    const placed = new Map<string, Placed>();
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    function render(list: StageNode[], rootId: string | null): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      placed.clear();
      if (list.length === 0 || rootId === null) return;

      const byId = new Map(list.map((n) => [n.id, n]));

      // 가로는 값의 순서로 고정한다 — 회전이 일어나도 좌우가 움직이지 않는다.
      const sorted = [...list].sort((a, b) => a.key - b.key);
      const column = new Map(sorted.map((n, i) => [n.id, i]));
      const band = (W - SIDE * 2) / Math.max(1, sorted.length);

      const depth = new Map<string, number>();
      let deepest = 0;
      const walk = (id: string | null, d: number): void => {
        if (id === null) return;
        const n = byId.get(id);
        if (!n) return;
        depth.set(id, d);
        if (d > deepest) deepest = d;
        walk(n.left, d + 1);
        walk(n.right, d + 1);
      };
      walk(rootId, 0);

      // 잡아 둔 층을 넘으면 간격을 줄인다. 높이는 늘리지 않는다.
      const levelGap =
        deepest > RESERVE_LEVELS ? (RESERVE_LEVELS * LEVEL_GAP) / deepest : LEVEL_GAP;

      const posOf = (id: string): { x: number; y: number } => ({
        x: SIDE + band * ((column.get(id) ?? 0) + 0.5),
        y: TOP + (depth.get(id) ?? 0) * levelGap,
      });

      for (const n of list) {
        if (!depth.has(n.id)) continue;
        for (const childId of [n.left, n.right]) {
          if (childId === null || !depth.has(childId)) continue;
          const a = posOf(n.id);
          const b = posOf(childId);
          const line = el('line', {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: colors.border,
            'stroke-width': 1.5,
          });
          line.style.transition = `x1 ${MOVE_MS}ms ease, y1 ${MOVE_MS}ms ease, x2 ${MOVE_MS}ms ease, y2 ${MOVE_MS}ms ease`;
          edgeLayer.appendChild(line);
        }
      }

      for (const n of list) {
        if (!depth.has(n.id)) continue;
        const p = posOf(n.id);
        const g = el('g');
        const circle = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        circle.style.transition = `fill ${MOVE_MS}ms ease`;
        const label = el('text', {
          x: p.x,
          y: p.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        label.textContent = String(n.key);
        // 배지는 캔버스 배경 위에 떠 있다 — 배경 위 글자는 text 다
        // (design-tokens 의 결정표). stateInk 를 쓰면 다크에서 사라진다.
        const badge = el('text', {
          x: p.x,
          y: p.y - NODE_R - 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        badge.textContent = '';
        g.append(circle, label, badge);
        g.style.transition = `opacity ${MOVE_MS}ms ease`;
        nodeLayer.appendChild(g);
        placed.set(n.id, { g, circle, label, badge, x: p.x, y: p.y });
      }
    }

    function flash(id: string, tile: string, ink: string, ms: number): void {
      const p = placed.get(id);
      if (!p) return;
      p.circle.setAttribute('fill', tile);
      p.label.setAttribute('fill', ink);
      later(() => {
        p.circle.setAttribute('fill', colors.itemDefault);
        p.label.setAttribute('fill', colors.text);
      }, ms);
    }

    return {
      setTree(list: StageNode[], rootId: string | null): void {
        if (destroyed) return;
        render(list, rootId);
      },

      compare(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.itemComparing, colors.stateInk, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      /** 되돌아오며 잰 값을 자리 위에 남긴다. 범위를 벗어난 것만 다른 색. */
      measure(id: string, height: number, balance: number, ok: boolean, caption: string): void {
        if (destroyed) return;
        const p = placed.get(id);
        if (p) {
          const sign = balance > 0 ? '+' : '';
          p.badge.textContent = `h ${height} · Δ ${sign}${balance}`;
          p.badge.setAttribute('fill', ok ? colors.text : colors.danger);
        }
        flash(id, ok ? colors.itemDefault : colors.danger, ok ? colors.text : colors.stateInk, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      imbalance(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.danger, colors.stateInk, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      rotate(pivot: string, newRoot: string, caption: string): void {
        if (destroyed) return;
        flash(pivot, colors.itemSwapping, colors.stateInk, MOVE_MS * 3);
        flash(newRoot, colors.itemPivot, colors.stateInk, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      settle(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.itemPivot, colors.stateInk, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      miss(caption: string): void {
        if (destroyed) return;
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
export type AvlTreeStage = {
  setTree(list: StageNode[], rootId: string | null): void;
  compare(id: string, caption: string): void;
  measure(id: string, height: number, balance: number, ok: boolean, caption: string): void;
  imbalance(id: string, caption: string): void;
  rotate(pivot: string, newRoot: string, caption: string): void;
  settle(id: string, caption: string): void;
  miss(caption: string): void;
  caption(text: string): void;
};
