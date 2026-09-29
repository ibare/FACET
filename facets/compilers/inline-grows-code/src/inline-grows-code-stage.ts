/**
 * inline-grows-code 의 무대.
 *
 * 왼쪽은 코드, 오른쪽은 두 더미다. 크기 더미는 코드에 있는 명령 하나를 벽돌 하나로, 실행 더미는 `entry` 를 한 번
 * 돌릴 때 밟는 명령 하나를 벽돌 하나로 아래부터 쌓는다. 두 더미 꼭대기를 한 막대로 잇는다.
 *
 * 한 걸음에 — 부르는 줄이 빠지고 피호출 몸의 복제본 넷이 정의에서 부른 자리로 흘러 내려온다(정의는 남는다).
 * 크기 더미에서는 `call` 벽돌 하나가 벽돌 넷으로 펴지고, 실행 더미에서는 `call` 과 피호출의 `return` 벽돌이
 * 빠져나가 위가 내려앉는다. 두 꼭대기가 반대로 움직여 막대가 기운다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Line, TraceRow } from './algorithm.js';
import type { Counts, InlineGrowsCodeScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 1000;
const FRAME_MS = 20;

type Anim = { p: number; was: Line[]; wasTrace: TraceRow[] };

/** 명령 줄의 들여쓰기 — 빈칸 넷 한 단 (머리줄은 0) */
const BODY_INDENT = 4;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number): number => {
  const c = clamp01(x);
  return c < 0.5 ? 2 * c * c : 1 - ((-2 * c + 2) ** 2) / 2;
};
const lerp = (a: number, b: number, e: number): number => a + (b - a) * e;
/** 좌표 글자 — 끝자리와 -0 을 걷는다 */
const num = (x: number): string => {
  const v = Math.round(x * 10) / 10;
  return String(v === 0 ? 0 : v);
};

