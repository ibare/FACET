/**
 * indegree-zero-first-stage — "떨어져 나온다" 를 그리는 캔버스.
 *
 * ── 왜 이 배치인가
 * 이 조각의 동사는 낙하다. 그래서 위에는 그래프를, 아래에는 나온 순서를 담는
 * 줄을 둔다. 정점이 이고 있는 화살의 수는 머리 위에 얹힌 배지로 보이고, 그것이
 * 0 이 되어야 정점이 아래 줄로 **떨어진다.** 화살이 사라질 때도 그냥 꺼지지 않고
 * 떨어져 나가며, 배지의 옛 숫자도 함께 떨어진다. 화면의 모든 소멸이 낙하다.
 *
 * ── 같은 층 안에서는 아래부터 알파벳 순으로 쌓는다
 * 층(가장 긴 경로 깊이) 이 열을 정하고, 같은 층 안의 세로 자리는 알파벳이
 * 앞선 것을 아래에 둔다. 먼저 떨어질 것이 아래에 있어야 낙하 경로가 비어 있다 —
 * 위의 것이 아래의 것을 뚫고 지나가는 그림이 나오지 않는다.
 *
 * ── 가로는 캔버스에서 역산한다
 * 순서 줄의 칸 폭을 정점 수로 나눠 얻고, 그 첫 칸과 끝 칸의 중심이 그래프
 * 열의 좌우 끝이 된다. 상수는 칸 폭의 **상한** 하나뿐이다 (S-piece).
 *
 * 세로는 마운트 뒤 바뀌지 않는다. 층이 많아지면 층 간격을 줄여 담는다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스
const W = PIECE_CANVAS_W;
const H = 300;
const CANVAS_PAD = 16;

// ── 순서 줄 (아래)
const SLOT_MAX_W = 88;
const SLOT_H = 48;
const TRACK_Y = 236;

// ── 그래프 (위)
const NODE_R = 21;
const GRAPH_MID_Y = 116;
const GRAPH_BAND_H = 100;
const ROW_GAP_MAX = 100;
const BADGE_W = 26;
const BADGE_H = 20;
/** 배지가 머리에 얹히는 높이 — 정점 위쪽 경계에서 이만큼 띄운다. */
const BADGE_LIFT = 3;
/** 층을 건너뛰는 간선이 가운데 정점 아래로 돌아가는 깊이. */
const BOW_DIP = 40;
const ARROW_LEN = 9;
const ARROW_HALF = 4.5;

const CAPTION_Y = 288;

// ── 낙하 거리
const FALL_ARROW = 54;
const FALL_BADGE = 46;
const FALL_GHOST = 40;

// ── 시간
const D_BADGE_IN = 260;
const D_BADGE_STAGGER = 60;
const D_ARROW_HOLD = 140;
const D_ARROW_FALL = 340;
const D_READY_BOB = 240;
const D_TAKE_FALL = 420;
const D_FINISH_STEP = 90;

const EASE_FALL = 'cubic-bezier(0.42, 0, 0.75, 0.4)';

export type IndegreeStageEdge = { from: string; to: string };
export type IndegreeStageGraph = { nodes: string[]; edges: IndegreeStageEdge[] };
export type IndegreeStageCount = { id: string; count: number };
export type IndegreeStageDrop = { to: string; was: number; now: number };

type Pt = { x: number; y: number };

type BadgeVisual = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  at: Pt;
};

type NodeVisual = {
  id: string;
  at: Pt;
  g: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  badge: BadgeVisual | null;
  taken: boolean;
};

