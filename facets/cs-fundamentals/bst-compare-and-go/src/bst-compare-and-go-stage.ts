/**
 * bst-compare-and-go-stage — 이진 탐색 트리를 실제로 내려가는 조각 전용 캔버스.
 *
 * 동사 "내려간다" 를 그림으로: 커서 링이 마디에서 마디로 실제로 이동한다 (opacity
 * 전환이 아니라 좌표 이동). 버린 쪽 서브트리는 지워지지 않고 옅어져 자리에 남는다 —
 * "후보에서 빠짐" 은 색/투명도 상태이지 동사가 아니므로 색 전환으로 표현한다
 * (S-piece MUST NOT 의 예외 조건).
 *
 * 빌트인 tree-layout view 는 fold-collapse/cursor 기능이 있지만 캡션 텍스트를 자체
 * 지원하지 않는다 — 이 조각의 동사는 "비교 결과 문장이 매 걸음 바뀌는 것" 이 그림의
 * 일부라 캔버스 안에 캡션 영역을 함께 그린다 (S-facet: 빌트인이 표현 못 하는 조합에
 * 한해 전용 stage).
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `setTree()` · `moveCursor()` · `foldSide()` · `setMatched()` ·
 * `setCaption()` · `reset()` 여섯이 통째로 사라졌다.
 *
 * ── 짚어 온 길은 남는 강조다
 *
 * 이 조각의 주장이 "견주고 어느 쪽으로 내려갔는가" 이므로, **지나온 마디와 그 사이의
 * 가지**는 정적 그리기에도 들어간다. 옮기기 전에는 커서가 지금 자리 하나만 가리키고
 * 지나온 길은 아무 데도 남지 않아, 되짚으면 주장 자체가 화면에서 사라졌다.
 *
 * 그리고 **채움과 테두리를 갈라 쓴다** — 채움은 *값의 형편*(예사 / 찾았다), 테두리는
 * *견줌의 표식*(여기서 견주었다). 둘을 한 통로에 몰면 찾은 마디에서 두 뜻이 부딪힌다.
 * 후보에서 빠진 것은 셋째 통로인 *짙기와 크기*로 말한다.
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 데이터에서 온 마디의 값뿐이다. 문장인
 * 캡션은 `facet.ts` 의 `messages` 에 있고 여기서는 키와 en 원본으로 `params.t` 를
 * 부른다 (C10). 캡션이 말하는 수는 `scene.ts` 의 `compareAt` · `candidatesLeft` 에서
 * 온다 — 화면에 그려진 동그라미와 같은 출처다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  radii,
  space,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  candidatesLeft,
  compareAt,
  nodeOf,
  type BstCaption,
  type BstCompareAndGoScene,
  type BstSceneNode,
  type BstStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const SIDE_MARGIN = 48;
const TOP_Y = 40;
const LEVEL_GAP = 72;
const NODE_R = 21;
const CURSOR_R = NODE_R + 7;
const CAPTION_GAP = 18;
const CAPTION_H = 40;
const BOTTOM_PAD = 20;

/** 이 조각의 데이터는 3층(50 / 30·70 / 20·40·60·80)이다. 실제 층수는 장면이 정한다. */
const DEFAULT_LEVELS = 3;

function heightFor(levels: number): number {
  const rows = Math.max(1, levels);
  return TOP_Y + (rows - 1) * LEVEL_GAP + NODE_R + BOTTOM_PAD + CAPTION_GAP + CAPTION_H;
}

const H = heightFor(DEFAULT_LEVELS);

const MOVE_MS = 340;
const FADE_MS = 160;
const FOLD_MS = 320;
const POP_MS = 220;

/** 후보에서 빠진 마디의 짙기·크기·물러남. 끝에서는 보간값이 아니라 이 상수를 쓴다. */
const DROP_OPACITY = 0.3;
const DROP_SCALE = 0.88;
const DROP_DX = 6;
const DROP_DY = 4;
const EDGE_DIM_OPACITY = 0.25;

/** 찾은 마디가 살짝 부푼 크기. */
const MATCH_SCALE = 1.05;

/** 테두리 굵기 — 예사 / 견주어 지나온 자리. */
const STROKE_PLAIN = '2';
const STROKE_VISITED = '2.5';
const EDGE_PLAIN = '2';
const EDGE_WALKED = '3';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 캔버스에서 역산한 마디의 자리. 장면은 좌표를 모른다 (S-piece). */
type Placed = {
  node: BstSceneNode;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
  /** 부모에서 보아 어느 쪽 자식인가. 버린 가지가 물러나는 방향을 정한다. */
  side: 'L' | 'R' | null;
};

type Geometry = { at: Map<string, Placed>; levels: number };

