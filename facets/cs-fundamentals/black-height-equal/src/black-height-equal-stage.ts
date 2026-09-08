/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 그 view 는 트리 골격과 커서까지는
 * 주지만 걸음마다 바뀌는 캡션과, 길마다 쌓이는 검은 셈을 얹을 자리가 없다.
 * 이 조각은 "지금 몇 개째를 세고 있는가" 가 그림의 절반이라 같은 캔버스 안에
 * 그 둘이 있어야 한다 (원칙 6 의 예외 조건).
 *
 * black-height-equal-stage — 레드-블랙 트리를 그리고, 커서가 뿌리 아래
 * 한 경로를 따라 실제로 내려갔다가(walking) 다시 뿌리로 올라오는(returning)
 * 움직임을 SVG 좌표 이동으로 보여 준다.
 *
 * 노드 채움색은 그 자리의 값(빨강/검정)이다 — 방문 여부로 다시 칠하지 않는다.
 * "지금 어디를 보고 있는지" · "셈에 들어갔는지" 는 커서 링으로만 표현한다.
 *
 * projector 가 호출하는 메서드
 *   init(data)          트리 구조를 그린다. 커서는 뿌리 위에서 숨어 있다.
 *   visitStep(payload)  커서가 한 자리로 옮겨 간다(실제 좌표 이동).
 *   settlePath(payload) 그 경로의 검은 수를 nil 자리 곁에 남기고, 커서가
 *                        뿌리로 돌아간다(실제 좌표 이동).
 *   settleAll(payload)  남은 배지 전부가 같은 수라는 것을 강조한다.
 *   rewind(payload)      배지를 지우고 커서를 뿌리로 되돌린다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, PIECE_CANVAS_W, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

type RBColor = 'red' | 'black';

type RBNodeLike = {
  id: string;
  value: number;
  color: RBColor;
  left?: RBNodeLike;
  right?: RBNodeLike;
};

type Placed = {
  id: string;
  kind: 'node' | 'nil';
  x: number;
  y: number;
  value?: number;
  color?: RBColor;
};

type PlacedEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'real' | 'nil';
};

const H = 310;
const SIDE_MIN = 30;
const TOP_PAD = 40;
const ROW_GAP = 62;
const NODE_R = 20;
const NIL_HALF_W = 15;
const NIL_HALF_H = 10;
const CURSOR_R = NODE_R + 7;
const BADGE_OFFSET_Y = 30;
const BADGE_HALF_W = 14;
const BADGE_HALF_H = 10;
const CAPTION_Y = H - 20;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 트리를 실제로 따라 내려가며 좌표를 매긴다. 자식이 둘 다 없는 노드는 nil
 * 자리 하나를 자기 바로 아래 가운데 둔다 — algorithm.ts 의 buildPaths 가
 * 세는 경로와 같은 자리를 가리키도록 맞춘다.
 */
function layoutTree(root: RBNodeLike): { nodes: Placed[]; edges: PlacedEdge[] } {
  const nodes: Placed[] = [];
  const edges: PlacedEdge[] = [];

  function place(node: RBNodeLike, xMin: number, xMax: number, depth: number): Placed {
    const x = (xMin + xMax) / 2;
    const y = TOP_PAD + depth * ROW_GAP;
    const entry: Placed = { id: node.id, kind: 'node', x, y, value: node.value, color: node.color };
    nodes.push(entry);

    const isLeaf = !node.left && !node.right;
    if (isLeaf) {
      const ny = TOP_PAD + (depth + 1) * ROW_GAP;
      nodes.push({ id: node.id, kind: 'nil', x, y: ny });
      edges.push({ x1: x, y1: y, x2: x, y2: ny, kind: 'nil' });
      return entry;
    }

    if (node.left) {
      const c = place(node.left, xMin, x, depth + 1);
      edges.push({ x1: x, y1: y, x2: c.x, y2: c.y, kind: 'real' });
    } else {
      const nx = (xMin + x) / 2;
      const ny = TOP_PAD + (depth + 1) * ROW_GAP;
      nodes.push({ id: node.id, kind: 'nil', x: nx, y: ny });
      edges.push({ x1: x, y1: y, x2: nx, y2: ny, kind: 'nil' });
    }

    if (node.right) {
      const c = place(node.right, x, xMax, depth + 1);
      edges.push({ x1: x, y1: y, x2: c.x, y2: c.y, kind: 'real' });
    } else {
      const nx = (x + xMax) / 2;
      const ny = TOP_PAD + (depth + 1) * ROW_GAP;
      nodes.push({ id: node.id, kind: 'nil', x: nx, y: ny });
      edges.push({ x1: x, y1: y, x2: nx, y2: ny, kind: 'nil' });
    }

    return entry;
  }

  place(root, SIDE_MIN, PIECE_CANVAS_W - SIDE_MIN, 0);
  return { nodes, edges };
}

