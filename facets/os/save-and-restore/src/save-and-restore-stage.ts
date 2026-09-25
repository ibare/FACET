/**
 * 그림 — 움직이는 것은 수다.
 *
 * 두 프로그램의 줄이 양옆에 서고, 가운데 CPU 에 칸 둘(pc · r)이 있다. 각 프로그램 밑에 제 기록이 있다.
 * - 줄을 밟으면 칸의 수가 굴러 바뀌고, 줄 곁의 손가락이 다음 줄로 내려간다
 * - 적기: CPU 칸의 수가 복제되어 제 기록 칸으로 날아가 앉는다 (CPU 칸의 수는 남는다)
 * - 꺼내기: 기록 칸의 수가 CPU 칸으로 날아 들어오고, 칸에 있던 남의 수는 밀려 떨어진다
 * - 기록의 pc 는 그 프로그램의 줄 번호 둘레에 테로 남는다 — 적어 둔 "하던 자리"
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SaveAndRestoreScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 500;

const MARGIN = 16;
const GAP = 20;
const CPU_W_MAX = 150;
const CELL_W = 56;
const CELL_GAP = 8;
const CAPTION_Y = 28;
const TITLE_Y = 64;
const ROW_TOP = 90;
const ROW_H_MAX = 24;
const REC_TOP = 234;

type Geo = {
  colX: number[];
  colW: number;
  cpuX: number;
  cpuW: number;
  rowH: number;
};

function round(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function geometry(nProgs: number, maxRows: number): Geo {
  const cpuW = Math.min(CPU_W_MAX, PIECE_CANVAS_W * 0.25);
  const colW = (PIECE_CANVAS_W - 2 * MARGIN - cpuW - 2 * GAP) / 2;
  const cpuX = MARGIN + colW + GAP;
  const colX = [MARGIN, cpuX + cpuW + GAP];
  if (nProgs > colX.length) throw new Error(`그림: 프로그램은 둘까지 놓인다 — ${nProgs}`);
  const room = REC_TOP - 12 - ROW_TOP;
  const rowH = Math.min(ROW_H_MAX, room / Math.max(1, maxRows));
  return { colX, colW, cpuX, cpuW, rowH };
}

function rowY(g: Geo, row: number): number {
  return round(ROW_TOP + g.rowH * (row + 0.5));
}

/** 칸 둘의 가운데 x — 0 은 pc, 1 은 r. 상자 가운데를 기준으로 좌우에 놓인다 */
function cellCx(boxX: number, boxW: number, which: 0 | 1): number {
  const mid = boxX + boxW / 2;
  return round(which === 0 ? mid - CELL_GAP / 2 - CELL_W / 2 : mid + CELL_GAP / 2 + CELL_W / 2);
}

const CPU_CELL_Y = 160;
const REC_CELL_Y = REC_TOP + 52;
const CELL_H = 32;

