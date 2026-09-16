/**
 * node-holds-many-stage — 다분기 노드 하나가 키를 여럿 품고, 커서가 그 안을
 * 훑다가 틈을 골라 내려가는 그림.
 *
 * 빌트인 `tree-layout` 은 노드 하나에 라벨 하나만 얹으므로 "한 자리에 여럿을
 * 담는다" 는 이 조각의 동사를 표현할 수 없다 — 자리 하나를 키 칸 여럿으로
 * 나누고, 그 칸을 가로로 훑고, 칸 사이 틈에서 세로로 내려가는 커서 이동이
 * 이 그림의 본체다 (S-facet: 빌트인 어휘로 표현 불가능한 경우에만 stage 를 둔다).
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `init()` · `sweepKey()` · `descend()` · `markFound()` · `settle()` ·
 * `rewind()` 여섯이 사라졌다.
 *
 * ── 짚어 본 칸과 밟고 내려온 틈은 남는 강조다
 *
 * 옮기기 전에는 `sweepKey` 가 다음 칸을 물들이기 전에 **앞 칸의 물을 뺐다.** 그래서
 * "이 자리에서 몇 칸을 짚어 골랐나" 가 매 걸음 지워졌고, 그것이 곧 이 조각의 주장인데
 * 화면에는 한 칸만 남았다 (`open-addressing-probe` 와 같은 자리다). 이제 짚어 본 칸은
 * **테두리**로 남고 지금 짚는 칸만 **채움**으로 물든다 — 채움은 값의 형편, 테두리는
 * 견줌의 표식이다. 밟고 내려온 틈도 마찬가지로 정적 그리기에 들어간다.
 *
 * ── 화면에 나란히 뜨는 수는 한 출처에서 나온다
 *
 * 칸에 적히는 숫자, 캡션의 부등호와 그 양옆의 두 수, 그리고 위에 뜨는 집계
 * (`키 9개, 자리 4개`) 가 전부 `scene.ts` 의 `keyAt` · `compareAt` · `tallyOf` 를
 * 지난다. 이 파일은 수를 스스로 세지 않고 payload 에서도 받지 않는다. 틈의 개수도
 * 마찬가지다 — `node.children` 의 길이가 이미 `keys.length + 1` 로 맞춰져 있어
 * (`normalizeChildren`) 그리면서 다시 세지 않는다.
 *
 * 그림은 두 층이다 — 뿌리 한 줄과 그 자식 한 줄. 이 조각의 나무가 두 층이라
 * 그렇고, "한 자리가 갈림길 여럿을 품는다" 를 보이는 데 그 이상이 필요하지 않다.
 */

import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  radii,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';

