/**
 * network-layer-stage — 캡슐화와 홉 전달의 무대.
 *
 * 위에서 아래로 넷:
 *   1. 선 위 띠 — 한 링크를 지나는 바이트 전부. 조각마다 머리(링크 · 네트워크 · 전송)가 앞에,
 *      링크 꼬리가 뒤에 붙는다. 쪼갠 수가 바뀌면 앞 판의 띠가 새 조각들로 **갈라지며** 머리 칸이 끼어든다
 *   2. 마디 줄 — A · R1 … · B 와 그 사이 링크. 조각 칩이 마디에서 마디로 미끄러진다. 링크 수가
 *      바뀌면 라우터가 B 쪽에서 밀려 나오거나 B 쪽으로 접혀 들어간다. 마디 아래는 층 표지 (호스트 다섯 · 라우터 셋)
 *   3. 링크 줄 시간 축 — 링크마다 한 줄, 가로가 바이트 시간. 조각이 링크에 실리는 동안이 칸으로
 *      자라 계단처럼 겹친다. 앞 판의 계단은 점선 윤곽으로 남고, 끝 시각 표지가 앞 판 자리에서 새 자리로 옮겨 간다
 *   4. 끝 시각 막대 여섯 — 지금 링크 수에서 쪼갠 수마다의 끝 시각. 링크 수가 바뀌면 막대가 새 높이로
 *      옮겨 가고 "가장 빠름" 표지가 다른 막대로 넘어간다. 끝 걸음에 지금 판의 점이 지금 막대 끝으로 옮겨 간다
 *
 * 수는 모두 algorithm 이 셈해 싣는다. stage 는 자리만 셈한다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 640;

const MAX_PIECES = 12;
const MAX_NODES = 6;
const MAX_LINKS = MAX_NODES - 1;
const SEGS = 7; // 머리 셋(바깥 층부터) · 데이터 · 꼬리 셋(바깥 층부터)
const BARS = 6;

// 띠
const BAND_X = 60;
const BAND_W = 640;
const BAND_Y = 50;
const BAND_H = 24;
// 마디 줄
const NODE_L = 90;
const NODE_R = 640;
const NODE_Y = 190;
const NODE_R_PX = 13;
const CHIP_W = 24;
const CHIP_H = 12;
const CHIP_PITCH_X = 26;
const CHIP_PITCH_Y = 14;
const CHIP_COLS = 3;
const STACK_Y = 224;
const STACK_ROW = 13;
const STACK_W = 76;
// 시간 축
const GANTT_X = 70;
const GANTT_W = 630;
const GANTT_Y = 310;
const GANTT_ROW = 22;
const GANTT_BAR = 17;
const AXIS_Y = GANTT_Y + GANTT_ROW * MAX_LINKS + 4;
// 막대
const BARS_TITLE_Y = 462;
const BARS_BASE = 596;
const BARS_MAX_H = 108;
const BARS_X = 70;
const BARS_PITCH = 105;
const BAR_W = 56;

export type NetworkLayerSpan = { layer: string; bytes: number };
export type NetworkLayerStageRound = {
  split: number;
  links: number;
  message: number;
  pieceSize: number;
  headerBytes: number;
  wireBytes: number;
  payloadShare: number;
  heads: NetworkLayerSpan[];
  tails: NetworkLayerSpan[];
  nodes: string[];
  bars: { split: number; finish: number }[];
  fastestSplit: number;
  wireMax: number;
  timeMax: number;
  /** 호스트의 다섯 층 (위에서 아래) · 라우터의 층 (네트워크 · 링크 · 물리) — 식별자 */
  stack: string[];
  routerStack: string[];
};
export type NetworkLayerStageMove = { piece: number; from: number; to: number };
export type NetworkLayerStageForward = {
  tick: number;
  elapsed: number;
  pieceSize: number;
  busyLinks: number;
  moves: NetworkLayerStageMove[];
};
export type NetworkLayerStageFinish = { ticks: number; finish: number; split: number; fastestSplit: number };

/** projector 가 부르는 표면 */
export type NetworkLayerStage = {
  showRound(r: NetworkLayerStageRound, ms: number): Promise<void>;
  showForward(f: NetworkLayerStageForward, ms: number): Promise<void>;
  showFinish(f: NetworkLayerStageFinish, ms: number): Promise<void>;
  clear(): void;
  destroy(): void;
};

