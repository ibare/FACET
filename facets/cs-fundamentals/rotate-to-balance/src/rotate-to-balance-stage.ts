/**
 * rotate-to-balance-stage — 회전이 실제로 일어나는 자리.
 *
 * 노드의 가로 위치는 값의 정렬 순서(중위 순회 순서)로 고정한다. 회전은 그
 * 자리를 바꾸지 않는다 — 오직 세로(깊이)만 바뀐다. 그래서 회전 애니메이션은
 * "가로는 그대로, 세로만 움직인다" 는 사실 자체가 "중위 순회 결과는 회전
 * 전후가 같다" 는 주장의 증거가 된다. 손을 바꾸는 가지(40)는 대개 깊이도
 * 그대로라 위치가 거의 움직이지 않고, 그 자리에 꽂힌 간선만 부모를 바꿔
 * 다시 이어진다 — 그 간선 하나만 강조색으로 남기고 나머지는 중립으로 둔다.
 *
 * 빌트인 `tree-layout` view 를 쓰지 않은 이유: `setTree()` 는 즉시 다시 그릴
 * 뿐 위치 전환을 보간하지 않는다 (fold/unfold 는 서브트리 opacity/scale 만
 * 다룬다). "돈다" 라는 동사는 노드가 실제로 이동해야 성립하므로 좌표를
 * 프레임마다 보간하는 이 전용 stage 가 필요하다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, radii, space, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type StageNode = { id: string; value: number; left: string | null; right: string | null };

export type StageBalanceEntry = {
  id: string;
  height: number;
  balance: number;
  outOfRange: boolean;
};

export type StageRotateArgs = {
  pivotId: string;
  newRootId: string;
  movedId: string | null;
  afterNodes: StageNode[];
  afterRootId: string;
};

export type StageOrderEntry = { id: string; value: number };

type Pt = { x: number; y: number };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function toStageNodes(raw: unknown): StageNode[] {
  if (!Array.isArray(raw)) return [];
  const out: StageNode[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { value?: unknown }).value === 'number'
    ) {
      const it = item as { id: string; value: number; left?: unknown; right?: unknown };
      out.push({
        id: it.id,
        value: it.value,
        left: typeof it.left === 'string' ? it.left : null,
        right: typeof it.right === 'string' ? it.right : null,
      });
    }
  }
  return out;
}

function computeDepths(nodes: StageNode[], rootId: string): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depths = new Map<string, number>();
  function walk(id: string | null, depth: number) {
    if (!id) return;
    const n = byId.get(id);
    if (!n) return;
    depths.set(id, depth);
    walk(n.left, depth + 1);
    walk(n.right, depth + 1);
  }
  walk(rootId, 0);
  return depths;
}

function computeRankByValue(nodes: StageNode[]): Map<string, number> {
  const sorted = [...nodes].sort((a, b) => a.value - b.value);
  const out = new Map<string, number>();
  sorted.forEach((n, i) => out.set(n.id, i));
  return out;
}

function connectionsOf(nodes: StageNode[]): [string, string][] {
  const out: [string, string][] = [];
  for (const n of nodes) {
    if (n.left) out.push([n.id, n.left]);
    if (n.right) out.push([n.id, n.right]);
  }
  return out;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type NodeEntry = {
  g: SVGGElement;
  ring: SVGCircleElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  badgeG: SVGGElement;
  badgeText: SVGTextElement;
};

type EdgeEntry = { line: SVGLineElement; a: string; b: string };

export const rotateToBalanceStageView: CanvasView = {
  canvas: { height: 360 },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const wrap = document.createElement('div');
    wrap.style.padding = space.md;
    wrap.style.background = colors.bg;
    wrap.style.border = `1px solid ${colors.border}`;
    wrap.style.borderRadius = radii.md;
    wrap.style.fontFamily = fonts.body;
    wrap.style.boxSizing = 'border-box';

    const svg = params.canvas;
    const captionG = svgEl('g');
    const stripG = svgEl('g');
    const edgesG = svgEl('g');
    const nodesG = svgEl('g');
    svg.append(captionG, stripG, edgesG, nodesG);
    wrap.appendChild(svg);
    container.appendChild(wrap);

    const captionText = svgEl('text', {
      x: PIECE_CANVAS_W / 2,
      y: 18,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    captionG.appendChild(captionText);

    const rawInitial = params.initialData as { nodes?: unknown; rootId?: unknown } | undefined;
    const initialNodes = toStageNodes(rawInitial?.nodes);
    const initialRootId =
      typeof rawInitial?.rootId === 'string' ? rawInitial.rootId : (initialNodes[0]?.id ?? '');

    // ── geometry ────────────────────────────────────────────────────────
    const W = PIECE_CANVAS_W;
    const SIDE_MIN = 42;
    const count = Math.max(1, initialNodes.length);
    const usableW = Math.max(0, W - SIDE_MIN * 2);
    const stepX = count > 1 ? usableW / (count - 1) : 0;
    const NODE_R = Math.max(13, Math.min(20, stepX / 2 - 6));

    const CAPTION_H = 26;
    const TOP_PAD = 40;
    const ROW_H = 68;
    const BOTTOM_PAD = 16;
    const STRIP_LABEL_H = 22;

    const initialDepths = computeDepths(initialNodes, initialRootId);
    const maxDepth = initialNodes.length
      ? Math.max(0, ...initialNodes.map((n) => initialDepths.get(n.id) ?? 0))
      : 0;
    const rows = maxDepth + 1;

    const xFor = (rank: number) => SIDE_MIN + rank * stepX;
    const yFor = (depth: number) => CAPTION_H + TOP_PAD + depth * ROW_H;
    const treeBottomY = yFor(rows - 1) + NODE_R;
    const stripBaselineY = treeBottomY + BOTTOM_PAD + NODE_R;
    const totalH = stripBaselineY + STRIP_LABEL_H;

    svg.setAttribute('viewBox', `0 0 ${W} ${totalH}`);

    const rankByValue = computeRankByValue(initialNodes);

    const rawStepMs = (params.initialData as { stepMs?: unknown } | undefined)?.stepMs;
    const baseStepMs = typeof rawStepMs === 'number' ? rawStepMs : 600;
    const rotateDurationMs = Math.min(900, Math.max(320, Math.round(baseStepMs * 0.75)));

    const nodeEls = new Map<string, NodeEntry>();
    const edgeEls = new Map<string, EdgeEntry>();
    let currentNodes: StageNode[] = [];
    let currentPos = new Map<string, Pt>();
    let rafId: number | null = null;

    function positionsFor(nodes: StageNode[], rootId: string): Map<string, Pt> {
      const depths = computeDepths(nodes, rootId);
      const out = new Map<string, Pt>();
      for (const n of nodes) {
        const rank = rankByValue.get(n.id) ?? 0;
        const depth = depths.get(n.id) ?? 0;
        out.set(n.id, { x: xFor(rank), y: yFor(depth) });
      }
      return out;
    }

    function makeNodeEl(n: StageNode, p: Pt): NodeEntry {
      const g = svgEl('g', { transform: `translate(${p.x},${p.y})` });
      const ring = svgEl('circle', {
        r: NODE_R + 4,
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': 2,
      });
      const circle = svgEl('circle', {
        r: NODE_R,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 2,
      });
      const label = svgEl('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        'font-weight': '600',
        fill: colors.text,
      });
      label.textContent = String(n.value);
      const badgeG = svgEl('g', { opacity: '0' });
      const badgeText = svgEl('text', {
        x: 0,
        y: -(NODE_R + 10),
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        // 배지는 타일 위가 아니라 캔버스 배경 위에 떠 있다. stateInk(#171717 고정)를
        // 얹으면 다크 배경(#0a0a0a)에서 사라진다 — 배경 위 글자는 text 다.
        fill: colors.text,
      });
      badgeG.appendChild(badgeText);
      g.append(ring, circle, label, badgeG);
      return { g, ring, circle, label, badgeG, badgeText };
    }

    function clearMoveOverlay() {
      for (const id of [...nodeEls.keys()]) {
        const e = nodeEls.get(id);
        if (!e) continue;
        e.circle.setAttribute('stroke', colors.border);
        e.circle.setAttribute('stroke-width', '2');
      }
    }

    function render(nodes: StageNode[], rootId: string) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      currentNodes = nodes;
      edgesG.textContent = '';
      nodesG.textContent = '';
      stripG.textContent = '';
      captionText.textContent = '';
      nodeEls.clear();
      edgeEls.clear();

      const pos = positionsFor(nodes, rootId);
      currentPos = pos;

      for (const [a, b] of connectionsOf(nodes)) {
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb) continue;
        const line = svgEl('line', {
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          stroke: colors.border,
          'stroke-width': 2,
        });
        edgesG.appendChild(line);
        edgeEls.set(pairKey(a, b), { line, a, b });
      }

      for (const n of nodes) {
        const p = pos.get(n.id);
        if (!p) continue;
        const entry = makeNodeEl(n, p);
        nodesG.appendChild(entry.g);
        nodeEls.set(n.id, entry);
      }
    }

    function init(nodes: StageNode[], rootId: string): void {
      render(nodes, rootId);
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function showBalance(entries: StageBalanceEntry[]): void {
      for (const e of entries) {
        const node = nodeEls.get(e.id);
        if (!node) continue;
        const sign = e.balance > 0 ? '+' : '';
        node.badgeText.textContent = `h ${e.height} · Δ ${sign}${e.balance}`;
        node.badgeText.setAttribute('fill', e.outOfRange ? colors.danger : colors.text);
        node.badgeG.setAttribute('opacity', '1');
        node.ring.setAttribute('stroke', e.outOfRange ? colors.danger : 'transparent');
      }
    }

    async function rotate(args: StageRotateArgs): Promise<void> {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const fromPos = currentPos;
      const toPos = positionsFor(args.afterNodes, args.afterRootId);

      const beforeKeys = new Set(connectionsOf(currentNodes).map(([a, b]) => pairKey(a, b)));
      const afterConns = connectionsOf(args.afterNodes);
      const afterKeys = new Set(afterConns.map(([a, b]) => pairKey(a, b)));

      const removedEntries = [...edgeEls.entries()].filter(([key]) => !afterKeys.has(key));
      const addedPairs = afterConns.filter(([a, b]) => !beforeKeys.has(pairKey(a, b)));
      const addedEntries: EdgeEntry[] = addedPairs.map(([a, b]) => {
        const line = svgEl('line', {
          stroke: colors.itemPivot,
          'stroke-width': 3,
          opacity: 0,
        });
        edgesG.appendChild(line);
        return { line, a, b };
      });

      const movingKeys = new Set<string>([
        ...removedEntries.map(([key]) => key),
        ...addedEntries.map((e) => pairKey(e.a, e.b)),
      ]);
      for (const [key, entry] of edgeEls) {
        if (movingKeys.has(key)) entry.line.setAttribute('stroke', colors.itemPivot);
      }
      for (const [, entry] of removedEntries) {
        entry.line.setAttribute('stroke', colors.itemPivot);
      }

      const highlightIds = [args.pivotId, args.newRootId, ...(args.movedId ? [args.movedId] : [])];
      for (const id of highlightIds) {
        const n = nodeEls.get(id);
        if (n) {
          n.circle.setAttribute('stroke', colors.itemActive);
          n.circle.setAttribute('stroke-width', '3');
        }
      }

      const stableEntries = [...edgeEls.entries()].filter(([key]) => !movingKeys.has(key));

      await new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / rotateDurationMs);
          const eased = easeInOutCubic(t);

          const framePos = new Map<string, Pt>();
          for (const n of currentNodes) {
            const from = fromPos.get(n.id) ?? { x: 0, y: 0 };
            const to = toPos.get(n.id) ?? from;
            framePos.set(n.id, { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased) });
          }
          for (const [id, p] of framePos) {
            const entry = nodeEls.get(id);
            if (entry) entry.g.setAttribute('transform', `translate(${p.x},${p.y})`);
          }
          for (const [, entry] of stableEntries) {
            const pa = framePos.get(entry.a);
            const pb = framePos.get(entry.b);
            if (!pa || !pb) continue;
            entry.line.setAttribute('x1', String(pa.x));
            entry.line.setAttribute('y1', String(pa.y));
            entry.line.setAttribute('x2', String(pb.x));
            entry.line.setAttribute('y2', String(pb.y));
          }
          for (const [, entry] of removedEntries) {
            const pa = framePos.get(entry.a);
            const pb = framePos.get(entry.b);
            if (pa && pb) {
              entry.line.setAttribute('x1', String(pa.x));
              entry.line.setAttribute('y1', String(pa.y));
              entry.line.setAttribute('x2', String(pb.x));
              entry.line.setAttribute('y2', String(pb.y));
            }
            entry.line.setAttribute('opacity', String(1 - eased));
          }
          for (const entry of addedEntries) {
            const pa = framePos.get(entry.a);
            const pb = framePos.get(entry.b);
            if (pa && pb) {
              entry.line.setAttribute('x1', String(pa.x));
              entry.line.setAttribute('y1', String(pa.y));
              entry.line.setAttribute('x2', String(pb.x));
              entry.line.setAttribute('y2', String(pb.y));
            }
            entry.line.setAttribute('opacity', String(eased));
          }

          if (t < 1) {
            rafId = requestAnimationFrame(tick);
          } else {
            rafId = null;
            for (const [key, entry] of removedEntries) {
              entry.line.remove();
              edgeEls.delete(key);
            }
            for (const entry of addedEntries) {
              entry.line.setAttribute('opacity', '1');
              edgeEls.set(pairKey(entry.a, entry.b), entry);
            }
            for (const [, entry] of stableEntries) {
              entry.line.setAttribute('stroke', colors.border);
            }
            clearMoveOverlay();
            currentNodes = args.afterNodes;
            currentPos = toPos;
            resolve();
          }
        };
        rafId = requestAnimationFrame(tick);
      });
    }

    function markInorderUnchanged(order: StageOrderEntry[]): void {
      stripG.textContent = '';
      if (order.length === 0) return;
      const y = stripBaselineY;
      const xs = order.map((n) => xFor(rankByValue.get(n.id) ?? 0));
      const line = svgEl('line', {
        x1: Math.min(...xs),
        y1: y,
        x2: Math.max(...xs),
        y2: y,
        stroke: colors.border,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 3',
      });
      stripG.appendChild(line);
      order.forEach((n) => {
        const x = xFor(rankByValue.get(n.id) ?? 0);
        const tick = svgEl('line', {
          x1: x,
          y1: y - 4,
          x2: x,
          y2: y + 4,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        });
        const label = svgEl('text', {
          x,
          y: y + STRIP_LABEL_H - 6,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = String(n.value);
        stripG.append(tick, label);
      });
    }

    render(initialNodes, initialRootId);

    return {
      init,
      setCaption,
      showBalance,
      rotate,
      markInorderUnchanged,
      destroy(): void {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        container.textContent = '';
      },
    };
  },
};
