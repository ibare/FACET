/**
 * parent-two-children-stage — 이진 트리 조각의 전용 stage view.
 *
 * 그림의 동사는 **갈라진다** 다. 자식은 나타나는 것이 아니라 부모 자리에서
 * 출발해 아래로 뻗어 나간다 — 가지가 자라는 동안 노드가 그 끝에 실려 이동한다.
 * 자식이 하나뿐인 자리에서도 두 자리가 함께 열리고, 채워지지 않은 쪽은 점선
 * 빈 자리로 남는다. 마지막에 그 하나뿐인 자식을 빈 자리 쪽으로 밀어 보면 제
 * 자리로 되돌아온다 — 왼쪽과 오른쪽은 바꿀 수 없다.
 *
 * 좌표는 완전 이진 트리 격자에서 나온다. 자리 하나는 (깊이 d, 칸 i) 이고
 * 왼쪽 자식은 (d+1, 2i) · 오른쪽 자식은 (d+1, 2i+1) 이다. 비어 있는 쪽도 격자
 * 위에 자리를 가지므로, 빈 자리를 그릴 좌표가 따로 필요 없다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`placeRoot()` · `split()` · `rejectSwap()` · `clear()`) 를
 * 두지 않는다. 그것들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었고 무엇이 그려졌는지는 `nodes` · `branches` · `ghosts` Map
 * 안에만 있었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의 화면
 * 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다 (S-scene).
 * 장면의 모양은 `scene.ts`.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에
 * 서 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그 장면을
 * 다시 한 번 통째로 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도
 * 다르면 되짚기 판정이 어긋나기 때문이다.
 */

import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  ParentTwoChildrenCaption,
  ParentTwoChildrenScene,
  ParentTwoChildrenSplit,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌우 여백의 하한. 칸 너비는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece). */
const SIDE_MIN = 26;
/** 노드 반지름의 상한. 실제 값은 칸 너비에서 역산한다. */
const NODE_R_MAX = 30;
const PAD_TOP = 46;
const LEVEL_GAP = 88;
/** 트리 맨 아랫단과 캡션 첫 줄 사이. */
const CAPTION_GAP = 36;
const CAPTION_LINE_H = 19;
const CAPTION_LINES = 2;
/** 캔버스 세로의 초기값. 그릴 때 트리 깊이로 다시 계산한다 (S-view). */
const INITIAL_H = 324;
/** 격자를 훑는 깊이의 상한. 이음이 도는 자료가 들어와도 멎게 한다. */
const MAX_DEPTH = 8;

const SPLIT_MS = 460;
const ROOT_MS = 300;
const REJECT_OUT_MS = 300;
const REJECT_BACK_MS = 240;
/** 빈 자리 쪽으로 밀어 보는 거리의 비율. 끝까지 가지 않고 되돌아온다. */
const REJECT_REACH = 0.58;
/** 뿌리가 내려앉기 전 떠 있는 높이의 비율. 정적으로는 이 몫이 0 이다. */
const ROOT_DROP = 0.3;

const BADGE_W = 19;
const BADGE_H = 16;
const BADGE_R = 4;

/**
 * 도형에 새겨지는 표식. 번역하면 그림과 어긋난다 (C10 표식 판정 1·2).
 */
const MARK_LEFT = 'L';
const MARK_RIGHT = 'R';

/**
 * categorical(2, 'vivid') 시드 안에서 이 조각이 좌/우 정체성에 쓰는 인덱스.
 * "왼쪽과 오른쪽은 이름이 다르다" 는 이 조각 고유의 주장이라 다른 view 가 같은
 * 의미를 재현할 일이 없다 — 그래서 view-local 상수로 둔다 (S-view Exception).
 */
const SIDE_HUE_LEFT = 0;
const SIDE_HUE_RIGHT = 1;

type Side = 'L' | 'R';

type Cell = { depth: number; slot: number };
type Point = { x: number; y: number };

/**
 * 격자와 크기. 장면의 이음에서 셈한다 — 장면은 좌표를 모른다 (S-piece).
 */
type Layout = {
  cells: Map<string, Cell>;
  maxDepth: number;
  nodeR: number;
  /** 맨 아랫단 칸 사이의 간격. 캔버스 폭에서 역산한다. */
  leafStep: number;
  /** 맨 아랫단 첫 칸의 중심 x. */
  leafOriginX: number;
  captionTop: number;
  height: number;
};

