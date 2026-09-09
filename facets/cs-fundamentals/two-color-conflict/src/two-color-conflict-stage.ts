/**
 * two-color-conflict-stage — 고리를 한 줄로 펴 놓고, 되돌아오는 변을 아래로
 * 걸어 두 색이 그 변에서 부딪히는 것을 보인다.
 *
 * ── 배치가 이렇게 나온 이유
 * 질문의 동사는 "부딪힌다" 다. 부딪히려면 두 물체가 서로를 향해 **움직여야**
 * 하고, 부딪히는 자리가 화면에서 한눈에 보여야 한다. 그래서 정점을 캔버스 폭
 * 가득 한 줄로 펴고 (칠하기가 왼쪽에서 오른쪽으로 흘러가게), 고리를 닫는
 * 마지막 변만 아래로 크게 휘어 걸었다. 그 활의 한가운데가 충돌 지점이다.
 *
 * ── 색이 곧 값이다
 * 두 칠감은 categorical(2) 로 받는다 (S-view 결정 트리 3번 — n 개 범주 식별).
 * 진행 상태는 **채움색으로 말하지 않는다.** 지금 보는 자리는 회색 커서 링,
 * 지나온 변은 선의 굵기와 명도(border → text), 어긋난 변은 danger 다. 칠하지
 * 않은 정점은 배경색 + 점선 외곽 — 아직 값이 없다는 뜻이지 상태색이 아니다.
 *
 * ── 세로
 * 마운트한 뒤 viewBox 를 다시 재지 않는다 (S-view). 정점 한 줄 + 활 + 캡션의
 * 높이는 정점 개수와 무관하다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_H = 232;
/** 정점 한 줄의 중심 높이. */
const ROW_Y = 60;
/** 정점 반지름의 상한. 실제 값은 캔버스 폭에서 역산한다 (S-piece). */
const NODE_R_MAX = 28;
/** 좌우 최소 여백. */
const SIDE_MIN = 52;
/** 이웃 정점 사이에 남겨 둘 최소 변 길이 — 칠감 방울이 지나갈 길. */
const EDGE_MIN_GAP = 56;
/** 고리를 닫는 활이 내려가는 깊이 (제어점 기준). */
const ARC_DROP = 128;
/** 활이 양 끝에서 바깥으로 부푸는 폭. */
const ARC_BULGE = 86;
const CAPTION_Y = 214;

const EDGE_W_IDLE = 2.5;
const EDGE_W_SETTLED = 3;
const EDGE_W_CONFLICT = 4.5;

const TRAVEL_MS = 430;
const ABSORB_MS = 190;
const APPROACH_MS = 520;
const RECOIL_MS = 460;
const PULSE_MS = 420;

/**
 * 두 칠감의 자리. 2색 시드에서 0 번과 1 번이며, "첫 색 / 다음 색" 이라는 뜻
 * 외에 다른 의미가 없다. 같은 뜻을 재현할 다른 view 가 없으므로 view-local
 * 상수로 둔다 (S-view Exception).
 */
const PAINT_FIRST = 0;
const PAINT_SECOND = 1;

type Pt = { x: number; y: number };
type EdgeState = 'idle' | 'settled' | 'conflict';

type RingSpec = { nodes: string[]; edges: { a: string; b: string }[] };
type PaintStep = { node: string; prev: string | null; edge: string | null; color: number };
type CloseStep = { a: string; b: string; same: boolean };
type ConflictMark = { a: string; b: string };

type NodeGeom = {
  id: string;
  x: number;
  y: number;
  circle: SVGCircleElement;
  label: SVGTextElement;
};

type EdgeGeom = {
  a: string;
  b: string;
  path: SVGPathElement;
  at(t: number): Pt;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y,
  };
}

