/**
 * graph-db 무대 — 왼쪽은 그래프(출발에서 번지는 앞 줄 둘레 · 홉 한계 고리), 오른쪽 위는 이음 표 자리,
 * 오른쪽 아래는 홉마다 읽은 이음 막대.
 *
 * 이음 열둘은 하나하나가 "딱지" 다. 쥔 이음이면 딱지가 제 나가는 노드 밑에 붙어 있고, 이음 표면 떼어져
 * 표 한 장의 줄로 늘어선다 — 담는 법을 바꾸면 딱지가 그 사이를 옮겨 간다.
 * 홉 수를 바꾸면 홉 한계 고리가 한 겹 바깥 · 안쪽으로 옮겨 가고, 걸음마다 닿은 둘레가 한 겹씩 번진다.
 *
 * 무대는 셈하지 않는다 — 읽은 이음 · 건넌 이음 · 닿은 사람 · 앞 줄은 payload 로 받는다.
 * 노드의 ring(출발에서 몇 홉)도 알고리즘이 셈해 넘긴다. 무대는 그것으로 자리만 잡는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type RoundView = {
  nodes: { id: string; kind: string; ring: number }[];
  edges: { from: string; type: string; to: string }[];
  start: string;
  follow: string;
  hops: number;
  layout: number;
  ringSlots: number;
  hopsMax: number;
  layoutName: string;
};
export type LookView = {
  hop: number;
  layout: number;
  front: string[];
  looked: number[];
  used: number[];
  readThisHop: number;
  readTotal: number;
};
export type CrossView = {
  hop: number;
  crossed: number[];
  reached: string[];
  front: string[];
  reachedCount: number;
};
export type DoneView = {
  hops: number;
  friends: string[];
  readTotal: number;
  reachedCount: number;
};

/** projector 가 부르는 무대의 구조적 표면. */
export type GraphDbStage = {
  showRound(p: RoundView, ms: number): Promise<void>;
  showLook(p: LookView, ms: number): Promise<void>;
  showCross(p: CrossView, ms: number): Promise<void>;
  showDone(p: DoneView): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 800;
const BASE_H = 352;
const BAR_ROW = 26;
const CLIP_ID = 'graph-db-graph-clip';

// 자리 — 그래프 쪽
const GX = 50;
const GY = 190;
const GRAPH_RIGHT = 470;
const GRAPH_TOP = 58;
const NODE_R = 17;
const CHIP_W = 60;
const CHIP_H = 16;
const CHIP_GAP = 18;
const COMPANY_Y_FROM_BOTTOM = 36;
// 자리 — 표 쪽
const TX = 490;
const TW = 296;
const ROW_Y = 84;
const ROW_H = 19;

const HELD = 0;
/** 딱지가 떠나는 때의 어긋남 — 전체 운동 가운데 이만큼에 걸쳐 차례로 떠난다. */
const STAGGER = 0.35;

type NodeState = 'idle' | 'start' | 'reached';
type ChipState = 'idle' | 'read' | 'used' | 'crossed';

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** 캔버스 선언이 막대 줄을 몇 개 품는가 — initialData 없이 마운트될 때의 자리 크기다 (값이 아니다). */
const CANVAS_BAR_ROWS = 3;

/**
 * 막대 줄 수 = 홉 사다리의 가장 큰 값. initialData 가 아예 없으면(러너 밖 마운트) 캔버스 선언의 자리 크기를
 * 쓰고, 첫 round-start 의 hopsMax 가 그 자리를 넘으면 그때 던진다. initialData 가 있는데 사다리가 없거나
 * 비었거나 수가 아닌 원소가 있으면 던진다 (C6).
 */
function barRows(initialData: Record<string, unknown> | undefined): number {
  if (initialData === undefined) return CANVAS_BAR_ROWS;
  const ladder = initialData['hopsLadder'];
  if (!Array.isArray(ladder) || ladder.length === 0) throw new Error('graph-db-stage: initialData.hopsLadder 가 없거나 비었다');
  let most = 0;
  for (const v of ladder) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error(`graph-db-stage: 홉 사다리에 쓸 수 없는 값 ${String(v)}`);
    if (v > most) most = v;
  }
  return most;
}

