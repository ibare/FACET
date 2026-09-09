/**
 * mark-visited-or-loop stage — 걷는 이가 자리에서 자리로 **옮겨 간다.**
 *
 * 이 조각의 동사는 "되밟는다 → 벗어난다" 이므로 화면의 주 운동은 위치 변화다.
 * 걷는 이는 두 자리를 잇는 선을 따라 실제로 미끄러지고, 밟은 선은 지날 때마다
 * 굵어져 **자국(rut)** 이 된다. 표시 없이 걷는 회차가 끝나면 왼쪽 고리 셋만
 * 굵고 오른쪽으로 난 길은 새것 그대로다 — 그 대비가 이 조각의 주장이다.
 *
 * ── 배치
 *
 *   고리는 왼쪽, 고리 밖의 자리는 오른쪽. 좌표를 손으로 적지 않고 자료에서
 *   짓는다. 시작 자리에서 "이웃 목록의 첫 칸" 만 따라가면 반드시 어딘가에서
 *   되돌아오는데, 그 되돌아오는 마디가 곧 고리다. 고리에 들지 못한 자리는
 *   고리 위의 이웃과 같은 높이로 오른쪽 끝에 둔다. 그래서 "벗어난다" 가
 *   화면에서 가로로 길게 뻗은 한 줄이 된다.
 *
 *   폭은 캔버스에서 역산한다. 고리는 왼쪽 여백에, 바깥 자리는 오른쪽 여백에
 *   붙어 그 사이가 통째로 길이 되므로 남는 폭이 생기지 않는다 (S-piece).
 *
 * ── 세로
 *
 *   마운트 뒤 viewBox 를 다시 재지 않는다. 자리 수가 달라져도 고리 반지름과
 *   자국 띠의 칸 수만 바뀐다 (S-view).
 *
 * ── 뒷일
 *
 *   움직임은 rAF tween 하나로만 만든다. 걸어 둔 프레임 id 를 전부 들고 있다가
 *   `destroy()` 에서 취소하고 그린 것을 떼어 낸다. `setTimeout` 은 쓰지 않는다.
 *
 * 색은 전부 design-tokens 경유다 (S-view 결정 트리).
 *   걷는 이 · 지금 자리  → state (`itemActive`)
 *   자국의 깊이          → structural (`border` → `textMuted` → `text`)
 *   표시                 → emphasis (`accent`)
 *   건너뜀 · 닿지 못함   → severity (`danger`)
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 312;

/** 좌우 여백. 고리와 바깥 자리가 이 안쪽 폭을 양끝에서 채운다. */
const SIDE = 46;
const NODE_R = 27;
/** 표시 고리의 반지름 — 자리 원 바깥에 얹힌다. */
const MARK_R = NODE_R + 9;
const RING_R_MAX = 106;

const CAPTION_Y = 22;
const GRAPH_TOP = 34;
const TRAIL_TOP = 274;
const TRAIL_H = 28;

/**
 * 한 걸음이 미끄러지는 시간. 거리에 비례하되 상·하한을 둔다 — 걷는 이의 속도가
 * 한결같아야 고리 안의 짧은 걸음과 바깥으로 뻗는 긴 걸음이 같은 걸음으로 읽힌다.
 *
 * 총 재생 길이는 이 값과 `stepMs` 의 합으로 정해지므로, 길이를 줄여야 할 때
 * 손대는 자리도 여기다 (S-piece — `stepMs` 를 줄이면 읽을 시간이 사라진다).
 */
const MOVE_MS_BASE = 95;
const MOVE_MS_PER_PX = 0.36;
const MOVE_MS_MIN = 120;
const MOVE_MS_MAX = 190;
const MARK_MS = 240;
const SKIP_MS = 160;
const RIPPLE_MS = 420;

function moveDuration(dist: number): number {
  return Math.min(MOVE_MS_MAX, Math.max(MOVE_MS_MIN, MOVE_MS_BASE + dist * MOVE_MS_PER_PX));
}

