/**
 * undo-by-back-edge-stage — 관과 되돌릴 폭.
 *
 * 관 하나의 굵기가 곧 용량이고, 그 안은 용량만큼의 차선으로 나뉜다. 찬 차선이
 * 흘린 양이고 빈 차선이 앞으로 더 흘릴 폭이다. 그래서 **관 하나가 잔여 그래프
 * 양쪽을 동시에 그린다** — 관 머리의 화살은 빈 폭만큼, 관 꼬리의 화살은 찬
 * 폭만큼 크다. 꼬리 화살은 처음엔 없다가 흘린 뒤에 생겨난다.
 *
 * 밀어냄은 자리의 움직임으로 그린다. 역방향으로 지나가는 덩이가 관 머리로
 * 들어와 앞서 찬 것을 꼬리 밖으로 밀어내고, 밀려 나온 것이 그 길로 이어 간다.
 */

import {
  PIECE_CANVAS_W,
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 정점 반지름. */
const R = 22;
/** 관이 정점에서 떨어지는 거리 — 화살촉이 들어갈 자리. */
const NODE_GAP = 13;
/** 용량 한 단위의 관 두께. 관 굵기 = 용량 × 이 값. */
const LANE = 9;
/** 차선과 관 벽 사이. */
const LANE_INSET = 1.2;
/** 화살촉 길이. */
const HEAD_LEN = 10;
/** 움직이는 덩이의 길이. */
const SLUG = 20;

/** 그림이 놓이는 자리. 남는 폭을 여백으로 버리지 않도록 캔버스에서 역산한다. */
const SOURCE_X = 68;
const MIDDLE_X = 258;
const SINK_X = 456;
const AXIS_Y = 132;
const MID_TOP = 56;
const MID_BOTTOM = 208;
const GAUGE_X = 520;
const GAUGE_W = 62;
const GAUGE_BOTTOM = 212;
const GAUGE_TOP = 92;
const CAPTION_Y1 = 262;
const CAPTION_Y2 = 281;

/** 걸음 안의 지속시간. 총 재생 길이는 이 값들 + stepMs 로 정해진다. */
const COMET_MS = 170;
const PUSH_MS = 300;
const ARROW_MS = 220;
const GAUGE_MS = 260;
const BUMP_MS = 420;
/** 꽉 찬 관에 밀어 넣어 보는 덩이의 길이와, 들어가다 되튀는 거리. */
const BUMP_W = 12;
const BUMP_TRAVEL = 16;

export type UndoStageEdge = { from: string; to: string; capacity: number };

export type UndoStageGraph = {
  nodes: string[];
  edges: UndoStageEdge[];
  source: string;
  sink: string;
};

export type UndoStagePath = {
  nodes: string[];
  reverse: boolean[];
  amount: number;
  caption: string;
};

export type UndoStagePush = UndoStagePath & {
  total: number;
  /** `${from}-${to}` → 갱신된 흐름. */
  flows: Record<string, number>;
};

export type UndoStageStuck = {
  reachable: string[];
  /** `${from}-${to}` 목록. */
  blocked: string[];
  caption: string;
};

type NodeArt = {
  id: string;
  x: number;
  y: number;
  circle: SVGCircleElement;
  label: SVGTextElement;
};

type EdgeArt = {
  key: string;
  from: string;
  to: string;
  capacity: number;
  /** 관의 길이와 굵기. 관 안의 모든 것은 꼬리를 원점으로 하는 국소 좌표에서 그린다. */
  len: number;
  thick: number;
  body: SVGRectElement;
  lanes: SVGRectElement[];
  head: SVGPolygonElement;
  back: SVGPolygonElement;
  /** 차오르거나 밀려 나가는 중인 부분 — 차선 위에 겹쳐 그린다. */
  moving: SVGRectElement;
  slug: SVGRectElement;
  label: SVGTextElement;
  /** 지금 그려져 있는 화살촉 반높이 — 크기 변화를 이어서 애니메이션하려고 둔다. */
  headHalf: number;
  backHalf: number;
};

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

const nowMs = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

function el<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

export const undoByBackEdgeStageView: CanvasView = {
  canvas: { height: H },

  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    // viewBox 는 러너가 `canvas.height` 로 잡아 두었다. 여기서 다시 적지 않는다 (S-view).
    svg.textContent = '';

    // ── 뒷일 관리. destroyed 는 rAF 루프를, timers 는 걸어 둔 타이머를 거둔다.
    //    generation 은 재생 도중 되감기가 들어왔을 때 진행 중인 애니메이션이
    //    되감긴 화면을 덮어쓰지 않게 막는다.
    let destroyed = false;
    let generation = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const schedule = (fn: () => void): void => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => fn());
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, 16);
      timers.add(id);
    };

    const animate = (dur: number, onFrame: (p: number) => void): Promise<void> => {
      const gen = generation;
      return new Promise<void>((resolve) => {
        const start = nowMs();
        const tick = (): void => {
          if (destroyed || gen !== generation) {
            resolve();
            return;
          }
          const p = Math.min(1, (nowMs() - start) / Math.max(1, dur));
          onFrame(ease(p));
          if (p >= 1) {
            resolve();
            return;
          }
          schedule(tick);
        };
        schedule(tick);
      });
    };

    // ── 레이어 (뒤에서 앞으로)
    const gEdges = el(svg, 'g', {});
    const gGauge = el(svg, 'g', {});
    const gNodes = el(svg, 'g', {});
    const gLabels = el(svg, 'g', {});
    const gCaption = el(svg, 'g', {});

    const caption1 = el(gCaption, 'text', {
      x: W / 2,
      y: CAPTION_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const caption2 = el(gCaption, 'text', {
      x: W / 2,
      y: CAPTION_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });

    const captionSize = Number.parseFloat(fontSizes.md);
    const estWidth = (s: string): number => {
      let w = 0;
      for (const ch of s) w += ch.codePointAt(0)! > 0x2e80 ? captionSize : captionSize * 0.55;
      return w;
    };
    const setCaption = (text: string): void => {
      const words = text.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const word of words) {
        const next = cur.length > 0 ? `${cur} ${word}` : word;
        if (cur.length > 0 && estWidth(next) > W - 60) {
          lines.push(cur);
          cur = word;
        } else {
          cur = next;
        }
      }
      if (cur.length > 0) lines.push(cur);
      caption1.textContent = lines[0] ?? '';
      caption2.textContent = lines[1] ?? '';
    };

    // ── 그래프 상태
    let graph: UndoStageGraph | null = null;
    const nodeArt = new Map<string, NodeArt>();
    const edgeArt = new Map<string, EdgeArt>();
    const flowByKey = new Map<string, number>();
    let blocks: SVGRectElement[] = [];
    let received = 0;
    let gaugeTotal: SVGTextElement | null = null;
    let slotPitch = 24;
    let slotH = 18;

    // ── 정점 그리기 -------------------------------------------------------
    const paintNode = (art: NodeArt, state: 'idle' | 'active'): void => {
      art.circle.setAttribute('fill', state === 'active' ? c.itemActive : c.itemDefault);
      art.circle.setAttribute('stroke', state === 'active' ? c.itemActive : c.border);
      art.label.setAttribute('fill', state === 'active' ? c.stateInk : c.text);
    };

    const clearNodes = (): void => {
      for (const art of nodeArt.values()) paintNode(art, 'idle');
    };

    // ── 관 그리기 ---------------------------------------------------------
    const headPoints = (art: EdgeArt, half: number): string =>
      `${art.len + 1},${-half} ${art.len + 1 + HEAD_LEN},0 ${art.len + 1},${half}`;

    const backPoints = (half: number): string =>
      `${-1},${-half} ${-1 - HEAD_LEN},0 ${-1},${half}`;

    const laneY = (art: EdgeArt, index: number): number =>
      -art.thick / 2 + index * LANE + LANE_INSET;

    /** 찬 차선을 칠한다. 빈 차선은 테두리로 남는다 — 차선 수가 곧 용량이라 세어져야 한다. */
    const paintLanes = (art: EdgeArt, litCount: number): void => {
      for (let i = 0; i < art.lanes.length; i += 1) {
        const lit = i < litCount;
        art.lanes[i].setAttribute('fill', lit ? c.primary : c.bg);
        art.lanes[i].setAttribute('stroke', lit ? 'none' : c.border);
      }
    };

    /** 지금 움직이는 부분을 차선 위에 겹쳐 그린다. 길이가 0 이면 감춘다. */
    const placeMoving = (
      art: EdgeArt,
      lane: { from: number; count: number },
      width: number,
    ): void => {
      const w = Math.max(0, Math.min(art.len, width));
      art.moving.setAttribute('x', '0');
      art.moving.setAttribute('width', String(w));
      art.moving.setAttribute('y', String(laneY(art, lane.from)));
      art.moving.setAttribute('height', String(Math.max(2, lane.count * LANE - LANE_INSET * 2)));
      art.moving.setAttribute('opacity', w > 0.5 ? '1' : '0');
    };

    const paintLabel = (art: EdgeArt): void => {
      art.label.textContent = `${flowByKey.get(art.key) ?? 0}/${art.capacity}`;
    };

    const setArrows = (art: EdgeArt, flow: number, immediate: boolean): void => {
      const headHalf = ((art.capacity - flow) * LANE) / 2;
      const backHalf = (flow * LANE) / 2;
      if (immediate) {
        art.headHalf = headHalf;
        art.backHalf = backHalf;
      }
      art.head.setAttribute('points', headPoints(art, Math.max(0.01, art.headHalf)));
      art.head.setAttribute('opacity', art.headHalf > 0.2 ? '1' : '0');
      art.back.setAttribute('points', backPoints(Math.max(0.01, art.backHalf)));
      art.back.setAttribute('opacity', art.backHalf > 0.2 ? '1' : '0');
    };

    /** 화살촉 크기를 목표값까지 이어서 키우거나 줄인다 — 되돌릴 폭이 생겨나는 장면. */
    const settleArrows = async (keys: string[]): Promise<void> => {
      const moving = keys
        .map((key) => edgeArt.get(key))
        .filter((art): art is EdgeArt => art !== undefined)
        .map((art) => {
          const flow = flowByKey.get(art.key) ?? 0;
          return {
            art,
            fromHead: art.headHalf,
            toHead: ((art.capacity - flow) * LANE) / 2,
            fromBack: art.backHalf,
            toBack: (flow * LANE) / 2,
          };
        })
        .filter((m) => m.fromHead !== m.toHead || m.fromBack !== m.toBack);
      if (moving.length === 0) return;
      await animate(ARROW_MS, (p) => {
        for (const m of moving) {
          m.art.headHalf = m.fromHead + (m.toHead - m.fromHead) * p;
          m.art.backHalf = m.fromBack + (m.toBack - m.fromBack) * p;
          setArrows(m.art, flowByKey.get(m.art.key) ?? 0, false);
        }
      });
      for (const m of moving) {
        m.art.headHalf = m.toHead;
        m.art.backHalf = m.toBack;
        setArrows(m.art, flowByKey.get(m.art.key) ?? 0, false);
      }
    };

    const paintEdge = (art: EdgeArt, state: 'idle' | 'active' | 'blocked'): void => {
      const flow = flowByKey.get(art.key) ?? 0;
      paintLanes(art, flow);
      paintLabel(art);
      art.body.setAttribute(
        'stroke',
        state === 'blocked' ? c.danger : state === 'active' ? c.itemActive : c.border,
      );
      art.body.setAttribute('stroke-width', state === 'idle' ? '1.4' : '2.6');
      art.moving.setAttribute('opacity', '0');
      art.slug.setAttribute('opacity', '0');
    };

    const clearEdges = (): void => {
      for (const art of edgeArt.values()) paintEdge(art, 'idle');
    };

    // ── 도착 눈금 ---------------------------------------------------------
    const paintGauge = (): void => {
      for (let i = 0; i < blocks.length; i += 1) {
        blocks[i].setAttribute('opacity', i < received ? '1' : '0');
        blocks[i].setAttribute('y', String(GAUGE_BOTTOM - slotH - i * slotPitch));
        blocks[i].setAttribute('x', String(GAUGE_X));
      }
      if (gaugeTotal) gaugeTotal.textContent = String(received);
    };

    // ── 화면 짓기 ---------------------------------------------------------
    const buildGraph = (g: UndoStageGraph): void => {
      gEdges.textContent = '';
      gNodes.textContent = '';
      gLabels.textContent = '';
      gGauge.textContent = '';
      nodeArt.clear();
      edgeArt.clear();
      flowByKey.clear();
      blocks = [];
      received = 0;

      // 자리: 들어오는 곳은 왼쪽, 나가는 곳은 오른쪽, 나머지는 가운데 세로로.
      const middles = g.nodes.filter((n) => n !== g.source && n !== g.sink);
      const posOf = (id: string): { x: number; y: number } => {
        if (id === g.source) return { x: SOURCE_X, y: AXIS_Y };
        if (id === g.sink) return { x: SINK_X, y: AXIS_Y };
        const i = middles.indexOf(id);
        if (middles.length <= 1) return { x: MIDDLE_X, y: AXIS_Y };
        const step = (MID_BOTTOM - MID_TOP) / (middles.length - 1);
        return { x: MIDDLE_X, y: MID_TOP + i * step };
      };

      // 들어오는 곳으로 들어가는 화살 — 그림 전체의 방향을 먼저 세운다.
      const entry = el(gEdges, 'g', {});
      el(entry, 'line', {
        x1: 18,
        y1: AXIS_Y,
        x2: SOURCE_X - R - HEAD_LEN - 2,
        y2: AXIS_Y,
        stroke: c.textMuted,
        'stroke-width': 2,
      });
      el(entry, 'polygon', {
        points: `${SOURCE_X - R - HEAD_LEN - 2},${AXIS_Y - 6} ${SOURCE_X - R - 2},${AXIS_Y} ${SOURCE_X - R - HEAD_LEN - 2},${AXIS_Y + 6}`,
        fill: c.textMuted,
      });

      for (const e of g.edges) {
        const key = `${e.from}-${e.to}`;
        const a = posOf(e.from);
        const b = posOf(e.to);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const ux = dx / dist;
        const uy = dy / dist;
        const trim = R + NODE_GAP;
        const len = Math.max(24, dist - trim * 2);
        const x = a.x + ux * trim;
        const y = a.y + uy * trim;
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const thick = e.capacity * LANE;

        const group = el(gEdges, 'g', { transform: `translate(${x} ${y}) rotate(${deg})` });
        const body = el(group, 'rect', {
          x: 0,
          y: -thick / 2,
          width: len,
          height: thick,
          rx: 4,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1.4,
        });
        const lanes: SVGRectElement[] = [];
        for (let i = 0; i < e.capacity; i += 1) {
          lanes.push(
            el(group, 'rect', {
              x: 0,
              y: -thick / 2 + i * LANE + LANE_INSET,
              width: len,
              height: LANE - LANE_INSET * 2,
              fill: c.bg,
              stroke: c.border,
              'stroke-width': 0.8,
            }),
          );
        }
        const moving = el(group, 'rect', { x: 0, y: 0, width: 0, height: 0, fill: c.primary, opacity: 0 });
        const head = el(group, 'polygon', { points: '', fill: c.textMuted });
        const back = el(group, 'polygon', { points: '', fill: c.accent, opacity: 0 });
        const slug = el(group, 'rect', { x: 0, y: 0, width: 0, height: 0, rx: 2, fill: c.accent, opacity: 0 });

        // 글자는 회전하지 않는 틀에 둔다 — 세로 관에서 라벨까지 세워지면 못 읽는다.
        const nx = -uy;
        const ny = ux;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const away = (cx - MIDDLE_X) * nx + (cy - AXIS_Y) * ny >= 0 ? 1 : -1;
        const off = thick / 2 + 11;
        const label = el(gLabels, 'text', {
          x: cx + nx * off * away,
          y: cy + ny * off * away + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });

        const art: EdgeArt = {
          key,
          from: e.from,
          to: e.to,
          capacity: e.capacity,
          len,
          thick,
          body,
          lanes,
          head,
          back,
          moving,
          slug,
          label,
          headHalf: (e.capacity * LANE) / 2,
          backHalf: 0,
        };
        edgeArt.set(key, art);
        flowByKey.set(key, 0);
        setArrows(art, 0, true);
        paintEdge(art, 'idle');
      }

      for (const id of g.nodes) {
        const p = posOf(id);
        const circle = el(gNodes, 'circle', {
          cx: p.x,
          cy: p.y,
          r: R,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 2,
        });
        const label = el(gNodes, 'text', {
          x: p.x,
          y: p.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: c.text,
        });
        label.textContent = id;
        nodeArt.set(id, { id, x: p.x, y: p.y, circle, label });
      }

      // 나가는 곳에서 눈금으로 이어지는 통로.
      el(gGauge, 'line', {
        x1: SINK_X + R + 2,
        y1: AXIS_Y,
        x2: GAUGE_X - 4,
        y2: AXIS_Y,
        stroke: c.border,
        'stroke-width': 1.4,
        'stroke-dasharray': '3 3',
      });

      // 눈금 칸 수 = 들어오는 곳에서 나갈 수 있는 최대치. 그보다 많이 닿을 수 없다.
      const outCap = g.edges
        .filter((e) => e.from === g.source)
        .reduce((sum, e) => sum + e.capacity, 0);
      const count = Math.max(1, outCap);
      // 칸 수가 늘면 간격을 줄여 담는다. 세로를 늘리지 않는다 (S-view).
      slotPitch = Math.min(24, (GAUGE_BOTTOM - GAUGE_TOP) / count);
      slotH = Math.max(6, slotPitch - 5);
      for (let i = 0; i < count; i += 1) {
        const y = GAUGE_BOTTOM - slotH - i * slotPitch;
        el(gGauge, 'rect', {
          x: GAUGE_X,
          y,
          width: GAUGE_W,
          height: slotH,
          rx: 3,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
      }
      for (let i = 0; i < count; i += 1) {
        blocks.push(
          el(gGauge, 'rect', {
            x: GAUGE_X,
            y: GAUGE_BOTTOM - slotH - i * slotPitch,
            width: GAUGE_W,
            height: slotH,
            rx: 3,
            fill: c.primary,
            opacity: 0,
          }),
        );
      }
      const gaugeLabel = el(gGauge, 'text', {
        x: GAUGE_X + GAUGE_W / 2,
        y: GAUGE_TOP - 8,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      gaugeLabel.textContent = t('label.received', 'reached {sink}', { sink: g.sink });
      gaugeTotal = el(gGauge, 'text', {
        x: GAUGE_X + GAUGE_W / 2,
        y: GAUGE_BOTTOM + 22,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: c.text,
      });
      paintGauge();
      setCaption('');
    };

    // ── 길에서 관 차례 뽑기 -------------------------------------------------
    const pathEdges = (
      nodes: string[],
      reverse: boolean[],
    ): { art: EdgeArt; reverse: boolean }[] => {
      const out: { art: EdgeArt; reverse: boolean }[] = [];
      for (let i = 0; i + 1 < nodes.length; i += 1) {
        const back = reverse[i] === true;
        const key = back ? `${nodes[i + 1]}-${nodes[i]}` : `${nodes[i]}-${nodes[i + 1]}`;
        const art = edgeArt.get(key);
        if (art) out.push({ art, reverse: back });
      }
      return out;
    };

    const placeSlug = (
      art: EdgeArt,
      lane: { from: number; count: number },
      x: number,
      width: number,
    ): void => {
      art.slug.setAttribute('x', String(x));
      art.slug.setAttribute('width', String(Math.max(0, width)));
      art.slug.setAttribute('y', String(laneY(art, lane.from)));
      art.slug.setAttribute('height', String(Math.max(2, lane.count * LANE - LANE_INSET * 2)));
      art.slug.setAttribute('opacity', '1');
    };

    // ── projector 가 부르는 것 ---------------------------------------------

    const setGraph = (g: UndoStageGraph): void => {
      graph = g;
      buildGraph(g);
    };

    const reset = (): void => {
      generation += 1;
      if (!graph) return;
      buildGraph(graph);
    };

    /** 찾은 길을 훑는다. 역방향 걸음은 관을 거슬러 훑어 방향이 드러난다. */
    const showPath = async (p: UndoStagePath): Promise<void> => {
      clearEdges();
      clearNodes();
      setCaption(p.caption);
      const steps = pathEdges(p.nodes, p.reverse);
      const first = nodeArt.get(p.nodes[0] ?? '');
      if (first) paintNode(first, 'active');
      for (let i = 0; i < steps.length; i += 1) {
        const { art, reverse } = steps[i];
        paintEdge(art, 'active');
        art.slug.setAttribute('y', '-2');
        art.slug.setAttribute('height', '4');
        art.slug.setAttribute('width', String(Math.min(SLUG, art.len)));
        art.slug.setAttribute('opacity', '1');
        await animate(COMET_MS, (q) => {
          const lead = reverse ? art.len * (1 - q) : art.len * q;
          art.slug.setAttribute('x', String(Math.max(0, lead - SLUG / 2)));
        });
        art.slug.setAttribute('opacity', '0');
        const arrived = nodeArt.get(p.nodes[i + 1] ?? '');
        if (arrived) paintNode(arrived, 'active');
      }
    };

    /**
     * 길을 따라 덩이를 보낸다. 앞으로 가는 관에서는 덩이가 지나간 만큼 차오르고,
     * 거슬러 가는 관에서는 앞서 찬 것이 덩이에 밀려 꼬리 밖으로 나간다.
     */
    const pushFlow = async (p: UndoStagePush): Promise<void> => {
      setCaption(p.caption);
      const steps = pathEdges(p.nodes, p.reverse);
      const touched: string[] = [];

      for (let i = 0; i < steps.length; i += 1) {
        const { art, reverse } = steps[i];
        const before = flowByKey.get(art.key) ?? 0;
        const after = p.flows[art.key] ?? before;
        const moved = Math.abs(after - before) || p.amount;
        const lane = reverse
          ? { from: Math.max(0, before - moved), count: moved }
          : { from: before, count: moved };

        paintEdge(art, 'active');
        // 움직이지 않는 차선은 미리 확정해 둔다 — 앞으로 갈 때는 흐르기 전 상태,
        // 거슬러 갈 때는 밀어내고 난 뒤 상태가 그대로 남는 몫이다.
        paintLanes(art, reverse ? lane.from : before);
        await animate(PUSH_MS, (q) => {
          const lead = reverse ? art.len * (1 - q) : art.len * q;
          placeMoving(art, lane, lead);
          if (reverse) {
            // 앞서 찬 것이 꼬리 밖으로 밀려 나가며 줄어들고, 덩이가 그 뒤를 민다.
            placeSlug(art, lane, lead, Math.min(SLUG, art.len - lead));
          } else {
            placeSlug(art, lane, Math.max(0, lead - SLUG), Math.min(SLUG, lead));
          }
        });
        art.slug.setAttribute('opacity', '0');
        flowByKey.set(art.key, after);
        paintEdge(art, 'active');
        touched.push(art.key);
      }

      // 흘린 뒤에야 되돌릴 폭이 생긴다 — 꼬리 화살이 찬 만큼 자라나고, 도로 비면 사라진다.
      await settleArrows(touched);

      const sinkArt = nodeArt.get(p.nodes[p.nodes.length - 1] ?? '');
      const added = Math.max(0, Math.min(blocks.length - received, p.total - received));
      if (added > 0 && sinkArt) {
        const start = received;
        received = p.total;
        if (gaugeTotal) gaugeTotal.textContent = String(received);
        const moving = blocks.slice(start, start + added);
        for (const b of moving) b.setAttribute('opacity', '1');
        const fromX = sinkArt.x - GAUGE_W / 2;
        const fromY = sinkArt.y - slotH / 2;
        await animate(GAUGE_MS, (q) => {
          for (let i = 0; i < moving.length; i += 1) {
            const toY = GAUGE_BOTTOM - slotH - (start + i) * slotPitch;
            moving[i].setAttribute('x', String(fromX + (GAUGE_X - fromX) * q));
            moving[i].setAttribute('y', String(fromY + (toY - fromY) * q));
          }
        });
      } else {
        received = p.total;
      }
      paintGauge();
    };

    /** 앞으로 난 화살로 닿는 데까지만 가고, 꽉 찬 관에 밀어 넣어 보다 되튄다. */
    const showBlocked = async (p: UndoStageStuck): Promise<void> => {
      clearEdges();
      clearNodes();
      setCaption(p.caption);
      for (const id of p.reachable) {
        const art = nodeArt.get(id);
        if (art) paintNode(art, 'active');
      }
      const walls = p.blocked
        .map((key) => edgeArt.get(key))
        .filter((art): art is EdgeArt => art !== undefined);
      for (const art of walls) paintEdge(art, 'blocked');
      if (walls.length === 0) return;
      for (const art of walls) {
        art.slug.setAttribute('y', String(-art.thick / 2 + LANE_INSET));
        art.slug.setAttribute('height', String(Math.max(4, art.thick - LANE_INSET * 2)));
        art.slug.setAttribute('width', String(Math.min(BUMP_W, art.len)));
        art.slug.setAttribute('opacity', '1');
      }
      await animate(BUMP_MS, (q) => {
        const bump = q < 0.5 ? q * 2 : (1 - q) * 2;
        for (const art of walls) art.slug.setAttribute('x', String(bump * BUMP_TRAVEL));
      });
      for (const art of walls) art.slug.setAttribute('opacity', '0');
    };

    /** 되돌릴 폭으로도 길이 없다. 막은 관들이 곧 최대치를 정한 목이다. */
    const finish = async (p: UndoStageStuck): Promise<void> => {
      await showBlocked(p);
      for (let i = 0; i < received && i < blocks.length; i += 1) {
        blocks[i].setAttribute('stroke', c.accent);
        blocks[i].setAttribute('stroke-width', '2');
      }
    };

    // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부르므로 컨테이너를 비우지 않는다.
    // 비운다면 그 한 줄이 캔버스를 통째로 떼어 낸다 (S-view).
    void container;

    return {
      setGraph,
      reset,
      showPath,
      pushFlow,
      showBlocked,
      finish,
      destroy(): void {
        destroyed = true;
        generation += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    };
  },
};
