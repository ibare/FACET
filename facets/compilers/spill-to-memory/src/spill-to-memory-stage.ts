/**
 * spill-to-memory 무대.
 *
 * 왼쪽은 명령 열 — 끼어든 줄이 들어서면 그 아래 줄이 한 칸씩 밀려 내려간다.
 * 오른쪽 위는 레지스터, 아래는 스택 칸(메모리). 값 조각이 그 사이를 오간다:
 * 넘치는 줄에서 가장 늦게 읽힐 값이 레지스터에서 스택 칸으로 내려가고, 제가 읽힐 줄 앞에서
 * 스택 칸에서 빈 레지스터로 올라온다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatInstr, formatReload, formatSpill } from './algorithm.js';
import { shownRows, type ShownRow, type SpillScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 걸음 운동 — 레지스터만 오가는 줄 */
const MOVE_MS = 400;
/** 메모리를 오가는 걸음 (밀어냄 · 되불러옴) — 두 동작을 한 시계로 */
const TRIP_MS = 700;

type Point = { x: number; y: number };

type Layout = {
  pad: number;
  codeX: number;
  codeW: number;
  rightX: number;
  rightW: number;
  rowsTop: number;
  rowH: number;
  regTop: number;
  regH: number;
  regW: number;
  regGap: number;
  stackTop: number;
  stackH: number;
  cellW: number;
  chipW: number;
  chipH: number;
};

function layoutOf(scene: SpillScene, rows: number): Layout {
  const W = PIECE_CANVAS_W;
  const pad = 16;
  const codeX = pad;
  const codeW = Math.round((W - 2 * pad) * 0.46);
  const rightX = codeX + codeW + 24;
  const rightW = W - pad - rightX;
  const rowsTop = 36;
  const rowsBottom = 296;
  const rowH = Math.min(24, (rowsBottom - rowsTop) / Math.max(1, rows));
  const regGap = 12;
  const regW = (rightW - (scene.k - 1) * regGap) / scene.k;
  const cells = Math.max(1, scene.stack.length);
  const cellW = Math.min(regW, (rightW - 8 - cells * 8) / cells);
  const chipW = Math.min(56, cellW - 12);
  return {
    pad,
    codeX,
    codeW,
    rightX,
    rightW,
    rowsTop,
    rowH,
    regTop: 36,
    regH: 74,
    regW,
    regGap,
    stackTop: 176,
    stackH: 84,
    cellW,
    chipW,
    chipH: 24,
  };
}

function regBox(L: Layout, i: number): { x: number; y: number; w: number; h: number } {
  return { x: L.rightX + i * (L.regW + L.regGap), y: L.regTop, w: L.regW, h: L.regH };
}

function regChip(L: Layout, i: number): Point {
  const b = regBox(L, i);
  return { x: b.x + b.w / 2, y: b.y + 38 };
}

function cellBox(L: Layout, i: number): { x: number; y: number; w: number; h: number } {
  return { x: L.rightX + 8 + i * (L.cellW + 8), y: L.stackTop + 10, w: L.cellW, h: L.stackH - 18 };
}

function cellChip(L: Layout, i: number): Point {
  const b = cellBox(L, i);
  return { x: b.x + b.w / 2, y: b.y + 32 };
}

function rowCenter(L: Layout, i: number): number {
  return L.rowsTop + i * L.rowH + L.rowH / 2;
}

