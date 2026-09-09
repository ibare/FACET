/**
 * max-flow-stage — 관망 한 폭.
 *
 * ── 무엇을 그리는가
 *
 * 두 정점 사이의 관을 **하나의 띠** 로 그린다. 띠의 두께는 그 쌍이 가진 용량의
 * 합이고, 그 합은 알고리즘이 아무리 흘려도 변하지 않는다 (`cap[u][v] -= f` 와
 * `cap[v][u] += f` 가 서로를 상쇄한다). 띠는 두 갈래로 나뉜다 —
 *
 *   위쪽 갈래  a → b 방향으로 아직 남은 여유 (`cap[a][b]`)
 *   아래쪽 갈래 b → a 방향으로 남은 여유 (`cap[b][a]`)
 *
 * 흘리면 위 갈래가 줄고 아래 갈래가 그만큼 는다. **경계선이 미끄러지는 것이
 * 곧 그 두 줄의 코드다.** 아래 갈래 중 흘려서 생긴 몫 — 되돌릴 폭 — 만 강조색
 * 으로 칠해, 원래부터 있던 반대 방향 용량 (0→1 처럼 없을 수도, 1↔2 처럼 있을
 * 수도 있다) 과 갈라 보인다.
 *
 * 그래서 "관이 차오른다" 는 경계선이 밀리는 것으로, "앞서 흘린 것이 뒤에 밀려
 * 난다" 는 강조색 몫을 타고 되돌아오는 것으로 나타난다.
 *
 * ── 아래쪽 띠
 *
 * 너비 우선 큐를 배열 그대로 깔았다. 머리와 꼬리 색인이 어디를 가리키는지가
 * 보여야 "왜 깊이 우선이 아닌가" 가 그림에서도 말이 된다.
 *
 * ── 뒷일
 *
 * 타이머도 관찰자도 두지 않는다. 이벤트마다 상태를 고치고 `render()` 로 한 번에
 * 반영하는 형태라 예약된 다음 회차가 없다. `destroy()` 는 캔버스 안쪽만 비운다
 * (컨테이너를 비우면 러너가 붙여 준 캔버스가 통째로 떨어져 나간다 — S-view).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 720;
const CANVAS_H = 390;

/** 정점 원 반지름. */
const NODE_R = 19;
/** 용량 한 단위가 차지하는 띠 두께 (px). 최대 용량 합이 20 이면 18px. */
const UNIT = 0.9;
/** 관 끝을 정점 원에서 떼어 놓는 거리. */
const GAP = 5;

/**
 * 관의 두 방향을 가르는 두 색.
 *
 * 한 띠 안에서 "이쪽 방향" 과 "저쪽 방향" 을 식별하는 두 카테고리라
 * `categorical` 시드에서 뽑는다 (S-view 결정 트리 3). 큰 면적이므로 pastel.
 */
const LANE_AB = 0;
const LANE_BA = 1;

type NodeState = 'default' | 'discovered' | 'current' | 'on-path';

type ConduitData = { a: number; b: number; capAB: number; capBA: number };

type ConduitParts = {
  data: ConduitData;
  /** 현재 잔여. resAB + resBA 는 언제나 capAB + capBA 다. */
  resAB: number;
  resBA: number;
  laneAB: SVGRectElement;
  laneBA: SVGRectElement;
  pushed: SVGRectElement;
  outline: SVGRectElement;
  arrowAB: SVGPathElement;
  arrowBA: SVGPathElement;
  labelAB: SVGTextElement;
  labelBA: SVGTextElement;
  /** 화면 기하 — mount 에서 한 번 셈하고 바뀌지 않는다. */
  len: number;
  band: number;
};

type StageData = {
  nodeCount: number;
  source: number;
  sink: number;
  edges: { from: number; to: number; capacity: number }[];
};

