/**
 * hop-by-hop 무대 — 마디 줄 위를 패킷이 한 칸씩 나아가고, 아래 띠에 링크가 틱마다
 * 누구를 날랐는지 쌓인다.
 *
 * 위: 한 줄로 선 마디와 그 사이 링크. 패킷은 마디 위에 쌓여 기다리고(맨 아래가 다음에
 *     떠날 것), 틱마다 이웃 마디로 한 칸 미끄러진다. 이번 틱에 쓰인 링크는 굵게 선다.
 * 아래: 링크(줄) × 틱(칸) 띠. 이번 틱의 칸은 패킷이 건너가는 동안 왼쪽부터 찬다.
 */
import {
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { HopByHopScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 한 틱의 운동 */
const MOVE_MS = 620;

/** 마디 상자 */
const NODE_Y = 150;
const NODE_H = 32;
const NODE_W_MAX = 84;
/** 패킷 조각 */
const CHIP_H = 20;
const CHIP_GAP = 4;
/** 아래 띠 */
const GRID_TOP = 236;
const GRID_BOTTOM = H - 10;
const ROW_H_MAX = 24;
const SIDE = 18;

type Pt = { x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const hopByHopStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 정적 그리기가 만든 손잡이 — 운동이 만진다 */
    let chipEls: SVGGElement[] = [];
    let fillEls: { el: SVGRectElement; w: number }[] = [];

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function words(x: number, y: number, body: string, size: string, fill: string, parent: Element, opts: { anchor?: string; mono?: boolean; bold?: boolean } = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': size,
        fill,
        'text-anchor': opts.anchor ?? 'start',
      }, parent);
      if (opts.bold === true) node.setAttribute('font-weight', '600');
      node.textContent = body;
      return node;
    }

    // ── 자리 셈 (캔버스 폭에서 역산)
    function nodeX(s: HopByHopScene, i: number): number {
      const n = s.nodes.length;
      const edge = SIDE + nodeW(s) / 2;
      if (n <= 1) return W / 2;
      return edge + (i * (W - 2 * edge)) / (n - 1);
    }
    function nodeW(s: HopByHopScene): number {
      const n = Math.max(2, s.nodes.length);
      const gap = (W - 2 * SIDE) / (n - 1);
      return Math.min(NODE_W_MAX, gap * 0.42);
    }
    function chipW(s: HopByHopScene): number {
      return nodeW(s) - 10;
    }
    /** 마디 node 의 slot 번째 자리 (0 이 맨 아래 — 다음에 떠날 것) */
    function chipAt(s: HopByHopScene, node: number, slot: number): Pt {
      return {
        x: nodeX(s, node) - chipW(s) / 2,
        y: NODE_Y - 6 - CHIP_H - slot * (CHIP_H + CHIP_GAP),
      };
    }
    /** 자리 배열 where 에서 패킷 p 가 선 칸 — 같은 마디의 더 작은 번호 수 */
    function slotOf(where: number[], p: number): number {
      let k = 0;
      for (let q = 0; q < p; q += 1) if (where[q] === where[p]) k += 1;
      return k;
    }
    function chipPos(s: HopByHopScene, where: number[], p: number): Pt {
      const node = where[p];
      if (node === undefined) throw new Error(`hop-by-hop 무대: 패킷 ${p} 의 자리가 없다`);
      return chipAt(s, node, slotOf(where, p));
    }

    function drawStatic(s: HopByHopScene): void {
      svg.textContent = '';
      chipEls = [];
      fillEls = [];
      if (s.nodes.length === 0) return;

      const tones = categorical(s.packets.length);
      const step = s.step;
      const busyLinks = new Set<number>(step.kind === 'tick' ? step.moves.map((m) => m.from) : []);
      const nw = nodeW(s);
      const midY = NODE_Y + NODE_H / 2;
      const endNode = s.nodes.length - 1;
      const endName = s.nodes[endNode] ?? '';

      // ── 문안: 지금 일어나는 일만
      const cap = el('g', {}, svg);
      if (step.kind === 'start') {
        const startName = s.nodes[0] ?? '';
        const waiting = s.at.filter((w) => w === 0).length;
        words(SIDE, 24, t('caption.start', 'Packets waiting at {node}: {n}', { node: startName, n: waiting }), fontSizes.md, colors.text, cap, { bold: true });
      } else {
        words(SIDE, 24, t('caption.tick', 'Tick {t} · busy links: {n}', { t: step.t, n: busyLinks.size }), fontSizes.md, colors.text, cap, { bold: true });
        const landed = step.moves.filter((m) => m.to === endNode).map((m) => s.packets[m.packet] ?? '');
        if (landed.length > 0) {
          words(SIDE, 44, t('caption.arrived', 'Arrived at {node}: {packet}', { node: endName, packet: landed.join(', ') }), fontSizes.sm, colors.textMuted, cap);
        }
        if (step.last && s.tickCount !== null) {
          words(W - SIDE, 24, t('caption.total', 'Ticks in all: {n}', { n: s.tickCount }), fontSizes.md, colors.text, cap, { anchor: 'end', bold: true });
        }
      }

      // ── 링크
      const linkLayer = el('g', {}, svg);
      for (let i = 0; i < endNode; i += 1) {
        const busy = busyLinks.has(i);
        el('line', {
          x1: nodeX(s, i) + nw / 2,
          y1: midY,
          x2: nodeX(s, i + 1) - nw / 2,
          y2: midY,
          stroke: busy ? colors.text : colors.border,
          'stroke-width': busy ? 4 : 2,
        }, linkLayer);
      }

      // ── 마디
      const nodeLayer = el('g', {}, svg);
      s.nodes.forEach((name, i) => {
        const x = nodeX(s, i);
        el('rect', {
          x: x - nw / 2, y: NODE_Y, width: nw, height: NODE_H, rx: i === 0 || i === endNode ? 4 : NODE_H / 2,
          fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5,
        }, nodeLayer);
        words(x, NODE_Y + NODE_H / 2 + smPx * 0.38, name, fontSizes.md, colors.text, nodeLayer, { anchor: 'middle', mono: true, bold: true });
        const role = i === 0
          ? t('role.sender', 'sending host')
          : i === endNode
            ? t('role.receiver', 'receiving host')
            : t('role.router', 'router');
        words(x, NODE_Y + NODE_H + 16, role, fontSizes.xs, colors.textMuted, nodeLayer, { anchor: 'middle' });
      });

      // ── 패킷 (끝 자리에 선다 — 운동은 아직 못 온 만큼으로 그린다)
      const chipLayer = el('g', {}, svg);
      const cw = chipW(s);
      s.packets.forEach((name, p) => {
        const pos = chipPos(s, s.at, p);
        const g = el('g', { transform: `translate(${r2(pos.x)},${r2(pos.y)})` }, chipLayer);
        el('rect', { x: 0, y: 0, width: cw, height: CHIP_H, rx: 3, fill: tones[p] ?? colors.primary, stroke: colors.text, 'stroke-width': 1 }, g);
        words(cw / 2, CHIP_H / 2 + smPx * 0.36, name, fontSizes.sm, colors.text, g, { anchor: 'middle', mono: true, bold: true });
        chipEls.push(g);
      });

      // ── 링크 × 틱 띠
      if (s.tickCount === null || s.tickCount <= 0) return;
      const grid = el('g', {}, svg);
      const links = endNode;
      const labelW = 74;
      const gx = SIDE + labelW;
      const colW = (W - SIDE - gx) / s.tickCount;
      const rowH = Math.min(ROW_H_MAX, (GRID_BOTTOM - (GRID_TOP + 8)) / links);
      const top = GRID_TOP + 8;
      const nowT = step.kind === 'tick' ? step.t : 0;

      if (nowT > 0) {
        el('rect', { x: gx + (nowT - 1) * colW, y: GRID_TOP - 14, width: colW, height: 14 + 8 + rowH * links, fill: colors.bgSubtle }, grid);
      }
      words(SIDE, GRID_TOP, t('label.tick', 'tick'), fontSizes.xs, colors.textMuted, grid);
      for (let c = 1; c <= s.tickCount; c += 1) {
        words(gx + (c - 0.5) * colW, GRID_TOP, String(c), fontSizes.xs, c === nowT ? colors.text : colors.textMuted, grid, { anchor: 'middle', bold: c === nowT });
      }
      for (let i = 0; i < links; i += 1) {
        const y = top + i * rowH;
        const a = s.nodes[i] ?? '';
        const b = s.nodes[i + 1] ?? '';
        words(SIDE, y + rowH / 2 + smPx * 0.36, `${a}–${b}`, fontSizes.sm, busyLinks.has(i) ? colors.text : colors.textMuted, grid, { mono: true, bold: busyLinks.has(i) });
        el('rect', { x: gx, y: y + 2, width: colW * s.tickCount, height: rowH - 4, fill: 'none', stroke: colors.border, 'stroke-width': 1 }, grid);
      }
      for (let c = 1; c < s.tickCount; c += 1) {
        el('line', { x1: gx + c * colW, y1: top, x2: gx + c * colW, y2: top + rowH * links, stroke: colors.border, 'stroke-width': 1 }, grid);
      }
      for (const u of s.uses) {
        const x = gx + (u.t - 1) * colW + 2;
        const y = top + u.link * rowH + 4;
        const w = colW - 4;
        const cell = el('rect', { x, y, width: w, height: rowH - 8, rx: 2, fill: tones[u.packet] ?? colors.primary }, grid);
        const pname = s.packets[u.packet] ?? '';
        words(x + w / 2, y + (rowH - 8) / 2 + smPx * 0.34, pname, fontSizes.xs, colors.text, grid, { anchor: 'middle', mono: true });
        if (u.t === nowT) fillEls.push({ el: cell, w });
      }
    }

    function frame(fn: (k: number) => void, ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const k = Math.min(1, (performance.now() - start) / ms);
          fn(k);
          if (k >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function move(s: HopByHopScene, mine: number): Promise<void> {
      const step = s.step;
      if (step.kind !== 'tick') return;
      const from = s.packets.map((_, p) => chipPos(s, step.was, p));
      const to = s.packets.map((_, p) => chipPos(s, s.at, p));
      const cells = fillEls;
      const chips = chipEls;
      await frame((k) => {
        const e = ease(k);
        chips.forEach((g, p) => {
          const a = from[p];
          const b = to[p];
          if (a === undefined || b === undefined) return;
          g.setAttribute('transform', `translate(${r2(a.x + (b.x - a.x) * e)},${r2(a.y + (b.y - a.y) * e)})`);
        });
        for (const c of cells) c.el.setAttribute('width', String(r2(c.w * e)));
      }, MOVE_MS, mine);
    }

    const renderer: SceneRenderer<HopByHopScene> & ViewInstance = {
      async render(next: HopByHopScene, _prev: HopByHopScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || destroyed || next.step.kind !== 'tick') return;
        await move(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
