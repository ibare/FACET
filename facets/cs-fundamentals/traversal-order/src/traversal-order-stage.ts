/**
 * traversal-order-stage — 순회 순서 조각의 전용 그림.
 *
 * 화면은 위에서 아래로 셋이다.
 *
 *   1. 나무 한 그루와 그 둘레를 도는 길. 길은 점선으로 처음부터 깔려 있고 세
 *      차례 내내 한 번도 바뀌지 않는다. 발은 그 위를 그대로 밟는다.
 *   2. 세는 순간 표식 — 노드마다 하나씩, 일곱 개. 차례가 바뀔 때 노드의
 *      왼쪽 → 아래 → 오른쪽으로 **자리를 옮긴다.** 이 조각이 하는 말이 이
 *      움직임 하나에 다 들어 있다.
 *   3. 결과 세 줄. 발이 세는 접점을 밟을 때마다 그 값이 나무에서 줄의 칸으로
 *      떨어진다. 세 줄이 다 차면 그대로 견주기가 된다.
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * 그래서 `beginOrder` · `touch` · `record` · `endOrder` · `finish` · `rewind` ·
 * `setCaption` 이 통째로 사라졌고, 그 안에 흩어져 있던 되돌림 —
 * `paintNode(lastTouched, 'idle')` 을 세 곳에서 부르던 것 — 도 함께 사라졌다.
 * 지울 것을 지우는 대신 목표 상태를 통째로 그린다.
 *
 * ── 한 걸음에 **여럿**이 움직인다
 *
 * 한 차례가 시작될 때 표식 **일곱이 동시에** 접점을 옮긴다. 그것이 이 조각의
 * 주장 그 자체다 — 나무도 길도 그대로인데 세는 자리만 한꺼번에 미끄러진다.
 * 일곱을 따로 돌리지 않고 `Promise.all` 로 시계를 나누지도 않는다. **한 시계로**
 * 일곱을 함께 흘리면 `render` 의 Promise 가 일곱이 다 선 뒤에 구조적으로 풀린다
 * (프로토콜 3-4).
 *
 * 발이 움직이는 걸음도 마찬가지다 — 발과 자취가 한 뜻으로 묶여 있어 한 시계가
 * 옳다. 자취는 발이 지나간 만큼 자란다.
 *
 * ── 지연 발화를 막는 것
 *
 * **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant` · `onScrubStart` 는
 * 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다 (S-scene). 정적
 * 그리기가 모든 요소를 매번 새로 만들지만 **손잡이(`footEl` · `trailEl` ·
 * `markEls` · `rowCells`)는 재할당**되므로, `await` 를 지난 옛 세대가 새 손잡이를
 * 타고 살아 있는 화면에 쓸 수 있다. 빗장이 그것을 끊는다.
 *
 * 운동이 끝나면 속성을 하나씩 거두는 대신 `drawScene(next)` 로 장면을 통째로 다시
 * 세운다 — 보간의 끝자리도 임시 토큰도 함께 지워진다.
 *
 * 색 어휘 (S-view 결정 트리)
 *   accent      "제 자리를 밟는 순간" — 표식 · 룰 글리프의 점 · 밟힌 노드 ·
 *               떨어지는 값. 이 조각의 단일 강조다.
 *   itemActive  발이 지나는 중 — 발 · 지나온 자취 · 스쳐 가는 노드의 테두리.
 *   structural  나무 · 길 · 칸 · 글자.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { TraversalMoment } from './algorithm.js';
import { activeOrderOf, type TraversalOrderScene, type TraversalOrderStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 376;
const PAD = 14;

// ── 나무 ────────────────────────────────────────────────────────────────
const NODE_R = 17;
const ROOT_CY = 46;
const LEVEL_H = 62;
/** 노드 중심에서 접점까지. 세 접점은 왼쪽 · 아래 · 오른쪽에 놓인다. */
const TOUCH_OFF = NODE_R + 11;
/** 잎 간격의 **상한**. 실제 간격은 캔버스 폭에서 역산한다 (S-piece). */
const LEAF_GAP_MAX = 148;
const TREE_SIDE_MIN = 44;
const FOOT_R = 7;
const MARK_R = 4.5;
/** 들머리는 뿌리 위. 한 바퀴가 여기서 떠나 여기로 돌아온다. */
const START_ABOVE_ROOT = NODE_R + 20;

