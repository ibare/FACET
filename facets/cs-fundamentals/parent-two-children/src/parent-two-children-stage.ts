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
 */

import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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
/** 캔버스 세로의 초기값. init 에서 트리 깊이로 다시 계산한다 (S-view). */
const INITIAL_H = 324;

const SPLIT_MS = 460;
const ROOT_MS = 300;
const REJECT_OUT_MS = 300;
const REJECT_BACK_MS = 240;
/** 빈 자리 쪽으로 밀어 보는 거리의 비율. 끝까지 가지 않고 되돌아온다. */
const REJECT_REACH = 0.58;

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

/** 한 자리와 그 아래 두 자리의 이음. null 이면 그 쪽 자리는 비어 있다. */
export type StageTreeLink = { id: string; left: string | null; right: string | null };
export type StageTree = { root: string; nodes: StageTreeLink[] };

type Cell = { depth: number; slot: number };
type Point = { x: number; y: number };

type Branch = {
  parent: string;
  side: Side;
  line: SVGLineElement;
  badge: SVGGElement;
};

type NodeEl = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
};

type Ghost = { side: Side; at: Point };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

/** 대략적인 글자 너비. CJK 는 한 칸, 라틴은 반 칸으로 셈해 줄바꿈만 판정한다. */
function estimateWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3000-\u303f\u4e00-\u9fff]/.test(ch)
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

