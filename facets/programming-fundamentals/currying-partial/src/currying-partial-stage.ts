/**
 * 커링 조각의 그림 — 칸이 하나씩 닫힌다.
 *
 * 위에 프로그램, 아래에 담긴 것마다 한 행. 행은 이름 · 인자 칸 · 남은 함수의 글자 · 남은 인자 수다.
 * 칸은 열(a · b · c)을 맞춰 서므로 행이 쌓일수록 열린 칸이 계단처럼 준다.
 *
 * 운동:
 *   bind  — 함수가 적힌 줄에서 제 행 자리로 내려온다
 *   apply — 부른 함수의 행이 한 벌 떨어져 새 행 자리로 내려오고(원본은 제자리에 남는다),
 *           준 인자가 줄 글자의 제자리에서 맨 앞 열린 칸으로 날아가 그 칸을 닫는다
 *   show  — 담긴 값이 출력 칸으로 옮겨 간다
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
} from '@ffacet/core/runtime';
import type { CurryingPartialScene, CurryRow, CurrySlot } from './scene.js';

const SVG = 'http://www.w3.org/2000/svg';
const H = 360;
const PAD = 16;
const BIND_MS = 420;
const APPLY_MS = 760;
const SHOW_MS = 460;

type Chip = { x: number; y: number; s: number; label: string };
type Motion =
  | { kind: 'row'; row: number; ty: number; openSlot: number | null; hideBody: boolean; chip: Chip | null }
  | { kind: 'show'; chip: Chip };

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const curryingPartialStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const codePx = parseFloat(fontSizes.md);
    const charW = codePx * 0.6;
    const LH = codePx + 7;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? r(v) : v));
      parent.appendChild(e);
      return e;
    }
    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size?: string; color?: string; anchor?: string; mono?: boolean; bold?: boolean },
    ): void {
      const e = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size ?? fontSizes.md,
          fill: o.color ?? c.text,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (o.bold) e.setAttribute('font-weight', '700');
      e.textContent = s;
    }

    /** 자리 — 모두 장면의 바탕(줄 수 · 이름들 · 칸 수)과 캔버스에서 역산한다. */
    function layout(s: CurryingPartialScene) {
      const nLines = Math.max(1, s.lines.length);
      const lineMid = (i: number) => PAD + LH * i + LH / 2;
      const rowsTop = PAD + nLines * LH + 18;
      const rowsBottom = H - 50;
      const nRows = Math.max(1, s.names.length);
      const rowH = Math.min(64, (rowsBottom - rowsTop) / nRows);
      const rowMid = (i: number) => rowsTop + rowH * i + rowH / 2;
      const nameChars = Math.max(3, ...s.names.map((n) => n.length));
      const nameEnd = PAD + 8 + nameChars * charW;
      const slotS = Math.min(44, rowH - 10);
      const slotGap = slotS * 0.22;
      const slotsX = nameEnd + 24;
      const slotX = (i: number) => slotsX + i * (slotS + slotGap);
      const bodyX = slotX(Math.max(1, s.slotCount)) + 12;
      const outW = Math.min(170, W * 0.26);
      const outX = W - PAD - outW;
      return { lineMid, rowsTop, rowH, rowMid, nameEnd, slotS, slotX, bodyX, outX, outW };
    }
    type L = ReturnType<typeof layout>;

    function drawCode(s: CurryingPartialScene, g: Element, L: L): void {
      s.lines.forEach((ln, i) => {
        const y = L.lineMid(i);
        const x = PAD + 8 + ln.indent * 4 * charW;
        if (s.line === i) {
          el('rect', { x: PAD, y: y - LH / 2, width: L.outX - PAD - 12, height: LH, rx: 4, fill: c.bgSubtle }, g);
          el('rect', { x: PAD, y: y - LH / 2, width: 3, height: LH, fill: c.accent }, g);
        }
        label(g, x, y, ln.text, { mono: true, color: s.line === i ? c.text : c.textMuted });
      });
    }

    function drawOutput(s: CurryingPartialScene, g: Element, L: L, hideLast: boolean): void {
      const h = LH * 2 + 14;
      el('rect', { x: L.outX, y: PAD, width: L.outW, height: h, rx: 6, fill: 'none', stroke: c.border }, g);
      label(g, L.outX + 10, PAD + 11, t('label.output', 'output'), { size: fontSizes.xs, color: c.textMuted });
      const shown = hideLast ? s.outputs.slice(0, -1) : s.outputs;
      label(g, L.outX + 10, PAD + LH + 12, shown.join('  '), { mono: true, size: fontSizes.lg, bold: true });
    }

    function drawSlot(g: Element, x: number, y: number, S: number, slot: CurrySlot, open: boolean): void {
      if (open) {
        el('rect', { x, y: y - S / 2, width: S, height: S, rx: 5, fill: c.bg, stroke: c.textMuted, 'stroke-dasharray': '4 3' }, g);
        label(g, x + S / 2, y, slot.param, { mono: true, color: c.textMuted, anchor: 'middle' });
      } else {
        el('rect', { x, y: y - S / 2, width: S, height: S, rx: 5, fill: c.primary, stroke: c.primary }, g);
        label(g, x + S / 2, y, slot.value ?? '', { mono: true, color: c.textInverse, anchor: 'middle', bold: true });
      }
    }

    function drawRow(
      g: Element,
      L: L,
      row: CurryRow,
      i: number,
      o: { ty: number; openSlot: number | null; hideBody: boolean; current: boolean },
    ): void {
      const y = L.rowMid(i) + o.ty;
      if (o.current) {
        el('rect', { x: PAD, y: y - L.rowH / 2 + 2, width: W - 2 * PAD, height: L.rowH - 4, rx: 6, fill: c.bgSubtle }, g);
      }
      label(g, L.nameEnd, y, row.name, { mono: true, anchor: 'end', bold: true });
      label(g, L.nameEnd + 12, y, '=', { mono: true, color: c.textMuted, anchor: 'middle' });
      row.slots.forEach((slot, k) => {
        drawSlot(g, L.slotX(k), y, L.slotS, slot, slot.value === null || k === o.openSlot);
      });
      if (o.hideBody) return;
      if (row.text !== null) {
        label(g, L.bodyX, y, row.text, { mono: true });
        label(g, W - PAD - 8, y, t('label.left', '{n} left', { n: row.left }), {
          size: fontSizes.sm,
          color: c.textMuted,
          anchor: 'end',
        });
      } else {
        label(g, L.bodyX, y, row.value ?? '', { mono: true, size: fontSizes.xl, bold: true });
        label(g, W - PAD - 8, y, t('label.leftValue', '{n} left · value', { n: row.left }), {
          size: fontSizes.sm,
          color: c.textMuted,
          anchor: 'end',
        });
      }
    }

    /** 캡션 — 지금 일어난 일 한 줄, 그래서 남은 것 한 줄. */
    function caption(s: CurryingPartialScene): string[] {
      const st = s.step;
      if (st.kind === 'bind') {
        const row = s.rows[st.row];
        return [t('caption.bind', '{name} is a function. Open slots: {n}.', { name: row?.name ?? '', n: row?.left ?? 0 })];
      }
      if (st.kind === 'apply') {
        const row = s.rows[st.row];
        if (row && row.text === null) {
          return [
            t('caption.fillLast', '{arg} goes into the last slot {param} and closes it.', { arg: st.arg, param: st.param }),
            t('caption.value', 'Open slots: {n}. So {name} holds no function but the value {value}.', {
              n: row.left,
              name: row.name,
              value: row.value ?? '',
            }),
          ];
        }
        return [
          t('caption.fill', '{arg} goes into slot {param} and closes it.', { arg: st.arg, param: st.param }),
          t('caption.left', '{name} holds a new function. Open slots: {n}.', { name: row?.name ?? '', n: row?.left ?? 0 }),
        ];
      }
      if (st.kind === 'show') {
        const first = s.rows[0];
        return [
          t('caption.shown', 'Shown: {value}.', { value: st.value }),
          t('caption.unchanged', '{first} is unchanged. Open slots: still {n}.', { first: first?.name ?? '', n: first?.left ?? 0 }),
        ];
      }
      return [t('caption.start', 'Nothing has run yet.')];
    }

    function draw(s: CurryingPartialScene, mo: Motion | null): void {
      svg.textContent = '';
      if (s.lines.length === 0) return;
      const L = layout(s);
      const g = el('g', {}, svg);
      drawCode(s, g, L);
      drawOutput(s, g, L, mo?.kind === 'show');
      const cur = s.step.kind === 'bind' || s.step.kind === 'apply' ? s.step.row : -1;
      s.rows.forEach((row, i) => {
        const moving = mo?.kind === 'row' && mo.row === i ? mo : null;
        drawRow(g, L, row, i, {
          ty: moving ? moving.ty : 0,
          openSlot: moving ? moving.openSlot : null,
          hideBody: moving ? moving.hideBody : false,
          current: i === cur,
        });
      });
      const chip = mo?.chip ?? null;
      if (chip) {
        el('rect', { x: chip.x - chip.s / 2, y: chip.y - chip.s / 2, width: chip.s, height: chip.s, rx: 5, fill: c.primary }, g);
        label(g, chip.x, chip.y, chip.label, { mono: true, color: c.textInverse, anchor: 'middle', bold: true });
      }
      caption(s).forEach((line, i) => label(g, PAD, H - 32 + i * (LH - 2), line, {}));
    }

    function tween(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = () => {
          if (destroyed) return done();
          const p = clamp01((Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animate(next: CurryingPartialScene, mine: number): Promise<void> {
      const st = next.step;
      const L = layout(next);
      const alive = () => mine === gen && !destroyed;
      if (st.kind === 'bind') {
        const from = next.line === null ? L.rowMid(st.row) : L.lineMid(next.line);
        const d = from - L.rowMid(st.row);
        await tween(BIND_MS, (p) => {
          if (!alive()) return;
          draw(next, { kind: 'row', row: st.row, ty: d * (1 - ease(p)), openSlot: null, hideBody: false, chip: null });
        });
        return;
      }
      if (st.kind === 'apply') {
        const src = st.from >= 0 ? L.rowMid(st.from) : L.rowMid(st.row);
        const d = src - L.rowMid(st.row);
        const line = next.line ?? 0;
        const indent = next.lines[line]?.indent ?? 0;
        const ax = PAD + 8 + (indent * 4 + st.argCol + st.argLen / 2) * charW;
        const ay = L.lineMid(line);
        const bx = L.slotX(st.slot) + L.slotS / 2;
        const by = L.rowMid(st.row);
        await tween(APPLY_MS, (p) => {
          if (!alive()) return;
          const pa = ease(clamp01(p / 0.45));
          const pb = ease(clamp01((p - 0.45) / 0.55));
          const chip: Chip | null =
            p <= 0.45
              ? null
              : { x: lerp(ax, bx, pb), y: lerp(ay, by, pb), s: lerp(LH, L.slotS, pb), label: st.arg };
          draw(next, { kind: 'row', row: st.row, ty: d * (1 - pa), openSlot: st.slot, hideBody: true, chip });
        });
        return;
      }
      if (st.kind === 'show') {
        const from = st.from >= 0 ? st.from : 0;
        const ax = L.bodyX + charW;
        const ay = L.rowMid(from);
        const bx = L.outX + 10 + charW;
        const by = PAD + LH + 12;
        await tween(SHOW_MS, (p) => {
          if (!alive()) return;
          const e = ease(p);
          draw(next, { kind: 'show', chip: { x: lerp(ax, bx, e), y: lerp(ay, by, e), s: LH + 4, label: st.value } });
        });
      }
    }

    return {
      async render(next: CurryingPartialScene, _prev: CurryingPartialScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        draw(next, null);
        if (!opts.animate || next.step.kind === 'start') return;
        await animate(next, mine);
        if (mine !== gen || destroyed) return;
        draw(next, null);
      },
      destroy() {
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
