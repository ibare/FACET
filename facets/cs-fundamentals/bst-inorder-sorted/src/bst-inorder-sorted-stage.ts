/**
 * bst-inorder-sorted-stage — 트리 위 마디가 값을 아래 줄로 흘려보내는 그림.
 *
 * 빌트인 tree-layout 의 inorder-projection 은 트리 구조가 바뀔 때마다 전체 중위 줄을
 * 한 번에 다시 그리는 정적 스트립이라 (순회 진행 상태를 모른다), "한 걸음마다 하나씩
 * 흘러나와 쌓인다" 는 진행형 장면을 표현할 수 없다. 그래서 이 조각은 트리(위) +
 * 흘러나오는 줄(아래) 을 한 캔버스에 직접 그린다.
 *
 * 위: 이진 탐색 트리. 서 있는 마디는 강조색, 이미 내놓은 마디는 정렬색으로 굳는다.
 * 아래: 마디 수만큼의 빈 칸. 값이 자기 좌표에서 줄의 다음 빈 칸으로 실제로 이동해
 *       내려앉는다 — opacity 전환이 아니라 좌표가 움직인다 (S-piece).
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`standAt()` · `flowOut()` · `settle()` …) 를 두지 않는다.
 * 그 메서드들이 곧 되돌릴 수 없는 명령이었고, 특히 `flowOut()` 은 줄에 `<g>` 를
 * 덧붙이기만 해 **되짚으면 이 조각의 주장인 "쌓인 차례" 가 사라졌다.** 대신
 * `render(next, prev, { animate })` 하나가 그 장면의 화면 **전체**를 세운다 —
 * 쌓인 줄도 굳은 마디도 정적 경로가 매번 다시 그린다 (S-scene). 장면 모양은
 * `scene.ts`.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에 서
 * 있는 칸을 출발 자리(마디 위)로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 장면을
 * 통째로 다시 세운다 — 흐르며 남은 좌표 문자열 하나가 곧바로 세운 화면과의 차이가
 * 되어 되짚기 판정을 어긋나게 하기 때문이다 (프로토콜 4절).
 *
 * 색은 design-tokens 만 쓴다 (S-view). 문안은 `params.t` 로만 짓는다 (C10) — 이
 * 파일의 en 원본은 조회가 빗나갔을 때의 되받이다.
 */