type Pt = { x: number; y: number };

type GraphSpec = {
  nodes: string[];
  adjacency: Record<string, string[]>;
  start: string;
  maxSteps: number;
};

export type MarkVisitedOrLoopStageInstance = ViewInstance & {
  setGraph(spec: GraphSpec): void;
  reset(): void;
  beginWalk(o: { start: string }): void;
  markNode(node: string): void;
  skipNeighbor(o: { from: string; to: string }): Promise<void>;
  moveToken(o: { from: string; to: string; revisit: boolean }): Promise<void>;
  finishWalk(o: { escaped: boolean; missed: string[] }): void;
  setCaption(text: string): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  }
  return node;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/**
 * 시작 자리에서 "이웃 목록의 첫 칸" 만 따라간 자취 가운데 되돌아오는 마디.
 * 표시 없는 걸음이 갇히는 바로 그 고리다.
 */
function ringOf(adjacency: Record<string, string[]>, start: string, limit: number): string[] {
  const seen: string[] = [];
  let cur = start;
  while (!seen.includes(cur) && seen.length < limit) {
    seen.push(cur);
    const list = adjacency[cur] ?? [];
    if (list.length === 0) return seen;
    cur = list[0];
  }
  const at = seen.indexOf(cur);
  return at >= 0 ? seen.slice(at) : seen;
}

/** 무방향 간선 목록 — 이웃 목록에서 중복을 걷어 낸다. */
function undirectedEdges(adjacency: Record<string, string[]>): { a: string; b: string }[] {
  const seen = new Set<string>();
  const out: { a: string; b: string }[] = [];
  for (const [from, list] of Object.entries(adjacency)) {
    for (const to of list) {
      const key = edgeKey(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: from, b: to });
    }
  }
  return out;
}

function readGraph(source: unknown): GraphSpec | null {
  const d = source as
    | { nodes?: unknown; adjacency?: unknown; start?: unknown; maxSteps?: unknown }
    | undefined;
  if (!Array.isArray(d?.nodes) || typeof d.start !== 'string') return null;
  if (typeof d.maxSteps !== 'number' || d.maxSteps <= 0) return null;
  if (typeof d.adjacency !== 'object' || d.adjacency === null) return null;
  const nodes = (d.nodes as unknown[]).filter((v): v is string => typeof v === 'string');
  if (nodes.length === 0) return null;
  const adjacency: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(d.adjacency as Record<string, unknown>)) {
    adjacency[key] = Array.isArray(value)
      ? (value as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
  }
  return { nodes, adjacency, start: d.start, maxSteps: Math.floor(d.maxSteps) };
}