/**
 * 나무를 캔버스에 앉힌다.
 *
 * 가로는 이진 탐색이 자리를 가르는 그대로 — 구간을 반씩 나눠 가운데에 세운다. 세로는
 * 깊이다. 그래서 자리 자체가 "왼쪽이 작고 오른쪽이 크다" 를 말한다.
 */
function layoutOf(scene: BstCompareAndGoScene): Geometry {
  const at = new Map<string, Placed>();
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  let levels = 1;

  const place = (
    id: string | null,
    lo: number,
    hi: number,
    depth: number,
    parentId: string | null,
    side: 'L' | 'R' | null,
  ): void => {
    if (id === null || at.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    const x = (lo + hi) / 2;
    at.set(id, { node, x, y: TOP_Y + depth * LEVEL_GAP, depth, parentId, side });
    levels = Math.max(levels, depth + 1);
    place(node.left, lo, x, depth + 1, id, 'L');
    place(node.right, x, hi, depth + 1, id, 'R');
  };

  place(scene.rootId, SIDE_MARGIN, W - SIDE_MARGIN, 0, null, null);
  return { at, levels };
}

/** (x, y) 를 붙박은 채 키우거나 줄이고, 그 위에 물러남을 얹는다. */
function poseAbout(p: Placed, scale: number, dx: number, dy: number): string {
  const tx = p.x * (1 - scale) + dx;
  const ty = p.y * (1 - scale) + dy;
  return `translate(${tx} ${ty}) scale(${scale})`;
}

type NodeParts = { g: SVGGElement; circle: SVGCircleElement; label: SVGTextElement };

export const bstCompareAndGoStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BstCompareAndGoScene> {
    container.textContent = '';
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;

    const wrap = document.createElement('div');
    wrap.style.background = colors.bg;
    wrap.style.border = `1px solid ${colors.border}`;
    wrap.style.borderRadius = radii.md;
    wrap.style.padding = space.sm;
    wrap.style.boxSizing = 'border-box';
    wrap.appendChild(svg);
    container.appendChild(wrap);

    /**
     * 장면마다 통째로 다시 짓는 뿌리.
     *
     * 고정 자리에 남겨 두는 요소를 하나도 두지 않는다. 남겨 두면 정적 경로가 그
     * 속성을 **매번 명시로** 쓰는지 따로 확인해야 하고, 빠뜨린 속성 하나가 되짚기
     * 판정을 가른다 (S-scene 의 "재건 밖 요소").
     */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 이 조각의 비교 걸음은 마디가 둘(커서 이동 → 찾음 부풀기)이라 `await` 를 여러 번
     * 지나고, 흐름이 끝난 뒤 장면을 다시 세우는 길도 지난다. 살아남은 앞 세대가 그
     * 길로 들어가면 새로 선 화면을 덮는다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeOutCubic(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let nodeParts = new Map<string, NodeParts>();
    let edgeByChild = new Map<string, SVGLineElement>();
    let cursor: SVGCircleElement | null = null;

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.replaceChildren();
      nodeParts = new Map<string, NodeParts>();
      edgeByChild = new Map<string, SVGLineElement>();
      cursor = null;
    }

    /**
     * 캔버스 세로도 장면이 정한다. `init()` 이 사라졌으므로 여기서 매번 다시 잰다 —
     * 옮기기 전에는 층수가 `LEVELS = 3` 상수로 박혀 있어 나무가 바뀌면 거짓이 됐다.
     *
     * 세로는 `viewBox` 로만 말한다. 러너가 캔버스를 `width:100%` + `height:auto` 로
     * 세워 두므로 실제 높이는 viewBox 의 비율에서 따라온다 (S-view).
     */
    function resize(levels: number): void {
      svg.setAttribute('viewBox', `0 0 ${W} ${heightFor(levels)}`);
    }

    /** 버린 가지가 물러나는 방향 — 가지가 갈려 나온 쪽. */
    function dropDx(geo: Geometry, id: string, dropped: Set<string>): number {
      let cur = geo.at.get(id);
      // 부모가 아직 후보로 남은 자리까지 거슬러 올라가면 그것이 갈려 나온 가지다.
      while (cur && cur.parentId !== null && dropped.has(cur.parentId)) {
        cur = geo.at.get(cur.parentId);
      }
      return cur?.side === 'L' ? -DROP_DX : DROP_DX;
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    function drawEdges(scene: BstCompareAndGoScene, geo: Geometry, dropped: Set<string>): void {
      // 걸어 내려간 가지 — 길에서 잇달아 나온 두 마디 사이만.
      const walked = new Set<string>();
      for (let i = 1; i < scene.path.length; i += 1) {
        walked.add(`${scene.path[i - 1]}>${scene.path[i]}`);
      }

      for (const [id, p] of geo.at) {
        if (p.parentId === null) continue;
        const parent = geo.at.get(p.parentId);
        if (!parent) continue;
        const gone = dropped.has(id);
        // 걸어 내려간 가지는 남는 강조다. 버린 가지는 옅게 남는다.
        const walkedHere = !gone && walked.has(`${p.parentId}>${id}`);
        const line = el('line', {
          x1: parent.x,
          y1: parent.y,
          x2: p.x,
          y2: p.y,
          stroke: walkedHere ? colors.itemComparing : colors.border,
          'stroke-width': walkedHere ? EDGE_WALKED : EDGE_PLAIN,
        });
        if (gone) line.setAttribute('opacity', String(EDGE_DIM_OPACITY));
        root.appendChild(line);
        edgeByChild.set(id, line);
      }
    }

    /**
     * 마디 하나의 옷.
     *
     * 채움은 값의 형편, 테두리는 견줌의 표식, 짙기·크기는 후보 여부. 셋을 갈라 두면
     * 찾은 마디에서 뜻이 부딪히지 않는다.
     */
    function dressNode(
      parts: NodeParts,
      p: Placed,
      scene: BstCompareAndGoScene,
      dropped: Set<string>,
      geo: Geometry,
    ): void {
      const matched = scene.matchedId === p.node.id;
      const visited = scene.path.includes(p.node.id);

      parts.circle.setAttribute('fill', matched ? colors.itemPivot : colors.itemDefault);
      parts.circle.setAttribute('stroke', visited ? colors.itemComparing : colors.border);
      parts.circle.setAttribute('stroke-width', visited ? STROKE_VISITED : STROKE_PLAIN);
      parts.label.setAttribute('fill', matched ? colors.stateInk : colors.text);

      if (dropped.has(p.node.id)) {
        parts.g.setAttribute('opacity', String(DROP_OPACITY));
        parts.g.setAttribute(
          'transform',
          poseAbout(p, DROP_SCALE, dropDx(geo, p.node.id, dropped), DROP_DY),
        );
        return;
      }
      parts.g.removeAttribute('opacity');
      if (matched) parts.g.setAttribute('transform', poseAbout(p, MATCH_SCALE, 0, 0));
      else parts.g.removeAttribute('transform');
    }

    function drawNodes(scene: BstCompareAndGoScene, geo: Geometry, dropped: Set<string>): void {
      for (const [id, p] of geo.at) {
        const g = el('g');
        const circle = el('circle', { cx: p.x, cy: p.y, r: NODE_R });
        const label = el('text', {
          x: p.x,
          y: p.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': '600',
        });
        label.textContent = String(p.node.value);
        g.append(circle, label);
        root.appendChild(g);

        const parts: NodeParts = { g, circle, label };
        nodeParts.set(id, parts);
        dressNode(parts, p, scene, dropped, geo);
      }
    }

    /** 지금 선 자리. 걸어온 길의 끝이 곧 커서다 — 따로 쥐는 상태가 아니다. */
    function drawCursor(scene: BstCompareAndGoScene, geo: Geometry): void {
      const here = scene.path.length > 0 ? scene.path[scene.path.length - 1] : null;
      if (here === null) return;
      const p = geo.at.get(here);
      if (!p) return;
      cursor = el('circle', {
        cx: p.x,
        cy: p.y,
        r: CURSOR_R,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': '3',
      });
      root.appendChild(cursor);
    }

    /** 캡션이 말하는 수는 장면에서 셈해 온다 — 화면의 동그라미와 같은 출처다. */
    function captionOf(scene: BstCompareAndGoScene, caption: BstCaption | null): string {
      if (caption === null) return '';
      switch (caption.kind) {
        case 'target':
          return t('caption.target', 'Looking for {needle}.', { needle: scene.needle });
        case 'compare': {
          const node = nodeOf(scene, caption.nodeId);
          const rel = compareAt(scene, caption.nodeId);
          if (node === null || rel === null) return '';
          const args = { needle: scene.needle, nodeValue: node.value };
          if (rel === 'lt') {
            return t('caption.compareLt', '{needle} < {nodeValue} — smaller, go left.', args);
          }
          if (rel === 'gt') {
            return t('caption.compareGt', '{needle} > {nodeValue} — bigger, go right.', args);
          }
          return t('caption.compareEq', '{needle} = {nodeValue} — found.', args);
        }
        case 'narrowed':
          return t('caption.narrowed', 'Narrowed to {n} candidates.', { n: candidatesLeft(scene) });
      }
    }

    function drawCaption(scene: BstCompareAndGoScene, levels: number): void {
      const h = heightFor(levels);
      const y = h - CAPTION_H;
      const boxH = CAPTION_H - 8;
      root.appendChild(
        el('rect', {
          x: SIDE_MARGIN / 2,
          y,
          width: W - SIDE_MARGIN,
          height: boxH,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': '1',
        }),
      );
      const text = el('text', {
        x: W / 2,
        y: y + boxH / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      text.textContent = captionOf(scene, scene.caption);
      root.appendChild(text);
    }

    function drawStatic(scene: BstCompareAndGoScene, geo: Geometry): void {
      const dropped = new Set(scene.dropped);
      drawEdges(scene, geo, dropped);
      drawNodes(scene, geo, dropped);
      drawCursor(scene, geo);
      drawCaption(scene, geo.levels);
    }

    // ── 흐르게 하기 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 흐를 때만 **출발 그림으로
    // 도로 물려 놓고** 시작하며, 그 물림은 첫 프레임이 그려지기 전에 동기로 끝난다.

    /** 커서가 지난 마디에서 이 마디로 내려간다. 찾은 자리면 그 뒤에 부푼다. */
    async function flowCompare(
      step: { nodeId: string; from: string | null },
      scene: BstCompareAndGoScene,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      const to = geo.at.get(step.nodeId);
      const ring = cursor;
      const matched = scene.matchedId === step.nodeId;
      const parts = nodeParts.get(step.nodeId);

      // 찾음의 색은 커서가 닿은 뒤에 온다. 정적 그리기는 이미 칠해 두었으므로
      // 흐르기 전에 예사 옷으로 물려 놓는다.
      if (matched && parts && to) {
        parts.circle.setAttribute('fill', colors.itemDefault);
        parts.label.setAttribute('fill', colors.text);
        parts.g.removeAttribute('transform');
      }

      if (ring && to) {
        const from = step.from === null ? null : geo.at.get(step.from) ?? null;
        if (from) {
          const dx = from.x - to.x;
          const dy = from.y - to.y;
          await animate(
            MOVE_MS,
            (p) => {
              if (p >= 1) ring.removeAttribute('transform');
              else ring.setAttribute('transform', `translate(${dx * (1 - p)} ${dy * (1 - p)})`);
            },
            live,
          );
        } else {
          await animate(
            FADE_MS,
            (p) => {
              if (p >= 1) ring.removeAttribute('opacity');
              else ring.setAttribute('opacity', String(p));
            },
            live,
          );
        }
      }

      if (!live() || !matched || !parts || !to) return;
      parts.circle.setAttribute('fill', colors.itemPivot);
      parts.label.setAttribute('fill', colors.stateInk);
      await animate(
        POP_MS,
        (p) => {
          const s = 1 + (MATCH_SCALE - 1) * p;
          parts.g.setAttribute('transform', poseAbout(to, p >= 1 ? MATCH_SCALE : s, 0, 0));
        },
        live,
      );
    }

    /** 버린 가지가 옅어지며 한 걸음 물러난다. 한 시계로 함께 움직인다. */
    function flowFold(
      ids: string[],
      scene: BstCompareAndGoScene,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      const dropped = new Set(scene.dropped);
      const items = ids
        .map((id) => ({
          parts: nodeParts.get(id),
          place: geo.at.get(id),
          edge: edgeByChild.get(id) ?? null,
          dx: dropDx(geo, id, dropped),
        }))
        .filter(
          (it): it is { parts: NodeParts; place: Placed; edge: SVGLineElement | null; dx: number } =>
            it.parts !== undefined && it.place !== undefined,
        );
      if (items.length === 0) return Promise.resolve();

      return animate(
        FOLD_MS,
        (p) => {
          const done = p >= 1;
          const opacity = done ? DROP_OPACITY : 1 + (DROP_OPACITY - 1) * p;
          const scale = done ? DROP_SCALE : 1 + (DROP_SCALE - 1) * p;
          const edgeOpacity = done ? EDGE_DIM_OPACITY : 1 + (EDGE_DIM_OPACITY - 1) * p;
          for (const it of items) {
            it.parts.g.setAttribute('opacity', String(opacity));
            it.parts.g.setAttribute(
              'transform',
              poseAbout(it.place, scale, it.dx * p, DROP_DY * p),
            );
            it.edge?.setAttribute('opacity', String(edgeOpacity));
          }
        },
        live,
      );
    }

    function flowOf(
      step: BstStep,
      scene: BstCompareAndGoScene,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      switch (step.kind) {
        case 'compare':
          return flowCompare(step, scene, geo, live);
        case 'fold':
          return flowFold(step.nodes, scene, geo, live);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 자리에 필요한 계기값을 `step` 이 싣고 오므로
     * 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: BstCompareAndGoScene,
      _prev: BstCompareAndGoScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = layoutOf(next);
      resize(geo.levels);
      rewind();
      drawStatic(next, geo);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(step, next, geo, live);
      if (!live()) return;

      // 흐르며 남은 보간 좌표 문자열·임시 옷이 통째로 사라진다. 그 사이에 타이머도
      // 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next, geo);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (wrap.parentElement) wrap.remove();
      },
    };
  },
};
