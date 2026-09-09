/**
 * pick-nearest-unsettled-stage — 흔들리는 것과 굳은 것.
 *
 * 이 조각의 주장은 두 상태의 **차이**에 있으므로 화면도 거기서 갈린다.
 *
 *   아직 닿지 않음   점선 테두리에 ∞. 후보가 아니므로 멎어 있다.
 *   흔들림           수를 이고 미세하게 떤다. 아직 더 내려갈 수 있다는 뜻이다.
 *   굳음             돌로 채워지고 완전히 멎는다. 조임 고리가 바깥에서 접혀 들어와
 *                    잠그는 순간이 "굳는다" 이고, 그 뒤로 이 정점은 한 픽셀도 움직이지 않는다.
 *
 * 떨림이 늘 돌고 있어서 "무엇이 아직 후보인가" 를 걸음마다 말해 줄 필요가 없다.
 * 수가 건너가는 걸음에서는 굳은 이웃과 흔들리는 이웃에 **동시에** 수가 닿는다 —
 * 하나는 튕겨 나오고 하나는 받아 내려간다. 그 한 화면이 주장의 자리다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 정점 자리는 0~1 로 선언된 것을 캔버스
 * 크기에서 환산하므로 폭을 그대로 채우고, 반지름은 가장 가까운 두 정점 사이에서
 * 역산해 상수는 상한으로만 둔다 (S-piece).
 */

import { PIECE_CANVAS_W, fonts, fontSizes, getColors } from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 272;

/**
 * 정점이 놓이는 띠. 아래는 캡션 한 줄이 앉을 자리를 남기고, 좌우 여백은 굳을 때
 * 접혀 들어오는 조임 고리(반지름 + LOCK_RING_GAP)가 잘리지 않을 만큼 둔다.
 */
const MARGIN_X = 46;
const GRAPH_TOP = 42;
const GRAPH_H = 164;
const CAPTION_Y = H - 18;

/** 반지름 상한. 실제 값은 가장 가까운 두 정점 사이에서 역산한다. */
const NODE_R_MAX = 26;

/** 굳을 때 바깥에서 접혀 들어오는 고리의 시작 여유. */
const LOCK_RING_GAP = 14;

/** 떨림 진폭(px). 읽기를 방해하지 않으면서 "아직 흔들린다" 가 보이는 크기. */
const TREMBLE_AMP = 1.7;
/** 수가 내려간 직후 잠깐 크게 떤다. */
const AGITATE_MS = 620;

const HARDEN_MS = 460;
const TRAVEL_MS = 380;
const REBOUND_MS = 260;
const ABSORB_MS = 220;
const SWAP_MS = 240;
const STAGGER_MS = 70;

/** 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 3번, 기호 표기). */
const INFINITY_GLYPH = '∞';

type Pt = { x: number; y: number };

export type PickNearestUnsettledStageNode = { id: string };

/**
 * 정점의 자리. 캔버스 폭·높이에 대한 비율이며, 환산은 아래 render 가 한다.
 *
 * 선언(`initialData`)이 아니라 여기 있는 까닭: 어디에 놓을지는 값이 아니라 **그림의
 * 결정**이고, 캔버스 비율이 바뀌면 뜻이 달라지는데 선언에 박힌 수는 그것을 따라오지
 * 못한다 (S-piece). 선언이 주는 것은 구조 — 정점 · 간선 · 무게 · 출발점뿐이다.
 *
 * 간선 여섯이 서로 넘지 않도록 고른 자리다. 규칙으로 셈하지 않고 손으로 고른 것은
 * 이 그래프가 링도 나무도 아니라 규칙이 낼 배치가 마땅치 않기 때문이다.
 */
const PLACE: Record<string, { x: number; y: number }> = {
  S: { x: 0.0, y: 0.52 },
  A: { x: 0.28, y: 0.06 },
  B: { x: 0.3, y: 0.96 },
  C: { x: 0.64, y: 0.52 },
  D: { x: 1.0, y: 0.12 },
};