export const inlineGrowsCodeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const codePx = parseFloat(fontSizes.sm);
    const charW = codePx * 0.6;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    // ───────── 자리 셈 (캔버스에서 역산) ─────────
    const codeX = 16;
    const codeW = Math.round(W * 0.42);
    const codeTop = 66;
    const stackL = codeX + codeW + 24;
    const stackR = W - 16;
    const stackSpan = stackR - stackL;
    const bw = Math.min(72, Math.round(stackSpan * 0.22));
    const cxSize = Math.round(stackL + stackSpan * 0.3);
    const cxExec = Math.round(stackL + stackSpan * 0.76);
    const base = H - 46;

    function paint(scene: InlineGrowsCodeScene, anim: Anim | null): void {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg });
      // silent `init` 이 오기 전의 장면 — 걸음이 되지 않는다(init 이 걸음 0 을 갈아 끼운다). 셈 없이 그릴 것이 없다
      const start = scene.start;
      const traceNew = scene.trace;
      if (start === null || traceNew === null) return;

      const p = anim ? anim.p : 1;
      const eOut = anim ? ease(p / 0.45) : 1;
      const eIn = anim ? ease((p - 0.25) / 0.75) : 1;

      const heads = scene.program.filter((l) => l.ins.k === 'function');
      const fnNames = heads.map((l) => {
        if (l.ins.k !== 'function') throw new Error(`${l.id}: 머리줄이 아니다`);
        return l.ins.name;
      });
      const palette = categorical(fnNames.length);
      const colorOf = (fn: string): string => {
        const col = palette[fnNames.indexOf(fn)];
        if (col === undefined) throw new Error(`함수 ${fn} 의 색 자리가 없다`);
        return col;
      };

      const rowsMax = start.extent.size + heads.length;
      const pitch = Math.min(17, (H - codeTop - 10) / rowsMax);
      const unitsMax = Math.max(start.extent.size, start.extent.exec);
      const unit = Math.min(16, (base - codeTop - 20) / unitsMax);

      const pasted = new Set(scene.step ? scene.step.pastedIds : []);

      // ── 캡션 — 지금 일어난 일
      const cur: Counts | undefined = scene.counts[scene.counts.length - 1];
      const before: Counts | undefined = scene.counts[scene.counts.length - 2];
      const step = scene.step;
      if (cur === undefined) throw new Error('init 뒤인데 걸음의 셈이 없다');
      if (step !== null && before === undefined) throw new Error(`${step.callId}: 바꾸기 앞의 셈이 없다`);
      {
        if (step && before) {
          const vars = { dst: step.dst, fn: step.fn };
          el('text', { x: codeX, y: 24, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 },
            step.remaining === 0
              ? t('caption.last', 'Last call replaced: the body of {fn} now fills {dst}', vars)
              : t('caption.inline', 'The call that fills {dst} is replaced by the body of {fn}', vars));
          el('text', { x: codeX, y: 44, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm },
            t('caption.counts', 'Size: {sizeFrom} → {sizeTo} · Run: {runFrom} → {runTo}', {
              sizeFrom: before.size, sizeTo: cur.size, runFrom: before.exec, runTo: cur.exec,
            }));
        } else {
          el('text', { x: codeX, y: 24, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 },
            t('caption.start', 'Calls to {fn} in {caller}: {calls}', {
              fn: start.callee, caller: scene.entry, calls: start.calls,
            }));
          el('text', { x: codeX, y: 44, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm },
            t('caption.startCounts', 'Size: {size} · Run: {exec}', { size: cur.size, exec: cur.exec }));
        }
      }

      // ── 코드
      const rowOf = (program: readonly Line[]): Map<string, number> => new Map(program.map((l, i) => [l.id, i]));
      const newRow = rowOf(scene.program);
      const oldRow = anim ? rowOf(anim.was) : newRow;
      const rowY = (i: number): number => codeTop + i * pitch;
      const mark = Math.max(6, Math.round(pitch * 0.5));

      function drawLine(l: Line, y: number, dx: number, alpha: number, lit: boolean): void {
        const mid = y + pitch / 2;
        const op: Record<string, number> = alpha < 1 ? { opacity: alpha } : {};
        if (lit) el('rect', { x: codeX - 4 + dx, y: y + 1, width: codeW, height: pitch - 2, rx: 2, fill: c.accent, ...op });
        const ink = lit ? c.stateInk : c.text;
        if (l.ins.k === 'function') {
          el('text', { x: codeX + dx, y: mid, 'dominant-baseline': 'central', fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, ...op }, l.text);
          return;
        }
        const mx = codeX + dx + charW * BODY_INDENT - mark - 6;
        if (l.ins.k === 'op') {
          el('rect', { x: mx, y: mid - mark / 2, width: mark, height: mark, rx: 1, fill: colorOf(l.origin), ...op });
        } else {
          el('rect', { x: mx, y: mid - mark / 2, width: mark, height: mark, rx: 1, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '2 1.5', ...op });
        }
        el('text', { x: codeX + dx + charW * BODY_INDENT, y: mid, 'dominant-baseline': 'central', fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.sm, ...op }, l.text);
      }

      if (anim) {
        for (const l of anim.was) {
          if (newRow.has(l.id)) continue;
          const i = oldRow.get(l.id);
          if (i === undefined) throw new Error(`${l.id}: 앞 코드의 자리가 없다`);
          drawLine(l, rowY(i), 36 * eOut, 1 - eOut, false);
        }
      }
      scene.program.forEach((l, i) => {
        let from = oldRow.get(l.id);
        let arc = 0;
        if (anim && from === undefined) {
          if (l.src === null) throw new Error(`${l.id}: 새 줄인데 베껴 온 줄이 없다`);
          from = oldRow.get(l.src);
          if (from === undefined) throw new Error(`${l.id}: 베껴 온 줄 ${l.src} 이 앞 코드에 없다`);
          arc = Math.sin(Math.PI * eIn) * 28;
        }
        const y = anim && from !== undefined ? lerp(rowY(from), rowY(i), eIn) : rowY(i);
        drawLine(l, y, arc, 1, pasted.has(l.id));
      });

      // ── 두 더미
      const blockY = (k: number): number => base - (k + 1) * unit;
      const bh = Math.max(3, unit - 2);

      function brick(cx: number, y: number, kind: 'op' | 'call' | 'return', origin: string, dx: number, alpha: number, lit: boolean): void {
        const op: Record<string, number> = alpha < 1 ? { opacity: alpha } : {};
        const x = cx - bw / 2 + dx;
        if (kind === 'op') {
          el('rect', { x, y: y + 1, width: bw, height: bh, rx: 2, fill: colorOf(origin), ...(lit ? { stroke: c.accent, 'stroke-width': 2.5 } : {}), ...op });
          return;
        }
        el('rect', { x, y: y + 1, width: bw, height: bh, rx: 2, fill: c.bg, stroke: c.textMuted, 'stroke-dasharray': '3 2', ...op });
        if (bh >= 9) {
          el('text', { x: x + bw / 2, y: y + 1 + bh / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs, ...op }, kind);
        }
      }

      // 크기 — 코드의 명령을 차례대로 아래부터
      const instrs = (program: readonly Line[]): Line[] => program.filter((l) => l.ins.k !== 'function');
      const sizeNew = instrs(scene.program);
      const sizeOldIdx = new Map((anim ? instrs(anim.was) : sizeNew).map((l, i) => [l.id, i]));
      const kindOf = (l: Line): 'op' | 'call' | 'return' => (l.ins.k === 'op' ? 'op' : l.ins.k === 'call' ? 'call' : 'return');
      if (anim) {
        for (const l of instrs(anim.was)) {
          if (sizeNew.some((n) => n.id === l.id)) continue;
          const k = sizeOldIdx.get(l.id);
          if (k === undefined) throw new Error(`${l.id}: 앞 크기 더미의 자리가 없다`);
          brick(cxSize, blockY(k), kindOf(l), l.origin, bw * 0.6 * eOut, 1 - eOut, false);
        }
      }
      sizeNew.forEach((l, k) => {
        let from = sizeOldIdx.get(l.id);
        if (anim && from === undefined) {
          // 부르기 벽돌 하나가 있던 자리에서 넷으로 펴진다
          const site = l.id.split('>')[0];
          if (site === undefined) throw new Error(`${l.id}: 부른 자리를 읽을 수 없다`);
          from = sizeOldIdx.get(site);
          if (from === undefined) throw new Error(`${l.id}: 부른 줄 ${site} 이 앞 코드에 없다`);
        }
        const y = anim && from !== undefined ? lerp(blockY(from), blockY(k), eIn) : blockY(k);
        brick(cxSize, y, kindOf(l), l.origin, 0, 1, pasted.has(l.id));
      });

      // 실행 — entry 한 번에 밟는 차례를 아래부터
      const traceOld = anim ? anim.wasTrace : traceNew;
      const execOldIdx = new Map(traceOld.map((r, i) => [r.key, i]));
      const newKeys = new Set(traceNew.map((r) => r.key));
      if (anim) {
        traceOld.forEach((r, i) => {
          if (newKeys.has(r.key)) return;
          brick(cxExec, blockY(i), r.kind, r.origin, bw * 0.9 * eOut, 1 - eOut, false);
        });
      }
      traceNew.forEach((r, k) => {
        const from = execOldIdx.get(r.key);
        if (anim && from === undefined) throw new Error(`${r.key}: 밟는 차례에 새로 생긴 명령이 있다`);
        const y = anim && from !== undefined ? lerp(blockY(from), blockY(k), eIn) : blockY(k);
        brick(cxExec, y, r.kind, r.origin, 0, 1, false);
      });

      // 크기 더미 옆 괄호 — 함수마다 (정의는 남아 계속 셈된다)
      const bx = cxSize - bw / 2 - 8;
      for (const name of fnNames) {
        const idx = sizeNew.map((l, k) => (l.fn === name ? k : -1)).filter((k) => k >= 0);
        const lo = idx[0];
        const hi = idx[idx.length - 1];
        if (lo === undefined || hi === undefined) throw new Error(`함수 ${name} 의 명령이 크기 더미에 없다`);
        const y0 = blockY(hi) + 1;
        const y1 = blockY(lo) + unit - 1;
        el('path', { d: `M${num(bx + 4)} ${num(y0)}H${num(bx)}V${num(y1)}H${num(bx + 4)}`, fill: 'none', stroke: c.textMuted, 'stroke-width': 1 });
        el('text', { x: bx - 4, y: (y0 + y1) / 2, 'text-anchor': 'end', 'dominant-baseline': 'central', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, name);
      }

      // 바닥과 이름표
      el('line', { x1: stackL, y1: base, x2: stackR, y2: base, stroke: c.border, 'stroke-width': 1 });
      el('text', { x: cxSize, y: base + 17, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, t('label.size', 'Size'));
      el('text', { x: cxSize, y: base + 32, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, t('label.sizeSub', 'instructions in the code'));
      el('text', { x: cxExec, y: base + 17, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, t('label.exec', 'Run'));
      el('text', { x: cxExec, y: base + 32, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, t('label.execSub', 'steps in one run of {caller}', { caller: scene.entry }));

      // ── 막대 — 두 꼭대기를 잇는다. 지난 걸음의 막대는 옅게 남는다
      const topAt = (n: number): number => base - n * unit;
      const beam = (s: number, x: number, stroke: string, width: number, dash: string | null): void => {
        const ys = topAt(s);
        const yx = topAt(x);
        el('path', {
          d: `M${num(cxSize - bw / 2 - 2)} ${num(ys)}H${num(cxSize + bw / 2)}L${num(cxExec - bw / 2)} ${num(yx)}H${num(cxExec + bw / 2 + 2)}`,
          fill: 'none', stroke, 'stroke-width': width, 'stroke-linejoin': 'round', ...(dash ? { 'stroke-dasharray': dash } : {}),
        });
      };
      const settled = anim ? scene.counts.length - 2 : scene.counts.length - 1;
      for (let i = 0; i < settled; i += 1) {
        const h = scene.counts[i];
        if (h === undefined) throw new Error(`걸음 ${i} 의 셈이 없다`);
        beam(h.size, h.exec, c.textMuted, 1, '3 3');
      }
      const s = anim && before ? lerp(before.size, cur.size, eIn) : cur.size;
      const x = anim && before ? lerp(before.exec, cur.exec, eIn) : cur.exec;
      beam(s, x, c.text, 2.5, null);

      // 늘고 준 폭은 막대가 닿지 않는 바깥쪽에 — 크기는 왼쪽, 실행은 오른쪽
      const figure = (cx: number, n: number, delta: number | null, outward: -1 | 1): void => {
        const y = topAt(n) - 9;
        el('text', { x: cx, y, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700 }, String(Math.round(n)));
        if (delta !== null && delta !== 0) {
          el('text', {
            x: cx + outward * (bw / 2 + 4), y, 'text-anchor': outward < 0 ? 'end' : 'start',
            fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          }, delta > 0 ? `+${delta}` : `−${-delta}`);
        }
      };
      figure(cxSize, s, before && !anim ? cur.size - before.size : null, -1);
      figure(cxExec, x, before && !anim ? cur.exec - before.exec : null, 1);
    }

    function wait(ms: number, mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    return {
      async render(next: InlineGrowsCodeScene, prev: InlineGrowsCodeScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        // 앞 장면이 곧 바꾸기 전의 코드일 때만 흐르게 한다
        if (!opts.animate || !step || !prev || prev.program !== step.was) {
          paint(next, null);
          return;
        }
        const frames = Math.round(MOVE_MS / FRAME_MS);
        for (let i = 0; i < frames; i += 1) {
          if (mine !== gen || destroyed) return;
          paint(next, { p: i / frames, was: step.was, wasTrace: step.wasTrace });
          if (!(await wait(FRAME_MS, mine))) return;
        }
        if (mine !== gen || destroyed) return;
        paint(next, null);
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
    } as ViewInstance;
  },
};