export const saveAndRestoreStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    svg.textContent = '';
    const base = document.createElementNS(SVG_NS, 'g');
    const fx = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(base);
    svg.appendChild(fx);

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      attrs: Record<string, string | number> = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: round(x),
        y: round(y),
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: pal.text,
        'dominant-baseline': 'middle',
        ...attrs,
      });
      node.textContent = text;
      return node;
    }

    function progName(id: string): string {
      if (id === 'a') return tr('label.a', 'A');
      if (id === 'b') return tr('label.b', 'B');
      throw new Error(`그림: 프로그램 ${id} 의 이름 문안이 없다`);
    }

    function colorsOf(scene: SaveAndRestoreScene): Map<string, string> {
      const hues = categorical(scene.programs.length, 'vivid');
      const out = new Map<string, string>();
      scene.programs.forEach((p, i) => {
        const c = hues[i];
        if (c === undefined) throw new Error(`그림: ${p.id} 의 색이 없다`);
        out.set(p.id, c);
      });
      return out;
    }

    function geoOf(scene: SaveAndRestoreScene): Geo {
      const maxRows = Math.max(...scene.programs.map((p) => p.lines.length + 1));
      return geometry(scene.programs.length, maxRows);
    }

    function progIndex(scene: SaveAndRestoreScene, id: string): number {
      const i = scene.programs.findIndex((p) => p.id === id);
      if (i < 0) throw new Error(`그림: 프로그램 ${id} 가 없다`);
      return i;
    }

    function linesOf(scene: SaveAndRestoreScene, i: number): number {
      const p = scene.programs[i];
      if (p === undefined) throw new Error(`그림: 프로그램 자리 ${i} 가 없다`);
      return p.lines.length;
    }

    function colXOf(g: Geo, i: number): number {
      const x = g.colX[i];
      if (x === undefined) throw new Error(`그림: 자리 ${i} 가 없다`);
      return x;
    }

    /** 손가락이 설 줄 — pc 가 줄 수를 넘으면 마지막 줄 다음 칸 */
    function pointerRow(lines: number, pc: number): number {
      return Math.min(pc, lines + 1) - 1;
    }

    function pointerPath(x: number, y: number): string {
      return `M${round(x - 5)},${round(y - 6)} L${round(x + 5)},${round(y)} L${round(x - 5)},${round(y + 6)} Z`;
    }

    function caption(scene: SaveAndRestoreScene): string {
      const s = scene.step;
      if (s.kind === 'start') {
        return tr('caption.start', 'Running on the CPU: {name}', { name: progName(scene.cpu.of) });
      }
      if (s.kind === 'run') {
        if (s.shown !== null) {
          return tr('caption.show', '{name}, line {line} — shown: {value} · pc {pc0} → {pc1}', {
            name: progName(s.prog),
            line: s.line,
            value: s.shown,
            pc0: s.before.pc,
            pc1: scene.cpu.pc,
          });
        }
        return tr('caption.run', '{name}, line {line} — r {r0} → {r1} · pc {pc0} → {pc1}', {
          name: progName(s.prog),
          line: s.line,
          r0: s.before.r,
          r1: scene.cpu.r,
          pc0: s.before.pc,
          pc1: scene.cpu.pc,
        });
      }
      if (s.kind === 'save') {
        const rec = scene.records.find((x) => x.id === s.prog);
        if (rec === undefined || rec.cells === null) throw new Error(`그림: ${s.prog} 의 기록이 비었다`);
        return tr('caption.save', 'Save {name} — record ← pc {pc} · r {r}', {
          name: progName(s.prog),
          pc: rec.cells.pc,
          r: rec.cells.r,
        });
      }
      return tr('caption.restore', 'Restore {name} — record → pc {pc} · r {r} · r overwritten: {was}', {
        name: progName(s.prog),
        pc: scene.cpu.pc,
        r: scene.cpu.r,
        was: s.was.r,
      });
    }

    /** 칸 하나 — 상자와 머리 글자, 그리고 수 (hide 면 수를 비운다) */
    function cell(
      cx: number,
      cy: number,
      head: string,
      value: number | null,
      color: string,
      hidden: boolean,
    ): void {
      label(base, cx, cy - CELL_H / 2 - 9, head, {
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
        'font-family': fonts.mono,
      });
      el(base, 'rect', {
        x: round(cx - CELL_W / 2),
        y: round(cy - CELL_H / 2),
        width: CELL_W,
        height: CELL_H,
        rx: 4,
        fill: pal.bg,
        stroke: value === null ? pal.border : pal.textMuted,
        'stroke-width': 1,
        ...(value === null ? { 'stroke-dasharray': '3 3' } : {}),
      });
      if (value !== null && !hidden) {
        label(base, cx, cy + 1, String(value), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: color,
        });
      }
    }

    /** 장면 하나의 화면 전체. hide 에 든 열쇠의 수 · 손가락 · 테는 그리지 않는다 (운동이 대신 그린다) */
    function drawStatic(scene: SaveAndRestoreScene, hide: ReadonlySet<string> = new Set()): void {
      base.textContent = '';
      fx.textContent = '';
      const g = geoOf(scene);
      const hues = colorsOf(scene);
      const colorOf = (id: string): string => {
        const c = hues.get(id);
        if (c === undefined) throw new Error(`그림: ${id} 의 색이 없다`);
        return c;
      };

      label(base, PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene), {
        'text-anchor': 'middle',
        'font-size': fontSizes.md,
      });

      const step = scene.step;
      scene.programs.forEach((prog, i) => {
        const x0 = colXOf(g, i);
        const color = colorOf(prog.id);
        const mine = scene.cpu.owner === prog.id;
        label(base, x0 + 8, TITLE_Y, progName(prog.id), {
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: color,
        });

        const rec = scene.records.find((r) => r.id === prog.id);
        if (rec === undefined) throw new Error(`그림: ${prog.id} 의 기록 자리가 없다`);

        prog.lines.forEach((text, j) => {
          const y = rowY(g, j);
          const lineNo = j + 1;
          if (step.kind === 'run' && step.prog === prog.id && step.line === lineNo) {
            el(base, 'rect', {
              x: round(x0),
              y: round(y - g.rowH / 2 + 1),
              width: round(g.colW),
              height: round(g.rowH - 2),
              rx: 3,
              fill: pal.bgSubtle,
            });
          }
          if (rec.cells !== null && rec.cells.pc === lineNo && !hide.has(`mark.${prog.id}`)) {
            el(base, 'rect', {
              x: round(x0 + 18),
              y: round(y - g.rowH / 2 + 3),
              width: 24,
              height: round(g.rowH - 6),
              rx: 3,
              fill: 'none',
              stroke: color,
              'stroke-width': 1.5,
            });
          }
          label(base, x0 + 30, y, String(lineNo), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: pal.textMuted,
          });
          label(base, x0 + 50, y, text, { 'font-family': fonts.mono, 'font-size': fontSizes.sm });
        });

        const out = scene.shown.find((s) => s.id === prog.id);
        if (out !== undefined && !hide.has(`out.${prog.id}`)) {
          label(base, x0 + g.colW - 8, rowY(g, out.line - 1), tr('label.out', '→ {value}', { value: out.value }), {
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: color,
          });
        }

        if (mine && !hide.has('ptr')) {
          const row = pointerRow(prog.lines.length, scene.cpu.pc);
          el(base, 'path', { d: pointerPath(x0 + 8, rowY(g, row)), fill: color });
        }
        if (scene.cpu.pc > prog.lines.length && mine) {
          label(base, x0 + 50, rowY(g, prog.lines.length), tr('label.end', 'end'), {
            'font-size': fontSizes.xs,
            fill: pal.textMuted,
          });
        }

        // 기록 상자
        el(base, 'rect', {
          x: round(x0),
          y: REC_TOP,
          width: round(g.colW),
          height: H - REC_TOP - 8,
          rx: 6,
          fill: pal.bgSubtle,
          stroke: pal.border,
        });
        label(base, x0 + 10, REC_TOP + 14, tr('label.record', 'Record of {name}', { name: progName(prog.id) }), {
          'font-size': fontSizes.xs,
          fill: pal.textMuted,
        });
        const cells = rec.cells;
        cell(cellCx(x0, g.colW, 0), REC_CELL_Y, tr('label.pc', 'pc'), cells === null ? null : cells.pc, color, hide.has(`rec.${prog.id}.pc`));
        cell(cellCx(x0, g.colW, 1), REC_CELL_Y, tr('label.r', 'r'), cells === null ? null : cells.r, color, hide.has(`rec.${prog.id}.r`));
      });

      // CPU
      const owner = scene.cpu.owner;
      el(base, 'rect', {
        x: round(g.cpuX),
        y: 96,
        width: round(g.cpuW),
        height: 104,
        rx: 8,
        fill: pal.bg,
        stroke: owner === null ? pal.border : colorOf(owner),
        'stroke-width': owner === null ? 1 : 2,
      });
      label(
        base,
        g.cpuX + g.cpuW / 2,
        114,
        owner === null ? tr('label.cpu', 'CPU') : tr('label.cpuOwner', 'CPU — {name}', { name: progName(owner) }),
        { 'text-anchor': 'middle', 'font-weight': 700, fill: owner === null ? pal.textMuted : colorOf(owner) },
      );
      const held = colorOf(scene.cpu.of);
      cell(cellCx(g.cpuX, g.cpuW, 0), CPU_CELL_Y, tr('label.pc', 'pc'), scene.cpu.pc, held, hide.has('cpu.pc'));
      cell(cellCx(g.cpuX, g.cpuW, 1), CPU_CELL_Y, tr('label.r', 'r'), scene.cpu.r, held, hide.has('cpu.r'));
    }

    function numberNode(value: number, color: string): SVGTextElement {
      return label(fx, 0, 0, String(value), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: color,
      });
    }

    function place(node: SVGElement, x: number, y: number, opacity: number): void {
      node.setAttribute('x', String(round(x)));
      node.setAttribute('y', String(round(y)));
      if (opacity >= 1) node.removeAttribute('opacity');
      else node.setAttribute('opacity', String(round(Math.max(0, opacity) * 100) / 100));
    }

    /** 한 시계 — 0 에서 1 까지 frame 을 부르고, 끝나거나 거둘 때 풀린다 */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const t0 = performance.now();
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return wake();
          const raw = Math.min(1, (now - t0) / ms);
          const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          frame(p);
          if (raw >= 1) return wake();
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

    /** a 에서 b 로 가는 길 — 가운데가 위로 솟는 활 */
    function arc(ax: number, ay: number, bx: number, by: number, p: number): [number, number] {
      const lift = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p) * 28;
      return [ax + (bx - ax) * p, ay + (by - ay) * p - lift];
    }

    async function move(next: SaveAndRestoreScene, mine: number): Promise<void> {
      const step = next.step;
      const g = geoOf(next);
      const hues = colorsOf(next);
      const colorOf = (id: string): string => {
        const c = hues.get(id);
        if (c === undefined) throw new Error(`그림: ${id} 의 색이 없다`);
        return c;
      };
      const cpuPcX = cellCx(g.cpuX, g.cpuW, 0);
      const cpuRX = cellCx(g.cpuX, g.cpuW, 1);
      const numY = (cy: number): number => cy + 1;

      if (step.kind === 'run') {
        const i = progIndex(next, step.prog);
        const x0 = colXOf(g, i);
        const color = colorOf(step.prog);
        const lines = linesOf(next, i);
        const hide = new Set<string>(['ptr', 'cpu.pc']);
        const rChanged = step.before.r !== next.cpu.r;
        if (rChanged) hide.add('cpu.r');
        if (step.shown !== null) hide.add(`out.${step.prog}`);
        drawStatic(next, hide);
        const fromY = rowY(g, pointerRow(lines, step.before.pc));
        const toY = rowY(g, pointerRow(lines, next.cpu.pc));
        const ptr = el(fx, 'path', { d: pointerPath(x0 + 8, fromY), fill: color });
        const pcOld = numberNode(step.before.pc, color);
        const pcNew = numberNode(next.cpu.pc, color);
        const rOld = rChanged ? numberNode(step.before.r, color) : null;
        const rNew = rChanged ? numberNode(next.cpu.r, color) : null;
        const outNode =
          step.shown !== null
            ? label(fx, 0, 0, tr('label.out', '→ {value}', { value: step.shown }), {
                'text-anchor': 'end',
                'font-family': fonts.mono,
                'font-size': fontSizes.md,
                'font-weight': 700,
                fill: color,
              })
            : null;
        const outX = x0 + g.colW - 8;
        const outY = rowY(g, step.line - 1);
        const roll = 14;
        await tween(mine, MOVE_MS, (p) => {
          ptr.setAttribute('d', pointerPath(x0 + 8, fromY + (toY - fromY) * p));
          place(pcOld, cpuPcX, numY(CPU_CELL_Y) - roll * p, 1 - p);
          place(pcNew, cpuPcX, numY(CPU_CELL_Y) + roll * (1 - p), p);
          if (rOld !== null && rNew !== null) {
            place(rOld, cpuRX, numY(CPU_CELL_Y) - roll * p, 1 - p);
            place(rNew, cpuRX, numY(CPU_CELL_Y) + roll * (1 - p), p);
          }
          if (outNode !== null) {
            const [x, y] = arc(cpuRX, numY(CPU_CELL_Y), outX, outY, p);
            place(outNode, x, y, 1);
          }
        });
        return;
      }

      if (step.kind === 'save') {
        const i = progIndex(next, step.prog);
        const x0 = colXOf(g, i);
        const color = colorOf(step.prog);
        const rec = next.records.find((r) => r.id === step.prog);
        if (rec === undefined || rec.cells === null) throw new Error(`그림: ${step.prog} 의 기록이 비었다`);
        drawStatic(next, new Set([`rec.${step.prog}.pc`, `rec.${step.prog}.r`, `mark.${step.prog}`]));
        const recPcX = cellCx(x0, g.colW, 0);
        const recRX = cellCx(x0, g.colW, 1);
        const lines = linesOf(next, i);
        const ptrY = rowY(g, pointerRow(lines, rec.cells.pc));
        const ptr = el(fx, 'path', { d: pointerPath(x0 + 8, ptrY), fill: color });
        const wasPc = step.was === null ? null : numberNode(step.was.pc, color);
        const wasR = step.was === null ? null : numberNode(step.was.r, color);
        const pcCopy = numberNode(rec.cells.pc, color);
        const rCopy = numberNode(rec.cells.r, color);
        await tween(mine, MOVE_MS, (p) => {
          if (p >= 1) ptr.setAttribute('opacity', '0');
          else ptr.setAttribute('opacity', String(round((1 - p) * 100) / 100));
          const [px, py] = arc(cpuPcX, numY(CPU_CELL_Y), recPcX, numY(REC_CELL_Y), p);
          place(pcCopy, px, py, 1);
          const [rx, ry] = arc(cpuRX, numY(CPU_CELL_Y), recRX, numY(REC_CELL_Y), p);
          place(rCopy, rx, ry, 1);
          if (wasPc !== null) place(wasPc, recPcX, numY(REC_CELL_Y) + 14 * p, 1 - p);
          if (wasR !== null) place(wasR, recRX, numY(REC_CELL_Y) + 14 * p, 1 - p);
        });
        return;
      }

      if (step.kind === 'restore') {
        const i = progIndex(next, step.prog);
        const x0 = colXOf(g, i);
        const color = colorOf(step.prog);
        drawStatic(next, new Set(['cpu.pc', 'cpu.r', 'ptr']));
        const recPcX = cellCx(x0, g.colW, 0);
        const recRX = cellCx(x0, g.colW, 1);
        const heldColor = colorOf(step.wasOf);
        const oldPc = numberNode(step.was.pc, heldColor);
        const oldR = numberNode(step.was.r, heldColor);
        const pcIn = numberNode(next.cpu.pc, color);
        const rIn = numberNode(next.cpu.r, color);
        await tween(mine, MOVE_MS, (p) => {
          const [px, py] = arc(recPcX, numY(REC_CELL_Y), cpuPcX, numY(CPU_CELL_Y), p);
          place(pcIn, px, py, 1);
          const [rx, ry] = arc(recRX, numY(REC_CELL_Y), cpuRX, numY(CPU_CELL_Y), p);
          place(rIn, rx, ry, 1);
          place(oldPc, cpuPcX, numY(CPU_CELL_Y) + 16 * p, 1 - p);
          place(oldR, cpuRX, numY(CPU_CELL_Y) + 16 * p, 1 - p);
        });
      }
    }

    return {
      async render(next: SaveAndRestoreScene, prev: SaveAndRestoreScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step.kind === 'start') {
          drawStatic(next);
          return;
        }
        await move(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
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