function readStageData(raw: unknown): StageData | null {
  const d = raw as
    | {
        nodeCount?: unknown;
        source?: unknown;
        sink?: unknown;
        edges?: unknown;
      }
    | undefined;
  if (typeof d?.nodeCount !== 'number' || d.nodeCount <= 0) return null;
  if (typeof d.source !== 'number' || typeof d.sink !== 'number') return null;
  if (!Array.isArray(d.edges)) return null;
  const edges: { from: number; to: number; capacity: number }[] = [];
  for (const raw2 of d.edges) {
    const e = raw2 as { from?: unknown; to?: unknown; capacity?: unknown };
    if (typeof e?.from !== 'number' || typeof e.to !== 'number') continue;
    if (typeof e.capacity !== 'number') continue;
    edges.push({ from: e.from, to: e.to, capacity: e.capacity });
  }
  return { nodeCount: d.nodeCount, source: d.source, sink: d.sink, edges };
}

/**
 * 정점 자리. 들어오는 곳을 왼쪽 끝, 나가는 곳을 오른쪽 끝에 두고 나머지를
 * 위아래 두 줄로 흩는다. 여섯이 아니면 원 배치로 떨어진다.
 */
function layoutNodes(n: number, source: number, sink: number): { x: number; y: number }[] {
  const left = 70;
  const right = CANVAS_W - 68;
  const midY = 190;
  const topY = 112;
  const botY = 268;
  const pts: { x: number; y: number }[] = new Array(n)
    .fill(null)
    .map(() => ({ x: 0, y: 0 }));

  const middle: number[] = [];
  for (let i = 0; i < n; i += 1) if (i !== source && i !== sink) middle.push(i);

  if (middle.length === 0) {
    pts[source] = { x: left, y: midY };
    pts[sink] = { x: right, y: midY };
    return pts;
  }

  const cols = Math.ceil(middle.length / 2);
  const span = right - left - 240;
  const step = cols > 1 ? span / (cols - 1) : 0;
  const x0 = left + 120;
  middle.forEach((id, i) => {
    const col = i >> 1;
    const rowTop = (i & 1) === 0;
    pts[id] = { x: x0 + step * col, y: rowTop ? topY : botY };
  });
  pts[source] = { x: left, y: midY };
  pts[sink] = { x: right, y: midY };
  return pts;
}

