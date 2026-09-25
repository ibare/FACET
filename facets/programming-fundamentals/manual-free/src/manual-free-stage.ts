/**
 * 수동 해제의 그림.
 *
 * 동사는 "돌아갔다가 다시 나간다". 덩이는 free 로 힙 줄에서 떠나 아래 빈 자리 목록의 맨 앞으로
 * 내려가고, 다음 allocate 가 그 덩이를 목록에서 꺼내 제자리로 도로 올린다. 새 땅에서 떼는 빌림은
 * 새 땅 끝 표지를 오른쪽으로 민다 — 목록에서 꺼내는 빌림은 그 표지를 건드리지 않는다.
 *
 * 이름 칸은 free 뒤에도 주소 수를 그대로 품는다. 그러나 빌린 이름을 가리키는 끈은 할당기 쪽의
 * 사실(빌려 나간 덩이의 빌린 이름)로만 긋는다 — 돌려준 뒤의 이름은 끈이 없고 흐리게 선다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ManualFreeScene, MfChip } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const PAD = 16;
const MOVE_MS = 400;
const SVG = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Geo = {
  codeX: number;
  codeW: number;
  codeY: number;
  lineH: number;
  x0: number;
  x1: number;
  cellW: number;
  nameY: number;
  boxW: number;
  boxH: number;
  slotStep: number;
  heapY: number;
  cellH: number;
  listY: number;
  chipH: number;
  gap: number;
  capY: number;
};

type Handles = {
  frontier: SVGGElement | null;
  newLand: SVGRectElement | null;
  blocks: Map<number, SVGGElement>;
  cells: Map<number, SVGElement[]>;
  links: Map<number, SVGLineElement>;
  chips: SVGGElement[];
};

export const manualFreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const fs = parseFloat(fontSizes.sm);
    const fsx = parseFloat(fontSizes.xs);
    const charW = fs * 0.6;

    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Attrs,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function text(s: string, attrs: Attrs, parent: Element = svg): SVGTextElement {
      const node = el('text', attrs, parent);
      node.textContent = s;
      return node;
    }

    function geo(s: ManualFreeScene): Geo {
      const widest = s.lines.reduce((m, l, i) => Math.max(m, l.length + 4 * (s.indents[i] ?? 0)), 0);
      const codeW = widest * charW + 24;
      const x0 = PAD + codeW + 28;
      const x1 = W - PAD;
      const cellW = Math.min(56, (x1 - x0) / (Math.max(s.span, 1) + 2));
      const names = Math.max(s.names.length, 1);
      return {
        codeX: PAD,
        codeW,
        codeY: 44,
        lineH: 28,
        x0,
        x1,
        cellW,
        nameY: 22,
        boxW: 44,
        boxH: 24,
        slotStep: Math.min(96, (x1 - x0) / names),
        heapY: 112,
        cellH: 34,
        listY: 194,
        chipH: 30,
        gap: 10,
        capY: H - 26,
      };
    }

    const cellX = (g: Geo, s: ManualFreeScene, addr: number): number => g.x0 + (addr - s.base) * g.cellW;
    const chipXs = (g: Geo, list: MfChip[]): number[] => {
      const xs: number[] = [];
      let x = g.x0 + 8;
      for (const chip of list) {
        xs.push(x);
        x += chip.size * g.cellW + g.gap;
      }
      return xs;
    };
    const nameBoxX = (g: Geo, i: number): number => g.x0 + i * g.slotStep + fs + 4;

    function caption(s: ManualFreeScene): string {
      const st = s.step;
      if (st.kind === 'start') return t('caption.start', 'Nothing is borrowed yet. New land begins at {end}.', { end: s.end });
      if (st.kind === 'fresh') {
        return t('caption.fresh', 'allocate({n}): the free list has no {n}-cell block — cut from new land at {addr}.', {
          n: st.size,
          addr: st.addr,
        });
      }
      if (st.kind === 'reuse') {
        return t('caption.reuse', 'allocate({n}): block {addr} comes back out of the free list.', {
          n: st.size,
          addr: st.addr,
        });
      }
      if (st.kind === 'free') {
        return t('caption.free', 'free({name}): block {addr} goes to the front of the free list.', {
          name: st.name,
          addr: st.addr,
        });
      }
      return '';
    }

    function wrap(s: string, width: number): string[] {
      const w = (ch: string): number => (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.56);
      const out: string[] = [];
      let line = '';
      let lw = 0;
      const tokens = s.split(/(\s+)/);
      for (const tok of tokens) {
        const tw = [...tok].reduce((a, ch) => a + w(ch), 0);
        if (lw + tw > width && line.trim() !== '') {
          out.push(line.trimEnd());
          line = '';
          lw = 0;
          if (/^\s+$/.test(tok)) continue;
        }
        if (tw > width) {
          for (const ch of tok) {
            if (lw + w(ch) > width) {
              out.push(line);
              line = '';
              lw = 0;
            }
            line += ch;
            lw += w(ch);
          }
        } else {
          line += tok;
          lw += tw;
        }
      }
      if (line.trim() !== '') out.push(line.trimEnd());
      return out;
    }

    function drawStatic(s: ManualFreeScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        frontier: null,
        newLand: null,
        blocks: new Map(),
        cells: new Map(),
        links: new Map(),
        chips: [],
      };
      if (s.lines.length === 0) return h;
      const g = geo(s);

      // 코드
      el('rect', {
        x: g.codeX,
        y: g.codeY - g.lineH + 6,
        width: g.codeW,
        height: g.lineH * s.lines.length + 8,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      s.lines.forEach((line, i) => {
        const y = g.codeY + i * g.lineH;
        if (i === s.line) {
          el('rect', {
            x: g.codeX + 4,
            y: y - g.lineH + 10,
            width: g.codeW - 8,
            height: g.lineH - 4,
            rx: 4,
            fill: c.accent,
            'fill-opacity': 0.4,
          });
        }
        text(line, {
          x: g.codeX + 12 + 4 * (s.indents[i] ?? 0) * charW,
          y,
          'font-family': fonts.mono,
          'font-size': fs,
          fill: c.text,
        });
      });

      // 빌린 이름에서 덩이로 가는 끈
      const owners = new Set(s.blocks.map((b) => b.owner));
      for (const b of s.blocks) {
        const i = s.names.indexOf(b.owner);
        if (i < 0) continue;
        const line = el('line', {
          x1: nameBoxX(g, i) + g.boxW / 2,
          y1: g.nameY + g.boxH,
          x2: cellX(g, s, b.addr) + (b.size * g.cellW) / 2,
          y2: g.heapY,
          stroke: c.primary,
          'stroke-width': 1.5,
        });
        h.links.set(b.addr, line);
      }

      // 이름 칸
      s.names.forEach((name, i) => {
        const bx = nameBoxX(g, i);
        const held = owners.has(name);
        const v = s.vals[i];
        text(name, {
          x: bx - 4,
          y: g.nameY + g.boxH / 2 + fs / 3,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fs,
          fill: c.text,
        });
        el('rect', {
          x: bx,
          y: g.nameY,
          width: g.boxW,
          height: g.boxH,
          rx: 4,
          fill: c.bg,
          stroke: held ? c.primary : c.border,
          'stroke-width': held ? 1.5 : 1,
        });
        if (v !== null && v !== undefined) {
          text(String(v), {
            x: bx + g.boxW / 2,
            y: g.nameY + g.boxH / 2 + fs / 3,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fs,
            fill: held ? c.text : c.textMuted,
          });
        }
      });

      // 힙 — 뗀 칸
      const cut = s.end - s.base;
      for (let k = 0; k < cut; k += 1) {
        const addr = s.base + k;
        const x = cellX(g, s, addr);
        const cell = el('rect', {
          x,
          y: g.heapY,
          width: g.cellW,
          height: g.cellH,
          fill: c.bgSubtle,
          stroke: c.textMuted,
          'stroke-dasharray': '3 3',
        });
        const label = text(String(addr), {
          x: x + g.cellW / 2,
          y: g.heapY + g.cellH + fsx + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fsx,
          fill: c.textMuted,
        });
        h.cells.set(addr, [cell, label]);
      }

      // 새 땅
      const endX = cellX(g, s, s.end);
      h.newLand = el('rect', {
        x: endX,
        y: g.heapY,
        width: Math.max(0, g.x1 - endX),
        height: g.cellH,
        fill: 'none',
        stroke: c.border,
        'stroke-dasharray': '2 4',
      });
      text(t('label.newLand', 'new land'), {
        x: g.x1 - 6,
        y: g.heapY + g.cellH / 2 + fsx / 3,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fsx,
        fill: c.textMuted,
      });

      // 빌려 나간 덩이
      for (const b of s.blocks) {
        const grp = el('g', {});
        const x = cellX(g, s, b.addr);
        el(
          'rect',
          {
            x: x + 1,
            y: g.heapY + 1,
            width: b.size * g.cellW - 2,
            height: g.cellH - 2,
            rx: 3,
            fill: c.primary,
          },
          grp,
        );
        for (let k = 1; k < b.size; k += 1) {
          el(
            'line',
            {
              x1: x + k * g.cellW,
              y1: g.heapY + 4,
              x2: x + k * g.cellW,
              y2: g.heapY + g.cellH - 4,
              stroke: c.textInverse,
              'stroke-opacity': 0.5,
            },
            grp,
          );
        }
        h.blocks.set(b.addr, grp);
      }

      // 새 땅 끝 표지
      const fr = el('g', {});
      el(
        'line',
        { x1: endX, y1: g.heapY - 14, x2: endX, y2: g.heapY + g.cellH + 4, stroke: c.text, 'stroke-width': 2 },
        fr,
      );
      text(
        t('label.end', 'end: {end}', { end: s.end }),
        {
          x: endX,
          y: g.heapY - 20,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fsx,
          fill: c.text,
        },
        fr,
      );
      h.frontier = fr;

      // 빈 자리 목록
      text(t('label.freeList', 'Free list'), {
        x: g.x0,
        y: g.listY - 10,
        'font-family': fonts.body,
        'font-size': fs,
        fill: c.text,
      });
      const borrowedCells = s.blocks.reduce((a, b) => a + b.size, 0);
      text(t('label.borrowed', 'Borrowed cells: {n}', { n: borrowedCells }), {
        x: g.x1,
        y: g.listY - 10,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fs,
        fill: c.text,
      });
      el('rect', {
        x: g.x0,
        y: g.listY - 4,
        width: g.x1 - g.x0,
        height: g.chipH + 8,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      text(t('label.front', 'front'), {
        x: g.x0 + 8,
        y: g.listY + g.chipH + fsx + 6,
        'font-family': fonts.body,
        'font-size': fsx,
        fill: c.textMuted,
      });
      const xs = chipXs(g, s.list);
      s.list.forEach((chip, i) => {
        const grp = el('g', {});
        const x = xs[i] ?? g.x0;
        const w = chip.size * g.cellW;
        el(
          'rect',
          { x, y: g.listY, width: w, height: g.chipH, rx: 3, fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.5 },
          grp,
        );
        for (let k = 1; k < chip.size; k += 1) {
          el(
            'line',
            {
              x1: x + k * g.cellW,
              y1: g.listY + 4,
              x2: x + k * g.cellW,
              y2: g.listY + g.chipH - 4,
              stroke: c.border,
            },
            grp,
          );
        }
        text(
          String(chip.addr),
          {
            x: x + w / 2,
            y: g.listY + g.chipH / 2 + fs / 3,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fs,
            fill: c.text,
          },
          grp,
        );
        h.chips.push(grp);
      });

      // 캡션
      wrap(caption(s), W - 2 * PAD)
        .slice(0, 2)
        .forEach((ln, i) => {
          text(ln, {
            x: PAD,
            y: g.capY + i * (fs + 6),
            'font-family': fonts.body,
            'font-size': fs,
            fill: c.text,
          });
        });
      return h;
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start = -1;
        let id = 0;
        const wake = (): void => {
          waiters.delete(wake);
          frames.delete(id);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return wake();
          if (start < 0) start = now;
          const p = Math.min(1, (now - start) / MOVE_MS);
          frame(ease(p));
          if (p >= 1) return wake();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        frame(0);
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    const move = (node: Element | null | undefined, dx: number, dy: number): void => {
      node?.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    };
    const grow = (node: Element | null | undefined, ox: number, k: number): void => {
      node?.setAttribute('transform', `translate(${r2(ox)} 0) scale(${r2(Math.max(k, 0.001))} 1) translate(${r2(-ox)} 0)`);
    };

    async function animateStep(mine: number, s: ManualFreeScene, h: Handles): Promise<void> {
      const g = geo(s);
      const st = s.step;
      if (st.kind === 'fresh') {
        const bx = cellX(g, s, st.addr);
        const newX = cellX(g, s, s.end);
        const oldX = cellX(g, s, st.before);
        const block = h.blocks.get(st.addr);
        const link = h.links.get(st.addr);
        const fresh: SVGElement[] = [];
        for (let a = st.before; a < s.end; a += 1) fresh.push(...(h.cells.get(a) ?? []));
        await tween(mine, (p) => {
          const fx = oldX + (newX - oldX) * p;
          move(h.frontier, fx - newX, 0);
          h.newLand?.setAttribute('x', String(r2(fx)));
          h.newLand?.setAttribute('width', String(r2(Math.max(0, g.x1 - fx))));
          grow(block, bx, p);
          for (const node of fresh) grow(node, bx, p);
          link?.setAttribute('x2', String(r2(bx + (st.size * g.cellW * p) / 2)));
        });
        return;
      }
      if (st.kind === 'free') {
        const xs = chipXs(g, s.list);
        const chip0 = h.chips[0];
        const dx = cellX(g, s, st.addr) - (xs[0] ?? g.x0);
        const dy = g.heapY + (g.cellH - g.chipH) / 2 - g.listY;
        const shift = st.size * g.cellW + g.gap;
        await tween(mine, (p) => {
          move(chip0, dx * (1 - p), dy * (1 - p));
          h.chips.slice(1).forEach((node) => move(node, -shift * (1 - p), 0));
        });
        return;
      }
      if (st.kind === 'reuse') {
        // 꺼내기 앞의 목록에서 was 자리 — 그 앞의 덩이들은 그대로라 지금 목록으로 셈이 된다
        const before = [...s.list.slice(0, st.was), { addr: st.addr, size: st.size }];
        const fromX = chipXs(g, before)[st.was] ?? g.x0;
        const bx = cellX(g, s, st.addr);
        const dx = fromX - bx;
        const dy = g.listY + (g.chipH - g.cellH) / 2 - g.heapY;
        const block = h.blocks.get(st.addr);
        const link = h.links.get(st.addr);
        const shift = st.size * g.cellW + g.gap;
        const cx = bx + (st.size * g.cellW) / 2;
        await tween(mine, (p) => {
          move(block, dx * (1 - p), dy * (1 - p));
          link?.setAttribute('x2', String(r2(cx + dx * (1 - p))));
          link?.setAttribute('y2', String(r2(g.heapY + dy * (1 - p))));
          h.chips.slice(st.was).forEach((node) => move(node, shift * (1 - p), 0));
        });
      }
    }

    return {
      async render(next: ManualFreeScene, prev: ManualFreeScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || prev.line === next.line) return;
        await animateStep(mine, next, h);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