// ── 결과 줄 ─────────────────────────────────────────────────────────────
const ROWS_TOP = 216;
const ROW_H = 34;
const ROW_GAP = 10;
const CELL_H = 30;
/** 칸 사이 틈. 칸 폭은 남는 자리를 나눠 가진다. */
const CELL_INSET = 5;
const GLYPH_SLOT = 16;
const GLYPH_GAP = 4;
const GLYPH_X = 92;
const CELLS_X = 162;
const CAPTION_Y = 360;

// ── 줄의 형편이 정하는 밝기 ──────────────────────────────────────────────
const ROW_WAITING = 0.4;
const ROW_DONE = 0.8;
/** 막 마친 줄. 다음 차례가 시작되면 `ROW_DONE` 으로 내려앉는다. */
const ROW_SETTLED = 0.85;
const ROW_ACTIVE = 1;

const DEFAULT_STEP_MS = 480;
const DONE_MS = 240;

type Pt = { x: number; y: number };
type CellEls = { rect: SVGElement; text: SVGElement };

/**
 * 장면에서 역산한 자리들.
 *
 * 좌표는 장면에 없다 — 값의 인덱스와 깊이가 자리를 정하므로 여기서 셈한다
 * (S-piece). 걸음 함수도 같은 것을 써야 하므로 `drawScene` 이 돌려준다.
 */
type Layout = {
  /** 노드 중심. 인덱스는 레벨 순서. */
  pos: Pt[];
  /** 들머리. 발이 떠나고 돌아오는 자리. */
  start: Pt;
  /** 결과 줄 칸 하나의 폭. */
  cellW: number;
  /** 값 → 레벨 순서 인덱스. 값이 곧 이름이다. */
  indexOf: Map<number, number>;
};

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 자리 하나를 문자열로. 정적 경로와 운동이 **같은 형식**을 써야 왕복이 맞는다. */
function translate(p: Pt): string {
  return `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`;
}

function place(node: SVGElement, p: Pt): void {
  node.setAttribute('transform', translate(p));
}

function pathOf(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * 완전 이진 트리의 노드 중심 좌표.
 *
 * 잎을 캔버스 폭에 고르게 펴고 부모는 제 잎들의 한가운데에 놓는다. 간격을
 * 상수로 못박지 않고 폭에서 역산하므로 좌우로 버리는 자리가 없다.
 */
function computeNodePositions(count: number): Pt[] {
  if (count <= 0) return [];
  const depth = Math.floor(Math.log2(count));
  const leaves = 2 ** depth;
  const gap =
    leaves > 1 ? Math.min(LEAF_GAP_MAX, Math.floor((W - TREE_SIDE_MIN * 2) / (leaves - 1))) : 0;
  const x0 = Math.round((W - gap * (leaves - 1)) / 2);
  const points: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    const level = Math.floor(Math.log2(i + 1));
    const posInLevel = i + 1 - 2 ** level;
    const span = 2 ** (depth - level);
    points.push({
      x: x0 + (posInLevel * span + (span - 1) / 2) * gap,
      y: ROOT_CY + level * LEVEL_H,
    });
  }
  return points;
}

/** 룰 글리프 세 칸의 내용. 제 자리(점)가 몇 번째 칸인가가 곧 차례의 정의다. */
function glyphSlots(order: TraversalMoment): ('self' | 'left' | 'right')[] {
  if (order === 'pre') return ['self', 'left', 'right'];
  if (order === 'in') return ['left', 'self', 'right'];
  return ['left', 'right', 'self'];
}

function layoutOf(scene: TraversalOrderScene): Layout {
  const pos = computeNodePositions(scene.values.length);
  const root = pos[0];
  const indexOf = new Map<number, number>();
  scene.values.forEach((value, i) => {
    if (!indexOf.has(value)) indexOf.set(value, i);
  });
  return {
    pos,
    start: { x: root?.x ?? W / 2, y: ROOT_CY - START_ABOVE_ROOT },
    cellW: scene.values.length > 0 ? Math.floor((W - PAD - CELLS_X) / scene.values.length) : 0,
    indexOf,
  };
}

