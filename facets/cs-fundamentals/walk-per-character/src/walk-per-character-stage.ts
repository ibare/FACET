/**
 * walk-per-character-stage — 트라이를 그리고, 커서가 글자를 따라 실제로 한
 * 칸씩 내려가는 모습을 보여주는 전용 캔버스.
 *
 * 빌트인 `tree-layout` 의 `cursor` 기능은 노드 둘레에 링을 즉시 켜고 끌 뿐
 * 이동하지 않는다(오퍼시티 전환) — 이 조각의 동사 "내려간다" 에는 맞지 않아
 * 새로 그린다(S-piece).
 *
 * 노드 id 규칙: 뿌리는 `'root'`, 그 외는 뿌리부터의 접두사 문자열
 * (`facets/cs-fundamentals/walk-per-character/src/algorithm.ts` 와 동일 규칙,
 * 다만 이 파일은 그 파일을 import 하지 않고 `words` 로부터 동형으로 다시
 * 계산한다 — View 는 Algorithm 을 참조하지 않는다, 원칙 1).
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `init()` · `beginSearch()` · `stepDown()` · `finish()` 넷이
 * 통째로 사라졌고, 그와 함께 `resetVisuals()` 도 없어졌다 — 지울 것을 지우는
 * 대신 늘 비우고 목표 장면을 통째로 세우기 때문이다.
 *
 * `init()` 이 사라져 **캔버스 세로도 정적 그리기가 매번 다시 정한다.** 트라이의
 * 깊이가 viewBox 를 정하는데, 그것을 mount 때 한 번만 재면 되짚어 세운 첫 그림이
 * 기본 높이로 눌린다.
 *
 * **걸어온 자취는 남는 강조다.** 이 조각의 주장이 "몇 글자를 걸어 어디까지
 * 왔나" 이므로, 지나온 노드의 칠과 가지의 칠은 정적 그리기에 들어간다. 그리고
 * 캡션 옆의 수는 **그 자취의 길이**에서 낸다 — 걸음이 실어 온 수를 따로 쓰면
 * 화면에 나란히 뜨는 두 값이 언젠가 갈린다.
 *
 * 운동의 방향이 뒤집혀 있다. 정적 그리기가 정본이라 커서는 이미 닿을 자리에 서
 * 있고, 흐르게 할 때만 **떠나온 자리로 도로 물려 놓고** 시작한다. 운동이 끝나면
 * 장면을 통째로 다시 세워, 흐른 화면과 곧바로 세운 화면이 속성 하나만큼도
 * 갈리지 않게 한다.
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 데이터에서 온 글자와 자취의 길이뿐이다.
 * 문장인 캡션은 `facet.ts` 의 `messages` 에 있고 여기서는 키와 en 원본으로
 * `params.t` 를 부른다 (C10).
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  type Palette,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  WALK_ROOT_ID,
  walkCursorOf,
  type WalkPerCharacterScene,
  type WalkCaption,
  type WalkStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const NODE_R = 20;
const RING_R = NODE_R + 6;
const ROW_GAP = 78;
const TOP_PAD = 30;
const SIDE_MARGIN = 34;
const CAPTION_AREA_H = 72;

/** 커서가 가지를 타고 미끄러지는 시간. 이 조각의 동사가 서는 자리다. */
const MOVE_MS = 320;
/**
 * 짚기만 하는 두 걸음의 시간.
 *
 * 새 찾기(커서가 뿌리로 돌아감)와 답이 나는 자리는 원래 흐를 것이 없어 걸음
 * 벽시계가 `stepMs`(580ms) 그대로였다 — S-piece 의 얇은 걸음 잣대(800ms) 아래다.
 * 질의가 셋이라 그 걸음이 여섯 번 든다. `stepMs` 를 올리는 대신 그 걸음에만 얇은
 * 운동을 주어 벽시계를 올린다.
 */
const BEGIN_MS = 240;
const SETTLE_MS = 260;
/** 커서 링이 내려앉기 전에 벌어져 있는 반지름. */
const BEGIN_OPEN = 10;
/** 답이 난 자리가 한 번 부푸는 정도. 그 걸음의 말이 "여기다" 라 또렷이 짚는다. */
const ANSWER_SCALE = 0.18;