export const maxFlowStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    // 러너가 캔버스를 컨테이너에 먼저 붙여 준다. 무대는 그 캔버스 안에만
    // 그리므로 컨테이너를 직접 만지지 않는다 (비우면 캔버스가 떨어져 나간다).
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const lanePalette = categorical(2, 'pastel');
    const laneColorAB = lanePalette[LANE_AB];
    const laneColorBA = lanePalette[LANE_BA];

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    };

    const text = (
      value: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor = 'middle',
    ): SVGTextElement => {
      const t = el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': size,
        fill,
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
      });
      t.textContent = value;
      return t;
    };

    // ── 머리말 줄: 범례 · 총 유량 · 상태 · 회차 ─────────────────────────
    const headBand = el('g', {});
    svg.appendChild(headBand);

    const chip = (x: number, y: number, w: number, h: number, fill: string): SVGRectElement =>
      el('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: 2,
        fill,
        stroke: colors.border,
        'stroke-width': 0.7,
      });

    headBand.appendChild(chip(12, 10, 10, 6, laneColorAB));
    headBand.appendChild(chip(12, 16, 10, 6, laneColorBA));
    headBand.appendChild(
      text(
        tr('label.roomLeft', 'room left, each way'),
        28,
        16,
        fontSizes.xs,
        colors.textMuted,
        'start',
      ),
    );

    const legend2X = 170;
    headBand.appendChild(chip(legend2X, 11, 10, 10, colors.accent));
    headBand.appendChild(
      text(
        tr('label.pushBack', 'flowing now — can be pushed back'),
        legend2X + 16,
        16,
        fontSizes.xs,
        colors.textMuted,
        'start',
      ),
    );

    headBand.appendChild(
      text(
        tr('label.totalFlow', 'total flow'),
        CANVAS_W - 58,
        16,
        fontSizes.xs,
        colors.textMuted,
        'end',
      ),
    );
    const totalFlowText = text('0', CANVAS_W - 12, 17, fontSizes.xl, colors.text, 'end');
    totalFlowText.setAttribute('font-weight', '600');
    headBand.appendChild(totalFlowText);

    const statusText = text('', 12, 40, fontSizes.sm, colors.text, 'start');
    headBand.appendChild(statusText);
    const roundText = text('', CANVAS_W - 12, 40, fontSizes.xs, colors.textMuted, 'end');
    headBand.appendChild(roundText);

    // ── 관망 ────────────────────────────────────────────────────────────
    const conduitLayer = el('g', {});
    svg.appendChild(conduitLayer);
    const labelLayer = el('g', {});
    svg.appendChild(labelLayer);
    const nodeLayer = el('g', {});
    svg.appendChild(nodeLayer);

    // ── 큐 띠 ───────────────────────────────────────────────────────────
    const queueLayer = el('g', {});
    svg.appendChild(queueLayer);

    // ── 상태 ────────────────────────────────────────────────────────────
    let stage: StageData | null = null;
    let positions: { x: number; y: number }[] = [];
    const conduits = new Map<string, ConduitParts>();
    const nodeCircles: SVGCircleElement[] = [];
    const nodeLabels: SVGTextElement[] = [];
    const nodeStates: NodeState[] = [];
    const queueCells: SVGRectElement[] = [];
    const queueTexts: SVGTextElement[] = [];
    let headMark: SVGTextElement | null = null;
    let tailMark: SVGTextElement | null = null;
    let queueItems: number[] = [];
    let queueHead = 0;
    let queueX0 = 0;
    let queueStep = 1;

    /** 걸음마다 새로 정해지는 강조 — 다음 이벤트에서 지워진다. */
    let probeKey: string | null = null;
    let probeOpen = false;
    let bottleneckKey: string | null = null;
    let pushKey: string | null = null;
    let residualKey: string | null = null;
    const pathEdges = new Set<string>();

    const pairKey = (u: number, v: number): string => (u < v ? `${u}:${v}` : `${v}:${u}`);

    function clearTransient(): void {
      probeKey = null;
      bottleneckKey = null;
      pushKey = null;
      residualKey = null;
    }

    function buildConduits(d: StageData): void {
      const totals = new Map<string, ConduitData>();
      for (const e of d.edges) {
        if (e.capacity <= 0) continue;
        const key = pairKey(e.from, e.to);
        const a = Math.min(e.from, e.to);
        const b = Math.max(e.from, e.to);
        const cur = totals.get(key) ?? { a, b, capAB: 0, capBA: 0 };
        if (e.from === a) cur.capAB += e.capacity;
        else cur.capBA += e.capacity;
        totals.set(key, cur);
      }

      // 선언된 용량이 큰 쪽을 a → b 로 세운다. 그러면 처음에는 모든 관이
      // 같은 색으로 서고, 반대 갈래에 다른 색이 나타나는 것이 곧 "되돌릴 폭이
      // 생겼다" 로 읽힌다. 자리 번호 순서로 세우면 3 → 2 처럼 번호를 거스르는
      // 간선만 색이 뒤집혀, 뜻 없는 차이가 뜻 있어 보인다.
      for (const data of totals.values()) {
        if (data.capBA > data.capAB) {
          const a = data.a;
          const capAB = data.capAB;
          data.a = data.b;
          data.b = a;
          data.capAB = data.capBA;
          data.capBA = capAB;
        }
      }

      for (const [key, data] of totals) {
        const pa = positions[data.a];
        const pb = positions[data.b];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const raw = Math.hypot(dx, dy) || 1;
        const ux = dx / raw;
        const uy = dy / raw;
        const len = Math.max(24, raw - 2 * (NODE_R + GAP));
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const band = (data.capAB + data.capBA) * UNIT;
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;

        const g = el('g', { transform: `translate(${mx} ${my}) rotate(${deg.toFixed(3)})` });
        const laneAB = el('rect', { x: -len / 2, y: 0, width: len, height: 0, fill: laneColorAB });
        const laneBA = el('rect', { x: -len / 2, y: 0, width: len, height: 0, fill: laneColorBA });
        const pushed = el('rect', {
          x: -len / 2,
          y: 0,
          width: len,
          height: 0,
          fill: colors.accent,
        });
        const arrowAB = el('path', { d: '', fill: colors.textMuted, opacity: 0.75 });
        const arrowBA = el('path', { d: '', fill: colors.textMuted, opacity: 0.75 });
        const outline = el('rect', {
          x: -len / 2,
          y: -band / 2,
          width: len,
          height: band,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 0.8,
          rx: 1.5,
        });
        g.appendChild(laneAB);
        g.appendChild(laneBA);
        g.appendChild(pushed);
        g.appendChild(arrowAB);
        g.appendChild(arrowBA);
        g.appendChild(outline);
        conduitLayer.appendChild(g);

        const nx = -uy;
        const ny = ux;
        const off = band / 2 + 10;
        const labelAB = text(
          '',
          mx - nx * off,
          my - ny * off,
          fontSizes.xs,
          colors.textMuted,
        );
        const labelBA = text(
          '',
          mx + nx * off,
          my + ny * off,
          fontSizes.xs,
          colors.textMuted,
        );
        labelLayer.appendChild(labelAB);
        labelLayer.appendChild(labelBA);

        conduits.set(key, {
          data,
          resAB: data.capAB,
          resBA: data.capBA,
          laneAB,
          laneBA,
          pushed,
          outline,
          arrowAB,
          arrowBA,
          labelAB,
          labelBA,
          len,
          band,
        });
      }
    }

    function buildNodes(d: StageData): void {
      for (let i = 0; i < d.nodeCount; i += 1) {
        const p = positions[i];
        const c = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.2,
        });
        nodeLayer.appendChild(c);
        nodeCircles.push(c);
        const label = text(String(i), p.x, p.y + 0.5, fontSizes.sm, colors.text);
        nodeLayer.appendChild(label);
        nodeLabels.push(label);
        nodeStates.push('default');
      }
      const sp = positions[d.source];
      nodeLayer.appendChild(
        text(tr('label.source', 'source'), sp.x, sp.y + NODE_R + 12, fontSizes.xs, colors.textMuted),
      );
      const kp = positions[d.sink];
      nodeLayer.appendChild(
        text(tr('label.sink', 'sink'), kp.x, kp.y + NODE_R + 12, fontSizes.xs, colors.textMuted),
      );
    }

    function buildQueue(d: StageData): void {
      const slots = d.nodeCount;
      const cellW = 30;
      const cellH = 22;
      const gap = 5;
      const totalW = slots * cellW + (slots - 1) * gap;
      const x0 = (CANVAS_W - totalW) / 2;
      const y = 344;

      queueLayer.appendChild(
        text(tr('label.queue', 'BFS queue'), x0 - 14, y + cellH / 2, fontSizes.xs, colors.textMuted, 'end'),
      );

      for (let i = 0; i < slots; i += 1) {
        const x = x0 + i * (cellW + gap);
        const cell = el('rect', {
          x,
          y,
          width: cellW,
          height: cellH,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 0.9,
        });
        queueLayer.appendChild(cell);
        queueCells.push(cell);
        const label = text('', x + cellW / 2, y + cellH / 2, fontSizes.sm, colors.text);
        queueLayer.appendChild(label);
        queueTexts.push(label);
      }

      headMark = text('head', x0, y + cellH + 11, fontSizes.xs, colors.auxCursor);
      tailMark = text('tail', x0, y - 8, fontSizes.xs, colors.auxCursor);
      queueLayer.appendChild(headMark);
      queueLayer.appendChild(tailMark);

      queueX0 = x0 + cellW / 2;
      queueStep = cellW + gap;
    }

    const queueSlotX = (i: number): number => queueX0 + i * queueStep;

    function renderConduit(c: ConduitParts): void {
      const total = c.data.capAB + c.data.capBA;
      const half = c.band / 2;
      const wAB = total > 0 ? (c.resAB / total) * c.band : 0;
      const wBA = c.band - wAB;
      const boundary = -half + wAB;

      c.laneAB.setAttribute('y', String(-half));
      c.laneAB.setAttribute('height', String(Math.max(0, wAB)));
      c.laneBA.setAttribute('y', String(boundary));
      c.laneBA.setAttribute('height', String(Math.max(0, wBA)));

      // 흘려서 생긴 몫. 양수면 a→b 로 흘렸다는 뜻이라 b→a 갈래 안쪽에 쌓인다.
      const pushed = (c.data.capAB - c.resAB) * UNIT;
      c.pushed.setAttribute('y', String(Math.min(boundary, boundary + pushed)));
      c.pushed.setAttribute('height', String(Math.abs(pushed)));

      const arrow = (thickness: number, y: number, dir: 1 | -1): string => {
        if (thickness < 4.5) return '';
        const cy = y + thickness / 2;
        const h = Math.min(3.2, thickness / 2 - 0.6);
        const tip = dir * 5;
        return `M ${-tip} ${cy - h} L ${tip} ${cy} L ${-tip} ${cy + h} Z`;
      };
      c.arrowAB.setAttribute('d', arrow(wAB, -half, 1));
      c.arrowBA.setAttribute('d', arrow(wBA, boundary, -1));

      c.labelAB.textContent = c.resAB > 0 ? String(c.resAB) : '';
      c.labelBA.textContent = c.resBA > 0 ? String(c.resBA) : '';

      const key = pairKey(c.data.a, c.data.b);
      let stroke = colors.border;
      let width = 0.8;
      if (pathEdges.has(key)) {
        stroke = colors.itemSwapping;
        width = 2;
      }
      if (probeKey === key) {
        stroke = probeOpen ? colors.itemComparing : colors.ghostOutline;
        width = 2;
      }
      if (bottleneckKey === key) {
        stroke = colors.danger;
        width = 2.4;
      }
      if (pushKey === key || residualKey === key) {
        stroke = colors.accent;
        width = 2.6;
      }
      c.outline.setAttribute('stroke', stroke);
      c.outline.setAttribute('stroke-width', String(width));
    }

    function renderNodes(): void {
      if (!stage) return;
      for (let i = 0; i < nodeCircles.length; i += 1) {
        const st = nodeStates[i];
        let fill = colors.itemDefault;
        let stroke = colors.border;
        let width = 1.2;
        let ink = colors.text;
        if (st === 'discovered') {
          stroke = colors.itemComparing;
          width = 2;
        } else if (st === 'current') {
          fill = colors.itemActive;
          stroke = colors.itemActive;
          width = 2;
          ink = colors.textInverse;
        } else if (st === 'on-path') {
          fill = colors.itemSwapping;
          stroke = colors.itemSwapping;
          width = 2;
          ink = colors.textInverse;
        }
        if (st === 'default' && (i === stage.source || i === stage.sink)) {
          stroke = colors.primary;
          width = 2;
        }
        nodeCircles[i].setAttribute('fill', fill);
        nodeCircles[i].setAttribute('stroke', stroke);
        nodeCircles[i].setAttribute('stroke-width', String(width));
        nodeLabels[i].setAttribute('fill', ink);
      }
    }

    function renderQueue(): void {
      for (let i = 0; i < queueCells.length; i += 1) {
        const filled = i < queueItems.length;
        const spent = i < queueHead;
        queueCells[i].setAttribute('fill', filled && !spent ? colors.bgSubtle : colors.bg);
        queueCells[i].setAttribute('stroke', filled && !spent ? colors.text : colors.border);
        queueCells[i].setAttribute('stroke-width', filled && !spent ? '1.4' : '0.9');
        queueTexts[i].textContent = filled ? String(queueItems[i]) : '';
        queueTexts[i].setAttribute('fill', spent ? colors.textMuted : colors.text);
      }
      const lastSlot = Math.max(0, queueCells.length - 1);
      headMark?.setAttribute('x', String(queueSlotX(Math.min(queueHead, lastSlot))));
      tailMark?.setAttribute('x', String(queueSlotX(Math.min(queueItems.length, lastSlot))));
    }

    function render(): void {
      for (const c of conduits.values()) renderConduit(c);
      renderNodes();
      renderQueue();
    }

    // ── Projector 가 부르는 표면 ────────────────────────────────────────
    const api = {
      setNetwork(raw: unknown): void {
        const d = readStageData(raw);
        if (!d) return;
        stage = d;
        positions = layoutNodes(d.nodeCount, d.source, d.sink);
        conduitLayer.textContent = '';
        labelLayer.textContent = '';
        nodeLayer.textContent = '';
        queueLayer.textContent = '';
        conduits.clear();
        nodeCircles.length = 0;
        nodeLabels.length = 0;
        nodeStates.length = 0;
        queueCells.length = 0;
        queueTexts.length = 0;
        buildConduits(d);
        buildNodes(d);
        buildQueue(d);
        render();
      },

      setStatus(value: string): void {
        statusText.textContent = value;
      },

      setRound(value: string): void {
        roundText.textContent = value;
      },

      setTotalFlow(value: number): void {
        totalFlowText.textContent = String(value);
      },

      beginSearch(items: number[], head: number): void {
        clearTransient();
        pathEdges.clear();
        for (let i = 0; i < nodeStates.length; i += 1) nodeStates[i] = 'default';
        queueItems = [...items];
        queueHead = head;
        for (const id of items) if (nodeStates[id] !== undefined) nodeStates[id] = 'discovered';
        render();
      },

      popNode(node: number, head: number, items: number[]): void {
        clearTransient();
        for (let i = 0; i < nodeStates.length; i += 1) {
          if (nodeStates[i] === 'current') nodeStates[i] = 'discovered';
        }
        if (nodeStates[node] !== undefined) nodeStates[node] = 'current';
        queueItems = [...items];
        queueHead = head;
        render();
      },

      probeEdge(from: number, to: number, open: boolean): void {
        clearTransient();
        probeKey = pairKey(from, to);
        probeOpen = open;
        render();
      },

      discoverNode(node: number, head: number, items: number[]): void {
        clearTransient();
        if (nodeStates[node] !== undefined) nodeStates[node] = 'discovered';
        queueItems = [...items];
        queueHead = head;
        render();
      },

      showPath(path: number[]): void {
        clearTransient();
        pathEdges.clear();
        for (let i = 0; i + 1 < path.length; i += 1) pathEdges.add(pairKey(path[i], path[i + 1]));
        for (let i = 0; i < nodeStates.length; i += 1) {
          if (nodeStates[i] === 'current') nodeStates[i] = 'discovered';
        }
        for (const id of path) if (nodeStates[id] !== undefined) nodeStates[id] = 'on-path';
        render();
      },

      markBottleneck(from: number, to: number): void {
        clearTransient();
        bottleneckKey = pairKey(from, to);
        render();
      },

      setResidual(from: number, to: number, value: number, kind: 'push' | 'residual'): void {
        clearTransient();
        const key = pairKey(from, to);
        const c = conduits.get(key);
        if (!c) return;
        if (from === c.data.a) c.resAB = value;
        else c.resBA = value;
        if (kind === 'push') pushKey = key;
        else residualKey = key;
        render();
      },

      finish(): void {
        clearTransient();
        pathEdges.clear();
        for (let i = 0; i < nodeStates.length; i += 1) nodeStates[i] = 'default';
        render();
      },

      destroy(): void {
        svg.textContent = '';
      },
    };

    const initial = readStageData(params.initialData);
    if (initial) api.setNetwork(initial);

    return api;
  },
};
