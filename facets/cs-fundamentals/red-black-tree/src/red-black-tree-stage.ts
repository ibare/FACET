/**
 * red-black-tree-stage — 자리의 색이 곧 값인 이진 트리.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 그 view 는 색을 **상태**로 쓴다
 * (지금 보고 있는 자리, 다 끝난 자리…). 여기서 색은 상태가 아니라 **저장된
 * 값**이다. 빨강인지 검정인지가 자료구조의 내용 자체라, 진행 표시로 색을
 * 덮어쓰면 화면이 거짓을 말한다 (원칙 6 의 예외 조건).
 *
 * 그래서 진행은 **테두리 링**으로만 표시한다. 채움색은 늘 그 자리의 실제
 * 색이다. 조각 `recolorThenRotate` · `blackHeightEqual` 이 세운 어휘를 맞춘다 —
 * 빨강은 `danger`(두 팔레트 고정), 검정은 `primary`(테마를 따라 뒤집힘).
 * hex 를 쓰지 않고 빨강·검정을 늘 구분되게 하는 유일한 짝이다.
 *
 * 가로는 값의 순서로 고정한다 — 회전이 세로만 바꾸므로, 가로가 안 움직이는
 * 것이 중위 순회 불변의 증거다 (`rotateToBalance` 의 어휘).
 *
 * 세로는 고정이다 (S-view).
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
const TOP = 32;
const LEVEL_GAP = 62;
const NODE_R = 15;
const CAPTION_PAD = 28;
const MOVE_MS = 260;

/** 미리 잡아 두는 층. 넘치면 간격을 줄여 담고 높이는 그대로 둔다. */
const RESERVE_LEVELS = 4;
const STAGE_H = TOP + RESERVE_LEVELS * LEVEL_GAP + NODE_R + CAPTION_PAD;

/** stage 가 받는 자리 모양. algorithm 의 타입을 참조하지 않는다 (원칙 1). */
export type StageNode = {
  id: string;
  key: number;
  color: 'red' | 'black';
  left: string | null;
  right: string | null;
};

type Placed = { circle: SVGCircleElement; ring: SVGCircleElement; label: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const redBlackTreeStageView: CanvasView = {
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

    /** 빨강은 두 팔레트 고정, 검정은 테마를 따라 뒤집힌다. 잉크도 그에 맞춘다. */
    const fillFor = (c: 'red' | 'black'): string => (c === 'red' ? colors.danger : colors.primary);
    const inkFor = (c: 'red' | 'black'): string => (c === 'red' ? colors.stateInk : colors.textInverse);

    function render(list: StageNode[], rootId: string | null): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      placed.clear();
      if (list.length === 0 || rootId === null) return;

      const byId = new Map(list.map((n) => [n.id, n]));
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
        // 진행 표시용 링. 채움색은 늘 그 자리의 실제 색이라 건드리지 않는다.
        const ring = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R + 4,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': 2.5,
        });
        const circle = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: fillFor(n.color),
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
          fill: inkFor(n.color),
        });
        label.style.transition = `fill ${MOVE_MS}ms ease`;
        label.textContent = String(n.key);
        nodeLayer.append(ring, circle, label);
        placed.set(n.id, { circle, ring, label });
      }
    }

    /** 진행은 링으로만 표시한다 — 채움색은 값이라 덮어쓰지 않는다. */
    function markRing(id: string, stroke: string, ms: number): void {
      const p = placed.get(id);
      if (!p) return;
      p.ring.setAttribute('stroke', stroke);
      later(() => p.ring.setAttribute('stroke', 'transparent'), ms);
    }

    return {
      setTree(list: StageNode[], rootId: string | null): void {
        if (destroyed) return;
        render(list, rootId);
      },

      compare(id: string, caption: string): void {
        if (destroyed) return;
        markRing(id, colors.accent, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      violation(id: string, caption: string): void {
        if (destroyed) return;
        markRing(id, colors.itemSwapping, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      /** 색이 바뀐 자리를 잠깐 링으로 짚는다. 색 자체는 setTree 가 다시 그린다. */
      recolored(ids: string[], caption: string): void {
        if (destroyed) return;
        for (const id of ids) markRing(id, colors.itemPivot, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      rotated(pivot: string, newRoot: string, caption: string): void {
        if (destroyed) return;
        markRing(pivot, colors.itemSwapping, MOVE_MS * 3);
        markRing(newRoot, colors.itemPivot, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      /** 문제가 위로 밀려 올라온 자리. */
      bubbled(id: string, caption: string): void {
        if (destroyed) return;
        markRing(id, colors.itemComparing, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      settle(id: string, caption: string): void {
        if (destroyed) return;
        markRing(id, colors.itemPivot, MOVE_MS * 3);
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
export type RedBlackTreeStage = {
  setTree(list: StageNode[], rootId: string | null): void;
  compare(id: string, caption: string): void;
  violation(id: string, caption: string): void;
  recolored(ids: string[], caption: string): void;
  rotated(pivot: string, newRoot: string, caption: string): void;
  bubbled(id: string, caption: string): void;
  settle(id: string, caption: string): void;
  caption(text: string): void;
};