export const blackHeightEqualStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const colors = getColors(params.theme);
    const svg = params.canvas;

    const edgesG = el('g');
    const nilG = el('g');
    const nodesG = el('g');
    const cursorG = el('g');
    const badgesG = el('g');
    const captionG = el('g');
    svg.append(edgesG, nilG, nodesG, cursorG, badgesG, captionG);

    // 좌표(key → x/y). visitStep/settlePath 가 target 을 이 자리로 옮긴다.
    const positions = new Map<string, { x: number; y: number }>();
    const badgeTimers: ReturnType<typeof setTimeout>[] = [];

    // 커서 — accent 링. counted 이면 실선, 건너뛴 자리(빨강)면 점선.
    const cursorRing = el('circle', {
      r: CURSOR_R,
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 3,
    });
    cursorG.appendChild(cursorRing);
    cursorG.style.transition = 'transform 260ms ease';
    cursorG.style.opacity = '0';

    const captionText = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    captionG.appendChild(captionText);

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function nodeFill(color: RBColor): string {
      return color === 'red' ? colors.danger : colors.primary;
    }
    function nodeInk(color: RBColor): string {
      return color === 'red' ? colors.stateInk : colors.textInverse;
    }

    function moveCursorTo(x: number, y: number, counted: boolean): void {
      cursorG.style.transform = `translate(${x}px, ${y}px)`;
      cursorG.style.opacity = '1';
      cursorRing.setAttribute('stroke', counted ? colors.accent : colors.textMuted);
      cursorRing.setAttribute('stroke-dasharray', counted ? '' : '4 3');
    }

    function drawTree(root: RBNodeLike): void {
      edgesG.replaceChildren();
      nilG.replaceChildren();
      nodesG.replaceChildren();
      badgesG.replaceChildren();
      positions.clear();

      const { nodes, edges } = layoutTree(root);

      for (const e of edges) {
        edgesG.appendChild(
          el('line', {
            x1: e.x1,
            y1: e.y1,
            x2: e.x2,
            y2: e.y2,
            stroke: e.kind === 'real' ? colors.border : colors.textMuted,
            'stroke-width': 2,
            'stroke-dasharray': e.kind === 'real' ? '' : '3 3',
          }),
        );
      }

      for (const n of nodes) {
        positions.set(`${n.kind}:${n.id}`, { x: n.x, y: n.y });
        if (n.kind === 'node' && n.color !== undefined && n.value !== undefined) {
          const g = el('g');
          g.appendChild(
            el('circle', { cx: n.x, cy: n.y, r: NODE_R, fill: nodeFill(n.color), stroke: colors.border, 'stroke-width': 1 }),
          );
          const label = el('text', {
            x: n.x,
            y: n.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: nodeInk(n.color),
          });
          label.textContent = String(n.value);
          g.appendChild(label);
          nodesG.appendChild(g);
        } else if (n.kind === 'nil') {
          const g = el('g');
          g.appendChild(
            el('rect', {
              x: n.x - NIL_HALF_W,
              y: n.y - NIL_HALF_H,
              width: NIL_HALF_W * 2,
              height: NIL_HALF_H * 2,
              rx: 3,
              fill: colors.bgSubtle,
              stroke: colors.primary,
              'stroke-width': 1.5,
            }),
          );
          const label = el('text', {
            x: n.x,
            y: n.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.primary,
          });
          label.textContent = 'NIL';
          g.appendChild(label);
          nilG.appendChild(g);
        }
      }

      // 커서는 뿌리 위에서 숨어 시작한다.
      const rootPos = positions.get(`node:${root.id}`);
      if (rootPos) {
        cursorG.style.transition = 'none';
        cursorG.style.transform = `translate(${rootPos.x}px, ${rootPos.y}px)`;
        cursorG.style.opacity = '0';
        // 다음 변경부터 다시 애니메이션 — 강제 reflow 로 transition:none 을 확정.
        void cursorG.getBoundingClientRect();
        cursorG.style.transition = 'transform 260ms ease';
      }
    }

    function returnCursorToRoot(rootId: string): void {
      const pos = positions.get(`node:${rootId}`);
      if (!pos) return;
      cursorG.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      cursorRing.setAttribute('stroke', colors.accent);
      cursorRing.setAttribute('stroke-dasharray', '');
    }

    let rootId = '';

    return {
      destroy() {
        for (const t of badgeTimers) clearTimeout(t);
        svg.replaceChildren();
      },

      init(data: { root: RBNodeLike }) {
        const root = data.root;
        rootId = root.id;
        drawTree(root);
        setCaption('');
      },

      visitStep(payload: {
        id: string;
        kind: 'node' | 'nil';
        counted: boolean;
        caption: string;
      }) {
        const pos = positions.get(`${payload.kind}:${payload.id}`);
        if (pos) moveCursorTo(pos.x, pos.y, payload.counted);
        setCaption(payload.caption);
      },

      settlePath(payload: { blackCount: number; nilId: string; caption: string }) {
        const pos = positions.get(`nil:${payload.nilId}`);
        if (pos) {
          const chip = el('g');
          chip.appendChild(
            el('rect', {
              x: pos.x - BADGE_HALF_W,
              y: pos.y + BADGE_OFFSET_Y - BADGE_HALF_H,
              width: BADGE_HALF_W * 2,
              height: BADGE_HALF_H * 2,
              rx: 4,
              fill: colors.accent,
            }),
          );
          const label = el('text', {
            x: pos.x,
            y: pos.y + BADGE_OFFSET_Y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.stateInk,
          });
          label.textContent = String(payload.blackCount);
          chip.appendChild(label);
          badgesG.appendChild(chip);
        }
        setCaption(payload.caption);
        returnCursorToRoot(rootId);
      },

      settleAll(payload: { caption: string }) {
        setCaption(payload.caption);
        // 배지 전부를 잠깐 키워 강조한다 — 크기 변화라 opacity 전환이 아니다.
        for (const chip of Array.from(badgesG.children)) {
          const g = chip as SVGGElement;
          g.style.transition = 'transform 220ms ease';
          g.style.transformBox = 'fill-box';
          g.style.transformOrigin = 'center';
          g.style.transform = 'scale(1.3)';
          const t = setTimeout(() => {
            g.style.transform = 'scale(1)';
          }, 220);
          badgeTimers.push(t);
        }
      },

      rewind(payload: { caption: string }) {
        badgesG.replaceChildren();
        setCaption(payload.caption);
        returnCursorToRoot(rootId);
      },
    };
  },
};