/** 노드의 세 접점 중 하나. 왼쪽 · 아래 · 오른쪽이 곧 세 차례의 이름이다. */
function touchPoint(at: Layout, index: number, moment: TraversalMoment): Pt {
  const p = at.pos[index];
  if (p === undefined) return at.start;
  if (moment === 'pre') return { x: p.x - TOUCH_OFF, y: p.y };
  if (moment === 'in') return { x: p.x, y: p.y + TOUCH_OFF };
  return { x: p.x + TOUCH_OFF, y: p.y };
}

/** 나무가 정하는 한 바퀴. 순서가 무엇이든 이 길은 같다. */
function routePoints(at: Layout, count: number): Pt[] {
  const points: Pt[] = [at.start];
  const walk = (i: number): void => {
    if (i >= count) return;
    points.push(touchPoint(at, i, 'pre'));
    walk(i * 2 + 1);
    points.push(touchPoint(at, i, 'in'));
    walk(i * 2 + 2);
    points.push(touchPoint(at, i, 'post'));
  };
  walk(0);
  points.push(at.start);
  return points;
}

function rowTop(index: number): number {
  return ROWS_TOP + index * (ROW_H + ROW_GAP);
}

function cellCenter(at: Layout, rowIndex: number, slot: number): Pt {
  return {
    x: CELLS_X + slot * at.cellW + (at.cellW - CELL_INSET) / 2,
    y: rowTop(rowIndex) + (ROW_H - CELL_H) / 2 + CELL_H / 2,
  };
}

/**
 * 줄의 형편이 정하는 밝기.
 *
 * 옮기기 전에는 이 넷이 `row.group.style.opacity` **하나에 겹쳐** 있었고 어느
 * 뜻으로 그 값이 되었는지는 코드 어디에도 없었다. 이제 장면에서 파생한다.
 */
function rowOpacity(scene: TraversalOrderScene, r: number): number {
  if (scene.concluded) return ROW_ACTIVE;
  if (r === scene.cursor) return scene.walking ? ROW_ACTIVE : ROW_SETTLED;
  return (scene.rows[r]?.length ?? 0) > 0 ? ROW_DONE : ROW_WAITING;
}