type Geo = {
  segX: number[];
  segW: number[];
  nodeX: number[];
  nodeOp: number[];
  chipX: number[];
  chipY: number[];
  chipOp: number[];
  blockW: number[];
  barH: number[];
  fastX: number;
  markX: number;
  markY: number;
  markOp: number;
  cursorX: number;
  finishX: number;
  finishOp: number;
};

type Block = { piece: number; link: number; x: number; w: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  if (parent) parent.appendChild(e);
  return e;
}

function lerpGeo(a: Geo, b: Geo, k: number): Geo {
  const out: Record<string, number | number[]> = {};
  for (const key of Object.keys(b) as (keyof Geo)[]) {
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(bv)) {
      const aa = av as number[];
      out[key] = bv.map((x, i) => {
        const from = aa[i];
        return from === undefined ? x : from + (x - from) * k;
      });
    } else {
      const from = av as number;
      out[key] = from + (bv - from) * k;
    }
  }
  return out as Geo;
}

function cloneGeo(g: Geo): Geo {
  return lerpGeo(g, g, 0);
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`network-layer-stage: ${what} 이 없다`);
  return v;
}

export const networkLayerStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const vivid = categorical(5, 'vivid');
    const pastel = categorical(5, 'pastel');

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    });

    const root = el('g', { 'font-family': fonts.body }, svg);
    const fsXs = parseFloat(fontSizes.xs);

    // ── 캡션
    const caption = el('text', { x: 16, y: 20, 'font-size': fontSizes.md, fill: pal.text, 'font-weight': 600 }, root);

    // ── 1. 선 위 띠
    const bandTitle = el('text', { x: BAND_X, y: 42, 'font-size': fontSizes.sm, fill: pal.text }, root);
    const bandShare = el('text', { x: BAND_X + BAND_W, y: 42, 'font-size': fontSizes.sm, fill: pal.textMuted, 'text-anchor': 'end' }, root);
    el('rect', { x: BAND_X, y: BAND_Y, width: BAND_W, height: BAND_H, fill: pal.bgSubtle, stroke: pal.border, 'stroke-dasharray': '3 3' }, root);
    const bandG = el('g', {}, root);
    const segRects: SVGRectElement[] = [];
    const pieceLabels: SVGTextElement[] = [];
    for (let i = 0; i < MAX_PIECES; i += 1) {
      for (let s = 0; s < SEGS; s += 1) {
        segRects.push(el('rect', { y: BAND_Y, height: BAND_H, stroke: pal.bg, 'stroke-width': 1 }, bandG));
      }
      pieceLabels.push(
        el('text', { y: BAND_Y + BAND_H / 2 + fsXs / 2 - 1, 'font-size': fontSizes.xs, fill: pal.text, 'text-anchor': 'middle' }, bandG),
      );
    }
    // 띠 범례
    const legendG = el('g', {}, root);

    // ── 2. 마디 줄
    const linkLines: SVGLineElement[] = [];
    for (let i = 0; i < MAX_LINKS; i += 1) {
      linkLines.push(el('line', { y1: NODE_Y, y2: NODE_Y, stroke: pal.border, 'stroke-width': 2 }, root));
    }
    type NodeEls = { g: SVGGElement; sym: SVGTextElement; role: SVGTextElement; stack: SVGGElement };
    const nodeEls: NodeEls[] = [];
    for (let i = 0; i < MAX_NODES; i += 1) {
      const g = el('g', {}, root);
      el('circle', { cx: 0, cy: NODE_Y, r: NODE_R_PX, fill: pal.bg, stroke: pal.text, 'stroke-width': 1.5 }, g);
      const sym = el('text', { x: 0, y: NODE_Y + 4, 'font-size': fontSizes.sm, 'font-weight': 600, fill: pal.text, 'text-anchor': 'middle' }, g);
      const role = el('text', { x: 0, y: NODE_Y + 28, 'font-size': fontSizes.xs, fill: pal.textMuted, 'text-anchor': 'middle' }, g);
      const stack = el('g', {}, g);
      nodeEls.push({ g, sym, role, stack });
    }
    const chipsG = el('g', {}, root);
    type ChipEls = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement };
    const chips: ChipEls[] = [];
    for (let i = 0; i < MAX_PIECES; i += 1) {
      const g = el('g', {}, chipsG);
      const box = el('rect', { x: -CHIP_W / 2, y: -CHIP_H / 2, width: CHIP_W, height: CHIP_H, rx: 2, 'stroke-width': 1 }, g);
      const label = el('text', { x: 0, y: fsXs / 2 - 2, 'font-size': fontSizes.xs, 'text-anchor': 'middle' }, g);
      label.textContent = `p${i + 1}`;
      chips.push({ g, box, label });
    }

    // ── 3. 링크 줄 시간 축
    const rowLabels: SVGTextElement[] = [];
    const rowBgs: SVGRectElement[] = [];
    for (let i = 0; i < MAX_LINKS; i += 1) {
      const y = GANTT_Y + i * GANTT_ROW;
      rowBgs.push(el('rect', { x: GANTT_X, y, width: GANTT_W, height: GANTT_BAR, fill: pal.bgSubtle }, root));
      rowLabels.push(el('text', { x: GANTT_X - 6, y: y + GANTT_BAR - 5, 'font-size': fontSizes.xs, fill: pal.textMuted, 'text-anchor': 'end' }, root));
    }
    const ghostG = el('g', {}, root);
    const blockG = el('g', {}, root);
    el('line', { x1: GANTT_X, x2: GANTT_X + GANTT_W, y1: AXIS_Y, y2: AXIS_Y, stroke: pal.border }, root);
    const axisG = el('g', {}, root);
    const axisTitle = el('text', { x: GANTT_X + GANTT_W, y: AXIS_Y + 26, 'font-size': fontSizes.xs, fill: pal.textMuted, 'text-anchor': 'end' }, root);
    const cursor = el('line', { y1: GANTT_Y - 4, y2: AXIS_Y, stroke: pal.accent, 'stroke-width': 1.5 }, root);
    const finishLine = el('line', { y1: GANTT_Y - 6, y2: AXIS_Y + 4, stroke: pal.primary, 'stroke-width': 2, 'stroke-dasharray': '5 3' }, root);
    const finishText = el('text', { y: GANTT_Y - 9, 'font-size': fontSizes.xs, 'font-weight': 600, fill: pal.primary, 'text-anchor': 'middle' }, root);

    // ── 4. 막대
    const barsTitle = el('text', { x: 16, y: BARS_TITLE_Y, 'font-size': fontSizes.sm, fill: pal.text }, root);
    el('line', { x1: BARS_X - 10, x2: BARS_X + BARS_PITCH * (BARS - 1) + BAR_W + 10, y1: BARS_BASE, y2: BARS_BASE, stroke: pal.border }, root);
    const barRects: SVGRectElement[] = [];
    const barVals: SVGTextElement[] = [];
    const barLabels: SVGTextElement[] = [];
    for (let i = 0; i < BARS; i += 1) {
      const x = BARS_X + i * BARS_PITCH;
      barRects.push(el('rect', { x, width: BAR_W, fill: pal.itemDefault, stroke: pal.border, 'stroke-width': 1 }, root));
      barVals.push(el('text', { x: x + BAR_W / 2, 'font-size': fontSizes.xs, fill: pal.text, 'text-anchor': 'middle' }, root));
      barLabels.push(el('text', { x: x + BAR_W / 2, y: BARS_BASE + 15, 'font-size': fontSizes.sm, fill: pal.text, 'text-anchor': 'middle' }, root));
    }
    const barsAxis = el('text', { x: 16, y: BARS_BASE + 15, 'font-size': fontSizes.xs, fill: pal.textMuted }, root);
    const fastTag = el('text', { y: BARS_BASE + 34, 'font-size': fontSizes.xs, 'font-weight': 600, fill: pal.text, 'text-anchor': 'middle' }, root);
    const mark = el('circle', { r: 6, fill: pal.primary, stroke: pal.bg, 'stroke-width': 2 }, root);

    // ── 상태
    let round: NetworkLayerStageRound | null = null;
    let at: number[] = []; // 조각 i 가 있는 마디 (0 = A · links = B)
    let movedNow = new Set<number>();
    let busyNow = new Set<number>();
    let blocks: Block[] = [];
    let ghosts: Block[] = [];
    let markSplit: number | null = null;
    let segFill: string[] = new Array<string>(SEGS).fill(pal.itemDefault);

    const collapsedGeo = (): Geo => ({
      segX: new Array<number>(MAX_PIECES * SEGS).fill(BAND_X),
      segW: new Array<number>(MAX_PIECES * SEGS).fill(0),
      nodeX: new Array<number>(MAX_NODES).fill(NODE_L),
      nodeOp: new Array<number>(MAX_NODES).fill(0),
      chipX: new Array<number>(MAX_PIECES).fill(NODE_L),
      chipY: new Array<number>(MAX_PIECES).fill(NODE_Y - 30),
      chipOp: new Array<number>(MAX_PIECES).fill(0),
      blockW: [],
      barH: new Array<number>(BARS).fill(0),
      fastX: BARS_X + BAR_W / 2,
      markX: BARS_X + BAR_W / 2,
      markY: BARS_BASE,
      markOp: 0,
      cursorX: GANTT_X,
      finishX: GANTT_X,
      finishOp: 0,
    });
    let geo = collapsedGeo();

    /** 지금 판에서 보이는 마디 차례 — 데이터 색인 */
    const visibleOrder = (links: number): number[] => {
      const order: number[] = [];
      for (let i = 0; i < links; i += 1) order.push(i);
      order.push(MAX_NODES - 1);
      return order;
    };

    const timeX = (tm: number): number => {
      if (!round) throw new Error('network-layer-stage: 판이 서기 전에 시간 축을 쓴다');
      return GANTT_X + (tm / round.timeMax) * GANTT_W;
    };

    const draw = (): void => {
      // 띠
      for (let i = 0; i < MAX_PIECES * SEGS; i += 1) {
        const r = segRects[i] as SVGRectElement;
        const w = geo.segW[i] as number;
        r.setAttribute('x', String(geo.segX[i]));
        r.setAttribute('width', String(Math.max(0, w)));
        r.setAttribute('fill', segFill[i % SEGS] as string);
        r.setAttribute('visibility', w > 0.2 ? 'visible' : 'hidden');
      }
      for (let i = 0; i < MAX_PIECES; i += 1) {
        const lab = pieceLabels[i] as SVGTextElement;
        const payIdx = i * SEGS + 3;
        const pw = geo.segW[payIdx] as number;
        lab.setAttribute('x', String((geo.segX[payIdx] as number) + pw / 2));
        lab.textContent = `p${i + 1}`;
        lab.setAttribute('visibility', pw > 22 && round !== null && i < round.split ? 'visible' : 'hidden');
      }
      // 마디
      for (let i = 0; i < MAX_NODES; i += 1) {
        const n = nodeEls[i] as NodeEls;
        n.g.setAttribute('transform', `translate(${geo.nodeX[i]},0)`);
        n.g.setAttribute('opacity', String(geo.nodeOp[i]));
      }
      const links = round?.links ?? 0;
      const order = visibleOrder(links);
      for (let i = 0; i < MAX_LINKS; i += 1) {
        const line = linkLines[i] as SVGLineElement;
        if (i >= links) {
          line.setAttribute('visibility', 'hidden');
          continue;
        }
        const a = geo.nodeX[order[i] as number] as number;
        const b = geo.nodeX[order[i + 1] as number] as number;
        line.setAttribute('visibility', 'visible');
        line.setAttribute('x1', String(a + NODE_R_PX));
        line.setAttribute('x2', String(b - NODE_R_PX));
        const busy = busyNow.has(i);
        line.setAttribute('stroke', busy ? pal.primary : pal.border);
        line.setAttribute('stroke-width', busy ? '4' : '2');
      }
      // 칩
      for (let i = 0; i < MAX_PIECES; i += 1) {
        const c = chips[i] as ChipEls;
        c.g.setAttribute('transform', `translate(${geo.chipX[i]},${geo.chipY[i]})`);
        c.g.setAttribute('opacity', String(geo.chipOp[i]));
        const arrived = round !== null && at[i] === round.links;
        const moved = movedNow.has(i);
        c.box.setAttribute('fill', moved ? pal.primary : arrived ? pal.bgSubtle : pal.bg);
        c.box.setAttribute('stroke', moved ? pal.primary : pal.textMuted);
        c.box.setAttribute('stroke-dasharray', arrived && !moved ? '2 1' : '');
        c.label.setAttribute('fill', moved ? pal.textInverse : pal.text);
      }
      // 시간 축의 칸
      const blockEls = blockG.children;
      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i] as Block;
        const g = blockEls[i];
        if (!g) continue;
        const rect = g.firstElementChild as SVGRectElement;
        const w = geo.blockW[i] ?? b.w;
        rect.setAttribute('width', String(Math.max(0, w)));
        const lab = g.lastElementChild as SVGTextElement;
        lab.setAttribute('visibility', w > 20 ? 'visible' : 'hidden');
      }
      cursor.setAttribute('x1', String(geo.cursorX));
      cursor.setAttribute('x2', String(geo.cursorX));
      finishLine.setAttribute('x1', String(geo.finishX));
      finishLine.setAttribute('x2', String(geo.finishX));
      finishLine.setAttribute('opacity', String(geo.finishOp));
      finishText.setAttribute('x', String(Math.min(Math.max(geo.finishX, GANTT_X + 30), GANTT_X + GANTT_W - 30)));
      finishText.setAttribute('opacity', String(geo.finishOp));
      // 막대
      for (let i = 0; i < BARS; i += 1) {
        const h = geo.barH[i] as number;
        const r = barRects[i] as SVGRectElement;
        r.setAttribute('y', String(BARS_BASE - h));
        r.setAttribute('height', String(Math.max(0, h)));
        (barVals[i] as SVGTextElement).setAttribute('y', String(BARS_BASE - h - 10));
      }
      fastTag.setAttribute('x', String(geo.fastX));
      mark.setAttribute('cx', String(geo.markX));
      mark.setAttribute('cy', String(geo.markY));
      mark.setAttribute('opacity', String(geo.markOp));
    };

    const animateTo = (target: Geo, ms: number): Promise<void> => {
      const from = cloneGeo(geo);
      if (ms <= 0 || destroyed || isInstant() || typeof requestAnimationFrame !== 'function') {
        geo = target;
        draw();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          geo = target;
          if (!destroyed) draw();
          resolve();
        };
        waiters.add(finish);
        const frame = (now: number): void => {
          if (destroyed || isInstant()) return finish();
          const k = Math.min(1, (now - start) / ms);
          geo = lerpGeo(from, target, ease(k));
          draw();
          if (k >= 1) return finish();
          const id = requestAnimationFrame((n2) => {
            frames.delete(id);
            frame(n2);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n2) => {
          frames.delete(id);
          frame(n2);
        });
        frames.add(id);
      });
    };

    /** 조각 칩이 머무는 자리 — 마디 위에 세 줄로 쌓는다 (조각 번호가 작은 것이 아래 왼쪽) */
    const chipTargets = (g: Geo, r: NetworkLayerStageRound): void => {
      const order = visibleOrder(r.links);
      const rank = new Array<number>(r.links + 1).fill(0);
      for (let i = 0; i < MAX_PIECES; i += 1) {
        if (i >= r.split) {
          g.chipOp[i] = 0;
          continue;
        }
        const node = need(at[i], `조각 ${i + 1} 의 자리`);
        const k = rank[node] as number;
        rank[node] = k + 1;
        const nx = g.nodeX[order[node] as number] as number;
        const col = k % CHIP_COLS;
        const row = Math.floor(k / CHIP_COLS);
        g.chipX[i] = nx - CHIP_PITCH_X + col * CHIP_PITCH_X;
        g.chipY[i] = NODE_Y - 30 - row * CHIP_PITCH_Y;
        g.chipOp[i] = 1;
      }
    };

    let stackIds: string[] = [];
    const layerIndex = (layer: string): number => {
      const i = stackIds.indexOf(layer);
      if (i < 0) throw new Error(`network-layer-stage: 모르는 층 ${layer}`);
      return i;
    };
    const layerName = (layer: string): string => {
      switch (layer) {
        case 'application':
          return t('label.layer.application', 'Application');
        case 'transport':
          return t('label.layer.transport', 'Transport');
        case 'network':
          return t('label.layer.network', 'Network');
        case 'link':
          return t('label.layer.link', 'Link');
        case 'physical':
          return t('label.layer.physical', 'Physical');
        default:
          throw new Error(`network-layer-stage: 모르는 층 ${layer}`);
      }
    };

    // 정적 표지 — 마디의 층 · 범례 (판마다 같은 것을 다시 세운다)
    const buildStacks = (stack: string[], routerStack: string[]): void => {
      if (stack.length !== 5) throw new Error('network-layer-stage: 층이 다섯이 아니다');
      stackIds = stack;
      const routerLayers = new Set(routerStack);
      for (let i = 0; i < MAX_NODES; i += 1) {
        const n = nodeEls[i] as NodeEls;
        while (n.stack.firstChild) n.stack.removeChild(n.stack.firstChild);
        const isHost = i === 0 || i === MAX_NODES - 1;
        stackIds.forEach((id, row) => {
          if (!isHost && !routerLayers.has(id)) return;
          const y = STACK_Y + row * STACK_ROW;
          const c = vivid[layerIndex(id)] as string;
          el('rect', { x: -STACK_W / 2, y, width: STACK_W, height: STACK_ROW - 2, fill: pal.bg, stroke: c, 'stroke-width': 1.2 }, n.stack);
          const tt = el('text', { x: 0, y: y + STACK_ROW - 4, 'font-size': fontSizes.xs, fill: pal.text, 'text-anchor': 'middle' }, n.stack);
          tt.textContent = layerName(id);
        });
        n.role.textContent =
          i === 0
            ? t('label.role.sender', 'Sending host')
            : i === MAX_NODES - 1
              ? t('label.role.receiver', 'Receiving host')
              : t('label.role.router', 'Router');
      }
      // 범례
      while (legendG.firstChild) legendG.removeChild(legendG.firstChild);
      const items: { fill: string; text: string }[] = [
        { fill: vivid[layerIndex('link')] as string, text: t('label.legend.link', 'Link header · trailer') },
        { fill: vivid[layerIndex('network')] as string, text: t('label.legend.network', 'Network header') },
        { fill: vivid[layerIndex('transport')] as string, text: t('label.legend.transport', 'Transport header') },
        { fill: pastel[layerIndex('application')] as string, text: t('label.legend.data', 'Application data') },
      ];
      let x = BAND_X;
      for (const it of items) {
        el('rect', { x, y: BAND_Y + BAND_H + 8, width: 10, height: 10, fill: it.fill, stroke: pal.border }, legendG);
        const tt = el('text', { x: x + 14, y: BAND_Y + BAND_H + 17, 'font-size': fontSizes.xs, fill: pal.textMuted }, legendG);
        tt.textContent = it.text;
        x += 14 + it.text.length * fsXs * 0.62 + 18;
      }
      axisTitle.textContent = t('label.axis.byteTime', 'Byte time');
      barsAxis.textContent = t('label.axis.pieces', 'Pieces');
    };

    const buildAxis = (timeMax: number): void => {
      while (axisG.firstChild) axisG.removeChild(axisG.firstChild);
      for (let v = 0; v <= timeMax; v += 1000) {
        const x = GANTT_X + (v / timeMax) * GANTT_W;
        el('line', { x1: x, x2: x, y1: AXIS_Y, y2: AXIS_Y + 4, stroke: pal.border }, axisG);
        const tt = el('text', { x, y: AXIS_Y + 14, 'font-size': fontSizes.xs, fill: pal.textMuted, 'text-anchor': 'middle' }, axisG);
        tt.textContent = String(v);
      }
    };

    const drawBlocks = (): void => {
      while (blockG.firstChild) blockG.removeChild(blockG.firstChild);
      for (const b of blocks) {
        const g = el('g', {}, blockG);
        const y = GANTT_Y + b.link * GANTT_ROW;
        el('rect', { x: b.x, y, width: b.w, height: GANTT_BAR, fill: pal.primary, stroke: pal.bg, 'stroke-width': 1 }, g);
        const lab = el('text', { x: b.x + b.w / 2, y: y + GANTT_BAR - 5, 'font-size': fontSizes.xs, fill: pal.textInverse, 'text-anchor': 'middle' }, g);
        lab.textContent = `p${b.piece}`;
      }
      while (ghostG.firstChild) ghostG.removeChild(ghostG.firstChild);
      for (const b of ghosts) {
        const y = GANTT_Y + b.link * GANTT_ROW;
        el('rect', { x: b.x, y: y + 1, width: Math.max(0, b.w - 1), height: GANTT_BAR - 2, fill: 'none', stroke: pal.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 2' }, ghostG);
      }
    };

    const stage: NetworkLayerStage = {
      async showRound(r, ms) {
        if (r.nodes.length !== r.links + 1) throw new Error('network-layer-stage: 마디 기호 수가 링크 수 + 1 이 아니다');
        if (r.bars.length !== BARS) throw new Error('network-layer-stage: 막대가 여섯이 아니다');
        if (r.split > MAX_PIECES || r.links > MAX_LINKS) throw new Error('network-layer-stage: 자리를 넘는 판');
        const first = round === null;
        buildStacks(r.stack, r.routerStack);
        if (first || round?.timeMax !== r.timeMax) buildAxis(r.timeMax);
        round = r;
        at = new Array<number>(r.split).fill(0);
        movedNow = new Set();
        busyNow = new Set();
        // 앞 판의 계단은 점선 윤곽으로 남긴다 — 지금 링크 수 밖의 줄에 있던 것은 지운다
        ghosts = blocks.filter((b) => b.link < r.links);
        blocks = [];
        drawBlocks();

        caption.textContent = t('caption.split', 'Pieces: {n} · Piece size: {size} bytes · Links: {links}', {
          n: r.split,
          size: r.pieceSize,
          links: r.links,
        });
        bandTitle.textContent = t('label.band.wire', 'Bytes over one link: {bytes}', { bytes: r.wireBytes });
        bandShare.textContent = t('label.band.share', 'Application share: {pct}%', { pct: r.payloadShare });
        barsTitle.textContent = t('label.bars.title', 'Finish time for each split (links: {links})', { links: r.links });

        // 칸 색 — 머리는 바깥 층부터, 꼬리는 안쪽 층부터 (선 위 차례)
        const headsOut = [...r.heads].reverse();
        const tailsIn = [...r.tails];
        if (headsOut.length !== 3 || tailsIn.length !== 3) throw new Error('network-layer-stage: 층이 셋이 아니다');
        segFill = [
          ...headsOut.map((h) => vivid[layerIndex(h.layer)] as string),
          pastel[layerIndex('application')] as string,
          ...tailsIn.map((h) => vivid[layerIndex(h.layer)] as string),
        ];

        const target = cloneGeo(geo);
        target.blockW = [];
        // 띠 — 조각마다 머리 · 데이터 · 꼬리
        const scale = BAND_W / r.wireMax;
        const payload = r.message / r.split;
        const bytes = [...headsOut.map((h) => h.bytes), payload, ...tailsIn.map((h) => h.bytes)];
        let x = BAND_X;
        for (let i = 0; i < MAX_PIECES; i += 1) {
          for (let s = 0; s < SEGS; s += 1) {
            const w = i < r.split ? (bytes[s] as number) * scale : 0;
            target.segX[i * SEGS + s] = x;
            target.segW[i * SEGS + s] = w;
            x += w;
          }
        }
        if (first) {
          // 처음 판은 머리 없는 한 덩이에서 갈라진다
          const from = cloneGeo(geo);
          from.segX.fill(BAND_X);
          from.segW.fill(0);
          from.segW[3] = r.message * scale;
          geo = from;
        }
        // 마디 — 라우터는 B 쪽에서 밀려 나오고 B 쪽으로 접혀 들어간다
        const order = visibleOrder(r.links);
        order.forEach((ni, k) => {
          target.nodeX[ni] = NODE_L + (k * (NODE_R - NODE_L)) / r.links;
          target.nodeOp[ni] = 1;
          const ne = nodeEls[ni] as NodeEls;
          ne.sym.textContent = need(r.nodes[k], '마디 기호');
        });
        for (let ni = 0; ni < MAX_NODES; ni += 1) {
          if (order.includes(ni)) continue;
          target.nodeX[ni] = NODE_R;
          target.nodeOp[ni] = 0;
          if (first) geo.nodeX[ni] = NODE_R;
        }
        if (first) {
          for (const ni of order) {
            geo.nodeX[ni] = target.nodeX[ni] as number;
          }
        } else {
          // 새로 나오는 라우터는 B 자리에서 출발
          for (const ni of order) if ((geo.nodeOp[ni] as number) < 0.5 && ni !== MAX_NODES - 1) geo.nodeX[ni] = NODE_R;
        }
        // 조각 칩 — 모두 A 에 모인다
        chipTargets(target, r);
        for (let i = 0; i < MAX_PIECES; i += 1) {
          if (i < r.split && (geo.chipOp[i] as number) < 0.5) {
            geo.chipX[i] = target.chipX[i] as number;
            geo.chipY[i] = target.chipY[i] as number;
          }
        }
        // 시간 축 행
        for (let i = 0; i < MAX_LINKS; i += 1) {
          const show = i < r.links;
          (rowBgs[i] as SVGRectElement).setAttribute('visibility', show ? 'visible' : 'hidden');
          (rowLabels[i] as SVGTextElement).textContent = show ? `${r.nodes[i]}→${r.nodes[i + 1]}` : '';
        }
        target.cursorX = GANTT_X;
        // 끝 시각 표지는 앞 판 자리에 남아 있다가 끝 걸음에 새 자리로 옮겨 간다
        // 막대 — 지금 L 의 여섯 n
        r.bars.forEach((b, i) => {
          target.barH[i] = (b.finish / r.timeMax) * BARS_MAX_H;
          const val = barVals[i] as SVGTextElement;
          val.textContent = String(b.finish);
          (barLabels[i] as SVGTextElement).textContent = String(b.split);
          const cur = b.split === r.split;
          const rect = barRects[i] as SVGRectElement;
          rect.setAttribute('stroke', cur ? pal.primary : pal.border);
          rect.setAttribute('stroke-width', cur ? '2.5' : '1');
          rect.setAttribute('fill', cur ? pal.itemActive : pal.itemDefault);
          val.setAttribute('font-weight', cur ? '700' : '400');
        });
        // 앞 판의 점은 제 막대 끝에 붙어 새 높이로 따라간다 — 끝 걸음에 지금 막대로 옮겨 간다
        if (markSplit !== null) {
          const mi = r.bars.findIndex((b) => b.split === markSplit);
          if (mi >= 0) target.markY = BARS_BASE - (target.barH[mi] as number);
        }
        const fi = r.bars.findIndex((b) => b.split === r.fastestSplit);
        if (fi < 0) throw new Error('network-layer-stage: 가장 빠른 쪼갬이 막대에 없다');
        target.fastX = BARS_X + fi * BARS_PITCH + BAR_W / 2;
        fastTag.textContent = t('label.bars.fastest', '▲ Fastest');
        if (first) geo.fastX = target.fastX;
        draw();
        await animateTo(target, ms);
      },

      async showForward(f, ms) {
        const r = round;
        if (!r) throw new Error('network-layer-stage: 판이 서기 전에 넘김이 왔다');
        caption.textContent = t('caption.forward', 'Tick {tick} · Busy links: {busy} · Elapsed: {elapsed} byte times', {
          tick: f.tick,
          busy: f.busyLinks,
          elapsed: f.elapsed,
        });
        movedNow = new Set();
        busyNow = new Set();
        const start = timeX((f.tick - 1) * f.pieceSize);
        const end = timeX(f.tick * f.pieceSize);
        const target = cloneGeo(geo);
        for (const m of f.moves) {
          const i = m.piece - 1;
          if (at[i] !== m.from) throw new Error(`network-layer-stage: 조각 p${m.piece} 이 마디 ${m.from} 에 없다`);
          at[i] = m.to;
          movedNow.add(i);
          busyNow.add(m.from);
          blocks.push({ piece: m.piece, link: m.from, x: start, w: end - start });
        }
        if (busyNow.size !== f.busyLinks) throw new Error('network-layer-stage: 바쁜 링크 수가 옮김과 다르다');
        drawBlocks();
        // 이번 틱의 칸은 0 에서 자란다
        geo.blockW = blocks.map((b, i) => (i < blocks.length - f.moves.length ? b.w : 0));
        target.blockW = blocks.map((b) => b.w);
        chipTargets(target, r);
        target.cursorX = end;
        draw();
        await animateTo(target, ms);
      },

      async showFinish(f, ms) {
        const r = round;
        if (!r) throw new Error('network-layer-stage: 판이 서기 전에 끝이 왔다');
        caption.textContent = t('caption.finish', 'Finish time: {finish} byte times · Fastest split: {best}', {
          finish: f.finish,
          best: f.fastestSplit,
        });
        finishText.textContent = t('label.finishMark', 'Finish: {finish}', { finish: f.finish });
        movedNow = new Set();
        busyNow = new Set();
        const target = cloneGeo(geo);
        target.finishX = timeX(f.finish);
        target.finishOp = 1;
        const bi = r.bars.findIndex((b) => b.split === f.split);
        if (bi < 0) throw new Error('network-layer-stage: 지금 쪼갬이 막대에 없다');
        const bar = need(r.bars[bi], '막대');
        if (bar.finish !== f.finish) throw new Error('network-layer-stage: 막대의 끝 시각과 판의 끝 시각이 다르다');
        target.markX = BARS_X + bi * BARS_PITCH + BAR_W / 2;
        target.markY = BARS_BASE - (target.barH[bi] as number);
        target.markOp = 1;
        markSplit = f.split;
        if ((geo.markOp as number) < 0.5) {
          geo.markX = target.markX;
          geo.markY = BARS_BASE;
        }
        if ((geo.finishOp as number) < 0.5) geo.finishX = GANTT_X;
        draw();
        await animateTo(target, ms);
      },

      clear() {
        round = null;
        markSplit = null;
        at = [];
        movedNow = new Set();
        busyNow = new Set();
        blocks = [];
        ghosts = [];
        drawBlocks();
        geo = collapsedGeo();
        caption.textContent = '';
        bandTitle.textContent = '';
        bandShare.textContent = '';
        barsTitle.textContent = '';
        fastTag.textContent = '';
        finishText.textContent = '';
        for (let i = 0; i < BARS; i += 1) {
          (barVals[i] as SVGTextElement).textContent = '';
          (barLabels[i] as SVGTextElement).textContent = '';
        }
        for (let i = 0; i < MAX_LINKS; i += 1) {
          (rowBgs[i] as SVGRectElement).setAttribute('visibility', 'hidden');
          (rowLabels[i] as SVGTextElement).textContent = '';
        }
        draw();
      },

      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
    stage.clear();
    return stage;
  },
};