function regNo(reg: string): number {
  const m = /^r(\d+)$/.exec(reg);
  if (m === null) throw new Error(`spill-to-memory 무대: 모르는 레지스터 ${reg}`);
  return Number(m[1]) - 1;
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

/** 구간 [a, b] 안에서의 진행 */
function span(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}

function rowKey(row: ShownRow): string {
  switch (row.kind) {
    case 'orig':
    case 'pending':
      return `L${row.line}`;
    case 'spill':
      return `S${row.slot}`;
    case 'reload':
      return `R${row.slot}-${row.v}`;
  }
}

function rowText(scene: SpillScene, row: ShownRow): string {
  switch (row.kind) {
    case 'orig': {
      const ins = scene.program[row.line - 1];
      if (ins === undefined) throw new Error(`spill-to-memory 무대: L${row.line} 이 없다`);
      return formatInstr(ins, row.names, row.line);
    }
    case 'pending': {
      const ins = scene.program[row.line - 1];
      if (ins === undefined) throw new Error(`spill-to-memory 무대: L${row.line} 이 없다`);
      return formatInstr(ins, null, row.line);
    }
    case 'spill':
      return formatSpill(row.slot, row.reg);
    case 'reload':
      return formatReload(row.slot, row.reg);
  }
}

type Handles = {
  rows: SVGGElement[];
  chips: Map<string, SVGGElement>;
  overlay: SVGGElement;
  layout: Layout;
};

export const spillToMemoryStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, val] of Object.entries(attrs)) {
        node.setAttribute(key, typeof val === 'number' ? String(round(val)) : val);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opts.fill ?? colors.text,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    /** 값마다 정해진 색 — 정의한 차례로 */
    function valueColor(scene: SpillScene, v: string): string {
      const defs = scene.program.flatMap((ins) => (ins.dst === null ? [] : [ins.dst]));
      const i = defs.indexOf(v);
      if (i < 0) throw new Error(`spill-to-memory 무대: 정의 없는 값 ${v}`);
      const pal = categorical(defs.length, 'pastel');
      const c = pal[i];
      if (c === undefined) throw new Error(`spill-to-memory 무대: ${v} 의 색이 없다`);
      return c;
    }

    /** 값 조각 — 가운데가 (0,0). 아래에 마지막 읽기 꼬리표 */
    function chip(
      parent: Element,
      scene: SpillScene,
      L: Layout,
      at: Point,
      v: string,
      last: number | null,
      hot: boolean,
    ): SVGGElement {
      const g = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` }, parent);
      el(
        'rect',
        {
          x: -L.chipW / 2,
          y: -L.chipH / 2,
          width: L.chipW,
          height: L.chipH,
          rx: 5,
          fill: valueColor(scene, v),
          stroke: hot ? colors.accent : 'none',
          'stroke-width': hot ? 2 : 0,
        },
        g,
      );
      label(g, 0, 1, v, { mono: true, anchor: 'middle', fill: colors.stateInk, weight: '600' });
      if (last !== null) {
        label(g, 0, L.chipH / 2 + 12, t('label.last', 'last read: L{line}', { line: last }), {
          size: fontSizes.xs,
          anchor: 'middle',
          fill: hot ? colors.text : colors.textMuted,
        });
      }
      return g;
    }

    function captionOf(scene: SpillScene): { main: string; sub: string | null } {
      const step = scene.step;
      const trips = scene.out.filter((r) => r.kind !== 'orig').length;
      const inserted = trips > 0 ? t('sub.inserted', 'Lines inserted: {n}', { n: trips }) : null;
      if (step.kind === 'start') {
        return { main: t('caption.start', 'Registers: {k}. Assigning them from L1, line by line.', { k: scene.k }), sub: null };
      }
      if (step.kind === 'reload') {
        return {
          main: t('caption.reload', 'Before L{line}: {v} is read here, so [sp+{slot}] → {reg}.', {
            line: step.before,
            v: step.v,
            slot: step.slot,
            reg: step.reg,
          }),
          sub: inserted,
        };
      }
      let main: string;
      if (step.spill !== null && step.got !== null) {
        main = t(
          'caption.spill',
          'L{line}: no free register for {v}. Read last: {victim} (L{last}) → [sp+{slot}], then {reg} → {v}.',
          {
            line: step.line,
            v: step.got.v,
            victim: step.spill.v,
            last: step.spill.last,
            slot: step.spill.slot,
            reg: step.spill.reg,
          },
        );
      } else if (step.freed.length > 0 && step.got !== null) {
        main = t('caption.freeGet', 'L{line}: last read of {freed}, register freed. {v} → {reg}.', {
          line: step.line,
          freed: step.freed.map((f) => f.v).join(' · '),
          v: step.got.v,
          reg: step.got.reg,
        });
      } else if (step.freed.length > 0) {
        main = t('caption.free', 'L{line}: last read of {freed}, register freed.', {
          line: step.line,
          freed: step.freed.map((f) => f.v).join(' · '),
        });
      } else if (step.got !== null) {
        main = t('caption.get', 'L{line}: {v} → {reg}.', { line: step.line, v: step.got.v, reg: step.got.reg });
      } else {
        // 새 값도 풀린 값도 없는 줄 — 읽기만 하고, 읽은 값은 뒤에서 또 읽혀 레지스터에 남는다
        const ins = scene.program[step.line - 1];
        if (ins === undefined) throw new Error(`spill-to-memory 무대: L${step.line} 이 없다`);
        if (ins.srcs.length === 0) throw new Error(`spill-to-memory 무대: L${step.line} 은 읽지도 정의하지도 않는다`);
        main = t('caption.keep', 'L{line}: {used} still read later, register kept.', {
          line: step.line,
          used: [...new Set(ins.srcs)].join(' · '),
        });
      }
      let sub: string | null = inserted;
      if (step.spill !== null) {
        sub = t('sub.cands', 'Last reads compared — {cands}', {
          cands: step.spill.cands.map((c) => `${c.v} L${c.last}`).join(' · '),
        });
      } else if (step.line === scene.program.length) {
        sub = t(
          'sub.done',
          'Lines: {from} → {to} · memory trips: {trips} · most live at once: {peak}, registers: {k}',
          { from: scene.program.length, to: scene.out.length, trips, peak: scene.peak, k: scene.k },
        );
      }
      return { main, sub };
    }

    function drawStatic(scene: SpillScene): Handles {
      svg.textContent = '';
      const rows = shownRows(scene);
      const L = layoutOf(scene, rows.length);
      const step = scene.step;
      const root = el('g', {}, svg);

      // ── 명령 열 ──
      label(root, L.codeX, 20, t('label.program', 'Instructions'), { fill: colors.textMuted, size: fontSizes.xs, weight: '600' });
      const current =
        step.kind === 'line' ? step.at : step.kind === 'reload' ? step.inserted : -1;
      const rowEls: SVGGElement[] = [];
      rows.forEach((row, i) => {
        const cy = rowCenter(L, i);
        const g = el('g', { 'data-row': rowKey(row) }, root);
        const inserted = row.kind === 'spill' || row.kind === 'reload';
        if (i === current || inserted) {
          el(
            'rect',
            {
              x: L.codeX,
              y: cy - L.rowH / 2 + 1,
              width: L.codeW,
              height: L.rowH - 2,
              rx: 3,
              fill: i === current ? colors.bgSubtle : 'none',
              stroke: i === current ? colors.border : 'none',
            },
            g,
          );
        }
        if (inserted) {
          el('rect', { x: L.codeX, y: cy - L.rowH / 2 + 2, width: 3, height: L.rowH - 4, fill: colors.accent }, g);
          label(g, L.codeX + L.codeW - 6, cy, row.kind === 'spill' ? t('label.spill', 'spill') : t('label.reload', 'reload'), {
            size: fontSizes.xs,
            anchor: 'end',
            fill: colors.textMuted,
          });
        }
        const gutter = row.kind === 'orig' || row.kind === 'pending' ? `L${row.line}` : '+';
        label(g, L.codeX + 10, cy, gutter, { mono: true, size: fontSizes.xs, fill: colors.textMuted });
        label(g, L.codeX + 40, cy, rowText(scene, row), {
          mono: true,
          size: fontSizes.sm,
          fill: row.kind === 'pending' ? colors.textMuted : colors.text,
          weight: i === current ? '600' : '400',
        });
        rowEls.push(g);
      });

      // ── 레지스터 ──
      label(root, L.rightX, 20, t('label.registers', 'Registers'), { fill: colors.textMuted, size: fontSizes.xs, weight: '600' });
      const chips = new Map<string, SVGGElement>();
      const hotReg =
        step.kind === 'reload' ? regNo(step.reg) : step.kind === 'line' && step.got !== null ? regNo(step.got.reg) : -1;
      scene.regs.forEach((held, i) => {
        const b = regBox(L, i);
        el(
          'rect',
          {
            x: b.x,
            y: b.y,
            width: b.w,
            height: b.h,
            rx: 6,
            fill: colors.bg,
            stroke: i === hotReg ? colors.primary : colors.border,
            'stroke-width': i === hotReg ? 2 : 1,
          },
          root,
        );
        label(root, b.x + 8, b.y + 12, `r${i + 1}`, { mono: true, size: fontSizes.xs, fill: colors.textMuted, weight: '600' });
        if (held === null) {
          label(root, b.x + b.w / 2, b.y + 38, t('label.empty', 'empty'), {
            anchor: 'middle',
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
        } else {
          const hot = step.kind === 'line' && step.spill !== null;
          chips.set(`reg:${held.v}`, chip(root, scene, L, regChip(L, i), held.v, held.last, hot));
        }
      });

      // 산 값 수 — 레지스터 수를 넘으면 붉게
      const over = scene.live > scene.k;
      label(root, L.rightX, L.regTop + L.regH + 22, t('label.pressure', 'Live values: {n} · registers: {k}', { n: scene.live, k: scene.k }), {
        size: fontSizes.sm,
        fill: over ? colors.danger : colors.textMuted,
        weight: over ? '600' : '400',
      });

      // ── 스택 칸 (메모리) ──
      label(root, L.rightX, L.stackTop - 6, t('label.stack', 'Stack slots (memory)'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        weight: '600',
      });
      el(
        'rect',
        { x: L.rightX, y: L.stackTop, width: L.rightW, height: L.stackH, rx: 6, fill: colors.bgSubtle, stroke: colors.border },
        root,
      );
      scene.stack.forEach((cell, i) => {
        const b = cellBox(L, i);
        const hot =
          (step.kind === 'line' && step.spill?.slot === cell.slot) || (step.kind === 'reload' && step.slot === cell.slot);
        el(
          'rect',
          {
            x: b.x,
            y: b.y,
            width: b.w,
            height: b.h,
            rx: 4,
            fill: colors.bg,
            stroke: hot ? colors.accent : colors.border,
            'stroke-width': hot ? 2 : 1,
          },
          root,
        );
        label(root, b.x + 6, b.y + 11, `[sp+${cell.slot}]`, { mono: true, size: fontSizes.xs, fill: colors.textMuted });
        const at = cellChip(L, i);
        if (cell.back) {
          // 되불려 간 뒤 — 칸에는 베낀 흔적만 남는다
          el(
            'rect',
            {
              x: at.x - L.chipW / 2,
              y: at.y - L.chipH / 2,
              width: L.chipW,
              height: L.chipH,
              rx: 5,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-dasharray': '3 3',
            },
            root,
          );
          label(root, at.x, at.y + 1, cell.v, { mono: true, anchor: 'middle', fill: colors.textMuted });
        } else {
          const last = step.kind === 'line' && step.spill?.slot === cell.slot ? step.spill.last : null;
          chips.set(`stack:${cell.v}`, chip(root, scene, L, at, cell.v, last, hot));
        }
      });

      // ── 캡션 ──
      const cap = captionOf(scene);
      // 긴 번역은 한 단계 작은 글자로 폭 안에 담는다 (글자 폭은 토큰 크기에서 어림)
      const capW = PIECE_CANVAS_W - 2 * L.pad;
      const fits = cap.main.length * parseFloat(fontSizes.md) * 0.56 <= capW;
      label(root, L.pad, 318, cap.main, { size: fits ? fontSizes.md : fontSizes.sm });
      if (cap.sub !== null) label(root, L.pad, 342, cap.sub, { size: fontSizes.sm, fill: colors.textMuted });

      const overlay = el('g', {}, svg);
      return { rows: rowEls, chips, overlay, layout: L };
    }

    function clock(ms: number, frame: (p: number) => void, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        let start: number | null = null;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return wake();
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(p);
          if (p >= 1) return wake();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    function place(g: SVGGElement, at: Point, dx: number, dy: number, opacity: number | null): void {
      g.setAttribute('transform', `translate(${round(at.x + dx)},${round(at.y + dy)})`);
      if (opacity === null) g.removeAttribute('opacity');
      else g.setAttribute('opacity', String(round(opacity)));
    }

    /** 이번 걸음의 운동 — 요소는 끝 자리에 서 있고, 아직 못 온 만큼 비켜 그린다 */
    function motion(scene: SpillScene, h: Handles): { ms: number; frame: (p: number) => void } | null {
      const step = scene.step;
      const L = h.layout;
      if (step.kind === 'start') return null;

      const insertedAt = step.inserted;
      const trip = insertedAt !== null;
      const ms = trip ? TRIP_MS : MOVE_MS;

      // 끼어든 줄 — 그 아래 줄들이 한 칸 밀려 내려간다
      const shiftRows = (p: number): void => {
        if (insertedAt === null) return;
        const e = span(p, 0, 0.5);
        h.rows.forEach((g, i) => {
          if (i > insertedAt) {
            g.setAttribute('transform', `translate(0,${round(-L.rowH * (1 - e))})`);
          } else if (i === insertedAt) {
            g.setAttribute('transform', `translate(${round(24 * (1 - e))},0)`);
            g.setAttribute('opacity', String(round(e)));
          }
        });
      };

      if (step.kind === 'reload') {
        const g = h.chips.get(`reg:${step.v}`);
        const cellIdx = scene.stack.findIndex((c) => c.slot === step.slot);
        if (g === undefined || cellIdx < 0) throw new Error(`spill-to-memory 무대: 되불러올 ${step.v} 가 없다`);
        const to = regChip(L, regNo(step.reg));
        const from = cellChip(L, cellIdx);
        return {
          ms,
          frame: (p) => {
            shiftRows(p);
            const e = span(p, 0.15, 1);
            place(g, to, (from.x - to.x) * (1 - e), (from.y - to.y) * (1 - e), p >= 1 ? null : 1);
          },
        };
      }

      // 원래 줄 하나
      const rowY = rowCenter(L, step.at);
      const rowFrom: Point = { x: L.codeX + L.codeW - 36, y: rowY };
      const ghosts = step.freed.map((f) => {
        const at = regChip(L, regNo(f.reg));
        return { at, g: chip(h.overlay, scene, L, at, f.v, null, false) };
      });
      let victim: { g: SVGGElement; from: Point; to: Point } | null = null;
      if (step.spill !== null) {
        const spill = step.spill;
        const g = h.chips.get(`stack:${spill.v}`);
        const cellIdx = scene.stack.findIndex((c) => c.slot === spill.slot);
        if (g === undefined || cellIdx < 0) throw new Error(`spill-to-memory 무대: 밀어낸 ${spill.v} 가 없다`);
        victim = { g, from: regChip(L, regNo(spill.reg)), to: cellChip(L, cellIdx) };
      }
      const arrive = step.got === null ? undefined : h.chips.get(`reg:${step.got.v}`);
      const arriveTo = step.got === null ? null : regChip(L, regNo(step.got.reg));
      const arriveFrom = step.spill !== null ? 0.5 : step.freed.length > 0 ? 0.35 : 0;

      return {
        ms,
        frame: (p) => {
          shiftRows(p);
          // 풀린 값 — 레지스터를 떠나 사라진다
          const ef = span(p, 0, 0.5);
          for (const gh of ghosts) place(gh.g, gh.at, 0, -14 * ef, 1 - ef);
          // 밀려난 값 — 레지스터에서 스택 칸으로 내려간다
          if (victim !== null) {
            const e = span(p, 0, 0.5);
            place(victim.g, victim.to, (victim.from.x - victim.to.x) * (1 - e), (victim.from.y - victim.to.y) * (1 - e), p >= 1 ? null : 1);
          }
          // 새 값 — 그 줄에서 나와 레지스터로 들어간다
          if (arrive !== undefined && arriveTo !== null) {
            const e = span(p, arriveFrom, 1);
            const shown = p < arriveFrom ? 0 : 1;
            place(arrive, arriveTo, (rowFrom.x - arriveTo.x) * (1 - e), (rowFrom.y - arriveTo.y) * (1 - e), p >= 1 ? null : shown);
          }
        },
      };
    }

    async function render(next: SpillScene, prev: SpillScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || prev === null) return;
      const m = motion(next, h);
      if (m === null) return;
      m.frame(0);
      await clock(m.ms, m.frame, mine);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