export const twoColorConflictStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const palette = getColors(params.theme);
    const paints = categorical(2, 'vivid');
    const paintOf = (color: number): string =>
      (color === PAINT_SECOND ? paints[PAINT_SECOND] : paints[PAINT_FIRST]) ?? palette.accent;

    const W = PIECE_CANVAS_W;

    const gEdges = el('g', {});
    const gNodes = el('g', {});
    const gRings = el('g', {});
    const gTokens = el('g', {});
    const gMarks = el('g', {});
    svg.appendChild(gEdges);
    svg.appendChild(gNodes);
    svg.appendChild(gRings);
    svg.appendChild(gTokens);
    svg.appendChild(gMarks);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    svg.appendChild(caption);

    // ── 애니메이션 살림. destroy 뒤로는 한 프레임도 남기지 않는다 (S-view).
    //    걸어 둔 프레임을 거두면 그 애니메이션의 promise 를 기다리던 projector 가
    //    영영 깨어나지 못하므로, 기다리는 쪽도 함께 풀어 준다.
    let destroyed = false;
    const frames = new Set<number>();
    const waiting = new Set<() => void>();
    const raf = (cb: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    const unraf = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };

    function animate(duration: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiting.delete(finish);
          resolve();
        };
        if (destroyed) {
          finish();
          return;
        }
        waiting.add(finish);
        const t0 = Date.now();
        let pending: number | null = null;
        const tick = (): void => {
          if (pending !== null) frames.delete(pending);
          if (destroyed) {
            finish();
            return;
          }
          const p = duration <= 0 ? 1 : Math.min(1, (Date.now() - t0) / duration);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          pending = raf(tick);
          frames.add(pending);
        };
        pending = raf(tick);
        frames.add(pending);
      });
    }

    // ── 장면 상태
    const nodesById = new Map<string, NodeGeom>();
    const edges: EdgeGeom[] = [];
    const painted = new Map<string, number>();
    const dangerRings = new Map<string, SVGCircleElement>();
    let nodeR = NODE_R_MAX;
    let cursor: SVGCircleElement | null = null;

    const findEdge = (a: string, b: string): EdgeGeom | undefined =>
      edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

    function clearGroup(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function setEdgeState(edge: EdgeGeom, state: EdgeState): void {
      if (state === 'conflict') {
        edge.path.setAttribute('stroke', palette.danger);
        edge.path.setAttribute('stroke-width', String(EDGE_W_CONFLICT));
        return;
      }
      if (state === 'settled') {
        edge.path.setAttribute('stroke', palette.text);
        edge.path.setAttribute('stroke-width', String(EDGE_W_SETTLED));
        return;
      }
      edge.path.setAttribute('stroke', palette.border);
      edge.path.setAttribute('stroke-width', String(EDGE_W_IDLE));
    }

    function setNodePaint(geom: NodeGeom, color: number | null): void {
      if (color === null) {
        painted.delete(geom.id);
        geom.circle.setAttribute('fill', palette.bg);
        geom.circle.setAttribute('stroke', palette.ghostOutline);
        geom.circle.setAttribute('stroke-width', '2');
        geom.circle.setAttribute('stroke-dasharray', '5 4');
        geom.label.setAttribute('fill', palette.textMuted);
        return;
      }
      painted.set(geom.id, color);
      // 칠한 타일은 테마를 따라 뒤집히지 않는 고정색이므로 잉크도 고정한다 (S-view).
      geom.circle.setAttribute('fill', paintOf(color));
      geom.circle.setAttribute('stroke', 'none');
      geom.circle.removeAttribute('stroke-dasharray');
      geom.label.setAttribute('fill', palette.stateInk);
    }

    function moveCursor(geom: NodeGeom): void {
      if (!cursor) return;
      cursor.setAttribute('cx', String(geom.x));
      cursor.setAttribute('cy', String(geom.y));
      cursor.setAttribute('r', String(nodeR + 7));
      cursor.setAttribute('opacity', '1');
    }

    function hideCursor(): void {
      cursor?.setAttribute('opacity', '0');
    }

    function buildScene(spec: RingSpec): void {
      clearGroup(gEdges);
      clearGroup(gNodes);
      clearGroup(gRings);
      clearGroup(gTokens);
      clearGroup(gMarks);
      nodesById.clear();
      edges.length = 0;
      painted.clear();
      dangerRings.clear();

      const count = spec.nodes.length;
      if (count === 0) return;

      // 폭은 캔버스에서 역산한다. 상수는 상한일 뿐이다 (S-piece).
      const step = count > 1 ? Math.floor((W - SIDE_MIN * 2) / (count - 1)) : 0;
      nodeR = Math.max(
        12,
        Math.min(NODE_R_MAX, count > 1 ? Math.floor((step - EDGE_MIN_GAP) / 2) : NODE_R_MAX),
      );
      const originX = Math.round((W - step * (count - 1)) / 2);

      const index = new Map<string, number>();
      spec.nodes.forEach((id, i) => index.set(id, i));

      const pos = (id: string): Pt => {
        const i = index.get(id) ?? 0;
        return { x: originX + step * i, y: ROW_Y };
      };

      for (const e of spec.edges) {
        const ia = index.get(e.a);
        const ib = index.get(e.b);
        if (ia === undefined || ib === undefined) continue;
        const p0 = pos(e.a);
        const p3 = pos(e.b);
        let at: (u: number) => Pt;
        let d: string;
        if (Math.abs(ia - ib) === 1) {
          // 줄에서 이웃한 두 정점 — 곧은 변.
          at = (u: number): Pt => ({ x: lerp(p0.x, p3.x, u), y: lerp(p0.y, p3.y, u) });
          d = `M ${p0.x} ${p0.y} L ${p3.x} ${p3.y}`;
        } else {
          // 줄의 끝과 끝을 잇는 변 — 고리를 닫는 활. 아래로 크게 휘어 건다.
          const dir = p0.x > p3.x ? 1 : -1;
          const c1: Pt = { x: p0.x + ARC_BULGE * dir, y: ROW_Y + ARC_DROP };
          const c2: Pt = { x: p3.x - ARC_BULGE * dir, y: ROW_Y + ARC_DROP };
          at = (u: number): Pt => cubicAt(p0, c1, c2, p3, u);
          d = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`;
        }
        const path = el('path', {
          d,
          fill: 'none',
          stroke: palette.border,
          'stroke-width': EDGE_W_IDLE,
          'stroke-linecap': 'round',
        });
        gEdges.appendChild(path);
        edges.push({ a: e.a, b: e.b, path, at });
      }

      for (const id of spec.nodes) {
        const p = pos(id);
        const circle = el('circle', { cx: p.x, cy: p.y, r: nodeR });
        const label = el('text', {
          x: p.x,
          y: p.y + 6,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': '600',
        });
        label.textContent = id;
        gNodes.appendChild(circle);
        gNodes.appendChild(label);
        const geom: NodeGeom = { id, x: p.x, y: p.y, circle, label };
        nodesById.set(id, geom);
        setNodePaint(geom, null);
      }

      // 커서 링 — "지금 보는 자리". 칠감과 헷갈리지 않게 중성 회색을 쓴다.
      cursor = el('circle', {
        cx: 0,
        cy: 0,
        r: nodeR + 7,
        fill: 'none',
        stroke: palette.auxCursor,
        'stroke-width': 3,
        opacity: 0,
      });
      gRings.appendChild(cursor);
    }

    /** 충돌 자국 — 맞부딪힌 자리에서 사방으로 튀는 짧은 선. */
    function burst(at: Pt): void {
      // 맞부딪힌 두 알을 비껴 나가도록 대각선 넷으로만 튄다.
      const RAY_COUNT = 4;
      const rays: { line: SVGLineElement; angle: number }[] = [];
      for (let i = 0; i < RAY_COUNT; i += 1) {
        const angle = (Math.PI * 2 * i) / RAY_COUNT + Math.PI / RAY_COUNT;
        const line = el('line', {
          x1: at.x,
          y1: at.y,
          x2: at.x,
          y2: at.y,
          stroke: palette.danger,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        gMarks.appendChild(line);
        rays.push({ line, angle });
      }
      void animate(RECOIL_MS, (p) => {
        const e = easeOut(p);
        for (const ray of rays) {
          const inner = lerp(nodeR * 0.9, nodeR * 0.98, e);
          const outer = lerp(nodeR * 0.9, nodeR * 1.5, e);
          ray.line.setAttribute('x1', String(at.x + Math.cos(ray.angle) * inner));
          ray.line.setAttribute('y1', String(at.y + Math.sin(ray.angle) * inner));
          ray.line.setAttribute('x2', String(at.x + Math.cos(ray.angle) * outer));
          ray.line.setAttribute('y2', String(at.y + Math.sin(ray.angle) * outer));
        }
      });
    }

    function dangerRing(geom: NodeGeom): SVGCircleElement {
      const existing = dangerRings.get(geom.id);
      if (existing) return existing;
      const ring = el('circle', {
        cx: geom.x,
        cy: geom.y,
        r: nodeR + 6,
        fill: 'none',
        stroke: palette.danger,
        'stroke-width': 3,
      });
      gRings.appendChild(ring);
      dangerRings.set(geom.id, ring);
      return ring;
    }

    const instance: ViewInstance = {
      setRing(spec: RingSpec): void {
        buildScene(spec);
      },

      setCaption(text: string, alert?: boolean): void {
        caption.textContent = text;
        caption.setAttribute('fill', alert === true ? palette.danger : palette.text);
      },

      /** 칠감 방울이 앞 정점에서 변을 타고 건너와 이 정점을 물들인다. */
      async paintStep(stepSpec: PaintStep): Promise<void> {
        const target = nodesById.get(stepSpec.node);
        if (!target) return;
        const color = stepSpec.color;
        const dropR = Math.max(8, Math.round(nodeR * 0.44));

        const prevGeom = stepSpec.prev === null ? null : (nodesById.get(stepSpec.prev) ?? null);
        const edge = prevGeom === null ? undefined : findEdge(prevGeom.id, target.id);
        const forward = prevGeom !== null && edge?.a === prevGeom.id;

        const from: Pt =
          prevGeom === null
            ? { x: target.x, y: target.y - (nodeR + 24) }
            : { x: prevGeom.x, y: prevGeom.y };

        const drop = el('circle', { cx: from.x, cy: from.y, r: dropR, fill: paintOf(color) });
        gTokens.appendChild(drop);

        await animate(TRAVEL_MS, (p) => {
          const e = easeOut(p);
          const at: Pt =
            edge === undefined
              ? { x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e) }
              : edge.at(forward ? e : 1 - e);
          drop.setAttribute('cx', String(at.x));
          drop.setAttribute('cy', String(at.y));
        });

        setNodePaint(target, color);
        moveCursor(target);
        if (edge !== undefined) setEdgeState(edge, 'settled');

        await animate(ABSORB_MS, (p) => {
          drop.setAttribute('r', String(dropR * (1 - p)));
          target.circle.setAttribute('r', String(nodeR * (1 + 0.14 * Math.sin(p * Math.PI))));
        });
        target.circle.setAttribute('r', String(nodeR));
        drop.remove();
      },

      /** 마지막 변. 양 끝의 색이 각자 활을 타고 와 한가운데서 만난다. */
      async closeStep(closeSpec: CloseStep): Promise<void> {
        const ga = nodesById.get(closeSpec.a);
        const gb = nodesById.get(closeSpec.b);
        const edge = findEdge(closeSpec.a, closeSpec.b);
        if (!ga || !gb || !edge) return;
        hideCursor();

        const tokenR = Math.max(10, Math.round(nodeR * 0.54));
        const startA = edge.a === closeSpec.a ? 0 : 1;
        const startB = 1 - startA;

        // 한가운데에서 서로 맞닿아 멈추도록, 그 지점의 진행 속도로 반지름을
        // t 로 환산한다. 활의 모양이 달라져도 같은 식이 통한다.
        const mid = edge.at(0.5);
        const probe = edge.at(0.51);
        const speed = Math.max(1, Math.hypot(probe.x - mid.x, probe.y - mid.y) / 0.01);
        const gapT = tokenR / speed;
        const stopA = startA < 0.5 ? 0.5 - gapT : 0.5 + gapT;
        const stopB = startB < 0.5 ? 0.5 - gapT : 0.5 + gapT;

        const colorA = painted.get(closeSpec.a) ?? PAINT_FIRST;
        const colorB = painted.get(closeSpec.b) ?? PAINT_SECOND;
        const tokenA = el('circle', {
          cx: ga.x,
          cy: ga.y,
          r: tokenR,
          fill: paintOf(colorA),
          stroke: palette.stateInk,
          'stroke-width': 1,
        });
        const tokenB = el('circle', {
          cx: gb.x,
          cy: gb.y,
          r: tokenR,
          fill: paintOf(colorB),
          stroke: palette.stateInk,
          'stroke-width': 1,
        });
        gTokens.appendChild(tokenA);
        gTokens.appendChild(tokenB);

        const place = (token: SVGCircleElement, tt: number): void => {
          const at = edge.at(Math.max(0, Math.min(1, tt)));
          token.setAttribute('cx', String(at.x));
          token.setAttribute('cy', String(at.y));
        };

        // 부딪히러 가는 길이므로 가속해서 들어간다.
        await animate(APPROACH_MS, (p) => {
          const e = easeIn(p);
          place(tokenA, lerp(startA, stopA, e));
          place(tokenB, lerp(startB, stopB, e));
        });

        if (!closeSpec.same) {
          // 두 끝의 색이 다르면 이 변도 지켜진다 — 부딪힐 것이 없다.
          setEdgeState(edge, 'settled');
          return;
        }

        setEdgeState(edge, 'conflict');
        dangerRing(ga);
        dangerRing(gb);
        burst(mid);

        // 튕겨 나갔다가 잦아든다. 같은 색끼리는 서로를 통과하지 못한다.
        const recoilT = (tokenR * 0.9) / speed;
        const dirA = startA < 0.5 ? -1 : 1;
        await animate(RECOIL_MS, (p) => {
          const damp = Math.exp(-4.5 * p) * Math.cos(9 * p);
          place(tokenA, stopA - dirA * recoilT * damp);
          place(tokenB, stopB + dirA * recoilT * damp);
        });
        place(tokenA, stopA);
        place(tokenB, stopB);
      },

      /** 결론. 같은 색으로 맞선 두 끝을 한 번 더 두드려 준다. */
      async markConflict(mark: ConflictMark): Promise<void> {
        const ga = nodesById.get(mark.a);
        const gb = nodesById.get(mark.b);
        if (!ga || !gb) return;
        hideCursor();
        const ringA = dangerRing(ga);
        const ringB = dangerRing(gb);
        await animate(PULSE_MS, (p) => {
          const r = nodeR + 6 + 7 * Math.sin(p * Math.PI);
          ringA.setAttribute('r', String(r));
          ringB.setAttribute('r', String(r));
        });
        ringA.setAttribute('r', String(nodeR + 6));
        ringB.setAttribute('r', String(nodeR + 6));
      },

      /** 처음 상태로. 칠감·토큰·충돌 자국을 걷고 변을 원래 굵기로 되돌린다. */
      rewind(): void {
        clearGroup(gTokens);
        clearGroup(gMarks);
        for (const ring of dangerRings.values()) ring.remove();
        dangerRings.clear();
        for (const geom of nodesById.values()) {
          geom.circle.setAttribute('r', String(nodeR));
          setNodePaint(geom, null);
        }
        for (const edge of edges) setEdgeState(edge, 'idle');
        hideCursor();
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) unraf(id);
        frames.clear();
        for (const wake of [...waiting]) wake();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