export const graphDbStageView: CanvasView = {
  canvas: { width: W, height: BASE_H + CANVAS_BAR_ROWS * BAR_ROW },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const rows = barRows(params.initialData);
    const H = BASE_H + rows * BAR_ROW;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const companyY = H - COMPANY_Y_FROM_BOTTOM;
    const barTop = BASE_H - 18;
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    const raf: (cb: () => void) => void =
      typeof requestAnimationFrame === 'function'
        ? (cb) => void requestAnimationFrame(cb)
        : (cb) => void setTimeout(cb, 16);
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    /** ms 동안 k 를 0 → 1 로 흘린다. 끝나거나 무대가 걷히면 풀린다. */
    const tween = (ms: number, frame: (k: number) => void): Promise<void> => {
      if (ms <= 0 || destroyed) {
        frame(1);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const t0 = now();
        const tick = (): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const k = Math.min(1, (now() - t0) / ms);
          frame(k);
          if (k < 1) raf(tick);
          else resolve();
        };
        raf(tick);
      });
    };

    // ── 바탕 층 ────────────────────────────────────────────────
    const defs = el('defs', {});
    const clip = el('clipPath', { id: CLIP_ID });
    clip.appendChild(el('rect', { x: 0, y: GRAPH_TOP, width: GRAPH_RIGHT, height: companyY + 20 - GRAPH_TOP }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    const caption = el('text', { x: 16, y: 24, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md });
    const detail = el('text', { x: 16, y: 44, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm });
    svg.append(caption, detail);

    const ringLayer = el('g', { 'clip-path': `url(#${CLIP_ID})` });
    const perimeter = el('circle', { cx: GX, cy: GY, r: 0, fill: c.accent, 'fill-opacity': 0.16, stroke: c.accent, 'stroke-width': 2 });
    const limit = el('circle', { cx: GX, cy: GY, r: 0, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' });
    ringLayer.append(perimeter, limit);
    const limitLabel = el('text', { x: 0, y: GRAPH_TOP + 12, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
    limitLabel.textContent = t('label.limit', 'Hop limit');
    limitLabel.setAttribute('opacity', '0');
    svg.append(ringLayer, limitLabel);

    const tableFrame = el('rect', { x: TX - 6, y: ROW_Y - 8, width: TW + 12, height: 0, rx: 4, fill: c.bgSubtle, stroke: c.border, 'stroke-dasharray': '4 3' });
    const tableTitle = el('text', { x: TX - 6, y: ROW_Y - 14, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm });
    tableTitle.textContent = t('label.table', 'Edge table');
    const band = el('rect', { x: TX - 4, y: ROW_Y, width: TW + 8, height: ROW_H, rx: 3, fill: c.accent, 'fill-opacity': 0, stroke: 'none' });
    svg.append(tableFrame, tableTitle, band);

    const lineLayer = el('g', {});
    const nodeLayer = el('g', {});
    const chipLayer = el('g', {});
    const markerLayer = el('g', {});
    svg.append(lineLayer, nodeLayer, chipLayer, markerLayer);

    // 홉마다 읽은 이음 막대
    const barTitle = el('text', { x: TX - 6, y: barTop, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm });
    barTitle.textContent = t('label.perHop', 'Edges read per hop');
    const legend = el('g', { opacity: 0 });
    const legendBox = el('rect', { x: TX + TW - 110, y: barTop - 9, width: 14, height: 10, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 2' });
    const legendText = el('text', { x: TX + TW - 90, y: barTop, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
    legendText.textContent = t('label.previous', 'Previous run');
    legend.append(legendBox, legendText);
    svg.append(barTitle, legend);
    const barX = TX + 58;
    const barMax = TW - 100;
    type Bar = { ghost: SVGRectElement; fill: SVGRectElement; value: SVGTextElement; now: number; before: number };
    const bars: Bar[] = [];
    for (let i = 0; i < rows; i += 1) {
      const y = barTop + 10 + i * BAR_ROW;
      const label = el('text', { x: TX - 6, y: y + 13, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
      label.textContent = t('label.hop', 'Hop {hop}', { hop: i + 1 });
      const ghost = el('rect', { x: barX, y: y + 1, width: 0, height: 16, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 2' });
      const fill = el('rect', { x: barX, y: y + 3, width: 0, height: 12, rx: 2, fill: c.itemComparing });
      const value = el('text', { x: barX + 6, y: y + 13, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
      svg.append(label, ghost, fill, value);
      bars.push({ ghost, fill, value, now: 0, before: 0 });
    }

    // ── 그래프 (첫 round-start 에서 짓는다) ─────────────────────
    type NodeDraw = { id: string; person: boolean; at: Pt; shape: SVGElement; label: SVGTextElement; state: NodeState; front: boolean };
    type EdgeDraw = {
      from: string;
      to: string;
      type: string;
      path: SVGPathElement;
      arrow: SVGPathElement;
      curve: [Pt, Pt, Pt];
      follow: boolean;
      g: SVGGElement;
      rect: SVGRectElement;
      fromText: SVGTextElement;
      typeText: SVGTextElement;
      toText: SVGTextElement;
      held: Pt;
      row: Pt;
      tint: string;
      ink: string;
      state: ChipState;
    };
    let nodes: NodeDraw[] = [];
    let edges: EdgeDraw[] = [];
    let built = '';
    let step = 0;
    let layoutK = 0; // 0 쥔 이음 · 1 이음 표 — 딱지가 지금 어디 있는가
    let limitR = 0;
    let perimR = 0;

    const nodeOf = (id: string): NodeDraw => {
      const n = nodes.find((x) => x.id === id);
      if (n === undefined) throw new Error(`graph-db-stage: 모르는 노드 ${id}`);
      return n;
    };
    const edgeOf = (i: number): EdgeDraw => {
      const e = edges[i];
      if (e === undefined) throw new Error(`graph-db-stage: 없는 이음 ${i}`);
      return e;
    };

    const paintNode = (n: NodeDraw): void => {
      if (!n.person) return;
      const fill = n.state === 'idle' ? c.itemDefault : n.state === 'start' ? c.primary : c.itemSorted;
      n.shape.setAttribute('fill', fill);
      n.shape.setAttribute('stroke', n.front ? c.itemActive : n.state === 'idle' ? c.textMuted : fill);
      n.shape.setAttribute('stroke-width', n.front ? '4' : '1.5');
      n.label.setAttribute('fill', n.state === 'idle' ? c.text : c.textInverse);
    };
    const paintChip = (e: EdgeDraw): void => {
      const s = e.state;
      e.rect.setAttribute('fill', s === 'crossed' ? c.accent : e.tint);
      e.rect.setAttribute('stroke', s === 'idle' ? e.ink : s === 'read' ? c.textMuted : c.itemActive);
      e.rect.setAttribute('stroke-width', s === 'idle' ? '1' : s === 'read' ? '1.5' : '2.5');
      e.rect.setAttribute('stroke-dasharray', s === 'read' ? '3 2' : 'none');
    };
    /** k = 0 이면 노드 밑 딱지, 1 이면 표의 줄. 딱지마다 조금씩 늦게 떠나 줄이 흐르듯 옮겨 간다. */
    const placeChips = (k: number): void => {
      const n = edges.length;
      edges.forEach((e, i) => {
        const lag = n > 1 ? (i / (n - 1)) * STAGGER : 0;
        const q = ease(Math.max(0, Math.min(1, (k - lag) / (1 - STAGGER))));
        const x = lerp(e.held.x, e.row.x, q);
        const y = lerp(e.held.y, e.row.y, q);
        const w = lerp(CHIP_W, TW, q);
        e.rect.setAttribute('x', String(x));
        e.rect.setAttribute('y', String(y));
        e.rect.setAttribute('width', String(w));
        e.fromText.setAttribute('x', String(x + 8));
        e.fromText.setAttribute('y', String(y + 12));
        e.typeText.setAttribute('x', String(x + 64));
        e.typeText.setAttribute('y', String(y + 12));
        e.toText.setAttribute('x', String(x + lerp(6, 170, q)));
        e.toText.setAttribute('y', String(y + 12));
        e.fromText.setAttribute('opacity', String(q));
        e.typeText.setAttribute('opacity', String(q));
      });
      tableFrame.setAttribute('height', String(edges.length * ROW_H + 12));
      tableFrame.setAttribute('stroke-dasharray', k > 0.5 ? 'none' : '4 3');
      tableTitle.setAttribute('opacity', String(lerp(0.4, 1, k)));
    };

    const placeLimit = (r: number): void => {
      limitLabel.setAttribute('opacity', '1');
      limit.setAttribute('r', String(r));
      const dy = GY - GRAPH_TOP - 8;
      const x = r > dy ? GX + Math.sqrt(r * r - dy * dy) : GX + r;
      limitLabel.setAttribute('x', String(Math.min(x + 4, GRAPH_RIGHT - 60)));
    };

    const pointOn = (q: [Pt, Pt, Pt], s: number): Pt => ({
      x: (1 - s) * (1 - s) * q[0].x + 2 * (1 - s) * s * q[1].x + s * s * q[2].x,
      y: (1 - s) * (1 - s) * q[0].y + 2 * (1 - s) * s * q[1].y + s * s * q[2].y,
    });

    const build = (p: RoundView): void => {
      lineLayer.replaceChildren();
      nodeLayer.replaceChildren();
      chipLayer.replaceChildren();
      step = (GRAPH_RIGHT - 40 - GX) / Math.max(p.ringSlots, 1);
      const ringsOf = new Map<number, string[]>();
      for (const n of p.nodes) {
        if (n.ring < 0) continue; // 닿지 않는 노드는 아래 줄에 선다
        const list = ringsOf.get(n.ring) ?? [];
        list.push(n.id);
        ringsOf.set(n.ring, list);
      }
      const at = new Map<string, Pt>();
      for (const [ring, ids] of ringsOf) {
        const r = ring * step;
        const m = ids.length;
        const half = m > 1 && r > 0 ? Math.asin(Math.min(0.85, ((m - 1) * 55) / r)) : 0;
        ids.forEach((id, j) => {
          const a = m > 1 ? -half + (2 * half * j) / (m - 1) : 0;
          at.set(id, { x: GX + r * Math.cos(a), y: GY + r * Math.sin(a) });
        });
      }
      // 아래 줄 — 들어오는 이음의 나가는 노드 가로 평균 차례로 늘어세운다 (선이 덜 꼬이게)
      const outside = p.nodes.filter((n) => n.ring < 0).map((n) => n.id);
      const meanX = (id: string): number => {
        const xs: number[] = [];
        for (const e of p.edges) {
          const from = at.get(e.from);
          if (e.to === id && from !== undefined) xs.push(from.x);
        }
        return xs.length === 0 ? GX : xs.reduce((a, b) => a + b, 0) / xs.length;
      };
      const ordered = [...outside].sort((a, b) => meanX(a) - meanX(b));
      ordered.forEach((id, j) => {
        const x = ordered.length === 1 ? (GX + GRAPH_RIGHT) / 2 : lerp(GX + 60, GRAPH_RIGHT - 60, j / (ordered.length - 1));
        at.set(id, { x, y: companyY });
      });

      const startNode = p.nodes.find((n) => n.id === p.start);
      if (startNode === undefined) throw new Error(`graph-db-stage: 출발 노드 ${p.start} 가 없다`);
      const startKind = startNode.kind;
      nodes = p.nodes.map((n) => {
        const pos = at.get(n.id);
        if (pos === undefined) throw new Error(`graph-db-stage: 자리 없는 노드 ${n.id}`);
        // 모양은 종류로 가른다 — 출발 노드와 같은 종류(사람)는 동그라미, 다른 종류(회사)는 네모
        const person = n.kind === startKind;
        const shape = person
          ? el('circle', { cx: pos.x, cy: pos.y, r: NODE_R })
          : el('rect', { x: pos.x - 24, y: pos.y - 11, width: 48, height: 22, rx: 4, fill: c.bgSubtle, stroke: c.border });
        const label = el('text', {
          x: pos.x,
          y: pos.y + xsPx * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: person ? c.text : c.textMuted,
        });
        label.textContent = n.id;
        nodeLayer.append(shape, label);
        return { id: n.id, person, at: pos, shape, label, state: 'idle' as NodeState, front: false };
      });

      const types = [...new Set(p.edges.map((e) => e.type))];
      const tints = categorical(types.length, 'pastel');
      const inks = categorical(types.length, 'deep');
      const heldCount = new Map<string, number>();
      edges = p.edges.map((e, i) => {
        const a = nodeOf(e.from).at;
        const b = nodeOf(e.to).at;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        // 되돌아가는 이음(먼 고리 → 가까운 고리)은 반대쪽으로 크게 휘어 앞으로 가는 이음과 겹치지 않게
        const ringOf = (id: string): number => {
          const found = p.nodes.find((x) => x.id === id);
          if (found === undefined) throw new Error(`graph-db-stage: 모르는 노드 ${id}`);
          return found.ring;
        };
        const backward = ringOf(e.to) >= 0 && ringOf(e.to) < ringOf(e.from);
        const bend = backward ? -0.3 * len : 0.14 * len;
        const mid = { x: (a.x + b.x) / 2 + (dy / len) * bend, y: (a.y + b.y) / 2 - (dx / len) * bend };
        const curve: [Pt, Pt, Pt] = [a, mid, b];
        const follow = e.type === p.follow;
        const path = el('path', {
          d: `M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`,
          fill: 'none',
          stroke: follow ? c.textMuted : c.border,
          'stroke-width': follow ? 1.5 : 1,
          'stroke-dasharray': follow ? 'none' : '4 3',
        });
        // 화살촉 — 끝 노드 테두리 바로 앞
        const endGap = nodeOf(e.to).person ? NODE_R + 2 : 13;
        const s1 = Math.max(0, 1 - endGap / len);
        const tip = pointOn(curve, s1);
        const back = pointOn(curve, Math.max(0, s1 - 10 / len));
        const ux = tip.x - back.x;
        const uy = tip.y - back.y;
        const ul = Math.hypot(ux, uy) || 1;
        const nx = ux / ul;
        const ny = uy / ul;
        const arrow = el('path', {
          d: `M ${tip.x} ${tip.y} L ${tip.x - nx * 8 - ny * 4} ${tip.y - ny * 8 + nx * 4} L ${tip.x - nx * 8 + ny * 4} ${tip.y - ny * 8 - nx * 4} Z`,
          fill: follow ? c.textMuted : c.border,
        });
        lineLayer.append(path, arrow);

        const j = heldCount.get(e.from) ?? 0;
        heldCount.set(e.from, j + 1);
        const held = { x: a.x - CHIP_W / 2, y: a.y + NODE_R + 5 + j * CHIP_GAP };
        const row = { x: TX, y: ROW_Y + i * ROW_H };
        const ti = types.indexOf(e.type);
        const g = el('g', {});
        const rect = el('rect', { x: held.x, y: held.y, width: CHIP_W, height: CHIP_H, rx: 3 });
        const mk = (text: string, color: string): SVGTextElement => {
          const node = el('text', { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: color });
          node.textContent = text;
          return node;
        };
        const fromText = mk(e.from, c.text);
        const typeText = mk(e.type, c.textMuted);
        const toText = mk(`→ ${e.to}`, c.text);
        g.append(rect, fromText, typeText, toText);
        chipLayer.appendChild(g);
        return {
          from: e.from,
          to: e.to,
          type: e.type,
          path,
          arrow,
          curve,
          follow,
          g,
          rect,
          fromText,
          typeText,
          toText,
          held,
          row,
          tint: tints[ti]!,
          ink: inks[ti]!,
          state: 'idle' as ChipState,
        };
      });
      built = JSON.stringify([p.nodes, p.edges, p.ringSlots]);
    };

    const resetMarks = (start: string): void => {
      for (const n of nodes) {
        n.state = n.id === start ? 'start' : 'idle';
        n.front = n.id === start;
        paintNode(n);
      }
      for (const e of edges) {
        e.state = 'idle';
        paintChip(e);
        e.path.setAttribute('stroke', e.follow ? c.textMuted : c.border);
        e.path.setAttribute('stroke-width', e.follow ? '1.5' : '1');
        e.arrow.setAttribute('fill', e.follow ? c.textMuted : c.border);
      }
      band.setAttribute('fill-opacity', '0');
      markerLayer.replaceChildren();
    };

    const setBars = (k: number): void => {
      const total = Math.max(edges.length, 1);
      bars.forEach((b) => {
        b.fill.setAttribute('width', String((b.now * barMax * k) / total));
      });
    };

    const listText = (xs: string[]): string => (xs.length === 0 ? t('label.none', 'none') : xs.join(' · '));

    const stage: ViewInstance & GraphDbStage = {
      async showRound(p, ms) {
        if (p.hopsMax > rows) throw new Error(`graph-db-stage: 막대 자리 ${rows} 줄 < 홉 사다리 끝 ${p.hopsMax}`);
        const first = built === '';
        if (built !== JSON.stringify([p.nodes, p.edges, p.ringSlots])) build(p);
        resetMarks(p.start);
        caption.textContent = t('caption.start', 'Start: {start} · Follow: {follow} · Hops: {hops}', {
          start: p.start,
          follow: p.follow,
          hops: p.hops,
        });
        detail.textContent = t('detail.start', 'Stored as: {layout}', { layout: p.layoutName });

        // 앞 판 막대는 점선 그림자로 남고 새 판 막대는 0 에서 다시 자란다
        let hadRun = false;
        bars.forEach((b) => {
          b.before = b.now;
          if (b.now > 0) hadRun = true;
          const total = Math.max(edges.length, 1);
          b.ghost.setAttribute('width', String((b.before * barMax) / total));
          b.ghost.setAttribute('opacity', b.before > 0 ? '1' : '0');
          b.now = 0;
          b.value.textContent = '';
        });
        legend.setAttribute('opacity', hadRun ? '1' : '0');
        const oldBars = bars.map((b) => parseFloat(b.fill.getAttribute('width') ?? '0'));

        const fromK = layoutK;
        const toK = p.layout === HELD ? 0 : 1;
        const fromLimit = limitR;
        const toLimit = (p.hops + 0.5) * step;
        const fromPerim = perimR;
        const toPerim = 0.5 * step;
        const move = first ? 0 : ms;
        await tween(move, (k) => {
          const q = ease(k);
          layoutK = lerp(fromK, toK, k);
          placeChips(layoutK);
          limitR = lerp(fromLimit, toLimit, q);
          placeLimit(limitR);
          perimR = lerp(fromPerim, toPerim, q);
          perimeter.setAttribute('r', String(perimR));
          bars.forEach((b, i) => b.fill.setAttribute('width', String(lerp(oldBars[i]!, 0, q))));
        });
        layoutK = toK;
      },

      async showLook(p, ms) {
        for (const n of nodes) {
          n.front = p.front.includes(n.id);
          paintNode(n);
        }
        for (const e of edges) {
          if (e.state !== 'crossed') e.state = 'idle';
          paintChip(e);
        }
        caption.textContent =
          p.layout === HELD
            ? t('caption.lookHeld', 'Hop {hop} · the front row reads only the edges it holds', { hop: p.hop })
            : t('caption.lookTable', 'Hop {hop} · every row of the edge table is read', { hop: p.hop });
        detail.textContent = t('detail.look', 'Front row: {front} · Read this hop: {n} · Read so far: {total}', {
          front: listText(p.front),
          n: p.readThisHop,
          total: p.readTotal,
        });
        const bar = bars[p.hop - 1];
        if (bar === undefined) throw new Error(`graph-db-stage: 막대 자리 밖의 홉 ${p.hop}`);
        const barFrom = bar.now;
        bar.now = p.readThisHop;
        bar.value.setAttribute('x', String(barX + (p.readThisHop * barMax) / Math.max(edges.length, 1) + 6));
        bar.value.textContent = String(p.readThisHop);
        const total = Math.max(edges.length, 1);
        const count = p.looked.length;
        let lit = 0;
        if (p.layout !== HELD) band.setAttribute('fill-opacity', '0.4');
        await tween(ms, (k) => {
          // 읽은 차례대로 딱지 · 줄을 켠다. 표면 띠가 위에서 아래로 훑는다
          const upto = Math.min(count, Math.floor(k * count + (k >= 1 ? 0 : 1)));
          for (; lit < upto; lit += 1) {
            const e = edgeOf(p.looked[lit]!);
            if (e.state !== 'crossed') e.state = p.used.includes(p.looked[lit]!) ? 'used' : 'read';
            paintChip(e);
          }
          if (p.layout !== HELD && count > 0) {
            const pos = Math.min(count - 1, Math.floor(k * count));
            const row = edgeOf(p.looked[pos]!).row;
            band.setAttribute('y', String(row.y - 1.5));
          }
          bar.fill.setAttribute('width', String((lerp(barFrom, p.readThisHop, ease(k)) * barMax) / total));
        });
        band.setAttribute('fill-opacity', '0');
      },

      async showCross(p, ms) {
        caption.textContent =
          p.crossed.length === 0
            ? t('caption.crossNone', 'Hop {hop} · no new person to cross to', { hop: p.hop })
            : t('caption.cross', 'Hop {hop} · crossed: {crossed}', {
                hop: p.hop,
                crossed: p.crossed.map((i) => `${edgeOf(i).from}→${edgeOf(i).to}`).join(' · '),
              });
        detail.textContent = t('detail.cross', 'People reached: {n} · Next front row: {front}', {
          n: p.reachedCount,
          front: listText(p.front),
        });
        for (const e of edges) {
          if (e.state === 'read' || e.state === 'used') e.state = 'idle';
          paintChip(e);
        }
        const dots = p.crossed.map((i) => {
          const e = edgeOf(i);
          e.state = 'crossed';
          paintChip(e);
          e.path.setAttribute('stroke', c.itemActive);
          e.path.setAttribute('stroke-width', '3');
          e.arrow.setAttribute('fill', c.itemActive);
          const dot = el('circle', { cx: e.curve[0].x, cy: e.curve[0].y, r: 6, fill: c.itemActive, stroke: c.bg, 'stroke-width': 1.5 });
          markerLayer.appendChild(dot);
          return { dot, e };
        });
        const fromPerim = perimR;
        const toPerim = (p.hop + 0.5) * step;
        await tween(ms, (k) => {
          const q = ease(k);
          for (const { dot, e } of dots) {
            const pt = pointOn(e.curve, q);
            dot.setAttribute('cx', String(pt.x));
            dot.setAttribute('cy', String(pt.y));
          }
          perimR = lerp(fromPerim, toPerim, q);
          perimeter.setAttribute('r', String(perimR));
        });
        markerLayer.replaceChildren();
        for (const n of nodes) {
          if (p.reached.includes(n.id)) n.state = 'reached';
          n.front = p.front.includes(n.id);
          paintNode(n);
        }
      },

      showDone(p) {
        caption.textContent = t('caption.done', 'Friends within {hops} hops: {friends}', {
          hops: p.hops,
          friends: listText(p.friends),
        });
        detail.textContent = t('detail.done', 'Edges read: {read} · People reached: {n}', {
          read: p.readTotal,
          n: p.reachedCount,
        });
        for (const n of nodes) {
          n.front = false;
          paintNode(n);
        }
        setBars(1);
      },

      destroy() {
        destroyed = true;
        svg.replaceChildren();
      },
    };
    return stage;
  },
};