import {
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  radii,
  space,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import type {
  BstInorderSortedCaption,
  BstInorderSortedScene,
  BstInorderSortedSceneNode,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

// ── 세로 배치 상수. 캔버스 높이는 이 값들에서 그대로 계산해 export 하므로
//    아래 상수를 고치면 `canvas.height` 도 같이 맞는다.
const CAPTION_H = 26;
const TREE_TOP = CAPTION_H + 14; // depth 0 마디 중심 y
const LEVEL_GAP = 54; // 층간 간격 (4층 트리 = 간격 3개)
const DEPTH_GAPS = 3;
const NODE_R = 16;
const TREE_BOTTOM = TREE_TOP + DEPTH_GAPS * LEVEL_GAP + NODE_R;
const FALL_GAP = 22; // 트리 바닥과 출력 줄 사이 여백
const OUTPUT_TOP = TREE_BOTTOM + FALL_GAP;
const OUTPUT_CELL_H = 34;
const BOTTOM_PAD = 14;
const H = OUTPUT_TOP + OUTPUT_CELL_H + BOTTOM_PAD;

const SIDE_MARGIN = 44; // 트리 좌우 여백 — 가장자리 마디 반지름이 잘리지 않을 정도
const CELL_MAX_W = 56;
const CELL_SIDE_MIN = 24;

const ANIM_MS = 380;
/** 칸이 떠오르는 데 드는 몫. 자리 이동보다 먼저 끝나 운동이 페이드로 읽히지 않는다. */
const FADE_MS = 160;

/** 배치가 정해진 마디 하나. 자리는 장면이 아니라 여기서 셈한 것이다. */
type Spot = { value: number; x: number; y: number };

type Edge = { x1: number; y1: number; x2: number; y2: number };

type Layout = { spots: Map<number, Spot>; edges: Edge[] };

/**
 * 나무의 자리를 셈한다.
 *
 * 가로는 구간을 반씩 갈라 내려가고 (왼쪽 자식은 왼쪽 반, 오른쪽 자식은 오른쪽 반),
 * 세로는 깊이가 정한다. 좌표가 장면에 없는 것은 이 셈이 캔버스 폭에서 나오기
 * 때문이다 (S-piece).
 */
function layoutTree(nodes: BstInorderSortedSceneNode[], rootValue: number): Layout {
  const byValue = new Map(nodes.map((n) => [n.value, n] as const));
  const spots = new Map<number, Spot>();
  const edges: Edge[] = [];
  const seen = new Set<number>();

  function walk(value: number | null, xMin: number, xMax: number, depth: number): Spot | null {
    if (value === null) return null;
    const node = byValue.get(value);
    // 고리가 있는 선언이 들어와도 멎는다 — 그리는 쪽이 멈춰 서면 안 된다.
    if (!node || seen.has(value)) return null;
    seen.add(value);
    const x = (xMin + xMax) / 2;
    const y = TREE_TOP + depth * LEVEL_GAP;
    const spot: Spot = { value, x, y };
    spots.set(value, spot);
    const left = walk(node.left, xMin, x, depth + 1);
    const right = walk(node.right, x, xMax, depth + 1);
    if (left) edges.push({ x1: x, y1: y, x2: left.x, y2: left.y });
    if (right) edges.push({ x1: x, y1: y, x2: right.x, y2: right.y });
    return spot;
  }

  walk(rootValue, SIDE_MARGIN, W - SIDE_MARGIN, 0);
  return { spots, edges };
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export type BstInorderSortedStage = ViewInstance & SceneRenderer<BstInorderSortedScene>;

export const bstInorderSortedStageView: CanvasView = {
  canvas: { height: H },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): BstInorderSortedStage {
    container.textContent = '';
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const root = document.createElement('div');
    root.className = 'facet-bst-inorder-sorted';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const svg = params.canvas;
    const captionG = document.createElementNS(SVG_NS, 'g');
    const edgesG = document.createElementNS(SVG_NS, 'g');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    const slotsG = document.createElementNS(SVG_NS, 'g');
    const tilesG = document.createElementNS(SVG_NS, 'g');
    svg.append(captionG, edgesG, nodesG, slotsG, tilesG);
    root.appendChild(svg);
    container.appendChild(root);

    // 캡션은 재건 밖의 요소다. 정적 경로가 **매번 명시로** 문안을 쓴다 — 쓰지 않으면
    // 앞 걸음의 문장이 남아 되짚기 판정에서 어긋난다 (프로토콜 4절).
    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('x', String(W / 2));
    captionText.setAttribute('y', String(16));
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('fill', colors.textMuted);
    captionText.setAttribute('font-size', fontSizes.sm);
    captionText.setAttribute('font-family', fonts.body);
    captionG.appendChild(captionText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 흐르는 칸은 정적 그리기가 매번 새로 만들지만, 걸음 함수가 그것을 잡아 두는
     * **클로저 변수**는 새로 만들어지지 않는다. 되짚기가 가운데 끼어들면 앞 세대의
     * 프레임이 깨어나 이미 새로 선 화면에 옛 좌표를 쓴다. 걸음 함수는 깨어날 때마다
     * 자기 세대가 유효한지 보고 아니면 **화면에 손대지 않고** 물러난다 (S-scene).
     */
    let gen = 0;

    function alive(myGen: number): boolean {
      return !destroyed && myGen === gen;
    }

    /** t=0..1 프레임마다 그리는 rAF 트윈. 첫 프레임은 동기로 그린다. */
    function tween(myGen: number, ms: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || typeof requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          if (!alive(myGen)) {
            finish();
            return;
          }
          const raw = clamp01((Date.now() - start) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        // 정적 그리기가 이미 끝 자리에 세워 두었으므로 출발 자리로 물리는 것을
        // 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        draw(0);
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function clear(g: Element): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    // ── 줄의 자리. 마디 수에서 역산한다. 상수로는 상한만 둔다 (S-piece).
    function cellWidth(count: number): number {
      return Math.min(CELL_MAX_W, Math.floor((W - CELL_SIDE_MIN * 2) / Math.max(1, count)));
    }

    function rowOriginX(count: number): number {
      return Math.round((W - cellWidth(count) * count) / 2);
    }

    function slotCenterX(index: number, count: number): number {
      return rowOriginX(count) + index * cellWidth(count) + cellWidth(count) / 2;
    }

    const slotCenterY = OUTPUT_TOP + OUTPUT_CELL_H / 2;

    // ── 문안 ──────────────────────────────────────────────────────────
    //
    // en 원본은 호출부 리터럴로 남아야 추출기가 본다 (C10). 그래서 키를 그대로
    // 넘기지 않고 갈래마다 한 줄씩 편다. 수는 payload 가 아니라 **장면의 줄 길이**
    // 에서 센다 — 같은 수를 두 자리에서 세지 않는다.
    function captionOf(scene: BstInorderSortedScene): string {
      const caption: BstInorderSortedCaption | null = scene.caption;
      if (!caption) return '';
      switch (caption.kind) {
        case 'stand':
          return t('caption.stand', '{value} stands — empty the left first.', {
            value: caption.value,
          });
        case 'output':
          return t('caption.output', '{value} flows out — {n} placed so far.', {
            value: caption.value,
            n: scene.out.length,
          });
        case 'done':
          return t('caption.done', 'All {n} are out, low to high.', { n: scene.nodes.length });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령이 필요 없고,
    // 흐르며 남은 속성이 다음 화면으로 새지 않는다.

    /** 이번에 세운 배치. 흐르는 걸음이 출발 자리를 여기서 찾는다. */
    let layout: Layout = { spots: new Map(), edges: [] };
    /** 방금 앉은 칸. 정적 그리기가 매번 새로 만들고 걸음 함수가 물렸다 되돌린다. */
    let lastTile: SVGGElement | null = null;

    /**
     * 마디 하나의 칠.
     *
     * 타일마다 잉크가 다르다 (design-tokens 의 결정표).
     *   itemActive  두 팔레트에서 고정   → stateInk
     *   itemSorted  테마를 따라 뒤집힘   → textInverse
     *   itemDefault 배경과 값이 같다     → text. 여기에 textInverse 를 쓰면 흰 바탕에
     *               흰 글자, 검은 바탕에 검은 글자가 되어 아직 서지 않은 마디의
     *               라벨이 사라진다.
     */
    function inkFor(standing: boolean, settled: boolean): { fill: string; ink: string } {
      if (standing) return { fill: colors.itemActive, ink: colors.stateInk };
      if (settled) return { fill: colors.itemSorted, ink: colors.textInverse };
      return { fill: colors.itemDefault, ink: colors.text };
    }

    function drawTree(scene: BstInorderSortedScene): void {
      clear(edgesG);
      clear(nodesG);
      layout = layoutTree(scene.nodes, scene.rootValue);

      for (const e of layout.edges) {
        el(edgesG, 'line', {
          x1: e.x1,
          y1: e.y1,
          x2: e.x2,
          y2: e.y2,
          stroke: colors.border,
          'stroke-width': 2,
        });
      }

      const standing = new Set(scene.standing);
      const settled = new Set(scene.settled);
      for (const spot of layout.spots.values()) {
        const paint = inkFor(standing.has(spot.value), settled.has(spot.value));
        const g = el(nodesG, 'g', {});
        el(g, 'circle', {
          cx: spot.x,
          cy: spot.y,
          r: NODE_R,
          fill: paint.fill,
          stroke: colors.bg,
          'stroke-width': 2,
        });
        const label = el(g, 'text', {
          x: spot.x,
          y: spot.y + 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.sm,
          'font-weight': '600',
          'font-family': fonts.mono,
          fill: paint.ink,
        });
        label.textContent = String(spot.value);
      }
    }

    function drawSlots(count: number): void {
      clear(slotsG);
      const cellW = cellWidth(count);
      const originX = rowOriginX(count);
      el(slotsG, 'rect', {
        x: originX - 4,
        y: OUTPUT_TOP - 4,
        width: cellW * count + 8,
        height: OUTPUT_CELL_H + 8,
        rx: radii.md,
        fill: colors.bgSubtle,
      });
      for (let i = 0; i < count; i += 1) {
        el(slotsG, 'rect', {
          x: originX + i * cellW + 3,
          y: OUTPUT_TOP + 3,
          width: cellW - 6,
          height: OUTPUT_CELL_H - 6,
          rx: radii.sm,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
      }
    }

    /**
     * 흘러나온 값들의 줄. **이 조각의 주장이라 정적으로 다시 세운다** — 덧붙이기만
     * 하면 되짚었을 때 쌓인 차례가 사라진다.
     */
    function drawOut(scene: BstInorderSortedScene): void {
      clear(tilesG);
      lastTile = null;
      const count = Math.max(1, scene.nodes.length);
      const cellW = cellWidth(count);
      scene.out.forEach((value, index) => {
        const cx = slotCenterX(index, count);
        const g = el(tilesG, 'g', {});
        el(g, 'rect', {
          x: cx - cellW / 2 + 4,
          y: slotCenterY - (OUTPUT_CELL_H - 6) / 2,
          width: cellW - 8,
          height: OUTPUT_CELL_H - 6,
          rx: radii.sm,
          fill: colors.itemSorted,
        });
        const text = el(g, 'text', {
          x: cx,
          y: slotCenterY + 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.sm,
          'font-weight': '600',
          'font-family': fonts.mono,
          // itemSorted 는 테마를 따라 뒤집히므로 textInverse.
          fill: colors.textInverse,
        });
        text.textContent = String(value);
        if (index === scene.out.length - 1) lastTile = g;
      });
    }

    /** 장면 하나를 통째로 세운다 — 나무도 칸도 줄도 캡션도. */
    function settle(scene: BstInorderSortedScene): void {
      drawTree(scene);
      drawSlots(Math.max(1, scene.nodes.length));
      drawOut(scene);
      captionText.textContent = captionOf(scene);
    }

    // ── 운동 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 칸은 이미 제자리에 앉아 있다. 그러니 운동은 마디 위로
    // **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `settle` 직후 아직 어떤 기다림도
    // 지나지 않은 동안 하므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /** 마디의 값이 자기 자리에서 줄의 다음 빈 칸으로 내려앉는다. */
    async function runFlow(
      scene: BstInorderSortedScene,
      value: number,
      myGen: number,
    ): Promise<void> {
      const tile = lastTile;
      const src = layout.spots.get(value);
      if (!tile || !src) return;
      // 방금 앉은 값은 언제나 줄의 마지막이다 — 칸 번호를 따로 세지 않는다.
      const index = scene.out.length - 1;
      if (index < 0) return;
      const cx = slotCenterX(index, Math.max(1, scene.nodes.length));
      const dx = src.x - cx;
      const dy = src.y - slotCenterY;

      await tween(myGen, ANIM_MS, (raw) => {
        const e = easeOutCubic(raw);
        // 아직 못 온 만큼을 뒤로 물린다 — 끝(e === 1)에서 정확히 0 이 되게 쓴다.
        tile.setAttribute(
          'transform',
          `translate(${(dx * (1 - e)).toFixed(2)} ${(dy * (1 - e)).toFixed(2)})`,
        );
        tile.setAttribute('opacity', String(clamp01((raw * ANIM_MS) / FADE_MS)));
      });
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 `transform` 과
     * `opacity` 가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게 하기
     * 때문이다. 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질 뿐이다.
     *
     * 돌려주는 Promise 는 장면이 다 선 뒤에 풀린다 — 이것이 바깥이 걸음의 끝을 아는
     * 유일한 통로다 (S-scene).
     */
    async function render(
      next: BstInorderSortedScene,
      /** 흐르게 할 것을 장면의 `step` 이 말하므로 앞 장면을 들추지 않는다. */
      _prev: BstInorderSortedScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      if (next.step?.kind === 'flow') await runFlow(next, next.step.value, myGen);
      if (alive(myGen)) settle(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        // 기다리던 것을 깨운다 — 깨우지 않으면 걸음이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentElement) root.remove();
      },
    };
  },
};