type NodeEl = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
};

/** 채워진 가지 하나와 그 끝의 마디. 출발·도착 자리를 함께 쥔다. */
type BranchEl = {
  side: Side;
  line: SVGLineElement;
  badge: SVGGElement;
  from: Point;
  to: Point;
};

/** 채워지지 않은 빈 자리 하나. 점선 가지와 점선 테로 열려 있다. */
type GhostEl = {
  side: Side;
  line: SVGLineElement;
  badge: SVGGElement;
  ring: SVGCircleElement;
  from: Point;
  at: Point;
};

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function lerp(from: Point, to: Point, e: number): Point {
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}

/** 대략적인 글자 너비. CJK 는 한 칸, 라틴은 반 칸으로 셈해 줄바꿈만 판정한다. */
function estimateWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[ᄀ-ᇿ㄰-㆏가-힯　-〿一-鿿]/.test(ch)
      ? px
      : px * 0.55;
  }
  return w;
}

function wrapText(text: string, maxWidth: number, px: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur === '' ? word : `${cur} ${word}`;
    if (cur !== '' && estimateWidth(next, px) > maxWidth && lines.length < maxLines - 1) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines.slice(0, maxLines);
}

/**
 * 장면의 이음에서 격자를 셈한다.
 *
 * 가로는 맨 아랫단이 캔버스를 꽉 채우도록 잡고 (양끝 잎이 좌우 여백에 닿는다),
 * 위쪽 자리는 자기가 거느린 맨 아랫단 칸들의 한가운데에 놓인다. 크기를 상수로
 * 못박고 남는 폭을 여백으로 버리지 않기 위함이다 (S-piece).
 */
function layoutOf(scene: ParentTwoChildrenScene): Layout {
  const links = new Map(scene.links.map((n) => [n.id, n]));
  const cells = new Map<string, Cell>();
  let maxDepth = 0;

  const walk = (id: string, depth: number, slot: number): void => {
    if (cells.has(id) || depth > MAX_DEPTH) return;
    cells.set(id, { depth, slot });
    if (depth > maxDepth) maxDepth = depth;
    const link = links.get(id);
    if (link === undefined) return;
    if (link.left !== null) walk(link.left, depth + 1, slot * 2);
    if (link.right !== null) walk(link.right, depth + 1, slot * 2 + 1);
  };
  if (scene.root !== '') walk(scene.root, 0, 0);

  const W = PIECE_CANVAS_W;
  const cols = 2 ** maxDepth;
  const usable = W - SIDE_MIN * 2;
  const nodeR = Math.min(NODE_R_MAX, Math.floor((usable / cols) * 0.34));
  const leafStep = cols > 1 ? (usable - nodeR * 2) / (cols - 1) : 0;
  const leafOriginX = cols > 1 ? SIDE_MIN + nodeR : W / 2;
  const captionTop = PAD_TOP + LEVEL_GAP * maxDepth + nodeR + CAPTION_GAP;

  return {
    cells,
    maxDepth,
    nodeR,
    leafStep,
    leafOriginX,
    captionTop,
    height: captionTop + CAPTION_LINE_H * CAPTION_LINES,
  };
}

