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
  makeTranslator,
} from '@ffacet/core/runtime';
import type { BstScene, PlantedNode } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

type TreeId = 'a' | 'b';

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
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10 의 조회는
    // 저작자 오버라이드가 얹힌 `params.t` 로).
    const t = params.t ?? makeTranslator(params.locale);

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

    /**
     * 마디 하나를 심는다.
     *
     * `grow` 가 참이면 0 에서 부풀며 가지가 뻗는다. 거짓이면 곧바로 제 크기로 선다 —
     * 되짚어 여러 마디를 한꺼번에 세울 때의 길이다.
     */
    function plant(n: PlantedNode, grow: boolean): Promise<void> {
      const x = colX(n.tree, n.value);
      const y = rowY(n.depth);
      const parent = n.parentId ? nodes.get(n.parentId) : undefined;

      const group = svgEl('g');
      const circle = svgEl('circle', {
        cx: x,
        cy: y,
        r: grow ? 0 : NODE_R,
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
        opacity: grow ? 0 : 1,
      });
      label.textContent = String(n.value);
      group.append(circle, label);
      nodesG[n.tree].appendChild(group);
      nodes.set(n.id, { group, circle, label, x, y, parentId: n.parentId });

      let line: SVGLineElement | null = null;
      if (parent) {
        line = svgEl('line', {
          x1: parent.x,
          y1: parent.y,
          x2: grow ? parent.x : x,
          y2: grow ? parent.y : y,
          stroke: colors.border,
          'stroke-width': 2,
        });
        edgesG[n.tree].appendChild(line);
        edges.set(n.id, { line, x1: parent.x, y1: parent.y });
      }

      if (!grow) return Promise.resolve();

      const finalLine = line;
      return tween(GROW_MS, (t) => {
        circle.setAttribute('r', String(NODE_R * t));
        label.setAttribute('opacity', String(t));
        if (finalLine && parent) {
          finalLine.setAttribute('x2', String(parent.x + (x - parent.x) * t));
          finalLine.setAttribute('y2', String(parent.y + (y - parent.y) * t));
        }
      });
    }

    /** 짚은 자리를 물들인다. 머무는 강조(`persist`) 가 아니면 곧 되돌아온다. */
    async function pulse(entry: NodeEntry, fill: string, ink: string, persist: boolean): Promise<void> {
      entry.circle.setAttribute('fill', fill);
      entry.label.setAttribute('fill', ink);
      if (persist) return;
      await sleep(PULSE_MS);
      entry.circle.setAttribute('fill', colors.itemDefault);
      entry.label.setAttribute('fill', colors.text);
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

    /** 논증 단계가 정하는 캡션. 걸음마다가 아니라 단계가 바뀔 때만 달라진다. */
    function captionFor(scene: BstScene): string {
      const a = scene.results.a;
      const b = scene.results.b;
      switch (scene.narrative) {
        case 'growing':
          return t('caption.growing', 'Every insertion compares first, then goes left or right.');
        case 'searching':
          return t('caption.searching', 'Both trees are built. Now look for {value} in each.', {
            value: scene.searchTarget,
          });
        case 'result':
          return t(
            'caption.result',
            'A: height {heightA}, {comparisonsA} compares. B: height {heightB}, {comparisonsB} compares — same values, different cost.',
            {
              heightA: a?.height ?? 0,
              comparisonsA: a?.comparisons ?? 0,
              heightB: b?.height ?? 0,
              comparisonsB: b?.comparisons ?? 0,
            },
          );
        default:
          return t('caption.problem', 'The same six values, inserted in two different orders.');
      }
    }

    // ── 장면 그리기 ─────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 마디를 다시 심는다. 되돌릴 명령을 따로 둘 필요가
    // 없고, 본래 projector 가 자기 안에 쥐고 있던 논증 단계와 셈이 장면 안에 있으니
    // 되짚어도 지난 걸음의 캡션이 남지 않는다.
    async function render(
      next: BstScene,
      prev: BstScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      rewind();

      // 마디를 심는다. 방금 늘어난 하나만 부풀며 서고 나머지는 곧바로 선다.
      const grewOne =
        opts.animate && prev !== null && next.nodes.length === prev.nodes.length + 1;
      const lastIndex = next.nodes.length - 1;
      let growing: Promise<void> | null = null;
      next.nodes.forEach((n, i) => {
        const p = plant(n, grewOne && i === lastIndex);
        if (grewOne && i === lastIndex) growing = p;
      });

      for (const tree of ['a', 'b'] as const) {
        const r = next.results[tree];
        if (!r) continue;
        resultText[tree].textContent = t('label.result', 'height {height} · {comparisons} compares', {
          height: r.height,
          comparisons: r.comparisons,
        });
        resultText[tree].setAttribute('opacity', '1');
      }

      // 찾던 것을 만난 자리는 머무는 강조다 — 지나가는 반짝임과 달리 장면에 남는다.
      if (next.pulse?.kind === 'match') {
        const entry = nodes.get(next.pulse.nodeId);
        if (entry) {
          entry.circle.setAttribute('fill', colors.itemPivot);
          entry.label.setAttribute('fill', colors.stateInk);
        }
      }

      setCaption(captionFor(next));

      if (!opts.animate) return;

      if (growing) await growing;

      if (next.pulse && next.pulse.kind !== 'match' && next.pulse !== prev?.pulse) {
        const entry = nodes.get(next.pulse.nodeId);
        if (entry) await pulse(entry, colors.itemComparing, colors.stateInk, false);
      }

      if (next.concluded && prev?.concluded !== true) {
        for (const tree of ['a', 'b'] as const) resultText[tree].setAttribute('fill', colors.accent);
        await sleep(PULSE_MS);
        for (const tree of ['a', 'b'] as const) {
          resultText[tree].setAttribute('fill', colors.textMuted);
        }
      }
    }

    return {
      destroy() {
        container.textContent = '';
      },
      render,
    };
  },
};