export const traversalOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<TraversalOrderScene> {
    const palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    const cellRadius = Number.parseFloat(radii.sm);

    // `initialData` 를 좁히는 것은 stage 의 mount 다 (S-piece). 걸음 간격은 화면
    // 상태가 아니라 리듬의 설정이라 장면에 담지 않는다.
    const initial = (params.initialData ?? {}) as { stepMs?: unknown };
    const stepMs =
      typeof initial.stepMs === 'number' && initial.stepMs > 0 ? initial.stepMs : DEFAULT_STEP_MS;

    /** 표식 일곱이 접점을 옮기는 시간. 이 조각에서 가장 긴 운동이다. */
    const markMs = Math.max(180, Math.round(stepMs * 0.6));
    /** 세는 접점으로 가는 발걸음. 지나가기만 하는 것보다 길다. */
    const stampFootMs = Math.max(70, Math.round(stepMs * 0.18));
    const passFootMs = Math.max(40, Math.round(stepMs * 0.1));
    const dropMs = Math.max(120, Math.round(stepMs * 0.34));
    const returnMs = Math.max(110, Math.round(stepMs * 0.26));

    const layers = {
      guide: el('g', {}),
      trail: el('g', {}),
      edges: el('g', {}),
      nodes: el('g', {}),
      marks: el('g', {}),
      foot: el('g', {}),
      rows: el('g', {}),
      drops: el('g', {}),
      caption: el('g', {}),
    };
    for (const layer of Object.values(layers)) svg.appendChild(layer);

    // ── 애니메이션 동력 ──────────────────────────────────────────────────
    let destroyed = false;
    /** rAF 손잡이와 타이머 손잡이는 타입이 다르다. 태그로 갈라 담는다. */
    type FrameId =
      | { kind: 'frame'; id: number }
      | { kind: 'timer'; id: ReturnType<typeof setTimeout> };
    const frames = new Set<FrameId>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await
     * ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가
     * 통째로 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 요소를 매번 새로 만들지만 **손잡이는 재할당**되므로, `await`
     * 를 지난 옛 세대가 새 손잡이를 타고 살아 있는 화면에 쓸 수 있다. 빗장이
     * 그것을 끊는다 (프로토콜 3-4).
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    // rAF 와 타이머는 id 의 타입이 다르다. 한 집합에 뭉쳐 담으면 캐스팅을 사게 되므로
    // 갈라 둔다 (C9 — `as unknown as` 는 설계상 오픈 타입에만 쓴다).
    const schedule = (fn: () => void): FrameId =>
      typeof requestAnimationFrame === 'function'
        ? { kind: 'frame', id: requestAnimationFrame(fn) }
        : { kind: 'timer', id: setTimeout(fn, 16) };
    const unschedule = (handle: FrameId): void => {
      if (handle.kind === 'frame') cancelAnimationFrame(handle.id);
      else clearTimeout(handle.id);
    };
    const nowMs = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(
      duration: number,
      my: number,
      apply: (progress: number) => void,
    ): Promise<void> {
      const paint = (progress: number): void => {
        if (alive(my)) apply(progress);
      };
      paint(0);
      if (destroyed || duration <= 0) {
        paint(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const startedAt = nowMs();
        let id: FrameId | null = null;
        const tick = (): void => {
          if (id !== null) frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const progress = Math.min(1, (nowMs() - startedAt) / duration);
          paint(progress);
          if (progress >= 1) {
            finish();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });
    }

    // ── 정적 그리기가 매번 다시 잡는 손잡이 ───────────────────────────────
    let markEls: SVGElement[] = [];
    let rowCells: CellEls[][] = [];
    let rowLabels: SVGElement[] = [];
    let footEl: SVGElement | null = null;
    let trailEl: SVGElement | null = null;

    function labelOf(order: TraversalMoment): string {
      if (order === 'pre') return tr('label.preorder', 'preorder');
      if (order === 'in') return tr('label.inorder', 'inorder');
      return tr('label.postorder', 'postorder');
    }

    /**
     * 지금 화면에서 무슨 일이 일어나는지. 세 차례가 한 논증의 세 단계다.
     *
     * 장면은 문안을 담지 않는다 — 무엇을 말할지는 `cursor` 와 `concluded` 가 이미
     * 말하고, 문자는 여기서 `params.t` 로 만든다 (C10).
     */
    function captionFor(scene: TraversalOrderScene): string {
      if (scene.concluded) {
        return tr(
          'caption.done',
          'Same tree, same route. Only the moment of stepping on its own place moves.',
        );
      }
      const order = activeOrderOf(scene);
      if (order === null) return '';
      if (order === 'pre') {
        return tr('caption.pre', 'Preorder — step on your own place first, then left, then right.');
      }
      if (order === 'in') {
        return tr('caption.in', 'Inorder — left first, then your own place, then right.');
      }
      return tr('caption.post', 'Postorder — both children first, then your own place.');
    }

    /** 밟은 접점 하나의 자리. 값 → 인덱스 → 접점으로 셈한다. */
    function pointOfTouch(
      at: Layout,
      touch: { value: number; moment: TraversalMoment },
    ): Pt {
      const index = at.indexOf.get(touch.value);
      if (index === undefined) return at.start;
      return touchPoint(at, index, touch.moment);
    }

    /**
     * 이번 차례에 밟아 온 길.
     *
     * 좌표 배열을 쌓아 두지 않는다 — 장면의 접점 목록에서 매번 셈한다. `head` 를
     * 주면 마지막 한 점을 그것으로 갈음한다 (운동 중의 발 자리).
     */
    function trailPoints(scene: TraversalOrderScene, at: Layout, head?: Pt): Pt[] {
      const pts: Pt[] = [at.start];
      for (const touch of scene.path) pts.push(pointOfTouch(at, touch));
      if (!scene.walking) pts.push(at.start);
      if (head !== undefined) pts[pts.length - 1] = head;
      return pts;
    }

    /** 발이 선 자리. 걷는 중이면 마지막 접점, 아니면 들머리다. */
    function footPoint(scene: TraversalOrderScene, at: Layout): Pt {
      const last = scene.path[scene.path.length - 1];
      if (!scene.walking || last === undefined) return at.start;
      return pointOfTouch(at, last);
    }

    function drawTree(scene: TraversalOrderScene, at: Layout): void {
      for (let i = 1; i < scene.values.length; i += 1) {
        const p = at.pos[i];
        const parent = at.pos[Math.floor((i - 1) / 2)];
        if (p === undefined || parent === undefined) continue;
        layers.edges.appendChild(
          el('line', {
            x1: parent.x,
            y1: parent.y,
            x2: p.x,
            y2: p.y,
            stroke: palette.border,
            'stroke-width': 1.5,
          }),
        );
      }

      // 지금 밟고 있는 접점 하나가 그 노드의 칠을 정한다. 옮기기 전에는 이것이
      // `lastTouched` 와 `'idle' | 'passing' | 'stamped'` 로 stage 안에 숨어
      // 있었다 — 값이 저장되는 곳이 없는 타입이었다.
      const standing = scene.walking ? scene.path[scene.path.length - 1] : undefined;

      for (let i = 0; i < scene.values.length; i += 1) {
        const p = at.pos[i];
        const value = scene.values[i];
        if (p === undefined || value === undefined) continue;

        const stamped = standing?.value === value && standing.counted;
        const passing = standing?.value === value && !standing.counted;
        const group = el('g', {});
        group.append(
          el('circle', {
            cx: p.x,
            cy: p.y,
            r: NODE_R,
            fill: stamped ? palette.accent : passing ? palette.bgSubtle : palette.itemDefault,
            stroke: stamped ? palette.text : passing ? palette.itemActive : palette.border,
            'stroke-width': stamped || passing ? 2.5 : 1.5,
          }),
        );
        const label = el('text', {
          x: p.x,
          y: p.y + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: palette.text,
        });
        label.textContent = String(value);
        group.appendChild(label);
        layers.nodes.appendChild(group);
      }
    }

    /**
     * 세는 순간 표식. 노드마다 하나씩, 이번 차례의 접점에 앉는다.
     *
     * 차례가 없으면(첫 장면 · 다 마친 뒤) 아예 그리지 않는다. 옮기기 전에는 이
     * 자리가 `mark.style.transform` 에만 있어 되짚어도 옛 접점에 남았다.
     */
    function drawMarks(scene: TraversalOrderScene, at: Layout): void {
      markEls = [];
      const order = activeOrderOf(scene);
      if (order === null) return;
      for (let i = 0; i < scene.values.length; i += 1) {
        const mark = el('circle', {
          r: MARK_R,
          fill: palette.accent,
          stroke: palette.text,
          'stroke-width': 1.2,
          transform: translate(touchPoint(at, i, order)),
        });
        layers.marks.appendChild(mark);
        markEls.push(mark);
      }
    }

    function drawTrailAndFoot(scene: TraversalOrderScene, at: Layout): void {
      trailEl = null;
      footEl = null;
      if (scene.cursor === null) return;

      const trail = el('path', {
        d: pathOf(trailPoints(scene, at)),
        fill: 'none',
        stroke: palette.itemActive,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        opacity: 0.35,
      });
      layers.trail.appendChild(trail);
      trailEl = trail;

      const foot = el('g', { transform: translate(footPoint(scene, at)) });
      foot.appendChild(
        el('circle', { r: FOOT_R, fill: palette.itemActive, stroke: palette.bg, 'stroke-width': 2 }),
      );
      layers.foot.appendChild(foot);
      footEl = foot;
    }

    function drawRows(scene: TraversalOrderScene, at: Layout): void {
      rowCells = [];
      rowLabels = [];

      for (let r = 0; r < scene.orders.length; r += 1) {
        const order = scene.orders[r];
        if (order === undefined) continue;
        const top = rowTop(r);
        const group = el('g', { opacity: rowOpacity(scene, r) });

        const label = el('text', {
          x: PAD,
          y: top + ROW_H / 2 + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: palette.text,
        });
        label.textContent = labelOf(order);
        group.appendChild(label);
        rowLabels.push(label);

        const slots = glyphSlots(order);
        for (let s = 0; s < slots.length; s += 1) {
          const gx = GLYPH_X + s * (GLYPH_SLOT + GLYPH_GAP);
          const gy = top + (ROW_H - GLYPH_SLOT) / 2;
          group.appendChild(
            el('rect', {
              x: gx,
              y: gy,
              width: GLYPH_SLOT,
              height: GLYPH_SLOT,
              rx: cellRadius,
              fill: palette.bg,
              stroke: palette.border,
              'stroke-width': 1,
            }),
          );
          const kind = slots[s];
          if (kind === 'self') {
            group.appendChild(
              el('circle', {
                cx: gx + GLYPH_SLOT / 2,
                cy: gy + GLYPH_SLOT / 2,
                r: 4.5,
                fill: palette.accent,
                stroke: palette.text,
                'stroke-width': 1.2,
              }),
            );
          } else if (kind === 'left') {
            // 왼쪽으로 드리운 가지.
            group.appendChild(
              el('path', {
                d: `M${gx + 12.5},${gy + 3.5} L${gx + 12.5},${gy + 12.5} L${gx + 3},${gy + 12.5} Z`,
                fill: palette.textMuted,
              }),
            );
          } else {
            group.appendChild(
              el('path', {
                d: `M${gx + 3.5},${gy + 3.5} L${gx + 13},${gy + 12.5} L${gx + 3.5},${gy + 12.5} Z`,
                fill: palette.textMuted,
              }),
            );
          }
        }

        // 칸의 내용은 장면이 말한다. 옮기기 전에는 `textContent` 에만 있어
        // 되짚으면 세 줄이 통째로 비었다 — 조각의 결론이 사라지는 자리였다.
        const values = scene.rows[r] ?? [];
        const cells: CellEls[] = [];
        for (let s = 0; s < scene.values.length; s += 1) {
          const seated = values[s];
          const rect = el('rect', {
            x: CELLS_X + s * at.cellW,
            y: top + (ROW_H - CELL_H) / 2,
            width: Math.max(0, at.cellW - CELL_INSET),
            height: CELL_H,
            rx: cellRadius,
            fill: seated === undefined ? 'none' : palette.bgSubtle,
            stroke: seated === undefined ? palette.border : palette.text,
            'stroke-width': 1.2,
          });
          if (seated === undefined) rect.setAttribute('stroke-dasharray', '3 4');
          const center = cellCenter(at, r, s);
          const text = el('text', {
            x: center.x,
            y: center.y + 6,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: palette.text,
          });
          if (seated !== undefined) text.textContent = String(seated);
          group.append(rect, text);
          cells.push({ rect, text });
        }

        layers.rows.appendChild(group);
        // 줄 번호로 직접 앉힌다. `push` 로 쌓으면 걸러진 줄이 하나라도 있을 때
        // 손잡이의 번호가 장면의 줄 번호와 어긋난다.
        rowCells[r] = cells;
      }
    }

    /**
     * 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 시작하므로 되돌릴 명령이 필요 없다. 어느 걸음에서 오든 결과가
     * 같고, 그래서 되짚기가 앞으로 가기와 같은 연산이 된다 (S-scene).
     */
    function drawScene(scene: TraversalOrderScene): Layout {
      for (const layer of Object.values(layers)) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
      const at = layoutOf(scene);

      // 나무가 정하는 한 바퀴. 세 차례가 이 위를 그대로 다시 밟는다.
      layers.guide.appendChild(
        el('path', {
          d: pathOf(routePoints(at, scene.values.length)),
          fill: 'none',
          stroke: palette.border,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 5',
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }),
      );

      drawTrailAndFoot(scene, at);
      drawTree(scene, at);
      drawMarks(scene, at);
      drawRows(scene, at);

      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.textMuted,
      });
      caption.textContent = captionFor(scene);
      layers.caption.appendChild(caption);

      return at;
    }

    // ── 운동 ────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴로 돈다 (프로토콜 3-4 의 방향 뒤집힘).

    /** 발과 자취를 한 시계로 함께 옮긴다. 둘은 한 뜻이라 시계를 나누지 않는다. */
    function walkFoot(
      scene: TraversalOrderScene,
      at: Layout,
      from: Pt,
      to: Pt,
      duration: number,
      my: number,
    ): Promise<void> {
      return animate(duration, my, (progress) => {
        const head = lerp(from, to, easeInOut(progress));
        if (footEl !== null) place(footEl, head);
        trailEl?.setAttribute('d', pathOf(trailPoints(scene, at, head)));
      });
    }

    /**
     * 이 걸음에 흐르게 할 것.
     *
     * 출발 그림은 `prev` 에서 꺼내지 않는다 (S-scene). 발의 출발은 `path` 의
     * 끝에서 하나 앞이고 값이 떨어질 칸은 그 줄의 길이라, 전부 `next` 에서
     * 되셈된다. 되셈으로 못 얻는 표식의 출발 접점만 `step` 이 실어 온다.
     */
    async function flow(
      scene: TraversalOrderScene,
      step: TraversalOrderStep,
      at: Layout,
      my: number,
    ): Promise<void> {
      switch (step.kind) {
        // 표식 **일곱이 동시에** 접점을 옮긴다. 이 조각이 하는 말이 이 한
        // 움직임에 다 들어 있으므로 시계를 나누지 않는다.
        case 'begin': {
          const to = activeOrderOf(scene);
          if (to === null || markEls.length === 0) return;
          const from = step.from;
          if (from === null) {
            // 첫 차례 — 옮겨 올 자리가 없다. 제 자리에서 떠오른다.
            await animate(markMs, my, (progress) => {
              for (const mark of markEls) mark.setAttribute('opacity', progress.toFixed(3));
            });
            return;
          }
          await animate(markMs, my, (progress) => {
            const e = easeInOut(progress);
            markEls.forEach((mark, i) => {
              place(mark, lerp(touchPoint(at, i, from), touchPoint(at, i, to), e));
            });
          });
          return;
        }

        // 발이 다음 접점으로 옮겨 가고 자취가 그만큼 자란다.
        case 'touch': {
          const landed = scene.path[scene.path.length - 1];
          if (landed === undefined) return;
          const before = scene.path[scene.path.length - 2];
          const from = before === undefined ? at.start : pointOfTouch(at, before);
          const duration = landed.counted ? stampFootMs : passFootMs;
          await walkFoot(scene, at, from, pointOfTouch(at, landed), duration, my);
          return;
        }

        // 값이 나무에서 칸으로 떨어진다 — 세었다는 것이 곧 자리를 얻는 일이다.
        case 'record': {
          const row = scene.cursor;
          if (row === null) return;
          const slot = (scene.rows[row]?.length ?? 0) - 1;
          const index = at.indexOf.get(step.value);
          const cell = rowCells[row]?.[slot];
          const from = index === undefined ? undefined : at.pos[index];
          if (slot < 0 || cell === undefined || from === undefined) return;

          // 정적 그리기가 칸을 이미 채워 두었으므로, 값이 날아가는 동안은 비워
          // 둔다. 동기로 지우므로 그 사이에 페인트가 끼지 않는다.
          cell.rect.setAttribute('fill', 'none');
          cell.rect.setAttribute('stroke', palette.border);
          cell.rect.setAttribute('stroke-dasharray', '3 4');
          cell.text.textContent = '';

          const to = cellCenter(at, row, slot);
          const token = el('g', { transform: translate(from) });
          token.appendChild(
            el('circle', {
              r: NODE_R - 3,
              fill: palette.accent,
              stroke: palette.text,
              'stroke-width': 1.5,
            }),
          );
          const label = el('text', {
            x: 0,
            y: 6,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: palette.text,
          });
          label.textContent = String(step.value);
          token.appendChild(label);
          layers.drops.appendChild(token);

          await animate(dropMs, my, (progress) => {
            place(token, lerp(from, to, easeInOut(progress)));
          });
          return;
        }

        // 한 바퀴가 닫힌다. 발이 들머리로 돌아가며 자취가 이어 붙는다.
        case 'end': {
          const last = scene.path[scene.path.length - 1];
          if (last === undefined) return;
          await walkFoot(scene, at, pointOfTouch(at, last), at.start, returnMs, my);
          return;
        }

        // 세 줄이 나란히 선다. 견주는 것이 이 조각의 결론이라 그 줄 이름을 짚는다.
        case 'done': {
          if (rowLabels.length === 0) return;
          for (const label of rowLabels) label.setAttribute('fill', palette.accent);
          // 그릴 것이 없고 한 박자 머물기만 한다. `animate` 를 빈 손으로 부르는
          // 것은 그 머묾에도 세대 빗장과 destroy 깨우기가 걸리게 하려는 것이다 —
          // 따로 `wait` 를 두면 거두는 자리가 둘이 된다. 칠은 `drawScene` 이 되돌린다.
          await animate(DONE_MS, my, () => {});
          return;
        }
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: TraversalOrderScene,
      /** 출발 그림을 전부 `next` 와 `step` 에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: TraversalOrderScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const at = drawScene(next);
      if (!opts.animate) return;

      const step = next.step;
      if (step === null) return;

      await flow(next, step, at, my);

      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리와 임시 토큰을 거두고 그 장면을 통째로 다시
      // 세운다. 속성을 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도
      // 프레임도 없어 페인트가 끼지 않는다.
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이
        // 깨어나지 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        markEls = [];
        rowCells = [];
        rowLabels = [];
        footEl = null;
        trailEl = null;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