type EdgeVisual = {
  key: string;
  g: SVGGElement;
  path: SVGPathElement;
  head: SVGPolygonElement;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function glyph(at: Pt, value: string, fill: string, size: string, weight: string): SVGTextElement {
  const t = svg('text', {
    x: at.x,
    y: at.y,
    fill,
    'font-family': fonts.mono,
    'font-size': size,
    'font-weight': weight,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  t.textContent = value;
  return t;
}

function translate(x: number, y: number): string {
  return `translate(${x}px, ${y}px)`;
}

/** 가장 긴 경로 깊이 = 열 번호. DAG 면 정점 수만큼 완화하면 수렴한다. */
function computeDepths(nodes: string[], edges: IndegreeStageEdge[]): Map<string, number> {
  const depth = new Map<string, number>();
  for (const id of nodes) depth.set(id, 0);
  for (let round = 0; round < nodes.length; round++) {
    let changed = false;
    for (const e of edges) {
      const cand = (depth.get(e.from) ?? 0) + 1;
      if (cand > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, cand);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export const indegreeZeroFirstStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c = getColors(params.theme);
    const root = params.canvas;

    let destroyed = false;
    /** 진행 중인 지연. destroy 시 전부 걷고 대기 중인 약속을 풀어 준다. */
    const pending = new Map<ReturnType<typeof setTimeout>, () => void>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const id = setTimeout(() => {
          pending.delete(id);
          resolve();
        }, ms);
        pending.set(id, resolve);
      });

    /** 갓 만든 요소가 초기 상태를 한 번 커밋하도록 한 프레임 넘긴다. */
    const frame = (): Promise<void> => wait(20);

    function clearPending(): void {
      for (const [id, resolve] of pending) {
        clearTimeout(id);
        resolve();
      }
      pending.clear();
    }

    // ── 가로 배치는 순서 줄에서 역산한다.
    let slotW = SLOT_MAX_W;
    let firstX = CANVAS_PAD + slotW / 2;
    let lastX = W - firstX;

    let graph: IndegreeStageGraph = { nodes: [], edges: [] };
    const nodeMap = new Map<string, NodeVisual>();
    const edgeMap = new Map<string, EdgeVisual>();
    const slotCenters: number[] = [];

    let gTrack = svg('g');
    let gEdges = svg('g');
    let gNodes = svg('g');
    let gBadges = svg('g');
    let gFx = svg('g');
    let captionEl = glyph({ x: W / 2, y: CAPTION_Y }, '', c.text, fontSizes.md, '500');

    function spanX(index: number, count: number): number {
      if (count <= 1) return W / 2;
      return firstX + (index * (lastX - firstX)) / (count - 1);
    }

    function badgeAnchor(at: Pt): Pt {
      return { x: at.x, y: at.y - NODE_R - BADGE_LIFT - BADGE_H / 2 };
    }

    function paintBlocked(node: NodeVisual): void {
      node.circle.setAttribute('fill', c.itemDefault);
      node.circle.setAttribute('stroke', c.border);
      node.label.setAttribute('fill', c.text);
    }

    function paintReady(node: NodeVisual): void {
      node.circle.setAttribute('fill', c.itemPivot);
      node.circle.setAttribute('stroke', c.stateInk);
      node.label.setAttribute('fill', c.stateInk);
      if (node.badge) {
        node.badge.rect.setAttribute('fill', c.itemPivot);
        node.badge.rect.setAttribute('stroke', c.stateInk);
        node.badge.label.setAttribute('fill', c.stateInk);
      }
    }

    function paintTaken(node: NodeVisual): void {
      node.circle.setAttribute('fill', c.itemSorted);
      node.circle.setAttribute('stroke', c.itemSorted);
      node.label.setAttribute('fill', c.textInverse);
    }

    function buildTrack(count: number): void {
      slotCenters.length = 0;
      for (let i = 0; i < count; i++) {
        const cx = spanX(i, count);
        slotCenters.push(cx);
        gTrack.appendChild(
          svg('rect', {
            x: cx - slotW / 2,
            y: TRACK_Y - SLOT_H / 2,
            width: slotW,
            height: SLOT_H,
            rx: 10,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
        gTrack.appendChild(
          glyph(
            { x: cx - slotW / 2 + 12, y: TRACK_Y - SLOT_H / 2 + 12 },
            String(i + 1),
            c.textMuted,
            fontSizes.xs,
            '500',
          ),
        );
      }
    }

    function buildNodes(): void {
      const depth = computeDepths(graph.nodes, graph.edges);
      const columns = new Map<number, string[]>();
      for (const id of graph.nodes) {
        const d = depth.get(id) ?? 0;
        const bucket = columns.get(d);
        if (bucket) bucket.push(id);
        else columns.set(d, [id]);
      }
      const depths = [...columns.keys()].sort((a, b) => a - b);
      const tallest = Math.max(1, ...[...columns.values()].map((v) => v.length));
      const rowGap =
        tallest > 1 ? Math.min(ROW_GAP_MAX, Math.floor(GRAPH_BAND_H / (tallest - 1))) : 0;

      depths.forEach((d, columnIndex) => {
        // 아래부터 알파벳 순 — 먼저 떨어질 것이 아래에 있어야 길이 비어 있다.
        const members = (columns.get(d) ?? []).slice().sort();
        const k = members.length;
        members.forEach((id, i) => {
          const at = {
            x: spanX(columnIndex, depths.length),
            y: GRAPH_MID_Y + ((k - 1) / 2 - i) * rowGap,
          };
          const g = svg('g');
          g.style.transform = translate(at.x, at.y);
          const circle = svg('circle', { cx: 0, cy: 0, r: NODE_R, 'stroke-width': 2 });
          const label = glyph({ x: 0, y: 0 }, id, c.text, fontSizes.md, '700');
          g.append(circle, label);
          gNodes.appendChild(g);

          const anchor = badgeAnchor(at);
          const bg = svg('g');
          bg.style.transform = translate(0, -14);
          bg.style.opacity = '0';
          const rect = svg('rect', {
            x: anchor.x - BADGE_W / 2,
            y: anchor.y - BADGE_H / 2,
            width: BADGE_W,
            height: BADGE_H,
            rx: 6,
            fill: c.bg,
            stroke: c.border,
            'stroke-width': 1.5,
          });
          const badgeLabel = glyph(anchor, '', c.text, fontSizes.sm, '700');
          badgeLabel.style.transform = translate(0, 0);
          bg.append(rect, badgeLabel);
          gBadges.appendChild(bg);

          const node: NodeVisual = {
            id,
            at,
            g,
            circle,
            label,
            badge: { g: bg, rect, label: badgeLabel, at: anchor },
            taken: false,
          };
          paintBlocked(node);
          nodeMap.set(id, node);
        });
      });
    }

    function buildEdges(): void {
      const depth = computeDepths(graph.nodes, graph.edges);
      for (const e of graph.edges) {
        const from = nodeMap.get(e.from);
        const to = nodeMap.get(e.to);
        if (!from || !to) continue;

        const skips = (depth.get(e.to) ?? 0) - (depth.get(e.from) ?? 0) >= 2;
        let d: string;
        let tip: Pt;
        let dir: Pt;

        if (skips) {
          // 가운데 열 아래로 돌아 내려갔다 올라온다. 곧게 그으면 사이에 있는
          // 정점의 배지를 가로지른다.
          const flatY = (from.at.y + to.at.y) / 2;
          const dip = Math.min(GRAPH_MID_Y + BOW_DIP, TRACK_Y - SLOT_H / 2 - 14);
          const ctrl = { x: (from.at.x + to.at.x) / 2, y: 2 * dip - flatY };
          const u0 = unit(from.at, ctrl);
          const u1 = unit(ctrl, to.at);
          const p0 = { x: from.at.x + u0.x * (NODE_R + 3), y: from.at.y + u0.y * (NODE_R + 3) };
          tip = { x: to.at.x - u1.x * (NODE_R + 6), y: to.at.y - u1.y * (NODE_R + 6) };
          dir = u1;
          d = `M ${p0.x} ${p0.y} Q ${ctrl.x} ${ctrl.y} ${tip.x} ${tip.y}`;
        } else {
          const u = unit(from.at, to.at);
          const p0 = { x: from.at.x + u.x * (NODE_R + 3), y: from.at.y + u.y * (NODE_R + 3) };
          tip = { x: to.at.x - u.x * (NODE_R + 6), y: to.at.y - u.y * (NODE_R + 6) };
          dir = u;
          d = `M ${p0.x} ${p0.y} L ${tip.x} ${tip.y}`;
        }

        const g = svg('g');
        g.style.transform = translate(0, 0);
        g.style.opacity = '1';
        const path = svg('path', {
          d,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        const back = { x: tip.x - dir.x * ARROW_LEN, y: tip.y - dir.y * ARROW_LEN };
        const perp = { x: -dir.y, y: dir.x };
        const head = svg('polygon', {
          points: [
            `${tip.x},${tip.y}`,
            `${back.x + perp.x * ARROW_HALF},${back.y + perp.y * ARROW_HALF}`,
            `${back.x - perp.x * ARROW_HALF},${back.y - perp.y * ARROW_HALF}`,
          ].join(' '),
          fill: c.textMuted,
        });
        g.append(path, head);
        gEdges.appendChild(g);
        edgeMap.set(`${e.from}>${e.to}`, { key: `${e.from}>${e.to}`, g, path, head });
      }
    }

    function rebuild(): void {
      clearPending();
      nodeMap.clear();
      edgeMap.clear();
      // 컨테이너가 아니라 캔버스 **안쪽**을 비운다 (S-view).
      root.textContent = '';

      const n = Math.max(1, graph.nodes.length);
      slotW = Math.min(SLOT_MAX_W, Math.floor((W - CANVAS_PAD * 2) / n) - 8);
      firstX = CANVAS_PAD + slotW / 2;
      lastX = W - firstX;

      gTrack = svg('g');
      gEdges = svg('g');
      gNodes = svg('g');
      gBadges = svg('g');
      gFx = svg('g');
      captionEl = glyph({ x: W / 2, y: CAPTION_Y }, '', c.text, fontSizes.md, '500');
      captionEl.setAttribute('font-family', fonts.body);
      root.append(gTrack, gEdges, gNodes, gBadges, gFx, captionEl);

      buildTrack(graph.nodes.length);
      buildNodes();
      buildEdges();
    }

    return {
      destroy(): void {
        destroyed = true;
        clearPending();
        root.textContent = '';
      },

      setCaption(text: string): void {
        captionEl.textContent = text;
      },

      setGraph(next: IndegreeStageGraph): void {
        graph = { nodes: [...next.nodes], edges: next.edges.map((e) => ({ ...e })) };
        rebuild();
      },

      rewind(): void {
        rebuild();
      },

      /** 센 수가 머리 위로 내려앉는다. */
      async showCounts(counts: IndegreeStageCount[]): Promise<void> {
        for (const item of counts) {
          const node = nodeMap.get(item.id);
          if (!node?.badge) continue;
          node.badge.label.textContent = String(item.count);
          node.badge.g.style.transition = `transform ${D_BADGE_IN}ms ${EASE_FALL}, opacity ${D_BADGE_IN}ms linear`;
          node.badge.g.style.transform = translate(0, 0);
          node.badge.g.style.opacity = '1';
          await wait(D_BADGE_STAGGER);
        }
        await wait(D_BADGE_IN);
      },

      /** 0 이 된 것들이 헐거워진다 — 한 번 주저앉았다 돌아온다. */
      async markReady(ids: string[]): Promise<void> {
        const targets = ids
          .map((id) => nodeMap.get(id))
          .filter((n): n is NodeVisual => n !== undefined && !n.taken);
        const half = D_READY_BOB / 2;
        for (const node of targets) {
          paintReady(node);
          node.g.style.transition = `transform ${half}ms ease-out`;
          node.g.style.transform = translate(node.at.x, node.at.y + 5);
          if (node.badge) {
            node.badge.g.style.transition = `transform ${half}ms ease-out`;
            node.badge.g.style.transform = translate(0, 5);
          }
        }
        await wait(half);
        for (const node of targets) {
          node.g.style.transition = `transform ${half}ms ease-in`;
          node.g.style.transform = translate(node.at.x, node.at.y);
          if (node.badge) {
            node.badge.g.style.transition = `transform ${half}ms ease-in`;
            node.badge.g.style.transform = translate(0, 0);
          }
        }
        await wait(half + 20);
      },

      /** 이고 있는 것이 없으니 아래 줄로 떨어진다. */
      async takeVertex(id: string, slot: number): Promise<void> {
        const node = nodeMap.get(id);
        if (!node) return;
        const landing = {
          x: slotCenters[slot] ?? node.at.x,
          y: TRACK_Y,
        };

        if (node.badge) {
          const badge = node.badge;
          node.badge = null;
          badge.g.style.transition = `transform ${D_TAKE_FALL}ms ${EASE_FALL}, opacity ${D_TAKE_FALL}ms linear`;
          badge.g.style.transform = translate(0, FALL_BADGE);
          badge.g.style.opacity = '0';
        }

        // 떨어지는 것은 남은 것들 앞을 지난다.
        gNodes.appendChild(node.g);
        node.g.style.transition = `transform ${D_TAKE_FALL}ms ${EASE_FALL}`;
        node.g.style.transform = translate(landing.x, landing.y);
        node.at = landing;
        node.taken = true;

        await wait(D_TAKE_FALL);
        paintTaken(node);
        await wait(60);
      },

      /** 빠진 정점이 걸어 두었던 화살이 떨어지고, 이고 있던 수가 준다. */
      async dropArrows(from: string, drops: IndegreeStageDrop[]): Promise<void> {
        const arrows = drops
          .map((d) => edgeMap.get(`${from}>${d.to}`))
          .filter((e): e is EdgeVisual => e !== undefined);

        for (const arrow of arrows) {
          arrow.path.setAttribute('stroke', c.itemActive);
          arrow.head.setAttribute('fill', c.itemActive);
        }
        await wait(D_ARROW_HOLD);

        // 배지에서 떨어져 나갈 옛 숫자와, 자리에 내려앉을 새 숫자를 준비한다.
        const ghosts: SVGTextElement[] = [];
        const settling: SVGTextElement[] = [];
        for (const drop of drops) {
          const node = nodeMap.get(drop.to);
          if (!node?.badge) continue;
          const ghost = glyph(node.badge.at, String(drop.was), c.textMuted, fontSizes.sm, '700');
          ghost.style.transform = translate(0, 0);
          ghost.style.opacity = '1';
          gFx.appendChild(ghost);
          ghosts.push(ghost);

          const label = node.badge.label;
          label.textContent = String(drop.now);
          label.style.transition = 'none';
          label.style.transform = translate(0, -10);
          label.style.opacity = '0';
          settling.push(label);
        }

        await frame();

        for (const arrow of arrows) {
          arrow.g.style.transition = `transform ${D_ARROW_FALL}ms ${EASE_FALL}, opacity ${D_ARROW_FALL}ms linear`;
          arrow.g.style.transform = translate(0, FALL_ARROW);
          arrow.g.style.opacity = '0';
        }
        for (const ghost of ghosts) {
          ghost.style.transition = `transform ${D_ARROW_FALL}ms ${EASE_FALL}, opacity ${D_ARROW_FALL}ms linear`;
          ghost.style.transform = translate(0, FALL_GHOST);
          ghost.style.opacity = '0';
        }
        for (const label of settling) {
          label.style.transition = `transform ${D_ARROW_FALL}ms ease-out, opacity ${D_ARROW_FALL}ms linear`;
          label.style.transform = translate(0, 0);
          label.style.opacity = '1';
        }

        await wait(D_ARROW_FALL + 40);

        for (const arrow of arrows) {
          arrow.g.remove();
          edgeMap.delete(arrow.key);
        }
        for (const ghost of ghosts) ghost.remove();
      },

      /** 다 나왔다 — 왼쪽부터 한 번 훑는다. */
      async finish(order: string[]): Promise<void> {
        for (const id of order) {
          const node = nodeMap.get(id);
          if (!node) continue;
          node.g.style.transition = `transform ${D_FINISH_STEP}ms ease-out`;
          node.g.style.transform = translate(node.at.x, node.at.y - 6);
          await wait(D_FINISH_STEP);
          node.g.style.transform = translate(node.at.x, node.at.y);
        }
        await wait(D_FINISH_STEP + 80);
      },
    };
  },
};