export const markVisitedOrLoopStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): MarkVisitedOrLoopStageInstance {
    const svg = params.canvas;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const c = getColors(params.theme);

    // ── 뒷일 관리. 걸어 둔 프레임을 전부 들고 있다가 destroy 에서 취소한다.
    let destroyed = false;
    const frames = new Set<number>();

    function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          onFrame(1);
          resolve();
          return;
        }
        const t0 = performance.now();
        const run = (now: number): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const p = Math.min(1, (now - t0) / ms);
          onFrame(p);
          if (p < 1) schedule(run);
          else resolve();
        };
        schedule(run);
      });
    }

    function schedule(fn: (now: number) => void): void {
      const id = requestAnimationFrame((now) => {
        frames.delete(id);
        fn(now);
      });
      frames.add(id);
    }

    // ── 층. 아래에서 위로: 선 → 건너뜀 표 → 물결 → 표시 → 걷는 이 → 자리 → 자국 띠 → 캡션
    const root = el('g');
    const gEdges = el('g');
    const gStrike = el('g');
    const gRipple = el('g');
    const gMarks = el('g');
    const gWalker = el('g');
    const gNodes = el('g');
    const gTrail = el('g');
    root.append(gEdges, gStrike, gRipple, gMarks, gWalker, gNodes, gTrail);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);
    svg.appendChild(root);

    const walker = el('circle', {
      r: 10,
      cx: -50,
      cy: -50,
      fill: c.itemActive,
      stroke: c.bg,
      'stroke-width': 2.5,
      opacity: 0,
    });
    gWalker.appendChild(walker);

    // ── 상태
    let pos: Record<string, Pt | undefined> = {};
    const nodeEls = new Map<string, { circle: SVGCircleElement; label: SVGTextElement }>();
    const edgeEls = new Map<string, SVGLineElement>();
    const markEls = new Map<string, SVGCircleElement>();
    const trailEls: { box: SVGRectElement; label: SVGTextElement }[] = [];
    let wear = new Map<string, number>();
    let strikeEdges: string[] = [];
    let trail: string[] = [];
    let missed = new Set<string>();
    let current = '';
    let lastEdge = '';

    // ── 그리기

    function edgeLook(count: number): { width: number; color: string } {
      if (count <= 0) return { width: 2, color: c.border };
      return {
        width: 2 + Math.min(count, 4) * 1.7,
        color: count >= 3 ? c.text : c.textMuted,
      };
    }

    function paintEdge(key: string): void {
      const line = edgeEls.get(key);
      if (!line) return;
      if (strikeEdges.includes(key)) {
        line.setAttribute('stroke', c.danger);
        line.setAttribute('stroke-width', '3');
        return;
      }
      const look = edgeLook(wear.get(key) ?? 0);
      line.setAttribute('stroke', look.color);
      line.setAttribute('stroke-width', String(look.width));
    }

    function paintNode(id: string): void {
      const parts = nodeEls.get(id);
      if (!parts) return;
      const isHere = id === current;
      const isMissed = missed.has(id);
      parts.circle.setAttribute('fill', isHere ? c.itemActive : c.itemDefault);
      parts.circle.setAttribute(
        'stroke',
        isMissed ? c.danger : isHere ? c.itemActive : c.border,
      );
      parts.circle.setAttribute('stroke-width', isMissed ? '2.5' : '2');
      parts.circle.setAttribute('stroke-dasharray', isMissed ? '5 4' : 'none');
      parts.label.setAttribute('fill', isHere ? c.stateInk : c.text);
    }

    function paintAll(): void {
      for (const id of nodeEls.keys()) paintNode(id);
      for (const key of edgeEls.keys()) paintEdge(key);
    }

    function paintTrail(): void {
      trailEls.forEach((slot, i) => {
        const filled = i < trail.length;
        const name = filled ? trail[i] : '';
        const latest = filled && i === trail.length - 1;
        slot.box.setAttribute('fill', latest ? c.itemActive : filled ? c.bgSubtle : 'none');
        slot.box.setAttribute('stroke', latest ? c.itemActive : c.border);
        slot.box.setAttribute('stroke-dasharray', filled ? 'none' : '3 3');
        slot.label.textContent = filled ? name : '';
        slot.label.setAttribute('fill', latest ? c.stateInk : c.text);
      });
    }

    function clearGroup(group: SVGGElement): void {
      while (group.firstChild) group.removeChild(group.firstChild);
    }

    function clearStrikes(): void {
      if (strikeEdges.length === 0) return;
      const stale = strikeEdges;
      strikeEdges = [];
      clearGroup(gStrike);
      for (const key of stale) paintEdge(key);
    }

    function ripple(at: Pt): void {
      const wave = el('circle', {
        cx: at.x,
        cy: at.y,
        r: NODE_R,
        fill: 'none',
        stroke: c.textMuted,
        'stroke-width': 2,
        opacity: 0.55,
      });
      gRipple.appendChild(wave);
      void tween(RIPPLE_MS, (p) => {
        wave.setAttribute('r', String(NODE_R + 24 * p));
        wave.setAttribute('opacity', String(0.55 * (1 - p)));
      }).then(() => {
        if (wave.parentNode) wave.parentNode.removeChild(wave);
      });
    }

    // ── 배치 짓기

    function build(spec: GraphSpec): void {
      clearGroup(gEdges);
      clearGroup(gNodes);
      clearGroup(gMarks);
      clearGroup(gStrike);
      clearGroup(gRipple);
      clearGroup(gTrail);
      nodeEls.clear();
      edgeEls.clear();
      markEls.clear();
      trailEls.length = 0;
      pos = {};

      const ring = ringOf(spec.adjacency, spec.start, spec.nodes.length);
      const outside = spec.nodes.filter((n) => !ring.includes(n));

      const ringR = Math.min(
        RING_R_MAX,
        Math.max(48, Math.floor((W - SIDE * 2) / 4) - NODE_R),
      );
      const ringCx = SIDE + NODE_R + ringR;
      const ringCy = GRAPH_TOP + ringR + MARK_R;
      const outsideX = W - SIDE - NODE_R;

      // 고리는 시작 자리를 꼭대기에 두고 시계 반대 방향으로 돈다. 그러면 고리로
      // 되돌아오기 직전의 자리가 오른쪽에 서고, 바깥으로 난 길이 가로로 뻗는다.
      const turn = (Math.PI * 2) / Math.max(1, ring.length);
      ring.forEach((name, i) => {
        const theta = -Math.PI / 2 - i * turn;
        pos[name] = {
          x: ringCx + ringR * Math.cos(theta),
          y: ringCy + ringR * Math.sin(theta),
        };
      });
      outside.forEach((name, i) => {
        const anchor = (spec.adjacency[name] ?? []).find((a) => pos[a] !== undefined);
        const anchorPos = anchor === undefined ? undefined : pos[anchor];
        pos[name] = {
          x: outsideX,
          y: (anchorPos?.y ?? ringCy) + i * (NODE_R * 2 + 14),
        };
      });

      for (const edge of undirectedEdges(spec.adjacency)) {
        const a = pos[edge.a];
        const b = pos[edge.b];
        if (!a || !b) continue;
        const line = el('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        edgeEls.set(edgeKey(edge.a, edge.b), line);
        gEdges.appendChild(line);
      }

      for (const name of spec.nodes) {
        const at = pos[name];
        if (!at) continue;
        const circle = el('circle', {
          cx: at.x,
          cy: at.y,
          r: NODE_R,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 2,
        });
        const label = el('text', {
          x: at.x,
          y: at.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: c.text,
        });
        label.textContent = name;
        gNodes.append(circle, label);
        nodeEls.set(name, { circle, label });
      }

      // 자국 띠 — 밟은 자리를 밟은 차례대로 적는다. 빈 칸까지 미리 그려 두는 것은
      // "열두 걸음이 얼마나 긴가" 가 첫 화면부터 보여야 하기 때문이다.
      const slots = spec.maxSteps + 1;
      const slotW = Math.max(14, Math.floor((W - SIDE * 2) / slots));
      const trailX0 = Math.round((W - slotW * slots) / 2);
      for (let i = 0; i < slots; i += 1) {
        const box = el('rect', {
          x: trailX0 + i * slotW + 3,
          y: TRAIL_TOP,
          width: Math.max(8, slotW - 6),
          height: TRAIL_H,
          rx: 5,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        });
        const label = el('text', {
          x: trailX0 + i * slotW + 3 + Math.max(8, slotW - 6) / 2,
          y: TRAIL_TOP + TRAIL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.text,
        });
        gTrail.append(box, label);
        trailEls.push({ box, label });
      }

      resetState();
    }

    function resetState(): void {
      clearGroup(gMarks);
      clearGroup(gStrike);
      clearGroup(gRipple);
      markEls.clear();
      wear = new Map<string, number>();
      strikeEdges = [];
      trail = [];
      missed = new Set<string>();
      current = '';
      lastEdge = '';
      walker.setAttribute('opacity', '0');
      paintAll();
      paintTrail();
    }

    const initial = readGraph(params.initialData);
    if (initial) build(initial);

    return {
      setGraph(spec: GraphSpec): void {
        build(spec);
        caption.textContent = '';
      },

      reset(): void {
        resetState();
        caption.textContent = '';
      },

      beginWalk(o: { start: string }): void {
        resetState();
        if (!pos[o.start]) return;
        current = o.start;
        trail = [o.start];
        paintAll();
        paintTrail();
      },

      markNode(node: string): void {
        const at = pos[node];
        if (!at || markEls.has(node)) return;
        const ring = el('circle', {
          cx: at.x,
          cy: at.y,
          r: NODE_R + 2,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 3,
          opacity: 0,
        });
        gMarks.appendChild(ring);
        markEls.set(node, ring);
        void tween(MARK_MS, (p) => {
          const e = easeInOut(p);
          ring.setAttribute('r', String(NODE_R + 2 + (MARK_R - NODE_R - 2) * e));
          ring.setAttribute('opacity', String(e));
        });
      },

      async skipNeighbor(o: { from: string; to: string }): Promise<void> {
        const a = pos[o.from];
        const b = pos[o.to];
        if (!a || !b) return;
        const key = edgeKey(o.from, o.to);
        strikeEdges.push(key);
        paintEdge(key);

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const cross = el('g', { opacity: 0 });
        for (const [x1, y1, x2, y2] of [
          [-8, -8, 8, 8],
          [-8, 8, 8, -8],
        ]) {
          cross.appendChild(
            el('line', {
              x1,
              y1,
              x2,
              y2,
              stroke: c.danger,
              'stroke-width': 3.5,
              'stroke-linecap': 'round',
            }),
          );
        }
        gStrike.appendChild(cross);
        await tween(SKIP_MS, (p) => {
          const e = easeInOut(p);
          cross.setAttribute('transform', `translate(${mx} ${my}) scale(${0.4 + 0.6 * e})`);
          cross.setAttribute('opacity', String(e));
        });
      },

      async moveToken(o: { from: string; to: string; revisit: boolean }): Promise<void> {
        const a = pos[o.from];
        const b = pos[o.to];
        if (!a || !b) return;
        clearStrikes();

        // 자리를 뜨는 동안에는 어느 자리도 "지금" 이 아니다.
        current = '';
        paintAll();
        walker.setAttribute('cx', String(a.x));
        walker.setAttribute('cy', String(a.y));
        walker.setAttribute('opacity', '1');
        await tween(moveDuration(Math.hypot(b.x - a.x, b.y - a.y)), (p) => {
          const e = easeInOut(p);
          walker.setAttribute('cx', String(a.x + (b.x - a.x) * e));
          walker.setAttribute('cy', String(a.y + (b.y - a.y) * e));
        });
        walker.setAttribute('opacity', '0');

        const key = edgeKey(o.from, o.to);
        wear.set(key, (wear.get(key) ?? 0) + 1);
        lastEdge = key;
        current = o.to;
        trail.push(o.to);
        paintAll();
        paintTrail();
        if (o.revisit) ripple(b);
      },

      finishWalk(o: { escaped: boolean; missed: string[] }): void {
        // 맺는 화면은 깨끗해야 한다 — 마지막 건너뜀 표까지 걷어 낸다.
        clearStrikes();
        missed = new Set(o.missed);
        paintAll();
        if (!o.escaped) return;
        const road = edgeEls.get(lastEdge);
        if (!road) return;
        road.setAttribute('stroke', c.accent);
        road.setAttribute('stroke-width', '5');
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
        nodeEls.clear();
        edgeEls.clear();
        markEls.clear();
        trailEls.length = 0;
      },
    };
  },
};
