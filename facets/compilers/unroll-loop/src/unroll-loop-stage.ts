/**
 * unroll-loop 무대.
 *
 * 왼쪽은 프로그램, 오른쪽은 반복이 목록을 훑는 띠다. 띠의 위층은 반복 관리 — 마름모 하나가
 * 조건 셈 한 번, 호 하나가 올림 한 번. 아래층은 몸의 일 — 줄마다(벌 k) 그 벌이 읽는 칸에 점.
 *
 * 벌이 늘면 새 줄이 원본에서 떨어져 내려오고, 띠에서는 그 벌의 점 줄이 한 칸 옆으로 밀려 나온다.
 * 올림을 고치면 호가 네 칸으로 늘어나고 사라지는 마름모가 살아남는 마름모 쪽으로 모인다.
 * 나머지 줄은 반복 몸에서 빠져나와 반복 뒤에 붙고, 띠에서는 마지막 바퀴의 점이 빈 칸으로 건너간다.
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
} from '@ffacet/core/runtime';
import type { UnrollLoopScene, UnrollSceneLoop, UnrollTally } from './scene.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 450;
const FRAME_MS = 16;

function rd(v: number): number {
  return Math.round(v * 100) / 100 + 0;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(rd(v)) : v);
  parent.appendChild(node);
  return node;
}

type Geo = {
  w: number;
  codePx: number;
  smallPx: number;
  charW: number;
  codeTop: number;
  codeX: number;
  lh: number;
  split: number;
  x0: number;
  cellW: number;
  diamondY: number;
  cellsTop: number;
  cellH: number;
  rowsTop: number;
  rowGap: number;
  panelTop: number;
  panelRowH: number;
};

function geometry(scene: UnrollLoopScene): Geo {
  const w = PIECE_CANVAS_W;
  const codePx = parseFloat(fontSizes.sm);
  const smallPx = parseFloat(fontSizes.xs);
  const charW = codePx * 0.6;
  const codeTop = 44;
  const lh = Math.min(19, (H - 8 - codeTop) / Math.max(1, scene.lines.length));
  const split = Math.round(w * 0.44);
  const labelW = Math.min(72, Math.round(w * 0.11));
  const x0 = split + labelW;
  const loop = scene.loop;
  const slots = loop ? Math.max(1, loop.reach - loop.lo + 1, loop.hi - loop.lo + 1) : 1;
  const cellW = Math.min(40, (w - 8 - x0) / slots);
  const diamondY = 88;
  const cellsTop = 100;
  const cellH = 22;
  const rowsTop = cellsTop + cellH + 12;
  const rows = loop ? loop.factor : 1;
  const rowGap = Math.min(13, 56 / rows);
  const panelTop = rowsTop + rows * rowGap + 10;
  const panelRowH = Math.min(22, (H - 6 - panelTop) / 4);
  return {
    w,
    codePx,
    smallPx,
    charW,
    codeTop,
    codeX: 24,
    lh,
    split,
    x0,
    cellW,
    diamondY,
    cellsTop,
    cellH,
    rowsTop,
    rowGap,
    panelTop,
    panelRowH,
  };
}

type Handles = {
  lines: Map<string, { g: SVGGElement; top: number }>;
  marks: Map<string, SVGElement>;
  arcs: { from: number; to: number; path: SVGPathElement }[];
  bars: { rect: SVGRectElement; from: number; to: number }[];
  anim: SVGGElement;
};

export const unrollLoopStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const xAt = (g: Geo, loop: UnrollSceneLoop, i: number): number => g.x0 + (i - loop.lo + 0.5) * g.cellW;
    const rowY = (g: Geo, k: number): number => g.rowsTop + k * g.rowGap;

    function arcPath(x1: number, x2: number, y: number, cellW: number): string {
      const span = Math.max(1, Math.abs(x2 - x1) / cellW);
      const hgt = Math.min(22, 5 + 4 * span);
      const cx = (x1 + x2) / 2;
      const cy = y - 2 * hgt;
      const ang = Math.atan2(y - cy, x2 - cx);
      const hl = 5;
      const a1 = ang + Math.PI - 0.45;
      const a2 = ang + Math.PI + 0.45;
      return (
        `M${rd(x1)},${rd(y)} Q${rd(cx)},${rd(cy)} ${rd(x2)},${rd(y)} ` +
        `M${rd(x2 + hl * Math.cos(a1))},${rd(y + hl * Math.sin(a1))} L${rd(x2)},${rd(y)} ` +
        `L${rd(x2 + hl * Math.cos(a2))},${rd(y + hl * Math.sin(a2))}`
      );
    }

    function diamond(parent: Element, x: number, y: number, exit: boolean): SVGPolygonElement {
      const r = 5;
      return el(parent, 'polygon', {
        points: `${rd(x)},${rd(y - r)} ${rd(x + r)},${rd(y)} ${rd(x)},${rd(y + r)} ${rd(x - r)},${rd(y)}`,
        fill: exit ? 'none' : c.bg,
        stroke: exit ? c.textMuted : c.text,
        'stroke-width': 1.3,
        ...(exit ? { 'stroke-dasharray': '2 2' } : {}),
      });
    }

    function caption(scene: UnrollLoopScene): string {
      const st = scene.step;
      switch (st.kind) {
        case 'start':
          return scene.loop ? t('caption.start', 'One copy of the body per lap. Laps: {n}', { n: scene.loop.n }) : '';
        case 'copy':
          return t('caption.copy', 'Body copy {k} — reads {read}', { k: st.k + 1, read: st.read });
        case 'retune':
          return t('caption.retune', 'Bump: {bump} · Condition: {cond} · Left over: {rest}', {
            bump: st.bump,
            cond: st.cond,
            rest: st.rest,
          });
        case 'peel':
          return t('caption.peel', 'Leftover {k}/{rest} after the loop: {text}', {
            k: st.k + 1,
            rest: st.rest,
            text: st.text,
          });
        case 'compare':
          return t('caption.compare', 'Per call — loop upkeep: {before} → {after}', {
            before: st.before,
            after: st.after,
          });
      }
    }

    function focusIds(scene: UnrollLoopScene): Set<string> {
      const st = scene.step;
      if (st.kind === 'copy' || st.kind === 'peel') return new Set([st.id]);
      if (st.kind === 'retune') return new Set([st.condId, st.bumpId]);
      return new Set();
    }

    function drawCode(scene: UnrollLoopScene, g: Geo, h: Handles): void {
      const layer = el(svg, 'g', {});
      const focus = focusIds(scene);
      const copies = new Set(scene.copies);
      const tails = new Set(scene.tail.map((x) => x.id));
      scene.lines.forEach((line, j) => {
        const top = g.codeTop + j * g.lh;
        const row = el(layer, 'g', { transform: `translate(0,${rd(top)})` });
        if (focus.has(line.id)) {
          el(row, 'rect', { x: g.codeX - 7, y: 1, width: g.split - g.codeX - 4, height: g.lh - 2, fill: c.bgSubtle });
          el(row, 'rect', { x: g.codeX - 7, y: 1, width: 3, height: g.lh - 2, fill: c.accent });
        }
        if (copies.has(line.id)) {
          el(row, 'circle', { cx: 10, cy: g.lh / 2, r: 3.5, fill: c.primary });
        } else if (tails.has(line.id)) {
          el(row, 'rect', { x: 6, y: g.lh / 2 - 4, width: 8, height: 8, fill: c.accent, stroke: c.text, 'stroke-width': 1 });
        }
        const tx = el(row, 'text', {
          x: g.codeX + line.indent * 4 * g.charW,
          y: g.lh * 0.7,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        tx.textContent = line.text;
        h.lines.set(line.id, { g: row, top });
      });
    }

    /** 그릴 점 — 알고리즘이 보낸 반복 안의 읽기와 반복 뒤에 붙은 나머지. */
    function readsOf(scene: UnrollLoopScene): { k: number; cell: number; tail: boolean }[] {
      return [
        ...scene.sweep.reads.map(([k, cell]) => ({ k, cell, tail: false })),
        ...scene.tail.map((x) => ({ k: x.k, cell: x.at, tail: true })),
      ];
    }

    function drawStrip(scene: UnrollLoopScene, loop: UnrollSceneLoop, g: Geo, h: Handles): void {
      const layer = el(svg, 'g', {});
      const mono = { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted };
      const bumpLine = scene.lines.find((l) => l.id === loop.bumpId);
      if (bumpLine) el(layer, 'text', { x: g.split, y: g.diamondY - 18, ...mono }).textContent = bumpLine.text;
      el(layer, 'text', { x: g.split, y: g.diamondY + 4, ...mono }).textContent = scene.cond;
      el(layer, 'text', { x: g.split, y: g.cellsTop + g.cellH * 0.68, ...mono }).textContent = loop.list;
      scene.offsets.forEach((at, k) => {
        el(layer, 'text', { x: g.split, y: rowY(g, k) + 4, ...mono }).textContent = at;
      });

      const { starts, exit } = scene.sweep;
      const arcY = g.diamondY - 7;
      starts.forEach((i, j) => {
        const to = starts[j + 1] ?? exit;
        const path = el(layer, 'path', {
          d: arcPath(xAt(g, loop, i), xAt(g, loop, to), arcY, g.cellW),
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.2,
          'stroke-linecap': 'round',
        });
        h.arcs.push({ from: i, to, path });
      });
      for (const i of starts) diamond(layer, xAt(g, loop, i), g.diamondY, false);
      diamond(layer, xAt(g, loop, exit), g.diamondY, true);

      const reads = readsOf(scene);
      const readCells = new Set(reads.map((r) => r.cell));
      for (let cell = loop.lo; cell < loop.hi; cell += 1) {
        const x = xAt(g, loop, cell);
        const unread = !readCells.has(cell);
        el(layer, 'rect', {
          x: x - g.cellW / 2 + 1,
          y: g.cellsTop,
          width: g.cellW - 2,
          height: g.cellH,
          rx: 2,
          fill: unread ? c.bgSubtle : c.bg,
          stroke: unread ? c.textMuted : c.border,
          'stroke-width': 1,
          ...(unread ? { 'stroke-dasharray': '3 2' } : {}),
        });
        const num = el(layer, 'text', {
          x,
          y: g.cellsTop + g.cellH * 0.68,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        num.textContent = String(cell);
      }

      const r = Math.min(4, g.cellW * 0.18);
      for (const m of reads) {
        const x = xAt(g, loop, m.cell);
        const y = rowY(g, m.k);
        const node = m.tail
          ? el(layer, 'rect', {
              x: x - r,
              y: y - r,
              width: 2 * r,
              height: 2 * r,
              fill: c.accent,
              stroke: c.text,
              'stroke-width': 1,
            })
          : el(layer, 'circle', { cx: x, cy: y, r, fill: c.primary });
        h.marks.set(`${m.tail ? 'tail' : 'loop'}:${m.k}:${m.cell}`, node);
      }
    }

    function drawPanel(tally: UnrollTally, g: Geo, h: Handles): void {
      const layer = el(svg, 'g', {});
      const rows: { label: string; v: [number, number] }[] = [
        { label: t('label.lines', 'Program lines'), v: tally.lines },
        { label: t('label.checks', 'Condition checks'), v: tally.checks },
        { label: t('label.bumps', 'Bumps'), v: tally.bumps },
        { label: t('label.adds', 'Additions'), v: tally.adds },
      ];
      const max = Math.max(1, ...rows.flatMap((x) => x.v));
      const bx = g.split + 106;
      const bLen = g.w - 70 - bx;
      const bh = Math.min(10, g.panelRowH * 0.5);
      rows.forEach((row, j) => {
        const y = g.panelTop + j * g.panelRowH;
        const mid = y + g.panelRowH / 2;
        el(layer, 'text', {
          x: g.split,
          y: mid + 4,
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        }).textContent = row.label;
        const wb = (row.v[0] / max) * bLen;
        const wa = (row.v[1] / max) * bLen;
        el(layer, 'rect', {
          x: bx,
          y: mid - bh / 2,
          width: wb,
          height: bh,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 2',
        });
        const rect = el(layer, 'rect', { x: bx, y: mid - bh / 2, width: wa, height: bh, fill: c.primary });
        h.bars.push({ rect, from: wb, to: wa });
        el(layer, 'text', {
          x: g.w - 8,
          y: mid + 4,
          'text-anchor': 'end',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }).textContent = t('value.change', '{before} → {after}', { before: row.v[0], after: row.v[1] });
      });
    }

    function drawStatic(scene: UnrollLoopScene): { g: Geo; h: Handles } {
      svg.textContent = '';
      const g = geometry(scene);
      const anim = document.createElementNS(NS, 'g');
      const h: Handles = { lines: new Map(), marks: new Map(), arcs: [], bars: [], anim };
      const cap = el(svg, 'text', {
        x: 8,
        y: 22,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      cap.textContent = caption(scene);
      drawCode(scene, g, h);
      if (scene.loop) drawStrip(scene, scene.loop, g, h);
      if (scene.tally) drawPanel(scene.tally, g, h);
      svg.appendChild(anim);
      return { g, h };
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return wake();
          const raw = Math.min(1, (Date.now() - start) / MOVE_MS);
          frame(1 - (1 - raw) * (1 - raw));
          if (raw >= 1) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 줄들이 아직 못 온 만큼 비켜 선 채로 시작한다. 새 줄은 원본 자리에서, 아래 줄들은 한 줄 위에서. */
    function lineMoves(
      scene: UnrollLoopScene,
      g: Geo,
      h: Handles,
      id: string,
      from: string,
      dx0: number,
    ): ((p: number) => void)[] {
      const at = scene.lines.findIndex((l) => l.id === id);
      const src = scene.lines.findIndex((l) => l.id === from);
      const out: ((p: number) => void)[] = [];
      scene.lines.forEach((line, j) => {
        const hd = h.lines.get(line.id);
        if (!hd || j < at) return;
        const dx = j === at ? dx0 : 0;
        const dy = j === at ? (src - at) * g.lh : -g.lh;
        out.push((p) => hd.g.setAttribute('transform', `translate(${rd(dx * (1 - p))},${rd(hd.top + dy * (1 - p))})`));
      });
      return out;
    }

    async function animateStep(mine: number, next: UnrollLoopScene, g: Geo, h: Handles): Promise<void> {
      const st = next.step;
      const loop = next.loop;
      const moves: ((p: number) => void)[] = [];
      if (st.kind === 'copy' && loop) {
        moves.push(...lineMoves(next, g, h, st.id, st.from, 0));
        for (const [key, node] of h.marks) {
          if (!key.startsWith(`loop:${st.k}:`)) continue;
          const dx = -loop.s * g.cellW;
          const dy = -g.rowGap;
          moves.push((p) => node.setAttribute('transform', `translate(${rd(dx * (1 - p))},${rd(dy * (1 - p))})`));
        }
      } else if (st.kind === 'retune' && loop) {
        const was = st.was;
        const now = next.sweep;
        const keep = [...now.starts, now.exit];
        const arcY = g.diamondY - 7;
        for (const a of h.arcs) {
          const x1 = xAt(g, loop, a.from);
          const j = was.starts.indexOf(a.from);
          const xs = j < 0 ? x1 : xAt(g, loop, was.starts[j + 1] ?? was.exit);
          const xe = xAt(g, loop, a.to);
          moves.push((p) => a.path.setAttribute('d', arcPath(x1, xs + (xe - xs) * p, arcY, g.cellW)));
        }
        for (const i of [...was.starts, was.exit]) {
          if (keep.includes(i)) continue;
          const target = Math.max(...keep.filter((v) => v <= i));
          const xa = xAt(g, loop, i);
          const xb = xAt(g, loop, target);
          const ghost = diamond(h.anim, 0, g.diamondY, i === was.exit);
          moves.push((p) => {
            ghost.setAttribute('transform', `translate(${rd(xa + (xb - xa) * p)},0)`);
            ghost.setAttribute('opacity', String(rd(1 - p)));
          });
        }
        const r = Math.min(4, g.cellW * 0.18);
        const stays = new Set(now.reads.map(([k, cell]) => `${k}:${cell}`));
        for (const [k, cell] of was.reads) {
          if (stays.has(`${k}:${cell}`)) continue;
          const dot = el(h.anim, 'circle', { cx: xAt(g, loop, cell), cy: rowY(g, k), r, fill: c.primary });
          moves.push((p) => dot.setAttribute('opacity', String(rd(1 - p))));
        }
      } else if (st.kind === 'peel' && loop) {
        const line = next.lines.find((l) => l.id === st.id);
        const dx0 = line ? (st.fromIndent - line.indent) * 4 * g.charW : 0;
        moves.push(...lineMoves(next, g, h, st.id, st.from, dx0));
        const tail = next.tail.find((x) => x.id === st.id);
        const node = tail ? h.marks.get(`tail:${tail.k}:${tail.at}`) : undefined;
        if (tail && node) {
          const dx = (tail.was - tail.at) * g.cellW;
          moves.push((p) => node.setAttribute('transform', `translate(${rd(dx * (1 - p))},0)`));
        }
      } else if (st.kind === 'compare') {
        for (const b of h.bars) moves.push((p) => b.rect.setAttribute('width', String(rd(b.from + (b.to - b.from) * p))));
      }
      if (moves.length === 0) return;
      const frame = (p: number): void => {
        for (const m of moves) m(p);
      };
      frame(0);
      await tween(mine, frame);
    }

    return {
      async render(next: UnrollLoopScene, prev: UnrollLoopScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const { g, h } = drawStatic(next);
        if (!opts.animate || !prev) return;
        await animateStep(mine, next, g, h);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
