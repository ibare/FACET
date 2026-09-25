/**
 * 메모리 누수의 무대.
 *
 * 왼쪽에 프로그램, 가운데에 이름 칸과 빈 자리 목록, 오른쪽에 힙. 힙은 새 땅에서 뗀 덩이가
 * 아래에서부터 쌓이는 더미다 — 빌릴 때마다 새 덩이가 위에서 떨어져 더미 꼭대기에 얹힌다.
 * 이름 칸에서 덩이로 가는 화살표가 "길" 이다. buf 칸이 새 주소로 덮이면 앞 덩이로 가던 화살표가
 * 끊기고, 그 덩이는 빌린 채 더미에 남는다(주소를 잃은 덩이 — 붉은 점선).
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { MemoryLeakScene, SceneBlock, SceneVal } from './scene.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const H = 320;
const PAD = 16;
// 재생 전체 20 초 안쪽: 문 15 × 1000ms + 운동 14 × 300ms ≈ 19.2 초
const MOVE_MS = 300;

/** 좌표 · 글자에 쓰는 수 — 부동소수 끝자리와 -0 을 걷는다. */
function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function fmt(v: SceneVal): string {
  if (v.k === 'num') return String(v.n);
  if (v.k === 'null') return 'null';
  return '';
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

interface Layout {
  codeX: number;
  codeTop: number;
  lineH: number;
  charW: number;
  codeW: number;
  stackX: number;
  cellBoxX: number;
  cellBoxW: number;
  cellH: number;
  cellTop: number;
  cellPitch: number;
  freeTop: number;
  slotW: number;
  heapX: number;
  heapCellW: number;
  pileBottom: number;
  pitch: number;
  dropTop: number;
  captionY: number;
}

function layout(lineCount: number, cellCount: number, blockCount: number): Layout {
  const codeTop = 58;
  const codeRoom = H * 0.5;
  const lineH = Math.min(26, codeRoom / Math.max(1, lineCount));
  const cellTop = 46;
  const cellPitch = Math.min(40, (H * 0.35) / Math.max(1, cellCount));
  const pileBottom = H - 58;
  const dropTop = 40;
  const pitch = Math.min(40, (pileBottom - dropTop - 20) / Math.max(4, blockCount));
  const stackX = W * 0.39;
  return {
    codeX: PAD + 8,
    codeTop,
    lineH,
    charW: parseFloat(fontSizes.sm) * 0.6,
    codeW: W * 0.34,
    stackX,
    cellBoxX: stackX + W * 0.05,
    cellBoxW: W * 0.12,
    cellH: Math.min(30, cellPitch - 8),
    cellTop,
    cellPitch,
    freeTop: cellTop + cellCount * cellPitch + 30,
    slotW: W * 0.09,
    heapX: W * 0.64,
    heapCellW: W * 0.095,
    pileBottom,
    pitch,
    dropTop,
    captionY: H - 18,
  };
}

export const memoryLeakStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    interface Handles {
      marker: SVGRectElement | null;
      cellVal: Map<string, SVGTextElement>;
      arrows: Map<string, SVGGElement>;
      blockG: Map<number, SVGGElement>;
      heapCellText: Map<number, SVGTextElement>;
      freeSlot: SVGGElement | null;
    }

    function blockY(L: Layout, k: number): number {
      return L.pileBottom - (k + 1) * L.pitch;
    }

    function cellY(L: Layout, k: number): number {
      return L.cellTop + k * L.cellPitch;
    }

    function lineY(L: Layout, line: number): number {
      return L.codeTop + line * L.lineH;
    }

    function arrowPath(parent: Element, x1: number, y1: number, x2: number, y2: number, color: string, dashed: boolean): SVGGElement {
      const g = el('g', {}, parent);
      const mid = r2((x1 + x2) / 2);
      el(
        'path',
        {
          d: `M ${r2(x1)} ${r2(y1)} H ${mid} V ${r2(y2)} H ${r2(x2 - 7)}`,
          fill: 'none',
          stroke: color,
          'stroke-width': 1.6,
          ...(dashed ? { 'stroke-dasharray': '4 3' } : {}),
        },
        g,
      );
      el(
        'path',
        { d: `M ${r2(x2)} ${r2(y2)} L ${r2(x2 - 8)} ${r2(y2 - 4)} L ${r2(x2 - 8)} ${r2(y2 + 4)} Z`, fill: color },
        g,
      );
      return g;
    }

    function blockStyle(scene: MemoryLeakScene, b: SceneBlock): { stroke: string; dash: boolean; ink: string } {
      if (!b.out) return { stroke: colors.border, dash: true, ink: colors.textMuted };
      if (scene.lost.includes(b.addr)) return { stroke: colors.danger, dash: true, ink: colors.text };
      return { stroke: colors.primary, dash: false, ink: colors.text };
    }

    function caption(scene: MemoryLeakScene): string {
      const s = scene.step;
      if (!s) return t('caption.start', 'Nothing has run yet.');
      const name = s.name ?? '';
      if (s.kind === 'iter') return t('caption.iter', 'Next round: {name} = {value}.', { name, value: s.value ? fmt(s.value) : '' });
      if (s.kind === 'exit') return t('caption.exit', 'The range is used up. The loop ends.');
      if (s.kind === 'alloc') {
        const addr = s.addr;
        if (s.was && s.was.k === 'num' && scene.lost.includes(s.was.n)) {
          return t('caption.allocLost', '{name} now holds {addr}. The old address {was} is in no cell any more.', {
            name,
            addr,
            was: s.was.n,
          });
        }
        return t('caption.alloc', 'A new block starts at {addr}. {name} now holds {addr}.', { name, addr });
      }
      if (s.kind === 'store') {
        return t('caption.store', 'Cell {addr} now holds {value}.', { addr: s.addr, value: s.value ? fmt(s.value) : '' });
      }
      if (s.kind === 'free') return t('caption.free', 'free returns the block at {addr}.', { addr: s.addr });
      return t('caption.set', '{name} now holds {value}.', { name, value: s.value ? fmt(s.value) : '' });
    }

    function drawStatic(scene: MemoryLeakScene): Handles {
      svg.textContent = '';
      const L = layout(scene.lines.length, scene.cells.length, scene.blocks.length);
      const h: Handles = {
        marker: null,
        cellVal: new Map(),
        arrows: new Map(),
        blockG: new Map(),
        heapCellText: new Map(),
        freeSlot: null,
      };

      // 코드
      const step = scene.step;
      if (step) {
        h.marker = el(
          'rect',
          {
            x: PAD,
            y: lineY(L, step.line) - L.lineH / 2,
            width: L.codeW,
            height: L.lineH,
            rx: 4,
            fill: colors.accent,
            opacity: 0.3,
          },
          svg,
        );
      }
      scene.lines.forEach((line, k) => {
        label(svg, L.codeX + line.indent * 4 * L.charW, lineY(L, k), line.text, { mono: true });
      });

      // 수 두 줄 — 빌린 칸, 주소를 잃은 덩이
      const used = scene.blocks.filter((b) => b.out).reduce((sum, b) => sum + b.cells.length, 0);
      const statY = L.codeTop + scene.lines.length * L.lineH + 16;
      label(svg, PAD, statY, t('stat.used', 'Borrowed cells: {n}', { n: used }), { fill: colors.textMuted });
      label(svg, PAD, statY + 24, t('stat.lost', 'Lost blocks: {n}', { n: scene.lost.length }), {
        fill: scene.lost.length > 0 ? colors.danger : colors.textMuted,
        weight: scene.lost.length > 0 ? '600' : '400',
        size: fontSizes.md,
      });

      // 이름 칸
      label(svg, L.stackX, 24, t('label.stack', 'Stack'), { fill: colors.textMuted });
      const cellPos = new Map<string, { x: number; y: number }>();
      scene.cells.forEach((c, k) => {
        const y = cellY(L, k);
        label(svg, L.stackX, y + L.cellH / 2, c.name, { mono: true, fill: c.ptr ? colors.text : colors.textMuted });
        el(
          'rect',
          { x: L.cellBoxX, y, width: L.cellBoxW, height: L.cellH, rx: 3, fill: colors.bg, stroke: colors.border },
          svg,
        );
        const v = label(svg, L.cellBoxX + L.cellBoxW / 2, y + L.cellH / 2, fmt(c.value), {
          mono: true,
          anchor: 'middle',
          fill: c.ptr ? colors.text : colors.textMuted,
        });
        h.cellVal.set(c.name, v);
        cellPos.set(c.name, { x: L.cellBoxX + L.cellBoxW, y: y + L.cellH / 2 });
      });

      // 빈 자리 목록
      label(svg, L.stackX, L.freeTop, t('label.free', 'Free list'), { fill: colors.textMuted });
      const slotY = L.freeTop + 14;
      el(
        'rect',
        {
          x: L.stackX,
          y: slotY,
          width: W * 0.2,
          height: 28,
          rx: 3,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '3 3',
        },
        svg,
      );
      scene.free.forEach((addr, k) => {
        const g = el('g', {}, svg);
        const x = L.stackX + 4 + k * (L.slotW + 4);
        el('rect', { x, y: slotY + 3, width: L.slotW, height: 22, rx: 3, fill: colors.bgSubtle, stroke: colors.border }, g);
        label(g, x + L.slotW / 2, slotY + 14, String(addr), { mono: true, anchor: 'middle' });
        if (k === 0) h.freeSlot = g;
      });

      // 힙 — 더미
      label(svg, L.heapX, 24, t('label.heap', 'Heap'), { fill: colors.textMuted });
      const bw = L.heapCellW * 2;
      const bh = L.pitch - 6;
      scene.blocks.forEach((b, k) => {
        const y = blockY(L, k);
        const st = blockStyle(scene, b);
        const g = el('g', {}, svg);
        const bwThis = L.heapCellW * b.cells.length;
        b.cells.forEach((v, j) => {
          el(
            'rect',
            {
              x: L.heapX + j * L.heapCellW,
              y,
              width: L.heapCellW,
              height: bh,
              fill: colors.bg,
              stroke: st.stroke,
              'stroke-width': b.out ? 1.8 : 1.2,
              ...(st.dash ? { 'stroke-dasharray': '4 3' } : {}),
            },
            g,
          );
          const tx = label(g, L.heapX + (j + 0.5) * L.heapCellW, y + bh / 2, fmt(v), {
            mono: true,
            anchor: 'middle',
            fill: st.ink,
          });
          h.heapCellText.set(b.addr + j, tx);
        });
        label(g, L.heapX + bwThis + 8, y + bh / 2, String(b.addr), {
          mono: true,
          fill: b.out && scene.lost.includes(b.addr) ? colors.danger : colors.textMuted,
        });
        h.blockG.set(b.addr, g);
      });
      // 새 땅 끝
      if (scene.newEnd !== null) {
        const y = blockY(L, scene.blocks.length - 1) - 4;
        el(
          'line',
          { x1: L.heapX - 6, y1: y, x2: L.heapX + bw + 6, y2: y, stroke: colors.textMuted, 'stroke-dasharray': '2 3' },
          svg,
        );
        label(svg, L.heapX + bw + 8, y - 8, t('label.newEnd', 'Fresh: {addr}', { addr: scene.newEnd }), {
          fill: colors.textMuted,
          size: fontSizes.xs,
        });
      }

      // 길 — 주소를 쥔 이름 칸에서 덩이로
      for (const c of scene.cells) {
        if (!c.ptr || c.value.k !== 'num') continue;
        const addr = c.value.n;
        const k = scene.blocks.findIndex((b) => b.addr === addr);
        const from = cellPos.get(c.name);
        if (k < 0 || !from) continue;
        const b = scene.blocks[k];
        const g = arrowPath(svg, from.x + 2, from.y, L.heapX - 2, blockY(L, k) + bh / 2, b.out ? colors.primary : colors.textMuted, !b.out);
        h.arrows.set(c.name, g);
      }

      label(svg, PAD, L.captionY, caption(scene), { size: fontSizes.md });
      return h;
    }

    function clock(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = performance.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const p = Math.min(1, (performance.now() - began) / ms);
          frame(ease(p));
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      });
    }

    /** 운동 — 정적 그리기가 세운 끝 자리를 두고, 아직 못 온 만큼으로 그린다. */
    async function move(scene: MemoryLeakScene, h: Handles, mine: number): Promise<void> {
      const s = scene.step;
      if (!s) return;
      const L = layout(scene.lines.length, scene.cells.length, scene.blocks.length);
      const bh = L.pitch - 6;
      const overlay = el('g', {}, svg);
      const frames: ((p: number) => void)[] = [];

      // 줄 표시가 앞 줄에서 미끄러져 온다
      if (h.marker && s.from !== null && s.from !== s.line) {
        const marker = h.marker;
        const dy = lineY(L, s.from) - lineY(L, s.line);
        frames.push((p) => marker.setAttribute('transform', `translate(0 ${r2(dy * (1 - p))})`));
      }

      const cellIndex = (name: string | null): number => scene.cells.findIndex((c) => c.name === name);
      const cellValPos = (k: number): { x: number; y: number } => ({
        x: L.cellBoxX + L.cellBoxW / 2,
        y: cellY(L, k) + L.cellH / 2,
      });

      function chip(text: string, from: { x: number; y: number }, to: { x: number; y: number }, a: number, b: number, color: string): void {
        const node = label(overlay, from.x, from.y, text, { mono: true, anchor: 'middle', fill: color, weight: '600' });
        node.setAttribute('opacity', '0');
        frames.push((p) => {
          const q = Math.max(0, Math.min(1, (p - a) / (b - a)));
          const on = p >= a && p < 1;
          node.setAttribute('opacity', on ? '1' : '0');
          node.setAttribute('x', String(r2(from.x + (to.x - from.x) * q)));
          node.setAttribute('y', String(r2(from.y + (to.y - from.y) * q)));
        });
      }

      function hideUntil(node: Element | undefined | null, at: number): void {
        if (!node) return;
        frames.push((p) => {
          if (p < at) node.setAttribute('opacity', '0');
          else node.removeAttribute('opacity');
        });
      }

      if (s.kind === 'alloc') {
        const k = scene.blocks.findIndex((b) => b.addr === s.addr);
        const g = h.blockG.get(s.addr);
        const ci = cellIndex(s.name);
        if (k >= 0 && g) {
          // 새 덩이가 위에서 떨어져 더미 꼭대기에 얹힌다
          const dy = L.dropTop - blockY(L, k);
          frames.push((p) => {
            const q = Math.min(1, p / 0.5);
            g.setAttribute('transform', `translate(0 ${r2(dy * (1 - q))})`);
          });
          if (ci >= 0) {
            const name = scene.cells[ci].name;
            hideUntil(h.cellVal.get(name), 1);
            hideUntil(h.arrows.get(name), 1);
            // 앞 덩이로 가던 길 — 주소가 덮이는 순간 끊긴다
            const was = s.was;
            if (was && was.k === 'num') {
              const wk = scene.blocks.findIndex((b) => b.addr === was.n);
              if (wk >= 0) {
                const pos = cellValPos(ci);
                const old = arrowPath(
                  overlay,
                  L.cellBoxX + L.cellBoxW + 2,
                  pos.y,
                  L.heapX - 2,
                  blockY(L, wk) + bh / 2,
                  colors.primary,
                  false,
                );
                frames.push((p) => {
                  if (p >= 0.5) old.setAttribute('opacity', '0');
                });
              }
            }
            // 옛 값은 칸에서 밀려 떨어진다
            if (was && was.k !== 'empty') {
              const pos = cellValPos(ci);
              const oldText = label(overlay, pos.x, pos.y, fmt(was), { mono: true, anchor: 'middle', fill: colors.textMuted });
              frames.push((p) => {
                const q = Math.max(0, (p - 0.5) / 0.5);
                oldText.setAttribute('y', String(r2(pos.y + 18 * q)));
                oldText.setAttribute('opacity', String(r2(1 - q)));
              });
            }
            // 새 주소가 덩이에서 이름 칸으로 건너온다
            chip(
              String(s.addr),
              { x: L.heapX + L.heapCellW * scene.blocks[k].cells.length + 20, y: blockY(L, k) + bh / 2 },
              cellValPos(ci),
              0.5,
              1,
              colors.primary,
            );
          }
        }
      } else if (s.kind === 'store' && s.value) {
        const ci = cellIndex(s.name);
        const at = s.addr;
        const k = scene.blocks.findIndex((b) => at >= b.addr && at < b.addr + b.cells.length);
        if (k >= 0) {
          const j = s.addr - scene.blocks[k].addr;
          const to = { x: L.heapX + (j + 0.5) * L.heapCellW, y: blockY(L, k) + bh / 2 };
          const from = ci >= 0 ? cellValPos(ci) : { x: L.codeX + L.codeW / 2, y: lineY(L, s.line) };
          hideUntil(h.heapCellText.get(s.addr), 1);
          chip(fmt(s.value), from, to, 0, 1, colors.text);
        }
      } else if (s.kind === 'free') {
        const ci = cellIndex(s.name);
        const from = ci >= 0 ? cellValPos(ci) : { x: L.codeX + L.codeW / 2, y: lineY(L, s.line) };
        const to = { x: L.stackX + 4 + L.slotW / 2, y: L.freeTop + 28 };
        hideUntil(h.freeSlot, 1);
        chip(String(s.addr), from, to, 0, 1, colors.text);
      }

      if (frames.length === 0) {
        overlay.remove();
        return;
      }
      await clock(MOVE_MS, mine, (p) => {
        for (const f of frames) f(p);
      });
    }

    function blank(): MemoryLeakScene {
      return { lines: [], cells: [], blocks: [], free: [], newEnd: null, lost: [], step: null };
    }

    drawStatic(blank());

    return {
      async render(next: MemoryLeakScene, _prev: MemoryLeakScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate || !next.step) return;
        await move(next, h, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
  },
};