export const parentTwoChildrenStageView: CanvasView = {
  canvas: { height: INITIAL_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const sideColors = categorical(2, 'vivid');
    const colorOf = (side: Side): string =>
      side === 'L' ? sideColors[SIDE_HUE_LEFT] : sideColors[SIDE_HUE_RIGHT];
    const markOf = (side: Side): string => (side === 'L' ? MARK_LEFT : MARK_RIGHT);

    const W = PIECE_CANVAS_W;
    const captionPx = Number.parseFloat(fontSizes.md);

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

    // ── 레이아웃 상태 (init 에서 트리를 받아 채운다)
    let links = new Map<string, StageTreeLink>();
    let cells = new Map<string, Cell>();
    let maxDepth = 0;
    /** 맨 아랫단 칸 사이의 간격. 캔버스 폭에서 역산한다. */
    let leafStep = 0;
    /** 맨 아랫단 첫 칸의 중심 x. */
    let leafOriginX = W / 2;
    let nodeR = NODE_R_MAX;

    // ── 그려진 것들
    const nodes = new Map<string, NodeEl>();
    const branches = new Map<string, Branch>();
    const ghosts = new Map<string, Ghost>();

    let disposed = false;

    /**
     * 격자 좌표 → 화면 좌표.
     *
     * 가로는 맨 아랫단이 캔버스를 꽉 채우도록 잡고 (양끝 잎이 좌우 여백에 닿는다),
     * 위쪽 자리는 자기가 거느린 맨 아랫단 칸들의 한가운데에 놓인다. 크기를
     * 상수로 못박고 남는 폭을 여백으로 버리지 않기 위함이다 (S-piece).
     */
    const pointAt = (cell: Cell): Point => {
      const span = 2 ** (maxDepth - cell.depth);
      const first = cell.slot * span;
      const last = first + span - 1;
      return {
        x: leafOriginX + leafStep * ((first + last) / 2),
        y: PAD_TOP + LEVEL_GAP * cell.depth,
      };
    };

    const seatOf = (id: string): Point | null => {
      const cell = cells.get(id);
      return cell === undefined ? null : pointAt(cell);
    };

    const tween = (durationMs: number, apply: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (disposed || typeof requestAnimationFrame !== 'function') {
          apply(1);
          resolve();
          return;
        }
        const now = (): number =>
          typeof performance === 'object' ? performance.now() : Date.now();
        const started = now();
        const frame = (): void => {
          if (disposed) {
            apply(1);
            resolve();
            return;
          }
          const p = Math.min(1, (now() - started) / Math.max(1, durationMs));
          apply(p);
          if (p >= 1) {
            resolve();
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });

    const makeBadge = (side: Side): SVGGElement => {
      const g = el('g', { opacity: 0 });
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

    const makeNode = (id: string, at: Point): NodeEl => {
      const group = el('g', { transform: `translate(${at.x} ${at.y})` });
      const circle = el('circle', {
        cx: 0,
        cy: 0,
        r: 0,
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
        opacity: 0,
      });
      label.textContent = id;
      group.appendChild(circle);
      group.appendChild(label);
      nodeLayer.appendChild(group);
      return { group, circle, label };
    };

    /** 부모 자리와 지금 자식 위치로 가지·배지를 다시 놓는다. */
    const layBranch = (branch: Branch, from: Point, to: Point, progress: number): void => {
      branch.line.setAttribute('x2', String(to.x));
      branch.line.setAttribute('y2', String(to.y));
      branch.badge.setAttribute(
        'transform',
        `translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`,
      );
      branch.badge.setAttribute('opacity', String(Math.max(0, Math.min(1, progress))));
    };

    /**
     * 한 쪽 가지를 만들고, 진행률을 받아 자라게 하는 함수를 돌려준다.
     * childId 가 null 이면 채워지지 않은 빈 자리 — 점선으로 같은 만큼 열린다.
     */
    const openSeat = (
      parentId: string,
      from: Point,
      parentCell: Cell,
      side: Side,
      childId: string | null,
    ): ((p: number) => void) | null => {
      const childCell: Cell = {
        depth: parentCell.depth + 1,
        slot: parentCell.slot * 2 + (side === 'L' ? 0 : 1),
      };
      if (childCell.depth > maxDepth) return null;
      const to = childId === null ? pointAt(childCell) : (seatOf(childId) ?? pointAt(childCell));

      const line = el('line', {
        x1: from.x,
        y1: from.y,
        x2: from.x,
        y2: from.y,
        stroke: childId === null ? c.ghostOutline : colorOf(side),
        'stroke-width': childId === null ? 1.5 : 2.5,
        'stroke-linecap': 'round',
      });
      if (childId === null) line.setAttribute('stroke-dasharray', '5 5');
      edgeLayer.appendChild(line);

      const badge = makeBadge(side);
      edgeLayer.appendChild(badge);

      if (childId === null) {
        const ring = el('circle', {
          cx: to.x,
          cy: to.y,
          r: 0,
          fill: 'none',
          stroke: c.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 5',
        });
        nodeLayer.appendChild(ring);
        ghosts.set(parentId, { side, at: to });
        return (p: number) => {
          const e = easeOut(p);
          const now = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
          line.setAttribute('x2', String(now.x));
          line.setAttribute('y2', String(now.y));
          ring.setAttribute('r', String(nodeR * e));
          badge.setAttribute(
            'transform',
            `translate(${(from.x + now.x) / 2} ${(from.y + now.y) / 2})`,
          );
          badge.setAttribute('opacity', String(e));
        };
      }

      const node = makeNode(childId, from);
      nodes.set(childId, node);
      const branch: Branch = { parent: parentId, side, line, badge };
      branches.set(childId, branch);

      return (p: number) => {
        const e = easeOut(p);
        const now = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        node.group.setAttribute('transform', `translate(${now.x} ${now.y})`);
        node.circle.setAttribute('r', String(nodeR * e));
        node.label.setAttribute('opacity', String(Math.max(0, (e - 0.45) / 0.55)));
        layBranch(branch, from, now, e);
      };
    };

    const clear = (): void => {
      while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
      while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
      nodes.clear();
      branches.clear();
      ghosts.clear();
      captionLine1.textContent = '';
      captionLine2.textContent = '';
    };

    const instance: ViewInstance = {
      /** 트리를 받아 격자 좌표와 캔버스 높이를 정한다. 아직 아무것도 그리지 않는다. */
      init(tree: StageTree): void {
        links = new Map(tree.nodes.map((n) => [n.id, n]));
        cells = new Map();
        maxDepth = 0;

        const walk = (id: string, depth: number, slot: number): void => {
          if (cells.has(id) || depth > 8) return;
          cells.set(id, { depth, slot });
          if (depth > maxDepth) maxDepth = depth;
          const link = links.get(id);
          if (link === undefined) return;
          if (link.left !== null) walk(link.left, depth + 1, slot * 2);
          if (link.right !== null) walk(link.right, depth + 1, slot * 2 + 1);
        };
        walk(tree.root, 0, 0);

        const cols = 2 ** maxDepth;
        const usable = W - SIDE_MIN * 2;
        nodeR = Math.min(NODE_R_MAX, Math.floor((usable / cols) * 0.34));
        leafStep = cols > 1 ? (usable - nodeR * 2) / (cols - 1) : 0;
        leafOriginX = cols > 1 ? SIDE_MIN + nodeR : W / 2;

        const treeBottom = PAD_TOP + LEVEL_GAP * maxDepth + nodeR;
        const captionTop = treeBottom + CAPTION_GAP;
        captionLine1.setAttribute('y', String(captionTop));
        captionLine2.setAttribute('y', String(captionTop + CAPTION_LINE_H));
        const height = captionTop + CAPTION_LINE_H * CAPTION_LINES;
        svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

        clear();
      },

      setCaption(text: string): void {
        const lines = wrapText(text, W - SIDE_MIN * 2, captionPx, CAPTION_LINES);
        captionLine1.textContent = lines[0] ?? '';
        captionLine2.textContent = lines[1] ?? '';
      },

      /** 뿌리 자리 하나가 위에서 내려앉는다. */
      async placeRoot(id: string): Promise<void> {
        const seat = seatOf(id);
        if (seat === null) return;
        const node = makeNode(id, { x: seat.x, y: seat.y - LEVEL_GAP * 0.3 });
        nodes.set(id, node);
        await tween(ROOT_MS, (p) => {
          const e = easeOut(p);
          const y = seat.y - LEVEL_GAP * 0.3 * (1 - e);
          node.group.setAttribute('transform', `translate(${seat.x} ${y})`);
          node.circle.setAttribute('r', String(nodeR * e));
          node.label.setAttribute('opacity', String(Math.max(0, (e - 0.4) / 0.6)));
        });
      },

      /** 한 자리에서 아래로 두 자리가 함께 열린다. 채워지지 않은 쪽은 빈 자리로 남는다. */
      async split(parent: string, left: string | null, right: string | null): Promise<void> {
        const from = seatOf(parent);
        const cell = cells.get(parent);
        if (from === null || cell === undefined) return;

        const growLeft = openSeat(parent, from, cell, 'L', left);
        const growRight = openSeat(parent, from, cell, 'R', right);
        if (growLeft === null && growRight === null) return;

        await tween(SPLIT_MS, (p) => {
          growLeft?.(p);
          growRight?.(p);
        });
      },

      /**
       * 하나뿐인 자식을 반대쪽 빈 자리로 밀어 본다. 끝까지 가지 못하고 되돌아온다 —
       * 왼쪽과 오른쪽은 이름이 달라 자리를 바꿀 수 없다.
       */
      async rejectSwap(child: string, parent: string): Promise<void> {
        const seat = seatOf(child);
        const from = seatOf(parent);
        const ghost = ghosts.get(parent);
        const node = nodes.get(child);
        const branch = branches.get(child);
        if (seat === null || from === null || ghost === undefined || node === undefined) return;

        const target = {
          x: seat.x + (ghost.at.x - seat.x) * REJECT_REACH,
          y: seat.y + (ghost.at.y - seat.y) * REJECT_REACH,
        };
        const move = (e: number): void => {
          const now = { x: seat.x + (target.x - seat.x) * e, y: seat.y + (target.y - seat.y) * e };
          node.group.setAttribute('transform', `translate(${now.x} ${now.y})`);
          if (branch !== undefined) layBranch(branch, from, now, 1);
        };

        node.circle.setAttribute('stroke', c.danger);
        branch?.line.setAttribute('stroke', c.danger);
        branch?.line.setAttribute('stroke-dasharray', '6 5');
        await tween(REJECT_OUT_MS, (p) => move(easeOut(p)));
        await tween(REJECT_BACK_MS, (p) => move(1 - easeOut(p)));
        node.circle.setAttribute('stroke', c.text);
        if (branch !== undefined) {
          branch.line.setAttribute('stroke', colorOf(branch.side));
          branch.line.removeAttribute('stroke-dasharray');
        }
      },

      /** 처음으로 되돌린다 — 그려진 것을 모두 지운다. */
      clear(): void {
        clear();
      },

      destroy(): void {
        disposed = true;
        clear();
        for (const layer of [edgeLayer, nodeLayer, captionLayer]) {
          if (layer.parentNode !== null) layer.parentNode.removeChild(layer);
        }
      },
    };

    return instance;
  },
};