/** 배치를 재기 전, 아직 아무 말도 없을 때의 캔버스 세로. */
const FALLBACK_H = 360;

type ShapeNode = {
  id: string;
  letter: string | null;
  isEnd: boolean;
  children: ShapeNode[];
};

function buildShape(words: string[]): ShapeNode {
  const root: ShapeNode = { id: WALK_ROOT_ID, letter: null, isEnd: false, children: [] };
  const byId = new Map<string, ShapeNode>([[WALK_ROOT_ID, root]]);
  for (const word of words) {
    let node = root;
    let prefix = '';
    for (const ch of word) {
      prefix += ch;
      let child = byId.get(prefix);
      if (!child) {
        child = { id: prefix, letter: ch, isEnd: false, children: [] };
        byId.set(prefix, child);
        node.children.push(child);
      }
      node = child;
    }
    node.isEnd = true;
  }
  (function sortChildren(n: ShapeNode) {
    n.children.sort((a, b) => (a.letter ?? '').localeCompare(b.letter ?? ''));
    n.children.forEach(sortChildren);
  })(root);
  return root;
}

function countLeaves(n: ShapeNode): number {
  if (n.children.length === 0) return 1;
  return n.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function maxDepth(n: ShapeNode, depth = 0): number {
  if (n.children.length === 0) return depth;
  return Math.max(...n.children.map((c) => maxDepth(c, depth + 1)));
}

type Pos = { id: string; letter: string | null; isEnd: boolean; x: number; y: number; depth: number; parentId: string | null };

/** leaf 열 균등 분할 + 내부 노드는 자식 x 의 평균 — 트리 폭을 그대로 채운다. */
function layoutShape(root: ShapeNode, innerLeft: number, innerW: number): Map<string, Pos> {
  const positions = new Map<string, Pos>();
  const leafCount = Math.max(1, countLeaves(root));
  const colW = innerW / leafCount;
  let leafCursor = 0;

  function place(n: ShapeNode, depth: number, parentId: string | null): number {
    const y = TOP_PAD + depth * ROW_GAP;
    let x: number;
    if (n.children.length === 0) {
      x = innerLeft + (leafCursor + 0.5) * colW;
      leafCursor += 1;
    } else {
      const childXs = n.children.map((c) => place(c, depth + 1, n.id));
      x = childXs.reduce((s, v) => s + v, 0) / childXs.length;
    }
    positions.set(n.id, { id: n.id, letter: n.letter, isEnd: n.isEnd, x, y, depth, parentId });
    return x;
  }
  place(root, 0, null);
  return positions;
}

function computeHeight(root: ShapeNode): number {
  return TOP_PAD + maxDepth(root) * ROW_GAP + NODE_R + CAPTION_AREA_H;
}

/**
 * 노드가 말하는 형편.
 *
 * 옮기기 전에는 이 타입이 **선언만 있고 값이 어디에도 저장되지 않았다** — 칠에만
 * 쓰였다. 이제 장면에서 파생시킨다 (`visualOf`).
 */
type NodeVisual = 'default' | 'onPath' | 'active' | 'found' | 'noWord' | 'blocked';

function nodeFill(colors: Palette, v: NodeVisual): string {
  switch (v) {
    case 'default':
      return colors.bg;
    case 'onPath':
      return colors.itemSorted;
    case 'active':
      return colors.itemActive;
    case 'found':
      return colors.accent;
    case 'noWord':
      return colors.itemActive;
    case 'blocked':
      return colors.danger;
  }
}

function nodeInk(colors: Palette, v: NodeVisual): string {
  switch (v) {
    case 'default':
      return colors.text;
    case 'onPath':
      return colors.textInverse;
    default:
      return colors.stateInk;
  }
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export const walkPerCharacterStageView: CanvasView = {
  canvas: { height: FALLBACK_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<WalkPerCharacterScene> {
    const svg = params.canvas;
    const W = PIECE_CANVAS_W;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g');
    root.setAttribute('font-family', fonts.body);
    svg.appendChild(root);

    // 레이어 순서: 가지 → 노드 → 커서 → 딱지 → 글. 앞의 넷은 장면마다 통째로 다시 짓는다.
    const edgesG = el('g');
    const nodesG = el('g');
    const cursorG = el('g');
    const badgeG = el('g');
    const textG = el('g');
    root.append(edgesG, nodesG, cursorG, badgeG, textG);

    // ── 고정 자리의 글 두 줄. 다시 짓지 않고 내용만 갈아 낀다. 재건 밖에 있으므로
    //    정적 경로가 **매번 명시로** 내용과 세로 자리를 쓴다 (빈 줄도 명시로 쓴다).
    const captionText = el('text', {
      x: W / 2,
      'text-anchor': 'middle',
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const counterText = el('text', {
      x: W / 2,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    textG.append(captionText, counterText);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 커서가 미끄러지는 걸음이 `await` 를 지나고, 그 뒤에 캡션·셈 같은 **재건 밖
     * 요소**에 다시 쓰므로 빗장이 필요하다 — 살아남은 앞 세대가 새로 선 화면을
     * 덮을 수 있다.
     */
    let gen = 0;

    /** 이번 장면이 세운 커서 링. 장면 상태가 아니라 그리기의 부산물이다. */
    let ringEl: SVGCircleElement | null = null;
    /** 노드마다의 무리. 답이 난 자리를 통째로 부풀리려면 묶여 있어야 한다. */
    let nodeGroups = new Map<string, SVGGElement>();
    /** 없던 가지의 딱지 무리. 없으면 `null`. */
    let badgeGroup: SVGGElement | null = null;
    /** 이번 장면의 배치. 캡션이 노드에 새겨진 글자를 읽어 쓴다. */
    let positions = new Map<string, Pos>();

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

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      edgesG.replaceChildren();
      nodesG.replaceChildren();
      cursorG.replaceChildren();
      badgeG.replaceChildren();
      ringEl = null;
      nodeGroups = new Map<string, SVGGElement>();
      badgeGroup = null;
      positions = new Map<string, Pos>();
      captionText.textContent = '';
      counterText.textContent = '';
    }

    /**
     * 노드가 말하는 형편을 장면에서 낸다.
     *
     * 답이 난 뒤에는 커서 자리가 결말의 색을 쓰고, 걷는 중에는 커서 자리가
     * `active` · 지나온 자리가 `onPath` 다. 뿌리는 아무도 밟지 않은 것으로 둔다
     * (자취에 뿌리를 담지 않으므로 저절로 그렇게 된다).
     */
    function visualOf(scene: WalkPerCharacterScene, id: string, cursor: string): NodeVisual {
      if (id === cursor && scene.outcome !== null) {
        const v = scene.outcome.verdict;
        return v === 'found' ? 'found' : v === 'no-word' ? 'noWord' : 'blocked';
      }
      if (id === cursor && scene.path.length > 0) return 'active';
      return scene.path.includes(id) ? 'onPath' : 'default';
    }

    /** 한 걸음의 말. 장면은 무엇을 말할지만 주고 인자는 장면의 다른 필드에서 낸다. */
    function captionTextOf(scene: WalkPerCharacterScene, c: WalkCaption): string {
      const query = scene.query?.text ?? '';
      switch (c.kind) {
        case 'searchBegin':
          return t('caption.searchBegin', 'looking for "{query}" ({i}/{n})', {
            query,
            i: (scene.query?.index ?? 0) + 1,
            n: scene.query?.total ?? 0,
          });
        case 'stepDown':
          // 방금 내려선 노드에 새겨진 글자를 그대로 읽는다 — 캡션의 글자와 화면의
          // 글자가 한 출처여야 한다.
          return t('caption.stepDown', "follow '{char}' down one level", {
            char: positions.get(walkCursorOf(scene))?.letter ?? '',
          });
        case 'found':
          return t('caption.found', '"{query}" is a stored word — found', { query });
        case 'noWord':
          return t('caption.noWord', 'the path exists, but "{query}" isn’t a stored word', { query });
        case 'blocked':
          return t('caption.blocked', "no branch for '{char}' — \"{query}\" stops here", {
            char: scene.outcome?.blockedChar ?? '',
            query,
          });
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 뼈대부터 다시 잰다 — `init()` 이 없으므로 캔버스 세로도 여기서 정한다.
     */
    function drawStatic(scene: WalkPerCharacterScene): void {
      const shape = buildShape(scene.words);
      positions = layoutShape(shape, SIDE_MARGIN, W - SIDE_MARGIN * 2);
      const H = computeHeight(shape);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('height', String(H));
      captionText.setAttribute('y', String(H - CAPTION_AREA_H + 30));
      counterText.setAttribute('y', String(H - CAPTION_AREA_H + 52));

      const cursor = walkCursorOf(scene);
      // 자취에 담긴 노드로 들어가는 가지가 곧 밟은 가지다. 남는 강조라 정적으로 그린다.
      const walked = new Set(scene.path);

      // ── 가지 — 부모→자식. 가운데에 그 가지의 글자를 얹는다.
      (function walkEdges(n: ShapeNode) {
        const p = positions.get(n.id);
        if (!p) return;
        for (const c of n.children) {
          const cp = positions.get(c.id);
          if (!cp) continue;
          edgesG.appendChild(
            el('line', {
              x1: p.x,
              y1: p.y,
              x2: cp.x,
              y2: cp.y,
              stroke: walked.has(c.id) ? colors.itemSorted : colors.border,
              'stroke-width': 2,
            }),
          );

          const label = el('text', {
            x: (p.x + cp.x) / 2,
            y: (p.y + cp.y) / 2 - 6,
            'text-anchor': 'middle',
            'font-size': fontSizes.sm,
            'font-family': fonts.mono ?? fonts.body,
            fill: colors.textMuted,
            'paint-order': 'stroke',
            stroke: colors.bg,
            'stroke-width': 4,
          });
          label.textContent = c.letter ?? '';
          edgesG.appendChild(label);

          walkEdges(c);
        }
      })(shape);

      // ── 노드 — 동그라미 + 글자 + 말끝 표시(●).
      for (const pos of positions.values()) {
        const visual = visualOf(scene, pos.id, cursor);
        const group = el('g');
        nodesG.appendChild(group);
        nodeGroups.set(pos.id, group);
        group.appendChild(
          el('circle', {
            cx: pos.x,
            cy: pos.y,
            r: pos.id === WALK_ROOT_ID ? NODE_R * 0.55 : NODE_R,
            fill: nodeFill(colors, visual),
            stroke: colors.border,
            'stroke-width': 2,
          }),
        );

        if (pos.letter) {
          const letter = el('text', {
            x: pos.x,
            y: pos.y + 5,
            'text-anchor': 'middle',
            'font-size': fontSizes.md,
            'font-family': fonts.mono ?? fonts.body,
            fill: nodeInk(colors, visual),
          });
          letter.textContent = pos.letter;
          group.appendChild(letter);
        }

        if (pos.isEnd) {
          group.appendChild(
            el('circle', {
              cx: pos.x,
              cy: pos.y + NODE_R + 8,
              r: 3,
              fill: colors.textMuted,
            }),
          );
        }
      }

      // ── 커서 링. 찾는 중에만 선다 — 답이 나면 거둔다.
      if (scene.query !== null && scene.outcome === null) {
        const at = positions.get(cursor);
        if (at) {
          ringEl = el('circle', {
            cx: at.x,
            cy: at.y,
            r: RING_R,
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 2.5,
          });
          cursorG.appendChild(ringEl);
        }
      }

      // ── 없던 가지의 딱지. 남는 표식이라 정적으로 그린다.
      const blockedChar = scene.outcome?.verdict === 'blocked' ? scene.outcome.blockedChar : null;
      const stop = blockedChar === null ? undefined : positions.get(cursor);
      if (blockedChar !== null && stop) {
        const bx = stop.x + NODE_R * 0.85;
        const by = stop.y - NODE_R * 0.85;
        badgeGroup = el('g');
        badgeG.appendChild(badgeGroup);
        badgeGroup.appendChild(el('circle', { cx: bx, cy: by, r: 11, fill: colors.danger }));
        const badgeText = el('text', {
          x: bx,
          y: by + 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.sm,
          'font-family': fonts.mono ?? fonts.body,
          fill: colors.stateInk,
        });
        badgeText.textContent = `×${blockedChar}`;
        badgeGroup.appendChild(badgeText);
      }

      // ── 읽는 줄. 셈은 자취의 길이 하나에서 낸다.
      captionText.textContent = scene.caption === null ? '' : captionTextOf(scene, scene.caption);
      counterText.textContent = scene.path.length === 0 ? '' : String(scene.path.length);
    }

    /**
     * 글자 하나를 따라 한 칸 내려간다 — 커서가 실제로 미끄러진다.
     *
     * 정적 그리기가 이미 닿을 자리에 링을 세워 두었으므로, 운동은 **떠나온
     * 자리로 도로 물리는 것**에서 시작한다 (`draw(0)`). 출발 자리는 `step.from`
     * 이 싣고 있다 — `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다
     * (S-scene).
     */
    function flowDown(
      scene: WalkPerCharacterScene,
      step: Extract<WalkStep, { kind: 'down' }>,
      live: () => boolean,
    ): Promise<void> {
      const ring = ringEl;
      const from = positions.get(step.from);
      const to = positions.get(walkCursorOf(scene));
      if (!ring || !from || !to) return Promise.resolve();
      return animate(
        MOVE_MS,
        (e) => {
          ring.setAttribute('cx', String(from.x + (to.x - from.x) * e));
          ring.setAttribute('cy', String(from.y + (to.y - from.y) * e));
        },
        live,
      );
    }

    /**
     * 새 찾기 — 커서 링이 뿌리 위로 내려앉는다.
     *
     * 되돌아오는 것이지 걸어가는 것이 아니므로 자리 이동으로 그리지 않는다.
     * 벌어져 있던 테가 조여들며 짙어지는 꼴이라, "여기서 다시 시작한다" 만
     * 말하고 만다.
     */
    function flowBegin(live: () => boolean): Promise<void> {
      const ring = ringEl;
      if (!ring) return Promise.resolve();
      const draw = (e: number): void => {
        ring.setAttribute('r', (RING_R + BEGIN_OPEN * (1 - e)).toFixed(2));
        ring.setAttribute('opacity', e.toFixed(3));
      };
      return animate(BEGIN_MS, draw, live);
    }

    /**
     * 답이 난 자리 — 한 번 부풀었다 제 크기로 돌아온다. **지나가는 것**이다.
     *
     * 나타났다 사라지는 꼴(`opacity` 0 → 1)로 하지 않는다. 노드는 그 자리에 이미
     * 서 있던 것이라 되레 한 번 깜빡이는 것으로 보인다. 없던 가지의 딱지가 있으면
     * 같은 중심으로 함께 부푼다 — 딱지와 노드가 한 답이기 때문이다.
     */
    function flowSettle(scene: WalkPerCharacterScene, live: () => boolean): Promise<void> {
      const at = positions.get(walkCursorOf(scene));
      const group = nodeGroups.get(walkCursorOf(scene));
      const items = [group, badgeGroup].filter((g): g is SVGGElement => g != null);
      if (!at || items.length === 0) return Promise.resolve();
      const draw = (e: number): void => {
        const scale = (1 + ANSWER_SCALE * Math.sin(Math.PI * e)).toFixed(3);
        const tf = `translate(${at.x}, ${at.y}) scale(${scale}) translate(${-at.x}, ${-at.y})`;
        for (const it of items) it.setAttribute('transform', tf);
      };
      return animate(SETTLE_MS, draw, live);
    }

    /** 방금 밟은 걸음 하나를 흐르게 한다. 세 갈래 전부 운동이 있다. */
    function flowOf(
      scene: WalkPerCharacterScene,
      step: WalkStep,
      live: () => boolean,
    ): Promise<void> {
      switch (step.kind) {
        case 'begin':
          return flowBegin(live);
        case 'down':
          return flowDown(scene, step, live);
        case 'settle':
          return flowSettle(scene, live);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 자리를 `step` 이 싣고 오므로 고를 것이
     * `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: WalkPerCharacterScene,
      _prev: WalkPerCharacterScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      rewind();
      drawStatic(next);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(next, step, live);
      if (!live()) return;

      // 흐르며 남은 보간 좌표·`transform`·`opacity` 가 통째로 사라진다. 그 사이에
      // 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next);
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
        ringEl = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