export const parentTwoChildrenStageView: CanvasView = {
  canvas: { height: INITIAL_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ParentTwoChildrenScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const sideColors = categorical(2, 'vivid');
    const colorOf = (side: Side): string =>
      side === 'L' ? sideColors[SIDE_HUE_LEFT] : sideColors[SIDE_HUE_RIGHT];
    const markOf = (side: Side): string => (side === 'L' ? MARK_LEFT : MARK_RIGHT);

    const W = PIECE_CANVAS_W;
    const captionPx = Number.parseFloat(fontSizes.md);

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number> = {},
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const captionLayer = el('g');
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(captionLayer);

    const captionLine1 = el('text', {
      x: W / 2,
      y: 0,
      'text-anchor': 'middle',
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      fill: c.textMuted,
    });
    const captionLine2 = el('text', {
      x: W / 2,
      y: 0,
      'text-anchor': 'middle',
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      fill: c.textMuted,
    });
    captionLayer.appendChild(captionLine1);
    captionLayer.appendChild(captionLine2);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 정적 그리기가 마디와 가지를 매번 새로 지으므로 살아남은 옛 프레임이 쥔 것은
     * 대개 떨어져 나간 노드다. 다만 그 손잡이를 담은 `nodeEls` · `branchEls` 는
     * 정적 그리기가 **재할당하는 클로저 변수**이고, 밀어 보기 걸음은 `await` 를
     * 둘 지난다 — 그 사이에 되짚기가 끼면 뒷마디가 새 손잡이를 타고 살아 있는
     * 화면에 쓴다. 걸음 함수는 깨어날 때마다 자기 세대를 보고, 아니면 화면에
     * 손대지 않고 물러난다 (S-scene).
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(myGen: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || typeof requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        const now = (): number => (typeof performance === 'object' ? performance.now() : Date.now());
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (!alive(myGen)) {
            finish();
            return;
          }
          const p = Math.min(1, (now() - started) / Math.max(1, ms));
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        draw(0);
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    // ── 지금 화면에 선 것들. 정적 그리기가 매번 새로 채운다.
    let layout: Layout = layoutOf({ root: '', links: [], rooted: false, opened: [], step: null, caption: null });
    const nodeEls = new Map<string, NodeEl>();
    const branchEls = new Map<string, BranchEl>();
    const ghostEls = new Map<string, GhostEl>();

    /** 격자 좌표 → 화면 좌표. */
    const pointAt = (cell: Cell): Point => {
      const span = 2 ** (layout.maxDepth - cell.depth);
      const first = cell.slot * span;
      const last = first + span - 1;
      return {
        x: layout.leafOriginX + layout.leafStep * ((first + last) / 2),
        y: PAD_TOP + LEVEL_GAP * cell.depth,
      };
    };

    const seatOf = (id: string): Point | null => {
      const cell = layout.cells.get(id);
      return cell === undefined ? null : pointAt(cell);
    };

    const makeBadge = (side: Side, at: Point): SVGGElement => {
      const g = el('g', { transform: `translate(${at.x} ${at.y})` });
      g.appendChild(
        el('rect', {
          x: -BADGE_W / 2,
          y: -BADGE_H / 2,
          width: BADGE_W,
          height: BADGE_H,
          rx: BADGE_R,
          fill: c.bg,
          stroke: colorOf(side),
          'stroke-width': 1.5,
        }),
      );
      const mark = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': fontSizes.sm,
        'font-family': fonts.body,
        'font-weight': 700,
        fill: colorOf(side),
      });
      mark.textContent = markOf(side);
      g.appendChild(mark);
      return g;
    };

    /** 마디 하나를 제 자리에 제 크기로 세운다. */
    const makeNode = (id: string, at: Point): NodeEl => {
      const group = el('g', { transform: `translate(${at.x} ${at.y})` });
      const circle = el('circle', {
        cx: 0,
        cy: 0,
        r: layout.nodeR,
        fill: c.bg,
        stroke: c.text,
        'stroke-width': 2,
      });
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': fontSizes.lg,
        'font-family': fonts.body,
        'font-weight': 600,
        fill: c.text,
      });
      label.textContent = id;
      group.appendChild(circle);
      group.appendChild(label);
      nodeLayer.appendChild(group);
      const node = { group, circle, label };
      nodeEls.set(id, node);
      return node;
    };

    /** 가지와 배지를 지금 자식 자리에 맞춰 다시 놓는다. */
    const layBranch = (
      line: SVGLineElement,
      badge: SVGGElement,
      from: Point,
      to: Point,
      progress: number,
    ): void => {
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
      badge.setAttribute('transform', `translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`);
      badge.setAttribute('opacity', String(Math.max(0, Math.min(1, progress))));
    };

    /**
     * 한 쪽 자리를 연다. 채워진 쪽은 가지와 마디, 빈 쪽은 점선 가지와 점선 테다.
     *
     * 다 자란 모습으로 곧바로 세운다 — 자라는 것은 걸음 함수가 뒤로 물렸다가
     * 되돌리는 방식으로 덧댄다.
     */
    const openSeat = (parentId: string, side: Side, childId: string | null): void => {
      const parentCell = layout.cells.get(parentId);
      if (parentCell === undefined) return;
      const childCell: Cell = {
        depth: parentCell.depth + 1,
        slot: parentCell.slot * 2 + (side === 'L' ? 0 : 1),
      };
      if (childCell.depth > layout.maxDepth) return;

      const from = pointAt(parentCell);
      const to = childId === null ? pointAt(childCell) : (seatOf(childId) ?? pointAt(childCell));
      const mid = lerp(from, to, 0.5);

      const line = el('line', {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: childId === null ? c.ghostOutline : colorOf(side),
        'stroke-width': childId === null ? 1.5 : 2.5,
        'stroke-linecap': 'round',
      });
      if (childId === null) line.setAttribute('stroke-dasharray', '5 5');
      edgeLayer.appendChild(line);

      const badge = makeBadge(side, mid);
      edgeLayer.appendChild(badge);

      if (childId === null) {
        const ring = el('circle', {
          cx: to.x,
          cy: to.y,
          r: layout.nodeR,
          fill: 'none',
          stroke: c.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 5',
        });
        nodeLayer.appendChild(ring);
        ghostEls.set(parentId, { side, line, badge, ring, from, at: to });
        return;
      }

      makeNode(childId, to);
      branchEls.set(childId, { side, line, badge, from, to });
    };

    const captionTextOf = (caption: ParentTwoChildrenCaption): string => {
      switch (caption.kind) {
        case 'seat':
          return t('caption.seat', 'It starts with one seat.');
        case 'splitRoot':
          return t('caption.splitRoot', 'One seat, two branches reaching down — a left and a right.');
        case 'splitAgain':
          return t('caption.splitAgain', 'Each new seat splits the same way: at most two, downward.');
        case 'splitOne':
          return t(
            'caption.splitOne',
            'Even a single child has a side. The other seat opens and stays empty.',
          );
        case 'sidesFixed':
          return t('caption.sidesFixed', 'Left and right are different names — they cannot trade places.');
      }
    };

    /** 캡션 두 줄을 늘 명시로 쓴다. 고정 자리라 재건 밖에 있다 (S-scene). */
    const drawCaption = (caption: ParentTwoChildrenCaption | null): void => {
      captionLine1.setAttribute('y', String(layout.captionTop));
      captionLine2.setAttribute('y', String(layout.captionTop + CAPTION_LINE_H));
      const lines =
        caption === null
          ? []
          : wrapText(captionTextOf(caption), W - SIDE_MIN * 2, captionPx, CAPTION_LINES);
      captionLine1.textContent = lines[0] ?? '';
      captionLine2.textContent = lines[1] ?? '';
    };

    /**
     * 장면이 말하는 것을 전부 세운다. 늘 비우고 시작하므로 되돌릴 명령이 없다.
     *
     * 갈라진 자리는 **쌓이고 남는 자취**라 하나도 빠짐없이 다시 세운다 — 그것이
     * 이 조각의 주장이다. 빈 자리도 그 자취의 일부다.
     */
    const settle = (scene: ParentTwoChildrenScene): void => {
      layout = layoutOf(scene);
      svg.setAttribute('viewBox', `0 0 ${W} ${layout.height}`);

      while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
      while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
      nodeEls.clear();
      branchEls.clear();
      ghostEls.clear();

      if (scene.rooted) {
        const seat = seatOf(scene.root);
        if (seat !== null) makeNode(scene.root, seat);
      }
      for (const split of scene.opened) {
        openSeat(split.parent, 'L', split.left);
        openSeat(split.parent, 'R', split.right);
      }

      drawCaption(scene.caption);
    };

    // ── 걸음. 정적으로 선 것을 출발 자리로 물렸다가 되돌린다. ──────────

    /** 뿌리 자리 하나가 위에서 내려앉는다. */
    async function runRoot(myGen: number, id: string): Promise<void> {
      const node = nodeEls.get(id);
      const seat = seatOf(id);
      if (node === undefined || seat === null) return;
      const drop = LEVEL_GAP * ROOT_DROP;
      const r = layout.nodeR;
      await animate(myGen, ROOT_MS, (p) => {
        const e = easeOut(p);
        node.group.setAttribute('transform', `translate(${seat.x} ${seat.y - drop * (1 - e)})`);
        node.circle.setAttribute('r', String(r * e));
        node.label.setAttribute('opacity', String(Math.max(0, (e - 0.4) / 0.6)));
      });
    }

    /**
     * 한 자리에서 아래로 두 자리가 함께 열린다.
     *
     * 둘은 한 뜻으로 묶인 운동이라 **시계 하나**로 돌린다 — 따로 돌리면 함께
     * 갈라진다는 것이 우연히 맞는 꼴이 된다 (S-scene).
     */
    async function runSplit(
      myGen: number,
      split: ParentTwoChildrenSplit,
    ): Promise<void> {
      const legs: ((e: number) => void)[] = [];
      const r = layout.nodeR;

      for (const childId of [split.left, split.right]) {
        if (childId === null) continue;
        const branch = branchEls.get(childId);
        const node = nodeEls.get(childId);
        if (branch === undefined || node === undefined) continue;
        legs.push((e: number) => {
          const now = lerp(branch.from, branch.to, e);
          node.group.setAttribute('transform', `translate(${now.x} ${now.y})`);
          node.circle.setAttribute('r', String(r * e));
          node.label.setAttribute('opacity', String(Math.max(0, (e - 0.45) / 0.55)));
          layBranch(branch.line, branch.badge, branch.from, now, e);
        });
      }

      const ghost = ghostEls.get(split.parent);
      if (ghost !== undefined) {
        legs.push((e: number) => {
          const now = lerp(ghost.from, ghost.at, e);
          ghost.ring.setAttribute('cx', String(now.x));
          ghost.ring.setAttribute('cy', String(now.y));
          ghost.ring.setAttribute('r', String(r * e));
          layBranch(ghost.line, ghost.badge, ghost.from, now, e);
        });
      }

      if (legs.length === 0) return;
      await animate(myGen, SPLIT_MS, (p) => {
        const e = easeOut(p);
        for (const leg of legs) leg(e);
      });
    }

    /**
     * 하나뿐인 자식을 반대쪽 빈 자리로 밀어 본다. 끝까지 가지 못하고 되돌아온다 —
     * 왼쪽과 오른쪽은 이름이 달라 자리를 바꿀 수 없다.
     */
    async function runReject(myGen: number, child: string, parent: string): Promise<void> {
      const node = nodeEls.get(child);
      const branch = branchEls.get(child);
      const ghost = ghostEls.get(parent);
      const seat = seatOf(child);
      const from = seatOf(parent);
      if (node === undefined || ghost === undefined || seat === null || from === null) return;

      const target = lerp(seat, ghost.at, REJECT_REACH);
      const move = (e: number): void => {
        const now = lerp(seat, target, e);
        node.group.setAttribute('transform', `translate(${now.x} ${now.y})`);
        if (branch !== undefined) layBranch(branch.line, branch.badge, from, now, 1);
      };

      node.circle.setAttribute('stroke', c.danger);
      branch?.line.setAttribute('stroke', c.danger);
      branch?.line.setAttribute('stroke-dasharray', '6 5');
      await animate(myGen, REJECT_OUT_MS, (p) => move(easeOut(p)));
      if (!alive(myGen)) return;
      await animate(myGen, REJECT_BACK_MS, (p) => move(1 - easeOut(p)));
    }

    /** 방금 밟은 걸음 하나만 흐르게 한다. */
    async function flow(scene: ParentTwoChildrenScene, myGen: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      switch (step.kind) {
        case 'root':
          await runRoot(myGen, step.id);
          return;
        case 'split':
          await runSplit(myGen, { parent: step.parent, left: step.left, right: step.right });
          return;
        case 'reject':
          await runReject(myGen, step.child, step.parent);
          return;
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 `opacity`
     * 와 보간의 끝자리가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게
     * 하기 때문이다. 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질 뿐이다.
     *
     * 돌려주는 Promise 는 장면이 다 선 뒤에 풀린다 — 이것이 바깥이 걸음의 끝을
     * 아는 유일한 통로다 (S-scene).
     */
    async function render(
      next: ParentTwoChildrenScene,
      /** 출발 그림을 장면과 격자에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: ParentTwoChildrenScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      await flow(next, myGen);
      if (alive(myGen)) settle(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다 (형제 넷과 같은 본).
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const layer of [edgeLayer, nodeLayer, captionLayer]) {
          if (layer.parentNode !== null) layer.parentNode.removeChild(layer);
        }
      },
    };
  },
};