/** 표에 없는 정점은 가운데 줄에 고르게 편다 — 데이터가 바뀌어도 겹쳐 죽지 않게. */
function placeOf(id: string, index: number, total: number): { x: number; y: number } {
  return PLACE[id] ?? { x: total <= 1 ? 0.5 : index / (total - 1), y: 0.5 };
}
export type PickNearestUnsettledStageEdge = { from: string; to: string; weight: number };
export type PickNearestUnsettledStageGraph = {
  nodes: PickNearestUnsettledStageNode[];
  edges: PickNearestUnsettledStageEdge[];
};

/** projector 가 좁혀서 넘겨 주는 한 이웃의 결과 (C9). */
export type PickNearestUnsettledStageProbe = {
  to: string;
  offered: number;
  after: number | null;
  outcome: 'lower' | 'keep' | 'blocked';
};

type NodeKind = 'far' | 'loose' | 'stone';

type NodeState = {
  kind: NodeKind;
  value: number | null;
  /** 굳는 중 0 → 1. 떨림이 이 값만큼 잦아든다. */
  hardenP: number;
  /** 이 시각까지 크게 떤다. */
  agitateUntil: number;
};

type NodeEls = {
  group: SVGGElement;
  inner: SVGGElement;
  base: SVGCircleElement;
  stone: SVGCircleElement;
  idText: SVGTextElement;
  valueText: SVGTextElement;
  phase: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const nowMs = (): number =>
  typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const pickNearestUnsettledStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const palette: Palette = getColors(params.theme);

    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저 붙여 둔 이 캔버스가
    // 떨어져 나가고 화면이 통째로 빈다 (S-view).
    svg.textContent = '';

    const edgeLayer = el('g', {});
    const nodeLayer = el('g', {});
    const fxLayer = el('g', {});
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: palette.text,
    });
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(fxLayer);
    svg.appendChild(caption);

    const centers = new Map<string, Pt>();
    const nodeEls = new Map<string, NodeEls>();
    const states = new Map<string, NodeState>();
    const edgeLines = new Map<string, SVGLineElement>();
    let radius = NODE_R_MAX;
    let order: string[] = [];

    let destroyed = false;
    const stoppers = new Set<() => void>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    let trembleHandle = 0;

    /**
     * 시간에 따른 그림 변화 하나. destroy 되면 즉시 풀린다 — 스스로 다음 회차를
     * 예약하는 루프를 남기지 않는다 (S-view).
     */
    function animate(duration: number, onFrame: (p: number) => void): Promise<void> {
      if (destroyed || !hasRaf || duration <= 0) {
        onFrame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = nowMs();
        let handle = 0;
        const stop = (): void => {
          if (handle !== 0) cancelAnimationFrame(handle);
          stoppers.delete(stop);
          resolve();
        };
        const tick = (): void => {
          const p = destroyed ? 1 : Math.min(1, (nowMs() - start) / duration);
          onFrame(p);
          if (p >= 1) {
            stop();
            return;
          }
          handle = requestAnimationFrame(tick);
        };
        stoppers.add(stop);
        handle = requestAnimationFrame(tick);
      });
    }

    const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

    function amplitude(st: NodeState, t: number): number {
      if (st.kind === 'stone' || st.kind === 'far') return 0;
      const left = st.agitateUntil - t;
      const boost = left > 0 ? 1 + 1.8 * (left / AGITATE_MS) : 1;
      return TREMBLE_AMP * (1 - st.hardenP) * boost;
    }

    /** 떨림 한 프레임. 굳은 것은 정확히 제자리에 둔다 — 그 정지가 이 조각의 절반이다. */
    function tremble(): void {
      if (destroyed) return;
      const t = nowMs();
      const s = t / 1000;
      for (const id of order) {
        const st = states.get(id);
        const e = nodeEls.get(id);
        if (!st || !e) continue;
        const amp = amplitude(st, t);
        const dx = amp === 0 ? 0 : amp * Math.sin(s * 6.3 + e.phase);
        const dy = amp === 0 ? 0 : amp * Math.cos(s * 8.1 + e.phase * 1.7);
        e.group.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
      }
      trembleHandle = requestAnimationFrame(tremble);
    }

    function paintNode(id: string): void {
      const st = states.get(id);
      const e = nodeEls.get(id);
      if (!st || !e) return;
      const stony = st.kind === 'stone' || st.hardenP > 0.5;
      e.stone.setAttribute('opacity', (st.kind === 'stone' ? 1 : st.hardenP).toFixed(3));
      e.base.setAttribute(
        'stroke',
        st.kind === 'far' ? palette.border : stony ? palette.text : palette.itemComparing,
      );
      e.base.setAttribute('stroke-width', st.kind === 'far' ? '1.4' : stony ? '2.6' : '2');
      e.base.setAttribute('stroke-dasharray', st.kind === 'far' ? '3 4' : 'none');
      e.idText.setAttribute('fill', stony ? palette.textInverse : palette.textMuted);
      e.valueText.setAttribute(
        'fill',
        stony ? palette.textInverse : st.kind === 'far' ? palette.textMuted : palette.text,
      );
      e.valueText.textContent = st.value === null ? INFINITY_GLYPH : String(st.value);
    }

    function resetStates(): void {
      for (const id of order) {
        states.set(id, { kind: 'far', value: null, hardenP: 0, agitateUntil: 0 });
        paintNode(id);
      }
      fxLayer.textContent = '';
      for (const line of edgeLines.values()) {
        line.setAttribute('stroke', palette.border);
        line.setAttribute('stroke-width', '1.6');
      }
    }

    function buildGraph(graph: PickNearestUnsettledStageGraph): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      fxLayer.textContent = '';
      centers.clear();
      nodeEls.clear();
      states.clear();
      edgeLines.clear();
      order = graph.nodes.map((n) => n.id);
      if (order.length === 0) return;

      const spanX = W - MARGIN_X * 2;
      graph.nodes.forEach((n, i) => {
        const p = placeOf(n.id, i, graph.nodes.length);
        centers.set(n.id, {
          x: Math.round(MARGIN_X + p.x * spanX),
          y: Math.round(GRAPH_TOP + p.y * GRAPH_H),
        });
      });

      // 반지름은 가장 가까운 두 정점에서 역산한다. 상수는 상한일 뿐이라 캔버스가
      // 넓어지면 그림도 함께 커진다 (S-piece "그 폭을 채운다").
      let closest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < graph.nodes.length; i += 1) {
        for (let j = i + 1; j < graph.nodes.length; j += 1) {
          const a = centers.get(graph.nodes[i]!.id)!;
          const b = centers.get(graph.nodes[j]!.id)!;
          closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      radius = Number.isFinite(closest)
        ? Math.max(16, Math.min(NODE_R_MAX, Math.floor(closest / 2) - 8))
        : NODE_R_MAX;

      for (const e of graph.edges) {
        const a = centers.get(e.from);
        const b = centers.get(e.to);
        if (!a || !b) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const line = el('line', {
          x1: a.x + ux * radius,
          y1: a.y + uy * radius,
          x2: b.x - ux * radius,
          y2: b.y - uy * radius,
          stroke: palette.border,
          'stroke-width': 1.6,
          'stroke-linecap': 'round',
        });
        edgeLayer.appendChild(line);
        edgeLines.set(edgeKey(e.from, e.to), line);

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        edgeLayer.appendChild(
          el('rect', { x: mx - 10, y: my - 8, width: 20, height: 16, rx: 4, fill: palette.bg }),
        );
        const wt = el('text', {
          x: mx,
          y: my + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: palette.textMuted,
        });
        wt.textContent = String(e.weight);
        edgeLayer.appendChild(wt);
      }

      graph.nodes.forEach((n, i) => {
        const c = centers.get(n.id)!;
        const group = el('g', {});
        const inner = el('g', {});
        const base = el('circle', {
          cx: c.x,
          cy: c.y,
          r: radius,
          fill: palette.bg,
          stroke: palette.border,
          'stroke-width': 1.4,
        });
        const stone = el('circle', {
          cx: c.x,
          cy: c.y,
          r: radius,
          fill: palette.itemSorted,
          opacity: 0,
        });
        const idText = el('text', {
          x: c.x,
          y: c.y - 7,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: palette.textMuted,
        });
        idText.textContent = n.id;
        const valueText = el('text', {
          x: c.x,
          y: c.y + 11,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: palette.textMuted,
        });
        valueText.textContent = INFINITY_GLYPH;
        inner.appendChild(base);
        inner.appendChild(stone);
        inner.appendChild(idText);
        inner.appendChild(valueText);
        group.appendChild(inner);
        nodeLayer.appendChild(group);
        nodeEls.set(n.id, { group, inner, base, stone, idText, valueText, phase: i * 1.9 });
        states.set(n.id, { kind: 'far', value: null, hardenP: 0, agitateUntil: 0 });
        paintNode(n.id);
      });

      if (hasRaf && trembleHandle === 0) trembleHandle = requestAnimationFrame(tremble);
    }

    /** 이고 있던 수가 다른 수로 갈린다 — 옛 수는 위로 빠지고 새 수는 아래에서 올라온다. */
    async function swapValue(id: string, next: number): Promise<void> {
      const st = states.get(id);
      const e = nodeEls.get(id);
      if (!st || !e) return;
      const ghost = el('text', {
        x: e.valueText.getAttribute('x') ?? 0,
        y: e.valueText.getAttribute('y') ?? 0,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: e.valueText.getAttribute('fill') ?? palette.text,
      });
      ghost.textContent = e.valueText.textContent;
      e.inner.appendChild(ghost);

      st.value = next;
      if (st.kind === 'far') st.kind = 'loose';
      paintNode(id);

      await animate(SWAP_MS, (p) => {
        const q = easeOut(p);
        ghost.setAttribute('transform', `translate(0 ${(-13 * q).toFixed(2)})`);
        ghost.setAttribute('opacity', (1 - q).toFixed(3));
        e.valueText.setAttribute('transform', `translate(0 ${(14 * (1 - q)).toFixed(2)})`);
        e.valueText.setAttribute('opacity', q.toFixed(3));
      });
      ghost.remove();
      e.valueText.removeAttribute('transform');
      e.valueText.setAttribute('opacity', '1');
      st.agitateUntil = nowMs() + AGITATE_MS;
    }

    /** 내미는 수 하나가 간선을 타고 이웃까지 간다. 받아들이는지 튕기는지는 이웃이 정한다. */
    async function flight(
      from: string,
      probe: PickNearestUnsettledStageProbe,
      delayMs: number,
    ): Promise<void> {
      const a = centers.get(from);
      const b = centers.get(probe.to);
      if (!a || !b) return;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const start: Pt = { x: a.x + ux * (radius + 3), y: a.y + uy * (radius + 3) };
      const hit: Pt = { x: b.x - ux * (radius + 4), y: b.y - uy * (radius + 4) };

      const pill = el('g', { transform: `translate(${start.x} ${start.y})` });
      pill.appendChild(
        el('rect', {
          x: -15,
          y: -11,
          width: 30,
          height: 22,
          rx: 11,
          fill: palette.bg,
          stroke: palette.itemComparing,
          'stroke-width': 1.6,
        }),
      );
      const pillText = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: palette.text,
      });
      pillText.textContent = String(probe.offered);
      pill.appendChild(pillText);
      fxLayer.appendChild(pill);

      const line = edgeLines.get(edgeKey(from, probe.to));
      line?.setAttribute('stroke', palette.itemComparing);
      line?.setAttribute('stroke-width', '2.2');

      if (delayMs > 0) await animate(delayMs, () => {});
      await animate(TRAVEL_MS, (p) => {
        const q = easeInOut(p);
        pill.setAttribute(
          'transform',
          `translate(${lerp(start.x, hit.x, q).toFixed(2)} ${lerp(start.y, hit.y, q).toFixed(2)})`,
        );
      });

      if (probe.outcome === 'lower') {
        // 받아들인다 — 알약이 정점 안으로 빨려 들며 그 자리에서 수가 갈린다.
        await Promise.all([
          animate(ABSORB_MS, (p) => {
            const q = easeOut(p);
            pill.setAttribute(
              'transform',
              `translate(${lerp(hit.x, b.x, q).toFixed(2)} ${lerp(hit.y, b.y, q).toFixed(2)}) scale(${(1 - 0.6 * q).toFixed(3)})`,
            );
            pill.setAttribute('opacity', (1 - q).toFixed(3));
          }),
          swapValue(probe.to, probe.after ?? probe.offered),
        ]);
      } else {
        // 튕겨 나온다. 굳은 이웃이면 부딪힌 자리에 자국이 잠깐 남지만, 그 정점은
        // 한 픽셀도 움직이지 않는다 — 이 정지가 조각이 하려는 말이다.
        const mark =
          probe.outcome === 'blocked'
            ? el('line', {
                x1: hit.x - uy * 11,
                y1: hit.y + ux * 11,
                x2: hit.x + uy * 11,
                y2: hit.y - ux * 11,
                stroke: palette.text,
                'stroke-width': 2.4,
                'stroke-linecap': 'round',
              })
            : null;
        if (mark) fxLayer.appendChild(mark);
        const back = probe.outcome === 'blocked' ? 30 : 14;
        const drop = probe.outcome === 'blocked' ? 6 : 12;
        await animate(REBOUND_MS, (p) => {
          const q = easeOut(p);
          pill.setAttribute(
            'transform',
            `translate(${(hit.x - ux * back * q).toFixed(2)} ${(hit.y - uy * back * q + drop * q * q).toFixed(2)})`,
          );
          pill.setAttribute('opacity', (1 - q).toFixed(3));
          mark?.setAttribute('opacity', (1 - q).toFixed(3));
          mark?.setAttribute('stroke-width', (2.4 + 1.6 * q).toFixed(2));
        });
        mark?.remove();
      }

      pill.remove();
      line?.setAttribute('stroke', palette.border);
      line?.setAttribute('stroke-width', '1.6');
    }

    const instance: ViewInstance = {
      setGraph(graph: PickNearestUnsettledStageGraph): void {
        buildGraph(graph);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 되감기 — 모든 정점을 처음 상태로 되돌린다. */
      clear(): void {
        resetStates();
      },

      /** 출발점이 0 을 인다. 여기서부터 흔들리기 시작한다. */
      async seed(id: string, value: number): Promise<void> {
        const st = states.get(id);
        if (!st) return;
        st.kind = 'loose';
        await swapValue(id, value);
      },

      /** 굳는다 — 조임 고리가 바깥에서 접혀 들어오고, 그와 함께 떨림이 멎는다. */
      async harden(id: string, value: number): Promise<void> {
        const st = states.get(id);
        const e = nodeEls.get(id);
        const c = centers.get(id);
        if (!st || !e || !c) return;
        st.value = value;
        st.kind = 'loose';
        st.hardenP = 0;
        st.agitateUntil = 0;
        paintNode(id);

        const ring = el('circle', {
          cx: c.x,
          cy: c.y,
          r: radius + LOCK_RING_GAP,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 3,
        });
        fxLayer.appendChild(ring);

        await animate(HARDEN_MS, (p) => {
          const q = easeOut(p);
          ring.setAttribute('r', (radius + LOCK_RING_GAP * (1 - q)).toFixed(2));
          ring.setAttribute('opacity', (1 - q * q).toFixed(3));
          const pulse = 1 + 0.07 * Math.sin(p * Math.PI);
          e.inner.setAttribute(
            'transform',
            `translate(${c.x} ${c.y}) scale(${pulse.toFixed(4)}) translate(${-c.x} ${-c.y})`,
          );
          st.hardenP = q;
          paintNode(id);
        });

        ring.remove();
        e.inner.removeAttribute('transform');
        e.group.setAttribute('transform', 'translate(0 0)');
        st.kind = 'stone';
        st.hardenP = 1;
        paintNode(id);
      },

      /** 굳은 자리에서 이웃들로 수가 한꺼번에 건너간다. */
      async spread(from: string, probes: PickNearestUnsettledStageProbe[]): Promise<void> {
        await Promise.all(probes.map((probe, i) => flight(from, probe, i * STAGGER_MS)));
      },

      destroy(): void {
        destroyed = true;
        if (trembleHandle !== 0 && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(trembleHandle);
        }
        trembleHandle = 0;
        for (const stop of [...stoppers]) stop();
        stoppers.clear();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
