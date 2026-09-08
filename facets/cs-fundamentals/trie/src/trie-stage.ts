/**
 * trie-stage — 접두사 나무를 그린다.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 그 view 는 자식이 둘인 나무를 전제로
 * 좌우로 나누는데, trie 는 한 자리에서 글자 수만큼 갈라진다. 게다가 여기서
 * 자리를 잇는 선 위에는 **글자**가 얹혀야 한다 — 자리가 아니라 간선이 글자를
 * 진다는 것이 trie 의 짜임이고, 그 어휘가 빌트인에 없다 (원칙 6 의 예외 조건).
 *
 * 세로는 고정이다. `maxLength` 만큼 층을 미리 잡아 두고 넘칠 일이 없게 한다 —
 * 재생 중에 viewBox 를 다시 재면 글 안에 박혔을 때 위아래 문단이 밀린다 (S-view).
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
const SIDE = 22;
const TOP = 30;
const LEVEL_GAP = 52;
const NODE_R = 14;
const CAPTION_PAD = 28;
const MOVE_MS = 220;

/**
 * 미리 잡아 두는 층. 뿌리(0층) + 낱말 최대 길이만큼.
 *
 * `maxLength` 는 선언이 정하지만 캔버스 높이는 mount 전에 있어야 하므로 여기서
 * 못박는다. 알고리즘이 그보다 긴 낱말을 잘라 받으므로 넘칠 일이 없다.
 */
const RESERVE_DEPTH = 6;
const STAGE_H = TOP + RESERVE_DEPTH * LEVEL_GAP + NODE_R + CAPTION_PAD;

/** stage 가 받는 자리 모양. algorithm 의 타입을 참조하지 않는다 (원칙 1). */
export type StageNode = {
  id: string;
  parent: string | null;
  ch: string;
  end: boolean;
};

type Placed = { circle: SVGCircleElement; label: SVGTextElement; x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const trieStageView: CanvasView = {
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
      y: STAGE_H - 10,
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

    /**
     * 나무를 통째로 다시 그린다.
     *
     * 가로는 잎의 수로 나눈다 — 자리를 층마다 고르게 나누면 가지가 많은 쪽이
     * 눌린다. 잎을 먼저 세우고 부모를 자식들의 가운데에 놓으면 어느 가지가
     * 굵은지가 폭으로 드러난다.
     */
    function render(list: StageNode[]): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      placed.clear();
      if (list.length === 0) return;

      const byId = new Map(list.map((n) => [n.id, n]));
      const children = new Map<string, string[]>();
      for (const n of list) {
        if (n.parent === null) continue;
        const row = children.get(n.parent) ?? [];
        row.push(n.id);
        children.set(n.parent, row);
      }
      for (const row of children.values()) row.sort();

      const rootId = list.find((n) => n.parent === null)?.id ?? list[0]!.id;
      const depth = new Map<string, number>();
      const leafOrder: string[] = [];

      // 후위로 훑어 잎의 순서를 얻는다. 그 순서가 곧 가로 자리다.
      const walk = (id: string, d: number): void => {
        depth.set(id, d);
        const kids = children.get(id) ?? [];
        if (kids.length === 0) {
          leafOrder.push(id);
          return;
        }
        for (const k of kids) walk(k, d + 1);
      };
      walk(rootId, 0);

      const usable = W - SIDE * 2;
      const slot = usable / Math.max(1, leafOrder.length);
      const xOf = new Map<string, number>();
      leafOrder.forEach((id, i) => xOf.set(id, SIDE + slot * (i + 0.5)));

      // 부모는 자식들의 가운데. 깊은 쪽부터 채워 올라온다.
      const ordered = [...byId.keys()].sort(
        (a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0),
      );
      for (const id of ordered) {
        if (xOf.has(id)) continue;
        const kids = children.get(id) ?? [];
        const xs = kids.map((k) => xOf.get(k)).filter((v): v is number => v !== undefined);
        if (xs.length > 0) xOf.set(id, xs.reduce((a, b) => a + b, 0) / xs.length);
      }

      for (const n of list) {
        const x = xOf.get(n.id);
        const d = depth.get(n.id);
        if (x === undefined || d === undefined) continue;
        const y = TOP + d * LEVEL_GAP;

        if (n.parent !== null) {
          const px = xOf.get(n.parent);
          const pd = depth.get(n.parent);
          if (px !== undefined && pd !== undefined) {
            const py = TOP + pd * LEVEL_GAP;
            edgeLayer.appendChild(
              el('line', { x1: px, y1: py, x2: x, y2: y, stroke: colors.border, 'stroke-width': 1.5 }),
            );
            // **글자는 간선이 진다.** 자리가 아니라 이 선이 "이 글자를 따라
            // 내려간다" 는 뜻이라, trie 의 짜임이 여기서 드러난다.
            const chLabel = el('text', {
              x: (px + x) / 2 + 7,
              y: (py + y) / 2 + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            });
            chLabel.textContent = n.ch;
            edgeLayer.appendChild(chLabel);
          }
        }

        // 낱말이 끝나는 자리만 채워 그린다 — 길과 낱말은 다르다.
        const circle = el('circle', {
          cx: x,
          cy: y,
          r: n.parent === null ? NODE_R - 5 : NODE_R,
          fill: n.end ? colors.itemSorted : colors.itemDefault,
          stroke: colors.border,
          'stroke-width': n.end ? 2 : 1.5,
        });
        circle.style.transition = `fill ${MOVE_MS}ms ease`;
        const label = el('text', {
          x,
          y: y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: n.end ? colors.textInverse : colors.text,
        });
        label.textContent = n.parent === null ? '' : n.ch;
        nodeLayer.append(circle, label);
        placed.set(n.id, { circle, label, x, y });
      }
    }

    function flash(id: string, tile: string, ink: string, ms: number): void {
      const p = placed.get(id);
      if (!p) return;
      const wasFill = p.circle.getAttribute('fill') ?? colors.itemDefault;
      const wasInk = p.label.getAttribute('fill') ?? colors.text;
      p.circle.setAttribute('fill', tile);
      p.label.setAttribute('fill', ink);
      later(() => {
        p.circle.setAttribute('fill', wasFill);
        p.label.setAttribute('fill', wasInk);
      }, ms);
    }

    return {
      setNodes(list: StageNode[]): void {
        if (destroyed) return;
        render(list);
      },

      /** 이미 난 길을 탄다. 고정 타일 위라 잉크는 stateInk (design-tokens). */
      ride(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.itemComparing, colors.stateInk, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      grow(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.itemActive, colors.stateInk, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      miss(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.danger, colors.stateInk, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      settle(id: string, caption: string): void {
        if (destroyed) return;
        flash(id, colors.itemPivot, colors.stateInk, MOVE_MS * 3);
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
export type TrieStage = {
  setNodes(list: StageNode[]): void;
  ride(id: string, caption: string): void;
  grow(id: string, caption: string): void;
  miss(id: string, caption: string): void;
  settle(id: string, caption: string): void;
  caption(text: string): void;
};