import {
  captionOf,
  lastSweptIn,
  nodeOf,
  tallyOf,
  type NodeHoldsManyCaption,
  type NodeHoldsManyCursor,
  type NodeHoldsManyScene,
  type NodeHoldsManySceneNode,
  type NodeHoldsManyStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const CELL_MAX_W = 72;
const CELL_H = 40;
/**
 * 상자와 키 칸 사이의 물림. **네 변에 고르게** 준다.
 *
 * 가로에만 주고 세로를 0 으로 두면 키 칸이 상자 테두리를 그대로 덮는다 —
 * 각진 칸 모서리가 둥근 상자 모서리를 자르고, 칸의 선과 상자의 선이 같은
 * 자리에 겹쳐 두께가 어긋나 보인다.
 */
const NODE_PAD = 10;
/** 상자의 높이. 키 칸이 위아래로도 NODE_PAD 만큼 안에 들어앉는다. */
const NODE_H = CELL_H + NODE_PAD * 2;
const SIDE_MIN = 24;
const INTER_NODE_GAP = 20;
const TOP_PAD = 48;
const ROOT_Y = TOP_PAD;
const ROW_GAP = 64;
const CHILDREN_Y = ROOT_Y + NODE_H + ROW_GAP;
const CAPTION_PAD = 30;
const CAPTION_Y = CHILDREN_Y + NODE_H + CAPTION_PAD;
const BOTTOM_PAD = 14;
export const STAGE_H = CAPTION_Y + BOTTOM_PAD;

const CURSOR_OFFSET = 12;
const GAP_DROP = 16;
const MOVE_MS = 260;
const DESCEND_MS = 220;

type Rect = { x: number; y: number; w: number };
type Point = { x: number; y: number };

/** 캔버스에서 역산한 배치. 장면은 좌표를 모른다 (S-piece). */
type Geometry = {
  cellW: number;
  /** 그려지는 자리들의 상자. 뿌리와 그 자식들만 그린다. */
  rects: Map<string, Rect>;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node as SVGElementTagNameMap[K];
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function cellCenterX(rect: Rect, keyIndex: number, cellW: number): number {
  return rect.x + NODE_PAD + keyIndex * cellW + cellW / 2;
}

function gapX(rect: Rect, gapIndex: number, cellW: number): number {
  return rect.x + NODE_PAD + gapIndex * cellW;
}

/**
 * 나무를 캔버스에 앉힌다.
 *
 * **그 폭을 채운다** (S-piece). 칸 폭은 상수로 못박지 않고 아랫줄에 늘어설 칸의
 * 총수에서 역산하며, 상수는 상한으로만 둔다.
 *
 * 자리를 먼저 한 번에 셈하고 그 다음에 그린다 — 그리면서 이웃의 지금 좌표를 읽으면
 * 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
 */
function layoutOf(scene: NodeHoldsManyScene): Geometry {
  const rects = new Map<string, Rect>();
  const root = nodeOf(scene, scene.rootId) ?? scene.nodes[0];
  if (!root) return { cellW: CELL_MAX_W, rects };

  // 틈의 차례를 지켜 실제로 길이 난 자식만 고른다.
  const childIds = root.children.filter((id): id is string => id !== null);
  const childNodes = childIds
    .map((id) => nodeOf(scene, id))
    .filter((n): n is NodeHoldsManySceneNode => n !== null);

  const totalCells = childNodes.reduce((sum, n) => sum + n.keys.length, 0);
  const totalPad = childNodes.length * NODE_PAD * 2;
  const totalGap = Math.max(0, childNodes.length - 1) * INTER_NODE_GAP;
  const available = W - SIDE_MIN * 2 - totalPad - totalGap;
  const cellW = Math.max(
    24,
    Math.min(CELL_MAX_W, totalCells > 0 ? Math.floor(available / totalCells) : CELL_MAX_W),
  );

  const widths = childNodes.map((n) => n.keys.length * cellW + NODE_PAD * 2);
  const totalChildrenW = widths.reduce((a, b) => a + b, 0) + totalGap;
  let cx = Math.round((W - totalChildrenW) / 2);
  childNodes.forEach((n, i) => {
    rects.set(n.id, { x: cx, y: CHILDREN_Y, w: widths[i] });
    cx += widths[i] + INTER_NODE_GAP;
  });

  const rootW = root.keys.length * cellW + NODE_PAD * 2;
  rects.set(root.id, { x: Math.round((W - rootW) / 2), y: ROOT_Y, w: rootW });

  return { cellW, rects };
}

/** 커서가 선 자리를 캔버스 좌표로 옮긴다. */
function pointOf(cursor: NodeHoldsManyCursor, geo: Geometry): Point | null {
  const rect = geo.rects.get(cursor.nodeId);
  if (!rect) return null;
  if (cursor.at === 'gap') {
    return { x: gapX(rect, cursor.gapIndex, geo.cellW), y: rect.y + NODE_H + GAP_DROP };
  }
  const keyIndex = cursor.at === 'key' ? cursor.keyIndex : 0;
  return { x: cellCenterX(rect, keyIndex, geo.cellW), y: rect.y - CURSOR_OFFSET };
}

export const nodeHoldsManyStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<NodeHoldsManyScene> {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    const svg = params.canvas;
    svg.textContent = '';

    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    svg.style.fontFamily = fonts.body;

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
     * 내려가는 걸음은 마디가 둘(틈까지 내려가기 → 자식 머리로 건너가기)이라 `await`
     * 를 여러 번 지난다. 살아남은 앞 세대가 뒷마디까지 가면 새로 선 화면을 덮는다.
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
          draw(easeInOut(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let cursorEl: SVGGElement | null = null;
    let edgeEls = new Map<string, SVGLineElement>();

    function edgeKey(nodeId: string, gapIndex: number): string {
      return `${nodeId}#${gapIndex}`;
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.replaceChildren();
      cursorEl = null;
      edgeEls = new Map<string, SVGLineElement>();
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    /** 위 두 줄 — 찾는 값과 집계. 두 수 다 `tallyOf` 가 목록 길이에서 낸다. */
    function drawHeader(scene: NodeHoldsManyScene): void {
      const targetLabel = el('text', {
        x: W / 2,
        y: 18,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      targetLabel.textContent = t('label.target', 'target {value}', {
        value: String(scene.target),
      });

      const tally = tallyOf(scene);
      const statLabel = el('text', {
        x: W / 2,
        y: 34,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      statLabel.textContent = t('stat.keysInNodes', '{keys} keys in {nodes} nodes', {
        keys: tally.keys,
        nodes: tally.nodes,
      });

      root.append(targetLabel, statLabel);
    }

    /**
     * 뿌리의 틈마다 난 길.
     *
     * 틈의 차례가 곧 `children` 의 차례다. 밟고 내려온 길은 **남는 표식**이라 정적
     * 그리기에 들어간다.
     */
    function drawEdges(scene: NodeHoldsManyScene, geo: Geometry): void {
      const layer = el('g');
      root.appendChild(layer);
      const rootNode = nodeOf(scene, scene.rootId);
      const rootRect = rootNode ? geo.rects.get(rootNode.id) : undefined;
      if (!rootNode || !rootRect) return;

      rootNode.children.forEach((childId, gapIndex) => {
        if (childId === null) return;
        const childRect = geo.rects.get(childId);
        if (!childRect) return;
        const taken = scene.taken.some(
          (g) => g.nodeId === rootNode.id && g.gapIndex === gapIndex,
        );
        const edge = el('line', {
          x1: gapX(rootRect, gapIndex, geo.cellW),
          y1: rootRect.y + NODE_H,
          x2: childRect.x + childRect.w / 2,
          y2: childRect.y,
          stroke: taken ? colors.itemSorted : colors.border,
          'stroke-width': taken ? 2.5 : 1.5,
        });
        layer.appendChild(edge);
        edgeEls.set(edgeKey(rootNode.id, gapIndex), edge);
      });
    }

    /**
     * 자리와 그 안의 칸들.
     *
     * 상자 테두리는 **어디를 지나왔나**(들어선 차례), 칸의 채움은 **지금 무엇을 보고
     * 있나**, 칸의 테두리는 **짚어 본 적 있나**. 셋을 갈라 두면 서로 부딪히지 않는다.
     */
    function drawNodes(scene: NodeHoldsManyScene, geo: Geometry): void {
      const layer = el('g');
      root.appendChild(layer);
      const here = scene.path.length > 0 ? scene.path[scene.path.length - 1] : null;
      const cursor = scene.cursor;

      for (const node of scene.nodes) {
        const rect = geo.rects.get(node.id);
        if (!rect) continue;

        const entered = scene.path.includes(node.id);
        const frameStroke =
          node.id === here ? colors.itemActive : entered ? colors.itemSorted : colors.border;
        layer.appendChild(
          el('rect', {
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: NODE_H,
            rx: radii.md,
            fill: 'none',
            stroke: frameStroke,
            'stroke-width': entered ? 2.5 : 1.5,
          }),
        );

        node.keys.forEach((key, i) => {
          const isFound = scene.found?.nodeId === node.id && scene.found.keyIndex === i;
          const isHere = cursor?.at === 'key' && cursor.nodeId === node.id && cursor.keyIndex === i;
          const isSwept = scene.swept.some((c) => c.nodeId === node.id && c.keyIndex === i);

          const fill = isFound
            ? colors.itemPivot
            : isHere
              ? colors.itemComparing
              : colors.itemDefault;
          const ink = isFound || isHere ? colors.stateInk : colors.text;

          layer.appendChild(
            el('rect', {
              x: rect.x + NODE_PAD + i * geo.cellW,
              y: rect.y + NODE_PAD,
              width: geo.cellW,
              height: CELL_H,
              fill,
              stroke: isSwept ? colors.itemActive : colors.border,
              'stroke-width': isSwept ? 2 : 1,
            }),
          );

          const text = el('text', {
            x: cellCenterX(rect, i, geo.cellW),
            y: rect.y + NODE_PAD + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            'font-size': fontSizes.md,
            'font-family': fonts.mono,
            fill: ink,
          });
          // 칸에 적히는 수는 `node.keys` 에서 그대로 온다. 캡션의 부등호 양옆도
          // `keyAt` 을 지나 같은 배열을 읽으므로 두 수가 갈릴 자리가 없다.
          text.textContent = String(key);
          layer.appendChild(text);
        });
      }
    }

    /** 내려가는 삼각 마커. 커서가 아직 서지 않은 장면에서는 아예 짓지 않는다. */
    function drawCursor(scene: NodeHoldsManyScene, geo: Geometry): void {
      if (scene.cursor === null) return;
      const at = pointOf(scene.cursor, geo);
      if (at === null) return;
      const g = el('g', { transform: `translate(${at.x} ${at.y})` });
      g.appendChild(el('path', { d: 'M -7 -9 L 7 -9 L 0 0 Z', fill: colors.risingMarker }));
      root.appendChild(g);
      cursorEl = g;
    }

    /** 문안은 여기서 만든다. 장면은 무엇을 말할지와 그 인자만 안다 (S-scene · C10). */
    function textOf(caption: NodeHoldsManyCaption): string {
      switch (caption.kind) {
        case 'sweep': {
          const vars = { target: String(caption.target), key: String(caption.key) };
          if (caption.cmp === 'gt') return t('caption.sweepGt', '{target} > {key} → next key', vars);
          if (caption.cmp === 'lt') {
            return t('caption.sweepLt', '{target} < {key} → into the gap before it', vars);
          }
          return t('caption.sweepEq', '{target} = {key}', vars);
        }
        case 'descend':
          return t('caption.descend', 'goes down one level');
        case 'found':
          return t('caption.found', '{target} found', { target: String(caption.target) });
      }
    }

    function drawCaption(scene: NodeHoldsManyScene): void {
      const caption = captionOf(scene);
      const node = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      node.textContent = caption === null ? '' : textOf(caption);
      root.appendChild(node);
    }

    function drawStatic(scene: NodeHoldsManyScene, geo: Geometry): void {
      drawHeader(scene);
      drawEdges(scene, geo);
      drawNodes(scene, geo);
      drawCursor(scene, geo);
      drawCaption(scene);
    }

    // ── 흐르게 하기 ─────────────────────────────────────────────────────────

    function placeCursor(at: Point): void {
      cursorEl?.setAttribute('transform', `translate(${at.x} ${at.y})`);
    }

    /**
     * 커서를 한 자리에서 다른 자리로 민다.
     *
     * 정적 그리기가 이미 커서를 **끝 자리**에 세워 두었으므로, 운동은 아직 못 온
     * 만큼을 뒤로 물리는 꼴이 된다. `animate` 가 첫 프레임을 곧바로 그리므로 출발
     * 자리가 화면에 박히기 전에 물림이 들어간다 (프로토콜 3-4).
     */
    function glide(from: Point, to: Point, ms: number, live: () => boolean): Promise<void> {
      return animate(
        ms,
        (p) => placeCursor({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }),
        live,
      );
    }

    /**
     * 자리 안에서 다음 칸으로 넘어가는 걸음.
     *
     * 첫 칸이면 커서가 이미 그 자리 머리에 서 있어 움직일 것이 없다 — 자리에 막
     * 들어섰을 때의 커서 자리가 곧 0 번 칸의 자리이기 때문이다.
     */
    function flowSweep(
      step: Extract<NodeHoldsManyStep, { kind: 'sweep' }>,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      // 첫 칸은 앞 칸이 아니라 **자리 머리**에서 미끄러진다. 여기서 그냥 물러나면
      // 그 걸음만 흐를 것이 없어 벽시계가 `stepMs` 로 줄고, 띠를 끌 때 앞뒤 걸음과
      // 구별되지 않는다 (S-piece 의 얇은 걸음 잣대).
      const from =
        step.keyIndex <= 0
          ? pointOf({ at: 'entry', nodeId: step.nodeId }, geo)
          : pointOf({ at: 'key', nodeId: step.nodeId, keyIndex: step.keyIndex - 1 }, geo);
      const to = pointOf({ at: 'key', nodeId: step.nodeId, keyIndex: step.keyIndex }, geo);
      if (from === null || to === null) return Promise.resolve();
      return glide(from, to, MOVE_MS, live);
    }

    /**
     * 틈을 골라 한 층 내려가는 걸음. 마디가 둘이다 — 틈까지 내려갔다가 자식 머리로
     * 건너간다. 두 마디가 이어지는 한 운동이라 시계를 나누지 않고 차례로 돈다.
     *
     * 출발 자리는 `prev` 가 아니라 **장면이 쥔 자취**에서 복원한다 — 그 자리에서
     * 마지막으로 짚은 칸이 곧 커서가 서 있던 곳이다 (S-scene).
     */
    async function flowDescend(
      step: Extract<NodeHoldsManyStep, { kind: 'descend' }>,
      scene: NodeHoldsManyScene,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      const lastKey = lastSweptIn(scene, step.nodeId);
      const from =
        lastKey === null
          ? pointOf({ at: 'entry', nodeId: step.nodeId }, geo)
          : pointOf({ at: 'key', nodeId: step.nodeId, keyIndex: lastKey }, geo);
      const gapPoint = pointOf({ at: 'gap', nodeId: step.nodeId, gapIndex: step.gapIndex }, geo);
      if (from === null || gapPoint === null) return;

      // 밟는 길이 눈에 띄게 한다. 운동이 끝나면 장면을 통째로 다시 세우므로
      // 이 칠을 손으로 되돌릴 목록을 만들 필요가 없다 (프로토콜 4 절).
      const edge = edgeEls.get(edgeKey(step.nodeId, step.gapIndex));
      edge?.setAttribute('stroke', colors.itemActive);

      await glide(from, gapPoint, DESCEND_MS, live);
      if (!live()) return;

      // 길이 비어 있으면 커서는 틈에서 멎는다.
      if (scene.cursor === null || scene.cursor.at !== 'entry') return;
      const entry = pointOf(scene.cursor, geo);
      if (entry === null) return;
      await glide(gapPoint, entry, MOVE_MS, live);
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 커서의 출발 자리를 `step` 과 `swept` 에서 셈해
     * 복원하므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: NodeHoldsManyScene,
      _prev: NodeHoldsManyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = layoutOf(next);
      rewind();
      drawStatic(next, geo);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      if (step.kind === 'sweep') await flowSweep(step, geo, live);
      else if (step.kind === 'descend') await flowDescend(step, next, geo, live);
      // 'mark' 는 커서가 움직이지 않는다 — 짚고 있던 칸이 그대로 종결 상태가 된다.
      if (!live()) return;

      // 흐르며 남은 보간 좌표 문자열·임시 칠이 통째로 사라진다. 그 사이에 타이머도
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
        svg.textContent = '';
      },
    };
  },
};
